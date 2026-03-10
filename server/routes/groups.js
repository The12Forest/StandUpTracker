const express = require('express');
const { authenticate, requireVerified } = require('../middleware/auth');
const { softBanCheck, lastActiveTouch } = require('../middleware/guards');
const Group = require('../models/Group');
const User = require('../models/User');
const TrackingData = require('../models/TrackingData');
const Settings = require('../models/Settings');

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

// Get group detail (members + streak)
router.get('/:groupId', async (req, res) => {
  try {
    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const isMember = group.members.some(m => m.userId === req.user.userId);
    if (!isMember) return res.status(403).json({ error: 'Not a member of this group' });

    const memberIds = group.members.map(m => m.userId);
    const users = await User.find({ userId: { $in: memberIds } }).select('userId username level');
    const userMap = {};
    users.forEach(u => { userMap[u.userId] = u; });

    // Check today's threshold for each member
    const threshold = await Settings.get('streakThresholdMinutes') || 3;
    const today = new Date().toISOString().slice(0, 10);
    const todayData = await TrackingData.find({ userId: { $in: memberIds }, date: today });
    const todayMap = {};
    todayData.forEach(d => { todayMap[d.userId] = d.seconds; });

    const members = group.members.map(m => ({
      userId: m.userId,
      username: userMap[m.userId]?.username || 'Unknown',
      level: userMap[m.userId]?.level || 1,
      role: m.role,
      joinedAt: m.joinedAt,
      todaySeconds: todayMap[m.userId] || 0,
      metThreshold: (todayMap[m.userId] || 0) >= threshold * 60,
    }));

    res.json({
      groupId: group.groupId,
      name: group.name,
      members,
      invites: group.invites.length,
      currentStreak: group.currentStreak,
      bestStreak: group.bestStreak,
      lastSyncDate: group.lastSyncDate,
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

    const { name } = req.body;
    if (!name || name.trim().length < 2 || name.trim().length > 50) {
      return res.status(400).json({ error: 'Group name must be 2-50 characters' });
    }

    const group = await Group.create({
      name: name.trim(),
      members: [{ userId: req.user.userId, role: 'owner' }],
    });

    res.status(201).json({ groupId: group.groupId, name: group.name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create group' });
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

    // Notify via socket
    const io = req.app.get('io');
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
router.post('/:groupId/accept', async (req, res) => {
  try {
    const group = await Group.findOne({ groupId: req.params.groupId });
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const invIdx = group.invites.findIndex(i => i.userId === req.user.userId);
    if (invIdx === -1) return res.status(404).json({ error: 'No pending invitation' });

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
