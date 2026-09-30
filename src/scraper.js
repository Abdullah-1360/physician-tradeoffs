/**
 * Core Scraper Orchestrator for PhysicianCareers.ca
 * Supports Single Job, First Page, and Multi-Specialty City Exploration
 */

const { createStealthBrowser } = require('./stealth');
const { parseJobDetail, parseJobList, parsePaginationMeta } = require('./parser');
const { normalizeJobRecord } = require('./normalizer');
const DatabaseManager = require('./db');
const { logger, randomDelay, humanScroll, withRetry, saveJson, saveCsv } = require('./utils');
const config = require('./config');
const path = require('path');

class PhysicianCareersScraper {
  constructor(options = {}) {
    this.options = {
      headless: options.headless !== undefined ? options.headless : config.BROWSER.headless,
      delays: { ...config.DELAYS, ...options.delays },
      ...options,
    };
    this.browser = null;
    this.context = null;
    this.page = null;
    this.db = new DatabaseManager(options.dbOptions || {});
  }

  /**
   * Initializes the stealth browser and database connection
   */
  async init() {
    if (!this.browser) {
      logger.info('Initializing stealth browser with anti-detection plugins...');
      const { browser, context, page } = await createStealthBrowser({
        headless: this.options.headless,
      });
      this.browser = browser;
      this.context = context;
      this.page = page;
      logger.success('Stealth browser ready.');
    }

    await this.db.init();
  }

  /**
   * Closes browser resources and finalizes database
   */
  async close() {
    if (this.db) {
      await this.db.close();
    }
    if (this.browser) {
      logger.info('Closing browser session...');
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      logger.info('Browser closed.');
    }
  }

  /**
   * Scrapes a single job detail page from given URL
   * @param {string} url Target job URL
   * @returns {Promise<Object>}
   */
  async scrapeJob(url = config.TARGET_URL) {
    await this.init();

    logger.info(`Navigating to job page: ${url}`);

    await withRetry(
      async () => {
        const response = await this.page.goto(url, {
          waitUntil: 'networkidle',
          timeout: this.options.delays.pageNavigationTimeout,
        });

        if (!response || response.status() >= 400) {
          throw new Error(`Failed to load page. HTTP Status: ${response ? response.status() : 'Unknown'}`);
        }

        // Ensure the job detail card is rendered
        await this.page.waitForSelector('.job-detail-card', {
          timeout: this.options.delays.elementTimeout,
        });
      },
      { maxAttempts: config.RETRY.maxAttempts, taskName: 'Navigate to Job Page' }
    );

    await randomDelay(this.options.delays.minActionDelay, this.options.delays.maxActionDelay);
    await humanScroll(this.page);

    logger.info('Extracting job DOM and JSON-LD data...');
    const jobData = await parseJobDetail(this.page);
    const pagination = await parsePaginationMeta(this.page);
    const normalized = normalizeJobRecord(jobData);

    // Save to database
    await this.db.upsertJob(normalized);

    logger.success(`Successfully scraped job: "${normalized.title}" (${normalized.company})`);

    return {
      job: normalized,
      pagination_context: pagination,
    };
  }

  /**
   * Scrapes all jobs on the first page
   * @param {Object} opts
   */
  async scrapeFirstPage(opts = {}) {
    const startUrl = opts.url || config.TARGET_URL;
    const fetchFullDetails = opts.fullDetails !== undefined ? opts.fullDetails : true;

    await this.init();

    logger.info(`Loading job board first page at: ${startUrl}`);

    await withRetry(
      async () => {
        const response = await this.page.goto(startUrl, {
          waitUntil: 'networkidle',
          timeout: this.options.delays.pageNavigationTimeout,
        });
        if (!response || response.status() >= 400) {
          throw new Error(`HTTP Error ${response?.status()} loading page`);
        }
        await this.page.waitForSelector('.job-list-scroll .job-item', {
          timeout: this.options.delays.elementTimeout,
        });
      },
      { maxAttempts: config.RETRY.maxAttempts, taskName: 'Load First Page' }
    );

    await randomDelay(this.options.delays.minActionDelay, this.options.delays.maxActionDelay);

    const meta = await parsePaginationMeta(this.page);
    const listCards = await parseJobList(this.page);

    logger.info(`Found ${listCards.length} jobs on Page ${meta.current_page}`);

    if (!fetchFullDetails) {
      return {
        metadata: meta,
        total_scraped: listCards.length,
        jobs: listCards,
      };
    }

    logger.info('Extracting full details for all jobs on page 1 via DOM interaction...');
    const fullJobs = [];
    const jobCardElements = await this.page.$$('.job-list-scroll .job-item');

    for (let i = 0; i < jobCardElements.length; i++) {
      const cardEl = jobCardElements[i];
      const cardMeta = listCards[i];

      logger.info(`[${i + 1}/${jobCardElements.length}] Loading details for: "${cardMeta.title}"...`);

      try {
        await cardEl.click();
        await this.page.waitForFunction(
          () => {
            const detailTitle = document.querySelector('.job-detail-title');
            return detailTitle && detailTitle.innerText.trim().length > 0;
          },
          { timeout: 5000 }
        );

        await randomDelay(400, 800);
        const detailedJob = await parseJobDetail(this.page);
        const combined = { ...cardMeta, ...detailedJob };
        const normalized = normalizeJobRecord(combined);

        await this.db.upsertJob(normalized);
        fullJobs.push(normalized);
      } catch (err) {
        logger.warn(`Could not extract detail for "${cardMeta.title}": ${err.message}`);
        const normalized = normalizeJobRecord(cardMeta);
        await this.db.upsertJob(normalized);
        fullJobs.push(normalized);
      }
    }

    logger.success(`Finished scraping ${fullJobs.length} jobs from page 1.`);

    return {
      metadata: meta,
      total_scraped: fullJobs.length,
      jobs: fullJobs,
    };
  }

  /**
   * Slowly types text character-by-character into an input to allow debounce/queries to trigger
   * @param {string} selector
   * @param {string} text
   * @param {number} delayPerChar Delay in ms between keystrokes
   */
  async slowType(selector, text, delayPerChar = 180) {
    logger.info(`Focusing input '${selector}' and typing '${text}' slowly...`);
    await this.page.click(selector);

    // Clear existing text if any
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Backspace');

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      await this.page.keyboard.type(char, { delay: delayPerChar });
      // Pause briefly after each letter to let the debounced query fire
      await this.page.waitForTimeout(250);
    }

    // Wait for the final debounced fetch to complete
    await this.page.waitForTimeout(1200);
    logger.success(`Finished slow-typing '${text}'.`);
  }

  /**
   * Searches for a city (typing slowly) and iterates over every specialty to scrape all matching jobs
   * @param {Object} options
   * @param {string} options.city Target city (defaults to 'Toronto')
   * @param {Array<string>} options.specialties Optional subset of specialties to scrape (defaults to all)
   * @param {number} options.delayPerChar Keystroke delay for slow typing (defaults to 180ms)
   * @param {boolean} options.fullDetails Whether to scrape full job detail for each match
   * @returns {Promise<{city: string, total_jobs: number, specialties_scraped: number, jobs: Array<Object>}>}
   */
  async scrapeCityBySpecialties(options = {}) {
    const targetCity = options.city || 'Toronto';
    const delayPerChar = options.delayPerChar || 180;
    const fetchFullDetails = options.fullDetails !== undefined ? options.fullDetails : true;

    await this.init();

    const startUrl = `${config.BASE_URL}/jobs`;
    logger.info(`Navigating to job board: ${startUrl}`);

    await this.page.goto(startUrl, {
      waitUntil: 'networkidle',
      timeout: this.options.delays.pageNavigationTimeout,
    });

    // 1. Slow-type city name
    await this.slowType('#filter-city', targetCity, delayPerChar);

    // 2. Wait for specialties dropdown to be populated by the frontend
    try {
      await this.page.waitForSelector('#filter-specialty option:nth-child(2)', {
        state: 'attached',
        timeout: 8000,
      });
    } catch (e) {
      logger.warn('Specialty options not immediately attached in DOM, proceeding with fallback check...');
    }

    // Retrieve all specialties from the select element (skipping 'All specialties')
    let allSpecialtyOptions = await this.page.$$eval('#filter-specialty option', (opts) =>
      opts
        .map((o) => ({ value: o.value, text: o.innerText.trim() }))
        .filter((o) => o.value !== '' && o.text.toLowerCase() !== 'all specialties')
    );

    // Fallback: If DOM options are not yet populated, fetch from API endpoint directly
    if (allSpecialtyOptions.length === 0) {
      try {
        const axios = require('axios');
        const apiRes = await axios.get('https://api.physiciancareers.ca/jobs/specialties', { timeout: 6000 });
        if (apiRes.data && Array.isArray(apiRes.data.specialties)) {
          allSpecialtyOptions = apiRes.data.specialties.map((s) => ({ value: s, text: s }));
          logger.info(`Loaded ${allSpecialtyOptions.length} specialties via API fallback.`);
        }
      } catch (apiErr) {
        logger.warn(`API fallback for specialties failed: ${apiErr.message}`);
      }
    }

    const targetSpecialties = options.specialties
      ? allSpecialtyOptions.filter(
          (o) =>
            options.specialties.some((s) => s.toLowerCase() === o.value.toLowerCase()) ||
            options.specialties.some((s) => s.toLowerCase() === o.text.toLowerCase())
        )
      : allSpecialtyOptions;

    logger.info(`Found ${targetSpecialties.length} medical specialties to scrape for ${targetCity}.`);

    const allCollectedJobs = [];
    const specialtyStats = [];

    // 3. Iterate through each specialty
    for (let sIdx = 0; sIdx < targetSpecialties.length; sIdx++) {
      const spec = targetSpecialties[sIdx];
      console.log('\n===========================================================');
      logger.info(`[${sIdx + 1}/${targetSpecialties.length}] Filtering Specialty: "${spec.text}" in ${targetCity}...`);

      try {
        // Select specialty from dropdown
        await this.page.selectOption('#filter-specialty', spec.value);

        // Wait for results to update
        await this.page.waitForTimeout(1500);

        // Check result count
        const meta = await parsePaginationMeta(this.page);
        const cardElements = await this.page.$$('.job-list-scroll .job-item');
        const matchCount = cardElements.length;

        logger.info(`Result for "${spec.text}": ${meta.total_jobs_found || matchCount} jobs found (showing ${matchCount} on page 1).`);

        await this.db.updateSpecialtyMeta(spec.text, meta.total_jobs_found || matchCount);

        if (matchCount === 0) {
          logger.info(`No active openings for "${spec.text}" in ${targetCity}. Moving to next specialty.`);
          specialtyStats.push({ specialty: spec.text, jobsFound: 0, jobsScraped: 0 });
          continue;
        }

        // Extract list cards
        const listCards = await parseJobList(this.page);
        const specialtyJobs = [];

        // Scrape jobs for this specialty
        for (let jIdx = 0; jIdx < listCards.length; jIdx++) {
          const cardMeta = listCards[jIdx];
          const cardEl = cardElements[jIdx];

          if (fetchFullDetails && cardEl) {
            try {
              await cardEl.click();
              await this.page.waitForFunction(
                () => {
                  const detailTitle = document.querySelector('.job-detail-title');
                  return detailTitle && detailTitle.innerText.trim().length > 0;
                },
                { timeout: 4000 }
              );

              await randomDelay(300, 700);
              const detailedJob = await parseJobDetail(this.page);
              const combined = { ...cardMeta, ...detailedJob, specialty: spec.text };
              const normalized = normalizeJobRecord(combined);

              await this.db.upsertJob(normalized);
              specialtyJobs.push(normalized);
              allCollectedJobs.push(normalized);

              logger.info(`  -> Scraped: "${normalized.title}" | Salary: ${normalized.annualized_salary ? '$' + normalized.annualized_salary.toLocaleString() : 'FFS/Contract'} | Dist: ${normalized.distance_from_toronto_km} km`);
            } catch (err) {
              logger.warn(`  -> Could not load detail for "${cardMeta.title}": ${err.message}. Using card summary.`);
              const normalized = normalizeJobRecord({ ...cardMeta, specialty: spec.text });
              await this.db.upsertJob(normalized);
              specialtyJobs.push(normalized);
              allCollectedJobs.push(normalized);
            }
          } else {
            const normalized = normalizeJobRecord({ ...cardMeta, specialty: spec.text });
            await this.db.upsertJob(normalized);
            specialtyJobs.push(normalized);
            allCollectedJobs.push(normalized);
          }
        }

        specialtyStats.push({
          specialty: spec.text,
          jobsFound: meta.total_jobs_found || matchCount,
          jobsScraped: specialtyJobs.length,
        });

        // Human-like pause between specialties
        await randomDelay(800, 1600);
      } catch (err) {
        logger.error(`Error processing specialty "${spec.text}": ${err.message}`);
      }
    }

    // Record scraping run
    await this.db.recordRun(targetCity, targetSpecialties.length, allCollectedJobs.length);

    logger.success(`Exploration complete! Total jobs collected across ${targetSpecialties.length} specialties in ${targetCity}: ${allCollectedJobs.length}`);

    // Auto-save exports
    const jsonPath = path.join(config.OUTPUT.dataDir, `${targetCity.toLowerCase()}_specialties_jobs.json`);
    const csvPath = path.join(config.OUTPUT.dataDir, `${targetCity.toLowerCase()}_specialties_jobs.csv`);

    saveJson(jsonPath, {
      city: targetCity,
      total_jobs_scraped: allCollectedJobs.length,
      specialty_breakdown: specialtyStats,
      jobs: allCollectedJobs,
    });
    saveCsv(csvPath, allCollectedJobs);

    // Save standalone Supabase SQL Dump
    this.db.saveSqlDump();

    return {
      city: targetCity,
      total_jobs: allCollectedJobs.length,
      specialties_scraped: targetSpecialties.length,
      specialty_breakdown: specialtyStats,
      jobs: allCollectedJobs,
    };
  }
}

module.exports = PhysicianCareersScraper;
