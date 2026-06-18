// Einfaches Datei-Logging unter userData/logs/.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

let logDir = null;
let logPath = null;

function ensureLog() {
  if (!logDir) {
    logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    logPath = path.join(logDir, 'overlay.log');
  }
  return logPath;
}

function write(level, msg) {
  try {
    const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
    fs.appendFileSync(ensureLog(), line);
  } catch (_) {}
  const fn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
  fn(msg);
}

function info(msg) { write('INFO', msg); }
function warn(msg) { write('WARN', msg); }
function error(msg) { write('ERROR', msg); }

function getLogDir() {
  ensureLog();
  return logDir;
}

function installGlobalHandlers() {
  process.on('uncaughtException', (err) => {
    error('uncaughtException: ' + (err && err.stack || err));
  });
  process.on('unhandledRejection', (reason) => {
    error('unhandledRejection: ' + (reason && reason.stack || reason));
  });
}

module.exports = { info, warn, error, getLogDir, installGlobalHandlers };
