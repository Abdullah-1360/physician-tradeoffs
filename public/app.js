/**
 * PhysicianTradeOffs Client Application
 * Interactive Visual Intelligence & Real-time Trade-off Simulators
 */

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initHealthAndOverview();
  initOpportunityFinder();
  initDistanceAdvisor();
  initSplitAdvisor();
  initHospitalAdvisor();
  initLocumAdvisor();
  initEmrAdvisor();
  initJobsExplorer();
});

// =============================================================================
// 1. Tab Switching System
// =============================================================================
function initTabs() {
  const tabButtons = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.panel-view');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.remove('is-active'));
      panels.forEach((p) => p.classList.remove('is-active'));

      btn.classList.add('is-active');
      const targetId = btn.getAttribute('data-target');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) {
        targetPanel.classList.add('is-active');
      }

      // If switching to finder, distance, or split tab, trigger simulation / canvas redraw
      if (targetId === 'panel-finder') {
        runOpportunitySimulation();
      } else if (targetId === 'panel-distance') {
        runDistanceSimulation();
      } else if (targetId === 'panel-split') {
        runSplitSimulation();
      }
    });
  });
}

// =============================================================================
// 2. Health & Market Overview
// =============================================================================
async function initHealthAndOverview() {
  try {
    const healthRes = await fetch('/api/health');
    const healthData = await healthRes.json();

    const statusBadge = document.getElementById('db-status-badge');
    const statusText = document.getElementById('db-status-text');
    const headerJobs = document.getElementById('header-job-count');

    if (healthData.database_connected) {
      statusText.innerText = 'PostgreSQL Live Connected';
      statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
      statusText.innerText = 'PostgreSQL Initialized (96 Seeded Jobs)';
      statusBadge.style.borderColor = 'rgba(56, 189, 248, 0.4)';
    }

    headerJobs.innerText = `${healthData.total_jobs} Jobs`;
    document.getElementById('kpi-total-jobs').innerText = healthData.total_jobs;

    const statsRes = await fetch('/api/stats/overview');
    const statsData = await statsRes.json();
    const ov = statsData.overview;

    if (ov) {
      if (ov.avg_salary) {
        document.getElementById('kpi-avg-salary').innerText = `$${parseInt(ov.avg_salary, 10).toLocaleString()}`;
      }
      if (ov.max_salary) {
        document.getElementById('kpi-max-salary').innerText = `$${parseInt(ov.max_salary, 10).toLocaleString()}`;
      }
    }

    renderSpecialtyBars(statsData.specialties || []);
  } catch (err) {
    console.warn('API fetch warning:', err);
  }
}

function renderSpecialtyBars(specialties) {
  const container = document.getElementById('specialty-bars-container');
  if (!container) return;
  container.innerHTML = '';

  const maxCount = Math.max(...specialties.map((s) => s.count || 1), 20);

  specialties.forEach((spec) => {
    const pct = Math.round(((spec.count || 0) / maxCount) * 100);
    const row = document.createElement('div');
    row.className = 'spec-bar-row';
    row.innerHTML = `
      <div class="spec-bar-header">
        <span>${spec.specialty}</span>
        <span class="text-cyan">${spec.count} Open Positions</span>
      </div>
      <div class="spec-bar-track">
        <div class="spec-bar-fill" style="width: ${pct}%"></div>
      </div>
    `;
    container.appendChild(row);
  });
}

// =============================================================================
// 3. Trade-off 1: Geospatial Distance vs Salary Advisor
// =============================================================================
function initDistanceAdvisor() {
  const fromKmInput = document.getElementById('dist-from-km');
  const toKmInput = document.getElementById('dist-to-km');
  const specSelect = document.getElementById('dist-specialty-select');
  const typeSelect = document.getElementById('dist-type-select');
  const btnRun = document.getElementById('btn-run-distance');

  fromKmInput.addEventListener('input', () => {
    document.getElementById('dist-from-km-display').innerText = `${fromKmInput.value} km (Downtown)`;
    runDistanceSimulation();
  });

  toKmInput.addEventListener('input', () => {
    document.getElementById('dist-to-km-display').innerText = `${toKmInput.value} km (Regional)`;
    runDistanceSimulation();
  });

  specSelect.addEventListener('change', runDistanceSimulation);
  typeSelect.addEventListener('change', runDistanceSimulation);
  btnRun.addEventListener('click', runDistanceSimulation);

  runDistanceSimulation();
}

async function runDistanceSimulation() {
  const specialty = document.getElementById('dist-specialty-select').value;
  const employmentType = document.getElementById('dist-type-select').value;
  const fromKm = parseInt(document.getElementById('dist-from-km').value, 10);
  const toKm = parseInt(document.getElementById('dist-to-km').value, 10);

  try {
    const res = await fetch('/api/advisors/distance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specialty, employmentType, fromKm, toKm }),
    });
    const data = await res.json();

    document.getElementById('res-dist-a-label').innerText = `${data.from_km} km`;
    document.getElementById('res-dist-b-label').innerText = `${data.to_km} km`;
    document.getElementById('res-dist-salary-a').innerText = `$${data.salary_at_location_a.toLocaleString()}`;
    document.getElementById('res-dist-salary-b').innerText = `$${data.salary_at_location_b.toLocaleString()}`;

    const sign = data.gross_salary_difference >= 0 ? '+' : '';
    document.getElementById('res-dist-delta').innerText = `${sign}$${data.gross_salary_difference.toLocaleString()} (${sign}${data.percentage_gain}%)`;
    document.getElementById('res-dist-per-km').innerText = `+$${data.premium_per_km.toLocaleString()} / km`;
    document.getElementById('res-dist-net').innerText = `$${data.commute_impact.net_annual_gain.toLocaleString()}`;
    document.getElementById('res-dist-hourly-drive').innerText = `$${data.commute_impact.net_wage_per_commute_hour.toLocaleString()} / hr driving`;
    document.getElementById('res-dist-recommendation').innerHTML = `<strong>Advisor Recommendation:</strong> ${data.recommendation}`;

    drawDistanceCanvas(data.from_km, data.to_km, data.salary_at_location_a, data.salary_at_location_b);
  } catch (err) {
    console.error('Distance simulation error:', err);
  }
}

function drawDistanceCanvas(fromKm, toKm, salA, salB) {
  const canvas = document.getElementById('canvas-distance-curve');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Background grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let y = 30; y < h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(w - 20, y);
    ctx.stroke();
  }

  // Baseline to Destination Curve
  const paddingX = 60;
  const paddingY = 40;
  const minSal = Math.min(salA, salB) * 0.9;
  const maxSal = Math.max(salA, salB) * 1.1;

  const getX = (km) => paddingX + (km / 100) * (w - paddingX - 40);
  const getY = (sal) => h - paddingY - ((sal - minSal) / (maxSal - minSal)) * (h - 2 * paddingY);

  const xA = getX(fromKm);
  const yA = getY(salA);
  const xB = getX(toKm);
  const yB = getY(salB);

  // Gradient path
  const grad = ctx.createLinearGradient(xA, yA, xB, yB);
  grad.addColorStop(0, '#6366f1');
  grad.addColorStop(1, '#06b6d4');

  ctx.beginPath();
  ctx.strokeStyle = grad;
  ctx.lineWidth = 4;
  ctx.moveTo(xA, yA);
  ctx.bezierCurveTo(xA + (xB - xA) * 0.5, yA, xA + (xB - xA) * 0.5, yB, xB, yB);
  ctx.stroke();

  // Point A Dot
  ctx.fillStyle = '#818cf8';
  ctx.beginPath();
  ctx.arc(xA, yA, 7, 0, 2 * Math.PI);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.font = '11px Plus Jakarta Sans';
  ctx.fillText(`Loc A (${fromKm}km): $${(salA / 1000).toFixed(0)}k`, xA - 20, yA - 14);

  // Point B Dot
  ctx.fillStyle = '#34d399';
  ctx.beginPath();
  ctx.arc(xB, yB, 7, 0, 2 * Math.PI);
  ctx.fill();

  ctx.fillText(`Loc B (${toKm}km): $${(salB / 1000).toFixed(0)}k`, xB - 40, yB - 14);
}

// =============================================================================
// 4. Trade-off 2: Overhead Split vs Guarantee
// =============================================================================
function initSplitAdvisor() {
  const volInput = document.getElementById('split-patient-vol');
  const pctInput = document.getElementById('split-physician-pct');
  const floorInput = document.getElementById('split-guarantee-floor');
  const specSelect = document.getElementById('split-specialty');
  const btnRun = document.getElementById('btn-run-split');

  volInput.addEventListener('input', () => {
    document.getElementById('split-vol-display').innerText = `${volInput.value} patients / day`;
    runSplitSimulation();
  });

  pctInput.addEventListener('input', () => {
    document.getElementById('split-pct-display').innerText = `${pctInput.value}% (${pctInput.value}/${100 - pctInput.value} split)`;
    runSplitSimulation();
  });

  floorInput.addEventListener('input', () => {
    document.getElementById('split-floor-display').innerText = `$${parseInt(floorInput.value, 10).toLocaleString()} / day`;
    runSplitSimulation();
  });

  specSelect.addEventListener('change', runSplitSimulation);
  btnRun.addEventListener('click', runSplitSimulation);

  runSplitSimulation();
}

async function runSplitSimulation() {
  const specialty = document.getElementById('split-specialty').value;
  const dailyPatientVolume = parseInt(document.getElementById('split-patient-vol').value, 10);
  const physicianSplitPct = parseFloat(document.getElementById('split-physician-pct').value);
  const guaranteedDailyFloor = parseFloat(document.getElementById('split-guarantee-floor').value);

  try {
    const res = await fetch('/api/advisors/overhead-split', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specialty, dailyPatientVolume, physicianSplitPct, guaranteedDailyFloor }),
    });
    const data = await res.json();
    const out = data.outcomes;

    document.getElementById('res-split-guarantee-ann').innerText = `$${out.annual_guaranteed_earnings.toLocaleString()}`;
    document.getElementById('res-split-split-ann').innerText = `$${out.annual_split_earnings.toLocaleString()}`;
    document.getElementById('res-split-breakeven').innerText = `${out.break_even_patients_per_day} patients / day`;
    document.getElementById('res-split-recommendation').innerHTML = `<strong>Recommendation:</strong> ${data.recommendation}`;

    drawSplitCanvas(data.curve_data, out.break_even_patients_per_day, dailyPatientVolume);
  } catch (err) {
    console.error('Split simulation error:', err);
  }
}

function drawSplitCanvas(curveData, breakEven, currentVol) {
  const canvas = document.getElementById('canvas-split-curve');
  if (!canvas || !curveData || curveData.length === 0) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const paddingX = 50;
  const paddingY = 30;
  const minSal = curveData[0].split_annual * 0.8;
  const maxSal = curveData[curveData.length - 1].split_annual * 1.1;

  const minVol = curveData[0].patient_volume;
  const maxVol = curveData[curveData.length - 1].patient_volume;

  const getX = (vol) => paddingX + ((vol - minVol) / (maxVol - minVol)) * (w - paddingX - 40);
  const getY = (sal) => h - paddingY - ((sal - minSal) / (maxSal - minSal)) * (h - 2 * paddingY);

  // Guarantee Flat Line
  const yGuar = getY(curveData[0].guaranteed_annual);
  ctx.beginPath();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.moveTo(paddingX, yGuar);
  ctx.lineTo(w - 40, yGuar);
  ctx.stroke();
  ctx.setLineDash([]);

  // Split Rising Curve
  ctx.beginPath();
  ctx.strokeStyle = '#34d399';
  ctx.lineWidth = 3;
  curveData.forEach((pt, idx) => {
    const x = getX(pt.patient_volume);
    const y = getY(pt.split_annual);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Break-even Marker
  const xBe = getX(breakEven);
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(xBe, yGuar, 6, 0, 2 * Math.PI);
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.font = '10px JetBrains Mono';
  ctx.fillText(`Crossover: ${breakEven} pts`, xBe - 30, yGuar - 12);
}

// =============================================================================
// 5. Trade-off 3: Hospitalist vs Clinic
// =============================================================================
function initHospitalAdvisor() {
  const onCallInput = document.getElementById('hosp-oncall-weekends');
  const specSelect = document.getElementById('hosp-specialty');
  const btnRun = document.getElementById('btn-run-hospital');

  onCallInput.addEventListener('input', () => {
    document.getElementById('hosp-oncall-display').innerText = `${onCallInput.value} weekend${onCallInput.value == 1 ? '' : 's'} / month`;
    runHospitalSimulation();
  });

  specSelect.addEventListener('change', runHospitalSimulation);
  btnRun.addEventListener('click', runHospitalSimulation);

  runHospitalSimulation();
}

async function runHospitalSimulation() {
  const specialty = document.getElementById('hosp-specialty').value;
  const onCallWeekendsPerMonth = parseInt(document.getElementById('hosp-oncall-weekends').value, 10);

  try {
    const res = await fetch('/api/advisors/hospital-vs-clinic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specialty, onCallWeekendsPerMonth }),
    });
    const data = await res.json();

    document.getElementById('res-hosp-clinic-sal').innerText = `$${data.clinic.annual_salary.toLocaleString()} / yr`;
    document.getElementById('res-hosp-clinic-hourly').innerText = `$${data.clinic.effective_hourly_rate} / hr`;

    document.getElementById('res-hosp-hospital-sal').innerText = `$${data.hospital.annual_salary.toLocaleString()} / yr`;
    document.getElementById('res-hosp-hospital-hourly').innerText = `$${data.hospital.effective_hourly_rate} / hr`;

    document.getElementById('res-hosp-recommendation').innerHTML = `<strong>Comparative Insight:</strong> ${data.recommendation}`;
  } catch (err) {
    console.error('Hospital simulation error:', err);
  }
}

// =============================================================================
// 6. Trade-off 4: Locum vs Permanent Equity
// =============================================================================
function initLocumAdvisor() {
  const yearsInput = document.getElementById('locum-years');
  const rosterInput = document.getElementById('locum-roster');
  const btnRun = document.getElementById('btn-run-locum');

  yearsInput.addEventListener('input', () => {
    document.getElementById('locum-years-display').innerText = `${yearsInput.value} Year${yearsInput.value == 1 ? '' : 's'}`;
    runLocumSimulation();
  });

  rosterInput.addEventListener('input', () => {
    document.getElementById('locum-roster-display').innerText = `${parseInt(rosterInput.value, 10).toLocaleString()} Patients`;
    runLocumSimulation();
  });

  btnRun.addEventListener('click', runLocumSimulation);
  runLocumSimulation();
}

async function runLocumSimulation() {
  const yearsHorizon = parseInt(document.getElementById('locum-years').value, 10);
  const rosterSize = parseInt(document.getElementById('locum-roster').value, 10);

  try {
    const res = await fetch('/api/advisors/locum-vs-permanent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yearsHorizon, rosterSize }),
    });
    const data = await res.json();

    document.getElementById('res-locum-y1').innerText = `$${data.year_one_snapshot.locum_gross_cashflow.toLocaleString()}`;
    document.getElementById('res-perm-y1').innerText = `$${data.year_one_snapshot.permanent_gross_earnings.toLocaleString()}`;

    const tbody = document.getElementById('locum-trajectory-tbody');
    tbody.innerHTML = '';

    data.multi_year_trajectory.forEach((row) => {
      const tr = document.createElement('tr');
      const isWinner = row.perm_advantage > 0;
      tr.innerHTML = `
        <td><strong>Year ${row.year}</strong></td>
        <td>$${row.locum_annual.toLocaleString()}</td>
        <td>$${row.permanent_annual.toLocaleString()}</td>
        <td>$${row.cumulative_locum.toLocaleString()}</td>
        <td>$${row.cumulative_permanent.toLocaleString()}</td>
        <td class="${isWinner ? 'text-emerald' : 'text-amber'}"><strong>${isWinner ? '+' : ''}$${row.perm_advantage.toLocaleString()}</strong></td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('res-locum-recommendation').innerHTML = `<strong>Strategic Horizon:</strong> ${data.recommendation}`;
  } catch (err) {
    console.error('Locum simulation error:', err);
  }
}

// =============================================================================
// 7. Trade-off 5: EMR & Admin Burden Simulator
// =============================================================================
function initEmrAdvisor() {
  const hoursInput = document.getElementById('emr-admin-hours');
  const billingInput = document.getElementById('emr-gross-billing');
  const btnRun = document.getElementById('btn-run-emr');

  hoursInput.addEventListener('input', () => {
    document.getElementById('emr-admin-display').innerText = `${hoursInput.value} hrs / week`;
    runEmrSimulation();
  });

  billingInput.addEventListener('input', () => {
    document.getElementById('emr-billing-display').innerText = `$${parseInt(billingInput.value, 10).toLocaleString()} CAD`;
    runEmrSimulation();
  });

  btnRun.addEventListener('click', runEmrSimulation);
  runEmrSimulation();
}

async function runEmrSimulation() {
  const currentAdminHours = parseFloat(document.getElementById('emr-admin-hours').value);
  const annualGrossBilling = parseFloat(document.getElementById('emr-gross-billing').value);

  try {
    const res = await fetch('/api/advisors/emr-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentAdminHours, annualGrossBilling }),
    });
    const data = await res.json();
    const sc = data.scenarios;

    document.getElementById('emr-sc1-hourly').innerText = `$${sc.lean_practice.effective_hourly_wage} / hr`;
    document.getElementById('emr-sc2-hourly').innerText = `$${sc.supported_work_life_balance.effective_hourly_wage} / hr`;
    document.getElementById('emr-sc3-income').innerText = `+$${sc.supported_growth_model.net_income_boost.toLocaleString()} / yr`;
    document.getElementById('res-emr-recommendation').innerHTML = `<strong>Clinical Insight:</strong> ${data.recommendation}`;
  } catch (err) {
    console.error('EMR simulation error:', err);
  }
}

// =============================================================================
// 8. Live Job Explorer & Detail Modal
// =============================================================================
let cachedJobs = [];

async function initJobsExplorer() {
  const searchInput = document.getElementById('job-search-input');
  const specSelect = document.getElementById('filter-specialty-select');
  const typeSelect = document.getElementById('filter-type-select');
  const dialog = document.getElementById('job-detail-dialog');
  const closeBtn = document.getElementById('modal-close-btn');

  closeBtn.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });

  searchInput.addEventListener('input', debounce(filterJobs, 250));
  specSelect.addEventListener('change', filterJobs);
  typeSelect.addEventListener('change', filterJobs);

  await loadJobs();
}

async function loadJobs() {
  try {
    const res = await fetch('/api/jobs?limit=100');
    const data = await res.json();
    cachedJobs = data.jobs || [];
    renderJobsTable(cachedJobs);
  } catch (err) {
    console.error('Failed to load jobs:', err);
  }
}

function filterJobs() {
  const q = document.getElementById('job-search-input').value.toLowerCase();
  const spec = document.getElementById('filter-specialty-select').value;
  const type = document.getElementById('filter-type-select').value;

  const filtered = cachedJobs.filter((j) => {
    const matchQ =
      !q ||
      (j.title && j.title.toLowerCase().includes(q)) ||
      (j.company && j.company.toLowerCase().includes(q)) ||
      (j.city && j.city.toLowerCase().includes(q));

    const matchSpec = spec === 'All' || (j.specialty && j.specialty.toLowerCase() === spec.toLowerCase());
    const matchType = type === 'All' || (j.employment_type && j.employment_type.toLowerCase() === type.toLowerCase());

    return matchQ && matchSpec && matchType;
  });

  renderJobsTable(filtered);
}

function renderJobsTable(jobs) {
  const tbody = document.getElementById('jobs-table-body');
  const countBadge = document.getElementById('jobs-count-badge');
  tbody.innerHTML = '';
  countBadge.innerText = jobs.length;

  if (jobs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No matching physician opportunities found.</td></tr>`;
    return;
  }

  jobs.forEach((job) => {
    const tr = document.createElement('tr');
    const salaryText = job.annualized_salary ? `$${job.annualized_salary.toLocaleString()} CAD` : 'FFS / Contract';
    const distText = job.distance_from_toronto_km !== null ? `${job.distance_from_toronto_km} km` : '0 km';
    const typeClass = job.employment_type === 'locum' ? 'badge-locum' : 'badge-tag';

    tr.innerHTML = `
      <td>
        <div class="job-cell-title">
          <span class="j-title">${escapeHtml(job.title)}</span>
          <span class="j-comp">${escapeHtml(job.company || 'Private Practice')}</span>
        </div>
      </td>
      <td><span class="badge-tag">${escapeHtml(job.specialty)}</span></td>
      <td><span class="${typeClass}">${escapeHtml(job.employment_type)}</span></td>
      <td>${escapeHtml(job.location_formatted || job.city || 'Toronto, ON')}</td>
      <td><span class="dist-pill">${distText}</span></td>
      <td><span class="salary-pill">${salaryText}</span></td>
      <td>
        <button class="btn-view-job" data-id="${job.job_id}">View Details</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach click listeners to view detail buttons
  tbody.querySelectorAll('.btn-view-job').forEach((btn) => {
    btn.addEventListener('click', () => {
      const jobId = btn.getAttribute('data-id');
      const job = cachedJobs.find((j) => j.job_id === jobId);
      if (job) showJobModal(job);
    });
  });
}

function showJobModal(job) {
  const dialog = document.getElementById('job-detail-dialog');
  document.getElementById('modal-job-title').innerText = job.title;

  const body = document.getElementById('modal-job-body');
  const salaryText = job.annualized_salary ? `$${job.annualized_salary.toLocaleString()} CAD / Year` : (job.compensation_raw || 'Fee-For-Service');
  const distText = job.distance_from_toronto_km !== null ? `${job.distance_from_toronto_km} km from Downtown Toronto` : 'Downtown Core';

  body.innerHTML = `
    <div style="display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap;">
      <span class="badge-tag">${job.specialty}</span>
      <span class="badge-tag">${job.employment_type}</span>
      <span class="badge-tag" style="background: rgba(16, 185, 129, 0.2); color: #34d399;">${salaryText}</span>
      <span class="badge-tag" style="background: rgba(6, 182, 212, 0.2); color: #38bdf8;">${distText}</span>
    </div>
    <div style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6; margin-bottom: 16px;">
      <p><strong>Organization / Clinic:</strong> ${escapeHtml(job.company || 'Private Practice')}</p>
      <p><strong>Location:</strong> ${escapeHtml(job.location_formatted || 'Toronto, ON')}</p>
      ${job.street_address ? `<p><strong>Address:</strong> ${escapeHtml(job.street_address)}</p>` : ''}
    </div>
    <div style="background: rgba(0,0,0,0.3); padding: 16px; border-radius: 8px; font-size: 0.85rem; max-height: 250px; overflow-y: auto; white-space: pre-wrap; line-height: 1.5; color: #cbd5e1;">
${escapeHtml(job.full_description_text || 'No description text provided.')}
    </div>
    <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
      <a href="${job.url}" target="_blank" rel="noopener noreferrer" class="btn-primary" style="text-decoration: none; display: inline-flex;">
        Open Original Posting &rarr;
      </a>
    </div>
  `;

  dialog.showModal();
}

// =============================================================================
// AI Opportunity Finder & Location Matcher System
// =============================================================================
let cachedFinderData = null;

function initOpportunityFinder() {
  const form = document.getElementById('opportunity-finder-form');
  const specialtySelect = document.getElementById('finder-specialty-select');
  const grossInput = document.getElementById('finder-gross-input');
  const presetChips = document.querySelectorAll('.preset-chip');
  const radiusSelect = document.getElementById('finder-radius-select');
  const goalSelect = document.getElementById('finder-goal-select');

  // Baseline gross auto-update per specialty
  const specialtyGrossMap = {
    'All': 450000,
    'Family Medicine': 385000,
    'Dermatology': 550000,
    'Pediatrics': 395000,
    'Internal Medicine': 460000,
    'Psychiatry': 440000,
    'Emergency Medicine': 420000
  };

  if (specialtySelect && grossInput) {
    specialtySelect.addEventListener('change', () => {
      const selected = specialtySelect.value;
      if (specialtyGrossMap[selected]) {
        grossInput.value = specialtyGrossMap[selected];
      }
      runOpportunitySimulation();
    });
  }

  // Quick preset pills click handler
  presetChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      presetChips.forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      const originInput = document.getElementById('finder-origin-input');
      if (originInput) {
        originInput.value = chip.innerText.trim();
      }
      runOpportunitySimulation();
    });
  });

  if (radiusSelect) radiusSelect.addEventListener('change', () => runOpportunitySimulation());
  if (goalSelect) goalSelect.addEventListener('change', () => runOpportunitySimulation());

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      runOpportunitySimulation();
    });
  }

  // Window resize redrawing
  window.addEventListener('resize', debounce(() => {
    if (cachedFinderData) drawFinderCanvas(cachedFinderData);
  }, 200));

  // Initial trigger
  setTimeout(() => {
    runOpportunitySimulation();
  }, 300);
}

async function runOpportunitySimulation() {
  const submitBtn = document.getElementById('btn-run-opportunity-matcher');
  const originInput = document.getElementById('finder-origin-input');
  const specialtySelect = document.getElementById('finder-specialty-select');
  const grossInput = document.getElementById('finder-gross-input');
  const splitInput = document.getElementById('finder-split-input');
  const adminInput = document.getElementById('finder-admin-hours');
  const radiusSelect = document.getElementById('finder-radius-select');
  const goalSelect = document.getElementById('finder-goal-select');

  if (!originInput) return;

  const payload = {
    origin: originInput.value || 'Downtown Toronto',
    specialty: specialtySelect ? specialtySelect.value : 'All',
    currentGross: grossInput ? parseFloat(grossInput.value) : 550000,
    currentSplit: splitInput ? parseFloat(splitInput.value) : 70,
    currentAdminHours: adminInput ? parseFloat(adminInput.value) : 8,
    maxDistanceKm: radiusSelect ? parseFloat(radiusSelect.value) : 40,
    optimizationGoal: goalSelect ? goalSelect.value : 'balanced'
  };

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `
      <svg class="spin-animation" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      Analyzing Active Database Opportunities...
    `;
  }

  try {
    const res = await fetch('/api/suggestions/opportunity-finder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cachedFinderData = data;

    renderOpportunityResults(data);
    drawFinderCanvas(data);
  } catch (err) {
    console.error('Error running opportunity finder:', err);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="m11 8 3 3-3 3"/></svg>
        Analyze & Suggest More Profitable Clinics Nearby
      `;
    }
  }
}

function renderOpportunityResults(data) {
  const origin = data.origin;
  const summary = data.summary;
  const suggestions = data.suggestions || [];

  // Update Baseline Card
  const locTitle = document.getElementById('baseline-location-title');
  const specEl = document.getElementById('baseline-stat-specialty');
  const grossEl = document.getElementById('baseline-stat-gross');
  const splitEl = document.getElementById('baseline-stat-split');
  const netEl = document.getElementById('baseline-stat-net');
  const adminEl = document.getElementById('baseline-stat-admin');

  if (locTitle) locTitle.innerText = origin.label || origin.key;
  if (specEl) specEl.innerText = origin.specialty;
  if (grossEl) grossEl.innerText = `$${origin.baseline_gross.toLocaleString()} CAD`;
  if (splitEl) splitEl.innerText = `${origin.baseline_split_pct} / ${100 - origin.baseline_split_pct} (Physician ${origin.baseline_split_pct}%)`;
  if (netEl) netEl.innerText = `$${origin.baseline_net_take_home.toLocaleString()} CAD / yr`;
  if (adminEl) adminEl.innerText = `${origin.baseline_admin_hours} hrs / week`;

  // Update KPIs
  const totalKpi = document.getElementById('finder-kpi-total');
  const profKpi = document.getElementById('finder-kpi-profitable');
  const maxGainKpi = document.getElementById('finder-kpi-max-gain');
  const avgDistKpi = document.getElementById('finder-kpi-avg-dist');

  if (totalKpi) totalKpi.innerText = summary.total_evaluated;
  if (profKpi) profKpi.innerText = `${summary.more_profitable_count} Positions`;
  if (maxGainKpi) {
    maxGainKpi.innerText = summary.max_net_gain > 0 ? `+$${summary.max_net_gain.toLocaleString()}` : '$0';
  }
  if (avgDistKpi) avgDistKpi.innerText = `${summary.average_distance_km} km`;

  // Render Opportunity Cards
  const container = document.getElementById('finder-suggestions-container');
  if (!container) return;
  container.innerHTML = '';

  if (suggestions.length === 0) {
    container.innerHTML = `
      <div class="empty-state-box">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <h4>No Nearby Opportunities Found Within Selected Radius</h4>
        <p>Try expanding your commute distance to 40 km or selecting "All Specialties" to explore the full Ontario database.</p>
      </div>
    `;
    return;
  }

  suggestions.forEach((s) => {
    const card = document.createElement('div');
    card.className = `glass-card opportunity-result-card ${s.rank === 1 ? 'rank-1-highlight' : ''}`;

    const isProfitable = s.financials.net_gain_after_commute > 0;
    const netGainClass = isProfitable ? 'gain-positive' : 'gain-neutral';
    const netGainFormatted = isProfitable
      ? `+$${s.financials.net_gain_after_commute.toLocaleString()} CAD / yr`
      : `$${s.financials.net_gain_after_commute.toLocaleString()} CAD / yr`;

    const rankBadgeClass = s.rank === 1 ? 'rank-gold' : s.rank === 2 ? 'rank-silver' : s.rank === 3 ? 'rank-bronze' : 'rank-standard';

    const badgesHtml = (s.badges || [])
      .map((b) => `<span class="opt-badge">${escapeHtml(b)}</span>`)
      .join('');

    const aiRationaleHtml = (s.ai_rationale || [])
      .map((r) => `<li><span class="ai-bullet-icon">&bull;</span><span>${escapeHtml(r)}</span></li>`)
      .join('');

    card.innerHTML = `
      <div class="opt-card-top-row">
        <div class="opt-rank-title-block">
          <div class="opt-rank-pill ${rankBadgeClass}">#${s.rank}</div>
          <div>
            <h4 class="opt-title">${escapeHtml(s.title)}</h4>
            <div class="opt-submeta">
              <span class="opt-clinic-name">${escapeHtml(s.company)}</span>
              <span class="dot-separator">&bull;</span>
              <span class="opt-location-text">${escapeHtml(s.city)} (${escapeHtml(s.street_address)})</span>
              <span class="dot-separator">&bull;</span>
              <span class="opt-dist-chip">${s.distance_km} km away (~${s.one_way_drive_minutes} min drive)</span>
            </div>
          </div>
        </div>

        <div class="opt-score-badge">
          <span class="score-num">${s.opportunity_score}</span>
          <span class="score-sub">ALPHA SCORE</span>
        </div>
      </div>

      <!-- Financial & Contract Comparison Strip -->
      <div class="opt-financials-grid">
        <div class="opt-stat-card ${netGainClass}">
          <span class="stat-meta-label">Net Take-Home Gain</span>
          <span class="stat-highlight-val">${netGainFormatted}</span>
          <span class="stat-meta-sub">After CRA $0.70/km vehicle expense</span>
        </div>

        <div class="opt-stat-card">
          <span class="stat-meta-label">Driving Time ROI</span>
          <span class="stat-highlight-val text-cyan">${s.financials.net_driving_hourly_wage > 0 ? `$${s.financials.net_driving_hourly_wage.toLocaleString()}/hr` : 'Local / Minimal Drive'}</span>
          <span class="stat-meta-sub">Effective wage for commute hours</span>
        </div>

        <div class="opt-stat-card">
          <span class="stat-meta-label">Contract Fee Split</span>
          <span class="stat-highlight-val text-purple">${escapeHtml(s.contract_variables.split_rate)}</span>
          <span class="stat-meta-sub">${s.financials.split_margin_delta > 0 ? `+${s.financials.split_margin_delta}% margin vs your baseline` : 'Standard practice overhead'}</span>
        </div>

        <div class="opt-stat-card">
          <span class="stat-meta-label">Admin Charting Freed</span>
          <span class="stat-highlight-val text-emerald">${s.contract_variables.admin_hours_saved_weekly > 0 ? `~${s.contract_variables.admin_hours_saved_weekly} hrs / wk` : 'Self-managed'}</span>
          <span class="stat-meta-sub">${s.contract_variables.annual_admin_time_value > 0 ? `Worth ~$${s.contract_variables.annual_admin_time_value.toLocaleString()}/yr in clinical time` : 'Direct EHR access'}</span>
        </div>
      </div>

      <!-- Badges Strip -->
      <div class="opt-badges-row">
        ${badgesHtml}
      </div>

      <!-- Practice Variables & Support Grid -->
      <div class="opt-support-features-grid">
        <div class="support-feature-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span><strong>EMR Infrastructure:</strong> ${escapeHtml(s.contract_variables.emr_terms)}</span>
        </div>
        <div class="support-feature-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <span><strong>Clinical Staffing:</strong> ${escapeHtml(s.contract_variables.admin_support)}</span>
        </div>
        <div class="support-feature-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          <span><strong>Patient Flow:</strong> ${escapeHtml(s.contract_variables.patient_volume_status)}</span>
        </div>
      </div>

      <!-- AI Recommendation Rationale Box -->
      <div class="opt-ai-rationale-box">
        <div class="rationale-box-header">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span>Why this opportunity beats your baseline:</span>
        </div>
        <ul class="ai-rationale-list">
          ${aiRationaleHtml}
        </ul>
      </div>

      <!-- Footer Action Row -->
      <div class="opt-card-footer">
        <div class="footer-dist-details">
          <span>Est. Annual CRA Commute Deduction: <strong>$${s.financials.annual_commute_cost.toLocaleString()} CAD</strong> (${s.distance_km * 2} km round-trip)</span>
        </div>
        <button class="btn btn-secondary btn-inspect-job" data-id="${s.job_id}">
          Inspect Posting & Contract Details &rarr;
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  // Attach modal trigger listeners
  container.querySelectorAll('.btn-inspect-job').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const jobId = btn.getAttribute('data-id');
      if (!jobId) return;

      let job = cachedJobs.find((j) => j.job_id === jobId);
      if (!job) {
        try {
          const res = await fetch(`/api/jobs/${jobId}`);
          if (res.ok) job = await res.json();
        } catch (e) {
          console.warn('Failed to fetch job details:', e);
        }
      }

      if (job) {
        showJobModal(job);
      }
    });
  });
}

function drawFinderCanvas(data) {
  const canvas = document.getElementById('finder-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padding = { top: 30, right: 40, bottom: 40, left: 80 };
  const graphW = w - padding.left - padding.right;
  const graphH = h - padding.top - padding.bottom;

  ctx.clearRect(0, 0, w, h);

  const suggestions = data.suggestions || [];
  if (suggestions.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.font = '14px Plus Jakarta Sans';
    ctx.textAlign = 'center';
    ctx.fillText('No data available to plot opportunity curve', w / 2, h / 2);
    return;
  }

  // Find max distance and max/min net gain
  const maxDist = Math.max(...suggestions.map((s) => s.distance_km), 25);
  const gains = suggestions.map((s) => s.financials.net_gain_after_commute);
  const maxGain = Math.max(...gains, 50000);
  const minGain = Math.min(...gains, -10000);

  const yRange = maxGain - minGain || 1;

  function toX(km) {
    return padding.left + (km / maxDist) * graphW;
  }

  function toY(gain) {
    return padding.top + graphH - ((gain - minGain) / yRange) * graphH;
  }

  // Draw Grid Lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;

  // Horizontal Grid
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const val = minGain + (i / ySteps) * yRange;
    const yPos = toY(val);
    ctx.beginPath();
    ctx.moveTo(padding.left, yPos);
    ctx.lineTo(w - padding.right, yPos);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'right';
    const label = val >= 0 ? `+$${Math.round(val / 1000)}k` : `-$${Math.round(Math.abs(val) / 1000)}k`;
    ctx.fillText(label, padding.left - 10, yPos + 4);
  }

  // Baseline Zero Line (Dash)
  const zeroY = toY(0);
  if (zeroY >= padding.top && zeroY <= h - padding.bottom) {
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(w - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px Plus Jakarta Sans';
    ctx.textAlign = 'left';
    ctx.fillText('Your Current Baseline ($0 Net Delta)', padding.left + 8, zeroY - 6);
  }

  // Vertical Distance Grid
  const xSteps = 5;
  for (let i = 0; i <= xSteps; i++) {
    const km = Math.round((i / xSteps) * maxDist);
    const xPos = toX(km);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.moveTo(xPos, padding.top);
    ctx.lineTo(xPos, h - padding.bottom);
    ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '11px JetBrains Mono';
    ctx.textAlign = 'center';
    ctx.fillText(`${km} km`, xPos, h - padding.bottom + 18);
  }

  // Draw Origin Point (X=0, Y=0)
  const originX = toX(0);
  ctx.beginPath();
  ctx.arc(originX, zeroY, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Plot candidate clinics
  suggestions.forEach((s) => {
    const x = toX(s.distance_km);
    const y = toY(s.financials.net_gain_after_commute);
    const isTop = s.rank === 1;

    // Pulse ring for top pick
    if (isTop) {
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.2)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
      ctx.stroke();
    }

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, isTop ? 8 : 5, 0, Math.PI * 2);
    ctx.fillStyle = s.financials.net_gain_after_commute > 0 ? '#10b981' : '#f43f5e';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Callout label for top 3
    if (s.rank <= 3) {
      ctx.fillStyle = isTop ? '#34d399' : '#e2e8f0';
      ctx.font = isTop ? 'bold 11px Plus Jakarta Sans' : '10px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      const labelText = `#${s.rank} ${s.city} (+$${Math.round(s.financials.net_gain_after_commute / 1000)}k)`;
      ctx.fillText(labelText, x, y - 12);
    }
  });

  // Axis Labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '11px Plus Jakarta Sans';
  ctx.textAlign = 'center';
  ctx.fillText('Commute Distance from Origin (km)', padding.left + graphW / 2, h - 8);
}

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
