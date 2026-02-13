// ================== roads_live.js ==================
// National Highways WebTRIS integration

const ROADS = {
  base: CONTROL_ROOM_CONFIG.webtris.baseUrl,
  version: CONTROL_ROOM_CONFIG.webtris.version || "v1.0",
  sites: [],
  markerById: new Map(),
  cache: new Map(), // key: `${siteId}:${ddmmyyyy}`
  query: "",
  timer: null,
  active: false
};

let roadsRouteLayer = null;

function toDdmmyyyy(dateObj) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function getRoadDateInput() {
  return document.getElementById("roads-date");
}

function getSelectedRoadDate() {
  const el = getRoadDateInput();
  if (!el || !el.value) {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    return y;
  }
  return new Date(`${el.value}T00:00:00`);
}

function speedTone(avgMph) {
  if (!Number.isFinite(avgMph)) return { color: "#64748b", label: "Unknown" };
  if (avgMph >= 55) return { color: "#22c55e", label: "Flowing" };
  if (avgMph >= 35) return { color: "#f59e0b", label: "Moderate" };
  return { color: "#ef4444", label: "Congested" };
}

async function fetchWebtris(path) {
  const normalized = String(path || "").replace(/^\/+/, "");
  const directUrl = `${ROADS.base}/${normalized}`;

  // Try local proxy first.
  try {
    const proxyResp = await apiFetch(`/webtris/${normalized}`, { headers: { Accept: "application/json" } });
    if (proxyResp.ok) return proxyResp;
    if (proxyResp.status !== 404 && proxyResp.status < 500) return proxyResp;
  } catch (_) {
    // fallback to direct
  }

  return fetch(directUrl, { headers: { Accept: "application/json" } });
}

async function fetchWebtrisJson(path) {
  const r = await fetchWebtris(path);
  if (r.status === 204) return null;
  if (!r.ok) throw new Error(`WebTRIS HTTP ${r.status}`);
  return r.json();
}

async function loadRoadSites() {
  if (ROADS.sites.length) return ROADS.sites;
  const data = await fetchWebtrisJson(`${ROADS.version}/sites`);
  ROADS.sites = Array.isArray(data?.sites) ? data.sites : [];
  return ROADS.sites;
}

function getSitesForCurrentView() {
  const maxCount = CONTROL_ROOM_CONFIG.webtris.maxPlottedSites || 600;
  const query = (ROADS.query || "").trim().toLowerCase();
  const bounds = map.getBounds().pad(0.6);
  let list = ROADS.sites;

  if (query) {
    list = list.filter((s) => {
      const id = String(s?.Id || "").toLowerCase();
      const name = String(s?.Name || "").toLowerCase();
      const desc = String(s?.Description || "").toLowerCase();
      return id.includes(query) || name.includes(query) || desc.includes(query);
    });
  } else {
    list = list.filter((s) => String(s?.Status || "").toLowerCase() === "active");
  }

  const inView = list.filter((s) => {
    const lat = Number(s?.Latitude);
    const lon = Number(s?.Longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && bounds.contains([lat, lon]);
  });

  const selected = (inView.length ? inView : list).slice(0, maxCount);
  return selected;
}

function renderRoadResults(items) {
  const wrap = document.getElementById("roads-results");
  if (!wrap) return;
  if (!items.length) {
    wrap.innerHTML = '<div class="nr-empty">No road sites match this query</div>';
    return;
  }
  wrap.innerHTML = items.slice(0, 40).map((s) => {
    const id = escapeHtml(String(s.Id || ""));
    const name = escapeHtml(String(s.Description || s.Name || "Road Site"));
    const status = escapeHtml(String(s.Status || "Unknown"));
    return (
      `<div class="roads-result-item" data-road-site-id="${id}">` +
      `<div class="roads-result-title">${name}</div>` +
      `<div class="roads-result-meta">Site ${id} | ${status}</div>` +
      `</div>`
    );
  }).join("");

  wrap.querySelectorAll("[data-road-site-id]").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-road-site-id");
      const marker = ROADS.markerById.get(id);
      if (!marker) return;
      map.setView(marker.getLatLng(), Math.max(map.getZoom(), 11), { animate: true });
      marker.openPopup();
    });
  });
}

async function fetchSiteDailySummary(siteId, dateObj) {
  const dateKey = toDdmmyyyy(dateObj);
  const cacheKey = `${siteId}:${dateKey}`;
  if (ROADS.cache.has(cacheKey)) return ROADS.cache.get(cacheKey);

  const path = `${ROADS.version}/reports/Daily?sites=${encodeURIComponent(siteId)}&start_date=${dateKey}&end_date=${dateKey}&page=1&page_size=96`;
  const data = await fetchWebtrisJson(path);
  const rows = Array.isArray(data?.Rows) ? data.Rows : [];

  if (!rows.length) {
    const empty = { avgMph: NaN, totalVolume: 0, samples: 0 };
    ROADS.cache.set(cacheKey, empty);
    return empty;
  }

  let mphSum = 0;
  let mphN = 0;
  let volume = 0;
  for (const row of rows) {
    const mph = Number(row["Avg mph"]);
    const vol = Number(row["Total Volume"]);
    if (Number.isFinite(mph)) {
      mphSum += mph;
      mphN += 1;
    }
    if (Number.isFinite(vol)) volume += vol;
  }

  const summary = {
    avgMph: mphN ? (mphSum / mphN) : NaN,
    totalVolume: volume,
    samples: rows.length
  };
  ROADS.cache.set(cacheKey, summary);
  return summary;
}

function clearRoadMarkers() {
  layers.roads.clearLayers();
  ROADS.markerById.clear();
  roadsRouteLayer = null;
}

function roadCorridorKey(site) {
  const raw = String(site?.Description || site?.Name || "").toUpperCase();
  const m = raw.match(/\b([AM]\d{1,3}[A-Z]?)\b/);
  if (m) return m[1];
  const m2 = raw.match(/\b(A\d{1,4}|M\d{1,3})\b/);
  return m2 ? m2[1] : "";
}

function buildRoadRouteOverlays(sites) {
  if (!Array.isArray(sites) || !sites.length) return;
  roadsRouteLayer = L.layerGroup().addTo(layers.roads);

  const grouped = new Map();
  for (const s of sites) {
    const key = roadCorridorKey(s);
    if (!key) continue;
    const lat = Number(s?.Latitude);
    const lon = Number(s?.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ site: s, lat, lon });
  }

  for (const [key, pts] of grouped.entries()) {
    if (pts.length < 3) continue;
    const sorted = pts.sort((a, b) => (a.lon - b.lon) || (a.lat - b.lat));
    const latLngs = [];
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i];
      if (!latLngs.length) {
        latLngs.push([cur.lat, cur.lon]);
        continue;
      }
      const prev = sorted[i - 1];
      const gap = haversineKm(prev.lat, prev.lon, cur.lat, cur.lon);
      if (gap <= 30) latLngs.push([cur.lat, cur.lon]);
    }
    if (latLngs.length < 2) continue;
    const line = L.polyline(latLngs, {
      color: "#f97316",
      weight: 2.4,
      opacity: 0.5,
      dashArray: "5 5",
      className: "roads-route-line"
    }).addTo(roadsRouteLayer);
    line.bindTooltip(`Road corridor ${key}`, { sticky: true, direction: "top", opacity: 0.9 });
  }
}

function baseRoadPopup(site) {
  const id = escapeHtml(String(site?.Id || ""));
  const name = escapeHtml(String(site?.Description || site?.Name || "Road Site"));
  const status = escapeHtml(String(site?.Status || "Unknown"));
  return (
    `<strong>${name}</strong>` +
    `<div class="nr-card-meta">Site ${id} | ${status}</div>` +
    `<div class="nr-empty">Loading traffic report...</div>`
  );
}

function roadPopupWithSummary(site, summary, dateObj) {
  const id = escapeHtml(String(site?.Id || ""));
  const name = escapeHtml(String(site?.Description || site?.Name || "Road Site"));
  const status = escapeHtml(String(site?.Status || "Unknown"));
  const tone = speedTone(summary.avgMph);
  const dateLabel = dateObj.toLocaleDateString("en-GB");
  const avg = Number.isFinite(summary.avgMph) ? `${summary.avgMph.toFixed(1)} mph` : "No speed data";
  return (
    `<strong>${name}</strong>` +
    `<div class="nr-card-meta">Site ${id} | ${status}</div>` +
    `<div class="nr-card-meta">Date ${escapeHtml(dateLabel)} | ${summary.samples} intervals</div>` +
    `<div class="nr-card-meta">Avg speed: <span style="color:${tone.color};font-weight:700">${escapeHtml(avg)}</span> (${tone.label})</div>` +
    `<div class="nr-card-meta">Total volume: ${escapeHtml(String(summary.totalVolume))}</div>`
  );
}

async function plotRoadSites() {
  if (!map.hasLayer(layers.roads)) return;
  const items = getSitesForCurrentView();
  clearRoadMarkers();
  buildRoadRouteOverlays(items);
  renderRoadResults(items);

  const dateObj = getSelectedRoadDate();
  for (const site of items) {
    const lat = Number(site?.Latitude);
    const lon = Number(site?.Longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const marker = L.circleMarker([lat, lon], {
      radius: 5.5,
      color: "#f97316",
      weight: 1.4,
      fillColor: "#fb923c",
      fillOpacity: 0.88
    }).addTo(layers.roads);
    marker.bindPopup(baseRoadPopup(site));
    marker.bindTooltip(`${site.Description || site.Name || "Road site"} (${site.Id})`, {
      sticky: true,
      direction: "top",
      opacity: 0.95
    });
    ROADS.markerById.set(String(site.Id), marker);

    marker.on("popupopen", async () => {
      try {
        const summary = await fetchSiteDailySummary(site.Id, dateObj);
        const tone = speedTone(summary.avgMph);
        marker.setStyle({ color: tone.color, fillColor: tone.color });
        marker.setPopupContent(roadPopupWithSummary(site, summary, dateObj));
      } catch (err) {
        marker.setPopupContent(
          `<strong>${escapeHtml(String(site.Description || site.Name || "Road Site"))}</strong>` +
          `<div class="nr-alert">Traffic report unavailable (${escapeHtml(String(err?.message || err || "error"))})</div>`
        );
      }
    });
  }

  setStatus(`Roads loaded: ${items.length} WebTRIS sites`);
}

async function activateRoads() {
  ROADS.active = true;
  try {
    await loadRoadSites();
    await plotRoadSites();
  } catch (err) {
    console.warn("Road sites load failed:", err);
    const wrap = document.getElementById("roads-results");
    if (wrap) wrap.innerHTML = `<div class="nr-alert">WebTRIS unavailable (${escapeHtml(String(err?.message || err))})</div>`;
    setStatus("Road traffic fetch failed");
    return;
  }

  if (ROADS.timer) clearInterval(ROADS.timer);
  ROADS.timer = setInterval(() => {
    if (ROADS.active && map.hasLayer(layers.roads)) {
      plotRoadSites().catch(() => {});
    }
  }, CONTROL_ROOM_CONFIG.webtris.refreshInterval || 300000);
}

function deactivateRoads() {
  ROADS.active = false;
  if (ROADS.timer) {
    clearInterval(ROADS.timer);
    ROADS.timer = null;
  }
  clearRoadMarkers();
}

function initRoads() {
  const layerCb = document.querySelector('.layer-cb[data-layer="roads"]');
  const searchInput = document.getElementById("roads-site-query");
  const searchBtn = document.getElementById("roads-site-search-btn");
  const refreshBtn = document.getElementById("roads-refresh-btn");
  const clearBtn = document.getElementById("roads-clear-btn");
  const dateInput = getRoadDateInput();
  const results = document.getElementById("roads-results");

  if (dateInput && !dateInput.value) {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    dateInput.value = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
  }
  if (results) {
    results.innerHTML = '<div class="nr-empty">Enable the Roads overlay to load WebTRIS sites</div>';
  }

  const runSearch = async () => {
    ROADS.query = String(searchInput?.value || "").trim();
    if (!ROADS.sites.length) {
      try {
        await loadRoadSites();
      } catch (err) {
        if (results) results.innerHTML = `<div class="nr-alert">Unable to load sites (${escapeHtml(String(err?.message || err))})</div>`;
        return;
      }
    }
    await plotRoadSites();
  };

  searchBtn?.addEventListener("click", () => runSearch());
  searchInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      runSearch();
    }
  });
  refreshBtn?.addEventListener("click", () => {
    ROADS.cache.clear();
    plotRoadSites();
  });
  clearBtn?.addEventListener("click", () => {
    ROADS.query = "";
    if (searchInput) searchInput.value = "";
    ROADS.cache.clear();
    clearRoadMarkers();
    if (results) results.innerHTML = '<div class="nr-empty">Cleared</div>';
  });
  dateInput?.addEventListener("change", () => {
    ROADS.cache.clear();
    plotRoadSites();
  });

  map.on("moveend", () => {
    if (ROADS.active && map.hasLayer(layers.roads)) {
      plotRoadSites().catch(() => {});
    }
  });

  layerCb?.addEventListener("change", () => {
    if (layerCb.checked) activateRoads();
    else deactivateRoads();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initRoads);
} else {
  initRoads();
}
