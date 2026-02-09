'use strict';

/* ── Load Motion One (graceful fallback to CSS if CDN unavailable) ── */
const motion = await import(
  'https://cdn.jsdelivr.net/npm/@motionone/dom@10.18.0/+esm'
).catch(() => null);

/* ── Lucide helper ── */
function renderIcons() {
  if (window.lucide) lucide.createIcons();
}

/* ── DOM refs ── */
const $ = (id) => document.getElementById(id);
const searchInput   = $('searchInput');
const searchResults = $('searchResults');
const btnLocation   = $('btnLocation');
const welcomeState  = $('welcomeState');
const loadingState  = $('loadingState');
const dashboard     = $('dashboard');
const errorToast    = $('errorToast');

let clockInterval = null;
let currentTimezone = 'UTC';
let debounceTimer = null;

/* ── User preferences ── */
const prefsEl = $('userPrefs');
const useMetric = prefsEl ? prefsEl.dataset.metric !== 'false' : true;

function tempUnit()  { return useMetric ? '°C' : '°F'; }
function speedUnit() { return useMetric ? 'km/h' : 'mph'; }
function toUserTemp(c) { return useMetric ? Math.round(c) : Math.round(c * 9 / 5 + 32); }
function toUserSpeed(kmh) { return useMetric ? Math.round(kmh) : Math.round(kmh * 0.621371); }

/* ── Time-based greeting ── */
function updateGreeting() {
  const el = $('greetingHello');
  if (!el) return;
  const h = new Date().getHours();
  if (h < 12)      el.textContent = 'Good morning,';
  else if (h < 18) el.textContent = 'Good afternoon,';
  else             el.textContent = 'Good evening,';
}
updateGreeting();

/* ── WMO weather codes → Lucide icon names ── */
const WMO = {
  0:  { d: 'Clear sky',           i: (n) => n ? 'sun'            : 'moon' },
  1:  { d: 'Mainly clear',        i: (n) => n ? 'sun'            : 'moon' },
  2:  { d: 'Partly cloudy',       i: (n) => n ? 'cloud-sun'      : 'cloud-moon' },
  3:  { d: 'Overcast',            i: () => 'cloud' },
  45: { d: 'Fog',                 i: () => 'cloud-fog' },
  48: { d: 'Rime fog',            i: () => 'cloud-fog' },
  51: { d: 'Light drizzle',       i: () => 'cloud-drizzle' },
  53: { d: 'Moderate drizzle',    i: () => 'cloud-drizzle' },
  55: { d: 'Dense drizzle',       i: () => 'cloud-rain' },
  56: { d: 'Freezing drizzle',    i: () => 'cloud-rain' },
  57: { d: 'Heavy freezing drizzle', i: () => 'cloud-rain' },
  61: { d: 'Slight rain',         i: () => 'cloud-drizzle' },
  63: { d: 'Moderate rain',       i: () => 'cloud-rain' },
  65: { d: 'Heavy rain',          i: () => 'cloud-rain-wind' },
  66: { d: 'Freezing rain',       i: () => 'cloud-rain' },
  67: { d: 'Heavy freezing rain', i: () => 'cloud-rain-wind' },
  71: { d: 'Light snow',          i: () => 'cloud-snow' },
  73: { d: 'Moderate snow',       i: () => 'cloud-snow' },
  75: { d: 'Heavy snow',          i: () => 'snowflake' },
  77: { d: 'Snow grains',         i: () => 'snowflake' },
  80: { d: 'Light showers',       i: () => 'cloud-drizzle' },
  81: { d: 'Moderate showers',    i: () => 'cloud-rain' },
  82: { d: 'Heavy showers',       i: () => 'cloud-rain-wind' },
  85: { d: 'Light snow showers',  i: () => 'cloud-snow' },
  86: { d: 'Heavy snow showers',  i: () => 'snowflake' },
  95: { d: 'Thunderstorm',        i: () => 'cloud-lightning' },
  96: { d: 'Thunderstorm, hail',  i: () => 'cloud-lightning' },
  99: { d: 'Severe thunderstorm', i: () => 'cloud-lightning' },
};

function wmo(code, isDay) {
  const e = WMO[code] || { d: 'Unknown', i: () => 'cloud' };
  return { desc: e.d, icon: e.i(isDay) };
}

/** Returns an <i data-lucide> tag string for a weather condition icon */
function weatherIcon(name, cls) {
  const c = cls ? ` class="${cls}"` : '';
  return `<i data-lucide="${name}"${c}></i>`;
}

/* ── Helpers ── */
function windLabel(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function uvLabel(val) {
  if (val <= 2) return 'Low';
  if (val <= 5) return 'Moderate';
  if (val <= 7) return 'High';
  if (val <= 10) return 'Very high';
  return 'Extreme';
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ── Weather mood → hero card hues (r,g,b pairs) ── */
function weatherMood(code, isDay) {
  if (code <= 1 && isDay)  return { hue:'210,170,100', alt:'195,135,75' };
  if (code <= 1 && !isDay) return { hue:'150,160,195', alt:'120,130,175' };
  if (code === 2)          return { hue:'180,170,145', alt:'155,150,125' };
  if (code === 3)          return { hue:'145,145,155', alt:'125,128,140' };
  if (code === 45 || code === 48) return { hue:'160,155,170', alt:'140,135,155' };
  if (code >= 51 && code <= 57)   return { hue:'130,160,185', alt:'110,140,170' };
  if (code >= 61 && code <= 67)   return { hue:'115,150,190', alt:'95,125,170' };
  if (code >= 71 && code <= 77)   return { hue:'170,185,205', alt:'145,165,190' };
  if (code >= 80 && code <= 82)   return { hue:'120,155,185', alt:'100,135,168' };
  if (code >= 85 && code <= 86)   return { hue:'165,180,200', alt:'140,160,185' };
  if (code >= 95)                 return { hue:'155,130,175', alt:'130,105,155' };
  return { hue:'212,149,107', alt:'190,130,90' };
}

/* ── State management ── */
function showState(s) {
  welcomeState.style.display = s === 'welcome' ? '' : 'none';
  loadingState.style.display = s === 'loading' ? '' : 'none';
  dashboard.classList.toggle('visible', s === 'weather');
}

/* ── Error toast (with Motion spring or CSS fallback) ── */
let toastTimer = null;

function showError(msg) {
  clearTimeout(toastTimer);
  errorToast.textContent = msg;

  if (motion) {
    const { animate } = motion;
    errorToast.style.transition = 'none';
    animate(
      errorToast,
      { transform: ['translateX(-50%) translateY(100px)', 'translateX(-50%) translateY(0)'],
        opacity: [0, 1] },
      { duration: 0.55, easing: [0.34, 1.56, 0.64, 1] }
    );
    toastTimer = setTimeout(() => {
      animate(
        errorToast,
        { transform: ['translateX(-50%) translateY(0)', 'translateX(-50%) translateY(100px)'],
          opacity: [1, 0] },
        { duration: 0.35, easing: [0.55, 0, 1, 0.45] }
      );
    }, 4500);
  } else {
    errorToast.classList.add('visible');
    toastTimer = setTimeout(() => errorToast.classList.remove('visible'), 4500);
  }
}

/* ── Clock ── */
function startClock(tz) {
  currentTimezone = tz;
  if (clockInterval) clearInterval(clockInterval);
  tick();
  clockInterval = setInterval(tick, 1000);
}

function tick() {
  const now = new Date();
  try {
    $('clockTime').textContent = now.toLocaleTimeString('en-GB', {
      timeZone: currentTimezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    $('clockDate').textContent = now.toLocaleDateString('en-US', {
      timeZone: currentTimezone,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    $('clockTime').textContent = '--:--';
  }
}

/* ── Search ── */
function showSearchLoading(term) {
  searchResults.innerHTML = `
    <div class="search-loading">
      <div class="search-loading-spinner"></div>
      <div class="search-loading-text">Searching for <em>${esc(term)}</em></div>
    </div>`;
  searchResults.classList.add('visible');
}

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();
  if (q.length < 2) {
    searchResults.classList.remove('visible');
    return;
  }
  showSearchLoading(q);
  debounceTimer = setTimeout(() => fetchCities(q), 280);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') searchResults.classList.remove('visible');
});

document.addEventListener('click', (e) => {
  if (!searchResults.contains(e.target) && e.target !== searchInput) {
    searchResults.classList.remove('visible');
  }
});

async function fetchCities(q) {
  try {
    const r = await fetch(`/weather/api/geocode/?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    renderSearch(d.results || []);
  } catch {
    searchResults.classList.remove('visible');
  }
}

function renderSearch(results) {
  if (!results.length) {
    searchResults.classList.remove('visible');
    return;
  }
  searchResults.innerHTML = results.map((r, i) => `
    <div class="search-result-item" data-i="${i}">
      <div class="search-result-name">${esc(r.name)}</div>
      <div class="search-result-detail">${esc((r.admin1 ? r.admin1 + ', ' : '') + r.country)}</div>
    </div>`).join('');

  searchResults.querySelectorAll('.search-result-item').forEach(el => {
    el.addEventListener('click', () => {
      const r = results[+el.dataset.i];
      searchInput.value = r.name;
      searchResults.classList.remove('visible');
      loadWeather(r.latitude, r.longitude, r.name, r.country, r.timezone);
    });
  });
  searchResults.classList.add('visible');
}

/* ── Geolocation ── */
btnLocation.addEventListener('click', () => {
  if (!navigator.geolocation) {
    showError('Geolocation not supported.');
    return;
  }
  showState('loading');
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude: la, longitude: lo } = pos.coords;
      try {
        const r = await fetch(`/weather/api/reverse-geocode/?lat=${la}&lon=${lo}`);
        const g = await r.json();
        loadWeather(la, lo, g.city, g.country);
      } catch {
        showError('Could not determine location.');
        showState('welcome');
      }
    },
    () => {
      showError('Location access denied.');
      showState('welcome');
    },
    { enableHighAccuracy: false, timeout: 10000 }
  );
});

/* ══════════════════════════════════════════
   MOTION-POWERED ANIMATIONS
   ══════════════════════════════════════════ */

const EASE_OUT_QUINT = [0.22, 1, 0.36, 1];
const SPRING_BOUNCE  = [0.34, 1.56, 0.64, 1];

function animateDashboardEntrance() {
  if (!motion) return;
  const { animate, stagger, inView } = motion;

  dashboard.style.animation = 'none';

  animate($('heroCard'),
    { opacity: [0, 1], transform: ['translateY(40px)', 'translateY(0)'] },
    { duration: 0.7, easing: SPRING_BOUNCE }
  );

  /* 1b ── Greeting row */
  const greetingRow = $('greetingRow');
  if (greetingRow) {
    animate(greetingRow,
      { opacity: [0, 1], transform: ['translateY(-10px)', 'translateY(0)'] },
      { duration: 0.4, easing: EASE_OUT_QUINT }
    );
  }

  /* 2 ── Score cards (if present) */
  const scoreCards = document.querySelectorAll('.score-card');
  if (scoreCards.length) {
    animate(scoreCards,
      { opacity: [0, 1], transform: ['translateY(20px) scale(0.97)', 'translateY(0) scale(1)'] },
      { duration: 0.45, delay: stagger(0.06, { start: 0.12 }), easing: EASE_OUT_QUINT }
    );
  }

  /* 3 ── Detail cards */
  animate(document.querySelectorAll('.detail-card'),
    { opacity: [0, 1], transform: ['translateY(24px) scale(0.96)', 'translateY(0) scale(1)'] },
    { duration: 0.5, delay: stagger(0.06, { start: 0.25 }), easing: EASE_OUT_QUINT }
  );

  animate(document.querySelectorAll('.sun-card'),
    { opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
    { duration: 0.45, delay: stagger(0.08, { start: 0.4 }), easing: EASE_OUT_QUINT }
  );

  const hourlySection = document.querySelector('.hourly-section');
  if (hourlySection) {
    animate(hourlySection,
      { opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
      { duration: 0.5, delay: 0.5, easing: EASE_OUT_QUINT }
    );
  }

  animate(document.querySelectorAll('.hourly-item'),
    { opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] },
    { duration: 0.3, delay: stagger(0.025, { start: 0.6 }), easing: EASE_OUT_QUINT }
  );

  const forecastSection = document.querySelector('.forecast-section');
  if (forecastSection) {
    animate(forecastSection,
      { opacity: [0, 1], transform: ['translateY(20px)', 'translateY(0)'] },
      { duration: 0.5, delay: 0.6, easing: EASE_OUT_QUINT }
    );
  }

  document.querySelectorAll('.forecast-row').forEach((row) => {
    row.style.opacity = '0';
    inView(row, () => {
      animate(row,
        { opacity: [0, 1], transform: ['translateX(-14px)', 'translateX(0)'] },
        { duration: 0.4, easing: EASE_OUT_QUINT }
      );
    }, { amount: 0.2 });
  });

  document.querySelectorAll('.forecast-bar-fill').forEach((bar) => {
    const target = bar.style.width;
    bar.style.width = '0%';
    inView(bar, () => {
      animate(bar,
        { width: ['0%', target] },
        { duration: 0.8, delay: 0.15, easing: EASE_OUT_QUINT }
      );
    });
  });
}

/* ══════════════════════════════════════════
   FETCH & RENDER
   ══════════════════════════════════════════ */

/* Track current location for share / save */
let currentLocation = { lat: null, lon: null, city: '', country: '' };

async function loadWeather(lat, lon, city, country, tz) {
  showState('loading');
  currentLocation = { lat, lon, city, country };
  try {
    /* Fetch weather + activity scores in parallel */
    const [weatherResp, scoresResp] = await Promise.all([
      fetch(`/weather/api/weather/?lat=${lat}&lon=${lon}`),
      fetch(`/weather/api/scores/?lat=${lat}&lon=${lon}&weekly=1`).catch(() => null),
    ]);
    if (!weatherResp.ok) throw 0;
    const weatherData = await weatherResp.json();
    if (weatherData.error) throw 0;

    let scoresData = null;
    if (scoresResp && scoresResp.ok) {
      scoresData = await scoresResp.json();
    }

    render(weatherData, city, country, tz);
    renderScores(scoresData);
    renderWeeklyOutlook(scoresData);
    renderSmartTip(weatherData, scoresData);
    updateSavedBar();
  } catch {
    showError('Failed to load weather data.');
    showState('welcome');
  }
}

/* ── Score rendering ── */
function scoreColor(score) {
  if (score >= 80) return 'var(--accent)';
  if (score >= 60) return 'var(--text-2)';
  return 'var(--text-3)';
}

/** Populate the primary-activity badge in the greeting + best-time widget */
function renderPrimaryHighlight(data) {
  const badge = $('primaryScoreBadge');
  const card = $('bestTimeCard');
  const primaryEl = $('greetingPrimary');
  if (!primaryEl || !data || !data.scores) return;

  const slug = primaryEl.dataset.slug;
  const match = data.scores.find(s => s.slug === slug);
  if (!match) return;

  /* Update badge in greeting bar */
  if (badge) badge.textContent = Math.round(match.score);

  /* Update best-time widget */
  if (card) {
    const timeStr = match.best_window
      ? `${match.best_window.start} – ${match.best_window.end}`
      : 'No ideal window today';
    $('bestTimeValue').textContent = timeStr;

    const pct = Math.min(100, Math.max(0, match.score));
    $('bestTimeRingText').textContent = Math.round(match.score);

    /* Animate ring */
    const ringFill = $('bestTimeRingFill');
    if (ringFill) {
      ringFill.setAttribute('stroke-dasharray', `${pct}, 100`);
    }

    card.style.display = '';

    /* Animate entrance */
    if (motion) {
      const { animate } = motion;
      animate(card,
        { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0)'] },
        { duration: 0.5, delay: 0.15, easing: EASE_OUT_QUINT }
      );
    }
  }
}

function renderScores(data) {
  const section = $('scoresSection');
  const grid = $('scoresGrid');

  /* Always try to populate primary highlight, even if grid is empty */
  renderPrimaryHighlight(data);

  if (!data || !data.scores || !data.scores.length) {
    section.style.display = 'none';
    return;
  }

  /* Show top 6 activities */
  const top = data.scores.slice(0, 6);
  grid.innerHTML = top.map(s => {
    const pct = Math.min(100, Math.max(0, s.score));
    const color = scoreColor(s.score);
    const windowStr = s.best_window
      ? `${s.best_window.start}–${s.best_window.end}`
      : 'No window';

    return `
      <div class="score-card card">
        <div class="score-card-header">
          <span class="score-card-icon"><i data-lucide="${s.icon}"></i></span>
          <span class="score-card-name">${s.name}</span>
        </div>
        <div class="score-card-value" style="color:${color}">${Math.round(s.score)}</div>
        <div class="score-bar-track">
          <div class="score-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="score-card-meta">
          <span class="score-label">${s.label}</span>
          <span class="score-window"><i data-lucide="clock" class="score-clock-icon"></i>${windowStr}</span>
        </div>
      </div>`;
  }).join('');

  section.style.display = '';
  renderIcons();

  /* Animate score bars */
  if (motion) {
    const { animate, stagger } = motion;
    animate(document.querySelectorAll('.score-card'),
      { opacity: [0, 1], transform: ['translateY(16px) scale(0.97)', 'translateY(0) scale(1)'] },
      { duration: 0.45, delay: stagger(0.06, { start: 0.1 }), easing: EASE_OUT_QUINT }
    );
    document.querySelectorAll('.score-bar-fill').forEach(bar => {
      const w = bar.style.width;
      bar.style.width = '0%';
      setTimeout(() => {
        animate(bar, { width: ['0%', w] }, { duration: 0.7, easing: EASE_OUT_QUINT });
      }, 300);
    });
  }
}

/* ══════════════════════════════════════════
   SMART TIP
   ══════════════════════════════════════════ */
function renderSmartTip(weather, scores) {
  const tipEl = $('smartTip');
  const textEl = $('smartTipText');
  if (!tipEl || !textEl) return;

  const cur = weather.current;
  const hourly = weather.hourly || {};
  const precProbs = hourly.precipitation_probability || [];

  // Find primary activity score
  let primaryScore = null;
  let primaryName = '';
  const primaryEl = $('greetingPrimary');
  if (primaryEl && scores && scores.scores) {
    const slug = primaryEl.dataset.slug;
    const match = scores.scores.find(s => s.slug === slug);
    if (match) { primaryScore = match; primaryName = match.name; }
  }

  // Find top activity
  const top = scores && scores.scores && scores.scores[0];

  // Build tip
  let tip = '';

  // Rain incoming?
  const rainHourIdx = precProbs.findIndex((p, i) => i > 0 && p > 60);
  const times = hourly.time || [];

  if (rainHourIdx > 0 && rainHourIdx <= 4) {
    const rainTime = times[rainHourIdx] ? new Date(times[rainHourIdx]).getHours() + ':00' : '';
    tip = `Rain likely around ${rainTime} — head out now if you can.`;
  } else if (primaryScore && primaryScore.score >= 80 && primaryScore.best_window) {
    tip = `Great conditions for ${primaryName} — best window is ${primaryScore.best_window.start}–${primaryScore.best_window.end}.`;
  } else if (primaryScore && primaryScore.score >= 60 && primaryScore.best_window) {
    tip = `Decent ${primaryName} conditions. Aim for ${primaryScore.best_window.start}–${primaryScore.best_window.end}.`;
  } else if (primaryScore && primaryScore.score < 40) {
    if (top && top.score >= 60) {
      tip = `Not ideal for ${primaryName} today — but ${top.name} looks good (score: ${Math.round(top.score)}).`;
    } else {
      tip = `Tough conditions today. Consider an indoor alternative.`;
    }
  } else if (top && top.score >= 80) {
    tip = `Perfect day for ${top.name} — score ${Math.round(top.score)}/100.`;
  } else if (cur.temperature_2m > 35) {
    tip = `It's hot out there — stay hydrated and avoid peak sun hours.`;
  } else if (cur.wind_speed_10m > 40) {
    tip = `Strong winds today — be careful with exposed activities.`;
  } else {
    tip = `Conditions are moderate. Check individual scores for details.`;
  }

  textEl.textContent = tip;
  tipEl.style.display = '';
  renderIcons();

  if (motion) {
    motion.animate(tipEl,
      { opacity: [0, 1], transform: ['translateY(8px)', 'translateY(0)'] },
      { duration: 0.4, delay: 0.2, easing: EASE_OUT_QUINT }
    );
  }
}

/* ══════════════════════════════════════════
   WEEKLY ACTIVITY OUTLOOK
   ══════════════════════════════════════════ */
function renderWeeklyOutlook(scores) {
  const container = $('weeklyOutlook');
  const dotsEl = $('weeklyDots');
  if (!container || !dotsEl || !scores || !scores.weekly) return;

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  dotsEl.innerHTML = scores.weekly.map((d, i) => {
    const dt = new Date(d.date + 'T12:00:00');
    const name = i === 0 ? 'Today' : dayNames[dt.getDay()];
    const score = Math.round(d.score);
    let dotClass = 'dot-low';
    if (score >= 70) dotClass = 'dot-great';
    else if (score >= 50) dotClass = 'dot-ok';

    return `
      <div class="weekly-day">
        <div class="weekly-day-name">${name}</div>
        <div class="weekly-dot ${dotClass}" title="${score}/100 — ${d.label}"></div>
        <div class="weekly-day-score">${score}</div>
      </div>`;
  }).join('');

  container.style.display = '';

  if (motion) {
    const { animate, stagger } = motion;
    animate(dotsEl.querySelectorAll('.weekly-day'),
      { opacity: [0, 1], transform: ['translateY(10px)', 'translateY(0)'] },
      { duration: 0.35, delay: stagger(0.05, { start: 0.1 }), easing: EASE_OUT_QUINT }
    );
  }
}

/* ══════════════════════════════════════════
   SAVED LOCATIONS BAR
   ══════════════════════════════════════════ */
let savedLocations = [];
const savedDataEl = document.getElementById('savedLocationsData');
if (savedDataEl) {
  try { savedLocations = JSON.parse(savedDataEl.textContent); } catch {}
}
const isAuthed = prefsEl && prefsEl.dataset.authed === 'true';

function getCsrf() {
  const cookie = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='));
  return cookie ? cookie.split('=')[1] : '';
}

function updateSavedBar() {
  const bar = $('savedBar');
  if (!bar || !isAuthed) return;

  const isCurrentSaved = savedLocations.some(
    s => s.name === `${currentLocation.city}, ${currentLocation.country}`
       || s.name === currentLocation.city
  );

  let html = '';

  // Save button (only if weather loaded and not already saved)
  if (currentLocation.city && !isCurrentSaved) {
    html += `<button class="saved-chip saved-add" id="btnSaveLocation">
      <i data-lucide="bookmark-plus"></i>
      <span>Save</span>
    </button>`;
  }

  // Saved location chips
  savedLocations.forEach(loc => {
    const isActive = loc.name.startsWith(currentLocation.city);
    html += `<button class="saved-chip${isActive ? ' active' : ''}"
      data-lat="${loc.latitude}" data-lon="${loc.longitude}" data-name="${esc(loc.name)}">
      <i data-lucide="map-pin"></i>
      <span>${esc(loc.name.split(',')[0])}</span>
      <span class="saved-remove" data-remove="${esc(loc.name)}">&times;</span>
    </button>`;
  });

  bar.innerHTML = html;
  if (!html) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  renderIcons();

  // Save click
  const saveBtn = document.getElementById('btnSaveLocation');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      const name = currentLocation.city + (currentLocation.country ? ', ' + currentLocation.country : '');
      try {
        const res = await fetch('/profile/api/save-location/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
          body: JSON.stringify({ name, latitude: currentLocation.lat, longitude: currentLocation.lon }),
        });
        if (res.ok) {
          const data = await res.json();
          savedLocations.push({ name: data.name, latitude: data.latitude, longitude: data.longitude });
          updateSavedBar();
        }
      } catch {}
    });
  }

  // Click to switch
  bar.querySelectorAll('.saved-chip:not(.saved-add)').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('saved-remove')) return;
      const lat = parseFloat(chip.dataset.lat);
      const lon = parseFloat(chip.dataset.lon);
      const parts = chip.dataset.name.split(',').map(s => s.trim());
      loadWeather(lat, lon, parts[0], parts.slice(1).join(', '));
    });
  });

  // Remove
  bar.querySelectorAll('.saved-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = btn.dataset.remove;
      try {
        await fetch('/profile/api/remove-location/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
          body: JSON.stringify({ name }),
        });
        savedLocations = savedLocations.filter(s => s.name !== name);
        updateSavedBar();
      } catch {}
    });
  });
}

// Initial render of saved bar
updateSavedBar();

/* ══════════════════════════════════════════
   SHARE CARD
   ══════════════════════════════════════════ */
const btnShare = $('btnShare');
if (btnShare) {
  btnShare.addEventListener('click', () => {
    const city = $('cityName').textContent;
    const temp = $('currentTemp').textContent;
    const condition = $('currentCondition').textContent;

    let text = `${city} — ${temp}, ${condition}`;

    // Add primary score if available
    const badge = $('primaryScoreBadge');
    const primaryEl = $('greetingPrimary');
    if (badge && primaryEl && badge.textContent !== '--') {
      const actName = primaryEl.querySelector('.greeting-primary-name');
      text += `\n${actName ? actName.textContent : 'Activity'} score: ${badge.textContent}/100`;
    }

    // Add best time if available
    const bestTime = $('bestTimeValue');
    if (bestTime && bestTime.textContent !== '--') {
      text += `\nBest time: ${bestTime.textContent}`;
    }

    text += '\n\nvia Rutea';

    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        btnShare.classList.add('shared');
        btnShare.innerHTML = '<i data-lucide="check"></i>';
        renderIcons();
        setTimeout(() => {
          btnShare.classList.remove('shared');
          btnShare.innerHTML = '<i data-lucide="share-2"></i>';
          renderIcons();
        }, 2000);
      }).catch(() => {});
    }
  });
}

function render(data, city, country, timezone) {
  const tz = timezone || data.timezone || 'UTC';
  const cur = data.current;
  const daily = data.daily;
  const hourly = data.hourly;
  const isDay = cur.is_day === 1;

  document.body.classList.toggle('night', !isDay);

  /* Hero */
  $('cityName').textContent = city || 'Unknown';
  $('countryName').textContent = country || '';
  const info = wmo(cur.weather_code, isDay);
  $('currentIcon').innerHTML = weatherIcon(info.icon, 'hero-condition-icon');
  $('currentTemp').innerHTML =
    `${toUserTemp(cur.temperature_2m)}<span class="hero-temp-unit">${tempUnit()}</span>`;
  $('currentCondition').textContent = info.desc;

  /* Hero lava hue based on conditions */
  const heroCard = $('heroCard');
  const mood = weatherMood(cur.weather_code, isDay);
  heroCard.style.setProperty('--hue', mood.hue);
  heroCard.style.setProperty('--hue-alt', mood.alt);

  /* Details */
  $('feelsLike').textContent = `${toUserTemp(cur.apparent_temperature)}${tempUnit()}`;
  $('humidity').textContent = `${cur.relative_humidity_2m}%`;
  $('windSpeed').textContent = `${toUserSpeed(cur.wind_speed_10m)} ${speedUnit()}`;
  $('windDir').textContent = windLabel(cur.wind_direction_10m);
  $('pressure').textContent = `${Math.round(cur.surface_pressure)} hPa`;

  const uv = daily.uv_index_max ? daily.uv_index_max[0] : null;
  $('uvIndex').textContent = uv != null ? uv.toFixed(1) : '--';
  $('uvLabel').textContent = uv != null ? uvLabel(uv) : '';
  $('maxWind').textContent = daily.wind_speed_10m_max
    ? `${toUserSpeed(daily.wind_speed_10m_max[0])} ${speedUnit()}`
    : '--';

  /* Sunrise / Sunset */
  function fmtTime(iso) {
    if (!iso) return '--:--';
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  $('sunrise').textContent = fmtTime(daily.sunrise ? daily.sunrise[0] : null);
  $('sunset').textContent = fmtTime(daily.sunset ? daily.sunset[0] : null);

  /* Clock */
  startClock(tz);

  /* Hourly */
  const scroll = $('hourlyScroll');
  scroll.innerHTML = '';
  if (hourly && hourly.time) {
    const len = Math.min(hourly.time.length, 24);
    for (let i = 0; i < len; i++) {
      const dt = new Date(hourly.time[i]);
      const hh = dt.getHours().toString().padStart(2, '0') + ':00';
      const hIsDay = hourly.is_day ? hourly.is_day[i] === 1 : true;
      const hi = wmo(hourly.weather_code[i], hIsDay);
      const prec = hourly.precipitation_probability
        ? hourly.precipitation_probability[i]
        : 0;
      const item = document.createElement('div');
      item.className = 'hourly-item' + (i === 0 ? ' now' : '');
      item.innerHTML = `
        <div class="hourly-time">${i === 0 ? 'Now' : hh}</div>
        <div class="hourly-icon">${weatherIcon(hi.icon, 'condition-icon')}</div>
        <div class="hourly-temp">${toUserTemp(hourly.temperature_2m[i])}\u00B0</div>
        ${prec > 0 ? `<div class="hourly-precip"><i data-lucide="droplets" class="precip-icon"></i>${prec}%</div>` : ''}`;
      scroll.appendChild(item);
    }
  }

  /* 7-day forecast */
  const list = $('forecastList');
  list.innerHTML = '';
  const dayN = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  let gMin = Infinity, gMax = -Infinity;
  for (let i = 0; i < daily.time.length; i++) {
    gMin = Math.min(gMin, daily.temperature_2m_min[i]);
    gMax = Math.max(gMax, daily.temperature_2m_max[i]);
  }
  const range = gMax - gMin || 1;

  for (let i = 0; i < daily.time.length; i++) {
    const dt = new Date(daily.time[i] + 'T12:00:00');
    const name = i === 0 ? 'Today' : dayN[dt.getDay()];
    const fi = wmo(daily.weather_code[i], true);
    const lo = toUserTemp(daily.temperature_2m_min[i]);
    const hi = toUserTemp(daily.temperature_2m_max[i]);
    const prec = daily.precipitation_probability_max[i];

    const left = ((daily.temperature_2m_min[i] - gMin) / range * 100).toFixed(1);
    const width = (((daily.temperature_2m_max[i] - daily.temperature_2m_min[i]) / range) * 100).toFixed(1);

    const row = document.createElement('div');
    row.className = 'forecast-row';
    row.innerHTML = `
      <div class="forecast-day-name ${i === 0 ? 'today' : ''}">${name}</div>
      <div class="forecast-row-icon">${weatherIcon(fi.icon, 'condition-icon')}</div>
      <div class="forecast-row-desc">${fi.desc}</div>
      <div class="forecast-precip-badge">${prec > 0 ? `<i data-lucide="droplets" class="precip-icon"></i>${prec}%` : ''}</div>
      <div class="forecast-temp-range">
        <span class="forecast-low-val">${lo}\u00B0</span>
        <div class="forecast-bar-track">
          <div class="forecast-bar-fill" style="left:${left}%;width:${width}%"></div>
        </div>
        <span class="forecast-high-val">${hi}\u00B0</span>
      </div>`;
    list.appendChild(row);
  }

  showState('weather');

  /* Convert all Lucide <i> tags to SVGs */
  renderIcons();

  /* Trigger Motion entrance animations */
  animateDashboardEntrance();
}

/* ══════════════════════════════════════════
   AUTO-LOAD HOME LOCATION
   ══════════════════════════════════════════ */
if (prefsEl && prefsEl.dataset.homeLat && prefsEl.dataset.homeLon) {
  const lat = parseFloat(prefsEl.dataset.homeLat);
  const lon = parseFloat(prefsEl.dataset.homeLon);
  const name = prefsEl.dataset.homeName || '';
  const parts = name.split(',').map(s => s.trim());
  const city = parts[0] || 'Home';
  const country = parts.slice(1).join(', ');
  loadWeather(lat, lon, city, country);
}
