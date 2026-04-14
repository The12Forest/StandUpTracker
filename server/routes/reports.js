const express = require('express');
const { authenticate } = require('../middleware/auth');
const { softBanCheck, lastActiveTouch, require2faSetup } = require('../middleware/guards');
const User = require('../models/User');
const Report = require('../models/Report');
const TrackingData = require('../models/TrackingData');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const { getSetting } = require('../utils/settings');
const { recalcUserStats } = require('../utils/recalcStats');
const { checkAndSetGoalMet } = require('../utils/streaks');
const { sendPushNotification } = require('../utils/pushSender');
const { shouldDispatchNotification, incrementNotificationCount } = require('../utils/notificationGate');
const logger = require('../utils/logger');

const router = express.Router();
router.use(authenticate, softBanCheck, require2faSetup, lastActiveTouch);

// Submit a report against a user's active timer session
router.post('/', async (req, res) => {
  try {
    const { targetUserId, reason } = req.body;
    if (!targetUserId) return res.status(400).json({ error: 'targetUserId is required' });

    const reporter = req.user;

    // Self-report check
    const allowSelfReport = await getSetting('allowSelfReport');
    if (!allowSelfReport && targetUserId === reporter.userId) {
      return res.status(400).json({ error: 'You cannot report yourself' });
    }

    // Target user must exist and have an active timer
    const target = await User.findOne({ userId: targetUserId, active: true, deletedAt: null });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!target.timerRunning || !target.timerStartedAt) {
      return res.status(400).json({ error: 'User does not have an active timer session' });
    }

    const sessionId = target.timerStartedAt.toISOString();

    // Cooldown check — reporter can't submit reports too frequently
    const cooldownMinutes = await getSetting('reportCooldownMinutes') || 60;
    const cooldownSince = new Date(Date.now() - cooldownMinutes * 60 * 1000);
    const recentReport = await Report.findOne({
      reporterId: reporter.userId,
      createdAt: { $gte: cooldownSince },
    }).sort({ createdAt: -1 });
    if (recentReport) {
      const waitMs = (recentReport.createdAt.getTime() + cooldownMinutes * 60 * 1000) - Date.now();
      const waitMinutes = Math.ceil(waitMs / 60000);
      return res.status(429).json({ error: `Please wait ${waitMinutes} minute(s) before submitting another report` });
    }

    // Duplicate check — one report per reporter per session
    const existing = await Report.findOne({ reporterId: reporter.userId, targetUserId, sessionId });
    if (existing) {
      return res.status(409).json({ error: 'You have already reported this session' });
    }

    const today = new Date().toISOString().slice(0, 10);
    const report = await Report.create({
      reporterId: reporter.userId,
      targetUserId,
      sessionId,
      reason: (reason || '').slice(0, 200),
      status: 'pending',
      date: today,
    });

    // Count total reports for this session
    const sessionReportCount = await Report.countDocuments({ targetUserId, sessionId });
    const threshold = await getSetting('reportThreshold') || 3;

    // Notify the target user (report warning — gated)
    const io = req.app.get('io');
    if (await shouldDispatchNotification(targetUserId, 'report_warning')) {
      const warningNotif = await Notification.create({
        userId: targetUserId,
        type: 'report_warning',
        title: 'Timer Session Reported',
        message: `Your timer session has been reported. Report ${sessionReportCount} of ${threshold} — if ${threshold} reports are received your daily progress will be cleared.`,
        data: { reportCount: sessionReportCount, threshold, sessionId },
      });
      await incrementNotificationCount(targetUserId);
      if (io) io.to(`user:${targetUserId}`).emit('NOTIFICATION', warningNotif.toObject());
      sendPushNotification(targetUserId, 'report_warning', {
        title: 'StandUpTracker',
        body: warningNotif.message,
      }).catch(() => {});
    }

    // Check if threshold reached
    if (sessionReportCount >= threshold) {
      // Confirm all reports for this session
      await Report.updateMany({ targetUserId, sessionId }, { status: 'confirmed' });

      // Clear the target user's daily progress
      const tracking = await TrackingData.findOne({ userId: targetUserId, date: today });
      if (tracking && !tracking.clearedByReports) {
        tracking.preReportSeconds = tracking.seconds;
        tracking.seconds = 0;
        tracking.sessions = [];
        tracking.clearedByReports = true;
        tracking.reportClearedAt = new Date();
        tracking.reportCount = sessionReportCount;
        tracking.reportRestored = false;
        await tracking.save();

        // Recalc stats
        await recalcUserStats(targetUserId);
        // Re-evaluate goal_met (seconds zeroed out)
        await checkAndSetGoalMet(targetUserId, today, io);

        // Emit stats update
        const updatedUser = await User.findOne({ userId: targetUserId });
        if (io && updatedUser) {
          io.to(`user:${targetUserId}`).emit('STATS_UPDATE', {
            totalStandingSeconds: updatedUser.totalStandingSeconds,
            totalDays: updatedUser.totalDays,
            currentStreak: updatedUser.currentStreak,
            bestStreak: updatedUser.bestStreak,
            level: updatedUser.level,
            todaySeconds: 0,
          });
        }
      }

      // Notify target: progress cleared (CRITICAL — bypasses daily limit, still respects quiet hours)
      if (await shouldDispatchNotification(targetUserId, 'report_cleared')) {
        const clearedNotif = await Notification.create({
          userId: targetUserId,
          type: 'report_cleared',
          title: 'Daily Progress Cleared',
          message: 'Your daily progress has been cleared due to multiple reports.',
          data: { reportCount: sessionReportCount, date: today },
        });
        await incrementNotificationCount(targetUserId);
        if (io) io.to(`user:${targetUserId}`).emit('NOTIFICATION', clearedNotif.toObject());
        sendPushNotification(targetUserId, 'report_cleared', {
          title: 'StandUpTracker',
          body: clearedNotif.message,
        }).catch(() => {});
      }

      // Notify all admins (CRITICAL — bypasses daily limit, still respects quiet hours)
      const admins = await User.find({ role: { $in: ['manager', 'admin', 'super_admin'] }, active: true, deletedAt: null });
      for (const admin of admins) {
        if (await shouldDispatchNotification(admin.userId, 'admin_report_alert')) {
          const adminNotif = await Notification.create({
            userId: admin.userId,
            type: 'admin_report_alert',
            title: 'Report Threshold Reached',
            message: `User ${target.username} has had their daily progress cleared after receiving ${sessionReportCount} reports.`,
            data: { targetUserId, targetUsername: target.username, reportCount: sessionReportCount, date: today },
          });
          await incrementNotificationCount(admin.userId);
          if (io) io.to(`user:${admin.userId}`).emit('NOTIFICATION', adminNotif.toObject());
          sendPushNotification(admin.userId, 'admin_report_alert', {
            title: 'StandUpTracker',
            body: adminNotif.message,
          }).catch(() => {});
        }
      }

      logger.info(`Daily progress cleared for ${target.username} after ${sessionReportCount} reports`, { source: 'reports' });
    }

    res.json({ message: 'Report submitted', reportCount: sessionReportCount, threshold });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'You have already reported this session' });
    }
    logger.warn('Report submission error: ' + err.message, { source: 'reports' });
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

// Check if the current user has already reported a specific user's current session
router.get('/check/:targetUserId', async (req, res) => {
  try {
    const target = await User.findOne({ userId: req.params.targetUserId });
    if (!target || !target.timerRunning || !target.timerStartedAt) {
      return res.json({ reported: false, timerActive: false });
    }
    const sessionId = target.timerStartedAt.toISOString();
    const existing = await Report.findOne({
      reporterId: req.user.userId,
      targetUserId: req.params.targetUserId,
      sessionId,
    });
    res.json({ reported: !!existing, timerActive: true, sessionId });
  } catch {
    res.status(500).json({ error: 'Failed to check report status' });
  }
});

module.exports = router;
