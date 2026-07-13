// @ts-check
/** Achievements — LoL-style ranks from Bronze → Master */

export const ACHIEVEMENT_TIERS = [
  { id: 'bronze', label: 'BRONZE', blurb: 'Getting on the desk', color: '#cd7f32' },
  { id: 'silver', label: 'SILVER', blurb: 'Competent floor trader', color: '#c0c0c0' },
  { id: 'gold', label: 'GOLD', blurb: 'Serious capital', color: '#e3b341' },
  { id: 'platinum', label: 'PLATINUM', blurb: 'Pro desk operator', color: '#7ec8e3' },
  { id: 'diamond', label: 'DIAMOND', blurb: 'Elite capital desk', color: '#5ec8ff' },
  { id: 'master', label: 'MASTER', blurb: 'Top of the board', color: '#c084fc' },
];

export const ACHIEVEMENTS = [
  /* ── Bronze ── */
  {
    id: 'first_trade',
    tier: 'bronze',
    name: 'First Flip',
    desc: 'Complete your first trade',
    reward: 25,
    check: (s) => (s.portfolio?.totalTrades || 0) >= 1 || (s.portfolio?.history?.length || 0) >= 1,
  },
  {
    id: 'ten_trades',
    tier: 'bronze',
    name: 'Getting Warm',
    desc: 'Complete 10 trades',
    reward: 75,
    check: (s) => (s.portfolio?.totalTrades || 0) >= 10,
  },
  {
    id: 'first_hire',
    tier: 'bronze',
    name: 'On the Payroll',
    desc: 'Hire your first employee',
    reward: 40,
    check: (s) => (s.stats?.hires || 0) >= 1 || (s.staff?.length || 0) >= 1,
  },
  {
    id: 'first_fire',
    tier: 'bronze',
    name: "You're Fired",
    desc: 'Let an employee go',
    reward: 30,
    check: (s) => (s.stats?.fires || 0) >= 1,
  },
  {
    id: 'first_perk',
    tier: 'bronze',
    name: 'Power Up',
    desc: 'Buy your first perk',
    reward: 40,
    check: (s) => (s.perks?.length || 0) >= 1,
  },
  {
    id: 'scanner_perk',
    tier: 'bronze',
    name: 'Pro Eyes',
    desc: 'Unlock Pro Scanner',
    reward: 35,
    check: (s) => (s.perks || []).includes('scanner'),
  },
  {
    id: 'day_5',
    tier: 'bronze',
    name: 'Survived the Week',
    desc: 'Reach Day 5',
    reward: 60,
    check: (s) => (s.dayCount || 1) >= 5,
  },
  {
    id: 'watch_alerts',
    tier: 'bronze',
    name: 'On Watch',
    desc: 'Set a price alert on your watchlist',
    reward: 30,
    check: (s) => (s.stats?.alertsSet || 0) >= 1,
  },

  /* ── Silver ── */
  {
    id: 'train_veteran',
    tier: 'silver',
    name: 'Middle Management',
    desc: 'Train an employee to Veteran',
    reward: 80,
    check: (s) => (s.staff || []).some(m => ['veteran', 'expert'].includes(m.tier)),
  },
  {
    id: 'cash_2k',
    tier: 'silver',
    name: 'Four Digits',
    desc: 'Reach $2,000 cash',
    reward: 100,
    check: (s) => (s.portfolio?.cash || 0) >= 2000,
  },
  {
    id: 'first_short',
    tier: 'silver',
    name: 'Bear Mode',
    desc: 'Open your first short position',
    reward: 90,
    check: (s) => (s.stats?.shortsOpened || 0) >= 1 || Object.keys(s.portfolio?.shorts || {}).length > 0,
  },
  {
    id: 'hr_perk',
    tier: 'silver',
    name: 'Building a Firm',
    desc: 'Unlock HR Department',
    reward: 90,
    check: (s) => (s.perks || []).includes('hrDept'),
  },
  {
    id: 'day_profit',
    tier: 'silver',
    name: 'Green Day',
    desc: 'Finish a day with +$100 equity gain',
    reward: 80,
    check: (s) => (s.stats?.greenDays || 0) >= 1,
  },
  {
    id: 'team_3',
    tier: 'silver',
    name: 'Small Desk',
    desc: 'Have 3 employees at once',
    reward: 120,
    check: (s) => (s.staff?.length || 0) >= 3,
  },
  {
    id: 'shorts_profit_3',
    tier: 'silver',
    name: 'Bear Tamer',
    desc: 'Close 3 short positions profitably',
    reward: 110,
    check: (s) => (s.stats?.profitableShorts || 0) >= 3,
  },
  {
    id: 'loan_early',
    tier: 'silver',
    name: 'Debt Free',
    desc: 'Pay off a loan early',
    reward: 95,
    check: (s) => (s.stats?.loansPaidEarly || 0) >= 1,
  },
  {
    id: 'options_trade',
    tier: 'silver',
    name: 'Derivatives Desk',
    desc: 'Buy your first option contract',
    reward: 85,
    check: (s) => (s.portfolio?.history || []).some(t => t.action === 'BUY_OPT'),
  },

  /* ── Gold ── */
  {
    id: 'train_expert',
    tier: 'gold',
    name: 'All-Star Roster',
    desc: 'Train an employee to Expert',
    reward: 200,
    check: (s) => (s.staff || []).some(m => m.tier === 'expert'),
  },
  {
    id: 'equity_5k',
    tier: 'gold',
    name: 'Growing Desk',
    desc: 'Reach $5,000 equity',
    reward: 250,
    check: (s) => (s.equity || 0) >= 5000,
  },
  {
    id: 'ai_perk',
    tier: 'gold',
    name: 'Silicon Partner',
    desc: 'Unlock AI Trading Advisor',
    reward: 200,
    check: (s) => (s.perks || []).includes('aiAdvisor'),
  },
  {
    id: 'green_streak_5',
    tier: 'gold',
    name: 'Hot Streak',
    desc: '5 profitable days in a row (+$100 each)',
    reward: 150,
    check: (s) => (s.stats?.greenStreak || 0) >= 5,
  },
  {
    id: 'equity_10k',
    tier: 'gold',
    name: 'Five Figures',
    desc: 'Reach $10,000 equity',
    reward: 400,
    check: (s) => (s.equity || 0) >= 10000,
  },
  {
    id: 'margin_perk',
    tier: 'gold',
    name: 'Leverage Desk',
    desc: 'Unlock Margin Account',
    reward: 180,
    check: (s) => (s.perks || []).includes('margin'),
  },
  {
    id: 'day_15',
    tier: 'gold',
    name: 'Seasoned',
    desc: 'Reach Day 15',
    reward: 220,
    check: (s) => (s.dayCount || 1) >= 15,
  },

  /* ── Platinum ── */
  {
    id: 'equity_25k',
    tier: 'platinum',
    name: 'Heavy Book',
    desc: 'Reach $25,000 equity',
    reward: 500,
    check: (s) => (s.equity || 0) >= 25000,
  },
  {
    id: 'cash_10k',
    tier: 'platinum',
    name: 'War Chest',
    desc: 'Hold $10,000 cash',
    reward: 450,
    check: (s) => (s.portfolio?.cash || 0) >= 10000,
  },
  {
    id: 'day_25',
    tier: 'platinum',
    name: 'Quarter Mark',
    desc: 'Reach Day 25',
    reward: 400,
    check: (s) => (s.dayCount || 1) >= 25,
  },
  {
    id: 'green_streak_10',
    tier: 'platinum',
    name: 'Unstoppable',
    desc: '10 profitable days in a row',
    reward: 550,
    check: (s) => (s.stats?.greenStreak || 0) >= 10,
  },
  {
    id: 'team_5',
    tier: 'platinum',
    name: 'Full Floor',
    desc: 'Have 5 employees at once',
    reward: 480,
    check: (s) => (s.staff?.length || 0) >= 5,
  },
  {
    id: 'options_perk',
    tier: 'platinum',
    name: 'Options Floor',
    desc: 'Unlock Options Desk',
    reward: 420,
    check: (s) => (s.perks || []).includes('options'),
  },
  {
    id: 'rep_200',
    tier: 'platinum',
    name: 'Known Quantity',
    desc: 'Reach 200 reputation',
    reward: 380,
    check: (s) => (s.meta?.reputation || 0) >= 200,
  },
  {
    id: 'fifty_trades',
    tier: 'platinum',
    name: 'Tape Reader',
    desc: 'Complete 50 trades',
    reward: 400,
    check: (s) => (s.portfolio?.totalTrades || 0) >= 50,
  },

  /* ── Diamond ── */
  {
    id: 'equity_50k',
    tier: 'diamond',
    name: 'Half Ton',
    desc: 'Reach $50,000 equity',
    reward: 900,
    check: (s) => (s.equity || 0) >= 50000,
  },
  {
    id: 'cash_20k',
    tier: 'diamond',
    name: 'Dry Powder',
    desc: 'Hold $20,000 cash',
    reward: 700,
    check: (s) => (s.portfolio?.cash || 0) >= 20000,
  },
  {
    id: 'fully_stacked',
    tier: 'diamond',
    name: 'Fully Stacked',
    desc: 'Own scanner, margin, options, and AI advisor',
    reward: 800,
    check: (s) => {
      const p = s.perks || [];
      return ['scanner', 'margin', 'options', 'aiAdvisor'].every((id) => p.includes(id));
    },
  },
  {
    id: 'day_50',
    tier: 'diamond',
    name: 'Institutional Memory',
    desc: 'Reach Day 50',
    reward: 750,
    check: (s) => (s.dayCount || 1) >= 50,
  },
  {
    id: 'rep_500',
    tier: 'diamond',
    name: 'Street Cred',
    desc: 'Reach 500 reputation',
    reward: 650,
    check: (s) => (s.meta?.reputation || 0) >= 500,
  },

  /* ── Master ── */
  {
    id: 'equity_100k',
    tier: 'master',
    name: 'Six Figures',
    desc: 'Reach $100,000 equity',
    reward: 2000,
    check: (s) => (s.equity || 0) >= 100000,
  },
  {
    id: 'green_streak_20',
    tier: 'master',
    name: 'Legend Streak',
    desc: '20 green days in a row',
    reward: 1500,
    check: (s) => (s.stats?.greenStreak || 0) >= 20,
  },
  {
    id: 'day_100',
    tier: 'master',
    name: 'Century Club',
    desc: 'Reach Day 100',
    reward: 1800,
    check: (s) => (s.dayCount || 1) >= 100,
  },
  {
    id: 'master_desk',
    tier: 'master',
    name: 'Master of the Desk',
    desc: 'Unlock 35 achievements',
    reward: 2500,
    check: (s) => Object.keys(s.achievements?.unlocked || {}).length >= 35,
  },
];

/** Rank badge SVG — same shield silhouette, more ornate as tier rises */
export function achievementCategory(a) {
  const blob = `${a?.id || ''} ${a?.name || ''} ${a?.desc || ''}`.toLowerCase();
  if (/hire|staff|fire|payroll|train|veteran|employee|on the payroll|you're fired|middle management/.test(blob)) {
    return 'staff';
  }
  if (/perk|scanner|power up|pro eyes|unlock|ai trading|margin|options desk/.test(blob)) {
    return 'perk';
  }
  if (/cash|equity|loan|credit|borrow|net worth|digits|million|bankroll|tax/.test(blob)) {
    return 'finance';
  }
  return 'trade';
}

/**
 * Category glyphs reused from desk icon language (trade / staff / finance / perk).
 * Tier color still drives stroke; locked stays muted.
 */
export function achievementBadgeSvg(tier, { unlocked = false, category = 'trade' } = {}) {
  const meta = ACHIEVEMENT_TIERS.find((t) => t.id === tier) || ACHIEVEMENT_TIERS[0];
  const c = unlocked ? meta.color : 'currentColor';
  const opacity = unlocked ? '1' : '0.45';
  const motifs = {
    trade: `<path d="M7 22 12 10l3 5 4-9 3 5" fill="none" stroke="${c}" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M6 25h20" stroke="${c}" stroke-width="1.6" opacity="0.7"/>`,
    staff: `<circle cx="12" cy="11" r="3.2" fill="none" stroke="${c}" stroke-width="1.75"/>
      <circle cx="20.5" cy="12" r="2.6" fill="none" stroke="${c}" stroke-width="1.6" opacity="0.85"/>
      <path d="M6.5 24c.4-3.4 2.4-5.2 5.5-5.2s5.1 1.8 5.4 5.2" fill="none" stroke="${c}" stroke-width="1.75"/>
      <path d="M18 24c.25-2.2 1.4-3.5 2.8-3.5 1.5 0 2.6 1.4 2.8 3.5" fill="none" stroke="${c}" stroke-width="1.6" opacity="0.85"/>`,
    finance: `<rect x="7" y="10" width="18" height="13" rx="2" fill="none" stroke="${c}" stroke-width="1.75"/>
      <path d="M7 14h18" stroke="${c}" stroke-width="1.5"/>
      <path d="M11 10V8.5h10V10" stroke="${c}" stroke-width="1.5"/>
      <path d="M12 19h3M17 19h3" stroke="${c}" stroke-width="1.85" stroke-linecap="round"/>`,
    perk: `<circle cx="16" cy="16" r="3" fill="none" stroke="${c}" stroke-width="1.75"/>
      <circle cx="16" cy="16" r="7" fill="none" stroke="${c}" stroke-width="1.5" opacity="0.65"/>
      <path d="M16 6.5v2.2M16 23.3v2.2M6.5 16h2.2M23.3 16h2.2" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/>`,
  };
  const motif = motifs[category] || motifs.trade;
  return `<svg class="ach-badge-svg ach-cat-${category}" viewBox="0 0 32 32" aria-hidden="true" style="opacity:${opacity}">
    ${motif}
  </svg>`;
}

export function createAchievementState() {
  return { unlocked: {}, claimed: {} };
}

export function evaluateAchievements(state, achState) {
  const newly = [];
  // Pass achievements into check context for meta unlocks (Master of the Desk)
  const ctx = { ...state, achievements: achState };
  for (const a of ACHIEVEMENTS) {
    if (achState.unlocked[a.id]) continue;
    try {
      if (a.check(ctx)) {
        achState.unlocked[a.id] = Date.now();
        newly.push(a);
      }
    } catch { /* ignore */ }
  }
  return newly;
}

export function getUnclaimedTotal(achState) {
  return ACHIEVEMENTS
    .filter(a => achState.unlocked[a.id] && !achState.claimed[a.id])
    .reduce((sum, a) => sum + a.reward, 0);
}

export function claimAchievement(id, achState, portfolio) {
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (!a || !achState.unlocked[id] || achState.claimed[id]) return { ok: false };
  achState.claimed[id] = Date.now();
  portfolio.cash += a.reward;
  return { ok: true, reward: a.reward, name: a.name };
}

export function claimAllAchievements(achState, portfolio) {
  let total = 0;
  const claimed = [];
  for (const a of ACHIEVEMENTS) {
    if (achState.unlocked[a.id] && !achState.claimed[a.id]) {
      achState.claimed[a.id] = Date.now();
      portfolio.cash += a.reward;
      total += a.reward;
      claimed.push(a);
    }
  }
  return { total, claimed };
}

export function getAchievementProgress(achState) {
  const unlocked = ACHIEVEMENTS.filter(a => achState.unlocked[a.id]).length;
  return { unlocked, total: ACHIEVEMENTS.length, unclaimed: getUnclaimedTotal(achState) };
}
