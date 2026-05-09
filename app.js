/**
 * Dribl Fixtures Search
 * API: mc-api.dribl.com — public, no auth, CORS open (*)
 * Flow: load clubs → user picks club → load their teams → user picks team → show fixtures
 */

const API_BASE = 'https://mc-api.dribl.com/api';
const TENANT   = 'w8zdBWPmBX'; // Football Victoria
const TIMEZONE = 'Australia/Sydney';
const FAV_KEY  = 'dribl-fixtures-favs';

let allClubs      = [];
let currentSeason = null;
let currentSearch = '';
let debounceTimer = null;

// ─── DOM ─────────────────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
const clearBtn    = document.getElementById('clearBtn');
const resultsEl   = document.getElementById('results');

// ─── Bootstrap: load season + clubs in parallel ──────────────────
async function bootstrap() {
  try {
    const [seasonData, clubsData] = await Promise.all([
      fetch(`${API_BASE}/list/seasons?disable_paging=true&tenant=${TENANT}`).then(r => r.json()),
      fetch(`${API_BASE}/list/clubs?disable_paging=true&tenant=${TENANT}`).then(r => r.json()),
    ]);

    const current = (seasonData.data || []).find(s => s.is_current) || seasonData.data?.[0];
    if (current) {
      currentSeason = { id: current.id, name: current.name };
      const tagline = document.querySelector('.tagline');
      if (tagline) tagline.textContent = `Football Victoria · ${current.name} Season`;
    } else {
      currentSeason = { id: 'nPmrj2rmow', name: '2026' };
    }

    allClubs = (clubsData.data || []).map(c => ({
      id:   c.id,
      name: c.attributes.name || '',
      logo: c.attributes.image || null,
    })).sort((a, b) => a.name.localeCompare(b.name));

  } catch (err) {
    console.warn('Bootstrap error:', err);
    currentSeason = { id: 'nPmrj2rmow', name: '2026' };
  }
}

const ready = bootstrap();
resetUI();

// If the input was server-rendered with a value, kick off a search once bootstrap is done.
if (searchInput.value.trim().length >= 2) {
  clearBtn.classList.add('visible');
  ready.then(() => showClubSuggestions(searchInput.value.trim()));
}

// ─── Search input ─────────────────────────────────────────────────
searchInput.addEventListener('input', () => {
  const val = searchInput.value.trim();
  clearBtn.classList.toggle('visible', val.length > 0);
  if (val.length === 0) { resetUI(); return; }
  if (val.length < 2)   return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => showClubSuggestions(val), 250);
});

clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearBtn.classList.remove('visible');
  resetUI();
  searchInput.focus();
});

// ─── Step 1: Filter clubs client-side ────────────────────────────
async function showClubSuggestions(query) {
  await ready;
  currentSearch = query;

  const ql = query.toLowerCase();
  const matches = allClubs.filter(c => c.name.toLowerCase().includes(ql)).slice(0, 12);

  if (matches.length === 0) {
    return showTeamSearch(query);
  }

  let html = `<div class="section-divider">Select a club (${matches.length} found)</div><div class="club-list">`;
  matches.forEach((club, i) => {
    html += `
      <button class="club-card" data-id="${escHtml(club.id)}" style="animation-delay:${i*0.04}s">
        ${club.logo
          ? `<img class="club-logo-sm" src="${escHtml(club.logo)}" alt="" onerror="this.style.display='none'">`
          : `<div class="club-logo-sm logo-placeholder">⚽</div>`}
        <span class="club-name">${escHtml(club.name)}</span>
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
      </button>`;
  });
  html += `</div>`;
  resultsEl.innerHTML = html;

  resultsEl.querySelectorAll('.club-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const club = allClubs.find(c => c.id === btn.dataset.id);
      if (club) selectClub(club);
    });
  });
}

// ─── Step 2: Load fixtures for club, group by team ────────────────
async function selectClub(club) {
  showLoadingWith(`Loading teams for ${club.name}…`);

  try {
    const params = new URLSearchParams({
      search:     club.name,
      date_range: 'default',
      season:     currentSeason.id,
      tenant:     TENANT,
      timezone:   TIMEZONE,
    });
    const res = await fetch(`${API_BASE}/fixtures?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const fixtures = data.data || [];

    if (fixtures.length === 0) {
      resultsEl.innerHTML = `
        <div class="no-results">
          <div style="font-size:32px;margin-bottom:12px;">📭</div>
          <p>No fixtures found for <strong>${escHtml(club.name)}</strong> this season</p>
          <button class="back-btn" id="backBtn">← Back to search</button>
        </div>`;
      document.getElementById('backBtn')?.addEventListener('click', () => showClubSuggestions(searchInput.value.trim()));
      return;
    }

    // Group by team, only include teams belonging to this club
    const teamMap = {};
    const clubWord = club.name.split(' ')[0].toLowerCase();
    fixtures.forEach(f => {
      const a = f.attributes;
      [{ name: a.home_team_name, logo: a.home_logo }, { name: a.away_team_name, logo: a.away_logo }].forEach(({ name, logo }) => {
        if (!name) return;
        if (!name.toLowerCase().includes(clubWord)) return;
        if (!teamMap[name]) teamMap[name] = { name, logo, count: 0, fixtures: [] };
        teamMap[name].count++;
        teamMap[name].fixtures.push(f);
      });
    });

    const teams = Object.values(teamMap).sort((a, b) => a.name.localeCompare(b.name));

    if (teams.length === 1) {
      loadAndShowFixtures(teams[0].name, club);
      return;
    }

    let html = `
      <div class="back-row">
        <button class="back-btn" id="backBtn">← Back</button>
        <span class="back-label">${escHtml(club.name)}</span>
      </div>
      <div class="section-divider">Select a team (${teams.length} found)</div>
      <div class="club-list">`;

    teams.forEach((team, i) => {
      html += `
        <button class="club-card" data-team="${escHtml(team.name)}" style="animation-delay:${i*0.04}s">
          ${team.logo
            ? `<img class="club-logo-sm" src="${escHtml(team.logo)}" alt="" onerror="this.style.display='none'">`
            : `<div class="club-logo-sm logo-placeholder">⚽</div>`}
          <div class="club-name-wrap">
            <span class="club-name">${escHtml(shortTeamName(team.name))}</span>
            <span class="club-sub">${team.count} fixture${team.count !== 1 ? 's' : ''}</span>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </button>`;
    });
    html += `</div>`;
    resultsEl.innerHTML = html;

    document.getElementById('backBtn')?.addEventListener('click', () => showClubSuggestions(searchInput.value.trim()));
    resultsEl.querySelectorAll('.club-card[data-team]').forEach(btn => {
      const team = teams.find(t => t.name === btn.dataset.team);
      if (team) btn.addEventListener('click', () => loadAndShowFixtures(team.name, club));
    });

  } catch (err) {
    showError(err.message);
  }
}

// ─── Step 2b: Team-name search (fallback when no club matches) ───
async function showTeamSearch(query) {
  await ready;
  showLoadingWith(`Searching teams for "${query}"…`);

  try {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    // Send a short prefix to the API (broad match on club/team name),
    // then post-filter strictly with all tokens for the user's exact intent.
    const apiQuery = tokens.slice(0, 2).join(' ');
    const params = new URLSearchParams({
      search:     apiQuery,
      date_range: 'default',
      season:     currentSeason.id,
      tenant:     TENANT,
      timezone:   TIMEZONE,
    });
    const res = await fetch(`${API_BASE}/fixtures?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const fixtures = data.data || [];

    const matchesAll = (text) => {
      const lc = text.toLowerCase();
      return tokens.every(t => lc.includes(t));
    };

    const teamMap = {};
    fixtures.forEach(f => {
      const a = f.attributes;
      [{ name: a.home_team_name, logo: a.home_logo }, { name: a.away_team_name, logo: a.away_logo }].forEach(({ name, logo }) => {
        if (!name || !matchesAll(name)) return;
        if (!teamMap[name]) teamMap[name] = { name, logo, count: 0, fixtures: [] };
        teamMap[name].count++;
        teamMap[name].fixtures.push(f);
      });
    });

    const teams = Object.values(teamMap).sort((a, b) => a.name.localeCompare(b.name));

    if (teams.length === 0) {
      resultsEl.innerHTML = `
        <div class="no-results">
          <div style="font-size:32px;margin-bottom:12px;">🔍</div>
          <p>No clubs or teams found for <strong>"${escHtml(query)}"</strong></p>
          <p style="margin-top:8px;font-size:13px;color:#64748b;">Try a club name like "Port Melbourne" or shorter team keywords.</p>
        </div>`;
      return;
    }

    if (teams.length === 1) {
      const t = teams[0];
      loadAndShowFixtures(t.name, { name: t.name, logo: t.logo }, () => showTeamSearch(query));
      return;
    }

    let html = `<div class="section-divider">Select a team (${teams.length} found)</div><div class="club-list">`;
    teams.forEach((team, i) => {
      html += `
        <button class="club-card" data-team="${escHtml(team.name)}" style="animation-delay:${i*0.04}s">
          ${team.logo
            ? `<img class="club-logo-sm" src="${escHtml(team.logo)}" alt="" onerror="this.style.display='none'">`
            : `<div class="club-logo-sm logo-placeholder">⚽</div>`}
          <div class="club-name-wrap">
            <span class="club-name">${escHtml(shortTeamName(team.name))}</span>
            <span class="club-sub">${team.count} fixture${team.count !== 1 ? 's' : ''}</span>
          </div>
          <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
        </button>`;
    });
    html += `</div>`;
    resultsEl.innerHTML = html;

    resultsEl.querySelectorAll('.club-card[data-team]').forEach(btn => {
      const team = teams.find(t => t.name === btn.dataset.team);
      if (team) btn.addEventListener('click', () =>
        loadAndShowFixtures(team.name, { name: team.name, logo: team.logo }, () => showTeamSearch(query))
      );
    });

  } catch (err) {
    showError(err.message);
  }
}

// ─── Step 2.5: Refetch full fixture list for a single team ───────
// The candidate fetches above are capped at ~30 results across many
// teams, so a specific team can have most of its season missing.
// Re-search with the canonical team name to get all of it (Dribl's
// own frontend uses this pattern).
async function loadAndShowFixtures(teamName, club, onBack) {
  showLoadingWith(`Loading fixtures for ${shortTeamName(teamName)}…`);
  try {
    const params = new URLSearchParams({
      search:     teamName,
      date_range: 'default',
      season:     currentSeason.id,
      tenant:     TENANT,
      timezone:   TIMEZONE,
    });
    const res = await fetch(`${API_BASE}/fixtures?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const fixtures = (data.data || []).filter(f => {
      const a = f.attributes;
      return a.home_team_name === teamName || a.away_team_name === teamName;
    });
    showFixtures(fixtures, teamName, club, onBack);
  } catch (err) {
    showError(err.message);
  }
}

// ─── Step 3: Render fixtures ──────────────────────────────────────
function showFixtures(fixtures, teamName, club, onBack) {
  const today = new Date(); today.setHours(0,0,0,0);
  let home = 0, away = 0, byes = 0, played = 0;

  fixtures.forEach(f => {
    const a = f.attributes;
    if (a.bye_flag) { byes++; return; }
    const d = new Date(a.date); d.setHours(0,0,0,0);
    if (d < today) played++;
    if (a.home_team_name === teamName) home++; else away++;
  });

  const remaining = fixtures.length - byes - played;
  const teamLogo  = getTeamLogo(fixtures, teamName) || club.logo;
  const compName  = fixtures.find(f => !f.attributes.bye_flag)?.attributes?.competition_name || '';

  let html = `
    <div class="back-row">
      <button class="back-btn" id="backBtn">← Back</button>
      <span class="back-label">${escHtml(club.name)}</span>
    </div>
    <div class="team-header">
      ${teamLogo
        ? `<img class="team-logo-lg" src="${escHtml(teamLogo)}" alt="" onerror="this.style.display='none'">`
        : `<div class="team-logo-lg" style="display:flex;align-items:center;justify-content:center;font-size:22px;">⚽</div>`}
      <div class="team-name-display">
        <h2>${escHtml(shortTeamName(teamName))}</h2>
        <div class="team-comp">${escHtml(compName)}</div>
      </div>
      <button class="fav-btn${isFav(teamName) ? ' is-fav' : ''}" id="favBtn" aria-label="Toggle favorite" title="Save this team">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
          <path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      </button>
    </div>
    <div class="stats-bar">
      <div class="stat"><div class="stat-num">${fixtures.length}</div><div class="stat-label">Total</div></div>
      <div class="stat"><div class="stat-num">${home}</div><div class="stat-label">Home</div></div>
      <div class="stat"><div class="stat-num">${away}</div><div class="stat-label">Away</div></div>
      <div class="stat"><div class="stat-num">${byes}</div><div class="stat-label">Byes</div></div>
      <div class="stat"><div class="stat-num">${remaining}</div><div class="stat-label">Left</div></div>
    </div>
    <div class="fixtures-list">`;

  let nextFound = false;
  fixtures.forEach((f, i) => {
    const a = f.attributes;
    const d = new Date(a.date);
    const isPast = d < today;
    const isNext = !nextFound && !isPast && !a.bye_flag;
    if (isNext) nextFound = true;
    const { dayNum, dowStr, monStr, timeStr } = formatDate(d);
    const isHome  = a.home_team_name === teamName;
    const mapsUrl = a.ground_latitude ? `https://www.google.com/maps?q=${a.ground_latitude},${a.ground_longitude}` : null;

    if (a.bye_flag) {
      html += `
        <div class="fixture-card bye" style="animation-delay:${i*0.03}s">
          <div class="bye-body">
            <div class="bye-inner">
              <div class="bye-icon">😴</div>
              <div><div class="bye-label">${a.full_round} — Bye</div><div class="bye-date">${dowStr} ${dayNum} ${monStr}</div></div>
            </div>
            <span class="tag tag-bye">Bye</span>
          </div>
        </div>`;
      return;
    }

    const venueStr  = [a.ground_name, a.field_name].filter(Boolean).join(' · ');
    const venueHTML = mapsUrl
      ? `<a href="${mapsUrl}" target="_blank" rel="noopener">${escHtml(venueStr)}</a>`
      : escHtml(venueStr || '—');
    const tagClass = isPast ? 'tag-past' : isHome ? 'tag-home' : 'tag-away';
    const tagLabel = isPast ? 'Past' : isHome ? 'Home' : 'Away';

    html += `
      <div class="fixture-card${isNext ? ' next-game' : ''}" style="animation-delay:${i*0.03}s">
        ${isNext ? '<div class="next-banner">Next Match</div>' : ''}
        <div class="card-body">
          <div class="round-col">${a.round}</div>
          <div class="match-col">
            <div class="teams-row">
              ${logoEl(a.home_logo, a.home_team_name)}
              <span class="t-name${a.home_team_name === teamName ? ' highlight' : ''}">${escHtml(shortTeamName(a.home_team_name || ''))}</span>
              <span class="vs">vs</span>
              ${logoEl(a.away_logo, a.away_team_name)}
              <span class="t-name${a.away_team_name === teamName ? ' highlight' : ''}">${escHtml(shortTeamName(a.away_team_name || ''))}</span>
            </div>
            <div class="venue-row">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              ${venueHTML}
            </div>
          </div>
          <div class="date-col">
            <div class="date-num">${dayNum}</div>
            <div class="date-sub">${dowStr} ${monStr}</div>
            <div class="date-time">${timeStr}</div>
          </div>
          <div class="tags-col"><span class="tag ${tagClass}">${tagLabel}</span></div>
        </div>
      </div>`;
  });

  html += `</div>`;
  resultsEl.innerHTML = html;
  document.getElementById('backBtn')?.addEventListener('click', onBack || (() => selectClub(club)));

  document.getElementById('favBtn')?.addEventListener('click', (e) => {
    const nowFav = toggleFav({ name: teamName, logo: teamLogo });
    e.currentTarget.classList.toggle('is-fav', nowFav);
  });
}

// ─── Helpers ─────────────────────────────────────────────────────
function getTeamLogo(fixtures, teamName) {
  for (const f of fixtures) {
    const a = f.attributes;
    if (a.home_team_name === teamName && a.home_logo) return a.home_logo;
    if (a.away_team_name === teamName && a.away_logo) return a.away_logo;
  }
  return null;
}

function logoEl(url, name) {
  if (!url) return `<div class="logo-placeholder">⚽</div>`;
  return `<img class="team-logo-sm" src="${escHtml(url)}" alt="${escHtml(name || '')}" onerror="this.style.display='none'">`;
}

function shortTeamName(name) {
  return name.replace(/ MiniRoos - .+$/, '').replace(/ MiniRoos.*$/, '').replace(/\s{2,}/g, ' ').trim();
}

function formatDate(d) {
  const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const timeStr = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TIMEZONE });
  return { dayNum: d.getDate(), dowStr: DAYS[d.getDay()], monStr: MONTHS[d.getMonth()], timeStr };
}

function escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Favorites (localStorage) ─────────────────────────────────────
function loadFavs() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); }
  catch { return []; }
}

function saveFavs(favs) {
  try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch {}
}

function isFav(teamName) {
  return loadFavs().some(f => f.name === teamName);
}

function toggleFav(team) {
  const favs = loadFavs();
  const i = favs.findIndex(f => f.name === team.name);
  if (i >= 0) favs.splice(i, 1);
  else favs.push({ name: team.name, logo: team.logo || null });
  saveFavs(favs);
  return i < 0; // true if it's now favorited
}

function showLoadingWith(msg) {
  resultsEl.innerHTML = `<div class="loading"><div class="spinner"></div>${escHtml(msg)}</div>`;
}

function showError(msg) {
  resultsEl.innerHTML = `
    <div class="error-state">
      ⚠️ Could not load data — ${escHtml(msg)}<br>
      <small style="opacity:0.7">The Dribl API may be temporarily unavailable.</small>
    </div>`;
}

function resetUI() {
  const favs = loadFavs();
  let favHtml = '';
  if (favs.length > 0) {
    favHtml = `<div class="section-divider">⭐ Your teams</div><div class="club-list">`;
    favs.forEach((fav, i) => {
      favHtml += `
        <button class="club-card" data-fav="${escHtml(fav.name)}" style="animation-delay:${i*0.04}s">
          ${fav.logo
            ? `<img class="club-logo-sm" src="${escHtml(fav.logo)}" alt="" onerror="this.style.display='none'">`
            : `<div class="club-logo-sm logo-placeholder">⚽</div>`}
          <span class="club-name">${escHtml(shortTeamName(fav.name))}</span>
          <span class="fav-remove" data-fav-remove="${escHtml(fav.name)}" title="Remove from favorites" aria-label="Remove from favorites">✕</span>
        </button>`;
    });
    favHtml += `</div>`;
  }

  resultsEl.innerHTML = `
    ${favHtml}
    <div class="empty-state">
      <div class="empty-icon">⚽</div>
      <p>${favs.length ? 'Or search for another team above' : 'Search for a team above to see their fixtures'}</p>
    </div>`;

  resultsEl.querySelectorAll('.club-card[data-fav]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('[data-fav-remove]')) return; // remove handled below
      const name = btn.dataset.fav;
      searchInput.value = name;
      clearBtn.classList.add('visible');
      showClubSuggestions(name);
    });
  });

  resultsEl.querySelectorAll('[data-fav-remove]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFav({ name: el.dataset.favRemove });
      resetUI();
    });
  });
}
