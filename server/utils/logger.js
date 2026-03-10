const Log = require('../models/Log');
const Settings = require('../models/Settings');

const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

async function isDebugMode() {
  try {
    return !!(await Settings.get('debugMode'));
  } catch {
    return false;
  }
}

async function shouldLog(level) {
  const debug = await isDebugMode();
  if (debug) return true; // debug mode logs everything
  const minLevel = await Settings.get('logLevel') || 'INFO';
  return LEVELS[level] >= LEVELS[minLevel];
}

async function log(level, message, meta = {}) {
  const canLog = await shouldLog(level);
  if (!canLog) return;

  const debug = await isDebugMode();
  const prefix = `[${level}]`;
  const metaStr = debug && meta.meta ? ` | ${JSON.stringify(meta.meta)}` : '';
  if (level === 'ERROR') console.error(prefix, message, metaStr);
  else if (level === 'WARN') console.warn(prefix, message, metaStr);
  else if (level === 'DEBUG' && debug) console.debug(prefix, message, metaStr);
  else console.log(prefix, message, metaStr);

  try {
    // Destructure to avoid meta accidentally overwriting level/message
    const { level: _, message: __, ...safeFields } = meta;
    await Log.create({ level, message, ...safeFields });
  } catch (e) {
    console.error('Failed to persist log:', e.message);
  }
}

module.exports = {
  debug: (msg, meta) => log('DEBUG', msg, meta),
  info: (msg, meta) => log('INFO', msg, meta),
  warn: (msg, meta) => log('WARN', msg, meta),
  error: (msg, meta) => log('ERROR', msg, meta),
  isDebugMode,
};
