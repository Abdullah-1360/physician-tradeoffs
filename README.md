# PhysicianCareers.ca Industry-Grade Playwright Scraper & ML Pipeline

A self-contained, stealth-enabled web scraper and geospatial machine learning pipeline built with Node.js, Playwright, PostgreSQL / Supabase, and CatBoost/XGBoost.

---

## 🚀 Key Features

### 1. Toronto City & Multi-Specialty Automation
- **Human-like Slow Typing**: Types `"Toronto"` into the `#filter-city` input character-by-character (with configurable keystroke delays and debounce waits) to match the Next.js SPA dynamic search behavior.
- **Full Specialty Loop**: Iterates through all 30 medical specialties (skipping `"All specialties"`):
  - *Anaesthesiology, Dermatology, Emergency Medicine, Family Medicine, Internal Medicine, Pediatrics, Psychiatry, General Surgery, Orthopaedic Surgery, etc.*
- **Deep Detail Scraper**: Clicks each job listing card in the master-detail view, waits for the detail DOM, extracts rich data, and computes ML features.

### 2. PostgreSQL & Supabase Architecture (No SQLite)
- **Direct PostgreSQL Connection**: Connects to any local PostgreSQL instance or remote Supabase database via standard connection string (`DATABASE_URL`).
- **Complete Supabase SQL Dump**: Automatically produces a standalone, 100% valid SQL file (`data/supabase_dump.sql`) containing:
  - Table schemas (`jobs`, `specialties`, `scraping_runs`)
  - B-tree and partial performance indexes
  - Analytical View `v_ml_salary_dataset` formatted for ML training
  - SQL Distance and salary calculation functions (`calculate_distance_km()`, `get_salary_by_distance()`)
  - All `INSERT ... ON CONFLICT (job_id) DO UPDATE` statements with JSONB support.
  - Can be pasted directly into the **Supabase SQL Editor** or executed via `psql`.

### 3. CatBoost & XGBoost Salary Trade-off Engine
- Answers distance-based compensation questions:
  > *"If the salary for Family Medicine at Location A (Downtown, 0 km) is $250k, what is the expected compensation 50 km outward?"*
- Features engineered:
  - Exact Haversine distance in kilometers from Downtown Toronto (Lat 43.6532, Lng -79.3832) using GTA municipality and postal code FSA mapping (Downtown, Midtown, North York, Markham, Mississauga, Brampton, Oakville, etc.).
  - Normalized annualized salaries from hourly rates ($/hr × 2,000h) and daily minimums ($/day × 220d).
  - Practice traits (Hospital vs. Clinic, EMR requirements, CPSO/CFPC, Overhead splits).
- Native categorical feature handling in CatBoost and XGBoost with Scikit-Learn and Pure-NumPy fallbacks.

---

## 📁 Directory Structure

```
physicians_project/
├── index.js               # CLI runner supporting --mode city, single, and page1
├── ml_salary_advisor.py   # CatBoost / XGBoost geospatial salary recommendation engine
├── package.json           # Node.js dependencies (pg, playwright, playwright-extra)
├── sql/
│   └── schema.sql         # Production PostgreSQL / Supabase DDL schema & functions
├── src/
│   ├── config.js          # Centralized configuration & path resolver
│   ├── db.js              # PostgreSQL pool manager & Supabase SQL dump generator
│   ├── normalizer.js      # Compensation normalization & Haversine distance resolver
│   ├── parser.js          # DOM selectors, JSON-LD extractor, and section parser
│   ├── scraper.js         # Core Playwright automation & slow-typing orchestrator
│   ├── stealth.js         # Stealth browser context with anti-fingerprinting
│   └── utils.js           # Logger, export helpers (JSON/CSV), delays, retries
└── data/                  # Generated datasets and SQL migrations
    ├── supabase_dump.sql  # Complete Supabase-ready SQL migration & seed script
    ├── toronto_specialties_jobs.json
    └── toronto_specialties_jobs.csv
```

---

## 🛠️ Usage Instructions

### 1. Scrape Toronto Across Specialties

```bash
# Scrape all 30 specialties in Toronto (slow-types Toronto, iterates through all specialties):
node index.js --mode city --city Toronto

# Scrape a specific subset of specialties:
node index.js --mode city --city Toronto --specialties "Family Medicine,Dermatology,Emergency Medicine"

# Fast summary mode (scrapes listing cards without clicking into every single detail):
node index.js --mode city --city Toronto --summary-only
```

### 2. Connect to PostgreSQL or Supabase

To connect directly to your database, set the `DATABASE_URL` environment variable:

```bash
# In your .env file or command line:
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-REF].supabase.co:5432/postgres" node index.js --mode city --city Toronto
```

Alternatively, use the auto-generated SQL dump:
1. Open your **Supabase Dashboard** -> **SQL Editor**.
2. Copy and paste the contents of [`data/supabase_dump.sql`](./data/supabase_dump.sql).
3. Click **Run**. All tables, indexes, views, and jobs are instantly loaded.

### 3. Run the CatBoost / XGBoost Salary Advisor

Query distance trade-offs for any medical specialty:

```bash
# Predict salary difference for Pediatrics moving 25 km outward:
python3 ml_salary_advisor.py --specialty "Pediatrics" --from-km 0 --to-km 25

# Predict salary difference for Internal Medicine moving 20 km outward:
python3 ml_salary_advisor.py --specialty "Internal Medicine" --from-km 0 --to-km 20

# Predict salary difference for Family Medicine moving 50 km outward:
python3 ml_salary_advisor.py --specialty "Family Medicine" --from-km 0 --to-km 50
```

Sample output:
```
=================================================================
   🎯 GEOSPATIAL SALARY TRADE-OFF ADVISOR
=================================================================
Medical Specialty:    Pediatrics
Practice Type:        full-time
-----------------------------------------------------------------
📍 Location A (0.0 km from Downtown):  $558,678.65 CAD / year
📍 Location B (25.0 km from Downtown): $858,668.77 CAD / year
-----------------------------------------------------------------
💰 Salary Difference:    +$299,990.12 CAD (+53.7%)
📈 Premium Per KM:       +$11,999.60 CAD per km
=================================================================
💡 Recommendation: Moving 25 km outward provides an estimated +53.7%
   higher gross annual income (+$299,990 CAD). Regional incentives often apply.
=================================================================
```

---

## 📊 Database Schema Summary

| Table / View | Description |
|---|---|
| `jobs` | Master table of all scraped positions with normalized compensation, coordinates, and distances |
| `specialties` | Aggregated statistics per medical specialty |
| `scraping_runs` | Execution history tracking runs, cities, and counts |
| `v_ml_salary_dataset` | Clean analytical view filtering valid salary targets for CatBoost/XGBoost |
| `calculate_distance_km()` | Built-in Haversine geospatial calculation function in PostgreSQL |
| `get_salary_by_distance()` | Built-in aggregation function for distance-band salary comparisons |
