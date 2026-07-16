# StockWay — Agent Notes

StockWay is a single-player paper-trading desk simulator built as an **Electron + vanilla JS** app.
There is no build/bundler step for the app code: `electron/main.cjs` starts an embedded HTTP server
that serves `index.html`, `css/`, and `js/` (ES modules) and proxies live quotes/candles from Yahoo
Finance (Finnhub news is optional). See `README.md` and `FEATURES.md` for gameplay/feature detail.

## Cursor Cloud specific instructions

Environment is Linux; the project itself is Windows-first (the `*.bat`/`*.ps1`/`*.vbs` launchers are
for Windows only — ignore them on this VM and use the npm scripts directly).

### Services / how to run
- **The app** is a single service: `npm start` (= `electron .`). It boots an embedded HTTP server
  (tries ports `3847`, then `8080`, `3848`) and loads it in a BrowserWindow. `curl http://127.0.0.1:3847/api/config`
  confirms the server is up.
- **Rendering caveat (important):** under the VM's Xvfb + software GL, a plain `electron .` renders a
  **completely black window**. Launch on the desktop display with software-GL + X11 flags instead:
  ```
  DISPLAY=:1 LIBGL_ALWAYS_SOFTWARE=1 GALLIUM_DRIVER=llvmpipe npx electron . \
    --no-sandbox --ozone-platform=x11 --disable-gpu --disable-gpu-compositing
  ```
  Even with these flags the software renderer can intermittently blank the window after some
  interaction/navigation. For reliable, headless end-to-end verification prefer the Playwright smoke
  test below rather than driving the Electron window.
- **Browser fallback:** because the app is just a local web app, you can also open
  `http://127.0.0.1:3847/` in Chrome once `npm start` is running (renders reliably on `:1`).
- The `bus.cc ... Failed to connect to the bus` and GPU/SwiftShader lines in Electron's output are
  harmless noise on this VM.

### Lint / test / build (commands live in `package.json`)
- **Tests:** `npm test` runs the pure-Node checks (`quality`, `quotes`, `security`, `audit`).
  `npm run test:ui` runs the Playwright headless UI smoke (boot → buy → watch → hire → advance day),
  and `npm run test:all` runs both. The Playwright Chromium browser is installed by the update script.
- **Typecheck:** there is a `tsconfig.json` with `checkJs`, but `tsc` is **not** wired into any npm
  script and currently reports many pre-existing type warnings on the vanilla JS (`js/ui/trade.js`,
  `js/vault.js`, …). It is not a required gate — treat `npm test` / `npm run test:ui` as the gate.
- **Build** (`npm run build*`) targets Windows via `electron-builder` and is not needed for dev on this VM.

### Misc
- Optional Finnhub news: copy `finnhub.key.example` → `finnhub.key` (gitignored). Quotes work via Yahoo
  without any key; without a key `/api/news` just returns an empty list.
- Game saves live in `localStorage` under `stockway_save_v1`.

### UI — no tick thrash (mandatory)

`renderAll` runs on market ticks. **Never** rewrite a whole interactive panel’s `innerHTML` every tick — that kills hover and causes Estates-style flash/stutter.

- Fingerprint structure only (owned ids, selection, tab/category). **Do not** put live cash / NW / quotes in the snap key.
- Patch numbers with `textContent`; use `setHtmlIfChanged` / `patchEstatesLive` / roster snaps as models.
- Project rule (always on): `.cursor/rules/stockway-ui-no-tick-thrash.mdc`.
- Canonical fix: `js/ui/estates.js`.

### UI — cursor tips (mandatory)

Glossary / Dashboard / Portfolio “Cash” tips must match Achievements: gold-border cursor sheet, instant swap when moving target-to-target, force-hide on every `switchView`.

- Rule (always on): `.cursor/rules/stockway-cursor-tips.mdc`
- Code: `js/glossary-tooltips.js`, `js/ui/achievements.js`, hide calls in `js/ui.js` `switchView`
