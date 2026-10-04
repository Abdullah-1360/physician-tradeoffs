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
  initRealTimeMap();
  initJobCreationForm();
  initSettingsPanel();
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
      } else if (targetId === 'panel-map') {
        if (realTimeMap) {
          setTimeout(() => realTimeMap.invalidateSize(), 150);
        }
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

  // Render Autonomous AI Diagnostic Thinking Process
  const thinkingCard = document.getElementById('ai-thinking-card');
  const thinkingBody = document.getElementById('ai-thinking-body');
  if (thinkingCard && thinkingBody && data.ai_thinking_process) {
    thinkingCard.style.display = 'block';
    const proc = data.ai_thinking_process;

    let stepsHtml = (proc.diagnostic_steps || []).map((st) => `
      <div class="ai-thinking-step">
        <div class="ai-step-top">
          <span class="ai-step-name">Step ${st.step}: ${escapeHtml(st.name)}</span>
          <span class="ai-step-category">${escapeHtml(st.category)}</span>
        </div>
        <p class="ai-step-finding">${escapeHtml(st.finding)}</p>
        <p class="ai-step-insight"><strong>Strategic Implication:</strong> ${escapeHtml(st.strategic_insight)}</p>
      </div>
    `).join('');

    let tableHtml = '';
    if (proc.wealth_trajectory && proc.wealth_trajectory.length > 0) {
      tableHtml = `
        <div class="wealth-trajectory-wrapper">
          <h5>📈 Multi-Year Cumulative Wealth Advantage (4-Year Horizon)</h5>
          <table class="wealth-table">
            <thead>
              <tr>
                <th>Timeline</th>
                <th>Baseline Cumulative</th>
                <th>Recommended Cumulative</th>
                <th>NRRRI Grant Paid</th>
                <th>Net Alpha Advantage</th>
              </tr>
            </thead>
            <tbody>
              ${proc.wealth_trajectory.map((w) => `
                <tr>
                  <td><strong>Year ${w.year}</strong></td>
                  <td>$${w.baseline_cumulative.toLocaleString()} CAD</td>
                  <td>$${w.candidate_cumulative.toLocaleString()} CAD</td>
                  <td><span class="grant-pill grant-tier-1">$${w.nrrri_payout_cumulative.toLocaleString()} CAD</span></td>
                  <td><strong style="color: #059669;">+$${w.cumulative_wealth_advantage.toLocaleString()} CAD</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    thinkingBody.innerHTML = `
      <div style="background: rgba(124, 58, 237, 0.06); padding: 14px 18px; border-radius: 10px; border-left: 4px solid #7c3aed; margin-bottom: 12px;">
        <strong style="color: #4c1d95; font-size: 0.92rem;">🤖 Autonomous Strategic Verdict:</strong>
        <p style="font-size: 0.88rem; color: #1e293b; margin-top: 4px; line-height: 1.5;">${escapeHtml(proc.executive_rationale)}</p>
      </div>
      ${stepsHtml}
      ${tableHtml}
    `;

    // Hook up accordion toggle
    const toggleHeader = document.getElementById('ai-thinking-toggle');
    if (toggleHeader) {
      toggleHeader.onclick = () => {
        const isHidden = thinkingBody.style.display === 'none';
        thinkingBody.style.display = isHidden ? 'flex' : 'none';
        const btnText = document.getElementById('ai-toggle-btn-text');
        const btnArrow = document.getElementById('ai-toggle-arrow');
        if (btnText) btnText.innerText = isHidden ? 'Collapse Breakdown' : 'View Diagnostic Breakdown';
        if (btnArrow) btnArrow.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
      };
    }
  }

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

// =============================================================================
// 9. Job Creation & Intake Engine
// =============================================================================
const GTA_CITY_DISTANCES = {
  'Downtown Toronto': 0.0,
  'Midtown': 5.8,
  'North York': 13.5,
  'Scarborough': 18.2,
  'Etobicoke': 14.8,
  'Markham': 25.5,
  'Mississauga': 24.2,
  'Vaughan': 22.0,
  'Richmond Hill': 23.8,
  'Brampton': 31.4,
  'Oakville': 35.1,
};

function initJobCreationForm() {
  const form = document.getElementById('post-job-form');
  const splitInput = document.getElementById('post-split');
  const splitPhysicianVal = document.getElementById('post-split-physician-val');
  const splitClinicVal = document.getElementById('post-split-clinic-val');
  const barPhysician = document.getElementById('post-split-bar-physician');
  const barClinic = document.getElementById('post-split-bar-clinic');
  const citySelect = document.getElementById('post-city');
  const proximityText = document.getElementById('post-proximity-text');
  const linkSettings = document.getElementById('link-goto-settings');
  const resetBtn = document.getElementById('post-job-reset-btn');

  function updateSplitVisualizer() {
    if (!splitInput) return;
    let p = parseFloat(splitInput.value);
    if (isNaN(p)) p = 75;
    if (p < 50) p = 50;
    if (p > 95) p = 95;
    const c = 100 - p;

    if (splitPhysicianVal) splitPhysicianVal.innerText = `Physician Share: ${p}%`;
    if (splitClinicVal) splitClinicVal.innerText = `Clinic Overhead: ${c}%`;
    if (barPhysician) barPhysician.style.width = `${p}%`;
    if (barClinic) barClinic.style.width = `${c}%`;
  }

  if (splitInput) {
    splitInput.addEventListener('input', updateSplitVisualizer);
  }

  if (citySelect && proximityText) {
    citySelect.addEventListener('change', () => {
      const city = citySelect.value;
      const km = GTA_CITY_DISTANCES[city] !== undefined ? GTA_CITY_DISTANCES[city] : 12.0;
      proximityText.innerText = `~${km.toFixed(1)} km from Downtown Toronto (Haversine radial distance)`;
    });
  }

  if (linkSettings) {
    linkSettings.addEventListener('click', (e) => {
      e.preventDefault();
      switchToTab('panel-settings');
    });
  }

  if (resetBtn && form) {
    resetBtn.addEventListener('click', () => {
      form.reset();
      updateSplitVisualizer();
      showToast('Form fields have been reset.', 'info');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = document.getElementById('post-job-submit-btn');
      const origBtnText = submitBtn ? submitBtn.innerText : 'Submit';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = '⏳ Publishing to Supabase...';
      }

      const formData = new FormData(form);
      const payload = {
        title: (formData.get('title') || '').trim(),
        company: (formData.get('company') || '').trim(),
        specialty: formData.get('specialty') || 'Family Medicine',
        employment_type: formData.get('employment_type') || 'full-time',
        city: formData.get('city') || 'Downtown Toronto',
        street_address: (formData.get('street_address') || '').trim(),
        annualized_salary: formData.get('annualized_salary') || '',
        signing_bonus: formData.get('signing_bonus') || '',
        physician_split_pct: formData.get('physician_split_pct') || 75,
        contact_emails: (formData.get('contact_emails') || '').trim(),
        contact_phone: (formData.get('contact_phone') || '').trim(),
        emr_system: formData.get('emr_system') || 'Telus PS Suite',
        patient_volume: (formData.get('patient_volume') || '').trim(),
        valid_through: formData.get('valid_through') || '',
        full_description_text: (formData.get('full_description_text') || '').trim(),
      };

      try {
        const res = await fetch('/api/jobs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          showToast(`Position '${payload.title}' published to Supabase & Live Explorer!`, 'success');
          form.reset();
          updateSplitVisualizer();

          // Refresh database stats & jobs explorer
          await initHealthAndOverview();
          await loadJobs();

          // Automatically transition to the live jobs view
          setTimeout(() => switchToTab('panel-jobs'), 600);
        } else {
          const errList = data.details && Array.isArray(data.details)
            ? data.details.join(' | ')
            : (data.error || 'Job submission failed');
          showToast(`Validation Failed: ${errList}`, 'error');
        }
      } catch (err) {
        showToast(`Network error: ${err.message}`, 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = origBtnText;
        }
      }
    });
  }
}

// =============================================================================
// 10. Configurable Field Settings & Governance Engine
// =============================================================================
let currentSettings = null;

async function initSettingsPanel() {
  const saveBtn = document.getElementById('btn-save-settings');
  const resetBtn = document.getElementById('btn-reset-settings');
  const presetCards = document.querySelectorAll('.preset-card');

  if (saveBtn) {
    saveBtn.addEventListener('click', saveSettings);
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => applyPreset('standard'));
  }

  presetCards.forEach((card) => {
    card.addEventListener('click', () => {
      const presetKey = card.getAttribute('data-preset');
      if (presetKey) applyPreset(presetKey);
    });
  });

  // Load active settings from backend
  await loadSettings();
}

async function loadSettings() {
  try {
    const res = await fetch('/api/settings/job-fields');
    if (!res.ok) throw new Error('Failed to fetch settings');
    currentSettings = await res.json();
    renderSettingsMatrix(currentSettings);
    applySettingsToJobForm(currentSettings);
    updatePresetCardHighlight(currentSettings.preset || 'standard');
  } catch (err) {
    console.warn('Using client fallback settings:', err);
  }
}

function updatePresetCardHighlight(activePreset) {
  const cards = document.querySelectorAll('.preset-card');
  cards.forEach((card) => {
    if (card.getAttribute('data-preset') === activePreset) {
      card.classList.add('is-active');
    } else {
      card.classList.remove('is-active');
    }
  });
}

function renderSettingsMatrix(settings) {
  const tbody = document.getElementById('settings-table-body');
  if (!tbody || !settings || !settings.fields) return;

  tbody.innerHTML = '';
  const fields = settings.fields;

  const categoryBadges = {
    identity: { label: 'Identity', class: 'tag-blue' },
    location: { label: 'Location', class: 'tag-emerald' },
    compensation: { label: 'Compensation', class: 'tag-emerald' },
    contact: { label: 'Outreach', class: 'tag-blue' },
    clinical: { label: 'Clinical', class: '' },
  };

  Object.values(fields).forEach((field) => {
    const tr = document.createElement('tr');
    const catInfo = categoryBadges[field.category] || { label: field.category, class: '' };

    tr.innerHTML = `
      <td>
        <div class="field-meta-col">
          <span class="field-name-text">${escapeHtml(field.label)}</span>
          <span class="field-key-code">${escapeHtml(field.key)}</span>
        </div>
      </td>
      <td>
        <span class="badge-tag ${catInfo.class}">${catInfo.label}</span>
      </td>
      <td style="color: var(--text-secondary); font-size: 0.85rem;">
        ${escapeHtml(field.description || '')}
      </td>
      <td style="text-align: center;">
        <label class="switch" title="Toggle required status">
          <input type="checkbox" class="setting-req-toggle" data-key="${field.key}" ${field.required ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>
      </td>
      <td style="text-align: center;">
        <label class="switch" title="Toggle enabled status">
          <input type="checkbox" class="setting-enable-toggle" data-key="${field.key}" ${field.enabled !== false ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>
      </td>
    `;

    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.setting-req-toggle').forEach((toggle) => {
    toggle.addEventListener('change', (e) => {
      const key = e.target.getAttribute('data-key');
      if (currentSettings && currentSettings.fields[key]) {
        currentSettings.fields[key].required = e.target.checked;
        currentSettings.preset = 'custom';
        updatePresetCardHighlight('custom');
        applySettingsToJobForm(currentSettings);
      }
    });
  });

  tbody.querySelectorAll('.setting-enable-toggle').forEach((toggle) => {
    toggle.addEventListener('change', (e) => {
      const key = e.target.getAttribute('data-key');
      if (currentSettings && currentSettings.fields[key]) {
        currentSettings.fields[key].enabled = e.target.checked;
        currentSettings.preset = 'custom';
        updatePresetCardHighlight('custom');
        applySettingsToJobForm(currentSettings);
      }
    });
  });
}

function applySettingsToJobForm(settings) {
  if (!settings || !settings.fields) return;

  const fieldGroups = document.querySelectorAll('.form-field-group[data-field-key]');
  fieldGroups.forEach((group) => {
    const key = group.getAttribute('data-field-key');
    const config = settings.fields[key];
    if (!config) return;

    // Toggle visibility based on enabled
    if (config.enabled === false) {
      group.style.display = 'none';
    } else {
      group.style.display = '';
    }

    // Toggle required indicator badge & input required attribute
    const badge = group.querySelector('.field-req-badge');
    const input = group.querySelector('input, select, textarea');

    if (config.required) {
      if (badge) {
        badge.className = 'field-req-badge tag-req';
        badge.innerText = '* Required';
      }
      if (input) {
        input.setAttribute('required', 'required');
      }
    } else {
      if (badge) {
        badge.className = 'field-req-badge tag-opt';
        badge.innerText = 'Optional';
      }
      if (input) {
        input.removeAttribute('required');
      }
    }
  });
}

function applyPreset(presetKey) {
  if (!currentSettings || !currentSettings.fields) return;

  const standardReq = ['title', 'company', 'specialty', 'employment_type', 'city', 'contact_emails'];
  const strictReq = ['title', 'company', 'specialty', 'employment_type', 'city', 'street_address', 'annualized_salary', 'physician_split_pct', 'contact_emails', 'emr_system'];
  const flexibleReq = ['title', 'specialty', 'contact_emails'];

  let targetReq = standardReq;
  if (presetKey === 'strict') targetReq = strictReq;
  if (presetKey === 'flexible') targetReq = flexibleReq;

  Object.keys(currentSettings.fields).forEach((key) => {
    currentSettings.fields[key].required = targetReq.includes(key);
    currentSettings.fields[key].enabled = true;
  });

  currentSettings.preset = presetKey;
  updatePresetCardHighlight(presetKey);
  renderSettingsMatrix(currentSettings);
  applySettingsToJobForm(currentSettings);
  showToast(`Applied ${presetKey.toUpperCase()} preset. Click 'Save & Apply Rules' to persist to backend.`, 'info');
}

async function saveSettings() {
  if (!currentSettings) return;
  const saveBtn = document.getElementById('btn-save-settings');
  const origText = saveBtn ? saveBtn.innerText : 'Save';

  try {
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.innerText = '⏳ Saving...';
    }

    const res = await fetch('/api/settings/job-fields', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentSettings),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      currentSettings = data.settings;
      renderSettingsMatrix(currentSettings);
      applySettingsToJobForm(currentSettings);
      showToast('Field requirement settings successfully saved and active!', 'success');
    } else {
      showToast(`Error saving settings: ${data.error || 'Server error'}`, 'error');
    }
  } catch (err) {
    showToast(`Network error: ${err.message}`, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerText = origText;
    }
  }
}

// =============================================================================
// 11. Toast Notifications & Global Navigation Helper
// =============================================================================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-msg toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <span style="flex:1;">${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 350);
  }, 4500);
}

function switchToTab(targetPanelId) {
  const btn = document.querySelector(`.nav-tab[data-target="${targetPanelId}"]`);
  if (btn) {
    btn.click();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// =============================================================================
// Real-Time Ontario PRO / ROS Geospatial Opportunity Map
// =============================================================================

let realTimeMap = null;
let mapMarkersLayer = null;
let allMapJobs = [];
let allMapCommunities = [];

async function initRealTimeMap() {
  const mapElement = document.getElementById('realtime-leaflet-map');
  if (!mapElement || typeof L === 'undefined') return;

  // Initialize Leaflet Map centered on Southern & Central Ontario
  if (!realTimeMap) {
    realTimeMap = L.map('realtime-leaflet-map', {
      center: [44.3, -79.5],
      zoom: 8,
      minZoom: 6,
      maxZoom: 14,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    // Clean, high-performance light CartoDB Voyager tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://openstreetmap.org">OSM</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(realTimeMap);

    // 500 km planning radius circle around Toronto (matching screenshot)
    const torontoCenter = [43.6532, -79.3832];
    L.circle(torontoCenter, {
      radius: 500000,
      color: '#0284c7',
      weight: 1.5,
      dashArray: '6, 6',
      fillColor: '#0284c7',
      fillOpacity: 0.02,
      interactive: false,
    }).addTo(realTimeMap);

    // Toronto Anchor Marker
    const torontoIcon = L.divIcon({
      className: 'toronto-anchor-icon',
      html: `
        <div style="background: #e11d48; width: 20px; height: 20px; border-radius: 50%; border: 3px solid #ffffff; box-shadow: 0 0 14px rgba(225, 29, 72, 0.8); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 10px; font-weight: 800;">T</div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
    L.marker(torontoCenter, { icon: torontoIcon })
      .bindTooltip('<strong>Toronto (GTA Core Anchor)</strong><br>0 km reference baseline', { direction: 'top' })
      .addTo(realTimeMap);

    mapMarkersLayer = L.layerGroup().addTo(realTimeMap);
  }

  // Hook up filter dropdowns & controls
  const corridorSelect = document.getElementById('map-corridor-filter');
  const proSelect = document.getElementById('map-pro-filter');
  const searchInput = document.getElementById('map-search-input');
  const btnScraper = document.getElementById('btn-trigger-scraper');
  const btnCloseDrawer = document.getElementById('btn-close-map-drawer');

  if (corridorSelect) corridorSelect.addEventListener('change', filterAndRenderMap);
  if (proSelect) proSelect.addEventListener('change', filterAndRenderMap);
  if (searchInput) searchInput.addEventListener('input', debounce(filterAndRenderMap, 250));
  if (btnCloseDrawer) {
    btnCloseDrawer.addEventListener('click', () => {
      const drawer = document.getElementById('map-community-drawer');
      if (drawer) drawer.style.display = 'none';
    });
  }

  if (btnScraper) {
    btnScraper.addEventListener('click', triggerAutomatedScraper);
  }

  await loadRealTimeMapData();
}

async function loadRealTimeMapData() {
  try {
    const [summaryRes, jobsRes] = await Promise.all([
      fetch('/api/map/summary'),
      fetch('/api/map/jobs'),
    ]);

    const summaryData = await summaryRes.json();
    const jobsData = await jobsRes.json();

    allMapCommunities = summaryData.communities || [];
    allMapJobs = jobsData.jobs || [];

    // Update KPI Bar
    const kpiTotal = document.getElementById('map-kpi-total');
    const kpiPro = document.getElementById('map-kpi-pro');
    const kpiNrrri = document.getElementById('map-kpi-nrrri');
    const kpiSalary = document.getElementById('map-kpi-salary');

    if (kpiTotal) kpiTotal.innerText = `${summaryData.total_active_jobs || allMapJobs.length} Live`;
    
    let proJobsCount = 0;
    let maxSal = 0;
    allMapJobs.forEach((j) => {
      if (j.pro_ros_status && j.pro_ros_status.includes('PRO')) proJobsCount++;
      if (j.annualized_salary > maxSal) maxSal = j.annualized_salary;
    });

    if (kpiPro) kpiPro.innerText = `${proJobsCount} Roles`;
    if (kpiNrrri) kpiNrrri.innerText = '$111,920';
    if (kpiSalary) kpiSalary.innerText = maxSal > 0 ? `$${Math.round(maxSal / 1000)}k CAD` : '$550k CAD';

    filterAndRenderMap();
  } catch (err) {
    console.error('Failed to load map data:', err);
  }
}

function filterAndRenderMap() {
  if (!mapMarkersLayer || !realTimeMap) return;
  mapMarkersLayer.clearLayers();

  const corridorFilter = document.getElementById('map-corridor-filter')?.value || 'All';
  const proFilter = document.getElementById('map-pro-filter')?.value || 'all';
  const searchQuery = (document.getElementById('map-search-input')?.value || '').toLowerCase().trim();

  let filtered = [...allMapCommunities];

  if (corridorFilter !== 'All') {
    filtered = filtered.filter((c) => c.corridor && c.corridor.toLowerCase() === corridorFilter.toLowerCase());
  }

  if (proFilter === 'pro_only') {
    filtered = filtered.filter((c) => c.pro_ros_status && c.pro_ros_status.includes('Confirmed'));
  }

  if (searchQuery) {
    filtered = filtered.filter(
      (c) =>
        c.city.toLowerCase().includes(searchQuery) ||
        (c.corridor && c.corridor.toLowerCase().includes(searchQuery))
    );
  }

  const bounds = [];

  filtered.forEach((c) => {
    if (!c.latitude || !c.longitude) return;

    bounds.push([c.latitude, c.longitude]);

    // Format display gross salary
    const displayGross = c.avg_gross_salary > 0
      ? `$${Math.round(c.avg_gross_salary / 1000)}k`
      : `${c.total_jobs} ${c.total_jobs === 1 ? 'Job' : 'Jobs'}`;

    // NRRRI grant badge
    const nrrriBadge = c.nrrri_incentive_amount > 0
      ? `<span class="salary-pin-nrrri">+$${Math.round(c.nrrri_incentive_amount / 1000)}k</span>`
      : '';

    // Color code status dot & pin
    let statusClass = 'pin-possible';
    let dotClass = 'dot-orange';
    if (c.pro_ros_status && c.pro_ros_status.includes('Confirmed')) {
      statusClass = 'pin-pro';
      dotClass = 'dot-green';
    } else if (c.corridor === 'GTA Core' || (c.pro_ros_status && c.pro_ros_status.includes('Excluded'))) {
      statusClass = 'pin-gta';
      dotClass = 'dot-red';
    }

    const pinHtml = `
      <div class="salary-pin-pill ${statusClass}">
        <span class="salary-pin-dot ${dotClass}"></span>
        <span class="salary-pin-amount">${displayGross}</span>
        ${nrrriBadge}
      </div>
    `;

    const icon = L.divIcon({
      className: 'salary-map-pin',
      html: pinHtml,
      iconSize: [120, 32],
      iconAnchor: [60, 16],
    });

    const marker = L.marker([c.latitude, c.longitude], { icon });

    // Popup Content
    const popupHtml = `
      <div class="map-popup-card">
        <div class="map-popup-header">
          <div class="map-popup-badge-row">
            <span class="map-popup-badge badge-corridor">${escapeHtml(c.corridor)}</span>
            ${c.nrrri_incentive_amount ? `<span class="map-popup-badge badge-grant">NRRRI: $${c.nrrri_incentive_amount.toLocaleString()}</span>` : ''}
          </div>
          <h4 class="map-popup-title">${escapeHtml(c.city)}</h4>
          <span class="map-popup-meta">${c.distance_from_toronto_km ? Math.round(c.distance_from_toronto_km) + ' km from Toronto' : 'Central Region'} • ${escapeHtml(c.pro_ros_status)}</span>
        </div>
        <div class="map-popup-stats">
          <div class="popup-stat-col">
            <span>Avg Gross Billings</span>
            <strong>${c.avg_gross_salary > 0 ? '$' + c.avg_gross_salary.toLocaleString() + ' CAD' : '75/25 Split'}</strong>
          </div>
          <div class="popup-stat-col">
            <span>Active Openings</span>
            <strong>${c.total_jobs} ${c.total_jobs === 1 ? 'Position' : 'Positions'}</strong>
          </div>
        </div>
        <div class="map-popup-actions">
          <button class="btn-popup-inspect" onclick="openCommunityDrawer('${escapeHtml(c.city)}')">
            Inspect ${c.total_jobs} ${c.total_jobs === 1 ? 'Opportunity' : 'Opportunities'} &rarr;
          </button>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml, { maxWidth: 320 });
    marker.on('click', () => {
      openCommunityDrawer(c.city);
    });

    mapMarkersLayer.addLayer(marker);
  });

  // Fit bounds if filtered to a specific corridor
  if (corridorFilter !== 'All' && bounds.length > 0) {
    realTimeMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }
}

// Window-accessible function for popup button click
window.openCommunityDrawer = function(cityName) {
  const drawer = document.getElementById('map-community-drawer');
  const drawerName = document.getElementById('drawer-community-name');
  const drawerMeta = document.getElementById('drawer-community-meta');
  const drawerBadge = document.getElementById('drawer-corridor-badge');
  const jobsContainer = document.getElementById('drawer-jobs-container');

  if (!drawer || !jobsContainer) return;

  const communityJobs = allMapJobs.filter(
    (j) => j.city && j.city.toLowerCase() === cityName.toLowerCase()
  );

  const commData = allMapCommunities.find(
    (c) => c.city.toLowerCase() === cityName.toLowerCase()
  ) || {};

  if (drawerName) drawerName.innerText = cityName;
  if (drawerBadge) drawerBadge.innerText = commData.corridor || 'Ontario';
  if (drawerMeta) {
    const distText = commData.distance_from_toronto_km ? `${Math.round(commData.distance_from_toronto_km)} km from Toronto` : 'Central Ontario';
    const nrrriText = commData.nrrri_incentive_amount ? ` • 🎁 Potential NRRRI Grant: $${commData.nrrri_incentive_amount.toLocaleString()} CAD` : '';
    const proText = commData.pro_ros_status ? ` • ${commData.pro_ros_status}` : '';
    drawerMeta.innerText = `${distText}${nrrriText}${proText}`;
  }

  drawer.style.display = 'block';
  drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  jobsContainer.innerHTML = '';
  if (communityJobs.length === 0) {
    jobsContainer.innerHTML = `
      <div style="padding: 20px; color: var(--text-muted); text-align: center; grid-column: 1 / -1;">
        No active job postings currently listed in ${escapeHtml(cityName)}.
      </div>
    `;
    return;
  }

  communityJobs.forEach((job) => {
    const card = document.createElement('div');
    card.className = 'drawer-job-card';

    const grossText = job.annualized_salary > 0
      ? `$${job.annualized_salary.toLocaleString()} CAD / yr gross`
      : `${job.physician_split_pct || 75}/${100 - (job.physician_split_pct || 75)} FFS Split`;

    const nrrriBadge = job.nrrri_incentive_amount > 0
      ? `<span class="grant-pill grant-tier-1" style="font-size: 0.7rem;">🎁 $${job.nrrri_incentive_amount.toLocaleString()} NRRRI Grant</span>`
      : '';

    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
          <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-primary); line-height: 1.3;">${escapeHtml(job.title)}</h4>
          ${nrrriBadge}
        </div>
        <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px;">
          <strong>${escapeHtml(job.company || 'Modern Practice')}</strong> • ${escapeHtml(job.specialty)} • ${escapeHtml(job.employment_type || 'full-time')}
        </p>
        <p style="font-size: 0.84rem; font-weight: 800; color: #059669; margin-bottom: 8px;">
          ${grossText}
        </p>
        <p style="font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;">
          ${escapeHtml(job.description_summary || 'Turnkey practice environment with EMR support and dedicated administrative staff.')}
        </p>
      </div>

      <div style="display: flex; gap: 8px; margin-top: 10px;">
        <button class="btn btn-primary btn-sm" style="flex: 1;" onclick="openJobDetailsModal('${escapeHtml(job.job_id)}')">
          View In-App Dossier
        </button>
      </div>
    `;

    jobsContainer.appendChild(card);
  });
};

async function triggerAutomatedScraper() {
  const btn = document.getElementById('btn-trigger-scraper');
  const spinIcon = document.getElementById('scraper-spin-icon');
  const btnText = document.getElementById('scraper-btn-text');

  if (spinIcon) spinIcon.classList.add('is-spinning');
  if (btnText) btnText.innerText = 'Syncing Live...';
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/scraper/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const data = await res.json();

    showToast('Autonomous Regional Scraper triggered in background. Polling live status...', 'info');

    // Poll status every 3s
    const pollInterval = setInterval(async () => {
      try {
        const statusRes = await fetch('/api/scraper/status');
        const status = await statusRes.json();

        if (!status.running) {
          clearInterval(pollInterval);
          if (spinIcon) spinIcon.classList.remove('is-spinning');
          if (btnText) btnText.innerText = 'Sync Live Postings';
          if (btn) btn.disabled = false;

          showToast('Sync complete! Regional map and dataset updated with live postings.', 'success');
          await loadRealTimeMapData();
        }
      } catch (pollErr) {
        clearInterval(pollInterval);
        if (spinIcon) spinIcon.classList.remove('is-spinning');
        if (btnText) btnText.innerText = 'Sync Live Postings';
        if (btn) btn.disabled = false;
      }
    }, 3000);
  } catch (err) {
    if (spinIcon) spinIcon.classList.remove('is-spinning');
    if (btnText) btnText.innerText = 'Sync Live Postings';
    if (btn) btn.disabled = false;
    showToast(`Failed to trigger scraper: ${err.message}`, 'error');
  }
}


