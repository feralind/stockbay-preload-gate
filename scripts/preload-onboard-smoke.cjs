/**
 * Live smoke: preload gate → welcome → first-trade walkthrough on 127.0.0.1
 * Usage: node scripts/preload-onboard-smoke.cjs [baseUrl]
 * Default: http://127.0.0.1:8080
 */
const assert = require('assert');
const path = require('path');

const BASE = process.argv[2] || process.env.STOCKWAY_URL || 'http://127.0.0.1:8080';

async function main() {
  let pw;
  try {
    pw = require('playwright');
  } catch (e) {
    console.error('FAIL  playwright not installed');
    process.exit(1);
  }

  // Probe server
  try {
    const r = await fetch(`${BASE}/api/config`);
    if (!r.ok) throw new Error(`config ${r.status}`);
    console.log(`OK    server ${BASE} →`, await r.text());
  } catch (e) {
    console.error(`FAIL  server not reachable at ${BASE}: ${e.message}`);
    process.exit(1);
  }

  const browser = await pw.chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const log = [];

  const stateOf = async () => page.evaluate(() => {
    const vis = (id) => {
      const el = document.getElementById(id);
      if (!el) return { exists: false, visible: false };
      const hidden = el.classList.contains('hidden');
      const styleHidden = getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden';
      return {
        exists: true,
        hidden,
        visible: !hidden && !styleHidden,
        text: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160),
      };
    };
    return {
      preload: vis('quote-preload-overlay'),
      onboard: vis('onboard-overlay'),
      coach: vis('coachmark-root'),
      suggest: document.querySelectorAll('.suggest-badge').length,
      walkthroughSuggest: document.querySelectorAll('.listing.walkthrough-suggest').length,
      walkthroughActive: !!window.__stockwayWalkthroughActive,
      hasSave: !!localStorage.getItem('stockway_save_v1'),
      onboarded: localStorage.getItem('stockway_onboarded_v1'),
      coachText: document.getElementById('coachmark-text')?.textContent || '',
      onboardNew: document.getElementById('onboard-new')?.textContent || '',
      onboardSkip: document.getElementById('onboard-skip')?.textContent || '',
    };
  });

  try {
    // Fresh install: wipe storage once before first navigation (not on post-tutorial reload)
    await context.addInitScript(() => {
      if (sessionStorage.getItem('__smoke_cleared')) return;
      try {
        localStorage.clear();
        sessionStorage.clear();
        sessionStorage.setItem('__smoke_cleared', '1');
      } catch (_) {}
    });

    console.log('\n--- Fresh boot (cleared localStorage) ---');
    await page.goto(`${BASE}/index.html?smoke=${Date.now()}`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Sample overlay state for ~3s while init runs — preload must win before onboard
    let sawPreloadFirst = false;
    let sawOnboardWhilePreload = false;
    let preloadEverVisible = false;
    let onboardAfterPreload = false;

    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const s = await stateOf();
      log.push({ t: Date.now() - t0, ...s });

      if (s.preload.visible) {
        preloadEverVisible = true;
        if (!sawPreloadFirst && !s.onboard.visible) sawPreloadFirst = true;
        if (s.onboard.visible) sawOnboardWhilePreload = true;
      }
      if (!s.preload.visible && s.onboard.visible) {
        onboardAfterPreload = true;
        break;
      }
      // Offline / fast cache: preload may never show; onboard alone is ok if no save
      if (!s.preload.visible && s.onboard.visible && Date.now() - t0 > 2500) {
        onboardAfterPreload = true;
        break;
      }
      // Click continue if skip appears
      if (s.preload.visible) {
        const skipVisible = await page.locator('#quote-preload-skip:not(.hidden)').isVisible().catch(() => false);
        if (skipVisible) {
          console.log('      clicking Continue anyway…');
          await page.locator('#quote-preload-skip').click();
        }
      }
      await page.waitForTimeout(250);
    }

    const mid = await stateOf();
    console.log('STATE after gate wait:', JSON.stringify({
      preloadVisible: mid.preload.visible,
      onboardVisible: mid.onboard.visible,
      preloadEverVisible,
      sawPreloadFirst,
      sawOnboardWhilePreload,
      onboardAfterPreload,
      onboarded: mid.onboarded,
      hasSave: mid.hasSave,
    }, null, 2));

    assert.equal(sawOnboardWhilePreload, false, 'onboard must NOT show while preload is visible');
    if (preloadEverVisible) {
      assert.ok(sawPreloadFirst, 'preload should appear before onboard');
    }
    assert.ok(mid.onboard.visible || onboardAfterPreload, 'welcome onboard should appear after preload clears');
    assert.match(mid.onboardNew, /first trade|walk me through/i);
    assert.match(mid.onboardSkip, /Skip — I know what I'm doing/i);

    console.log('PASS  preload does not stack under/with onboard; welcome copy OK');

    // Start walkthrough
    await page.locator('#onboard-new').click();
    await page.waitForTimeout(800);

    let walk = await stateOf();
    // Wait for coachmark
    const tw = Date.now();
    while (Date.now() - tw < 8000) {
      walk = await stateOf();
      if (walk.coach.visible || walk.walkthroughActive) break;
      await page.waitForTimeout(200);
    }

    console.log('STATE after I\'m new:', JSON.stringify({
      walkthroughActive: walk.walkthroughActive,
      coachVisible: walk.coach.visible,
      coachText: walk.coachText,
      suggestBadges: walk.suggest,
      suggestListings: walk.walkthroughSuggest,
      onboardVisible: walk.onboard.visible,
    }, null, 2));

    const dbg = await page.evaluate(async () => {
      const mod = await import('/js/onboarding-walkthrough.js');
      const meta = mod.getWalkthroughSuggestMeta();
      const full = document.getElementById('listings-full');
      const listings = [...(full?.querySelectorAll('.listing') || [])].map((el) => el.dataset.sym);
      const viewListings = document.getElementById('view-listings')?.classList.contains('active');
      return {
        meta,
        viewListings,
        listingCount: listings.length,
        listingSyms: listings.slice(0, 12),
        hasSuggestClass: !!full?.querySelector('.walkthrough-suggest'),
        hasSuggestBadge: !!full?.querySelector('.suggest-badge'),
      };
    });
    console.log('DEBUG suggest/listings:', JSON.stringify(dbg, null, 2));

    assert.equal(walk.onboard.visible, false, 'welcome should hide when walkthrough starts');
    assert.ok(walk.walkthroughActive, 'walkthrough flag should be active');
    assert.ok(walk.coach.visible, 'coachmark should be visible');
    assert.ok(
      walk.suggest >= 1 || walk.walkthroughSuggest >= 1,
      `suggested-trade badge must be on a visible listing (badges=${walk.suggest}, suggestClass=${walk.walkthroughSuggest})`,
    );
    console.log('PASS  suggested-trade badge present on listing');
    console.log('PASS  walkthrough starts with coachmark + suggested trade surface');

    const deferredCheck = await page.evaluate(async () => {
      try {
        const flags = await import('/js/coach-flags.js');
        flags.setWalkthroughActive(true);
        const mod = await import('/js/notify.js');
        const before = mod.getDeferredNotificationCount();
        mod.toast('Unlocked: First Flip', { type: 'success' });
        const after = mod.getDeferredNotificationCount();
        const host = document.getElementById('toast-host');
        const visibleToasts = host ? host.querySelectorAll('.toast.show, .toast').length : 0;
        return { ok: true, before, after, visibleToasts, quiet: mod.isCoachQuiet() };
      } catch (e) {
        return { ok: false, err: String(e) };
      }
    });
    console.log('STATE quiet toast:', deferredCheck);
    if (deferredCheck.ok) {
      assert.ok(deferredCheck.quiet, 'quiet mode while walkthrough active');
      assert.ok(deferredCheck.after > deferredCheck.before, 'toast deferred');
      console.log('PASS  achievement-style toast deferred during walkthrough');
    } else {
      console.log('WARN  could not import notify.js in page:', deferredCheck.err);
    }

    // Skip walkthrough to avoid full reset loop hanging the smoke (click Skip on coachmark)
    const skipBtn = page.locator('#coachmark-skip');
    if (await skipBtn.isVisible().catch(() => false)) {
      console.log('      skipping walkthrough (coachmark Skip) — expect remount + reload');
      // Don't wait forever for reload; just confirm click works
      await Promise.race([
        page.waitForNavigation({ timeout: 10000 }).catch(() => null),
        skipBtn.click().then(() => page.waitForTimeout(2500)),
      ]);
    }

    const afterSkip = await stateOf().catch(() => null);
    if (afterSkip) {
      console.log('STATE after skip/reload path:', {
        walkthroughActive: afterSkip.walkthroughActive,
        onboarded: afterSkip.onboarded,
        onboardVisible: afterSkip.onboard?.visible,
        preloadVisible: afterSkip.preload?.visible,
      });
      // After reset+remount, onboarded should be set so tutorial does not infinite-loop
      // (may still see preload on fresh wipe)
      if (afterSkip.onboarded === '1') {
        assert.equal(afterSkip.onboard?.visible, false, 'no infinite onboard loop after skip reset');
        console.log('PASS  skip remounts onboarded — no tutorial loop');
      }
    }

    console.log('\nALL LIVE CHECKS PASSED');
  } catch (e) {
    console.error('\nFAIL ', e.message);
    try {
      console.error('Last state:', JSON.stringify(await stateOf(), null, 2));
    } catch (_) {}
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
