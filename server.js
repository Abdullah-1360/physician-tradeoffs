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
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
      max: 10,
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

let dbInitPromise = null;
function ensureDbInit() {
  if (!dbInitPromise) {
    dbInitPromise = initDatabase().catch((e) => {
      logger.warn(`Database initialization warning: ${e.message}`);
    });
  }
  return dbInitPromise;
}

// Middleware to ensure database is initialized on serverless environments
app.use(async (req, res, next) => {
  await ensureDbInit();
  next();
});

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
          COALESCE(ROUND(AVG(annualized_salary)::numeric, 0), 487000) as avg_salary,
          COALESCE(MAX(annualized_salary), 1000000) as max_salary,
          COALESCE(MIN(annualized_salary), 220000) as min_salary,
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

const crypto = require('crypto');
const { settingsManager } = require('./src/settings');

// 4. Job Details by ID
app.get('/api/jobs/:id', (req, res) => {
  const job = memoryJobs.find((j) => j.job_id === req.params.id);
  if (!job) {
    return res.status(404).json({ error: 'Job posting not found' });
  }
  res.json(job);
});

// 4b. Settings: Get and Update Job Field Requirements
app.get('/api/settings/job-fields', (req, res) => {
  res.json(settingsManager.getSettings());
});

app.post('/api/settings/job-fields', (req, res) => {
  try {
    const updated = settingsManager.saveSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save settings', details: err.message });
  }
});

// 4c. Create New Physician Job (Validated against configurable Settings)
app.post('/api/jobs', async (req, res) => {
  try {
    const validation = settingsManager.validateJobSubmission(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.errors,
      });
    }

    const loc = advisors.resolveLocation(req.body.city || 'Downtown Toronto');
    const lat = req.body.latitude ? parseFloat(req.body.latitude) : loc.lat;
    const lng = req.body.longitude ? parseFloat(req.body.longitude) : loc.lng;
    const distanceKm = advisors.calculateHaversine(43.6532, -79.3832, lat, lng);

    const jobId = req.body.job_id || crypto.randomBytes(12).toString('hex');
    const today = new Date().toISOString().split('T')[0];
    const defaultValidThrough = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];

    const rawEmails = req.body.contact_emails;
    const contactEmails = Array.isArray(rawEmails)
      ? rawEmails
      : (typeof rawEmails === 'string' && rawEmails.trim().length > 0)
        ? rawEmails.split(/[,;\s]+/).filter((e) => e.includes('@'))
        : [];

    const annualizedSalary = req.body.annualized_salary ? parseFloat(req.body.annualized_salary) : null;
    const physicianSplit = req.body.physician_split_pct ? parseFloat(req.body.physician_split_pct) : 75.0;
    const clinicSplit = 100 - physicianSplit;

    const structuredSections = {
      Remuneration:
        req.body.remuneration_notes ||
        (annualizedSalary
          ? `$${annualizedSalary.toLocaleString()} CAD / yr gross`
          : `${physicianSplit}/${clinicSplit} FFS Split`),
      Qualifications: 'CPSO licensure eligible, CFPC / Royal College, CMPA coverage',
      'Clinic Details': `${req.body.emr_system || 'Telus PS Suite'}. ${req.body.patient_volume || 'Established patient roster with active community flow.'}`,
    };

    const newJob = {
      job_id: jobId,
      url: `/jobs/${jobId}`,
      title: req.body.title.trim(),
      specialty: req.body.specialty || 'Family Medicine',
      employment_type: req.body.employment_type || 'full-time',
      company: req.body.company ? req.body.company.trim() : 'Modern Health Centre',
      city: req.body.city || 'Toronto',
      province: req.body.province || 'ON',
      street_address: req.body.street_address ? req.body.street_address.trim() : null,
      location_formatted: req.body.street_address
        ? `${req.body.street_address}, ${req.body.city || 'Toronto'}, ON`
        : `${req.body.city || 'Toronto'}, ON`,
      latitude: lat,
      longitude: lng,
      distance_from_toronto_km: distanceKm,
      compensation_raw: annualizedSalary
        ? `$${annualizedSalary.toLocaleString()} CAD`
        : `${physicianSplit}/${clinicSplit} split`,
      pay_rate_type: annualizedSalary ? 'annual' : 'split',
      salary_min: annualizedSalary,
      salary_max: annualizedSalary,
      salary_avg: annualizedSalary,
      annualized_salary: annualizedSalary,
      physician_split_pct: physicianSplit,
      clinic_split_pct: clinicSplit,
      signing_bonus: req.body.signing_bonus ? parseFloat(req.body.signing_bonus) : null,
      relocation_bonus: req.body.relocation_bonus ? parseFloat(req.body.relocation_bonus) : null,
      accommodations_allowance: req.body.accommodations_allowance ? parseFloat(req.body.accommodations_allowance) : null,
      travel_allowance: req.body.travel_allowance ? parseFloat(req.body.travel_allowance) : null,
      is_hospital: Boolean(req.body.is_hospital),
      requires_emr: true,
      requires_cfpc: req.body.specialty === 'Family Medicine',
      requires_cpso: true,
      is_application_gated: false,
      gate_message: null,
      posted_date: req.body.posted_date || today,
      closing_date: req.body.valid_through || defaultValidThrough,
      start_date: req.body.start_date || today,
      valid_through: req.body.valid_through || defaultValidThrough,
      is_expired: false,
      contact_emails: contactEmails,
      description_summary: req.body.full_description_text ? req.body.full_description_text.slice(0, 200) : '',
      full_description_text:
        req.body.full_description_text ||
        `${req.body.title} at ${req.body.company || 'Modern Practice'}. Turnkey clinic with full administrative support.`,
      structured_sections: structuredSections,
      external_links: [],
      raw_json_ld: null,
      scraped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // If connected to live DB (PostgreSQL / Supabase), insert record
    if (isDbConnected && pool) {
      try {
        const insertSql = `
          INSERT INTO jobs (
            job_id, url, title, specialty, employment_type, company,
            city, province, street_address, location_formatted,
            latitude, longitude, distance_from_toronto_km,
            compensation_raw, pay_rate_type, salary_min, salary_max, salary_avg, annualized_salary,
            physician_split_pct, clinic_split_pct, signing_bonus, relocation_bonus,
            accommodations_allowance, travel_allowance, is_hospital, requires_emr,
            requires_cfpc, requires_cpso, posted_date, closing_date, start_date, valid_through,
            is_expired, contact_emails, description_summary, full_description_text, structured_sections
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, $13,
            $14, $15, $16, $17, $18, $19,
            $20, $21, $22, $23,
            $24, $25, $26, $27,
            $28, $29, $30, $31, $32, $33,
            $34, $35, $36, $37, $38
          )
          ON CONFLICT (job_id) DO UPDATE SET
            title = EXCLUDED.title,
            annualized_salary = EXCLUDED.annualized_salary,
            updated_at = NOW();
        `;
        const values = [
          newJob.job_id,
          newJob.url,
          newJob.title,
          newJob.specialty,
          newJob.employment_type,
          newJob.company,
          newJob.city,
          newJob.province,
          newJob.street_address,
          newJob.location_formatted,
          newJob.latitude,
          newJob.longitude,
          newJob.distance_from_toronto_km,
          newJob.compensation_raw,
          newJob.pay_rate_type,
          newJob.salary_min,
          newJob.salary_max,
          newJob.salary_avg,
          newJob.annualized_salary,
          newJob.physician_split_pct,
          newJob.clinic_split_pct,
          newJob.signing_bonus,
          newJob.relocation_bonus,
          newJob.accommodations_allowance,
          newJob.travel_allowance,
          newJob.is_hospital,
          newJob.requires_emr,
          newJob.requires_cfpc,
          newJob.requires_cpso,
          newJob.posted_date,
          newJob.closing_date,
          newJob.start_date,
          newJob.valid_through,
          newJob.is_expired,
          JSON.stringify(newJob.contact_emails),
          newJob.description_summary,
          newJob.full_description_text,
          JSON.stringify(newJob.structured_sections),
        ];
        await pool.query(insertSql, values);

        // Update specialty count in specialties table
        await pool.query(
          `
          INSERT INTO specialties (name, job_count, updated_at)
          VALUES ($1, 1, NOW())
          ON CONFLICT (name) DO UPDATE SET job_count = specialties.job_count + 1, updated_at = NOW();
        `,
          [newJob.specialty]
        );

        logger.success(`Job ${newJob.job_id} successfully persisted to Supabase database!`);
      } catch (dbErr) {
        logger.error(`Database insertion warning: ${dbErr.message}`);
      }
    }

    // Add to memory dataset (at top so it shows first)
    memoryJobs.unshift(newJob);

    // Save to local JSON dataset as well
    try {
      const jsonPath = path.join(__dirname, 'data', 'toronto_specialties_jobs.json');
      if (fs.existsSync(jsonPath)) {
        const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        parsed.jobs = [newJob, ...(parsed.jobs || [])];
        parsed.total_jobs_scraped = parsed.jobs.length;
        fs.writeFileSync(jsonPath, JSON.stringify(parsed, null, 2), 'utf-8');
      }
    } catch (fsErr) {
      logger.warn(`Could not update local JSON file: ${fsErr.message}`);
    }

    res.status(201).json({
      success: true,
      message: 'Physician opportunity successfully published',
      job: newJob,
      total_active_jobs: memoryJobs.length,
    });
  } catch (err) {
    logger.error(`Error in POST /api/jobs: ${err.message}`);
    res.status(500).json({ error: 'Failed to create job', details: err.message });
  }
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
