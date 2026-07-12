// @ts-check
import { getLastNews } from '../api.js';
import { getActiveEvents, getPendingInsiderTips } from '../events.js';
import { escapeAttr, escapeHtml } from './shared.js';

/** @type {(viewId: string) => void} */
let switchView = () => {};
const expandedEventIds = new Set();

/** @param {{ switchView?: (viewId: string) => void }} [opts] */
export function configureEventsUi({ switchView: nextSwitchView } = {}) {
  if (typeof nextSwitchView === 'function') switchView = nextSwitchView;
}

function eventFeedKind(e, asTip = false) {
  if (asTip || e.type === 'tip') return 'tip';
  if (e.real || e.kind === 'live') return 'live';
  return 'sim';
}

function leanChipHtml(lean) {
  const L = (lean || '').toLowerCase();
  if (!L || !['bullish', 'bearish', 'mixed'].includes(L)) return '';
  const label = L === 'bullish' ? 'Bullish' : L === 'bearish' ? 'Bearish' : 'Mixed';
  return `<span class="event-lean ${L}">${label}</span>`;
}

function eventHasDepth(e) {
  return !!(e.simulated || e.body || e.whyItMatters || e.deskTake);
}

/** Only http(s) article links — never invent URLs for sim/insider cards. */
export function eventSourceUrl(e) {
  if (!e) return '';
  const candidates = [e.url, e.link, e.article_url, e.articleUrl];
  for (const raw of candidates) {
    const s = String(raw || '').trim();
    if (!s) continue;
    try {
      const u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      if (/news\.google\.com\/search/i.test(u.href)) continue;
      return u.href;
    } catch { /* try next */ }
  }
  return '';
}

/** Open in system browser (Electron setWindowOpenHandler) or a new tab (browser preview). */
function openExternalUrl(url) {
  const href = eventSourceUrl({ url });
  if (!href) return false;
  window.open(href, '_blank', 'noopener,noreferrer');
  return true;
}

function eventDetailHtml(e, { hasWire, isLive }) {
  if (isLive) {
    const bits = [];
    const srcUrl = eventSourceUrl(e);
    if (e.teaser) bits.push(`<p class="event-body">${escapeHtml(e.teaser)}</p>`);
    if (e.whyItMatters) bits.push(`<p class="event-impact"><span class="event-detail-lbl">Why it matters</span>${escapeHtml(e.whyItMatters)}</p>`);
    if (srcUrl) {
      bits.push(`<a class="event-source-btn" href="${escapeAttr(srcUrl)}" target="_blank" rel="noopener noreferrer">Open source article ↗</a>`);
    } else {
      bits.push('<p class="event-note">Live wire headline — full story lives at the source.</p>');
    }
    return `<div class="event-detail">${bits.join('')}</div>`;
  }

  if (!hasWire) {
    return `<div class="event-detail event-detail-locked">
      <p class="event-lock-copy">Full desk brief locked. Unlock <strong>News Wire</strong> for the in-depth write-up, sector impact, and desk take.</p>
      <button type="button" class="event-unlock-btn" data-goto="perks">Unlock News Wire</button>
    </div>`;
  }

  const parts = [];
  if (e.body) parts.push(`<p class="event-body">${escapeHtml(e.body)}</p>`);
  if (e.whyItMatters) {
    parts.push(`<p class="event-impact"><span class="event-detail-lbl">Why it matters</span>${escapeHtml(e.whyItMatters)}</p>`);
  }
  if (e.deskTake) {
    parts.push(`<p class="event-desk"><span class="event-detail-lbl">Desk take</span>${escapeHtml(e.deskTake)}</p>`);
  }
  if (!parts.length) parts.push('<p class="event-note">Simulated shock based on desk models.</p>');
  return `<div class="event-detail">${parts.join('')}</div>`;
}

function eventItemHtml(e, { compact = false, hasWire = false } = {}) {
  const kind = eventFeedKind(e, e._asTip);
  const label = kind === 'live' ? 'Live' : kind === 'tip' ? 'Tip' : 'Sim';
  const title = e.headline || e.title || 'Market event';
  const teaser = e.teaser || '';
  const time = e.timestamp ? new Date(e.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  const src = e.source ? `<span class="event-src">${escapeHtml(e.source)}</span>` : '';
  const eidRaw = e.id || `${String(title).slice(0, 24)}_${e.timestamp || 0}`;
  const eid = escapeAttr(eidRaw);
  const srcUrl = eventSourceUrl(e);
  const isLive = !!(e.real || srcUrl);
  const expanded = expandedEventIds.has(eid);
  const canExpand = eventHasDepth(e) || isLive;
  const lean = leanChipHtml(e.lean);
  const tipNote = kind === 'tip' ? '<span class="event-tip-flag">Early</span>' : '';

  // Live wire with a real article URL: title opens externally. Sim/insider stay plain text.
  const titleHtml = srcUrl
    ? `<a class="event-link" href="${escapeAttr(srcUrl)}" target="_blank" rel="noopener noreferrer" title="Open source article">${escapeHtml(title)}</a>`
    : escapeHtml(title);

  const teaserHtml = teaser
    ? `<p class="event-teaser">${escapeHtml(teaser)}</p>`
    : (kind === 'sim' && !compact
      ? '<p class="event-teaser">Simulated desk brief — expand for the full write-up.</p>'
      : '');

  const toggleLabel = !canExpand ? '' : (expanded ? 'Collapse' : (hasWire || isLive ? 'Full brief' : 'Preview'));
  const toggleHtml = canExpand
    ? `<button type="button" class="event-expand-btn" data-event-id="${eid}" aria-expanded="${expanded}">${toggleLabel}</button>`
    : '';

  const detail = expanded ? eventDetailHtml(e, { hasWire, isLive }) : '';
  const lockedClass = !hasWire && !isLive && eventHasDepth(e) ? ' wire-gated' : '';

  if (compact) {
    return `
      <div class="event-item ${kind}${expanded ? ' is-expanded' : ''}${lockedClass}" data-event-id="${eid}">
        <span class="feed-dot ${kind}" title="${label}"></span>
        <div class="event-copy">
          <div class="event-meta">
            <span class="event-kind">${label}</span>
            ${lean}${tipNote}
            ${time ? `<span class="event-time">${time}</span>` : ''}
          </div>
          <div class="event-title">${titleHtml}</div>
          ${teaser ? `<p class="event-teaser">${escapeHtml(teaser)}</p>` : ''}
          ${toggleHtml}
          ${detail}
          ${src}
        </div>
      </div>`;
  }

  return `
    <article class="event-card ${kind}${expanded ? ' is-expanded' : ''}${lockedClass}" data-event-id="${eid}">
      <span class="feed-dot ${kind}" title="${label}"></span>
      <div class="event-copy">
        <div class="event-meta">
          <span class="event-kind">${label}</span>
          ${lean}${tipNote}
          ${time ? `<span class="event-time">${time}</span>` : ''}
          ${src}
        </div>
        <h3 class="event-title">${titleHtml}</h3>
        ${teaserHtml}
        ${toggleHtml}
        ${detail}
      </div>
    </article>`;
}

function bindEventFeed(feed, state) {
  feed.querySelectorAll('a.event-link, a.event-source-btn').forEach((a) => {
    a.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openExternalUrl(a.getAttribute('href') || a.href);
    };
  });
  feed.querySelectorAll('.event-expand-btn').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const id = btn.dataset.eventId;
      if (!id) return;
      if (expandedEventIds.has(id)) expandedEventIds.delete(id);
      else expandedEventIds.add(id);
      renderEvents(state, 'events-feed');
      renderEvents(state, 'events-full');
    };
  });
  feed.querySelectorAll('.event-unlock-btn').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      switchView(btn.dataset.goto || 'perks');
    };
  });
}

export function renderEvents(state, containerId) {
  const feed = document.getElementById(containerId);
  if (!feed) return;
  const isFull = containerId === 'events-full';
  const hasWire = !!state.perks?.includes('newsWire');
  const tips = getPendingInsiderTips();
  const events = getActiveEvents();
  const news = getLastNews() || [];

  const items = [];
  tips.forEach((t) => items.push({ ...t, _asTip: true, timestamp: t.timestamp || Date.now() }));
  events.forEach((e) => items.push({ ...e }));

  if (isFull && news.length) {
    news.slice(0, 15).forEach((n) => {
      const title = (n.headline || '').trim();
      if (!title) return;
      const already = items.some((e) => ((e.headline || e.title) || '').slice(0, 48) === title.slice(0, 48));
      if (already) return;
      const summary = (n.summary || '').trim();
      const articleUrl = eventSourceUrl(n);
      items.push({
        id: `wire_${n.id || title.slice(0, 32)}`,
        headline: title,
        title,
        teaser: summary && summary !== title ? summary.slice(0, 160) : '',
        source: n.source || 'Market wire',
        timestamp: n.datetime ? n.datetime * 1000 : Date.now(),
        real: true,
        url: articleUrl,
        lean: '',
      });
    });
  }

  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const visible = items.slice(0, isFull ? 40 : 10);

  if (!visible.length) {
    feed.innerHTML = isFull
      ? `<div class="events-empty">
          <div class="events-empty-title">No events yet</div>
          <p>Live headlines and simulated desk briefs will land here as the session runs. Expand a card for the full write-up${hasWire ? '' : ' (News Wire unlocks in-depth sim stories)'}.</p>
        </div>`
      : '<div class="empty">Waiting for market events…</div>';
    return;
  }

  feed.innerHTML = visible.map((e) => eventItemHtml(e, { compact: !isFull, hasWire })).join('');
  bindEventFeed(feed, state);
}
