const express = require('express');
const { authenticate, requireVerified, requireRole } = require('../middleware/auth');
const { aiGateCheck, softBanCheck } = require('../middleware/guards');
const TrackingData = require('../models/TrackingData');
const AiAdviceCache = require('../models/AiAdviceCache');
const Settings = require('../models/Settings');
const { getEffectiveGoalMinutes, getSetting } = require('../utils/settings');
const logger = require('../utils/logger');

const router = express.Router();

// In-memory rate limiter: max 10 per user per hour (safety net on top of cooldown)
const aiRateMap = new Map();
function aiRateLimit(req, res, next) {
  const uid = req.user.userId;
  const now = Date.now();
  const window = 60 * 60 * 1000;
  const entries = (aiRateMap.get(uid) || []).filter(t => now - t < window);
  if (entries.length >= 10) {
    return res.status(429).json({ error: 'AI rate limit reached. Try again later.' });
  }
  entries.push(now);
  aiRateMap.set(uid, entries);
  next();
}

// Fetch available Ollama models (admin only)
router.get('/models', authenticate, softBanCheck, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const endpoint = await Settings.get('ollamaEndpoint');
    if (!endpoint) {
      return res.status(400).json({ error: 'Ollama endpoint not configured' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${endpoint.replace(/\/+$/, '')}/api/tags`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ error: `Ollama responded with status ${response.status}` });
    }

    const data = await response.json();
    const models = (data.models || []).map(m => ({
      name: m.name,
      size: m.size,
      modifiedAt: m.modified_at,
    }));

    res.json({ models });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Ollama endpoint timed out. Check if Ollama is running.' });
    }
    logger.warn('Failed to fetch Ollama models', { source: 'ai', meta: { error: err.message } });
    res.status(502).json({ error: `Cannot reach Ollama: ${err.message}` });
  }
});

// GET /api/ai/advice — serve cached advice or indicate none available (no generation)
router.get('/advice', authenticate, softBanCheck, requireVerified, aiGateCheck, async (req, res) => {
  try {
    const { context = 'dashboard' } = req.query;
    const userId = req.user.userId;

    // Serve from DB cache if still valid
    const cached = await AiAdviceCache.findOne({ userId, context, expiresAt: { $gt: new Date() } });
    if (cached) {
      const cooldownMinutes = await getSetting('aiAdviceCooldownMinutes') || 30;
      const cooldownMs = cooldownMinutes * 60 * 1000;
      const nextRefreshAt = new Date(cached.generatedAt.getTime() + cooldownMs).toISOString();
      return res.json({
        advice: cached.advice,
        generatedAt: cached.generatedAt.toISOString(),
        cached: true,
        nextRefreshAt,
      });
    }

    res.json({ advice: null, cached: false });
  } catch (err) {
    logger.error('AI advice GET error', { source: 'ai', meta: { error: err.message } });
    res.status(500).json({ error: 'Failed to fetch advice' });
  }
});

// POST /api/ai/advice — generate fresh advice (subject to cooldown)
router.post('/advice', authenticate, softBanCheck, requireVerified, aiGateCheck, aiRateLimit, async (req, res) => {
  try {
    const { context = 'dashboard', forceRefresh = false } = req.body;
    const userId = req.user.userId;

    // Check cooldown — look at last generated entry regardless of cache expiry or forceRefresh
    const cooldownMinutes = await getSetting('aiAdviceCooldownMinutes') || 30;
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const lastEntry = await AiAdviceCache.findOne({ userId, context }).sort({ generatedAt: -1 });

    if (lastEntry) {
      const elapsed = Date.now() - lastEntry.generatedAt.getTime();
      if (elapsed < cooldownMs) {
        const retryAfterSeconds = Math.ceil((cooldownMs - elapsed) / 1000);
        const nextRefreshAt = new Date(lastEntry.generatedAt.getTime() + cooldownMs).toISOString();
        return res.status(429).json({
          error: `Please wait before refreshing advice`,
          retryAfterSeconds,
          nextRefreshAt,
          // Return cached advice so UI still shows it
          advice: lastEntry.advice,
          generatedAt: lastEntry.generatedAt.toISOString(),
          cached: true,
        });
      }
    }

    // Check DB cache (not a forced refresh)
    const cacheDurationMinutes = await getSetting('aiAdviceCacheDurationMinutes') || 30;
    const cacheDurationMs = cacheDurationMinutes * 60 * 1000;

    if (!forceRefresh && lastEntry) {
      const cacheAge = Date.now() - lastEntry.generatedAt.getTime();
      if (cacheAge < cacheDurationMs) {
        const nextRefreshAt = new Date(lastEntry.generatedAt.getTime() + cooldownMs).toISOString();
        return res.json({
          advice: lastEntry.advice,
          generatedAt: lastEntry.generatedAt.toISOString(),
          cached: true,
          nextRefreshAt,
        });
      }
    }

    const ollamaEndpoint = await Settings.get('ollamaEndpoint');
    const ollamaModel = await Settings.get('ollamaModel');

    if (!ollamaEndpoint || !ollamaModel) {
      return res.status(503).json({ error: 'AI service not configured. Admin must set Ollama endpoint and model.' });
    }

    // Fetch user's last 30 days of tracking
    const from = new Date();
    from.setDate(from.getDate() - 30);
    const data = await TrackingData.find({
      userId,
      date: { $gte: from.toISOString().slice(0, 10) },
    }).sort({ date: 1 });

    const dailyData = data.map(d => ({ date: d.date, minutes: Math.round(d.seconds / 60) }));
    const totalDays = dailyData.length;
    const totalMinutes = dailyData.reduce((s, d) => s + d.minutes, 0);
    const avgMinutes = totalDays > 0 ? Math.round(totalMinutes / totalDays) : 0;
    const goalMinutes = await getEffectiveGoalMinutes(req.user);
    const daysMetGoal = dailyData.filter(d => d.minutes >= goalMinutes).length;

    // System prompt: admin default > built-in
    const adminSystemPrompt = await Settings.get('defaultAiSystemPrompt') || '';
    const builtInSystemPrompt = `You are a productivity coach for a standing desk tracker app called StandUpTracker. Be encouraging but honest. Keep response under 150 words. Use simple language. Use markdown formatting for readability.`;
    const systemPrompt = adminSystemPrompt || builtInSystemPrompt;

    // Max tokens: admin default > 500
    const adminMaxTokens = await Settings.get('defaultAiMaxTokens') || 500;
    const numPredict = Math.min(Math.max(adminMaxTokens, 100), 2000);

    const prompt = `Analyze this user's data and give 2-3 brief, actionable tips.

Context: ${context}
Last 30 days summary:
- Days tracked: ${totalDays}
- Average daily: ${avgMinutes} min
- Goal: ${goalMinutes} min/day
- Days goal met: ${daysMetGoal}/${totalDays}
- Current streak: ${req.user.currentStreak} days
- Best streak: ${req.user.bestStreak} days
- Level: ${req.user.level}

Daily breakdown: ${JSON.stringify(dailyData.slice(-14).map(d => `${d.date}:${d.minutes}m`))}

Give personalized advice. Use markdown formatting with bullet points and bold for key recommendations.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    const response = await fetch(`${ollamaEndpoint.replace(/\/+$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ollamaModel,
        prompt,
        system: systemPrompt,
        stream: false,
        options: { temperature: 0.7, num_predict: numPredict },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      logger.warn('Ollama API error', { source: 'ai', meta: { status: response.status, body: errText } });
      return res.status(502).json({ error: 'AI service temporarily unavailable' });
    }

    const result = await response.json();
    const advice = result.response || 'No advice available at this time.';
    const generatedAt = new Date();
    const expiresAt = new Date(generatedAt.getTime() + cacheDurationMs);

    // Persist to DB cache (upsert)
    await AiAdviceCache.findOneAndUpdate(
      { userId, context },
      { advice, generatedAt, expiresAt },
      { upsert: true }
    );

    const nextRefreshAt = new Date(generatedAt.getTime() + cooldownMs).toISOString();

    res.json({ advice, generatedAt: generatedAt.toISOString(), cached: false, nextRefreshAt });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI request timed out' });
    }
    logger.error('AI advice error', { source: 'ai', meta: { error: err.message } });
    res.status(500).json({ error: 'Failed to generate advice' });
  }
});

module.exports = router;
