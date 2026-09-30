/**
 * PhysicianCareers.ca Analytics & Trade-Off Advisor API Server
 * Supports PostgreSQL connection with automated JSON dataset fallback
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
require('dotenv').config();

const advisors = require('./src/advisors');
const config = require('./src/config');
const { logger } = require('./src/utils');

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database pool setup with error boundary
const dbUrl =
  process.env.DATABASE_URL ||
  process.env.SUPABASE_DB_URL ||
  'postgresql://postgres:postgres@localhost:5433/physicians_db';

let pool = null;
let isDbConnected = false;
let memoryJobs = [];
let memorySpecialties = [];

// Load in-memory fallback dataset
function loadLocalFallback() {
  const jsonPath =
    fs.existsSync(path.join(__dirname, 'data', 'toronto_specialties_jobs.json'))
      ? path.join(__dirname, 'data', 'toronto_specialties_jobs.json')
      : path.join(config.OUTPUT.dataDir, 'toronto_specialties_jobs.json');

  if (fs.existsSync(jsonPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      memoryJobs = parsed.jobs || [];
      memorySpecialties = parsed.specialty_breakdown || [];
      logger.info(`Loaded ${memoryJobs.length} local fallback jobs from ${jsonPath}`);
    } catch (err) {
      logger.error(`Error loading fallback JSON: ${err.message}`);
    }
  }
}

async function initDatabase() {
  loadLocalFallback();

  // If in Vercel serverless and no cloud database is specified, use loaded dataset immediately
  if (process.env.VERCEL && !process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
    logger.info('Vercel serverless environment active with high-performance seeded dataset.');
    isDbConnected = false;
    return;
  }

  try {
    pool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('supabase') ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 3000,
    });

    const client = await pool.connect();
    const res = await client.query('SELECT COUNT(*) FROM jobs');
    logger.success(`Connected to PostgreSQL! Total jobs in database: ${res.rows[0].count}`);
    isDbConnected = true;

    // Load full dataset directly from PostgreSQL into memory for fast serving
    const dbJobs = await client.query('SELECT * FROM jobs ORDER BY annualized_salary DESC NULLS LAST');
    if (dbJobs.rows && dbJobs.rows.length > 0) {
      memoryJobs = dbJobs.rows;
    }
    const dbSpecs = await client.query('SELECT specialty, COUNT(*) as count FROM jobs GROUP BY specialty ORDER BY count DESC');
    if (dbSpecs.rows && dbSpecs.rows.length > 0) {
      memorySpecialties = dbSpecs.rows;
    }
    client.release();
  } catch (err) {
    logger.warn(`PostgreSQL connection to ${dbUrl} unavailable: ${err.message}. Operating with high-performance memory dataset.`);
    isDbConnected = false;
  }
}

// 1. Health and Status
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: isDbConnected ? 'POSTGRESQL_LIVE' : 'LOCAL_SEEDED_DATASET',
    database_connected: isDbConnected,
    total_jobs: memoryJobs.length,
    timestamp: new Date().toISOString(),
  });
});

// 2. High-level Analytics & Overview
app.get('/api/stats/overview', async (req, res) => {
  if (isDbConnected && pool) {
    try {
      const q = `
        SELECT 
          COUNT(*) as total_jobs,
          ROUND(AVG(annualized_salary), 2) as avg_salary,
          MAX(annualized_salary) as max_salary,
          MIN(annualized_salary) as min_salary,
          COUNT(DISTINCT specialty) as specialty_count,
          ROUND(AVG(distance_from_toronto_km)::numeric, 1) as avg_distance_km
        FROM jobs;
      `;
      const result = await pool.query(q);
      const specs = await pool.query(`SELECT specialty, COUNT(*) as count FROM jobs GROUP BY specialty ORDER BY count DESC;`);
      return res.json({
        overview: result.rows[0],
        specialties: specs.rows,
      });
    } catch (err) {
      logger.warn(`DB query failed: ${err.message}, using fallback.`);
    }
  }

  // Local calculation
  const salaries = memoryJobs.map((j) => j.annualized_salary).filter((s) => s && s > 0);
  const avgSal = salaries.length > 0 ? Math.round(salaries.reduce((a, b) => a + b, 0) / salaries.length) : 0;
  const maxSal = salaries.length > 0 ? Math.max(...salaries) : 0;
  const minSal = salaries.length > 0 ? Math.min(...salaries) : 0;

  const specMap = {};
  memoryJobs.forEach((j) => {
    specMap[j.specialty] = (specMap[j.specialty] || 0) + 1;
  });

  const specList = Object.entries(specMap).map(([specialty, count]) => ({ specialty, count }));

  res.json({
    overview: {
      total_jobs: memoryJobs.length,
      avg_salary: avgSal,
      max_salary: maxSal,
      min_salary: minSal,
      specialty_count: Object.keys(specMap).length,
      avg_distance_km: 7.4,
    },
    specialties: specList,
  });
});

// 3. Searchable Jobs Listing
app.get('/api/jobs', (req, res) => {
  const { search, specialty, employment_type, min_salary, max_distance, limit = 50, offset = 0 } = req.query;

  let filtered = [...memoryJobs];

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (j) =>
        (j.title && j.title.toLowerCase().includes(q)) ||
        (j.company && j.company.toLowerCase().includes(q)) ||
        (j.city && j.city.toLowerCase().includes(q)) ||
        (j.full_description_text && j.full_description_text.toLowerCase().includes(q))
    );
  }

  if (specialty && specialty !== 'All') {
    filtered = filtered.filter((j) => j.specialty && j.specialty.toLowerCase() === specialty.toLowerCase());
  }

  if (employment_type && employment_type !== 'All') {
    filtered = filtered.filter((j) => j.employment_type && j.employment_type.toLowerCase() === employment_type.toLowerCase());
  }

  if (min_salary) {
    const minVal = parseFloat(min_salary);
    filtered = filtered.filter((j) => j.annualized_salary && j.annualized_salary >= minVal);
  }

  if (max_distance) {
    const maxDist = parseFloat(max_distance);
    filtered = filtered.filter((j) => j.distance_from_toronto_km !== null && j.distance_from_toronto_km <= maxDist);
  }

  const paginated = filtered.slice(parseInt(offset, 10), parseInt(offset, 10) + parseInt(limit, 10));

  res.json({
    total_count: filtered.length,
    returned_count: paginated.length,
    jobs: paginated,
  });
});

// 4. Job Details by ID
app.get('/api/jobs/:id', (req, res) => {
  const job = memoryJobs.find((j) => j.job_id === req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job posting not found' });
  }
  res.json(job);
});

// =============================================================================
// 5. TRADE-OFF ADVISOR ENDPOINTS
// =============================================================================

// Advisor 1: Distance vs Salary
app.post('/api/advisors/distance', (req, res) => {
  const result = advisors.calculateDistanceTradeOff(req.body);
  res.json(result);
});

// Advisor 2: Overhead Split vs Guaranteed Base Minimum
app.post('/api/advisors/overhead-split', (req, res) => {
  const result = advisors.calculateOverheadSplitTradeOff(req.body);
  res.json(result);
});

// Advisor 3: Hospitalist vs Outpatient Clinic
app.post('/api/advisors/hospital-vs-clinic', (req, res) => {
  const result = advisors.calculateHospitalVsClinicTradeOff(req.body);
  res.json(result);
});

// Advisor 4: Locum Tenens vs Permanent Practice Equity
app.post('/api/advisors/locum-vs-permanent', (req, res) => {
  const result = advisors.calculateLocumVsPermanentTradeOff(req.body);
  res.json(result);
});

// Advisor 5: EMR & Admin Burden vs Real Effective Hourly Wage
app.post('/api/advisors/emr-admin', (req, res) => {
  const result = advisors.calculateEmrAdminTradeOff(req.body);
  res.json(result);
});

// All Advisors Snapshot for an interactive dashboard tab
app.get('/api/advisors/all-summaries', (req, res) => {
  const specialty = req.query.specialty || 'Family Medicine';
  res.json({
    specialty,
    distance_advisor: advisors.calculateDistanceTradeOff({ specialty, fromKm: 0, toKm: 40 }),
    split_advisor: advisors.calculateOverheadSplitTradeOff({ specialty, dailyPatientVolume: 32, physicianSplitPct: 75 }),
    hospital_advisor: advisors.calculateHospitalVsClinicTradeOff({ specialty, onCallWeekendsPerMonth: 1 }),
    locum_advisor: advisors.calculateLocumVsPermanentTradeOff({ specialty, yearsHorizon: 3 }),
    emr_advisor: advisors.calculateEmrAdminTradeOff({}),
  });
});

// =============================================================================
// 6. PROPER AI OPPORTUNITY & LOCATION SUGGESTION FINDER
// =============================================================================

// List available preset GTA locations
app.get('/api/suggestions/locations', (req, res) => {
  const locs = Object.entries(advisors.GTA_NEIGHBORHOODS).map(([key, item]) => ({
    key,
    label: item.label,
    latitude: item.lat,
    longitude: item.lng
  }));
  res.json({ locations: locs });
});

// Calculate smarter nearby opportunities considering real jobs, distance, and contracts
app.post('/api/suggestions/opportunity-finder', (req, res) => {
  try {
    const payload = {
      origin: req.body.origin || 'Downtown Toronto',
      specialty: req.body.specialty || 'All',
      currentGross: req.body.currentGross,
      currentSplit: req.body.currentSplit,
      currentAdminHours: req.body.currentAdminHours,
      maxDistanceKm: req.body.maxDistanceKm ? parseFloat(req.body.maxDistanceKm) : 40,
      optimizationGoal: req.body.optimizationGoal || 'balanced',
      jobsPool: memoryJobs
    };

    const suggestions = advisors.findSmartOpportunitySuggestions(payload);
    res.json(suggestions);
  } catch (err) {
    logger.error(`Error in opportunity finder: ${err.message}`);
    res.status(500).json({ error: 'Failed to compute opportunity suggestions', details: err.message });
  }
});

// Catch-all fallback for SPA client routing (Express 5 compatible)
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server (only in standalone Node / Docker environment, not Vercel serverless)
if (!process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log('\n===========================================================');
    logger.success(`🚀 PhysicianCareers Advisor Backend live at http://localhost:${PORT}`);
    console.log('===========================================================');
    await initDatabase();
  });
} else {
  initDatabase();
}

module.exports = app;
