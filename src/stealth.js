const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealthPlugin);

const config = require('./config');

/**
 * Creates an industry-grade stealth browser context with Playwright
 * @param {Object} options Override default browser options
 * @returns {Promise<{browser: import('playwright').Browser, context: import('playwright').BrowserContext, page: import('playwright').Page}>}
 */
async function createStealthBrowser(options = {}) {
  const isHeadless = options.headless !== undefined ? options.headless : config.BROWSER.headless;

  const browser = await chromium.launch({
    headless: isHeadless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-infobars',
      '--window-position=0,0',
      `--window-size=${config.BROWSER.viewport.width},${config.BROWSER.viewport.height}`,
      '--lang=en-CA,en-US',
      ...(options.additionalArgs || []),
    ],
  });

  const context = await browser.newContext({
    viewport: config.BROWSER.viewport,
    userAgent: options.userAgent || config.BROWSER.userAgent,
    locale: config.BROWSER.locale,
    timezoneId: config.BROWSER.timezoneId,
    geolocation: config.BROWSER.geolocation,
    permissions: config.BROWSER.permissions,
    extraHTTPHeaders: config.BROWSER.extraHTTPHeaders,
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    colorScheme: 'light',
  });

  // Inject additional anti-bot & fingerprint evasion script into every new page
  await context.addInitScript(() => {
    // 1. Mask navigator.webdriver
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });

    // 2. Mock chrome runtime object
    if (!window.chrome) {
      window.chrome = {
        app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' } },
        runtime: {
          OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
          OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' },
          PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
          PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
          RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
        },
      };
    }

    // 3. Ensure languages match Canadian/US English
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-CA', 'en-US', 'en'],
    });

    // 4. Spoof Notification permissions
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    }
  });

  const page = await context.newPage();

  // Set default timeouts
  page.setDefaultTimeout(config.DELAYS.pageNavigationTimeout);
  page.setDefaultNavigationTimeout(config.DELAYS.pageNavigationTimeout);

  return { browser, context, page };
}

module.exports = {
  createStealthBrowser,
};
