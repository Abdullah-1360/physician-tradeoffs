const fs = require('fs');
const path = require('path');

const logger = {
  info: (msg, ...args) => console.log(`\x1b[36m[INFO ${new Date().toISOString().slice(11, 19)}]\x1b[0m ${msg}`, ...args),
  success: (msg, ...args) => console.log(`\x1b[32m[SUCCESS ${new Date().toISOString().slice(11, 19)}]\x1b[0m ${msg}`, ...args),
  warn: (msg, ...args) => console.log(`\x1b[33m[WARN ${new Date().toISOString().slice(11, 19)}]\x1b[0m ${msg}`, ...args),
  error: (msg, ...args) => console.error(`\x1b[31m[ERROR ${new Date().toISOString().slice(11, 19)}]\x1b[0m ${msg}`, ...args),
};

/**
 * Pause execution for a random delay between min and max milliseconds
 * @param {number} min Minimum milliseconds
 * @param {number} max Maximum milliseconds
 * @returns {Promise<void>}
 */
function randomDelay(min = 600, max = 1500) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Human-like scrolling simulation on a Playwright page
 * @param {import('playwright').Page} page
 */
async function humanScroll(page) {
  try {
    await page.evaluate(async () => {
      const distance = 300;
      window.scrollBy({ top: distance, behavior: 'smooth' });
      await new Promise((r) => setTimeout(r, 400));
      window.scrollBy({ top: distance, behavior: 'smooth' });
      await new Promise((r) => setTimeout(r, 400));
      window.scrollBy({ top: -distance, behavior: 'smooth' });
    });
  } catch (err) {
    // Scroll failure shouldn't abort the scrape
  }
}

/**
 * Cleans and normalizes text strings
 * @param {string} str
 * @returns {string}
 */
function cleanText(str) {
  if (!str) return '';
  return str
    .replace(/\u00a0/g, ' ') // Replace non-breaking spaces
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ') // Collapse multiple spaces
    .replace(/\r\n|\r/g, '\n') // Normalize newlines
    .trim();
}

/**
 * Retry helper with exponential backoff
 * @param {Function} fn Async function to execute
 * @param {Object} options
 * @param {number} options.maxAttempts
 * @param {number} options.backoffBaseMs
 * @param {string} options.taskName
 */
async function withRetry(fn, { maxAttempts = 3, backoffBaseMs = 1500, taskName = 'Task' } = {}) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxAttempts) {
        logger.error(`${taskName} failed after ${maxAttempts} attempts: ${err.message}`);
        throw err;
      }
      const backoff = backoffBaseMs * Math.pow(2, attempt - 1) + Math.random() * 500;
      logger.warn(`${taskName} failed (attempt ${attempt}/${maxAttempts}). Retrying in ${Math.round(backoff)}ms...`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

/**
 * Save data to JSON file
 * @param {string} filePath
 * @param {any} data
 */
function saveJson(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  logger.success(`Saved JSON data to ${filePath}`);
}

/**
 * Flattens nested object for CSV export
 * @param {Object} obj
 * @param {string} prefix
 * @returns {Object}
 */
function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, val] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenObject(val, newKey));
    } else if (Array.isArray(val)) {
      result[newKey] = val.map((item) => (typeof item === 'object' ? JSON.stringify(item) : item)).join(' | ');
    } else {
      result[newKey] = val === null || val === undefined ? '' : String(val);
    }
  }
  return result;
}

/**
 * Save data to CSV file
 * @param {string} filePath
 * @param {Array<Object>} items
 */
function saveCsv(filePath, items) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const array = Array.isArray(items) ? items : [items];
  if (array.length === 0) {
    logger.warn('No items to write to CSV.');
    return;
  }

  const flattened = array.map((item) => flattenObject(item));
  const headers = Array.from(new Set(flattened.flatMap((item) => Object.keys(item))));

  const escapeCsv = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const csvRows = [
    headers.map(escapeCsv).join(','),
    ...flattened.map((row) => headers.map((h) => escapeCsv(row[h] || '')).join(',')),
  ];

  fs.writeFileSync(filePath, csvRows.join('\n'), 'utf-8');
  logger.success(`Saved CSV data to ${filePath}`);
}

module.exports = {
  logger,
  randomDelay,
  humanScroll,
  cleanText,
  withRetry,
  saveJson,
  saveCsv,
};
