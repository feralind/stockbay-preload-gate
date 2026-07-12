// @ts-check
/** Local best-run history — no backend required */

const KEY = 'stockway_leaderboard_v1';
const MAX_RUNS = 10;

export function getLeaderboard() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRuns(runs) {
  localStorage.setItem(KEY, JSON.stringify(runs.slice(0, MAX_RUNS)));
}

/** Record if equity is a new personal best */
export function recordBestRun({ equity, day, rep, cash }) {
  const runs = getLeaderboard();
  const prevBest = runs[0]?.equity ?? 0;
  if (equity <= prevBest) return { isRecord: false, runs };

  const entry = {
    equity: Math.round(equity),
    day: day || 1,
    rep: rep || 0,
    cash: Math.round(cash || 0),
    at: Date.now(),
  };
  const next = [entry, ...runs.filter(r => r.at !== entry.at)].sort((a, b) => b.equity - a.equity);
  saveRuns(next);
  return { isRecord: true, runs: next, entry };
}

/** Snapshot current run into history on reset (optional) */
export function archiveRun({ equity, day, rep, label }) {
  const runs = getLeaderboard();
  runs.push({
    equity: Math.round(equity),
    day: day || 1,
    rep: rep || 0,
    label: label || 'Archived run',
    at: Date.now(),
  });
  runs.sort((a, b) => b.equity - a.equity);
  saveRuns(runs);
  return runs;
}
