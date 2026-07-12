// @ts-check
/** Brand logos — local cache first, then Google/DDG favicons + letter fallback */

export const LOGO_DOMAINS = {
  // Mega tech
  AAPL: 'apple.com', MSFT: 'microsoft.com', GOOGL: 'google.com', GOOG: 'google.com',
  META: 'meta.com', AMZN: 'amazon.com', NVDA: 'nvidia.com', TSLA: 'tesla.com',
  AMD: 'amd.com', INTC: 'intel.com', NFLX: 'netflix.com', ADBE: 'adobe.com',
  CRM: 'salesforce.com', ORCL: 'oracle.com', CSCO: 'cisco.com', AVGO: 'broadcom.com',
  QCOM: 'qualcomm.com', TXN: 'ti.com', IBM: 'ibm.com', NOW: 'servicenow.com',
  INTU: 'intuit.com', MU: 'micron.com', PANW: 'paloaltonetworks.com', CRWD: 'crowdstrike.com',
  SNOW: 'snowflake.com', PLTR: 'palantir.com', NET: 'cloudflare.com', SHOP: 'shopify.com',
  ARM: 'arm.com', SMCI: 'supermicro.com', TSM: 'tsmc.com', ASML: 'asml.com',
  AMAT: 'appliedmaterials.com', LRCX: 'lamresearch.com', KLAC: 'kla.com', SNPS: 'synopsys.com',
  CDNS: 'cadence.com', DDOG: 'datadoghq.com', ZS: 'zscaler.com', MDB: 'mongodb.com',
  TEAM: 'atlassian.com', WDAY: 'workday.com', ADSK: 'autodesk.com', FTNT: 'fortinet.com',
  DELL: 'dell.com', HPQ: 'hp.com', HPE: 'hpe.com', MRVL: 'marvell.com', ON: 'onsemi.com',
  OKTA: 'okta.com', HUBS: 'hubspot.com', DOCU: 'docusign.com', PATH: 'uipath.com',
  AI: 'c3.ai', TTD: 'thetradedesk.com', SNAP: 'snap.com', PINS: 'pinterest.com',
  RDDT: 'reddit.com', U: 'unity.com', RBLX: 'roblox.com',

  // Consumer / retail
  COST: 'costco.com', WMT: 'walmart.com', TGT: 'target.com', HD: 'homedepot.com',
  LOW: 'lowes.com', NKE: 'nike.com', SBUX: 'starbucks.com', MCD: 'mcdonalds.com',
  DIS: 'disney.com', BKNG: 'booking.com', ABNB: 'airbnb.com', UBER: 'uber.com',
  CMG: 'chipotle.com', EBAY: 'ebay.com', ETSY: 'etsy.com', LULU: 'lululemon.com',
  DECK: 'deckers.com', ONON: 'on.com', CROX: 'crocs.com', ADDYY: 'adidas.com',
  UAA: 'underarmour.com', VFC: 'vfc.com', RL: 'ralphlauren.com', TPR: 'tapestry.com',
  TJX: 'tjx.com', ROST: 'rossstores.com', BBY: 'bestbuy.com', DG: 'dollargeneral.com',
  DLTR: 'dollartree.com', YUM: 'yum.com', DPZ: 'dominos.com', DASH: 'doordash.com',
  LYFT: 'lyft.com', SE: 'sea.com', MELI: 'mercadolibre.com', CVNA: 'carvana.com',
  W: 'wayfair.com', GPS: 'gap.com', ANF: 'abercrombie.com', SKX: 'skechers.com',

  // Automotive
  F: 'ford.com', GM: 'gm.com', HMC: 'honda.com', TM: 'toyota.com', STLA: 'stellantis.com',
  RACE: 'ferrari.com', LCID: 'lucidmotors.com', RIVN: 'rivian.com', NIO: 'nio.com',
  XPEV: 'xpeng.com', LI: 'lixiang.com', FSR: 'fiskerinc.com', GOEV: 'canoo.com',
  FFIE: 'faradayfuture.com', NKLA: 'nikolamotor.com', QS: 'quantumscape.com',
  LAZR: 'luminartech.com', APTV: 'aptiv.com',

  // Space & defense
  RKLB: 'rocketlabusa.com', ASTS: 'ast-science.com', LUNR: 'intuitivemachines.com',
  SPCE: 'virgingalactic.com', RDW: 'redwirespace.com', IRDM: 'iridium.com',
  BA: 'boeing.com', LMT: 'lockheedmartin.com', NOC: 'northropgrumman.com',
  RTX: 'rtx.com', GD: 'gd.com', HEI: 'heico.com', KTOS: 'kratosdefense.com',

  // Finance
  JPM: 'jpmorganchase.com', BAC: 'bankofamerica.com', WFC: 'wellsfargo.com',
  C: 'citi.com', GS: 'goldmansachs.com', MS: 'morganstanley.com', V: 'visa.com',
  MA: 'mastercard.com', AXP: 'americanexpress.com', BLK: 'blackrock.com',
  SCHW: 'schwab.com', PYPL: 'paypal.com', COIN: 'coinbase.com', HOOD: 'robinhood.com',
  SQ: 'block.xyz', SOFI: 'sofi.com', BRK: 'berkshirehathaway.com', 'BRK.B': 'berkshirehathaway.com',
  COF: 'capitalone.com', USB: 'usbank.com', PNC: 'pnc.com', CME: 'cmegroup.com',
  ICE: 'theice.com', SPGI: 'spglobal.com', MCO: 'moodys.com', MSCI: 'msci.com',
  AFRM: 'affirm.com', UPST: 'upstart.com',

  // Healthcare
  UNH: 'unitedhealthgroup.com', JNJ: 'jnj.com', LLY: 'lilly.com', PFE: 'pfizer.com',
  ABBV: 'abbvie.com', MRK: 'merck.com', AMGN: 'amgen.com', GILD: 'gilead.com',
  MRNA: 'modernatx.com', BIIB: 'biogen.com', NVO: 'novonordisk.com',
  TMO: 'thermofisher.com', ABT: 'abbott.com', ISRG: 'intuitive.com', MDT: 'medtronic.com',
  VRTX: 'vrtx.com', REGN: 'regeneron.com', CVS: 'cvs.com', CI: 'cigna.com',
  DXCM: 'dexcom.com', ZTS: 'zoetis.com',

  // Energy / industrial
  XOM: 'exxonmobil.com', CVX: 'chevron.com', CAT: 'caterpillar.com', GE: 'ge.com',
  HON: 'honeywell.com', UPS: 'ups.com', FDX: 'fedex.com', DE: 'deere.com',
  DAL: 'delta.com', UAL: 'united.com', BP: 'bp.com', SHEL: 'shell.com',
  COP: 'conocophillips.com', SLB: 'slb.com', OXY: 'oxy.com', NEE: 'nexteraenergy.com',
  ENPH: 'enphase.com', FSLR: 'firstsolar.com', CEG: 'constellationenergy.com',
  UNP: 'up.com', CSX: 'csx.com', LUV: 'southwest.com', AAL: 'aa.com',
  WM: 'wm.com', ETN: 'eaton.com', EMR: 'emerson.com',

  // Telecom / media
  T: 'att.com', VZ: 'verizon.com', TMUS: 't-mobile.com', CMCSA: 'comcast.com',
  SPOT: 'spotify.com', ROKU: 'roku.com', EA: 'ea.com', TTWO: 'take2games.com',
  SONY: 'sony.com', BABA: 'alibaba.com', JD: 'jd.com', PDD: 'pinduoduo.com',
  CHTR: 'charter.com', WBD: 'wbd.com', PARA: 'paramount.com', LYV: 'livenation.com',
  CCL: 'carnival.com', RCL: 'royalcaribbean.com', MGM: 'mgmresorts.com',
  WYNN: 'wynnresorts.com', MAR: 'marriott.com', HLT: 'hilton.com',

  // Consumer staples
  KO: 'coca-cola.com', PEP: 'pepsico.com', PG: 'pg.com', PM: 'pmi.com',
  KHC: 'kraftheinzcompany.com', MDLZ: 'mondelezinternational.com', UL: 'unilever.com',
  DEO: 'diageo.com', CL: 'colgatepalmolive.com', KMB: 'kimberly-clark.com',
  GIS: 'generalmills.com', HSY: 'hersheys.com', MNST: 'monsterenergy.com',
  MO: 'altria.com', SYY: 'sysco.com',

  // Penny / meme / crypto miners
  AMC: 'amctheatres.com', GME: 'gamestop.com', BB: 'blackberry.com', NOK: 'nokia.com',
  SNDL: 'sundialgrowers.com', RIOT: 'riotplatforms.com', MARA: 'mara.com',
  PLUG: 'plugpower.com', BBAI: 'bigbear.ai', SOUN: 'soundhound.com', IONQ: 'ionq.com',
  CLSK: 'cleanspark.com', HUT: 'hut8.com', TLRY: 'tilray.com', CGC: 'canopygrowth.com',

  // ETFs
  SPY: 'ssga.com', QQQ: 'invesco.com', DIA: 'ssga.com', IWM: 'ishares.com',
  VTI: 'vanguard.com', VOO: 'vanguard.com', ARKK: 'ark-invest.com', GLD: 'spdrgoldshares.com',
  XLK: 'ssga.com', XLF: 'ssga.com', XLE: 'ssga.com', SOXX: 'ishares.com',

  // Banks (financing desk)
  'bank:chase': 'chase.com',
  'bank:boa': 'bankofamerica.com',
  'bank:wells': 'wellsfargo.com',
  'bank:citi': 'citi.com',
  'bank:capitalone': 'capitalone.com',
  'bank:local': 'navyfederal.org',
};

const failedLogos = new Set();
/** Working image URL per key — avoids re-chasing local→google→ddg on every re-render */
const resolvedLogoSrc = new Map();
/** Keys whose local PNG 404'd — skip local next time */
const localMiss = new Set();
/**
 * Repo ships no PNGs under assets/logos/ (optional cache only).
 * Starting on local causes a guaranteed 404 → letter flash on every first paint.
 */
const PREFER_REMOTE_LOGOS = true;

export function getLogoDomain(sym) {
  return LOGO_DOMAINS[(sym || '').toUpperCase()] || null;
}

function faviconUrl(domain, sz = 128) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${sz}`;
}

function duckUrl(domain) {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

/** Local PNG first (fast/offline), then remote favicons */
export function getLogoUrls(sym) {
  const s = (sym || '').toUpperCase();
  const domain = getLogoDomain(s);
  if (!domain) return null;
  return {
    local: `assets/logos/${s}.png`,
    primary: faviconUrl(domain, 128),
    fallback: duckUrl(domain),
    domain,
  };
}

export function getDomainLogoUrls(domain) {
  if (!domain) return null;
  const key = domain.replace(/[^a-z0-9.]/gi, '_');
  return {
    local: `assets/logos/domains/${key}.png`,
    primary: faviconUrl(domain, 64),
    fallback: duckUrl(domain),
    domain,
  };
}

export function hasLogo(sym) {
  const s = (sym || '').toUpperCase();
  return !!LOGO_DOMAINS[s] && !failedLogos.has(s);
}

export function markLogoFailed(sym) {
  failedLogos.add((sym || '').toUpperCase());
}

function logoImgTag(urls, symKey, { startSrc, ready = false } = {}) {
  const skipLocal = PREFER_REMOTE_LOGOS || localMiss.has(symKey);
  const src = startSrc || (skipLocal ? urls.primary : urls.local);
  const triedLocal = src !== urls.local ? ' data-tried-local="1"' : '';
  const triedRemote = src === urls.fallback ? ' data-tried-remote="1" data-tried-local="1"' : (src === urls.primary && skipLocal ? ' data-tried-local="1"' : '');
  // When we already know a working URL, skip onerror chain churn
  if (ready) {
    return `<img class="sym-logo" src="${src}" alt="" loading="eager" decoding="async" data-key="${symKey}" data-ready="1" />`;
  }
  return `<img class="sym-logo" src="${src}" alt="" loading="eager" decoding="async"
    data-local="${urls.local}" data-remote="${urls.primary}" data-fallback="${urls.fallback}" data-key="${symKey}"${triedLocal}${triedRemote}
    onload="window.__stockwayLogoOk&&window.__stockwayLogoOk(this)"
    onerror="window.__stockwayLogoErr&&window.__stockwayLogoErr(this)" />`;
}

/**
 * Stock symbol mark — optimistic has-logo (letter hidden) so we never flash letter→image.
 * Letter only appears if every favicon URL fails.
 */
export function logoMarkHtml(sym, { color, letter, size = 'md', id = '' } = {}) {
  const s = (sym || '').toUpperCase();
  const urls = getLogoUrls(s);
  const bg = color || '#3b82f6';
  const ch = letter || s.charAt(0) || '?';
  const sizeClass = size === 'sm' ? 'sym-mark-sm' : size === 'lg' ? 'sym-mark-lg' : '';
  const idAttr = id ? ` id="${id}"` : '';

  if (!urls || failedLogos.has(s)) {
    return `<div${idAttr} class="sym-mark ${sizeClass}" style="background:${bg}" aria-hidden="true">${ch}</div>`;
  }

  const cached = resolvedLogoSrc.get(s);
  if (cached) {
    return `<div${idAttr} class="sym-mark ${sizeClass} has-logo" style="background:${bg}" data-sym="${s}" aria-hidden="true">
    <span class="sym-letter">${ch}</span>
    ${logoImgTag(urls, s, { startSrc: cached, ready: true })}
  </div>`;
  }

  // has-logo immediately — hides letter while favicon loads (no letter↔logo flash)
  return `<div${idAttr} class="sym-mark ${sizeClass} has-logo" style="background:${bg}" data-sym="${s}" aria-hidden="true">
    <span class="sym-letter">${ch}</span>
    ${logoImgTag(urls, s)}
  </div>`;
}

/** Bank / domain logo mark (financing desk, etc.) */
export function domainLogoHtml(domain, { letter, color, className = 'bank-logo', attrs = '' } = {}) {
  const urls = getDomainLogoUrls(domain);
  const bg = color || '#3b82f6';
  const ch = letter || domain?.charAt(0)?.toUpperCase() || '?';
  const key = `domain:${domain}`;
  if (!urls) {
    return `<div class="${className}" style="--bank:${bg}" ${attrs}><span>${ch}</span></div>`;
  }
  const cached = resolvedLogoSrc.get(key);
  if (cached) {
    return `<div class="${className} has-logo" style="--bank:${bg}" data-domain="${domain}" ${attrs}>
    <span>${ch}</span>
    ${logoImgTag(urls, key, { startSrc: cached, ready: true })}
  </div>`;
  }
  return `<div class="${className} has-logo" style="--bank:${bg}" data-domain="${domain}" ${attrs}>
    <span>${ch}</span>
    ${logoImgTag(urls, key)}
  </div>`;
}

export function installLogoErrorHandler() {
  if (typeof window === 'undefined') return;
  window.__stockwayLogoOk = (img) => {
    const wrap = img.closest('.sym-mark, .bank-logo');
    if (!wrap) return;
    if (img.naturalWidth > 0 && img.naturalWidth <= 4 && img.naturalHeight <= 4) {
      window.__stockwayLogoErr(img);
      return;
    }
    const key = img.dataset.key;
    if (key) resolvedLogoSrc.set(key, img.currentSrc || img.src);
    wrap.classList.add('has-logo');
    img.classList.add('is-ready');
  };
  window.__stockwayLogoErr = (img) => {
    const wrap = img.closest('.sym-mark, .bank-logo');
    const key = img.dataset.key || '';
    const local = img.dataset.local;
    const remote = img.dataset.remote;
    const fb = img.dataset.fallback;

    // Failed on local asset
    if (local && img.src.includes('/assets/logos/') && !img.dataset.triedLocal) {
      img.dataset.triedLocal = '1';
      if (key) localMiss.add(key);
      if (remote) { img.src = remote; return; }
    }
    if (remote && !img.dataset.triedRemote) {
      img.dataset.triedRemote = '1';
      if (key) localMiss.add(key);
      img.src = remote;
      return;
    }
    if (fb && !img.dataset.triedFallback) {
      img.dataset.triedFallback = '1';
      img.src = fb;
      return;
    }
    const sym = wrap?.dataset?.sym;
    if (sym) markLogoFailed(sym);
    else if (key) failedLogos.add(key);
    img.remove();
    wrap?.classList.remove('has-logo');
  };
}

export function logoCount() {
  return Object.keys(LOGO_DOMAINS).filter(k => !k.startsWith('bank:')).length;
}
