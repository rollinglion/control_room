const UK_RAIL_STATIONS_URL =
  "https://raw.githubusercontent.com/davwheat/uk-railway-stations/main/stations.json";
const TFL_API_BASE = "https://api.tfl.gov.uk";
const CH_API_BASE = "https://api.company-information.service.gov.uk";
const POSTCODES_API_BASE = "https://api.postcodes.io";
const OPENSKY_API_BASE = "https://opensky-network.org/api";
const OS_PLACES_API_BASE = "https://api.os.uk/search/places/v1";
const WEBTRIS_API_BASE = "https://webtris.highwaysengland.co.uk/api";
const SIGNALBOX_API_BASE = "https://api.signalbox.io/v2.5";
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org/search";
const AVIATIONSTACK_BASE = "http://api.aviationstack.com/v1";
const DVLA_VES_API_BASE = "https://driver-vehicle-licensing.api.gov.uk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

let stationCatalogCache = null;
let stationCatalogCacheTs = 0;
const stationCatalogTtlMs = 6 * 60 * 60 * 1000;

function b64(str) {
  return btoa(str);
}

function withCors(resp) {
  const headers = new Headers(resp.headers);
  Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}

function json(data, status = 200) {
  return withCors(
    new Response(JSON.stringify(data), {
      status,
      headers: { "content-type": "application/json; charset=utf-8" },
    })
  );
}

async function upstreamFetch(url, init = {}) {
  const resp = await fetch(url, init);
  return withCors(resp);
}

async function getStationCatalog() {
  const now = Date.now();
  if (stationCatalogCache && now - stationCatalogCacheTs < stationCatalogTtlMs) return stationCatalogCache;
  const resp = await fetch(UK_RAIL_STATIONS_URL, {
    headers: { Accept: "application/json", "User-Agent": "ControlRoom-Worker/1.0" },
  });
  if (!resp.ok) throw new Error(`stations catalog HTTP ${resp.status}`);
  const raw = await resp.json();
  stationCatalogCache = Array.isArray(raw) ? raw : [];
  stationCatalogCacheTs = now;
  return stationCatalogCache;
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

function parseCrsFromInput(raw) {
  const text = String(raw || "").trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(text)) return text;
  const m = text.match(/\b([A-Z]{3})\b/);
  return m ? m[1] : "";
}

function mapStation(st) {
  return {
    crs: String(st?.crsCode || "").toUpperCase(),
    name: String(st?.stationName || ""),
    country: String(st?.constituentCountry || "").toLowerCase(),
    lat: st?.lat,
    lon: st?.long,
  };
}

async function handleNreStations(url) {
  const q = String(url.searchParams.get("q") || "").trim().toLowerCase();
  const crs = parseCrsFromInput(url.searchParams.get("crs"));
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 20)));
  const items = (await getStationCatalog()).map(mapStation).filter((s) => s.crs && s.name);

  if (crs) {
    const base = items.find((s) => s.crs === crs);
    if (!base) return json({ ok: true, base: null, stations: [] });
    const baseLat = Number(base.lat);
    const baseLon = Number(base.lon);
    if (!Number.isFinite(baseLat) || !Number.isFinite(baseLon)) return json({ ok: true, base, stations: [] });
    const nearby = [];
    for (const st of items) {
      if (st.crs === crs) continue;
      const lat = Number(st.lat);
      const lon = Number(st.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const d = haversineKm(baseLat, baseLon, lat, lon);
      if (d <= 45) nearby.push({ ...st, distanceKm: Math.round(d * 100) / 100 });
    }
    nearby.sort((a, b) => a.distanceKm - b.distanceKm);
    return json({ ok: true, base, stations: nearby.slice(0, limit) });
  }

  if (!q) return json({ ok: true, stations: items.slice(0, limit) });
  const scored = [];
  const qUpper = q.toUpperCase();
  for (const st of items) {
    const nameL = st.name.toLowerCase();
    let score = 0;
    if (st.crs === qUpper) score += 200;
    else if (st.crs.startsWith(qUpper)) score += 120;
    if (nameL.startsWith(q)) score += 80;
    if (nameL.includes(q)) score += 40;
    if (score > 0) scored.push([score, st]);
  }
  scored.sort((a, b) => b[0] - a[0] || a[1].name.localeCompare(b[1].name));
  return json({ ok: true, stations: scored.slice(0, limit).map((x) => x[1]) });
}

function buildSignalboxPath(url) {
  const incoming = new URL(url.toString());
  incoming.pathname = incoming.pathname.replace(/^\/signalbox/, "") || "/trains";
  return incoming.pathname + incoming.search;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
    const method = String(request.method || "GET").toUpperCase();

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (method === "GET" && path.startsWith("/dvla/health")) {
        return json({
          ok: true,
          configured: !!env.DVLA_API_KEY,
          endpoint: `${DVLA_VES_API_BASE}/vehicle-enquiry/v1/vehicles`
        });
      }

      if (method === "POST" && path.startsWith("/dvla/vehicle")) {
        if (!env.DVLA_API_KEY) return json({ error: "DVLA_API_KEY not configured" }, 500);
        let body = {};
        try {
          body = await request.json();
        } catch (_) {
          return json({ error: "Invalid JSON body" }, 400);
        }
        const registrationNumber = String(body?.registrationNumber || "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .trim();
        if (!registrationNumber) return json({ error: "registrationNumber is required" }, 400);

        const upstreamResp = await fetch(`${DVLA_VES_API_BASE}/vehicle-enquiry/v1/vehicles`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "x-api-key": env.DVLA_API_KEY
          },
          body: JSON.stringify({ registrationNumber })
        });
        return withCors(upstreamResp);
      }

      if (method !== "GET") return json({ error: "Method not allowed" }, 405);

      if (path.startsWith("/ch/")) {
        if (!env.CH_API_KEY) return json({ error: "CH_API_KEY not configured" }, 500);
        const upstreamUrl = CH_API_BASE + path.replace(/^\/ch/, "") + url.search;
        return upstreamFetch(upstreamUrl, {
          headers: {
            Accept: "application/json",
            Authorization: `Basic ${b64(`${env.CH_API_KEY}:`)}`,
          },
        });
      }

      if (path.startsWith("/tfl/")) {
        const upstreamUrl = TFL_API_BASE + path.replace(/^\/tfl/, "") + url.search;
        return upstreamFetch(upstreamUrl, { headers: { Accept: "application/json" } });
      }

      if (path.startsWith("/postcodes/")) {
        const upstreamUrl = POSTCODES_API_BASE + path.replace(/^\/postcodes/, "") + url.search;
        return upstreamFetch(upstreamUrl, { headers: { Accept: "application/json" } });
      }

      if (path.startsWith("/opensky/states/all")) {
        const upstreamUrl = OPENSKY_API_BASE + "/states/all" + url.search;
        return upstreamFetch(upstreamUrl, { headers: { Accept: "application/json" } });
      }

      if (path.startsWith("/osplaces/postcode")) {
        if (!env.OS_PLACES_API_KEY) return json({ error: "OS_PLACES_API_KEY not configured" }, 500);
        const postcode = String(url.searchParams.get("postcode") || "").trim();
        if (!postcode) return json({ error: "postcode query parameter required" }, 400);
        const q = new URLSearchParams({
          postcode,
          key: env.OS_PLACES_API_KEY,
          maxresults: "1",
          output_srs: "EPSG:4326",
        });
        return upstreamFetch(`${OS_PLACES_API_BASE}/postcode?${q.toString()}`, {
          headers: { Accept: "application/json" },
        });
      }

      if (path.startsWith("/webtris/")) {
        const sub = path.replace(/^\/webtris\/?/, "");
        return upstreamFetch(`${WEBTRIS_API_BASE}/${sub}${url.search}`, {
          headers: { Accept: "application/json" },
        });
      }

      if (path.startsWith("/signalbox/health")) {
        return json({
          ok: true,
          configured: !!env.SIGNALBOX_API_KEY,
          endpoint: SIGNALBOX_API_BASE,
        });
      }

      if (path.startsWith("/signalbox/")) {
        if (!env.SIGNALBOX_API_KEY) return json({ error: "SIGNALBOX_API_KEY not configured" }, 500);
        const subPathAndQuery = buildSignalboxPath(url);
        return upstreamFetch(`${SIGNALBOX_API_BASE}${subPathAndQuery}`, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${env.SIGNALBOX_API_KEY}`,
          },
        });
      }

      if (path.startsWith("/nre/health")) {
        return json({ ok: true, configured: false, endpoint: "NRE Darwin not configured in worker" });
      }

      if (path.startsWith("/nre/stations")) {
        return handleNreStations(url);
      }

      if (path.startsWith("/geo/search")) {
        const q = String(url.searchParams.get("q") || "").trim();
        const limit = String(url.searchParams.get("limit") || "1");
        if (!q) return json({ error: "q query parameter required" }, 400);
        const upstream = `${NOMINATIM_BASE}?q=${encodeURIComponent(q)}&format=jsonv2&limit=${encodeURIComponent(limit)}`;
        return upstreamFetch(upstream, {
          headers: { Accept: "application/json", "User-Agent": "ControlRoom-Worker/1.0" },
        });
      }

      if (path.startsWith("/flight/schedule")) {
        if (!env.AVIATIONSTACK_API_KEY) return json({ ok: false, reason: "AVIATIONSTACK_API_KEY not configured", flight: null }, 200);
        const callsign = String(url.searchParams.get("callsign") || "").trim().toUpperCase();
        const icao24 = String(url.searchParams.get("icao24") || "").trim().toLowerCase();
        if (!callsign && !icao24) return json({ ok: false, reason: "callsign or icao24 required", flight: null }, 400);
        const q = new URLSearchParams({ access_key: env.AVIATIONSTACK_API_KEY, limit: "12" });
        if (callsign) q.set("flight_iata", callsign);
        const upstream = `${AVIATIONSTACK_BASE}/flights?${q.toString()}`;
        const r = await fetch(upstream, { headers: { Accept: "application/json" } });
        if (!r.ok) return json({ ok: false, reason: `aviationstack HTTP ${r.status}` }, 502);
        const body = await r.json();
        const items = Array.isArray(body?.data) ? body.data : [];
        if (!items.length) return json({ ok: true, reason: "no schedule match", flight: null }, 200);
        const top = items[0];
        const dep = top?.departure || {};
        const arr = top?.arrival || {};
        const flightObj = top?.flight || {};
        const airline = top?.airline || {};
        return json({
          ok: true,
          flight: {
            flight_code: flightObj.iata || flightObj.icao || callsign,
            status: top.flight_status || "unknown",
            airline: airline.name || "",
            departure: {
              airport: dep.airport || dep.iata || dep.icao || "",
              scheduled: dep.scheduled || null,
              estimated: dep.estimated || null,
              actual: dep.actual || null,
              delay: dep.delay || null,
            },
            arrival: {
              airport: arr.airport || arr.iata || arr.icao || "",
              scheduled: arr.scheduled || null,
              estimated: arr.estimated || null,
              actual: arr.actual || null,
              delay: arr.delay || null,
            },
          },
        });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: "Proxy failure", detail: String(err?.message || err) }, 502);
    }
  },
};
