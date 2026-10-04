const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const TEST_JOB_IDS = [
  'efc18e1b905182ca56b548b7',
  'c362bc6ab50e3e0e5e697ea9',
  '8041394da8691020b9c9d393',
  '1746b2b6f6c6dc70da3b535c',
  'fecd9246a9a09cc2abea04a3'
];

async function cleanTestJobs() {
  console.log('1. Cleaning test jobs from local JSON fallback file...');
  const jsonPath = path.resolve(__dirname, '../data/toronto_specialties_jobs.json');
  if (fs.existsSync(jsonPath)) {
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const beforeCount = (data.jobs || []).length;
    data.jobs = (data.jobs || []).filter(j => !TEST_JOB_IDS.includes(j.job_id));
    const manualCount = data.jobs.filter(j => j.is_manual === true).length;
    const scrapedCount = data.jobs.filter(j => j.is_manual !== true).length;
    data.total_active_jobs = data.jobs.length;
    data.manual_jobs_count = manualCount;
    data.scraped_jobs_count = scrapedCount;
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Local JSON cleaned: Removed ${beforeCount - data.jobs.length} test jobs. Total remaining: ${data.jobs.length} (${manualCount} manual, ${scrapedCount} scraped)`);
  }

  console.log('\n2. Cleaning test jobs from Supabase PostgreSQL...');
  if (!process.env.DATABASE_URL) {
    console.log('No DATABASE_URL found in environment.');
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    for (const testId of TEST_JOB_IDS) {
      const res = await pool.query('DELETE FROM jobs WHERE job_id = $1;', [testId]);
      if (res.rowCount > 0) {
        console.log(`Deleted test job from DB: ${testId}`);
      }
    }

    const countRes = await pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_manual = TRUE) as manual, COUNT(*) FILTER (WHERE is_manual IS NOT TRUE) as scraped FROM jobs;');
    console.log('Database state after cleanup:', countRes.rows[0]);
  } catch (err) {
    console.error('Error cleaning database:', err.message);
  } finally {
    await pool.end();
  }
}

cleanTestJobs();
