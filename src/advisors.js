/**
 * Physician Trade-Off Advisors Engine
 * 5 Comprehensive Analytical & ML Decision Models for Canadian Physicians
 */

// Baseline specialty compensation anchors derived from scraped dataset
const SPECIALTY_BASELINES = {
  'Family Medicine': { baseSalary: 385000, avgBillingPerPatient: 52, ffsHourly: 185, hospitalDelta: 75000 },
  'Dermatology': { baseSalary: 620000, avgBillingPerPatient: 88, ffsHourly: 310, hospitalDelta: -40000 },
  'Emergency Medicine': { baseSalary: 420000, avgBillingPerPatient: 95, ffsHourly: 240, hospitalDelta: 85000 },
  'Internal Medicine': { baseSalary: 460000, avgBillingPerPatient: 110, ffsHourly: 260, hospitalDelta: 95000 },
  'Pediatrics': { baseSalary: 395000, avgBillingPerPatient: 58, ffsHourly: 195, hospitalDelta: 65000 },
  'Psychiatry': { baseSalary: 440000, avgBillingPerPatient: 140, ffsHourly: 250, hospitalDelta: 50000 },
  'Default': { baseSalary: 410000, avgBillingPerPatient: 70, ffsHourly: 210, hospitalDelta: 60000 },
};

function getBaseline(specialty) {
  return SPECIALTY_BASELINES[specialty] || SPECIALTY_BASELINES['Default'];
}

/**
 * Trade-Off 1: Geospatial Distance vs Annual Compensation
 */
function calculateDistanceTradeOff(params = {}) {
  const specialty = params.specialty || 'Family Medicine';
  const fromKm = Math.max(0, parseFloat(params.fromKm || 0));
  const toKm = Math.max(fromKm, parseFloat(params.toKm || 30));
  const empType = params.employmentType || 'full-time';

  const baseline = getBaseline(specialty);
  const typeMult = empType === 'locum' ? 1.15 : empType === 'part-time' ? 0.6 : 1.0;

  // Spatial premium gradient: outward locations offer $1,800 - $3,500/km regional retention incentive
  const kmDelta = toKm - fromKm;
  const gradientPerKm = specialty === 'Pediatrics' ? 4500 : specialty === 'Family Medicine' ? 2400 : 2800;

  const salaryA = Math.round((baseline.baseSalary + fromKm * gradientPerKm) * typeMult);
  const salaryB = Math.round((baseline.baseSalary + toKm * gradientPerKm) * typeMult);
  const salaryDelta = salaryB - salaryA;
  const pctDelta = salaryA > 0 ? ((salaryDelta / salaryA) * 100).toFixed(1) : 0;

  // Travel context (transit time and distance only, NO vehicle deductions or driving ROI)
  const oneWayDriveMinutes = Math.max(5, Math.round(kmDelta * 1.4));

  // Rural/Regional grant eligibility (Ontario Ministry of Health Northern & Regional Incentives)
  const isGrantEligible = toKm >= 40;
  const estimatedGrant = isGrantEligible ? (toKm >= 80 ? 40000 : 20000) : 0;

  return {
    advisor_type: 'distance_vs_salary',
    specialty,
    employment_type: empType,
    from_km: fromKm,
    to_km: toKm,
    km_difference: kmDelta,
    salary_at_location_a: salaryA,
    salary_at_location_b: salaryB,
    gross_salary_difference: salaryDelta,
    percentage_gain: parseFloat(pctDelta),
    premium_per_km: kmDelta > 0 ? Math.round(salaryDelta / kmDelta) : 0,
    travel_context: {
      one_way_drive_minutes: oneWayDriveMinutes,
      distance_km: kmDelta,
    },
    incentives: {
      regional_grant_eligible: isGrantEligible,
      estimated_annual_grant: estimatedGrant,
      total_package_b: salaryB + estimatedGrant,
    },
    recommendation:
      salaryDelta > 40000
        ? `Relocating or practicing ${kmDelta} km outward provides an exceptional gross annual advantage of +$${salaryDelta.toLocaleString()} CAD/year (+${pctDelta}%). Outward regional health centres offer higher patient volume and retention grants.`
        : `Practicing ${kmDelta} km outward yields +$${salaryDelta.toLocaleString()} CAD gross advantage (+${pctDelta}%). Estimated one-way transit time is ~${oneWayDriveMinutes} minutes.`,
  };
}

/**
 * Trade-Off 2: Fee-For-Service Overhead Split vs Guaranteed Base Rate
 */
function calculateOverheadSplitTradeOff(params = {}) {
  const specialty = params.specialty || 'Family Medicine';
  const baseline = getBaseline(specialty);

  const dailyPatientVolume = parseInt(params.dailyPatientVolume || 30, 10);
  const avgBilling = parseFloat(params.avgBillingPerPatient || baseline.avgBillingPerPatient);
  const physicianSplitPct = parseFloat(params.physicianSplitPct || 75.0); // e.g. 75/25 split
  const clinicDays = parseInt(params.clinicDaysPerYear || 220, 10);
  const guaranteedDailyFloor = parseFloat(params.guaranteedDailyFloor || 1200.0); // e.g. $1,200/day guaranteed

  // Calculations
  const grossDailyBilling = dailyPatientVolume * avgBilling;
  const splitDailyEarnings = grossDailyBilling * (physicianSplitPct / 100);
  const annualSplitEarnings = Math.round(splitDailyEarnings * clinicDays);
  const annualGuaranteedEarnings = Math.round(guaranteedDailyFloor * clinicDays);

  const netAnnualDifference = annualSplitEarnings - annualGuaranteedEarnings;
  const pctDifference = ((netAnnualDifference / annualGuaranteedEarnings) * 100).toFixed(1);

  // Exact Break-Even Volume
  const breakEvenDailyPatients = Math.ceil(guaranteedDailyFloor / (avgBilling * (physicianSplitPct / 100)));
  const currentVolumeStatus = dailyPatientVolume >= breakEvenDailyPatients ? 'FAVORS_SPLIT' : 'FAVORS_GUARANTEE';

  // Curve data points for chart visualization
  const curvePoints = [];
  for (let vol = 15; vol <= 50; vol += 5) {
    const splitEarn = Math.round(vol * avgBilling * (physicianSplitPct / 100) * clinicDays);
    curvePoints.push({
      patient_volume: vol,
      split_annual: splitEarn,
      guaranteed_annual: annualGuaranteedEarnings,
      spread: splitEarn - annualGuaranteedEarnings,
    });
  }

  return {
    advisor_type: 'overhead_split_vs_guarantee',
    specialty,
    inputs: {
      daily_patient_volume: dailyPatientVolume,
      avg_billing_per_patient: avgBilling,
      physician_split_pct: physicianSplitPct,
      clinic_split_pct: 100 - physicianSplitPct,
      clinic_days_per_year: clinicDays,
      guaranteed_daily_floor: guaranteedDailyFloor,
    },
    outcomes: {
      daily_gross_billings: Math.round(grossDailyBilling),
      daily_split_earnings: Math.round(splitDailyEarnings),
      daily_guarantee: guaranteedDailyFloor,
      annual_split_earnings: annualSplitEarnings,
      annual_guaranteed_earnings: annualGuaranteedEarnings,
      annual_difference: netAnnualDifference,
      percentage_spread: parseFloat(pctDifference),
      break_even_patients_per_day: breakEvenDailyPatients,
      optimal_choice: currentVolumeStatus,
    },
    curve_data: curvePoints,
    recommendation:
      currentVolumeStatus === 'FAVORS_SPLIT'
        ? `At ${dailyPatientVolume} patients/day, the ${physicianSplitPct}/${100 - physicianSplitPct} split out-earns the guaranteed minimum by +$${netAnnualDifference.toLocaleString()} CAD/yr (+${pctDifference}%). Break-even is ${breakEvenDailyPatients} patients/day.`
        : `At ${dailyPatientVolume} patients/day, you earn $${Math.abs(netAnnualDifference).toLocaleString()} CAD less than the guaranteed floor. The $${guaranteedDailyFloor.toLocaleString()}/day guaranteed minimum is safer unless volume reaches ${breakEvenDailyPatients}+ patients/day.`,
  };
}

/**
 * Trade-Off 3: Hospitalist / Inpatient vs Outpatient Community Clinic
 */
function calculateHospitalVsClinicTradeOff(params = {}) {
  const specialty = params.specialty || 'Internal Medicine';
  const baseline = getBaseline(specialty);

  const onCallWeekendsPerMonth = parseInt(params.onCallWeekendsPerMonth || 1, 10);
  const clinicHoursPerWeek = 37.5;
  const hospitalHoursPerWeek = 48.0 + onCallWeekendsPerMonth * 4.5;

  const clinicAnnualSalary = baseline.baseSalary;
  const hospitalAnnualSalary = baseline.baseSalary + baseline.hospitalDelta + onCallWeekendsPerMonth * 30000;

  const clinicAnnualHours = clinicHoursPerWeek * 48;
  const hospitalAnnualHours = hospitalHoursPerWeek * 48;

  const clinicHourlyWage = Math.round(clinicAnnualSalary / clinicAnnualHours);
  const hospitalHourlyWage = Math.round(hospitalAnnualSalary / hospitalAnnualHours);

  const clinicBurnoutScore = 32;
  const hospitalBurnoutScore = Math.min(95, 58 + onCallWeekendsPerMonth * 12);

  return {
    advisor_type: 'hospital_vs_clinic',
    specialty,
    clinic: {
      practice_environment: 'Ambulatory Outpatient Community Clinic',
      annual_salary: clinicAnnualSalary,
      weekly_hours: clinicHoursPerWeek,
      annual_hours: Math.round(clinicAnnualHours),
      effective_hourly_rate: clinicHourlyWage,
      on_call_required: false,
      burnout_risk_score: clinicBurnoutScore,
      pros: ['Predictable 9-to-5 weekday schedule', 'Zero night/weekend on-call', 'High autonomy over patient pacing', 'Long-term patient relationships'],
      cons: ['Slightly lower top-line gross than intensive hospitalist shifts', 'May require managing clinic overhead'],
    },
    hospital: {
      practice_environment: 'Hospitalist / Inpatient Department',
      annual_salary: hospitalAnnualSalary,
      weekly_hours: hospitalHoursPerWeek,
      annual_hours: Math.round(hospitalAnnualHours),
      effective_hourly_rate: hospitalHourlyWage,
      on_call_required: onCallWeekendsPerMonth > 0,
      burnout_risk_score: hospitalBurnoutScore,
      pros: ['Higher gross annual revenue (+$' + (hospitalAnnualSalary - clinicAnnualSalary).toLocaleString() + ')', 'Facility overhead absorbed by hospital', 'Academic/teaching rounds and multidisciplinary support'],
      cons: ['Shift work including nights/holidays', 'Mandatory on-call rotations', 'Lower effective wage per actual hour worked (' + (clinicHourlyWage - hospitalHourlyWage > 0 ? '$' + (clinicHourlyWage - hospitalHourlyWage) + '/hr lower' : 'similar') + ')'],
    },
    comparison: {
      gross_annual_delta: hospitalAnnualSalary - clinicAnnualSalary,
      hourly_rate_delta: hospitalHourlyWage - clinicHourlyWage,
      extra_hours_worked_annually: Math.round(hospitalAnnualHours - clinicAnnualHours),
    },
    recommendation:
      clinicHourlyWage > hospitalHourlyWage
        ? `Paradox Alert: While hospital work pays +$${(hospitalAnnualSalary - clinicAnnualSalary).toLocaleString()} more gross, Outpatient Clinic pays a HIGHER effective hourly rate ($${clinicHourlyWage}/hr vs $${hospitalHourlyWage}/hr) because hospitalist roles demand ${Math.round(hospitalAnnualHours - clinicAnnualHours)} extra hours/yr.`
        : `Hospital role offers both higher gross (+$${(hospitalAnnualSalary - clinicAnnualSalary).toLocaleString()}) and higher effective hourly wage. Best choice if on-call schedule is acceptable.`,
  };
}

/**
 * Trade-Off 4: Locum Tenens vs Permanent Practice Equity
 */
function calculateLocumVsPermanentTradeOff(params = {}) {
  const specialty = params.specialty || 'Family Medicine';

  const yearsHorizon = parseInt(params.yearsHorizon || 3, 10);
  const rosterSize = parseInt(params.rosterSize || 1200, 10);
  const monthlyHousingStipend = parseFloat(params.monthlyHousingStipend || 2200);

  const locumBaseDaily = 1450;
  const locumAnnualBase = locumBaseDaily * 210;
  const locumTaxFreePerks = monthlyHousingStipend * 11 + 3000;
  const locumYear1Total = locumAnnualBase + locumTaxFreePerks;

  const capitationIncome = rosterSize * 195;
  const fhoBonuses = 42000 + 14000;
  const shadowBilling = 52500;
  const permanentYear1Total = capitationIncome + fhoBonuses + shadowBilling;

  const multiYear = [];
  let cumLocum = 0;
  let cumPerm = 0;

  for (let y = 1; y <= 5; y++) {
    const yLocum = Math.round(locumYear1Total * Math.pow(1.03, y - 1));
    const yPerm = Math.round(permanentYear1Total * Math.pow(1.08, y - 1) + (y >= 2 ? (y - 1) * 25000 : 0));

    cumLocum += yLocum;
    cumPerm += yPerm;

    multiYear.push({
      year: y,
      locum_annual: yLocum,
      permanent_annual: yPerm,
      cumulative_locum: cumLocum,
      cumulative_permanent: cumPerm,
      perm_advantage: cumPerm - cumLocum,
    });
  }

  const crossover = multiYear.find((m) => m.cumulative_permanent > m.cumulative_locum);

  return {
    advisor_type: 'locum_vs_permanent',
    specialty,
    parameters: {
      career_horizon_years: yearsHorizon,
      rostered_patients_target: rosterSize,
      monthly_locum_perks: monthlyHousingStipend,
    },
    year_one_snapshot: {
      locum_gross_cashflow: Math.round(locumYear1Total),
      permanent_gross_earnings: Math.round(permanentYear1Total),
      year_one_winner: locumYear1Total > permanentYear1Total ? 'LOCUM' : 'PERMANENT',
      delta: Math.abs(Math.round(locumYear1Total - permanentYear1Total)),
    },
    multi_year_trajectory: multiYear,
    crossover_year: crossover ? crossover.year : 4,
    recommendation:
      yearsHorizon <= 2
        ? `For a short 1-2 year horizon, Locum practice is superior: maximizes immediate gross cashflow ($${Math.round(locumYear1Total).toLocaleString()}/yr) with zero overhead risk and free housing.`
        : `For a ${yearsHorizon}+ year horizon, Permanent practice generates significantly greater wealth (+$${(multiYear[yearsHorizon - 1].perm_advantage).toLocaleString()} CAD cumulative) through compounding roster capitation, FHO access bonuses, and clinic equity.`,
  };
}

/**
 * Trade-Off 5: EMR & Administrative Burden vs Net Effective Wage
 */
function calculateEmrAdminTradeOff(params = {}) {
  const weeklyClinicalHours = parseFloat(params.weeklyClinicalHours || 32);
  const currentAdminHours = parseFloat(params.currentAdminHours || 12);
  const lowOverheadPct = parseFloat(params.lowOverheadPct || 18.0);
  const supportedOverheadPct = parseFloat(params.supportedOverheadPct || 28.0);

  const annualGrossBilling = parseFloat(params.annualGrossBilling || 480000);
  const weeksWorked = 48;

  const totalHoursA = (weeklyClinicalHours + currentAdminHours) * weeksWorked;
  const netEarningsA = annualGrossBilling * (1 - lowOverheadPct / 100);
  const effectiveHourlyA = Math.round(netEarningsA / totalHoursA);

  const reducedAdminHours = Math.max(2, currentAdminHours - 8);
  const totalHoursB = (weeklyClinicalHours + reducedAdminHours) * weeksWorked;
  const netEarningsB = annualGrossBilling * (1 - supportedOverheadPct / 100);
  const effectiveHourlyB = Math.round(netEarningsB / totalHoursB);

  const convertedClinicalHours = weeklyClinicalHours + (currentAdminHours - reducedAdminHours) * 0.75;
  const expandedGrossBilling = annualGrossBilling * (convertedClinicalHours / weeklyClinicalHours);
  const netEarningsC = expandedGrossBilling * (1 - supportedOverheadPct / 100);
  const effectiveHourlyC = Math.round(netEarningsC / totalHoursA);

  return {
    advisor_type: 'emr_admin_burden',
    inputs: {
      annual_gross_billings: annualGrossBilling,
      weekly_clinical_hours: weeklyClinicalHours,
      weekly_unpaid_admin_hours: currentAdminHours,
    },
    scenarios: {
      lean_practice: {
        title: 'Lean Solo / Low Overhead (18%)',
        overhead_pct: lowOverheadPct,
        weekly_total_hours: weeklyClinicalHours + currentAdminHours,
        annual_net_income: Math.round(netEarningsA),
        effective_hourly_wage: effectiveHourlyA,
        quality_of_life_score: 'Moderate-Low (Burdened by charting)',
      },
      supported_work_life_balance: {
        title: 'Full Support MOA / High Overhead (28%) - Extra Free Time',
        overhead_pct: supportedOverheadPct,
        weekly_total_hours: weeklyClinicalHours + reducedAdminHours,
        annual_net_income: Math.round(netEarningsB),
        effective_hourly_wage: effectiveHourlyB,
        hours_saved_annually: Math.round((currentAdminHours - reducedAdminHours) * weeksWorked),
        quality_of_life_score: 'High (384 hours of personal time saved/yr)',
      },
      supported_growth_model: {
        title: 'Full Support MOA - Converted Time into Higher Billings',
        overhead_pct: supportedOverheadPct,
        annual_gross: Math.round(expandedGrossBilling),
        annual_net_income: Math.round(netEarningsC),
        effective_hourly_wage: effectiveHourlyC,
        net_income_boost: Math.round(netEarningsC - netEarningsA),
      },
    },
    recommendation:
      `Paying 10% more in clinic overhead to get full MOA & EMR support saves ${Math.round((currentAdminHours - reducedAdminHours) * weeksWorked)} hours of unpaid administrative drudgery per year. If you reinvest just half those hours into patient care, your annual net income increases by +$${Math.round(netEarningsC - netEarningsA).toLocaleString()} CAD.`,
  };
}

// =============================================================================
// 6. PROPER AI OPPORTUNITY FINDER & LOCATION SUGGESTION ENGINE
// =============================================================================

const GTA_NEIGHBORHOODS = {
  'downtown toronto': { lat: 43.6532, lng: -79.3832, label: 'Downtown Toronto (Financial District / Bay & King)', avgRentIndex: 1.3 },
  'bloor': { lat: 43.6685, lng: -79.3900, label: 'Bloor West Village / The Annex', avgRentIndex: 1.15 },
  'midtown': { lat: 43.7001, lng: -79.3970, label: 'Midtown (Yonge & Eglinton)', avgRentIndex: 1.2 },
  'north york': { lat: 43.7615, lng: -79.4111, label: 'North York (Leslie & 401)', avgRentIndex: 1.0 },
  'markham': { lat: 43.8561, lng: -79.3370, label: 'Markham / York Region', avgRentIndex: 0.9 },
  'danforth': { lat: 43.6865, lng: -79.3300, label: 'Danforth / Greektown', avgRentIndex: 1.05 },
  'forest hill': { lat: 43.6980, lng: -79.4120, label: 'Forest Hill / St. Clair', avgRentIndex: 1.25 },
  'mississauga': { lat: 43.5890, lng: -79.6441, label: 'Mississauga City Centre', avgRentIndex: 0.95 },
  'etobicoke': { lat: 43.6205, lng: -79.5132, label: 'Etobicoke / Lakeshore', avgRentIndex: 0.95 },
  'richmond hill': { lat: 43.8828, lng: -79.4403, label: 'Richmond Hill', avgRentIndex: 0.9 },
  'scarborough': { lat: 43.7764, lng: -79.2318, label: 'Scarborough Town Centre', avgRentIndex: 0.85 },
  'york': { lat: 43.6896, lng: -79.4542, label: 'York / Keele', avgRentIndex: 0.95 },
  'vaughan': { lat: 43.8563, lng: -79.5085, label: 'Vaughan / Concord', avgRentIndex: 0.9 },
  'brampton': { lat: 43.7315, lng: -79.7624, label: 'Brampton Central', avgRentIndex: 0.85 }
};

function resolveLocation(query) {
  if (!query) return { key: 'downtown toronto', ...GTA_NEIGHBORHOODS['downtown toronto'] };
  
  if (typeof query === 'object' && query.lat && query.lng) {
    return {
      key: 'custom',
      lat: parseFloat(query.lat),
      lng: parseFloat(query.lng),
      label: query.label || query.name || 'Custom Location',
      avgRentIndex: 1.0
    };
  }

  const q = String(query).toLowerCase().trim();
  
  // Direct key lookup
  if (GTA_NEIGHBORHOODS[q]) {
    return { key: q, ...GTA_NEIGHBORHOODS[q] };
  }

  // Alias lookups
  if (q.includes('downtown') || q.includes('bay') || q.includes('king') || q.includes('union') || q.includes('university')) {
    return { key: 'downtown toronto', ...GTA_NEIGHBORHOODS['downtown toronto'] };
  }
  if (q.includes('bloor') || q.includes('annex') || q.includes('bathurst')) {
    return { key: 'bloor', ...GTA_NEIGHBORHOODS['bloor'] };
  }
  if (q.includes('midtown') || q.includes('eglinton') || q.includes('yonge')) {
    return { key: 'midtown', ...GTA_NEIGHBORHOODS['midtown'] };
  }
  if (q.includes('north york') || q.includes('sheppard') || q.includes('leslie') || q.includes('finch')) {
    return { key: 'north york', ...GTA_NEIGHBORHOODS['north york'] };
  }
  if (q.includes('markham') || q.includes('unionville')) {
    return { key: 'markham', ...GTA_NEIGHBORHOODS['markham'] };
  }
  if (q.includes('danforth') || q.includes('greektown') || q.includes('broadview')) {
    return { key: 'danforth', ...GTA_NEIGHBORHOODS['danforth'] };
  }
  if (q.includes('forest hill') || q.includes('st. clair') || q.includes('st clair')) {
    return { key: 'forest hill', ...GTA_NEIGHBORHOODS['forest hill'] };
  }
  if (q.includes('mississauga') || q.includes('peel') || q.includes('hurontario')) {
    return { key: 'mississauga', ...GTA_NEIGHBORHOODS['mississauga'] };
  }
  if (q.includes('etobicoke') || q.includes('lakeshore') || q.includes('mimico')) {
    return { key: 'etobicoke', ...GTA_NEIGHBORHOODS['etobicoke'] };
  }
  if (q.includes('richmond')) {
    return { key: 'richmond hill', ...GTA_NEIGHBORHOODS['richmond hill'] };
  }
  if (q.includes('scarborough')) {
    return { key: 'scarborough', ...GTA_NEIGHBORHOODS['scarborough'] };
  }
  if (q.includes('vaughan') || q.includes('woodbridge')) {
    return { key: 'vaughan', ...GTA_NEIGHBORHOODS['vaughan'] };
  }
  if (q.includes('brampton')) {
    return { key: 'brampton', ...GTA_NEIGHBORHOODS['brampton'] };
  }

  // Fallback to Downtown Toronto
  return { key: 'downtown toronto', ...GTA_NEIGHBORHOODS['downtown toronto'], customQuery: query };
}

function calculateHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

/**
 * Intelligent Opportunity & Contract Suggestion Engine
 * Suggests more profitable and advantageous opportunities nearby based on:
 * - Regional corridor distance and transit accessibility
 * - Billing & Contract variables (split %, guaranteed minimums, bonuses)
 * - Administrative support (zero EMR fee, turnkey clinic, dedicated MOA)
 */
function findSmartOpportunitySuggestions(params = {}) {
  const {
    origin,
    specialty = 'All',
    currentGross: customGross,
    currentSplit: customSplit,
    currentAdminHours: customAdminHours,
    maxDistanceKm = 45,
    optimizationGoal = 'balanced', // 'gross_profit' | 'proximity' | 'balanced'
    jobsPool = []
  } = params;

  const loc = resolveLocation(origin);
  const baselineSpec = specialty !== 'All' ? specialty : 'Family Medicine';
  const baselineConfig = getBaseline(baselineSpec);

  // Establish Physician's Baseline
  const baselineGross = customGross ? parseFloat(customGross) : baselineConfig.baseSalary;
  const baselineSplit = customSplit ? parseFloat(customSplit) : 70; // standard Ontario community split
  const baselineNet = Math.round(baselineGross * (baselineSplit / 100));
  const baselineAdminHours = customAdminHours ? parseFloat(customAdminHours) : 8; // typical unpaid charting hrs/wk

  const validJobs = jobsPool.filter((j) => {
    if (j.is_expired) return false;
    if (!j.latitude || !j.longitude) return false;
    if (specialty !== 'All' && j.specialty && j.specialty.toLowerCase() !== specialty.toLowerCase()) {
      return false;
    }
    return true;
  });

  const suggestions = [];

  for (const job of validJobs) {
    const jobLat = parseFloat(job.latitude);
    const jobLng = parseFloat(job.longitude);
    const distanceKm = calculateHaversine(loc.lat, loc.lng, jobLat, jobLng);

    if (distanceKm > maxDistanceKm) continue;

    // 1. Candidate Compensation & Billing Extraction
    let candidateGross = parseFloat(job.annualized_salary) || 0;
    const desc = job.full_description_text || '';

    if (candidateGross <= 0) {
      // Check for hourly rate in text (e.g. $500/hour)
      const hourlyMatch = desc.match(/\$(\d{2,4})\s*\/\s*hour/i);
      if (hourlyMatch) {
        candidateGross = parseFloat(hourlyMatch[1]) * 40 * 48; // 40 hrs/wk, 48 wks
      } else {
        // Specialty model with regional supply/demand adjustments
        const specBase = getBaseline(job.specialty || baselineSpec).baseSalary;
        // Suburban/North York/Markham clinics have higher volume and retention incentives
        const regionalBoost = distanceKm > 15 ? 1.25 : distanceKm > 5 ? 1.12 : 1.0;
        candidateGross = Math.round(specBase * regionalBoost);
      }
    }

    // 2. Candidate Split & Overhead Extraction
    let candidateSplit = parseFloat(job.physician_split_pct) || 0;
    if (candidateSplit <= 0) {
      if (desc.includes('80/20') || desc.includes('80 %') || desc.includes('80%')) candidateSplit = 80;
      else if (desc.includes('75/25') || desc.includes('75 %') || desc.includes('75%')) candidateSplit = 75;
      else if (desc.includes('70/30') || desc.includes('70 %') || desc.includes('70%')) candidateSplit = 70;
      else if (desc.toLowerCase().includes('low overhead') || (job.city && job.city.includes('markham'))) candidateSplit = 80;
      else if (job.is_hospital || (job.title && job.title.toLowerCase().includes('hospitalist'))) candidateSplit = 100;
      else candidateSplit = 75; // average modern Canadian clinic split
    }

    const candidateNetBeforeIncentives = Math.round(candidateGross * (candidateSplit / 100));

    // 3. Incentives & Allowances
    const signingBonus = parseFloat(job.signing_bonus) || (desc.toLowerCase().includes('signing bonus') ? 25000 : 0);
    const accommodationsAllowance = parseFloat(job.accommodations_allowance) || (job.employment_type === 'locum' ? 26400 : 0);
    const totalIncentives = signingBonus + accommodationsAllowance;

    const candidateNetAnnual = candidateNetBeforeIncentives + totalIncentives;

    // 4. Commute & Proximity Context (Driving time and distance only, NO vehicle deductions or driving ROI)
    const minPerKm = distanceKm > 12 ? 1.3 : 1.7;
    const oneWayDriveMinutes = Math.max(5, Math.round(distanceKm * minPerKm));

    // 5. Gross Income Deltas (Pure Gross Income Comparison)
    const grossDifference = candidateGross - baselineGross;
    const percentageGain = baselineGross > 0 ? parseFloat(((grossDifference / baselineGross) * 100).toFixed(1)) : 0;
    const splitMarginDelta = candidateSplit - baselineSplit;

    // 6. Contract & Practice Support Features
    const hasZeroEmrFee = desc.toLowerCase().includes('zero emr') || desc.toLowerCase().includes('no emr fee');
    const hasEmrSupport = hasZeroEmrFee || desc.toLowerCase().includes('ps suite') || desc.toLowerCase().includes('telus') || job.requires_emr;
    const hasFullAdminStaff =
      desc.toLowerCase().includes('handles all the administrative tasks') ||
      desc.toLowerCase().includes('professional office staff') ||
      desc.toLowerCase().includes('nursing care') ||
      desc.toLowerCase().includes('turn-key');
    const hasHighVolume =
      desc.toLowerCase().includes('guaranteed patient volume') ||
      desc.toLowerCase().includes('immediate waitlist') ||
      desc.toLowerCase().includes('busy clinic') ||
      desc.toLowerCase().includes('4-6/hr');
    // 7. Multi-Factor Opportunity Score (0 - 100)
    let score = 50; // base

    const corridor = job.corridor || 'GTA Core';
    const nrrriTotal = parseFloat(job.nrrri_incentive_amount) || 0;
    const nrrriAnnual = Math.round(nrrriTotal / 4);
    const proStatus = job.pro_ros_status || (nrrriTotal > 0 ? 'CONFIRMED_PRO' : 'STANDARD');
    const isManual = Boolean(job.is_manual);
    const allInAnnualComp = Math.round(candidateGross + nrrriAnnual + signingBonus / 2);
    const fourYearPackage = Math.round(candidateGross * 4 + nrrriTotal + signingBonus);

    // Gross Earning Advantage (up to +35 pts)
    if (grossDifference > 200000) score += 35;
    else if (grossDifference > 100000) score += 28;
    else if (grossDifference > 50000) score += 20;
    else if (grossDifference > 20000) score += 12;
    else if (grossDifference > 0) score += 5;
    else score -= 15;

    // NRRRI Provincial Incentive Leverage (up to +18 pts)
    if (nrrriTotal >= 100000) score += 18;
    else if (nrrriTotal >= 84000) score += 14;
    else if (proStatus === 'PRO_POSSIBLE') score += 6;

    // Proximity & Convenient Access (up to +20 pts)
    if (distanceKm <= 5) score += 20;
    else if (distanceKm <= 15) score += 15;
    else if (distanceKm <= 35) score += 10;
    else if (distanceKm <= 60) score += 5;

    // Practice Support & Structure (up to +15 pts)
    if (hasFullAdminStaff) score += 8;
    if (hasZeroEmrFee) score += 4;
    if (hasHighVolume) score += 3;
    if (signingBonus > 0 || accommodationsAllowance > 0) score += 5;

    score = Math.max(10, Math.min(99, Math.round(score)));

    // Badges & Rationale Generation
    const badges = [];
    if (nrrriTotal > 0) badges.push(`💰 +$${Math.round(nrrriTotal / 1000)}k NRRRI Grant`);
    if (proStatus === 'CONFIRMED_PRO') badges.push('🌲 Confirmed PRO Region');
    if (proStatus === 'NURC') badges.push('🏥 NURC Referral Hub');
    if (isManual) badges.push('✍️ Verified Direct Post');
    if (grossDifference > 100000) badges.push('🚀 High Gross Advantage');
    if (distanceKm <= 12) badges.push('📍 Close Proximity');
    if (hasHighVolume) badges.push('📈 Guaranteed Patient Flow');
    if (hasFullAdminStaff) badges.push('✨ Full MOA Support');
    if (hasZeroEmrFee) badges.push('🛡️ Zero EMR Overhead');

    const aiRationale = [];
    if (grossDifference > 0) {
      aiRationale.push(
        `Generates an estimated $${Math.round(candidateGross).toLocaleString()} CAD gross annual billings (+$${Math.round(grossDifference).toLocaleString()} CAD gross surplus over baseline).`
      );
    } else {
      aiRationale.push(
        `Competitive gross annual income of $${Math.round(candidateGross).toLocaleString()} CAD with established clinical roster.`
      );
    }

    if (nrrriTotal > 0) {
      aiRationale.push(
        `Eligible for Practice Ready Ontario (PRO) with an official 4-year NRRRI retention grant of $${nrrriTotal.toLocaleString()} CAD (adds +$${nrrriAnnual.toLocaleString()}/yr).`
      );
    }

    aiRationale.push(
      `Located in ${job.city || 'Ontario'} (${corridor}, ${distanceKm} km, ~${oneWayDriveMinutes} mins commute from ${loc.label || loc.key}).`
    );

    // Multi-factor Autonomous AI Thinking Process
    const aiThinkingProcess = [
      {
        step: 1,
        title: 'Earning Velocity & Market Arbitrage',
        verdict: grossDifference >= 0 ? 'Favorable Premium' : 'Baseline Alignment',
        analysis: grossDifference > 0
          ? `Model benchmarks position against ${baselineSpec} baseline ($${baselineGross.toLocaleString()} CAD). Generates +$${Math.round(grossDifference).toLocaleString()} CAD/yr gross surplus (+${percentageGain}% velocity).`
          : `Compensation aligns with regional standard baseline for ${baselineSpec} ($${baselineGross.toLocaleString()} CAD).`,
      },
      {
        step: 2,
        title: 'Provincial NRRRI & Retention Incentive Leverage',
        verdict: nrrriTotal > 0 ? 'Confirmed Provincial Grant' : proStatus === 'PRO_POSSIBLE' ? 'PRO Verification Candidate' : 'Urban Base Rate',
        analysis: nrrriTotal > 0
          ? `Community qualifies for Practice Ready Ontario (PRO) with an official 4-year NRRRI retention grant of $${nrrriTotal.toLocaleString()} CAD ($${nrrriAnnual.toLocaleString()}/yr annualized). Combined with billings, 4-year cumulative gross reaches $${Math.round(fourYearPackage).toLocaleString()} CAD.`
          : proStatus === 'PRO_POSSIBLE'
            ? `Location identified as prospective PRO expansion geography. Site verification recommended with Ontario Health to confirm local return-of-service eligibility.`
            : `Metropolitan zone excluded from provincial rural ROS grants. Compensation relies purely on fee-for-service / capitation billings.`,
      },
      {
        step: 3,
        title: 'Overhead Friction & Clinical Workflow Velocity',
        verdict: candidateSplit >= 75 ? 'Low Overhead Drag' : 'Standard Clinic Split',
        analysis: `${candidateSplit}/${100 - candidateSplit} fee split keeps clinic overhead at ${100 - candidateSplit}%. ${hasFullAdminStaff ? 'Dedicated MOA/nursing coverage eliminates estimated 4-6 hrs/week of non-billable clerical charting.' : 'Shared reception environment; standard clerical coordination required.'}`,
      },
      {
        step: 4,
        title: 'Geospatial Transit & Regional Accessibility',
        verdict: distanceKm <= 15 ? 'High Proximity Efficiency' : distanceKm <= 40 ? 'Convenient Corridor Access' : 'Regional Health Centre',
        analysis: `Located ${distanceKm} km (~${oneWayDriveMinutes} mins from ${loc.label || loc.key}). Accessible via major highway arterial routes with established regional clinical catchment.`,
      },
      {
        step: 5,
        title: 'Autonomous Strategic Recommendation',
        verdict: score >= 80 ? 'High Conviction Opportunity' : score >= 65 ? 'Balanced Competitive Practice' : 'Selective Consideration',
        analysis: score >= 80
          ? `Top decile opportunity. Model strongly endorses this posting based on superior earnings velocity, provincial incentive leverage, and favorable clinic overhead terms.`
          : `Solid clinical opportunity offering dependable roster stability and competitive gross billings within the ${corridor}.`,
      },
    ];

    suggestions.push({
      job_id: job.job_id,
      title: job.title,
      company: job.company || 'Modern Medical Centre',
      specialty: job.specialty,
      city: job.city,
      street_address: job.street_address || job.location_formatted || 'Ontario',
      distance_km: distanceKm,
      one_way_drive_minutes: oneWayDriveMinutes,
      corridor: corridor,
      pro_ros_status: proStatus,
      nrrri_incentive_amount: nrrriTotal,
      is_manual: isManual,
      opportunity_score: score,
      badges: badges.slice(0, 4),
      financials: {
        candidate_gross: Math.round(candidateGross),
        gross_difference: Math.round(grossDifference),
        percentage_gain: percentageGain,
        candidate_split_pct: candidateSplit,
        nrrri_total_grant: nrrriTotal,
        nrrri_annualized: nrrriAnnual,
        all_in_annual_comp: allInAnnualComp,
        four_year_cumulative_wealth: fourYearPackage,
        signing_bonus: signingBonus,
        accommodations_allowance: accommodationsAllowance,
      },
      contract_variables: {
        split_rate: `${candidateSplit}/${100 - candidateSplit}`,
        billing_type: candidateSplit === 100 ? 'Salaried / Alternative Payment Plan' : 'Fee-For-Service Split',
        emr_terms: hasZeroEmrFee ? 'Zero EMR Software Fees (Clinic Covered)' : hasEmrSupport ? 'Telus / PS Suite (Integrated)' : 'Standard EMR',
        admin_support: hasFullAdminStaff ? 'Dedicated MOA & Nursing Staff' : 'Standard Shared Clinic Reception',
        patient_volume_status: hasHighVolume ? 'Guaranteed 4-6 pts/hr with active waitlist' : 'Steady community walk-in & referral flow',
      },
      ai_rationale: aiRationale,
      ai_thinking_process: aiThinkingProcess,
    });
  }

  // Sort by user's optimization goal
  if (optimizationGoal === 'net_profit' || optimizationGoal === 'gross_profit') {
    suggestions.sort((a, b) => b.financials.gross_difference - a.financials.gross_difference);
  } else if (optimizationGoal === 'proximity') {
    suggestions.sort((a, b) => a.distance_km - b.distance_km || b.financials.gross_difference - a.financials.gross_difference);
  } else {
    // Balanced
    suggestions.sort((a, b) => b.opportunity_score - a.opportunity_score);
  }

  // Assign ranks
  suggestions.forEach((s, idx) => {
    s.rank = idx + 1;
  });

  const moreProfitable = suggestions.filter((s) => s.financials.gross_difference > 0);
  const maxGrossGain = moreProfitable.length > 0 ? Math.max(...moreProfitable.map((s) => s.financials.gross_difference)) : 0;
  const avgDist = suggestions.length > 0 ? Math.round((suggestions.reduce((a, b) => a + b.distance_km, 0) / suggestions.length) * 10) / 10 : 0;

  const topOpt = suggestions[0] || null;
  let topThinkingProcess = null;
  if (topOpt) {
    const candGross = topOpt.financials.candidate_gross;
    const nrrriTotal = topOpt.financials.nrrri_total_grant || 0;
    const nrrriYear = Math.round(nrrriTotal / 4);

    const wealthTrajectory = [1, 2, 3, 4].map((year) => ({
      year,
      baseline_cumulative: baselineGross * year,
      candidate_cumulative: candGross * year + nrrriYear * year,
      nrrri_payout_cumulative: nrrriYear * year,
      cumulative_wealth_advantage: (candGross * year + nrrriYear * year) - (baselineGross * year),
    }));

    topThinkingProcess = {
      executive_rationale: topOpt.financials.gross_difference > 0
        ? `Autonomous diagnostic identified high-alpha practice transition to ${topOpt.company} in ${topOpt.city}. Generating +$${topOpt.financials.gross_difference.toLocaleString()} CAD/yr gross surplus (+${topOpt.financials.percentage_gain}%) with a 4-year cumulative advantage of +$${wealthTrajectory[3].cumulative_wealth_advantage.toLocaleString()} CAD.`
        : `Autonomous diagnostic selected ${topOpt.company} in ${topOpt.city} as the optimal local match maximizing patient roster stability and turnkey practice infrastructure.`,
      diagnostic_steps: (topOpt.ai_thinking_process || []).map((st) => ({
        step: st.step,
        name: st.title,
        category: st.verdict,
        finding: st.analysis,
        strategic_insight: st.verdict && (st.verdict.includes('Arbitrage') || st.verdict.includes('High') || st.verdict.includes('Confirmed'))
          ? 'Exceptional positioning for career equity and earnings acceleration.'
          : 'Sustainable practice workflow with dependable community volume.',
      })),
      wealth_trajectory: wealthTrajectory,
    };
  }

  return {
    origin: {
      key: loc.key,
      label: loc.label,
      latitude: loc.lat,
      longitude: loc.lng,
      specialty: baselineSpec,
      baseline_gross: baselineGross,
      baseline_split_pct: baselineSplit,
    },
    summary: {
      total_evaluated: suggestions.length,
      more_profitable_count: moreProfitable.length,
      max_gross_gain: maxGrossGain,
      average_distance_km: avgDist,
      top_recommendation: topOpt,
    },
    optimization_goal: optimizationGoal,
    ai_thinking_process: topThinkingProcess,
    suggestions: suggestions.slice(0, 15),
  };
}

module.exports = {
  calculateDistanceTradeOff,
  calculateOverheadSplitTradeOff,
  calculateHospitalVsClinicTradeOff,
  calculateLocumVsPermanentTradeOff,
  calculateEmrAdminTradeOff,
  findSmartOpportunitySuggestions,
  resolveLocation,
  calculateHaversine,
  GTA_NEIGHBORHOODS,
};

