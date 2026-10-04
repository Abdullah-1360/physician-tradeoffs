/**
 * Seed Verified Active Jobs (48 Jobs) into PostgreSQL & Supabase Dump
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const DatabaseManager = require('./db');
const { logger } = require('./utils');

async function seedActiveJobs() {
  const jsonPath = path.resolve(__dirname, '../data/toronto_specialties_jobs.json');
  if (!fs.existsSync(jsonPath)) {
    logger.error(`File not found: ${jsonPath}`);
    return;
  }

  const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const activeJobs = raw.jobs || [];
  logger.info(`Loaded ${activeJobs.length} active verified jobs from JSON.`);

  const db = new DatabaseManager();
  await db.init();

  if (db.isConnected && db.pool) {
    logger.info('Clearing old expired job listings from PostgreSQL...');
    await db.pool.query('DELETE FROM jobs');
    logger.success('Database pruned of old records.');
  }

  logger.info(`Upserting ${activeJobs.length} active verified jobs...`);
  for (const job of activeJobs) {
    await db.upsertJob(job);
  }

  // Calculate specialty counts
  const specCounts = {};
  for (const job of activeJobs) {
    const s = job.specialty || 'General Practice';
    specCounts[s] = (specCounts[s] || 0) + 1;
  }

  for (const [spec, count] of Object.entries(specCounts)) {
    await db.updateSpecialtyMeta(spec, count);
  }

  await db.close();
  logger.success(`Successfully seeded ${activeJobs.length} active jobs into PostgreSQL & updated data/supabase_dump.sql!`);
}

seedActiveJobs().catch((err) => {
  logger.error(`Error seeding database: ${err.message}`);
  process.exit(1);
});
