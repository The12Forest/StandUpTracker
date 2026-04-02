const express = require('express');
const { authenticate, requireVerified } = require('../middleware/auth');
const { softBanCheck, lastActiveTouch } = require('../middleware/guards');
const Friendship = require('../models/Friendship');
const FriendStreak = require('../models/FriendStreak');
const TrackingData = require('../models/TrackingData');
const User = require('../models/User');
const Settings = require('../models/Settings');
const Notification = require('../models/Notification');
const OffDay = require('../models/OffDay');
const { getEffectiveGoalMinutes } = require('../utils/settings');
const { sendPushNotification } = require('../utils/pushSender');
const { dispatchWebhook } = require('../utils/webhookDispatch');

const router = express.Router();

router.use(authenticate, softBanCheck, lastActiveTouch);

// Helper: canonical order for streak pair
function streakPair(a, b) {
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

// List accepted friends with streak + online hint
router.get('/friends', async (req, res) => {
  try {
    const uid = req.user.userId;
    const friendships = await Friendship.find({
      $or: [{ requester: uid }, { recipient: uid }],
      status: 'accepted',
    });

    const friendIds = friendships.map(f => f.requester === uid ? f.recipient : f.requester);
    const friends = await User.find({ userId: { $in: friendIds }, active: true })
      .select('userId username level currentStreak bestStreak totalStandingSeconds timerRunning timerStartedAt');

    // Get shared streaks
    const streakPromises = friendIds.map(fid => {
      const pair = streakPair(uid, fid);
      return FriendStreak.findOne(pair);
    });
    const streaks = await Promise.all(streakPromises);
    const streakMap = {};
    streaks.forEach((s, i) => {
      if (s) streakMap[friendIds[i]] = { currentStreak: s.currentStreak, bestStreak: s.bestStreak };
    });

    const io = req.app.get('io');
    const sockets = await io.fetchSockets();
    const onlineUserIds = new Set(sockets.map(s => s.user?.userId).filter(Boolean));

    const result = friends.map(f => ({
      userId: f.userId,
      username: f.username,
      level: f.level,
      online: onlineUserIds.has(f.userId),
      timerRunning: f.timerRunning || false,
      timerStartedAt: f.timerStartedAt || null,
      sharedStreak: streakMap[f.userId] || { currentStreak: 0, bestStreak: 0 },
    }));

    res.json({ friends: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// Send friend request
router.post('/request', requireVerified, async (req, res) => {
  try {
    const enabled = await Settings.get('friendRequestsEnabled');
    if (enabled === false) return res.status(403).json({ error: 'Friend requests are disabled' });

    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    const target = await User.findOne({ username, active: true });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.userId === req.user.userId) return res.status(400).json({ error: 'Cannot friend yourself' });

    // Check existing in either direction
    const existing = await Friendship.findOne({
      $or: [
        { requester: req.user.userId, recipient: target.userId },
        { requester: target.userId, recipient: req.user.userId },
      ],
    });
    if (existing) {
      if (existing.status === 'blocked') return res.status(403).json({ error: 'Unable to send request' });
      if (existing.status === 'accepted') return res.status(409).json({ error: 'Already friends' });
      return res.status(409).json({ error: 'Request already pending' });
    }

    const friendship = await Friendship.create({
      requester: req.user.userId,
      recipient: target.userId,
    });

    // Notify via socket
    const io = req.app.get('io');
    io.to(`user:${target.userId}`).emit('FRIEND_REQUEST', {
      from: { userId: req.user.userId, username: req.user.username },
      requestId: friendship._id,
    });

    // Persist notification
    const notif = await Notification.create({
      userId: target.userId,
      type: 'friend_request',
      title: 'New Friend Request',
      message: `${req.user.username} sent you a friend request.`,
      data: { fromUserId: req.user.userId, fromUsername: req.user.username },
    });
    io.to(`user:${target.userId}`).emit('NOTIFICATION', notif.toObject());
    sendPushNotification(target.userId, 'friend_request', {
      title: 'StandUpTracker',
      body: notif.message,
    }).catch(() => {});

    // Webhook: friend_request.received (fires for the recipient)
    dispatchWebhook(target.userId, 'friend_request.received', {
      fromUserId: req.user.userId,
      fromUsername: req.user.username,
    }).catch(() => {});

    res.status(201).json({ message: 'Friend request sent' });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Request already exists' });
    res.status(500).json({ error: 'Failed to send request' });
  }
});

// List pending incoming requests
router.get('/requests', async (req, res) => {
  try {
    const requests = await Friendship.find({ recipient: req.user.userId, status: 'pending' });
    const userIds = requests.map(r => r.requester);
    const users = await User.find({ userId: { $in: userIds } }).select('userId username level');
    const userMap = {};
    users.forEach(u => { userMap[u.userId] = u; });

    res.json({ requests: requests.map(r => ({
      _id: r._id,
      requesterName: (userMap[r.requester] || {}).username || 'Unknown',
      requesterId: r.requester,
      createdAt: r.createdAt,
    })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests' });
  }
});

// List pending outgoing requests
router.get('/requests/outgoing', async (req, res) => {
  try {
    const requests = await Friendship.find({ requester: req.user.userId, status: 'pending' });
    const userIds = requests.map(r => r.recipient);
    const users = await User.find({ userId: { $in: userIds } }).select('userId username');
    const userMap = {};
    users.forEach(u => { userMap[u.userId] = u; });

    res.json({ requests: requests.map(r => ({
      _id: r._id,
      recipientName: (userMap[r.recipient] || {}).username || 'Unknown',
      recipientId: r.recipient,
      createdAt: r.createdAt,
    })) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch outgoing requests' });
  }
});

// Accept request
router.post('/accept/:requestId', async (req, res) => {
  try {
    const friendship = await Friendship.findById(req.params.requestId);
    if (!friendship || friendship.recipient !== req.user.userId || friendship.status !== 'pending') {
      return res.status(404).json({ error: 'Request not found' });
    }

    friendship.status = 'accepted';
    friendship.acceptedAt = new Date();
    await friendship.save();

    // Create initial streak record
    const pair = streakPair(friendship.requester, friendship.recipient);
    await FriendStreak.findOneAndUpdate(pair, { $setOnInsert: pair }, { upsert: true });

    const io = req.app.get('io');

    // Mutually join friend socket rooms so FRIEND_ONLINE/OFFLINE events work immediately
    io.in(`user:${req.user.userId}`).socketsJoin(`friends:${friendship.requester}`);
    io.in(`user:${friendship.requester}`).socketsJoin(`friends:${req.user.userId}`);

    // Notify requester: they're now online to each other
    io.to(`user:${friendship.requester}`).emit('FRIEND_ONLINE', {
      userId: req.user.userId,
      username: req.user.username,
    });

    // Create persistent notification so offline requesters don't miss the acceptance
    const notif = await Notification.create({
      userId: friendship.requester,
      type: 'friend_request_accepted',
      title: 'Friend Request Accepted',
      message: `${req.user.username} accepted your friend request.`,
      data: { fromUserId: req.user.userId, fromUsername: req.user.username },
    });
    io.to(`user:${friendship.requester}`).emit('NOTIFICATION', notif.toObject());

    // Emit FRIEND_ACCEPTED for real-time friends list refresh on the requester side
    io.to(`user:${friendship.requester}`).emit('FRIEND_ACCEPTED', {
      friendId: req.user.userId,
      username: req.user.username,
    });

    res.json({ message: 'Friend request accepted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

// Reject request
router.post('/reject/:requestId', async (req, res) => {
  try {
    const friendship = await Friendship.findById(req.params.requestId);
    if (!friendship || friendship.recipient !== req.user.userId || friendship.status !== 'pending') {
      return res.status(404).json({ error: 'Request not found' });
    }
    await friendship.deleteOne();
    res.json({ message: 'Request rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// Cancel outgoing request
router.delete('/request/:requestId', async (req, res) => {
  try {
    const friendship = await Friendship.findById(req.params.requestId);
    if (!friendship || friendship.requester !== req.user.userId || friendship.status !== 'pending') {
      return res.status(404).json({ error: 'Request not found' });
    }
    await friendship.deleteOne();
    res.json({ message: 'Request cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to cancel request' });
  }
});

// Block user
router.post('/block/:userId', async (req, res) => {
  try {
    const targetId = req.params.userId;
    if (targetId === req.user.userId) return res.status(400).json({ error: 'Cannot block yourself' });

    // Remove existing friendship in either direction
    await Friendship.deleteMany({
      $or: [
        { requester: req.user.userId, recipient: targetId },
        { requester: targetId, recipient: req.user.userId },
      ],
    });

    // Remove streak
    const pair = streakPair(req.user.userId, targetId);
    await FriendStreak.deleteOne(pair);

    // Create block entry
    await Friendship.create({ requester: req.user.userId, recipient: targetId, status: 'blocked' });

    res.json({ message: 'User blocked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// Unfriend (supports both /friend/:userId and /unfriend/:userId)
router.delete('/friend/:userId', unfriendHandler);
router.delete('/unfriend/:userId', unfriendHandler);

async function unfriendHandler(req, res) {
  try {
    const targetId = req.params.userId;
    const deleted = await Friendship.findOneAndDelete({
      $or: [
        { requester: req.user.userId, recipient: targetId, status: 'accepted' },
        { requester: targetId, recipient: req.user.userId, status: 'accepted' },
      ],
    });
    if (!deleted) return res.status(404).json({ error: 'Friendship not found' });

    // Remove streak
    const pair = streakPair(req.user.userId, targetId);
    await FriendStreak.deleteOne(pair);

    res.json({ message: 'Unfriended' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unfriend' });
  }
}

// Get shared streak detail
router.get('/streak/:friendUserId', async (req, res) => {
  try {
    const pair = streakPair(req.user.userId, req.params.friendUserId);
    const streak = await FriendStreak.findOne(pair);
    res.json(streak || { currentStreak: 0, bestStreak: 0, lastSyncDate: null });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch streak' });
  }
});

// Get friend's heatmap (aggregated daily seconds only)
router.get('/friend/:userId/heatmap', async (req, res) => {
  try {
    const targetId = req.params.userId;
    // Verify friendship
    const friendship = await Friendship.findOne({
      $or: [
        { requester: req.user.userId, recipient: targetId, status: 'accepted' },
        { requester: targetId, recipient: req.user.userId, status: 'accepted' },
      ],
    });
    if (!friendship) return res.status(403).json({ error: 'Not friends' });

    const from = new Date();
    from.setDate(from.getDate() - 365);
    const data = await TrackingData.find({
      userId: targetId,
      date: { $gte: from.toISOString().slice(0, 10) },
    }).select('date seconds');

    const result = {};
    data.forEach(d => { result[d.date] = d.seconds; });

    // Return off days so heatmap can render them distinctly
    const offDays = await OffDay.find({
      userId: targetId,
      date: { $gte: from.toISOString().slice(0, 10) },
    });
    const offDaySet = {};
    offDays.forEach(o => { offDaySet[o.date] = true; });

    res.json({ heatmap: result, offDays: offDaySet });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch heatmap' });
  }
});

// Get all friend streaks with today's status
router.get('/streaks', async (req, res) => {
  try {
    const uid = req.user.userId;
    const friendships = await Friendship.find({
      $or: [{ requester: uid }, { recipient: uid }],
      status: 'accepted',
    });
    const friendIds = friendships.map(f => f.requester === uid ? f.recipient : f.requester);
    const friends = await User.find({ userId: { $in: friendIds }, active: true })
      .select('userId username');

    const today = new Date().toISOString().slice(0, 10);

    // Get effective goal for current user
    const myGoal = await getEffectiveGoalMinutes(req.user);

    // Get today's tracking for user + all friends
    const allIds = [uid, ...friendIds];
    const todayData = await TrackingData.find({ userId: { $in: allIds }, date: today });
    const todayMap = {};
    todayData.forEach(d => { todayMap[d.userId] = d.seconds; });

    // Load friend user docs to get their effective goals
    const friendUsers = await User.find({ userId: { $in: friendIds }, active: true })
      .select('userId dailyGoalMinutes');
    const friendGoalMap = {};
    for (const fu of friendUsers) {
      friendGoalMap[fu.userId] = await getEffectiveGoalMinutes(fu);
    }

    const streakPromises = friendIds.map(fid => {
      const pair = streakPair(uid, fid);
      return FriendStreak.findOne(pair);
    });
    const streaks = await Promise.all(streakPromises);

    const userMap = {};
    friends.forEach(f => { userMap[f.userId] = f.username; });

    const result = friendIds.map((fid, i) => {
      const s = streaks[i];
      const friendGoal = friendGoalMap[fid] || 60;
      return {
        friendId: fid,
        friendName: userMap[fid] || 'Unknown',
        currentStreak: s?.currentStreak || 0,
        bestStreak: s?.bestStreak || 0,
        lastSyncDate: s?.lastSyncDate || null,
        myTodaySeconds: todayMap[uid] || 0,
        friendTodaySeconds: todayMap[fid] || 0,
        myMetThreshold: (todayMap[uid] || 0) >= myGoal * 60,
        friendMetThreshold: (todayMap[fid] || 0) >= friendGoal * 60,
      };
    });

    res.json({ streaks: result, thresholdMinutes: myGoal });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch streaks' });
  }
});

module.exports = router;
