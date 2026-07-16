// @ts-check
/**
 * Finance view render — extracted from ui.js (Phase 2).
 */

import {
  BANKS, APR_CREDIT_TIERS, DAILY_CREDIT_GAIN_CAP, creditTier, getActiveLoans, getFirmDebt,
  projectLoanPayoff, maxBorrowableAmount, maxBorrowableForBank, quoteBankOffers, quoteLoan,
  utilizationRatio, bankDebt, otherBanksDebt, firmStrengthBoostPct,
  LOAN_TERM_CHOICES, defaultLoanTermDays, normalizeLoanTermDays,
  getBankRelationshipTier, getHouseBankId, REL_TIER_LABEL, bankPersonalityLine,
  getBankAccount, getSavingsApy, getTotalBankDeposits, depositToBank, withdrawFromBank,
  transferBankInternal, BANK_DAILY_CAPS,
} from '../finance.js';
import { getVaultPledgedAppraisal, getVaultBookValue } from '../vault.js';
import { syncEstateDerived } from '../estates.js';
import { getFirmNetWorth } from '../portfolio.js';
import { domainLogoHtml } from '../logos.js';
import { formatMarketClock } from '../market.js';
import { toast } from '../notify.js';
import { fmt } from './shared.js';

/** Draft loan amounts per bank — survives renderFinance rebuilds so wheel scroll doesn't snap to 250 */
const loanDraftAmounts = new Map();
/** Draft term (30/60/90) per bank — shared across personal/company until user picks in modal */
const loanDraftTerms = new Map();

/** @type {((result: { confirmed: boolean, termDays?: number }) => void) | null} */
let loanConfirmResolve = null;
let loanConfirmBound = false;
/** @type {{ bankId: string, type: string, amount: number, finance: object, gameDay: number, collateralOpts: object } | null} */
let loanConfirmCtx = null;

/** @type {'lenders' | 'accounts' | 'loans' | 'history' | 'builder'} */
let activeFinTab = 'lenders';
let finTabsBound = false;
/** Selected bank on Accounts ATM tab. */
let accountsSelectedBankId = 'chase';
let accountsAtmBound = false;
let accountsStructureKey = '';

function setFinanceTab(tab) {
  activeFinTab = tab;
  document.querySelectorAll('.fin-tab').forEach((btn) => {
    const on = btn.getAttribute('data-fin-tab') === tab;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('[data-fin-panel]').forEach((panel) => {
    const on = panel.getAttribute('data-fin-panel') === tab;
    panel.classList.toggle('hidden', !on);
    if (on) panel.removeAttribute('hidden');
    else panel.setAttribute('hidden', '');
  });
}

function bindFinanceTabsOnce() {
  if (finTabsBound) return;
  const tabs = document.getElementById('fin-tabs');
  if (!tabs) return;
  finTabsBound = true;
  tabs.addEventListener('click', (e) => {
    const btn = e.target?.closest?.('[data-fin-tab]');
    if (!btn) return;
    setFinanceTab(btn.getAttribute('data-fin-tab'));
  });
}

/** Score position on the 300–850 FICO-style spectrum (0–100%). */
function creditScorePct(score) {
  return Math.max(0, Math.min(100, ((Number(score) - 300) / 550) * 100));
}

function creditLaneHtml(label, score, tier, util) {
  const pct = creditScorePct(score).toFixed(1);
  return `
    <div class="fin-credit-lane">
      <div class="fin-credit-lane-top">
        <span class="fin-credit-lane-lbl">${label}</span>
        <strong class="fin-credit-lane-score">${score}</strong>
      </div>
      <div class="fin-credit-track" aria-hidden="true">
        <span class="fin-credit-marker" style="left:${pct}%"></span>
      </div>
      <div class="fin-credit-meta" style="color:${tier.color}">${tier.label} · ${util}% utilization</div>
    </div>`;
}

/**
 * Compact banking bar — metric pills + dual credit spectrum (replaces ring gauges).
 * @param {object} finance
 * @param {{ firmDebt?: number, pledged?: number, strengthPct?: number, firmStrength?: number, estateCredit?: number }} extras
 */
function financeBankingBarHtml(finance, extras = {}) {
  const firmStrength = extras.firmStrength || 0;
  const p = creditTier(finance.personalCredit);
  const b = creditTier(finance.businessCredit);
  const pUtil = Math.round(utilizationRatio(finance, 'personal', firmStrength) * 100);
  const bUtil = Math.round(utilizationRatio(finance, 'company', firmStrength) * 100);
  const firmDebt = Number(extras.firmDebt) || 0;
  const pledged = Number(extras.pledged) || 0;
  const strengthPct = Number(extras.strengthPct) || 0;
  const estateNote = (extras.estateCredit || 0) > 0 ? 'Loans + property credit' : 'Loans';

  return `
    <div class="fin-metric-row">
      <div class="fin-metric-card" data-gloss="total-debt">
        <span class="fin-metric-lbl">Total debt</span>
        <span class="fin-metric-val is-debt">${fmt(firmDebt)}</span>
        <span class="fin-metric-sub">${estateNote}</span>
      </div>
      <div class="fin-metric-card" data-gloss="vault-pledged">
        <span class="fin-metric-lbl">Vault pledged</span>
        <span class="fin-metric-val">${fmt(pledged)}</span>
        <span class="fin-metric-sub">50% LTV collateral</span>
      </div>
      <div class="fin-metric-card" data-gloss="firm-strength">
        <span class="fin-metric-lbl">Firm strength</span>
        <span class="fin-metric-val">+${strengthPct}%</span>
        <span class="fin-metric-sub">NW facility boost</span>
      </div>
    </div>
    <div class="fin-credit-report" data-gloss="credit-score">
      <div class="fin-credit-report-lbl">Credit report</div>
      <div class="fin-credit-lanes">
        ${creditLaneHtml('Personal', finance.personalCredit, p, pUtil)}
        ${creditLaneHtml('Company', finance.businessCredit, b, bUtil)}
      </div>
    </div>`;
}

function accountsStructureSnap(finance, selectedId) {
  const map = finance?.bankAccounts && typeof finance.bankAccounts === 'object'
    ? finance.bankAccounts
    : {};
  const ids = Object.keys(map).sort().join(',');
  const house = getHouseBankId(finance) || '';
  return `${selectedId}|${house}|${ids}|${activeFinTab}`;
}

function patchAccountsLive(root, state, finance) {
  if (!root) return;
  const desk = Math.max(0, Number(state?.portfolio?.cash) || 0);
  const deskEl = root.querySelector('[data-atm-desk]');
  if (deskEl) deskEl.textContent = fmt(desk);
  const totalEl = root.querySelector('[data-atm-total]');
  if (totalEl) totalEl.textContent = fmt(getTotalBankDeposits(finance));
  for (const bank of BANKS) {
    const acct = getBankAccount(finance, bank.id);
    const chk = root.querySelector(`[data-atm-checking="${bank.id}"]`);
    const sav = root.querySelector(`[data-atm-savings="${bank.id}"]`);
    if (chk) chk.textContent = fmt(acct.checking);
    if (sav) sav.textContent = fmt(acct.savings);
  }
  const sel = accountsSelectedBankId;
  const apy = getSavingsApy(finance, sel);
  const apyEl = root.querySelector('[data-atm-apy]');
  if (apyEl) apyEl.textContent = `${(apy * 100).toFixed(2)}% APY`;
  const tier = getBankRelationshipTier(finance, sel);
  const capChk = BANK_DAILY_CAPS.checking[tier] ?? BANK_DAILY_CAPS.checking[0];
  const capSav = BANK_DAILY_CAPS.savingsWithdraw[tier] ?? BANK_DAILY_CAPS.savingsWithdraw[0];
  const capsEl = root.querySelector('[data-atm-caps]');
  if (capsEl) {
    capsEl.textContent = `Daily caps · checking $${capChk.toLocaleString()} · savings withdraw $${capSav.toLocaleString()}`;
  }
}

function bindAccountsAtmOnce(root, state) {
  if (accountsAtmBound || !root) return;
  accountsAtmBound = true;
  root.addEventListener('click', (e) => {
    const pick = e.target?.closest?.('[data-atm-pick]');
    if (pick) {
      accountsSelectedBankId = pick.getAttribute('data-atm-pick') || accountsSelectedBankId;
      accountsStructureKey = '';
      renderFinance(state);
      return;
    }
    const action = e.target?.closest?.('[data-atm-action]');
    if (!action) return;
    const kind = action.getAttribute('data-atm-action');
    const amount = parseFloat(root.querySelector('[data-atm-amount]')?.value) || 0;
    const bucket = root.querySelector('[data-atm-bucket]:checked')?.value || 'checking';
    if (kind === 'deposit') state.onBankDeposit?.(accountsSelectedBankId, bucket, amount);
    else if (kind === 'withdraw') state.onBankWithdraw?.(accountsSelectedBankId, bucket, amount);
    else if (kind === 'toSavings') state.onBankInternal?.(accountsSelectedBankId, 'toSavings', amount);
    else if (kind === 'toChecking') state.onBankInternal?.(accountsSelectedBankId, 'toChecking', amount);
  });
}

function renderAccountsAtm(state, finance) {
  const root = document.getElementById('accounts-atm');
  if (!root) return;
  if (!BANKS.some((b) => b.id === accountsSelectedBankId)) {
    accountsSelectedBankId = BANKS[0]?.id || 'chase';
  }
  const structureKey = accountsStructureSnap(finance, accountsSelectedBankId);
  if (structureKey === accountsStructureKey && root.childElementCount) {
    patchAccountsLive(root, state, finance);
    return;
  }
  accountsStructureKey = structureKey;

  const houseId = getHouseBankId(finance);
  const bankRows = BANKS.map((bank) => {
    const acct = getBankAccount(finance, bank.id);
    const tier = getBankRelationshipTier(finance, bank.id);
    const label = REL_TIER_LABEL[tier] || '';
    const selected = bank.id === accountsSelectedBankId ? ' is-selected' : '';
    const house = houseId === bank.id ? ' is-house-lender' : '';
    return `<button type="button" class="atm-bank-chip${selected}${house}" data-atm-pick="${bank.id}">
      <span class="atm-bank-name">${bank.short}</span>
      <span class="atm-bank-bal" data-atm-checking="${bank.id}">${fmt(acct.checking)}</span>
      <span class="atm-bank-sav" data-atm-savings="${bank.id}">${fmt(acct.savings)}</span>
      ${label ? `<span class="atm-bank-tier">${label}</span>` : ''}
    </button>`;
  }).join('');

  const sel = BANKS.find((b) => b.id === accountsSelectedBankId) || BANKS[0];
  const acct = getBankAccount(finance, sel.id);
  const apy = getSavingsApy(finance, sel.id);
  const tier = getBankRelationshipTier(finance, sel.id);
  const capChk = BANK_DAILY_CAPS.checking[tier] ?? BANK_DAILY_CAPS.checking[0];
  const capSav = BANK_DAILY_CAPS.savingsWithdraw[tier] ?? BANK_DAILY_CAPS.savingsWithdraw[0];
  const desk = Math.max(0, Number(state?.portfolio?.cash) || 0);

  root.innerHTML = `
    <div class="atm-summary">
      <div class="atm-metric"><span class="atm-metric-lbl">Desk cash</span><strong data-atm-desk>${fmt(desk)}</strong></div>
      <div class="atm-metric"><span class="atm-metric-lbl">Bank total</span><strong data-atm-total>${fmt(getTotalBankDeposits(finance))}</strong></div>
      <div class="atm-metric"><span class="atm-metric-lbl">Selected APY</span><strong data-atm-apy>${(apy * 100).toFixed(2)}% APY</strong></div>
    </div>
    <div class="atm-bank-grid">${bankRows}</div>
    <div class="atm-desk interactive-card">
      <div class="atm-desk-head">
        <strong>${sel.name}</strong>
        <span class="muted-text" data-atm-caps>Daily caps · checking $${capChk.toLocaleString()} · savings withdraw $${capSav.toLocaleString()}</span>
      </div>
      <div class="atm-balances">
        <div>Checking <strong data-atm-checking="${sel.id}">${fmt(acct.checking)}</strong> · 0% APY</div>
        <div>Savings <strong data-atm-savings="${sel.id}">${fmt(acct.savings)}</strong> · ${(apy * 100).toFixed(2)}% APY</div>
      </div>
      <div class="atm-controls">
        <label class="loan-amt-field compact"><span>Amount</span>
          <input type="number" data-atm-amount value="250" min="1" step="50">
        </label>
        <label class="atm-radio"><input type="radio" name="atm-bucket" data-atm-bucket value="checking" checked> Checking</label>
        <label class="atm-radio"><input type="radio" name="atm-bucket" data-atm-bucket value="savings"> Savings</label>
        <button type="button" class="loan-btn loan-btn-personal" data-atm-action="deposit">Deposit</button>
        <button type="button" class="loan-btn loan-btn-ghost" data-atm-action="withdraw">Withdraw</button>
        <button type="button" class="loan-btn loan-btn-ghost" data-atm-action="toSavings">Checking → Savings</button>
        <button type="button" class="loan-btn loan-btn-ghost" data-atm-action="toChecking">Savings → Checking</button>
      </div>
    </div>`;
  bindAccountsAtmOnce(root, state);
}

function creditBuilderHtml(finance) {
  const ascending = APR_CREDIT_TIERS.slice().reverse();
  const rows = ascending.map((tier, i) => {
    const next = ascending[i + 1];
    const ceiling = next ? next.min - 1 : 850;
    const inPersonal = finance.personalCredit >= tier.min && finance.personalCredit <= ceiling;
    const inBusiness = finance.businessCredit >= tier.min && finance.businessCredit <= ceiling;
    const range = tier.min === 0 ? `Below ${ceiling + 1}` : `${tier.min}–${ceiling}`;
    const you = [inPersonal ? 'Personal' : '', inBusiness ? 'Business' : ''].filter(Boolean).join(' & ');
    return `<div class="builder-tier-row ${inPersonal || inBusiness ? 'is-current' : ''}">
      <span class="builder-tier-name">${tier.label}</span>
      <span class="builder-tier-range">${range}</span>
      <span class="builder-tier-apr">${tier.aprAdj > 0 ? '+' : ''}${tier.aprAdj}% APR · ${tier.limitMult}× limit</span>
      ${you ? `<span class="builder-tier-you">You: ${you}</span>` : ''}
    </div>`;
  }).join('');

  return `
    <div class="builder-shell">
      <div class="builder-ladder">${rows}</div>
      <div class="builder-tips">
        <div class="builder-tip"><strong>Firm strength expands facilities.</strong> Higher net worth raises how much each bank will underwrite — credit score still gates approval, but a stronger balance sheet unlocks larger company lines (like real small-business lending).</div>
        <div class="builder-tip"><strong>Age it before you cash out.</strong> A loan must survive one day-end interest tick before payoff or partial repay can raise your score — same-morning borrow→repay builds nothing.</div>
        <div class="builder-tip"><strong>Daily gain caps.</strong> Personal credit can climb at most ${DAILY_CREDIT_GAIN_CAP.personal} pts/day, business ${DAILY_CREDIT_GAIN_CAP.business} pts/day — spreading paydowns across days beats one huge payment.</div>
        <div class="builder-tip"><strong>Utilization matters.</strong> Staying under 30% of your total credit limit earns an APR discount; 80%+ utilization adds a penalty and shrinks new approvals.</div>
        <div class="builder-tip"><strong>Late payments hit hardest.</strong> A single missed auto-pay can cost 20–30+ points — far more than any single on-time payment gains.</div>
      </div>
    </div>`;
}

function vaultCollateralOpts(state) {
  syncEstateDerived(state || {});
  const estateCredit = Math.max(0, Number(state?.estateCreditUsed) || 0);
  const debt = getFirmDebt(state?.finance, estateCredit);
  const firmStrength = getFirmNetWorth(state?.portfolio || { cash: 0, longs: {}, shorts: {}, options: [] }, {
    debt,
    vaultBook: getVaultBookValue(state || {}),
    estateEquity: state?.estateEquity || 0,
    bankDeposits: getTotalBankDeposits(state?.finance),
  });
  return {
    collateralValue: getVaultPledgedAppraisal(state || {}),
    firmStrength,
  };
}

export function setLoanDraftAmount(bankId, val) {
  if (!bankId || !Number.isFinite(val)) return;
  loanDraftAmounts.set(bankId, val);
}

export function getLoanDraftAmount(bankId) {
  return loanDraftAmounts.get(bankId);
}

/** @param {string} bankId @param {number} termDays @param {'personal'|'company'} [typeHint] */
export function setLoanDraftTerm(bankId, termDays, typeHint = 'personal') {
  if (!bankId) return;
  loanDraftTerms.set(bankId, normalizeLoanTermDays(termDays, typeHint));
}

/** @param {string} bankId @param {'personal'|'company'} [typeHint] */
export function getLoanDraftTerm(bankId, typeHint = 'personal') {
  if (!loanDraftTerms.has(bankId)) return defaultLoanTermDays(typeHint);
  return normalizeLoanTermDays(loanDraftTerms.get(bankId), typeHint);
}

function bankStatusHtml(offers, finance, debtHintInner) {
  const teach = bankTeachHtml(offers, finance);
  if (teach) return `<div class="bank-card-status">${teach}</div>`;
  return `<div class="bank-card-status">${debtHintInner}</div>`;
}

function closeLoanConfirm(result) {
  const overlay = document.getElementById('loan-confirm-overlay');
  overlay?.classList.add('hidden');
  const resolve = loanConfirmResolve;
  loanConfirmResolve = null;
  loanConfirmCtx = null;
  resolve?.(result || { confirmed: false });
}

function paintLoanConfirmBody() {
  const ctx = loanConfirmCtx;
  if (!ctx) return;
  const body = document.getElementById('loan-confirm-body');
  const sub = document.getElementById('loan-confirm-sub');
  const footnote = document.getElementById('loan-confirm-footnote');
  const okBtn = document.getElementById('loan-confirm-ok');
  if (!body) return;

  const termDays = getLoanDraftTerm(ctx.bankId, /** @type {'personal'|'company'} */ (ctx.type));
  const opts = { ...ctx.collateralOpts, termDays };
  const preview = quoteLoan(ctx.bankId, ctx.type, ctx.amount, ctx.finance, ctx.gameDay, opts);
  const bankLabel = preview.bank?.name || BANKS.find((b) => b.id === ctx.bankId)?.name || 'Bank';
  const typeLabel = ctx.type === 'company' ? 'company loan' : 'personal loan';
  if (sub) sub.textContent = `${bankLabel} — ${typeLabel}`;

  const debtHere = preview.debtHere ?? bankDebt(ctx.finance, ctx.bankId, ctx.type);
  const debtElsewhere = preview.debtElsewhere ?? otherBanksDebt(ctx.finance, ctx.bankId, ctx.type);
  const totalType = preview.totalTypeDebt ?? (Number(debtHere) + Number(debtElsewhere));
  const strengthPct = preview.strengthPct ?? 0;
  const strengthVal = strengthPct > 0
    ? `+${strengthPct}% facility room`
    : 'Base facility';

  const aprLine = preview.ok
    ? `${preview.apr}% <span class="loan-confirm-muted">(${preview.tier}, credit ${preview.credit})</span>`
    : 'Pending underwriting';

  const estLine = preview.ok
    ? `Est. interest ~$${Math.round(preview.estimatedInterest || 0).toLocaleString()} · min auto-pay ~$${Number(preview.minDailyPayment || 0).toFixed(2)}/day`
    : 'Submit to see if underwriting approves this loan.';

  body.innerHTML = `
    <div class="loan-confirm-row">
      <span>Amount</span>
      <strong>$${ctx.amount.toLocaleString()}</strong>
    </div>
    <div class="loan-confirm-row">
      <span>Your APR</span>
      <strong>${aprLine}</strong>
    </div>
    <div class="loan-confirm-term">
      <span class="loan-confirm-term-lbl">Term</span>
      <div class="loan-term-seg" role="group" aria-label="Loan term">
        ${LOAN_TERM_CHOICES.map((d) => `
          <button type="button" class="loan-term-btn${d === termDays ? ' is-active' : ''}" data-term="${d}">${d}</button>
        `).join('')}
      </div>
      <p class="loan-confirm-est">${estLine}</p>
    </div>
    <div class="loan-confirm-row">
      <span>Firm strength (net worth)</span>
      <strong>${strengthVal}</strong>
    </div>
    <div class="loan-confirm-row">
      <span>Your ${ctx.type} debt</span>
      <strong>here $${Math.round(debtHere).toLocaleString()} · other $${Math.round(debtElsewhere).toLocaleString()} · total $${Math.round(totalType).toLocaleString()}</strong>
    </div>
  `;

  if (footnote) {
    footnote.textContent = preview.ok
      ? 'Underwriting uses credit score, utilization, firm strength, and collateral — like a small-business loan review. Auto-pay runs every game day.'
      : 'Underwriting will run when you submit. Credit floors, utilization, and total debt can still deny the application.';
  }
  if (okBtn) okBtn.textContent = preview.ok ? 'Confirm borrow' : 'Submit application';

  body.querySelectorAll('.loan-term-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = normalizeLoanTermDays(btn.getAttribute('data-term'), /** @type {'personal'|'company'} */ (ctx.type));
      setLoanDraftTerm(ctx.bankId, next, /** @type {'personal'|'company'} */ (ctx.type));
      paintLoanConfirmBody();
    });
  });
}

function bindLoanConfirmOnce() {
  if (loanConfirmBound) return;
  const overlay = document.getElementById('loan-confirm-overlay');
  const cancel = document.getElementById('loan-confirm-cancel');
  const ok = document.getElementById('loan-confirm-ok');
  if (!overlay || !cancel || !ok) return;
  loanConfirmBound = true;
  cancel.addEventListener('click', () => closeLoanConfirm({ confirmed: false }));
  ok.addEventListener('click', () => {
    const ctx = loanConfirmCtx;
    if (!ctx) {
      closeLoanConfirm({ confirmed: false });
      return;
    }
    const termDays = getLoanDraftTerm(ctx.bankId, /** @type {'personal'|'company'} */ (ctx.type));
    closeLoanConfirm({ confirmed: true, termDays });
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLoanConfirm({ confirmed: false });
  });
}

/**
 * Interactive loan confirm — term lives here (not on bank cards).
 * @param {{
 *   bankId: string,
 *   type: 'personal'|'company',
 *   amount: number,
 *   finance: object,
 *   gameDay?: number,
 *   collateralOpts?: object,
 * }} opts
 * @returns {Promise<{ confirmed: boolean, termDays?: number }>}
 */
export function showLoanConfirm(opts) {
  bindLoanConfirmOnce();
  const overlay = document.getElementById('loan-confirm-overlay');
  if (!overlay) return Promise.resolve({ confirmed: false });

  if (loanConfirmResolve) closeLoanConfirm({ confirmed: false });

  const type = opts.type === 'company' ? 'company' : 'personal';
  const amount = Math.max(100, Math.round(Number(opts.amount) || 0));
  if (!loanDraftTerms.has(opts.bankId)) {
    setLoanDraftTerm(opts.bankId, defaultLoanTermDays(type), type);
  }

  loanConfirmCtx = {
    bankId: opts.bankId,
    type,
    amount,
    finance: opts.finance,
    gameDay: opts.gameDay || 1,
    collateralOpts: opts.collateralOpts || {},
  };

  paintLoanConfirmBody();
  overlay.classList.remove('hidden');
  document.getElementById('loan-confirm-ok')?.focus();

  return new Promise((resolve) => {
    loanConfirmResolve = resolve;
  });
}

export function closeLoanConfirmOverlay() {
  closeLoanConfirm({ confirmed: false });
}

export function isLoanConfirmOpen() {
  const overlay = document.getElementById('loan-confirm-overlay');
  return !!(overlay && !overlay.classList.contains('hidden'));
}

/**
 * Pure display helper — badges the lowest personal / company APR among rendered lenders.
 * No change to APR math; compares already-quoted rates only.
 * @param {Array<{ id: string, personalApr: number, companyApr: number }>} lenders
 * @returns {{ personalBestId: string | null, companyBestId: string | null, combinedId: string | null }}
 */
export function getBestRateLenderBadges(lenders) {
  const list = Array.isArray(lenders) ? lenders.filter((l) => l && l.id != null) : [];
  if (!list.length) {
    return { personalBestId: null, companyBestId: null, combinedId: null };
  }
  let personalBestId = list[0].id;
  let companyBestId = list[0].id;
  let personalBest = Number(list[0].personalApr);
  let companyBest = Number(list[0].companyApr);
  for (let i = 1; i < list.length; i++) {
    const row = list[i];
    const p = Number(row.personalApr);
    const c = Number(row.companyApr);
    if (Number.isFinite(p) && (!Number.isFinite(personalBest) || p < personalBest)) {
      personalBest = p;
      personalBestId = row.id;
    }
    if (Number.isFinite(c) && (!Number.isFinite(companyBest) || c < companyBest)) {
      companyBest = c;
      companyBestId = row.id;
    }
  }
  const combinedId = personalBestId === companyBestId ? personalBestId : null;
  return { personalBestId, companyBestId, combinedId };
}

function bankBadgeHtml(bankId, badges) {
  if (!badges || !bankId) return '';
  if (badges.combinedId === bankId) {
    return '<span class="bank-best-badge is-combined">Best for you · personal &amp; business</span>';
  }
  const bits = [];
  if (badges.personalBestId === bankId) bits.push('Best personal rate');
  if (badges.companyBestId === bankId) bits.push('Best business rate');
  if (!bits.length) return '';
  return bits.map((label) => `<span class="bank-best-badge">${label}</span>`).join('');
}

function relationshipBadgeHtml(finance, bankId) {
  const tier = getBankRelationshipTier(finance, bankId);
  const label = REL_TIER_LABEL[tier];
  if (!label) return '';
  const cls = tier === 3 ? 'is-house' : tier === 2 ? 'is-preferred' : 'is-known';
  return `<span class="bank-rel-badge ${cls}">${label}</span>`;
}

function bankLogoHtml(bank) {
  return domainLogoHtml(bank.domain, {
    letter: bank.short.slice(0, 1),
    color: bank.color,
    className: 'bank-logo',
    attrs: `data-bank="${bank.id}"`,
  });
}

/**
 * Locked-bank teaching card — requirement vs current score plus one
 * concrete rebuild strategy. Empty string when both desks are approved.
 */
function bankTeachHtml(offers, finance) {
  if (!offers || (offers.personalOk && offers.companyOk)) return '';
  const rows = [];
  if (!offers.personalOk) {
    rows.push(`Personal desk locked — this bank wants <strong>${offers.personalMinCredit}+</strong> personal credit (you're at <strong>${finance.personalCredit}</strong>)`);
  }
  if (!offers.companyOk) {
    rows.push(`Company desk locked — business file needs <strong>${offers.companyMinCredit}+</strong> (you're at <strong>${finance.businessCredit}</strong>)`);
  }
  return `<div class="bank-teach">
    ${rows.map((r) => `<div class="bank-teach-row">${r}</div>`).join('')}
    <div class="bank-teach-hint">Rebuild: keep utilization under 30%, hold cash for the daily auto-pay, and let paid-off loans age.</div>
  </div>`;
}

/** Rebuild bank cards only when approval structure changes (no tick thrash). */
let bankListStructureKey = '';
/** Skip banking-bar remount when metrics/credit HTML unchanged. */
let bankingBarSnap = '';

function snapLoanDrafts(bankList) {
  bankList?.querySelectorAll('.loan-amt').forEach(input => {
    const bank = input.dataset.bank;
    const v = parseFloat(input.value);
    setLoanDraftAmount(bank, v);
  });
}

function loanStartAmount(bankId, ceil, eligible) {
  const draft = getLoanDraftAmount(bankId);
  if (eligible && Number.isFinite(draft)) {
    const stepped = Math.round(draft / 50) * 50;
    return Math.min(Math.max(100, stepped), ceil);
  }
  return eligible ? Math.min(250, ceil) : 100;
}

function liveLoanAmtInput(bankList) {
  if (!bankList) return null;
  const active = document.activeElement;
  if (active?.classList?.contains('loan-amt') && bankList.contains(active)) return active;
  const hovered = bankList.querySelector('.loan-amt:hover');
  return hovered || null;
}

function syncLiveLoanInputs(bankList, finance, gameDay = 1, collatOpts = {}) {
  bankList.querySelectorAll('.loan-amt').forEach(input => {
    const bankId = input.dataset.bank;
    const offers = quoteBankOffers(bankId, finance, gameDay, collatOpts);
    const ceil = maxBorrowableForBank(bankId, finance, 50, gameDay, collatOpts);
    const eligible = ceil >= 100;
    input.min = '100';
    input.max = String(Math.max(eligible ? ceil : 5000, 100));
    input.disabled = false;
    const label = input.closest('.loan-amt-field')?.querySelector('span');
    if (label) label.textContent = eligible ? `Amount · max $${ceil.toLocaleString()}` : 'Amount · apply anyway';
    input.title = eligible
      ? `Scroll to adjust · about $${ceil.toLocaleString()} available now`
      : `Below this bank's credit floors — you can still apply and may be denied`;
    let v = parseFloat(input.value);
    if (!Number.isFinite(v)) v = loanStartAmount(bankId, ceil, eligible);
    if (eligible && v > ceil) v = ceil;
    if (v < 100) v = 100;
    const next = String(Math.round(v));
    if (input.value !== next) input.value = next;
    setLoanDraftAmount(bankId, Math.round(v));
    const card = input.closest('.bank-card');
    if (card && offers) {
      const pBtn = card.querySelector('.loan-btn-personal .loan-btn-apr');
      const cBtn = card.querySelector('.loan-btn-company .loan-btn-apr');
      if (pBtn) pBtn.textContent = `${offers.personalApr}% APR`;
      if (cBtn) cBtn.textContent = `${offers.companyApr}% APR`;
      const status = card.querySelector('.bank-card-status');
      if (status) {
        const oweHere = bankDebt(finance, bankId);
        const oweP = otherBanksDebt(finance, bankId, 'personal');
        const oweC = otherBanksDebt(finance, bankId, 'company');
        const debtInner = (oweHere > 0 || oweP > 0 || oweC > 0)
          ? `<div class="bank-debt-hint">Here: <strong>${fmt(oweHere)}</strong> · Other banks personal: <strong>${fmt(oweP)}</strong> · company: <strong>${fmt(oweC)}</strong></div>`
          : `<div class="bank-debt-hint muted-text">No outstanding debt on file — lenders still share your credit picture.</div>`;
        const nextStatus = bankStatusHtml(offers, finance, debtInner);
        if (status.outerHTML !== nextStatus) status.outerHTML = nextStatus;
      }
    }
    bankList.querySelectorAll(`.borrow-btn[data-bank="${bankId}"]`).forEach(btn => {
      const typeMax = maxBorrowableAmount(bankId, btn.dataset.type, finance, 50, gameDay, collatOpts);
      btn.disabled = false;
      btn.classList.toggle('is-tight', typeMax < 100);
      btn.title = typeMax >= 100
        ? `Apply for ${btn.dataset.type} · about $${typeMax.toLocaleString()} available`
        : `Apply for ${btn.dataset.type} — underwriting may deny based on credit or total debt`;
    });
  });
}

function bindBankListActions(bankList, state, finance) {
  const gameDay = formatMarketClock()?.day || 1;
  const collatOpts = vaultCollateralOpts(state);
  bankList.querySelectorAll('.loan-amt').forEach(input => {
    const persist = () => {
      const v = parseFloat(input.value);
      setLoanDraftAmount(input.dataset.bank, v);
    };
    input.oninput = persist;
    input.onchange = persist;
  });

  bankList.querySelectorAll('.borrow-btn').forEach(btn => {
    // Always clickable — confirm modal picks term, then underwrite
    btn.disabled = false;
    btn.onclick = () => {
      const input = bankList.querySelector(`.loan-amt[data-bank="${btn.dataset.bank}"]`);
      let amount = parseFloat(input?.value) || 0;
      setLoanDraftAmount(input?.dataset.bank, amount);
      const typeMax = maxBorrowableAmount(btn.dataset.bank, btn.dataset.type, finance, 50, gameDay, collatOpts);
      if (typeMax >= 100 && amount > typeMax) {
        toast(`Heads up: ${btn.dataset.type} max here is about $${typeMax.toLocaleString()}`, { type: 'info' });
      }
      if (!(amount >= 100)) amount = 100;
      state.onBorrow?.(btn.dataset.bank, btn.dataset.type, amount);
    };
  });
}

export function renderFinance(state) {
  const finance = state.finance;
  if (!finance) return;
  bindFinanceTabsOnce();
  const gameDay = formatMarketClock()?.day || 1;
  const collatOpts = vaultCollateralOpts(state);
  const pledged = getVaultPledgedAppraisal(state);
  const strengthPct = firmStrengthBoostPct(collatOpts.firmStrength || 0);
  syncEstateDerived(state);
  const estateCredit = Math.max(0, Number(state.estateCreditUsed) || 0);
  const firmDebt = getFirmDebt(finance, estateCredit);

  const bankingBar = document.getElementById('finance-banking-bar');
  if (bankingBar) {
    const barHtml = financeBankingBarHtml(finance, {
      firmDebt,
      pledged,
      strengthPct,
      firmStrength: collatOpts.firmStrength || 0,
      estateCredit,
    });
    if (bankingBarSnap !== barHtml) {
      bankingBarSnap = barHtml;
      bankingBar.innerHTML = barHtml;
    }
  }

  const builder = document.getElementById('credit-builder');
  if (builder) builder.innerHTML = creditBuilderHtml(finance);

  renderAccountsAtm(state, finance);

  const bankList = document.getElementById('bank-list');
  if (bankList) {
    const live = liveLoanAmtInput(bankList);
    // Structure key: approval/lock + debt + loyalty tier (not live cash/NW/APR).
    const structureKey = [
      getHouseBankId(finance) || '',
      ...BANKS.map((bank) => {
        const offers = quoteBankOffers(bank.id, finance, gameDay, collatOpts);
        const owed = bankDebt(finance, bank.id) > 0
          || otherBanksDebt(finance, bank.id, 'personal') > 0
          || otherBanksDebt(finance, bank.id, 'company') > 0;
        const rel = getBankRelationshipTier(finance, bank.id);
        return `${bank.id}:${offers?.personalOk ? 1 : 0}${offers?.companyOk ? 1 : 0}:${owed ? 1 : 0}:r${rel}`;
      }),
    ].join('|');
    if (bankList.childElementCount && (live || bankListStructureKey === structureKey)) {
      // Keep the focused/hovered input alive so wheel scroll isn't wiped by tick re-renders
      syncLiveLoanInputs(bankList, finance, gameDay, collatOpts);
      bindBankListActions(bankList, state, finance);
    } else {
      bankListStructureKey = structureKey;
      snapLoanDrafts(bankList);
      const groups = ['National banks', 'Online lenders', 'Credit unions'];
      const lenderRows = BANKS.map((bank) => {
        const offers = quoteBankOffers(bank.id, finance, gameDay, collatOpts);
        return {
          id: bank.id,
          personalApr: offers?.personalApr ?? bank.personalApr,
          companyApr: offers?.companyApr ?? bank.companyApr,
        };
      });
      const rateBadges = getBestRateLenderBadges(lenderRows);
      bankList.innerHTML = groups.map(group => {
        const banks = BANKS.filter(bank => {
          const cat = bank.category || 'National banks';
          if (group === 'Credit unions') return cat === 'Credit unions' || cat === 'Credit union';
          return cat === group;
        });
        if (!banks.length) return '';
        return `<div class="bank-section">
          <div class="bank-section-label">${group}</div>
          <div class="bank-section-grid">
          ${banks.map(bank => {
            const offers = quoteBankOffers(bank.id, finance, gameDay, collatOpts);
            const ceil = maxBorrowableForBank(bank.id, finance, 50, gameDay, collatOpts);
            const personalMax = offers?.personalMax || 0;
            const companyMax = offers?.companyMax || 0;
            const eligible = ceil >= 100;
            const startAmt = loanStartAmount(bank.id, ceil, eligible);
            const oweHere = bankDebt(finance, bank.id);
            const owePersonalElse = otherBanksDebt(finance, bank.id, 'personal');
            const oweCompanyElse = otherBanksDebt(finance, bank.id, 'company');
            const debtHint = (oweHere > 0 || owePersonalElse > 0 || oweCompanyElse > 0)
              ? `<div class="bank-debt-hint">
                  Here: <strong>${fmt(oweHere)}</strong>
                  · Other banks personal: <strong>${fmt(owePersonalElse)}</strong>
                  · company: <strong>${fmt(oweCompanyElse)}</strong>
                </div>`
              : `<div class="bank-debt-hint muted-text">No outstanding debt on file — lenders still share your credit picture.</div>`;
            const glow = bank.glow || bank.color;
            const glow2 = bank.glow2 || glow;
            const isHouse = getHouseBankId(finance) === bank.id;
            const houseNote = isHouse
              ? '<p class="bank-house-note">Your house lender — better APR and a bit more room here.</p>'
              : '';
            const personality = bankPersonalityLine(bank);
            return `
            <div class="bank-card fin-lender-card${isHouse ? ' is-house-lender' : ''}" data-bank-id="${bank.id}" style="--bank:${bank.color}; --bank-glow:${glow}; --bank-glow2:${glow2}">
              <div class="fin-lender-top">
                ${bankLogoHtml(bank)}
                <div class="fin-lender-id">
                  <div class="fin-lender-name-row">
                    <strong class="bank-name">${bank.name}</strong>
                    <span class="bank-short">${bank.short}</span>
                  </div>
                  <span class="bank-domain">${bank.domain}</span>
                  <div class="bank-badge-row">
                    ${relationshipBadgeHtml(finance, bank.id)}
                    ${bankBadgeHtml(bank.id, rateBadges)}
                  </div>
                </div>
              </div>
              <div class="bank-desc">${bank.desc}</div>
              ${personality ? `<div class="bank-personality muted-text">${personality}</div>` : ''}
              ${houseNote}
              ${bankStatusHtml(offers, finance, debtHint)}
              <div class="bank-actions">
                <label class="loan-amt-field">
                  <span>${eligible ? `Amount · max $${ceil.toLocaleString()}` : 'Amount · apply anyway'}</span>
                  <input type="number" class="loan-amt" data-bank="${bank.id}"
                    value="${startAmt}"
                    min="100"
                    max="${Math.max(eligible ? ceil : 5000, 100)}"
                    step="50"
                    title="${eligible
                      ? `Scroll to adjust · about $${ceil.toLocaleString()} available now`
                      : `Below this bank's credit floors — underwriting may deny`}">
                </label>
                <div class="loan-type-btns">
                  <button type="button" class="loan-btn loan-btn-personal borrow-btn ${personalMax < 100 ? 'is-tight' : ''}" data-bank="${bank.id}" data-type="personal"
                    title="${personalMax >= 100 ? `About $${personalMax.toLocaleString()} personal available` : 'May be denied — confirm to apply'}">
                    <span class="loan-btn-kicker">Personal</span>
                    <span class="loan-btn-apr">${offers?.personalApr ?? bank.personalApr}% APR</span>
                  </button>
                  <button type="button" class="loan-btn loan-btn-company borrow-btn ${companyMax < 100 ? 'is-tight' : ''}" data-bank="${bank.id}" data-type="company"
                    title="${companyMax >= 100 ? `About $${companyMax.toLocaleString()} company available` : 'May be denied — confirm to apply'}">
                    <span class="loan-btn-kicker">Company</span>
                    <span class="loan-btn-apr">${offers?.companyApr ?? bank.companyApr}% APR</span>
                  </button>
                </div>
              </div>
            </div>`;
          }).join('')}
          </div>
        </div>`;
      }).join('');

      bindBankListActions(bankList, state, finance);
    }
  }

  const loanList = document.getElementById('loan-list');
  const payoffBox = document.getElementById('loan-payoff-calc');
  if (payoffBox) {
    const active = getActiveLoans(finance);
    if (!active.length) {
      payoffBox.innerHTML = '';
    } else {
      payoffBox.innerHTML = `<div class="payoff-calc-title">Payoff calculator</div>` + active.map(l => {
        const p = projectLoanPayoff(l);
        if (!p) return '';
        return `<div class="payoff-card interactive-card">
          <strong>${l.bankName}</strong> · $${p.balance.toFixed(2)} @ ${p.apr}% · ${p.daysLeft}d left
          <div class="payoff-rows">
            <span>Minimum payments ≈ <strong>$${p.minimum.totalCost.toFixed(2)}</strong> (${p.minimum.interest.toFixed(2)} interest)</span>
            <span>Pay off today ≈ <strong>$${p.lumpSum.totalCost.toFixed(2)}</strong> (${p.lumpSum.interest.toFixed(2)} interest)</span>
            ${p.savings > 0 ? `<span class="up">Save ~$${p.savings.toFixed(2)} vs dragging minimums</span>` : ''}
          </div>
        </div>`;
      }).join('');
    }
  }
  if (loanList) {
    const active = getActiveLoans(finance);
    loanList.innerHTML = active.length ? active.map(l => `
      <div class="loan-card" data-gloss="total-debt">
        <div class="loan-card-top">
          <strong>${l.bankName}</strong>
          <span class="loan-type-tag">${l.type}</span>
        </div>
        <div class="loan-meta">Balance $${l.balance.toFixed(2)} · APR ${l.apr}% · ${l.daysLeft} days left · ${l.status}</div>
        <div class="loan-pay-row">
          <label class="loan-amt-field compact">
            <span>Pay</span>
            <input type="number" class="pay-amt" data-loan="${l.id}" value="${Math.min(1000, Math.ceil(l.balance))}" min="1" step="100">
          </label>
          <button type="button" class="loan-btn loan-btn-personal pay-btn" data-loan="${l.id}">Pay</button>
          <button type="button" class="loan-btn loan-btn-ghost pay-btn" data-loan="${l.id}" data-full="1">Pay off</button>
        </div>
      </div>`).join('') : '<div class="finance-empty">No active loans — borrow from a lender to leverage your desk</div>';

    loanList.querySelectorAll('.pay-btn').forEach(btn => {
      btn.onclick = () => {
        const loan = finance.loans.find(l => l.id === btn.dataset.loan);
        let amount = parseFloat(loanList.querySelector(`.pay-amt[data-loan="${btn.dataset.loan}"]`)?.value) || 0;
        if (btn.dataset.full === '1') amount = loan?.balance || 0;
        state.onLoanPay?.(btn.dataset.loan, amount);
      };
    });
  }

  const hist = document.getElementById('loan-history');
  if (hist) {
    const rows = finance.paymentHistory || [];
    hist.innerHTML = rows.length
      ? rows.slice(0, 12).map(r => `<div class="dash-row"><span>${r.bank}</span><span>−$${r.amount.toFixed(2)}</span></div>`).join('')
      : '<div class="finance-empty">Payments will appear here</div>';
  }
}
