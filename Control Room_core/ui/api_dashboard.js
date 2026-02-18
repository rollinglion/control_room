import { getEnabledAPIs } from "../api_catalogue/api_discovery.js";

export function renderAPIDashboard(containerId = "google-api-dashboard-list") {
  const apis = getEnabledAPIs();
  console.log("Enabled Intelligence APIs:");
  apis.forEach((api) => console.log(api.name, api.capability));

  if (typeof document === "undefined") return apis;
  const container = document.getElementById(containerId);
  if (!container) return apis;
  container.innerHTML = apis
    .map((api) => `<div><strong>${api.name}</strong> - ${api.capability}</div>`)
    .join("");
  return apis;
}

if (typeof window !== "undefined") {
  window.renderAPIDashboard = renderAPIDashboard;
  const run = () => renderAPIDashboard();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
