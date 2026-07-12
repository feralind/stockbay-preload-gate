// @ts-check
/**
 * Coach quiet-mode flags (first-trade walkthrough / portfolio tour).
 * Replaces window.__stockwayWalkthroughActive / __stockwayPortfolioTourActive
 * for in-module use. Window mirrors kept only for any external smoke hooks.
 */

let walkthroughActive = false;
let portfolioTourActive = false;

function syncWindow() {
  if (typeof window === 'undefined') return;
  window.__stockwayWalkthroughActive = walkthroughActive;
  window.__stockwayPortfolioTourActive = portfolioTourActive;
}

export function isWalkthroughFlag() {
  return walkthroughActive;
}

export function isPortfolioTourFlag() {
  return portfolioTourActive;
}

export function isCoachQuietFlags() {
  return walkthroughActive || portfolioTourActive;
}

export function setWalkthroughActive(on) {
  walkthroughActive = !!on;
  syncWindow();
  return walkthroughActive;
}

export function setPortfolioTourActive(on) {
  portfolioTourActive = !!on;
  syncWindow();
  return portfolioTourActive;
}

export function clearCoachFlags() {
  walkthroughActive = false;
  portfolioTourActive = false;
  syncWindow();
}
