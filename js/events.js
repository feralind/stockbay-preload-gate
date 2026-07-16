// @ts-check
import { ALL_SYMBOLS, getSymbolSector } from './symbols.js';
import {
  applyPriceShock, isSymbolHalted, getDayCount, getDayPhase, isMarketOpen,
  installRiskOffOverlay,
} from './market.js';
import { getQuoteCache, fetchMarketNews, isNetworkOnline, pickNewsArticleUrl } from './api.js';
import { CONFIG } from './config.js';
import { applyFedPolicy, macroEventScale } from './macro.js';

/** Simulated desk briefs — headline/teaser always visible; body gated by News Wire. */
const EVENT_TEMPLATES = [
  {
    id: 'fed_hike',
    headline: 'Fed signals another rate hike is on the table',
    teaser: 'Hawkish minutes lift the front end; growth and REITs wobble.',
    body: 'FOMC minutes leaned firmer than futures had priced, with several participants arguing that sticky services inflation still warrants keeping the option of another hike open. The dollar firmed and the curve bear-flattened as traders dialed back near-term cut odds. Liquidity thinned into the close as rate-sensitive names marked lower and banks caught a relative bid on net-interest hopes.',
    whyItMatters: 'Finance can catch a relative bid; tech and REITs typically give back duration premium. Watch JPM/BAC vs. high-multiple software and rate-sensitive property names.',
    lean: 'bearish',
    deskTake: 'Trim crowded long-duration growth; keep dry powder for a dip in quality tech if the hike scare fades.',
    sectors: { finance: 0.03, tech: -0.025, reit: -0.04 },
    global: -0.005,
  },
  {
    id: 'fed_cut',
    headline: 'Fed cuts rates — risk-on bid returns to the tape',
    teaser: 'Policy pivot sparks a broad rally in growth and consumer cyclicals.',
    body: 'The Committee delivered a cut and struck a more balanced tone on the labor market, arguing that progress on inflation now allows a modest easing bias. Equities ripped as real yields eased and the dollar softened. Megacap tech led, while regional banks and homebuilders joined the move. Vol sellers stepped in after the announcement, compressing implieds into the afternoon session.',
    whyItMatters: 'Lower discount rates lift tech multiples; consumer and finance usually participate. NVDA/AAPL-style growth and discretionary names are first-order beneficiaries.',
    lean: 'bullish',
    deskTake: 'Lean into quality growth on pullbacks; avoid chasing the first spike without a stop.',
    sectors: { tech: 0.04, finance: 0.02, consumer: 0.025 },
    global: 0.008,
  },
  {
    id: 'oil_spike',
    headline: 'Middle East tensions send crude sharply higher',
    teaser: 'Energy catches a flight-to-scarcity bid; transports and discretionary lag.',
    body: 'Geopolitical headlines tightened the physical market narrative overnight, with crude ripping through nearby resistance as traders priced a risk premium back into the complex. Integrated majors and E&Ps ripped on the open while airlines and logistics names sold off on fuel-cost fears. Broader risk appetite held up better than in prior flare-ups, but the tape still rotated hard into energy beta.',
    whyItMatters: 'Energy (XOM, CVX) tends to lead; industrials and consumer feel the cost pass-through. Watch crude correlation into the next session.',
    lean: 'mixed',
    deskTake: 'Long energy beta / short fuel-sensitive transports is the clean expression; keep size modest until headlines stabilize.',
    sectors: { energy: 0.08, industrial: -0.02, consumer: -0.015 },
    symbols: { XOM: 0.06, CVX: 0.05 },
  },
  {
    id: 'oil_crash',
    headline: 'OPEC+ production surge floods the oil complex',
    teaser: 'Supply shock knocks energy; consumers and industrials catch a relief bid.',
    body: 'Reports of a larger-than-expected OPEC+ output increase hit the tape before the U.S. open, sending crude into a sharp liquidation. Energy equities gap-down as hedge funds cut long exposure. Downstream and consumer names firmed on the prospect of cheaper input costs, while the broader tape treated the move as a mild disinflation impulse rather than a pure risk-off event.',
    whyItMatters: 'Energy sector under pressure; consumer and industrial names often benefit from lower fuel costs. XOM/CVX-style beta is the direct hit.',
    lean: 'bearish',
    deskTake: 'Fade crowded energy longs; look for consumer discretionary strength if crude stays soft.',
    sectors: { energy: -0.07, consumer: 0.02, industrial: 0.01 },
  },
  {
    id: 'ai_boom',
    headline: 'AI chip demand surges as hyperscalers raise capex',
    teaser: 'Semiconductor complex rips; NVDA and peers lead the risk-on tape.',
    body: 'Fresh commentary from major cloud providers pointed to another leg higher in AI infrastructure spend, with GPU lead times still extended. Semiconductor names ripped as the desk repriced near-term earnings power for the AI supply chain. Broader tech participated, though some software lagged as capital continues to concentrate in hardware and foundry winners. Options flow skewed call-heavy into the close.',
    whyItMatters: 'Tech sector lift with outsized moves in NVDA, AMD, and AVGO. Adjacent software can lag if spend stays hardware-heavy.',
    lean: 'bullish',
    deskTake: 'Ride the AI complex but respect gap risk — scale in, don’t all-in the open print.',
    sectors: { tech: 0.05 },
    symbols: { NVDA: 0.08, AMD: 0.06, AVGO: 0.04 },
  },
  {
    id: 'bank_stress',
    headline: 'Regional bank stress tests flash fresh cracks',
    teaser: 'Finance sells off as deposit and credit-quality worries resurface.',
    body: 'A cluster of weaker-than-expected stress outcomes and renewed deposit-flight chatter hit regional banks hard, dragging the broader financials complex. Megabanks held up relatively better but still marked lower on contagion fears. Credit spreads whispered wider and the desk cut financial beta into strength. Liquidity in smaller names thinned quickly — classic stress-tape behavior.',
    whyItMatters: 'Finance sector pressure; JPM may hold up better than BAC and regionals. Watch for spillover into REITs and high-yield credit proxies.',
    lean: 'bearish',
    deskTake: 'Reduce financial beta; prefer quality megabanks over regionals if you must stay long the sector.',
    sectors: { finance: -0.05 },
    symbols: { JPM: -0.02, BAC: -0.04 },
  },
  {
    id: 'pandemic',
    headline: 'New virus variant prompts travel restrictions',
    teaser: 'Airlines and leisure sell off; healthcare catches a defensive bid.',
    body: 'Health authorities flagged a faster-spreading variant and several hubs announced tighter screening, knocking travel and leisure names. Airlines led the downside while hotel and cruise proxies followed. Vaccine and therapeutics names bid as traders reached for a familiar hedge. The broader market treated it as a sector rotation rather than a full risk-off event — for now.',
    whyItMatters: 'Telecom/travel soft; healthcare firm. DAL and UAL are direct hits; PFE-style names can catch a hedge bid.',
    lean: 'mixed',
    deskTake: 'Short travel / long select healthcare is the textbook pair until restriction headlines cool.',
    sectors: { telecom: -0.03, healthcare: 0.04, consumer: -0.02 },
    symbols: { DAL: -0.08, UAL: -0.07, PFE: 0.05 },
  },
  {
    id: 'china_tariff',
    headline: 'US–China tariff escalation rattles supply chains',
    teaser: 'Tech hardware and industrials mark down on trade-war premium.',
    body: 'Fresh tariff threats and retaliatory rhetoric hit overnight, sending Asia-exposed manufacturers and semiconductor supply-chain names lower into the U.S. open. Importers faced margin-compression chatter while domestic industrials saw a mixed tape. The dollar firmed as risk appetite cooled. Desk chatter focused on who can pass costs through versus who eats the tariff.',
    whyItMatters: 'Tech, industrials, and materials typically absorb the hit. Hardware and China-revenue names are first-order risk.',
    lean: 'bearish',
    deskTake: 'Cut Asia-supply-chain beta; wait for a clearer policy path before re-adding industrial cyclicals.',
    sectors: { tech: -0.04, industrial: -0.03, materials: -0.025 },
  },
  {
    id: 'jobs_beat',
    headline: 'Jobs report crushes expectations — soft-landing narrative intact',
    teaser: 'Strong payrolls lift consumer and finance; growth stays bid.',
    body: 'Nonfarm payrolls and wage data came in hotter than consensus without fully reigniting inflation panic, reinforcing the soft-landing camp. Equities bid as recession odds were dialed down; banks and discretionary names led. Rates moved higher but risk assets digested the print as “good growth” rather than a pure hawkish shock. Breadth improved into the afternoon.',
    whyItMatters: 'Consumer and finance catch the growth bid; broad market usually firms. Watch whether hotter wages reprice the Fed path later in the week.',
    lean: 'bullish',
    deskTake: 'Add cyclical and financial exposure on dips; keep an eye on the next inflation print.',
    sectors: { consumer: 0.02, finance: 0.015 },
    global: 0.006,
  },
  {
    id: 'inflation_hot',
    headline: 'CPI prints hotter than expected — duration under pressure',
    teaser: 'Sticky inflation hits rate-sensitive names; energy firms on the print.',
    body: 'Core CPI surprised to the upside, driven by services and shelter components that refuse to cool on schedule. Real yields jumped and growth multiples compressed as traders pushed out cut expectations. Energy caught a relative bid on the inflation impulse while discretionary and high-duration tech sold first. The session had a classic “hot print” rotation feel.',
    whyItMatters: 'Finance and consumer face rate-path pressure; energy can firm. Long-duration tech is the usual casualty.',
    lean: 'bearish',
    deskTake: 'Reduce duration-heavy longs; energy and short-duration value are the relative shelters.',
    sectors: { finance: -0.02, consumer: -0.025, energy: 0.03 },
  },
  {
    id: 'crypto_crash',
    headline: 'Crypto liquidation cascade hits exchange and fintech names',
    teaser: 'Forced selling ripples into COIN, HOOD, and crypto-adjacent fintech.',
    body: 'A sharp move in major tokens triggered cascading liquidations across perpetual venues, spilling into listed crypto proxies and retail-brokerage names with digital-asset exposure. Equity desks treated it as a contained risk-off pocket rather than a broad credit event, but beta to crypto still got marked hard. Funding rates reset and call-buying dried up into the close.',
    whyItMatters: 'Direct hits on COIN, HOOD, and SQ-style fintech. Broader market impact is usually limited unless credit stress appears.',
    lean: 'bearish',
    deskTake: 'Avoid catching the crypto-proxy knife; wait for liquidation metrics to stabilize before nibbling.',
    symbols: { COIN: -0.12, HOOD: -0.05, SQ: -0.04 },
  },
  {
    id: 'ev_subsidy',
    headline: 'EV tax credits expanded in new policy package',
    teaser: 'Auto makers and EV leaders catch a policy-tailwind bid.',
    body: 'Lawmakers advanced a package that widens consumer EV tax credits and clarifies eligibility for popular models, lifting the entire EV complex. Tesla led on volume while legacy OEMs with electrification roadmaps participated. Supply-chain names mixed as traders debated whether demand pull-forward helps near-term deliveries or just steals from next quarter. Options skew flipped call-friendly in the group.',
    whyItMatters: 'TSLA, F, and GM are the cleanest expressions. Watch whether the bid spills into battery and charging names.',
    lean: 'bullish',
    deskTake: 'Add EV exposure on any fade of the headline spike; policy tails can run longer than one session.',
    symbols: { TSLA: 0.06, F: 0.04, GM: 0.03 },
  },
  {
    id: 'semiconductor_export',
    headline: 'New chip export curbs tighten the AI supply narrative',
    teaser: 'Export-control chatter hits semis; domestic foundry names mixed.',
    body: 'Reports of tighter export licensing for advanced AI accelerators hit semiconductor names with China exposure, while some domestic equipment and foundry names saw a mixed tape as traders debated share shifts. The move revived the “decoupling premium” that has haunted the group on prior policy days. Liquidity thinned in second-tier names as desks cut gross.',
    whyItMatters: 'Tech/semiconductor complex under policy risk. NVDA-supply-chain names can gap; watch for rotation into domestic-only stories.',
    lean: 'bearish',
    deskTake: 'Cut China-revenue semi beta; wait for official text before re-risking the AI complex.',
    sectors: { tech: -0.035 },
    symbols: { NVDA: -0.04, AMD: -0.03, AVGO: -0.025 },
  },
  {
    id: 'pharma_fda',
    headline: 'FDA greenlights a high-profile therapy — healthcare bid',
    teaser: 'Drug-approval headline lifts healthcare; biotech beta wakes up.',
    body: 'Regulators approved a closely watched therapy sooner than the base case, sending the sponsor and peer-group names higher as traders repriced pipeline optionality. Broader healthcare caught a sympathetic bid while rate-sensitive growth was quiet. The desk framed it as a one-name catalyst with sector spillover rather than a macro regime shift.',
    whyItMatters: 'Healthcare sector firm; PFE and large-cap pharma can participate on sentiment even when they are not the sponsor.',
    lean: 'bullish',
    deskTake: 'Lean long healthcare beta into the session; fade only if the move looks purely single-name.',
    sectors: { healthcare: 0.035 },
    symbols: { PFE: 0.04, JNJ: 0.02, UNH: 0.015 },
  },
  {
    id: 'retail_miss',
    headline: 'Major retailers miss on guidance — consumer caution rises',
    teaser: 'Discretionary names sell off as the consumer softens at the margin.',
    body: 'A pair of large retailers cut forward guidance, citing a more cautious shopper and higher promotional intensity. Discretionary equities sold first; staples held up better as a relative shelter. Credit-card spend commentary reinforced the “trading down” narrative. The tape treated it as a consumer-health signal more than a one-off inventory story.',
    whyItMatters: 'Consumer discretionary under pressure; staples and selective value may hold up. Watch WMT/TGT-style names and related suppliers.',
    lean: 'bearish',
    deskTake: 'Reduce discretionary beta; prefer staples or quality balance sheets until guidance stabilizes.',
    sectors: { consumer: -0.03 },
    symbols: { AMZN: -0.02, WMT: -0.015, TGT: -0.04 },
  },
  {
    id: 'infra_bill',
    headline: 'Infrastructure spend package advances — industrials catch a bid',
    teaser: 'Policy progress lifts construction, materials, and heavy equipment.',
    body: 'A bipartisan infrastructure package cleared a key procedural hurdle, lifting industrials and materials on the prospect of multi-year project pipelines. Equipment makers and engineering names led while the broader market was only mildly higher. Traders debated timing — authorization versus actual appropriations — but the session bid treated the headline as a medium-term positive for the complex.',
    whyItMatters: 'Industrials and materials are the direct beneficiaries. CAT-style cyclicals and materials names tend to lead the move.',
    lean: 'bullish',
    deskTake: 'Add industrial/materials exposure on dips; don’t overpay the first green candle.',
    sectors: { industrial: 0.035, materials: 0.03 },
  },
  {
    id: 'housing_rates',
    headline: 'Mortgage rates jump — housing and REITs take the hit',
    teaser: 'Higher financing costs pressure homebuilders, big-box housing, and property names.',
    body: 'A sharp move in mortgage quotes forced the desk to reprice the housing complex. Home-improvement and builder-adjacent names sold first as rate locks looked less friendly; listed REITs followed on duration and cap-rate chatter. Banks were mixed — net interest hopes versus credit-quality worry. The tape treated it as a rates story, not a broad risk-off event.',
    whyItMatters: 'REITs and consumer housing proxies (HD, LOW) are first-order. Magnitude scales with how far Fed funds sit from normal.',
    lean: 'bearish',
    deskTake: 'Cut rate-sensitive property and housing beta; wait for the rate path to stabilize before re-adding.',
    sectors: { reit: -0.045, consumer: -0.02 },
    symbols: { HD: -0.035, LOW: -0.03, DHI: -0.04 },
    macroScale: true,
  },
  {
    id: 'megacap_miss',
    headline: 'Megacap guidance cut shakes the growth complex',
    teaser: 'A flagship tech miss spills into peers; the AI trade wobbles for a session.',
    body: 'A large-cap technology name cut forward guidance after the bell narrative leaked into the cash session, sending the stock sharply lower and dragging peer multiples. Traders debated company-specific execution versus a broader demand soft-patch. Semis and software marked down together into the afternoon, then partially bounced as dip-buyers stepped in.',
    whyItMatters: 'AAPL/MSFT-style names can move the whole tech tape. Soft spillover — not every peer deserves the same haircut.',
    lean: 'bearish',
    deskTake: 'Fade the first panic in quality peers; respect gap risk in the headline name itself.',
    sectors: { tech: -0.03 },
    symbols: { AAPL: -0.055, MSFT: -0.04, GOOGL: -0.025 },
  },
  {
    id: 'cyber_outage',
    headline: 'Major cloud outage knocks a tech leader offline',
    teaser: 'Single-name cyber/ops shock; peers mixed as traders sort contagion from noise.',
    body: 'A high-profile outage at a major platform company hit customer traffic and ad-monetization chatter within minutes. The name sold hard while peers split — some as sympathy shorts, others as relative beneficiaries of diverted spend. The desk framed it as an ops event first, a sector thesis second.',
    whyItMatters: 'Direct hit on the outage name; broader tech only if the story spreads. Keep size small until uptime updates.',
    lean: 'bearish',
    deskTake: 'Avoid catching the knife in the headline name; peer weakness is often overdone.',
    symbols: { META: -0.06, AMZN: -0.02, MSFT: -0.015 },
  },
  {
    id: 'ma_rumor',
    headline: 'M&A chatter lifts a rumored target — acquirer soft',
    teaser: 'Classic deal tape: target bids, potential buyer marks down on dilution talk.',
    body: 'Unconfirmed deal talk around a mid-cap name sent the stock ripping on volume while a larger peer flagged as a possible acquirer slipped on leverage and dilution chatter. Options desks marked call-heavy in the target. Compliance notes reminded the floor that rumor ≠ deal — but the tape still printed the classic pair.',
    whyItMatters: 'Long the rumored target / respectful of acquirer weakness is the textbook expression until filings appear.',
    lean: 'mixed',
    deskTake: 'Trade the target with a tight stop; fade the acquirer only if the story firms.',
    symbols: { CRM: 0.05, ORCL: -0.025, ADBE: 0.02 },
  },
  {
    id: 'labor_strike',
    headline: 'Labor strike threat hits transports and heavy industry',
    teaser: 'Walkout risk pressures airlines, rails, and select industrials.',
    body: 'Union negotiations broke down overnight, raising the odds of a near-term walkout across a transport corridor. Airlines and rails sold on volume; equipment and logistics names followed. Broader industrials were softer but not in freefall — the desk treated it as a sector hit with timeline risk more than a macro regime shift.',
    whyItMatters: 'DAL/UAL/UNP-style transports are the cleanest shorts until talks resume.',
    lean: 'bearish',
    deskTake: 'Reduce transport beta; look for resolution headlines before covering.',
    sectors: { industrial: -0.035 },
    symbols: { DAL: -0.05, UAL: -0.045, UNP: -0.03, CAT: -0.02 },
  },
  {
    id: 'drought_ag',
    headline: 'Severe drought lifts food-cost worries — staples mixed',
    teaser: 'Ag input stress; packaged food and restaurant names reprice margins.',
    body: 'Crop-condition reports pointed to a deeper drought across key growing regions, lifting grain futures and forcing the desk to revisit margin assumptions for packaged foods and restaurant chains. Some staples caught a defensive bid; others sold on cost-pass-through risk. It read as an input-cost story more than a risk-off event.',
    whyItMatters: 'Food / consumer staples (KO, MDLZ, CMG) feel the margin squeeze; watch which names can raise prices.',
    lean: 'mixed',
    deskTake: 'Prefer pricing-power staples; fade high-input restaurant names until weather stabilizes.',
    sectors: { food: -0.025, consumer: -0.015 },
    symbols: { KO: -0.015, MDLZ: -0.025, CMG: -0.03, HSY: -0.02 },
  },
  {
    id: 'recession_scare',
    headline: 'Recession scare hits cyclicals — flight to quality',
    teaser: 'Soft data spike sends risk-off through finance and discretionary.',
    body: 'A cluster of soft activity prints reignited recession chatter, sending cyclicals and financials lower while a handful of defensive names held up. Credit spreads whispered wider and the desk cut gross into strength. Breadth deteriorated into the close — classic scare-tape behavior that often fades if the next print stabilizes.',
    whyItMatters: 'Finance and consumer cyclicals lead the downside. Risk-off can make the tape feel nastier for a few hours even on a trend day.',
    lean: 'bearish',
    deskTake: 'Reduce cyclical beta; keep powder for a washout bounce if the scare looks overdone.',
    sectors: { finance: -0.035, consumer: -0.03 },
    global: -0.008,
    riskOffOverlay: true,
  },
  {
    id: 'dollar_spike',
    headline: 'Dollar spike pressures international and materials',
    teaser: 'Strong greenback hits overseas earners and commodity-linked names.',
    body: 'A sharp dollar rally forced multilinationals and materials lower as traders repriced overseas revenue and commodity demand. Domestic defensives held up better. The move tracked the rate differential story — stronger when policy is already far from normal.',
    whyItMatters: 'International ADRs and materials are first-order. Shock size scales with Fed distance from baseline.',
    lean: 'bearish',
    deskTake: 'Cut dollar-sensitive internationals; wait for FX to stabilize before re-adding materials.',
    sectors: { international: -0.04, materials: -0.03 },
    symbols: { BABA: -0.035, RIO: -0.03, VALE: -0.03 },
    macroScale: true,
  },
  {
    id: 'guidance_raise',
    headline: 'Mid-session guidance raise lights up a liquid leader',
    teaser: 'Company lifts outlook into the cash session — peers catch a sympathy bid.',
    body: 'A widely held growth name raised full-year guidance during market hours, sending the stock through resistance on heavy volume. Peer names participated on sympathy, then faded as traders sorted company-specific strength from sector beta. Options flow flipped call-heavy into the close.',
    whyItMatters: 'Clean single-name catalyst with mild sector spillover. Don’t confuse one print with a regime change.',
    lean: 'bullish',
    deskTake: 'Ride the headline name with a trailing stop; fade peer chase that lacks a catalyst.',
    sectors: { tech: 0.015 },
    symbols: { NVDA: 0.045, AMD: 0.025 },
  },
  {
    id: 'sec_probe',
    headline: 'SEC probe chatter hits a finance name',
    teaser: 'Regulatory overhang; the complex softens but the direct hit is single-name.',
    body: 'Reports of a preliminary regulatory inquiry into a large financial institution weighed on the stock and nudged the broader finance tape lower. Compliance desks flagged headline risk into the next filing window. Megabank peers held up relatively better than the named name.',
    whyItMatters: 'Direct hit on the probed ticker; sector spillover is usually limited unless the story widens.',
    lean: 'bearish',
    deskTake: 'Cut the headline name; keep quality megabank exposure unless contagion shows up in credit.',
    sectors: { finance: -0.015 },
    symbols: { BAC: -0.05, JPM: -0.015, GS: -0.02 },
  },
];

/** @typedef {{ id: string, headline: string, teaser?: string, body?: string, whyItMatters?: string, lean?: string, deskTake?: string, sectors?: Record<string, number>, symbols?: Record<string, number>, global?: number, macroScale?: boolean, riskOffOverlay?: boolean }} EventTemplate */

export const FED_ANTIFLIP_DAYS = 3;
export const MAX_EVENTS_PER_GAME_DAY = 4;
/** Single-event shock cap — stacks across templates share MAX_DAILY_SHOCK_PCT via countDaily. */
export const MAX_EVENT_SHOCK_PCT = 0.05;

let activeEvents = [];
let pendingInsiderTips = [];
let eventInterval = null;
const listeners = new Set();

/** Template id -> last game day fired (for cooldown / prefer-fresh). */
const lastFiredDayByTemplate = new Map();
/** Antiflip: after fed_hike, block fed_cut until this game day (exclusive), and vice versa. */
let fedBlockUntil = { hike: 0, cut: 0 };
let eventsFiredThisGameDay = 0;
let eventsDayStamp = 1;
/** Major template ids that printed today (for day-end lesson line). */
let majorEventsToday = [];
/** Symbols skipped because halted during the last applyEvent (tests — never queued). */
let lastSkippedHalted = [];

export function onEvent(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(event) {
  listeners.forEach(fn => fn(event));
}

export function getEventTemplates() {
  return EVENT_TEMPLATES;
}

export function getMajorEventsToday() {
  return [...majorEventsToday];
}

export function getLastSkippedHaltedSymbols() {
  return [...lastSkippedHalted];
}

/** Call on game-day roll so pacing counters reset. */
export function resetDayEventCounters(gameDay = 1) {
  const day = Math.max(1, Math.floor(Number(gameDay) || 1));
  eventsDayStamp = day;
  eventsFiredThisGameDay = 0;
  majorEventsToday = [];
  lastSkippedHalted = [];
}

function ensureEventDay(gameDay) {
  const day = Math.max(1, Math.floor(Number(gameDay) || 1));
  if (eventsDayStamp !== day) resetDayEventCounters(day);
}

/**
 * Phase-weighted chance to roll a world event this tick (game clock).
 * Soft-caps at MAX_EVENTS_PER_GAME_DAY.
 */
export function eventRollChance(phase, gameDay = 1) {
  ensureEventDay(gameDay);
  if (eventsFiredThisGameDay >= MAX_EVENTS_PER_GAME_DAY) return 0;
  const p = String(phase || '');
  if (p === 'Morning') return 0.22;
  if (p === 'Afternoon') return 0.16;
  if (p === 'Pre-Market' || p === 'Evening') return 0.08;
  return 0.05;
}

function isFedBlocked(templateId, gameDay) {
  if (templateId === 'fed_cut' && gameDay < fedBlockUntil.cut) return true;
  if (templateId === 'fed_hike' && gameDay < fedBlockUntil.hike) return true;
  return false;
}

/**
 * Weighted pick: prefer templates not fired recently; respect Fed antiflip.
 * @param {number} gameDay
 * @param {() => number} [rng]
 */
export function pickWeightedEvent(gameDay = 1, rng = Math.random) {
  const day = Math.max(1, Math.floor(Number(gameDay) || 1));
  const roll = typeof rng === 'function' ? rng : Math.random;
  const pool = EVENT_TEMPLATES.filter((t) => !isFedBlocked(t.id, day));
  const list = pool.length ? pool : EVENT_TEMPLATES;
  const weights = list.map((t) => {
    const last = lastFiredDayByTemplate.get(t.id);
    if (last == null) return 3;
    const age = day - last;
    if (age <= 0) return 0.15;
    if (age === 1) return 0.45;
    if (age <= 3) return 1;
    return 2.2;
  });
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let r = roll() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

function pickRandomEvent() {
  return pickWeightedEvent(1, Math.random);
}

/** Symbols an event would try to shock (before halt skip). */
export function eventAffectedSymbols(evt) {
  const out = new Set();
  if (evt?.symbols) {
    Object.keys(evt.symbols).forEach((s) => out.add(String(s).toUpperCase()));
  }
  if (evt?.sectors) {
    Object.keys(evt.sectors).forEach((sector) => {
      ALL_SYMBOLS.filter((s) => getSymbolSector(s) === sector).forEach((sym) => out.add(sym));
    });
  }
  if (evt?.global) {
    getQuoteCache().forEach((_, sym) => out.add(String(sym).toUpperCase()));
  }
  return [...out];
}

/**
 * Pure-ish book check for UI “touches your book” chip.
 * @param {object} evt
 * @param {object} portfolio
 */
export function eventTouchesBook(evt, portfolio = {}) {
  const held = new Set();
  Object.keys(portfolio.longs || {}).forEach((s) => {
    if (portfolio.longs[s]?.shares > 0) held.add(String(s).toUpperCase());
  });
  Object.keys(portfolio.shorts || {}).forEach((s) => {
    if (portfolio.shorts[s]?.shares > 0) held.add(String(s).toUpperCase());
  });
  (portfolio.options || []).forEach((o) => {
    if (o?.sym) held.add(String(o.sym).toUpperCase());
  });
  if (!held.size) return false;
  return eventAffectedSymbols(evt).some((s) => held.has(s));
}

function noteTemplateFired(templateId, gameDay) {
  const day = Math.max(1, Math.floor(Number(gameDay) || 1));
  lastFiredDayByTemplate.set(templateId, day);
  if (templateId === 'fed_hike') fedBlockUntil.cut = day + FED_ANTIFLIP_DAYS;
  if (templateId === 'fed_cut') fedBlockUntil.hike = day + FED_ANTIFLIP_DAYS;
  const major = new Set([
    'fed_hike', 'fed_cut', 'oil_spike', 'oil_crash', 'recession_scare',
    'housing_rates', 'dollar_spike', 'bank_stress', 'inflation_hot',
  ]);
  if (major.has(templateId) && !majorEventsToday.includes(templateId)) {
    majorEventsToday.push(templateId);
  }
}

/**
 * Apply shocks. Halts are skipped (never queued). Multi-template stack shares daily ±10% budget.
 * @returns {{ applied: string[], skippedHalted: string[] }}
 */
export function applyEvent(evt) {
  const templateId = evt.templateId || evt.id || '';
  let scale = 1;
  if (templateId === 'fed_hike') {
    applyFedPolicy('hike');
    scale = macroEventScale('fed_hike');
  } else if (templateId === 'fed_cut') {
    applyFedPolicy('cut');
    scale = macroEventScale('fed_cut');
  } else {
    scale = macroEventScale(templateId, !!evt.macroScale);
  }

  const shocks = new Map();
  const add = (sym, pct) => {
    const key = String(sym || '').toUpperCase();
    if (!key || !Number.isFinite(pct) || pct === 0) return;
    shocks.set(key, (shocks.get(key) || 0) + pct);
  };

  if (evt.global) {
    getQuoteCache().forEach((_, sym) => add(sym, evt.global * scale));
  }
  if (evt.sectors) {
    Object.entries(evt.sectors).forEach(([sector, pct]) => {
      ALL_SYMBOLS.filter((s) => getSymbolSector(s) === sector).forEach((sym) => {
        add(sym, pct * scale);
      });
    });
  }
  if (evt.symbols) {
    Object.entries(evt.symbols).forEach(([sym, pct]) => add(sym, pct * scale));
  }

  const applied = [];
  const skippedHalted = [];
  for (const [sym, pct] of shocks) {
    // Skip halted — do NOT queue a deferred shock (would front-run the lift).
    if (isSymbolHalted(sym)) {
      skippedHalted.push(sym);
      continue;
    }
    const capped = Math.max(-MAX_EVENT_SHOCK_PCT, Math.min(MAX_EVENT_SHOCK_PCT, pct));
    applyPriceShock(sym, capped, { maxPct: MAX_EVENT_SHOCK_PCT, countDaily: true });
    applied.push(sym);
  }
  lastSkippedHalted = skippedHalted;

  // Silent risk-off overlay — never flips day's tapeRegime; no UI disclosure.
  if (templateId === 'recession_scare') {
    installRiskOffOverlay({ gameMinutes: 150, betaNudge: -0.28, noisePad: 0.00018 });
  } else if (evt.riskOffOverlay || (evt.lean === 'bearish' && (evt.global || 0) <= -0.006)) {
    installRiskOffOverlay({ gameMinutes: 120, betaNudge: -0.22, noisePad: 0.00015 });
  }

  return { applied, skippedHalted };
}

function enrichSimEvent(template) {
  const headline = template.headline || template.title || 'Market event';
  return {
    ...template,
    headline,
    title: headline,
    teaser: template.teaser || '',
    body: template.body || '',
    whyItMatters: template.whyItMatters || template.impact || '',
    lean: template.lean || 'mixed',
    deskTake: template.deskTake || template.leanTake || '',
    source: template.source || 'Simulated desk',
  };
}

export function triggerEvent(template, insiderEarly = false, gameDay = null) {
  const day = Math.max(1, Math.floor(Number(gameDay) || getDayCount() || 1));
  ensureEventDay(day);
  const base = enrichSimEvent(template);
  const evt = {
    ...base,
    templateId: template.id,
    id: `${template.id}_${Date.now()}`,
    timestamp: Date.now(),
    insiderEarly,
    applied: false,
    real: false,
    simulated: true,
  };
  if (insiderEarly) {
    pendingInsiderTips.push({ ...evt, revealAt: Date.now() + 60000, _gameDay: day });
    emit({ type: 'insider_tip', event: evt });
  } else {
    activeEvents.unshift(evt);
    if (activeEvents.length > 15) activeEvents.pop();
    applyEvent(evt);
    evt.applied = true;
    noteTemplateFired(template.id, day);
    eventsFiredThisGameDay += 1;
    emit({ type: 'world_event', event: evt });
  }
  return evt;
}

export function tickEvents(hasInsider, hasNewsWire) {
  const day = getDayCount();
  ensureEventDay(day);
  const phase = getDayPhase();

  const now = Date.now();
  pendingInsiderTips = pendingInsiderTips.filter((tip) => {
    if (now >= tip.revealAt) {
      activeEvents.unshift(tip);
      applyEvent(tip);
      tip.applied = true;
      if (tip.templateId) {
        noteTemplateFired(tip.templateId, tip._gameDay || day);
        eventsFiredThisGameDay += 1;
      }
      emit({ type: 'world_event', event: tip });
      return false;
    }
    return true;
  });

  // Game-clock pacing (not raw wall-clock spam). Soft-capped per game day.
  if (!isMarketOpen() && phase !== 'Pre-Market' && phase !== 'Evening') return;
  const chance = eventRollChance(phase, day);
  if (chance <= 0 || Math.random() >= chance) return;

  const tmpl = pickWeightedEvent(day);
  let early = false;
  if (hasInsider && Math.random() < 0.6) early = true;
  else if (hasNewsWire && Math.random() < 0.45) early = true;
  triggerEvent(tmpl, early, day);
}

/** Test helper — reset antiflip / cooldown maps. */
export function resetEventEngineStateForTests() {
  lastFiredDayByTemplate.clear();
  fedBlockUntil = { hike: 0, cut: 0 };
  resetDayEventCounters(1);
  activeEvents = [];
  pendingInsiderTips = [];
  lastSkippedHalted = [];
}

export async function pollRealNews(hasNewsWire) {
  if (!isNetworkOnline()) return;
  const news = await fetchMarketNews();
  if (!news?.length) return;
  const item = news[Math.floor(Math.random() * Math.min(5, news.length))];
  const headline = item.headline || item.summary || 'Market news';
  const sectorGuess = guessSectorFromHeadline(headline);
  const pct = (Math.random() - 0.4) * 0.06;
  const summary = (item.summary || '').trim();
  const articleUrl = pickNewsArticleUrl(item);
  const teaser = summary && summary !== headline
    ? summary.slice(0, 160)
    : '';
  const evt = {
    id: `news_${item.id || Date.now()}`,
    headline: headline.slice(0, 120),
    title: headline.slice(0, 120),
    teaser,
    body: '',
    whyItMatters: articleUrl
      ? (sectorGuess
        ? `Live wire may move ${sectorGuess} names — open the source article for the full story.`
        : 'Live wire headline — open the source article for details.')
      : (sectorGuess
        ? `Live wire may move ${sectorGuess} names (no article URL from provider).`
        : 'Live wire headline — provider did not supply an article URL.'),
    lean: pct >= 0.01 ? 'bullish' : pct <= -0.01 ? 'bearish' : 'mixed',
    deskTake: '',
    source: item.source || 'Finnhub',
    sectors: sectorGuess ? { [sectorGuess]: pct } : {},
    global: sectorGuess ? 0 : pct * 0.3,
    timestamp: Date.now(),
    real: true,
    simulated: false,
    url: articleUrl,
  };
  if (hasNewsWire) {
    pendingInsiderTips.push({ ...evt, revealAt: Date.now() + 120000 });
    emit({ type: 'insider_tip', event: evt });
  } else {
    activeEvents.unshift(evt);
    applyEvent(evt);
    emit({ type: 'world_event', event: evt });
  }
}

function guessSectorFromHeadline(text) {
  const t = text.toLowerCase();
  if (/oil|opec|energy|gas/.test(t)) return 'energy';
  if (/fed|rate|bank|inflation|cpi/.test(t)) return 'finance';
  if (/ai|chip|nvidia|tech|software/.test(t)) return 'tech';
  if (/pharma|fda|drug|health/.test(t)) return 'healthcare';
  if (/tariff|trade|china/.test(t)) return 'industrial';
  return null;
}

export function getActiveEvents() {
  return activeEvents;
}

export function getPendingInsiderTips() {
  return pendingInsiderTips;
}

let newsInterval = null;

export function startEventEngine(hasInsider, hasNewsWire, restart = false) {
  if (restart) {
    if (eventInterval) clearInterval(eventInterval);
    if (newsInterval) clearInterval(newsInterval);
    eventInterval = null;
    newsInterval = null;
  }
  if (eventInterval) return;
  eventInterval = setInterval(() => {
    tickEvents(hasInsider, hasNewsWire);
  }, 45000);
  newsInterval = setInterval(() => pollRealNews(hasNewsWire), CONFIG.NEWS_REFRESH_MS);
}

export function generateListingHint(listing, hasInsider, rng = Math.random) {
  if (!hasInsider || !listing) return null;
  const px = Number(listing.price) || 0;
  const tv = Number(listing.trueValue) || px;
  if (!(px > 0)) return null;

  const edge = tv - px;
  const trueSignal = edge > px * 0.05 ? 'buy'
    : edge < -px * 0.05 ? 'sell'
      : 'fair';

  // Edge, not omniscience: ~70% correct, ~20% wrong, ~10% vague
  const roll = typeof rng === 'function' ? rng() : Math.random();
  let signal = trueSignal;
  if (roll > 0.70 && roll <= 0.90) {
    if (trueSignal === 'fair') signal = roll < 0.80 ? 'buy' : 'sell';
    else signal = trueSignal === 'buy' ? 'sell' : 'buy';
  } else if (roll > 0.90) {
    return 'Insider: mixed chatter — conviction low';
  }

  if (signal === 'buy') return 'Insider: underpriced — lean long (unverified)';
  if (signal === 'sell') return 'Insider: overpriced — lean avoid/short (unverified)';
  return 'Insider: near fair value — low edge';
}

/**
 * Noisy fair-value estimate for the order modal — usually near truth, sometimes off.
 */
export function estimateInsiderFairValue(listing, rng = Math.random) {
  if (!listing) return null;
  const px = Number(listing.price) || 0;
  const tv = Number(listing.trueValue) || px;
  if (!(tv > 0)) return px;
  const roll = typeof rng === 'function' ? rng() : Math.random();
  if (roll < 0.7) {
    const noise = (roll - 0.35) * 0.06 * tv; // roughly ±2–3%
    return Math.max(0.01, +(tv + noise).toFixed(2));
  }
  // Misleading pull toward/through the listing price
  const wrong = px + ((roll - 0.85) * 0.2) * px;
  return Math.max(0.01, +wrong.toFixed(2));
}
