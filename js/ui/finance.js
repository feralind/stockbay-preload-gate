// @ts-check
/**
 * Finance view render — extracted from ui.js (Phase 2).
 */

import {
  BANKS, creditTier, getActiveLoans, getTotalDebt, projectLoanPayoff,
  maxBorrowableAmount, maxBorrowableForBank, quoteBankOffers, utilizationRatio,
  bankDebt, otherBanksDebt,
} from '../finance.js';
import { domainLogoHtml } from '../logos.js';
import { formatMarketClock } from '../market.js';
import { toast } from '../notify.js';
import { fmt } from './shared.js';

/** Draft loan amounts per bank — survives renderFinance rebuilds so wheel scroll doesn't snap to 250 */
const loanDraftAmounts = new Map();

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

function syncLiveLoanInputs(bankList, finance, gameDay = 1) {
  bankList.querySelectorAll('.loan-amt').forEach(input => {
    const bankId = input.dataset.bank;
    const bank = BANKS.find(b => b.id === bankId);
    const offers = quoteBankOffers(bankId, finance, gameDay);
    const ceil = maxBorrowableForBank(bankId, finance, 50, gameDay);
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
      const typeMax = maxBorrowableAmount(bankId, btn.dataset.type, finance, 50, gameDay);
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
      const typeMax = maxBorrowableAmount(btn.dataset.bank, btn.dataset.type, finance, 50, gameDay);
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
  const gameDay = formatMarketClock()?.day || 1;
  const pUtil = Math.round(utilizationRatio(finance, 'personal') * 100);
  const bUtil = Math.round(utilizationRatio(finance, 'company') * 100);

  const pills = document.getElementById('credit-pills');
  if (pills) {
    const p = creditTier(finance.personalCredit);
    const b = creditTier(finance.businessCredit);
    pills.innerHTML = `
      <div class="credit-pill">
        <span class="credit-pill-lbl">Personal credit</span>
        <span class="credit-pill-val" style="color:${p.color}">${finance.personalCredit}</span>
        <span class="credit-tier">${p.label} · ${pUtil}% util</span>
      </div>
      <div class="credit-pill">
        <span class="credit-pill-lbl">Business credit</span>
        <span class="credit-pill-val" style="color:${b.color}">${finance.businessCredit}</span>
        <span class="credit-tier">${b.label} · ${bUtil}% util</span>
      </div>
      <div class="credit-pill">
        <span class="credit-pill-lbl">Total debt</span>
        <span class="credit-pill-val down">${fmt(getTotalDebt(finance))}</span>
        <span class="credit-tier">Outstanding</span>
      </div>`;
  }

  const bankList = document.getElementById('bank-list');
  if (bankList) {
    const live = liveLoanAmtInput(bankList);
    if (live && bankList.childElementCount) {
      // Keep the focused/hovered input alive so wheel scroll isn't wiped by tick re-renders
      syncLiveLoanInputs(bankList, finance, gameDay);
      bindBankListActions(bankList, state, finance);
    } else {
      snapLoanDrafts(bankList);
      const groups = ['National banks', 'Credit union'];
      const lenderRows = BANKS.map((bank) => {
        const offers = quoteBankOffers(bank.id, finance, gameDay);
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
          ${banks.map(bank => {
            const offers = quoteBankOffers(bank.id, finance, gameDay);
            const ceil = maxBorrowableForBank(bank.id, finance, 50, gameDay);
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
            return `
            <div class="bank-card" style="--bank:${bank.color}">
              ${bankLogoHtml(bank)}
              <div class="bank-body">
                <div class="bank-head">
                  <div>
                    <strong class="bank-name">${bank.name}</strong>
                    <span class="bank-domain">${bank.domain}</span>
                    ${bankBadgeHtml(bank.id, rateBadges)}
                  </div>
                  <span class="bank-short">${bank.short}</span>
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
              </div>
            </div>`;
          }).join('')}
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
      <div class="loan-card">
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
