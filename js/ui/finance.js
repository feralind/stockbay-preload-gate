// @ts-check
/**
 * Finance view render — extracted from ui.js (Phase 2).
 */

import {
  BANKS, APR_CREDIT_TIERS, DAILY_CREDIT_GAIN_CAP, creditTier, getActiveLoans, getFirmDebt,
  projectLoanPayoff, maxBorrowableAmount, maxBorrowableForBank, quoteBankOffers,
  utilizationRatio, bankDebt, otherBanksDebt,
} from '../finance.js';
import { getVaultPledgedAppraisal } from '../vault.js';
import { syncEstateDerived } from '../estates.js';
import { domainLogoHtml } from '../logos.js';
import { formatMarketClock } from '../market.js';
import { toast } from '../notify.js';
import { fmt } from './shared.js';

/** Draft loan amounts per bank — survives renderFinance rebuilds so wheel scroll doesn't snap to 250 */
const loanDraftAmounts = new Map();

/** @type {'lenders' | 'loans' | 'history' | 'builder'} */
let activeFinTab = 'lenders';
let finTabsBound = false;

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

/** Circular ring gauge for a 300–850 FICO-style score — thin arc, color follows credit tier. */
function creditGaugeHtml(label, score, tier, util) {
  const r = 27;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, (Number(score) - 300) / (850 - 300)));
  const offset = circumference * (1 - pct);
  return `
    <div class="credit-gauge">
      <div class="credit-gauge-ring-wrap" style="--gauge-color:${tier.color}">
        <svg viewBox="0 0 64 64" width="88" height="88" class="credit-gauge-ring" aria-hidden="true">
          <circle cx="32" cy="32" r="${r}" class="credit-gauge-track"></circle>
          <circle cx="32" cy="32" r="${r}" class="credit-gauge-arc"
            stroke-dasharray="${circumference.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"></circle>
        </svg>
        <div class="credit-gauge-score">${score}</div>
      </div>
      <div class="credit-gauge-lbl">${label}</div>
      <div class="credit-gauge-tier" style="color:${tier.color}">${tier.label} · ${util}% util</div>
    </div>`;
}

function financeGaugesHtml(finance) {
  const p = creditTier(finance.personalCredit);
  const b = creditTier(finance.businessCredit);
  const pUtil = Math.round(utilizationRatio(finance, 'personal') * 100);
  const bUtil = Math.round(utilizationRatio(finance, 'company') * 100);
  return creditGaugeHtml('Personal credit', finance.personalCredit, p, pUtil)
    + creditGaugeHtml('Company credit', finance.businessCredit, b, bUtil);
}

/** Credit Builder tab — tier ladder + the score-building rules baked into finance.js. */
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
        <div class="builder-tip"><strong>Age it before you cash out.</strong> A loan must survive one day-end interest tick before payoff or partial repay can raise your score — same-morning borrow→repay builds nothing.</div>
        <div class="builder-tip"><strong>Daily gain caps.</strong> Personal credit can climb at most ${DAILY_CREDIT_GAIN_CAP.personal} pts/day, business ${DAILY_CREDIT_GAIN_CAP.business} pts/day — spreading paydowns across days beats one huge payment.</div>
        <div class="builder-tip"><strong>Utilization matters.</strong> Staying under 30% of your total credit limit earns an APR discount; 80%+ utilization adds a penalty and shrinks new approvals.</div>
        <div class="builder-tip"><strong>Late payments hit hardest.</strong> A single missed auto-pay can cost 20–30+ points — far more than any single on-time payment gains.</div>
      </div>
    </div>`;
}

function vaultCollateralOpts(state) {
  return { collateralValue: getVaultPledgedAppraisal(state || {}) };
}

export function setLoanDraftAmount(bankId, val) {
  if (!bankId || !Number.isFinite(val)) return;
  loanDraftAmounts.set(bankId, val);
}

export function getLoanDraftAmount(bankId) {
  return loanDraftAmounts.get(bankId);
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

function bankLogoHtml(bank) {
  return domainLogoHtml(bank.domain, {
    letter: bank.short.slice(0, 1),
    color: bank.color,
    className: 'bank-logo',
    attrs: `data-bank="${bank.id}"`,
  });
}

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
    const bank = BANKS.find(b => b.id === bankId);
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
      : `Need ${bank?.minCredit ?? ''}+ credit — you can still apply and may be denied`;
    let v = parseFloat(input.value);
    if (!Number.isFinite(v)) v = loanStartAmount(bankId, ceil, eligible);
    if (eligible && v > ceil) v = ceil;
    if (v < 100) v = 100;
    const next = String(Math.round(v));
    if (input.value !== next) input.value = next;
    setLoanDraftAmount(bankId, Math.round(v));
    const card = input.closest('.bank-card');
    if (card && offers) {
      const chips = card.querySelector('.bank-rates');
      if (chips) {
        chips.innerHTML = `
          <span class="rate-chip">Your personal ${offers.personalApr}% APR</span>
          <span class="rate-chip">Your company ${offers.companyApr}% APR</span>
          <span class="rate-chip muted">Min credit ${bank.minCredit}</span>`;
      }
      const hint = card.querySelector('.bank-debt-hint');
      if (hint) {
        const oweHere = bankDebt(finance, bankId);
        const oweP = otherBanksDebt(finance, bankId, 'personal');
        const oweC = otherBanksDebt(finance, bankId, 'company');
        hint.innerHTML = (oweHere > 0 || oweP > 0 || oweC > 0)
          ? `Here: <strong>${fmt(oweHere)}</strong> · Other banks personal: <strong>${fmt(oweP)}</strong> · company: <strong>${fmt(oweC)}</strong>`
          : `No outstanding debt on file — lenders still share your credit picture.`;
        hint.classList.toggle('muted-text', !(oweHere > 0 || oweP > 0 || oweC > 0));
      }
      const pBtn = card.querySelector('.loan-btn-personal .loan-btn-apr');
      const cBtn = card.querySelector('.loan-btn-company .loan-btn-apr');
      if (pBtn) pBtn.textContent = `${offers.personalApr}% APR`;
      if (cBtn) cBtn.textContent = `${offers.companyApr}% APR`;
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
    // Always clickable — confirm first, then approve or deny with a reason
    btn.disabled = false;
    btn.onclick = () => {
      const input = bankList.querySelector(`.loan-amt[data-bank="${btn.dataset.bank}"]`);
      let amount = parseFloat(input?.value) || 0;
      setLoanDraftAmount(input?.dataset.bank, amount);
      const typeMax = maxBorrowableAmount(btn.dataset.bank, btn.dataset.type, finance, 50, gameDay, collatOpts);
      if (typeMax >= 100 && amount > typeMax) {
        // Soft hint only — final underwriting still runs after confirm
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

  const gauges = document.getElementById('finance-gauges');
  if (gauges) gauges.innerHTML = financeGaugesHtml(finance);

  const pills = document.getElementById('credit-pills');
  if (pills) {
    syncEstateDerived(state);
    const estateCredit = Math.max(0, Number(state.estateCreditUsed) || 0);
    const firmDebt = getFirmDebt(finance, estateCredit);
    pills.innerHTML = `
      <div class="credit-pill" data-gloss="credit-score">
        <span class="credit-pill-lbl">Total debt</span>
        <span class="credit-pill-val down">${fmt(firmDebt)}</span>
        <span class="credit-tier">Loans${estateCredit > 0 ? ' + property credit' : ''}</span>
      </div>
      <div class="credit-pill" data-gloss="net-worth">
        <span class="credit-pill-lbl">Vault pledged</span>
        <span class="credit-pill-val">${fmt(pledged)}</span>
        <span class="credit-tier">50% LTV collateral</span>
      </div>
      <div class="credit-pill">
        <span class="credit-pill-lbl">Property credit</span>
        <span class="credit-pill-val">${fmt(estateCredit)}</span>
        <span class="credit-tier">Drawn HELOC-style</span>
      </div>`;
  }

  const builder = document.getElementById('credit-builder');
  if (builder) builder.innerHTML = creditBuilderHtml(finance);

  const bankList = document.getElementById('bank-list');
  if (bankList) {
    const live = liveLoanAmtInput(bankList);
    if (live && bankList.childElementCount) {
      // Keep the focused/hovered input alive so wheel scroll isn't wiped by tick re-renders
      syncLiveLoanInputs(bankList, finance, gameDay, collatOpts);
      bindBankListActions(bankList, state, finance);
    } else {
      snapLoanDrafts(bankList);
      const groups = ['National banks', 'Online lenders', 'Credit union'];
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
        const banks = BANKS.filter(bank => (bank.category || 'National banks') === group);
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
            return `
            <div class="bank-card fin-lender-card" style="--bank:${bank.color}; --bank-glow:${glow}; --bank-glow2:${glow2}">
              <div class="fin-lender-top">
                ${bankLogoHtml(bank)}
                <div class="fin-lender-id">
                  <div class="fin-lender-name-row">
                    <strong class="bank-name">${bank.name}</strong>
                    <span class="bank-short">${bank.short}</span>
                  </div>
                  <span class="bank-domain">${bank.domain}</span>
                  ${bankBadgeHtml(bank.id, rateBadges)}
                </div>
              </div>
              <div class="bank-desc">${bank.desc}</div>
              <div class="bank-rates">
                <span class="rate-chip">Your personal ${offers?.personalApr ?? bank.personalApr}% APR</span>
                <span class="rate-chip">Your company ${offers?.companyApr ?? bank.companyApr}% APR</span>
                <span class="rate-chip muted">Min credit ${bank.minCredit}</span>
              </div>
              ${debtHint}
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
                      : `Underwriting may deny — credit min ${bank.minCredit}`}">
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
      <div class="loan-card" data-gloss="credit-score">
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
