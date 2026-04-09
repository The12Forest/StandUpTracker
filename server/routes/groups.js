const express = require('express');
const { authenticate, requireVerified } = require('../middleware/auth');
const { softBanCheck, lastActiveTouch } = require('../middleware/guards');
const Group = require('../models/Group');
const User = require('../models/User');
const Notification = require('../models/Notification');
const TrackingData = require('../models/TrackingData');
const Settings = require('../models/Settings');
const { getEffectiveGoalMinutes } = require('../utils/settings');
const { shouldDispatchNotification, incrementNotificationCount } = require('../utils/notificationGate');

const router = express.Router();
router.use(authenticate, softBanCheck, lastActiveTouch);

// List groups the user belongs to (with streak info)
router.get('/', async (req, res) => {
  try {
    const groups = await Group.find({ 'members.userId': req.user.userId });
    const result = groups.map(g => ({
      groupId: g.groupId,
      name: g.name,
      memberCount: g.members.length,
      currentStreak: g.currentStreak,
      bestStreak: g.bestStreak,
      lastSyncDate: g.lastSyncDate,
      myRole: g.members.find(m => m.userId === req.user.userId)?.role,
      leaderboardCriterion: g.leaderboardCriterion || 'weeklyTime',
    }));
    res.json({ groups: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// List pending group invitations for current user (MUST be before /:groupId)
router.get('/invites/pending', async (req, res) => {
  try {
    const groups = await Group.find({ 'invites.userId': req.user.userId });
    const result = groups.map(g => {
      const inv = g.invites.find(i => i.userId === req.user.userId);
      return {
        groupId: g.groupId,
        name: g.name,
        memberCount: g.members.length,
        invitedBy: inv?.invitedBy,
        invitedAt: inv?.createdAt,
      };
    });
    res.json({ invites: result });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invites' });
  }
});

// Get group detail (members + streak + leaderboard)
router.get('/:groupId', async (req, res) => {
  try {
    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isMember = group.members.some(m => m.userId === req.user.userId);
    if (!isMember) return res.status(403).json({ error: 'Not a member of this group' });

    const memberIds = group.members.map(m => m.userId);
    const users = await User.find({ userId: { $in: memberIds } }).select('userId username level totalStandingSeconds currentStreak');
    const userMap = {};
    users.forEach(u => { userMap[u.userId] = u; });

    // Today's tracking
    const today = new Date().toISOString().slice(0, 10);
    const todayData = await TrackingData.find({ userId: { $in: memberIds }, date: today });
    const todayMap = {};
    todayData.forEach(d => { todayMap[d.userId] = d.seconds; });

    // Weekly tracking (respects firstDayOfWeek)
    const firstDayOfWeek = await Settings.get('firstDayOfWeek') || 'monday';
    const now = new Date();
    const jsDay = now.getDay(); // 0=Sun
    const offset = firstDayOfWeek === 'monday'
      ? (jsDay === 0 ? 6 : jsDay - 1)
      : jsDay;
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - offset);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    const weekData = await TrackingData.find({
      userId: { $in: memberIds },
      date: { $gte: weekStartStr, $lte: today },
    });
    const weekMap = {};
    weekData.forEach(d => {
      weekMap[d.userId] = (weekMap[d.userId] || 0) + d.seconds;
    });

    // Goal calculation
    const memberUsers = await User.find({ userId: { $in: memberIds } }).select('userId dailyGoalMinutes');
    const memberGoalMap = {};
    for (const mu of memberUsers) {
      memberGoalMap[mu.userId] = await getEffectiveGoalMinutes(mu);
    }

    const criterion = group.leaderboardCriterion || 'weeklyTime';

    const members = group.members.map(m => {
      const memberGoal = memberGoalMap[m.userId] || 60;
      const u = userMap[m.userId];
      return {
        userId: m.userId,
        username: u?.username || 'Unknown',
        level: u?.level || 1,
        role: m.role,
        joinedAt: m.joinedAt,
        todaySeconds: todayMap[m.userId] || 0,
        metThreshold: (todayMap[m.userId] || 0) >= memberGoal * 60,
        totalStandingSeconds: u?.totalStandingSeconds || 0,
        currentStreak: u?.currentStreak || 0,
        weeklySeconds: weekMap[m.userId] || 0,
      };
    });

    // Sort by active criterion (descending)
    const sortKey = { weeklyTime: 'weeklySeconds', totalTime: 'totalStandingSeconds', level: 'level', streak: 'currentStreak' }[criterion] || 'weeklySeconds';
    members.sort((a, b) => b[sortKey] - a[sortKey]);

    res.json({
      groupId: group.groupId,
      name: group.name,
      members,
      invites: group.invites.length,
      currentStreak: group.currentStreak,
      bestStreak: group.bestStreak,
      lastSyncDate: group.lastSyncDate,
      leaderboardCriterion: criterion,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// Create a group
router.post('/', requireVerified, async (req, res) => {
  try {
    const enabled = await Settings.get('groupsEnabled');
    if (enabled === false) return res.status(403).json({ error: 'Groups are disabled' });

    const maxGroupsPerUser = await Settings.get('maxGroupsPerUser') || 5;
    const existingCount = await Group.countDocuments({ 'members.userId': req.user.userId });
    if (existingCount >= maxGroupsPerUser) {
      return res.status(400).json({ error: `You have reached the maximum of ${maxGroupsPerUser} groups` });
    }

    const { name } = req.body;
    if (!name || name.trim().length < 2 || name.trim().length > 50) {
      return res.status(400).json({ error: 'Group name must be 2-50 characters' });
    }

    const defaultCriterion = await Settings.get('defaultGroupLeaderboardCriterion') || 'weeklyTime';

    const group = await Group.create({
      name: name.trim(),
      members: [{ userId: req.user.userId, role: 'owner' }],
      leaderboardCriterion: defaultCriterion,
    });

    res.status(201).json({ groupId: group.groupId, name: group.name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// Update group leaderboard criterion (owner only)
router.put('/:groupId/criterion', async (req, res) => {
  try {
    const { criterion } = req.body;
    const valid = ['weeklyTime', 'totalTime', 'level', 'streak'];
    if (!criterion || !valid.includes(criterion)) {
      return res.status(400).json({ error: `Criterion must be one of: ${valid.join(', ')}` });
    }

    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const member = group.members.find(m => m.userId === req.user.userId);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Only the group owner can change the leaderboard criterion' });
    }

    group.leaderboardCriterion = criterion;
    await group.save();
    res.json({ message: 'Leaderboard criterion updated', criterion });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update criterion' });
  }
});

// Invite user to group
router.post('/:groupId/invite', requireVerified, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Username required' });

    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const member = group.members.find(m => m.userId === req.user.userId);
    if (!member) return res.status(403).json({ error: 'Not a member' });

    const maxSize = await Settings.get('maxGroupSize') || 20;
    if (group.members.length >= maxSize) {
      return res.status(400).json({ error: `Group is full (max ${maxSize} members)` });
    }

    const target = await User.findOne({ username, active: true });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.userId === req.user.userId) return res.status(400).json({ error: 'Cannot invite yourself' });
    if (group.members.some(m => m.userId === target.userId)) {
      return res.status(409).json({ error: 'User is already a member' });
    }
    if (group.invites.some(i => i.userId === target.userId)) {
      return res.status(409).json({ error: 'User already invited' });
    }

    group.invites.push({ userId: target.userId, invitedBy: req.user.userId });
    await group.save();

    const io = req.app.get('io');

    // Create persistent notification so offline users don't miss the invite (gated)
    if (await shouldDispatchNotification(target.userId, 'group_invite')) {
      const notif = await Notification.create({
        userId: target.userId,
        type: 'group_invite',
        title: 'Group Invitation',
        message: `${req.user.username} invited you to join "${group.name}".`,
        data: { groupId: group.groupId, groupName: group.name, invitedBy: req.user.username },
      });
      await incrementNotificationCount(target.userId);
      // Emit persistent notification to notification bell
      io.to(`user:${target.userId}`).emit('NOTIFICATION', notif.toObject());
    }
    // Also emit GROUP_INVITE for real-time invite list refresh
    io.to(`user:${target.userId}`).emit('GROUP_INVITE', {
      groupId: group.groupId,
      groupName: group.name,
      invitedBy: req.user.username,
    });

    res.json({ message: 'Invitation sent' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

// Accept group invitation
router.post('/:groupId/accept', requireVerified, async (req, res) => {
  try {
    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const invIdx = group.invites.findIndex(i => i.userId === req.user.userId);
    if (invIdx === -1) return res.status(404).json({ error: 'No pending invitation' });

    const maxSize = await Settings.get('maxGroupSize') || 20;
    if (group.members.length >= maxSize) {
      return res.status(400).json({ error: `Group is full (max ${maxSize} members)` });
    }

    const maxGroupsPerUser = await Settings.get('maxGroupsPerUser') || 5;
    const existingCount = await Group.countDocuments({ 'members.userId': req.user.userId });
    if (existingCount >= maxGroupsPerUser) {
      return res.status(400).json({ error: `You have reached the maximum of ${maxGroupsPerUser} groups` });
    }

    group.invites.splice(invIdx, 1);
    group.members.push({ userId: req.user.userId, role: 'member' });
    await group.save();

    res.json({ message: 'Joined group' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept invitation' });
  }
});

// Decline group invitation
router.post('/:groupId/decline', async (req, res) => {
  try {
    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const invIdx = group.invites.findIndex(i => i.userId === req.user.userId);
    if (invIdx === -1) return res.status(404).json({ error: 'No pending invitation' });

    group.invites.splice(invIdx, 1);
    await group.save();

    res.json({ message: 'Invitation declined' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to decline invitation' });
  }
});

// Leave group
router.post('/:groupId/leave', async (req, res) => {
  try {
    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const memberIdx = group.members.findIndex(m => m.userId === req.user.userId);
    if (memberIdx === -1) return res.status(400).json({ error: 'Not a member' });

    const isOwner = group.members[memberIdx].role === 'owner';
    group.members.splice(memberIdx, 1);

    if (group.members.length === 0) {
      // Last member — delete group
      await group.deleteOne();
      return res.json({ message: 'Group deleted (no members left)' });
    }

    // Transfer ownership if owner leaves
    if (isOwner) {
      group.members[0].role = 'owner';
    }
    await group.save();

    res.json({ message: 'Left group' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

// Delete group (owner only)
router.delete('/:groupId', async (req, res) => {
  try {
    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const member = group.members.find(m => m.userId === req.user.userId);
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ error: 'Only the group owner can delete this group' });
    }

    await group.deleteOne();
    res.json({ message: 'Group deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

module.exports = router;
