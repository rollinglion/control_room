// ================== tfl_live.js ==================
// TfL API Integration: Line Status, Live Arrivals, Santander Cycles

const TFL = {
  base: CONTROL_ROOM_CONFIG.tfl.baseUrl,
  arrivalCache: new Map(),  // naptanId -> { data, ts }
  statusTimer: null,
  bikesTimer: null,
  bikesLoaded: false,
  stopSearchLayer: null,
  stopMarkers: new Map(), // stopPointId -> marker
  lastStopResults: [],
  stopMeta: {
    modes: [],
    stopTypes: []
  }
};

async function fetchTfl(path) {
  const normalized = String(path || "").startsWith("/") ? path : `/${path}`;

  // Proxy first (scripts/dev_server.py -> /tfl/*)
  try {
    const proxyResp = await apiFetch(`/tfl${normalized}`, {
      headers: { "Accept": "application/json" }
    });
    if (proxyResp.ok) return proxyResp;
    if (proxyResp.status !== 404 && proxyResp.status < 500) return proxyResp;
  } catch (_) {
    // Fall through to direct endpoint
  }

  return fetch(`${TFL.base}${normalized}`, {
    headers: { "Accept": "application/json" }
  });
}

// Official TfL line colours
const TFL_LINE_COLOURS = {
  bakerloo: "#a45a2a",
  central: "#da291c",
  circle: "#ffcd00",
  district: "#007a33",
  "hammersmith-city": "#e89cae",
  jubilee: "#7C878e",
  metropolitan: "#840b55",
  northern: "#000000",
  piccadilly: "#10069f",
  victoria: "#00a3e0",
  "waterloo-city": "#6eceb2",
  dlr: "#00b2a9",
  "elizabeth-line": "#753bbd",
  elizabeth: "#753bbd",
  "london-overground": "#e87722",
  overground: "#e87722",
  tram: "#78be20",
  "lioness": "#ef9600",
  "mildmay": "#2774ae",
  "suffragette": "#5ba763",
  "weaver": "#893b67",
  "windrush": "#d22730",
  "liberty": "#606667"
};

function normalizeTflLineId(lineId) {
  const id = String(lineId || "").toLowerCase();
  if (id === "elizabeth") return "elizabeth-line";
  if (id === "london-overground") return "overground";
  return id;
}

const TFL_STOP_MODES_DEFAULT = ["tube", "dlr", "overground", "elizabeth-line", "tram", "bus", "national-rail"];
const TFL_STOP_TYPES_NEARBY = "NaptanMetroStation,NaptanRailStation,NaptanPublicBusCoachTram";

function getSelectedStopMode() {
  const el = document.getElementById("tfl-stop-mode");
  return (el?.value || "").trim();
}

function ensureUndergroundLayerVisible() {
  const cb = document.querySelector('[data-layer="underground"]');
  if (cb && !cb.checked) {
    cb.checked = true;
    cb.dispatchEvent(new Event("change"));
  }
}

function ensureStopSearchLayer() {
  if (TFL.stopSearchLayer) return TFL.stopSearchLayer;
  TFL.stopSearchLayer = L.layerGroup();
  if (layers?.underground) {
    layers.underground.addLayer(TFL.stopSearchLayer);
  } else {
    TFL.stopSearchLayer.addTo(map);
  }
  return TFL.stopSearchLayer;
}

function getStopLatLng(stop) {
  const lat = Number(stop?.lat);
  const lon = Number(stop?.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return [lat, lon];
  return null;
}

function clearStopPointMarkers() {
  if (TFL.stopSearchLayer) TFL.stopSearchLayer.clearLayers();
  TFL.stopMarkers.clear();
}

async function fetchTflJson(path) {
  const r = await fetchTfl(path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function getStopPrimaryMode(stop) {
  const mode = stop?.modes?.[0] || "";
  return String(mode).toLowerCase();
}

function getStopMarkerColor(stop) {
  const mode = getStopPrimaryMode(stop);
  if (mode === "tube" || mode === "dlr" || mode === "tram" || mode === "overground" || mode === "elizabeth-line") {
    return "#f43f5e";
  }
  if (mode === "bus") return "#22c55e";
  if (mode === "national-rail") return "#38bdf8";
  return "#a78bfa";
}

// ══════════════════════════════════════════════════════
// LINE STATUS
// ══════════════════════════════════════════════════════

async function fetchTflLineStatus() {
  try {
    const modes = "tube,dlr,overground,elizabeth-line,tram";
    const r = await fetchTfl(`/Line/Mode/${modes}/Status`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const lines = await r.json();
    renderLineStatus(lines);
    if (typeof window.updateTflLineStylesFromStatus === "function") {
      window.updateTflLineStylesFromStatus(lines);
    }
    return lines;
  } catch (e) {
    console.warn("TfL line status fetch failed:", e);
    const grid = document.getElementById("tfl-status-grid");
    if (grid) grid.innerHTML = '<div class="tfl-status-loading">Status unavailable</div>';
    return null;
  }
}

function getStatusBadge(severity) {
  if (severity === 10) return { text: "Good", cls: "tfl-badge-good" };
  if (severity === 9) return { text: "Minor Delays", cls: "tfl-badge-minor" };
  if (severity >= 6 && severity <= 8) return { text: "Severe", cls: "tfl-badge-severe" };
  if (severity >= 3 && severity <= 5) return { text: "Part Closed", cls: "tfl-badge-severe" };
  if (severity <= 2) return { text: "Suspended", cls: "tfl-badge-closed" };
  if (severity === 16 || severity === 20) return { text: "Closed", cls: "tfl-badge-closed" };
  return { text: "Info", cls: "tfl-badge-info" };
}

function renderLineStatus(lines) {
  const grid = document.getElementById("tfl-status-grid");
  const timeEl = document.getElementById("tfl-status-time");
  if (!grid) return;

  grid.innerHTML = "";

  // Sort: disrupted lines first, then alphabetically
  const sorted = [...lines].sort((a, b) => {
    const sa = a.lineStatuses?.[0]?.statusSeverity ?? 10;
    const sb = b.lineStatuses?.[0]?.statusSeverity ?? 10;
    if (sa !== sb) return sa - sb;  // lower severity (worse) first
    return a.name.localeCompare(b.name);
  });

  for (const line of sorted) {
    const status = line.lineStatuses?.[0];
    const severity = status?.statusSeverity ?? 10;
    const badge = getStatusBadge(severity);
    const normalizedId = normalizeTflLineId(line.id);
    const colour = TFL_LINE_COLOURS[line.id] || TFL_LINE_COLOURS[normalizedId] || "#64748b";
    const reason = status?.reason || "";

    const row = document.createElement("div");
    row.className = "tfl-status-row";
    row.dataset.lineId = normalizedId;
    row.setAttribute("role", "button");
    row.setAttribute("tabindex", "0");
    if (window._selectedTflLineId === normalizedId) {
      row.classList.add("active");
    }
    if (reason) row.title = reason;
    if (!reason) row.title = `Click to highlight ${line.name}`;

    row.innerHTML =
      `<span class="tfl-status-dot" style="background:${colour}"></span>` +
      `<span class="tfl-status-name">${escapeHtml(line.name)}</span>` +
      `<span class="tfl-status-badge ${badge.cls}">${badge.text}</span>`;

    row.addEventListener("click", () => {
      if (typeof window.selectTflLine === "function") {
        window.selectTflLine(normalizedId);
        if (window._selectedTflLineId === normalizedId && typeof window.focusTflLine === "function") {
          window.focusTflLine(normalizedId);
        }
        renderLineStatus(lines);
      }
    });
    row.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        row.click();
      }
    });

    grid.appendChild(row);
  }

  if (timeEl) {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
}

function syncSelectedLineRow(selectedId) {
  const id = String(selectedId || "").toLowerCase();
  const rows = document.querySelectorAll(".tfl-status-row[data-line-id]");
  rows.forEach((row) => {
    if (id && row.dataset.lineId === id) row.classList.add("active");
    else row.classList.remove("active");
  });
}

function startLineStatusPolling() {
  fetchTflLineStatus();
  TFL.statusTimer = setInterval(fetchTflLineStatus, CONTROL_ROOM_CONFIG.tfl.statusRefresh);
}

// ══════════════════════════════════════════════════════
// LIVE ARRIVALS (on-demand per station)
// ══════════════════════════════════════════════════════

// NaPTAN ID cache: stationName -> naptanId
const NAPTAN_CACHE = {};

async function resolveNaptanId(stationName) {
  const key = stationName.toLowerCase().trim();
  if (NAPTAN_CACHE[key]) return NAPTAN_CACHE[key];

  try {
    const matches = await searchStopPoints(stationName, "", 5);
    if (matches.length > 0) {
      NAPTAN_CACHE[key] = matches[0].id;
      return matches[0].id;
    }
  } catch (e) {
    console.warn("NaPTAN resolve failed:", stationName, e);
  }
  return null;
}

async function fetchArrivals(naptanId) {
  // Check cache
  const cached = TFL.arrivalCache.get(naptanId);
  if (cached && Date.now() - cached.ts < CONTROL_ROOM_CONFIG.tfl.arrivalCache) {
    return cached.data;
  }

  try {
    const r = await fetchTfl(`/StopPoint/${naptanId}/Arrivals`);
    if (!r.ok) return [];
    const data = await r.json();

    // Sort by timeToStation ascending
    data.sort((a, b) => (a.timeToStation || 999) - (b.timeToStation || 999));

    TFL.arrivalCache.set(naptanId, { data, ts: Date.now() });

    // LRU cleanup
    if (TFL.arrivalCache.size > 30) {
      const oldest = TFL.arrivalCache.keys().next().value;
      TFL.arrivalCache.delete(oldest);
    }

    return data;
  } catch (e) {
    console.warn("Arrivals fetch failed:", naptanId, e);
    return [];
  }
}

function formatArrivalTime(seconds) {
  if (seconds < 30) return "Due";
  if (seconds < 60) return "<1 min";
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

function renderArrivalsHtml(arrivals) {
  if (!arrivals || arrivals.length === 0) {
    return '<div class="tfl-arrivals"><div class="tfl-arrivals-empty">No upcoming arrivals</div></div>';
  }

  const shown = arrivals.slice(0, 6);
  let html = '<div class="tfl-arrivals"><div class="tfl-arrivals-title">Live Arrivals</div>';

  for (const a of shown) {
    const lineId = (a.lineId || "").toLowerCase();
    const colour = TFL_LINE_COLOURS[lineId] || "#64748b";
    const dest = a.towards || a.destinationName || "Unknown";
    const time = formatArrivalTime(a.timeToStation || 0);
    const platform = a.platformName ? ` (${a.platformName})` : "";

    html +=
      `<div class="tfl-arrival-row">` +
      `<span class="tfl-arrival-line" style="background:${colour}"></span>` +
      `<span class="tfl-arrival-dest" title="${escapeHtml(dest + platform)}">${escapeHtml(dest)}</span>` +
      `<span class="tfl-arrival-time">${time}</span>` +
      `</div>`;
  }

  if (arrivals.length > 6) {
    html += `<div class="tfl-arrivals-empty">+${arrivals.length - 6} more</div>`;
  }

  html += "</div>";
  return html;
}

// Public: build enhanced popup for a TfL station
async function buildTflStationPopup(stationName, linesInfo) {
  let basePopup =
    `<strong>${escapeHtml(stationName)}</strong>` +
    `<span class="popup-label">Lines</span> ${escapeHtml(linesInfo)}`;

  // Start with loading state
  const loadingHtml = basePopup +
    '<div class="tfl-arrivals"><div class="tfl-arrivals-loading">Loading arrivals...</div></div>';

  return {
    loadingHtml,
    fetchFull: async () => {
      const naptanId = await resolveNaptanId(stationName);
      if (!naptanId) {
        return basePopup + '<div class="tfl-arrivals"><div class="tfl-arrivals-empty">Arrivals unavailable</div></div>';
      }
      const arrivals = await fetchArrivals(naptanId);
      return basePopup + renderArrivalsHtml(arrivals);
    }
  };
}
window.buildTflStationPopup = buildTflStationPopup;

// ========================================================
// STOPPOINT TOOLS (Search / Get / Nearby / Route)
// ========================================================

async function fetchStopPointMeta() {
  try {
    const [modes, stopTypes] = await Promise.all([
      fetchTflJson("/StopPoint/Meta/Modes"),
      fetchTflJson("/StopPoint/Meta/StopTypes")
    ]);
    TFL.stopMeta.modes = Array.isArray(modes) ? modes : [];
    TFL.stopMeta.stopTypes = Array.isArray(stopTypes) ? stopTypes : [];
    hydrateStopModeSelect();
  } catch (e) {
    console.warn("TfL StopPoint meta fetch failed:", e);
  }
}

function hydrateStopModeSelect() {
  const select = document.getElementById("tfl-stop-mode");
  if (!select) return;

  const curated = TFL_STOP_MODES_DEFAULT.map((m) => ({ modeName: m }));
  const source = TFL.stopMeta.modes.length ? TFL.stopMeta.modes : curated;
  const selected = select.value || "";

  const options = ['<option value="">All modes</option>'];
  for (const m of source) {
    const mode = String(m?.modeName || "").trim();
    if (!mode) continue;
    const pretty = mode.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    options.push(`<option value="${escapeHtml(mode)}">${escapeHtml(pretty)}</option>`);
  }
  select.innerHTML = options.join("");
  select.value = selected;
}

function normalizeStopResults(data) {
  if (!data) return [];
  if (Array.isArray(data.matches)) return data.matches;
  if (Array.isArray(data.stopPoints)) return data.stopPoints;
  if (Array.isArray(data)) return data;
  return [];
}

async function searchStopPoints(query, mode, maxResults = 12) {
  const q = encodeURIComponent(query.trim());
  const params = new URLSearchParams();
  if (mode) params.set("modes", mode);
  params.set("maxResults", String(maxResults));
  params.set("includeHubs", "true");
  const suffix = params.toString();
  const data = await fetchTflJson(`/StopPoint/Search/${q}${suffix ? `?${suffix}` : ""}`);
  return normalizeStopResults(data);
}

async function fetchStopPointsNearby(lat, lon, mode, radius = 1200) {
  const params = new URLSearchParams();
  params.set("lat", String(lat));
  params.set("lon", String(lon));
  params.set("radius", String(radius));
  params.set("stopTypes", TFL_STOP_TYPES_NEARBY);
  params.set("useStopPointHierarchy", "false");
  params.set("returnLines", "true");
  if (mode) params.set("modes", mode);
  const data = await fetchTflJson(`/StopPoint?${params.toString()}`);
  return normalizeStopResults(data);
}

async function fetchStopPointDetails(stopPointId) {
  if (!stopPointId) return null;
  const data = await fetchTflJson(`/StopPoint/${encodeURIComponent(stopPointId)}`);
  if (Array.isArray(data)) return data[0] || null;
  return data;
}

async function fetchStopPointRoute(stopPointId) {
  if (!stopPointId) return [];
  try {
    const data = await fetchTflJson(`/StopPoint/${encodeURIComponent(stopPointId)}/Route`);
    return Array.isArray(data) ? data : [];
  } catch (_) {
    return [];
  }
}

function formatStopDistance(meters) {
  const m = Number(meters);
  if (!Number.isFinite(m)) return "";
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function buildStopPopupHtml(stop, details, arrivals, routes) {
  const display = details || stop || {};
  const name = display.commonName || display.name || "StopPoint";
  const id = display.id || stop?.id || "";
  const stopType = display.stopType || stop?.stopType || "Unknown";
  const modes = (display.modes || stop?.modes || []).join(", ") || "Unknown";
  const indicator = display.indicator ? ` (${display.indicator})` : "";
  const lines = Array.isArray(display.lines) ? display.lines.map((l) => l.name || l.id).filter(Boolean) : [];
  const routeNames = Array.from(new Set((routes || []).map((r) => r.routeSectionName).filter(Boolean))).slice(0, 3);

  let html =
    `<strong>${escapeHtml(name)}${escapeHtml(indicator)}</strong>` +
    `<span class="popup-label">StopPoint ID</span> ${escapeHtml(id)}` +
    `<span class="popup-label">Type</span> ${escapeHtml(stopType)}` +
    `<span class="popup-label">Modes</span> ${escapeHtml(modes)}`;

  if (lines.length) {
    html += `<span class="popup-label">Lines</span> ${escapeHtml(lines.slice(0, 8).join(", "))}`;
  }
  if (routeNames.length) {
    html += `<span class="popup-label">Routes</span> ${escapeHtml(routeNames.join(" | "))}`;
  }

  html += renderArrivalsHtml(arrivals || []);
  return html;
}

async function refreshStopMarkerPopup(marker, stop) {
  const stopId = stop?.id;
  if (!stopId || !marker) return;

  marker.setPopupContent(
    `<strong>${escapeHtml(stop.commonName || stop.name || "StopPoint")}</strong>` +
    '<div class="tfl-arrivals"><div class="tfl-arrivals-loading">Loading stop data...</div></div>'
  );

  try {
    const [details, arrivals, routes] = await Promise.all([
      fetchStopPointDetails(stopId),
      fetchArrivals(stopId),
      fetchStopPointRoute(stopId)
    ]);
    marker.setPopupContent(buildStopPopupHtml(stop, details, arrivals, routes));
  } catch (e) {
    console.warn("StopPoint detail load failed:", stopId, e);
    marker.setPopupContent(
      `<strong>${escapeHtml(stop.commonName || stop.name || "StopPoint")}</strong>` +
      `<div class="tfl-arrivals"><div class="tfl-arrivals-empty">Stop data unavailable</div></div>`
    );
  }
}

function upsertStopMarker(stop, flyTo = false, openPopup = true) {
  const stopId = stop?.id;
  const latLng = getStopLatLng(stop);
  if (!stopId || !latLng) return null;

  ensureUndergroundLayerVisible();
  const layer = ensureStopSearchLayer();
  let marker = TFL.stopMarkers.get(stopId);

  const color = getStopMarkerColor(stop);
  if (!marker) {
    marker = L.circleMarker(latLng, {
      radius: 7,
      color: color,
      fillColor: color,
      fillOpacity: 0.9,
      weight: 2
    });
    marker.addTo(layer);
    marker.on("click", () => refreshStopMarkerPopup(marker, stop));
    TFL.stopMarkers.set(stopId, marker);
  } else {
    marker.setLatLng(latLng);
    marker.setStyle({ color, fillColor: color });
  }

  marker.bindTooltip(escapeHtml(stop.commonName || stop.name || stopId), {
    sticky: true,
    direction: "top",
    opacity: 0.95
  });

  marker.bindPopup(
    `<strong>${escapeHtml(stop.commonName || stop.name || "StopPoint")}</strong>` +
    '<div class="tfl-arrivals"><div class="tfl-arrivals-loading">Click marker to load live arrivals</div></div>'
  );

  if (flyTo) map.flyTo(latLng, Math.max(map.getZoom(), 13), { duration: 0.55 });
  if (openPopup) {
    marker.openPopup();
    refreshStopMarkerPopup(marker, stop);
  }
  return marker;
}

function renderStopPointResults(stops, contextLabel = "") {
  const panel = document.getElementById("tfl-stop-results");
  if (!panel) return;

  const list = Array.isArray(stops) ? stops : [];
  TFL.lastStopResults = list;

  if (!list.length) {
    panel.innerHTML = '<div class="tfl-stop-results-empty">No StopPoint results</div>';
    return;
  }

  panel.innerHTML = "";
  if (contextLabel) {
    const header = document.createElement("div");
    header.className = "tfl-stop-results-empty";
    header.textContent = contextLabel;
    panel.appendChild(header);
  }

  for (const stop of list.slice(0, 20)) {
    const name = stop.commonName || stop.name || "StopPoint";
    const id = stop.id || "";
    const modeText = (stop.modes || []).join(", ") || "Unknown mode";
    const dist = formatStopDistance(stop.distance);

    const card = document.createElement("div");
    card.className = "tfl-stop-item";
    card.innerHTML =
      `<div class="tfl-stop-item-name">${escapeHtml(name)}</div>` +
      `<div class="tfl-stop-item-meta">${escapeHtml(id)} | ${escapeHtml(modeText)}${dist ? ` | ${escapeHtml(dist)}` : ""}</div>`;

    const actions = document.createElement("div");
    actions.className = "tfl-stop-item-actions";

    const plotBtn = document.createElement("button");
    plotBtn.type = "button";
    plotBtn.className = "btn-secondary btn-sm";
    plotBtn.textContent = "Plot";
    plotBtn.addEventListener("click", () => upsertStopMarker(stop, true, true));

    const detailBtn = document.createElement("button");
    detailBtn.type = "button";
    detailBtn.className = "btn-secondary btn-sm";
    detailBtn.textContent = "Details";
    detailBtn.addEventListener("click", async () => {
      try {
        const details = await fetchStopPointDetails(id);
        const arrivals = await fetchArrivals(id);
        const routes = await fetchStopPointRoute(id);
        const marker = upsertStopMarker(details || stop, true, false);
        if (marker) {
          marker.setPopupContent(buildStopPopupHtml(stop, details, arrivals, routes));
          marker.openPopup();
        }
      } catch (e) {
        console.warn("Stop details failed:", id, e);
      }
    });

    actions.appendChild(plotBtn);
    actions.appendChild(detailBtn);
    card.appendChild(actions);
    panel.appendChild(card);
  }
}

async function runStopPointSearch() {
  const qEl = document.getElementById("tfl-stop-query");
  const panel = document.getElementById("tfl-stop-results");
  const query = qEl?.value?.trim() || "";
  if (!query) {
    if (panel) panel.innerHTML = '<div class="tfl-stop-results-empty">Enter a station, stop, or stop code</div>';
    return;
  }

  if (panel) panel.innerHTML = '<div class="tfl-stop-results-empty">Searching StopPoint API...</div>';
  try {
    const mode = getSelectedStopMode();
    const stops = await searchStopPoints(query, mode, 15);
    renderStopPointResults(stops, `${stops.length} result${stops.length === 1 ? "" : "s"}`);
    setStatus(`TfL StopPoint search: ${stops.length} result${stops.length === 1 ? "" : "s"}`);
  } catch (e) {
    console.warn("StopPoint search failed:", e);
    if (panel) panel.innerHTML = '<div class="tfl-stop-results-empty">Search failed</div>';
    setStatus("TfL StopPoint search unavailable");
  }
}

async function runStopPointNearby() {
  const panel = document.getElementById("tfl-stop-results");
  if (panel) panel.innerHTML = '<div class="tfl-stop-results-empty">Loading nearby StopPoints...</div>';

  try {
    const center = map.getCenter();
    const mode = getSelectedStopMode();
    const stops = await fetchStopPointsNearby(center.lat, center.lng, mode, 1200);
    renderStopPointResults(stops, `${stops.length} nearby from map center`);
    setStatus(`TfL nearby StopPoints: ${stops.length}`);
  } catch (e) {
    console.warn("Nearby StopPoints failed:", e);
    if (panel) panel.innerHTML = '<div class="tfl-stop-results-empty">Nearby lookup failed</div>';
  }
}

// ══════════════════════════════════════════════════════
// SANTANDER CYCLES (BIKE DOCKS)
// ══════════════════════════════════════════════════════

async function fetchBikePoints() {
  try {
    setStatus("Loading Santander Cycles...");
    const r = await fetchTfl("/BikePoint");
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const docks = await r.json();

    // Clear existing
    layers.bikes.clearLayers();

    let count = 0;
    for (const dock of docks) {
      if (!dock.lat || !dock.lon) continue;

      // Extract bike/dock counts from additionalProperties
      const props = {};
      if (dock.additionalProperties) {
        for (const p of dock.additionalProperties) {
          props[p.key] = p.value;
        }
      }

      const bikes = parseInt(props.NbBikes || "0", 10);
      const ebikes = parseInt(props.NbEBikes || "0", 10);
      const empty = parseInt(props.NbEmptyDocks || "0", 10);
      const total = parseInt(props.NbDocks || "0", 10);

      // Colour based on availability
      let colour = "#22c55e";  // green = plenty
      if (bikes === 0) colour = "#ef4444";  // red = empty
      else if (bikes <= 3) colour = "#f59e0b";  // amber = low

      const marker = L.circleMarker([dock.lat, dock.lon], {
        radius: 4,
        color: colour,
        fillColor: colour,
        fillOpacity: 0.85,
        weight: 1.5,
        className: "bike-dock-marker"
      });

      const name = dock.commonName || "Bike Dock";
      marker.bindPopup(
        `<strong>${escapeHtml(name)}</strong>` +
        `<span class="popup-label">Santander Cycles</span><br>` +
        `<span class="popup-label">Bikes</span> <strong>${bikes}</strong>` +
        (ebikes > 0 ? ` (${ebikes} e-bikes)` : "") + `<br>` +
        `<span class="popup-label">Empty Docks</span> <strong>${empty}</strong> / ${total}`
      );

      marker.addTo(layers.bikes);
      count++;
    }

    TFL.bikesLoaded = true;
    setStatus(`${count} bike docks loaded`);
    console.log(`Santander Cycles: ${count} docks loaded`);
    return count;
  } catch (e) {
    console.warn("Santander Cycles fetch failed:", e);
    setStatus("Bike docks unavailable");
    return 0;
  }
}

function startBikePolling() {
  // Only load once layer is enabled (on-demand via toggle handler)
  TFL.bikesTimer = setInterval(() => {
    if (map.hasLayer(layers.bikes)) {
      fetchBikePoints();
    }
  }, CONTROL_ROOM_CONFIG.tfl.bikesRefresh);
}

// ══════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════

function initTflLive() {
  // Start line status polling immediately
  startLineStatusPolling();
  fetchStopPointMeta();
  ensureStopSearchLayer();

  // Set up bikes layer toggle — load on first enable
  const bikesCb = document.querySelector('[data-layer="bikes"]');
  if (bikesCb) {
    bikesCb.addEventListener("change", () => {
      if (bikesCb.checked && !TFL.bikesLoaded) {
        fetchBikePoints();
        startBikePolling();
      }
    });
  }

  document.addEventListener("tfl-line-selection-changed", (ev) => {
    syncSelectedLineRow(ev.detail?.lineId || null);
  });

  const stopSearchBtn = document.getElementById("tfl-stop-search-btn");
  const stopNearbyBtn = document.getElementById("tfl-stop-nearby-btn");
  const stopClearBtn = document.getElementById("tfl-stop-clear-btn");
  const stopQueryInput = document.getElementById("tfl-stop-query");
  const stopResults = document.getElementById("tfl-stop-results");

  stopSearchBtn?.addEventListener("click", runStopPointSearch);
  stopNearbyBtn?.addEventListener("click", runStopPointNearby);
  stopClearBtn?.addEventListener("click", () => {
    clearStopPointMarkers();
    if (stopResults) stopResults.innerHTML = '<div class="tfl-stop-results-empty">Cleared</div>';
  });
  stopQueryInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      runStopPointSearch();
    }
  });

  if (stopResults) {
    stopResults.innerHTML = '<div class="tfl-stop-results-empty">Use search or nearby to query TfL StopPoints</div>';
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTflLive);
} else {
  initTflLive();
}
