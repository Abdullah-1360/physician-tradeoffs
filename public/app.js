/**
 * PhysicianTradeOffs Client Application
 * Modern Light-Theme Visual Intelligence & Real-time Trade-off Simulators
 * Zero External Links & Self-Contained In-App Dossier
 */

document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();
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
// 0. Scroll-Driven Animations Initializer
// =============================================================================
function initScrollAnimations() {
  if (!('IntersectionObserver' in window)) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    },
    { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
  );

  const targets = document.querySelectorAll(
    '.reveal-on-scroll, .glass-card, .kpi-card, .metric-card, .opportunity-result-card, .card-section'
  );
  targets.forEach((el) => observer.observe(el));
}

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

      // Re-observe newly visible elements for scroll animations
      setTimeout(initScrollAnimations, 50);

      // Trigger simulation / canvas redraw when switching panels
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
      if (statusText) statusText.innerText = 'PostgreSQL Live Connected';
      if (statusBadge) statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
    } else {
      if (statusText) statusText.innerText = `Verified Active Database (${healthData.total_jobs} Jobs)`;
      if (statusBadge) statusBadge.style.borderColor = 'rgba(14, 165, 233, 0.4)';
    }

    if (headerJobs) headerJobs.innerText = `${healthData.total_jobs} Active Jobs`;
    const kpiTotal = document.getElementById('kpi-total-jobs');
    if (kpiTotal) kpiTotal.innerText = healthData.total_jobs;

    const statsRes = await fetch('/api/stats/overview');
    const statsData = await statsRes.json();
    const ov = statsData.overview;

    if (ov) {
      if (ov.avg_salary) {
        const avgEl = document.getElementById('kpi-avg-salary');
        if (avgEl) avgEl.innerText = `$${parseInt(ov.avg_salary, 10).toLocaleString()} CAD`;
      }
      if (ov.max_salary) {
        const maxEl = document.getElementById('kpi-max-salary');
        if (maxEl) maxEl.innerText = `$${parseInt(ov.max_salary, 10).toLocaleString()} CAD`;
      }
    }

    renderSpecialtyBars(statsData.specialties || []);
  } catch (err) {
    console.warn('Overview API fetch warning:', err);
  }
}

function renderSpecialtyBars(specialties) {
  const container = document.getElementById('specialty-bars-container');
  if (!container) return;
  container.innerHTML = '';

  const maxCount = Math.max(...specialties.map((s) => s.count || 1), 15);

  specialties.forEach((spec) => {
    const pct = Math.round(((spec.count || 0) / maxCount) * 100);
    const row = document.createElement('div');
    row.className = 'spec-bar-row reveal-on-scroll';
    row.innerHTML = `
      <div class="spec-bar-header">
        <span>${escapeHtml(spec.specialty)}</span>
        <span class="text-cyan">${spec.count} Active Opportunities</span>
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

  if (!fromKmInput || !toKmInput) return;

  fromKmInput.addEventListener('input', () => {
    document.getElementById('dist-from-km-display').innerText = `${fromKmInput.value} km (Downtown)`;
    runDistanceSimulation();
  });

  toKmInput.addEventListener('input', () => {
    document.getElementById('dist-to-km-display').innerText = `${toKmInput.value} km (Regional Center)`;
    runDistanceSimulation();
  });

  if (specSelect) specSelect.addEventListener('change', runDistanceSimulation);
  if (typeSelect) typeSelect.addEventListener('change', runDistanceSimulation);
  if (btnRun) btnRun.addEventListener('click', runDistanceSimulation);

  runDistanceSimulation();
}

async function runDistanceSimulation() {
  const specSelect = document.getElementById('dist-specialty-select');
  const typeSelect = document.getElementById('dist-type-select');
  const fromKmInput = document.getElementById('dist-from-km');
  const toKmInput = document.getElementById('dist-to-km');

  if (!fromKmInput || !toKmInput) return;

  const specialty = specSelect ? specSelect.value : 'Family Medicine';
  const employmentType = typeSelect ? typeSelect.value : 'full-time';
  const fromKm = parseInt(fromKmInput.value, 10);
  const toKm = parseInt(toKmInput.value, 10);

  try {
    const res = await fetch('/api/advisors/distance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ specialty, employmentType, fromKm, toKm }),
    });
    const data = await res.json();

    const aLabel = document.getElementById('res-dist-a-label');
    const bLabel = document.getElementById('res-dist-b-label');
    const salA = document.getElementById('res-dist-salary-a');
    const salB = document.getElementById('res-dist-salary-b');

    if (aLabel) aLabel.innerText = `${data.from_km} km`;
    if (bLabel) bLabel.innerText = `${data.to_km} km`;
    if (salA) salA.innerText = `$${data.salary_at_location_a.toLocaleString()} CAD`;
    if (salB) salB.innerText = `$${data.salary_at_location_b.toLocaleString()} CAD`;

    const sign = data.gross_salary_difference >= 0 ? '+' : '';
    const deltaEl = document.getElementById('res-dist-delta');
    const perKmEl = document.getElementById('res-dist-per-km');
    const commuteEl = document.getElementById('res-dist-commute-time');
    const grantEl = document.getElementById('res-dist-grant');

    if (deltaEl) deltaEl.innerText = `${sign}$${data.gross_salary_difference.toLocaleString()} CAD (${sign}${data.percentage_gain}%)`;
    if (perKmEl) perKmEl.innerText = `+$${data.premium_per_km.toLocaleString()} / km`;

    const driveMinutes = Math.max(5, Math.round(data.km_difference * 1.4));
    if (commuteEl) commuteEl.innerText = `~${driveMinutes} mins`;

    const grantText = data.incentives && data.incentives.regional_grant_eligible
      ? `Eligible (+$${data.incentives.estimated_annual_grant.toLocaleString()} CAD)`
      : 'Standard Region';
    if (grantEl) grantEl.innerText = grantText;

    const recEl = document.getElementById('res-dist-recommendation');
    if (recEl) recEl.innerHTML = `<strong>Advisor Strategic Insight:</strong> ${data.recommendation}`;

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

  // Background light grid lines
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.07)';
  ctx.lineWidth = 1;
  for (let y = 30; y < h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(w - 20, y);
    ctx.stroke();
  }

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
  grad.addColorStop(0, '#0284c7');
  grad.addColorStop(1, '#059669');

  ctx.beginPath();
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3.5;
  ctx.moveTo(xA, yA);
  ctx.bezierCurveTo(xA + (xB - xA) * 0.5, yA, xA + (xB - xA) * 0.5, yB, xB, yB);
  ctx.stroke();

  // Point A Dot
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.arc(xA, yA, 7, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px Plus Jakarta Sans';
  ctx.fillText(`Loc A (${fromKm}km): $${(salA / 1000).toFixed(0)}k`, xA - 20, yA - 14);

  // Point B Dot
  ctx.fillStyle = '#059669';
  ctx.beginPath();
  ctx.arc(xB, yB, 7, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

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

  if (!volInput || !pctInput || !floorInput) return;

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

  if (specSelect) specSelect.addEventListener('change', runSplitSimulation);
  if (btnRun) btnRun.addEventListener('click', runSplitSimulation);

  runSplitSimulation();
}

async function runSplitSimulation() {
  const specSelect = document.getElementById('split-specialty');
  const volInput = document.getElementById('split-patient-vol');
  const pctInput = document.getElementById('split-physician-pct');
  const floorInput = document.getElementById('split-guarantee-floor');

  if (!volInput || !pctInput || !floorInput) return;

  const specialty = specSelect ? specSelect.value : 'Family Medicine';
  const dailyPatientVolume = parseInt(volInput.value, 10);
  const physicianSplitPct = parseFloat(pctInput.value);
  const guaranteedDailyFloor = parseFloat(floorInput.value);

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
    document.getElementById('res-split-recommendation').innerHTML = `<strong>Volume Model Insight:</strong> ${data.recommendation}`;

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

  // Guarantee Flat Line (Dashed)
  const yGuar = getY(curveData[0].guaranteed_annual);
  ctx.beginPath();
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.moveTo(paddingX, yGuar);
  ctx.lineTo(w - 40, yGuar);
  ctx.stroke();
  ctx.setLineDash([]);

  // Split Rising Curve
  ctx.beginPath();
  ctx.strokeStyle = '#059669';
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
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.arc(xBe, yGuar, 6, 0, 2 * Math.PI);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px JetBrains Mono';
  ctx.fillText(`Crossover: ${breakEven} pts/day`, xBe - 40, yGuar - 12);
}

// =============================================================================
// 5. Trade-off 3: Hospitalist vs Clinic
// =============================================================================
function initHospitalAdvisor() {
  const onCallInput = document.getElementById('hosp-oncall-weekends');
  const specSelect = document.getElementById('hosp-specialty');
  const btnRun = document.getElementById('btn-run-hospital');

  if (!onCallInput) return;

  onCallInput.addEventListener('input', () => {
    document.getElementById('hosp-oncall-display').innerText = `${onCallInput.value} weekend${onCallInput.value == 1 ? '' : 's'} / month`;
    runHospitalSimulation();
  });

  if (specSelect) specSelect.addEventListener('change', runHospitalSimulation);
  if (btnRun) btnRun.addEventListener('click', runHospitalSimulation);

  runHospitalSimulation();
}

async function runHospitalSimulation() {
  const specSelect = document.getElementById('hosp-specialty');
  const onCallInput = document.getElementById('hosp-oncall-weekends');

  if (!onCallInput) return;

  const specialty = specSelect ? specSelect.value : 'Internal Medicine';
  const onCallWeekendsPerMonth = parseInt(onCallInput.value, 10);

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

  if (!yearsInput || !rosterInput) return;

  yearsInput.addEventListener('input', () => {
    document.getElementById('locum-years-display').innerText = `${yearsInput.value} Year${yearsInput.value == 1 ? '' : 's'}`;
    runLocumSimulation();
  });

  rosterInput.addEventListener('input', () => {
    document.getElementById('locum-roster-display').innerText = `${parseInt(rosterInput.value, 10).toLocaleString()} Patients`;
    runLocumSimulation();
  });

  if (btnRun) btnRun.addEventListener('click', runLocumSimulation);
  runLocumSimulation();
}

async function runLocumSimulation() {
  const yearsInput = document.getElementById('locum-years');
  const rosterInput = document.getElementById('locum-roster');

  if (!yearsInput || !rosterInput) return;

  const yearsHorizon = parseInt(yearsInput.value, 10);
  const rosterSize = parseInt(rosterInput.value, 10);

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
    if (tbody) {
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
    }

    document.getElementById('res-locum-recommendation').innerHTML = `<strong>Strategic Horizon:</strong> ${data.recommendation}`;
  } catch (err) {
    console.error('Locum simulation error:', err);
  }
}

// =============================================================================
// 7. Safely Guarded Trade-off 5 Handler (if present in DOM)
// =============================================================================
function initEmrAdvisor() {
  const hoursInput = document.getElementById('emr-admin-hours');
  const billingInput = document.getElementById('emr-gross-billing');
  const btnRun = document.getElementById('btn-run-emr');

  if (!hoursInput || !billingInput || !btnRun) return;

  hoursInput.addEventListener('input', () => {
    document.getElementById('emr-admin-display').innerText = `${hoursInput.value} hrs / week`;
  });

  billingInput.addEventListener('input', () => {
    document.getElementById('emr-billing-display').innerText = `$${parseInt(billingInput.value, 10).toLocaleString()} CAD`;
  });
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

  if (closeBtn && dialog) {
    closeBtn.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  if (searchInput) searchInput.addEventListener('input', debounce(filterJobs, 250));
  if (specSelect) specSelect.addEventListener('change', filterJobs);
  if (typeSelect) typeSelect.addEventListener('change', filterJobs);

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
  const searchInput = document.getElementById('job-search-input');
  const specSelect = document.getElementById('filter-specialty-select');
  const typeSelect = document.getElementById('filter-type-select');

  const q = searchInput ? searchInput.value.toLowerCase() : '';
  const spec = specSelect ? specSelect.value : 'All';
  const type = typeSelect ? typeSelect.value : 'All';

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
  if (!tbody) return;

  tbody.innerHTML = '';
  if (countBadge) countBadge.innerText = jobs.length;

  if (jobs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 36px;">No active physician opportunities match your search.</td></tr>`;
    return;
  }

  jobs.forEach((job) => {
    const tr = document.createElement('tr');
    const salaryText = job.annualized_salary ? `$${job.annualized_salary.toLocaleString()} CAD` : (job.compensation_raw || 'Competitive FFS');
    const distText = job.distance_from_toronto_km !== null ? `${job.distance_from_toronto_km} km` : 'Downtown GTA';
    const typeClass = job.employment_type === 'locum' ? 'badge-locum' : 'badge-tag';

    tr.innerHTML = `
      <td>
        <div class="job-cell-title">
          <span class="j-title">${escapeHtml(job.title)}</span>
          <span class="j-comp">${escapeHtml(job.company || 'Modern Practice')}</span>
        </div>
      </td>
      <td><span class="badge-tag">${escapeHtml(job.specialty)}</span></td>
      <td><span class="${typeClass}">${escapeHtml(job.employment_type)}</span></td>
      <td>${escapeHtml(job.location_formatted || job.city || 'Toronto, ON')}</td>
      <td><span class="dist-pill">${distText}</span></td>
      <td><span class="salary-pill">${salaryText}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm btn-view-job" data-id="${job.job_id}">View Details</button>
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

// =============================================================================
// In-App Job Dossier Modal (Zero External Links)
// =============================================================================
function showJobModal(job) {
  const dialog = document.getElementById('job-detail-dialog');
  if (!dialog) return;

  const titleEl = document.getElementById('modal-job-title');
  if (titleEl) titleEl.innerText = job.title;

  const body = document.getElementById('modal-job-body');
  if (!body) return;

  const salaryFormatted = job.annualized_salary
    ? `$${job.annualized_salary.toLocaleString()} CAD / Year`
    : (job.compensation_raw || 'Fee-For-Service / Practice Split');

  const distFormatted = job.distance_from_toronto_km !== null
    ? `${job.distance_from_toronto_km} km from Downtown Toronto`
    : 'Downtown Toronto Core';

  const validThroughDate = job.valid_through || job.closing_date || 'Winter 2026/2027';

  // Extract contact emails if available
  let contactEmails = job.contact_emails || [];
  if (contactEmails.length === 0 && job.full_description_text) {
    const matched = job.full_description_text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
    if (matched) {
      contactEmails = [...new Set(matched.filter(e => !e.toLowerCase().includes('physiciancareers')))];
    }
  }

  // Extract telephone numbers if mentioned
  const phoneMatch = (job.full_description_text || '').match(/(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/);
  const phoneNumber = phoneMatch ? phoneMatch[1] : null;

  // Render structured sections
  let structuredHtml = '';
  if (job.structured_sections && typeof job.structured_sections === 'object') {
    for (const [secTitle, secContent] of Object.entries(job.structured_sections)) {
      if (secContent && typeof secContent === 'string' && secContent.trim().length > 0) {
        structuredHtml += `
          <div class="dossier-section-block">
            <h5>${escapeHtml(secTitle)}</h5>
            <p>${escapeHtml(secContent)}</p>
          </div>
        `;
      }
    }
  }

  // Build Contact Box
  let contactBoxHtml = '';
  if (contactEmails.length > 0 || phoneNumber) {
    contactBoxHtml = `
      <div class="dossier-contact-card">
        <div class="contact-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <div>
            <h4>Direct Clinic Application Channel</h4>
            <p>Direct physician recruitment coordinates provided by the clinic administrator</p>
          </div>
        </div>
        <div class="contact-actions-row">
          ${contactEmails.map(e => `
            <a href="mailto:${e}?subject=Physician%20Inquiry%20-%20${encodeURIComponent(job.title)}" class="btn btn-primary btn-sm">
              ✉ Email ${escapeHtml(e)}
            </a>
            <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${e}').then(() => alert('Email copied: ${e}'))">
              Copy Email
            </button>
          `).join('')}
          ${phoneNumber ? `<span class="contact-phone-chip">📞 Direct Tel: <strong>${escapeHtml(phoneNumber)}</strong></span>` : ''}
        </div>
      </div>
    `;
  } else {
    contactBoxHtml = `
      <div class="dossier-contact-card">
        <div class="contact-header">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
          <div>
            <h4>Active In-Practice Position</h4>
            <p>Positions are registered directly with Ontario healthcare networks. Connect through clinic coordination.</p>
          </div>
        </div>
      </div>
    `;
  }

  body.innerHTML = `
    <!-- Top Pill Badges -->
    <div class="dossier-badge-strip">
      <span class="badge-tag">${escapeHtml(job.specialty)}</span>
      <span class="badge-tag">${escapeHtml(job.employment_type || 'Practice')}</span>
      <span class="badge-tag" style="background: rgba(16, 185, 129, 0.12); color: #059669; border-color: rgba(16, 185, 129, 0.3);">
        ✓ Verified Active (Valid Through: ${escapeHtml(validThroughDate)})
      </span>
      <span class="badge-tag" style="background: rgba(14, 165, 233, 0.1); color: #0284c7; border-color: rgba(14, 165, 233, 0.25);">
        📍 ${distFormatted}
      </span>
    </div>

    <!-- Key Metrics Grid -->
    <div class="dossier-metrics-grid">
      <div class="dossier-metric-item">
        <span class="dm-label">Annual Gross / Remuneration</span>
        <span class="dm-val text-emerald">${salaryFormatted}</span>
      </div>
      <div class="dossier-metric-item">
        <span class="dm-label">Clinic / Organization</span>
        <span class="dm-val">${escapeHtml(job.company || 'Modern Practice')}</span>
      </div>
      <div class="dossier-metric-item">
        <span class="dm-label">Practice Location & Address</span>
        <span class="dm-val">${escapeHtml(job.street_address ? `${job.street_address}, ${job.city || 'Toronto'}` : (job.location_formatted || job.city || 'Toronto, ON'))}</span>
      </div>
      <div class="dossier-metric-item">
        <span class="dm-label">Posting Status</span>
        <span class="dm-val text-cyan">Active Enrollment for Fall/Winter 2026</span>
      </div>
    </div>

    <!-- Direct Outreach Box -->
    ${contactBoxHtml}

    <!-- Structured Clinic Sections (if any) -->
    ${structuredHtml ? `<div class="dossier-structured-box">${structuredHtml}</div>` : ''}

    <!-- Full Description Dossier -->
    <div class="dossier-full-desc-card">
      <h5>Complete In-App Practice Dossier</h5>
      <div class="desc-text-wrapper">
        ${escapeHtml(job.full_description_text || 'Complete practice posting specifications registered with the College of Physicians and Surgeons of Ontario (CPSO).')}
      </div>
    </div>

    <!-- Modal Footer Actions (Zero external links) -->
    <div class="dossier-modal-footer">
      <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${escapeHtml(job.title)} at ${escapeHtml(job.company || 'Clinic')} (${escapeHtml(job.street_address || '')})').then(() => alert('Practice summary copied to clipboard!'))">
        📋 Copy Practice Summary
      </button>
      <button class="btn btn-primary" onclick="document.getElementById('job-detail-dialog').close()">
        Close Dossier
      </button>
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

  // Specialty baseline gross approximations
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

  // Redraw canvas on window resize
  window.addEventListener('resize', debounce(() => {
    if (cachedFinderData) drawFinderCanvas(cachedFinderData);
  }, 200));

  // Initial trigger
  setTimeout(() => {
    runOpportunitySimulation();
  }, 250);
}

async function runOpportunitySimulation() {
  const submitBtn = document.getElementById('btn-run-opportunity-matcher');
  const originInput = document.getElementById('finder-origin-input');
  const specialtySelect = document.getElementById('finder-specialty-select');
  const grossInput = document.getElementById('finder-gross-input');
  const splitInput = document.getElementById('finder-split-input');
  const radiusSelect = document.getElementById('finder-radius-select');
  const goalSelect = document.getElementById('finder-goal-select');

  if (!originInput) return;

  const payload = {
    origin: originInput.value || 'Downtown Toronto',
    specialty: specialtySelect ? specialtySelect.value : 'All',
    currentGross: grossInput ? parseFloat(grossInput.value) : 550000,
    currentSplit: splitInput ? parseFloat(splitInput.value) : 70,
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

  if (locTitle) locTitle.innerText = origin.label || origin.key;
  if (specEl) specEl.innerText = origin.specialty;
  if (grossEl) grossEl.innerText = `$${origin.baseline_gross.toLocaleString()} CAD`;
  if (splitEl) splitEl.innerText = `${origin.baseline_split_pct} / ${100 - origin.baseline_split_pct} (Physician ${origin.baseline_split_pct}%)`;

  // Update Summary KPIs
  const totalKpi = document.getElementById('finder-kpi-total');
  const profKpi = document.getElementById('finder-kpi-profitable');
  const maxGainKpi = document.getElementById('finder-kpi-max-gain');
  const avgDistKpi = document.getElementById('finder-kpi-avg-dist');

  if (totalKpi) totalKpi.innerText = summary.total_evaluated;
  if (profKpi) profKpi.innerText = `${summary.more_profitable_count} Positions`;
  if (maxGainKpi) {
    maxGainKpi.innerText = summary.max_gross_gain > 0 ? `+$${summary.max_gross_gain.toLocaleString()} CAD` : '$0 CAD';
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
        <p>Try expanding your commute distance to 40 km or selecting "All Specialties" to explore the active Ontario database.</p>
      </div>
    `;
    return;
  }

  suggestions.forEach((s) => {
    const card = document.createElement('div');
    card.className = `glass-card opportunity-result-card reveal-on-scroll ${s.rank === 1 ? 'rank-1-highlight' : ''}`;

    const isProfitable = s.financials.gross_difference > 0;
    const gainClass = isProfitable ? 'gain-positive' : 'gain-neutral';
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

      <!-- Financial & Location Comparison Strip (Clean 2-card layout) -->
      <div class="opt-financials-grid">
        <div class="opt-stat-card ${gainClass}">
          <span class="stat-meta-label">Estimated Gross Income</span>
          <span class="stat-highlight-val">$${s.financials.candidate_gross.toLocaleString()} CAD</span>
          <span class="stat-meta-sub">${isProfitable ? `+${s.financials.gross_difference.toLocaleString()} CAD (${s.financials.percentage_gain > 0 ? '+' : ''}${s.financials.percentage_gain}%) vs baseline` : 'Competitive baseline match'}</span>
        </div>

        <div class="opt-stat-card">
          <span class="stat-meta-label">Commute & Location</span>
          <span class="stat-highlight-val text-cyan">${s.distance_km} km away</span>
          <span class="stat-meta-sub">~${s.one_way_drive_minutes} min drive from your origin</span>
        </div>
      </div>

      <!-- Badges Row -->
      <div class="opt-badges-row">
        ${badgesHtml}
      </div>

      <!-- Practice Variables & Support Grid -->
      <div class="opt-support-features-grid">
        <div class="support-feature-item">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span><strong>EMR Environment:</strong> ${escapeHtml(s.contract_variables.emr_terms)}</span>
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

      <!-- Footer Action Row (Zero External URLs) -->
      <div class="opt-card-footer">
        <div class="footer-dist-details">
          <span class="badge-tag" style="background: rgba(16, 185, 129, 0.1); color: #059669; border-color: rgba(16, 185, 129, 0.3);">
            ✓ Verified Active Opportunity
          </span>
        </div>
        <button class="btn btn-primary btn-inspect-job" data-id="${s.job_id}">
          View Complete In-App Dossier &rarr;
        </button>
      </div>
    `;

    container.appendChild(card);
  });

  // Re-run scroll animations for freshly appended cards
  setTimeout(initScrollAnimations, 50);

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

  // Find max distance and max/min gross difference
  const maxDist = Math.max(...suggestions.map((s) => s.distance_km), 25);
  const gains = suggestions.map((s) => s.financials.gross_difference);
  const maxGain = Math.max(...gains, 50000);
  const minGain = Math.min(...gains, -10000);

  const yRange = maxGain - minGain || 1;

  function toX(km) {
    return padding.left + (km / maxDist) * graphW;
  }

  function toY(gain) {
    return padding.top + graphH - ((gain - minGain) / yRange) * graphH;
  }

  // Draw Grid Lines (Light Theme slate)
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.07)';
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
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.6)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, zeroY);
    ctx.lineTo(w - padding.right, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#0284c7';
    ctx.font = 'bold 11px Plus Jakarta Sans';
    ctx.textAlign = 'left';
    ctx.fillText('Your Current Baseline Gross ($0 Delta)', padding.left + 8, zeroY - 6);
  }

  // Vertical Distance Grid
  const xSteps = 5;
  for (let i = 0; i <= xSteps; i++) {
    const km = Math.round((i / xSteps) * maxDist);
    const xPos = toX(km);

    ctx.strokeStyle = 'rgba(15, 23, 42, 0.07)';
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
  ctx.fillStyle = '#0284c7';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Plot candidate clinics
  suggestions.forEach((s) => {
    const x = toX(s.distance_km);
    const y = toY(s.financials.gross_difference);
    const isTop = s.rank === 1;

    // Pulse ring for top pick
    if (isTop) {
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
      ctx.stroke();
    }

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, isTop ? 8 : 5, 0, Math.PI * 2);
    ctx.fillStyle = s.financials.gross_difference > 0 ? '#059669' : '#e11d48';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Callout label for top 3
    if (s.rank <= 3) {
      ctx.fillStyle = isTop ? '#065f46' : '#0f172a';
      ctx.font = isTop ? 'bold 11px Plus Jakarta Sans' : '10px Plus Jakarta Sans';
      ctx.textAlign = 'center';
      const labelText = `#${s.rank} ${s.city} (+$${Math.round(s.financials.gross_difference / 1000)}k)`;
      ctx.fillText(labelText, x, y - 12);
    }
  });

  // Axis Labels
  ctx.fillStyle = '#64748b';
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
