/**
 * Ontario PRO / ROS Multi-Corridor Autonomous Physician Job Scraper
 * Covers all 4 regional corridors within 500 km of Toronto + GTA Core.
 * Enriches each opportunity with Corridor Name, PRO/ROS Status, and NRRRI Incentives ($84.9k - $111.9k).
 * Bulletproof protection for manual entries (WHERE is_manual IS NOT TRUE).
 * Automated monthly/daily expiration pruning.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const { resolveCoordinates, parseCompensation, normalizeJobRecord } = require('./normalizer');
const { calculateHaversine } = require('./advisors');
const { cleanText, logger } = require('./utils');

const TORONTO_CENTER = { lat: 43.6532, lng: -79.3832 };
const TODAY_ISO = new Date().toISOString().slice(0, 10);

// Comprehensive Ontario PRO / ROS Opportunity Dictionary (~40 Municipalities)
const CORRIDOR_LOCATIONS = {
  // ---------------------------------------------------------------------------
  // 1. WEST CORRIDOR (Orangeville to Shelburne / Grey County)
  // ---------------------------------------------------------------------------
  'Orangeville': { corridor: 'West Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 43.9198, lng: -80.0943 },
  'Shelburne': { corridor: 'West Corridor', status: 'CONFIRMED_PRO', nrrri: 84900, lat: 44.0792, lng: -80.2041 },
  'Grand Valley': { corridor: 'West Corridor', status: 'CONFIRMED_PRO', nrrri: 85900, lat: 43.9001, lng: -80.3134 },
  'Amaranth': { corridor: 'West Corridor', status: 'CONFIRMED_PRO', nrrri: 85700, lat: 43.9833, lng: -80.1833 },
  'East Garafraxa': { corridor: 'West Corridor', status: 'CONFIRMED_PRO', nrrri: 84900, lat: 43.8500, lng: -80.2500 },
  'Mulmur': { corridor: 'West Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 44.1833, lng: -80.1167 },
  'Southgate': { corridor: 'West Corridor', status: 'CONFIRMED_PRO', nrrri: 85000, lat: 44.1500, lng: -80.6000 },
  'Dundalk': { corridor: 'West Corridor', status: 'CONFIRMED_PRO', nrrri: 85000, lat: 44.1667, lng: -80.3833 },
  'Grey Highlands': { corridor: 'West Corridor', status: 'CONFIRMED_PRO', nrrri: 85000, lat: 44.3333, lng: -80.5667 },
  'Meaford': { corridor: 'West Corridor', status: 'CONFIRMED_PRO', nrrri: 85000, lat: 44.6067, lng: -80.5925 },
  'Georgian Bluffs': { corridor: 'West Corridor', status: 'CONFIRMED_PRO', nrrri: 85000, lat: 44.6833, lng: -81.0167 },
  'Blue Mountains': { corridor: 'West Corridor', status: 'CONFIRMED_PRO', nrrri: 86300, lat: 44.4833, lng: -80.3833 },
  'Minto': { corridor: 'West Corridor', status: 'CONFIRMED_PRO', nrrri: 86100, lat: 43.9167, lng: -80.8500 },
  'Wellington North': { corridor: 'West Corridor', status: 'CONFIRMED_PRO', nrrri: 85000, lat: 43.8833, lng: -80.5500 },
  'Guelph': { corridor: 'West Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 43.5448, lng: -80.2482 },
  'Kitchener': { corridor: 'West Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 43.4516, lng: -80.4925 },
  'Milton': { corridor: 'West Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 43.5183, lng: -79.8774 },
  'Oakville': { corridor: 'West Corridor', status: 'EXCLUDED_CORE', nrrri: null, lat: 43.4675, lng: -79.6877 },
  'Burlington': { corridor: 'West Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 43.3255, lng: -79.7990 },
  'Hamilton': { corridor: 'West Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 43.2557, lng: -79.8711 },

  // ---------------------------------------------------------------------------
  // 2. NORTH CORRIDOR (Barrie to Muskoka / Parry Sound)
  // ---------------------------------------------------------------------------
  'Barrie': { corridor: 'North Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 44.3894, lng: -79.6903 },
  'Orillia': { corridor: 'North Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 44.6086, lng: -79.4197 },
  'Ramara': { corridor: 'North Corridor', status: 'CONFIRMED_PRO', nrrri: 85700, lat: 44.5833, lng: -79.2500 },
  'Tay': { corridor: 'North Corridor', status: 'CONFIRMED_PRO', nrrri: 85300, lat: 44.7167, lng: -79.7833 },
  'Penetanguishene': { corridor: 'North Corridor', status: 'CONFIRMED_PRO', nrrri: 85500, lat: 44.7667, lng: -79.9333 },
  'Gravenhurst': { corridor: 'North Corridor', status: 'CONFIRMED_PRO', nrrri: 88300, lat: 44.9200, lng: -79.3700 },
  'Bracebridge': { corridor: 'North Corridor', status: 'CONFIRMED_PRO', nrrri: 99300, lat: 45.0400, lng: -79.3100 },
  'Huntsville': { corridor: 'North Corridor', status: 'CONFIRMED_PRO', nrrri: 107200, lat: 45.3269, lng: -79.2167 },
  'Parry Sound': { corridor: 'North Corridor', status: 'CONFIRMED_PRO', nrrri: 111900, lat: 45.3431, lng: -80.0353 },

  // ---------------------------------------------------------------------------
  // 3. EAST CORRIDOR (Oshawa to Peterborough / Northumberland)
  // ---------------------------------------------------------------------------
  'Ajax': { corridor: 'East Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 43.8509, lng: -79.0204 },
  'Pickering': { corridor: 'East Corridor', status: 'EXCLUDED_CORE', nrrri: null, lat: 43.8384, lng: -79.0868 },
  'Whitby': { corridor: 'East Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 43.8975, lng: -78.9429 },
  'Oshawa': { corridor: 'East Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 43.8971, lng: -78.8658 },
  'Bowmanville': { corridor: 'East Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 43.9133, lng: -78.6867 },
  'Cobourg': { corridor: 'East Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 43.9600, lng: -78.1700 },
  'Peterborough': { corridor: 'East Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 44.3091, lng: -78.3197 },
  'Douro-Dummer': { corridor: 'East Corridor', status: 'CONFIRMED_PRO', nrrri: 85300, lat: 44.4167, lng: -78.1333 },
  'Asphodel-Norwood': { corridor: 'East Corridor', status: 'CONFIRMED_PRO', nrrri: 85700, lat: 44.3333, lng: -77.9667 },
  'Trent Hills': { corridor: 'East Corridor', status: 'CONFIRMED_PRO', nrrri: 85100, lat: 44.3167, lng: -77.8333 },
  'Stirling-Rawdon': { corridor: 'East Corridor', status: 'CONFIRMED_PRO', nrrri: 85000, lat: 44.3000, lng: -77.5500 },
  'Cramahe': { corridor: 'East Corridor', status: 'CONFIRMED_PRO', nrrri: 84900, lat: 44.0833, lng: -77.9000 },
  'Belleville': { corridor: 'East Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 44.1628, lng: -77.3832 },
  'North Kawartha': { corridor: 'East Corridor', status: 'CONFIRMED_PRO', nrrri: 96200, lat: 44.7500, lng: -78.1000 },
  'Kingston': { corridor: 'East Corridor', status: 'PRO_POSSIBLE', nrrri: null, lat: 44.2312, lng: -76.4860 },

  // ---------------------------------------------------------------------------
  // 4. NORTHEAST CORRIDOR (North Bay & Sudbury)
  // ---------------------------------------------------------------------------
  'North Bay': { corridor: 'Northeast Corridor', status: 'NURC', nrrri: 110000, lat: 46.3091, lng: -79.4608 },
  'Sudbury': { corridor: 'Northeast Corridor', status: 'NURC', nrrri: 110000, lat: 46.4917, lng: -80.9930 },

  // ---------------------------------------------------------------------------
  // 5. GTA URBAN CORE (Baseline / Excluded from ROS)
  // ---------------------------------------------------------------------------
  'Toronto': { corridor: 'GTA Core', status: 'EXCLUDED_CORE', nrrri: 0, lat: 43.6532, lng: -79.3832 },
  'North York': { corridor: 'GTA Core', status: 'EXCLUDED_CORE', nrrri: 0, lat: 43.7615, lng: -79.4111 },
  'Scarborough': { corridor: 'GTA Core', status: 'EXCLUDED_CORE', nrrri: 0, lat: 43.7764, lng: -79.2318 },
  'Etobicoke': { corridor: 'GTA Core', status: 'EXCLUDED_CORE', nrrri: 0, lat: 43.6205, lng: -79.5132 },
  'Mississauga': { corridor: 'GTA Core', status: 'EXCLUDED_CORE', nrrri: 0, lat: 43.5890, lng: -79.6441 },
  'Brampton': { corridor: 'GTA Core', status: 'EXCLUDED_CORE', nrrri: 0, lat: 43.7315, lng: -79.7624 },
  'Vaughan': { corridor: 'GTA Core', status: 'EXCLUDED_CORE', nrrri: 0, lat: 43.8563, lng: -79.5085 },
  'Markham': { corridor: 'GTA Core', status: 'EXCLUDED_CORE', nrrri: 0, lat: 43.8561, lng: -79.3370 },
  'Richmond Hill': { corridor: 'GTA Core', status: 'EXCLUDED_CORE', nrrri: 0, lat: 43.8828, lng: -79.4403 },
};

// Compute Haversine distances from Toronto core for each community
for (const [name, loc] of Object.entries(CORRIDOR_LOCATIONS)) {
  loc.distance_from_toronto_km = calculateHaversine(TORONTO_CENTER.lat, TORONTO_CENTER.lng, loc.lat, loc.lng);
}

// Helpers
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Robust HTTP GET with 3x retry mechanism and exponential backoff
 * Retries on network errors, socket timeouts, rate limits (429), and server errors (5xx)
 */
function httpsGet(url, retries = 3, timeoutMs = 10000, attempt = 1) {
  return new Promise((resolve) => {
    try {
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-CA,en-US;q=0.9,en;q=0.8',
          },
        },
        async (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', async () => {
            // Retry on transient 429 (rate limiting) or 5xx (server error)
            if ((res.statusCode === 429 || res.statusCode >= 500) && retries > 0) {
              const backoffMs = Math.min(3500, attempt * 700 + Math.floor(Math.random() * 250));
              await sleep(backoffMs);
              const next = await httpsGet(url, retries - 1, timeoutMs, attempt + 1);
              resolve(next);
            } else {
              resolve({ statusCode: res.statusCode, body: data });
            }
          });
          res.on('error', async (err) => {
            if (retries > 0) {
              const backoffMs = Math.min(3500, attempt * 700 + Math.floor(Math.random() * 250));
              await sleep(backoffMs);
              const next = await httpsGet(url, retries - 1, timeoutMs, attempt + 1);
              resolve(next);
            } else {
              resolve({ statusCode: 500, body: '', error: err.message });
            }
          });
        }
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
      });

      req.on('error', async (err) => {
        if (retries > 0) {
          const backoffMs = Math.min(3500, attempt * 700 + Math.floor(Math.random() * 250));
          await sleep(backoffMs);
          const next = await httpsGet(url, retries - 1, timeoutMs, attempt + 1);
          resolve(next);
        } else {
          resolve({ statusCode: 500, body: '', error: err.message });
        }
      });
    } catch (e) {
      resolve({ statusCode: 500, body: '', error: e.message });
    }
  });
}

function parseCardFromHtml(cardHtml, href) {
  const text = cardHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const startsMatch = text.match(/Starts\s*(\d{4}-\d{2}-\d{2})/i);
  const startDate = startsMatch ? startsMatch[1] : null;

  // Canonicalize URL by stripping query parameters (?city=..., ?specialty=...) and trailing slashes
  const cleanHref = href.split('?')[0].replace(/\/+$/, '');
  const idMatch = cleanHref.match(/([a-f0-9]{24})(?:[/?#]|$)/i);
  let jobId = idMatch ? idMatch[1] : null;

  if (!jobId) {
    const crypto = require('crypto');
    jobId = crypto.createHash('md5').update(cleanHref).digest('hex').slice(0, 24);
  }

  return {
    job_id: jobId,
    href: cleanHref.startsWith('http') ? cleanHref : `https://physiciancareers.ca${cleanHref}`,
    startDate,
    rawCardText: text,
  };
}

function extractDetailFromHtml(html, jobUrl, fallbackSpecialty = '') {
  let jsonLd = null;
  const jsonLdMatch = html.match(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/);
  if (jsonLdMatch) {
    try {
      jsonLd = JSON.parse(jsonLdMatch[1]);
    } catch (e) {
      // ignore JSON parse errors
    }
  }

  const validThrough = jsonLd?.validThrough ? jsonLd.validThrough.slice(0, 10) : null;
  const datePosted = jsonLd?.datePosted ? jsonLd.datePosted.slice(0, 10) : null;
  const rawDescription = jsonLd?.description || '';

  let closingDate = validThrough;
  const closingMatch = rawDescription.match(/Closing Date:\s*([^\n\r<&]+)/i);
  if (closingMatch) {
    closingDate = closingMatch[1].trim();
  }

  const emailMatches = Array.from(
    new Set(rawDescription.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])
  ).filter((e) => !e.toLowerCase().includes('physiciancareers.ca'));

  let title = jsonLd?.title || '';
  if (!title) {
    const titleMatch = html.match(/<h1[^>]*class=\"[^\"]*job-detail-title[^\"]*\"[^>]*>([\s\S]*?)<\/h1>/i);
    title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
  }

  const company = jsonLd?.hiringOrganization?.name || 'Community Practice';
  const employmentType = jsonLd?.employmentType || 'full-time';
  const address = jsonLd?.jobLocation?.address || {};

  const structuredSections = {};
  const sectionHeaders = [
    'About',
    'Company Description',
    'Job Description',
    'Responsibilities',
    'Remuneration',
    'Qualifications',
    'Additional Information',
    'Clinic Details',
    'Community Details',
  ];

  for (const header of sectionHeaders) {
    const regex = new RegExp(`(?:<strong>|<b>)?${header}(?:</strong>|</b>)?:?([\\s\\S]*?)(?=(?:<strong>|<b>)?(?:${sectionHeaders.join('|')})|$)`, 'i');
    const match = rawDescription.match(regex);
    if (match && match[1].trim().length > 10) {
      structuredSections[header] = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  return {
    title: cleanText(title),
    company: cleanText(company),
    specialty: fallbackSpecialty || 'Family Medicine',
    employment_type: employmentType,
    location: {
      formatted: `${address.addressLocality || 'Ontario'}, ${address.addressRegion || 'ON'}`,
      street_address: address.streetAddress || null,
      city: address.addressLocality || 'Ontario',
      province: address.addressRegion || 'ON',
      country: address.addressCountry || 'CA',
      postal_code: address.postalCode || null,
    },
    dates: {
      posted_date: datePosted,
      posted_datetime_iso: jsonLd?.datePosted || null,
      closing_date: closingDate,
      valid_through: validThrough,
    },
    contact_emails: emailMatches,
    structured_sections: structuredSections,
    full_description_text: cleanText(rawDescription),
    json_ld: jsonLd,
  };
}

/**
 * Main Autonomous Multi-Corridor Scraper
 * @param {Object} options
 * @param {string[]} options.targetCorridors - Optional list of corridors to scrape (defaults to all)
 * @param {boolean} options.persistDb - Whether to persist directly to Supabase PostgreSQL (default: true)
 */
async function scrapeCorridors(options = {}) {
  const startTime = Date.now();
  logger.info('================================================================');
  logger.info(`🚀 Starting Autonomous Multi-Corridor Scraper (Ontario PRO / ROS)`);
  logger.info(`📅 Cutoff Date: ${TODAY_ISO} | Free-Tier Optimized Native HTTPS`);
  logger.info('================================================================');

  const targetCorridors = options.targetCorridors || [
    'West Corridor',
    'North Corridor',
    'East Corridor',
    'Northeast Corridor',
    'GTA Core',
  ];

  // Filter municipalities belonging to targeted corridors
  const locationsToScrape = Object.entries(CORRIDOR_LOCATIONS).filter(([_, loc]) =>
    targetCorridors.includes(loc.corridor)
  );

  logger.info(`Scanning ${locationsToScrape.length} target communities across ${targetCorridors.length} corridors...`);

  const uniqueJobUrls = new Map(); // url -> { card, locationName, locInfo }

  for (let i = 0; i < locationsToScrape.length; i++) {
    const [cityName, locInfo] = locationsToScrape[i];
    const cityUrl = `https://physiciancareers.ca/jobs?city=${encodeURIComponent(cityName)}`;

    try {
      const res = await httpsGet(cityUrl);
      if (res.statusCode !== 200) continue;

      const cardRegex = /<a[^>]*href=\"([^\"]+)\"[^>]*>[\s\S]*?<article[^>]*>([\s\S]*?)<\/article><\/a>/g;
      let match;
      let count = 0;
      while ((match = cardRegex.exec(res.body)) !== null) {
        const href = match[1];
        if (!href || href === '/' || href.includes('undefined')) continue;
        const cardData = parseCardFromHtml(match[2], href);
        // Deduplicate candidates in-memory by unique canonical job_id
        if (!uniqueJobUrls.has(cardData.job_id)) {
          uniqueJobUrls.set(cardData.job_id, { card: cardData, cityName, locInfo });
          count++;
        }
      }

      if (count > 0) {
        logger.info(`[${i + 1}/${locationsToScrape.length}] ${cityName} (${locInfo.corridor}): Discovered ${count} listings`);
      }
    } catch (err) {
      logger.warn(`Error querying ${cityName}: ${err.message}`);
    }

    await sleep(250); // Polite 250ms delay between city requests
  }

  logger.info(`\nDiscovered ${uniqueJobUrls.size} unique candidate listings. Fetching details & evaluating active status...`);

  const activeJobs = [];
  let expiredCount = 0;
  let failedFetchCount = 0;

  const entries = Array.from(uniqueJobUrls.entries());
  const batchSize = 4;

  for (let b = 0; b < entries.length; b += batchSize) {
    const batch = entries.slice(b, b + batchSize);
    await Promise.all(
      batch.map(async ([jobId, { card, cityName, locInfo }]) => {
        try {
          // 3x Retry Mechanism for Individual Job Detail Fetch
          let detailRes = null;
          let jobAttempt = 0;
          const maxJobRetries = 3;

          while (jobAttempt < maxJobRetries) {
            jobAttempt++;
            try {
              detailRes = await httpsGet(card.href, 2, 10000);
              if (detailRes && detailRes.statusCode === 200 && detailRes.body) {
                break; // Succeeded
              }
            } catch (fetchErr) {
              // Retry on network error
            }
            if (jobAttempt < maxJobRetries) {
              await sleep(jobAttempt * 400); // 400ms, 800ms backoff
            }
          }

          if (!detailRes || detailRes.statusCode !== 200 || !detailRes.body) {
            logger.warn(`[RETRY EXHAUSTED] Job ${jobId} failed after ${maxJobRetries} attempts: ${card.href}`);
            failedFetchCount++;
            return;
          }

          const detail = extractDetailFromHtml(detailRes.body, card.href, 'Family Medicine');
          const combined = {
            job_id: card.job_id,
            url: card.href,
            title: detail.title,
            specialty: detail.specialty,
            employment_type: detail.employment_type,
            company: detail.company,
            location: {
              ...detail.location,
              city: cityName,
            },
            dates: {
              ...detail.dates,
              start_date: card.startDate,
            },
            contact_emails: detail.contact_emails,
            structured_sections: detail.structured_sections,
            full_description_text: detail.full_description_text,
            json_ld: detail.json_ld,
          };

          const normalized = normalizeJobRecord(combined);

          // Automated Expiration Pruning:
          const validThrough = normalized.valid_through;
          const startDate = normalized.start_date;
          const closingDate = normalized.closing_date;

          let isExpired = false;
          if (validThrough && validThrough < TODAY_ISO) {
            isExpired = true;
          } else if (closingDate && closingDate < TODAY_ISO) {
            isExpired = true;
          } else if (startDate && startDate < TODAY_ISO && (!validThrough || validThrough < TODAY_ISO)) {
            isExpired = true;
          }

          if (isExpired) {
            expiredCount++;
            return;
          }

          // Corridor & NRRRI Incentive Enrichment
          normalized.city = cityName;
          normalized.latitude = locInfo.lat;
          normalized.longitude = locInfo.lng;
          normalized.distance_from_toronto_km = locInfo.distance_from_toronto_km;
          normalized.corridor = locInfo.corridor;
          normalized.pro_ros_status = locInfo.status;
          normalized.nrrri_incentive_amount = locInfo.nrrri || null;
          normalized.is_manual = false; // Scraped data is strictly marked is_manual = false

          activeJobs.push(normalized);
          logger.success(`  [ACTIVE] "${normalized.title}" in ${cityName} (${locInfo.corridor}) | NRRRI: ${locInfo.nrrri ? '$' + locInfo.nrrri.toLocaleString() : 'N/A'}`);
        } catch (err) {
          logger.warn(`Failed to process job ${jobId} (${card.href}): ${err.message}`);
          failedFetchCount++;
        }
      })
    );
    await sleep(200); // 200ms polite throttle between batches
  }

  // ---------------------------------------------------------------------------
  // Semantic Deduplication Engine (Zero Duplicates Guarantee)
  // When an employer reposts the exact same job on multiple dates,
  // we retain ONLY the NEWEST active posting and prune older duplicate reposts.
  // ---------------------------------------------------------------------------
  const dedupedJobsMap = new Map();
  let duplicateRepostCount = 0;

  for (const job of activeJobs) {
    const fp = `${(job.title || '').trim()}::${(job.company || '').trim()}::${(job.city || '').trim()}::${(job.specialty || '').trim()}`.toLowerCase();
    
    if (!dedupedJobsMap.has(fp)) {
      dedupedJobsMap.set(fp, job);
    } else {
      const existing = dedupedJobsMap.get(fp);
      const existingDate = existing.posted_date || existing.start_date || '1970-01-01';
      const newDate = job.posted_date || job.start_date || '1970-01-01';
      
      if (newDate > existingDate) {
        dedupedJobsMap.set(fp, job); // Keep newer posting
      }
      duplicateRepostCount++;
    }
  }

  const finalActiveJobs = Array.from(dedupedJobsMap.values());
  if (duplicateRepostCount > 0) {
    logger.info(`🧹 Semantic Deduplication: Filtered out ${duplicateRepostCount} duplicate reposts. Retained ${finalActiveJobs.length} pristine unique listings.`);
  }

  logger.info('================================================================');
  logger.success(`Scraping Complete in ${Math.round((Date.now() - startTime) / 1000)}s`);
  logger.info(`Total Evaluated: ${uniqueJobUrls.size} | Expired Pruned: ${expiredCount} | Duplicates Removed: ${duplicateRepostCount} | Active Retained: ${finalActiveJobs.length}`);
  if (failedFetchCount > 0) {
    logger.warn(`Jobs Failed After 3 Retries: ${failedFetchCount}`);
  }
  logger.info('================================================================');

  // Database Persistence with Bulletproof Manual Protection & Deduplication
  if (options.persistDb !== false && process.env.DATABASE_URL) {
    await persistToDatabase(finalActiveJobs);
  }

  // Update local fallback dataset
  updateLocalJsonFallback(finalActiveJobs, expiredCount + duplicateRepostCount);

  return {
    total_evaluated: uniqueJobUrls.size,
    expired_pruned: expiredCount,
    duplicates_removed: duplicateRepostCount,
    failed_after_retries: failedFetchCount,
    active_retained: finalActiveJobs.length,
    jobs: finalActiveJobs,
  };
}

function sanitizeDate(d) {
  if (!d || typeof d !== 'string') return null;
  const match = d.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Persist scraped jobs to Supabase PostgreSQL
 * STRICT RULE: Never overwrite or prune jobs WHERE is_manual IS TRUE
 */
async function persistToDatabase(jobs) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 10000,
  });

  let client = null;
  try {
    client = await pool.connect();
    logger.info('Syncing to Supabase PostgreSQL with Manual Entry Protection & Deduplication...');

    let insertedCount = 0;
    for (const job of jobs) {
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
            is_expired, contact_emails, description_summary, full_description_text, structured_sections,
            is_manual, corridor, nrrri_incentive_amount, pro_ros_status
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10,
            $11, $12, $13,
            $14, $15, $16, $17, $18, $19,
            $20, $21, $22, $23,
            $24, $25, $26, $27,
            $28, $29, $30, $31, $32, $33,
            $34, $35, $36, $37, $38,
            $39, $40, $41, $42
          )
          ON CONFLICT (job_id) DO UPDATE SET
            title = EXCLUDED.title,
            annualized_salary = EXCLUDED.annualized_salary,
            corridor = EXCLUDED.corridor,
            nrrri_incentive_amount = EXCLUDED.nrrri_incentive_amount,
            pro_ros_status = EXCLUDED.pro_ros_status,
            updated_at = NOW()
          WHERE jobs.is_manual IS NOT TRUE;
        `;

        const values = [
          job.job_id,
          job.url,
          job.title,
          job.specialty,
          job.employment_type,
          job.company,
          job.city,
          job.province,
          job.street_address,
          job.location_formatted,
          job.latitude,
          job.longitude,
          job.distance_from_toronto_km,
          job.compensation_raw,
          job.pay_rate_type,
          job.salary_min,
          job.salary_max,
          job.salary_avg,
          job.annualized_salary,
          job.physician_split_pct,
          job.clinic_split_pct,
          job.signing_bonus,
          job.relocation_bonus,
          job.accommodations_allowance,
          job.travel_allowance,
          job.is_hospital,
          job.requires_emr,
          job.requires_cfpc,
          job.requires_cpso,
          sanitizeDate(job.posted_date) || TODAY_ISO,
          sanitizeDate(job.closing_date),
          sanitizeDate(job.start_date) || TODAY_ISO,
          sanitizeDate(job.valid_through),
          false, // is_expired
          JSON.stringify(job.contact_emails || []),
          job.description_summary,
          job.full_description_text,
          JSON.stringify(job.structured_sections || {}),
          false, // is_manual
          job.corridor,
          job.nrrri_incentive_amount,
          job.pro_ros_status,
        ];

        let insertSuccess = false;
        let dbAttempt = 0;
        const maxDbRetries = 3;

        while (!insertSuccess && dbAttempt < maxDbRetries) {
          dbAttempt++;
          try {
            await client.query(insertSql, values);
            insertSuccess = true;
            insertedCount++;
          } catch (jobErr) {
            if (dbAttempt >= maxDbRetries) {
              logger.warn(`Could not sync job ${job.job_id} after ${maxDbRetries} attempts (${job.title}): ${jobErr.message}`);
            } else {
              await sleep(dbAttempt * 400); // 400ms, 800ms backoff
            }
          }
        }
      } catch (err) {
        logger.warn(`Error preparing job ${job.job_id}: ${err.message}`);
      }
    }

    // Automated Stale Pruning in Database: ONLY prune scraped jobs (NEVER manual)
    const pruneRes = await client.query(`
      UPDATE jobs 
      SET is_expired = TRUE 
      WHERE is_manual IS NOT TRUE 
        AND ((valid_through IS NOT NULL AND valid_through < CURRENT_DATE) 
          OR (closing_date IS NOT NULL AND closing_date < CURRENT_DATE));
    `);

    // Automated Semantic Deduplication in Database:
    // When employers repost the exact same title/company/city, mark older duplicate copies as is_expired = TRUE
    const dedupRes = await client.query(`
      WITH ranked_dupes AS (
        SELECT job_id,
               ROW_NUMBER() OVER (
                 PARTITION BY LOWER(TRIM(title)), LOWER(TRIM(company)), LOWER(TRIM(city)), LOWER(TRIM(specialty))
                 ORDER BY posted_date DESC NULLS LAST, scraped_at DESC
               ) as rn
        FROM jobs
        WHERE is_manual IS NOT TRUE
      )
      UPDATE jobs
      SET is_expired = TRUE
      WHERE job_id IN (
        SELECT job_id FROM ranked_dupes WHERE rn > 1
      ) AND is_manual IS NOT TRUE;
    `);

    if (dedupRes.rowCount > 0) {
      logger.info(`🧹 Semantic Deduplication in DB: Marked ${dedupRes.rowCount} older duplicate reposts as expired.`);
    }

    logger.success(`Database sync complete: ${insertedCount} jobs upserted. ${pruneRes.rowCount} stale jobs & ${dedupRes.rowCount} duplicate reposts marked expired.`);

    // Record scraping execution log
    await client.query(`
      INSERT INTO scraping_runs (target_city, specialties_scraped, total_jobs_scraped, status, finished_at)
      VALUES ($1, $2, $3, $4, NOW());
    `, ['Ontario Corridors', 6, insertedCount, 'COMPLETED']);

  } catch (err) {
    logger.error(`Database persistence error: ${err.message}`);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

function updateLocalJsonFallback(activeJobs, expiredCount) {
  try {
    const jsonPath = path.resolve(__dirname, '../data/toronto_specialties_jobs.json');
    let existingJobs = [];
    if (fs.existsSync(jsonPath)) {
      const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      existingJobs = existing.jobs || [];
    }

    const jobMap = new Map();
    // Keep existing jobs first
    for (const j of existingJobs) {
      if (j && j.job_id) jobMap.set(j.job_id, j);
    }
    // Upsert newly scraped active jobs
    for (const j of activeJobs) {
      if (j && j.job_id) {
        // Scraped jobs never overwrite manual jobs
        const prev = jobMap.get(j.job_id);
        if (prev && prev.is_manual) continue;
        jobMap.set(j.job_id, j);
      }
    }

    const combined = Array.from(jobMap.values());
    const manualJobsCount = combined.filter((j) => j.is_manual === true).length;
    const scrapedJobsCount = combined.filter((j) => j.is_manual !== true).length;

    const payload = {
      corridors: ['West Corridor', 'North Corridor', 'East Corridor', 'Northeast Corridor', 'GTA Core'],
      cutoff_date: TODAY_ISO,
      total_active_jobs: combined.length,
      manual_jobs_count: manualJobsCount,
      scraped_jobs_count: scrapedJobsCount,
      pruned_expired_count: expiredCount,
      generated_at: new Date().toISOString(),
      jobs: combined,
    };

    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
    logger.success(`Local JSON fallback updated: ${combined.length} total active jobs (${manualJobsCount} manual preserved).`);
  } catch (err) {
    logger.warn(`Could not update local fallback JSON: ${err.message}`);
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let targetCorridors = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--corridor=')) {
      targetCorridors = [arg.split('=')[1]];
    } else if (arg === '--corridor' && args[i + 1]) {
      targetCorridors = [args[++i]];
    }
  }

  if (targetCorridors) {
    const CORRIDOR_MAP = {
      west: 'West Corridor',
      north: 'North Corridor',
      east: 'East Corridor',
      northeast: 'Northeast Corridor',
      gta: 'GTA Core',
      core: 'GTA Core',
      all: null,
    };
    targetCorridors = targetCorridors
      .map((c) => CORRIDOR_MAP[c.toLowerCase()] || c)
      .filter(Boolean);
    if (targetCorridors.length === 0) targetCorridors = null;
  }

  const corridorMsg = targetCorridors ? targetCorridors.join(', ') : 'All Corridors';
  console.log(`Starting scraper run for: ${corridorMsg}`);

  scrapeCorridors({ targetCorridors })
    .then((res) => {
      console.log(`Autonomous scraping execution complete for ${corridorMsg}. ${res.active_retained} active listings ready.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal scraping execution error:', err);
      process.exit(1);
    });
}

module.exports = {
  scrapeCorridors,
  CORRIDOR_LOCATIONS,
};
