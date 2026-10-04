/**
 * PostgreSQL & Supabase Database Handler with Auto-SQL Dump Generation
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { logger } = require('./utils');
const config = require('./config');

class DatabaseManager {
  constructor(options = {}) {
    this.connectionString =
      options.connectionString ||
      process.env.DATABASE_URL ||
      process.env.SUPABASE_DB_URL ||
      null;

    this.pool = null;
    this.isConnected = false;
    this.sqlDumpPath =
      options.sqlDumpPath ||
      path.join(config.OUTPUT.dataDir, 'supabase_dump.sql');

    // Buffer to hold SQL statements for offline dump
    this.sqlStatements = [];
  }

  /**
   * Initializes PostgreSQL pool and creates tables/views if connection is available
   */
  async init() {
    // Read schema SQL definition
    const schemaPath = path.resolve(__dirname, '../sql/schema.sql');
    if (fs.existsSync(schemaPath)) {
      this.schemaSql = fs.readFileSync(schemaPath, 'utf-8');
      this.sqlStatements.push(this.schemaSql);
    }

    if (this.connectionString) {
      try {
        logger.info('Connecting to PostgreSQL / Supabase instance...');
        this.pool = new Pool({
          connectionString: this.connectionString,
          ssl: this.connectionString.includes('supabase') ? { rejectUnauthorized: false } : false,
          max: 10,
          idleTimeoutMillis: 30000,
        });

        const client = await this.pool.connect();
        logger.success('Connected to PostgreSQL / Supabase successfully!');

        // Run schema definition
        if (this.schemaSql) {
          logger.info('Applying database schema and views...');
          await client.query(this.schemaSql);
          logger.success('Schema applied to PostgreSQL / Supabase.');
        }
        client.release();
        this.isConnected = true;
      } catch (err) {
        logger.warn(`PostgreSQL connection failed: ${err.message}. Running in SQL-dump mode.`);
        this.isConnected = false;
      }
    } else {
      logger.info('No DATABASE_URL provided. Operating in Supabase SQL-dump mode (saving to data/supabase_dump.sql).');
    }
  }

  /**
   * Escapes values for safe SQL insertion
   */
  escapeSql(val) {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return isNaN(val) ? 'NULL' : val;
    if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
    if (typeof val === 'object') {
      const jsonStr = JSON.stringify(val).replace(/'/g, "''");
      return `'${jsonStr}'::jsonb`;
    }
    const str = String(val).replace(/'/g, "''");
    return `'${str}'`;
  }

  /**
   * Upserts a normalized job record into PostgreSQL and appends to SQL dump
   * @param {Object} job Normalized job record
   */
  async upsertJob(job) {
    if (!job || !job.job_id || !job.title || job.title.trim().length === 0) {
      return;
    }

    const fields = [
      'job_id',
      'url',
      'title',
      'specialty',
      'employment_type',
      'company',
      'city',
      'province',
      'street_address',
      'location_formatted',
      'latitude',
      'longitude',
      'distance_from_toronto_km',
      'compensation_raw',
      'pay_rate_type',
      'salary_min',
      'salary_max',
      'salary_avg',
      'annualized_salary',
      'physician_split_pct',
      'clinic_split_pct',
      'signing_bonus',
      'relocation_bonus',
      'accommodations_allowance',
      'travel_allowance',
      'is_hospital',
      'requires_emr',
      'requires_cfpc',
      'requires_cpso',
      'is_application_gated',
      'gate_message',
      'posted_date',
      'closing_date',
      'start_date',
      'valid_through',
      'is_expired',
      'contact_emails',
      'description_summary',
      'full_description_text',
      'structured_sections',
      'external_links',
      'raw_json_ld',
      'scraped_at',
    ];

    const values = fields.map((f) => this.escapeSql(job[f]));

    const updateSet = fields
      .filter((f) => f !== 'job_id')
      .map((f) => `${f} = EXCLUDED.${f}`)
      .join(',\n      ');

    const sql = `
INSERT INTO jobs (
  ${fields.join(', ')}
) VALUES (
  ${values.join(', ')}
)
ON CONFLICT (job_id) DO UPDATE SET
  ${updateSet},
  updated_at = NOW();
`.trim();

    this.sqlStatements.push(sql);

    // If connected to live PostgreSQL / Supabase, execute query
    if (this.isConnected && this.pool) {
      try {
        await this.pool.query(sql);
      } catch (err) {
        logger.error(`Error upserting job ${job.job_id} to database: ${err.message}`);
      }
    }
  }

  /**
   * Updates specialty statistics in database and dump
   * @param {string} specialtyName
   * @param {number} count
   */
  async updateSpecialtyMeta(specialtyName, count) {
    const sql = `
INSERT INTO specialties (name, job_count, updated_at)
VALUES (${this.escapeSql(specialtyName)}, ${count}, NOW())
ON CONFLICT (name) DO UPDATE SET
  job_count = EXCLUDED.job_count,
  updated_at = NOW();
`.trim();

    this.sqlStatements.push(sql);

    if (this.isConnected && this.pool) {
      try {
        await this.pool.query(sql);
      } catch (err) {
        logger.error(`Error updating specialty ${specialtyName}: ${err.message}`);
      }
    }
  }

  /**
   * Logs scraping run completion
   * @param {string} targetCity
   * @param {number} specialtiesCount
   * @param {number} totalJobs
   */
  async recordRun(targetCity, specialtiesCount, totalJobs) {
    const sql = `
INSERT INTO scraping_runs (target_city, specialties_scraped, total_jobs_scraped, status, finished_at)
VALUES (${this.escapeSql(targetCity)}, ${specialtiesCount}, ${totalJobs}, 'COMPLETED', NOW());
`.trim();

    this.sqlStatements.push(sql);

    if (this.isConnected && this.pool) {
      try {
        await this.pool.query(sql);
      } catch (err) {
        logger.error(`Error recording scraping run: ${err.message}`);
      }
    }
  }

  /**
   * Writes all accumulated SQL statements into a standalone Supabase dump file
   */
  saveSqlDump() {
    const dir = path.dirname(this.sqlDumpPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const fullDump = [
      '-- ==============================================================================;',
      '-- Supabase & PostgreSQL Migration & Seed Dump;',
      `-- Generated on: ${new Date().toISOString()};`,
      '-- Paste this directly into Supabase SQL Editor or run via psql;',
      '-- ==============================================================================;',
      '',
      ...this.sqlStatements,
    ].join('\n\n');

    fs.writeFileSync(this.sqlDumpPath, fullDump, 'utf-8');
    logger.success(`Saved complete Supabase SQL dump to ${this.sqlDumpPath}`);
  }

  /**
   * Closes database pool if active
   */
  async close() {
    this.saveSqlDump();
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      logger.info('Database connection closed.');
    }
  }
}

module.exports = DatabaseManager;
