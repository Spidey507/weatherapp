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

  animate(document.querySelectorAll('.detail-card'),
    { opacity: [0, 1], transform: ['translateY(24px) scale(0.96)', 'translateY(0) scale(1)'] },
    { duration: 0.5, delay: stagger(0.06, { start: 0.15 }), easing: EASE_OUT_QUINT }
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

async function loadWeather(lat, lon, city, country, tz) {
  showState('loading');
  try {
    const r = await fetch(`/weather/api/weather/?lat=${lat}&lon=${lon}`);
    if (!r.ok) throw 0;
    const d = await r.json();
    if (d.error) throw 0;
    render(d, city, country, tz);
  } catch {
    showError('Failed to load weather data.');
    showState('welcome');
  }
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
    `${Math.round(cur.temperature_2m)}<span class="hero-temp-unit">&deg;C</span>`;
  $('currentCondition').textContent = info.desc;

  /* Hero lava hue based on conditions */
  const heroCard = $('heroCard');
  const mood = weatherMood(cur.weather_code, isDay);
  heroCard.style.setProperty('--hue', mood.hue);
  heroCard.style.setProperty('--hue-alt', mood.alt);

  /* Details */
  $('feelsLike').textContent = `${Math.round(cur.apparent_temperature)}\u00B0C`;
  $('humidity').textContent = `${cur.relative_humidity_2m}%`;
  $('windSpeed').textContent = `${Math.round(cur.wind_speed_10m)} km/h`;
  $('windDir').textContent = windLabel(cur.wind_direction_10m);
  $('pressure').textContent = `${Math.round(cur.surface_pressure)} hPa`;

  const uv = daily.uv_index_max ? daily.uv_index_max[0] : null;
  $('uvIndex').textContent = uv != null ? uv.toFixed(1) : '--';
  $('uvLabel').textContent = uv != null ? uvLabel(uv) : '';
  $('maxWind').textContent = daily.wind_speed_10m_max
    ? `${Math.round(daily.wind_speed_10m_max[0])} km/h`
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
        <div class="hourly-temp">${Math.round(hourly.temperature_2m[i])}\u00B0</div>
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
    const lo = Math.round(daily.temperature_2m_min[i]);
    const hi = Math.round(daily.temperature_2m_max[i]);
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
