import API_KEYS from "../../00_config/api_keys.js";
import GOOGLE_API_CATALOGUE from "../api_catalogue/google_api_catalogue.js";

function getGoogleApiKey() {
  const fromModule = String(API_KEYS?.GOOGLE_MAPS || "").trim();
  if (fromModule) return fromModule;
  if (typeof window === "undefined") return "";
  return String(window.GOOGLE_MAPS_API_KEY || window.GOOGLE_STREETVIEW_API_KEY || "").trim();
}

async function fetchJson(url, options) {
  const resp = await fetch(url, options);
  if (!resp.ok) throw new Error("Google API request failed: " + resp.status);
  return resp.json();
}

class GoogleIntelligenceService {
  get catalogue() {
    return GOOGLE_API_CATALOGUE;
  }

  isConfigured() {
    return !!getGoogleApiKey();
  }

  async geocode(address) {
    const endpoint = GOOGLE_API_CATALOGUE.geospatial_core.geocoding.endpoint;
    const key = getGoogleApiKey();
    if (!key || !address) return null;
    const url = `${endpoint}?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`;
    return fetchJson(url);
  }

  async reverseGeocode(lat, lng) {
    const endpoint = GOOGLE_API_CATALOGUE.geospatial_core.geocoding.endpoint;
    const key = getGoogleApiKey();
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const url = `${endpoint}?latlng=${encodeURIComponent(lat + "," + lng)}&key=${encodeURIComponent(key)}`;
    return fetchJson(url);
  }

  async getElevation(lat, lng) {
    const endpoint = GOOGLE_API_CATALOGUE.geospatial_core.elevation.endpoint;
    const key = getGoogleApiKey();
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const url = `${endpoint}?locations=${encodeURIComponent(lat + "," + lng)}&key=${encodeURIComponent(key)}`;
    return fetchJson(url);
  }

  async getNearbyPlaces(lat, lng, radius = 200) {
    const endpointBase = GOOGLE_API_CATALOGUE.geospatial_core.places.endpoint;
    const key = getGoogleApiKey();
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const endpoint = `${endpointBase}/nearbysearch/json`;
    const url = `${endpoint}?location=${encodeURIComponent(lat + "," + lng)}&radius=${encodeURIComponent(radius)}&key=${encodeURIComponent(key)}`;
    return fetchJson(url);
  }

  getStreetView(lat, lng, size = "600x400") {
    const endpoint = GOOGLE_API_CATALOGUE.imagery.street_view_static.endpoint;
    const key = getGoogleApiKey();
    if (!key || !Number.isFinite(lat) || !Number.isFinite(lng)) return "";
    return `${endpoint}?location=${encodeURIComponent(lat + "," + lng)}&size=${encodeURIComponent(size)}&key=${encodeURIComponent(key)}`;
  }

  async enrichLocation(input) {
    const lat = Number(input?.lat);
    const lng = Number(input?.lng);
    const address = String(input?.address || "").trim();
    if (!this.isConfigured()) return { ok: false, reason: "NO_KEY" };
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, reason: "NO_COORDS" };

    const [geo, elev, places] = await Promise.all([
      address ? this.geocode(address).catch(() => null) : this.reverseGeocode(lat, lng).catch(() => null),
      this.getElevation(lat, lng).catch(() => null),
      this.getNearbyPlaces(lat, lng).catch(() => null)
    ]);

    return {
      ok: true,
      geocode: geo,
      elevation: elev,
      nearbyPlaces: places,
      streetViewUrl: this.getStreetView(lat, lng)
    };
  }
}

const instance = new GoogleIntelligenceService();

if (typeof window !== "undefined") {
  window.GoogleIntelligenceService = instance;
}

export default instance;
