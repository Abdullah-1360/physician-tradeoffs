#!/usr/bin/env node

/**
 * PhysicianCareers.ca Playwright Scraper CLI & Main Entrypoint
 * Supports Single Job, First Page, and Multi-Specialty City Exploration
 */

const PhysicianCareersScraper = require('./src/scraper');
const { logger, saveJson, saveCsv } = require('./src/utils');
const config = require('./src/config');
const path = require('path');
require('dotenv').config();

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: 'single', // 'single', 'page1', or 'city'
    url: config.TARGET_URL,
    city: 'Toronto',
    specialties: null,
    headless: true,
    fullDetails: true,
    delayPerChar: 180,
    databaseUrl: process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || null,
    jsonOutput: null,
    csvOutput: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === '--mode' || arg === '-m') && args[i + 1]) {
      options.mode = args[++i].toLowerCase();
    } else if (arg === '--city' && args[i + 1]) {
      options.city = args[++i];
      if (options.mode === 'single') options.mode = 'city';
    } else if (arg === '--toronto') {
      options.mode = 'city';
      options.city = 'Toronto';
    } else if (arg === '--specialties' && args[i + 1]) {
      options.specialties = args[++i].split(',').map((s) => s.trim());
    } else if (arg === '--url' && args[i + 1]) {
      options.url = args[++i];
    } else if (arg === '--headless') {
      const val = args[i + 1];
      if (val === 'false') {
        options.headless = false;
        i++;
      } else if (val === 'true') {
        options.headless = true;
        i++;
      }
    } else if (arg === '--headful') {
      options.headless = false;
    } else if (arg === '--summary-only') {
      options.fullDetails = false;
    } else if (arg === '--delay-char' && args[i + 1]) {
      options.delayPerChar = parseInt(args[++i], 10) || 180;
    } else if (arg === '--db' && args[i + 1]) {
      options.databaseUrl = args[++i];
    } else if (arg === '--json' && args[i + 1]) {
      options.jsonOutput = args[++i];
    } else if (arg === '--csv' && args[i + 1]) {
      options.csvOutput = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
\x1b[1mPhysicianCareers.ca Industry-Grade Playwright Scraper & ML Data Pipeline\x1b[0m

Usage:
  node index.js [options]

Modes:
  --mode city / --toronto     Scrapes Toronto by slowly typing 'Toronto' into the city filter
                              and iterating through every medical specialty.
  --mode page1                Scrapes the first page of the default job board.
  --mode single (default)     Scrapes a specific single job posting URL.

Options:
  --city <name>               City to search for (default: 'Toronto')
  --specialties <list>        Comma-separated list of specialties to scrape (default: all 30 specialties)
  --delay-char <ms>           Typing delay per character for city input (default: 180ms)
  --summary-only              Scrapes listing cards only without clicking into details (fast mode)
  --db <url>                  PostgreSQL / Supabase connection string (or use DATABASE_URL env var)
  --headful                   Run browser with visible UI
  --headless <true|false>     Run headless (default: true)
  --json <filepath>           Custom output path for JSON export
  --csv <filepath>            Custom output path for CSV export
  -h, --help                  Show this help message

Examples:
  # Scrape Toronto for all specialties (slow-types Toronto, saves to PostgreSQL/Supabase & SQL dump):
  node index.js --mode city --city Toronto

  # Quick test: Scrape Toronto for Family Medicine and Dermatology only:
  node index.js --mode city --city Toronto --specialties "Family Medicine,Dermatology"

  # Scrape single job detail:
  node index.js --mode single
`);
}

async function run() {
  const options = parseArgs();

  console.log('\n===========================================================');
  console.log('   🩺 PhysicianCareers.ca Scraper & Supabase/ML Pipeline');
  console.log('===========================================================');
  logger.info(`Mode: ${options.mode.toUpperCase()}`);
  logger.info(`Target City: ${options.city}`);
  logger.info(`Headless: ${options.headless}`);
  if (options.databaseUrl) {
    logger.info(`PostgreSQL / Supabase Target: Connected via DATABASE_URL`);
  } else {
    logger.info(`Database Target: Supabase SQL Dump Mode (data/supabase_dump.sql)`);
  }

  const scraper = new PhysicianCareersScraper({
    headless: options.headless,
    dbOptions: {
      connectionString: options.databaseUrl,
    },
  });

  try {
    if (options.mode === 'city' || options.mode === 'toronto') {
      logger.info(`Beginning Toronto exploration across medical specialties...`);
      const result = await scraper.scrapeCityBySpecialties({
        city: options.city,
        specialties: options.specialties,
        delayPerChar: options.delayPerChar,
        fullDetails: options.fullDetails,
      });

      console.log('\n-----------------------------------------------------------');
      logger.success(`🎉 Completed! Scraped ${result.total_jobs} total jobs across ${result.specialties_scraped} specialties in ${options.city}.`);
      console.log('-----------------------------------------------------------');
      console.log('Specialty Breakdown:');
      for (const stat of result.specialty_breakdown) {
        console.log(`  - ${stat.specialty.padEnd(35)} : ${stat.jobsScraped} scraped (${stat.jobsFound} found)`);
      }
      console.log('-----------------------------------------------------------\n');
      logger.success(`SQL Dump for Supabase saved to: ./data/supabase_dump.sql`);
      logger.success(`JSON dataset saved to: ./data/${options.city.toLowerCase()}_specialties_jobs.json`);
      logger.success(`CSV dataset saved to: ./data/${options.city.toLowerCase()}_specialties_jobs.csv`);
    } else if (options.mode === 'single') {
      const result = await scraper.scrapeJob(options.url);
      const job = result.job;

      console.log('\n-----------------------------------------------------------');
      console.log(`📌 Title:          ${job.title}`);
      console.log(`🏢 Company:        ${job.company}`);
      console.log(`📍 Location:       ${job.location_formatted}`);
      console.log(`🏷️  Specialty:      ${job.specialty}`);
      console.log(`💼 Type:           ${job.employment_type}`);
      console.log(`💰 Annual Salary:  ${job.annualized_salary ? '$' + job.annualized_salary.toLocaleString() + ' CAD' : 'FFS / Contract'}`);
      console.log(`📏 Distance:       ${job.distance_from_toronto_km} km from Downtown Toronto`);
      console.log(`📅 Posted:         ${job.posted_date || 'N/A'}`);
      console.log(`⏳ Closing Date:   ${job.closing_date || 'N/A'}`);
      console.log(`🔒 App Gate:       ${job.is_application_gated ? 'Gated (' + job.gate_message + ')' : 'Open'}`);
      console.log('-----------------------------------------------------------\n');

      const jsonFile = options.jsonOutput || config.OUTPUT.defaultJsonFile;
      const csvFile = options.csvOutput || config.OUTPUT.defaultCsvFile;

      saveJson(jsonFile, result);
      saveCsv(csvFile, [job]);

      logger.success('Job scraping completed successfully!');
    } else if (options.mode === 'page1') {
      const result = await scraper.scrapeFirstPage({
        url: options.url,
        fullDetails: options.fullDetails,
      });

      console.log('\n-----------------------------------------------------------');
      logger.success(`Scraped ${result.total_scraped} jobs from first page!`);
      console.log(`Total jobs on platform: ${result.metadata.total_jobs_found || 'Unknown'}`);
      console.log(`Current page: ${result.metadata.current_page} of ${result.metadata.total_pages}`);
      console.log('-----------------------------------------------------------\n');

      const jsonFile = options.jsonOutput || config.OUTPUT.page1JsonFile;
      const csvFile = options.csvOutput || config.OUTPUT.page1CsvFile;

      saveJson(jsonFile, result);
      saveCsv(csvFile, result.jobs);

      logger.success('First page scraping completed successfully!');
    } else {
      logger.error(`Unknown mode: ${options.mode}. Available modes: city, single, page1.`);
      process.exit(1);
    }
  } catch (err) {
    logger.error('Scraping error:', err.message);
    if (process.env.DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    await scraper.close();
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  PhysicianCareersScraper,
  run,
};
