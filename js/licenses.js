// @ts-check
/**
 * Institutional licensing framework — replaces the old REP grind.
 *
 * Progression = explicit licenses with readable, real-world requirements
 * (exam fee + track record + credit checks) instead of an abstract meter.
 * Save key: state.licenses — array of license ids; 'retail' is the default.
 *
 * Ids are save keys — do not rename.
 */

export const LICENSE_ORDER = ['retail', 'series7', 'research', 'regd'];

export const LICENSES = {
  retail: {
    id: 'retail',
    order: 0,
    fee: 0,
    name: 'Retail Trading Account',
    short: 'Retail',
    blurb: 'Cash trading, research basics, and your first hires.',
    teaches: 'Cash vs equity — you can only lose what you put in.',
    unlocks: 'Pro Scanner, HR Department, Analyst charts, cash trading',
  },
  series7: {
    id: 'series7',
    order: 1,
    fee: 1500,
    requires: 'retail',
    name: 'Series 7 — General Securities',
    short: 'Series 7',
    blurb: 'The classic broker exam. Margin, shorts, and floor scale.',
    teaches: 'Leverage cuts both ways — the background check needs clean personal credit.',
    unlocks: 'Margin & shorts, Options Desk, Trading Floor, Smart Routing',
    reqs: { tradesClosed: 25, personalCredit: 620 },
  },
  research: {
    id: 'research',
    order: 2,
    fee: 8000,
    requires: 'series7',
    name: 'Series 86/87 — Equity Research',
    short: 'Series 86/87',
    blurb: 'Research analyst credentials. Deeper data and advisory desks.',
    teaches: 'Consistency beats hot streaks — show green days over real time.',
    unlocks: 'News Wire, AI Advisor, Insider Network, Vault Prestige',
    reqs: { greenDays: 15, minDay: 60 },
  },
  regd: {
    id: 'regd',
    order: 3,
    fee: 35000,
    requires: 'research',
    name: 'Reg D — Institutional Desk',
    short: 'Reg D',
    blurb: 'Institutional accreditation. Fund status and prime brokerage.',
    teaches: 'Institutions audit the firm: business credit, real net worth, and a clean payment record.',
    unlocks: 'Hedge Fund Status, Prime Broker, Legend Desk, The Seat',
    reqs: { businessCredit: 700, netWorth: 150000, cleanDays: 30 },
  },
};

export const KNOWN_LICENSE_IDS = new Set(LICENSE_ORDER);

/** @param {any} raw @returns {string[]} known ids, prereq chain filled, retail always present */
export function sanitizeLicenses(raw) {
  const set = new Set(['retail']);
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (KNOWN_LICENSE_IDS.has(id)) set.add(id);
    }
  }
  // Fill prerequisite chain so a save can never hold regd without series7/research.
  if (set.has('regd')) { set.add('research'); }
  if (set.has('research')) { set.add('series7'); }
  return LICENSE_ORDER.filter((id) => set.has(id));
}

/** @param {string[] | undefined} licenses @param {string} id */
export function hasLicense(licenses, id) {
  if (id === 'retail') return true;
  return Array.isArray(licenses) && licenses.includes(id);
}

/** Highest owned license (for HUD badge). */
export function getHighestLicense(licenses) {
  let best = LICENSES.retail;
  for (const id of LICENSE_ORDER) {
    if (hasLicense(licenses, id)) best = LICENSES[id];
  }
  return best;
}

/** Next license above the highest owned, or null at the top. */
export function getNextLicense(licenses) {
  const cur = getHighestLicense(licenses);
  const idx = LICENSE_ORDER.indexOf(cur.id);
  return idx >= 0 && idx < LICENSE_ORDER.length - 1 ? LICENSES[LICENSE_ORDER[idx + 1]] : null;
}

/**
 * Legacy numeric REP thresholds → license tier, for catalogs that keep
 * `repRequired`/`minRep` as data keys (vault, black market, salon, office,
 * estates, The Seat). 0 → retail; early ranks → Series 7; mid → Research;
 * late/legend → Reg D.
 * @param {number} repNeed
 */
export function requiredLicenseForRep(repNeed) {
  const need = Math.max(0, Number(repNeed) || 0);
  if (need <= 0) return LICENSES.retail;
  if (need <= 120) return LICENSES.series7;
  if (need <= 400) return LICENSES.research;
  return LICENSES.regd;
}

/** Migration: old saves grant licenses from their REP total. */
export function licensesFromLegacyRep(rep) {
  const r = Math.max(0, Number(rep) || 0);
  const out = ['retail'];
  if (r >= 120) out.push('series7');
  if (r >= 250) out.push('research');
  if (r >= 500) out.push('regd');
  return out;
}

/**
 * Build the qualification snapshot the gates read. Pure — pass state + net worth.
 * @param {object} state
 * @param {{ netWorth?: number, day?: number }} [ctx]
 */
export function licenseSnapshot(state = {}, ctx = {}) {
  const finance = state.finance || {};
  return {
    licenses: Array.isArray(state.licenses) ? state.licenses : ['retail'],
    cash: Math.max(0, Number(state.portfolio?.cash) || 0),
    tradesClosed: Math.max(0, Number(state.stats?.tradesClosed) || 0),
    greenDays: Math.max(0, Number(state.stats?.greenDays) || 0),
    day: Math.max(1, Math.floor(Number(ctx.day) || 1)),
    personalCredit: Math.max(300, Number(finance.personalCredit) || 300),
    businessCredit: Math.max(300, Number(finance.businessCredit) || 300),
    netWorth: Math.max(0, Number(ctx.netWorth) || 0),
    lastLateDay: Number.isFinite(Number(finance.lastLateDay)) ? Number(finance.lastLateDay) : null,
    everLate: Math.max(0, Number(finance.latePayments) || 0) > 0,
  };
}

/**
 * Per-requirement readout for the exam UI.
 * @param {string} licenseId
 * @param {ReturnType<typeof licenseSnapshot>} snap
 * @returns {Array<{ code: string, label: string, met: boolean }>}
 */
export function getLicenseRequirements(licenseId, snap) {
  const lic = LICENSES[licenseId];
  if (!lic) return [];
  const rows = [];
  const reqs = lic.reqs || {};
  if (lic.requires && lic.requires !== 'retail') {
    rows.push({
      code: 'prereq',
      label: `Hold ${LICENSES[lic.requires].short} license`,
      met: hasLicense(snap.licenses, lic.requires),
    });
  }
  if (reqs.tradesClosed) {
    rows.push({
      code: 'trades',
      label: `Close ${reqs.tradesClosed} trades (${Math.min(snap.tradesClosed, reqs.tradesClosed)}/${reqs.tradesClosed})`,
      met: snap.tradesClosed >= reqs.tradesClosed,
    });
  }
  if (reqs.personalCredit) {
    rows.push({
      code: 'personalCredit',
      label: `Personal credit ${reqs.personalCredit}+ for the background check (now ${Math.round(snap.personalCredit)})`,
      met: snap.personalCredit >= reqs.personalCredit,
    });
  }
  if (reqs.greenDays) {
    rows.push({
      code: 'greenDays',
      label: `${reqs.greenDays} green days (${Math.min(snap.greenDays, reqs.greenDays)}/${reqs.greenDays})`,
      met: snap.greenDays >= reqs.greenDays,
    });
  }
  if (reqs.minDay) {
    rows.push({
      code: 'minDay',
      label: `Desk open ${reqs.minDay}+ days (day ${snap.day})`,
      met: snap.day >= reqs.minDay,
    });
  }
  if (reqs.businessCredit) {
    rows.push({
      code: 'businessCredit',
      label: `Business credit ${reqs.businessCredit}+ (now ${Math.round(snap.businessCredit)})`,
      met: snap.businessCredit >= reqs.businessCredit,
    });
  }
  if (reqs.netWorth) {
    rows.push({
      code: 'netWorth',
      label: `Net worth $${reqs.netWorth.toLocaleString()}+ (now $${Math.round(snap.netWorth).toLocaleString()})`,
      met: snap.netWorth >= reqs.netWorth,
    });
  }
  if (reqs.cleanDays) {
    // lastLateDay == null → no recorded late (or pre-tracking save): treat as clean.
    const cleanSince = snap.lastLateDay == null
      || snap.day - snap.lastLateDay >= reqs.cleanDays;
    rows.push({
      code: 'cleanDays',
      label: `No late loan payments in the last ${reqs.cleanDays} days`,
      met: cleanSince,
    });
  }
  return rows;
}

/**
 * Exam gate — qualifications + fee.
 * @param {string} licenseId
 * @param {ReturnType<typeof licenseSnapshot>} snap
 */
export function canTakeLicenseExam(licenseId, snap) {
  const lic = LICENSES[licenseId];
  if (!lic) return { ok: false, reason: 'Unknown license', code: 'unknown' };
  if (hasLicense(snap.licenses, licenseId)) {
    return { ok: false, reason: 'Already licensed', code: 'owned' };
  }
  const rows = getLicenseRequirements(licenseId, snap);
  const missing = rows.filter((r) => !r.met);
  if (missing.length) {
    return { ok: false, reason: missing[0].label, code: missing[0].code, missing };
  }
  if (snap.cash < lic.fee) {
    return { ok: false, reason: `Exam fee is $${lic.fee.toLocaleString()}`, code: 'cash', missing: [] };
  }
  return { ok: true, missing: [] };
}

/**
 * Take the exam: deduct fee, grant license. Mutates state.
 * @param {object} state
 * @param {string} licenseId
 * @param {{ netWorth?: number, day?: number }} [ctx]
 */
export function purchaseLicense(state, licenseId, ctx = {}) {
  const snap = licenseSnapshot(state, ctx);
  const gate = canTakeLicenseExam(licenseId, snap);
  if (!gate.ok) return { ok: false, msg: gate.reason, code: gate.code };
  const lic = LICENSES[licenseId];
  state.portfolio.cash -= lic.fee;
  state.licenses = sanitizeLicenses([...(state.licenses || []), licenseId]);
  return { ok: true, license: lic };
}
