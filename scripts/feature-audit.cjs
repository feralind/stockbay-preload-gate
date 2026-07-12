/**
 * Static audit: confirm must-fix / QoL symbols still exist in the tree.
 * Run: node scripts/feature-audit.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const checks = [
  ['Real pending limits', 'js/portfolio.js', [/placeLimitOrder/, /tryFillPendingOrder/, /isLimitMarketable/, /pendingOrders/]],
  ['Order ticket history', 'js/portfolio.js', [/orderTickets/, /ensureOrderTickets/, /markOrderTicketFilled/, /markOrderTicketCancelled/]],
  ['Limit fill tickets', 'js/trade-engine.js', [/markOrderTicketFilled\(state\.portfolio,\s*order,\s*attempt\.fillPrice\)/]],
  ['Trade engine module', 'js/trade-engine.js', [/export function confirmOrder/, /placeLimitOrder/, /buyLong/, /openShort/]],
  ['Trade engine wired from app', 'js/app.js', [/import \{[^}]*confirmOrder(?:Flow)?[^}]*\} from '\.\/trade-engine\.js'/, /confirmOrder(?:Flow)?\(state,/]],
  ['Pending orders UI', 'js/ui/trade.js', [/renderPendingOrders/, /pending-orders/, /ticket\.status !== 'open'/]],
  ['Trade UI module', 'js/ui/trade.js', [/export function renderTradePanel/, /export function openOrderConfirm/, /export function refreshOpenOptionsPanel/]],
  ['Trade wired from ui barrel', 'js/ui.js', [/from '\.\/ui\/trade\.js'/, /renderTradePanel\(state\)/, /renderPendingOrders\(state\)/]],
  ['Short margin-only cash', 'js/portfolio.js', [/Shorts lock margin only/, /portfolio\.cash -= margin/, /getSpendableCash/]],
  ['Save bundle extras', 'js/save-io.js', [/__stockwayBundle/, /stockway-left-sidebar-w/, /stockway_leaderboard_v1/]],
  ['Reset archives Best Runs', 'js/app.js', [/archiveRun/, /Archive & reset/, /clearAllSaveData/]],
  ['Left sidebar resize', 'js/ui.js', [/bindLeftSidebarResize/, /--left-sidebar-w/]],
  ['Left resize CSS', 'css/styles.css', [/sidebar-left-resize/, /--left-sidebar-w/]],
  ['Left resize markup', 'index.html', [/id="sidebar-left-resize"/]],
  ['Achievements render', 'js/ui/achievements.js', [/export function renderAchievements/, /achievements-grid/]],
  ['Achievements wired from ui barrel', 'js/ui.js', [/from '\.\/ui\/achievements\.js'/, /renderAchievements\(state\)/]],
  ['Staff render', 'js/ui/staff.js', [/export function renderStaff/, /staff-hire-list/, /export function showStaffHistory/]],
  ['Staff wired from ui barrel', 'js/ui.js', [/from '\.\/ui\/staff\.js'/, /renderStaff\(state\)/]],
  ['Finance render', 'js/ui/finance.js', [/export function renderFinance/, /bank-list/, /export function setLoanDraftAmount/]],
  ['Finance wired from ui barrel', 'js/ui.js', [/from '\.\/ui\/finance\.js'/, /renderFinance\(state\)/, /setLoanDraftAmount/]],
  ['Watchlist remove', 'js/ui/listings.js', [/removeFromWatchlist/, /watch-remove-btn/]],
  ['Desktop notifications', 'js/app.js', [/new Notification/, /Notification\.requestPermission/]],
  ['Alert trigger history', 'js/ui/listings.js', [/alertHistory/, /recordAlertTrigger/, /renderTriggeredAlerts/, /stockway_alert_history_v1/]],
  ['Alert history save', 'js/app.js', [/alertHistory:\s*getAlertHistory\(\)/, /loadAlertHistory\(data\.alertHistory\)/]],
  ['Alert history UI', 'index.html', [/id="triggered-alerts-list"/]],
  ['Enter confirms order', 'js/overlays.js', [/e\.key === 'Enter'/, /order-confirm-overlay/, /order-confirm-submit/, /INPUT.*TEXTAREA.*SELECT/]],
  ['Hotkeys', 'js/hotkeys.js', [/bindHotkeys/, /onPause/, /RANGE_KEYS/]],
  ['Checkpoints UI', 'js/ui.js', [/checkpoint-list/, /checkpoint-row/]],
  ['Chart loading', 'js/ui/chart-panel.js', [/chart-loading/]],
  ['Glossary tips module', 'js/glossary-tooltips.js', [/export function initGlossaryTooltips/, /export function resyncGlossaryHover/, /data-gloss/, /GLOSS_TIPS/, /trading-halted/]],
  ['Glossary tips wired', 'js/app.js', [/initGlossaryTooltips/]],
  ['Glossary markers in chrome', 'index.html', [/data-gloss="buying-power"/, /data-gloss="feed-status"/, /data-gloss="trading-halted"|data-gloss="market-status"/]],
  ['Options expiry intrinsic align', 'js/portfolio.js', [/daysLeft <= 0/, /optionIntrinsicPerShare/, /Align with settleExpiredOptions/]],
  ['UI smoke script', 'scripts/ui-smoke.cjs', [/playwright/, /forceAdvanceGameDay/, /btn-quick-long/, /hire-btn/, /stockway_onboarded_v1/]],
  ['First-trade walkthrough', 'js/onboarding-walkthrough.js', [/startFirstTradeWalkthrough/, /completeWalkthroughReset/, /archive:\s*false/, /perkCalloutsShown/, /hasClosedWalkthroughPosition/, /btn-quick-sell/, /suggestedTradeReason/]],
  ['Walkthrough reset remounts onboarded', 'js/app.js', [/completeWalkthroughReset/, /startFirstTradeWalkthrough/, /markOnboarded/]],
  ['Coach quiet defers toasts', 'js/notify.js', [/isCoachQuiet/, /deferredNotifications/, /flushDeferredNotifications/, /coach-flags/]],
  ['Coach flags module', 'js/coach-flags.js', [/setWalkthroughActive/, /setPortfolioTourActive/, /isCoachQuietFlags/, /clearCoachFlags/]],
  ['Portfolio tour', 'js/onboarding-walkthrough.js', [/startPortfolioTour/, /portfolioTourShown/, /PORTFOLIO_TOUR_STEPS/, /maybeStartPortfolioTour/]],
  ['Portfolio tour data-tour', 'js/ui/portfolio.js', [/data-tour="equity"/, /data-tour="openPnl"/, /data-tour="realized"/]],
  ['UI smoke npm script', 'package.json', [/"test:ui"/, /ui-smoke\.cjs/, /"test:all"/]],
  ['Hot listings rotation', 'js/ui/listings.js', [/buildHotListingPool/, /slideHotListingWindow/, /startHotListingsRotation/, /pauseHotListingRotation/, /HOT_LISTING_POOL_SIZE|getHotListingPool/]],
  ['Hot listings viewport pool', 'js/ui/listings.js', [/getHotListingPoolSymbols/, /getHotListingPrefetchCandidates|HOT_LISTING_PREFETCH_SIZE/, /getListingsViewportSymbols/]],
  ['AI locked card shared', 'js/ui/ai-advisor.js', [/export function buildAiLockedCardHtml/, /data-ai-locked-card/, /ai-locked-host/]],
  ['AI locked card wired once', 'js/ui/ai-advisor.js', [/buildAiLockedCardHtml\(\)/, /lockedHost\.innerHTML = card/, /ai-chat-log-side/]],
  ['Dashboard relic row', 'js/ui/dashboard.js', [/export function buildFirmRelicRowHtml/, /blackMarketEquippedRelics/, /data-goto="blackmarket"/, /getRelicSlotLimit/, /getBlackMarketItem/]],
];

let failed = 0;
for (const [name, file, patterns] of checks) {
  let src;
  try {
    src = read(file);
  } catch (e) {
    console.log(`FAIL  ${name} — missing file ${file}`);
    failed++;
    continue;
  }
  const missing = patterns.filter((re) => !re.test(src)).map((re) => re.toString());
  if (missing.length) {
    console.log(`FAIL  ${name} — missing ${missing.join(', ')} in ${file}`);
    failed++;
  } else {
    console.log(`PASS  ${name}`);
  }
}

if (failed) {
  console.log(`\n${failed} checks failed`);
  process.exit(1);
}
console.log(`\n${checks.length} feature checks passed`);
