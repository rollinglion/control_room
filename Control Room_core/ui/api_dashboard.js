import { getEnabledAPIs, getCapabilityMatrix } from "../api_catalogue/api_discovery.js";

function badge(ok) {
  return `<span class="google-api-badge ${ok ? "ok" : "down"}">${ok ? "Enabled" : "Disabled"}</span>`;
}

export function renderAPIDashboard(containerId = "google-api-dashboard-list", matrixId = "google-api-capability-matrix") {
  const apis = getEnabledAPIs();
  const matrix = getCapabilityMatrix();

  if (typeof document === "undefined") return { apis, matrix };
  const container = document.getElementById(containerId);
  const matrixEl = document.getElementById(matrixId);

  if (container) {
    container.innerHTML = apis
      .map((api) =>
        `<div class="google-api-row">
          <div class="google-api-main">
            <span class="google-api-name">${api.name}</span>
            <span class="google-api-method">${api.method}</span>
          </div>
          <div class="google-api-cap">${api.capability}</div>
          <div class="google-api-cat">${api.category.replace(/_/g, " ")}</div>
        </div>`
      )
      .join("");
  }

  if (matrixEl) {
    matrixEl.innerHTML =
      Object.entries(matrix)
        .map(([k, v]) => `<div class="google-matrix-item"><span>${k.replace(/_/g, " ")}</span>${badge(v)}</div>`)
        .join("");
  }

  return { apis, matrix };
}

function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mapCenterLatLng() {
  if (!window._map || typeof window._map.getCenter !== "function") return null;
  const c = window._map.getCenter();
  if (!c) return null;
  return [Number(c.lat), Number(c.lng)];
}

function parseLatLngString(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}

function setBusy(buttonId, busy, busyText = "Working...") {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent || "";
  btn.disabled = !!busy;
  btn.textContent = busy ? busyText : btn.dataset.originalText;
}

function decodeHtml(v) {
  if (typeof document === "undefined") return String(v || "");
  const t = document.createElement("textarea");
  t.innerHTML = String(v || "");
  return t.value;
}

function ensureMapVisible() {
  const cb = document.querySelector('.layer-cb[data-layer="entities"]');
  if (cb && !cb.checked) cb.click();
}

function addGooglePlaceToMap(place) {
  const lat = Number(place?.lat);
  const lng = Number(place?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !window._map || !window.L) {
    throw new Error("Map not ready or invalid coordinates");
  }

  const name = String(place?.name || "Google Place").trim() || "Google Place";
  const address = String(place?.address || "").trim();
  const placeId = String(place?.placeId || "").trim();
  const sourceKey = (placeId ? `GPLACE_${placeId}` : `GPLACE_${name}_${lat.toFixed(5)}_${lng.toFixed(5)}`)
    .replace(/[^A-Za-z0-9_]/g, "_")
    .toUpperCase();

  const marker = typeof window.createOrganisationMarker === "function"
    ? window.createOrganisationMarker([lat, lng])
    : window.L.marker([lat, lng]);

  const popup = `<strong>${esc(name)}</strong><br>
    <span class="popup-label">Source</span> Google Places<br>
    ${address ? `${esc(address)}<br>` : ""}
    ${placeId ? `<span class="popup-label">Place ID</span> ${esc(placeId)}<br>` : ""}
    <span class="popup-tag" style="background:rgba(56,189,248,0.16); color:#7dd3fc; border:1px solid rgba(56,189,248,0.35);">Google</span>`;
  marker.bindPopup(popup).addTo(window._map);

  if (typeof window.registerCompanyMarkerAsEntity === "function") {
    window.registerCompanyMarkerAsEntity(marker, {
      number: sourceKey,
      name,
      status: "google_place",
      address,
      postcode: "",
      latLng: [lat, lng]
    });
  }

  ensureMapVisible();
  window._map.panTo([lat, lng]);
  marker.openPopup();
  window.setStatus?.(`Added Google place: ${name}`);
  window.showToast?.(`Added to map: ${name}`, "success");
}

function updateGoogleState() {
  const state = document.getElementById("google-api-state");
  if (!state) return;
  if (!window.GoogleIntelligenceService) {
    state.textContent = "Google intelligence service unavailable in this session.";
    state.className = "google-api-state error";
    return;
  }
  if (!window.GoogleIntelligenceService.isConfigured()) {
    state.textContent = "Google API key not configured. Add GOOGLE_MAPS_API_KEY or GOOGLE_STREETVIEW_API_KEY.";
    state.className = "google-api-state error";
    return;
  }
  state.textContent = "Google key detected. Tools are ready.";
  state.className = "google-api-state ok";
}

function renderIntelOutput(target, intel, lat, lng) {
  const geo = intel?.geocode || {};
  const geoFirst = Array.isArray(geo.results) ? geo.results[0] : null;
  const elevFirst = Array.isArray(intel?.elevation?.results) ? intel.elevation.results[0] : null;
  const places = Array.isArray(intel?.nearbyPlaces?.results) ? intel.nearbyPlaces.results : [];
  const weather = intel?.weather?.currentConditions?.weatherCondition?.description?.text || "n/a";
  const aqi = intel?.airQuality?.indexes?.[0]?.aqi ?? "n/a";
  const tz = intel?.timezone?.timeZoneName || intel?.timezone?.timeZoneId || "n/a";
  const sv = intel?.streetViewUrl || "";
  const failures = intel?.failures && Object.keys(intel.failures).length
    ? `<div class="google-tool-note">Partial failures: ${esc(Object.keys(intel.failures).join(", "))}</div>`
    : "";

  target.innerHTML =
    `<div class="google-kv-grid">
      <div><span>Coordinates</span><strong>${esc(lat.toFixed(5))}, ${esc(lng.toFixed(5))}</strong></div>
      <div><span>Address</span><strong>${esc(geoFirst?.formatted_address || "n/a")}</strong></div>
      <div><span>Elevation</span><strong>${esc(Number.isFinite(Number(elevFirst?.elevation)) ? `${Math.round(Number(elevFirst.elevation))} m` : "n/a")}</strong></div>
      <div><span>Timezone</span><strong>${esc(tz)}</strong></div>
      <div><span>Nearby Places</span><strong>${esc(String(places.length))}</strong></div>
      <div><span>Weather</span><strong>${esc(weather)}</strong></div>
      <div><span>Air Quality Index</span><strong>${esc(String(aqi))}</strong></div>
    </div>
    ${sv ? `<div class="google-tool-link-row"><a href="${esc(sv)}" target="_blank" rel="noopener">Open Street View Snapshot</a></div>` : ""}
    ${failures}`;
}

async function runIntelFromInput() {
  const output = document.getElementById("google-intel-output");
  const input = document.getElementById("google-intel-location");
  if (!output || !input) return;
  if (!window.GoogleIntelligenceService) {
    output.textContent = "Google service unavailable.";
    return;
  }
  const raw = String(input.value || "").trim();
  if (!raw) {
    output.textContent = "Enter an address or lat,lng first.";
    return;
  }

  setBusy("google-intel-run-btn", true, "Analyzing...");
  try {
    let latLng = parseLatLngString(raw);
    let resolvedAddress = raw;
    if (!latLng) {
      const geo = await window.GoogleIntelligenceService.geocode(raw);
      const first = Array.isArray(geo?.results) ? geo.results[0] : null;
      const loc = first?.geometry?.location || null;
      if (!loc || !Number.isFinite(Number(loc.lat)) || !Number.isFinite(Number(loc.lng))) {
        output.textContent = `No coordinates found for "${raw}".`;
        return;
      }
      latLng = [Number(loc.lat), Number(loc.lng)];
      resolvedAddress = first.formatted_address || raw;
      input.value = `${latLng[0].toFixed(6)}, ${latLng[1].toFixed(6)}`;
    }

    const [lat, lng] = latLng;
    output.textContent = "Fetching location intelligence...";
    const intel = await window.GoogleIntelligenceService.enrichLocation(
      { lat, lng, address: resolvedAddress },
      { includeEnvironment: true, placesRadius: 350 }
    );
    if (!intel?.ok) {
      output.textContent = `Location intel failed: ${intel?.reason || "unknown reason"}`;
      return;
    }
    renderIntelOutput(output, intel, lat, lng);
  } catch (err) {
    output.textContent = `Location intel error: ${String(err?.message || err)}`;
  } finally {
    setBusy("google-intel-run-btn", false);
  }
}

async function runPlacesSearch() {
  const output = document.getElementById("google-places-output");
  const queryInput = document.getElementById("google-places-query");
  const nearMap = document.getElementById("google-places-near-map");
  if (!output || !queryInput) return;
  const q = String(queryInput.value || "").trim();
  if (!q) {
    output.textContent = "Enter a places search query first.";
    return;
  }

  setBusy("google-places-run-btn", true, "Searching...");
  try {
    let lat = null;
    let lng = null;
    if (nearMap?.checked) {
      const c = mapCenterLatLng();
      if (c) {
        lat = c[0];
        lng = c[1];
      }
    }
    output.textContent = "Searching Google Places...";
    const res = await window.GoogleIntelligenceService.searchPlacesText(q, lat, lng, 1600);
    const items = Array.isArray(res?.results) ? res.results.slice(0, 8) : [];
    if (!items.length) {
      output.textContent = "No places returned.";
      return;
    }
    output.innerHTML = items
      .map((p) => {
        const rawName = String(p.name || "Unknown");
        const rawAddr = String(p.formatted_address || p.vicinity || "No address");
        const name = esc(rawName);
        const addr = esc(rawAddr);
        const rating = Number.isFinite(Number(p.rating)) ? `Rating ${Number(p.rating).toFixed(1)}` : "No rating";
        const latp = Number(p?.geometry?.location?.lat);
        const lngp = Number(p?.geometry?.location?.lng);
        const coords = Number.isFinite(latp) && Number.isFinite(lngp) ? `${latp.toFixed(5)}, ${lngp.toFixed(5)}` : "n/a";
        const canPlot = Number.isFinite(latp) && Number.isFinite(lngp);
        return `<div class="google-result-row">
          <div class="google-result-title">${name}</div>
          <div class="google-result-meta">${addr}</div>
          <div class="google-result-meta">${esc(rating)} | ${esc(coords)}</div>
          <div class="google-result-actions">
            <button
              class="btn-secondary btn-sm google-place-map-btn"
              type="button"
              data-lat="${canPlot ? latp : ""}"
              data-lng="${canPlot ? lngp : ""}"
              data-name="${esc(rawName)}"
              data-address="${esc(rawAddr)}"
              data-place-id="${esc(p.place_id || "")}"
              ${canPlot ? "" : "disabled"}
            >Add to map</button>
          </div>
        </div>`;
      })
      .join("");

    output.querySelectorAll(".google-place-map-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        try {
          addGooglePlaceToMap({
            lat: btn.getAttribute("data-lat"),
            lng: btn.getAttribute("data-lng"),
            name: decodeHtml(btn.getAttribute("data-name")),
            address: decodeHtml(btn.getAttribute("data-address")),
            placeId: decodeHtml(btn.getAttribute("data-place-id"))
          });
        } catch (err) {
          output.textContent = `Unable to add place to map: ${String(err?.message || err)}`;
        }
      });
    });
  } catch (err) {
    output.textContent = `Places search error: ${String(err?.message || err)}`;
  } finally {
    setBusy("google-places-run-btn", false);
  }
}

async function runRouteEstimate() {
  const output = document.getElementById("google-route-output");
  const origin = document.getElementById("google-route-origin");
  const destination = document.getElementById("google-route-destination");
  const mode = document.getElementById("google-route-mode");
  if (!output || !origin || !destination || !mode) return;
  const from = String(origin.value || "").trim();
  const to = String(destination.value || "").trim();
  if (!from || !to) {
    output.textContent = "Provide both origin and destination.";
    return;
  }

  setBusy("google-route-run-btn", true, "Computing...");
  try {
    output.textContent = "Calculating route...";
    const res = await window.GoogleIntelligenceService.getDirections(from, to, [], String(mode.value || "driving"));
    const route = Array.isArray(res?.routes) ? res.routes[0] : null;
    const leg = Array.isArray(route?.legs) ? route.legs[0] : null;
    if (!route || !leg) {
      output.textContent = "No route returned for those inputs.";
      return;
    }
    const distance = leg.distance?.text || route.legs?.[0]?.distance?.text || "n/a";
    const duration = leg.duration?.text || route.legs?.[0]?.duration?.text || "n/a";
    const summary = route.summary || "Primary route";
    output.innerHTML = `<div class="google-kv-grid">
      <div><span>Route</span><strong>${esc(summary)}</strong></div>
      <div><span>Mode</span><strong>${esc(String(mode.value || "driving"))}</strong></div>
      <div><span>Distance</span><strong>${esc(distance)}</strong></div>
      <div><span>Duration</span><strong>${esc(duration)}</strong></div>
      <div><span>From</span><strong>${esc(leg.start_address || from)}</strong></div>
      <div><span>To</span><strong>${esc(leg.end_address || to)}</strong></div>
    </div>`;
  } catch (err) {
    output.textContent = `Route error: ${String(err?.message || err)}`;
  } finally {
    setBusy("google-route-run-btn", false);
  }
}

async function runSelfTest(outputId = "google-api-selftest") {
  const output = document.getElementById(outputId);
  if (!output) return;
  if (!window.GoogleIntelligenceService) {
    output.textContent = "Google service unavailable";
    return;
  }
  if (!window.GoogleIntelligenceService.isConfigured()) {
    output.textContent = "Google API key missing";
    return;
  }

  output.textContent = "Running API probe...";
  try {
    const geo = await window.GoogleIntelligenceService.geocode("1 Osmond Drive, Wells, Somerset, BA5 2JX");
    const ok = geo && (geo.status === "OK" || Array.isArray(geo.results));
    output.textContent = ok
      ? `Probe OK: geocoding returned ${Array.isArray(geo.results) ? geo.results.length : 0} result(s)`
      : `Probe failed: ${geo?.status || "unknown status"}`;
  } catch (err) {
    output.textContent = `Probe error: ${String(err?.message || err)}`;
  }
}

if (typeof window !== "undefined") {
  window.renderAPIDashboard = renderAPIDashboard;
  window.runGoogleApiSelfTest = runSelfTest;

  const run = () => {
    renderAPIDashboard();
    updateGoogleState();
    document.getElementById("google-api-refresh-btn")?.addEventListener("click", () => {
      renderAPIDashboard();
      updateGoogleState();
    });
    document.getElementById("google-api-selftest-btn")?.addEventListener("click", () => runSelfTest());
    document.getElementById("google-intel-run-btn")?.addEventListener("click", runIntelFromInput);
    document.getElementById("google-places-run-btn")?.addEventListener("click", runPlacesSearch);
    document.getElementById("google-route-run-btn")?.addEventListener("click", runRouteEstimate);
    document.getElementById("google-intel-location")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runIntelFromInput();
    });
    document.getElementById("google-places-query")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runPlacesSearch();
    });
    document.getElementById("google-route-origin")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runRouteEstimate();
    });
    document.getElementById("google-route-destination")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") runRouteEstimate();
    });
    document.getElementById("google-intel-use-map-btn")?.addEventListener("click", () => {
      const c = mapCenterLatLng();
      const input = document.getElementById("google-intel-location");
      if (!input) return;
      if (!c) {
        const out = document.getElementById("google-intel-output");
        if (out) out.textContent = "Map not ready yet.";
        return;
      }
      input.value = `${c[0].toFixed(6)}, ${c[1].toFixed(6)}`;
    });
    document.getElementById("google-intel-clear-btn")?.addEventListener("click", () => {
      const input = document.getElementById("google-intel-location");
      const out = document.getElementById("google-intel-output");
      if (input) input.value = "";
      if (out) out.textContent = "No analysis yet.";
    });
    document.getElementById("google-api-enrich-selected-btn")?.addEventListener("click", async () => {
      const ids = Array.from(window._selectedEntityIds || []);
      if (!ids.length) {
        const out = document.getElementById("google-api-selftest");
        if (out) out.textContent = "Select one or more entities first.";
        return;
      }
      setBusy("google-api-enrich-selected-btn", true, "Enriching...");
      let ok = 0;
      for (const id of ids) {
        const res = await window.GoogleIntelligenceService.enrichEntityInStore(id, { includeEnvironment: true }).catch(() => null);
        if (res?.ok) ok += 1;
      }
      const out = document.getElementById("google-api-selftest");
      if (out) out.textContent = `Enriched ${ok}/${ids.length} selected entities`;
      setBusy("google-api-enrich-selected-btn", false);
    });
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
}
