'use strict';

/* ── DOM helpers ── */
const $ = (id) => document.getElementById(id);

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ── Map init ── */
const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
}).setView([8.98, -79.52], 13);  // Default: Panama City

L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.attribution({ position: 'bottomright', prefix: false }).addTo(map);

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
  maxZoom: 19,
}).addTo(map);

let markers = [];
let activeSpot = null;
let currentScores = null;
let fetchController = null;

/* ── Custom marker icon ── */
function spotIcon(category, score) {
  let color = 'rgba(255,255,255,0.25)'; // low
  if (score >= 70) color = '#D4956B';    // great (accent)
  else if (score >= 50) color = 'rgba(255,255,255,0.55)'; // ok

  const size = score >= 70 ? 14 : 11;
  const glow = score >= 70 ? `box-shadow: 0 0 10px ${color};` : '';

  return L.divIcon({
    className: 'spot-marker',
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${color};border:2px solid rgba(255,255,255,0.3);
      ${glow}
    "></div>`,
    iconSize: [size + 4, size + 4],
    iconAnchor: [(size + 4) / 2, (size + 4) / 2],
  });
}

/* ── Score a spot based on its activities and current weather scores ── */
function scoreSpot(spot) {
  if (!currentScores || !currentScores.scores) return 0;
  const matching = currentScores.scores.filter(s =>
    spot.activities.includes(s.slug)
  );
  if (!matching.length) return 0;
  // Best matching activity score
  return Math.max(...matching.map(s => s.score));
}

function spotLabel(spot) {
  if (!currentScores || !currentScores.scores) return null;
  const matching = currentScores.scores.filter(s =>
    spot.activities.includes(s.slug)
  );
  if (!matching.length) return null;
  matching.sort((a, b) => b.score - a.score);
  return matching[0];
}

/* ── Fetch spots + scores for a location ── */
async function loadSpots(lat, lon) {
  const loading = $('mapLoading');
  loading.style.display = '';

  // Cancel any previous request
  if (fetchController) fetchController.abort();
  fetchController = new AbortController();

  try {
    const [spotsResp, scoresResp] = await Promise.all([
      fetch(`/explore/api/spots/?lat=${lat}&lon=${lon}&radius=8000`, { signal: fetchController.signal }),
      fetch(`/weather/api/scores/?lat=${lat}&lon=${lon}`, { signal: fetchController.signal }).catch(() => null),
    ]);

    if (!spotsResp.ok) throw new Error('Spots fetch failed');
    const spotsData = await spotsResp.json();

    if (scoresResp && scoresResp.ok) {
      currentScores = await scoresResp.json();
    }

    renderSpots(spotsData.spots || []);
  } catch (e) {
    if (e.name !== 'AbortError') {
      console.error('Failed to load spots:', e);
    }
  } finally {
    loading.style.display = 'none';
  }
}

/* ── Render spots as markers ── */
function renderSpots(spots) {
  // Clear old markers
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  spots.forEach(spot => {
    const score = scoreSpot(spot);
    const marker = L.marker([spot.lat, spot.lon], {
      icon: spotIcon(spot.category, score),
    });

    marker.on('click', () => openSpotSheet(spot, score));
    marker.addTo(map);
    markers.push(marker);
  });
}

/* ── Spot detail sheet ── */
function openSpotSheet(spot, score) {
  activeSpot = spot;
  const sheet = $('spotSheet');

  $('sheetName').textContent = spot.name;
  $('sheetCategory').textContent = spot.category.charAt(0).toUpperCase() + spot.category.slice(1);
  $('sheetIcon').innerHTML = `<i data-lucide="${spot.icon}"></i>`;

  // Activity scores for this spot
  const scoresEl = $('sheetScores');
  if (currentScores && currentScores.scores) {
    const matching = currentScores.scores.filter(s =>
      spot.activities.includes(s.slug)
    );
    if (matching.length) {
      matching.sort((a, b) => b.score - a.score);
      scoresEl.innerHTML = matching.map(s => {
        const pct = Math.min(100, Math.max(0, s.score));
        let dotClass = 'dot-low';
        if (s.score >= 70) dotClass = 'dot-great';
        else if (s.score >= 50) dotClass = 'dot-ok';

        return `
          <div class="sheet-score-row">
            <span class="sheet-score-dot ${dotClass}"></span>
            <span class="sheet-score-name">${s.name}</span>
            <span class="sheet-score-val">${Math.round(s.score)}</span>
            <div class="sheet-score-bar">
              <div class="sheet-score-fill" style="width:${pct}%"></div>
            </div>
            ${s.best_window ? `<span class="sheet-score-window">${s.best_window.start}–${s.best_window.end}</span>` : ''}
          </div>`;
      }).join('');
    } else {
      scoresEl.innerHTML = '<div class="sheet-no-scores">No matching activities</div>';
    }
  } else {
    scoresEl.innerHTML = '<div class="sheet-no-scores">Scores unavailable</div>';
  }

  sheet.classList.add('open');
  if (window.lucide) lucide.createIcons();

  // Center map on spot
  map.panTo([spot.lat, spot.lon], { animate: true });
}

function closeSpotSheet() {
  $('spotSheet').classList.remove('open');
  activeSpot = null;
}

$('sheetClose').addEventListener('click', closeSpotSheet);

// Directions button — open in Google Maps
$('sheetDirections').addEventListener('click', () => {
  if (!activeSpot) return;
  window.open(
    `https://www.google.com/maps/dir/?api=1&destination=${activeSpot.lat},${activeSpot.lon}`,
    '_blank'
  );
});

// Weather button — go to home tab with this location
$('sheetWeather').addEventListener('click', () => {
  if (!activeSpot) return;
  window.location.href = `/?lat=${activeSpot.lat}&lon=${activeSpot.lon}&city=${encodeURIComponent(activeSpot.name)}`;
});

/* ── Map search ── */
const mapInput = $('mapSearchInput');
const mapResults = $('mapSearchResults');
let mapDebounce = null;

mapInput.addEventListener('input', () => {
  clearTimeout(mapDebounce);
  const q = mapInput.value.trim();
  if (q.length < 2) { mapResults.innerHTML = ''; mapResults.classList.remove('visible'); return; }
  mapDebounce = setTimeout(async () => {
    try {
      const r = await fetch(`/weather/api/geocode/?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      renderMapSearch(d.results || []);
    } catch { mapResults.classList.remove('visible'); }
  }, 300);
});

mapInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') mapResults.classList.remove('visible');
});

function renderMapSearch(results) {
  if (!results.length) { mapResults.classList.remove('visible'); return; }
  mapResults.innerHTML = results.map((r, i) => `
    <div class="map-result-item" data-i="${i}">
      <strong>${esc(r.name)}</strong>
      <span>${esc((r.admin1 ? r.admin1 + ', ' : '') + r.country)}</span>
    </div>`).join('');

  mapResults.querySelectorAll('.map-result-item').forEach(el => {
    el.addEventListener('click', () => {
      const r = results[+el.dataset.i];
      mapInput.value = r.name;
      mapResults.classList.remove('visible');
      map.flyTo([r.latitude, r.longitude], 14, { duration: 1.2 });
      loadSpots(r.latitude, r.longitude);
    });
  });
  mapResults.classList.add('visible');
}

// Close search results on click outside
document.addEventListener('click', (e) => {
  if (!mapResults.contains(e.target) && e.target !== mapInput) {
    mapResults.classList.remove('visible');
  }
});

/* ── Locate me ── */
$('mapLocateBtn').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      map.flyTo([latitude, longitude], 14, { duration: 1.2 });
      loadSpots(latitude, longitude);
    },
    () => { /* silently fail */ },
    { enableHighAccuracy: false, timeout: 10000 }
  );
});

/* ── Load on map move (debounced) ── */
let moveTimer = null;
map.on('moveend', () => {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => {
    const c = map.getCenter();
    loadSpots(c.lat, c.lng);
  }, 800);
});

/* ── Initial load ── */
// Try user's geolocation, fallback to default
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 14);
      loadSpots(latitude, longitude);
    },
    () => {
      // Fallback: load default location
      loadSpots(8.98, -79.52);
    },
    { enableHighAccuracy: false, timeout: 8000 }
  );
} else {
  loadSpots(8.98, -79.52);
}
