/**
 * Live Active Toronto Jobs Scraper & Expired Ads Pruner
 * Fetches all specialties for Toronto, parses complete job details and JSON-LD,
 * extracts contact emails, and strictly discards expired ads (where validThrough / start date < October 2026).
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { resolveCoordinates, parseCompensation, normalizeJobRecord } = require('./normalizer');
const { cleanText, logger } = require('./utils');

const TODAY_ISO = new Date().toISOString().slice(0, 10); // '2026-10-04'

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-CA,en-US;q=0.9,en;q=0.8',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
      }
    ).on('error', reject);
  });
}

function parseCardFromHtml(cardHtml, href) {
  const text = cardHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const startsMatch = text.match(/Starts\s*(\d{4}-\d{2}-\d{2})/i);
  const startDate = startsMatch ? startsMatch[1] : null;

  // Extract ID from href
  const idMatch = href.match(/([a-f0-9]{24})(?:[/?#]|$)/i);
  const jobId = idMatch ? idMatch[1] : null;

  return {
    job_id: jobId,
    href: href.startsWith('http') ? href : `https://physiciancareers.ca${href}`,
    startDate,
    rawCardText: text,
  };
}

function extractDetailFromHtml(html, jobUrl, fallbackSpecialty = '') {
  // 1. JSON-LD Extraction
  let jsonLd = null;
  const jsonLdMatch = html.match(/<script type=\"application\/ld\+json\">([\s\S]*?)<\/script>/);
  if (jsonLdMatch) {
    try {
      jsonLd = JSON.parse(jsonLdMatch[1]);
    } catch (e) {
      // ignore parse errors
    }
  }

  // 2. Dates
  const validThrough = jsonLd?.validThrough ? jsonLd.validThrough.slice(0, 10) : null;
  const datePosted = jsonLd?.datePosted ? jsonLd.datePosted.slice(0, 10) : null;

  // 3. Description & Text
  const rawDescription = jsonLd?.description || '';
  let closingDate = validThrough;
  const closingMatch = rawDescription.match(/Closing Date:\s*([^\n\r<&]+)/i);
  if (closingMatch) {
    closingDate = closingMatch[1].trim();
  }

  // 4. Direct Emails
  const emailMatches = Array.from(
    new Set(rawDescription.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])
  ).filter((e) => !e.toLowerCase().includes('physiciancareers.ca'));

  // 5. Title & Company
  let title = jsonLd?.title || '';
  if (!title) {
    const titleMatch = html.match(/<h1[^>]*class=\"[^\"]*job-detail-title[^\"]*\"[^>]*>([\s\S]*?)<\/h1>/i);
    title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
  }

  const company = jsonLd?.hiringOrganization?.name || 'Private Practice';
  const employmentType = jsonLd?.employmentType || 'full-time';
  const address = jsonLd?.jobLocation?.address || {};

  // 6. Structured Sections
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
    specialty: fallbackSpecialty,
    employment_type: employmentType,
    location: {
      formatted: `${address.addressLocality || 'Toronto'}, ${address.addressRegion || 'ON'}`,
      street_address: address.streetAddress || null,
      city: address.addressLocality || 'Toronto',
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

async function scrapeActiveJobs() {
  logger.info(`Starting Active Toronto Jobs Ingestion with Expired Ads Pruning (Cutoff: ${TODAY_ISO})...`);

  // 1. Fetch Specialties
  const specRes = await httpsGet('https://api.physiciancareers.ca/jobs/specialties');
  let specialties = [];
  try {
    const parsed = JSON.parse(specRes.body);
    specialties = parsed.specialties || [];
  } catch (e) {
    logger.warn('Could not parse specialties API, using core specialties list');
    specialties = [
      'Family Medicine',
      'Dermatology',
      'Pediatrics',
      'Internal Medicine',
      'Psychiatry',
      'Emergency Medicine',
      'General Surgery',
      'Diagnostic Radiology / Imaging',
      'Anaesthesiology',
      'Obstetrics and Gynecology',
      'Orthopaedic Surgery',
    ];
  }

  logger.info(`Processing ${specialties.length} medical specialties in Toronto...`);

  const uniqueJobUrls = new Map(); // url -> { card, specialty }

  for (let i = 0; i < specialties.length; i++) {
    const spec = specialties[i];
    const specUrl = `https://physiciancareers.ca/jobs?city=Toronto&specialty=${encodeURIComponent(spec)}`;
    try {
      const res = await httpsGet(specUrl);
      if (res.statusCode !== 200) continue;

      const cardRegex = /<a[^>]*href=\"([^\"]+)\"[^>]*>[\s\S]*?<article[^>]*>([\s\S]*?)<\/article><\/a>/g;
      let match;
      let count = 0;
      while ((match = cardRegex.exec(res.body)) !== null) {
        const href = match[1];
        if (!href || href === '/' || href.includes('undefined')) continue;
        const cardData = parseCardFromHtml(match[2], href);
        if (!uniqueJobUrls.has(cardData.href)) {
          uniqueJobUrls.set(cardData.href, { card: cardData, specialty: spec });
          count++;
        }
      }
      logger.info(`[${i + 1}/${specialties.length}] ${spec}: Found ${count} unique listings`);
    } catch (err) {
      logger.warn(`Error querying ${spec}: ${err.message}`);
    }
  }

  logger.info(`Total unique listings discovered: ${uniqueJobUrls.size}. Fetching full details and evaluating expiration...`);

  const activeJobs = [];
  let expiredCount = 0;

  let idx = 0;
  for (const [url, { card, specialty }] of uniqueJobUrls.entries()) {
    idx++;
    try {
      const detailRes = await httpsGet(url);
      if (detailRes.statusCode !== 200) continue;

      const detail = extractDetailFromHtml(detailRes.body, url, specialty);
      const combined = {
        job_id: card.job_id,
        url,
        title: detail.title,
        specialty: detail.specialty || specialty,
        employment_type: detail.employment_type,
        company: detail.company,
        location: detail.location,
        compensation: null,
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

      // Check Expiration Rule:
      // An ad is expired if validThrough is in the past, or if startDate is in the past and validThrough is not future.
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
        logger.info(`  [EXPIRED - PRUNED] "${normalized.title}" (Valid: ${validThrough || 'N/A'}, Start: ${startDate || 'N/A'})`);
        continue;
      }

      activeJobs.push(normalized);
      logger.success(`  [ACTIVE] "${normalized.title}" (${normalized.specialty}) - Starts/Valid: ${validThrough || startDate || 'Open'}`);
    } catch (err) {
      logger.warn(`Failed to process ${url}: ${err.message}`);
    }
  }

  logger.success(`\nScraping & Pruning Summary:`);
  logger.info(`Total Evaluated: ${uniqueJobUrls.size}`);
  logger.info(`Expired / Passed Dates Pruned: ${expiredCount}`);
  logger.success(`Active Verified Jobs Retained: ${activeJobs.length}`);

  // Save to dataset
  const outputPayload = {
    city: 'Toronto',
    cutoff_date: TODAY_ISO,
    total_jobs_scraped: activeJobs.length,
    pruned_expired_count: expiredCount,
    generated_at: new Date().toISOString(),
    jobs: activeJobs,
  };

  const jsonPath = path.resolve(__dirname, '../data/toronto_specialties_jobs.json');
  fs.writeFileSync(jsonPath, JSON.stringify(outputPayload, null, 2), 'utf8');
  logger.success(`Saved clean dataset to ${jsonPath}`);

  return activeJobs;
}

if (require.main === module) {
  scrapeActiveJobs()
    .then((jobs) => {
      console.log(`Successfully completed. ${jobs.length} active jobs saved.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal scraping error:', err);
      process.exit(1);
    });
}

module.exports = scrapeActiveJobs;
