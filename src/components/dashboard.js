/**
 * Dashboard UI — renders a table of all mortgage applications.
 */

import { fetchAllMortgageApplications, explainPath, getObject } from '../services/intentyfi.js';

const PRODUCT_LABELS = {
  FIXED_CONFORMING_30YR: '30-Year Fixed (Conforming)',
  FIXED_CONFORMING_15YR: '15-Year Fixed (Conforming)',
  FIXED_JUMBO_30YR: '30-Year Fixed (Jumbo)',
  FIXED_JUMBO_15YR: '15-Year Fixed (Jumbo)',
};

// Number of data columns (excluding the Actions column)
const COL_COUNT = 8;

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

function formatDateTime(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatRate(val) {
  if (val === null || val === undefined || val === '') return '—';
  const numeric = Number(val);
  if (Number.isNaN(numeric)) return String(val);
  const asPercent = numeric <= 1 ? numeric * 100 : numeric;
  return `${asPercent.toFixed(2)}%`;
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

function escapeHtml(value) {
  const str = String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstDefined(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return null;
}

function statusClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'provided') return 'doc-status-provided';
  if (normalized === 'verified') return 'doc-status-verified';
  if (normalized === 'invalid') return 'doc-status-invalid';
  return 'doc-status-pending';
}

function renderKeyValueGrid(rows) {
  if (!rows || rows.length === 0) return '';
  return rows.map(row => `
    <div class="data-row">
      <div class="data-label">${escapeHtml(row.label)}</div>
      <div class="data-value">${escapeHtml(row.value ?? '—')}</div>
    </div>
  `).join('');
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
    this.reviewOverlay = document.getElementById('case-review-overlay');
    this.reviewContent = document.getElementById('case-review-content');
    this.reviewTitle = document.getElementById('case-review-title');
    this.reviewCloseBtn = document.getElementById('case-review-close');
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

    if (this.reviewCloseBtn) {
      this.reviewCloseBtn.addEventListener('click', () => this._closeCaseReview());
    }

    if (this.reviewOverlay) {
      this.reviewOverlay.addEventListener('click', (e) => {
        if (e.target === this.reviewOverlay) this._closeCaseReview();
      });
    }

    // Delegate explain button clicks via tbody
    this.tbody.addEventListener('click', async (e) => {
      const reviewBtn = e.target.closest('.review-btn');
      if (reviewBtn) {
        const objectId = reviewBtn.dataset.objectId;
        await this._openCaseReview(objectId);
        return;
      }

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

  async _openCaseReview(objectId) {
    if (!this.reviewOverlay || !this.reviewContent) return;

    this.reviewOverlay.style.display = 'flex';
    this.reviewContent.innerHTML = '<div class="review-loading">Loading case review...</div>';
    if (this.reviewTitle) this.reviewTitle.textContent = `Application ${objectId}`;

    try {
      const appRef = `MortgageApplication@mti.intentyfi.co:${objectId}`;
      const application = await getObject(appRef, true);
      this._renderCaseReview(application);
      const appId = application.ApplicationID || application.AppID || objectId;
      if (this.reviewTitle) this.reviewTitle.textContent = `Case Review: ${appId}`;
    } catch (err) {
      console.error('[Dashboard] Case review load error:', err);
      this.reviewContent.innerHTML = `
        <div class="review-error">Unable to load case details: ${escapeHtml(err.message || 'Unknown error')}</div>
      `;
    }
  }

  _closeCaseReview() {
    if (!this.reviewOverlay || !this.reviewContent) return;
    this.reviewOverlay.style.display = 'none';
    this.reviewContent.innerHTML = '';
  }

  _renderCaseReview(application) {
    if (!this.reviewContent) return;

    const borrowerObjects = this._extractBorrowers(application);
    const primaryBorrower = borrowerObjects[0] || {};
    const coBorrowers = borrowerObjects.slice(1);

    const loanAmount = firstDefined(application, ['LoanAmount'])
      ?? ((application.PropertyValue || 0) - (application.DownPayment || 0));

    const credit = firstDefined(application, ['CreditReport', 'Credit'])
      || firstDefined(primaryBorrower, ['CreditReport', 'Credit'])
      || {};

    const requirements = this._extractRequirements(application, borrowerObjects);
    const appId = firstDefined(application, ['ApplicationID', 'AppID']) || '?';

    // Build simple data sections
    const summaryData = [
      { label: 'Application ID', value: appId },
      { label: 'Submission Date', value: formatDateTime(firstDefined(application, ['DateSubmitted', 'SubmissionDate'])) },
      { label: 'Loan Type', value: firstDefined(application, ['LoanType']) || '—' },
      { label: 'Loan Product', value: PRODUCT_LABELS[firstDefined(application, ['SelectedLoanProduct', 'SelectedProduct'])] || firstDefined(application, ['SelectedLoanProduct', 'SelectedProduct']) || '—' },
      { label: 'Property Value', value: formatCurrency(firstDefined(application, ['PropertyValue'])) },
      { label: 'Loan Amount', value: formatCurrency(loanAmount) },
      { label: 'Down Payment', value: formatCurrency(firstDefined(application, ['DownPayment'])) },
      { label: 'Mortgage Rate', value: formatRate(firstDefined(application, ['InterestRate', 'MortgageRate'])) },
    ];

    const creditData = [
      { label: 'Credit Score', value: firstDefined(credit, ['CreditScore', 'Score']) || '—' },
      { label: 'Bureau Source', value: firstDefined(credit, ['BureauSource', 'Bureau']) || '—' },
      { label: 'Bankruptcies', value: firstDefined(credit, ['Bankruptcies']) ?? '—' },
      { label: 'Tax Liens', value: firstDefined(credit, ['TaxLiens']) ?? '—' },
      { label: 'Judgments', value: firstDefined(credit, ['Judgments']) ?? '—' },
    ];

    const financialData = [
      { label: 'Total Monthly Income', value: formatCurrency(firstDefined(application, ['TotalMonthlyIncome'])) },
      { label: 'Total Liabilities', value: formatCurrency(firstDefined(application, ['TotalLiabilities'])) },
      { label: 'Monthly Mortgage Payment', value: formatCurrency(firstDefined(application, ['MonthlyPI', 'MonthlyMortgagePayment'])) },
      { label: 'Monthly PMI Payment', value: formatCurrency(firstDefined(application, ['PMIAmount', 'MonthlyPMI'])) },
      { label: 'Monthly Insurance & Taxes', value: formatCurrency(firstDefined(application, ['MonthlyTI'])) },
      { label: 'Total Monthly Obligation', value: formatCurrency(firstDefined(application, ['TotalMonthlyObligation'])) },
      { label: 'Debt-to-Income Ratio', value: firstDefined(application, ['DTIRatio']) != null ? formatPercent(firstDefined(application, ['DTIRatio'])) : '—' },
      { label: 'Loan-to-Value Ratio', value: firstDefined(application, ['LTVRatio']) != null ? formatPercent(firstDefined(application, ['LTVRatio'])) : '—' },
    ];

    const borrowersHtml = this._renderBorrowerSection(primaryBorrower, coBorrowers);
    const requirementsHtml = this._renderRequirementsTable(requirements);

    this.reviewContent.innerHTML = `
      <section class="review-section">
        <h3>Application Summary</h3>
        ${renderKeyValueGrid(summaryData)}
      </section>

      <section class="review-section">
        <h3>Borrower Information</h3>
        ${borrowersHtml}
      </section>

      <section class="review-section">
        <h3>Credit Report</h3>
        ${renderKeyValueGrid(creditData)}
      </section>

      <section class="review-section">
        <h3>Financial Summary</h3>
        ${renderKeyValueGrid(financialData)}
      </section>

      <section class="review-section">
        <h3>Documentation Requirements</h3>
        ${requirementsHtml}
      </section>

      <section class="review-section comments-section">
        <h3>Review Notes</h3>
        <textarea id="review-comments" class="review-comments-input" placeholder="Add comments for manual review..."></textarea>
        <button id="save-comments-btn" class="save-comments-btn">Save Comments</button>
      </section>
    `;

    // Wire up comment save button
    const saveBtn = this.reviewContent.querySelector('#save-comments-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        const textarea = this.reviewContent.querySelector('#review-comments');
        const comments = textarea?.value || '';
        console.log(`Saving comments for ${appId}:`, comments);
        // TODO: persist to database
      });
    }
  }

  _extractBorrowers(application) {
    const borrowers = [];
    const candidates = [
      ...toArray(firstDefined(application, ['Borrower', 'PrimaryBorrower'])),
      ...toArray(firstDefined(application, ['CoBorrowers', 'Coborrowers'])),
      ...toArray(firstDefined(application, ['Borrowers'])),
    ];

    for (const item of candidates) {
      if (item && typeof item === 'object') borrowers.push(item);
    }

    // Remove duplicates by ObjectID when available.
    const byId = new Map();
    for (const borrower of borrowers) {
      const key = borrower.ObjectID || `${borrower.FirstName || ''}_${borrower.LastName || ''}_${Math.random()}`;
      if (!byId.has(key)) byId.set(key, borrower);
    }

    return [...byId.values()];
  }

  _renderBorrowerSection(primaryBorrower, coBorrowers) {
    const renderOne = (borrower, title) => {
      const address = firstDefined(borrower, ['Address']) || {};
      const employment = firstDefined(borrower, ['EmploymentInfo', 'Employment']) || {};

      const data = [
        { label: 'First Name', value: firstDefined(borrower, ['FirstName']) || '—' },
        { label: 'Last Name', value: firstDefined(borrower, ['LastName']) || '—' },
        { label: 'Email', value: firstDefined(borrower, ['Email']) || '—' },
        {
          label: 'Address',
          value: [
            firstDefined(address, ['StreetAddress']) || firstDefined(borrower, ['StreetAddress']) || '',
            firstDefined(address, ['City']) || firstDefined(borrower, ['City']) || '',
            firstDefined(address, ['State']) || firstDefined(borrower, ['State']) || '',
            firstDefined(address, ['Country']) || firstDefined(borrower, ['Country']) || '',
          ].filter(Boolean).join(', ') || '—',
        },
        { label: 'Employment Status', value: firstDefined(borrower, ['EmploymentStatus']) || '—' },
        { label: 'Annual Income', value: formatCurrency(firstDefined(borrower, ['AnnualIncome'])) },
        { label: 'Employer', value: firstDefined(employment, ['EmployerName']) || '—' },
        { label: 'Duration', value: firstDefined(employment, ['Duration']) != null ? `${firstDefined(employment, ['Duration'])} years` : '—' },
        { label: 'Salary', value: formatCurrency(firstDefined(employment, ['YearlySalary', 'Salary'])) },
        { label: 'Bonus', value: formatCurrency(firstDefined(employment, ['YearlyBonus', 'Bonus'])) },
      ];

      return `
        <div class="borrower-subsection">
          <h4>${escapeHtml(title)}</h4>
          ${renderKeyValueGrid(data)}
        </div>
      `;
    };

    if (coBorrowers.length === 0) {
      return renderOne(primaryBorrower, 'Primary Borrower') + 
        '<p class="muted-text">No co-borrowers associated with this application.</p>';
    }

    return renderOne(primaryBorrower, 'Primary Borrower') +
      coBorrowers.map((borrower, idx) => renderOne(borrower, `Co-Borrower ${idx + 1}`)).join('');
  }

  _extractRequirements(application, borrowers) {
    const raw = firstDefined(application, [
      'DocumentationRequirements',
      'DocumentRequirements',
      'Requirements',
      'RequiredDocuments',
    ]);

    const reqs = toArray(raw).filter(item => item && typeof item === 'object');
    if (reqs.length > 0) return reqs;

    // Fallback demo rows if the object doesn't include requirements yet.
    const borrowerName = borrowers[0]
      ? `${borrowers[0].FirstName || ''} ${borrowers[0].LastName || ''}`.trim() || 'Primary Borrower'
      : 'Primary Borrower';

    return [
      {
        RequirementCode: 'DOC_W2_2Y',
        Borrower: borrowerName,
        AssociatedEntity: 'Income Verification',
        RequirementStatus: 'Pending',
        ConsentReceived: false,
        ConsentDate: null,
        DocumentLink: '#',
      },
      {
        RequirementCode: 'DOC_BANK_STMT',
        Borrower: borrowerName,
        AssociatedEntity: 'Asset Verification',
        RequirementStatus: 'Provided',
        ConsentReceived: true,
        ConsentDate: firstDefined(application, ['DateSubmitted']) || null,
        DocumentLink: '#',
      },
    ];
  }

  _renderRequirementsTable(requirements) {
    if (!requirements || requirements.length === 0) {
      return '<p class="muted-text">No documentation requirements found.</p>';
    }

    return `
      <table class="requirements-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Entity</th>
            <th>Status</th>
            <th>Consent</th>
          </tr>
        </thead>
        <tbody>
          ${requirements.map(req => {
            const status = firstDefined(req, ['RequirementStatus', 'Status']) || 'Pending';
            const link = firstDefined(req, ['DocumentLink', 'DocumentationLink', 'Link']) || '#';
            return `
              <tr>
                <td>${escapeHtml(firstDefined(req, ['RequirementCode', 'Code']) || '—')}</td>
                <td>${escapeHtml(firstDefined(req, ['AssociatedEntity', 'Entity']) || '—')}</td>
                <td><span class="status-badge ${statusClass(status)}">${escapeHtml(status)}</span></td>
                <td>${firstDefined(req, ['ConsentReceived']) ? 'Yes' : 'No'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
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
      <td colspan="${COL_COUNT}" class="explain-cell">
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
          <td colspan="${COL_COUNT}" class="dashboard-state-cell">
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
          <td colspan="${COL_COUNT}" class="dashboard-state-cell dashboard-empty">
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

      return `
        <tr class="dashboard-row" data-object-id="${app.ObjectID}">
          <td class="td-appid">${app.AppID || '—'}</td>
          <td>${app.LoanType || '—'}</td>
          <td>${product}</td>
          <td>${formatUrgency(app.Urgency)}</td>
          <td>${borrowerName}</td>
          <td class="td-date">${formatDate(app.DateSubmitted)}</td>
          <td class="td-center">
            <button class="review-btn" data-object-id="${app.ObjectID}" title="Review full application details">Review</button>
          </td>
          <td class="td-center">
            <button
              class="explain-btn"
              data-object-id="${app.ObjectID}"
              data-scope-id="${app.ScopeID}"
              ${app.IsEligible !== false ? 'style="display:none"' : ''}
              title="View eligibility explanation"
            >Explain</button>
          </td>
        </tr>`;
    }).join('');
  }

  _renderAnalytics(apps) {
    if (!this.analyticsContainer) return;

    if (!apps || apps.length === 0) {
      this.analyticsContainer.innerHTML = '<div class="review-muted">No analytics available. Load applications first.</div>';
      return;
    }

    const analytics = computeAnalytics(apps);
    const { eligible, ineligible, unknown } = analytics.eligibility;

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
