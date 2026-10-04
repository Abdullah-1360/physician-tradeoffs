/**
 * ML Feature Normalizer for Medical Job Compensation & Geospatial Distance
 */

// Anchor Point: Downtown Toronto (City Hall / Financial District)
const TORONTO_CENTER = {
  lat: 43.6532,
  lng: -79.3832,
};

// Known coordinates across Greater Toronto Area & surrounding Ontario cities & boroughs
const CITY_COORDINATES = {
  toronto: { lat: 43.6532, lng: -79.3832 },
  'old toronto': { lat: 43.6532, lng: -79.3832 },
  'downtown toronto': { lat: 43.6532, lng: -79.3832 },
  downtown: { lat: 43.6532, lng: -79.3832 },
  bloor: { lat: 43.6685, lng: -79.3900 },
  midtown: { lat: 43.7001, lng: -79.3970 },
  danforth: { lat: 43.6865, lng: -79.3300 },
  'forest hill': { lat: 43.6980, lng: -79.4120 },
  davisville: { lat: 43.7011, lng: -79.3971 },
  'east york': { lat: 43.6912, lng: -79.3416 },
  york: { lat: 43.6896, lng: -79.4542 },
  'north york': { lat: 43.7615, lng: -79.4111 },
  etobicoke: { lat: 43.6205, lng: -79.5132 },
  scarborough: { lat: 43.7764, lng: -79.2318 },
  mississauga: { lat: 43.5890, lng: -79.6441 },
  brampton: { lat: 43.7315, lng: -79.7624 },
  vaughan: { lat: 43.8563, lng: -79.5085 },
  markham: { lat: 43.8561, lng: -79.3370 },
  'richmond hill': { lat: 43.8828, lng: -79.4403 },
  oakville: { lat: 43.4675, lng: -79.6877 },
  burlington: { lat: 43.3255, lng: -79.7990 },
  milton: { lat: 43.5183, lng: -79.8774 },
  ajax: { lat: 43.8509, lng: -79.0204 },
  pickering: { lat: 43.8384, lng: -79.0868 },
  whitby: { lat: 43.8975, lng: -78.9429 },
  oshawa: { lat: 43.8971, lng: -78.8658 },
  newmarket: { lat: 44.0592, lng: -79.4613 },
  aurora: { lat: 44.0001, lng: -79.4663 },
  barrie: { lat: 44.3894, lng: -79.6903 },
  hamilton: { lat: 43.2557, lng: -79.8711 },
  guelph: { lat: 43.5448, lng: -80.2482 },
  kitchener: { lat: 43.4516, lng: -80.4925 },
  waterloo: { lat: 43.4643, lng: -80.5204 },
  cambridge: { lat: 43.3616, lng: -80.3144 },
  'st. catharines': { lat: 43.1594, lng: -79.2469 },
  'niagara falls': { lat: 43.0896, lng: -79.0849 },
  london: { lat: 42.9849, lng: -81.2453 },
  kingston: { lat: 44.2312, lng: -76.4860 },
  ottawa: { lat: 45.4215, lng: -75.6972 },
};

/**
 * Calculates Haversine distance in kilometers between two geo-coordinates
 */
function calculateHaversineDistanceKm(lat1, lon1, lat2, lon2) {
  if (lat1 === null || lon1 === null || lat2 === null || lon2 === null) return null;
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

/**
 * Resolves latitude and longitude for a given city / location string with postal code & borough fallback
 */
function resolveCoordinates(cityStr, locationStr, titleStr = '', textStr = '', postalCodeStr = '') {
  const normalize = (s) => (s || '').toLowerCase().trim();
  const searchPool = `${normalize(titleStr)} ${normalize(locationStr)} ${normalize(postalCodeStr)} ${normalize(cityStr)} ${normalize(textStr ? textStr.slice(0, 600) : '')}`;

  // 1. Postal Code FSA (Forward Sortation Area) resolution
  if (postalCodeStr) {
    const fsa = postalCodeStr.trim().toUpperCase().slice(0, 3);
    const fsa2 = postalCodeStr.trim().toUpperCase().slice(0, 2);
    if (fsa2 === 'M2' || fsa2 === 'M3') return { ...CITY_COORDINATES['north york'], city_resolved: 'north york' };
    if (fsa2 === 'M1') return { ...CITY_COORDINATES['scarborough'], city_resolved: 'scarborough' };
    if (fsa2 === 'M8' || fsa2 === 'M9') return { ...CITY_COORDINATES['etobicoke'], city_resolved: 'etobicoke' };
    if (fsa2 === 'L5') return { ...CITY_COORDINATES['mississauga'], city_resolved: 'mississauga' };
    if (fsa.startsWith('L3P') || fsa.startsWith('L3R') || fsa.startsWith('L3S') || fsa.startsWith('L6B') || fsa.startsWith('L6C')) {
      return { ...CITY_COORDINATES['markham'], city_resolved: 'markham' };
    }
    if (fsa.startsWith('L4B') || fsa.startsWith('L4C') || fsa.startsWith('L4E') || fsa.startsWith('L4S')) {
      return { ...CITY_COORDINATES['richmond hill'], city_resolved: 'richmond hill' };
    }
    if (fsa.startsWith('L4H') || fsa.startsWith('L4J') || fsa.startsWith('L4K') || fsa.startsWith('L4L')) {
      return { ...CITY_COORDINATES['vaughan'], city_resolved: 'vaughan' };
    }
    if (fsa.startsWith('L6H') || fsa.startsWith('L6J') || fsa.startsWith('L6K') || fsa.startsWith('L6L')) {
      return { ...CITY_COORDINATES['oakville'], city_resolved: 'oakville' };
    }
    if (fsa2 === 'L7') return { ...CITY_COORDINATES['burlington'], city_resolved: 'burlington' };
    if (fsa2 === 'L8' || fsa2 === 'L9') return { ...CITY_COORDINATES['hamilton'], city_resolved: 'hamilton' };
  }

  // 2. Specific GTA outer satellite cities (check first before generic 'toronto')
  const outerCities = [
    'markham', 'richmond hill', 'vaughan', 'brampton', 'mississauga',
    'oakville', 'burlington', 'milton', 'ajax', 'pickering', 'whitby', 'oshawa',
    'newmarket', 'aurora', 'barrie', 'hamilton', 'guelph', 'kitchener',
    'waterloo', 'cambridge', 'st. catharines', 'niagara falls', 'london',
    'kingston', 'ottawa'
  ];

  for (const c of outerCities) {
    if (searchPool.includes(c)) {
      return { ...CITY_COORDINATES[c], city_resolved: c };
    }
  }

  // 3. Specific Toronto Boroughs & Sub-neighborhoods
  const boroughs = [
    'north york', 'scarborough', 'etobicoke', 'east york', 'forest hill',
    'danforth', 'midtown', 'davisville', 'bloor', 'york'
  ];

  for (const b of boroughs) {
    if (searchPool.includes(b)) {
      return { ...CITY_COORDINATES[b], city_resolved: b };
    }
  }

  // 4. Default to Downtown Toronto
  return { ...TORONTO_CENTER, city_resolved: 'downtown toronto' };
}

/**
 * Normalizes raw compensation text into standardized numeric salary targets
 */
function parseCompensation(compText, fullText = '') {
  const combined = `${compText || ''} ${fullText || ''}`.replace(/,/g, '');

  let pay_rate_type = 'unspecified';
  let salary_min = null;
  let salary_max = null;
  let salary_avg = null;
  let annualized_salary = null;

  let physician_split_pct = null;
  let clinic_split_pct = null;
  let signing_bonus = null;
  let relocation_bonus = null;
  let accommodations_allowance = null;
  let travel_allowance = null;

  // 1. Hourly rate (e.g. "$149.78 per hour", "$150/hr")
  const hourlyMatch = combined.match(/\$([0-9]+(?:\.[0-9]{2})?)\s*(?:per\s*hour|\/hr|\/hour|an\s*hour)/i);
  if (hourlyMatch) {
    const rate = parseFloat(hourlyMatch[1]);
    if (rate > 20 && rate < 1000) {
      pay_rate_type = 'hourly';
      salary_avg = rate;
      salary_min = rate;
      salary_max = rate;
      // Standard annualization: 2000 hours/year
      annualized_salary = Math.round(rate * 2000);
    }
  }

  // 2. Daily minimum / daily rate (e.g. "$1200 guaranteed daily", "$1,200/day")
  const dailyMatch = combined.match(/\$([0-9]{3,4})\s*(?:guaranteed\s*daily|per\s*day|\/day|daily\s*minimum)/i);
  if (dailyMatch && !annualized_salary) {
    const rate = parseFloat(dailyMatch[1]);
    if (rate >= 400 && rate <= 5000) {
      pay_rate_type = 'daily';
      salary_avg = rate;
      salary_min = rate;
      salary_max = rate;
      // Standard annualization: 220 clinic days/year
      annualized_salary = Math.round(rate * 220);
    }
  }

  // 3. Annual salary range (e.g. "$250000 - $400000 CAD", "$250000 to $400000")
  const annualRangeMatch = combined.match(/\$([0-9]{5,7})\s*(?:-|to)\s*\$?([0-9]{5,7})/i);
  if (annualRangeMatch && !annualized_salary) {
    const min = parseFloat(annualRangeMatch[1]);
    const max = parseFloat(annualRangeMatch[2]);
    if (min >= 50000 && max <= 2000000 && min < max) {
      pay_rate_type = 'annual';
      salary_min = min;
      salary_max = max;
      salary_avg = Math.round((min + max) / 2);
      annualized_salary = salary_avg;
    }
  }

  // 4. Single annual salary figure (e.g. "$350000 gross annual", "$300000 per year")
  const singleAnnualMatch = combined.match(/\$([0-9]{5,7})\s*(?:gross\s*annual|per\s*annum|per\s*year|\/year|\/yr)/i);
  if (singleAnnualMatch && !annualized_salary) {
    const amt = parseFloat(singleAnnualMatch[1]);
    if (amt >= 50000 && amt <= 2000000) {
      pay_rate_type = 'annual';
      salary_min = amt;
      salary_max = amt;
      salary_avg = amt;
      annualized_salary = amt;
    }
  }

  // 5. Fee-for-Service & Overhead Splits (e.g. "70/30 split", "overhead 75/25")
  const splitMatch = combined.match(/(\d{2})\s*\/\s*(\d{2})\s*(?:split|overhead)?/i);
  if (splitMatch) {
    const p1 = parseFloat(splitMatch[1]);
    const p2 = parseFloat(splitMatch[2]);
    if (p1 + p2 === 100) {
      physician_split_pct = p1 > p2 ? p1 : p2;
      clinic_split_pct = p1 > p2 ? p2 : p1;
      if (pay_rate_type === 'unspecified') {
        pay_rate_type = 'fee_for_service_split';
      }
    }
  }

  // 6. Signing Bonus (e.g. "signing bonus up to $10000")
  const signingMatch = combined.match(/signing\s*bonus\s*(?:up\s*to\s*)?\$([0-9]{3,6})/i);
  if (signingMatch) {
    signing_bonus = parseFloat(signingMatch[1]);
  }

  // 7. Relocation Bonus (e.g. "relocation bonus up to $8000")
  const relocMatch = combined.match(/relocation\s*(?:bonus|allowance|benefit)?\s*(?:up\s*to\s*)?\$([0-9]{3,6})/i);
  if (relocMatch) {
    relocation_bonus = parseFloat(relocMatch[1]);
  }

  // 8. Accommodations Allowance (e.g. "accommodations up to $300 per night")
  const accomMatch = combined.match(/accommodations?\s*(?:up\s*to\s*)?\$([0-9]{2,4})/i);
  if (accomMatch) {
    accommodations_allowance = parseFloat(accomMatch[1]);
  }

  // 9. Travel Allowance (e.g. "air fare up to $1500")
  const travelMatch = combined.match(/(?:travel\s*expenses?|air\s*fare)\s*(?:including\s*)?(?:up\s*to\s*)?\$([0-9]{3,5})/i);
  if (travelMatch) {
    travel_allowance = parseFloat(travelMatch[1]);
  }

  return {
    pay_rate_type,
    salary_min,
    salary_max,
    salary_avg,
    annualized_salary,
    physician_split_pct,
    clinic_split_pct,
    signing_bonus,
    relocation_bonus,
    accommodations_allowance,
    travel_allowance,
  };
}

/**
 * Normalizes a raw scraped job into a complete ML-ready feature record
 */
function normalizeJobRecord(job) {
  const fullText = (job.full_description_text || '').toLowerCase();
  const company = (job.company || '').toLowerCase();
  const title = (job.title || '').toLowerCase();

  // Location and Geospatial calculations
  const city = job.location?.city || job.city || 'Toronto';
  const locationFormatted = typeof job.location === 'string' ? job.location : (job.location?.formatted || `${city}, ON`);
  const streetAddress = job.raw_json_ld?.jobLocation?.address?.streetAddress || job.location?.street_address || '';
  const postalCode = job.raw_json_ld?.jobLocation?.address?.postalCode || job.location?.postal_code || '';
  
  const coords = resolveCoordinates(
    city,
    `${locationFormatted} ${streetAddress}`,
    job.title || '',
    job.full_description_text || '',
    postalCode
  );

  const distanceFromToronto =
    coords.lat !== null && coords.lng !== null
      ? calculateHaversineDistanceKm(TORONTO_CENTER.lat, TORONTO_CENTER.lng, coords.lat, coords.lng)
      : 0.0;

  // Compensation Normalization
  const compNorm = parseCompensation(job.compensation, job.full_description_text);

  // Binary Medical Practice Features
  const is_hospital =
    company.includes('hospital') ||
    company.includes('health sciences') ||
    company.includes('uhn') ||
    company.includes('mount sinai') ||
    company.includes('sunnybrook') ||
    company.includes('st. michael') ||
    company.includes('unity health') ||
    title.includes('hospitalist');

  const requires_emr =
    fullText.includes('emr') ||
    fullText.includes('accuro') ||
    fullText.includes('oscar') ||
    fullText.includes('epic') ||
    fullText.includes('electronic medical record');

  const requires_cfpc =
    fullText.includes('cfpc') ||
    fullText.includes('ccfp') ||
    fullText.includes('college of family physicians');

  const requires_cpso =
    fullText.includes('cpso') ||
    fullText.includes('cpsns') ||
    fullText.includes('college of physicians');

  const today = new Date().toISOString().slice(0, 10);
  const validThrough = job.dates?.valid_through || job.json_ld?.validThrough?.slice(0, 10) || null;
  const startDate = job.dates?.start_date || job.start_date || null;
  const closingDate = job.dates?.closing_date || validThrough || null;

  // Check if ad is expired based on passed joining date or validity window
  let is_expired = false;
  if (validThrough && validThrough < today) {
    is_expired = true;
  } else if (closingDate && closingDate < today) {
    is_expired = true;
  } else if (startDate && startDate < today && (!validThrough || validThrough < today)) {
    is_expired = true;
  }

  return {
    job_id: job.job_id,
    url: job.url,
    title: job.title,
    specialty: job.specialty,
    employment_type: job.employment_type || 'full-time',
    company: job.company || 'Private Practice',
    city: coords.city_resolved,
    province: job.location?.province || 'ON',
    street_address: job.location?.street_address || null,
    location_formatted: locationFormatted,
    latitude: coords.lat,
    longitude: coords.lng,
    distance_from_toronto_km: distanceFromToronto,
    compensation_raw: job.compensation || null,
    pay_rate_type: compNorm.pay_rate_type,
    salary_min: compNorm.salary_min,
    salary_max: compNorm.salary_max,
    salary_avg: compNorm.salary_avg,
    annualized_salary: compNorm.annualized_salary,
    physician_split_pct: compNorm.physician_split_pct,
    clinic_split_pct: compNorm.clinic_split_pct,
    signing_bonus: compNorm.signing_bonus,
    relocation_bonus: compNorm.relocation_bonus,
    accommodations_allowance: compNorm.accommodations_allowance,
    travel_allowance: compNorm.travel_allowance,
    is_hospital: Boolean(is_hospital),
    requires_emr: Boolean(requires_emr),
    requires_cfpc: Boolean(requires_cfpc),
    requires_cpso: Boolean(requires_cpso),
    is_application_gated: Boolean(job.application?.is_gated),
    gate_message: job.application?.gate_message || null,
    posted_date: job.dates?.posted_date || null,
    closing_date: closingDate,
    start_date: startDate,
    valid_through: validThrough,
    is_expired: Boolean(is_expired),
    contact_emails: job.contact_emails || [],
    description_summary: job.description_summary || '',
    full_description_text: job.full_description_text || '',
    structured_sections: job.structured_sections || {},
    external_links: job.external_links || [],
    raw_json_ld: job.json_ld || null,
    scraped_at: job.scraped_at || new Date().toISOString(),
  };
}

module.exports = {
  TORONTO_CENTER,
  CITY_COORDINATES,
  calculateHaversineDistanceKm,
  resolveCoordinates,
  parseCompensation,
  normalizeJobRecord,
};
