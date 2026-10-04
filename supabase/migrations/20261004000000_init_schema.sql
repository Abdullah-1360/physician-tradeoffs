-- ==============================================================================
-- PhysicianCareers.ca - PostgreSQL & Supabase Database Schema
-- Optimized for Geospatial Salary Analytics & CatBoost/XGBoost Machine Learning
-- ==============================================================================

-- 1. Scraping execution log table
CREATE TABLE IF NOT EXISTS scraping_runs (
    run_id SERIAL PRIMARY KEY,
    target_city VARCHAR(100) DEFAULT 'Toronto',
    specialties_scraped INT DEFAULT 0,
    total_jobs_scraped INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'COMPLETED',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Specialties metadata table
CREATE TABLE IF NOT EXISTS specialties (
    name VARCHAR(150) PRIMARY KEY,
    job_count INT DEFAULT 0,
    avg_annualized_salary NUMERIC(12, 2),
    min_annualized_salary NUMERIC(12, 2),
    max_annualized_salary NUMERIC(12, 2),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Core Jobs Table
CREATE TABLE IF NOT EXISTS jobs (
    job_id VARCHAR(50) PRIMARY KEY,
    url TEXT NOT NULL,
    title VARCHAR(255) NOT NULL,
    specialty VARCHAR(150) NOT NULL,
    employment_type VARCHAR(50),
    company VARCHAR(255),
    
    -- Location & Geospatial Features
    city VARCHAR(100),
    province VARCHAR(50) DEFAULT 'ON',
    street_address TEXT,
    location_formatted TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    distance_from_toronto_km DOUBLE PRECISION,

    -- ML Compensation Targets & Extracted Features
    compensation_raw TEXT,
    pay_rate_type VARCHAR(50),
    salary_min NUMERIC(12, 2),
    salary_max NUMERIC(12, 2),
    salary_avg NUMERIC(12, 2),
    annualized_salary NUMERIC(12, 2),
    
    -- Additional Medical Financial Features
    physician_split_pct NUMERIC(5, 2),
    clinic_split_pct NUMERIC(5, 2),
    signing_bonus NUMERIC(10, 2),
    relocation_bonus NUMERIC(10, 2),
    accommodations_allowance NUMERIC(10, 2),
    travel_allowance NUMERIC(10, 2),

    -- Practice & Facility Characteristics
    is_hospital BOOLEAN DEFAULT FALSE,
    requires_emr BOOLEAN DEFAULT FALSE,
    requires_cfpc BOOLEAN DEFAULT FALSE,
    requires_cpso BOOLEAN DEFAULT FALSE,
    is_application_gated BOOLEAN DEFAULT FALSE,
    gate_message TEXT,

    -- Dates & Expiration Tracking
    posted_date DATE,
    closing_date DATE,
    start_date DATE,
    valid_through DATE,
    is_expired BOOLEAN DEFAULT FALSE,
    contact_emails JSONB DEFAULT '[]'::jsonb,

    description_summary TEXT,
    full_description_text TEXT,
    structured_sections JSONB,
    external_links JSONB,
    raw_json_ld JSONB,
    
    -- Timestamps
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_specialty ON jobs(specialty);
CREATE INDEX IF NOT EXISTS idx_jobs_city ON jobs(city);
CREATE INDEX IF NOT EXISTS idx_jobs_distance ON jobs(distance_from_toronto_km);
CREATE INDEX IF NOT EXISTS idx_jobs_salary ON jobs(annualized_salary);
CREATE INDEX IF NOT EXISTS idx_jobs_employment_type ON jobs(employment_type);

-- 4. Analytical View for CatBoost / XGBoost Training
CREATE OR REPLACE VIEW v_ml_salary_dataset AS
SELECT 
    job_id,
    specialty,
    employment_type,
    city,
    distance_from_toronto_km,
    is_hospital,
    requires_emr,
    requires_cfpc,
    requires_cpso,
    COALESCE(signing_bonus, 0) AS signing_bonus,
    COALESCE(relocation_bonus, 0) AS relocation_bonus,
    physician_split_pct,
    annualized_salary AS target_salary,
    posted_date
FROM jobs
WHERE annualized_salary IS NOT NULL AND annualized_salary > 0;

-- 5. Helper Function: Haversine distance calculator in SQL
CREATE OR REPLACE FUNCTION calculate_distance_km(
    lat1 DOUBLE PRECISION, 
    lon1 DOUBLE PRECISION, 
    lat2 DOUBLE PRECISION, 
    lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION AS $$
DECLARE
    r DOUBLE PRECISION := 6371;
    dlat DOUBLE PRECISION;
    dlon DOUBLE PRECISION;
    a DOUBLE PRECISION;
    c DOUBLE PRECISION;
BEGIN
    dlat := radians(lat2 - lat1);
    dlon := radians(lon2 - lon1);
    a := sin(dlat/2)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)^2;
    c := 2 * asin(sqrt(a));
    RETURN r * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. Helper Function: Query Salary Comparison Across Distance Bands
CREATE OR REPLACE FUNCTION get_salary_by_distance(
    p_specialty TEXT,
    p_min_km DOUBLE PRECISION DEFAULT 0,
    p_max_km DOUBLE PRECISION DEFAULT 100
)
RETURNS TABLE (
    specialty TEXT,
    distance_range TEXT,
    job_count BIGINT,
    avg_salary NUMERIC,
    min_salary NUMERIC,
    max_salary NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p_specialty::TEXT,
        (p_min_km::TEXT || ' - ' || p_max_km::TEXT || ' km')::TEXT,
        COUNT(*),
        ROUND(AVG(j.annualized_salary), 2),
        MIN(j.annualized_salary),
        MAX(j.annualized_salary)
    FROM jobs j
    WHERE j.specialty ILIKE '%' || p_specialty || '%'
      AND j.distance_from_toronto_km >= p_min_km
      AND j.distance_from_toronto_km <= p_max_km
      AND j.annualized_salary IS NOT NULL;
END;
$$ LANGUAGE plpgsql;
