const express = require('express');
const { authenticate, requireVerified, requireRole } = require('../middleware/auth');
const { aiGateCheck, softBanCheck } = require('../middleware/guards');
const TrackingData = require('../models/TrackingData');
const Settings = require('../models/Settings');
const logger = require('../utils/logger');

const router = express.Router();

// In-memory rate limiter: max 5 per user per hour
const aiRateMap = new Map();
function aiRateLimit(req, res, next) {
  const uid = req.user.userId;
  const now = Date.now();
  const window = 60 * 60 * 1000;
  const entries = (aiRateMap.get(uid) || []).filter(t => now - t < window);
  if (entries.length >= 5) {
    return res.status(429).json({ error: 'AI rate limit reached. Try again later.' });
  }
  entries.push(now);
  aiRateMap.set(uid, entries);
  next();
}

// In-memory response cache (userId:context -> {advice, generatedAt})
const aiCache = new Map();
const CACHE_TTL = 6 * 60 * 60 * 1000;

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

router.post('/advice', authenticate, softBanCheck, requireVerified, aiGateCheck, aiRateLimit, async (req, res) => {
  try {
    const { context = 'dashboard' } = req.body;
    const cacheKey = `${req.user.userId}:${context}`;

    // Check cache
    const cached = aiCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
      return res.json({ advice: cached.advice, generatedAt: cached.generatedAt, cached: true });
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
      userId: req.user.userId,
      date: { $gte: from.toISOString().slice(0, 10) },
    }).sort({ date: 1 });

    const dailyData = data.map(d => ({ date: d.date, minutes: Math.round(d.seconds / 60) }));
    const totalDays = dailyData.length;
    const totalMinutes = dailyData.reduce((s, d) => s + d.minutes, 0);
    const avgMinutes = totalDays > 0 ? Math.round(totalMinutes / totalDays) : 0;
    const goalMinutes = req.user.dailyGoalMinutes;
    const daysMetGoal = dailyData.filter(d => d.minutes >= goalMinutes).length;

    // Resolve system prompt: user override > admin default > built-in
    const userSystemPrompt = req.user.aiSystemPrompt || '';
    const adminSystemPrompt = await Settings.get('defaultAiSystemPrompt') || '';
    const builtInSystemPrompt = `You are a productivity coach for a standing desk tracker app called StandUpTracker. Be encouraging but honest. Keep response under 150 words. Use simple language.`;
    const systemPrompt = userSystemPrompt || adminSystemPrompt || builtInSystemPrompt;

    // Resolve max tokens: user override > admin default > 500
    const userMaxTokens = req.user.aiMaxTokens || 0;
    const adminMaxTokens = await Settings.get('defaultAiMaxTokens') || 500;
    const numPredict = userMaxTokens > 0 ? Math.min(Math.max(userMaxTokens, 100), 2000) : Math.min(Math.max(adminMaxTokens, 100), 2000);

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

Give personalized advice.`;

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
    const generatedAt = new Date().toISOString();

    // Cache the result
    aiCache.set(cacheKey, { advice, generatedAt, cachedAt: Date.now() });

    res.json({ advice, generatedAt, cached: false });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'AI request timed out' });
    }
    logger.error('AI advice error', { source: 'ai', meta: { error: err.message } });
    res.status(500).json({ error: 'Failed to generate advice' });
  }
});

module.exports = router;
