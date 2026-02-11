// ================== national_rail.js ==================
// National Rail (Darwin LDBWS) integration

const NR = {
  active: false,
  timer: null,
  crs: "",
  boardType: "departures",
  provider: "darwin",
  markers: new Map(), // crs -> marker
  stationGeoCache: new Map(), // stationName -> [lat, lon]
  stationSuggestTimer: null,
  stationLookupByKey: new Map(),
  signalboxServiceCache: new Map(),
  routesLayer: null,
  routeLines: [],
  health: { configured: false, endpoint: "" }
};

const UK_RAIL_STATIONS_CATALOG_URL = "https://raw.githubusercontent.com/davwheat/uk-railway-stations/main/stations.json";
let UK_RAIL_STATIONS_CACHE = null;

async function fetchNrJson(path) {
  const r = await fetch(apiUrl(path), { headers: { "Accept": "application/json" } });
  if (!r.ok) {
    let detail = "";
    try {
      const text = await r.text();
      detail = text;
      try {
        const parsed = JSON.parse(text);
        detail = parsed?.detail || parsed?.error || text;
      } catch (_) {
        // keep raw text
      }
    } catch (_) {
      detail = "";
    }
    throw new Error(`HTTP ${r.status}${detail ? ` ${String(detail).slice(0, 260)}` : ""}`);
  }
  return r.json();
}

async function fetchSignalboxJson(path) {
  const cfg = CONTROL_ROOM_CONFIG?.signalbox || {};
  const normalized = String(path || "").startsWith("/") ? path : `/${path}`;

  // Try proxy first (recommended: Signalbox often blocks browser CORS).
  try {
    const proxyResp = await fetch(apiUrl(`/signalbox${normalized}`), { headers: { Accept: "application/json" } });
    if (proxyResp.ok) return proxyResp.json();
    if (proxyResp.status !== 404 && proxyResp.status < 500) {
      const text = await proxyResp.text();
      throw new Error(`Signalbox proxy HTTP ${proxyResp.status}: ${text.slice(0, 220)}`);
    }
  } catch (_) {
    // fallback to direct
  }

  const base = String(cfg.baseUrl || "https://api.signalbox.io/v2.5").replace(/\/+$/, "");
  const key = String(cfg.apiKey || "").trim();
  if (!key) throw new Error("Signalbox key missing (set SIGNALBOX_API_KEY)");

  const resp = await fetch(`${base}${normalized}`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`
    }
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Signalbox HTTP ${resp.status}: ${text.slice(0, 220)}`);
  }
  return resp.json();
}

function pickFirstValue(obj, keys, fallback = "") {
  for (const key of keys) {
    const val = obj?.[key];
    if (val !== undefined && val !== null && String(val).trim() !== "") return val;
  }
  return fallback;
}

function normalizeSignalboxBoard(raw, crs, type) {
  const rows = Array.isArray(raw?.trains)
    ? raw.trains
    : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.results)
        ? raw.results
        : Array.isArray(raw)
          ? raw
          : [];

  const services = rows.slice(0, 60).map((t) => {
    const serviceID = String(pickFirstValue(t, ["id", "train_id", "service_id", "uid", "headcode"], ""));
    const std = String(pickFirstValue(t, ["std", "scheduled_departure", "planned_departure", "departure_scheduled"], ""));
    const etd = String(pickFirstValue(t, ["etd", "estimated_departure", "departure_estimated", "expected_departure"], ""));
    const sta = String(pickFirstValue(t, ["sta", "scheduled_arrival", "planned_arrival", "arrival_scheduled"], ""));
    const eta = String(pickFirstValue(t, ["eta", "estimated_arrival", "arrival_estimated", "expected_arrival"], ""));
    const platform = String(pickFirstValue(t, ["platform", "plat"], ""));
    const operator = String(pickFirstValue(t, ["operator", "toc_name", "train_operator"], ""));

    const originName = pickFirstValue(t, ["origin_name", "origin", "from", "from_name"], "");
    const destinationName = pickFirstValue(t, ["destination_name", "destination", "to", "to_name"], "");

    NR.signalboxServiceCache.set(serviceID, {
      operator,
      std, etd, sta, eta, platform,
      serviceType: "rail",
      locationName: String(pickFirstValue(t, ["location_name", "station_name"], crs))
    });

    return {
      serviceID,
      std, etd, sta, eta,
      platform,
      operator,
      operatorCode: String(pickFirstValue(t, ["operator_code", "toc"], "")),
      length: "",
      origin: originName ? [String(originName)] : [],
      destination: destinationName ? [String(destinationName)] : []
    };
  });

  return {
    ok: true,
    provider: "signalbox",
    type,
    board: {
      generatedAt: new Date().toISOString(),
      locationName: String(raw?.locationName || crs),
      crs: String(crs || ""),
      nrccMessages: [],
      services
    }
  };
}

async function fetchStationsCatalogDirect() {
  if (Array.isArray(UK_RAIL_STATIONS_CACHE)) return UK_RAIL_STATIONS_CACHE;
  const r = await fetch(UK_RAIL_STATIONS_CATALOG_URL, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`Stations catalog HTTP ${r.status}`);
  const list = await r.json();
  UK_RAIL_STATIONS_CACHE = Array.isArray(list) ? list : [];
  return UK_RAIL_STATIONS_CACHE;
}

async function fetchBoard(crs, type) {
  const rows = CONTROL_ROOM_CONFIG?.nationalRail?.defaultRows || 12;
  const signalboxCfg = CONTROL_ROOM_CONFIG?.signalbox || {};
  let signalboxErr = null;

  if (signalboxCfg.enabled) {
    try {
      const q = new URLSearchParams({
        crs: String(crs || "").toUpperCase(),
        board: type,
        type,
        rows: String(rows)
      });
      const path = `${signalboxCfg.boardPath || "/trains"}?${q.toString()}`;
      const payload = await fetchSignalboxJson(path);
      NR.provider = "signalbox";
      return normalizeSignalboxBoard(payload, crs, type);
    } catch (err) {
      signalboxErr = err;
      console.warn("Signalbox board failed, falling back to Darwin:", err);
    }
  }

  const endpoint = type === "arrivals" ? "/nre/arrivals" : "/nre/departures";
  const q = new URLSearchParams({ crs, rows: String(rows) });
  NR.provider = "darwin";
  try {
    return await fetchNrJson(`${endpoint}?${q.toString()}`);
  } catch (darwinErr) {
    if (signalboxErr) {
      throw new Error(
        `Signalbox unavailable (${String(signalboxErr?.message || signalboxErr)}); Darwin proxy unavailable (${String(darwinErr?.message || darwinErr)}).`
      );
    }
    throw darwinErr;
  }
}

async function fetchStationSuggestions(query, limit = 20) {
  const q = new URLSearchParams({ q: String(query || ""), limit: String(limit) });
  try {
    const data = await fetchNrJson(`/nre/stations?${q.toString()}`);
    return Array.isArray(data?.stations) ? data.stations : [];
  } catch (_) {
    const needle = String(query || "").trim().toLowerCase();
    if (needle.length < 2) return [];
    const list = await fetchStationsCatalogDirect();
    return list
      .map((r) => ({
        crs: String(r?.crsCode || "").toUpperCase(),
        name: String(r?.stationName || ""),
        lat: r?.lat,
        lon: r?.long
      }))
      .filter((s) => s.crs && s.name)
      .filter((s) => s.crs.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle))
      .slice(0, limit);
  }
}

function parseCrsFromInput(raw) {
  const text = String(raw || "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(text)) return text;
  const m = text.match(/\b([A-Z]{3})\b/);
  return m ? m[1] : "";
}

function hydrateCrsDatalist(stations) {
  const list = document.getElementById("nr-crs-list");
  if (!list) return;
  const items = Array.isArray(stations) ? stations : [];
  NR.stationLookupByKey.clear();
  list.innerHTML = items
    .slice(0, 40)
    .map((st) => {
      const key = `${st.crs} - ${st.name}`;
      NR.stationLookupByKey.set(key.toUpperCase(), st);
      return `<option value="${escapeHtml(key)}"></option>`;
    })
    .join("");
}

async function fetchServiceDetails(serviceId) {
  if (NR.provider === "signalbox") {
    const cached = NR.signalboxServiceCache.get(String(serviceId || ""));
    return { ok: true, service: cached || {} };
  }
  const q = new URLSearchParams({ service_id: serviceId });
  return fetchNrJson(`/nre/service?${q.toString()}`);
}

async function fetchNrHealth() {
  const signalboxCfg = CONTROL_ROOM_CONFIG?.signalbox || {};
  if (signalboxCfg.enabled) {
    try {
      const health = await fetchSignalboxJson("/health");
      if (health?.configured || signalboxCfg.apiKey) {
        NR.health = {
          configured: true,
          endpoint: String(health?.endpoint || signalboxCfg.baseUrl || "")
        };
        return NR.health;
      }
    } catch (_) {
      if (signalboxCfg.apiKey) {
        NR.health = {
          configured: true,
          endpoint: String(signalboxCfg.baseUrl || "")
        };
        return NR.health;
      }
    }
  }
  try {
    const health = await fetchNrJson("/nre/health");
    NR.health = {
      configured: !!health?.configured,
      endpoint: String(health?.endpoint || "")
    };
    return NR.health;
  } catch (_) {
    NR.health = { configured: false, endpoint: "" };
    return NR.health;
  }
}

async function geocodeStationName(stationName) {
  const key = String(stationName || "").toLowerCase().trim();
  if (!key) return null;
  if (NR.stationGeoCache.has(key)) return NR.stationGeoCache.get(key);

  try {
    const q = new URLSearchParams({
      q: `${stationName} railway station uk`,
      limit: "1"
    });
    const r = await fetchNrJson(`/geo/search?${q.toString()}`);
    const hit = Array.isArray(r) ? r[0] : null;
    const lat = Number(hit?.lat);
    const lon = Number(hit?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const latLng = [lat, lon];
    NR.stationGeoCache.set(key, latLng);
    return latLng;
  } catch (_) {
    return null;
  }
}

function ensureNrRoutesLayer() {
  if (NR.routesLayer) return NR.routesLayer;
  NR.routesLayer = L.layerGroup();
  NR.routesLayer.addTo(layers.national_rail);
  return NR.routesLayer;
}

function clearNrRoutes() {
  if (NR.routesLayer) NR.routesLayer.clearLayers();
  NR.routeLines = [];
}

async function plotApproxRailSpokes(crs) {
  if (!crs) return;
  if (!map.hasLayer(layers.national_rail)) return;
  clearNrRoutes();
  try {
    const data = await fetchNrJson(`/nre/stations?crs=${encodeURIComponent(crs)}&limit=14`);
    const base = data?.base;
    const stations = Array.isArray(data?.stations) ? data.stations : [];
    const baseLat = Number(base?.lat);
    const baseLon = Number(base?.lon);
    if (!Number.isFinite(baseLat) || !Number.isFinite(baseLon)) return;

    const routesLayer = ensureNrRoutesLayer();
    for (const st of stations) {
      const lat = Number(st?.lat);
      const lon = Number(st?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const line = L.polyline([[baseLat, baseLon], [lat, lon]], {
        color: "#7dd3fc",
        weight: 2.2,
        opacity: 0.62,
        dashArray: "6 5",
        className: "nr-service-line"
      }).addTo(routesLayer);
      line.bindTooltip(
        `${base?.name || crs} -> ${st.name} (${st.distanceKm || "?"} km)`,
        { sticky: true, direction: "top", opacity: 0.95 }
      );
      NR.routeLines.push(line);
    }

    if (NR.routeLines.length) {
      setStatus(`National Rail network spokes shown for ${crs}`);
    }
  } catch (_) {
    // ignore fallback failures
  }
}

async function plotNrServiceLines(board, services) {
  if (!board?.locationName || !Array.isArray(services) || !services.length) return;
  if (!map.hasLayer(layers.national_rail)) return;

  clearNrRoutes();
  const origin = await geocodeStationName(board.locationName);
  if (!origin) return;

  const destinationAgg = new Map();
  for (const svc of services.slice(0, 40)) {
    const names = NR.boardType === "arrivals" ? (svc.origin || []) : (svc.destination || []);
    for (const rawName of names) {
      const name = String(rawName || "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!destinationAgg.has(key)) {
        destinationAgg.set(key, { name, count: 0, eta: svc.eta || svc.etd || svc.sta || svc.std || "--" });
      }
      destinationAgg.get(key).count += 1;
    }
  }

  const routesLayer = ensureNrRoutesLayer();
  const entries = Array.from(destinationAgg.values()).sort((a, b) => b.count - a.count).slice(0, 10);
  for (const entry of entries) {
    const dest = await geocodeStationName(entry.name);
    if (!dest) continue;
    const line = L.polyline([origin, dest], {
      color: "#38bdf8",
      weight: 3,
      opacity: 0.78,
      dashArray: "8 6",
      className: "nr-service-line"
    }).addTo(routesLayer);
    line.bindTooltip(
      `${board.locationName} -> ${entry.name} (${entry.count} services, next ${entry.eta})`,
      { sticky: true, direction: "top", opacity: 0.95 }
    );
    line.bindPopup(
      `<strong>${escapeHtml(board.locationName)} -> ${escapeHtml(entry.name)}</strong>` +
      `<div class="nr-card-meta">${entry.count} service${entry.count === 1 ? "" : "s"} | Next ${escapeHtml(entry.eta)}</div>`
    );
    NR.routeLines.push(line);
  }
}

function renderNrResults(payload) {
  const wrap = document.getElementById("nr-results");
  if (!wrap) return;

  if (!payload?.ok || !payload?.board) {
    const reason = payload?.error || payload?.reason || "No board data";
    wrap.innerHTML = `<div class="nr-empty">${escapeHtml(reason)}</div>`;
    return;
  }

  const board = payload.board;
  const services = Array.isArray(board.services) ? board.services : [];
  const generated = board.generatedAt ? new Date(board.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--:--";

  let html =
    `<div class="nr-card">` +
    `<div class="nr-card-title">${escapeHtml(board.locationName || "Station")} (${escapeHtml(board.crs || NR.crs)})</div>` +
    `<div class="nr-card-meta">${escapeHtml(payload.type || NR.boardType)} | Updated ${escapeHtml(generated)} | ${services.length} service${services.length === 1 ? "" : "s"}</div>`;

  if (Array.isArray(board.nrccMessages) && board.nrccMessages.length) {
    html += `<div class="nr-alert">${escapeHtml(board.nrccMessages[0])}</div>`;
  }

  if (!services.length) {
    html += '<div class="nr-empty">No live services for this board</div>';
  } else {
    for (const svc of services.slice(0, 20)) {
      const when = NR.boardType === "arrivals" ? (svc.eta || svc.sta || "--") : (svc.etd || svc.std || "--");
      const plat = svc.platform ? `P${svc.platform}` : "--";
      const toText = NR.boardType === "arrivals"
        ? (Array.isArray(svc.origin) && svc.origin.length ? svc.origin.join(", ") : "Unknown origin")
        : (Array.isArray(svc.destination) && svc.destination.length ? svc.destination.join(", ") : "Unknown destination");
      html +=
        `<div class="nr-service" data-service-id="${escapeHtml(svc.serviceID || "")}">` +
        `<span class="nr-eta">${escapeHtml(when)}</span>` +
        `<span class="nr-plat">${escapeHtml(plat)}</span>` +
        `<span class="nr-dest">${escapeHtml(toText)}</span>` +
        `</div>`;
    }
  }
  html += `</div>`;
  wrap.innerHTML = html;

  wrap.querySelectorAll(".nr-service[data-service-id]").forEach((row) => {
    row.addEventListener("click", async () => {
      const serviceId = row.dataset.serviceId;
      if (!serviceId) return;
      try {
        const detail = await fetchServiceDetails(serviceId);
        const svc = detail?.service || {};
        const msg = [
          `Operator: ${svc.operator || "Unknown"}`,
          `STD/ETD: ${svc.std || "--"} / ${svc.etd || "--"}`,
          `STA/ETA: ${svc.sta || "--"} / ${svc.eta || "--"}`,
          svc.platform ? `Platform: ${svc.platform}` : "",
          svc.delayReason ? `Delay: ${svc.delayReason}` : "",
          svc.cancelReason ? `Cancelled: ${svc.cancelReason}` : ""
        ].filter(Boolean).join("\n");
        alert(msg || "No additional service details");
      } catch (e) {
        console.warn("Service details failed:", e);
      }
    });
  });
}

async function upsertNrStationMarker(board) {
  if (!board?.locationName || !board?.crs) return;
  if (!map.hasLayer(layers.national_rail)) return;

  let marker = NR.markers.get(board.crs);
  if (marker) {
    marker.setPopupContent(
      `<strong>${escapeHtml(board.locationName)} (${escapeHtml(board.crs)})</strong>` +
      `<div class="nr-card-meta">National Rail live board loaded</div>`
    );
    return;
  }

  const latLng = await geocodeStationName(board.locationName);
  if (!latLng) return;

  marker = L.circleMarker(latLng, {
    radius: 7,
    color: "#38bdf8",
    fillColor: "#38bdf8",
    fillOpacity: 0.9,
    weight: 2
  }).addTo(layers.national_rail);

  marker.bindPopup(
    `<strong>${escapeHtml(board.locationName)} (${escapeHtml(board.crs)})</strong>` +
    `<div class="nr-card-meta">National Rail station marker</div>`
  );
  marker.bindTooltip(`${board.locationName} (${board.crs})`, { sticky: true, direction: "top", opacity: 0.95 });
  NR.markers.set(board.crs, marker);
}

function clearNrState() {
  layers.national_rail.clearLayers();
  clearNrRoutes();
  NR.markers.clear();
  NR.crs = "";
  const wrap = document.getElementById("nr-results");
  if (wrap) wrap.innerHTML = '<div class="nr-empty">Cleared</div>';
}

async function refreshNrBoard() {
  if (!NR.crs) return;
  try {
    const data = await fetchBoard(NR.crs, NR.boardType);
    renderNrResults(data);
    if (data?.board) {
      await upsertNrStationMarker(data.board);
      await plotNrServiceLines(data.board, data.board.services || []);
      // Ensure route context is always visible even when feed lacks destination/origin fields.
      if (!NR.routeLines.length) {
        await plotApproxRailSpokes(NR.crs);
      }
      if (data.board.locationName) {
        setStatus(`National Rail ${NR.boardType}: ${data.board.locationName} (${NR.crs})`);
      }
    }
  } catch (e) {
    console.warn("National Rail board failed:", e);
    const wrap = document.getElementById("nr-results");
    if (wrap) {
      const detail = String(e?.message || "National Rail feed unavailable");
      wrap.innerHTML = `<div class="nr-empty">${escapeHtml(detail)}</div>`;
      if (!NR.health.configured) {
        wrap.innerHTML += '<div class="nr-alert">Rail live feed credentials not configured (Signalbox or Darwin).</div>';
      }
    }
    if (!NR.health.configured && NR.crs) {
      await plotApproxRailSpokes(NR.crs);
    }
    setStatus("National Rail fetch failed");
  }
}

function startNrPolling() {
  if (NR.timer) clearInterval(NR.timer);
  NR.timer = setInterval(() => {
    if (NR.active && NR.crs) refreshNrBoard();
  }, CONTROL_ROOM_CONFIG?.nationalRail?.refreshInterval || 60000);
}

function stopNrPolling() {
  if (NR.timer) {
    clearInterval(NR.timer);
    NR.timer = null;
  }
}

function initNationalRail() {
  const fetchBtn = document.getElementById("nr-fetch-btn");
  const refreshBtn = document.getElementById("nr-refresh-btn");
  const clearBtn = document.getElementById("nr-clear-btn");
  const crsInput = document.getElementById("nr-crs-input");
  const typeSel = document.getElementById("nr-board-type");
  const wrap = document.getElementById("nr-results");
  const layerCb = document.querySelector('[data-layer="national_rail"]');

  if (wrap) wrap.innerHTML = '<div class="nr-empty">Enter a CRS code and fetch a live board</div>';
  fetchNrHealth().then((health) => {
    if (!wrap) return;
    if (!health.configured) {
      wrap.innerHTML = '<div class="nr-empty">Rail provider not fully configured</div><div class="nr-alert">Set `SIGNALBOX_API_KEY` (preferred) or `NRE_LDBWS_TOKEN`. Station search still works.</div>';
    }
  });

  const runFetch = async () => {
    const crs = parseCrsFromInput(crsInput?.value || "");
    if (!/^[A-Z]{3}$/.test(crs)) {
      if (wrap) wrap.innerHTML = '<div class="nr-empty">Use a 3-letter CRS code (e.g. KGX)</div>';
      return;
    }
    NR.crs = crs;
    NR.boardType = String(typeSel?.value || "departures");
    await refreshNrBoard();
    startNrPolling();
  };

  fetchBtn?.addEventListener("click", runFetch);
  refreshBtn?.addEventListener("click", refreshNrBoard);
  clearBtn?.addEventListener("click", clearNrState);
  crsInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      runFetch();
    }
  });
  crsInput?.addEventListener("input", () => {
    const q = String(crsInput.value || "").trim();
    if (NR.stationSuggestTimer) clearTimeout(NR.stationSuggestTimer);
    NR.stationSuggestTimer = setTimeout(async () => {
      if (!q || q.length < 2) return;
      try {
        const stations = await fetchStationSuggestions(q, 20);
        hydrateCrsDatalist(stations);
      } catch (_) {
        // keep silent on suggestion failures
      }
    }, 180);
  });
  crsInput?.addEventListener("change", () => {
    const raw = String(crsInput.value || "").trim();
    const key = raw.toUpperCase();
    const st = NR.stationLookupByKey.get(key);
    if (st?.crs) crsInput.value = st.crs;
  });
  typeSel?.addEventListener("change", () => {
    NR.boardType = String(typeSel.value || "departures");
    if (NR.crs) refreshNrBoard();
  });

  layerCb?.addEventListener("change", () => {
    NR.active = !!layerCb.checked;
    if (!NR.active) {
      stopNrPolling();
    } else {
      startNrPolling();
      if (NR.crs) refreshNrBoard();
    }
  });

  fetchStationSuggestions("", 30)
    .then((stations) => hydrateCrsDatalist(stations))
    .catch(() => {});
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initNationalRail);
} else {
  initNationalRail();
}
