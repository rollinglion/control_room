import GOOGLE_API_CATALOGUE from "./google_api_catalogue.js";

export function getEnabledAPIs() {
  const enabled = [];
  for (const category in GOOGLE_API_CATALOGUE) {
    const section = GOOGLE_API_CATALOGUE[category] || {};
    for (const api in section) {
      const def = section[api];
      if (def && def.enabled) {
        enabled.push({
          category,
          name: api,
          endpoint: def.endpoint,
          capability: def.capability
        });
      }
    }
  }
  return enabled;
}

if (typeof window !== "undefined") {
  window.GoogleAPIDiscovery = { getEnabledAPIs };
}
