const METRIC_OPTIONS = [
  { key: 'creditsUsed', label: 'Credits Used' },
  { key: 'activityScore', label: 'Activity Score' },
  { key: 'detections', label: 'Detections' },
  { key: 'savedTemplates', label: 'Saved Templates' },
  { key: 'fillLinkResponses', label: 'Fill Link Responses' },
  { key: 'apiFills', label: 'API Fills' },
  { key: 'signingRequests', label: 'Signing Requests' },
  { key: 'structuredFillCredits', label: 'Structured Fill Credits' },
  { key: 'structuredFillCommits', label: 'Structured Fill Commits' },
  { key: 'structuredFillMatchedPdfs', label: 'Structured Fill Matched PDFs' },
];

const numberFormatter = new Intl.NumberFormat();
const statusText = document.getElementById('statusText');
const errorBanner = document.getElementById('errorBanner');
const metaStrip = document.getElementById('metaStrip');
const roleStrip = document.getElementById('roleStrip');
const metricCards = document.getElementById('metricCards');
const chartRows = document.getElementById('chartRows');
const userRows = document.getElementById('userRows');
const metricSelect = document.getElementById('metricSelect');
const searchInput = document.getElementById('searchInput');
const refreshButton = document.getElementById('refreshButton');

let snapshot = null;
let currentMetric = 'creditsUsed';

function formatCount(value) {
  return numberFormatter.format(Number.isFinite(value) ? value : 0);
}

function formatDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return 'Not available';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleString();
}

function resolveUserLabel(user) {
  const displayName = String(user.displayName || '').trim();
  const email = String(user.email || '').trim();
  if (displayName && email) return `${displayName} (${email})`;
  return displayName || email || user.userId;
}

function resolveMetricValue(user, metricKey) {
  const value = user?.[metricKey];
  return Number.isFinite(value) ? value : 0;
}

function setError(message) {
  const normalized = String(message || '').trim();
  errorBanner.textContent = normalized;
  errorBanner.classList.toggle('hidden', normalized.length === 0);
}

function renderMeta(meta = {}) {
  metaStrip.innerHTML = '';
  const items = [
    ['Project', meta.projectId || 'dullypdf'],
    ['Target', meta.environment || 'prod'],
    ['Access', meta.accessMode || 'local-adc'],
    ['Generated', formatDateTime(meta.generatedAt)],
  ];
  for (const [label, value] of items) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    metaStrip.appendChild(chip);
  }
}

function renderRoles(roleCounts = {}) {
  roleStrip.innerHTML = '';
  const roles = [
    ['Base', roleCounts.base],
    ['Pro', roleCounts.pro],
    ['God', roleCounts.god],
    ['Unknown', roleCounts.unknown],
  ];
  for (const [label, value] of roles) {
    const pill = document.createElement('div');
    pill.className = 'role-pill';
    pill.innerHTML = `<span>${label}</span><strong>${formatCount(value)}</strong>`;
    roleStrip.appendChild(pill);
  }
}

function renderCards(globalStats = {}) {
  metricCards.innerHTML = '';
  const cards = [
    ['Overall Users', globalStats.totalUsers, `${formatCount(globalStats.activeUsers)} active users`],
    ['Detections', globalStats.totalDetections, `${formatCount(globalStats.totalDetectionPages)} detected pages`],
    ['Saved Templates', globalStats.totalSavedTemplates, `${formatCount(globalStats.totalFillLinks)} fill links published`],
    ['Credits Used', globalStats.totalCreditsUsed, `${formatCount(globalStats.totalApiFills)} API fills recorded`],
    ['Fill Link Responses', globalStats.totalFillLinkResponses, `${formatCount(globalStats.totalActiveFillLinks)} active links`],
    ['API Endpoints', globalStats.totalApiEndpoints, `${formatCount(globalStats.totalActiveApiEndpoints)} active endpoints`],
    ['Signing Requests', globalStats.totalSigningRequests, `${formatCount(globalStats.totalCompletedSigningRequests)} completed requests`],
    [
      'Search & Fill Credits',
      globalStats.totalStructuredFillCredits,
      `${formatCount(globalStats.totalStructuredFillCommits)} commits · ${formatCount(globalStats.totalStructuredFillMatchedPdfs)} matched PDFs`,
    ],
    [
      'Search & Fill by Source',
      (globalStats.totalStructuredFillCsvCredits || 0)
        + (globalStats.totalStructuredFillExcelCredits || 0)
        + (globalStats.totalStructuredFillSqlCredits || 0)
        + (globalStats.totalStructuredFillJsonCredits || 0)
        + (globalStats.totalStructuredFillTxtCredits || 0),
      `CSV ${formatCount(globalStats.totalStructuredFillCsvCredits)} · `
      + `XLSX ${formatCount(globalStats.totalStructuredFillExcelCredits)} · `
      + `SQL ${formatCount(globalStats.totalStructuredFillSqlCredits)} · `
      + `JSON ${formatCount(globalStats.totalStructuredFillJsonCredits)} · `
      + `TXT ${formatCount(globalStats.totalStructuredFillTxtCredits)}`,
    ],
  ];
  for (const [label, value, note] of cards) {
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <span class="card-label">${label}</span>
      <strong class="card-value">${formatCount(value)}</strong>
      <p class="card-note">${note}</p>
    `;
    metricCards.appendChild(card);
  }
}

function getFilteredUsers() {
  const users = Array.isArray(snapshot?.users) ? snapshot.users : [];
  const query = String(searchInput.value || '').trim().toLowerCase();
  if (!query) return users;
  return users.filter((user) =>
    [
      user.displayName,
      user.email,
      user.userId,
      user.role,
    ]
      .map((value) => String(value || '').toLowerCase())
      .some((value) => value.includes(query))
  );
}

function getSortedUsers() {
  return [...getFilteredUsers()].sort((left, right) => {
    const metricDelta = resolveMetricValue(right, currentMetric) - resolveMetricValue(left, currentMetric);
    if (metricDelta !== 0) return metricDelta;
    const activityDelta = resolveMetricValue(right, 'activityScore') - resolveMetricValue(left, 'activityScore');
    if (activityDelta !== 0) return activityDelta;
    return resolveUserLabel(left).localeCompare(resolveUserLabel(right));
  });
}

function renderChart() {
  chartRows.innerHTML = '';
  const users = getSortedUsers().slice(0, 12);
  const maxValue = Math.max(...users.map((user) => resolveMetricValue(user, currentMetric)), 1);
  if (users.length === 0) {
    chartRows.innerHTML = '<p class="empty-state">No users match the current filter.</p>';
    return;
  }

  for (const user of users) {
    const value = resolveMetricValue(user, currentMetric);
    const width = `${Math.max((value / maxValue) * 100, value > 0 ? 6 : 0)}%`;
    const row = document.createElement('div');
    row.className = 'chart-row';
    row.setAttribute('role', 'listitem');
    row.innerHTML = `
      <div class="chart-row__header">
        <span class="chart-row__label">${resolveUserLabel(user)}</span>
        <span class="chart-row__value">${formatCount(value)}</span>
      </div>
      <div class="chart-row__track" aria-hidden="true">
        <div class="chart-row__fill" style="width:${width}"></div>
      </div>
    `;
    chartRows.appendChild(row);
  }
}

function renderTable() {
  userRows.innerHTML = '';
  const users = getSortedUsers();
  if (users.length === 0) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="11" class="empty-state">No users match the current search.</td>';
    userRows.appendChild(row);
    return;
  }

  for (const user of users) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <div class="user-cell">
          <strong>${resolveUserLabel(user)}</strong>
          <span>${user.userId}</span>
        </div>
      </td>
      <td><span class="role-tag role-tag--${String(user.role || 'unknown')}">${String(user.role || 'unknown')}</span></td>
      <td>${formatCount(user.detections)}</td>
      <td>${formatCount(user.savedTemplates)}</td>
      <td>${formatCount(user.creditsUsed)}</td>
      <td>${formatCount(user.fillLinkResponses)}</td>
      <td>${formatCount(user.apiFills)}</td>
      <td>${formatCount(user.signingRequests)}</td>
      <td>${formatCount(user.structuredFillCredits)}</td>
      <td>${formatCount(user.structuredFillCommits)}</td>
      <td>${formatDateTime(user.lastActivityAt)}</td>
    `;
    userRows.appendChild(row);
  }
}

function renderSnapshot(nextSnapshot) {
  snapshot = nextSnapshot;
  renderMeta(snapshot.meta);
  renderRoles(snapshot.global?.roleCounts);
  renderCards(snapshot.global);
  renderChart();
  renderTable();
}

async function refreshStats() {
  refreshButton.disabled = true;
  statusText.textContent = 'Refreshing snapshot…';
  setError('');

  try {
    const response = await fetch('/api/stats', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.detail || 'Unable to load internal stats.');
    }
    renderSnapshot(payload);
    statusText.textContent = `Updated ${formatDateTime(payload?.meta?.generatedAt)}`;
  } catch (error) {
    statusText.textContent = 'Refresh failed';
    setError(error instanceof Error ? error.message : 'Unable to load internal stats.');
  } finally {
    refreshButton.disabled = false;
  }
}

function populateMetricSelect() {
  metricSelect.innerHTML = '';
  for (const option of METRIC_OPTIONS) {
    const element = document.createElement('option');
    element.value = option.key;
    element.textContent = option.label;
    metricSelect.appendChild(element);
  }
  metricSelect.value = currentMetric;
}

metricSelect.addEventListener('change', () => {
  currentMetric = metricSelect.value;
  renderChart();
  renderTable();
});

searchInput.addEventListener('input', () => {
  renderChart();
  renderTable();
});

refreshButton.addEventListener('click', () => {
  void refreshStats();
});

populateMetricSelect();
void refreshStats();
