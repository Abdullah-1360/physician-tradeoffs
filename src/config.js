/**
 * Configuration for PhysicianCareers Scraper
 */
const path = require('path');

const DATA_DIR = path.resolve(__dirname, '../data');

module.exports = {
  TARGET_URL:
    'https://physiciancareers.ca/jobs/locum-family-medicine-halifax-6aa4def25ffbbbfeb637f526',
  BASE_URL: 'https://physiciancareers.ca',
  
  // Browser settings
  BROWSER: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    locale: 'en-CA',
    timezoneId: 'America/Toronto',
    geolocation: { latitude: 44.6488, longitude: -63.5752 }, // Halifax, NS
    permissions: ['geolocation'],
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'en-CA,en-US;q=0.9,en;q=0.8',
      'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Linux"',
    },
  },

  // Delays and timeouts (in ms)
  DELAYS: {
    minActionDelay: 600,
    maxActionDelay: 1800,
    pageNavigationTimeout: 45000,
    elementTimeout: 10000,
    networkIdleTimeout: 15000,
  },

  // Retries
  RETRY: {
    maxAttempts: 3,
    backoffBaseMs: 1500,
  },

  // Output paths (resolves relative to physicians_project root)
  OUTPUT: {
    dataDir: DATA_DIR,
    defaultJsonFile: path.join(DATA_DIR, 'scraped_job.json'),
    defaultCsvFile: path.join(DATA_DIR, 'scraped_job.csv'),
    page1JsonFile: path.join(DATA_DIR, 'first_page_jobs.json'),
    page1CsvFile: path.join(DATA_DIR, 'first_page_jobs.csv'),
  },
};
