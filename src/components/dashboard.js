/**
 * Dashboard UI — renders a table of all mortgage applications.
 */

import { fetchAllMortgageApplications, explainPath } from '../services/intentyfi.js';

const PRODUCT_LABELS = {
  FIXED_CONFORMING_30YR: '30-Year Fixed (Conforming)',
  FIXED_CONFORMING_15YR: '15-Year Fixed (Conforming)',
  FIXED_JUMBO_30YR: '30-Year Fixed (Jumbo)',
  FIXED_JUMBO_15YR: '15-Year Fixed (Jumbo)',
};

// Number of data columns (excluding the Actions column)
const COL_COUNT = 14;

function formatCurrency(val) {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(val);
}

function formatPercent(val) {
  if (val === null || val === undefined) return '—';
  return (val * 100).toFixed(2) + '%';
}

function formatDate(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleDateString('en-US', { dateStyle: 'medium' });
}

function formatUrgency(val) {
  if (!val) return '—';
  const map = {
    IMMEDIATE: 'Immediate',
    MONTHS_3: 'Within 3mo',
    EXPLORING: 'Exploring',
  };
  return map[val] || val;
}

function shouldHideExplanationReason(reason) {
  if (!reason || typeof reason !== 'object') return false;
  const variable = reason.variable || reason.Variable || '';
  return variable.startsWith('Address@mti.intentyfi.co:') && variable.endsWith(':State');
}

function renderExplanation(data) {
  if (!data) return '<li>No explanation available.</li>';

  const reasons = Array.isArray(data)
    ? data
    : Array.isArray(data.Reasons)
      ? data.Reasons
      : Array.isArray(data.reasons)
        ? data.reasons
        : null;

  const visibleReasons = (reasons || []).filter(reason => !shouldHideExplanationReason(reason));

  if (visibleReasons.length > 0) {
    return visibleReasons.map(reason => {
      const label = reason.Label || reason.label || reason.Description || reason.description || reason.variable || reason.Variable || 'Explanation';
      const value = reason.Value ?? reason.value;
      const valueMarkup = value !== undefined ? `: <strong>${value}</strong>` : '';
      return `<li>${label}${valueMarkup}</li>`;
    }).join('');
  }

  return '<li>No additional explanation details available.</li>';
}

function computeAnalytics(apps) {
  const eligibleCount = apps.filter(a => a.IsEligible === true).length;
  const ineligibleCount = apps.filter(a => a.IsEligible === false).length;
  const unknownCount = apps.filter(a => a.IsEligible !== true && a.IsEligible !== false).length;

  const productCounts = {};
  apps.forEach(a => {
    const label = PRODUCT_LABELS[a.SelectedProduct] || a.SelectedProduct || 'Unknown';
    productCounts[label] = (productCounts[label] || 0) + 1;
  });

  return {
    eligibility: { eligible: eligibleCount, ineligible: ineligibleCount, unknown: unknownCount },
    products: Object.entries(productCounts).map(([label, count]) => ({ label, count })),
  };
}

export class DashboardUI {
  constructor() {
    this.tbody = document.getElementById('dashboard-tbody');
    this.refreshBtn = document.getElementById('dashboard-refresh');
    this.countEl = document.getElementById('dashboard-count');
    this.tableContainer = document.getElementById('dashboard-table-container');
    this.analyticsContainer = document.getElementById('dashboard-analytics');
    this.historyBtn = document.getElementById('dashboard-view-history');
    this.analyticsBtn = document.getElementById('dashboard-view-analytics');
    this._currentView = 'history';  // Track current view
    this._loaded = false;
    this._apps = [];
    this._charts = {};  // Store chart instances
    // Track which ObjectIDs are currently loading or expanded
    this._explaining = new Set();   // currently fetching
    this._expanded = new Map();     // objectId → explanation data

    this.refreshBtn.addEventListener('click', () => this.load());

    // View toggle buttons
    if (this.historyBtn) {
      this.historyBtn.addEventListener('click', () => this._switchView('history'));
    }
    if (this.analyticsBtn) {
      this.analyticsBtn.addEventListener('click', () => this._switchView('analytics'));
    }

    // Delegate explain button clicks via tbody
    this.tbody.addEventListener('click', async (e) => {
      const btn = e.target.closest('.explain-btn');
      if (!btn) return;
      const objectId = btn.dataset.objectId;
      const scopeId = btn.dataset.scopeId;
      await this._handleExplain(objectId, scopeId);
    });
  }

  async load() {
    this._explaining.clear();
    this._expanded.clear();
    this._setLoading(true);
    const apps = await fetchAllMortgageApplications();
    this._apps = apps || [];
    this._render(this._apps);
    this._renderAnalytics(this._apps);
    this._setLoading(false);
    this._loaded = true;
  }

  /** Load data only on first show. */
  async loadOnce() {
    if (!this._loaded) await this.load();
  }

  _switchView(view) {
    this._currentView = view;
    const isHistory = view === 'history';

    // Update button states
    if (this.historyBtn) {
      this.historyBtn.classList.toggle('active', isHistory);
    }
    if (this.analyticsBtn) {
      this.analyticsBtn.classList.toggle('active', !isHistory);
    }

    // Show/hide views
    if (this.tableContainer) {
      this.tableContainer.style.display = isHistory ? '' : 'none';
    }
    if (this.analyticsContainer) {
      this.analyticsContainer.style.display = isHistory ? 'none' : '';
    }
  }

  async _handleExplain(objectId, scopeId) {
    if (this._explaining.has(objectId)) return;

    // Toggle off if already expanded
    if (this._expanded.has(objectId)) {
      this._expanded.delete(objectId);
      this._updateExplainRow(objectId, null);
      this._updateExplainBtn(objectId, false);
      return;
    }

    this._explaining.add(objectId);
    this._updateExplainBtn(objectId, false, true);

    try {
      const variable = `MortgageApplication@mti.intentyfi.co:${objectId}:IsEligible`;
      const data = await explainPath(scopeId, variable);
      this._expanded.set(objectId, data);
      this._updateExplainRow(objectId, data);
      this._updateExplainBtn(objectId, true);
    } catch (err) {
      console.error('[Dashboard] Explain error:', err);
      this._expanded.set(objectId, { error: err.message });
      this._updateExplainRow(objectId, { error: err.message });
      this._updateExplainBtn(objectId, false);
    } finally {
      this._explaining.delete(objectId);
    }
  }

  _updateExplainBtn(objectId, isOpen, isLoading = false) {
    const btn = this.tbody.querySelector(`.explain-btn[data-object-id="${objectId}"]`);
    if (!btn) return;
    btn.disabled = isLoading;
    btn.textContent = isLoading ? 'Loading…' : isOpen ? 'Hide' : 'Explain';
    btn.classList.toggle('explain-btn-open', isOpen);
  }

  _updateExplainRow(objectId, data) {
    const existingRow = this.tbody.querySelector(`tr.explain-row[data-for="${objectId}"]`);
    if (existingRow) existingRow.remove();
    if (data === null) return;

    const dataRow = this.tbody.querySelector(`tr.dashboard-row[data-object-id="${objectId}"]`);
    if (!dataRow) return;

    const expandRow = document.createElement('tr');
    expandRow.className = 'explain-row';
    expandRow.dataset.for = objectId;

    const isError = data && data.error;
    expandRow.innerHTML = `
      <td colspan="${COL_COUNT + 1}" class="explain-cell">
        ${isError
          ? `<div class="explain-error">⚠ ${data.error}</div>`
          : `<div class="explain-panel">
               <div class="explain-title">Eligibility Explanation</div>
               <ul class="explain-list">${renderExplanation(data)}</ul>
             </div>`
        }
      </td>`;

    dataRow.insertAdjacentElement('afterend', expandRow);
  }

  _setLoading(on) {
    this.refreshBtn.disabled = on;
    this.refreshBtn.textContent = on ? 'Loading...' : 'Refresh';
    if (on) {
      this.tbody.innerHTML = `
        <tr>
          <td colspan="${COL_COUNT + 1}" class="dashboard-state-cell">
            <div class="dashboard-spinner"></div>
            Loading applications…
          </td>
        </tr>`;
    }
  }

  _render(apps) {
    if (!apps || apps.length === 0) {
      this.tbody.innerHTML = `
        <tr>
          <td colspan="${COL_COUNT + 1}" class="dashboard-state-cell dashboard-empty">
            No applications found.
          </td>
        </tr>`;
      if (this.countEl) this.countEl.textContent = '0 applications';
      return;
    }

    if (this.countEl) {
      this.countEl.textContent = `${apps.length} application${apps.length !== 1 ? 's' : ''}`;
    }

    this.tbody.innerHTML = apps.map(app => {
      const product = PRODUCT_LABELS[app.SelectedProduct] || app.SelectedProduct || '—';
      const borrowerName = app.BorrowerName && typeof app.BorrowerName !== 'number'
        ? app.BorrowerName
        : '—';
      const eligibleBadge = app.IsEligible === true
        ? '<span class="badge badge-green">Eligible</span>'
        : app.IsEligible === false
          ? '<span class="badge badge-red">Not Eligible</span>'
          : '<span class="badge badge-muted">Unknown</span>';
      const pmiAmount = app.PMIAmount != null ? formatCurrency(app.PMIAmount) : '—';

      return `
        <tr class="dashboard-row" data-object-id="${app.ObjectID}">
          <td class="td-appid">${app.AppID || '—'}</td>
          <td>${app.LoanType || '—'}</td>
          <td>${product}</td>
          <td class="td-right">${formatCurrency(app.PropertyValue)}</td>
          <td class="td-right">${formatCurrency(app.DownPayment)}</td>
          <td class="td-right">${formatPercent(app.LTVRatio)}</td>
          <td class="td-right">${app.DTIRatio != null ? formatPercent(app.DTIRatio) : '—'}</td>
          <td>${eligibleBadge}</td>
          <td class="td-right">${pmiAmount}</td>
          <td>${formatUrgency(app.Urgency)}</td>
          <td class="td-right">${app.MonthlyPI != null ? formatCurrency(app.MonthlyPI) : '—'}</td>
          <td>${borrowerName}</td>
          <td>${app.PropertyState || '—'}</td>
          <td class="td-date">${formatDate(app.DateSubmitted)}</td>
          <td>
            <button
              class="explain-btn"
              data-object-id="${app.ObjectID}"
              data-scope-id="${app.ScopeID}"
              ${app.IsEligible !== false ? 'style="visibility:hidden"' : ''}
            >Explain</button>
          </td>
        </tr>`;
    }).join('');
  }

  _renderAnalytics(apps) {
    if (!this.analyticsContainer || !apps || apps.length === 0) return;

    const analytics = computeAnalytics(apps);
    const { eligible, ineligible, unknown } = analytics.eligibility;
    const total = eligible + ineligible + unknown;

    this.analyticsContainer.innerHTML = `
      <div class="analytics-section">
        <h3 class="analytics-title">Analytics</h3>
        <div class="analytics-grid">
          <!-- Eligibility Distribution Chart -->
          <div class="analytics-card">
            <h4 class="analytics-card-title">Application Outcomes</h4>
            <canvas id="chart-eligibility" width="400" height="250"></canvas>
            <div class="analytics-legend">
              <div class="legend-item">
                <span class="legend-dot" style="background: #2dd4bf;"></span>
                <span>Eligible (${eligible})</span>
              </div>
              <div class="legend-item">
                <span class="legend-dot" style="background: #f472b6;"></span>
                <span>Not Eligible (${ineligible})</span>
              </div>
              ${unknown > 0 ? `<div class="legend-item">
                <span class="legend-dot" style="background: #8b95a8;"></span>
                <span>Unknown (${unknown})</span>
              </div>` : ''}
            </div>
          </div>

          <!-- Product Popularity Chart -->
          <div class="analytics-card">
            <h4 class="analytics-card-title">Product Popularity</h4>
            <canvas id="chart-products" width="400" height="250"></canvas>
          </div>
        </div>
      </div>
    `;

    // Render charts using Chart.js
    setTimeout(() => this._initCharts(analytics), 100);
  }

  _initCharts(analytics) {
    if (typeof Chart === 'undefined') {
      console.warn('[Dashboard] Chart.js not loaded');
      return;
    }

    // Destroy existing charts
    if (this._charts.eligibility) this._charts.eligibility.destroy();
    if (this._charts.products) this._charts.products.destroy();

    const { eligible, ineligible, unknown } = analytics.eligibility;
    const eligibilityData = [eligible, ineligible];
    const eligibilityLabels = ['Eligible', 'Not Eligible'];
    if (unknown > 0) {
      eligibilityData.push(unknown);
      eligibilityLabels.push('Unknown');
    }

    // Eligibility chart
    const elCtx = document.getElementById('chart-eligibility');
    if (elCtx) {
      this._charts.eligibility = new Chart(elCtx, {
        type: 'doughnut',
        data: {
          labels: eligibilityLabels,
          datasets: [{
            data: eligibilityData,
            backgroundColor: ['#2dd4bf', '#f472b6', '#8b95a8'],
            borderColor: '#1a2236',
            borderWidth: 2,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { display: false },
          },
        },
      });
    }

    // Product popularity chart
    const prodCtx = document.getElementById('chart-products');
    if (prodCtx && analytics.products.length > 0) {
      const productLabels = analytics.products.map(p => p.label);
      const productCounts = analytics.products.map(p => p.count);
      const colors = ['#38bdf8', '#2dd4bf', '#fbbf24', '#f472b6', '#a78bfa', '#14b8a6'];

      this._charts.products = new Chart(prodCtx, {
        type: 'bar',
        data: {
          labels: productLabels,
          datasets: [{
            label: 'Applications',
            data: productCounts,
            backgroundColor: colors.slice(0, productLabels.length),
            borderColor: '#1a2236',
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { stepSize: 1 },
            },
          },
        },
      });
    }
  }
}
