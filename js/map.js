// ================== map.js ==================

// Ã¢â€â‚¬Ã¢â€â‚¬ Status / Progress helpers Ã¢â€â‚¬Ã¢â€â‚¬

function setStatus(msg) {
  const el = document.getElementById("status-text");
  if (el) el.textContent = msg;
}

function showToast(message, type = "info", timeoutMs = 2600) {
  const stack = document.getElementById("toast-stack");
  if (!stack || !message) return;
  const toast = document.createElement("div");
  toast.className = `toast-msg toast-${type}`;
  toast.textContent = String(message);
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  window.setTimeout(() => {
    toast.classList.remove("show");
    window.setTimeout(() => toast.remove(), 220);
  }, timeoutMs);
}

function setSkeletonVisible(id, visible) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden", !visible);
  el.setAttribute("aria-hidden", visible ? "false" : "true");
}

function showProgress() { document.getElementById("data-progress")?.classList.remove("done"); }
function hideProgress() { document.getElementById("data-progress")?.classList.add("done"); }
function setProgress(scanned, total, matchCount) {
  const pct = Math.round((scanned / total) * 100);
  const f = document.getElementById("progress-fill");
  const t = document.getElementById("progress-text");
  const p = document.getElementById("progress-pct");
  if (f) f.style.width = pct + "%";
  if (t) t.textContent = `Searching (${scanned}/${total} files)...`;
  if (p) p.textContent = matchCount != null ? `${matchCount} found` : pct + " %";
}

function showPscProgress() { document.getElementById("psc-progress")?.classList.remove("done"); }
function hidePscProgress() { document.getElementById("psc-progress")?.classList.add("done"); }
function setPscProgress(msg, pct) {
  const f = document.getElementById("psc-progress-fill");
  const t = document.getElementById("psc-progress-text");
  const p = document.getElementById("psc-progress-pct");
  if (f) f.style.width = (pct || 0) + "%";
  if (t) t.textContent = msg;
  if (p) p.textContent = pct != null ? pct + "%" : "";
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Companies House data Ã¢â€â‚¬Ã¢â€â‚¬

let CH_INDEX = [];
let CH_CACHE = {};
let CH_LAST_RESULTS = [];
let CH_TOTAL_ROWS = 0;
let I2_ENTITY_CATALOG = [];
const I2_ENTITY_BY_ID = {};
const I2_ENTITY_BY_NAME = {};
let I2_CATALOG_LOADED = false;
let I2_CATALOG_LOADING_PROMISE = null;

const I2_DEFAULT_BY_CATEGORY = {
  people: "Person",
  buildings: "Location",
  financial: "Financial Account",
  vehicles: "Vehicle",
  aviation: "Aircraft",
  military: "Operation",
  communication: "Communication Entity",
  online_services: "Communication Entity",
  real_estate: "Location",
  weapons: "Firearm",
  social_media: "Communication Entity",
  law_enforcement: "Operation",
  misc: "Location"
};

const I2_ENTITY_TO_CATEGORY = {
  person: "people",
  organisation: "financial",
  location: "buildings",
  vehicle: "vehicles",
  aircraft: "aviation",
  firearm: "military",
  operation: "military",
  vessel: "vehicles",
  "communication entity": "communication",
  "financial account": "financial"
};

async function loadCompaniesHouseIndex() {
  try {
    const r = await fetch("data/companies_house_index.json");
    if (!r.ok) { console.warn("No local company index Ã¢â‚¬â€ using API only"); return; }
    CH_INDEX = await r.json();
  } catch (e) { console.warn("Company index load failed:", e); }
}
let CRIME_DATA = [];
// Ã¢â€â‚¬Ã¢â€â‚¬ Crime Loader Function Ã¢â€â‚¬Ã¢â€â‚¬
let CRIME_FORCE_MAP = new Map();
let CRIME_TYPES = new Set();
let CRIME_TYPE_STATS = new Map();
let CRIME_MONTHS = [];
let CRIME_DEFAULT_MONTH_START = 0;
let CRIME_FILTER_STATE = {
  forces: new Set(),
  types: new Set(),
  monthStartIndex: 0
};
let CRIME_SPATIAL_FILTER = {
  bounds: null,
  rectangle: null,
  drawMode: false,
  startLatLng: null,
  dragging: false
};
let CRIME_LAST_RENDER_TOTAL = 0;
let CRIME_LAST_RENDER_FILTERED = 0;

const CRIME_FILTER_UI = {
  initialized: false,
  forceSelect: null,
  typeSelect: null,
  statusLabel: null,
  showAllBtn: null,
  filterForceBtn: null,
  resetBtn: null,
  applyBtn: null,
  clearBtn: null,
  forceSearchInput: null,
  forceSearchApplyBtn: null,
  boxModeBtn: null,
  boxClearBtn: null,
  monthSlider: null,
  monthLabel: null,
  windowPills: [],
  summaryIncidents: null,
  summaryStops: null,
  summaryOutcomes: null,
  summaryCells: null
};

const CRIME_INSPECTOR_UI = {
  container: null,
  empty: null,
  body: null,
  title: null,
  subtitle: null,
  range: null,
  incidents: null,
  stops: null,
  outcomes: null,
  timeline: null,
  incidentList: null,
  incidentEmpty: null,
  zoomBtn: null,
  clearBtn: null,
  clearPinsBtn: null
};

const CRIME_INSPECTOR_STATE = {
  feature: null,
  marker: null,
  stats: null,
  samples: []
};

let CRIME_INCIDENT_LAYER = null;

function initCrimeFilterUI() {
  if (CRIME_FILTER_UI.initialized) return;
  CRIME_FILTER_UI.forceSelect = document.getElementById("crime-force-filter");
  CRIME_FILTER_UI.typeSelect = document.getElementById("crime-type-filter");
  CRIME_FILTER_UI.statusLabel = document.getElementById("crime-filter-status");
  CRIME_FILTER_UI.showAllBtn = document.getElementById("crime-show-all-btn");
  CRIME_FILTER_UI.filterForceBtn = document.getElementById("crime-filter-force-btn");
  CRIME_FILTER_UI.resetBtn = document.getElementById("crime-reset-filter-btn");
  CRIME_FILTER_UI.clearBtn = document.getElementById("crime-clear-filter-btn");
  CRIME_FILTER_UI.forceSearchInput = document.getElementById("crime-force-search");
  CRIME_FILTER_UI.forceSearchApplyBtn = document.getElementById("crime-force-search-apply");
  CRIME_FILTER_UI.boxModeBtn = document.getElementById("crime-box-mode-btn");
  CRIME_FILTER_UI.boxClearBtn = document.getElementById("crime-box-clear-btn");
  CRIME_FILTER_UI.monthSlider = document.getElementById("crime-month-slider");
  CRIME_FILTER_UI.monthLabel = document.getElementById("crime-month-slider-label");
  CRIME_FILTER_UI.windowPills = Array.from(document.querySelectorAll(".crime-window-pill"));
  CRIME_FILTER_UI.summaryIncidents = document.getElementById("crime-summary-incidents");
  CRIME_FILTER_UI.summaryStops = document.getElementById("crime-summary-stops");
  CRIME_FILTER_UI.summaryOutcomes = document.getElementById("crime-summary-outcomes");
  CRIME_FILTER_UI.summaryCells = document.getElementById("crime-summary-cells");

  initCrimeInspectorUI();

  CRIME_FILTER_UI.initialized = !!(CRIME_FILTER_UI.forceSelect && CRIME_FILTER_UI.typeSelect);
  if (!CRIME_FILTER_UI.initialized) return;

  const rerender = () => renderCrimeLayerFiltered();

  CRIME_FILTER_UI.forceSelect?.addEventListener("change", () => {
    updateCrimeFiltersFromSelects();
    rerender();
  });
  CRIME_FILTER_UI.forceSelect?.addEventListener("mousedown", (ev) => {
    const opt = ev.target;
    if (!opt || opt.tagName !== "OPTION") return;
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    ev.preventDefault();
    Array.from(CRIME_FILTER_UI.forceSelect.options || []).forEach((o) => { o.selected = false; });
    opt.selected = true;
    updateCrimeFiltersFromSelects();
    rerender();
  });
  CRIME_FILTER_UI.typeSelect?.addEventListener("change", () => {
    updateCrimeFiltersFromSelects();
    rerender();
  });

  CRIME_FILTER_UI.showAllBtn?.addEventListener("click", () => {
    clearCrimeFilters();
    clearCrimeSpatialFilter();
    rerender();
    showToast?.("Crime grid reset to all forces", "info");
  });

  CRIME_FILTER_UI.resetBtn?.addEventListener("click", () => {
    clearCrimeFilters();
    clearCrimeSpatialFilter();
    setActiveForce(null, { silent: true });
    rerender();
    showToast?.("Crime filters reset", "info");
  });
  CRIME_FILTER_UI.clearBtn?.addEventListener("click", () => {
    clearCrimeFilters();
    clearCrimeSpatialFilter();
    rerender();
    showToast?.("Crime selection cleared", "info");
  });

  CRIME_FILTER_UI.monthSlider?.addEventListener("input", () => {
    const idx = Number(CRIME_FILTER_UI.monthSlider.value || 0);
    setCrimeMonthStartIndex(idx, { silent: true });
  });
  CRIME_FILTER_UI.monthSlider?.addEventListener("change", () => {
    const idx = Number(CRIME_FILTER_UI.monthSlider.value || 0);
    setCrimeMonthStartIndex(idx);
    rerender();
  });

  CRIME_FILTER_UI.windowPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const months = Number(pill.dataset.monthWindow || 0);
      setCrimeMonthWindow(months);
      rerender();
    });
  });

  updateCrimeTimelineControls();

  CRIME_FILTER_UI.filterForceBtn?.addEventListener("click", () => {
    if (!ACTIVE_FORCE) {
      showToast?.("Select a police force area first", "info");
      setStatus?.("Select a police force area, then apply the force filter");
      return;
    }
    CRIME_FILTER_STATE.forces = new Set([ACTIVE_FORCE]);
    syncCrimeFilterStateToUI();
    rerender();
    showToast?.(`Crime layer filtered to ${ACTIVE_FORCE}`, "success");
  });

  const applyForceSearch = () => {
    const q = String(CRIME_FILTER_UI.forceSearchInput?.value || "").trim().toLowerCase();
    if (!q) return;
    const options = Array.from(CRIME_FILTER_UI.forceSelect?.options || []);
    if (!options.length) return;
    const best = options
      .map((opt) => ({ opt, text: String(opt.textContent || "").toLowerCase() }))
      .sort((a, b) => {
        const aStart = a.text.startsWith(q) ? 0 : 1;
        const bStart = b.text.startsWith(q) ? 0 : 1;
        if (aStart !== bStart) return aStart - bStart;
        const ai = a.text.indexOf(q);
        const bi = b.text.indexOf(q);
        if (ai !== bi) return ai - bi;
        return a.text.localeCompare(b.text);
      })
      .find((entry) => entry.text.includes(q));
    if (!best) {
      showToast?.("No force match found", "info");
      return;
    }
    clearCrimeFilters();
    CRIME_FILTER_STATE.forces = new Set([best.opt.value]);
    syncCrimeFilterStateToUI();
    renderCrimeLayerFiltered();
    showToast?.(`Crime filter set to ${best.opt.value}`, "success");
  };
  CRIME_FILTER_UI.forceSearchApplyBtn?.addEventListener("click", applyForceSearch);
  CRIME_FILTER_UI.forceSearchInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      applyForceSearch();
    }
  });

  CRIME_FILTER_UI.boxModeBtn?.addEventListener("click", () => toggleCrimeBoxDrawMode());
  CRIME_FILTER_UI.boxClearBtn?.addEventListener("click", () => {
    clearCrimeSpatialFilter();
    renderCrimeLayerFiltered();
  });
  initCrimeSpatialDrawHooks();

  if (OVERLAY_LOAD_STATE?.crimeLoaded) {
    populateCrimeFilters();
  } else {
    updateCrimeFilterStatus();
  }
}

function formatCrimeNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

function normalizeCrimeFeatureForces(feature) {
  if (!feature) return ["Unknown Force"];
  if (feature.__forceCache) return feature.__forceCache;
  const props = feature.properties || {};
  const source = [];
  if (props.reported_by) source.push(String(props.reported_by));
  if (Array.isArray(props.forces)) source.push(...props.forces.map(String));
  const cleaned = [...new Set(source.map((f) => String(f || "").trim()).filter(Boolean))];
  feature.__forceCache = cleaned.length ? cleaned : ["Unknown Force"];
  return feature.__forceCache;
}

function clearCrimeFilters() {
  CRIME_FILTER_STATE.forces = new Set();
  CRIME_FILTER_STATE.types = new Set();
  setCrimeMonthStartIndex(CRIME_DEFAULT_MONTH_START, { silent: true });
  if (!CRIME_FILTER_UI.initialized) {
    updateCrimeFilterStatus();
    return;
  }
  Array.from(CRIME_FILTER_UI.forceSelect?.options || []).forEach((opt) => { opt.selected = false; });
  Array.from(CRIME_FILTER_UI.typeSelect?.options || []).forEach((opt) => { opt.selected = false; });
  updateCrimeFiltersFromSelects();
  updateCrimeTimelineControls();
}

function syncCrimeFilterStateToUI() {
  if (!CRIME_FILTER_UI.initialized) return;
  Array.from(CRIME_FILTER_UI.forceSelect?.options || []).forEach((opt) => {
    opt.selected = CRIME_FILTER_STATE.forces.has(opt.value);
  });
  Array.from(CRIME_FILTER_UI.typeSelect?.options || []).forEach((opt) => {
    opt.selected = CRIME_FILTER_STATE.types.has(opt.value);
  });
}

function updateCrimeFilterStatus(stats = null) {
  if (!CRIME_FILTER_UI.statusLabel) return;
  const filtered = stats?.filtered ?? CRIME_LAST_RENDER_FILTERED;
  const total = stats?.total ?? CRIME_LAST_RENDER_TOTAL;
  const pieces = [];
  if (!total) {
    pieces.push("Crime data pending");
  } else if (!CRIME_FILTER_STATE.forces.size && !CRIME_FILTER_STATE.types.size) {
    pieces.push(`Showing ${formatCrimeNumber(filtered)} grid cells`);
  } else {
    pieces.push(`Filtering ${formatCrimeNumber(filtered)} of ${formatCrimeNumber(total)} cells`);
    if (CRIME_FILTER_STATE.forces.size) {
      pieces.push(`${CRIME_FILTER_STATE.forces.size} force${CRIME_FILTER_STATE.forces.size === 1 ? "" : "s"}`);
    }
    if (CRIME_FILTER_STATE.types.size) {
      pieces.push(`${CRIME_FILTER_STATE.types.size} type${CRIME_FILTER_STATE.types.size === 1 ? "" : "s"}`);
    }
  }
  if (ACTIVE_FORCE && !CRIME_FILTER_STATE.forces.size) {
    pieces.push(`Selected force: ${ACTIVE_FORCE}`);
  }
  if (CRIME_MONTHS.length) {
    pieces.push(describeCrimeMonthRange());
  }
  if (CRIME_SPATIAL_FILTER.bounds) {
    const c = CRIME_SPATIAL_FILTER.bounds.getCenter();
    pieces.push(`Area box @ ${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}`);
  }
  CRIME_FILTER_UI.statusLabel.textContent = pieces.join(" | ");
}

function populateCrimeFilters() {
  if (!CRIME_FILTER_UI.initialized) return;
  const { forceSelect, typeSelect } = CRIME_FILTER_UI;
  if (forceSelect) {
    forceSelect.innerHTML = "";
    const frag = document.createDocumentFragment();
    Array.from(CRIME_FORCE_MAP.entries())
      .map(([name, stats]) => ({
        name,
        crimes: Number(stats?.crimes || 0),
        stops: Number(stats?.stops || 0)
      }))
      .sort((a, b) => (b.crimes - a.crimes) || a.name.localeCompare(b.name))
      .forEach((entry) => {
        const opt = document.createElement("option");
        opt.value = entry.name;
        const stopText = entry.stops ? ` - ${formatCrimeNumber(entry.stops)} stop/search` : "";
        opt.textContent = `${entry.name} (${formatCrimeNumber(entry.crimes)} incidents${stopText})`;
        frag.appendChild(opt);
      });
    forceSelect.appendChild(frag);
  }

  if (typeSelect) {
    typeSelect.innerHTML = "";
    const frag = document.createDocumentFragment();
    Array.from(CRIME_TYPE_STATS.entries())
      .map(([type, stats]) => ({ type, crimes: Number(stats?.crimes || 0) }))
      .sort((a, b) => (b.crimes - a.crimes) || a.type.localeCompare(b.type))
      .forEach((entry) => {
        const opt = document.createElement("option");
        opt.value = entry.type;
        opt.textContent = `${entry.type} (${formatCrimeNumber(entry.crimes)})`;
        frag.appendChild(opt);
      });
    typeSelect.appendChild(frag);
  }

  syncCrimeFilterStateToUI();
  updateCrimeFilterStatus();
}

function updateCrimeFiltersFromSelects() {
  if (!CRIME_FILTER_UI.initialized) return;
  const selectedForces = Array.from(CRIME_FILTER_UI.forceSelect?.selectedOptions || [])
    .map((opt) => opt.value)
    .filter(Boolean);
  const selectedTypes = Array.from(CRIME_FILTER_UI.typeSelect?.selectedOptions || [])
    .map((opt) => opt.value)
    .filter(Boolean);
  CRIME_FILTER_STATE.forces = new Set(selectedForces);
  CRIME_FILTER_STATE.types = new Set(selectedTypes);
  updateCrimeFilterStatus();
}

const MONTH_SHORT_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatMonthLabel(value) {
  if (!value) return "Unknown";
  const [yearStr, monthStr] = String(value).split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return value;
  return `${MONTH_SHORT_NAMES[month - 1]} ${year}`;
}

function getActiveMonthStart() {
  if (!CRIME_MONTHS.length) return null;
  const idx = Math.min(Math.max(CRIME_FILTER_STATE.monthStartIndex || 0, 0), CRIME_MONTHS.length - 1);
  return CRIME_MONTHS[idx] || null;
}

function describeCrimeMonthRange() {
  if (!CRIME_MONTHS.length) return "Timeline pending";
  const startIdx = Math.min(Math.max(CRIME_FILTER_STATE.monthStartIndex || 0, 0), CRIME_MONTHS.length - 1);
  const startMonth = CRIME_MONTHS[startIdx];
  const endMonth = CRIME_MONTHS[CRIME_MONTHS.length - 1];
  const span = CRIME_MONTHS.length - startIdx;
  if (startIdx === 0) {
    return `All ${CRIME_MONTHS.length} months (through ${formatMonthLabel(endMonth)})`;
  }
  return `Last ${span} month${span === 1 ? "" : "s"} Â· ${formatMonthLabel(startMonth)} â†’ ${formatMonthLabel(endMonth)}`;
}

function setCrimeMonthStartIndex(index, opts = {}) {
  const hasMonths = CRIME_MONTHS.length > 0;
  const maxIdx = hasMonths ? Math.max(CRIME_MONTHS.length - 1, 0) : 0;
  const next = Math.max(0, Math.min(Number.isFinite(index) ? Number(index) : 0, maxIdx));
  CRIME_FILTER_STATE.monthStartIndex = next;
  updateCrimeTimelineControls();
  if (!opts.silent) {
    updateCrimeFilterStatus();
  }
}

function setCrimeMonthWindow(monthCount, opts = {}) {
  if (!CRIME_MONTHS.length) return;
  if (!monthCount || monthCount <= 0) {
    setCrimeMonthStartIndex(0, opts);
  } else {
    const windowSize = Math.max(1, Math.min(monthCount, CRIME_MONTHS.length));
    const startIdx = Math.max(CRIME_MONTHS.length - windowSize, 0);
    setCrimeMonthStartIndex(startIdx, opts);
  }
  if (opts?.asDefault) {
    CRIME_DEFAULT_MONTH_START = CRIME_FILTER_STATE.monthStartIndex;
  }
}

function updateCrimeTimelineControls() {
  const slider = CRIME_FILTER_UI.monthSlider;
  const months = CRIME_MONTHS.length;
  if (slider) {
    slider.max = Math.max(months - 1, 0);
    slider.value = Math.min(CRIME_FILTER_STATE.monthStartIndex || 0, slider.max);
    slider.disabled = months <= 1;
  }
  if (CRIME_FILTER_UI.monthLabel) {
    CRIME_FILTER_UI.monthLabel.textContent = months ? describeCrimeMonthRange() : "Timeline not available";
  }
  if (CRIME_FILTER_UI.windowPills?.length) {
    const activeWindow = months ? (months - Math.min(CRIME_FILTER_STATE.monthStartIndex || 0, months)) : 0;
    CRIME_FILTER_UI.windowPills.forEach((pill) => {
      const requested = Number(pill.dataset.monthWindow || 0);
      const shouldHighlight = requested === 0 ? (CRIME_FILTER_STATE.monthStartIndex === 0) : (requested === activeWindow);
      pill.classList.toggle("active", shouldHighlight && months > 0);
    });
  }
}

function updateCrimeSummaryUI(summary = null, cells = 0) {
  const incidentsText = summary ? formatCrimeNumber(summary.incidents || 0) : "--";
  const stopsText = summary ? formatCrimeNumber(summary.stops || 0) : "--";
  const outcomesText = summary ? formatCrimeNumber(summary.outcomes || 0) : "--";
  const cellsText = formatCrimeNumber(cells || 0);
  if (CRIME_FILTER_UI.summaryIncidents) CRIME_FILTER_UI.summaryIncidents.textContent = incidentsText;
  if (CRIME_FILTER_UI.summaryStops) CRIME_FILTER_UI.summaryStops.textContent = stopsText;
  if (CRIME_FILTER_UI.summaryOutcomes) CRIME_FILTER_UI.summaryOutcomes.textContent = outcomesText;
  if (CRIME_FILTER_UI.summaryCells) CRIME_FILTER_UI.summaryCells.textContent = cellsText;
}

function summarizeFeatureForActiveRange(feature, monthStart) {
  const props = feature?.properties || {};
  const stats = {
    incidents: 0,
    stops: 0,
    outcomes: 0,
    timeline: [],
    label: describeCrimeMonthRange()
  };
  const timeline = props.timeline;
  const includeAll = !monthStart;
  if (timeline) {
    if (!feature.__timelineEntries) {
      feature.__timelineEntries = Object.entries(timeline).sort((a, b) => a[0].localeCompare(b[0]));
    }
    const entries = feature.__timelineEntries;
    const filtered = [];
    for (const [month, bucket] of entries) {
      if (!includeAll && month < monthStart) continue;
      const crime = Number(bucket?.crime || 0);
      const stop = Number(bucket?.stop || 0);
      const outcome = Number(bucket?.outcome || 0);
      const total = crime + stop + outcome;
      if (!total) continue;
      stats.incidents += crime;
      stats.stops += stop;
      stats.outcomes += outcome;
      filtered.push({ month, crime, stop, outcome });
    }
    stats.timeline = filtered.length ? filtered : entries.map(([month, bucket]) => ({
      month,
      crime: Number(bucket?.crime || 0),
      stop: Number(bucket?.stop || 0),
      outcome: Number(bucket?.outcome || 0)
    }));
  } else if (includeAll) {
    stats.incidents = Number(props.count || 0);
    stats.stops = Number(props.stop_search_total || 0);
    stats.outcomes = Number(props.outcome_total || 0);
  }
  stats.hasActivity = (stats.incidents + stats.stops + stats.outcomes) > 0;
  return stats;
}

function getCrimeFeatureLatLng(feature) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return [lat, lon];
}

function initCrimeInspectorUI() {
  if (CRIME_INSPECTOR_UI.container) return;
  CRIME_INSPECTOR_UI.container = document.getElementById("crime-inspector");
  if (!CRIME_INSPECTOR_UI.container) return;
  CRIME_INSPECTOR_UI.empty = document.getElementById("crime-inspector-empty");
  CRIME_INSPECTOR_UI.body = document.getElementById("crime-inspector-body");
  CRIME_INSPECTOR_UI.title = document.getElementById("crime-inspector-title");
  CRIME_INSPECTOR_UI.subtitle = document.getElementById("crime-inspector-subtitle");
  CRIME_INSPECTOR_UI.range = document.getElementById("crime-inspector-range");
  CRIME_INSPECTOR_UI.incidents = document.getElementById("crime-inspector-incidents");
  CRIME_INSPECTOR_UI.stops = document.getElementById("crime-inspector-stops");
  CRIME_INSPECTOR_UI.outcomes = document.getElementById("crime-inspector-outcomes");
  CRIME_INSPECTOR_UI.timeline = document.getElementById("crime-inspector-timeline");
  CRIME_INSPECTOR_UI.incidentList = document.getElementById("crime-incident-list");
  CRIME_INSPECTOR_UI.incidentEmpty = document.getElementById("crime-incident-empty");
  CRIME_INSPECTOR_UI.zoomBtn = document.getElementById("crime-inspector-zoom");
  CRIME_INSPECTOR_UI.clearBtn = document.getElementById("crime-inspector-clear");
  CRIME_INSPECTOR_UI.clearPinsBtn = document.getElementById("crime-incident-clear-pins");

  CRIME_INSPECTOR_UI.zoomBtn?.addEventListener("click", () => {
    if (!CRIME_INSPECTOR_STATE.feature) return;
    const latLng = getCrimeFeatureLatLng(CRIME_INSPECTOR_STATE.feature);
    if (latLng) {
      map.flyTo(latLng, Math.max(map.getZoom(), 14), { duration: 0.7 });
    }
  });
  CRIME_INSPECTOR_UI.clearBtn?.addEventListener("click", () => {
    clearCrimeInspector();
  });
  CRIME_INSPECTOR_UI.clearPinsBtn?.addEventListener("click", () => {
    clearCrimeIncidentHighlights();
  });
  CRIME_INSPECTOR_UI.incidentList?.addEventListener("click", (event) => {
    const target = event.target.closest("button[data-incident-index]");
    if (!target) return;
    const idx = Number(target.dataset.incidentIndex);
    const samples = Array.isArray(CRIME_INSPECTOR_STATE.samples) ? CRIME_INSPECTOR_STATE.samples : [];
    const sample = samples[idx];
    if (sample) {
      highlightCrimeIncident(sample);
    }
  });
}

function focusCrimeInspector(feature, marker, stats) {
  if (!feature) {
    clearCrimeInspector();
    return;
  }
  CRIME_INSPECTOR_STATE.feature = feature;
  CRIME_INSPECTOR_STATE.marker = marker || null;
  CRIME_INSPECTOR_STATE.stats = stats || summarizeFeatureForActiveRange(feature, getActiveMonthStart());
  clearCrimeIncidentHighlights();
  renderCrimeInspector();
}

function renderCrimeInspector() {
  if (!CRIME_INSPECTOR_UI.container || !CRIME_INSPECTOR_STATE.feature) return;
  const props = CRIME_INSPECTOR_STATE.feature.properties || {};
  const stats = CRIME_INSPECTOR_STATE.stats || summarizeFeatureForActiveRange(CRIME_INSPECTOR_STATE.feature, getActiveMonthStart());
  const crimeType = props.dominant_type || "Crime Hotspot";
  const forces = normalizeCrimeFeatureForces(CRIME_INSPECTOR_STATE.feature);
  const mainForce = forces[0] || props.reported_by || "Unknown Force";
  if (CRIME_INSPECTOR_UI.title) CRIME_INSPECTOR_UI.title.textContent = crimeType;
  if (CRIME_INSPECTOR_UI.subtitle) {
    const extra = `${formatCrimeNumber(stats.incidents)} incidents Â· ${formatCrimeNumber(stats.stops)} stop/search`;
    CRIME_INSPECTOR_UI.subtitle.textContent = `${mainForce} Â· ${extra}`;
  }
  if (CRIME_INSPECTOR_UI.range) CRIME_INSPECTOR_UI.range.textContent = stats.label || describeCrimeMonthRange();
  if (CRIME_INSPECTOR_UI.incidents) CRIME_INSPECTOR_UI.incidents.textContent = formatCrimeNumber(stats.incidents);
  if (CRIME_INSPECTOR_UI.stops) CRIME_INSPECTOR_UI.stops.textContent = formatCrimeNumber(stats.stops);
  if (CRIME_INSPECTOR_UI.outcomes) CRIME_INSPECTOR_UI.outcomes.textContent = formatCrimeNumber(stats.outcomes);
  renderCrimeInspectorTimeline(stats.timeline);
  const samples = getCrimeSamplesForActiveRange(props, getActiveMonthStart());
  CRIME_INSPECTOR_STATE.samples = samples;
  renderCrimeIncidentList(samples);
  CRIME_INSPECTOR_UI.body?.classList.remove("hidden");
  CRIME_INSPECTOR_UI.empty?.classList.add("hidden");
}

function renderCrimeInspectorTimeline(series = []) {
  const container = CRIME_INSPECTOR_UI.timeline;
  if (!container) return;
  if (!Array.isArray(series) || !series.length) {
    container.textContent = "No timeline data";
    return;
  }
  const trimmed = series.slice(-12);
  const maxValue = Math.max(...trimmed.map((e) => (e.crime || 0) + (e.stop || 0) + (e.outcome || 0)), 1);
  container.innerHTML = trimmed.map((entry) => {
    const total = (entry.crime || 0) + (entry.stop || 0) + (entry.outcome || 0);
    const height = Math.max(6, Math.round((total / maxValue) * 100));
    const label = formatMonthLabel(entry.month || "");
    return `<div class="crime-inspector-timeline-bar" style="height:${height}%"><span>${escapeHtml(label.split(" ")[0])}</span></div>`;
  }).join("");
}

function renderCrimePopupTimeline(series = []) {
  if (!Array.isArray(series) || !series.length) return "";
  const trimmed = series.slice(-6);
  const maxValue = Math.max(...trimmed.map((entry) => (entry.crime || 0) + (entry.stop || 0) + (entry.outcome || 0)), 1);
  const bars = trimmed.map((entry) => {
    const total = (entry.crime || 0) + (entry.stop || 0) + (entry.outcome || 0);
    const height = Math.max(6, Math.round((total / maxValue) * 100));
    return `<div class="crime-popup-timeline-bar" style="height:${height}%"></div>`;
  }).join("");
  return `<div class="crime-popup-timeline">${bars}</div>`;
}

function getCrimeSamplesForActiveRange(props = {}, monthStart = getActiveMonthStart()) {
  const samples = Array.isArray(props.incident_samples) ? props.incident_samples : [];
  if (!monthStart) return samples;
  return samples.filter((sample) => !sample?.month || String(sample.month) >= monthStart);
}

function renderCrimeIncidentList(samples) {
  const list = CRIME_INSPECTOR_UI.incidentList;
  if (!list) return;
  list.innerHTML = "";
  if (!samples?.length) {
    if (CRIME_INSPECTOR_UI.incidentEmpty) {
      CRIME_INSPECTOR_UI.incidentEmpty.classList.remove("hidden");
      list.appendChild(CRIME_INSPECTOR_UI.incidentEmpty);
    }
    return;
  }
  if (CRIME_INSPECTOR_UI.incidentEmpty) {
    CRIME_INSPECTOR_UI.incidentEmpty.classList.add("hidden");
  }
  samples.forEach((sample, idx) => {
    const card = document.createElement("div");
    card.className = "crime-incident-card";
    const monthLabel = sample.month ? formatMonthLabel(sample.month) : "Date N/A";
    const forceLabel = sample.force ? escapeHtml(sample.force) : "Force unknown";
    const locationLabel = sample.location ? escapeHtml(sample.location) : "Exact location withheld";
    card.innerHTML = `
      <div class="crime-incident-type">${escapeHtml(sample.type || "Incident")}</div>
      <div class="crime-incident-meta">
        <span>${escapeHtml(monthLabel)}</span>
        <span>${forceLabel}</span>
      </div>
      <div class="crime-incident-location">${locationLabel}</div>
      <div class="crime-incident-actions">
        <button class="btn-secondary btn-sm" type="button" data-incident-index="${idx}">Locate on map</button>
      </div>
    `;
    list.appendChild(card);
  });
}

function highlightCrimeIncident(sample) {
  if (!CRIME_INCIDENT_LAYER || !sample) return;
  const lat = Number(sample.lat);
  const lon = Number(sample.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    showToast?.("Exact incident location unavailable", "info");
    return;
  }
  const marker = L.circleMarker([lat, lon], {
    radius: 8,
    color: "#38bdf8",
    weight: 2,
    fillColor: "#0ea5e9",
    fillOpacity: 0.75
  });
  const lines = [
    `<strong>${escapeHtml(sample.type || "Incident")}</strong>`,
    sample.month ? `<span class="popup-label">${escapeHtml(formatMonthLabel(sample.month))}</span>` : "",
    sample.location ? escapeHtml(sample.location) : "Exact location withheld"
  ].filter(Boolean);
  marker.bindPopup(lines.join("<br>"));
  CRIME_INCIDENT_LAYER.addLayer(marker);
  marker.openPopup();
  map.flyTo([lat, lon], Math.max(map.getZoom(), 15), { duration: 0.7 });
}

function clearCrimeIncidentHighlights() {
  CRIME_INCIDENT_LAYER?.clearLayers();
}

function clearCrimeInspector() {
  CRIME_INSPECTOR_STATE.feature = null;
  CRIME_INSPECTOR_STATE.marker = null;
  CRIME_INSPECTOR_STATE.stats = null;
  CRIME_INSPECTOR_STATE.samples = [];
  if (!CRIME_INSPECTOR_UI.container) return;
  CRIME_INSPECTOR_UI.body?.classList.add("hidden");
  if (CRIME_INSPECTOR_UI.incidentList && CRIME_INSPECTOR_UI.incidentEmpty) {
    CRIME_INSPECTOR_UI.incidentList.innerHTML = "";
    CRIME_INSPECTOR_UI.incidentEmpty.classList.remove("hidden");
    CRIME_INSPECTOR_UI.incidentList.appendChild(CRIME_INSPECTOR_UI.incidentEmpty);
  }
  CRIME_INSPECTOR_UI.empty?.classList.remove("hidden");
  clearCrimeIncidentHighlights();
}

function buildCrimePopupHtml(props = {}, forces = [], crimeType = "Crime Hotspot", stats = null) {
  const incidentCount = Number((stats && stats.incidents != null) ? stats.incidents : (props.count || 0));
  const mainForce = forces[0] || props.reported_by || "Unknown Force";
  const extraForces = forces.slice(1);
  const stopTotal = Number((stats && stats.stops != null) ? stats.stops : (props.stop_search_total || 0));
  const outcomeTotal = Number((stats && stats.outcomes != null) ? stats.outcomes : (props.outcome_total || 0));
  const lines = [
    `<strong>${escapeHtml(crimeType)}</strong><br>`,
    `<span class="popup-label">Primary Force</span> ${escapeHtml(mainForce)}<br>`,
    `<span class="popup-label">Incidents</span> ${formatCrimeNumber(incidentCount)}`
  ];
  if (props.crime_outcome_top) {
    lines.push(`<br><span class="popup-label">Top Outcome</span> ${escapeHtml(props.crime_outcome_top)}`);
  }
  if (extraForces.length) {
    lines.push(`<br><span class="popup-label">Other Forces</span> ${escapeHtml(extraForces.slice(0, 2).join(", "))}`);
  }
  if (stopTotal) {
    lines.push(`<br><span class="popup-label">Stop & Search</span> ${formatCrimeNumber(stopTotal)} total`);
    if (props.stop_search_top_object) {
      lines.push(`<br><span class="popup-label">Top Object</span> ${escapeHtml(props.stop_search_top_object)}`);
    }
    if (props.stop_search_top_outcome) {
      lines.push(`<br><span class="popup-label">Top Stop Outcome</span> ${escapeHtml(props.stop_search_top_outcome)}`);
    }
    if (props.stop_search_top_ethnicity) {
      lines.push(`<br><span class="popup-label">Officer/Self Ethnicity</span> ${escapeHtml(props.stop_search_top_ethnicity)}`);
    }
  }
  if (outcomeTotal) {
    lines.push(`<br><span class="popup-label">Recorded Outcomes</span> ${formatCrimeNumber(outcomeTotal)}`);
    if (props.outcome_top) {
      lines.push(`<br><span class="popup-label">Prevailing Outcome</span> ${escapeHtml(props.outcome_top)}`);
    }
  }
  if (stats) {
    lines.push(`<br><span class="popup-label">Window</span> ${escapeHtml(stats.label || describeCrimeMonthRange())}`);
    if (stats.timeline?.length) {
      lines.push(renderCrimePopupTimeline(stats.timeline));
    }
  }
  const samples = getCrimeSamplesForActiveRange(props, getActiveMonthStart());
  if (samples.length) {
    const sample = samples[0];
    const sampleParts = [
      sample.type ? escapeHtml(sample.type) : null,
      sample.month ? formatMonthLabel(sample.month) : null,
      sample.location ? sample.location : null
    ].filter(Boolean);
    if (sampleParts.length) {
      lines.push(`<br><span class="popup-label">Sample Incident</span> ${escapeHtml(sampleParts.join(" Â· "))}`);
    }
  }
  return lines.join("");
}

function createCrimeMarker(feature, forces, crimeType, stats = null) {
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const [lon, lat] = coords;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const props = feature.properties || {};
  const incidentCount = Number((stats && stats.incidents != null) ? stats.incidents : (props.count || 0));
  const stopTotal = Number((stats && stats.stops != null) ? stats.stops : (props.stop_search_total || 0));
  const radius = Math.min(18, 4 + Math.sqrt(Math.max(incidentCount, 1)) * 0.9 + Math.min(stopTotal, 200) * 0.04);
  const color = stopTotal > 0 ? "#f97316" : "#ef4444";
  const marker = L.circleMarker([lat, lon], {
    radius,
    color,
    weight: 1.2,
    fillColor: color,
    fillOpacity: stopTotal > 0 ? 0.7 : 0.55
  });
  marker.bindPopup(buildCrimePopupHtml(props, forces, crimeType, stats));
  return marker;
}

function isFeatureWithinCrimeSpatialBounds(feature, bounds) {
  if (!bounds) return true;
  const coords = feature?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return false;
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return bounds.contains([lat, lon]);
}

function updateCrimeBoxModeButtonState() {
  if (!CRIME_FILTER_UI.boxModeBtn) return;
  CRIME_FILTER_UI.boxModeBtn.classList.toggle("crime-box-active", !!CRIME_SPATIAL_FILTER.drawMode);
  CRIME_FILTER_UI.boxModeBtn.textContent = CRIME_SPATIAL_FILTER.drawMode ? "Cancel Box Draw" : "Draw Area Box";
}

function clearCrimeSpatialFilter() {
  CRIME_SPATIAL_FILTER.bounds = null;
  if (CRIME_SPATIAL_FILTER.rectangle && map?.hasLayer(CRIME_SPATIAL_FILTER.rectangle)) {
    map.removeLayer(CRIME_SPATIAL_FILTER.rectangle);
  }
  CRIME_SPATIAL_FILTER.rectangle = null;
  CRIME_SPATIAL_FILTER.startLatLng = null;
  CRIME_SPATIAL_FILTER.dragging = false;
  CRIME_SPATIAL_FILTER.drawMode = false;
  updateCrimeBoxModeButtonState();
  setStatus?.("Crime area filter cleared");
}

function toggleCrimeBoxDrawMode() {
  CRIME_SPATIAL_FILTER.drawMode = !CRIME_SPATIAL_FILTER.drawMode;
  CRIME_SPATIAL_FILTER.startLatLng = null;
  CRIME_SPATIAL_FILTER.dragging = false;
  if (!CRIME_SPATIAL_FILTER.drawMode && map?.dragging) {
    map.dragging.enable();
  }
  updateCrimeBoxModeButtonState();
  if (CRIME_SPATIAL_FILTER.drawMode) {
    setStatus?.("Crime area draw mode active: drag on map to draw a filter box");
    showToast?.("Drag on the map to draw a crime filter area", "info");
  }
}

function initCrimeSpatialDrawHooks() {
  if (!map || map._crimeBoxHooksBound) return;
  map._crimeBoxHooksBound = true;

  map.on("mousedown", (ev) => {
    if (!CRIME_SPATIAL_FILTER.drawMode) return;
    if (ev.originalEvent?.button != null && ev.originalEvent.button !== 0) return;
    CRIME_SPATIAL_FILTER.startLatLng = ev.latlng;
    CRIME_SPATIAL_FILTER.dragging = true;
    map.dragging.disable();
    if (CRIME_SPATIAL_FILTER.rectangle && map.hasLayer(CRIME_SPATIAL_FILTER.rectangle)) {
      map.removeLayer(CRIME_SPATIAL_FILTER.rectangle);
    }
    CRIME_SPATIAL_FILTER.rectangle = L.rectangle(L.latLngBounds(ev.latlng, ev.latlng), {
      color: "#22c55e",
      weight: 2,
      fillOpacity: 0.08,
      dashArray: "6,4"
    }).addTo(map);
    L.DomEvent.stop(ev.originalEvent);
  });

  map.on("mousemove", (ev) => {
    if (!CRIME_SPATIAL_FILTER.drawMode || !CRIME_SPATIAL_FILTER.dragging || !CRIME_SPATIAL_FILTER.rectangle) return;
    const b = L.latLngBounds(CRIME_SPATIAL_FILTER.startLatLng, ev.latlng);
    CRIME_SPATIAL_FILTER.rectangle.setBounds(b);
  });

  map.on("mouseup", (ev) => {
    if (!CRIME_SPATIAL_FILTER.drawMode || !CRIME_SPATIAL_FILTER.dragging) return;
    CRIME_SPATIAL_FILTER.dragging = false;
    map.dragging.enable();
    const b = L.latLngBounds(CRIME_SPATIAL_FILTER.startLatLng, ev.latlng);
    if (!b.isValid() || b.getNorthEast().equals(b.getSouthWest())) {
      clearCrimeSpatialFilter();
      renderCrimeLayerFiltered();
      return;
    }
    CRIME_SPATIAL_FILTER.bounds = b;
    CRIME_SPATIAL_FILTER.drawMode = false;
    updateCrimeBoxModeButtonState();
    setStatus?.("Crime area filter applied");
    renderCrimeLayerFiltered();
  });
}

function renderCrimeLayerFiltered() {
  if (!layers.crime) return;

  layers.crime.clearLayers();

  if (!CRIME_DATA || !CRIME_DATA.length) {
    CRIME_LAST_RENDER_FILTERED = 0;
    CRIME_LAST_RENDER_TOTAL = Array.isArray(CRIME_DATA) ? CRIME_DATA.length : 0;
    updateCrimeFilterStatus({ filtered: 0, total: CRIME_LAST_RENDER_TOTAL });
    updateCrimeSummaryUI(null, 0);
    clearCrimeInspector();
    return;
  }

  const total = CRIME_DATA.length;
  const forceFilters = CRIME_FILTER_STATE.forces;
  const typeFilters = CRIME_FILTER_STATE.types;
  const spatialBounds = CRIME_SPATIAL_FILTER.bounds;
  const monthStart = getActiveMonthStart();
  const summary = { incidents: 0, stops: 0, outcomes: 0 };
  let rendered = 0;
  let selectedVisible = false;

  CRIME_DATA.forEach((feature) => {
    const forces = normalizeCrimeFeatureForces(feature);
    const crimeType = feature.properties?.dominant_type || "Crime Hotspot";

    if (forceFilters.size && !forces.some((force) => forceFilters.has(force))) return;
    if (typeFilters.size && !typeFilters.has(crimeType)) return;
    if (!isFeatureWithinCrimeSpatialBounds(feature, spatialBounds)) return;

    const stats = summarizeFeatureForActiveRange(feature, monthStart);
    if (!stats.hasActivity) return;

    const marker = createCrimeMarker(feature, forces, crimeType, stats);
    if (!marker) return;
    marker.on("click", () => focusCrimeInspector(feature, marker, stats));
    layers.crime.addLayer(marker);
    rendered++;
    summary.incidents += stats.incidents;
    summary.stops += stats.stops;
    summary.outcomes += stats.outcomes;

    if (CRIME_INSPECTOR_STATE.feature === feature) {
      selectedVisible = true;
      CRIME_INSPECTOR_STATE.marker = marker;
      CRIME_INSPECTOR_STATE.stats = stats;
    }
  });

  updateCrimeSummaryUI(rendered ? summary : null, rendered);
  if (CRIME_INSPECTOR_STATE.feature) {
    if (selectedVisible) {
      renderCrimeInspector();
    } else {
      clearCrimeInspector();
    }
  }

  CRIME_LAST_RENDER_FILTERED = rendered;
  CRIME_LAST_RENDER_TOTAL = total;
  updateCrimeFilterStatus({ filtered: rendered, total });
  console.log(`[Crime] Rendered ${rendered}/${total} grid cells`);
}

async function ensureCrimeLoaded() {
  async function fetchCrimeGeoJson() {
    const urls = [
      "data/processed/crime_grid_lite.geojson",
      "data/Processed/crime_grid_lite.geojson",
      "data/processed/crime_grid.geojson",
      "data/Processed/crime_grid.geojson"
    ];
    let lastErr = null;
    for (const baseUrl of urls) {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}_cb=${Date.now()}_${attempt}`;
        try {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) throw new Error(`Crime file not found (${r.status})`);
          const raw = await r.text();
          const data = JSON.parse(raw);
          if (!data || !Array.isArray(data.features)) {
            throw new Error("Crime payload missing features");
          }
          return data;
        } catch (err) {
          lastErr = err;
          console.warn(`[Crime] load attempt ${attempt} failed for ${baseUrl}`, err);
        }
      }
    }
    throw lastErr || new Error("Crime data load failed");
  }

  if (OVERLAY_LOAD_STATE.crimeLoaded)
    return true;

  if (OVERLAY_LOAD_STATE.crimeLoading)
    return OVERLAY_LOAD_STATE.crimeLoading;

  OVERLAY_LOAD_STATE.crimeLoading =
    fetchCrimeGeoJson()

      .then(data => {

        CRIME_DATA = data.features || [];
        const metaMonths = Array.isArray(data?.meta?.months) ? data.meta.months.slice().sort() : [];
        CRIME_MONTHS = metaMonths;
        if (CRIME_MONTHS.length) {
          setCrimeMonthWindow(Math.min(6, CRIME_MONTHS.length), { silent: true, asDefault: true });
        } else {
          CRIME_FILTER_STATE.monthStartIndex = 0;
          CRIME_DEFAULT_MONTH_START = 0;
          updateCrimeTimelineControls();
        }

        CRIME_FORCE_MAP.clear();
        CRIME_TYPES.clear();
        CRIME_TYPE_STATS.clear();

        CRIME_DATA.forEach(feature => {

          const props = feature.properties || {};
          const type = props.dominant_type || "Unknown";
          const incidents = Number(props.count || 0);
          const stopTotal = Number(props.stop_search_total || 0);
          const forces = normalizeCrimeFeatureForces(feature);

          forces.forEach(forceName => {
            const stats = CRIME_FORCE_MAP.get(forceName) || { crimes: 0, stops: 0, cells: 0 };
            stats.crimes += incidents;
            stats.stops += stopTotal;
            stats.cells += 1;
            CRIME_FORCE_MAP.set(forceName, stats);
          });

          CRIME_TYPES.add(type);
          const typeStats = CRIME_TYPE_STATS.get(type) || { crimes: 0, cells: 0 };
          typeStats.crimes += incidents;
          typeStats.cells += 1;
          CRIME_TYPE_STATS.set(type, typeStats);

        });

        populateCrimeFilters();
        renderCrimeLayerFiltered();

        OVERLAY_LOAD_STATE.crimeLoaded = true;

        const isLite = !!data?.meta?.lite;
        console.log("Crime loaded:", CRIME_DATA.length, isLite ? "(lite)" : "(full)");
        if (isLite) {
          setStatus?.(`Crime layer loaded (lite mode): ${CRIME_DATA.length.toLocaleString()} cells`);
        }

        return true;

      })

      .catch(err => {

        console.error("Crime load error:", err);

        setStatus?.("Crime data unavailable");

        return false;

      })

      .finally(() => {

        OVERLAY_LOAD_STATE.crimeLoading = null;

      });

  return OVERLAY_LOAD_STATE.crimeLoading;

}

let ACTIVE_FORCE = null;

function setActiveForce(forceName, opts = {}) {
  const next = (forceName && String(forceName).trim()) || null;
  const changed = next !== ACTIVE_FORCE;
  ACTIVE_FORCE = next;
  if (changed && ACTIVE_FORCE && !opts.silent) {
    setStatus?.(`Selected ${ACTIVE_FORCE} police force`);
  }
  updateCrimeFilterStatus();
}



function loadSubset(file) {
  if (!file || typeof file !== "string") return Promise.resolve([]);
  if (CH_CACHE[file]) return Promise.resolve(CH_CACHE[file]);
  return fetch(file).then(r => r.json()).then(raw => {
    const trimmed = new Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      const s = raw[i];
      trimmed[i] = {
        CompanyName:               s.CompanyName || "",
        CompanyNumber:             s.CompanyNumber || s[" CompanyNumber"] || "",
        "RegAddress.PostCode":     s["RegAddress.PostCode"] || "",
        "RegAddress.PostTown":     s["RegAddress.PostTown"] || "",
        "RegAddress.AddressLine1": s["RegAddress.AddressLine1"] || "",
        CompanyStatus:             s.CompanyStatus || "",
        "SICCode.SicText_1":       s["SICCode.SicText_1"] || ""
      };
    }
    CH_CACHE[file] = trimmed;
    CH_TOTAL_ROWS += trimmed.length;
    return trimmed;
  }).catch(err => { console.warn("Load failed:", file, err); return []; });
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Search Ã¢â€â‚¬Ã¢â€â‚¬

function filterByCriteria(rows, criteria, limit) {
  const nL = criteria.name     ? criteria.name.trim().toLowerCase()     : "";
  const uL = criteria.number   ? criteria.number.trim().toLowerCase()   : "";
  const pL = criteria.postcode ? criteria.postcode.trim().toLowerCase() : "";
  const tL = criteria.town     ? criteria.town.trim().toLowerCase()     : "";
  const out = [];
  for (let i = 0, len = rows.length; i < len; i++) {
    const r = rows[i];
    if (nL && !r.CompanyName.toLowerCase().includes(nL))            continue;
    if (uL && !r.CompanyNumber.toLowerCase().includes(uL))          continue;
    if (pL && !r["RegAddress.PostCode"].toLowerCase().includes(pL)) continue;
    if (tL && !r["RegAddress.PostTown"].toLowerCase().includes(tL)) continue;
    out.push(r);
    if (limit && out.length >= limit) break;
  }
  return out;
}

function searchCached(criteria, limit) {
  const out = [];
  for (const f in CH_CACHE) {
    const hits = filterByCriteria(CH_CACHE[f], criteria, limit ? limit - out.length : 0);
    out.push(...hits);
    if (limit && out.length >= limit) break;
  }
  return limit ? out.slice(0, limit) : out;
}

let _searchAbort = false;

async function searchProgressive(criteria, onBatch) {
  _searchAbort = false;
  let targetFiles = [];
  const numClean = (criteria.number || "").replace(/\D/g, "");
  if (numClean) {
    const num = parseInt(numClean, 10);
    const m = CH_INDEX.find(e => num >= e.start && num <= e.end);
    if (m) targetFiles = [m.file];
  }
  if (!targetFiles.length) targetFiles = CH_INDEX.map(e => e.file);

  const all = [], total = targetFiles.length;
  for (let i = 0; i < targetFiles.length; i += 2) {
    if (_searchAbort) break;
    const batch = targetFiles.slice(i, i + 2);
    try { await Promise.all(batch.map(loadSubset)); } catch { break; }
    for (const f of batch) {
      if (!CH_CACHE[f]) continue;
      const cap = 500 - all.length;
      if (cap <= 0) break;
      all.push(...filterByCriteria(CH_CACHE[f], criteria, cap));
    }
    const scanned = Math.min(i + batch.length, total);
    if (onBatch) onBatch(all, scanned, total);
    if (all.length >= 500) break;
  }
  return all;
}

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

// Ã¢â€â‚¬Ã¢â€â‚¬ Postcode lookup Ã¢â€â‚¬Ã¢â€â‚¬

const PC_CACHE = {};
function normalizePostcodeKey(raw) {
  return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function extractUkPostcode(raw) {
  const text = String(raw || "").toUpperCase();
  const m = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
  return m ? m[1] : "";
}
function postcodeVariants(rawPostcode) {
  const raw = String(rawPostcode || "").trim();
  const extracted = extractUkPostcode(raw);
  const base = extracted || raw;
  const key = normalizePostcodeKey(base);
  if (!key) return [];

  const canonical = key.length > 3 ? `${key.slice(0, -3)} ${key.slice(-3)}` : key;
  const variants = [raw, extracted, canonical, key]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return [...new Set(variants)];
}
function postcodeArea(pc) {
  const m = normalizePostcodeKey(pc).match(/^([A-Z]{1,2})/);
  return m ? m[1] : null;
}
function lookupPostcode(pc) {
  return PC_CACHE[normalizePostcodeKey(pc)] || null;
}
function cachePostcode(pc, coords) {
  const key = normalizePostcodeKey(pc);
  if (!key || !coords) return;
  if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lon)) return;
  PC_CACHE[key] = { lat: Number(coords.lat), lon: Number(coords.lon) };
}

async function geocodeViaPostcodesIo(rawPostcode) {
  const variants = postcodeVariants(rawPostcode);
  if (!variants.length) return null;

  for (const variant of variants) {
    const formatted = encodeURIComponent(variant);
    let resp = null;
    try {
      resp = await fetch(apiUrl(`/postcodes/postcodes/${formatted}`));
    } catch (_) {
      // ignore
    }
    if (!resp || resp.status === 404) {
      try {
        resp = await fetch(`https://api.postcodes.io/postcodes/${formatted}`);
      } catch (_) {
        resp = null;
      }
    }
    if (!resp || !resp.ok) continue;
    const data = await resp.json();
    if (data.status === 200 && data.result) {
      const lat = Number(data.result.latitude);
      const lon = Number(data.result.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  }

  const wanted = normalizePostcodeKey(rawPostcode);
  for (const variant of variants) {
    const q = encodeURIComponent(variant);
    let resp = null;
    try {
      resp = await fetch(apiUrl(`/postcodes/postcodes?q=${q}`));
    } catch (_) {
      // ignore
    }
    if (!resp || resp.status === 404) {
      try {
        resp = await fetch(`https://api.postcodes.io/postcodes?q=${q}`);
      } catch (_) {
        resp = null;
      }
    }
    if (!resp || !resp.ok) continue;
    const data = await resp.json();
    const list = Array.isArray(data?.result) ? data.result : [];
    if (!list.length) continue;
    const hit = list.find((r) => normalizePostcodeKey(r.postcode) === wanted) || list[0];
    const lat = Number(hit?.latitude);
    const lon = Number(hit?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  return null;
}

async function geocodeViaOsPlaces(rawPostcode) {
  const variants = postcodeVariants(rawPostcode);
  if (!variants.length) return null;

  for (const variant of variants) {
    const formatted = encodeURIComponent(variant);
    let resp = null;
    try {
      resp = await fetch(apiUrl(`/osplaces/postcode?postcode=${formatted}`));
    } catch (_) {
      resp = null;
    }
    if (!resp || !resp.ok) continue;
    const data = await resp.json();
    if (!Array.isArray(data.results) || !data.results.length) continue;

    const first = data.results[0] || {};
    const rec = first.DPA || first.LPI || {};
    const lat = parseFloat(rec.LAT ?? rec.LATITUDE);
    const lon = parseFloat(rec.LNG ?? rec.LONGITUDE);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  }
  return null;
}

async function geocodeViaOsPlacesAddress(rawAddress, options = {}) {
  const query = String(rawAddress || "").trim();
  if (!query) return null;
  let resp = null;
  try {
    resp = await fetch(apiUrl(`/osplaces/find?query=${encodeURIComponent(query)}`));
  } catch (_) {
    resp = null;
  }
  if (!resp || !resp.ok) return null;
  const data = await resp.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return null;

  const parsed = parseAddressString(query) || {};
  const wantedNumber = String(parsed.buildingNumber || "").toLowerCase();
  const wantedStreet = String(parsed.streetName || "").toLowerCase();
  const wantedPostcode = normalizePostcodeKey(parsed.postcode || "");
  const hasToken = (haystack, needle) => {
    const h = String(haystack || "").toLowerCase();
    const n = String(needle || "").toLowerCase();
    if (!h || !n) return false;
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(h);
  };

  const strict = !!options.strict;
  let bestRec = null;
  let bestScore = -9999;
  let bestNumberMatched = false;
  let bestStreetMatched = false;
  for (const row of results) {
    const rec = row?.DPA || row?.LPI || null;
    if (!rec) continue;
    const candidateText = [
      rec.ADDRESS,
      rec.ADDRESS_STRING,
      rec.THOROUGHFARE_NAME,
      rec.STREET_DESCRIPTION,
      rec.ORGANISATION_NAME,
      rec.BUILDING_NAME
    ].filter(Boolean).join(" ").toLowerCase();
    const candidateNumber = String(
      rec.BUILDING_NUMBER ||
      rec.PAO_START_NUMBER ||
      rec.PAO_TEXT ||
      rec.SAO_START_NUMBER ||
      ""
    ).trim().toLowerCase();
    const candidatePostcode = normalizePostcodeKey(rec.POSTCODE || rec.POSTAL_CODE || "");

    let score = 0;
    if (wantedPostcode) {
      if (candidatePostcode === wantedPostcode) score += 80;
      else if (candidatePostcode && candidatePostcode.slice(0, -3) === wantedPostcode.slice(0, -3)) score += 15;
      else score -= 30;
    }
    const streetMatched = wantedStreet ? candidateText.includes(wantedStreet) : false;
    if (wantedStreet) {
      if (streetMatched) score += 35;
      else score -= 15;
    }
    let numberMatched = false;
    if (wantedNumber) {
      if (candidateNumber && candidateNumber === wantedNumber) {
        score += 90;
        numberMatched = true;
      } else if (hasToken(candidateText, wantedNumber)) {
        score += 55;
        numberMatched = true;
      }
      else score -= 45;
    }
    if (row?.DPA) score += 5;

    if (score > bestScore) {
      bestScore = score;
      bestRec = rec;
      bestNumberMatched = numberMatched;
      bestStreetMatched = streetMatched;
    }
  }

  if (strict) {
    if (wantedNumber && !bestNumberMatched) return null;
    if (wantedStreet && !bestStreetMatched) return null;
  }

  const rec = bestRec || results[0]?.DPA || results[0]?.LPI || {};
  const lat = parseFloat(rec?.LAT ?? rec?.LATITUDE);
  const lon = parseFloat(rec?.LNG ?? rec?.LONGITUDE);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  return null;
}

async function geocodeViaNominatimAddress(rawAddress, options = {}) {
  const query = String(rawAddress || "").trim();
  if (!query) return null;
  const strict = !!options.strict;
  const parsed = parseAddressString(query) || {};
  const wantedNumber = String(parsed.buildingNumber || "").toLowerCase();
  const wantedStreet = String(parsed.streetName || "").toLowerCase();
  let resp = null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=gb&q=${encodeURIComponent(query)}`;
  try {
    resp = await fetch(url);
  } catch (_) {
    resp = null;
  }
  if (!resp || !resp.ok) return null;
  const rows = await resp.json();
  const first = Array.isArray(rows) ? rows[0] : null;
  if (!first) return null;
  if (strict) {
    const display = String(first.display_name || "").toLowerCase();
    if (wantedNumber && !new RegExp(`(^|\\W)${wantedNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`, "i").test(display)) {
      return null;
    }
    if (wantedStreet && !display.includes(wantedStreet)) {
      return null;
    }
  }
  const lat = Number(first.lat);
  const lon = Number(first.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  return null;
}

async function geocodeViaGoogleAddress(rawAddress, options = {}) {
  const query = String(rawAddress || "").trim();
  if (!query) return null;
  const key = String(window.GOOGLE_MAPS_API_KEY || window.GOOGLE_STREETVIEW_API_KEY || "").trim();
  if (!key) return null;

  const strict = !!options.strict;
  const parsed = parseAddressString(query) || {};
  const wantedNumber = String(parsed.buildingNumber || "").toLowerCase();
  const wantedStreet = String(parsed.streetName || "").toLowerCase();
  const wantedPostcode = normalizePostcodeKey(parsed.postcode || "");

  let resp = null;
  const url = "https://maps.googleapis.com/maps/api/geocode/json?address=" +
    encodeURIComponent(query) + "&key=" + encodeURIComponent(key);
  try {
    resp = await fetch(url);
  } catch (_) {
    resp = null;
  }
  if (!resp || !resp.ok) return null;
  const data = await resp.json();
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return null;
  const first = results[0];
  if (!first?.geometry?.location) return null;

  if (strict) {
    const comps = Array.isArray(first.address_components) ? first.address_components : [];
    const numberComp = comps.find((c) => Array.isArray(c.types) && c.types.includes("street_number"));
    const routeComp = comps.find((c) => Array.isArray(c.types) && c.types.includes("route"));
    const postComp = comps.find((c) => Array.isArray(c.types) && c.types.includes("postal_code"));
    const gotNumber = String(numberComp?.long_name || "").toLowerCase();
    const gotRoute = String(routeComp?.long_name || "").toLowerCase();
    const gotPostcode = normalizePostcodeKey(postComp?.long_name || "");

    if (wantedNumber && gotNumber && gotNumber !== wantedNumber) return null;
    if (wantedStreet && gotRoute && !gotRoute.includes(wantedStreet)) return null;
    if (wantedPostcode && gotPostcode && gotPostcode !== wantedPostcode) return null;
  }

  const lat = Number(first.geometry.location.lat);
  const lon = Number(first.geometry.location.lng);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
  return null;
}

async function geocodeAddress(rawAddress, options = {}) {
  const query = String(rawAddress || "").trim();
  if (!query) return null;
  try {
    let coords = await geocodeViaOsPlacesAddress(query, options);
    if (!coords) coords = await geocodeViaNominatimAddress(query, options);
    if (!coords) coords = await geocodeViaGoogleAddress(query, options);
    return coords || null;
  } catch (e) {
    console.warn("address geocoding failed:", e);
    return null;
  }
}

// API-only postcode geocoding with cache + multi-provider fallback.
async function geocodePostcode(rawPostcode) {
  const pc = normalizePostcodeKey(rawPostcode);
  if (!pc) return null;
  const cached = lookupPostcode(pc);
  if (cached) return cached;

  try {
    let coords = await geocodeViaPostcodesIo(rawPostcode);
    if (!coords) {
      coords = await geocodeViaOsPlaces(rawPostcode);
    }
    if (coords) {
      cachePostcode(pc, coords);
      return coords;
    }
  } catch (e) {
    console.warn("postcode geocoding failed:", e);
  }
  return null;
}


// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// PSC (Persons with Significant Control)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â



// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// MAP
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

const map = L.map("map", { zoomControl: false }).setView(
  CONTROL_ROOM_CONFIG.map.center, CONTROL_ROOM_CONFIG.map.zoom
);
window._map = map;

CRIME_INCIDENT_LAYER = L.layerGroup();

// Dedicated panes keep routes clickable but below station markers.
map.createPane("tflRoutesPane");
map.getPane("tflRoutesPane").style.zIndex = 430;

map.createPane("tflStationsPane");
map.getPane("tflStationsPane").style.zIndex = 470;

map.createPane("nrRoutesPane");
map.getPane("nrRoutesPane").style.zIndex = 420;

map.createPane("nrStationsPane");
map.getPane("nrStationsPane").style.zIndex = 475;

// Scale bar
L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);
L.control.zoom({ position: "bottomleft" }).addTo(map);

function makePanelDraggable(panelEl, handleEl) {
  if (!panelEl || !handleEl) return;
  if (panelEl.dataset.dragInit === "1") return;
  panelEl.dataset.dragInit = "1";
  handleEl.classList.add("panel-draggable-handle");

  const DRAG_MARGIN = 8;
  let dragState = null;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function onPointerMove(e) {
    if (!dragState) return;
    const width = panelEl.offsetWidth || dragState.width;
    const height = panelEl.offsetHeight || dragState.height;
    const maxX = Math.max(DRAG_MARGIN, window.innerWidth - width - DRAG_MARGIN);
    const maxY = Math.max(DRAG_MARGIN, window.innerHeight - height - DRAG_MARGIN);
    const nextLeft = clamp(e.clientX - dragState.dx, DRAG_MARGIN, maxX);
    const nextTop = clamp(e.clientY - dragState.dy, DRAG_MARGIN, maxY);
    panelEl.style.left = `${nextLeft}px`;
    panelEl.style.top = `${nextTop}px`;
    panelEl.style.right = "auto";
    panelEl.style.bottom = "auto";
  }

  function onPointerUp() {
    if (!dragState) return;
    dragState = null;
    panelEl.classList.remove("panel-dragging");
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp);
  }

  handleEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest("button, input, select, textarea, a, summary")) return;
    const rect = panelEl.getBoundingClientRect();
    dragState = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      width: rect.width,
      height: rect.height
    };
    panelEl.classList.add("panel-dragging");
    panelEl.style.left = `${rect.left}px`;
    panelEl.style.top = `${rect.top}px`;
    panelEl.style.right = "auto";
    panelEl.style.bottom = "auto";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    e.preventDefault();
  });
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Tile layers Ã¢â€â‚¬Ã¢â€â‚¬

const tileCfg = CONTROL_ROOM_CONFIG.tiles;
const baseLayers = {};
let activeBase = "Dark";
let activeThemeName = String(document.documentElement?.dataset?.theme || "indigo").toLowerCase();

function _resolveTileUrlByTheme(baseName, theme) {
  const b = String(baseName || "").toLowerCase();
  const t = String(theme || "indigo").toLowerCase();
  if (b === "dark") {
    if (t === "light") return "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    if (t === "warm" || t === "rose") return "https://{s}.basemaps.cartocdn.com/voyager/{z}/{x}/{y}{r}.png";
    if (t === "noir") return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  }
  if (b === "grey") {
    if (t === "noir") return "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    return "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
  }
  if (b === "street") {
    return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  }
  return (tileCfg[Object.keys(tileCfg).find((k) => String(tileCfg[k]?.name || "").toLowerCase() === b)] || {}).url || "";
}

function _tileClassName(baseName, theme, extraClass = "") {
  const baseSlug = String(baseName || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const themeSlug = String(theme || "indigo").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const extras = String(extraClass || "").trim();
  return `cr-base-tile cr-base-${baseSlug} cr-theme-tiles-${themeSlug}${extras ? ` ${extras}` : ""}`;
}

function rebuildBaseLayersForTheme(themeName) {
  const theme = String(themeName || "indigo").toLowerCase();
  const previousActive = baseLayers[activeBase];
  if (previousActive && map.hasLayer(previousActive)) {
    map.removeLayer(previousActive);
  }

  Object.keys(baseLayers).forEach((name) => {
    if (baseLayers[name] && map.hasLayer(baseLayers[name])) {
      map.removeLayer(baseLayers[name]);
    }
    delete baseLayers[name];
  });

  for (const k in tileCfg) {
    const t = tileCfg[k];
    const resolvedUrl = _resolveTileUrlByTheme(t.name, theme) || t.url;
    const mergedOptions = { ...(t.options || {}) };
    mergedOptions.className = _tileClassName(t.name, theme, mergedOptions.className || "");
    baseLayers[t.name] = L.tileLayer(resolvedUrl, {
      attribution: t.attribution,
      minZoom: CONTROL_ROOM_CONFIG.map.minZoom,
      maxZoom: CONTROL_ROOM_CONFIG.map.maxZoom,
      ...mergedOptions
    });
  }

  activeThemeName = theme;
  if (!baseLayers[activeBase]) activeBase = "Dark";
  baseLayers[activeBase].addTo(map);
}

rebuildBaseLayersForTheme(activeThemeName);

// Ã¢â€â‚¬Ã¢â€â‚¬ Overlay layers (ALL OFF by default) Ã¢â€â‚¬Ã¢â€â‚¬

const companyCluster = L.markerClusterGroup({
  chunkedLoading: true, 
  maxClusterRadius: 50,
  spiderfyOnMaxZoom: true, 
  showCoverageOnHover: false, 
  disableClusteringAtZoom: 16,
  spiderfyDistanceMultiplier: 2, // Increase distance between markers when spiderfied
  animate: true,
  animateAddingMarkers: true
});

function getEntityForClusterMarker(marker) {
  const entityId = marker?._entityId;
  if (!entityId) return null;
  return getEntityById(entityId) || null;
}

function getEntityClusterDescriptor(cluster) {
  const markers = cluster?.getAllChildMarkers ? cluster.getAllChildMarkers() : [];
  if (!markers.length) return { title: "", subtitle: "" };

  const companyCounts = new Map();
  let fallback = null;

  markers.forEach((m) => {
    const entity = getEntityForClusterMarker(m);
    if (!entity) return;
    if (!fallback) fallback = entity;

    const companyName =
      String(entity.companyName || "").trim() ||
      getI2ValueFromEntityValues(entity.i2EntityData, ["Organisation Name"]);
    const companyNumber =
      String(entity.companyNumber || "").trim() ||
      getI2ValueFromEntityValues(entity.i2EntityData, ["Company/Registration Number", "Company Number", "Registration Number"]);

    if (companyName || companyNumber) {
      const key = `${companyName}|${companyNumber}`;
      const prev = companyCounts.get(key) || { count: 0, name: companyName, number: companyNumber };
      prev.count += 1;
      companyCounts.set(key, prev);
    }
  });

  let top = null;
  companyCounts.forEach((v) => {
    if (!top || v.count > top.count) top = v;
  });
  if (top) {
    return {
      title: String(top.name || "Company"),
      subtitle: top.number ? `#${top.number}` : ""
    };
  }

  if (fallback) {
    const typeTag = fallback.i2EntityData?.entityName || fallback.iconData?.categoryName || fallback.iconData?.name || "Entity";
    return { title: String(fallback.label || "Entity"), subtitle: String(typeTag) };
  }
  return { title: "", subtitle: "" };
}

function createEntityClusterIcon(cluster) {
  const count = cluster.getChildCount();
  const sizeClass = count < 10 ? "small" : count < 50 ? "medium" : "large";
  const descriptor = getEntityClusterDescriptor(cluster);
  const title = escapeHtml(descriptor.title || "");
  const subtitle = escapeHtml(descriptor.subtitle || "");
  const html = `
    <div class="entity-cluster-content">
      <span class="entity-cluster-count">${count}</span>
      ${title ? `<span class="entity-cluster-title">${title}</span>` : ""}
      ${subtitle ? `<span class="entity-cluster-subtitle">${subtitle}</span>` : ""}
    </div>
  `;
  return L.divIcon({
    html,
    className: `marker-cluster marker-cluster-${sizeClass} entity-cluster-icon`,
    iconSize: L.point(56, 56)
  });
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Connection Lines Layer Ã¢â€â‚¬Ã¢â€â‚¬
const connectionsLayer = L.layerGroup();

// Ã¢â€â‚¬Ã¢â€â‚¬ Custom Entities Layer Ã¢â€â‚¬Ã¢â€â‚¬
const entitiesMarkerCluster = L.markerClusterGroup({
  chunkedLoading: true,
  maxClusterRadius: 42,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  disableClusteringAtZoom: 14,
  spiderfyDistanceMultiplier: 1.4,
  animate: true,
  animateAddingMarkers: true,
  iconCreateFunction: createEntityClusterIcon
});
const entitiesOverlayLayer = L.layerGroup();
const entitiesLayer = L.layerGroup([entitiesMarkerCluster, entitiesOverlayLayer]);

const layers = {
  companies:       companyCluster,
  connections:     connectionsLayer,
  entities:        entitiesLayer,
  areas:           L.featureGroup(),
  airports_uk:     L.featureGroup(),
  airports_global: L.featureGroup(),
  seaports:        L.featureGroup(),
  underground:     L.featureGroup(),
  national_rail:   L.featureGroup(),

  service_stations: L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 42,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 12
  }),
  ships: L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 42,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 12
  }),

  // ADD THIS BLOCK
  cellTowers: L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 42,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 12
  }),
  crime: L.markerClusterGroup({
    chunkedLoading: true,
    maxClusterRadius: 42,
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true
  }),

  flights:         L.featureGroup(),
  bikes:           L.featureGroup()
};


const LAYER_WARM_SET = window.__CRLayerWarmSet || new Set();
window.__CRLayerWarmSet = LAYER_WARM_SET;

function markLayerDatasetWarm(layerId) {
  const id = String(layerId || "").trim();
  if (!id) return;
  if (!LAYER_WARM_SET.has(id)) {
    LAYER_WARM_SET.add(id);
  }
  updateLayerSummaryCards();
}


// Track connections and entity data
window._mapConnections = [];
window._mapEntities = [];
window._placementMode = null;
window._selectedEntityIds = new Set();

let entityBoxSelectMode = false;
let entityBoxSelectStart = null;
let entityBoxSelectRect = null;
let entityBoxSelectDragging = false;

function isEditingInputTarget(target) {
  if (!target || !target.tagName) return false;
  const tag = String(target.tagName).toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function setEntityMarkerSelectedState(entity, selected) {
  if (!entity?.marker?.getElement) return;
  const el = entity.marker.getElement();
  if (!el) return;
  el.classList.toggle("entity-selected-marker", !!selected);
}

function refreshEntitySelectionStyles() {
  window._mapEntities.forEach((entity) => {
    setEntityMarkerSelectedState(entity, window._selectedEntityIds.has(entity.id));
  });
}

function clearEntitySelection() {
  window._selectedEntityIds.clear();
  refreshEntitySelectionStyles();
}

function selectAllEntities() {
  window._selectedEntityIds.clear();
  window._mapEntities.forEach((entity) => window._selectedEntityIds.add(entity.id));
  refreshEntitySelectionStyles();
  setStatus(`Selected ${window._selectedEntityIds.size} entities`);
}

function applyEntitySelectionBounds(bounds, additive = false) {
  if (!bounds) return;
  if (!additive) window._selectedEntityIds.clear();
  window._mapEntities.forEach((entity) => {
    const latLng = L.latLng(entity.latLng[0], entity.latLng[1]);
    if (bounds.contains(latLng)) window._selectedEntityIds.add(entity.id);
  });
  refreshEntitySelectionStyles();
  setStatus(`Selected ${window._selectedEntityIds.size} entities`);
}

function toggleEntityBoxSelectMode(nextState = null) {
  entityBoxSelectMode = (nextState == null) ? !entityBoxSelectMode : !!nextState;
  if (!entityBoxSelectMode) {
    entityBoxSelectStart = null;
    entityBoxSelectDragging = false;
    if (entityBoxSelectRect) {
      map.removeLayer(entityBoxSelectRect);
      entityBoxSelectRect = null;
    }
  }
  const pressed = entityBoxSelectMode ? "true" : "false";
  document.getElementById("entity-select-box")?.setAttribute("aria-pressed", pressed);
  document.getElementById("map-tb-boxselect")?.setAttribute("aria-pressed", pressed);
  map.getContainer().style.cursor = entityBoxSelectMode ? "crosshair" : "";
  if (entityBoxSelectMode) setStatus("Box select: drag on map to select entities â€” Esc to cancel");
}

function exportEntitiesToExcel() {
  if (!window.XLSX) {
    const msg = "Excel export library unavailable. Refresh and try again.";
    setStatus(msg);
    showToast(msg, "error");
    return;
  }

  const selectedIds = Array.from(window._selectedEntityIds || []);
  const selectedSet = new Set(selectedIds);
  const exportingSelected = selectedIds.length > 0;
  const entities = exportingSelected
    ? window._mapEntities.filter((e) => selectedSet.has(e.id))
    : [...window._mapEntities];

  if (!entities.length) {
    const msg = "No entities available to export.";
    setStatus(msg);
    showToast(msg, "info");
    return;
  }

  const entityRows = entities.map((entity) => {
    const row = {
      EntityID: entity.id,
      Label: entity.label || "",
      SourceType: entity.sourceType || "",
      Category: entity.iconData?.categoryName || "",
      Icon: entity.iconData?.name || "",
      I2Type: entity.i2EntityData?.entityName || "",
      I2EntityID: entity.i2EntityData?.entityId || "",
      Address: entity.address || "",
      Notes: entity.notes || "",
      Lat: Number(entity.latLng?.[0] || 0),
      Lng: Number(entity.latLng?.[1] || 0)
    };
    (entity.i2EntityData?.values || []).forEach((v) => {
      if (!v?.propertyName) return;
      row[`I2:${v.propertyName}`] = String(v.value ?? "");
    });
    return row;
  });

  const exportedIdSet = new Set(entities.map((e) => e.id));
  const connectionRows = (window._mapConnections || [])
    .filter((c) => c?.metadata?.fromId && c?.metadata?.toId)
    .filter((c) => exportedIdSet.has(c.metadata.fromId) && exportedIdSet.has(c.metadata.toId))
    .map((c) => ({
      ConnectionID: c.id,
      Type: c.type || "",
      Label: c.label || "",
      FromEntityID: c.metadata.fromId || "",
      FromLabel: c.metadata.fromLabel || "",
      ToEntityID: c.metadata.toId || "",
      ToLabel: c.metadata.toLabel || "",
      Detail: c.metadata.hoverDetail || ""
    }));

  const wb = window.XLSX.utils.book_new();
  const wsEntities = window.XLSX.utils.json_to_sheet(entityRows);
  window.XLSX.utils.book_append_sheet(wb, wsEntities, "Entities");
  if (connectionRows.length) {
    const wsLinks = window.XLSX.utils.json_to_sheet(connectionRows);
    window.XLSX.utils.book_append_sheet(wb, wsLinks, "Connections");
  }

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const fileName = `${yyyy}${mm}${dd} - Control Room - Entity Export.xlsx`;
  window.XLSX.writeFile(wb, fileName);
  setStatus(`Exported ${entities.length} entities to ${fileName}`);
  showToast(`Exported ${entities.length} entities`, "success");
}

// Companies starts ON (checked in HTML)
companyCluster.addTo(map);
connectionsLayer.addTo(map);
entitiesLayer.addTo(map);

// Initialise EntityRenderer (core entity system bridge)
if (window.EntityRenderer) {
  window.EntityRenderer.init(map, entitiesMarkerCluster, connectionsLayer);
}

// Add cluster click behavior for better visibility
companyCluster.on('clusterclick', function(e) {
  // Zoom in and spiderfy for better connection visibility
  const cluster = e.layer;
  const childMarkers = cluster.getAllChildMarkers();
  
  // If few enough markers, spiderfy immediately
  if (childMarkers.length <= 10) {
    cluster.spiderfy();
  }
  
  // Zoom to show all markers with padding
  const group = L.featureGroup(childMarkers);
  map.fitBounds(group.getBounds(), { 
    padding: [100, 100],
    maxZoom: 16
  });
  
  // Visual feedback
  setTimeout(() => {
    cluster.spiderfy();
  }, 300);
});

// Entity click handler for connection drawing
map.on('click', function(e) {
  if (entityBoxSelectMode) return;
  if (connectionDrawingMode) {
    // Check if clicked on an entity
    const clickedEntity = window._mapEntities.find(ent => {
      const dist = map.distance(e.latlng, ent.latLng);
      return dist < 50; // 50 meters tolerance
    });
    
    if (clickedEntity) {
      completeConnection(clickedEntity.id);
    } else {
      cancelConnectionDrawing();
    }
  } else if (window._placementMode) {
    // Entity placement mode
    showEntityPlacementDialog(e.latlng);
  } else {
    // Clear connection highlights when clicking on empty map
    clearConnectionHighlights();
    if (window._selectedTflLineId) {
      window._selectedTflLineId = null;
      window.updateTflLineStylesFromStatus(window._lastTflStatuses || []);
      document.dispatchEvent(new CustomEvent("tfl-line-selection-changed", { detail: { lineId: null } }));
    }
  }
});

map.on("mousedown", function(e) {
  if (!entityBoxSelectMode) return;
  entityBoxSelectStart = e.latlng;
  entityBoxSelectDragging = true;
  if (entityBoxSelectRect) {
    map.removeLayer(entityBoxSelectRect);
    entityBoxSelectRect = null;
  }
  entityBoxSelectRect = L.rectangle(L.latLngBounds(entityBoxSelectStart, entityBoxSelectStart), {
    color: "#22c55e",
    weight: 1.5,
    fillColor: "#22c55e",
    fillOpacity: 0.08,
    dashArray: "4 4"
  }).addTo(map);
});

map.on("mousemove", function(e) {
  if (!entityBoxSelectMode || !entityBoxSelectDragging || !entityBoxSelectRect || !entityBoxSelectStart) return;
  entityBoxSelectRect.setBounds(L.latLngBounds(entityBoxSelectStart, e.latlng));
});

map.on("mouseup", function(e) {
  if (!entityBoxSelectMode || !entityBoxSelectDragging || !entityBoxSelectStart) return;
  const bounds = L.latLngBounds(entityBoxSelectStart, e.latlng);
  entityBoxSelectDragging = false;
  entityBoxSelectStart = null;
  if (entityBoxSelectRect) {
    map.removeLayer(entityBoxSelectRect);
    entityBoxSelectRect = null;
  }
  if (bounds.isValid()) {
    applyEntitySelectionBounds(bounds, e.originalEvent?.ctrlKey || e.originalEvent?.metaKey);
  }
  toggleEntityBoxSelectMode(false);
});

// â”€â”€ Icon Picker Flyout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function openIconFlyout() {
  const flyout = document.getElementById("entity-icon-flyout");
  const trigger = document.getElementById("entity-icon-trigger");
  if (!flyout || !trigger) return;

  // Position flyout to the left of the trigger
  const rect = trigger.getBoundingClientRect();
  const flyoutW = 228;
  const gap = 8;
  let left = rect.left - flyoutW - gap;
  // Clamp to viewport
  if (left < 4) left = Math.min(rect.right + gap, window.innerWidth - flyoutW - 4);
  let top = rect.top;
  const flyoutH = 340;
  if (top + flyoutH > window.innerHeight - 8) top = window.innerHeight - flyoutH - 8;
  if (top < 4) top = 4;

  flyout.style.left = left + "px";
  flyout.style.top = top + "px";
  flyout.classList.add("open");
  flyout.setAttribute("aria-hidden", "false");
  trigger.setAttribute("aria-expanded", "true");

  // Reset search + focus it
  const search = document.getElementById("icon-flyout-search");
  if (search) {
    search.value = "";
    filterIconFlyout("");
    requestAnimationFrame(() => search.focus());
  }
}

function closeIconFlyout() {
  const flyout = document.getElementById("entity-icon-flyout");
  const trigger = document.getElementById("entity-icon-trigger");
  if (flyout) {
    flyout.classList.remove("open");
    flyout.setAttribute("aria-hidden", "true");
  }
  if (trigger) trigger.setAttribute("aria-expanded", "false");
}

function filterIconFlyout(query) {
  const picker = document.getElementById("entity-icon-picker");
  if (!picker) return;
  const q = query.trim().toLowerCase();
  picker.querySelectorAll(".entity-icon-pick").forEach(btn => {
    const match = !q || (btn.title || "").toLowerCase().includes(q);
    btn.style.display = match ? "" : "none";
  });
}

function initIconFlyoutControls() {
  if (window._iconFlyoutWired) return;
  window._iconFlyoutWired = true;

  const trigger = document.getElementById("entity-icon-trigger");
  if (trigger) trigger.addEventListener("click", openIconFlyout);

  const closeBtn = document.getElementById("icon-flyout-close");
  if (closeBtn) closeBtn.addEventListener("click", closeIconFlyout);

  const search = document.getElementById("icon-flyout-search");
  if (search) search.addEventListener("input", e => filterIconFlyout(e.target.value));

  // Click outside both flyout and trigger â†’ close
  document.addEventListener("mousedown", (e) => {
    const flyout = document.getElementById("entity-icon-flyout");
    if (!flyout || !flyout.classList.contains("open")) return;
    if (!e.target.closest("#entity-icon-flyout") && !e.target.closest("#entity-icon-trigger")) {
      closeIconFlyout();
    }
  }, { capture: true });
}

function initEntityTypePicker() {
  const picker = document.getElementById("entity-type-picker");
  if (!picker || picker.dataset.initialized) return;
  picker.dataset.initialized = "1";
  for (const [catKey, catData] of Object.entries(ICON_CATEGORIES)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "entity-type-btn";
    btn.dataset.cat = catKey;
    btn.title = catData.name;
    btn.innerHTML = `<span class="type-dot" style="background:${escapeHtml(catData.color || '#64748b')}"></span>${escapeHtml(catData.name)}`;
    btn.addEventListener("click", () => selectEntityTypePill(catKey));
    picker.appendChild(btn);
  }
}

function selectEntityTypePill(catKey) {
  document.querySelectorAll(".entity-type-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.cat === catKey);
  });
  // Keep hidden category select in sync
  const catSelect = document.getElementById("entity-category");
  if (catSelect) {
    if (!Array.from(catSelect.options).some(o => o.value === catKey)) {
      const opt = document.createElement("option");
      opt.value = catKey;
      opt.textContent = ICON_CATEGORIES[catKey]?.name || catKey;
      catSelect.appendChild(opt);
    }
    catSelect.value = catKey;
  }
  updateIconDropdown(catKey);
  populateI2EntityTypeSelect(catKey);
  ensureI2EntityCatalogLoaded(catKey);
}

function showEntityPlacementDialog(latLng) {
  const category = window._placementMode;
  if (!category) return;

  // Store the lat/lng for later use
  window._pendingEntityLatLng = latLng;

  // Open the entity placement panel
  const panel = document.getElementById('entity-placement-panel');
  panel.classList.add('open');
  panel.classList.remove('minimized');
  setEntityPanelMode(!!window._editingEntityId);

  // Build type picker (once) and highlight active category
  initEntityTypePicker();
  initIconFlyoutControls();
  selectEntityTypePill(category);

  // Keep hidden category select populated for any legacy reads
  const categorySelect = document.getElementById('entity-category');
  if (categorySelect && !Array.from(categorySelect.options).some(o => o.value === category)) {
    const opt = document.createElement('option');
    opt.value = category;
    opt.textContent = ICON_CATEGORIES[category]?.name || category;
    categorySelect.appendChild(opt);
  }
  if (categorySelect) categorySelect.value = category;

  const typeSelect = document.getElementById("entity-i2-type");
  if (typeSelect && !I2_CATALOG_LOADED) {
    typeSelect.innerHTML = '<option value="">Loading i2 entity types...</option>';
  }
  populateI2EntityTypeSelect(category);
  ensureI2EntityCatalogLoaded(category);
  
  // Update coordinates display
  const coordPair = normalizeLatLng(latLng);
  document.getElementById('entity-coords').textContent = `${coordPair[0].toFixed(5)}, ${coordPair[1].toFixed(5)}`;
  
  // Avoid auto-focus to prevent viewport jump when selecting entity types.
}

function setEntityPanelMode(editing) {
  const panel = document.getElementById("entity-placement-panel");
  const title = panel?.querySelector(".entity-panel-title");
  const submitBtn = panel?.querySelector('button[type="submit"]');
  const cancelBtn = document.getElementById("entity-cancel-btn");
  if (panel) panel.classList.toggle("is-editing", !!editing);
  if (title) title.textContent = editing ? "EDIT ENTITY" : "PLACE ENTITY";
  if (submitBtn) submitBtn.textContent = editing ? "SAVE CHANGES" : "PLACE ENTITY";
  if (cancelBtn) cancelBtn.textContent = editing ? "CLOSE" : "CANCEL";
}

function toggleEntityPanelMinimized() {
  const panel = document.getElementById("entity-placement-panel");
  const btn = document.getElementById("entity-panel-minimize");
  if (!panel || !btn) return;
  const nextMinimized = !panel.classList.contains("minimized");
  panel.classList.toggle("minimized", nextMinimized);
  btn.textContent = nextMinimized ? "+" : "-";
  btn.title = nextMinimized ? "Restore panel" : "Minimize panel";
}

function normalizeLatLng(latLng) {
  if (Array.isArray(latLng) && latLng.length >= 2) {
    return [Number(latLng[0]), Number(latLng[1])];
  }
  if (latLng && typeof latLng === "object" && Number.isFinite(latLng.lat) && Number.isFinite(latLng.lng)) {
    return [Number(latLng.lat), Number(latLng.lng)];
  }
  return [NaN, NaN];
}

function updateIconDropdown(category) {
  const iconSelect = document.getElementById('entity-icon');
  const picker = document.getElementById("entity-icon-picker");
  if (!iconSelect) return;
  iconSelect.innerHTML = '<option value="">Select icon...</option>';
  if (picker) picker.innerHTML = "";
  
  if (!category || !ICON_CATEGORIES[category]) {
    updateEntityIconPreview("", NaN);
    return;
  }
  
  const icons = ICON_CATEGORIES[category].icons;
  icons.forEach((iconData, index) => {
    const option = document.createElement('option');
    option.value = index;
    option.textContent = iconData.name;
    iconSelect.appendChild(option);
  });
  if (icons.length) {
    iconSelect.value = "0";
    renderEntityIconPicker(category, 0);
    updateEntityIconPreview(category, 0);
  } else {
    renderEntityIconPicker("", NaN);
    updateEntityIconPreview("", NaN);
  }
}

function renderEntityIconPicker(category, selectedIndex) {
  const picker = document.getElementById("entity-icon-picker");
  const iconSelect = document.getElementById("entity-icon");
  if (!picker || !iconSelect) return;
  picker.innerHTML = "";
  if (!category || !ICON_CATEGORIES[category]) return;
  const icons = ICON_CATEGORIES[category].icons || [];
  icons.forEach((iconData, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isSvg = (iconData.icon || "").toLowerCase().endsWith(".svg");
    btn.className = "entity-icon-pick" + (Number(selectedIndex) === idx ? " active" : "") + (isSvg ? " svg-icon" : " png-icon");
    btn.title = iconData.name || `Icon ${idx + 1}`;
    btn.innerHTML = `<img src="${escapeHtml(iconData.icon || "")}" alt="${escapeHtml(iconData.name || "")}">`;
    btn.addEventListener("click", () => {
      iconSelect.value = String(idx);
      ENTITY_ICON_MANUAL_OVERRIDE = true;
      renderEntityIconPicker(category, idx);
      updateEntityIconPreview(category, idx);
      closeIconFlyout();
    });
    picker.appendChild(btn);
  });
}

function updateEntityIconPreview(category, iconIndex) {
  const img = document.getElementById("entity-icon-preview-img");
  const label = document.getElementById("entity-icon-preview-label");
  if (!img || !label) return;
  const cat = ICON_CATEGORIES[category];
  const idx = Number(iconIndex);
  const icon = cat && Number.isFinite(idx) ? cat.icons[idx] : null;
  if (!icon || !icon.icon) {
    img.style.display = "none";
    img.onerror = null;
    img.src = "";
    label.textContent = "No icon selected";
    const trigger = document.getElementById("entity-icon-trigger");
    if (trigger) trigger.classList.remove("has-icon");
    return;
  }
  img.onerror = () => {
    const fallback = cat?.defaultIcon || "";
    if (fallback && img.src !== fallback) {
      img.src = fallback;
      return;
    }
    img.style.display = "none";
  };
  img.src = icon.icon;
  img.style.display = "";
  // Apply SVG inversion filter only for SVG icons; PNGs are already coloured
  img.classList.toggle("svg-preview", icon.icon.toLowerCase().endsWith(".svg"));
  label.textContent = icon.name || "Selected icon";
  // Mark trigger as having an icon selected
  const trigger = document.getElementById("entity-icon-trigger");
  if (trigger) trigger.classList.add("has-icon");
  renderEntityIconPicker(category, idx);
}

function closeEntityPanel() {
  closeIconFlyout();
  const panel = document.getElementById('entity-placement-panel');
  const wasEditing = !!window._editingEntityId;
  panel.classList.remove('open');
  panel.classList.remove("minimized");
  panel.style.left = "";
  panel.style.top = "";
  panel.style.right = "";
  panel.style.bottom = "";
  const minBtn = document.getElementById("entity-panel-minimize");
  if (minBtn) {
    minBtn.textContent = "-";
    minBtn.title = "Minimize panel";
  }
  
  // Clear form
  document.getElementById('entity-placement-form').reset();
  updateEntityIconPreview("", NaN);
  document.getElementById('entity-coords').textContent = '--';
  const i2Fields = document.getElementById("entity-i2-fields");
  if (i2Fields) {
    i2Fields.innerHTML = '<div class="entity-i2-fields-empty">Select an i2 entity type to capture structured properties.</div>';
  }
  window._editingEntityId = null;
  setEntityPanelMode(false);
  
  // Cancel placement mode
  cancelPlacementMode();
  if (wasEditing) {
    setStatus("Edit cancelled");
  }
}

function getI2EntityByKey(key) {
  if (!key) return null;
  return I2_ENTITY_BY_ID[String(key).toUpperCase()] || I2_ENTITY_BY_NAME[String(key).toLowerCase()] || null;
}

function defaultI2EntityForCategory(category) {
  const preferred = I2_DEFAULT_BY_CATEGORY[category];
  return preferred ? (getI2EntityByKey(preferred) || null) : null;
}

function defaultCategoryForI2Entity(entityTypeKey) {
  const entity = getI2EntityByKey(entityTypeKey);
  if (!entity) return "";
  const name = String(entity.entity_name || "").toLowerCase();
  if (I2_ENTITY_TO_CATEGORY[name]) return I2_ENTITY_TO_CATEGORY[name];

  if (/(person|subject|individual|officer|witness|suspect|victim|alias)/.test(name)) return "people";
  if (/(operation|military|firearm|weapon|explosive|ordnance|mission|unit|sigint)/.test(name)) return "military";
  if (/(communication|phone|email|mobile|device|call|internet|ip|imsi|imei|number|mac address|ip address)/.test(name)) return "communication";
  if (/(aircraft|flight|aviation|airport|airline|helicopter)/.test(name)) return "aviation";
  if (/(vehicle|car|van|truck|lorry|boat|vessel|ship|train|bus|taxi|motor)/.test(name)) return "vehicles";
  if (/(organisation|organization|company|business|account|bank|finance|transaction)/.test(name)) return "financial";
  if (/(location|address|site|premises|property|building|place|town|city|postcode|port|airport|station)/.test(name)) return "buildings";
  if (/(social|facebook|twitter|instagram|telegram|whatsapp|online|profile)/.test(name)) return "social";
  return "people";
}

function getI2EntityIconSearchText(entity) {
  if (!entity) return "";
  const props = Array.isArray(entity.properties) ? entity.properties : [];
  const propNames = props.map((p) => String(p.property_name || p.property_id || ""));
  return [
    String(entity.entity_name || ""),
    String(entity.entity_id || ""),
    ...propNames
  ].join(" ").toLowerCase();
}

const I2_ENTITY_ICON_RULES = [
  { re: /\b(mac address|ip address|ip lease data|url|wifi access point)\b/, category: "communication", iconId: "smartphone" },
  { re: /\b(imei|imsi|iccid|comms data record|communication other data|communication entity)\b/, category: "communication", iconId: "mobile_phone" },
  { re: /\b(message|sms|text extraction)\b/, category: "communication", iconId: "sms" },
  { re: /\b(email)\b/, category: "communication", iconId: "email" },
  { re: /\b(passport|driving licence|identification document|document|image|exhibit)\b/, category: "people", iconId: "person" },
  { re: /\b(aircraft|flight|airport|travel)\b/, category: "aviation", iconId: "aircraft" },
  { re: /\b(vessel|maritime event|outboard motor|ship|boat)\b/, category: "military", iconId: "mil_naval" },
  { re: /\b(operation|jfc tracker|surveillance log|ocg|action fraud|intel|intelligence)\b/, category: "military", iconId: "mil_intel" },
  { re: /\b(firearm|ammunition|weapon)\b/, category: "military", iconId: "mil_unit" },
  { re: /\b(location|building|address|postcode)\b/, category: "buildings", iconId: "building" },
  { re: /\b(organisation|organization|team|company)\b/, category: "buildings", iconId: "office" },
  { re: /\b(financial account|cash|card|bank)\b/, category: "financial", iconId: "bank" },
  { re: /\b(vehicle|trailer)\b/, category: "vehicles", iconId: "car" },
  { re: /\b(person|alias|contact|subscriber)\b/, category: "people", iconId: "person" }
];

function getIconByCategoryAndId(category, iconId) {
  const cat = ICON_CATEGORIES[category];
  if (!cat) return null;
  const icon = (cat.icons || []).find((i) => i.id === iconId);
  return icon ? { category, icon } : null;
}

function findBestIconForEntityText(categoryKey, searchText) {
  const normalized = String(searchText || "").toLowerCase();
  const categories = categoryKey && ICON_CATEGORIES[categoryKey]
    ? [[categoryKey, ICON_CATEGORIES[categoryKey]]]
    : Object.entries(ICON_CATEGORIES);

  let best = null;
  let bestScore = -1;
  for (const [cid, cat] of categories) {
    for (const icon of cat.icons) {
      let score = 0;
      for (const kw of icon.keywords || []) {
        const token = String(kw || "").toLowerCase();
        if (!token) continue;
        if (normalized.includes(` ${token} `) || normalized.startsWith(`${token} `) || normalized.endsWith(` ${token}`) || normalized === token) {
          score += 8;
        } else if (normalized.includes(token)) {
          score += 4;
        }
      }
      if (categoryKey && cid === categoryKey) score += 2;
      if (score > bestScore) {
        bestScore = score;
        best = { category: cid, icon };
      }
    }
  }
  return bestScore > 0 ? best : null;
}

function chooseIconForI2Entity(entity) {
  const searchText = getI2EntityIconSearchText(entity);
  for (const rule of I2_ENTITY_ICON_RULES) {
    if (!rule.re.test(searchText)) continue;
    const forced = getIconByCategoryAndId(rule.category, rule.iconId);
    if (forced) return forced;
  }
  const category = defaultCategoryForI2Entity(entity?.entity_id || entity?.entity_name || "") || "people";
  const catData = ICON_CATEGORIES[category] || ICON_CATEGORIES.people;
  const bestInCategory = findBestIconForEntityText(category, searchText);
  if (bestInCategory?.icon) {
    return { category, icon: bestInCategory.icon };
  }
  const globalBest = findBestIconForEntityText("", searchText);
  if (globalBest?.icon) {
    return globalBest;
  }
  return { category, icon: catData.icons[0] };
}

async function startI2EntityPlacement(entityTypeId) {
  if (!I2_CATALOG_LOADED) {
    await ensureI2EntityCatalogLoaded();
  }
  const entityDef = getI2EntityByKey(entityTypeId);
  if (!entityDef) return;

  const chosen = chooseIconForI2Entity(entityDef);
  const category = chosen.category;
  startPlacementMode(category);
  showEntityPlacementDialog(map.getCenter());

  const categorySelect = document.getElementById("entity-category");
  const typeSelect = document.getElementById("entity-i2-type");
  const iconSelect = document.getElementById("entity-icon");
  const labelInput = document.getElementById("entity-label");
  const placementNumberInput = document.getElementById("entity-placement-number");
  const placementAddressInput = document.getElementById("entity-placement-address");

  if (categorySelect) {
    categorySelect.value = category;
    updateIconDropdown(category);
  }
  if (typeSelect) {
    typeSelect.value = entityDef.entity_id;
    renderI2FieldsForType(entityDef.entity_id);
  }
  if (iconSelect) {
    const idx = (ICON_CATEGORIES[category]?.icons || []).findIndex((ic) => ic.id === chosen.icon.id);
    if (idx >= 0) {
      iconSelect.value = String(idx);
      updateEntityIconPreview(category, idx);
    }
  }

  ENTITY_ICON_MANUAL_OVERRIDE = false;
  autoSelectIconFromI2Fields(true);
  if (labelInput) labelInput.value = "";
  if (placementNumberInput) placementNumberInput.value = "";
  if (placementAddressInput) placementAddressInput.value = "";
  setStatus(`Placing ${entityDef.entity_name}: set fields and submit to place on map`);
}

const I2_FIELD_PRIORITY = [
  "Full Name",
  "First Name",
  "Middle Name",
  "Surname",
  "Date of Birth",
  "Gender",
  "Organisation Name",
  "Organisation Type",
  "Company/Registration Number",
  "VRM",
  "Registration Mark",
  "Vehicle Type",
  "Vehicle Make",
  "Vehicle Model",
  "Address String",
  "Building Number",
  "Street Name",
  "Town/City",
  "Post Code",
  "Country or Region",
  "Location Type",
  "Intelligence Date",
  "IR or Reference",
  "Additional Information"
];

const I2_LOW_VALUE_FIELDS = new Set([
  "Maiden Name",
  "Warning Marker",
  "Warning Marker 2",
  "Warning Marker 3",
  "Warning Marker 4",
  "Warning Marker Additional Notes",
  "Name"
]);

const I2_PLACEMENT_REQUIRED_FIELDS = {
  person: ["First Name", "Surname", "Full Name"],
  organisation: ["Organisation Name"],
  location: ["Location Type", "Address String", "Post Code", "Town/City"],
  vehicle: ["VRM", "Vehicle Make", "Vehicle Model"],
  aircraft: ["Registration Mark", "Type", "Manufacturer"],
  "financial account": ["Account Number", "IBAN", "Sort Code"]
};

let ENTITY_ICON_MANUAL_OVERRIDE = false;

function i2FieldPriorityScore(prop) {
  const mandatory = String(prop.mandatory || "").toLowerCase() === "true";
  const name = String(prop.property_name || "");
  if (/^(date of birth|dob)$/i.test(name)) {
    return (mandatory ? -1000 : 0) + 2;
  }
  const idx = I2_FIELD_PRIORITY.findIndex((n) => n.toLowerCase() === name.toLowerCase());
  const priority = idx >= 0 ? idx : 999;
  return (mandatory ? -1000 : 0) + priority;
}

function isPlacementRequiredField(entityName, propName, mandatory) {
  const e = String(entityName || "").toLowerCase();
  const p = String(propName || "");
  const requiredList = I2_PLACEMENT_REQUIRED_FIELDS[e] || [];
  if (requiredList.some((x) => String(x).toLowerCase() === p.toLowerCase())) return true;
  // Keep strict requirement only where it's the lone mandatory structural anchor.
  if (mandatory && /^(location type|organisation name|vrm|registration mark)$/i.test(p)) return true;
  return false;
}

function getWarningMarkerMeta(propertyName) {
  const name = String(propertyName || "").trim().toLowerCase();
  if (name === "warning marker") return { level: 1 };
  if (name === "warning marker 2") return { level: 2 };
  if (name === "warning marker 3") return { level: 3 };
  if (name === "warning marker 4") return { level: 4 };
  if (name === "warning marker additional notes") return { notes: true };
  return null;
}

function humaniseFieldName(str) {
  return String(str || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

function buildI2FieldInput(prop, index, entityName = "") {
  const fieldId = `entity-i2-prop-${index}`;
  const mandatory = String(prop.mandatory || "").toLowerCase() === "true";
  const placementRequired = isPlacementRequiredField(entityName, prop.property_name, mandatory);
  const logicalType = String(prop.logical_type || "").toUpperCase();
  const possibleValues = Array.isArray(prop.possible_values) ? prop.possible_values.filter(Boolean) : [];
  const warningMeta = getWarningMarkerMeta(prop.property_name);
  const warningAttrs = warningMeta
    ? (warningMeta.level
      ? ` data-warning-level="${warningMeta.level}"`
      : ` data-warning-notes="1"`)
    : "";
  const showTechMeta = !!window.CR_SHOW_I2_TECH_META;

  let inputHtml = "";
  if ((logicalType === "SELECTED_FROM" || logicalType === "SUGGESTED_FROM") && possibleValues.length) {
    const options = ['<option value="">Select...</option>']
      .concat(possibleValues.map((v) => `<option value="${escapeHtml(String(v))}">${escapeHtml(String(v))}</option>`))
      .join("");
    inputHtml = `<select id="${fieldId}" data-i2-property-id="${escapeHtml(prop.property_id)}" data-i2-property-name="${escapeHtml(prop.property_name)}" data-i2-logical-type="${escapeHtml(logicalType)}" ${placementRequired ? "required" : ""}>${options}</select>`;
  } else if (logicalType === "MULTIPLE_LINE_STRING") {
    inputHtml = `<textarea id="${fieldId}" rows="2" data-i2-property-id="${escapeHtml(prop.property_id)}" data-i2-property-name="${escapeHtml(prop.property_name)}" data-i2-logical-type="${escapeHtml(logicalType)}" ${placementRequired ? "required" : ""}></textarea>`;
  } else if (logicalType === "DATE") {
    inputHtml = `<input id="${fieldId}" type="date" data-i2-property-id="${escapeHtml(prop.property_id)}" data-i2-property-name="${escapeHtml(prop.property_name)}" data-i2-logical-type="${escapeHtml(logicalType)}" ${placementRequired ? "required" : ""}>`;
  } else if (logicalType === "DATE_AND_TIME") {
    inputHtml = `<input id="${fieldId}" type="datetime-local" data-i2-property-id="${escapeHtml(prop.property_id)}" data-i2-property-name="${escapeHtml(prop.property_name)}" data-i2-logical-type="${escapeHtml(logicalType)}" ${placementRequired ? "required" : ""}>`;
  } else if (logicalType === "INTEGER") {
    inputHtml = `<input id="${fieldId}" type="number" step="1" data-i2-property-id="${escapeHtml(prop.property_id)}" data-i2-property-name="${escapeHtml(prop.property_name)}" data-i2-logical-type="${escapeHtml(logicalType)}" ${placementRequired ? "required" : ""}>`;
  } else if (logicalType === "DECIMAL") {
    inputHtml = `<input id="${fieldId}" type="number" step="any" data-i2-property-id="${escapeHtml(prop.property_id)}" data-i2-property-name="${escapeHtml(prop.property_name)}" data-i2-logical-type="${escapeHtml(logicalType)}" ${placementRequired ? "required" : ""}>`;
  } else {
    inputHtml = `<input id="${fieldId}" type="text" data-i2-property-id="${escapeHtml(prop.property_id)}" data-i2-property-name="${escapeHtml(prop.property_name)}" data-i2-logical-type="${escapeHtml(logicalType)}" ${placementRequired ? "required" : ""}>`;
  }

  return (
    `<div class="entity-i2-field-row"${warningAttrs}>` +
      `<label for="${fieldId}">${escapeHtml(humaniseFieldName(prop.property_name))}${placementRequired ? " *" : ""}</label>` +
      inputHtml +
      (showTechMeta ? `<div class="entity-i2-meta">${escapeHtml(prop.property_id)} | ${escapeHtml(logicalType || "TEXT")}${mandatory && !placementRequired ? " | i2 mandatory" : ""}</div>` : "") +
    `</div>`
  );
}

function renderI2FieldsForType(entityTypeKey) {
  const fieldsContainer = document.getElementById("entity-i2-fields");
  if (!fieldsContainer) return;
  const entity = getI2EntityByKey(entityTypeKey);
  if (!entity) {
    fieldsContainer.innerHTML = '<div class="entity-i2-fields-empty">Select an i2 entity type to capture structured properties.</div>';
    return;
  }

  const entityName = String(entity.entity_name || "");
  const properties = Array.isArray(entity.properties) ? entity.properties : [];
  const hasFullName = properties.some((p) => String(p.property_name || "").toLowerCase() === "full name");

  const core = [];
  const advanced = [];
  for (const prop of properties) {
    const name = String(prop.property_name || "");
    const mandatory = String(prop.mandatory || "").toLowerCase() === "true";
    const redundantName = hasFullName && name.toLowerCase() === "name";
    const personRedundantName = entityName.toLowerCase() === "person" && redundantName;
    const lowValue = I2_LOW_VALUE_FIELDS.has(name) || redundantName;
    const placementRequired = isPlacementRequiredField(entityName, name, mandatory);
    const topPriority = i2FieldPriorityScore(prop) < 12;
    if (!personRedundantName && (placementRequired || topPriority)) {
      core.push(prop);
    } else if (!mandatory && lowValue) {
      advanced.push(prop);
    } else {
      advanced.push(prop);
    }
  }

  core.sort((a, b) => i2FieldPriorityScore(a) - i2FieldPriorityScore(b));
  advanced.sort((a, b) => i2FieldPriorityScore(a) - i2FieldPriorityScore(b));
  const mandatoryCount = properties.filter((p) => String(p.mandatory || "").toLowerCase() === "true").length;

  const header = `<div class="entity-i2-fields-title">${escapeHtml(humaniseFieldName(entity.entity_name))} â€” ${mandatoryCount} required field${mandatoryCount === 1 ? "" : "s"}</div>`;
  const coreHtml = core.map((prop, idx) => buildI2FieldInput(prop, idx, entityName)).join("");
  const advancedHtml = advanced.length
    ? (
      `<details class="entity-i2-advanced">` +
      `<summary>Additional fields (${advanced.length})</summary>` +
      advanced.map((prop, idx) => buildI2FieldInput(prop, core.length + idx, entityName)).join("") +
      `</details>`
    ) : "";
  fieldsContainer.innerHTML = header + coreHtml + advancedHtml;
  renderAddressNumberInlineField(entityName);
  updateWarningMarkerVisibility();
}

function populateI2EntityTypeSelect(selectedCategory = "") {
  const select = document.getElementById("entity-i2-type");
  if (!select) return;
  if (!I2_ENTITY_CATALOG.length) {
    select.innerHTML = '<option value="">i2 catalog unavailable</option>';
    return;
  }

  select.innerHTML = '<option value="">Select i2 entity type...</option>';
  I2_ENTITY_CATALOG.forEach((entity) => {
    const opt = document.createElement("option");
    opt.value = entity.entity_id;
    opt.textContent = `${entity.entity_name} (${entity.entity_id})`;
    select.appendChild(opt);
  });

  const fallback = defaultI2EntityForCategory(selectedCategory) || I2_ENTITY_CATALOG[0];
  if (fallback) {
    select.value = fallback.entity_id;
    renderI2FieldsForType(fallback.entity_id);
  }
}

async function initI2EntityCatalog() {
  if (I2_CATALOG_LOADED) return;
  try {
    const resp = await fetch("data/i2 Specs/parsed/entity_catalog.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const list = await resp.json();
    I2_ENTITY_CATALOG = Array.isArray(list) ? list : [];
    I2_ENTITY_CATALOG.forEach((entity) => {
      if (!entity || !entity.entity_id) return;
      I2_ENTITY_BY_ID[String(entity.entity_id).toUpperCase()] = entity;
      I2_ENTITY_BY_NAME[String(entity.entity_name || "").toLowerCase()] = entity;
    });
  } catch (err) {
    console.warn("Could not load i2 entity catalog for placement form:", err);
    I2_ENTITY_CATALOG = [];
  }
  I2_CATALOG_LOADED = true;
  populateI2EntityTypeSelect();
}

function ensureI2EntityCatalogLoaded(selectedCategory = "") {
  if (I2_CATALOG_LOADED) {
    if (selectedCategory) populateI2EntityTypeSelect(selectedCategory);
    return Promise.resolve(true);
  }
  if (!I2_CATALOG_LOADING_PROMISE) {
    I2_CATALOG_LOADING_PROMISE = initI2EntityCatalog()
      .then(() => true)
      .catch(() => false)
      .finally(() => {
        I2_CATALOG_LOADING_PROMISE = null;
      });
  }
  return I2_CATALOG_LOADING_PROMISE.then((ok) => {
    if (ok && selectedCategory) populateI2EntityTypeSelect(selectedCategory);
    return ok;
  });
}

function collectI2EntityFormData() {
  syncAddressNumberInlineToI2();
  // Ensure Address String has propagated into structured fields before validation/export.
  syncAddressStringDerivedFields();

  const typeSelect = document.getElementById("entity-i2-type");
  const entityTypeId = typeSelect?.value || "";
  const entityDef = getI2EntityByKey(entityTypeId);
  if (!entityDef) return null;

  const values = {};
  const fields = document.querySelectorAll("#entity-i2-fields [data-i2-property-id]");
  for (const field of fields) {
    const propertyId = field.dataset.i2PropertyId || "";
    const propertyName = field.dataset.i2PropertyName || propertyId;
    const logicalType = field.dataset.i2LogicalType || "";
    const required = field.hasAttribute("required");
    const raw = String(field.value || "").trim();
    if (required && !raw) {
      return { error: `Missing mandatory i2 field: ${propertyName}` };
    }
    if (!raw) continue;
    values[propertyId] = {
      propertyId,
      propertyName,
      logicalType,
      value: raw,
      mandatory: required
    };
  }

  return {
    entityId: entityDef.entity_id,
    entityName: entityDef.entity_name,
    values
  };
}

function inferEntityLabel(inputLabel, i2EntityData, fallbackName) {
  const direct = String(inputLabel || "").trim();
  if (direct) return direct;
  if (!i2EntityData || !i2EntityData.values) return fallbackName;

  const vals = Object.values(i2EntityData.values);
  const byName = (needle) => vals.find((v) => String(v.propertyName || "").toLowerCase() === needle.toLowerCase())?.value || "";

  if (String(i2EntityData.entityName || "").toLowerCase() === "person") {
    const full = byName("Full Name") || byName("Name");
    if (full) return full;
    const first = byName("First Name");
    const sur = byName("Surname");
    const assembled = `${first} ${sur}`.trim();
    if (assembled) return assembled;
  }

  const firstValue = vals[0]?.value;
  return firstValue || fallbackName;
}

function inferEntityAddress(i2EntityData) {
  if (!i2EntityData || !i2EntityData.values) return "";
  const vals = Object.values(i2EntityData.values);
  const byName = (needle) => vals.find((v) => String(v.propertyName || "").toLowerCase() === needle.toLowerCase())?.value || "";
  const direct = byName("Address String");
  if (direct) return direct;

  const parts = [
    byName("Building Number"),
    byName("Street Name"),
    byName("Town/City"),
    byName("Post Code")
  ].filter(Boolean);
  return parts.join(", ");
}

function inferEntityNotes(i2EntityData) {
  if (!i2EntityData || !i2EntityData.values) return "";
  const vals = Object.values(i2EntityData.values);
  const byName = (needle) => vals.find((v) => String(v.propertyName || "").toLowerCase() === needle.toLowerCase())?.value || "";
  return (
    byName("Additional Information") ||
    byName("Description") ||
    byName("Reason for De-Reg") ||
    byName("3x5x2 Notes") ||
    ""
  );
}

function getI2ValueByNames(i2EntityData, names) {
  if (!i2EntityData || !i2EntityData.values) return "";
  const vals = Object.values(i2EntityData.values);
  for (const n of names || []) {
    const hit = vals.find((v) => String(v.propertyName || "").toLowerCase() === String(n || "").toLowerCase());
    if (hit && String(hit.value || "").trim()) return String(hit.value || "").trim();
  }
  return "";
}

function getI2FieldByNames(names) {
  const fields = document.querySelectorAll("#entity-i2-fields [data-i2-property-name]");
  for (const field of fields) {
    const pname = String(field.dataset.i2PropertyName || "").toLowerCase();
    if ((names || []).some((n) => pname === String(n || "").toLowerCase())) {
      return field;
    }
  }
  return null;
}

function setI2FieldIfEmpty(names, value) {
  const val = String(value || "").trim();
  if (!val) return false;
  const field = getI2FieldByNames(names);
  if (!field) return false;
  const current = String(field.value || "").trim();
  const auto = String(field.dataset.autogen || "") === "1";
  if (current && !auto) return false;
  if (current === val && auto) return false;
  field.value = val;
  field.dataset.autogen = "1";
  return true;
}

function isLocationLikeEntityName(entityName) {
  const name = String(entityName || "").toLowerCase();
  return /(location|address|building|site|premises|place|property)/.test(name);
}

function syncAddressNumberInlineToI2() {
  const inline = document.getElementById("entity-address-number-inline");
  if (!inline) return false;
  const number = String(inline.value || "").trim();
  if (!number) return false;

  let updated = false;
  const buildingField = getI2FieldByNames(["Building Number", "House Number", "Number"]);
  if (buildingField) {
    const current = String(buildingField.value || "").trim();
    const auto = String(buildingField.dataset.autogen || "") === "1";
    if (!current || auto) {
      buildingField.value = number;
      buildingField.dataset.autogen = "0";
      updated = true;
    }
  }

  const addrField = getI2FieldByNames(["Address String", "Address"]);
  if (addrField) {
    const currentAddress = String(addrField.value || "").trim();
    const hasLeadingNumber = /^\s*\d+[A-Za-z]?\b/.test(currentAddress);
    if (currentAddress && !hasLeadingNumber) {
      addrField.value = `${number} ${currentAddress}`.trim();
      addrField.dataset.autogen = "0";
      updated = true;
    }
  }

  return updated;
}

function renderAddressNumberInlineField(entityName = "") {
  const wrap = document.getElementById("entity-i2-fields");
  if (!wrap) return;

  const existing = document.getElementById("entity-address-number-inline");
  if (existing?.closest(".entity-i2-field-row")) {
    existing.closest(".entity-i2-field-row").remove();
  }
  if (!isLocationLikeEntityName(entityName)) return;

  const addrField = getI2FieldByNames(["Address String", "Address"]);
  if (!addrField) return;
  const addrRow = addrField.closest(".entity-i2-field-row");
  if (!addrRow) return;

  const buildingField = getI2FieldByNames(["Building Number", "House Number", "Number"]);
  const parsed = parseAddressString(String(addrField.value || "").trim()) || {};
  const startingNumber = String(buildingField?.value || parsed.buildingNumber || "").trim();

  const row = document.createElement("div");
  row.className = "entity-i2-field-row entity-address-number-row";
  row.innerHTML =
    `<label for="entity-address-number-inline">House Number</label>` +
    `<input id="entity-address-number-inline" type="text" placeholder="e.g. 1" value="${escapeHtml(startingNumber)}">` +
    `<div class="entity-i2-meta">Used for house-level geocoding and merged into Address String.</div>`;
  addrRow.insertAdjacentElement("afterend", row);

  const inline = document.getElementById("entity-address-number-inline");
  inline?.addEventListener("input", () => {
    syncAddressNumberInlineToI2();
  });
}

function parseAddressString(rawAddress) {
  const address = String(rawAddress || "").trim();
  if (!address) return null;

  const out = {
    buildingNumber: "",
    streetName: "",
    town: "",
    county: "",
    postcode: "",
    country: ""
  };

  const cleaned = address.replace(/\s+/g, " ").trim();
  const ukPostcodeMatch = cleaned.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/i);
  if (ukPostcodeMatch) {
    out.postcode = ukPostcodeMatch[1].toUpperCase().replace(/\s+/g, "");
  }

  // Remove postcode from tail before splitting locality tokens.
  const withoutPostcode = out.postcode
    ? cleaned.replace(new RegExp(out.postcode.replace(/\s*/g, "\\s*"), "i"), "").replace(/,\s*$/, "").trim()
    : cleaned;

  const parts = withoutPostcode.split(",").map((p) => p.trim()).filter(Boolean);
  const first = parts[0] || "";

  const parseStreetToken = (token) => {
    const t = String(token || "").trim();
    if (!t) return null;
    const direct = t.match(/^(\d+[A-Z]?(?:[-/]\d+[A-Z]?)?)\s+(.+)$/i);
    if (direct) return { buildingNumber: direct[1].trim(), streetName: direct[2].trim() };
    const withUnit = t.match(/^(?:flat|apartment|apt|unit|suite|room|rm|floor|fl)\s+\w+\s*[,-]?\s*(\d+[A-Z]?(?:[-/]\d+[A-Z]?)?)\s+(.+)$/i);
    if (withUnit) return { buildingNumber: withUnit[1].trim(), streetName: withUnit[2].trim() };
    const trailing = t.match(/^(.+?)\s+(\d+[A-Z]?)$/i);
    if (trailing) return { buildingNumber: trailing[2].trim(), streetName: trailing[1].trim() };
    return null;
  };

  let parsedStreet = parseStreetToken(first);
  let localityOffset = 1;
  if (!parsedStreet && parts.length > 1) {
    parsedStreet = parseStreetToken(parts[1]);
    if (parsedStreet) localityOffset = 2;
  }
  if (parsedStreet) {
    out.buildingNumber = parsedStreet.buildingNumber;
    out.streetName = parsedStreet.streetName;
  } else if (first) {
    out.streetName = first;
  }

  if (parts.length > localityOffset) out.town = parts[localityOffset];
  if (parts.length > localityOffset + 1) out.county = parts[localityOffset + 1];
  if (parts.length > localityOffset + 2) out.country = parts.slice(localityOffset + 2).join(", ");
  if (!out.country && out.county) out.country = out.county;

  return out;
}

function setI2FieldValueByProperty(propertyId, propertyName, value) {
  const val = String(value || "").trim();
  if (!val) return false;
  const fields = document.querySelectorAll("#entity-i2-fields [data-i2-property-id]");
  for (const field of fields) {
    const byId = String(field.dataset.i2PropertyId || "") === String(propertyId || "");
    const byName = String(field.dataset.i2PropertyName || "").toLowerCase() === String(propertyName || "").toLowerCase();
    if (byId || byName) {
      field.value = val;
      field.dataset.autogen = "0";
      return true;
    }
  }
  return false;
}

function getCategoryKeyByName(categoryName) {
  const needle = String(categoryName || "").trim().toLowerCase();
  if (!needle) return "";
  for (const [key, cat] of Object.entries(ICON_CATEGORIES)) {
    if (String(cat?.name || "").trim().toLowerCase() === needle) return key;
  }
  return "";
}

function resolveEntityCategoryAndIcon(entity) {
  const fromName = getCategoryKeyByName(entity?.iconData?.categoryName);
  const categoryKey = fromName || Object.keys(ICON_CATEGORIES).find((key) =>
    (ICON_CATEGORIES[key]?.icons || []).some((icon) =>
      icon?.id && entity?.iconData?.id && icon.id === entity.iconData.id
    )
  ) || "people";
  const iconList = ICON_CATEGORIES[categoryKey]?.icons || [];
  const iconIndex = Math.max(0, iconList.findIndex((icon) =>
    (entity?.iconData?.id && icon.id === entity.iconData.id) ||
    (entity?.iconData?.icon && icon.icon === entity.iconData.icon)
  ));
  return { categoryKey, iconIndex };
}

async function openEntityEditor(entityId) {
  const entity = getEntityById(entityId);
  if (!entity) return;
  const { categoryKey, iconIndex } = resolveEntityCategoryAndIcon(entity);
  window._editingEntityId = entityId;
  window._placementMode = categoryKey;
  showEntityPlacementDialog(entity.latLng);
  setEntityPanelMode(true);

  await ensureI2EntityCatalogLoaded(categoryKey);

  const labelInput = document.getElementById("entity-label");
  const categorySelect = document.getElementById("entity-category");
  const iconSelect = document.getElementById("entity-icon");
  const typeSelect = document.getElementById("entity-i2-type");
  const placementAddress = document.getElementById("entity-placement-address");
  const placementNumber = document.getElementById("entity-placement-number");

  if (categorySelect) {
    categorySelect.value = categoryKey;
    updateIconDropdown(categoryKey);
  }
  if (iconSelect) {
    iconSelect.value = String(iconIndex);
    updateEntityIconPreview(categoryKey, iconIndex);
  }
  if (labelInput) {
    labelInput.value = String(entity.label || "");
  }
  if (placementAddress) {
    placementAddress.value = String(entity.address || "");
  }
  if (placementNumber) {
    placementNumber.value = String(getI2ValueByNames(entity.i2EntityData, ["Building Number", "House Number", "Number"]) || "");
  }

  const entityTypeId = String(entity?.i2EntityData?.entityId || "");
  if (typeSelect && entityTypeId) {
    typeSelect.value = entityTypeId;
    renderI2FieldsForType(entityTypeId);
    const values = Object.values(entity?.i2EntityData?.values || {});
    values.forEach((row) => {
      setI2FieldValueByProperty(row.propertyId, row.propertyName, row.value);
    });
  }
  document.getElementById("entity-coords").textContent = `${entity.latLng[0].toFixed(5)}, ${entity.latLng[1].toFixed(5)}`;
  setStatus(`Editing ${entity.label || "entity"} - update fields then save`);
}

function composeAddressFromStructuredFields() {
  const building = getEntityFieldValueByName("Building Number");
  const street = getEntityFieldValueByName("Street Name");
  const town = getEntityFieldValueByName("Town/City");
  const county = getEntityFieldValueByName("County or State");
  const postcode = getEntityFieldValueByName("Post Code");
  const country = getEntityFieldValueByName("Country or Region");

  const line1 = [building, street].filter(Boolean).join(" ").trim();
  const parts = [line1, town, county, postcode, country].filter(Boolean);
  return parts.join(", ");
}

function syncStructuredFieldsToAddressString() {
  const addrField = getI2FieldByNames(["Address String", "Address"]);
  if (!addrField) return false;
  const current = String(addrField.value || "").trim();
  const allowOverwrite = !current || String(addrField.dataset.autogen || "") === "1";
  if (!allowOverwrite) return false;

  const composed = composeAddressFromStructuredFields();
  if (!composed) return false;
  addrField.value = composed;
  addrField.dataset.autogen = "1";
  return true;
}

function syncAddressStringDerivedFields() {
  syncAddressNumberInlineToI2();
  const addrField = getI2FieldByNames(["Address String", "Address"]);
  if (!addrField) return false;
  const currentAddress = String(addrField.value || "").trim();
  if (!currentAddress) {
    return syncStructuredFieldsToAddressString();
  }
  const parsed = parseAddressString(currentAddress);
  if (!parsed) return false;
  // User-provided address string is source; mark non-autogenerated while user edits.
  if (document.activeElement === addrField) {
    addrField.dataset.autogen = "0";
  }

  let updated = false;
  updated = setI2FieldIfEmpty(["Building Number", "House Number", "Number"], parsed.buildingNumber) || updated;
  updated = setI2FieldIfEmpty(["Street Name", "Street"], parsed.streetName) || updated;
  updated = setI2FieldIfEmpty(["Town/City", "Town", "City", "Locality"], parsed.town) || updated;
  updated = setI2FieldIfEmpty(["County or State", "County", "State"], parsed.county) || updated;
  updated = setI2FieldIfEmpty(["Post Code", "Postal Code", "Postcode"], parsed.postcode) || updated;
  updated = setI2FieldIfEmpty(["Country or Region", "Country"], parsed.country || parsed.county) || updated;

  return syncStructuredFieldsToAddressString() || updated;
}

function getEntityFieldValueByName(fieldName) {
  const fields = document.querySelectorAll("#entity-i2-fields [data-i2-property-name]");
  for (const field of fields) {
    if (String(field.dataset.i2PropertyName || "").toLowerCase() === String(fieldName || "").toLowerCase()) {
      return String(field.value || "").trim();
    }
  }
  return "";
}

function setCategoryIconById(category, iconId) {
  const iconSelect = document.getElementById("entity-icon");
  if (!iconSelect || !category || !ICON_CATEGORIES[category]) return false;
  const idx = ICON_CATEGORIES[category].icons.findIndex((icon) => icon.id === iconId);
  if (idx < 0) return false;
  iconSelect.value = String(idx);
  updateEntityIconPreview(category, idx);
  return true;
}

function autoSelectIconFromI2Fields(force = false) {
  const category = document.getElementById("entity-category")?.value || "";
  if (!category || !ICON_CATEGORIES[category]) return;
  if (!force && ENTITY_ICON_MANUAL_OVERRIDE) return;

  const locationType = getEntityFieldValueByName("Location Type").toLowerCase();

  if (category === "buildings" && locationType) {
    if (/(town|city|village|region)/.test(locationType)) {
      if (setCategoryIconById(category, "building")) return;
    }
    if (/(home|residence|house|address)/.test(locationType)) {
      if (setCategoryIconById(category, "house")) return;
    }
    if (/(factory|warehouse|industrial)/.test(locationType)) {
      if (setCategoryIconById(category, "factory")) return;
    }
  }

  if (category === "financial" && /(bank)/.test(locationType)) {
    if (setCategoryIconById(category, "bank")) return;
  }

  if (category === "aviation") {
    if (/(airport|terminal|runway|airfield)/.test(locationType)) {
      if (setCategoryIconById(category, "airport")) return;
    }
    const aircraftHints = [
      getEntityFieldValueByName("Registration Mark"),
      getEntityFieldValueByName("Aircraft class"),
      getEntityFieldValueByName("Type"),
      getEntityFieldValueByName("Manufacturer")
    ].join(" ").toLowerCase();
    if (/(aircraft|plane|jet|boeing|airbus|cessna|helicopter|flight)/.test(aircraftHints)) {
      if (setCategoryIconById(category, "aircraft")) return;
    }
  }

  if (category === "people") {
    const gender = getEntityFieldValueByName("Gender").toLowerCase();
    const title = getEntityFieldValueByName("Title").toLowerCase();
    if (/(^|\b)(male|man|boy)(\b|$)/.test(gender) || /(^|\b)(mr|sir)(\b|$)/.test(title)) {
      if (setCategoryIconById(category, "man")) return;
    }
    if (/(^|\b)(female|woman|girl)(\b|$)/.test(gender) || /(^|\b)(ms|mrs|miss|madam)(\b|$)/.test(title)) {
      if (setCategoryIconById(category, "woman")) return;
    }
  }

  const hintText = [
    document.getElementById("entity-label")?.value || "",
    getEntityFieldValueByName("Full Name"),
    getEntityFieldValueByName("Name"),
    getEntityFieldValueByName("Organisation Name"),
    getEntityFieldValueByName("Location Type"),
    getEntityFieldValueByName("Vehicle Type"),
    getEntityFieldValueByName("Manufacturer")
  ].filter(Boolean).join(" ");

  if (hintText) {
    const suggested = suggestIcon(hintText, category);
    if (suggested) {
      const idx = ICON_CATEGORIES[category].icons.findIndex((icon) => icon.name === suggested.name);
      if (idx >= 0) {
        document.getElementById("entity-icon").value = String(idx);
      }
    }
  }
}

function updateWarningMarkerVisibility() {
  const wrap = document.getElementById("entity-i2-fields");
  if (!wrap) return;
  const row1 = wrap.querySelector('[data-warning-level="1"]');
  const row2 = wrap.querySelector('[data-warning-level="2"]');
  const row3 = wrap.querySelector('[data-warning-level="3"]');
  const row4 = wrap.querySelector('[data-warning-level="4"]');
  const notes = wrap.querySelector('[data-warning-notes="1"]');
  const val1 = row1 ? String(row1.querySelector("[data-i2-property-id]")?.value || "").trim() : "";
  const val2 = row2 ? String(row2.querySelector("[data-i2-property-id]")?.value || "").trim() : "";
  const val3 = row3 ? String(row3.querySelector("[data-i2-property-id]")?.value || "").trim() : "";
  const val4 = row4 ? String(row4.querySelector("[data-i2-property-id]")?.value || "").trim() : "";

  const setVisible = (row, show) => {
    if (!row) return;
    row.style.display = show ? "" : "none";
    if (!show) {
      const input = row.querySelector("[data-i2-property-id]");
      if (input) input.value = "";
    }
  };

  setVisible(row2, !!val1);
  setVisible(row3, !!val2);
  setVisible(row4, !!val3);
  setVisible(notes, !!(val1 || val2 || val3 || val4));
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// ENTITY DEFINITIONS
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

const ICON_CATEGORIES = {
  people: {
    name: "People",
    color: "#818cf8",
    defaultIcon: "gfx/entity_icons/people/marker.svg",
    icons: [
      { id: "artist", name: "Artist", icon: "gfx/entity_icons/people/artist.png", keywords: ["artist", "people"] },
      { id: "athlete", name: "Athlete", icon: "gfx/entity_icons/people/athlete.png", keywords: ["athlete", "people"] },
      { id: "baby-bottle", name: "Baby Bottle", icon: "gfx/entity_icons/people/baby-bottle.svg", keywords: ["baby", "bottle", "people"] },
      { id: "baby-carriage", name: "Baby Carriage", icon: "gfx/entity_icons/people/baby-carriage.svg", keywords: ["baby", "carriage", "people"] },
      { id: "basketballplayer", name: "Basketballplayer", icon: "gfx/entity_icons/people/basketballplayer.png", keywords: ["basketballplayer", "people"] },
      { id: "beauty-salon", name: "Beauty Salon", icon: "gfx/entity_icons/people/beauty-salon.svg", keywords: ["beauty", "salon", "people"] },
      { id: "bellboy", name: "Bellboy", icon: "gfx/entity_icons/people/bellboy.png", keywords: ["bellboy", "people"] },
      { id: "body-scan", name: "Body Scan", icon: "gfx/entity_icons/people/body-scan.svg", keywords: ["body", "scan", "people"] },
      { id: "body-text", name: "Body Text", icon: "gfx/entity_icons/people/body-text.svg", keywords: ["body", "text", "people"] },
      { id: "burglar", name: "Burglar", icon: "gfx/entity_icons/people/burglar.png", keywords: ["burglar", "people"] },
      { id: "businessman", name: "Businessman", icon: "gfx/entity_icons/people/businessman.png", keywords: ["businessman", "people"] },
      { id: "businesswoman", name: "Businesswoman", icon: "gfx/entity_icons/people/businesswoman.png", keywords: ["businesswoman", "people"] },
      { id: "calendar-user", name: "Calendar User", icon: "gfx/entity_icons/people/calendar-user.svg", keywords: ["calendar", "user", "people"] },
      { id: "captain", name: "Captain", icon: "gfx/entity_icons/people/captain.png", keywords: ["captain", "people"] },
      { id: "chalkboard-teacher", name: "Chalkboard Teacher", icon: "gfx/entity_icons/people/chalkboard-teacher.svg", keywords: ["chalkboard", "teacher", "people"] },
      { id: "chef-hat-off", name: "Chef Hat Off", icon: "gfx/entity_icons/people/chef-hat-off.svg", keywords: ["chef", "hat", "off", "people"] },
      { id: "chef-hat", name: "Chef Hat", icon: "gfx/entity_icons/people/chef-hat.svg", keywords: ["chef", "hat", "people"] },
      { id: "chef", name: "Chef", icon: "gfx/entity_icons/people/chef.png", keywords: ["chef", "people"] },
      { id: "cib-chef", name: "Cib Chef", icon: "gfx/entity_icons/people/cib-chef.svg", keywords: ["cib", "chef", "people"] },
      { id: "cib-designer-news", name: "Cib Designer News", icon: "gfx/entity_icons/people/cib-designer-news.svg", keywords: ["cib", "designer", "news", "people"] },
      { id: "cil-baby-carriage", name: "Cil Baby Carriage", icon: "gfx/entity_icons/people/cil-baby-carriage.svg", keywords: ["cil", "baby", "carriage", "people"] },
      { id: "cil-baby", name: "Cil Baby", icon: "gfx/entity_icons/people/cil-baby.svg", keywords: ["cil", "baby", "people"] },
      { id: "cil-child-friendly", name: "Cil Child Friendly", icon: "gfx/entity_icons/people/cil-child-friendly.svg", keywords: ["cil", "child", "friendly", "people"] },
      { id: "cil-child", name: "Cil Child", icon: "gfx/entity_icons/people/cil-child.svg", keywords: ["cil", "child", "people"] },
      { id: "cil-face-dead", name: "Cil Face Dead", icon: "gfx/entity_icons/people/cil-face-dead.svg", keywords: ["cil", "face", "dead", "people"] },
      { id: "cil-face", name: "Cil Face", icon: "gfx/entity_icons/people/cil-face.svg", keywords: ["cil", "face", "people"] },
      { id: "cil-people", name: "Cil People", icon: "gfx/entity_icons/people/cil-people.svg", keywords: ["cil", "people"] },
      { id: "cil-user-female", name: "Cil User Female", icon: "gfx/entity_icons/people/cil-user-female.svg", keywords: ["cil", "user", "female", "people"] },
      { id: "cil-user-follow", name: "Cil User Follow", icon: "gfx/entity_icons/people/cil-user-follow.svg", keywords: ["cil", "user", "follow", "people"] },
      { id: "cil-user-plus", name: "Cil User Plus", icon: "gfx/entity_icons/people/cil-user-plus.svg", keywords: ["cil", "user", "plus", "people"] },
      { id: "cil-user-unfollow", name: "Cil User Unfollow", icon: "gfx/entity_icons/people/cil-user-unfollow.svg", keywords: ["cil", "user", "unfollow", "people"] },
      { id: "cil-user-x", name: "Cil User X", icon: "gfx/entity_icons/people/cil-user-x.svg", keywords: ["cil", "user", "people"] },
      { id: "cil-user", name: "Cil User", icon: "gfx/entity_icons/people/cil-user.svg", keywords: ["cil", "user", "people"] },
      { id: "cleaner", name: "Cleaner", icon: "gfx/entity_icons/people/cleaner.png", keywords: ["cleaner", "people"] },
      { id: "clerk", name: "Clerk", icon: "gfx/entity_icons/people/clerk.png", keywords: ["clerk", "people"] },
      { id: "cookie-man", name: "Cookie Man", icon: "gfx/entity_icons/people/cookie-man.svg", keywords: ["cookie", "man", "people"] },
      { id: "customerservice", name: "Customerservice", icon: "gfx/entity_icons/people/customerservice.png", keywords: ["customerservice", "people"] },
      { id: "dentist", name: "Dentist", icon: "gfx/entity_icons/people/dentist.svg", keywords: ["dentist", "people"] },
      { id: "doctor", name: "Doctor", icon: "gfx/entity_icons/people/doctor.png", keywords: ["doctor", "people"] },
      { id: "doctor", name: "Doctor", icon: "gfx/entity_icons/people/doctor.svg", keywords: ["doctor", "people"] },
      { id: "driver", name: "Driver", icon: "gfx/entity_icons/people/driver.png", keywords: ["driver", "people"] },
      { id: "engineer", name: "Engineer", icon: "gfx/entity_icons/people/engineer.png", keywords: ["engineer", "people"] },
      { id: "face-id-error", name: "Face Id Error", icon: "gfx/entity_icons/people/face-id-error.svg", keywords: ["face", "id", "error", "people"] },
      { id: "face-id", name: "Face Id", icon: "gfx/entity_icons/people/face-id.svg", keywords: ["face", "id", "people"] },
      { id: "face-mask-off", name: "Face Mask Off", icon: "gfx/entity_icons/people/face-mask-off.svg", keywords: ["face", "mask", "off", "people"] },
      { id: "face-mask", name: "Face Mask", icon: "gfx/entity_icons/people/face-mask.svg", keywords: ["face", "mask", "people"] },
      { id: "female", name: "Female", icon: "gfx/entity_icons/people/female.svg", keywords: ["female", "people"] },
      { id: "firefighter", name: "Firefighter", icon: "gfx/entity_icons/people/firefighter.png", keywords: ["firefighter", "people"] },
      { id: "fireman", name: "Fireman", icon: "gfx/entity_icons/people/fireman.png", keywords: ["fireman", "people"] },
      { id: "fitness-centre", name: "Fitness Centre", icon: "gfx/entity_icons/people/fitness-centre.svg", keywords: ["fitness", "centre", "people"] },
      { id: "footballplayer", name: "Footballplayer", icon: "gfx/entity_icons/people/footballplayer.png", keywords: ["footballplayer", "people"] },
      { id: "geek", name: "Geek", icon: "gfx/entity_icons/people/geek.png", keywords: ["geek", "people"] },
      { id: "graduate", name: "Graduate", icon: "gfx/entity_icons/people/graduate.png", keywords: ["graduate", "people"] },
      { id: "gym", name: "Gym", icon: "gfx/entity_icons/people/gym.svg", keywords: ["gym", "people"] },
      { id: "hair-care", name: "Hair Care", icon: "gfx/entity_icons/people/hair-care.svg", keywords: ["hair", "care", "people"] },
      { id: "hairdresser", name: "Hairdresser", icon: "gfx/entity_icons/people/hairdresser.svg", keywords: ["hairdresser", "people"] },
      { id: "hipster", name: "Hipster", icon: "gfx/entity_icons/people/hipster.png", keywords: ["hipster", "people"] },
      { id: "lawyer", name: "Lawyer", icon: "gfx/entity_icons/people/lawyer.png", keywords: ["lawyer", "people"] },
      { id: "lawyer", name: "Lawyer", icon: "gfx/entity_icons/people/lawyer.svg", keywords: ["lawyer", "people"] },
      { id: "male", name: "Male", icon: "gfx/entity_icons/people/male.svg", keywords: ["male", "people"] },
      { id: "man", name: "Man", icon: "gfx/entity_icons/people/man.png", keywords: ["man", "people"] },
      { id: "man", name: "Man", icon: "gfx/entity_icons/people/man.svg", keywords: ["man", "people"] },
      { id: "marker-stroked", name: "Marker Stroked", icon: "gfx/entity_icons/people/marker-stroked.svg", keywords: ["marker", "stroked", "people"] },
      { id: "marker", name: "Marker", icon: "gfx/entity_icons/people/marker.svg", keywords: ["marker", "people"] },
      { id: "nun", name: "Nun", icon: "gfx/entity_icons/people/nun.png", keywords: ["nun", "people"] },
      { id: "nurse", name: "Nurse", icon: "gfx/entity_icons/people/nurse.png", keywords: ["nurse", "people"] },
      { id: "nurse", name: "Nurse", icon: "gfx/entity_icons/people/nurse.svg", keywords: ["nurse", "people"] },
      { id: "password-user", name: "Password User", icon: "gfx/entity_icons/people/password-user.svg", keywords: ["password", "user", "people"] },
      { id: "people-fill", name: "People Fill", icon: "gfx/entity_icons/people/people-fill.svg", keywords: ["people", "fill"] },
      { id: "people", name: "People", icon: "gfx/entity_icons/people/people.svg", keywords: ["people"] },
      { id: "person-add", name: "Person Add", icon: "gfx/entity_icons/people/person-add.svg", keywords: ["person", "add", "people"] },
      { id: "person-arms-up", name: "Person Arms Up", icon: "gfx/entity_icons/people/person-arms-up.svg", keywords: ["person", "arms", "up", "people"] },
      { id: "person-badge-fill", name: "Person Badge Fill", icon: "gfx/entity_icons/people/person-badge-fill.svg", keywords: ["person", "badge", "fill", "people"] },
      { id: "person-badge", name: "Person Badge", icon: "gfx/entity_icons/people/person-badge.svg", keywords: ["person", "badge", "people"] },
      { id: "person-bounding-box", name: "Person Bounding Box", icon: "gfx/entity_icons/people/person-bounding-box.svg", keywords: ["person", "bounding", "box", "people"] },
      { id: "person-check-fill", name: "Person Check Fill", icon: "gfx/entity_icons/people/person-check-fill.svg", keywords: ["person", "check", "fill", "people"] },
      { id: "person-check", name: "Person Check", icon: "gfx/entity_icons/people/person-check.svg", keywords: ["person", "check", "people"] },
      { id: "person-circle", name: "Person Circle", icon: "gfx/entity_icons/people/person-circle.svg", keywords: ["person", "circle", "people"] },
      { id: "person-dash-fill", name: "Person Dash Fill", icon: "gfx/entity_icons/people/person-dash-fill.svg", keywords: ["person", "dash", "fill", "people"] },
      { id: "person-dash", name: "Person Dash", icon: "gfx/entity_icons/people/person-dash.svg", keywords: ["person", "dash", "people"] },
      { id: "person-down", name: "Person Down", icon: "gfx/entity_icons/people/person-down.svg", keywords: ["person", "down", "people"] },
      { id: "person-exclamation", name: "Person Exclamation", icon: "gfx/entity_icons/people/person-exclamation.svg", keywords: ["person", "exclamation", "people"] },
      { id: "person-fill-add", name: "Person Fill Add", icon: "gfx/entity_icons/people/person-fill-add.svg", keywords: ["person", "fill", "add", "people"] },
      { id: "person-fill-check", name: "Person Fill Check", icon: "gfx/entity_icons/people/person-fill-check.svg", keywords: ["person", "fill", "check", "people"] },
      { id: "person-fill-dash", name: "Person Fill Dash", icon: "gfx/entity_icons/people/person-fill-dash.svg", keywords: ["person", "fill", "dash", "people"] },
      { id: "person-fill-down", name: "Person Fill Down", icon: "gfx/entity_icons/people/person-fill-down.svg", keywords: ["person", "fill", "down", "people"] },
      { id: "person-fill-exclamation", name: "Person Fill Exclamation", icon: "gfx/entity_icons/people/person-fill-exclamation.svg", keywords: ["person", "fill", "exclamation", "people"] },
      { id: "person-fill-gear", name: "Person Fill Gear", icon: "gfx/entity_icons/people/person-fill-gear.svg", keywords: ["person", "fill", "gear", "people"] },
      { id: "person-fill-lock", name: "Person Fill Lock", icon: "gfx/entity_icons/people/person-fill-lock.svg", keywords: ["person", "fill", "lock", "people"] },
      { id: "person-fill-slash", name: "Person Fill Slash", icon: "gfx/entity_icons/people/person-fill-slash.svg", keywords: ["person", "fill", "slash", "people"] },
      { id: "person-fill-up", name: "Person Fill Up", icon: "gfx/entity_icons/people/person-fill-up.svg", keywords: ["person", "fill", "up", "people"] },
      { id: "person-fill-x", name: "Person Fill X", icon: "gfx/entity_icons/people/person-fill-x.svg", keywords: ["person", "fill", "people"] },
      { id: "person-fill", name: "Person Fill", icon: "gfx/entity_icons/people/person-fill.svg", keywords: ["person", "fill", "people"] },
      { id: "person-gear", name: "Person Gear", icon: "gfx/entity_icons/people/person-gear.svg", keywords: ["person", "gear", "people"] },
      { id: "person-heart", name: "Person Heart", icon: "gfx/entity_icons/people/person-heart.svg", keywords: ["person", "heart", "people"] },
      { id: "person-hearts", name: "Person Hearts", icon: "gfx/entity_icons/people/person-hearts.svg", keywords: ["person", "hearts", "people"] },
      { id: "person-lines-fill", name: "Person Lines Fill", icon: "gfx/entity_icons/people/person-lines-fill.svg", keywords: ["person", "lines", "fill", "people"] },
      { id: "person-lock", name: "Person Lock", icon: "gfx/entity_icons/people/person-lock.svg", keywords: ["person", "lock", "people"] },
      { id: "person-plus-fill", name: "Person Plus Fill", icon: "gfx/entity_icons/people/person-plus-fill.svg", keywords: ["person", "plus", "fill", "people"] },
      { id: "person-plus", name: "Person Plus", icon: "gfx/entity_icons/people/person-plus.svg", keywords: ["person", "plus", "people"] },
      { id: "person-raised-hand", name: "Person Raised Hand", icon: "gfx/entity_icons/people/person-raised-hand.svg", keywords: ["person", "raised", "hand", "people"] },
      { id: "person-rolodex", name: "Person Rolodex", icon: "gfx/entity_icons/people/person-rolodex.svg", keywords: ["person", "rolodex", "people"] },
      { id: "person-slash", name: "Person Slash", icon: "gfx/entity_icons/people/person-slash.svg", keywords: ["person", "slash", "people"] },
      { id: "person-square", name: "Person Square", icon: "gfx/entity_icons/people/person-square.svg", keywords: ["person", "square", "people"] },
      { id: "person-standing-dress", name: "Person Standing Dress", icon: "gfx/entity_icons/people/person-standing-dress.svg", keywords: ["person", "standing", "dress", "people"] },
      { id: "person-standing", name: "Person Standing", icon: "gfx/entity_icons/people/person-standing.svg", keywords: ["person", "standing", "people"] },
      { id: "person-up", name: "Person Up", icon: "gfx/entity_icons/people/person-up.svg", keywords: ["person", "up", "people"] },
      { id: "person-vcard-fill", name: "Person Vcard Fill", icon: "gfx/entity_icons/people/person-vcard-fill.svg", keywords: ["person", "vcard", "fill", "people"] },
      { id: "person-vcard", name: "Person Vcard", icon: "gfx/entity_icons/people/person-vcard.svg", keywords: ["person", "vcard", "people"] },
      { id: "person-video", name: "Person Video", icon: "gfx/entity_icons/people/person-video.svg", keywords: ["person", "video", "people"] },
      { id: "person-video2", name: "Person Video2", icon: "gfx/entity_icons/people/person-video2.svg", keywords: ["person", "video2", "people"] },
      { id: "person-video3", name: "Person Video3", icon: "gfx/entity_icons/people/person-video3.svg", keywords: ["person", "video3", "people"] },
      { id: "person-walking", name: "Person Walking", icon: "gfx/entity_icons/people/person-walking.svg", keywords: ["person", "walking", "people"] },
      { id: "person-wheelchair", name: "Person Wheelchair", icon: "gfx/entity_icons/people/person-wheelchair.svg", keywords: ["person", "wheelchair", "people"] },
      { id: "person-workspace", name: "Person Workspace", icon: "gfx/entity_icons/people/person-workspace.svg", keywords: ["person", "workspace", "people"] },
      { id: "person-x-fill", name: "Person X Fill", icon: "gfx/entity_icons/people/person-x-fill.svg", keywords: ["person", "fill", "people"] },
      { id: "person-x", name: "Person X", icon: "gfx/entity_icons/people/person-x.svg", keywords: ["person", "people"] },
      { id: "person", name: "Person", icon: "gfx/entity_icons/people/person.svg", keywords: ["person", "people"] },
      { id: "physiotherapist", name: "Physiotherapist", icon: "gfx/entity_icons/people/physiotherapist.svg", keywords: ["physiotherapist", "people"] },
      { id: "pilot", name: "Pilot", icon: "gfx/entity_icons/people/pilot.png", keywords: ["pilot", "people"] },
      { id: "police-jp", name: "Police Jp", icon: "gfx/entity_icons/people/police-JP.svg", keywords: ["police", "jp", "people"] },
      { id: "police", name: "Police", icon: "gfx/entity_icons/people/police.png", keywords: ["police", "people"] },
      { id: "police", name: "Police", icon: "gfx/entity_icons/people/police.svg", keywords: ["police", "people"] },
      { id: "policeman", name: "Policeman", icon: "gfx/entity_icons/people/policeman.png", keywords: ["policeman", "people"] },
      { id: "priest", name: "Priest", icon: "gfx/entity_icons/people/priest.png", keywords: ["priest", "people"] },
      { id: "profession", name: "Profession", icon: "gfx/entity_icons/people/profession.png", keywords: ["profession", "people"] },
      { id: "racer", name: "Racer", icon: "gfx/entity_icons/people/racer.png", keywords: ["racer", "people"] },
      { id: "replace-user", name: "Replace User", icon: "gfx/entity_icons/people/replace-user.svg", keywords: ["replace", "user", "people"] },
      { id: "robot-face", name: "Robot Face", icon: "gfx/entity_icons/people/robot-face.svg", keywords: ["robot", "face", "people"] },
      { id: "secretservice", name: "Secretservice", icon: "gfx/entity_icons/people/secretservice.png", keywords: ["secretservice", "people"] },
      { id: "soldier", name: "Soldier", icon: "gfx/entity_icons/people/soldier.png", keywords: ["soldier", "people"] },
      { id: "spy-off", name: "Spy Off", icon: "gfx/entity_icons/people/spy-off.svg", keywords: ["spy", "off", "people"] },
      { id: "spy", name: "Spy", icon: "gfx/entity_icons/people/spy.png", keywords: ["spy", "people"] },
      { id: "spy", name: "Spy", icon: "gfx/entity_icons/people/spy.svg", keywords: ["spy", "people"] },
      { id: "stewardess", name: "Stewardess", icon: "gfx/entity_icons/people/stewardess.png", keywords: ["stewardess", "people"] },
      { id: "surgeon", name: "Surgeon", icon: "gfx/entity_icons/people/surgeon.png", keywords: ["surgeon", "people"] },
      { id: "teacher", name: "Teacher", icon: "gfx/entity_icons/people/teacher.png", keywords: ["teacher", "people"] },
      { id: "telemarketer", name: "Telemarketer", icon: "gfx/entity_icons/people/telemarketer.png", keywords: ["telemarketer", "people"] },
      { id: "unisex", name: "Unisex", icon: "gfx/entity_icons/people/unisex.svg", keywords: ["unisex", "people"] },
      { id: "user-bolt", name: "User Bolt", icon: "gfx/entity_icons/people/user-bolt.svg", keywords: ["user", "bolt", "people"] },
      { id: "user-cancel", name: "User Cancel", icon: "gfx/entity_icons/people/user-cancel.svg", keywords: ["user", "cancel", "people"] },
      { id: "user-check", name: "User Check", icon: "gfx/entity_icons/people/user-check.svg", keywords: ["user", "check", "people"] },
      { id: "user-circle", name: "User Circle", icon: "gfx/entity_icons/people/user-circle.svg", keywords: ["user", "circle", "people"] },
      { id: "user-code", name: "User Code", icon: "gfx/entity_icons/people/user-code.svg", keywords: ["user", "code", "people"] },
      { id: "user-cog", name: "User Cog", icon: "gfx/entity_icons/people/user-cog.svg", keywords: ["user", "cog", "people"] },
      { id: "user-down", name: "User Down", icon: "gfx/entity_icons/people/user-down.svg", keywords: ["user", "down", "people"] },
      { id: "user-edit", name: "User Edit", icon: "gfx/entity_icons/people/user-edit.svg", keywords: ["user", "edit", "people"] },
      { id: "user-exclamation", name: "User Exclamation", icon: "gfx/entity_icons/people/user-exclamation.svg", keywords: ["user", "exclamation", "people"] },
      { id: "user-heart", name: "User Heart", icon: "gfx/entity_icons/people/user-heart.svg", keywords: ["user", "heart", "people"] },
      { id: "user-hexagon", name: "User Hexagon", icon: "gfx/entity_icons/people/user-hexagon.svg", keywords: ["user", "hexagon", "people"] },
      { id: "user-minus", name: "User Minus", icon: "gfx/entity_icons/people/user-minus.svg", keywords: ["user", "minus", "people"] },
      { id: "user-off", name: "User Off", icon: "gfx/entity_icons/people/user-off.svg", keywords: ["user", "off", "people"] },
      { id: "user-pause", name: "User Pause", icon: "gfx/entity_icons/people/user-pause.svg", keywords: ["user", "pause", "people"] },
      { id: "user-pentagon", name: "User Pentagon", icon: "gfx/entity_icons/people/user-pentagon.svg", keywords: ["user", "pentagon", "people"] },
      { id: "user-pin", name: "User Pin", icon: "gfx/entity_icons/people/user-pin.svg", keywords: ["user", "pin", "people"] },
      { id: "user-plus", name: "User Plus", icon: "gfx/entity_icons/people/user-plus.svg", keywords: ["user", "plus", "people"] },
      { id: "user-question", name: "User Question", icon: "gfx/entity_icons/people/user-question.svg", keywords: ["user", "question", "people"] },
      { id: "user-scan", name: "User Scan", icon: "gfx/entity_icons/people/user-scan.svg", keywords: ["user", "scan", "people"] },
      { id: "user-screen", name: "User Screen", icon: "gfx/entity_icons/people/user-screen.svg", keywords: ["user", "screen", "people"] },
      { id: "user-search", name: "User Search", icon: "gfx/entity_icons/people/user-search.svg", keywords: ["user", "search", "people"] },
      { id: "user-share", name: "User Share", icon: "gfx/entity_icons/people/user-share.svg", keywords: ["user", "share", "people"] },
      { id: "user-square-rounded", name: "User Square Rounded", icon: "gfx/entity_icons/people/user-square-rounded.svg", keywords: ["user", "square", "rounded", "people"] },
      { id: "user-square", name: "User Square", icon: "gfx/entity_icons/people/user-square.svg", keywords: ["user", "square", "people"] },
      { id: "user-star", name: "User Star", icon: "gfx/entity_icons/people/user-star.svg", keywords: ["user", "star", "people"] },
      { id: "user-up", name: "User Up", icon: "gfx/entity_icons/people/user-up.svg", keywords: ["user", "up", "people"] },
      { id: "user-x", name: "User X", icon: "gfx/entity_icons/people/user-x.svg", keywords: ["user", "people"] },
      { id: "user", name: "User", icon: "gfx/entity_icons/people/user.svg", keywords: ["user", "people"] },
      { id: "users-group", name: "Users Group", icon: "gfx/entity_icons/people/users-group.svg", keywords: ["users", "group", "people"] },
      { id: "users-minus", name: "Users Minus", icon: "gfx/entity_icons/people/users-minus.svg", keywords: ["users", "minus", "people"] },
      { id: "users-plus", name: "Users Plus", icon: "gfx/entity_icons/people/users-plus.svg", keywords: ["users", "plus", "people"] },
      { id: "users", name: "Users", icon: "gfx/entity_icons/people/users.svg", keywords: ["users", "people"] },
      { id: "veterinary-care", name: "Veterinary Care", icon: "gfx/entity_icons/people/veterinary-care.svg", keywords: ["veterinary", "care", "people"] },
      { id: "veterinary", name: "Veterinary", icon: "gfx/entity_icons/people/veterinary.svg", keywords: ["veterinary", "people"] },
      { id: "waiter", name: "Waiter", icon: "gfx/entity_icons/people/waiter.png", keywords: ["waiter", "people"] },
      { id: "waitress", name: "Waitress", icon: "gfx/entity_icons/people/waitress.png", keywords: ["waitress", "people"] },
      { id: "woman", name: "Woman", icon: "gfx/entity_icons/people/woman.png", keywords: ["woman", "people"] },
      { id: "woman", name: "Woman", icon: "gfx/entity_icons/people/woman.svg", keywords: ["woman", "people"] },
      { id: "worker", name: "Worker", icon: "gfx/entity_icons/people/worker.png", keywords: ["worker", "people"] }
    ]
  },
  buildings: {
    name: "Buildings",
    color: "#64748b",
    defaultIcon: "gfx/entity_icons/buildings/building.svg",
    icons: [
      { id: "amusement-park", name: "Amusement Park", icon: "gfx/entity_icons/buildings/amusement-park.svg", keywords: ["amusement", "park", "buildings"] },
      { id: "animal-shelter", name: "Animal Shelter", icon: "gfx/entity_icons/buildings/animal-shelter.svg", keywords: ["animal", "shelter", "buildings"] },
      { id: "aquarium", name: "Aquarium", icon: "gfx/entity_icons/buildings/aquarium.svg", keywords: ["aquarium", "buildings"] },
      { id: "blood-bank", name: "Blood Bank", icon: "gfx/entity_icons/buildings/blood-bank.svg", keywords: ["blood", "bank", "buildings"] },
      { id: "bowling-alley", name: "Bowling Alley", icon: "gfx/entity_icons/buildings/bowling-alley.svg", keywords: ["bowling", "alley", "buildings"] },
      { id: "brand-google-home", name: "Brand Google Home", icon: "gfx/entity_icons/buildings/brand-google-home.svg", keywords: ["brand", "google", "home", "buildings"] },
      { id: "bridge", name: "Bridge", icon: "gfx/entity_icons/buildings/bridge.svg", keywords: ["bridge", "buildings"] },
      { id: "building-add", name: "Building Add", icon: "gfx/entity_icons/buildings/building-add.svg", keywords: ["building", "add", "buildings"] },
      { id: "building-alt1", name: "Building Alt1", icon: "gfx/entity_icons/buildings/building-alt1.svg", keywords: ["building", "alt1", "buildings"] },
      { id: "building-arch", name: "Building Arch", icon: "gfx/entity_icons/buildings/building-arch.svg", keywords: ["building", "arch", "buildings"] },
      { id: "building-bank", name: "Building Bank", icon: "gfx/entity_icons/buildings/building-bank.svg", keywords: ["building", "bank", "buildings"] },
      { id: "building-bridge-2", name: "Building Bridge 2", icon: "gfx/entity_icons/buildings/building-bridge-2.svg", keywords: ["building", "bridge", "buildings"] },
      { id: "building-bridge", name: "Building Bridge", icon: "gfx/entity_icons/buildings/building-bridge.svg", keywords: ["building", "bridge", "buildings"] },
      { id: "building-burj-al-arab", name: "Building Burj Al Arab", icon: "gfx/entity_icons/buildings/building-burj-al-arab.svg", keywords: ["building", "burj", "al", "arab", "buildings"] },
      { id: "building-carousel", name: "Building Carousel", icon: "gfx/entity_icons/buildings/building-carousel.svg", keywords: ["building", "carousel", "buildings"] },
      { id: "building-castle", name: "Building Castle", icon: "gfx/entity_icons/buildings/building-castle.svg", keywords: ["building", "castle", "buildings"] },
      { id: "building-check", name: "Building Check", icon: "gfx/entity_icons/buildings/building-check.svg", keywords: ["building", "check", "buildings"] },
      { id: "building-church", name: "Building Church", icon: "gfx/entity_icons/buildings/building-church.svg", keywords: ["building", "church", "buildings"] },
      { id: "building-circus", name: "Building Circus", icon: "gfx/entity_icons/buildings/building-circus.svg", keywords: ["building", "circus", "buildings"] },
      { id: "building-cog", name: "Building Cog", icon: "gfx/entity_icons/buildings/building-cog.svg", keywords: ["building", "cog", "buildings"] },
      { id: "building-community", name: "Building Community", icon: "gfx/entity_icons/buildings/building-community.svg", keywords: ["building", "community", "buildings"] },
      { id: "building-cottage", name: "Building Cottage", icon: "gfx/entity_icons/buildings/building-cottage.svg", keywords: ["building", "cottage", "buildings"] },
      { id: "building-dash", name: "Building Dash", icon: "gfx/entity_icons/buildings/building-dash.svg", keywords: ["building", "dash", "buildings"] },
      { id: "building-down", name: "Building Down", icon: "gfx/entity_icons/buildings/building-down.svg", keywords: ["building", "down", "buildings"] },
      { id: "building-estate", name: "Building Estate", icon: "gfx/entity_icons/buildings/building-estate.svg", keywords: ["building", "estate", "buildings"] },
      { id: "building-exclamation", name: "Building Exclamation", icon: "gfx/entity_icons/buildings/building-exclamation.svg", keywords: ["building", "exclamation", "buildings"] },
      { id: "building-factory-2", name: "Building Factory 2", icon: "gfx/entity_icons/buildings/building-factory-2.svg", keywords: ["building", "factory", "buildings"] },
      { id: "building-factory", name: "Building Factory", icon: "gfx/entity_icons/buildings/building-factory.svg", keywords: ["building", "factory", "buildings"] },
      { id: "building-fill-add", name: "Building Fill Add", icon: "gfx/entity_icons/buildings/building-fill-add.svg", keywords: ["building", "fill", "add", "buildings"] },
      { id: "building-fill-check", name: "Building Fill Check", icon: "gfx/entity_icons/buildings/building-fill-check.svg", keywords: ["building", "fill", "check", "buildings"] },
      { id: "building-fill-dash", name: "Building Fill Dash", icon: "gfx/entity_icons/buildings/building-fill-dash.svg", keywords: ["building", "fill", "dash", "buildings"] },
      { id: "building-fill-down", name: "Building Fill Down", icon: "gfx/entity_icons/buildings/building-fill-down.svg", keywords: ["building", "fill", "down", "buildings"] },
      { id: "building-fill-exclamation", name: "Building Fill Exclamation", icon: "gfx/entity_icons/buildings/building-fill-exclamation.svg", keywords: ["building", "fill", "exclamation", "buildings"] },
      { id: "building-fill-gear", name: "Building Fill Gear", icon: "gfx/entity_icons/buildings/building-fill-gear.svg", keywords: ["building", "fill", "gear", "buildings"] },
      { id: "building-fill-lock", name: "Building Fill Lock", icon: "gfx/entity_icons/buildings/building-fill-lock.svg", keywords: ["building", "fill", "lock", "buildings"] },
      { id: "building-fill-slash", name: "Building Fill Slash", icon: "gfx/entity_icons/buildings/building-fill-slash.svg", keywords: ["building", "fill", "slash", "buildings"] },
      { id: "building-fill-up", name: "Building Fill Up", icon: "gfx/entity_icons/buildings/building-fill-up.svg", keywords: ["building", "fill", "up", "buildings"] },
      { id: "building-fill-x", name: "Building Fill X", icon: "gfx/entity_icons/buildings/building-fill-x.svg", keywords: ["building", "fill", "buildings"] },
      { id: "building-fill", name: "Building Fill", icon: "gfx/entity_icons/buildings/building-fill.svg", keywords: ["building", "fill", "buildings"] },
      { id: "building-fortress", name: "Building Fortress", icon: "gfx/entity_icons/buildings/building-fortress.svg", keywords: ["building", "fortress", "buildings"] },
      { id: "building-gear", name: "Building Gear", icon: "gfx/entity_icons/buildings/building-gear.svg", keywords: ["building", "gear", "buildings"] },
      { id: "building-hospital", name: "Building Hospital", icon: "gfx/entity_icons/buildings/building-hospital.svg", keywords: ["building", "hospital", "buildings"] },
      { id: "building-lighthouse", name: "Building Lighthouse", icon: "gfx/entity_icons/buildings/building-lighthouse.svg", keywords: ["building", "lighthouse", "buildings"] },
      { id: "building-lock", name: "Building Lock", icon: "gfx/entity_icons/buildings/building-lock.svg", keywords: ["building", "lock", "buildings"] },
      { id: "building-minus", name: "Building Minus", icon: "gfx/entity_icons/buildings/building-minus.svg", keywords: ["building", "minus", "buildings"] },
      { id: "building-monument", name: "Building Monument", icon: "gfx/entity_icons/buildings/building-monument.svg", keywords: ["building", "monument", "buildings"] },
      { id: "building-mosque", name: "Building Mosque", icon: "gfx/entity_icons/buildings/building-mosque.svg", keywords: ["building", "mosque", "buildings"] },
      { id: "building-off", name: "Building Off", icon: "gfx/entity_icons/buildings/building-off.svg", keywords: ["building", "off", "buildings"] },
      { id: "building-pavilion", name: "Building Pavilion", icon: "gfx/entity_icons/buildings/building-pavilion.svg", keywords: ["building", "pavilion", "buildings"] },
      { id: "building-plus", name: "Building Plus", icon: "gfx/entity_icons/buildings/building-plus.svg", keywords: ["building", "plus", "buildings"] },
      { id: "building-skyscraper", name: "Building Skyscraper", icon: "gfx/entity_icons/buildings/building-skyscraper.svg", keywords: ["building", "skyscraper", "buildings"] },
      { id: "building-slash", name: "Building Slash", icon: "gfx/entity_icons/buildings/building-slash.svg", keywords: ["building", "slash", "buildings"] },
      { id: "building-stadium", name: "Building Stadium", icon: "gfx/entity_icons/buildings/building-stadium.svg", keywords: ["building", "stadium", "buildings"] },
      { id: "building-store", name: "Building Store", icon: "gfx/entity_icons/buildings/building-store.svg", keywords: ["building", "store", "buildings"] },
      { id: "building-tunnel", name: "Building Tunnel", icon: "gfx/entity_icons/buildings/building-tunnel.svg", keywords: ["building", "tunnel", "buildings"] },
      { id: "building-up", name: "Building Up", icon: "gfx/entity_icons/buildings/building-up.svg", keywords: ["building", "up", "buildings"] },
      { id: "building-warehouse", name: "Building Warehouse", icon: "gfx/entity_icons/buildings/building-warehouse.svg", keywords: ["building", "warehouse", "buildings"] },
      { id: "building-wind-turbine", name: "Building Wind Turbine", icon: "gfx/entity_icons/buildings/building-wind-turbine.svg", keywords: ["building", "wind", "turbine", "buildings"] },
      { id: "building-x", name: "Building X", icon: "gfx/entity_icons/buildings/building-x.svg", keywords: ["building", "buildings"] },
      { id: "building", name: "Building", icon: "gfx/entity_icons/buildings/building.svg", keywords: ["building", "buildings"] },
      { id: "buildings-fill", name: "Buildings Fill", icon: "gfx/entity_icons/buildings/buildings-fill.svg", keywords: ["buildings", "fill"] },
      { id: "buildings", name: "Buildings", icon: "gfx/entity_icons/buildings/buildings.svg", keywords: ["buildings"] },
      { id: "campground", name: "Campground", icon: "gfx/entity_icons/buildings/campground.svg", keywords: ["campground", "buildings"] },
      { id: "campsite", name: "Campsite", icon: "gfx/entity_icons/buildings/campsite.svg", keywords: ["campsite", "buildings"] },
      { id: "castle-jp", name: "Castle Jp", icon: "gfx/entity_icons/buildings/castle-JP.svg", keywords: ["castle", "jp", "buildings"] },
      { id: "castle", name: "Castle", icon: "gfx/entity_icons/buildings/castle.svg", keywords: ["castle", "buildings"] },
      { id: "cemetery-jp", name: "Cemetery Jp", icon: "gfx/entity_icons/buildings/cemetery-JP.svg", keywords: ["cemetery", "jp", "buildings"] },
      { id: "cemetery", name: "Cemetery", icon: "gfx/entity_icons/buildings/cemetery.svg", keywords: ["cemetery", "buildings"] },
      { id: "chart-column", name: "Chart Column", icon: "gfx/entity_icons/buildings/chart-column.svg", keywords: ["chart", "column", "buildings"] },
      { id: "chat", name: "Chat", icon: "gfx/entity_icons/buildings/chat.png", keywords: ["chat", "buildings"] },
      { id: "chimney", name: "Chimney", icon: "gfx/entity_icons/buildings/chimney.png", keywords: ["chimney", "buildings"] },
      { id: "church", name: "Church", icon: "gfx/entity_icons/buildings/church.png", keywords: ["church", "buildings"] },
      { id: "church", name: "Church", icon: "gfx/entity_icons/buildings/church.svg", keywords: ["church", "buildings"] },
      { id: "cib-arch-linux", name: "Cib Arch Linux", icon: "gfx/entity_icons/buildings/cib-arch-linux.svg", keywords: ["cib", "arch", "linux", "buildings"] },
      { id: "cib-media-temple", name: "Cib Media Temple", icon: "gfx/entity_icons/buildings/cib-media-temple.svg", keywords: ["cib", "media", "temple", "buildings"] },
      { id: "cil-building", name: "Cil Building", icon: "gfx/entity_icons/buildings/cil-building.svg", keywords: ["cil", "building", "buildings"] },
      { id: "cil-elevator", name: "Cil Elevator", icon: "gfx/entity_icons/buildings/cil-elevator.svg", keywords: ["cil", "elevator", "buildings"] },
      { id: "cil-garage", name: "Cil Garage", icon: "gfx/entity_icons/buildings/cil-garage.svg", keywords: ["cil", "garage", "buildings"] },
      { id: "cil-home", name: "Cil Home", icon: "gfx/entity_icons/buildings/cil-home.svg", keywords: ["cil", "home", "buildings"] },
      { id: "cil-hospital", name: "Cil Hospital", icon: "gfx/entity_icons/buildings/cil-hospital.svg", keywords: ["cil", "hospital", "buildings"] },
      { id: "cil-house", name: "Cil House", icon: "gfx/entity_icons/buildings/cil-house.svg", keywords: ["cil", "house", "buildings"] },
      { id: "cil-library-add", name: "Cil Library Add", icon: "gfx/entity_icons/buildings/cil-library-add.svg", keywords: ["cil", "library", "add", "buildings"] },
      { id: "cil-library-building", name: "Cil Library Building", icon: "gfx/entity_icons/buildings/cil-library-building.svg", keywords: ["cil", "library", "building", "buildings"] },
      { id: "cil-library", name: "Cil Library", icon: "gfx/entity_icons/buildings/cil-library.svg", keywords: ["cil", "library", "buildings"] },
      { id: "cil-view-column", name: "Cil View Column", icon: "gfx/entity_icons/buildings/cil-view-column.svg", keywords: ["cil", "view", "column", "buildings"] },
      { id: "cinema", name: "Cinema", icon: "gfx/entity_icons/buildings/cinema.svg", keywords: ["cinema", "buildings"] },
      { id: "city-hall", name: "City Hall", icon: "gfx/entity_icons/buildings/city-hall.svg", keywords: ["city", "hall", "buildings"] },
      { id: "city", name: "City", icon: "gfx/entity_icons/buildings/city.svg", keywords: ["city", "buildings"] },
      { id: "coins", name: "Coins", icon: "gfx/entity_icons/buildings/coins.png", keywords: ["coins", "buildings"] },
      { id: "college-jp", name: "College Jp", icon: "gfx/entity_icons/buildings/college-JP.svg", keywords: ["college", "jp", "buildings"] },
      { id: "college", name: "College", icon: "gfx/entity_icons/buildings/college.svg", keywords: ["college", "buildings"] },
      { id: "column-insert-left", name: "Column Insert Left", icon: "gfx/entity_icons/buildings/column-insert-left.svg", keywords: ["column", "insert", "left", "buildings"] },
      { id: "column-insert-right", name: "Column Insert Right", icon: "gfx/entity_icons/buildings/column-insert-right.svg", keywords: ["column", "insert", "right", "buildings"] },
      { id: "column-remove", name: "Column Remove", icon: "gfx/entity_icons/buildings/column-remove.svg", keywords: ["column", "remove", "buildings"] },
      { id: "commercial", name: "Commercial", icon: "gfx/entity_icons/buildings/commercial.svg", keywords: ["commercial", "buildings"] },
      { id: "construction", name: "Construction", icon: "gfx/entity_icons/buildings/construction.svg", keywords: ["construction", "buildings"] },
      { id: "courthouse", name: "Courthouse", icon: "gfx/entity_icons/buildings/courthouse.svg", keywords: ["courthouse", "buildings"] },
      { id: "dam", name: "Dam", icon: "gfx/entity_icons/buildings/dam.svg", keywords: ["dam", "buildings"] },
      { id: "defibrillator", name: "Defibrillator", icon: "gfx/entity_icons/buildings/defibrillator.svg", keywords: ["defibrillator", "buildings"] },
      { id: "deliverytruck", name: "Deliverytruck", icon: "gfx/entity_icons/buildings/deliverytruck.png", keywords: ["deliverytruck", "buildings"] },
      { id: "designtools", name: "Designtools", icon: "gfx/entity_icons/buildings/designtools.png", keywords: ["designtools", "buildings"] },
      { id: "dog-park", name: "Dog Park", icon: "gfx/entity_icons/buildings/dog-park.svg", keywords: ["dog", "park", "buildings"] },
      { id: "drinking-water", name: "Drinking Water", icon: "gfx/entity_icons/buildings/drinking-water.svg", keywords: ["drinking", "water", "buildings"] },
      { id: "elevator-off", name: "Elevator Off", icon: "gfx/entity_icons/buildings/elevator-off.svg", keywords: ["elevator", "off", "buildings"] },
      { id: "elevator", name: "Elevator", icon: "gfx/entity_icons/buildings/elevator.svg", keywords: ["elevator", "buildings"] },
      { id: "embassy", name: "Embassy", icon: "gfx/entity_icons/buildings/embassy.svg", keywords: ["embassy", "buildings"] },
      { id: "entrance-alt1", name: "Entrance Alt1", icon: "gfx/entity_icons/buildings/entrance-alt1.svg", keywords: ["entrance", "alt1", "buildings"] },
      { id: "entrance", name: "Entrance", icon: "gfx/entity_icons/buildings/entrance.svg", keywords: ["entrance", "buildings"] },
      { id: "escalator-down", name: "Escalator Down", icon: "gfx/entity_icons/buildings/escalator-down.svg", keywords: ["escalator", "down", "buildings"] },
      { id: "escalator-up", name: "Escalator Up", icon: "gfx/entity_icons/buildings/escalator-up.svg", keywords: ["escalator", "up", "buildings"] },
      { id: "escalator", name: "Escalator", icon: "gfx/entity_icons/buildings/escalator.svg", keywords: ["escalator", "buildings"] },
      { id: "factory", name: "Factory", icon: "gfx/entity_icons/buildings/factory.png", keywords: ["factory", "buildings"] },
      { id: "farm", name: "Farm", icon: "gfx/entity_icons/buildings/farm.svg", keywords: ["farm", "buildings"] },
      { id: "fence-off", name: "Fence Off", icon: "gfx/entity_icons/buildings/fence-off.svg", keywords: ["fence", "off", "buildings"] },
      { id: "fence", name: "Fence", icon: "gfx/entity_icons/buildings/fence.svg", keywords: ["fence", "buildings"] },
      { id: "fire-station-jp", name: "Fire Station Jp", icon: "gfx/entity_icons/buildings/fire-station-JP.svg", keywords: ["fire", "station", "jp", "buildings"] },
      { id: "fire-station", name: "Fire Station", icon: "gfx/entity_icons/buildings/fire-station.svg", keywords: ["fire", "station", "buildings"] },
      { id: "forrent", name: "Forrent", icon: "gfx/entity_icons/buildings/forrent.png", keywords: ["forrent", "buildings"] },
      { id: "forsale", name: "Forsale", icon: "gfx/entity_icons/buildings/forsale.png", keywords: ["forsale", "buildings"] },
      { id: "freeze-column", name: "Freeze Column", icon: "gfx/entity_icons/buildings/freeze-column.svg", keywords: ["freeze", "column", "buildings"] },
      { id: "freeze-row-column", name: "Freeze Row Column", icon: "gfx/entity_icons/buildings/freeze-row-column.svg", keywords: ["freeze", "row", "column", "buildings"] },
      { id: "garage", name: "Garage", icon: "gfx/entity_icons/buildings/garage.png", keywords: ["garage", "buildings"] },
      { id: "garden-centre", name: "Garden Centre", icon: "gfx/entity_icons/buildings/garden-centre.svg", keywords: ["garden", "centre", "buildings"] },
      { id: "garden", name: "Garden", icon: "gfx/entity_icons/buildings/garden.svg", keywords: ["garden", "buildings"] },
      { id: "gate", name: "Gate", icon: "gfx/entity_icons/buildings/gate.svg", keywords: ["gate", "buildings"] },
      { id: "gps", name: "Gps", icon: "gfx/entity_icons/buildings/gps.png", keywords: ["gps", "buildings"] },
      { id: "health", name: "Health", icon: "gfx/entity_icons/buildings/health.svg", keywords: ["health", "buildings"] },
      { id: "hindu-temple", name: "Hindu Temple", icon: "gfx/entity_icons/buildings/hindu-temple.svg", keywords: ["hindu", "temple", "buildings"] },
      { id: "historic", name: "Historic", icon: "gfx/entity_icons/buildings/historic.svg", keywords: ["historic", "buildings"] },
      { id: "home-2", name: "Home 2", icon: "gfx/entity_icons/buildings/home-2.svg", keywords: ["home", "buildings"] },
      { id: "home-bolt", name: "Home Bolt", icon: "gfx/entity_icons/buildings/home-bolt.svg", keywords: ["home", "bolt", "buildings"] },
      { id: "home-cancel", name: "Home Cancel", icon: "gfx/entity_icons/buildings/home-cancel.svg", keywords: ["home", "cancel", "buildings"] },
      { id: "home-check", name: "Home Check", icon: "gfx/entity_icons/buildings/home-check.svg", keywords: ["home", "check", "buildings"] },
      { id: "home-cog", name: "Home Cog", icon: "gfx/entity_icons/buildings/home-cog.svg", keywords: ["home", "cog", "buildings"] },
      { id: "home-dot", name: "Home Dot", icon: "gfx/entity_icons/buildings/home-dot.svg", keywords: ["home", "dot", "buildings"] },
      { id: "home-down", name: "Home Down", icon: "gfx/entity_icons/buildings/home-down.svg", keywords: ["home", "down", "buildings"] },
      { id: "home-eco", name: "Home Eco", icon: "gfx/entity_icons/buildings/home-eco.svg", keywords: ["home", "eco", "buildings"] },
      { id: "home-edit", name: "Home Edit", icon: "gfx/entity_icons/buildings/home-edit.svg", keywords: ["home", "edit", "buildings"] },
      { id: "home-exclamation", name: "Home Exclamation", icon: "gfx/entity_icons/buildings/home-exclamation.svg", keywords: ["home", "exclamation", "buildings"] },
      { id: "home-hand", name: "Home Hand", icon: "gfx/entity_icons/buildings/home-hand.svg", keywords: ["home", "hand", "buildings"] },
      { id: "home-heart", name: "Home Heart", icon: "gfx/entity_icons/buildings/home-heart.svg", keywords: ["home", "heart", "buildings"] },
      { id: "home-infinity", name: "Home Infinity", icon: "gfx/entity_icons/buildings/home-infinity.svg", keywords: ["home", "infinity", "buildings"] },
      { id: "home-minus", name: "Home Minus", icon: "gfx/entity_icons/buildings/home-minus.svg", keywords: ["home", "minus", "buildings"] },
      { id: "home-move", name: "Home Move", icon: "gfx/entity_icons/buildings/home-move.svg", keywords: ["home", "move", "buildings"] },
      { id: "home-off", name: "Home Off", icon: "gfx/entity_icons/buildings/home-off.svg", keywords: ["home", "off", "buildings"] },
      { id: "home-plus", name: "Home Plus", icon: "gfx/entity_icons/buildings/home-plus.svg", keywords: ["home", "plus", "buildings"] },
      { id: "home-question", name: "Home Question", icon: "gfx/entity_icons/buildings/home-question.svg", keywords: ["home", "question", "buildings"] },
      { id: "home-ribbon", name: "Home Ribbon", icon: "gfx/entity_icons/buildings/home-ribbon.svg", keywords: ["home", "ribbon", "buildings"] },
      { id: "home-search", name: "Home Search", icon: "gfx/entity_icons/buildings/home-search.svg", keywords: ["home", "search", "buildings"] },
      { id: "home-share", name: "Home Share", icon: "gfx/entity_icons/buildings/home-share.svg", keywords: ["home", "share", "buildings"] },
      { id: "home-spark", name: "Home Spark", icon: "gfx/entity_icons/buildings/home-spark.svg", keywords: ["home", "spark", "buildings"] },
      { id: "home-star", name: "Home Star", icon: "gfx/entity_icons/buildings/home-star.svg", keywords: ["home", "star", "buildings"] },
      { id: "home-stats", name: "Home Stats", icon: "gfx/entity_icons/buildings/home-stats.svg", keywords: ["home", "stats", "buildings"] },
      { id: "home-up", name: "Home Up", icon: "gfx/entity_icons/buildings/home-up.svg", keywords: ["home", "up", "buildings"] },
      { id: "home-x", name: "Home X", icon: "gfx/entity_icons/buildings/home-x.svg", keywords: ["home", "buildings"] },
      { id: "home", name: "Home", icon: "gfx/entity_icons/buildings/home.svg", keywords: ["home", "buildings"] },
      { id: "hospital-circle", name: "Hospital Circle", icon: "gfx/entity_icons/buildings/hospital-circle.svg", keywords: ["hospital", "circle", "buildings"] },
      { id: "hospital-fill", name: "Hospital Fill", icon: "gfx/entity_icons/buildings/hospital-fill.svg", keywords: ["hospital", "fill", "buildings"] },
      { id: "hospital-jp", name: "Hospital Jp", icon: "gfx/entity_icons/buildings/hospital-JP.svg", keywords: ["hospital", "jp", "buildings"] },
      { id: "hospital", name: "Hospital", icon: "gfx/entity_icons/buildings/hospital.svg", keywords: ["hospital", "buildings"] },
      { id: "house-add-fill", name: "House Add Fill", icon: "gfx/entity_icons/buildings/house-add-fill.svg", keywords: ["house", "add", "fill", "buildings"] },
      { id: "house-add", name: "House Add", icon: "gfx/entity_icons/buildings/house-add.svg", keywords: ["house", "add", "buildings"] },
      { id: "house-check-fill", name: "House Check Fill", icon: "gfx/entity_icons/buildings/house-check-fill.svg", keywords: ["house", "check", "fill", "buildings"] },
      { id: "house-check", name: "House Check", icon: "gfx/entity_icons/buildings/house-check.svg", keywords: ["house", "check", "buildings"] },
      { id: "house-dash-fill", name: "House Dash Fill", icon: "gfx/entity_icons/buildings/house-dash-fill.svg", keywords: ["house", "dash", "fill", "buildings"] },
      { id: "house-dash", name: "House Dash", icon: "gfx/entity_icons/buildings/house-dash.svg", keywords: ["house", "dash", "buildings"] },
      { id: "house-door-fill", name: "House Door Fill", icon: "gfx/entity_icons/buildings/house-door-fill.svg", keywords: ["house", "door", "fill", "buildings"] },
      { id: "house-door", name: "House Door", icon: "gfx/entity_icons/buildings/house-door.svg", keywords: ["house", "door", "buildings"] },
      { id: "house-down-fill", name: "House Down Fill", icon: "gfx/entity_icons/buildings/house-down-fill.svg", keywords: ["house", "down", "fill", "buildings"] },
      { id: "house-down", name: "House Down", icon: "gfx/entity_icons/buildings/house-down.svg", keywords: ["house", "down", "buildings"] },
      { id: "house-exclamation-fill", name: "House Exclamation Fill", icon: "gfx/entity_icons/buildings/house-exclamation-fill.svg", keywords: ["house", "exclamation", "fill", "buildings"] },
      { id: "house-exclamation", name: "House Exclamation", icon: "gfx/entity_icons/buildings/house-exclamation.svg", keywords: ["house", "exclamation", "buildings"] },
      { id: "house-fill", name: "House Fill", icon: "gfx/entity_icons/buildings/house-fill.svg", keywords: ["house", "fill", "buildings"] },
      { id: "house-gear-fill", name: "House Gear Fill", icon: "gfx/entity_icons/buildings/house-gear-fill.svg", keywords: ["house", "gear", "fill", "buildings"] },
      { id: "house-gear", name: "House Gear", icon: "gfx/entity_icons/buildings/house-gear.svg", keywords: ["house", "gear", "buildings"] },
      { id: "house-heart-fill", name: "House Heart Fill", icon: "gfx/entity_icons/buildings/house-heart-fill.svg", keywords: ["house", "heart", "fill", "buildings"] },
      { id: "house-heart", name: "House Heart", icon: "gfx/entity_icons/buildings/house-heart.svg", keywords: ["house", "heart", "buildings"] },
      { id: "house-lock-fill", name: "House Lock Fill", icon: "gfx/entity_icons/buildings/house-lock-fill.svg", keywords: ["house", "lock", "fill", "buildings"] },
      { id: "house-lock", name: "House Lock", icon: "gfx/entity_icons/buildings/house-lock.svg", keywords: ["house", "lock", "buildings"] },
      { id: "house-slash-fill", name: "House Slash Fill", icon: "gfx/entity_icons/buildings/house-slash-fill.svg", keywords: ["house", "slash", "fill", "buildings"] },
      { id: "house-slash", name: "House Slash", icon: "gfx/entity_icons/buildings/house-slash.svg", keywords: ["house", "slash", "buildings"] },
      { id: "house-up-fill", name: "House Up Fill", icon: "gfx/entity_icons/buildings/house-up-fill.svg", keywords: ["house", "up", "fill", "buildings"] },
      { id: "house-up", name: "House Up", icon: "gfx/entity_icons/buildings/house-up.svg", keywords: ["house", "up", "buildings"] },
      { id: "house-x-fill", name: "House X Fill", icon: "gfx/entity_icons/buildings/house-x-fill.svg", keywords: ["house", "fill", "buildings"] },
      { id: "house-x", name: "House X", icon: "gfx/entity_icons/buildings/house-x.svg", keywords: ["house", "buildings"] },
      { id: "house", name: "House", icon: "gfx/entity_icons/buildings/house.png", keywords: ["house", "buildings"] },
      { id: "house", name: "House", icon: "gfx/entity_icons/buildings/house.svg", keywords: ["house", "buildings"] },
      { id: "industry", name: "Industry", icon: "gfx/entity_icons/buildings/industry.svg", keywords: ["industry", "buildings"] },
      { id: "insurance", name: "Insurance", icon: "gfx/entity_icons/buildings/insurance.png", keywords: ["insurance", "buildings"] },
      { id: "landmark-jp", name: "Landmark Jp", icon: "gfx/entity_icons/buildings/landmark-JP.svg", keywords: ["landmark", "jp", "buildings"] },
      { id: "landmark", name: "Landmark", icon: "gfx/entity_icons/buildings/landmark.svg", keywords: ["landmark", "buildings"] },
      { id: "landuse", name: "Landuse", icon: "gfx/entity_icons/buildings/landuse.svg", keywords: ["landuse", "buildings"] },
      { id: "laptop", name: "Laptop", icon: "gfx/entity_icons/buildings/laptop.png", keywords: ["laptop", "buildings"] },
      { id: "library-minus", name: "Library Minus", icon: "gfx/entity_icons/buildings/library-minus.svg", keywords: ["library", "minus", "buildings"] },
      { id: "library-photo", name: "Library Photo", icon: "gfx/entity_icons/buildings/library-photo.svg", keywords: ["library", "photo", "buildings"] },
      { id: "library-plus", name: "Library Plus", icon: "gfx/entity_icons/buildings/library-plus.svg", keywords: ["library", "plus", "buildings"] },
      { id: "library", name: "Library", icon: "gfx/entity_icons/buildings/library.svg", keywords: ["library", "buildings"] },
      { id: "lift-gate", name: "Lift Gate", icon: "gfx/entity_icons/buildings/lift-gate.svg", keywords: ["lift", "gate", "buildings"] },
      { id: "lighthouse-jp", name: "Lighthouse Jp", icon: "gfx/entity_icons/buildings/lighthouse-JP.svg", keywords: ["lighthouse", "jp", "buildings"] },
      { id: "lighthouse", name: "Lighthouse", icon: "gfx/entity_icons/buildings/lighthouse.svg", keywords: ["lighthouse", "buildings"] },
      { id: "list", name: "List", icon: "gfx/entity_icons/buildings/list.png", keywords: ["list", "buildings"] },
      { id: "local-government", name: "Local Government", icon: "gfx/entity_icons/buildings/local-government.svg", keywords: ["local", "government", "buildings"] },
      { id: "logging", name: "Logging", icon: "gfx/entity_icons/buildings/logging.svg", keywords: ["logging", "buildings"] },
      { id: "loss", name: "Loss", icon: "gfx/entity_icons/buildings/loss.png", keywords: ["loss", "buildings"] },
      { id: "mansion", name: "Mansion", icon: "gfx/entity_icons/buildings/mansion.png", keywords: ["mansion", "buildings"] },
      { id: "marae", name: "Marae", icon: "gfx/entity_icons/buildings/marae.svg", keywords: ["marae", "buildings"] },
      { id: "measuringtape", name: "Measuringtape", icon: "gfx/entity_icons/buildings/measuringtape.png", keywords: ["measuringtape", "buildings"] },
      { id: "megaphone", name: "Megaphone", icon: "gfx/entity_icons/buildings/megaphone.png", keywords: ["megaphone", "buildings"] },
      { id: "money", name: "Money", icon: "gfx/entity_icons/buildings/money.png", keywords: ["money", "buildings"] },
      { id: "moneybag", name: "Moneybag", icon: "gfx/entity_icons/buildings/moneybag.png", keywords: ["moneybag", "buildings"] },
      { id: "monitor", name: "Monitor", icon: "gfx/entity_icons/buildings/monitor.png", keywords: ["monitor", "buildings"] },
      { id: "monument-jp", name: "Monument Jp", icon: "gfx/entity_icons/buildings/monument-JP.svg", keywords: ["monument", "jp", "buildings"] },
      { id: "monument", name: "Monument", icon: "gfx/entity_icons/buildings/monument.svg", keywords: ["monument", "buildings"] },
      { id: "mortgage", name: "Mortgage", icon: "gfx/entity_icons/buildings/mortgage.png", keywords: ["mortgage", "buildings"] },
      { id: "mosque", name: "Mosque", icon: "gfx/entity_icons/buildings/mosque.svg", keywords: ["mosque", "buildings"] },
      { id: "museum", name: "Museum", icon: "gfx/entity_icons/buildings/museum.svg", keywords: ["museum", "buildings"] },
      { id: "network", name: "Network", icon: "gfx/entity_icons/buildings/network.png", keywords: ["network", "buildings"] },
      { id: "observation-tower", name: "Observation Tower", icon: "gfx/entity_icons/buildings/observation-tower.svg", keywords: ["observation", "tower", "buildings"] },
      { id: "padlock", name: "Padlock", icon: "gfx/entity_icons/buildings/padlock.png", keywords: ["padlock", "buildings"] },
      { id: "panel", name: "Panel", icon: "gfx/entity_icons/buildings/panel.png", keywords: ["panel", "buildings"] },
      { id: "park-alt1", name: "Park Alt1", icon: "gfx/entity_icons/buildings/park-alt1.svg", keywords: ["park", "alt1", "buildings"] },
      { id: "park", name: "Park", icon: "gfx/entity_icons/buildings/park.svg", keywords: ["park", "buildings"] },
      { id: "percentage", name: "Percentage", icon: "gfx/entity_icons/buildings/percentage.png", keywords: ["percentage", "buildings"] },
      { id: "phonecall", name: "Phonecall", icon: "gfx/entity_icons/buildings/phonecall.png", keywords: ["phonecall", "buildings"] },
      { id: "place-of-worship", name: "Place Of Worship", icon: "gfx/entity_icons/buildings/place-of-worship.svg", keywords: ["place", "of", "worship", "buildings"] },
      { id: "playground", name: "Playground", icon: "gfx/entity_icons/buildings/playground.svg", keywords: ["playground", "buildings"] },
      { id: "presentation", name: "Presentation", icon: "gfx/entity_icons/buildings/presentation.png", keywords: ["presentation", "buildings"] },
      { id: "prison", name: "Prison", icon: "gfx/entity_icons/buildings/prison.svg", keywords: ["prison", "buildings"] },
      { id: "property", name: "Property", icon: "gfx/entity_icons/buildings/property.png", keywords: ["property", "buildings"] },
      { id: "racetrack-horse", name: "Racetrack Horse", icon: "gfx/entity_icons/buildings/racetrack-horse.svg", keywords: ["racetrack", "horse", "buildings"] },
      { id: "racetrack", name: "Racetrack", icon: "gfx/entity_icons/buildings/racetrack.svg", keywords: ["racetrack", "buildings"] },
      { id: "ranger-station", name: "Ranger Station", icon: "gfx/entity_icons/buildings/ranger-station.svg", keywords: ["ranger", "station", "buildings"] },
      { id: "real-estate-building", name: "Real Estate Building", icon: "gfx/entity_icons/buildings/real_estate_building.png", keywords: ["real", "estate", "building", "buildings"] },
      { id: "real-estate-house", name: "Real Estate House", icon: "gfx/entity_icons/buildings/real_estate_house.png", keywords: ["real", "estate", "house", "buildings"] },
      { id: "realestate", name: "Realestate", icon: "gfx/entity_icons/buildings/realestate.png", keywords: ["realestate", "buildings"] },
      { id: "recycling", name: "Recycling", icon: "gfx/entity_icons/buildings/recycling.svg", keywords: ["recycling", "buildings"] },
      { id: "religious-buddhist", name: "Religious Buddhist", icon: "gfx/entity_icons/buildings/religious-buddhist.svg", keywords: ["religious", "buddhist", "buildings"] },
      { id: "religious-christian", name: "Religious Christian", icon: "gfx/entity_icons/buildings/religious-christian.svg", keywords: ["religious", "christian", "buildings"] },
      { id: "religious-jewish", name: "Religious Jewish", icon: "gfx/entity_icons/buildings/religious-jewish.svg", keywords: ["religious", "jewish", "buildings"] },
      { id: "religious-muslim", name: "Religious Muslim", icon: "gfx/entity_icons/buildings/religious-muslim.svg", keywords: ["religious", "muslim", "buildings"] },
      { id: "religious-shinto", name: "Religious Shinto", icon: "gfx/entity_icons/buildings/religious-shinto.svg", keywords: ["religious", "shinto", "buildings"] },
      { id: "residential-community", name: "Residential Community", icon: "gfx/entity_icons/buildings/residential-community.svg", keywords: ["residential", "community", "buildings"] },
      { id: "school-jp", name: "School Jp", icon: "gfx/entity_icons/buildings/school-JP.svg", keywords: ["school", "jp", "buildings"] },
      { id: "school", name: "School", icon: "gfx/entity_icons/buildings/school.svg", keywords: ["school", "buildings"] },
      { id: "shelter", name: "Shelter", icon: "gfx/entity_icons/buildings/shelter.svg", keywords: ["shelter", "buildings"] },
      { id: "shoppingbasket", name: "Shoppingbasket", icon: "gfx/entity_icons/buildings/shoppingbasket.png", keywords: ["shoppingbasket", "buildings"] },
      { id: "shower", name: "Shower", icon: "gfx/entity_icons/buildings/shower.png", keywords: ["shower", "buildings"] },
      { id: "slaughterhouse", name: "Slaughterhouse", icon: "gfx/entity_icons/buildings/slaughterhouse.svg", keywords: ["slaughterhouse", "buildings"] },
      { id: "smart-home-off", name: "Smart Home Off", icon: "gfx/entity_icons/buildings/smart-home-off.svg", keywords: ["smart", "home", "off", "buildings"] },
      { id: "smart-home", name: "Smart Home", icon: "gfx/entity_icons/buildings/smart-home.svg", keywords: ["smart", "home", "buildings"] },
      { id: "smartphone", name: "Smartphone", icon: "gfx/entity_icons/buildings/smartphone.png", keywords: ["smartphone", "buildings"] },
      { id: "sold", name: "Sold", icon: "gfx/entity_icons/buildings/sold.png", keywords: ["sold", "buildings"] },
      { id: "stadium", name: "Stadium", icon: "gfx/entity_icons/buildings/stadium.svg", keywords: ["stadium", "buildings"] },
      { id: "stairs-down", name: "Stairs Down", icon: "gfx/entity_icons/buildings/stairs-down.svg", keywords: ["stairs", "down", "buildings"] },
      { id: "stairs-up", name: "Stairs Up", icon: "gfx/entity_icons/buildings/stairs-up.svg", keywords: ["stairs", "up", "buildings"] },
      { id: "stairs", name: "Stairs", icon: "gfx/entity_icons/buildings/stairs.svg", keywords: ["stairs", "buildings"] },
      { id: "swimmingpool", name: "Swimmingpool", icon: "gfx/entity_icons/buildings/swimmingpool.png", keywords: ["swimmingpool", "buildings"] },
      { id: "synagogue", name: "Synagogue", icon: "gfx/entity_icons/buildings/synagogue.svg", keywords: ["synagogue", "buildings"] },
      { id: "table-column", name: "Table Column", icon: "gfx/entity_icons/buildings/table-column.svg", keywords: ["table", "column", "buildings"] },
      { id: "text-wrap-column", name: "Text Wrap Column", icon: "gfx/entity_icons/buildings/text-wrap-column.svg", keywords: ["text", "wrap", "column", "buildings"] },
      { id: "theatre", name: "Theatre", icon: "gfx/entity_icons/buildings/theatre.svg", keywords: ["theatre", "buildings"] },
      { id: "toilet", name: "Toilet", icon: "gfx/entity_icons/buildings/toilet.png", keywords: ["toilet", "buildings"] },
      { id: "toilet", name: "Toilet", icon: "gfx/entity_icons/buildings/toilet.svg", keywords: ["toilet", "buildings"] },
      { id: "tower-off", name: "Tower Off", icon: "gfx/entity_icons/buildings/tower-off.svg", keywords: ["tower", "off", "buildings"] },
      { id: "tower", name: "Tower", icon: "gfx/entity_icons/buildings/tower.svg", keywords: ["tower", "buildings"] },
      { id: "town-hall", name: "Town Hall", icon: "gfx/entity_icons/buildings/town-hall.svg", keywords: ["town", "hall", "buildings"] },
      { id: "town", name: "Town", icon: "gfx/entity_icons/buildings/town.svg", keywords: ["town", "buildings"] },
      { id: "tunnel", name: "Tunnel", icon: "gfx/entity_icons/buildings/tunnel.svg", keywords: ["tunnel", "buildings"] },
      { id: "university", name: "University", icon: "gfx/entity_icons/buildings/university.svg", keywords: ["university", "buildings"] },
      { id: "village", name: "Village", icon: "gfx/entity_icons/buildings/village.svg", keywords: ["village", "buildings"] },
      { id: "wall-off", name: "Wall Off", icon: "gfx/entity_icons/buildings/wall-off.svg", keywords: ["wall", "off", "buildings"] },
      { id: "wall", name: "Wall", icon: "gfx/entity_icons/buildings/wall.svg", keywords: ["wall", "buildings"] },
      { id: "wallet", name: "Wallet", icon: "gfx/entity_icons/buildings/wallet.png", keywords: ["wallet", "buildings"] },
      { id: "warehouse", name: "Warehouse", icon: "gfx/entity_icons/buildings/warehouse.svg", keywords: ["warehouse", "buildings"] },
      { id: "waste-basket", name: "Waste Basket", icon: "gfx/entity_icons/buildings/waste-basket.svg", keywords: ["waste", "basket", "buildings"] },
      { id: "windmill-off", name: "Windmill Off", icon: "gfx/entity_icons/buildings/windmill-off.svg", keywords: ["windmill", "off", "buildings"] },
      { id: "windmill", name: "Windmill", icon: "gfx/entity_icons/buildings/windmill.svg", keywords: ["windmill", "buildings"] },
      { id: "zoo", name: "Zoo", icon: "gfx/entity_icons/buildings/zoo.svg", keywords: ["zoo", "buildings"] }
    ]
  },
  organisation: {
    name: "Organisation",
    color: "#10b981",
    defaultIcon: "gfx/entity_icons/organisation/bakery.svg",
    icons: [
      { id: "access", name: "Access", icon: "gfx/entity_icons/organisation/access.png", keywords: ["access", "organisation"] },
      { id: "admin", name: "Admin", icon: "gfx/entity_icons/organisation/admin.png", keywords: ["admin", "organisation"] },
      { id: "appstore", name: "Appstore", icon: "gfx/entity_icons/organisation/appstore.png", keywords: ["appstore", "organisation"] },
      { id: "bakery", name: "Bakery", icon: "gfx/entity_icons/organisation/bakery.svg", keywords: ["bakery", "organisation"] },
      { id: "bing", name: "Bing", icon: "gfx/entity_icons/organisation/bing.png", keywords: ["bing", "organisation"] },
      { id: "book-store", name: "Book Store", icon: "gfx/entity_icons/organisation/book-store.svg", keywords: ["book", "store", "organisation"] },
      { id: "cafe", name: "Cafe", icon: "gfx/entity_icons/organisation/cafe.svg", keywords: ["cafe", "organisation"] },
      { id: "calendar", name: "Calendar", icon: "gfx/entity_icons/organisation/calendar.png", keywords: ["calendar", "organisation"] },
      { id: "cib-app-store-ios", name: "Cib App Store Ios", icon: "gfx/entity_icons/organisation/cib-app-store-ios.svg", keywords: ["cib", "app", "store", "ios", "organisation"] },
      { id: "cib-app-store", name: "Cib App Store", icon: "gfx/entity_icons/organisation/cib-app-store.svg", keywords: ["cib", "app", "store", "organisation"] },
      { id: "cib-buy-me-a-coffee", name: "Cib Buy Me A Coffee", icon: "gfx/entity_icons/organisation/cib-buy-me-a-coffee.svg", keywords: ["cib", "buy", "me", "coffee", "organisation"] },
      { id: "cib-event-store", name: "Cib Event Store", icon: "gfx/entity_icons/organisation/cib-event-store.svg", keywords: ["cib", "event", "store", "organisation"] },
      { id: "cil-coffee", name: "Cil Coffee", icon: "gfx/entity_icons/organisation/cil-coffee.svg", keywords: ["cil", "coffee", "organisation"] },
      { id: "cil-restaurant", name: "Cil Restaurant", icon: "gfx/entity_icons/organisation/cil-restaurant.svg", keywords: ["cil", "restaurant", "organisation"] },
      { id: "cil-spa", name: "Cil Spa", icon: "gfx/entity_icons/organisation/cil-spa.svg", keywords: ["cil", "spa", "organisation"] },
      { id: "clothing-store", name: "Clothing Store", icon: "gfx/entity_icons/organisation/clothing-store.svg", keywords: ["clothing", "store", "organisation"] },
      { id: "coffee-off", name: "Coffee Off", icon: "gfx/entity_icons/organisation/coffee-off.svg", keywords: ["coffee", "off", "organisation"] },
      { id: "coffee", name: "Coffee", icon: "gfx/entity_icons/organisation/coffee.svg", keywords: ["coffee", "organisation"] },
      { id: "confectionery", name: "Confectionery", icon: "gfx/entity_icons/organisation/confectionery.svg", keywords: ["confectionery", "organisation"] },
      { id: "convenience-store", name: "Convenience Store", icon: "gfx/entity_icons/organisation/convenience-store.svg", keywords: ["convenience", "store", "organisation"] },
      { id: "convenience", name: "Convenience", icon: "gfx/entity_icons/organisation/convenience.svg", keywords: ["convenience", "organisation"] },
      { id: "crm", name: "Crm", icon: "gfx/entity_icons/organisation/crm.png", keywords: ["crm", "organisation"] },
      { id: "delve", name: "Delve", icon: "gfx/entity_icons/organisation/delve.png", keywords: ["delve", "organisation"] },
      { id: "department-store", name: "Department Store", icon: "gfx/entity_icons/organisation/department-store.svg", keywords: ["department", "store", "organisation"] },
      { id: "edge", name: "Edge", icon: "gfx/entity_icons/organisation/edge.png", keywords: ["edge", "organisation"] },
      { id: "electrician", name: "Electrician", icon: "gfx/entity_icons/organisation/electrician.svg", keywords: ["electrician", "organisation"] },
      { id: "electronics-store", name: "Electronics Store", icon: "gfx/entity_icons/organisation/electronics-store.svg", keywords: ["electronics", "store", "organisation"] },
      { id: "excel", name: "Excel", icon: "gfx/entity_icons/organisation/excel.png", keywords: ["excel", "organisation"] },
      { id: "fast-food", name: "Fast Food", icon: "gfx/entity_icons/organisation/fast-food.svg", keywords: ["fast", "food", "organisation"] },
      { id: "florist", name: "Florist", icon: "gfx/entity_icons/organisation/florist.svg", keywords: ["florist", "organisation"] },
      { id: "food", name: "Food", icon: "gfx/entity_icons/organisation/food.svg", keywords: ["food", "organisation"] },
      { id: "funeral-home", name: "Funeral Home", icon: "gfx/entity_icons/organisation/funeral-home.svg", keywords: ["funeral", "home", "organisation"] },
      { id: "furniture-store", name: "Furniture Store", icon: "gfx/entity_icons/organisation/furniture-store.svg", keywords: ["furniture", "store", "organisation"] },
      { id: "furniture", name: "Furniture", icon: "gfx/entity_icons/organisation/furniture.svg", keywords: ["furniture", "organisation"] },
      { id: "general-contractor", name: "General Contractor", icon: "gfx/entity_icons/organisation/general-contractor.svg", keywords: ["general", "contractor", "organisation"] },
      { id: "grocery-or-supermarket", name: "Grocery Or Supermarket", icon: "gfx/entity_icons/organisation/grocery-or-supermarket.svg", keywords: ["grocery", "or", "supermarket", "organisation"] },
      { id: "grocery", name: "Grocery", icon: "gfx/entity_icons/organisation/grocery.svg", keywords: ["grocery", "organisation"] },
      { id: "groovemusic", name: "Groovemusic", icon: "gfx/entity_icons/organisation/groovemusic.png", keywords: ["groovemusic", "organisation"] },
      { id: "hardware-store", name: "Hardware Store", icon: "gfx/entity_icons/organisation/hardware-store.svg", keywords: ["hardware", "store", "organisation"] },
      { id: "hardware", name: "Hardware", icon: "gfx/entity_icons/organisation/hardware.svg", keywords: ["hardware", "organisation"] },
      { id: "ice-cream", name: "Ice Cream", icon: "gfx/entity_icons/organisation/ice-cream.svg", keywords: ["ice", "cream", "organisation"] },
      { id: "infopath", name: "Infopath", icon: "gfx/entity_icons/organisation/infopath.png", keywords: ["infopath", "organisation"] },
      { id: "laundry", name: "Laundry", icon: "gfx/entity_icons/organisation/laundry.svg", keywords: ["laundry", "organisation"] },
      { id: "layers-union", name: "Layers Union", icon: "gfx/entity_icons/organisation/layers-union.svg", keywords: ["layers", "union", "organisation"] },
      { id: "liquor-store", name: "Liquor Store", icon: "gfx/entity_icons/organisation/liquor-store.svg", keywords: ["liquor", "store", "organisation"] },
      { id: "lodging", name: "Lodging", icon: "gfx/entity_icons/organisation/lodging.svg", keywords: ["lodging", "organisation"] },
      { id: "lync", name: "Lync", icon: "gfx/entity_icons/organisation/lync.png", keywords: ["lync", "organisation"] },
      { id: "microsoft", name: "Microsoft", icon: "gfx/entity_icons/organisation/microsoft.png", keywords: ["microsoft", "organisation"] },
      { id: "movie-rental", name: "Movie Rental", icon: "gfx/entity_icons/organisation/movie-rental.svg", keywords: ["movie", "rental", "organisation"] },
      { id: "moviestv", name: "Moviestv", icon: "gfx/entity_icons/organisation/moviestv.png", keywords: ["moviestv", "organisation"] },
      { id: "msn", name: "Msn", icon: "gfx/entity_icons/organisation/msn.png", keywords: ["msn", "organisation"] },
      { id: "mustwatch", name: "Mustwatch", icon: "gfx/entity_icons/organisation/mustwatch.png", keywords: ["mustwatch", "organisation"] },
      { id: "newsfeed", name: "Newsfeed", icon: "gfx/entity_icons/organisation/newsfeed.png", keywords: ["newsfeed", "organisation"] },
      { id: "notebook", name: "Notebook", icon: "gfx/entity_icons/organisation/notebook.png", keywords: ["notebook", "organisation"] },
      { id: "officeapplication", name: "Officeapplication", icon: "gfx/entity_icons/organisation/officeapplication.png", keywords: ["officeapplication", "organisation"] },
      { id: "officestore", name: "Officestore", icon: "gfx/entity_icons/organisation/officestore.png", keywords: ["officestore", "organisation"] },
      { id: "onedrive", name: "Onedrive", icon: "gfx/entity_icons/organisation/onedrive.png", keywords: ["onedrive", "organisation"] },
      { id: "onenote", name: "Onenote", icon: "gfx/entity_icons/organisation/onenote.png", keywords: ["onenote", "organisation"] },
      { id: "optician", name: "Optician", icon: "gfx/entity_icons/organisation/optician.svg", keywords: ["optician", "organisation"] },
      { id: "outlook", name: "Outlook", icon: "gfx/entity_icons/organisation/outlook.png", keywords: ["outlook", "organisation"] },
      { id: "painter", name: "Painter", icon: "gfx/entity_icons/organisation/painter.svg", keywords: ["painter", "organisation"] },
      { id: "people", name: "People", icon: "gfx/entity_icons/organisation/people.png", keywords: ["people", "organisation"] },
      { id: "pet-store", name: "Pet Store", icon: "gfx/entity_icons/organisation/pet-store.svg", keywords: ["pet", "store", "organisation"] },
      { id: "pharmacy", name: "Pharmacy", icon: "gfx/entity_icons/organisation/pharmacy.svg", keywords: ["pharmacy", "organisation"] },
      { id: "planner", name: "Planner", icon: "gfx/entity_icons/organisation/planner.png", keywords: ["planner", "organisation"] },
      { id: "plumber", name: "Plumber", icon: "gfx/entity_icons/organisation/plumber.svg", keywords: ["plumber", "organisation"] },
      { id: "power", name: "Power", icon: "gfx/entity_icons/organisation/power.png", keywords: ["power", "organisation"] },
      { id: "powerbl", name: "Powerbl", icon: "gfx/entity_icons/organisation/powerbl.png", keywords: ["powerbl", "organisation"] },
      { id: "powerpoint", name: "Powerpoint", icon: "gfx/entity_icons/organisation/powerpoint.png", keywords: ["powerpoint", "organisation"] },
      { id: "project", name: "Project", icon: "gfx/entity_icons/organisation/project.png", keywords: ["project", "organisation"] },
      { id: "publisher", name: "Publisher", icon: "gfx/entity_icons/organisation/publisher.png", keywords: ["publisher", "organisation"] },
      { id: "real-estate-agency", name: "Real Estate Agency", icon: "gfx/entity_icons/organisation/real-estate-agency.svg", keywords: ["real", "estate", "agency", "organisation"] },
      { id: "restaurant-bbq", name: "Restaurant Bbq", icon: "gfx/entity_icons/organisation/restaurant-bbq.svg", keywords: ["restaurant", "bbq", "organisation"] },
      { id: "restaurant-noodle", name: "Restaurant Noodle", icon: "gfx/entity_icons/organisation/restaurant-noodle.svg", keywords: ["restaurant", "noodle", "organisation"] },
      { id: "restaurant-pizza", name: "Restaurant Pizza", icon: "gfx/entity_icons/organisation/restaurant-pizza.svg", keywords: ["restaurant", "pizza", "organisation"] },
      { id: "restaurant-seafood", name: "Restaurant Seafood", icon: "gfx/entity_icons/organisation/restaurant-seafood.svg", keywords: ["restaurant", "seafood", "organisation"] },
      { id: "restaurant-sushi", name: "Restaurant Sushi", icon: "gfx/entity_icons/organisation/restaurant-sushi.svg", keywords: ["restaurant", "sushi", "organisation"] },
      { id: "restaurant", name: "Restaurant", icon: "gfx/entity_icons/organisation/restaurant.svg", keywords: ["restaurant", "organisation"] },
      { id: "roofing-contractor", name: "Roofing Contractor", icon: "gfx/entity_icons/organisation/roofing-contractor.svg", keywords: ["roofing", "contractor", "organisation"] },
      { id: "sherepoint", name: "Sherepoint", icon: "gfx/entity_icons/organisation/sherepoint.png", keywords: ["sherepoint", "organisation"] },
      { id: "shop", name: "Shop", icon: "gfx/entity_icons/organisation/shop.svg", keywords: ["shop", "organisation"] },
      { id: "shopping-mall", name: "Shopping Mall", icon: "gfx/entity_icons/organisation/shopping-mall.svg", keywords: ["shopping", "mall", "organisation"] },
      { id: "skype", name: "Skype", icon: "gfx/entity_icons/organisation/skype.png", keywords: ["skype", "organisation"] },
      { id: "spa", name: "Spa", icon: "gfx/entity_icons/organisation/spa.svg", keywords: ["spa", "organisation"] },
      { id: "store", name: "Store", icon: "gfx/entity_icons/organisation/store.svg", keywords: ["store", "organisation"] },
      { id: "surface", name: "Surface", icon: "gfx/entity_icons/organisation/surface.png", keywords: ["surface", "organisation"] },
      { id: "sway", name: "Sway", icon: "gfx/entity_icons/organisation/sway.png", keywords: ["sway", "organisation"] },
      { id: "tasks", name: "Tasks", icon: "gfx/entity_icons/organisation/tasks.png", keywords: ["tasks", "organisation"] },
      { id: "teahouse", name: "Teahouse", icon: "gfx/entity_icons/organisation/teahouse.svg", keywords: ["teahouse", "organisation"] },
      { id: "teams", name: "Teams", icon: "gfx/entity_icons/organisation/teams.png", keywords: ["teams", "organisation"] },
      { id: "video", name: "Video", icon: "gfx/entity_icons/organisation/video.png", keywords: ["video", "organisation"] },
      { id: "visio", name: "Visio", icon: "gfx/entity_icons/organisation/visio.png", keywords: ["visio", "organisation"] },
      { id: "visualstudio", name: "Visualstudio", icon: "gfx/entity_icons/organisation/visualstudio.png", keywords: ["visualstudio", "organisation"] },
      { id: "window", name: "Window", icon: "gfx/entity_icons/organisation/window.png", keywords: ["window", "organisation"] },
      { id: "windows", name: "Windows", icon: "gfx/entity_icons/organisation/windows.png", keywords: ["windows", "organisation"] },
      { id: "word", name: "Word", icon: "gfx/entity_icons/organisation/word.png", keywords: ["word", "organisation"] },
      { id: "xbox", name: "Xbox", icon: "gfx/entity_icons/organisation/xbox.png", keywords: ["xbox", "organisation"] },
      { id: "yammer", name: "Yammer", icon: "gfx/entity_icons/organisation/yammer.png", keywords: ["yammer", "organisation"] },
      { id: "zune", name: "Zune", icon: "gfx/entity_icons/organisation/zune.png", keywords: ["zune", "organisation"] }
    ]
  },
  financial: {
    name: "Financial",
    color: "#059669",
    defaultIcon: "gfx/entity_icons/financial/bank.svg",
    icons: [
      { id: "accounting", name: "Accounting", icon: "gfx/entity_icons/financial/accounting.svg", keywords: ["accounting", "financial"] },
      { id: "adjustments-dollar", name: "Adjustments Dollar", icon: "gfx/entity_icons/financial/adjustments-dollar.svg", keywords: ["adjustments", "dollar", "financial"] },
      { id: "alcohol-shop", name: "Alcohol Shop", icon: "gfx/entity_icons/financial/alcohol-shop.svg", keywords: ["alcohol", "shop", "financial"] },
      { id: "arrows-exchange-2", name: "Arrows Exchange 2", icon: "gfx/entity_icons/financial/arrows-exchange-2.svg", keywords: ["arrows", "exchange", "financial"] },
      { id: "arrows-exchange", name: "Arrows Exchange", icon: "gfx/entity_icons/financial/arrows-exchange.svg", keywords: ["arrows", "exchange", "financial"] },
      { id: "atm", name: "Atm", icon: "gfx/entity_icons/financial/atm.svg", keywords: ["atm", "financial"] },
      { id: "authorize", name: "Authorize", icon: "gfx/entity_icons/financial/authorize.png", keywords: ["authorize", "financial"] },
      { id: "bank-jp", name: "Bank Jp", icon: "gfx/entity_icons/financial/bank-JP.svg", keywords: ["bank", "jp", "financial"] },
      { id: "bank", name: "Bank", icon: "gfx/entity_icons/financial/bank.svg", keywords: ["bank", "financial"] },
      { id: "basket-bolt", name: "Basket Bolt", icon: "gfx/entity_icons/financial/basket-bolt.svg", keywords: ["basket", "bolt", "financial"] },
      { id: "basket-cancel", name: "Basket Cancel", icon: "gfx/entity_icons/financial/basket-cancel.svg", keywords: ["basket", "cancel", "financial"] },
      { id: "basket-check", name: "Basket Check", icon: "gfx/entity_icons/financial/basket-check.svg", keywords: ["basket", "check", "financial"] },
      { id: "basket-code", name: "Basket Code", icon: "gfx/entity_icons/financial/basket-code.svg", keywords: ["basket", "code", "financial"] },
      { id: "basket-cog", name: "Basket Cog", icon: "gfx/entity_icons/financial/basket-cog.svg", keywords: ["basket", "cog", "financial"] },
      { id: "basket-discount", name: "Basket Discount", icon: "gfx/entity_icons/financial/basket-discount.svg", keywords: ["basket", "discount", "financial"] },
      { id: "basket-dollar", name: "Basket Dollar", icon: "gfx/entity_icons/financial/basket-dollar.svg", keywords: ["basket", "dollar", "financial"] },
      { id: "basket-down", name: "Basket Down", icon: "gfx/entity_icons/financial/basket-down.svg", keywords: ["basket", "down", "financial"] },
      { id: "basket-exclamation", name: "Basket Exclamation", icon: "gfx/entity_icons/financial/basket-exclamation.svg", keywords: ["basket", "exclamation", "financial"] },
      { id: "basket-fill", name: "Basket Fill", icon: "gfx/entity_icons/financial/basket-fill.svg", keywords: ["basket", "fill", "financial"] },
      { id: "basket-heart", name: "Basket Heart", icon: "gfx/entity_icons/financial/basket-heart.svg", keywords: ["basket", "heart", "financial"] },
      { id: "basket-minus", name: "Basket Minus", icon: "gfx/entity_icons/financial/basket-minus.svg", keywords: ["basket", "minus", "financial"] },
      { id: "basket-off", name: "Basket Off", icon: "gfx/entity_icons/financial/basket-off.svg", keywords: ["basket", "off", "financial"] },
      { id: "basket-pause", name: "Basket Pause", icon: "gfx/entity_icons/financial/basket-pause.svg", keywords: ["basket", "pause", "financial"] },
      { id: "basket-pin", name: "Basket Pin", icon: "gfx/entity_icons/financial/basket-pin.svg", keywords: ["basket", "pin", "financial"] },
      { id: "basket-plus", name: "Basket Plus", icon: "gfx/entity_icons/financial/basket-plus.svg", keywords: ["basket", "plus", "financial"] },
      { id: "basket-question", name: "Basket Question", icon: "gfx/entity_icons/financial/basket-question.svg", keywords: ["basket", "question", "financial"] },
      { id: "basket-search", name: "Basket Search", icon: "gfx/entity_icons/financial/basket-search.svg", keywords: ["basket", "search", "financial"] },
      { id: "basket-share", name: "Basket Share", icon: "gfx/entity_icons/financial/basket-share.svg", keywords: ["basket", "share", "financial"] },
      { id: "basket-star", name: "Basket Star", icon: "gfx/entity_icons/financial/basket-star.svg", keywords: ["basket", "star", "financial"] },
      { id: "basket-up", name: "Basket Up", icon: "gfx/entity_icons/financial/basket-up.svg", keywords: ["basket", "up", "financial"] },
      { id: "basket-x", name: "Basket X", icon: "gfx/entity_icons/financial/basket-x.svg", keywords: ["basket", "financial"] },
      { id: "basket", name: "Basket", icon: "gfx/entity_icons/financial/basket.svg", keywords: ["basket", "financial"] },
      { id: "better-business-bureau", name: "Better Business Bureau", icon: "gfx/entity_icons/financial/better_business_bureau.png", keywords: ["better", "business", "bureau", "financial"] },
      { id: "bluepay", name: "Bluepay", icon: "gfx/entity_icons/financial/bluepay.png", keywords: ["bluepay", "financial"] },
      { id: "calendar-dollar", name: "Calendar Dollar", icon: "gfx/entity_icons/financial/calendar-dollar.svg", keywords: ["calendar", "dollar", "financial"] },
      { id: "camera-bitcoin", name: "Camera Bitcoin", icon: "gfx/entity_icons/financial/camera-bitcoin.svg", keywords: ["camera", "bitcoin", "financial"] },
      { id: "camera-dollar", name: "Camera Dollar", icon: "gfx/entity_icons/financial/camera-dollar.svg", keywords: ["camera", "dollar", "financial"] },
      { id: "cart-check-fill", name: "Cart Check Fill", icon: "gfx/entity_icons/financial/cart-check-fill.svg", keywords: ["cart", "check", "fill", "financial"] },
      { id: "cart-check", name: "Cart Check", icon: "gfx/entity_icons/financial/cart-check.svg", keywords: ["cart", "check", "financial"] },
      { id: "cart-dash-fill", name: "Cart Dash Fill", icon: "gfx/entity_icons/financial/cart-dash-fill.svg", keywords: ["cart", "dash", "fill", "financial"] },
      { id: "cart-dash", name: "Cart Dash", icon: "gfx/entity_icons/financial/cart-dash.svg", keywords: ["cart", "dash", "financial"] },
      { id: "cart-fill", name: "Cart Fill", icon: "gfx/entity_icons/financial/cart-fill.svg", keywords: ["cart", "fill", "financial"] },
      { id: "cart-plus-fill", name: "Cart Plus Fill", icon: "gfx/entity_icons/financial/cart-plus-fill.svg", keywords: ["cart", "plus", "fill", "financial"] },
      { id: "cart-plus", name: "Cart Plus", icon: "gfx/entity_icons/financial/cart-plus.svg", keywords: ["cart", "plus", "financial"] },
      { id: "cart-x-fill", name: "Cart X Fill", icon: "gfx/entity_icons/financial/cart-x-fill.svg", keywords: ["cart", "fill", "financial"] },
      { id: "cart-x", name: "Cart X", icon: "gfx/entity_icons/financial/cart-x.svg", keywords: ["cart", "financial"] },
      { id: "cart", name: "Cart", icon: "gfx/entity_icons/financial/cart.svg", keywords: ["cart", "financial"] },
      { id: "cash-banknote-edit", name: "Cash Banknote Edit", icon: "gfx/entity_icons/financial/cash-banknote-edit.svg", keywords: ["cash", "banknote", "edit", "financial"] },
      { id: "cash-banknote-heart", name: "Cash Banknote Heart", icon: "gfx/entity_icons/financial/cash-banknote-heart.svg", keywords: ["cash", "banknote", "heart", "financial"] },
      { id: "cash-banknote-minus", name: "Cash Banknote Minus", icon: "gfx/entity_icons/financial/cash-banknote-minus.svg", keywords: ["cash", "banknote", "minus", "financial"] },
      { id: "cash-banknote-move-back", name: "Cash Banknote Move Back", icon: "gfx/entity_icons/financial/cash-banknote-move-back.svg", keywords: ["cash", "banknote", "move", "back", "financial"] },
      { id: "cash-banknote-move", name: "Cash Banknote Move", icon: "gfx/entity_icons/financial/cash-banknote-move.svg", keywords: ["cash", "banknote", "move", "financial"] },
      { id: "cash-banknote-off", name: "Cash Banknote Off", icon: "gfx/entity_icons/financial/cash-banknote-off.svg", keywords: ["cash", "banknote", "off", "financial"] },
      { id: "cash-banknote-plus", name: "Cash Banknote Plus", icon: "gfx/entity_icons/financial/cash-banknote-plus.svg", keywords: ["cash", "banknote", "plus", "financial"] },
      { id: "cash-banknote", name: "Cash Banknote", icon: "gfx/entity_icons/financial/cash-banknote.svg", keywords: ["cash", "banknote", "financial"] },
      { id: "cash-coin", name: "Cash Coin", icon: "gfx/entity_icons/financial/cash-coin.svg", keywords: ["cash", "coin", "financial"] },
      { id: "cash-edit", name: "Cash Edit", icon: "gfx/entity_icons/financial/cash-edit.svg", keywords: ["cash", "edit", "financial"] },
      { id: "cash-heart", name: "Cash Heart", icon: "gfx/entity_icons/financial/cash-heart.svg", keywords: ["cash", "heart", "financial"] },
      { id: "cash-minus", name: "Cash Minus", icon: "gfx/entity_icons/financial/cash-minus.svg", keywords: ["cash", "minus", "financial"] },
      { id: "cash-move-back", name: "Cash Move Back", icon: "gfx/entity_icons/financial/cash-move-back.svg", keywords: ["cash", "move", "back", "financial"] },
      { id: "cash-move", name: "Cash Move", icon: "gfx/entity_icons/financial/cash-move.svg", keywords: ["cash", "move", "financial"] },
      { id: "cash-off", name: "Cash Off", icon: "gfx/entity_icons/financial/cash-off.svg", keywords: ["cash", "off", "financial"] },
      { id: "cash-plus", name: "Cash Plus", icon: "gfx/entity_icons/financial/cash-plus.svg", keywords: ["cash", "plus", "financial"] },
      { id: "cash-register", name: "Cash Register", icon: "gfx/entity_icons/financial/cash-register.svg", keywords: ["cash", "register", "financial"] },
      { id: "cash-stack", name: "Cash Stack", icon: "gfx/entity_icons/financial/cash-stack.svg", keywords: ["cash", "stack", "financial"] },
      { id: "cash", name: "Cash", icon: "gfx/entity_icons/financial/cash.svg", keywords: ["cash", "financial"] },
      { id: "casino", name: "Casino", icon: "gfx/entity_icons/financial/casino.svg", keywords: ["casino", "financial"] },
      { id: "cib-bitcoin", name: "Cib Bitcoin", icon: "gfx/entity_icons/financial/cib-bitcoin.svg", keywords: ["cib", "bitcoin", "financial"] },
      { id: "cib-ethereum", name: "Cib Ethereum", icon: "gfx/entity_icons/financial/cib-ethereum.svg", keywords: ["cib", "ethereum", "financial"] },
      { id: "cib-experts-exchange", name: "Cib Experts Exchange", icon: "gfx/entity_icons/financial/cib-experts-exchange.svg", keywords: ["cib", "experts", "exchange", "financial"] },
      { id: "cil-balance-scale", name: "Cil Balance Scale", icon: "gfx/entity_icons/financial/cil-balance-scale.svg", keywords: ["cil", "balance", "scale", "financial"] },
      { id: "cil-basket", name: "Cil Basket", icon: "gfx/entity_icons/financial/cil-basket.svg", keywords: ["cil", "basket", "financial"] },
      { id: "cil-british-pound", name: "Cil British Pound", icon: "gfx/entity_icons/financial/cil-british-pound.svg", keywords: ["cil", "british", "pound", "financial"] },
      { id: "cil-cart", name: "Cil Cart", icon: "gfx/entity_icons/financial/cil-cart.svg", keywords: ["cil", "cart", "financial"] },
      { id: "cil-cash", name: "Cil Cash", icon: "gfx/entity_icons/financial/cil-cash.svg", keywords: ["cil", "cash", "financial"] },
      { id: "cil-credit-card", name: "Cil Credit Card", icon: "gfx/entity_icons/financial/cil-credit-card.svg", keywords: ["cil", "credit", "card", "financial"] },
      { id: "cil-dollar", name: "Cil Dollar", icon: "gfx/entity_icons/financial/cil-dollar.svg", keywords: ["cil", "dollar", "financial"] },
      { id: "cil-euro", name: "Cil Euro", icon: "gfx/entity_icons/financial/cil-euro.svg", keywords: ["cil", "euro", "financial"] },
      { id: "cil-money", name: "Cil Money", icon: "gfx/entity_icons/financial/cil-money.svg", keywords: ["cil", "money", "financial"] },
      { id: "cil-wallet", name: "Cil Wallet", icon: "gfx/entity_icons/financial/cil-wallet.svg", keywords: ["cil", "wallet", "financial"] },
      { id: "cil-yen", name: "Cil Yen", icon: "gfx/entity_icons/financial/cil-yen.svg", keywords: ["cil", "yen", "financial"] },
      { id: "cirrus", name: "Cirrus", icon: "gfx/entity_icons/financial/cirrus.png", keywords: ["cirrus", "financial"] },
      { id: "citi", name: "Citi", icon: "gfx/entity_icons/financial/citi.png", keywords: ["citi", "financial"] },
      { id: "clickbank", name: "Clickbank", icon: "gfx/entity_icons/financial/clickbank.png", keywords: ["clickbank", "financial"] },
      { id: "clock-bitcoin", name: "Clock Bitcoin", icon: "gfx/entity_icons/financial/clock-bitcoin.svg", keywords: ["clock", "bitcoin", "financial"] },
      { id: "clock-dollar", name: "Clock Dollar", icon: "gfx/entity_icons/financial/clock-dollar.svg", keywords: ["clock", "dollar", "financial"] },
      { id: "cloud-bitcoin", name: "Cloud Bitcoin", icon: "gfx/entity_icons/financial/cloud-bitcoin.svg", keywords: ["cloud", "bitcoin", "financial"] },
      { id: "cloud-dollar", name: "Cloud Dollar", icon: "gfx/entity_icons/financial/cloud-dollar.svg", keywords: ["cloud", "dollar", "financial"] },
      { id: "co", name: "Co", icon: "gfx/entity_icons/financial/co.png", keywords: ["co", "financial"] },
      { id: "coin-bitcoin", name: "Coin Bitcoin", icon: "gfx/entity_icons/financial/coin-bitcoin.svg", keywords: ["coin", "bitcoin", "financial"] },
      { id: "coin-euro", name: "Coin Euro", icon: "gfx/entity_icons/financial/coin-euro.svg", keywords: ["coin", "euro", "financial"] },
      { id: "coin-monero", name: "Coin Monero", icon: "gfx/entity_icons/financial/coin-monero.svg", keywords: ["coin", "monero", "financial"] },
      { id: "coin-off", name: "Coin Off", icon: "gfx/entity_icons/financial/coin-off.svg", keywords: ["coin", "off", "financial"] },
      { id: "coin-pound", name: "Coin Pound", icon: "gfx/entity_icons/financial/coin-pound.svg", keywords: ["coin", "pound", "financial"] },
      { id: "coin-rupee", name: "Coin Rupee", icon: "gfx/entity_icons/financial/coin-rupee.svg", keywords: ["coin", "rupee", "financial"] },
      { id: "coin-taka", name: "Coin Taka", icon: "gfx/entity_icons/financial/coin-taka.svg", keywords: ["coin", "taka", "financial"] },
      { id: "coin-yen", name: "Coin Yen", icon: "gfx/entity_icons/financial/coin-yen.svg", keywords: ["coin", "yen", "financial"] },
      { id: "coin-yuan", name: "Coin Yuan", icon: "gfx/entity_icons/financial/coin-yuan.svg", keywords: ["coin", "yuan", "financial"] },
      { id: "coin", name: "Coin", icon: "gfx/entity_icons/financial/coin.svg", keywords: ["coin", "financial"] },
      { id: "coins", name: "Coins", icon: "gfx/entity_icons/financial/coins.svg", keywords: ["coins", "financial"] },
      { id: "credit-card-2-back-fill", name: "Credit Card 2 Back Fill", icon: "gfx/entity_icons/financial/credit-card-2-back-fill.svg", keywords: ["credit", "card", "back", "fill", "financial"] },
      { id: "credit-card-2-back", name: "Credit Card 2 Back", icon: "gfx/entity_icons/financial/credit-card-2-back.svg", keywords: ["credit", "card", "back", "financial"] },
      { id: "credit-card-2-front-fill", name: "Credit Card 2 Front Fill", icon: "gfx/entity_icons/financial/credit-card-2-front-fill.svg", keywords: ["credit", "card", "front", "fill", "financial"] },
      { id: "credit-card-2-front", name: "Credit Card 2 Front", icon: "gfx/entity_icons/financial/credit-card-2-front.svg", keywords: ["credit", "card", "front", "financial"] },
      { id: "credit-card-fill", name: "Credit Card Fill", icon: "gfx/entity_icons/financial/credit-card-fill.svg", keywords: ["credit", "card", "fill", "financial"] },
      { id: "credit-card-off", name: "Credit Card Off", icon: "gfx/entity_icons/financial/credit-card-off.svg", keywords: ["credit", "card", "off", "financial"] },
      { id: "credit-card-pay", name: "Credit Card Pay", icon: "gfx/entity_icons/financial/credit-card-pay.svg", keywords: ["credit", "card", "pay", "financial"] },
      { id: "credit-card-refund", name: "Credit Card Refund", icon: "gfx/entity_icons/financial/credit-card-refund.svg", keywords: ["credit", "card", "refund", "financial"] },
      { id: "credit-card", name: "Credit Card", icon: "gfx/entity_icons/financial/credit-card.svg", keywords: ["credit", "card", "financial"] },
      { id: "currency-afghani", name: "Currency Afghani", icon: "gfx/entity_icons/financial/currency-afghani.svg", keywords: ["currency", "afghani", "financial"] },
      { id: "currency-bahraini", name: "Currency Bahraini", icon: "gfx/entity_icons/financial/currency-bahraini.svg", keywords: ["currency", "bahraini", "financial"] },
      { id: "currency-baht", name: "Currency Baht", icon: "gfx/entity_icons/financial/currency-baht.svg", keywords: ["currency", "baht", "financial"] },
      { id: "currency-bitcoin", name: "Currency Bitcoin", icon: "gfx/entity_icons/financial/currency-bitcoin.svg", keywords: ["currency", "bitcoin", "financial"] },
      { id: "currency-cent", name: "Currency Cent", icon: "gfx/entity_icons/financial/currency-cent.svg", keywords: ["currency", "cent", "financial"] },
      { id: "currency-dinar", name: "Currency Dinar", icon: "gfx/entity_icons/financial/currency-dinar.svg", keywords: ["currency", "dinar", "financial"] },
      { id: "currency-dirham", name: "Currency Dirham", icon: "gfx/entity_icons/financial/currency-dirham.svg", keywords: ["currency", "dirham", "financial"] },
      { id: "currency-dogecoin", name: "Currency Dogecoin", icon: "gfx/entity_icons/financial/currency-dogecoin.svg", keywords: ["currency", "dogecoin", "financial"] },
      { id: "currency-dollar-australian", name: "Currency Dollar Australian", icon: "gfx/entity_icons/financial/currency-dollar-australian.svg", keywords: ["currency", "dollar", "australian", "financial"] },
      { id: "currency-dollar-brunei", name: "Currency Dollar Brunei", icon: "gfx/entity_icons/financial/currency-dollar-brunei.svg", keywords: ["currency", "dollar", "brunei", "financial"] },
      { id: "currency-dollar-canadian", name: "Currency Dollar Canadian", icon: "gfx/entity_icons/financial/currency-dollar-canadian.svg", keywords: ["currency", "dollar", "canadian", "financial"] },
      { id: "currency-dollar-guyanese", name: "Currency Dollar Guyanese", icon: "gfx/entity_icons/financial/currency-dollar-guyanese.svg", keywords: ["currency", "dollar", "guyanese", "financial"] },
      { id: "currency-dollar-off", name: "Currency Dollar Off", icon: "gfx/entity_icons/financial/currency-dollar-off.svg", keywords: ["currency", "dollar", "off", "financial"] },
      { id: "currency-dollar-singapore", name: "Currency Dollar Singapore", icon: "gfx/entity_icons/financial/currency-dollar-singapore.svg", keywords: ["currency", "dollar", "singapore", "financial"] },
      { id: "currency-dollar-zimbabwean", name: "Currency Dollar Zimbabwean", icon: "gfx/entity_icons/financial/currency-dollar-zimbabwean.svg", keywords: ["currency", "dollar", "zimbabwean", "financial"] },
      { id: "currency-dollar", name: "Currency Dollar", icon: "gfx/entity_icons/financial/currency-dollar.svg", keywords: ["currency", "dollar", "financial"] },
      { id: "currency-dong", name: "Currency Dong", icon: "gfx/entity_icons/financial/currency-dong.svg", keywords: ["currency", "dong", "financial"] },
      { id: "currency-dram", name: "Currency Dram", icon: "gfx/entity_icons/financial/currency-dram.svg", keywords: ["currency", "dram", "financial"] },
      { id: "currency-ethereum", name: "Currency Ethereum", icon: "gfx/entity_icons/financial/currency-ethereum.svg", keywords: ["currency", "ethereum", "financial"] },
      { id: "currency-euro-off", name: "Currency Euro Off", icon: "gfx/entity_icons/financial/currency-euro-off.svg", keywords: ["currency", "euro", "off", "financial"] },
      { id: "currency-euro", name: "Currency Euro", icon: "gfx/entity_icons/financial/currency-euro.svg", keywords: ["currency", "euro", "financial"] },
      { id: "currency-exchange", name: "Currency Exchange", icon: "gfx/entity_icons/financial/currency-exchange.svg", keywords: ["currency", "exchange", "financial"] },
      { id: "currency-florin", name: "Currency Florin", icon: "gfx/entity_icons/financial/currency-florin.svg", keywords: ["currency", "florin", "financial"] },
      { id: "currency-forint", name: "Currency Forint", icon: "gfx/entity_icons/financial/currency-forint.svg", keywords: ["currency", "forint", "financial"] },
      { id: "currency-frank", name: "Currency Frank", icon: "gfx/entity_icons/financial/currency-frank.svg", keywords: ["currency", "frank", "financial"] },
      { id: "currency-guarani", name: "Currency Guarani", icon: "gfx/entity_icons/financial/currency-guarani.svg", keywords: ["currency", "guarani", "financial"] },
      { id: "currency-hryvnia", name: "Currency Hryvnia", icon: "gfx/entity_icons/financial/currency-hryvnia.svg", keywords: ["currency", "hryvnia", "financial"] },
      { id: "currency-iranian-rial", name: "Currency Iranian Rial", icon: "gfx/entity_icons/financial/currency-iranian-rial.svg", keywords: ["currency", "iranian", "rial", "financial"] },
      { id: "currency-kip", name: "Currency Kip", icon: "gfx/entity_icons/financial/currency-kip.svg", keywords: ["currency", "kip", "financial"] },
      { id: "currency-krone-czech", name: "Currency Krone Czech", icon: "gfx/entity_icons/financial/currency-krone-czech.svg", keywords: ["currency", "krone", "czech", "financial"] },
      { id: "currency-krone-danish", name: "Currency Krone Danish", icon: "gfx/entity_icons/financial/currency-krone-danish.svg", keywords: ["currency", "krone", "danish", "financial"] },
      { id: "currency-krone-swedish", name: "Currency Krone Swedish", icon: "gfx/entity_icons/financial/currency-krone-swedish.svg", keywords: ["currency", "krone", "swedish", "financial"] },
      { id: "currency-lari", name: "Currency Lari", icon: "gfx/entity_icons/financial/currency-lari.svg", keywords: ["currency", "lari", "financial"] },
      { id: "currency-leu", name: "Currency Leu", icon: "gfx/entity_icons/financial/currency-leu.svg", keywords: ["currency", "leu", "financial"] },
      { id: "currency-lira", name: "Currency Lira", icon: "gfx/entity_icons/financial/currency-lira.svg", keywords: ["currency", "lira", "financial"] },
      { id: "currency-litecoin", name: "Currency Litecoin", icon: "gfx/entity_icons/financial/currency-litecoin.svg", keywords: ["currency", "litecoin", "financial"] },
      { id: "currency-lyd", name: "Currency Lyd", icon: "gfx/entity_icons/financial/currency-lyd.svg", keywords: ["currency", "lyd", "financial"] },
      { id: "currency-manat", name: "Currency Manat", icon: "gfx/entity_icons/financial/currency-manat.svg", keywords: ["currency", "manat", "financial"] },
      { id: "currency-monero", name: "Currency Monero", icon: "gfx/entity_icons/financial/currency-monero.svg", keywords: ["currency", "monero", "financial"] },
      { id: "currency-naira", name: "Currency Naira", icon: "gfx/entity_icons/financial/currency-naira.svg", keywords: ["currency", "naira", "financial"] },
      { id: "currency-nano", name: "Currency Nano", icon: "gfx/entity_icons/financial/currency-nano.svg", keywords: ["currency", "nano", "financial"] },
      { id: "currency-off", name: "Currency Off", icon: "gfx/entity_icons/financial/currency-off.svg", keywords: ["currency", "off", "financial"] },
      { id: "currency-paanga", name: "Currency Paanga", icon: "gfx/entity_icons/financial/currency-paanga.svg", keywords: ["currency", "paanga", "financial"] },
      { id: "currency-peso", name: "Currency Peso", icon: "gfx/entity_icons/financial/currency-peso.svg", keywords: ["currency", "peso", "financial"] },
      { id: "currency-pound-off", name: "Currency Pound Off", icon: "gfx/entity_icons/financial/currency-pound-off.svg", keywords: ["currency", "pound", "off", "financial"] },
      { id: "currency-pound", name: "Currency Pound", icon: "gfx/entity_icons/financial/currency-pound.svg", keywords: ["currency", "pound", "financial"] },
      { id: "currency-quetzal", name: "Currency Quetzal", icon: "gfx/entity_icons/financial/currency-quetzal.svg", keywords: ["currency", "quetzal", "financial"] },
      { id: "currency-real", name: "Currency Real", icon: "gfx/entity_icons/financial/currency-real.svg", keywords: ["currency", "real", "financial"] },
      { id: "currency-renminbi", name: "Currency Renminbi", icon: "gfx/entity_icons/financial/currency-renminbi.svg", keywords: ["currency", "renminbi", "financial"] },
      { id: "currency-ripple", name: "Currency Ripple", icon: "gfx/entity_icons/financial/currency-ripple.svg", keywords: ["currency", "ripple", "financial"] },
      { id: "currency-riyal", name: "Currency Riyal", icon: "gfx/entity_icons/financial/currency-riyal.svg", keywords: ["currency", "riyal", "financial"] },
      { id: "currency-rubel", name: "Currency Rubel", icon: "gfx/entity_icons/financial/currency-rubel.svg", keywords: ["currency", "rubel", "financial"] },
      { id: "currency-rufiyaa", name: "Currency Rufiyaa", icon: "gfx/entity_icons/financial/currency-rufiyaa.svg", keywords: ["currency", "rufiyaa", "financial"] },
      { id: "currency-rupee-nepalese", name: "Currency Rupee Nepalese", icon: "gfx/entity_icons/financial/currency-rupee-nepalese.svg", keywords: ["currency", "rupee", "nepalese", "financial"] },
      { id: "currency-rupee", name: "Currency Rupee", icon: "gfx/entity_icons/financial/currency-rupee.svg", keywords: ["currency", "rupee", "financial"] },
      { id: "currency-shekel", name: "Currency Shekel", icon: "gfx/entity_icons/financial/currency-shekel.svg", keywords: ["currency", "shekel", "financial"] },
      { id: "currency-solana", name: "Currency Solana", icon: "gfx/entity_icons/financial/currency-solana.svg", keywords: ["currency", "solana", "financial"] },
      { id: "currency-som", name: "Currency Som", icon: "gfx/entity_icons/financial/currency-som.svg", keywords: ["currency", "som", "financial"] },
      { id: "currency-taka", name: "Currency Taka", icon: "gfx/entity_icons/financial/currency-taka.svg", keywords: ["currency", "taka", "financial"] },
      { id: "currency-tenge", name: "Currency Tenge", icon: "gfx/entity_icons/financial/currency-tenge.svg", keywords: ["currency", "tenge", "financial"] },
      { id: "currency-tugrik", name: "Currency Tugrik", icon: "gfx/entity_icons/financial/currency-tugrik.svg", keywords: ["currency", "tugrik", "financial"] },
      { id: "currency-won", name: "Currency Won", icon: "gfx/entity_icons/financial/currency-won.svg", keywords: ["currency", "won", "financial"] },
      { id: "currency-xrp", name: "Currency Xrp", icon: "gfx/entity_icons/financial/currency-xrp.svg", keywords: ["currency", "xrp", "financial"] },
      { id: "currency-yen-off", name: "Currency Yen Off", icon: "gfx/entity_icons/financial/currency-yen-off.svg", keywords: ["currency", "yen", "off", "financial"] },
      { id: "currency-yen", name: "Currency Yen", icon: "gfx/entity_icons/financial/currency-yen.svg", keywords: ["currency", "yen", "financial"] },
      { id: "currency-yuan", name: "Currency Yuan", icon: "gfx/entity_icons/financial/currency-yuan.svg", keywords: ["currency", "yuan", "financial"] },
      { id: "currency-zloty", name: "Currency Zloty", icon: "gfx/entity_icons/financial/currency-zloty.svg", keywords: ["currency", "zloty", "financial"] },
      { id: "currency", name: "Currency", icon: "gfx/entity_icons/financial/currency.svg", keywords: ["currency", "financial"] },
      { id: "database-dollar", name: "Database Dollar", icon: "gfx/entity_icons/financial/database-dollar.svg", keywords: ["database", "dollar", "financial"] },
      { id: "device-desktop-dollar", name: "Device Desktop Dollar", icon: "gfx/entity_icons/financial/device-desktop-dollar.svg", keywords: ["device", "desktop", "dollar", "financial"] },
      { id: "device-imac-dollar", name: "Device Imac Dollar", icon: "gfx/entity_icons/financial/device-imac-dollar.svg", keywords: ["device", "imac", "dollar", "financial"] },
      { id: "device-ipad-dollar", name: "Device Ipad Dollar", icon: "gfx/entity_icons/financial/device-ipad-dollar.svg", keywords: ["device", "ipad", "dollar", "financial"] },
      { id: "device-ipad-horizontal-dollar", name: "Device Ipad Horizontal Dollar", icon: "gfx/entity_icons/financial/device-ipad-horizontal-dollar.svg", keywords: ["device", "ipad", "horizontal", "dollar", "financial"] },
      { id: "device-tablet-dollar", name: "Device Tablet Dollar", icon: "gfx/entity_icons/financial/device-tablet-dollar.svg", keywords: ["device", "tablet", "dollar", "financial"] },
      { id: "device-watch-dollar", name: "Device Watch Dollar", icon: "gfx/entity_icons/financial/device-watch-dollar.svg", keywords: ["device", "watch", "dollar", "financial"] },
      { id: "devices-dollar", name: "Devices Dollar", icon: "gfx/entity_icons/financial/devices-dollar.svg", keywords: ["devices", "dollar", "financial"] },
      { id: "dinners-club", name: "Dinners Club", icon: "gfx/entity_icons/financial/dinners_club.png", keywords: ["dinners", "club", "financial"] },
      { id: "direct-debit", name: "Direct Debit", icon: "gfx/entity_icons/financial/direct_debit.png", keywords: ["direct", "debit", "financial"] },
      { id: "discount-off", name: "Discount Off", icon: "gfx/entity_icons/financial/discount-off.svg", keywords: ["discount", "off", "financial"] },
      { id: "discount", name: "Discount", icon: "gfx/entity_icons/financial/discount.svg", keywords: ["discount", "financial"] },
      { id: "discover", name: "Discover", icon: "gfx/entity_icons/financial/discover.png", keywords: ["discover", "financial"] },
      { id: "droplet-dollar", name: "Droplet Dollar", icon: "gfx/entity_icons/financial/droplet-dollar.svg", keywords: ["droplet", "dollar", "financial"] },
      { id: "eway", name: "Eway", icon: "gfx/entity_icons/financial/eway.png", keywords: ["eway", "financial"] },
      { id: "exchange-off", name: "Exchange Off", icon: "gfx/entity_icons/financial/exchange-off.svg", keywords: ["exchange", "off", "financial"] },
      { id: "exchange", name: "Exchange", icon: "gfx/entity_icons/financial/exchange.svg", keywords: ["exchange", "financial"] },
      { id: "eye-bitcoin", name: "Eye Bitcoin", icon: "gfx/entity_icons/financial/eye-bitcoin.svg", keywords: ["eye", "bitcoin", "financial"] },
      { id: "eye-discount", name: "Eye Discount", icon: "gfx/entity_icons/financial/eye-discount.svg", keywords: ["eye", "discount", "financial"] },
      { id: "eye-dollar", name: "Eye Dollar", icon: "gfx/entity_icons/financial/eye-dollar.svg", keywords: ["eye", "dollar", "financial"] },
      { id: "file-bitcoin", name: "File Bitcoin", icon: "gfx/entity_icons/financial/file-bitcoin.svg", keywords: ["file", "bitcoin", "financial"] },
      { id: "file-dollar", name: "File Dollar", icon: "gfx/entity_icons/financial/file-dollar.svg", keywords: ["file", "dollar", "financial"] },
      { id: "file-euro", name: "File Euro", icon: "gfx/entity_icons/financial/file-euro.svg", keywords: ["file", "euro", "financial"] },
      { id: "file-invoice", name: "File Invoice", icon: "gfx/entity_icons/financial/file-invoice.svg", keywords: ["file", "invoice", "financial"] },
      { id: "file-percent", name: "File Percent", icon: "gfx/entity_icons/financial/file-percent.svg", keywords: ["file", "percent", "financial"] },
      { id: "filter-2-discount", name: "Filter 2 Discount", icon: "gfx/entity_icons/financial/filter-2-discount.svg", keywords: ["filter", "discount", "financial"] },
      { id: "filter-2-dollar", name: "Filter 2 Dollar", icon: "gfx/entity_icons/financial/filter-2-dollar.svg", keywords: ["filter", "dollar", "financial"] },
      { id: "filter-discount", name: "Filter Discount", icon: "gfx/entity_icons/financial/filter-discount.svg", keywords: ["filter", "discount", "financial"] },
      { id: "filter-dollar", name: "Filter Dollar", icon: "gfx/entity_icons/financial/filter-dollar.svg", keywords: ["filter", "dollar", "financial"] },
      { id: "finance", name: "Finance", icon: "gfx/entity_icons/financial/finance.svg", keywords: ["finance", "financial"] },
      { id: "flag-bitcoin", name: "Flag Bitcoin", icon: "gfx/entity_icons/financial/flag-bitcoin.svg", keywords: ["flag", "bitcoin", "financial"] },
      { id: "flag-discount", name: "Flag Discount", icon: "gfx/entity_icons/financial/flag-discount.svg", keywords: ["flag", "discount", "financial"] },
      { id: "flag-dollar", name: "Flag Dollar", icon: "gfx/entity_icons/financial/flag-dollar.svg", keywords: ["flag", "dollar", "financial"] },
      { id: "folder-dollar", name: "Folder Dollar", icon: "gfx/entity_icons/financial/folder-dollar.svg", keywords: ["folder", "dollar", "financial"] },
      { id: "garden-cart-off", name: "Garden Cart Off", icon: "gfx/entity_icons/financial/garden-cart-off.svg", keywords: ["garden", "cart", "off", "financial"] },
      { id: "garden-cart", name: "Garden Cart", icon: "gfx/entity_icons/financial/garden-cart.svg", keywords: ["garden", "cart", "financial"] },
      { id: "heart-bitcoin", name: "Heart Bitcoin", icon: "gfx/entity_icons/financial/heart-bitcoin.svg", keywords: ["heart", "bitcoin", "financial"] },
      { id: "heart-discount", name: "Heart Discount", icon: "gfx/entity_icons/financial/heart-discount.svg", keywords: ["heart", "discount", "financial"] },
      { id: "heart-dollar", name: "Heart Dollar", icon: "gfx/entity_icons/financial/heart-dollar.svg", keywords: ["heart", "dollar", "financial"] },
      { id: "home-bitcoin", name: "Home Bitcoin", icon: "gfx/entity_icons/financial/home-bitcoin.svg", keywords: ["home", "bitcoin", "financial"] },
      { id: "home-dollar", name: "Home Dollar", icon: "gfx/entity_icons/financial/home-dollar.svg", keywords: ["home", "dollar", "financial"] },
      { id: "hsbc", name: "Hsbc", icon: "gfx/entity_icons/financial/hsbc.png", keywords: ["hsbc", "financial"] },
      { id: "ideal", name: "Ideal", icon: "gfx/entity_icons/financial/ideal.png", keywords: ["ideal", "financial"] },
      { id: "insurance-agency", name: "Insurance Agency", icon: "gfx/entity_icons/financial/insurance-agency.svg", keywords: ["insurance", "agency", "financial"] },
      { id: "invoice", name: "Invoice", icon: "gfx/entity_icons/financial/invoice.svg", keywords: ["invoice", "financial"] },
      { id: "jcb", name: "Jcb", icon: "gfx/entity_icons/financial/jcb.png", keywords: ["jcb", "financial"] },
      { id: "jewelry-store", name: "Jewelry Store", icon: "gfx/entity_icons/financial/jewelry-store.svg", keywords: ["jewelry", "store", "financial"] },
      { id: "location-discount", name: "Location Discount", icon: "gfx/entity_icons/financial/location-discount.svg", keywords: ["location", "discount", "financial"] },
      { id: "location-dollar", name: "Location Dollar", icon: "gfx/entity_icons/financial/location-dollar.svg", keywords: ["location", "dollar", "financial"] },
      { id: "lock-bitcoin", name: "Lock Bitcoin", icon: "gfx/entity_icons/financial/lock-bitcoin.svg", keywords: ["lock", "bitcoin", "financial"] },
      { id: "lock-dollar", name: "Lock Dollar", icon: "gfx/entity_icons/financial/lock-dollar.svg", keywords: ["lock", "dollar", "financial"] },
      { id: "locksmith", name: "Locksmith", icon: "gfx/entity_icons/financial/locksmith.svg", keywords: ["locksmith", "financial"] },
      { id: "map-discount", name: "Map Discount", icon: "gfx/entity_icons/financial/map-discount.svg", keywords: ["map", "discount", "financial"] },
      { id: "map-dollar", name: "Map Dollar", icon: "gfx/entity_icons/financial/map-dollar.svg", keywords: ["map", "dollar", "financial"] },
      { id: "map-pin-dollar", name: "Map Pin Dollar", icon: "gfx/entity_icons/financial/map-pin-dollar.svg", keywords: ["map", "pin", "dollar", "financial"] },
      { id: "mood-bitcoin", name: "Mood Bitcoin", icon: "gfx/entity_icons/financial/mood-bitcoin.svg", keywords: ["mood", "bitcoin", "financial"] },
      { id: "mood-dollar", name: "Mood Dollar", icon: "gfx/entity_icons/financial/mood-dollar.svg", keywords: ["mood", "dollar", "financial"] },
      { id: "music-discount", name: "Music Discount", icon: "gfx/entity_icons/financial/music-discount.svg", keywords: ["music", "discount", "financial"] },
      { id: "music-dollar", name: "Music Dollar", icon: "gfx/entity_icons/financial/music-dollar.svg", keywords: ["music", "dollar", "financial"] },
      { id: "navigation-discount", name: "Navigation Discount", icon: "gfx/entity_icons/financial/navigation-discount.svg", keywords: ["navigation", "discount", "financial"] },
      { id: "navigation-dollar", name: "Navigation Dollar", icon: "gfx/entity_icons/financial/navigation-dollar.svg", keywords: ["navigation", "dollar", "financial"] },
      { id: "paypal", name: "Paypal", icon: "gfx/entity_icons/financial/paypal.png", keywords: ["paypal", "financial"] },
      { id: "paypoint", name: "Paypoint", icon: "gfx/entity_icons/financial/paypoint.png", keywords: ["paypoint", "financial"] },
      { id: "pencil-discount", name: "Pencil Discount", icon: "gfx/entity_icons/financial/pencil-discount.svg", keywords: ["pencil", "discount", "financial"] },
      { id: "pencil-dollar", name: "Pencil Dollar", icon: "gfx/entity_icons/financial/pencil-dollar.svg", keywords: ["pencil", "dollar", "financial"] },
      { id: "percent", name: "Percent", icon: "gfx/entity_icons/financial/percent.svg", keywords: ["percent", "financial"] },
      { id: "photo-bitcoin", name: "Photo Bitcoin", icon: "gfx/entity_icons/financial/photo-bitcoin.svg", keywords: ["photo", "bitcoin", "financial"] },
      { id: "photo-dollar", name: "Photo Dollar", icon: "gfx/entity_icons/financial/photo-dollar.svg", keywords: ["photo", "dollar", "financial"] },
      { id: "pick-n-pay", name: "Pick N Pay", icon: "gfx/entity_icons/financial/pick_n_pay.png", keywords: ["pick", "pay", "financial"] },
      { id: "pig-money", name: "Pig Money", icon: "gfx/entity_icons/financial/pig-money.svg", keywords: ["pig", "money", "financial"] },
      { id: "piggy-bank-fill", name: "Piggy Bank Fill", icon: "gfx/entity_icons/financial/piggy-bank-fill.svg", keywords: ["piggy", "bank", "fill", "financial"] },
      { id: "piggy-bank", name: "Piggy Bank", icon: "gfx/entity_icons/financial/piggy-bank.svg", keywords: ["piggy", "bank", "financial"] },
      { id: "pointer-dollar", name: "Pointer Dollar", icon: "gfx/entity_icons/financial/pointer-dollar.svg", keywords: ["pointer", "dollar", "financial"] },
      { id: "postepay", name: "Postepay", icon: "gfx/entity_icons/financial/postepay.png", keywords: ["postepay", "financial"] },
      { id: "receipt-2", name: "Receipt 2", icon: "gfx/entity_icons/financial/receipt-2.svg", keywords: ["receipt", "financial"] },
      { id: "receipt-bitcoin", name: "Receipt Bitcoin", icon: "gfx/entity_icons/financial/receipt-bitcoin.svg", keywords: ["receipt", "bitcoin", "financial"] },
      { id: "receipt-cutoff", name: "Receipt Cutoff", icon: "gfx/entity_icons/financial/receipt-cutoff.svg", keywords: ["receipt", "cutoff", "financial"] },
      { id: "receipt-dollar", name: "Receipt Dollar", icon: "gfx/entity_icons/financial/receipt-dollar.svg", keywords: ["receipt", "dollar", "financial"] },
      { id: "receipt-euro", name: "Receipt Euro", icon: "gfx/entity_icons/financial/receipt-euro.svg", keywords: ["receipt", "euro", "financial"] },
      { id: "receipt-off", name: "Receipt Off", icon: "gfx/entity_icons/financial/receipt-off.svg", keywords: ["receipt", "off", "financial"] },
      { id: "receipt-pound", name: "Receipt Pound", icon: "gfx/entity_icons/financial/receipt-pound.svg", keywords: ["receipt", "pound", "financial"] },
      { id: "receipt-refund", name: "Receipt Refund", icon: "gfx/entity_icons/financial/receipt-refund.svg", keywords: ["receipt", "refund", "financial"] },
      { id: "receipt-rupee", name: "Receipt Rupee", icon: "gfx/entity_icons/financial/receipt-rupee.svg", keywords: ["receipt", "rupee", "financial"] },
      { id: "receipt-tax", name: "Receipt Tax", icon: "gfx/entity_icons/financial/receipt-tax.svg", keywords: ["receipt", "tax", "financial"] },
      { id: "receipt-yen", name: "Receipt Yen", icon: "gfx/entity_icons/financial/receipt-yen.svg", keywords: ["receipt", "yen", "financial"] },
      { id: "receipt-yuan", name: "Receipt Yuan", icon: "gfx/entity_icons/financial/receipt-yuan.svg", keywords: ["receipt", "yuan", "financial"] },
      { id: "receipt", name: "Receipt", icon: "gfx/entity_icons/financial/receipt.svg", keywords: ["receipt", "financial"] },
      { id: "report-money", name: "Report Money", icon: "gfx/entity_icons/financial/report-money.svg", keywords: ["report", "money", "financial"] },
      { id: "rosette-discount-check-off", name: "Rosette Discount Check Off", icon: "gfx/entity_icons/financial/rosette-discount-check-off.svg", keywords: ["rosette", "discount", "check", "off", "financial"] },
      { id: "rosette-discount-check", name: "Rosette Discount Check", icon: "gfx/entity_icons/financial/rosette-discount-check.svg", keywords: ["rosette", "discount", "check", "financial"] },
      { id: "rosette-discount-off", name: "Rosette Discount Off", icon: "gfx/entity_icons/financial/rosette-discount-off.svg", keywords: ["rosette", "discount", "off", "financial"] },
      { id: "rosette-discount", name: "Rosette Discount", icon: "gfx/entity_icons/financial/rosette-discount.svg", keywords: ["rosette", "discount", "financial"] },
      { id: "safe-fill", name: "Safe Fill", icon: "gfx/entity_icons/financial/safe-fill.svg", keywords: ["safe", "fill", "financial"] },
      { id: "safe", name: "Safe", icon: "gfx/entity_icons/financial/safe.svg", keywords: ["safe", "financial"] },
      { id: "sage", name: "Sage", icon: "gfx/entity_icons/financial/sage.png", keywords: ["sage", "financial"] },
      { id: "settings-dollar", name: "Settings Dollar", icon: "gfx/entity_icons/financial/settings-dollar.svg", keywords: ["settings", "dollar", "financial"] },
      { id: "shopping-bag-discount", name: "Shopping Bag Discount", icon: "gfx/entity_icons/financial/shopping-bag-discount.svg", keywords: ["shopping", "bag", "discount", "financial"] },
      { id: "shopping-cart-bolt", name: "Shopping Cart Bolt", icon: "gfx/entity_icons/financial/shopping-cart-bolt.svg", keywords: ["shopping", "cart", "bolt", "financial"] },
      { id: "shopping-cart-cancel", name: "Shopping Cart Cancel", icon: "gfx/entity_icons/financial/shopping-cart-cancel.svg", keywords: ["shopping", "cart", "cancel", "financial"] },
      { id: "shopping-cart-check", name: "Shopping Cart Check", icon: "gfx/entity_icons/financial/shopping-cart-check.svg", keywords: ["shopping", "cart", "check", "financial"] },
      { id: "shopping-cart-code", name: "Shopping Cart Code", icon: "gfx/entity_icons/financial/shopping-cart-code.svg", keywords: ["shopping", "cart", "code", "financial"] },
      { id: "shopping-cart-cog", name: "Shopping Cart Cog", icon: "gfx/entity_icons/financial/shopping-cart-cog.svg", keywords: ["shopping", "cart", "cog", "financial"] },
      { id: "shopping-cart-copy", name: "Shopping Cart Copy", icon: "gfx/entity_icons/financial/shopping-cart-copy.svg", keywords: ["shopping", "cart", "copy", "financial"] },
      { id: "shopping-cart-discount", name: "Shopping Cart Discount", icon: "gfx/entity_icons/financial/shopping-cart-discount.svg", keywords: ["shopping", "cart", "discount", "financial"] },
      { id: "shopping-cart-dollar", name: "Shopping Cart Dollar", icon: "gfx/entity_icons/financial/shopping-cart-dollar.svg", keywords: ["shopping", "cart", "dollar", "financial"] },
      { id: "shopping-cart-down", name: "Shopping Cart Down", icon: "gfx/entity_icons/financial/shopping-cart-down.svg", keywords: ["shopping", "cart", "down", "financial"] },
      { id: "shopping-cart-exclamation", name: "Shopping Cart Exclamation", icon: "gfx/entity_icons/financial/shopping-cart-exclamation.svg", keywords: ["shopping", "cart", "exclamation", "financial"] },
      { id: "shopping-cart-heart", name: "Shopping Cart Heart", icon: "gfx/entity_icons/financial/shopping-cart-heart.svg", keywords: ["shopping", "cart", "heart", "financial"] },
      { id: "shopping-cart-minus", name: "Shopping Cart Minus", icon: "gfx/entity_icons/financial/shopping-cart-minus.svg", keywords: ["shopping", "cart", "minus", "financial"] },
      { id: "shopping-cart-off", name: "Shopping Cart Off", icon: "gfx/entity_icons/financial/shopping-cart-off.svg", keywords: ["shopping", "cart", "off", "financial"] },
      { id: "shopping-cart-pause", name: "Shopping Cart Pause", icon: "gfx/entity_icons/financial/shopping-cart-pause.svg", keywords: ["shopping", "cart", "pause", "financial"] },
      { id: "shopping-cart-pin", name: "Shopping Cart Pin", icon: "gfx/entity_icons/financial/shopping-cart-pin.svg", keywords: ["shopping", "cart", "pin", "financial"] },
      { id: "shopping-cart-plus", name: "Shopping Cart Plus", icon: "gfx/entity_icons/financial/shopping-cart-plus.svg", keywords: ["shopping", "cart", "plus", "financial"] },
      { id: "shopping-cart-question", name: "Shopping Cart Question", icon: "gfx/entity_icons/financial/shopping-cart-question.svg", keywords: ["shopping", "cart", "question", "financial"] },
      { id: "shopping-cart-search", name: "Shopping Cart Search", icon: "gfx/entity_icons/financial/shopping-cart-search.svg", keywords: ["shopping", "cart", "search", "financial"] },
      { id: "shopping-cart-share", name: "Shopping Cart Share", icon: "gfx/entity_icons/financial/shopping-cart-share.svg", keywords: ["shopping", "cart", "share", "financial"] },
      { id: "shopping-cart-star", name: "Shopping Cart Star", icon: "gfx/entity_icons/financial/shopping-cart-star.svg", keywords: ["shopping", "cart", "star", "financial"] },
      { id: "shopping-cart-up", name: "Shopping Cart Up", icon: "gfx/entity_icons/financial/shopping-cart-up.svg", keywords: ["shopping", "cart", "up", "financial"] },
      { id: "shopping-cart-x", name: "Shopping Cart X", icon: "gfx/entity_icons/financial/shopping-cart-x.svg", keywords: ["shopping", "cart", "financial"] },
      { id: "shopping-cart", name: "Shopping Cart", icon: "gfx/entity_icons/financial/shopping-cart.svg", keywords: ["shopping", "cart", "financial"] },
      { id: "solo", name: "Solo", icon: "gfx/entity_icons/financial/solo.png", keywords: ["solo", "financial"] },
      { id: "storage", name: "Storage", icon: "gfx/entity_icons/financial/storage.svg", keywords: ["storage", "financial"] },
      { id: "switch", name: "Switch", icon: "gfx/entity_icons/financial/switch.png", keywords: ["switch", "financial"] },
      { id: "symbols", name: "Symbols", icon: "gfx/entity_icons/financial/symbols.png", keywords: ["symbols", "financial"] },
      { id: "tax-euro", name: "Tax Euro", icon: "gfx/entity_icons/financial/tax-euro.svg", keywords: ["tax", "euro", "financial"] },
      { id: "tax-pound", name: "Tax Pound", icon: "gfx/entity_icons/financial/tax-pound.svg", keywords: ["tax", "pound", "financial"] },
      { id: "tax", name: "Tax", icon: "gfx/entity_icons/financial/tax.svg", keywords: ["tax", "financial"] },
      { id: "tip-jar-euro", name: "Tip Jar Euro", icon: "gfx/entity_icons/financial/tip-jar-euro.svg", keywords: ["tip", "jar", "euro", "financial"] },
      { id: "tip-jar-pound", name: "Tip Jar Pound", icon: "gfx/entity_icons/financial/tip-jar-pound.svg", keywords: ["tip", "jar", "pound", "financial"] },
      { id: "transaction-bitcoin", name: "Transaction Bitcoin", icon: "gfx/entity_icons/financial/transaction-bitcoin.svg", keywords: ["transaction", "bitcoin", "financial"] },
      { id: "transaction-dollar", name: "Transaction Dollar", icon: "gfx/entity_icons/financial/transaction-dollar.svg", keywords: ["transaction", "dollar", "financial"] },
      { id: "transaction-euro", name: "Transaction Euro", icon: "gfx/entity_icons/financial/transaction-euro.svg", keywords: ["transaction", "euro", "financial"] },
      { id: "transaction-pound", name: "Transaction Pound", icon: "gfx/entity_icons/financial/transaction-pound.svg", keywords: ["transaction", "pound", "financial"] },
      { id: "transaction-rupee", name: "Transaction Rupee", icon: "gfx/entity_icons/financial/transaction-rupee.svg", keywords: ["transaction", "rupee", "financial"] },
      { id: "transaction-yen", name: "Transaction Yen", icon: "gfx/entity_icons/financial/transaction-yen.svg", keywords: ["transaction", "yen", "financial"] },
      { id: "user-bitcoin", name: "User Bitcoin", icon: "gfx/entity_icons/financial/user-bitcoin.svg", keywords: ["user", "bitcoin", "financial"] },
      { id: "user-dollar", name: "User Dollar", icon: "gfx/entity_icons/financial/user-dollar.svg", keywords: ["user", "dollar", "financial"] },
      { id: "wallet-off", name: "Wallet Off", icon: "gfx/entity_icons/financial/wallet-off.svg", keywords: ["wallet", "off", "financial"] },
      { id: "wallet", name: "Wallet", icon: "gfx/entity_icons/financial/wallet.svg", keywords: ["wallet", "financial"] },
      { id: "wepay", name: "Wepay", icon: "gfx/entity_icons/financial/wepay.png", keywords: ["wepay", "financial"] },
      { id: "western-union", name: "Western Union", icon: "gfx/entity_icons/financial/western_union.png", keywords: ["western", "union", "financial"] },
      { id: "wirecard", name: "Wirecard", icon: "gfx/entity_icons/financial/wirecard.png", keywords: ["wirecard", "financial"] },
      { id: "world-dollar", name: "World Dollar", icon: "gfx/entity_icons/financial/world-dollar.svg", keywords: ["world", "dollar", "financial"] },
      { id: "worldpay", name: "Worldpay", icon: "gfx/entity_icons/financial/worldpay.png", keywords: ["worldpay", "financial"] },
      { id: "zoom-money", name: "Zoom Money", icon: "gfx/entity_icons/financial/zoom-money.svg", keywords: ["zoom", "money", "financial"] }
    ]
  },
  vehicles: {
    name: "Vehicles",
    color: "#f59e0b",
    defaultIcon: "gfx/entity_icons/vehicles/car.svg",
    icons: [
      { id: "ambulance", name: "Ambulance", icon: "gfx/entity_icons/vehicles/ambulance.png", keywords: ["ambulance", "vehicles"] },
      { id: "ambulance", name: "Ambulance", icon: "gfx/entity_icons/vehicles/ambulance.svg", keywords: ["ambulance", "vehicles"] },
      { id: "bicycle-share", name: "Bicycle Share", icon: "gfx/entity_icons/vehicles/bicycle-share.svg", keywords: ["bicycle", "share", "vehicles"] },
      { id: "bicycle-store", name: "Bicycle Store", icon: "gfx/entity_icons/vehicles/bicycle-store.svg", keywords: ["bicycle", "store", "vehicles"] },
      { id: "bicycle", name: "Bicycle", icon: "gfx/entity_icons/vehicles/bicycle.svg", keywords: ["bicycle", "vehicles"] },
      { id: "bicycling", name: "Bicycling", icon: "gfx/entity_icons/vehicles/bicycling.svg", keywords: ["bicycling", "vehicles"] },
      { id: "big-truck", name: "Big Truck", icon: "gfx/entity_icons/vehicles/big_truck.png", keywords: ["big", "truck", "vehicles"] },
      { id: "bike-off", name: "Bike Off", icon: "gfx/entity_icons/vehicles/bike-off.svg", keywords: ["bike", "off", "vehicles"] },
      { id: "bike", name: "Bike", icon: "gfx/entity_icons/vehicles/bike.svg", keywords: ["bike", "vehicles"] },
      { id: "bulldozer", name: "Bulldozer", icon: "gfx/entity_icons/vehicles/bulldozer.svg", keywords: ["bulldozer", "vehicles"] },
      { id: "bus-front-fill", name: "Bus Front Fill", icon: "gfx/entity_icons/vehicles/bus-front-fill.svg", keywords: ["bus", "front", "fill", "vehicles"] },
      { id: "bus-front", name: "Bus Front", icon: "gfx/entity_icons/vehicles/bus-front.svg", keywords: ["bus", "front", "vehicles"] },
      { id: "bus-off", name: "Bus Off", icon: "gfx/entity_icons/vehicles/bus-off.svg", keywords: ["bus", "off", "vehicles"] },
      { id: "bus-station", name: "Bus Station", icon: "gfx/entity_icons/vehicles/bus-station.svg", keywords: ["bus", "station", "vehicles"] },
      { id: "bus-stop", name: "Bus Stop", icon: "gfx/entity_icons/vehicles/bus-stop.svg", keywords: ["bus", "stop", "vehicles"] },
      { id: "bus", name: "Bus", icon: "gfx/entity_icons/vehicles/bus.png", keywords: ["bus", "vehicles"] },
      { id: "bus", name: "Bus", icon: "gfx/entity_icons/vehicles/bus.svg", keywords: ["bus", "vehicles"] },
      { id: "campervan", name: "Campervan", icon: "gfx/entity_icons/vehicles/campervan.png", keywords: ["campervan", "vehicles"] },
      { id: "car-4wd", name: "Car 4wd", icon: "gfx/entity_icons/vehicles/car-4wd.svg", keywords: ["car", "4wd", "vehicles"] },
      { id: "car-crane", name: "Car Crane", icon: "gfx/entity_icons/vehicles/car-crane.svg", keywords: ["car", "crane", "vehicles"] },
      { id: "car-crash", name: "Car Crash", icon: "gfx/entity_icons/vehicles/car-crash.svg", keywords: ["car", "crash", "vehicles"] },
      { id: "car-dealer", name: "Car Dealer", icon: "gfx/entity_icons/vehicles/car-dealer.svg", keywords: ["car", "dealer", "vehicles"] },
      { id: "car-fan-1", name: "Car Fan 1", icon: "gfx/entity_icons/vehicles/car-fan-1.svg", keywords: ["car", "fan", "vehicles"] },
      { id: "car-fan-2", name: "Car Fan 2", icon: "gfx/entity_icons/vehicles/car-fan-2.svg", keywords: ["car", "fan", "vehicles"] },
      { id: "car-fan-3", name: "Car Fan 3", icon: "gfx/entity_icons/vehicles/car-fan-3.svg", keywords: ["car", "fan", "vehicles"] },
      { id: "car-fan-auto", name: "Car Fan Auto", icon: "gfx/entity_icons/vehicles/car-fan-auto.svg", keywords: ["car", "fan", "auto", "vehicles"] },
      { id: "car-fan", name: "Car Fan", icon: "gfx/entity_icons/vehicles/car-fan.svg", keywords: ["car", "fan", "vehicles"] },
      { id: "car-front-fill", name: "Car Front Fill", icon: "gfx/entity_icons/vehicles/car-front-fill.svg", keywords: ["car", "front", "fill", "vehicles"] },
      { id: "car-front", name: "Car Front", icon: "gfx/entity_icons/vehicles/car-front.svg", keywords: ["car", "front", "vehicles"] },
      { id: "car-garage", name: "Car Garage", icon: "gfx/entity_icons/vehicles/car-garage.svg", keywords: ["car", "garage", "vehicles"] },
      { id: "car-off", name: "Car Off", icon: "gfx/entity_icons/vehicles/car-off.svg", keywords: ["car", "off", "vehicles"] },
      { id: "car-rental", name: "Car Rental", icon: "gfx/entity_icons/vehicles/car-rental.svg", keywords: ["car", "rental", "vehicles"] },
      { id: "car-repair", name: "Car Repair", icon: "gfx/entity_icons/vehicles/car-repair.svg", keywords: ["car", "repair", "vehicles"] },
      { id: "car-suv", name: "Car Suv", icon: "gfx/entity_icons/vehicles/car-suv.svg", keywords: ["car", "suv", "vehicles"] },
      { id: "car-turbine", name: "Car Turbine", icon: "gfx/entity_icons/vehicles/car-turbine.svg", keywords: ["car", "turbine", "vehicles"] },
      { id: "car-wash", name: "Car Wash", icon: "gfx/entity_icons/vehicles/car-wash.svg", keywords: ["car", "wash", "vehicles"] },
      { id: "car", name: "Car", icon: "gfx/entity_icons/vehicles/car.png", keywords: ["car", "vehicles"] },
      { id: "car", name: "Car", icon: "gfx/entity_icons/vehicles/car.svg", keywords: ["car", "vehicles"] },
      { id: "caravan", name: "Caravan", icon: "gfx/entity_icons/vehicles/caravan.svg", keywords: ["caravan", "vehicles"] },
      { id: "charging-station", name: "Charging Station", icon: "gfx/entity_icons/vehicles/charging-station.svg", keywords: ["charging", "station", "vehicles"] },
      { id: "cil-bike", name: "Cil Bike", icon: "gfx/entity_icons/vehicles/cil-bike.svg", keywords: ["cil", "bike", "vehicles"] },
      { id: "cil-bus-alt", name: "Cil Bus Alt", icon: "gfx/entity_icons/vehicles/cil-bus-alt.svg", keywords: ["cil", "bus", "alt", "vehicles"] },
      { id: "cil-car-alt", name: "Cil Car Alt", icon: "gfx/entity_icons/vehicles/cil-car-alt.svg", keywords: ["cil", "car", "alt", "vehicles"] },
      { id: "cil-speedometer", name: "Cil Speedometer", icon: "gfx/entity_icons/vehicles/cil-speedometer.svg", keywords: ["cil", "speedometer", "vehicles"] },
      { id: "cil-taxi", name: "Cil Taxi", icon: "gfx/entity_icons/vehicles/cil-taxi.svg", keywords: ["cil", "taxi", "vehicles"] },
      { id: "cil-truck", name: "Cil Truck", icon: "gfx/entity_icons/vehicles/cil-truck.svg", keywords: ["cil", "truck", "vehicles"] },
      { id: "convertible-car", name: "Convertible Car", icon: "gfx/entity_icons/vehicles/convertible_car.png", keywords: ["convertible", "car", "vehicles"] },
      { id: "coupe", name: "Coupe", icon: "gfx/entity_icons/vehicles/coupe.png", keywords: ["coupe", "vehicles"] },
      { id: "crane", name: "Crane", icon: "gfx/entity_icons/vehicles/crane.png", keywords: ["crane", "vehicles"] },
      { id: "crane-truck", name: "Crane Truck", icon: "gfx/entity_icons/vehicles/crane_truck.png", keywords: ["crane", "truck", "vehicles"] },
      { id: "double-decker-bus", name: "Double Decker Bus", icon: "gfx/entity_icons/vehicles/double_decker_bus.png", keywords: ["double", "decker", "bus", "vehicles"] },
      { id: "dump-truck", name: "Dump Truck", icon: "gfx/entity_icons/vehicles/dump_truck.png", keywords: ["dump", "truck", "vehicles"] },
      { id: "firefighter-car", name: "Firefighter Car", icon: "gfx/entity_icons/vehicles/firefighter_car.png", keywords: ["firefighter", "car", "vehicles"] },
      { id: "firetruck", name: "Firetruck", icon: "gfx/entity_icons/vehicles/firetruck.svg", keywords: ["firetruck", "vehicles"] },
      { id: "food-truck", name: "Food Truck", icon: "gfx/entity_icons/vehicles/food_truck.png", keywords: ["food", "truck", "vehicles"] },
      { id: "forklift", name: "Forklift", icon: "gfx/entity_icons/vehicles/forklift.png", keywords: ["forklift", "vehicles"] },
      { id: "forklift", name: "Forklift", icon: "gfx/entity_icons/vehicles/forklift.svg", keywords: ["forklift", "vehicles"] },
      { id: "fuel-pump-diesel-fill", name: "Fuel Pump Diesel Fill", icon: "gfx/entity_icons/vehicles/fuel-pump-diesel-fill.svg", keywords: ["fuel", "pump", "diesel", "fill", "vehicles"] },
      { id: "fuel-pump-diesel", name: "Fuel Pump Diesel", icon: "gfx/entity_icons/vehicles/fuel-pump-diesel.svg", keywords: ["fuel", "pump", "diesel", "vehicles"] },
      { id: "fuel-pump-fill", name: "Fuel Pump Fill", icon: "gfx/entity_icons/vehicles/fuel-pump-fill.svg", keywords: ["fuel", "pump", "fill", "vehicles"] },
      { id: "fuel-pump", name: "Fuel Pump", icon: "gfx/entity_icons/vehicles/fuel-pump.svg", keywords: ["fuel", "pump", "vehicles"] },
      { id: "fuel", name: "Fuel", icon: "gfx/entity_icons/vehicles/fuel.svg", keywords: ["fuel", "vehicles"] },
      { id: "garbage-car", name: "Garbage Car", icon: "gfx/entity_icons/vehicles/garbage_car.png", keywords: ["garbage", "car", "vehicles"] },
      { id: "gas-station", name: "Gas Station", icon: "gfx/entity_icons/vehicles/gas-station.svg", keywords: ["gas", "station", "vehicles"] },
      { id: "highway-rest-area", name: "Highway Rest Area", icon: "gfx/entity_icons/vehicles/highway-rest-area.svg", keywords: ["highway", "rest", "area", "vehicles"] },
      { id: "minibus", name: "Minibus", icon: "gfx/entity_icons/vehicles/minibus.png", keywords: ["minibus", "vehicles"] },
      { id: "monster-truck", name: "Monster Truck", icon: "gfx/entity_icons/vehicles/monster_truck.png", keywords: ["monster", "truck", "vehicles"] },
      { id: "motobike-trail", name: "Motobike Trail", icon: "gfx/entity_icons/vehicles/motobike-trail.svg", keywords: ["motobike", "trail", "vehicles"] },
      { id: "motorbike", name: "Motorbike", icon: "gfx/entity_icons/vehicles/motorbike.svg", keywords: ["motorbike", "vehicles"] },
      { id: "moving-company", name: "Moving Company", icon: "gfx/entity_icons/vehicles/moving-company.svg", keywords: ["moving", "company", "vehicles"] },
      { id: "parking-garage", name: "Parking Garage", icon: "gfx/entity_icons/vehicles/parking-garage.svg", keywords: ["parking", "garage", "vehicles"] },
      { id: "parking-paid", name: "Parking Paid", icon: "gfx/entity_icons/vehicles/parking-paid.svg", keywords: ["parking", "paid", "vehicles"] },
      { id: "parking", name: "Parking", icon: "gfx/entity_icons/vehicles/parking.svg", keywords: ["parking", "vehicles"] },
      { id: "pickup-car", name: "Pickup Car", icon: "gfx/entity_icons/vehicles/pickup_car.png", keywords: ["pickup", "car", "vehicles"] },
      { id: "pickup-truck", name: "Pickup Truck", icon: "gfx/entity_icons/vehicles/pickup_truck.png", keywords: ["pickup", "truck", "vehicles"] },
      { id: "police-car", name: "Police Car", icon: "gfx/entity_icons/vehicles/police_car.png", keywords: ["police", "car", "vehicles"] },
      { id: "police-van", name: "Police Van", icon: "gfx/entity_icons/vehicles/police_van.png", keywords: ["police", "van", "vehicles"] },
      { id: "racetrack-cycling", name: "Racetrack Cycling", icon: "gfx/entity_icons/vehicles/racetrack-cycling.svg", keywords: ["racetrack", "cycling", "vehicles"] },
      { id: "rail-light", name: "Rail Light", icon: "gfx/entity_icons/vehicles/rail-light.svg", keywords: ["rail", "light", "vehicles"] },
      { id: "rail-metro", name: "Rail Metro", icon: "gfx/entity_icons/vehicles/rail-metro.svg", keywords: ["rail", "metro", "vehicles"] },
      { id: "rail", name: "Rail", icon: "gfx/entity_icons/vehicles/rail.svg", keywords: ["rail", "vehicles"] },
      { id: "road-accident", name: "Road Accident", icon: "gfx/entity_icons/vehicles/road-accident.svg", keywords: ["road", "accident", "vehicles"] },
      { id: "road-sign", name: "Road Sign", icon: "gfx/entity_icons/vehicles/road-sign.svg", keywords: ["road", "sign", "vehicles"] },
      { id: "roadblock", name: "Roadblock", icon: "gfx/entity_icons/vehicles/roadblock.svg", keywords: ["roadblock", "vehicles"] },
      { id: "route-pin", name: "Route Pin", icon: "gfx/entity_icons/vehicles/route-pin.svg", keywords: ["route", "pin", "vehicles"] },
      { id: "route", name: "Route", icon: "gfx/entity_icons/vehicles/route.svg", keywords: ["route", "vehicles"] },
      { id: "rv-park", name: "Rv Park", icon: "gfx/entity_icons/vehicles/rv-park.svg", keywords: ["rv", "park", "vehicles"] },
      { id: "rv-truck", name: "Rv Truck", icon: "gfx/entity_icons/vehicles/rv-truck.svg", keywords: ["rv", "truck", "vehicles"] },
      { id: "safari", name: "Safari", icon: "gfx/entity_icons/vehicles/safari.png", keywords: ["safari", "vehicles"] },
      { id: "school-bus", name: "School Bus", icon: "gfx/entity_icons/vehicles/school_bus.png", keywords: ["school", "bus", "vehicles"] },
      { id: "scooter-electric", name: "Scooter Electric", icon: "gfx/entity_icons/vehicles/scooter-electric.svg", keywords: ["scooter", "electric", "vehicles"] },
      { id: "scooter", name: "Scooter", icon: "gfx/entity_icons/vehicles/scooter.svg", keywords: ["scooter", "vehicles"] },
      { id: "speedometer", name: "Speedometer", icon: "gfx/entity_icons/vehicles/speedometer.svg", keywords: ["speedometer", "vehicles"] },
      { id: "subway-station", name: "Subway Station", icon: "gfx/entity_icons/vehicles/subway-station.svg", keywords: ["subway", "station", "vehicles"] },
      { id: "supercar", name: "Supercar", icon: "gfx/entity_icons/vehicles/supercar.png", keywords: ["supercar", "vehicles"] },
      { id: "suv", name: "Suv", icon: "gfx/entity_icons/vehicles/suv.png", keywords: ["suv", "vehicles"] },
      { id: "suv-car", name: "Suv Car", icon: "gfx/entity_icons/vehicles/suv_car.png", keywords: ["suv", "car", "vehicles"] },
      { id: "tank-truck", name: "Tank Truck", icon: "gfx/entity_icons/vehicles/tank_truck.png", keywords: ["tank", "truck", "vehicles"] },
      { id: "taxi-stand", name: "Taxi Stand", icon: "gfx/entity_icons/vehicles/taxi-stand.svg", keywords: ["taxi", "stand", "vehicles"] },
      { id: "taxi", name: "Taxi", icon: "gfx/entity_icons/vehicles/taxi.png", keywords: ["taxi", "vehicles"] },
      { id: "taxi", name: "Taxi", icon: "gfx/entity_icons/vehicles/taxi.svg", keywords: ["taxi", "vehicles"] },
      { id: "terminal", name: "Terminal", icon: "gfx/entity_icons/vehicles/terminal.svg", keywords: ["terminal", "vehicles"] },
      { id: "toll", name: "Toll", icon: "gfx/entity_icons/vehicles/toll.svg", keywords: ["toll", "vehicles"] },
      { id: "topology-bus", name: "Topology Bus", icon: "gfx/entity_icons/vehicles/topology-bus.svg", keywords: ["topology", "bus", "vehicles"] },
      { id: "tow-truck", name: "Tow Truck", icon: "gfx/entity_icons/vehicles/tow_truck.png", keywords: ["tow", "truck", "vehicles"] },
      { id: "tractor", name: "Tractor", icon: "gfx/entity_icons/vehicles/tractor.svg", keywords: ["tractor", "vehicles"] },
      { id: "traffic-cone-off", name: "Traffic Cone Off", icon: "gfx/entity_icons/vehicles/traffic-cone-off.svg", keywords: ["traffic", "cone", "off", "vehicles"] },
      { id: "traffic-cone", name: "Traffic Cone", icon: "gfx/entity_icons/vehicles/traffic-cone.svg", keywords: ["traffic", "cone", "vehicles"] },
      { id: "traffic-lights-off", name: "Traffic Lights Off", icon: "gfx/entity_icons/vehicles/traffic-lights-off.svg", keywords: ["traffic", "lights", "off", "vehicles"] },
      { id: "traffic-lights", name: "Traffic Lights", icon: "gfx/entity_icons/vehicles/traffic-lights.svg", keywords: ["traffic", "lights", "vehicles"] },
      { id: "train-station", name: "Train Station", icon: "gfx/entity_icons/vehicles/train-station.svg", keywords: ["train", "station", "vehicles"] },
      { id: "train", name: "Train", icon: "gfx/entity_icons/vehicles/train.svg", keywords: ["train", "vehicles"] },
      { id: "transit-station", name: "Transit Station", icon: "gfx/entity_icons/vehicles/transit-station.svg", keywords: ["transit", "station", "vehicles"] },
      { id: "trolley", name: "Trolley", icon: "gfx/entity_icons/vehicles/trolley.svg", keywords: ["trolley", "vehicles"] },
      { id: "truck-delivery", name: "Truck Delivery", icon: "gfx/entity_icons/vehicles/truck-delivery.svg", keywords: ["truck", "delivery", "vehicles"] },
      { id: "truck-loading", name: "Truck Loading", icon: "gfx/entity_icons/vehicles/truck-loading.svg", keywords: ["truck", "loading", "vehicles"] },
      { id: "truck-off", name: "Truck Off", icon: "gfx/entity_icons/vehicles/truck-off.svg", keywords: ["truck", "off", "vehicles"] },
      { id: "truck-return", name: "Truck Return", icon: "gfx/entity_icons/vehicles/truck-return.svg", keywords: ["truck", "return", "vehicles"] },
      { id: "truck", name: "Truck", icon: "gfx/entity_icons/vehicles/truck.png", keywords: ["truck", "vehicles"] },
      { id: "truck", name: "Truck", icon: "gfx/entity_icons/vehicles/truck.svg", keywords: ["truck", "vehicles"] }
    ]
  },
  aviation: {
    name: "Aviation",
    color: "#60a5fa",
    defaultIcon: "gfx/entity_icons/aviation/airport.svg",
    icons: [
      { id: "airfield", name: "Airfield", icon: "gfx/entity_icons/aviation/airfield.svg", keywords: ["airfield", "aviation"] },
      { id: "airport", name: "Airport", icon: "gfx/entity_icons/aviation/airport.svg", keywords: ["airport", "aviation"] },
      { id: "belfast-city-airport-logo-2024", name: "Belfast City Airport Logo 2024", icon: "gfx/entity_icons/aviation/Belfast_City_Airport_logo_2024.png", keywords: ["belfast", "city", "airport", "logo", "2024", "aviation"] },
      { id: "bigginhillairport", name: "Bigginhillairport", icon: "gfx/entity_icons/aviation/BigginHillAirport.png", keywords: ["bigginhillairport", "aviation"] },
      { id: "birminghamairportlogo", name: "Birminghamairportlogo", icon: "gfx/entity_icons/aviation/BirminghamAirportLogo.png", keywords: ["birminghamairportlogo", "aviation"] },
      { id: "brighton-city-airport-logo", name: "Brighton City Airport Logo", icon: "gfx/entity_icons/aviation/Brighton_City_Airport_logo.png", keywords: ["brighton", "city", "airport", "logo", "aviation"] },
      { id: "bristol-airport-logo-vector", name: "Bristol Airport Logo Vector", icon: "gfx/entity_icons/aviation/Bristol_Airport_logo_vector.png", keywords: ["bristol", "airport", "logo", "vector", "aviation"] },
      { id: "building-airport", name: "Building Airport", icon: "gfx/entity_icons/aviation/building-airport.svg", keywords: ["building", "airport", "aviation"] },
      { id: "cambridge-city-airport-logo", name: "Cambridge City Airport Logo", icon: "gfx/entity_icons/aviation/Cambridge_City_Airport_logo.png", keywords: ["cambridge", "city", "airport", "logo", "aviation"] },
      { id: "cambridgeairport", name: "Cambridgeairport", icon: "gfx/entity_icons/aviation/CambridgeAirport.png", keywords: ["cambridgeairport", "aviation"] },
      { id: "cardiffairportlogo", name: "Cardiffairportlogo", icon: "gfx/entity_icons/aviation/CardiffAirportLogo.png", keywords: ["cardiffairportlogo", "aviation"] },
      { id: "cib-drone", name: "Cib Drone", icon: "gfx/entity_icons/aviation/cib-drone.svg", keywords: ["cib", "drone", "aviation"] },
      { id: "cib-telegram-plane", name: "Cib Telegram Plane", icon: "gfx/entity_icons/aviation/cib-telegram-plane.svg", keywords: ["cib", "telegram", "plane", "aviation"] },
      { id: "cil-airplane-mode-off", name: "Cil Airplane Mode Off", icon: "gfx/entity_icons/aviation/cil-airplane-mode-off.svg", keywords: ["cil", "airplane", "mode", "off", "aviation"] },
      { id: "cil-airplane-mode", name: "Cil Airplane Mode", icon: "gfx/entity_icons/aviation/cil-airplane-mode.svg", keywords: ["cil", "airplane", "mode", "aviation"] },
      { id: "cil-flight-takeoff", name: "Cil Flight Takeoff", icon: "gfx/entity_icons/aviation/cil-flight-takeoff.svg", keywords: ["cil", "flight", "takeoff", "aviation"] },
      { id: "cil-paper-plane", name: "Cil Paper Plane", icon: "gfx/entity_icons/aviation/cil-paper-plane.svg", keywords: ["cil", "paper", "plane", "aviation"] },
      { id: "drone-off", name: "Drone Off", icon: "gfx/entity_icons/aviation/drone-off.svg", keywords: ["drone", "off", "aviation"] },
      { id: "drone", name: "Drone", icon: "gfx/entity_icons/aviation/drone.svg", keywords: ["drone", "aviation"] },
      { id: "edinburghairport", name: "Edinburghairport", icon: "gfx/entity_icons/aviation/EdinburghAirport.png", keywords: ["edinburghairport", "aviation"] },
      { id: "essex-county-airport-logo", name: "Essex County Airport Logo", icon: "gfx/entity_icons/aviation/Essex_County_Airport_Logo.png", keywords: ["essex", "county", "airport", "logo", "aviation"] },
      { id: "gatwick-airport-logo", name: "Gatwick Airport Logo", icon: "gfx/entity_icons/aviation/Gatwick_Airport_logo.png", keywords: ["gatwick", "airport", "logo", "aviation"] },
      { id: "george-best-belfast-city-airport", name: "George Best Belfast City Airport", icon: "gfx/entity_icons/aviation/George_Best_Belfast_City_Airport.png", keywords: ["george", "best", "belfast", "city", "airport", "aviation"] },
      { id: "heathrow-logo-2013", name: "Heathrow Logo 2013", icon: "gfx/entity_icons/aviation/Heathrow_Logo_2013.png", keywords: ["heathrow", "logo", "2013", "aviation"] },
      { id: "helicopter-landing", name: "Helicopter Landing", icon: "gfx/entity_icons/aviation/helicopter-landing.svg", keywords: ["helicopter", "landing", "aviation"] },
      { id: "helicopter", name: "Helicopter", icon: "gfx/entity_icons/aviation/helicopter.svg", keywords: ["helicopter", "aviation"] },
      { id: "heliport", name: "Heliport", icon: "gfx/entity_icons/aviation/heliport.svg", keywords: ["heliport", "aviation"] },
      { id: "jer-airport-logo", name: "Jer Airport Logo", icon: "gfx/entity_icons/aviation/JER_airport_logo.png", keywords: ["jer", "airport", "logo", "aviation"] },
      { id: "jersey-airport-l", name: "Jersey Airport L", icon: "gfx/entity_icons/aviation/Jersey_Airport_L.png", keywords: ["jersey", "airport", "aviation"] },
      { id: "jetpack", name: "Jetpack", icon: "gfx/entity_icons/aviation/jetpack.svg", keywords: ["jetpack", "aviation"] },
      { id: "lgw-airport-logo", name: "Lgw Airport Logo", icon: "gfx/entity_icons/aviation/LGW_airport_logo.png", keywords: ["lgw", "airport", "logo", "aviation"] },
      { id: "london-city-airport-logo", name: "London City Airport Logo", icon: "gfx/entity_icons/aviation/London_City_Airport_logo.png", keywords: ["london", "city", "airport", "logo", "aviation"] },
      { id: "london-luton-airport-logo", name: "London Luton Airport Logo", icon: "gfx/entity_icons/aviation/London_Luton_Airport_Logo.png", keywords: ["london", "luton", "airport", "logo", "aviation"] },
      { id: "london-luton-airport-logo-2014", name: "London Luton Airport Logo 2014", icon: "gfx/entity_icons/aviation/London_Luton_Airport_logo_2014.png", keywords: ["london", "luton", "airport", "logo", "2014", "aviation"] },
      { id: "londonlutonairportoriginal", name: "Londonlutonairportoriginal", icon: "gfx/entity_icons/aviation/LondonLutonAirportOriginal.png", keywords: ["londonlutonairportoriginal", "aviation"] },
      { id: "luton-airport-logo", name: "Luton Airport Logo", icon: "gfx/entity_icons/aviation/Luton_Airport_logo.png", keywords: ["luton", "airport", "logo", "aviation"] },
      { id: "manchester-airports-group-logo", name: "Manchester Airports Group Logo", icon: "gfx/entity_icons/aviation/Manchester_Airports_Group_logo.png", keywords: ["manchester", "airports", "group", "logo", "aviation"] },
      { id: "parachute-off", name: "Parachute Off", icon: "gfx/entity_icons/aviation/parachute-off.svg", keywords: ["parachute", "off", "aviation"] },
      { id: "parachute", name: "Parachute", icon: "gfx/entity_icons/aviation/parachute.svg", keywords: ["parachute", "aviation"] },
      { id: "plane-arrival", name: "Plane Arrival", icon: "gfx/entity_icons/aviation/plane-arrival.svg", keywords: ["plane", "arrival", "aviation"] },
      { id: "plane-departure", name: "Plane Departure", icon: "gfx/entity_icons/aviation/plane-departure.svg", keywords: ["plane", "departure", "aviation"] },
      { id: "plane-inflight", name: "Plane Inflight", icon: "gfx/entity_icons/aviation/plane-inflight.svg", keywords: ["plane", "inflight", "aviation"] },
      { id: "plane-off", name: "Plane Off", icon: "gfx/entity_icons/aviation/plane-off.svg", keywords: ["plane", "off", "aviation"] },
      { id: "plane-tilt", name: "Plane Tilt", icon: "gfx/entity_icons/aviation/plane-tilt.svg", keywords: ["plane", "tilt", "aviation"] },
      { id: "plane", name: "Plane", icon: "gfx/entity_icons/aviation/plane.svg", keywords: ["plane", "aviation"] },
      { id: "propeller-off", name: "Propeller Off", icon: "gfx/entity_icons/aviation/propeller-off.svg", keywords: ["propeller", "off", "aviation"] },
      { id: "propeller", name: "Propeller", icon: "gfx/entity_icons/aviation/propeller.svg", keywords: ["propeller", "aviation"] },
      { id: "rocket-fill", name: "Rocket Fill", icon: "gfx/entity_icons/aviation/rocket-fill.svg", keywords: ["rocket", "fill", "aviation"] },
      { id: "rocket-off", name: "Rocket Off", icon: "gfx/entity_icons/aviation/rocket-off.svg", keywords: ["rocket", "off", "aviation"] },
      { id: "rocket-takeoff-fill", name: "Rocket Takeoff Fill", icon: "gfx/entity_icons/aviation/rocket-takeoff-fill.svg", keywords: ["rocket", "takeoff", "fill", "aviation"] },
      { id: "rocket-takeoff", name: "Rocket Takeoff", icon: "gfx/entity_icons/aviation/rocket-takeoff.svg", keywords: ["rocket", "takeoff", "aviation"] },
      { id: "rocket", name: "Rocket", icon: "gfx/entity_icons/aviation/rocket.svg", keywords: ["rocket", "aviation"] }
    ]
  },
  maritime: {
    name: "Maritime",
    color: "#22d3ee",
    defaultIcon: "gfx/entity_icons/maritime/ferry.svg",
    icons: [
      { id: "anchor-off", name: "Anchor Off", icon: "gfx/entity_icons/maritime/anchor-off.svg", keywords: ["anchor", "off", "maritime"] },
      { id: "anchor", name: "Anchor", icon: "gfx/entity_icons/maritime/anchor.svg", keywords: ["anchor", "maritime"] },
      { id: "beach", name: "Beach", icon: "gfx/entity_icons/maritime/beach.svg", keywords: ["beach", "maritime"] },
      { id: "boat-ramp", name: "Boat Ramp", icon: "gfx/entity_icons/maritime/boat-ramp.svg", keywords: ["boat", "ramp", "maritime"] },
      { id: "boat-tour", name: "Boat Tour", icon: "gfx/entity_icons/maritime/boat-tour.svg", keywords: ["boat", "tour", "maritime"] },
      { id: "boating", name: "Boating", icon: "gfx/entity_icons/maritime/boating.svg", keywords: ["boating", "maritime"] },
      { id: "canoe", name: "Canoe", icon: "gfx/entity_icons/maritime/canoe.svg", keywords: ["canoe", "maritime"] },
      { id: "cil-boat-alt", name: "Cil Boat Alt", icon: "gfx/entity_icons/maritime/cil-boat-alt.svg", keywords: ["cil", "boat", "alt", "maritime"] },
      { id: "cil-rowing", name: "Cil Rowing", icon: "gfx/entity_icons/maritime/cil-rowing.svg", keywords: ["cil", "rowing", "maritime"] },
      { id: "diving", name: "Diving", icon: "gfx/entity_icons/maritime/diving.svg", keywords: ["diving", "maritime"] },
      { id: "ferry-jp", name: "Ferry Jp", icon: "gfx/entity_icons/maritime/ferry-JP.svg", keywords: ["ferry", "jp", "maritime"] },
      { id: "ferry", name: "Ferry", icon: "gfx/entity_icons/maritime/ferry.svg", keywords: ["ferry", "maritime"] },
      { id: "fish-cleaning", name: "Fish Cleaning", icon: "gfx/entity_icons/maritime/fish-cleaning.svg", keywords: ["fish", "cleaning", "maritime"] },
      { id: "fishing-pier", name: "Fishing Pier", icon: "gfx/entity_icons/maritime/fishing-pier.svg", keywords: ["fishing", "pier", "maritime"] },
      { id: "fishing", name: "Fishing", icon: "gfx/entity_icons/maritime/fishing.svg", keywords: ["fishing", "maritime"] },
      { id: "harbor", name: "Harbor", icon: "gfx/entity_icons/maritime/harbor.svg", keywords: ["harbor", "maritime"] },
      { id: "hot-spring", name: "Hot Spring", icon: "gfx/entity_icons/maritime/hot-spring.svg", keywords: ["hot", "spring", "maritime"] },
      { id: "ice-fishing", name: "Ice Fishing", icon: "gfx/entity_icons/maritime/ice-fishing.svg", keywords: ["ice", "fishing", "maritime"] },
      { id: "jet-skiing", name: "Jet Skiing", icon: "gfx/entity_icons/maritime/jet-skiing.svg", keywords: ["jet", "skiing", "maritime"] },
      { id: "kayak", name: "Kayak", icon: "gfx/entity_icons/maritime/kayak.svg", keywords: ["kayak", "maritime"] },
      { id: "kayaking", name: "Kayaking", icon: "gfx/entity_icons/maritime/kayaking.svg", keywords: ["kayaking", "maritime"] },
      { id: "lifebuoy-off", name: "Lifebuoy Off", icon: "gfx/entity_icons/maritime/lifebuoy-off.svg", keywords: ["lifebuoy", "off", "maritime"] },
      { id: "lifebuoy", name: "Lifebuoy", icon: "gfx/entity_icons/maritime/lifebuoy.svg", keywords: ["lifebuoy", "maritime"] },
      { id: "marina", name: "Marina", icon: "gfx/entity_icons/maritime/marina.svg", keywords: ["marina", "maritime"] },
      { id: "racetrack-boat", name: "Racetrack Boat", icon: "gfx/entity_icons/maritime/racetrack-boat.svg", keywords: ["racetrack", "boat", "maritime"] },
      { id: "rafting", name: "Rafting", icon: "gfx/entity_icons/maritime/rafting.svg", keywords: ["rafting", "maritime"] },
      { id: "sailing", name: "Sailing", icon: "gfx/entity_icons/maritime/sailing.svg", keywords: ["sailing", "maritime"] },
      { id: "scuba-diving-tank", name: "Scuba Diving Tank", icon: "gfx/entity_icons/maritime/scuba-diving-tank.svg", keywords: ["scuba", "diving", "tank", "maritime"] },
      { id: "scuba-diving", name: "Scuba Diving", icon: "gfx/entity_icons/maritime/scuba-diving.svg", keywords: ["scuba", "diving", "maritime"] },
      { id: "scuba-mask-off", name: "Scuba Mask Off", icon: "gfx/entity_icons/maritime/scuba-mask-off.svg", keywords: ["scuba", "mask", "off", "maritime"] },
      { id: "scuba-mask", name: "Scuba Mask", icon: "gfx/entity_icons/maritime/scuba-mask.svg", keywords: ["scuba", "mask", "maritime"] },
      { id: "ship-off", name: "Ship Off", icon: "gfx/entity_icons/maritime/ship-off.svg", keywords: ["ship", "off", "maritime"] },
      { id: "ship", name: "Ship", icon: "gfx/entity_icons/maritime/ship.svg", keywords: ["ship", "maritime"] },
      { id: "slipway", name: "Slipway", icon: "gfx/entity_icons/maritime/slipway.svg", keywords: ["slipway", "maritime"] },
      { id: "submarine", name: "Submarine", icon: "gfx/entity_icons/maritime/submarine.svg", keywords: ["submarine", "maritime"] },
      { id: "surfing", name: "Surfing", icon: "gfx/entity_icons/maritime/surfing.svg", keywords: ["surfing", "maritime"] },
      { id: "swimming", name: "Swimming", icon: "gfx/entity_icons/maritime/swimming.svg", keywords: ["swimming", "maritime"] },
      { id: "water", name: "Water", icon: "gfx/entity_icons/maritime/water.svg", keywords: ["water", "maritime"] },
      { id: "waterfall", name: "Waterfall", icon: "gfx/entity_icons/maritime/waterfall.svg", keywords: ["waterfall", "maritime"] },
      { id: "watermill", name: "Watermill", icon: "gfx/entity_icons/maritime/watermill.svg", keywords: ["watermill", "maritime"] },
      { id: "waterskiing", name: "Waterskiing", icon: "gfx/entity_icons/maritime/waterskiing.svg", keywords: ["waterskiing", "maritime"] },
      { id: "wetland", name: "Wetland", icon: "gfx/entity_icons/maritime/wetland.svg", keywords: ["wetland", "maritime"] },
      { id: "whale-watching", name: "Whale Watching", icon: "gfx/entity_icons/maritime/whale-watching.svg", keywords: ["whale", "watching", "maritime"] },
      { id: "wind-surfing", name: "Wind Surfing", icon: "gfx/entity_icons/maritime/wind-surfing.svg", keywords: ["wind", "surfing", "maritime"] }
    ]
  },
  military: {
    name: "Military / Ops",
    color: "#94a3b8",
    defaultIcon: "gfx/entity_icons/military/danger.svg",
    icons: [
      { id: "axe", name: "Axe", icon: "gfx/entity_icons/military/axe.svg", keywords: ["axe", "military"] },
      { id: "bomb", name: "Bomb", icon: "gfx/entity_icons/military/bomb.svg", keywords: ["bomb", "military"] },
      { id: "caution", name: "Caution", icon: "gfx/entity_icons/military/caution.svg", keywords: ["caution", "military"] },
      { id: "cib-html5-shield", name: "Cib Html5 Shield", icon: "gfx/entity_icons/military/cib-html5-shield.svg", keywords: ["cib", "html5", "shield", "military"] },
      { id: "cil-shield-alt", name: "Cil Shield Alt", icon: "gfx/entity_icons/military/cil-shield-alt.svg", keywords: ["cil", "shield", "alt", "military"] },
      { id: "clock-shield", name: "Clock Shield", icon: "gfx/entity_icons/military/clock-shield.svg", keywords: ["clock", "shield", "military"] },
      { id: "compass", name: "Compass", icon: "gfx/entity_icons/military/compass.svg", keywords: ["compass", "military"] },
      { id: "crosshair", name: "Crosshair", icon: "gfx/entity_icons/military/crosshair.svg", keywords: ["crosshair", "military"] },
      { id: "crosshairs", name: "Crosshairs", icon: "gfx/entity_icons/military/crosshairs.svg", keywords: ["crosshairs", "military"] },
      { id: "danger", name: "Danger", icon: "gfx/entity_icons/military/danger.svg", keywords: ["danger", "military"] },
      { id: "file-text-shield", name: "File Text Shield", icon: "gfx/entity_icons/military/file-text-shield.svg", keywords: ["file", "text", "shield", "military"] },
      { id: "fork-knife", name: "Fork Knife", icon: "gfx/entity_icons/military/fork-knife.svg", keywords: ["fork", "knife", "military"] },
      { id: "home-shield", name: "Home Shield", icon: "gfx/entity_icons/military/home-shield.svg", keywords: ["home", "shield", "military"] },
      { id: "military-award", name: "Military Award", icon: "gfx/entity_icons/military/military-award.svg", keywords: ["military", "award"] },
      { id: "military-rank", name: "Military Rank", icon: "gfx/entity_icons/military/military-rank.svg", keywords: ["military", "rank"] },
      { id: "photo-shield", name: "Photo Shield", icon: "gfx/entity_icons/military/photo-shield.svg", keywords: ["photo", "shield", "military"] },
      { id: "sheild", name: "Sheild", icon: "gfx/entity_icons/military/sheild.svg", keywords: ["sheild", "military"] },
      { id: "shield-bolt", name: "Shield Bolt", icon: "gfx/entity_icons/military/shield-bolt.svg", keywords: ["shield", "bolt", "military"] },
      { id: "shield-cancel", name: "Shield Cancel", icon: "gfx/entity_icons/military/shield-cancel.svg", keywords: ["shield", "cancel", "military"] },
      { id: "shield-check", name: "Shield Check", icon: "gfx/entity_icons/military/shield-check.svg", keywords: ["shield", "check", "military"] },
      { id: "shield-checkered", name: "Shield Checkered", icon: "gfx/entity_icons/military/shield-checkered.svg", keywords: ["shield", "checkered", "military"] },
      { id: "shield-chevron", name: "Shield Chevron", icon: "gfx/entity_icons/military/shield-chevron.svg", keywords: ["shield", "chevron", "military"] },
      { id: "shield-code", name: "Shield Code", icon: "gfx/entity_icons/military/shield-code.svg", keywords: ["shield", "code", "military"] },
      { id: "shield-cog", name: "Shield Cog", icon: "gfx/entity_icons/military/shield-cog.svg", keywords: ["shield", "cog", "military"] },
      { id: "shield-dollar", name: "Shield Dollar", icon: "gfx/entity_icons/military/shield-dollar.svg", keywords: ["shield", "dollar", "military"] },
      { id: "shield-down", name: "Shield Down", icon: "gfx/entity_icons/military/shield-down.svg", keywords: ["shield", "down", "military"] },
      { id: "shield-exclamation", name: "Shield Exclamation", icon: "gfx/entity_icons/military/shield-exclamation.svg", keywords: ["shield", "exclamation", "military"] },
      { id: "shield-fill-check", name: "Shield Fill Check", icon: "gfx/entity_icons/military/shield-fill-check.svg", keywords: ["shield", "fill", "check", "military"] },
      { id: "shield-fill-exclamation", name: "Shield Fill Exclamation", icon: "gfx/entity_icons/military/shield-fill-exclamation.svg", keywords: ["shield", "fill", "exclamation", "military"] },
      { id: "shield-fill-minus", name: "Shield Fill Minus", icon: "gfx/entity_icons/military/shield-fill-minus.svg", keywords: ["shield", "fill", "minus", "military"] },
      { id: "shield-fill-plus", name: "Shield Fill Plus", icon: "gfx/entity_icons/military/shield-fill-plus.svg", keywords: ["shield", "fill", "plus", "military"] },
      { id: "shield-fill-x", name: "Shield Fill X", icon: "gfx/entity_icons/military/shield-fill-x.svg", keywords: ["shield", "fill", "military"] },
      { id: "shield-fill", name: "Shield Fill", icon: "gfx/entity_icons/military/shield-fill.svg", keywords: ["shield", "fill", "military"] },
      { id: "shield-half", name: "Shield Half", icon: "gfx/entity_icons/military/shield-half.svg", keywords: ["shield", "half", "military"] },
      { id: "shield-heart", name: "Shield Heart", icon: "gfx/entity_icons/military/shield-heart.svg", keywords: ["shield", "heart", "military"] },
      { id: "shield-lock-fill", name: "Shield Lock Fill", icon: "gfx/entity_icons/military/shield-lock-fill.svg", keywords: ["shield", "lock", "fill", "military"] },
      { id: "shield-lock", name: "Shield Lock", icon: "gfx/entity_icons/military/shield-lock.svg", keywords: ["shield", "lock", "military"] },
      { id: "shield-minus", name: "Shield Minus", icon: "gfx/entity_icons/military/shield-minus.svg", keywords: ["shield", "minus", "military"] },
      { id: "shield-off", name: "Shield Off", icon: "gfx/entity_icons/military/shield-off.svg", keywords: ["shield", "off", "military"] },
      { id: "shield-pause", name: "Shield Pause", icon: "gfx/entity_icons/military/shield-pause.svg", keywords: ["shield", "pause", "military"] },
      { id: "shield-pin", name: "Shield Pin", icon: "gfx/entity_icons/military/shield-pin.svg", keywords: ["shield", "pin", "military"] },
      { id: "shield-plus", name: "Shield Plus", icon: "gfx/entity_icons/military/shield-plus.svg", keywords: ["shield", "plus", "military"] },
      { id: "shield-question", name: "Shield Question", icon: "gfx/entity_icons/military/shield-question.svg", keywords: ["shield", "question", "military"] },
      { id: "shield-search", name: "Shield Search", icon: "gfx/entity_icons/military/shield-search.svg", keywords: ["shield", "search", "military"] },
      { id: "shield-shaded", name: "Shield Shaded", icon: "gfx/entity_icons/military/shield-shaded.svg", keywords: ["shield", "shaded", "military"] },
      { id: "shield-share", name: "Shield Share", icon: "gfx/entity_icons/military/shield-share.svg", keywords: ["shield", "share", "military"] },
      { id: "shield-slash-fill", name: "Shield Slash Fill", icon: "gfx/entity_icons/military/shield-slash-fill.svg", keywords: ["shield", "slash", "fill", "military"] },
      { id: "shield-slash", name: "Shield Slash", icon: "gfx/entity_icons/military/shield-slash.svg", keywords: ["shield", "slash", "military"] },
      { id: "shield-star", name: "Shield Star", icon: "gfx/entity_icons/military/shield-star.svg", keywords: ["shield", "star", "military"] },
      { id: "shield-up", name: "Shield Up", icon: "gfx/entity_icons/military/shield-up.svg", keywords: ["shield", "up", "military"] },
      { id: "shield-x", name: "Shield X", icon: "gfx/entity_icons/military/shield-x.svg", keywords: ["shield", "military"] },
      { id: "shield", name: "Shield", icon: "gfx/entity_icons/military/shield.svg", keywords: ["shield", "military"] },
      { id: "sword-off", name: "Sword Off", icon: "gfx/entity_icons/military/sword-off.svg", keywords: ["sword", "off", "military"] },
      { id: "sword", name: "Sword", icon: "gfx/entity_icons/military/sword.svg", keywords: ["sword", "military"] },
      { id: "swords", name: "Swords", icon: "gfx/entity_icons/military/swords.svg", keywords: ["swords", "military"] },
      { id: "user-shield", name: "User Shield", icon: "gfx/entity_icons/military/user-shield.svg", keywords: ["user", "shield", "military"] },
      { id: "viewing", name: "Viewing", icon: "gfx/entity_icons/military/viewing.svg", keywords: ["viewing", "military"] },
      { id: "viewpoint", name: "Viewpoint", icon: "gfx/entity_icons/military/viewpoint.svg", keywords: ["viewpoint", "military"] }
    ]
  },
  communication: {
    name: "Communication",
    color: "#a78bfa",
    defaultIcon: "gfx/entity_icons/communication/telephone.svg",
    icons: [
      { id: "agenda", name: "Agenda", icon: "gfx/entity_icons/communication/agenda.png", keywords: ["agenda", "communication"] },
      { id: "alert", name: "Alert", icon: "gfx/entity_icons/communication/alert.png", keywords: ["alert", "communication"] },
      { id: "amazon", name: "Amazon", icon: "gfx/entity_icons/communication/amazon.png", keywords: ["amazon", "communication"] },
      { id: "android", name: "Android", icon: "gfx/entity_icons/communication/android.png", keywords: ["android", "communication"] },
      { id: "antenna-bars-1", name: "Antenna Bars 1", icon: "gfx/entity_icons/communication/antenna-bars-1.svg", keywords: ["antenna", "bars", "communication"] },
      { id: "antenna-bars-2", name: "Antenna Bars 2", icon: "gfx/entity_icons/communication/antenna-bars-2.svg", keywords: ["antenna", "bars", "communication"] },
      { id: "antenna-bars-3", name: "Antenna Bars 3", icon: "gfx/entity_icons/communication/antenna-bars-3.svg", keywords: ["antenna", "bars", "communication"] },
      { id: "antenna-bars-4", name: "Antenna Bars 4", icon: "gfx/entity_icons/communication/antenna-bars-4.svg", keywords: ["antenna", "bars", "communication"] },
      { id: "antenna-bars-5", name: "Antenna Bars 5", icon: "gfx/entity_icons/communication/antenna-bars-5.svg", keywords: ["antenna", "bars", "communication"] },
      { id: "antenna-bars-off", name: "Antenna Bars Off", icon: "gfx/entity_icons/communication/antenna-bars-off.svg", keywords: ["antenna", "bars", "off", "communication"] },
      { id: "antenna-off", name: "Antenna Off", icon: "gfx/entity_icons/communication/antenna-off.svg", keywords: ["antenna", "off", "communication"] },
      { id: "antenna", name: "Antenna", icon: "gfx/entity_icons/communication/antenna.svg", keywords: ["antenna", "communication"] },
      { id: "arroba", name: "Arroba", icon: "gfx/entity_icons/communication/arroba.png", keywords: ["arroba", "communication"] },
      { id: "assistive-listening-system", name: "Assistive Listening System", icon: "gfx/entity_icons/communication/assistive-listening-system.svg", keywords: ["assistive", "listening", "system", "communication"] },
      { id: "audio-description", name: "Audio Description", icon: "gfx/entity_icons/communication/audio-description.svg", keywords: ["audio", "description", "communication"] },
      { id: "barcode-off", name: "Barcode Off", icon: "gfx/entity_icons/communication/barcode-off.svg", keywords: ["barcode", "off", "communication"] },
      { id: "barcode", name: "Barcode", icon: "gfx/entity_icons/communication/barcode.svg", keywords: ["barcode", "communication"] },
      { id: "battery", name: "Battery", icon: "gfx/entity_icons/communication/battery.png", keywords: ["battery", "communication"] },
      { id: "battery-charge", name: "Battery Charge", icon: "gfx/entity_icons/communication/battery_charge.png", keywords: ["battery", "charge", "communication"] },
      { id: "behance", name: "Behance", icon: "gfx/entity_icons/communication/behance.png", keywords: ["behance", "communication"] },
      { id: "bell-bolt", name: "Bell Bolt", icon: "gfx/entity_icons/communication/bell-bolt.svg", keywords: ["bell", "bolt", "communication"] },
      { id: "bell-cancel", name: "Bell Cancel", icon: "gfx/entity_icons/communication/bell-cancel.svg", keywords: ["bell", "cancel", "communication"] },
      { id: "bell-check", name: "Bell Check", icon: "gfx/entity_icons/communication/bell-check.svg", keywords: ["bell", "check", "communication"] },
      { id: "bell-code", name: "Bell Code", icon: "gfx/entity_icons/communication/bell-code.svg", keywords: ["bell", "code", "communication"] },
      { id: "bell-cog", name: "Bell Cog", icon: "gfx/entity_icons/communication/bell-cog.svg", keywords: ["bell", "cog", "communication"] },
      { id: "bell-dollar", name: "Bell Dollar", icon: "gfx/entity_icons/communication/bell-dollar.svg", keywords: ["bell", "dollar", "communication"] },
      { id: "bell-down", name: "Bell Down", icon: "gfx/entity_icons/communication/bell-down.svg", keywords: ["bell", "down", "communication"] },
      { id: "bell-exclamation", name: "Bell Exclamation", icon: "gfx/entity_icons/communication/bell-exclamation.svg", keywords: ["bell", "exclamation", "communication"] },
      { id: "bell-fill", name: "Bell Fill", icon: "gfx/entity_icons/communication/bell-fill.svg", keywords: ["bell", "fill", "communication"] },
      { id: "bell-heart", name: "Bell Heart", icon: "gfx/entity_icons/communication/bell-heart.svg", keywords: ["bell", "heart", "communication"] },
      { id: "bell-minus", name: "Bell Minus", icon: "gfx/entity_icons/communication/bell-minus.svg", keywords: ["bell", "minus", "communication"] },
      { id: "bell-off", name: "Bell Off", icon: "gfx/entity_icons/communication/bell-off.svg", keywords: ["bell", "off", "communication"] },
      { id: "bell-pause", name: "Bell Pause", icon: "gfx/entity_icons/communication/bell-pause.svg", keywords: ["bell", "pause", "communication"] },
      { id: "bell-pin", name: "Bell Pin", icon: "gfx/entity_icons/communication/bell-pin.svg", keywords: ["bell", "pin", "communication"] },
      { id: "bell-plus", name: "Bell Plus", icon: "gfx/entity_icons/communication/bell-plus.svg", keywords: ["bell", "plus", "communication"] },
      { id: "bell-question", name: "Bell Question", icon: "gfx/entity_icons/communication/bell-question.svg", keywords: ["bell", "question", "communication"] },
      { id: "bell-ringing-2", name: "Bell Ringing 2", icon: "gfx/entity_icons/communication/bell-ringing-2.svg", keywords: ["bell", "ringing", "communication"] },
      { id: "bell-ringing", name: "Bell Ringing", icon: "gfx/entity_icons/communication/bell-ringing.svg", keywords: ["bell", "ringing", "communication"] },
      { id: "bell-school", name: "Bell School", icon: "gfx/entity_icons/communication/bell-school.svg", keywords: ["bell", "school", "communication"] },
      { id: "bell-search", name: "Bell Search", icon: "gfx/entity_icons/communication/bell-search.svg", keywords: ["bell", "search", "communication"] },
      { id: "bell-share", name: "Bell Share", icon: "gfx/entity_icons/communication/bell-share.svg", keywords: ["bell", "share", "communication"] },
      { id: "bell-slash-fill", name: "Bell Slash Fill", icon: "gfx/entity_icons/communication/bell-slash-fill.svg", keywords: ["bell", "slash", "fill", "communication"] },
      { id: "bell-slash", name: "Bell Slash", icon: "gfx/entity_icons/communication/bell-slash.svg", keywords: ["bell", "slash", "communication"] },
      { id: "bell-star", name: "Bell Star", icon: "gfx/entity_icons/communication/bell-star.svg", keywords: ["bell", "star", "communication"] },
      { id: "bell-up", name: "Bell Up", icon: "gfx/entity_icons/communication/bell-up.svg", keywords: ["bell", "up", "communication"] },
      { id: "bell-x", name: "Bell X", icon: "gfx/entity_icons/communication/bell-x.svg", keywords: ["bell", "communication"] },
      { id: "bell-z", name: "Bell Z", icon: "gfx/entity_icons/communication/bell-z.svg", keywords: ["bell", "communication"] },
      { id: "bell", name: "Bell", icon: "gfx/entity_icons/communication/bell.svg", keywords: ["bell", "communication"] },
      { id: "bing", name: "Bing", icon: "gfx/entity_icons/communication/bing.png", keywords: ["bing", "communication"] },
      { id: "bluetooth-connected", name: "Bluetooth Connected", icon: "gfx/entity_icons/communication/bluetooth-connected.svg", keywords: ["bluetooth", "connected", "communication"] },
      { id: "bluetooth-off", name: "Bluetooth Off", icon: "gfx/entity_icons/communication/bluetooth-off.svg", keywords: ["bluetooth", "off", "communication"] },
      { id: "bluetooth-x", name: "Bluetooth X", icon: "gfx/entity_icons/communication/bluetooth-x.svg", keywords: ["bluetooth", "communication"] },
      { id: "bluetooth", name: "Bluetooth", icon: "gfx/entity_icons/communication/bluetooth.svg", keywords: ["bluetooth", "communication"] },
      { id: "box", name: "Box", icon: "gfx/entity_icons/communication/box.png", keywords: ["box", "communication"] },
      { id: "braille", name: "Braille", icon: "gfx/entity_icons/communication/braille.svg", keywords: ["braille", "communication"] },
      { id: "brand-apple-podcast", name: "Brand Apple Podcast", icon: "gfx/entity_icons/communication/brand-apple-podcast.svg", keywords: ["brand", "apple", "podcast", "communication"] },
      { id: "brand-telegram", name: "Brand Telegram", icon: "gfx/entity_icons/communication/brand-telegram.svg", keywords: ["brand", "telegram", "communication"] },
      { id: "brand-whatsapp", name: "Brand Whatsapp", icon: "gfx/entity_icons/communication/brand-whatsapp.svg", keywords: ["brand", "whatsapp", "communication"] },
      { id: "broadcast-off", name: "Broadcast Off", icon: "gfx/entity_icons/communication/broadcast-off.svg", keywords: ["broadcast", "off", "communication"] },
      { id: "broadcast-pin", name: "Broadcast Pin", icon: "gfx/entity_icons/communication/broadcast-pin.svg", keywords: ["broadcast", "pin", "communication"] },
      { id: "broadcast", name: "Broadcast", icon: "gfx/entity_icons/communication/broadcast.svg", keywords: ["broadcast", "communication"] },
      { id: "broken-smartphone", name: "Broken Smartphone", icon: "gfx/entity_icons/communication/broken_smartphone.png", keywords: ["broken", "smartphone", "communication"] },
      { id: "bubble-minus", name: "Bubble Minus", icon: "gfx/entity_icons/communication/bubble-minus.svg", keywords: ["bubble", "minus", "communication"] },
      { id: "bubble-plus", name: "Bubble Plus", icon: "gfx/entity_icons/communication/bubble-plus.svg", keywords: ["bubble", "plus", "communication"] },
      { id: "bubble-tea-2", name: "Bubble Tea 2", icon: "gfx/entity_icons/communication/bubble-tea-2.svg", keywords: ["bubble", "tea", "communication"] },
      { id: "bubble-tea", name: "Bubble Tea", icon: "gfx/entity_icons/communication/bubble-tea.svg", keywords: ["bubble", "tea", "communication"] },
      { id: "bubble-text", name: "Bubble Text", icon: "gfx/entity_icons/communication/bubble-text.svg", keywords: ["bubble", "text", "communication"] },
      { id: "bubble-x", name: "Bubble X", icon: "gfx/entity_icons/communication/bubble-x.svg", keywords: ["bubble", "communication"] },
      { id: "bubble", name: "Bubble", icon: "gfx/entity_icons/communication/bubble.svg", keywords: ["bubble", "communication"] },
      { id: "buffer", name: "Buffer", icon: "gfx/entity_icons/communication/buffer.png", keywords: ["buffer", "communication"] },
      { id: "building-broadcast-tower", name: "Building Broadcast Tower", icon: "gfx/entity_icons/communication/building-broadcast-tower.svg", keywords: ["building", "broadcast", "tower", "communication"] },
      { id: "cell-signal-1", name: "Cell Signal 1", icon: "gfx/entity_icons/communication/cell-signal-1.svg", keywords: ["cell", "signal", "communication"] },
      { id: "cell-signal-2", name: "Cell Signal 2", icon: "gfx/entity_icons/communication/cell-signal-2.svg", keywords: ["cell", "signal", "communication"] },
      { id: "cell-signal-3", name: "Cell Signal 3", icon: "gfx/entity_icons/communication/cell-signal-3.svg", keywords: ["cell", "signal", "communication"] },
      { id: "cell-signal-4", name: "Cell Signal 4", icon: "gfx/entity_icons/communication/cell-signal-4.svg", keywords: ["cell", "signal", "communication"] },
      { id: "cell-signal-5", name: "Cell Signal 5", icon: "gfx/entity_icons/communication/cell-signal-5.svg", keywords: ["cell", "signal", "communication"] },
      { id: "cell-signal-off", name: "Cell Signal Off", icon: "gfx/entity_icons/communication/cell-signal-off.svg", keywords: ["cell", "signal", "off", "communication"] },
      { id: "chart-bubble", name: "Chart Bubble", icon: "gfx/entity_icons/communication/chart-bubble.svg", keywords: ["chart", "bubble", "communication"] },
      { id: "chat-dots-fill", name: "Chat Dots Fill", icon: "gfx/entity_icons/communication/chat-dots-fill.svg", keywords: ["chat", "dots", "fill", "communication"] },
      { id: "chat-dots", name: "Chat Dots", icon: "gfx/entity_icons/communication/chat-dots.svg", keywords: ["chat", "dots", "communication"] },
      { id: "chat-fill", name: "Chat Fill", icon: "gfx/entity_icons/communication/chat-fill.svg", keywords: ["chat", "fill", "communication"] },
      { id: "chat-heart-fill", name: "Chat Heart Fill", icon: "gfx/entity_icons/communication/chat-heart-fill.svg", keywords: ["chat", "heart", "fill", "communication"] },
      { id: "chat-heart", name: "Chat Heart", icon: "gfx/entity_icons/communication/chat-heart.svg", keywords: ["chat", "heart", "communication"] },
      { id: "chat-left-dots-fill", name: "Chat Left Dots Fill", icon: "gfx/entity_icons/communication/chat-left-dots-fill.svg", keywords: ["chat", "left", "dots", "fill", "communication"] },
      { id: "chat-left-dots", name: "Chat Left Dots", icon: "gfx/entity_icons/communication/chat-left-dots.svg", keywords: ["chat", "left", "dots", "communication"] },
      { id: "chat-left-fill", name: "Chat Left Fill", icon: "gfx/entity_icons/communication/chat-left-fill.svg", keywords: ["chat", "left", "fill", "communication"] },
      { id: "chat-left-heart-fill", name: "Chat Left Heart Fill", icon: "gfx/entity_icons/communication/chat-left-heart-fill.svg", keywords: ["chat", "left", "heart", "fill", "communication"] },
      { id: "chat-left-heart", name: "Chat Left Heart", icon: "gfx/entity_icons/communication/chat-left-heart.svg", keywords: ["chat", "left", "heart", "communication"] },
      { id: "chat-left-quote-fill", name: "Chat Left Quote Fill", icon: "gfx/entity_icons/communication/chat-left-quote-fill.svg", keywords: ["chat", "left", "quote", "fill", "communication"] },
      { id: "chat-left-quote", name: "Chat Left Quote", icon: "gfx/entity_icons/communication/chat-left-quote.svg", keywords: ["chat", "left", "quote", "communication"] },
      { id: "chat-left-text-fill", name: "Chat Left Text Fill", icon: "gfx/entity_icons/communication/chat-left-text-fill.svg", keywords: ["chat", "left", "text", "fill", "communication"] },
      { id: "chat-left-text", name: "Chat Left Text", icon: "gfx/entity_icons/communication/chat-left-text.svg", keywords: ["chat", "left", "text", "communication"] },
      { id: "chat-left", name: "Chat Left", icon: "gfx/entity_icons/communication/chat-left.svg", keywords: ["chat", "left", "communication"] },
      { id: "chat-quote-fill", name: "Chat Quote Fill", icon: "gfx/entity_icons/communication/chat-quote-fill.svg", keywords: ["chat", "quote", "fill", "communication"] },
      { id: "chat-quote", name: "Chat Quote", icon: "gfx/entity_icons/communication/chat-quote.svg", keywords: ["chat", "quote", "communication"] },
      { id: "chat-right-dots-fill", name: "Chat Right Dots Fill", icon: "gfx/entity_icons/communication/chat-right-dots-fill.svg", keywords: ["chat", "right", "dots", "fill", "communication"] },
      { id: "chat-right-dots", name: "Chat Right Dots", icon: "gfx/entity_icons/communication/chat-right-dots.svg", keywords: ["chat", "right", "dots", "communication"] },
      { id: "chat-right-fill", name: "Chat Right Fill", icon: "gfx/entity_icons/communication/chat-right-fill.svg", keywords: ["chat", "right", "fill", "communication"] },
      { id: "chat-right-heart-fill", name: "Chat Right Heart Fill", icon: "gfx/entity_icons/communication/chat-right-heart-fill.svg", keywords: ["chat", "right", "heart", "fill", "communication"] },
      { id: "chat-right-heart", name: "Chat Right Heart", icon: "gfx/entity_icons/communication/chat-right-heart.svg", keywords: ["chat", "right", "heart", "communication"] },
      { id: "chat-right-quote-fill", name: "Chat Right Quote Fill", icon: "gfx/entity_icons/communication/chat-right-quote-fill.svg", keywords: ["chat", "right", "quote", "fill", "communication"] },
      { id: "chat-right-quote", name: "Chat Right Quote", icon: "gfx/entity_icons/communication/chat-right-quote.svg", keywords: ["chat", "right", "quote", "communication"] },
      { id: "chat-right-text-fill", name: "Chat Right Text Fill", icon: "gfx/entity_icons/communication/chat-right-text-fill.svg", keywords: ["chat", "right", "text", "fill", "communication"] },
      { id: "chat-right-text", name: "Chat Right Text", icon: "gfx/entity_icons/communication/chat-right-text.svg", keywords: ["chat", "right", "text", "communication"] },
      { id: "chat-right", name: "Chat Right", icon: "gfx/entity_icons/communication/chat-right.svg", keywords: ["chat", "right", "communication"] },
      { id: "chat-square-dots-fill", name: "Chat Square Dots Fill", icon: "gfx/entity_icons/communication/chat-square-dots-fill.svg", keywords: ["chat", "square", "dots", "fill", "communication"] },
      { id: "chat-square-dots", name: "Chat Square Dots", icon: "gfx/entity_icons/communication/chat-square-dots.svg", keywords: ["chat", "square", "dots", "communication"] },
      { id: "chat-square-fill", name: "Chat Square Fill", icon: "gfx/entity_icons/communication/chat-square-fill.svg", keywords: ["chat", "square", "fill", "communication"] },
      { id: "chat-square-heart-fill", name: "Chat Square Heart Fill", icon: "gfx/entity_icons/communication/chat-square-heart-fill.svg", keywords: ["chat", "square", "heart", "fill", "communication"] },
      { id: "chat-square-heart", name: "Chat Square Heart", icon: "gfx/entity_icons/communication/chat-square-heart.svg", keywords: ["chat", "square", "heart", "communication"] },
      { id: "chat-square-quote-fill", name: "Chat Square Quote Fill", icon: "gfx/entity_icons/communication/chat-square-quote-fill.svg", keywords: ["chat", "square", "quote", "fill", "communication"] },
      { id: "chat-square-quote", name: "Chat Square Quote", icon: "gfx/entity_icons/communication/chat-square-quote.svg", keywords: ["chat", "square", "quote", "communication"] },
      { id: "chat-square-text-fill", name: "Chat Square Text Fill", icon: "gfx/entity_icons/communication/chat-square-text-fill.svg", keywords: ["chat", "square", "text", "fill", "communication"] },
      { id: "chat-square-text", name: "Chat Square Text", icon: "gfx/entity_icons/communication/chat-square-text.svg", keywords: ["chat", "square", "text", "communication"] },
      { id: "chat-square", name: "Chat Square", icon: "gfx/entity_icons/communication/chat-square.svg", keywords: ["chat", "square", "communication"] },
      { id: "chat-text-fill", name: "Chat Text Fill", icon: "gfx/entity_icons/communication/chat-text-fill.svg", keywords: ["chat", "text", "fill", "communication"] },
      { id: "chat-text", name: "Chat Text", icon: "gfx/entity_icons/communication/chat-text.svg", keywords: ["chat", "text", "communication"] },
      { id: "chat", name: "Chat", icon: "gfx/entity_icons/communication/chat.png", keywords: ["chat", "communication"] },
      { id: "chat", name: "Chat", icon: "gfx/entity_icons/communication/chat.svg", keywords: ["chat", "communication"] },
      { id: "cib-bluetooth-b", name: "Cib Bluetooth B", icon: "gfx/entity_icons/communication/cib-bluetooth-b.svg", keywords: ["cib", "bluetooth", "communication"] },
      { id: "cib-bluetooth", name: "Cib Bluetooth", icon: "gfx/entity_icons/communication/cib-bluetooth.svg", keywords: ["cib", "bluetooth", "communication"] },
      { id: "cib-mail-ru", name: "Cib Mail Ru", icon: "gfx/entity_icons/communication/cib-mail-ru.svg", keywords: ["cib", "mail", "ru", "communication"] },
      { id: "cib-rss", name: "Cib Rss", icon: "gfx/entity_icons/communication/cib-rss.svg", keywords: ["cib", "rss", "communication"] },
      { id: "cib-signal", name: "Cib Signal", icon: "gfx/entity_icons/communication/cib-signal.svg", keywords: ["cib", "signal", "communication"] },
      { id: "cib-t-mobile", name: "Cib T Mobile", icon: "gfx/entity_icons/communication/cib-t-mobile.svg", keywords: ["cib", "mobile", "communication"] },
      { id: "cib-telegram", name: "Cib Telegram", icon: "gfx/entity_icons/communication/cib-telegram.svg", keywords: ["cib", "telegram", "communication"] },
      { id: "cib-whatsapp", name: "Cib Whatsapp", icon: "gfx/entity_icons/communication/cib-whatsapp.svg", keywords: ["cib", "whatsapp", "communication"] },
      { id: "cil-barcode", name: "Cil Barcode", icon: "gfx/entity_icons/communication/cil-barcode.svg", keywords: ["cil", "barcode", "communication"] },
      { id: "cil-bell-exclamation", name: "Cil Bell Exclamation", icon: "gfx/entity_icons/communication/cil-bell-exclamation.svg", keywords: ["cil", "bell", "exclamation", "communication"] },
      { id: "cil-bell", name: "Cil Bell", icon: "gfx/entity_icons/communication/cil-bell.svg", keywords: ["cil", "bell", "communication"] },
      { id: "cil-bluetooth", name: "Cil Bluetooth", icon: "gfx/entity_icons/communication/cil-bluetooth.svg", keywords: ["cil", "bluetooth", "communication"] },
      { id: "cil-chat-bubble", name: "Cil Chat Bubble", icon: "gfx/entity_icons/communication/cil-chat-bubble.svg", keywords: ["cil", "chat", "bubble", "communication"] },
      { id: "cil-comment-bubble", name: "Cil Comment Bubble", icon: "gfx/entity_icons/communication/cil-comment-bubble.svg", keywords: ["cil", "comment", "bubble", "communication"] },
      { id: "cil-comment-square", name: "Cil Comment Square", icon: "gfx/entity_icons/communication/cil-comment-square.svg", keywords: ["cil", "comment", "square", "communication"] },
      { id: "cil-external-link", name: "Cil External Link", icon: "gfx/entity_icons/communication/cil-external-link.svg", keywords: ["cil", "external", "link", "communication"] },
      { id: "cil-inbox", name: "Cil Inbox", icon: "gfx/entity_icons/communication/cil-inbox.svg", keywords: ["cil", "inbox", "communication"] },
      { id: "cil-link-alt", name: "Cil Link Alt", icon: "gfx/entity_icons/communication/cil-link-alt.svg", keywords: ["cil", "link", "alt", "communication"] },
      { id: "cil-link-broken", name: "Cil Link Broken", icon: "gfx/entity_icons/communication/cil-link-broken.svg", keywords: ["cil", "link", "broken", "communication"] },
      { id: "cil-link", name: "Cil Link", icon: "gfx/entity_icons/communication/cil-link.svg", keywords: ["cil", "link", "communication"] },
      { id: "cil-microphone", name: "Cil Microphone", icon: "gfx/entity_icons/communication/cil-microphone.svg", keywords: ["cil", "microphone", "communication"] },
      { id: "cil-mobile-landscape", name: "Cil Mobile Landscape", icon: "gfx/entity_icons/communication/cil-mobile-landscape.svg", keywords: ["cil", "mobile", "landscape", "communication"] },
      { id: "cil-mobile", name: "Cil Mobile", icon: "gfx/entity_icons/communication/cil-mobile.svg", keywords: ["cil", "mobile", "communication"] },
      { id: "cil-phone", name: "Cil Phone", icon: "gfx/entity_icons/communication/cil-phone.svg", keywords: ["cil", "phone", "communication"] },
      { id: "cil-qr-code", name: "Cil Qr Code", icon: "gfx/entity_icons/communication/cil-qr-code.svg", keywords: ["cil", "qr", "code", "communication"] },
      { id: "cil-rss", name: "Cil Rss", icon: "gfx/entity_icons/communication/cil-rss.svg", keywords: ["cil", "rss", "communication"] },
      { id: "cil-screen-smartphone", name: "Cil Screen Smartphone", icon: "gfx/entity_icons/communication/cil-screen-smartphone.svg", keywords: ["cil", "screen", "smartphone", "communication"] },
      { id: "cil-send", name: "Cil Send", icon: "gfx/entity_icons/communication/cil-send.svg", keywords: ["cil", "send", "communication"] },
      { id: "cil-signal-cellular-0", name: "Cil Signal Cellular 0", icon: "gfx/entity_icons/communication/cil-signal-cellular-0.svg", keywords: ["cil", "signal", "cellular", "communication"] },
      { id: "cil-signal-cellular-3", name: "Cil Signal Cellular 3", icon: "gfx/entity_icons/communication/cil-signal-cellular-3.svg", keywords: ["cil", "signal", "cellular", "communication"] },
      { id: "cil-signal-cellular-4", name: "Cil Signal Cellular 4", icon: "gfx/entity_icons/communication/cil-signal-cellular-4.svg", keywords: ["cil", "signal", "cellular", "communication"] },
      { id: "cil-wifi-signal-0", name: "Cil Wifi Signal 0", icon: "gfx/entity_icons/communication/cil-wifi-signal-0.svg", keywords: ["cil", "wifi", "signal", "communication"] },
      { id: "cil-wifi-signal-1", name: "Cil Wifi Signal 1", icon: "gfx/entity_icons/communication/cil-wifi-signal-1.svg", keywords: ["cil", "wifi", "signal", "communication"] },
      { id: "cil-wifi-signal-2", name: "Cil Wifi Signal 2", icon: "gfx/entity_icons/communication/cil-wifi-signal-2.svg", keywords: ["cil", "wifi", "signal", "communication"] },
      { id: "cil-wifi-signal-3", name: "Cil Wifi Signal 3", icon: "gfx/entity_icons/communication/cil-wifi-signal-3.svg", keywords: ["cil", "wifi", "signal", "communication"] },
      { id: "cil-wifi-signal-4", name: "Cil Wifi Signal 4", icon: "gfx/entity_icons/communication/cil-wifi-signal-4.svg", keywords: ["cil", "wifi", "signal", "communication"] },
      { id: "cil-wifi-signal-off", name: "Cil Wifi Signal Off", icon: "gfx/entity_icons/communication/cil-wifi-signal-off.svg", keywords: ["cil", "wifi", "signal", "off", "communication"] },
      { id: "closed-captioning", name: "Closed Captioning", icon: "gfx/entity_icons/communication/closed-captioning.svg", keywords: ["closed", "captioning", "communication"] },
      { id: "communications-tower", name: "Communications Tower", icon: "gfx/entity_icons/communication/communications-tower.svg", keywords: ["communications", "tower", "communication"] },
      { id: "creativemarket", name: "Creativemarket", icon: "gfx/entity_icons/communication/creativemarket.png", keywords: ["creativemarket", "communication"] },
      { id: "cube-send", name: "Cube Send", icon: "gfx/entity_icons/communication/cube-send.svg", keywords: ["cube", "send", "communication"] },
      { id: "delicious", name: "Delicious", icon: "gfx/entity_icons/communication/delicious.png", keywords: ["delicious", "communication"] },
      { id: "deviantart", name: "Deviantart", icon: "gfx/entity_icons/communication/deviantart.png", keywords: ["deviantart", "communication"] },
      { id: "device-camera-phone", name: "Device Camera Phone", icon: "gfx/entity_icons/communication/device-camera-phone.svg", keywords: ["device", "camera", "phone", "communication"] },
      { id: "device-landline-phone", name: "Device Landline Phone", icon: "gfx/entity_icons/communication/device-landline-phone.svg", keywords: ["device", "landline", "phone", "communication"] },
      { id: "device-mobile-bolt", name: "Device Mobile Bolt", icon: "gfx/entity_icons/communication/device-mobile-bolt.svg", keywords: ["device", "mobile", "bolt", "communication"] },
      { id: "device-mobile-cancel", name: "Device Mobile Cancel", icon: "gfx/entity_icons/communication/device-mobile-cancel.svg", keywords: ["device", "mobile", "cancel", "communication"] },
      { id: "device-mobile-charging", name: "Device Mobile Charging", icon: "gfx/entity_icons/communication/device-mobile-charging.svg", keywords: ["device", "mobile", "charging", "communication"] },
      { id: "device-mobile-check", name: "Device Mobile Check", icon: "gfx/entity_icons/communication/device-mobile-check.svg", keywords: ["device", "mobile", "check", "communication"] },
      { id: "device-mobile-code", name: "Device Mobile Code", icon: "gfx/entity_icons/communication/device-mobile-code.svg", keywords: ["device", "mobile", "code", "communication"] },
      { id: "device-mobile-cog", name: "Device Mobile Cog", icon: "gfx/entity_icons/communication/device-mobile-cog.svg", keywords: ["device", "mobile", "cog", "communication"] },
      { id: "device-mobile-dollar", name: "Device Mobile Dollar", icon: "gfx/entity_icons/communication/device-mobile-dollar.svg", keywords: ["device", "mobile", "dollar", "communication"] },
      { id: "device-mobile-down", name: "Device Mobile Down", icon: "gfx/entity_icons/communication/device-mobile-down.svg", keywords: ["device", "mobile", "down", "communication"] },
      { id: "device-mobile-exclamation", name: "Device Mobile Exclamation", icon: "gfx/entity_icons/communication/device-mobile-exclamation.svg", keywords: ["device", "mobile", "exclamation", "communication"] },
      { id: "device-mobile-heart", name: "Device Mobile Heart", icon: "gfx/entity_icons/communication/device-mobile-heart.svg", keywords: ["device", "mobile", "heart", "communication"] },
      { id: "device-mobile-message", name: "Device Mobile Message", icon: "gfx/entity_icons/communication/device-mobile-message.svg", keywords: ["device", "mobile", "message", "communication"] },
      { id: "device-mobile-minus", name: "Device Mobile Minus", icon: "gfx/entity_icons/communication/device-mobile-minus.svg", keywords: ["device", "mobile", "minus", "communication"] },
      { id: "device-mobile-off", name: "Device Mobile Off", icon: "gfx/entity_icons/communication/device-mobile-off.svg", keywords: ["device", "mobile", "off", "communication"] },
      { id: "device-mobile-pause", name: "Device Mobile Pause", icon: "gfx/entity_icons/communication/device-mobile-pause.svg", keywords: ["device", "mobile", "pause", "communication"] },
      { id: "device-mobile-pin", name: "Device Mobile Pin", icon: "gfx/entity_icons/communication/device-mobile-pin.svg", keywords: ["device", "mobile", "pin", "communication"] },
      { id: "device-mobile-plus", name: "Device Mobile Plus", icon: "gfx/entity_icons/communication/device-mobile-plus.svg", keywords: ["device", "mobile", "plus", "communication"] },
      { id: "device-mobile-question", name: "Device Mobile Question", icon: "gfx/entity_icons/communication/device-mobile-question.svg", keywords: ["device", "mobile", "question", "communication"] },
      { id: "device-mobile-rotated", name: "Device Mobile Rotated", icon: "gfx/entity_icons/communication/device-mobile-rotated.svg", keywords: ["device", "mobile", "rotated", "communication"] },
      { id: "device-mobile-search", name: "Device Mobile Search", icon: "gfx/entity_icons/communication/device-mobile-search.svg", keywords: ["device", "mobile", "search", "communication"] },
      { id: "device-mobile-share", name: "Device Mobile Share", icon: "gfx/entity_icons/communication/device-mobile-share.svg", keywords: ["device", "mobile", "share", "communication"] },
      { id: "device-mobile-star", name: "Device Mobile Star", icon: "gfx/entity_icons/communication/device-mobile-star.svg", keywords: ["device", "mobile", "star", "communication"] },
      { id: "device-mobile-up", name: "Device Mobile Up", icon: "gfx/entity_icons/communication/device-mobile-up.svg", keywords: ["device", "mobile", "up", "communication"] },
      { id: "device-mobile-vibration", name: "Device Mobile Vibration", icon: "gfx/entity_icons/communication/device-mobile-vibration.svg", keywords: ["device", "mobile", "vibration", "communication"] },
      { id: "device-mobile-x", name: "Device Mobile X", icon: "gfx/entity_icons/communication/device-mobile-x.svg", keywords: ["device", "mobile", "communication"] },
      { id: "device-mobile", name: "Device Mobile", icon: "gfx/entity_icons/communication/device-mobile.svg", keywords: ["device", "mobile", "communication"] },
      { id: "dossier", name: "Dossier", icon: "gfx/entity_icons/communication/dossier.png", keywords: ["dossier", "communication"] },
      { id: "dribbble", name: "Dribbble", icon: "gfx/entity_icons/communication/dribbble.png", keywords: ["dribbble", "communication"] },
      { id: "dropbox", name: "Dropbox", icon: "gfx/entity_icons/communication/dropbox.png", keywords: ["dropbox", "communication"] },
      { id: "email", name: "Email", icon: "gfx/entity_icons/communication/email.png", keywords: ["email", "communication"] },
      { id: "email-chat", name: "Email Chat", icon: "gfx/entity_icons/communication/email_chat.png", keywords: ["email", "chat", "communication"] },
      { id: "email-email", name: "Email Email", icon: "gfx/entity_icons/communication/email_email.png", keywords: ["email", "communication"] },
      { id: "emergency-phone", name: "Emergency Phone", icon: "gfx/entity_icons/communication/emergency-phone.svg", keywords: ["emergency", "phone", "communication"] },
      { id: "envato", name: "Envato", icon: "gfx/entity_icons/communication/envato.png", keywords: ["envato", "communication"] },
      { id: "envelope", name: "Envelope", icon: "gfx/entity_icons/communication/envelope.png", keywords: ["envelope", "communication"] },
      { id: "etsy", name: "Etsy", icon: "gfx/entity_icons/communication/etsy.png", keywords: ["etsy", "communication"] },
      { id: "external-link-off", name: "External Link Off", icon: "gfx/entity_icons/communication/external-link-off.svg", keywords: ["external", "link", "off", "communication"] },
      { id: "external-link", name: "External Link", icon: "gfx/entity_icons/communication/external-link.svg", keywords: ["external", "link", "communication"] },
      { id: "facebook", name: "Facebook", icon: "gfx/entity_icons/communication/facebook.png", keywords: ["facebook", "communication"] },
      { id: "file-barcode", name: "File Barcode", icon: "gfx/entity_icons/communication/file-barcode.svg", keywords: ["file", "barcode", "communication"] },
      { id: "file-phone", name: "File Phone", icon: "gfx/entity_icons/communication/file-phone.svg", keywords: ["file", "phone", "communication"] },
      { id: "file-rss", name: "File Rss", icon: "gfx/entity_icons/communication/file-rss.svg", keywords: ["file", "rss", "communication"] },
      { id: "file-signal", name: "File Signal", icon: "gfx/entity_icons/communication/file-signal.svg", keywords: ["file", "signal", "communication"] },
      { id: "file", name: "File", icon: "gfx/entity_icons/communication/file.png", keywords: ["file", "communication"] },
      { id: "fingerprint-scan", name: "Fingerprint Scan", icon: "gfx/entity_icons/communication/fingerprint_scan.png", keywords: ["fingerprint", "scan", "communication"] },
      { id: "flickr", name: "Flickr", icon: "gfx/entity_icons/communication/flickr.png", keywords: ["flickr", "communication"] },
      { id: "folder", name: "Folder", icon: "gfx/entity_icons/communication/folder.png", keywords: ["folder", "communication"] },
      { id: "forward", name: "Forward", icon: "gfx/entity_icons/communication/forward.png", keywords: ["forward", "communication"] },
      { id: "foursquare", name: "Foursquare", icon: "gfx/entity_icons/communication/foursquare.png", keywords: ["foursquare", "communication"] },
      { id: "globe", name: "Globe", icon: "gfx/entity_icons/communication/globe.svg", keywords: ["globe", "communication"] },
      { id: "googleplus", name: "Googleplus", icon: "gfx/entity_icons/communication/googleplus.png", keywords: ["googleplus", "communication"] },
      { id: "gps", name: "Gps", icon: "gfx/entity_icons/communication/gps.png", keywords: ["gps", "communication"] },
      { id: "gps-phone", name: "Gps Phone", icon: "gfx/entity_icons/communication/gps_phone.png", keywords: ["gps", "phone", "communication"] },
      { id: "hi", name: "Hi", icon: "gfx/entity_icons/communication/hi.png", keywords: ["hi", "communication"] },
      { id: "home-link", name: "Home Link", icon: "gfx/entity_icons/communication/home-link.svg", keywords: ["home", "link", "communication"] },
      { id: "home-signal", name: "Home Signal", icon: "gfx/entity_icons/communication/home-signal.svg", keywords: ["home", "signal", "communication"] },
      { id: "howcast", name: "Howcast", icon: "gfx/entity_icons/communication/howcast.png", keywords: ["howcast", "communication"] },
      { id: "html", name: "Html", icon: "gfx/entity_icons/communication/html.png", keywords: ["html", "communication"] },
      { id: "inbox-fill", name: "Inbox Fill", icon: "gfx/entity_icons/communication/inbox-fill.svg", keywords: ["inbox", "fill", "communication"] },
      { id: "inbox-off", name: "Inbox Off", icon: "gfx/entity_icons/communication/inbox-off.svg", keywords: ["inbox", "off", "communication"] },
      { id: "inbox", name: "Inbox", icon: "gfx/entity_icons/communication/inbox.png", keywords: ["inbox", "communication"] },
      { id: "inbox", name: "Inbox", icon: "gfx/entity_icons/communication/inbox.svg", keywords: ["inbox", "communication"] },
      { id: "information", name: "Information", icon: "gfx/entity_icons/communication/information.svg", keywords: ["information", "communication"] },
      { id: "instagram", name: "Instagram", icon: "gfx/entity_icons/communication/instagram.png", keywords: ["instagram", "communication"] },
      { id: "kickstarter", name: "Kickstarter", icon: "gfx/entity_icons/communication/kickstarter.png", keywords: ["kickstarter", "communication"] },
      { id: "landline", name: "Landline", icon: "gfx/entity_icons/communication/landline.png", keywords: ["landline", "communication"] },
      { id: "link-45deg", name: "Link 45deg", icon: "gfx/entity_icons/communication/link-45deg.svg", keywords: ["link", "45deg", "communication"] },
      { id: "link-minus", name: "Link Minus", icon: "gfx/entity_icons/communication/link-minus.svg", keywords: ["link", "minus", "communication"] },
      { id: "link-off", name: "Link Off", icon: "gfx/entity_icons/communication/link-off.svg", keywords: ["link", "off", "communication"] },
      { id: "link-plus", name: "Link Plus", icon: "gfx/entity_icons/communication/link-plus.svg", keywords: ["link", "plus", "communication"] },
      { id: "link", name: "Link", icon: "gfx/entity_icons/communication/link.svg", keywords: ["link", "communication"] },
      { id: "linkedin", name: "Linkedin", icon: "gfx/entity_icons/communication/linkedin.png", keywords: ["linkedin", "communication"] },
      { id: "low-vision-access", name: "Low Vision Access", icon: "gfx/entity_icons/communication/low-vision-access.svg", keywords: ["low", "vision", "access", "communication"] },
      { id: "mail-ai", name: "Mail Ai", icon: "gfx/entity_icons/communication/mail-ai.svg", keywords: ["mail", "ai", "communication"] },
      { id: "mail-bitcoin", name: "Mail Bitcoin", icon: "gfx/entity_icons/communication/mail-bitcoin.svg", keywords: ["mail", "bitcoin", "communication"] },
      { id: "mail-bolt", name: "Mail Bolt", icon: "gfx/entity_icons/communication/mail-bolt.svg", keywords: ["mail", "bolt", "communication"] },
      { id: "mail-cancel", name: "Mail Cancel", icon: "gfx/entity_icons/communication/mail-cancel.svg", keywords: ["mail", "cancel", "communication"] },
      { id: "mail-check", name: "Mail Check", icon: "gfx/entity_icons/communication/mail-check.svg", keywords: ["mail", "check", "communication"] },
      { id: "mail-code", name: "Mail Code", icon: "gfx/entity_icons/communication/mail-code.svg", keywords: ["mail", "code", "communication"] },
      { id: "mail-cog", name: "Mail Cog", icon: "gfx/entity_icons/communication/mail-cog.svg", keywords: ["mail", "cog", "communication"] },
      { id: "mail-dollar", name: "Mail Dollar", icon: "gfx/entity_icons/communication/mail-dollar.svg", keywords: ["mail", "dollar", "communication"] },
      { id: "mail-down", name: "Mail Down", icon: "gfx/entity_icons/communication/mail-down.svg", keywords: ["mail", "down", "communication"] },
      { id: "mail-exclamation", name: "Mail Exclamation", icon: "gfx/entity_icons/communication/mail-exclamation.svg", keywords: ["mail", "exclamation", "communication"] },
      { id: "mail-fast", name: "Mail Fast", icon: "gfx/entity_icons/communication/mail-fast.svg", keywords: ["mail", "fast", "communication"] },
      { id: "mail-forward", name: "Mail Forward", icon: "gfx/entity_icons/communication/mail-forward.svg", keywords: ["mail", "forward", "communication"] },
      { id: "mail-heart", name: "Mail Heart", icon: "gfx/entity_icons/communication/mail-heart.svg", keywords: ["mail", "heart", "communication"] },
      { id: "mail-minus", name: "Mail Minus", icon: "gfx/entity_icons/communication/mail-minus.svg", keywords: ["mail", "minus", "communication"] },
      { id: "mail-off", name: "Mail Off", icon: "gfx/entity_icons/communication/mail-off.svg", keywords: ["mail", "off", "communication"] },
      { id: "mail-opened", name: "Mail Opened", icon: "gfx/entity_icons/communication/mail-opened.svg", keywords: ["mail", "opened", "communication"] },
      { id: "mail-pause", name: "Mail Pause", icon: "gfx/entity_icons/communication/mail-pause.svg", keywords: ["mail", "pause", "communication"] },
      { id: "mail-pin", name: "Mail Pin", icon: "gfx/entity_icons/communication/mail-pin.svg", keywords: ["mail", "pin", "communication"] },
      { id: "mail-plus", name: "Mail Plus", icon: "gfx/entity_icons/communication/mail-plus.svg", keywords: ["mail", "plus", "communication"] },
      { id: "mail-question", name: "Mail Question", icon: "gfx/entity_icons/communication/mail-question.svg", keywords: ["mail", "question", "communication"] },
      { id: "mail-search", name: "Mail Search", icon: "gfx/entity_icons/communication/mail-search.svg", keywords: ["mail", "search", "communication"] },
      { id: "mail-share", name: "Mail Share", icon: "gfx/entity_icons/communication/mail-share.svg", keywords: ["mail", "share", "communication"] },
      { id: "mail-spark", name: "Mail Spark", icon: "gfx/entity_icons/communication/mail-spark.svg", keywords: ["mail", "spark", "communication"] },
      { id: "mail-star", name: "Mail Star", icon: "gfx/entity_icons/communication/mail-star.svg", keywords: ["mail", "star", "communication"] },
      { id: "mail-up", name: "Mail Up", icon: "gfx/entity_icons/communication/mail-up.svg", keywords: ["mail", "up", "communication"] },
      { id: "mail-x", name: "Mail X", icon: "gfx/entity_icons/communication/mail-x.svg", keywords: ["mail", "communication"] },
      { id: "mail", name: "Mail", icon: "gfx/entity_icons/communication/mail.png", keywords: ["mail", "communication"] },
      { id: "mail", name: "Mail", icon: "gfx/entity_icons/communication/mail.svg", keywords: ["mail", "communication"] },
      { id: "mailbox", name: "Mailbox", icon: "gfx/entity_icons/communication/mailbox.png", keywords: ["mailbox", "communication"] },
      { id: "medium", name: "Medium", icon: "gfx/entity_icons/communication/medium.png", keywords: ["medium", "communication"] },
      { id: "message-2-bolt", name: "Message 2 Bolt", icon: "gfx/entity_icons/communication/message-2-bolt.svg", keywords: ["message", "bolt", "communication"] },
      { id: "message-2-cancel", name: "Message 2 Cancel", icon: "gfx/entity_icons/communication/message-2-cancel.svg", keywords: ["message", "cancel", "communication"] },
      { id: "message-2-check", name: "Message 2 Check", icon: "gfx/entity_icons/communication/message-2-check.svg", keywords: ["message", "check", "communication"] },
      { id: "message-2-code", name: "Message 2 Code", icon: "gfx/entity_icons/communication/message-2-code.svg", keywords: ["message", "code", "communication"] },
      { id: "message-2-cog", name: "Message 2 Cog", icon: "gfx/entity_icons/communication/message-2-cog.svg", keywords: ["message", "cog", "communication"] },
      { id: "message-2-dollar", name: "Message 2 Dollar", icon: "gfx/entity_icons/communication/message-2-dollar.svg", keywords: ["message", "dollar", "communication"] },
      { id: "message-2-down", name: "Message 2 Down", icon: "gfx/entity_icons/communication/message-2-down.svg", keywords: ["message", "down", "communication"] },
      { id: "message-2-exclamation", name: "Message 2 Exclamation", icon: "gfx/entity_icons/communication/message-2-exclamation.svg", keywords: ["message", "exclamation", "communication"] },
      { id: "message-2-heart", name: "Message 2 Heart", icon: "gfx/entity_icons/communication/message-2-heart.svg", keywords: ["message", "heart", "communication"] },
      { id: "message-2-minus", name: "Message 2 Minus", icon: "gfx/entity_icons/communication/message-2-minus.svg", keywords: ["message", "minus", "communication"] },
      { id: "message-2-off", name: "Message 2 Off", icon: "gfx/entity_icons/communication/message-2-off.svg", keywords: ["message", "off", "communication"] },
      { id: "message-2-pause", name: "Message 2 Pause", icon: "gfx/entity_icons/communication/message-2-pause.svg", keywords: ["message", "pause", "communication"] },
      { id: "message-2-pin", name: "Message 2 Pin", icon: "gfx/entity_icons/communication/message-2-pin.svg", keywords: ["message", "pin", "communication"] },
      { id: "message-2-plus", name: "Message 2 Plus", icon: "gfx/entity_icons/communication/message-2-plus.svg", keywords: ["message", "plus", "communication"] },
      { id: "message-2-question", name: "Message 2 Question", icon: "gfx/entity_icons/communication/message-2-question.svg", keywords: ["message", "question", "communication"] },
      { id: "message-2-search", name: "Message 2 Search", icon: "gfx/entity_icons/communication/message-2-search.svg", keywords: ["message", "search", "communication"] },
      { id: "message-2-share", name: "Message 2 Share", icon: "gfx/entity_icons/communication/message-2-share.svg", keywords: ["message", "share", "communication"] },
      { id: "message-2-star", name: "Message 2 Star", icon: "gfx/entity_icons/communication/message-2-star.svg", keywords: ["message", "star", "communication"] },
      { id: "message-2-up", name: "Message 2 Up", icon: "gfx/entity_icons/communication/message-2-up.svg", keywords: ["message", "up", "communication"] },
      { id: "message-2-x", name: "Message 2 X", icon: "gfx/entity_icons/communication/message-2-x.svg", keywords: ["message", "communication"] },
      { id: "message-2", name: "Message 2", icon: "gfx/entity_icons/communication/message-2.svg", keywords: ["message", "communication"] },
      { id: "message-bolt", name: "Message Bolt", icon: "gfx/entity_icons/communication/message-bolt.svg", keywords: ["message", "bolt", "communication"] },
      { id: "message-cancel", name: "Message Cancel", icon: "gfx/entity_icons/communication/message-cancel.svg", keywords: ["message", "cancel", "communication"] },
      { id: "message-chatbot", name: "Message Chatbot", icon: "gfx/entity_icons/communication/message-chatbot.svg", keywords: ["message", "chatbot", "communication"] },
      { id: "message-check", name: "Message Check", icon: "gfx/entity_icons/communication/message-check.svg", keywords: ["message", "check", "communication"] },
      { id: "message-circle-bolt", name: "Message Circle Bolt", icon: "gfx/entity_icons/communication/message-circle-bolt.svg", keywords: ["message", "circle", "bolt", "communication"] },
      { id: "message-circle-cancel", name: "Message Circle Cancel", icon: "gfx/entity_icons/communication/message-circle-cancel.svg", keywords: ["message", "circle", "cancel", "communication"] },
      { id: "message-circle-check", name: "Message Circle Check", icon: "gfx/entity_icons/communication/message-circle-check.svg", keywords: ["message", "circle", "check", "communication"] },
      { id: "message-circle-code", name: "Message Circle Code", icon: "gfx/entity_icons/communication/message-circle-code.svg", keywords: ["message", "circle", "code", "communication"] },
      { id: "message-circle-cog", name: "Message Circle Cog", icon: "gfx/entity_icons/communication/message-circle-cog.svg", keywords: ["message", "circle", "cog", "communication"] },
      { id: "message-circle-dollar", name: "Message Circle Dollar", icon: "gfx/entity_icons/communication/message-circle-dollar.svg", keywords: ["message", "circle", "dollar", "communication"] },
      { id: "message-circle-down", name: "Message Circle Down", icon: "gfx/entity_icons/communication/message-circle-down.svg", keywords: ["message", "circle", "down", "communication"] },
      { id: "message-circle-exclamation", name: "Message Circle Exclamation", icon: "gfx/entity_icons/communication/message-circle-exclamation.svg", keywords: ["message", "circle", "exclamation", "communication"] },
      { id: "message-circle-heart", name: "Message Circle Heart", icon: "gfx/entity_icons/communication/message-circle-heart.svg", keywords: ["message", "circle", "heart", "communication"] },
      { id: "message-circle-minus", name: "Message Circle Minus", icon: "gfx/entity_icons/communication/message-circle-minus.svg", keywords: ["message", "circle", "minus", "communication"] },
      { id: "message-circle-off", name: "Message Circle Off", icon: "gfx/entity_icons/communication/message-circle-off.svg", keywords: ["message", "circle", "off", "communication"] },
      { id: "message-circle-pause", name: "Message Circle Pause", icon: "gfx/entity_icons/communication/message-circle-pause.svg", keywords: ["message", "circle", "pause", "communication"] },
      { id: "message-circle-pin", name: "Message Circle Pin", icon: "gfx/entity_icons/communication/message-circle-pin.svg", keywords: ["message", "circle", "pin", "communication"] },
      { id: "message-circle-plus", name: "Message Circle Plus", icon: "gfx/entity_icons/communication/message-circle-plus.svg", keywords: ["message", "circle", "plus", "communication"] },
      { id: "message-circle-question", name: "Message Circle Question", icon: "gfx/entity_icons/communication/message-circle-question.svg", keywords: ["message", "circle", "question", "communication"] },
      { id: "message-circle-search", name: "Message Circle Search", icon: "gfx/entity_icons/communication/message-circle-search.svg", keywords: ["message", "circle", "search", "communication"] },
      { id: "message-circle-share", name: "Message Circle Share", icon: "gfx/entity_icons/communication/message-circle-share.svg", keywords: ["message", "circle", "share", "communication"] },
      { id: "message-circle-star", name: "Message Circle Star", icon: "gfx/entity_icons/communication/message-circle-star.svg", keywords: ["message", "circle", "star", "communication"] },
      { id: "message-circle-up", name: "Message Circle Up", icon: "gfx/entity_icons/communication/message-circle-up.svg", keywords: ["message", "circle", "up", "communication"] },
      { id: "message-circle-user", name: "Message Circle User", icon: "gfx/entity_icons/communication/message-circle-user.svg", keywords: ["message", "circle", "user", "communication"] },
      { id: "message-circle-x", name: "Message Circle X", icon: "gfx/entity_icons/communication/message-circle-x.svg", keywords: ["message", "circle", "communication"] },
      { id: "message-circle", name: "Message Circle", icon: "gfx/entity_icons/communication/message-circle.svg", keywords: ["message", "circle", "communication"] },
      { id: "message-code", name: "Message Code", icon: "gfx/entity_icons/communication/message-code.svg", keywords: ["message", "code", "communication"] },
      { id: "message-cog", name: "Message Cog", icon: "gfx/entity_icons/communication/message-cog.svg", keywords: ["message", "cog", "communication"] },
      { id: "message-dollar", name: "Message Dollar", icon: "gfx/entity_icons/communication/message-dollar.svg", keywords: ["message", "dollar", "communication"] },
      { id: "message-dots", name: "Message Dots", icon: "gfx/entity_icons/communication/message-dots.svg", keywords: ["message", "dots", "communication"] },
      { id: "message-down", name: "Message Down", icon: "gfx/entity_icons/communication/message-down.svg", keywords: ["message", "down", "communication"] },
      { id: "message-exclamation", name: "Message Exclamation", icon: "gfx/entity_icons/communication/message-exclamation.svg", keywords: ["message", "exclamation", "communication"] },
      { id: "message-forward", name: "Message Forward", icon: "gfx/entity_icons/communication/message-forward.svg", keywords: ["message", "forward", "communication"] },
      { id: "message-heart", name: "Message Heart", icon: "gfx/entity_icons/communication/message-heart.svg", keywords: ["message", "heart", "communication"] },
      { id: "message-language", name: "Message Language", icon: "gfx/entity_icons/communication/message-language.svg", keywords: ["message", "language", "communication"] },
      { id: "message-minus", name: "Message Minus", icon: "gfx/entity_icons/communication/message-minus.svg", keywords: ["message", "minus", "communication"] },
      { id: "message-off", name: "Message Off", icon: "gfx/entity_icons/communication/message-off.svg", keywords: ["message", "off", "communication"] },
      { id: "message-pause", name: "Message Pause", icon: "gfx/entity_icons/communication/message-pause.svg", keywords: ["message", "pause", "communication"] },
      { id: "message-pin", name: "Message Pin", icon: "gfx/entity_icons/communication/message-pin.svg", keywords: ["message", "pin", "communication"] },
      { id: "message-plus", name: "Message Plus", icon: "gfx/entity_icons/communication/message-plus.svg", keywords: ["message", "plus", "communication"] },
      { id: "message-question", name: "Message Question", icon: "gfx/entity_icons/communication/message-question.svg", keywords: ["message", "question", "communication"] },
      { id: "message-reply", name: "Message Reply", icon: "gfx/entity_icons/communication/message-reply.svg", keywords: ["message", "reply", "communication"] },
      { id: "message-report", name: "Message Report", icon: "gfx/entity_icons/communication/message-report.svg", keywords: ["message", "report", "communication"] },
      { id: "message-search", name: "Message Search", icon: "gfx/entity_icons/communication/message-search.svg", keywords: ["message", "search", "communication"] },
      { id: "message-share", name: "Message Share", icon: "gfx/entity_icons/communication/message-share.svg", keywords: ["message", "share", "communication"] },
      { id: "message-star", name: "Message Star", icon: "gfx/entity_icons/communication/message-star.svg", keywords: ["message", "star", "communication"] },
      { id: "message-up", name: "Message Up", icon: "gfx/entity_icons/communication/message-up.svg", keywords: ["message", "up", "communication"] },
      { id: "message-user", name: "Message User", icon: "gfx/entity_icons/communication/message-user.svg", keywords: ["message", "user", "communication"] },
      { id: "message-x", name: "Message X", icon: "gfx/entity_icons/communication/message-x.svg", keywords: ["message", "communication"] },
      { id: "message", name: "Message", icon: "gfx/entity_icons/communication/message.png", keywords: ["message", "communication"] },
      { id: "message", name: "Message", icon: "gfx/entity_icons/communication/message.svg", keywords: ["message", "communication"] },
      { id: "microphone-2-off", name: "Microphone 2 Off", icon: "gfx/entity_icons/communication/microphone-2-off.svg", keywords: ["microphone", "off", "communication"] },
      { id: "microphone-2", name: "Microphone 2", icon: "gfx/entity_icons/communication/microphone-2.svg", keywords: ["microphone", "communication"] },
      { id: "microphone-off", name: "Microphone Off", icon: "gfx/entity_icons/communication/microphone-off.svg", keywords: ["microphone", "off", "communication"] },
      { id: "microphone", name: "Microphone", icon: "gfx/entity_icons/communication/microphone.svg", keywords: ["microphone", "communication"] },
      { id: "mobile-phone", name: "Mobile Phone", icon: "gfx/entity_icons/communication/mobile-phone.svg", keywords: ["mobile", "phone", "communication"] },
      { id: "mobile-app", name: "Mobile App", icon: "gfx/entity_icons/communication/mobile_app.png", keywords: ["mobile", "app", "communication"] },
      { id: "mobile-phone", name: "Mobile Phone", icon: "gfx/entity_icons/communication/mobile_phone.png", keywords: ["mobile", "phone", "communication"] },
      { id: "mobile-phone-smartphone", name: "Mobile Phone Smartphone", icon: "gfx/entity_icons/communication/mobile_phone_smartphone.png", keywords: ["mobile", "phone", "smartphone", "communication"] },
      { id: "mobile-phone-sms", name: "Mobile Phone Sms", icon: "gfx/entity_icons/communication/mobile_phone_sms.png", keywords: ["mobile", "phone", "sms", "communication"] },
      { id: "mobile-security", name: "Mobile Security", icon: "gfx/entity_icons/communication/mobile_security.png", keywords: ["mobile", "security", "communication"] },
      { id: "mute", name: "Mute", icon: "gfx/entity_icons/communication/mute.png", keywords: ["mute", "communication"] },
      { id: "myspace", name: "Myspace", icon: "gfx/entity_icons/communication/myspace.png", keywords: ["myspace", "communication"] },
      { id: "next", name: "Next", icon: "gfx/entity_icons/communication/next.png", keywords: ["next", "communication"] },
      { id: "no-signal", name: "No Signal", icon: "gfx/entity_icons/communication/no_signal.png", keywords: ["no", "signal", "communication"] },
      { id: "no-sound", name: "No Sound", icon: "gfx/entity_icons/communication/no_sound.png", keywords: ["no", "sound", "communication"] },
      { id: "no-wifi", name: "No Wifi", icon: "gfx/entity_icons/communication/no_wifi.png", keywords: ["no", "wifi", "communication"] },
      { id: "notification-off", name: "Notification Off", icon: "gfx/entity_icons/communication/notification-off.svg", keywords: ["notification", "off", "communication"] },
      { id: "notification", name: "Notification", icon: "gfx/entity_icons/communication/notification.svg", keywords: ["notification", "communication"] },
      { id: "old-phone", name: "Old Phone", icon: "gfx/entity_icons/communication/old_phone.png", keywords: ["old", "phone", "communication"] },
      { id: "open-captioning", name: "Open Captioning", icon: "gfx/entity_icons/communication/open-captioning.svg", keywords: ["open", "captioning", "communication"] },
      { id: "paper-plane", name: "Paper Plane", icon: "gfx/entity_icons/communication/paper_plane.png", keywords: ["paper", "plane", "communication"] },
      { id: "password-mobile-phone", name: "Password Mobile Phone", icon: "gfx/entity_icons/communication/password-mobile-phone.svg", keywords: ["password", "mobile", "phone", "communication"] },
      { id: "path", name: "Path", icon: "gfx/entity_icons/communication/path.png", keywords: ["path", "communication"] },
      { id: "paypal", name: "Paypal", icon: "gfx/entity_icons/communication/paypal.png", keywords: ["paypal", "communication"] },
      { id: "periscope", name: "Periscope", icon: "gfx/entity_icons/communication/periscope.png", keywords: ["periscope", "communication"] },
      { id: "phone-call", name: "Phone Call", icon: "gfx/entity_icons/communication/phone-call.svg", keywords: ["phone", "call", "communication"] },
      { id: "phone-calling", name: "Phone Calling", icon: "gfx/entity_icons/communication/phone-calling.svg", keywords: ["phone", "calling", "communication"] },
      { id: "phone-check", name: "Phone Check", icon: "gfx/entity_icons/communication/phone-check.svg", keywords: ["phone", "check", "communication"] },
      { id: "phone-done", name: "Phone Done", icon: "gfx/entity_icons/communication/phone-done.svg", keywords: ["phone", "done", "communication"] },
      { id: "phone-end", name: "Phone End", icon: "gfx/entity_icons/communication/phone-end.svg", keywords: ["phone", "end", "communication"] },
      { id: "phone-fill", name: "Phone Fill", icon: "gfx/entity_icons/communication/phone-fill.svg", keywords: ["phone", "fill", "communication"] },
      { id: "phone-flip", name: "Phone Flip", icon: "gfx/entity_icons/communication/phone-flip.svg", keywords: ["phone", "flip", "communication"] },
      { id: "phone-incoming", name: "Phone Incoming", icon: "gfx/entity_icons/communication/phone-incoming.svg", keywords: ["phone", "incoming", "communication"] },
      { id: "phone-landscape-fill", name: "Phone Landscape Fill", icon: "gfx/entity_icons/communication/phone-landscape-fill.svg", keywords: ["phone", "landscape", "fill", "communication"] },
      { id: "phone-landscape", name: "Phone Landscape", icon: "gfx/entity_icons/communication/phone-landscape.svg", keywords: ["phone", "landscape", "communication"] },
      { id: "phone-off", name: "Phone Off", icon: "gfx/entity_icons/communication/phone-off.svg", keywords: ["phone", "off", "communication"] },
      { id: "phone-outgoing", name: "Phone Outgoing", icon: "gfx/entity_icons/communication/phone-outgoing.svg", keywords: ["phone", "outgoing", "communication"] },
      { id: "phone-pause", name: "Phone Pause", icon: "gfx/entity_icons/communication/phone-pause.svg", keywords: ["phone", "pause", "communication"] },
      { id: "phone-plus", name: "Phone Plus", icon: "gfx/entity_icons/communication/phone-plus.svg", keywords: ["phone", "plus", "communication"] },
      { id: "phone-ringing", name: "Phone Ringing", icon: "gfx/entity_icons/communication/phone-ringing.svg", keywords: ["phone", "ringing", "communication"] },
      { id: "phone-spark", name: "Phone Spark", icon: "gfx/entity_icons/communication/phone-spark.svg", keywords: ["phone", "spark", "communication"] },
      { id: "phone-vibrate-fill", name: "Phone Vibrate Fill", icon: "gfx/entity_icons/communication/phone-vibrate-fill.svg", keywords: ["phone", "vibrate", "fill", "communication"] },
      { id: "phone-vibrate", name: "Phone Vibrate", icon: "gfx/entity_icons/communication/phone-vibrate.svg", keywords: ["phone", "vibrate", "communication"] },
      { id: "phone-x", name: "Phone X", icon: "gfx/entity_icons/communication/phone-x.svg", keywords: ["phone", "communication"] },
      { id: "phone", name: "Phone", icon: "gfx/entity_icons/communication/phone.svg", keywords: ["phone", "communication"] },
      { id: "phone-call", name: "Phone Call", icon: "gfx/entity_icons/communication/phone_call.png", keywords: ["phone", "call", "communication"] },
      { id: "phone-receiver", name: "Phone Receiver", icon: "gfx/entity_icons/communication/phone_receiver.png", keywords: ["phone", "receiver", "communication"] },
      { id: "pinterest", name: "Pinterest", icon: "gfx/entity_icons/communication/pinterest.png", keywords: ["pinterest", "communication"] },
      { id: "plaxo", name: "Plaxo", icon: "gfx/entity_icons/communication/plaxo.png", keywords: ["plaxo", "communication"] },
      { id: "post-box", name: "Post Box", icon: "gfx/entity_icons/communication/post-box.svg", keywords: ["post", "box", "communication"] },
      { id: "post-jp", name: "Post Jp", icon: "gfx/entity_icons/communication/post-JP.svg", keywords: ["post", "jp", "communication"] },
      { id: "post-office", name: "Post Office", icon: "gfx/entity_icons/communication/post-office.svg", keywords: ["post", "office", "communication"] },
      { id: "post", name: "Post", icon: "gfx/entity_icons/communication/post.svg", keywords: ["post", "communication"] },
      { id: "qr-code-scan", name: "Qr Code Scan", icon: "gfx/entity_icons/communication/qr-code-scan.svg", keywords: ["qr", "code", "scan", "communication"] },
      { id: "qr-code", name: "Qr Code", icon: "gfx/entity_icons/communication/qr-code.svg", keywords: ["qr", "code", "communication"] },
      { id: "quora", name: "Quora", icon: "gfx/entity_icons/communication/quora.png", keywords: ["quora", "communication"] },
      { id: "radio-off", name: "Radio Off", icon: "gfx/entity_icons/communication/radio-off.svg", keywords: ["radio", "off", "communication"] },
      { id: "radio", name: "Radio", icon: "gfx/entity_icons/communication/radio.svg", keywords: ["radio", "communication"] },
      { id: "record-mail-off", name: "Record Mail Off", icon: "gfx/entity_icons/communication/record-mail-off.svg", keywords: ["record", "mail", "off", "communication"] },
      { id: "record-mail", name: "Record Mail", icon: "gfx/entity_icons/communication/record-mail.svg", keywords: ["record", "mail", "communication"] },
      { id: "reddit", name: "Reddit", icon: "gfx/entity_icons/communication/reddit.png", keywords: ["reddit", "communication"] },
      { id: "reply-all-fill", name: "Reply All Fill", icon: "gfx/entity_icons/communication/reply-all-fill.svg", keywords: ["reply", "all", "fill", "communication"] },
      { id: "reply-all", name: "Reply All", icon: "gfx/entity_icons/communication/reply-all.svg", keywords: ["reply", "all", "communication"] },
      { id: "reply-fill", name: "Reply Fill", icon: "gfx/entity_icons/communication/reply-fill.svg", keywords: ["reply", "fill", "communication"] },
      { id: "reply", name: "Reply", icon: "gfx/entity_icons/communication/reply.png", keywords: ["reply", "communication"] },
      { id: "reply", name: "Reply", icon: "gfx/entity_icons/communication/reply.svg", keywords: ["reply", "communication"] },
      { id: "rss-fill", name: "Rss Fill", icon: "gfx/entity_icons/communication/rss-fill.svg", keywords: ["rss", "fill", "communication"] },
      { id: "rss", name: "Rss", icon: "gfx/entity_icons/communication/rss.svg", keywords: ["rss", "communication"] },
      { id: "satellite-off", name: "Satellite Off", icon: "gfx/entity_icons/communication/satellite-off.svg", keywords: ["satellite", "off", "communication"] },
      { id: "satellite", name: "Satellite", icon: "gfx/entity_icons/communication/satellite.svg", keywords: ["satellite", "communication"] },
      { id: "school-bell", name: "School Bell", icon: "gfx/entity_icons/communication/school-bell.svg", keywords: ["school", "bell", "communication"] },
      { id: "scribd", name: "Scribd", icon: "gfx/entity_icons/communication/scribd.png", keywords: ["scribd", "communication"] },
      { id: "send-2", name: "Send 2", icon: "gfx/entity_icons/communication/send-2.svg", keywords: ["send", "communication"] },
      { id: "send-arrow-down-fill", name: "Send Arrow Down Fill", icon: "gfx/entity_icons/communication/send-arrow-down-fill.svg", keywords: ["send", "arrow", "down", "fill", "communication"] },
      { id: "send-arrow-down", name: "Send Arrow Down", icon: "gfx/entity_icons/communication/send-arrow-down.svg", keywords: ["send", "arrow", "down", "communication"] },
      { id: "send-arrow-up-fill", name: "Send Arrow Up Fill", icon: "gfx/entity_icons/communication/send-arrow-up-fill.svg", keywords: ["send", "arrow", "up", "fill", "communication"] },
      { id: "send-arrow-up", name: "Send Arrow Up", icon: "gfx/entity_icons/communication/send-arrow-up.svg", keywords: ["send", "arrow", "up", "communication"] },
      { id: "send-check-fill", name: "Send Check Fill", icon: "gfx/entity_icons/communication/send-check-fill.svg", keywords: ["send", "check", "fill", "communication"] },
      { id: "send-check", name: "Send Check", icon: "gfx/entity_icons/communication/send-check.svg", keywords: ["send", "check", "communication"] },
      { id: "send-dash-fill", name: "Send Dash Fill", icon: "gfx/entity_icons/communication/send-dash-fill.svg", keywords: ["send", "dash", "fill", "communication"] },
      { id: "send-dash", name: "Send Dash", icon: "gfx/entity_icons/communication/send-dash.svg", keywords: ["send", "dash", "communication"] },
      { id: "send-exclamation-fill", name: "Send Exclamation Fill", icon: "gfx/entity_icons/communication/send-exclamation-fill.svg", keywords: ["send", "exclamation", "fill", "communication"] },
      { id: "send-exclamation", name: "Send Exclamation", icon: "gfx/entity_icons/communication/send-exclamation.svg", keywords: ["send", "exclamation", "communication"] },
      { id: "send-fill", name: "Send Fill", icon: "gfx/entity_icons/communication/send-fill.svg", keywords: ["send", "fill", "communication"] },
      { id: "send-off", name: "Send Off", icon: "gfx/entity_icons/communication/send-off.svg", keywords: ["send", "off", "communication"] },
      { id: "send-plus-fill", name: "Send Plus Fill", icon: "gfx/entity_icons/communication/send-plus-fill.svg", keywords: ["send", "plus", "fill", "communication"] },
      { id: "send-plus", name: "Send Plus", icon: "gfx/entity_icons/communication/send-plus.svg", keywords: ["send", "plus", "communication"] },
      { id: "send-slash-fill", name: "Send Slash Fill", icon: "gfx/entity_icons/communication/send-slash-fill.svg", keywords: ["send", "slash", "fill", "communication"] },
      { id: "send-slash", name: "Send Slash", icon: "gfx/entity_icons/communication/send-slash.svg", keywords: ["send", "slash", "communication"] },
      { id: "send-x-fill", name: "Send X Fill", icon: "gfx/entity_icons/communication/send-x-fill.svg", keywords: ["send", "fill", "communication"] },
      { id: "send-x", name: "Send X", icon: "gfx/entity_icons/communication/send-x.svg", keywords: ["send", "communication"] },
      { id: "send", name: "Send", icon: "gfx/entity_icons/communication/send.svg", keywords: ["send", "communication"] },
      { id: "shutterstock", name: "Shutterstock", icon: "gfx/entity_icons/communication/shutterstock.png", keywords: ["shutterstock", "communication"] },
      { id: "sign-language", name: "Sign Language", icon: "gfx/entity_icons/communication/sign-language.svg", keywords: ["sign", "language", "communication"] },
      { id: "signal-2g", name: "Signal 2g", icon: "gfx/entity_icons/communication/signal-2g.svg", keywords: ["signal", "2g", "communication"] },
      { id: "signal-3g", name: "Signal 3g", icon: "gfx/entity_icons/communication/signal-3g.svg", keywords: ["signal", "3g", "communication"] },
      { id: "signal-4g-plus", name: "Signal 4g Plus", icon: "gfx/entity_icons/communication/signal-4g-plus.svg", keywords: ["signal", "4g", "plus", "communication"] },
      { id: "signal-4g", name: "Signal 4g", icon: "gfx/entity_icons/communication/signal-4g.svg", keywords: ["signal", "4g", "communication"] },
      { id: "signal-5g", name: "Signal 5g", icon: "gfx/entity_icons/communication/signal-5g.svg", keywords: ["signal", "5g", "communication"] },
      { id: "signal-6g", name: "Signal 6g", icon: "gfx/entity_icons/communication/signal-6g.svg", keywords: ["signal", "6g", "communication"] },
      { id: "signal-e", name: "Signal E", icon: "gfx/entity_icons/communication/signal-e.svg", keywords: ["signal", "communication"] },
      { id: "signal-g", name: "Signal G", icon: "gfx/entity_icons/communication/signal-g.svg", keywords: ["signal", "communication"] },
      { id: "signal-h-plus", name: "Signal H Plus", icon: "gfx/entity_icons/communication/signal-h-plus.svg", keywords: ["signal", "plus", "communication"] },
      { id: "signal-h", name: "Signal H", icon: "gfx/entity_icons/communication/signal-h.svg", keywords: ["signal", "communication"] },
      { id: "signal-lte", name: "Signal Lte", icon: "gfx/entity_icons/communication/signal-lte.svg", keywords: ["signal", "lte", "communication"] },
      { id: "signal", name: "Signal", icon: "gfx/entity_icons/communication/signal.png", keywords: ["signal", "communication"] },
      { id: "signal", name: "Signal", icon: "gfx/entity_icons/communication/signal.svg", keywords: ["signal", "communication"] },
      { id: "sim-card", name: "Sim Card", icon: "gfx/entity_icons/communication/sim_card.png", keywords: ["sim", "card", "communication"] },
      { id: "skype", name: "Skype", icon: "gfx/entity_icons/communication/skype.png", keywords: ["skype", "communication"] },
      { id: "smartphone", name: "Smartphone", icon: "gfx/entity_icons/communication/smartphone.png", keywords: ["smartphone", "communication"] },
      { id: "sms", name: "Sms", icon: "gfx/entity_icons/communication/sms.png", keywords: ["sms", "communication"] },
      { id: "snapchat", name: "Snapchat", icon: "gfx/entity_icons/communication/snapchat.png", keywords: ["snapchat", "communication"] },
      { id: "soundcloud", name: "Soundcloud", icon: "gfx/entity_icons/communication/soundcloud.png", keywords: ["soundcloud", "communication"] },
      { id: "spotify", name: "Spotify", icon: "gfx/entity_icons/communication/spotify.png", keywords: ["spotify", "communication"] },
      { id: "stumbleupon", name: "Stumbleupon", icon: "gfx/entity_icons/communication/stumbleupon.png", keywords: ["stumbleupon", "communication"] },
      { id: "telephone", name: "Telephone", icon: "gfx/entity_icons/communication/telephone.svg", keywords: ["telephone", "communication"] },
      { id: "transfer", name: "Transfer", icon: "gfx/entity_icons/communication/transfer.png", keywords: ["transfer", "communication"] },
      { id: "trello", name: "Trello", icon: "gfx/entity_icons/communication/trello.png", keywords: ["trello", "communication"] },
      { id: "tumblr", name: "Tumblr", icon: "gfx/entity_icons/communication/tumblr.png", keywords: ["tumblr", "communication"] },
      { id: "twitter", name: "Twitter", icon: "gfx/entity_icons/communication/twitter.png", keywords: ["twitter", "communication"] },
      { id: "usb-charger", name: "Usb Charger", icon: "gfx/entity_icons/communication/usb_charger.png", keywords: ["usb", "charger", "communication"] },
      { id: "usb-port", name: "Usb Port", icon: "gfx/entity_icons/communication/usb_port.png", keywords: ["usb", "port", "communication"] },
      { id: "video-player", name: "Video Player", icon: "gfx/entity_icons/communication/video_player.png", keywords: ["video", "player", "communication"] },
      { id: "vimeo", name: "Vimeo", icon: "gfx/entity_icons/communication/vimeo.png", keywords: ["vimeo", "communication"] },
      { id: "vine", name: "Vine", icon: "gfx/entity_icons/communication/vine.png", keywords: ["vine", "communication"] },
      { id: "voice-message", name: "Voice Message", icon: "gfx/entity_icons/communication/voice_message.png", keywords: ["voice", "message", "communication"] },
      { id: "volume-control-telephone", name: "Volume Control Telephone", icon: "gfx/entity_icons/communication/volume-control-telephone.svg", keywords: ["volume", "control", "telephone", "communication"] },
      { id: "volume", name: "Volume", icon: "gfx/entity_icons/communication/volume.png", keywords: ["volume", "communication"] },
      { id: "whatsapp", name: "Whatsapp", icon: "gfx/entity_icons/communication/whatsapp.png", keywords: ["whatsapp", "communication"] },
      { id: "wheelchair", name: "Wheelchair", icon: "gfx/entity_icons/communication/wheelchair.svg", keywords: ["wheelchair", "communication"] },
      { id: "wifi-0", name: "Wifi 0", icon: "gfx/entity_icons/communication/wifi-0.svg", keywords: ["wifi", "communication"] },
      { id: "wifi-1", name: "Wifi 1", icon: "gfx/entity_icons/communication/wifi-1.svg", keywords: ["wifi", "communication"] },
      { id: "wifi-2", name: "Wifi 2", icon: "gfx/entity_icons/communication/wifi-2.svg", keywords: ["wifi", "communication"] },
      { id: "wifi-off", name: "Wifi Off", icon: "gfx/entity_icons/communication/wifi-off.svg", keywords: ["wifi", "off", "communication"] },
      { id: "wifi", name: "Wifi", icon: "gfx/entity_icons/communication/wifi.svg", keywords: ["wifi", "communication"] },
      { id: "wifi-signal", name: "Wifi Signal", icon: "gfx/entity_icons/communication/wifi_signal.png", keywords: ["wifi", "signal", "communication"] },
      { id: "wikipedia", name: "Wikipedia", icon: "gfx/entity_icons/communication/wikipedia.png", keywords: ["wikipedia", "communication"] },
      { id: "wordpress", name: "Wordpress", icon: "gfx/entity_icons/communication/wordpress.png", keywords: ["wordpress", "communication"] },
      { id: "yelp", name: "Yelp", icon: "gfx/entity_icons/communication/yelp.png", keywords: ["yelp", "communication"] },
      { id: "youtube", name: "Youtube", icon: "gfx/entity_icons/communication/youtube.png", keywords: ["youtube", "communication"] }
    ]
  },
  events: {
    name: "Events",
    color: "#fb923c",
    defaultIcon: "gfx/entity_icons/events/star.svg",
    icons: [
      { id: "abseiling", name: "Abseiling", icon: "gfx/entity_icons/events/abseiling.svg", keywords: ["abseiling", "events"] },
      { id: "air-balloon", name: "Air Balloon", icon: "gfx/entity_icons/events/air-balloon.svg", keywords: ["air", "balloon", "events"] },
      { id: "american-football", name: "American Football", icon: "gfx/entity_icons/events/american-football.svg", keywords: ["american", "football", "events"] },
      { id: "archery-arrow", name: "Archery Arrow", icon: "gfx/entity_icons/events/archery-arrow.svg", keywords: ["archery", "arrow", "events"] },
      { id: "archery", name: "Archery", icon: "gfx/entity_icons/events/archery.svg", keywords: ["archery", "events"] },
      { id: "art-gallery", name: "Art Gallery", icon: "gfx/entity_icons/events/art-gallery.svg", keywords: ["art", "gallery", "events"] },
      { id: "attraction", name: "Attraction", icon: "gfx/entity_icons/events/attraction.svg", keywords: ["attraction", "events"] },
      { id: "ball-american-football-off", name: "Ball American Football Off", icon: "gfx/entity_icons/events/ball-american-football-off.svg", keywords: ["ball", "american", "football", "off", "events"] },
      { id: "ball-american-football", name: "Ball American Football", icon: "gfx/entity_icons/events/ball-american-football.svg", keywords: ["ball", "american", "football", "events"] },
      { id: "ball-baseball", name: "Ball Baseball", icon: "gfx/entity_icons/events/ball-baseball.svg", keywords: ["ball", "baseball", "events"] },
      { id: "ball-basketball", name: "Ball Basketball", icon: "gfx/entity_icons/events/ball-basketball.svg", keywords: ["ball", "basketball", "events"] },
      { id: "ball-football-off", name: "Ball Football Off", icon: "gfx/entity_icons/events/ball-football-off.svg", keywords: ["ball", "football", "off", "events"] },
      { id: "ball-football", name: "Ball Football", icon: "gfx/entity_icons/events/ball-football.svg", keywords: ["ball", "football", "events"] },
      { id: "ball-tennis", name: "Ball Tennis", icon: "gfx/entity_icons/events/ball-tennis.svg", keywords: ["ball", "tennis", "events"] },
      { id: "ball-volleyball", name: "Ball Volleyball", icon: "gfx/entity_icons/events/ball-volleyball.svg", keywords: ["ball", "volleyball", "events"] },
      { id: "balloon-fill", name: "Balloon Fill", icon: "gfx/entity_icons/events/balloon-fill.svg", keywords: ["balloon", "fill", "events"] },
      { id: "balloon-heart-fill", name: "Balloon Heart Fill", icon: "gfx/entity_icons/events/balloon-heart-fill.svg", keywords: ["balloon", "heart", "fill", "events"] },
      { id: "balloon-heart", name: "Balloon Heart", icon: "gfx/entity_icons/events/balloon-heart.svg", keywords: ["balloon", "heart", "events"] },
      { id: "balloon-off", name: "Balloon Off", icon: "gfx/entity_icons/events/balloon-off.svg", keywords: ["balloon", "off", "events"] },
      { id: "balloon", name: "Balloon", icon: "gfx/entity_icons/events/balloon.svg", keywords: ["balloon", "events"] },
      { id: "bar", name: "Bar", icon: "gfx/entity_icons/events/bar.svg", keywords: ["bar", "events"] },
      { id: "baseball", name: "Baseball", icon: "gfx/entity_icons/events/baseball.svg", keywords: ["baseball", "events"] },
      { id: "basketball", name: "Basketball", icon: "gfx/entity_icons/events/basketball.svg", keywords: ["basketball", "events"] },
      { id: "bbq", name: "Bbq", icon: "gfx/entity_icons/events/bbq.svg", keywords: ["bbq", "events"] },
      { id: "beer", name: "Beer", icon: "gfx/entity_icons/events/beer.svg", keywords: ["beer", "events"] },
      { id: "brand-cinema-4d", name: "Brand Cinema 4d", icon: "gfx/entity_icons/events/brand-cinema-4d.svg", keywords: ["brand", "cinema", "4d", "events"] },
      { id: "chairlift", name: "Chairlift", icon: "gfx/entity_icons/events/chairlift.svg", keywords: ["chairlift", "events"] },
      { id: "chess-bishop", name: "Chess Bishop", icon: "gfx/entity_icons/events/chess-bishop.svg", keywords: ["chess", "bishop", "events"] },
      { id: "chess-king", name: "Chess King", icon: "gfx/entity_icons/events/chess-king.svg", keywords: ["chess", "king", "events"] },
      { id: "chess-knight", name: "Chess Knight", icon: "gfx/entity_icons/events/chess-knight.svg", keywords: ["chess", "knight", "events"] },
      { id: "chess-queen", name: "Chess Queen", icon: "gfx/entity_icons/events/chess-queen.svg", keywords: ["chess", "queen", "events"] },
      { id: "chess-rook", name: "Chess Rook", icon: "gfx/entity_icons/events/chess-rook.svg", keywords: ["chess", "rook", "events"] },
      { id: "chess", name: "Chess", icon: "gfx/entity_icons/events/chess.svg", keywords: ["chess", "events"] },
      { id: "cil-american-football", name: "Cil American Football", icon: "gfx/entity_icons/events/cil-american-football.svg", keywords: ["cil", "american", "football", "events"] },
      { id: "cil-baseball", name: "Cil Baseball", icon: "gfx/entity_icons/events/cil-baseball.svg", keywords: ["cil", "baseball", "events"] },
      { id: "cil-basketball", name: "Cil Basketball", icon: "gfx/entity_icons/events/cil-basketball.svg", keywords: ["cil", "basketball", "events"] },
      { id: "cil-birthday-cake", name: "Cil Birthday Cake", icon: "gfx/entity_icons/events/cil-birthday-cake.svg", keywords: ["cil", "birthday", "cake", "events"] },
      { id: "cil-football", name: "Cil Football", icon: "gfx/entity_icons/events/cil-football.svg", keywords: ["cil", "football", "events"] },
      { id: "cil-golf-alt", name: "Cil Golf Alt", icon: "gfx/entity_icons/events/cil-golf-alt.svg", keywords: ["cil", "golf", "alt", "events"] },
      { id: "cil-golf", name: "Cil Golf", icon: "gfx/entity_icons/events/cil-golf.svg", keywords: ["cil", "golf", "events"] },
      { id: "cil-puzzle", name: "Cil Puzzle", icon: "gfx/entity_icons/events/cil-puzzle.svg", keywords: ["cil", "puzzle", "events"] },
      { id: "cil-running", name: "Cil Running", icon: "gfx/entity_icons/events/cil-running.svg", keywords: ["cil", "running", "events"] },
      { id: "cil-soccer", name: "Cil Soccer", icon: "gfx/entity_icons/events/cil-soccer.svg", keywords: ["cil", "soccer", "events"] },
      { id: "cil-swimming", name: "Cil Swimming", icon: "gfx/entity_icons/events/cil-swimming.svg", keywords: ["cil", "swimming", "events"] },
      { id: "cil-tennis-ball", name: "Cil Tennis Ball", icon: "gfx/entity_icons/events/cil-tennis-ball.svg", keywords: ["cil", "tennis", "ball", "events"] },
      { id: "cil-tennis", name: "Cil Tennis", icon: "gfx/entity_icons/events/cil-tennis.svg", keywords: ["cil", "tennis", "events"] },
      { id: "climbing", name: "Climbing", icon: "gfx/entity_icons/events/climbing.svg", keywords: ["climbing", "events"] },
      { id: "confetti-off", name: "Confetti Off", icon: "gfx/entity_icons/events/confetti-off.svg", keywords: ["confetti", "off", "events"] },
      { id: "confetti", name: "Confetti", icon: "gfx/entity_icons/events/confetti.svg", keywords: ["confetti", "events"] },
      { id: "controller", name: "Controller", icon: "gfx/entity_icons/events/controller.svg", keywords: ["controller", "events"] },
      { id: "cricket", name: "Cricket", icon: "gfx/entity_icons/events/cricket.svg", keywords: ["cricket", "events"] },
      { id: "cross-country-skiing", name: "Cross Country Skiing", icon: "gfx/entity_icons/events/cross-country-skiing.svg", keywords: ["cross", "country", "skiing", "events"] },
      { id: "diamond", name: "Diamond", icon: "gfx/entity_icons/events/diamond.svg", keywords: ["diamond", "events"] },
      { id: "dice-1-fill", name: "Dice 1 Fill", icon: "gfx/entity_icons/events/dice-1-fill.svg", keywords: ["dice", "fill", "events"] },
      { id: "dice-1", name: "Dice 1", icon: "gfx/entity_icons/events/dice-1.svg", keywords: ["dice", "events"] },
      { id: "dice-2-fill", name: "Dice 2 Fill", icon: "gfx/entity_icons/events/dice-2-fill.svg", keywords: ["dice", "fill", "events"] },
      { id: "dice-2", name: "Dice 2", icon: "gfx/entity_icons/events/dice-2.svg", keywords: ["dice", "events"] },
      { id: "dice-3-fill", name: "Dice 3 Fill", icon: "gfx/entity_icons/events/dice-3-fill.svg", keywords: ["dice", "fill", "events"] },
      { id: "dice-3", name: "Dice 3", icon: "gfx/entity_icons/events/dice-3.svg", keywords: ["dice", "events"] },
      { id: "dice-4-fill", name: "Dice 4 Fill", icon: "gfx/entity_icons/events/dice-4-fill.svg", keywords: ["dice", "fill", "events"] },
      { id: "dice-4", name: "Dice 4", icon: "gfx/entity_icons/events/dice-4.svg", keywords: ["dice", "events"] },
      { id: "dice-5-fill", name: "Dice 5 Fill", icon: "gfx/entity_icons/events/dice-5-fill.svg", keywords: ["dice", "fill", "events"] },
      { id: "dice-5", name: "Dice 5", icon: "gfx/entity_icons/events/dice-5.svg", keywords: ["dice", "events"] },
      { id: "dice-6-fill", name: "Dice 6 Fill", icon: "gfx/entity_icons/events/dice-6-fill.svg", keywords: ["dice", "fill", "events"] },
      { id: "dice-6", name: "Dice 6", icon: "gfx/entity_icons/events/dice-6.svg", keywords: ["dice", "events"] },
      { id: "dice", name: "Dice", icon: "gfx/entity_icons/events/dice.svg", keywords: ["dice", "events"] },
      { id: "disc-golf", name: "Disc Golf", icon: "gfx/entity_icons/events/disc-golf.svg", keywords: ["disc", "golf", "events"] },
      { id: "gaming", name: "Gaming", icon: "gfx/entity_icons/events/gaming.svg", keywords: ["gaming", "events"] },
      { id: "gift", name: "Gift", icon: "gfx/entity_icons/events/gift.svg", keywords: ["gift", "events"] },
      { id: "golf-off", name: "Golf Off", icon: "gfx/entity_icons/events/golf-off.svg", keywords: ["golf", "off", "events"] },
      { id: "golf", name: "Golf", icon: "gfx/entity_icons/events/golf.svg", keywords: ["golf", "events"] },
      { id: "hang-gliding", name: "Hang Gliding", icon: "gfx/entity_icons/events/hang-gliding.svg", keywords: ["hang", "gliding", "events"] },
      { id: "heart", name: "Heart", icon: "gfx/entity_icons/events/heart.svg", keywords: ["heart", "events"] },
      { id: "horse-riding", name: "Horse Riding", icon: "gfx/entity_icons/events/horse-riding.svg", keywords: ["horse", "riding", "events"] },
      { id: "ice-skating", name: "Ice Skating", icon: "gfx/entity_icons/events/ice-skating.svg", keywords: ["ice", "skating", "events"] },
      { id: "inline-skating", name: "Inline Skating", icon: "gfx/entity_icons/events/inline-skating.svg", keywords: ["inline", "skating", "events"] },
      { id: "joystick", name: "Joystick", icon: "gfx/entity_icons/events/joystick.svg", keywords: ["joystick", "events"] },
      { id: "karaoke", name: "Karaoke", icon: "gfx/entity_icons/events/karaoke.svg", keywords: ["karaoke", "events"] },
      { id: "masks-theater-off", name: "Masks Theater Off", icon: "gfx/entity_icons/events/masks-theater-off.svg", keywords: ["masks", "theater", "off", "events"] },
      { id: "masks-theater", name: "Masks Theater", icon: "gfx/entity_icons/events/masks-theater.svg", keywords: ["masks", "theater", "events"] },
      { id: "medal-2", name: "Medal 2", icon: "gfx/entity_icons/events/medal-2.svg", keywords: ["medal", "events"] },
      { id: "medal", name: "Medal", icon: "gfx/entity_icons/events/medal.svg", keywords: ["medal", "events"] },
      { id: "mountain", name: "Mountain", icon: "gfx/entity_icons/events/mountain.svg", keywords: ["mountain", "events"] },
      { id: "movie-theater", name: "Movie Theater", icon: "gfx/entity_icons/events/movie-theater.svg", keywords: ["movie", "theater", "events"] },
      { id: "music", name: "Music", icon: "gfx/entity_icons/events/music.svg", keywords: ["music", "events"] },
      { id: "natural-feature", name: "Natural Feature", icon: "gfx/entity_icons/events/natural-feature.svg", keywords: ["natural", "feature", "events"] },
      { id: "natural", name: "Natural", icon: "gfx/entity_icons/events/natural.svg", keywords: ["natural", "events"] },
      { id: "night-club", name: "Night Club", icon: "gfx/entity_icons/events/night-club.svg", keywords: ["night", "club", "events"] },
      { id: "nightclub", name: "Nightclub", icon: "gfx/entity_icons/events/nightclub.svg", keywords: ["nightclub", "events"] },
      { id: "paint", name: "Paint", icon: "gfx/entity_icons/events/paint.svg", keywords: ["paint", "events"] },
      { id: "picnic-site", name: "Picnic Site", icon: "gfx/entity_icons/events/picnic-site.svg", keywords: ["picnic", "site", "events"] },
      { id: "pitch", name: "Pitch", icon: "gfx/entity_icons/events/pitch.svg", keywords: ["pitch", "events"] },
      { id: "play-basketball", name: "Play Basketball", icon: "gfx/entity_icons/events/play-basketball.svg", keywords: ["play", "basketball", "events"] },
      { id: "play-football", name: "Play Football", icon: "gfx/entity_icons/events/play-football.svg", keywords: ["play", "football", "events"] },
      { id: "play-volleyball", name: "Play Volleyball", icon: "gfx/entity_icons/events/play-volleyball.svg", keywords: ["play", "volleyball", "events"] },
      { id: "podium-off", name: "Podium Off", icon: "gfx/entity_icons/events/podium-off.svg", keywords: ["podium", "off", "events"] },
      { id: "podium", name: "Podium", icon: "gfx/entity_icons/events/podium.svg", keywords: ["podium", "events"] },
      { id: "point-of-interest", name: "Point Of Interest", icon: "gfx/entity_icons/events/point-of-interest.svg", keywords: ["point", "of", "interest", "events"] },
      { id: "puzzle-2", name: "Puzzle 2", icon: "gfx/entity_icons/events/puzzle-2.svg", keywords: ["puzzle", "events"] },
      { id: "puzzle-fill", name: "Puzzle Fill", icon: "gfx/entity_icons/events/puzzle-fill.svg", keywords: ["puzzle", "fill", "events"] },
      { id: "puzzle-off", name: "Puzzle Off", icon: "gfx/entity_icons/events/puzzle-off.svg", keywords: ["puzzle", "off", "events"] },
      { id: "puzzle", name: "Puzzle", icon: "gfx/entity_icons/events/puzzle.svg", keywords: ["puzzle", "events"] },
      { id: "shoe", name: "Shoe", icon: "gfx/entity_icons/events/shoe.svg", keywords: ["shoe", "events"] },
      { id: "skateboard", name: "Skateboard", icon: "gfx/entity_icons/events/skateboard.svg", keywords: ["skateboard", "events"] },
      { id: "skateboarding", name: "Skateboarding", icon: "gfx/entity_icons/events/skateboarding.svg", keywords: ["skateboarding", "events"] },
      { id: "ski-jumping", name: "Ski Jumping", icon: "gfx/entity_icons/events/ski-jumping.svg", keywords: ["ski", "jumping", "events"] },
      { id: "skiing", name: "Skiing", icon: "gfx/entity_icons/events/skiing.svg", keywords: ["skiing", "events"] },
      { id: "sledding", name: "Sledding", icon: "gfx/entity_icons/events/sledding.svg", keywords: ["sledding", "events"] },
      { id: "snow-shoeing", name: "Snow Shoeing", icon: "gfx/entity_icons/events/snow-shoeing.svg", keywords: ["snow", "shoeing", "events"] },
      { id: "snow", name: "Snow", icon: "gfx/entity_icons/events/snow.svg", keywords: ["snow", "events"] },
      { id: "snowboarding", name: "Snowboarding", icon: "gfx/entity_icons/events/snowboarding.svg", keywords: ["snowboarding", "events"] },
      { id: "snowmobile", name: "Snowmobile", icon: "gfx/entity_icons/events/snowmobile.svg", keywords: ["snowmobile", "events"] },
      { id: "soccer-field", name: "Soccer Field", icon: "gfx/entity_icons/events/soccer-field.svg", keywords: ["soccer", "field", "events"] },
      { id: "soccer", name: "Soccer", icon: "gfx/entity_icons/events/soccer.svg", keywords: ["soccer", "events"] },
      { id: "star-stroked", name: "Star Stroked", icon: "gfx/entity_icons/events/star-stroked.svg", keywords: ["star", "stroked", "events"] },
      { id: "star", name: "Star", icon: "gfx/entity_icons/events/star.svg", keywords: ["star", "events"] },
      { id: "suitcase", name: "Suitcase", icon: "gfx/entity_icons/events/suitcase.svg", keywords: ["suitcase", "events"] },
      { id: "swimming", name: "Swimming", icon: "gfx/entity_icons/events/swimming.svg", keywords: ["swimming", "events"] },
      { id: "table-tennis", name: "Table Tennis", icon: "gfx/entity_icons/events/table-tennis.svg", keywords: ["table", "tennis", "events"] },
      { id: "tennis", name: "Tennis", icon: "gfx/entity_icons/events/tennis.svg", keywords: ["tennis", "events"] },
      { id: "theater", name: "Theater", icon: "gfx/entity_icons/events/theater.svg", keywords: ["theater", "events"] },
      { id: "trail-walking", name: "Trail Walking", icon: "gfx/entity_icons/events/trail-walking.svg", keywords: ["trail", "walking", "events"] },
      { id: "travel-agency", name: "Travel Agency", icon: "gfx/entity_icons/events/travel-agency.svg", keywords: ["travel", "agency", "events"] },
      { id: "trophy-off", name: "Trophy Off", icon: "gfx/entity_icons/events/trophy-off.svg", keywords: ["trophy", "off", "events"] },
      { id: "trophy", name: "Trophy", icon: "gfx/entity_icons/events/trophy.svg", keywords: ["trophy", "events"] },
      { id: "volcano", name: "Volcano", icon: "gfx/entity_icons/events/volcano.svg", keywords: ["volcano", "events"] },
      { id: "volleyball", name: "Volleyball", icon: "gfx/entity_icons/events/volleyball.svg", keywords: ["volleyball", "events"] },
      { id: "walking", name: "Walking", icon: "gfx/entity_icons/events/walking.svg", keywords: ["walking", "events"] },
      { id: "watch", name: "Watch", icon: "gfx/entity_icons/events/watch.svg", keywords: ["watch", "events"] },
      { id: "yoga", name: "Yoga", icon: "gfx/entity_icons/events/yoga.svg", keywords: ["yoga", "events"] }
    ]
  },
  document: {
    name: "Documents",
    color: "#6b7280",
    defaultIcon: "gfx/entity_icons/document/file.svg",
    icons: [
      { id: "archive-fill", name: "Archive Fill", icon: "gfx/entity_icons/document/archive-fill.svg", keywords: ["archive", "fill", "document"] },
      { id: "archive-off", name: "Archive Off", icon: "gfx/entity_icons/document/archive-off.svg", keywords: ["archive", "off", "document"] },
      { id: "archive", name: "Archive", icon: "gfx/entity_icons/document/archive.svg", keywords: ["archive", "document"] },
      { id: "arrows-angle-contract", name: "Arrows Angle Contract", icon: "gfx/entity_icons/document/arrows-angle-contract.svg", keywords: ["arrows", "angle", "contract", "document"] },
      { id: "bookmark-ai", name: "Bookmark Ai", icon: "gfx/entity_icons/document/bookmark-ai.svg", keywords: ["bookmark", "ai", "document"] },
      { id: "bookmark-check-fill", name: "Bookmark Check Fill", icon: "gfx/entity_icons/document/bookmark-check-fill.svg", keywords: ["bookmark", "check", "fill", "document"] },
      { id: "bookmark-check", name: "Bookmark Check", icon: "gfx/entity_icons/document/bookmark-check.svg", keywords: ["bookmark", "check", "document"] },
      { id: "bookmark-dash-fill", name: "Bookmark Dash Fill", icon: "gfx/entity_icons/document/bookmark-dash-fill.svg", keywords: ["bookmark", "dash", "fill", "document"] },
      { id: "bookmark-dash", name: "Bookmark Dash", icon: "gfx/entity_icons/document/bookmark-dash.svg", keywords: ["bookmark", "dash", "document"] },
      { id: "bookmark-edit", name: "Bookmark Edit", icon: "gfx/entity_icons/document/bookmark-edit.svg", keywords: ["bookmark", "edit", "document"] },
      { id: "bookmark-fill", name: "Bookmark Fill", icon: "gfx/entity_icons/document/bookmark-fill.svg", keywords: ["bookmark", "fill", "document"] },
      { id: "bookmark-heart-fill", name: "Bookmark Heart Fill", icon: "gfx/entity_icons/document/bookmark-heart-fill.svg", keywords: ["bookmark", "heart", "fill", "document"] },
      { id: "bookmark-heart", name: "Bookmark Heart", icon: "gfx/entity_icons/document/bookmark-heart.svg", keywords: ["bookmark", "heart", "document"] },
      { id: "bookmark-minus", name: "Bookmark Minus", icon: "gfx/entity_icons/document/bookmark-minus.svg", keywords: ["bookmark", "minus", "document"] },
      { id: "bookmark-off", name: "Bookmark Off", icon: "gfx/entity_icons/document/bookmark-off.svg", keywords: ["bookmark", "off", "document"] },
      { id: "bookmark-plus-fill", name: "Bookmark Plus Fill", icon: "gfx/entity_icons/document/bookmark-plus-fill.svg", keywords: ["bookmark", "plus", "fill", "document"] },
      { id: "bookmark-plus", name: "Bookmark Plus", icon: "gfx/entity_icons/document/bookmark-plus.svg", keywords: ["bookmark", "plus", "document"] },
      { id: "bookmark-question", name: "Bookmark Question", icon: "gfx/entity_icons/document/bookmark-question.svg", keywords: ["bookmark", "question", "document"] },
      { id: "bookmark-star-fill", name: "Bookmark Star Fill", icon: "gfx/entity_icons/document/bookmark-star-fill.svg", keywords: ["bookmark", "star", "fill", "document"] },
      { id: "bookmark-star", name: "Bookmark Star", icon: "gfx/entity_icons/document/bookmark-star.svg", keywords: ["bookmark", "star", "document"] },
      { id: "bookmark-x-fill", name: "Bookmark X Fill", icon: "gfx/entity_icons/document/bookmark-x-fill.svg", keywords: ["bookmark", "fill", "document"] },
      { id: "bookmark-x", name: "Bookmark X", icon: "gfx/entity_icons/document/bookmark-x.svg", keywords: ["bookmark", "document"] },
      { id: "bookmark", name: "Bookmark", icon: "gfx/entity_icons/document/bookmark.svg", keywords: ["bookmark", "document"] },
      { id: "card-checklist", name: "Card Checklist", icon: "gfx/entity_icons/document/card-checklist.svg", keywords: ["card", "checklist", "document"] },
      { id: "certificate-2-off", name: "Certificate 2 Off", icon: "gfx/entity_icons/document/certificate-2-off.svg", keywords: ["certificate", "off", "document"] },
      { id: "certificate-2", name: "Certificate 2", icon: "gfx/entity_icons/document/certificate-2.svg", keywords: ["certificate", "document"] },
      { id: "certificate-off", name: "Certificate Off", icon: "gfx/entity_icons/document/certificate-off.svg", keywords: ["certificate", "off", "document"] },
      { id: "certificate", name: "Certificate", icon: "gfx/entity_icons/document/certificate.svg", keywords: ["certificate", "document"] },
      { id: "checklist", name: "Checklist", icon: "gfx/entity_icons/document/checklist.svg", keywords: ["checklist", "document"] },
      { id: "chevron-bar-contract", name: "Chevron Bar Contract", icon: "gfx/entity_icons/document/chevron-bar-contract.svg", keywords: ["chevron", "bar", "contract", "document"] },
      { id: "chevron-contract", name: "Chevron Contract", icon: "gfx/entity_icons/document/chevron-contract.svg", keywords: ["chevron", "contract", "document"] },
      { id: "cib-archive-of-our-own", name: "Cib Archive Of Our Own", icon: "gfx/entity_icons/document/cib-archive-of-our-own.svg", keywords: ["cib", "archive", "of", "our", "own", "document"] },
      { id: "cib-hatena-bookmark", name: "Cib Hatena Bookmark", icon: "gfx/entity_icons/document/cib-hatena-bookmark.svg", keywords: ["cib", "hatena", "bookmark", "document"] },
      { id: "cib-markdown", name: "Cib Markdown", icon: "gfx/entity_icons/document/cib-markdown.svg", keywords: ["cib", "markdown", "document"] },
      { id: "cil-bookmark", name: "Cil Bookmark", icon: "gfx/entity_icons/document/cil-bookmark.svg", keywords: ["cil", "bookmark", "document"] },
      { id: "cil-clipboard", name: "Cil Clipboard", icon: "gfx/entity_icons/document/cil-clipboard.svg", keywords: ["cil", "clipboard", "document"] },
      { id: "cil-file", name: "Cil File", icon: "gfx/entity_icons/document/cil-file.svg", keywords: ["cil", "file", "document"] },
      { id: "cil-folder-open", name: "Cil Folder Open", icon: "gfx/entity_icons/document/cil-folder-open.svg", keywords: ["cil", "folder", "open", "document"] },
      { id: "cil-folder", name: "Cil Folder", icon: "gfx/entity_icons/document/cil-folder.svg", keywords: ["cil", "folder", "document"] },
      { id: "cil-paperclip", name: "Cil Paperclip", icon: "gfx/entity_icons/document/cil-paperclip.svg", keywords: ["cil", "paperclip", "document"] },
      { id: "cil-pencil", name: "Cil Pencil", icon: "gfx/entity_icons/document/cil-pencil.svg", keywords: ["cil", "pencil", "document"] },
      { id: "cil-report-slash", name: "Cil Report Slash", icon: "gfx/entity_icons/document/cil-report-slash.svg", keywords: ["cil", "report", "slash", "document"] },
      { id: "cil-spreadsheet", name: "Cil Spreadsheet", icon: "gfx/entity_icons/document/cil-spreadsheet.svg", keywords: ["cil", "spreadsheet", "document"] },
      { id: "clipboard-check-fill", name: "Clipboard Check Fill", icon: "gfx/entity_icons/document/clipboard-check-fill.svg", keywords: ["clipboard", "check", "fill", "document"] },
      { id: "clipboard-check", name: "Clipboard Check", icon: "gfx/entity_icons/document/clipboard-check.svg", keywords: ["clipboard", "check", "document"] },
      { id: "clipboard-copy", name: "Clipboard Copy", icon: "gfx/entity_icons/document/clipboard-copy.svg", keywords: ["clipboard", "copy", "document"] },
      { id: "clipboard-data-fill", name: "Clipboard Data Fill", icon: "gfx/entity_icons/document/clipboard-data-fill.svg", keywords: ["clipboard", "data", "fill", "document"] },
      { id: "clipboard-data", name: "Clipboard Data", icon: "gfx/entity_icons/document/clipboard-data.svg", keywords: ["clipboard", "data", "document"] },
      { id: "clipboard-fill", name: "Clipboard Fill", icon: "gfx/entity_icons/document/clipboard-fill.svg", keywords: ["clipboard", "fill", "document"] },
      { id: "clipboard-heart-fill", name: "Clipboard Heart Fill", icon: "gfx/entity_icons/document/clipboard-heart-fill.svg", keywords: ["clipboard", "heart", "fill", "document"] },
      { id: "clipboard-heart", name: "Clipboard Heart", icon: "gfx/entity_icons/document/clipboard-heart.svg", keywords: ["clipboard", "heart", "document"] },
      { id: "clipboard-list", name: "Clipboard List", icon: "gfx/entity_icons/document/clipboard-list.svg", keywords: ["clipboard", "list", "document"] },
      { id: "clipboard-minus-fill", name: "Clipboard Minus Fill", icon: "gfx/entity_icons/document/clipboard-minus-fill.svg", keywords: ["clipboard", "minus", "fill", "document"] },
      { id: "clipboard-minus", name: "Clipboard Minus", icon: "gfx/entity_icons/document/clipboard-minus.svg", keywords: ["clipboard", "minus", "document"] },
      { id: "clipboard-off", name: "Clipboard Off", icon: "gfx/entity_icons/document/clipboard-off.svg", keywords: ["clipboard", "off", "document"] },
      { id: "clipboard-plus-fill", name: "Clipboard Plus Fill", icon: "gfx/entity_icons/document/clipboard-plus-fill.svg", keywords: ["clipboard", "plus", "fill", "document"] },
      { id: "clipboard-plus", name: "Clipboard Plus", icon: "gfx/entity_icons/document/clipboard-plus.svg", keywords: ["clipboard", "plus", "document"] },
      { id: "clipboard-pulse", name: "Clipboard Pulse", icon: "gfx/entity_icons/document/clipboard-pulse.svg", keywords: ["clipboard", "pulse", "document"] },
      { id: "clipboard-search", name: "Clipboard Search", icon: "gfx/entity_icons/document/clipboard-search.svg", keywords: ["clipboard", "search", "document"] },
      { id: "clipboard-smile", name: "Clipboard Smile", icon: "gfx/entity_icons/document/clipboard-smile.svg", keywords: ["clipboard", "smile", "document"] },
      { id: "clipboard-text", name: "Clipboard Text", icon: "gfx/entity_icons/document/clipboard-text.svg", keywords: ["clipboard", "text", "document"] },
      { id: "clipboard-typography", name: "Clipboard Typography", icon: "gfx/entity_icons/document/clipboard-typography.svg", keywords: ["clipboard", "typography", "document"] },
      { id: "clipboard-x-fill", name: "Clipboard X Fill", icon: "gfx/entity_icons/document/clipboard-x-fill.svg", keywords: ["clipboard", "fill", "document"] },
      { id: "clipboard-x", name: "Clipboard X", icon: "gfx/entity_icons/document/clipboard-x.svg", keywords: ["clipboard", "document"] },
      { id: "clipboard", name: "Clipboard", icon: "gfx/entity_icons/document/clipboard.svg", keywords: ["clipboard", "document"] },
      { id: "contract", name: "Contract", icon: "gfx/entity_icons/document/contract.svg", keywords: ["contract", "document"] },
      { id: "file-3d", name: "File 3d", icon: "gfx/entity_icons/document/file-3d.svg", keywords: ["file", "3d", "document"] },
      { id: "file-ai", name: "File Ai", icon: "gfx/entity_icons/document/file-ai.svg", keywords: ["file", "ai", "document"] },
      { id: "file-alert", name: "File Alert", icon: "gfx/entity_icons/document/file-alert.svg", keywords: ["file", "alert", "document"] },
      { id: "file-analytics", name: "File Analytics", icon: "gfx/entity_icons/document/file-analytics.svg", keywords: ["file", "analytics", "document"] },
      { id: "file-arrow-down-fill", name: "File Arrow Down Fill", icon: "gfx/entity_icons/document/file-arrow-down-fill.svg", keywords: ["file", "arrow", "down", "fill", "document"] },
      { id: "file-arrow-down", name: "File Arrow Down", icon: "gfx/entity_icons/document/file-arrow-down.svg", keywords: ["file", "arrow", "down", "document"] },
      { id: "file-arrow-left", name: "File Arrow Left", icon: "gfx/entity_icons/document/file-arrow-left.svg", keywords: ["file", "arrow", "left", "document"] },
      { id: "file-arrow-right", name: "File Arrow Right", icon: "gfx/entity_icons/document/file-arrow-right.svg", keywords: ["file", "arrow", "right", "document"] },
      { id: "file-arrow-up-fill", name: "File Arrow Up Fill", icon: "gfx/entity_icons/document/file-arrow-up-fill.svg", keywords: ["file", "arrow", "up", "fill", "document"] },
      { id: "file-arrow-up", name: "File Arrow Up", icon: "gfx/entity_icons/document/file-arrow-up.svg", keywords: ["file", "arrow", "up", "document"] },
      { id: "file-bar-graph-fill", name: "File Bar Graph Fill", icon: "gfx/entity_icons/document/file-bar-graph-fill.svg", keywords: ["file", "bar", "graph", "fill", "document"] },
      { id: "file-bar-graph", name: "File Bar Graph", icon: "gfx/entity_icons/document/file-bar-graph.svg", keywords: ["file", "bar", "graph", "document"] },
      { id: "file-binary-fill", name: "File Binary Fill", icon: "gfx/entity_icons/document/file-binary-fill.svg", keywords: ["file", "binary", "fill", "document"] },
      { id: "file-binary", name: "File Binary", icon: "gfx/entity_icons/document/file-binary.svg", keywords: ["file", "binary", "document"] },
      { id: "file-break-fill", name: "File Break Fill", icon: "gfx/entity_icons/document/file-break-fill.svg", keywords: ["file", "break", "fill", "document"] },
      { id: "file-break", name: "File Break", icon: "gfx/entity_icons/document/file-break.svg", keywords: ["file", "break", "document"] },
      { id: "file-broken", name: "File Broken", icon: "gfx/entity_icons/document/file-broken.svg", keywords: ["file", "broken", "document"] },
      { id: "file-certificate", name: "File Certificate", icon: "gfx/entity_icons/document/file-certificate.svg", keywords: ["file", "certificate", "document"] },
      { id: "file-chart", name: "File Chart", icon: "gfx/entity_icons/document/file-chart.svg", keywords: ["file", "chart", "document"] },
      { id: "file-check-fill", name: "File Check Fill", icon: "gfx/entity_icons/document/file-check-fill.svg", keywords: ["file", "check", "fill", "document"] },
      { id: "file-check", name: "File Check", icon: "gfx/entity_icons/document/file-check.svg", keywords: ["file", "check", "document"] },
      { id: "file-code-2", name: "File Code 2", icon: "gfx/entity_icons/document/file-code-2.svg", keywords: ["file", "code", "document"] },
      { id: "file-code-fill", name: "File Code Fill", icon: "gfx/entity_icons/document/file-code-fill.svg", keywords: ["file", "code", "fill", "document"] },
      { id: "file-code", name: "File Code", icon: "gfx/entity_icons/document/file-code.svg", keywords: ["file", "code", "document"] },
      { id: "file-cv", name: "File Cv", icon: "gfx/entity_icons/document/file-cv.svg", keywords: ["file", "cv", "document"] },
      { id: "file-database", name: "File Database", icon: "gfx/entity_icons/document/file-database.svg", keywords: ["file", "database", "document"] },
      { id: "file-delta", name: "File Delta", icon: "gfx/entity_icons/document/file-delta.svg", keywords: ["file", "delta", "document"] },
      { id: "file-description", name: "File Description", icon: "gfx/entity_icons/document/file-description.svg", keywords: ["file", "description", "document"] },
      { id: "file-diff-fill", name: "File Diff Fill", icon: "gfx/entity_icons/document/file-diff-fill.svg", keywords: ["file", "diff", "fill", "document"] },
      { id: "file-diff", name: "File Diff", icon: "gfx/entity_icons/document/file-diff.svg", keywords: ["file", "diff", "document"] },
      { id: "file-digit", name: "File Digit", icon: "gfx/entity_icons/document/file-digit.svg", keywords: ["file", "digit", "document"] },
      { id: "file-dislike", name: "File Dislike", icon: "gfx/entity_icons/document/file-dislike.svg", keywords: ["file", "dislike", "document"] },
      { id: "file-dots", name: "File Dots", icon: "gfx/entity_icons/document/file-dots.svg", keywords: ["file", "dots", "document"] },
      { id: "file-download", name: "File Download", icon: "gfx/entity_icons/document/file-download.svg", keywords: ["file", "download", "document"] },
      { id: "file-earmark-arrow-down-fill", name: "File Earmark Arrow Down Fill", icon: "gfx/entity_icons/document/file-earmark-arrow-down-fill.svg", keywords: ["file", "earmark", "arrow", "down", "fill", "document"] },
      { id: "file-earmark-arrow-down", name: "File Earmark Arrow Down", icon: "gfx/entity_icons/document/file-earmark-arrow-down.svg", keywords: ["file", "earmark", "arrow", "down", "document"] },
      { id: "file-earmark-arrow-up-fill", name: "File Earmark Arrow Up Fill", icon: "gfx/entity_icons/document/file-earmark-arrow-up-fill.svg", keywords: ["file", "earmark", "arrow", "up", "fill", "document"] },
      { id: "file-earmark-arrow-up", name: "File Earmark Arrow Up", icon: "gfx/entity_icons/document/file-earmark-arrow-up.svg", keywords: ["file", "earmark", "arrow", "up", "document"] },
      { id: "file-earmark-bar-graph-fill", name: "File Earmark Bar Graph Fill", icon: "gfx/entity_icons/document/file-earmark-bar-graph-fill.svg", keywords: ["file", "earmark", "bar", "graph", "fill", "document"] },
      { id: "file-earmark-bar-graph", name: "File Earmark Bar Graph", icon: "gfx/entity_icons/document/file-earmark-bar-graph.svg", keywords: ["file", "earmark", "bar", "graph", "document"] },
      { id: "file-earmark-binary-fill", name: "File Earmark Binary Fill", icon: "gfx/entity_icons/document/file-earmark-binary-fill.svg", keywords: ["file", "earmark", "binary", "fill", "document"] },
      { id: "file-earmark-binary", name: "File Earmark Binary", icon: "gfx/entity_icons/document/file-earmark-binary.svg", keywords: ["file", "earmark", "binary", "document"] },
      { id: "file-earmark-break-fill", name: "File Earmark Break Fill", icon: "gfx/entity_icons/document/file-earmark-break-fill.svg", keywords: ["file", "earmark", "break", "fill", "document"] },
      { id: "file-earmark-break", name: "File Earmark Break", icon: "gfx/entity_icons/document/file-earmark-break.svg", keywords: ["file", "earmark", "break", "document"] },
      { id: "file-earmark-check-fill", name: "File Earmark Check Fill", icon: "gfx/entity_icons/document/file-earmark-check-fill.svg", keywords: ["file", "earmark", "check", "fill", "document"] },
      { id: "file-earmark-check", name: "File Earmark Check", icon: "gfx/entity_icons/document/file-earmark-check.svg", keywords: ["file", "earmark", "check", "document"] },
      { id: "file-earmark-code-fill", name: "File Earmark Code Fill", icon: "gfx/entity_icons/document/file-earmark-code-fill.svg", keywords: ["file", "earmark", "code", "fill", "document"] },
      { id: "file-earmark-code", name: "File Earmark Code", icon: "gfx/entity_icons/document/file-earmark-code.svg", keywords: ["file", "earmark", "code", "document"] },
      { id: "file-earmark-diff-fill", name: "File Earmark Diff Fill", icon: "gfx/entity_icons/document/file-earmark-diff-fill.svg", keywords: ["file", "earmark", "diff", "fill", "document"] },
      { id: "file-earmark-diff", name: "File Earmark Diff", icon: "gfx/entity_icons/document/file-earmark-diff.svg", keywords: ["file", "earmark", "diff", "document"] },
      { id: "file-earmark-easel-fill", name: "File Earmark Easel Fill", icon: "gfx/entity_icons/document/file-earmark-easel-fill.svg", keywords: ["file", "earmark", "easel", "fill", "document"] },
      { id: "file-earmark-easel", name: "File Earmark Easel", icon: "gfx/entity_icons/document/file-earmark-easel.svg", keywords: ["file", "earmark", "easel", "document"] },
      { id: "file-earmark-excel-fill", name: "File Earmark Excel Fill", icon: "gfx/entity_icons/document/file-earmark-excel-fill.svg", keywords: ["file", "earmark", "excel", "fill", "document"] },
      { id: "file-earmark-excel", name: "File Earmark Excel", icon: "gfx/entity_icons/document/file-earmark-excel.svg", keywords: ["file", "earmark", "excel", "document"] },
      { id: "file-earmark-fill", name: "File Earmark Fill", icon: "gfx/entity_icons/document/file-earmark-fill.svg", keywords: ["file", "earmark", "fill", "document"] },
      { id: "file-earmark-font-fill", name: "File Earmark Font Fill", icon: "gfx/entity_icons/document/file-earmark-font-fill.svg", keywords: ["file", "earmark", "font", "fill", "document"] },
      { id: "file-earmark-font", name: "File Earmark Font", icon: "gfx/entity_icons/document/file-earmark-font.svg", keywords: ["file", "earmark", "font", "document"] },
      { id: "file-earmark-image-fill", name: "File Earmark Image Fill", icon: "gfx/entity_icons/document/file-earmark-image-fill.svg", keywords: ["file", "earmark", "image", "fill", "document"] },
      { id: "file-earmark-image", name: "File Earmark Image", icon: "gfx/entity_icons/document/file-earmark-image.svg", keywords: ["file", "earmark", "image", "document"] },
      { id: "file-earmark-lock-fill", name: "File Earmark Lock Fill", icon: "gfx/entity_icons/document/file-earmark-lock-fill.svg", keywords: ["file", "earmark", "lock", "fill", "document"] },
      { id: "file-earmark-lock", name: "File Earmark Lock", icon: "gfx/entity_icons/document/file-earmark-lock.svg", keywords: ["file", "earmark", "lock", "document"] },
      { id: "file-earmark-lock2-fill", name: "File Earmark Lock2 Fill", icon: "gfx/entity_icons/document/file-earmark-lock2-fill.svg", keywords: ["file", "earmark", "lock2", "fill", "document"] },
      { id: "file-earmark-lock2", name: "File Earmark Lock2", icon: "gfx/entity_icons/document/file-earmark-lock2.svg", keywords: ["file", "earmark", "lock2", "document"] },
      { id: "file-earmark-medical-fill", name: "File Earmark Medical Fill", icon: "gfx/entity_icons/document/file-earmark-medical-fill.svg", keywords: ["file", "earmark", "medical", "fill", "document"] },
      { id: "file-earmark-medical", name: "File Earmark Medical", icon: "gfx/entity_icons/document/file-earmark-medical.svg", keywords: ["file", "earmark", "medical", "document"] },
      { id: "file-earmark-minus-fill", name: "File Earmark Minus Fill", icon: "gfx/entity_icons/document/file-earmark-minus-fill.svg", keywords: ["file", "earmark", "minus", "fill", "document"] },
      { id: "file-earmark-minus", name: "File Earmark Minus", icon: "gfx/entity_icons/document/file-earmark-minus.svg", keywords: ["file", "earmark", "minus", "document"] },
      { id: "file-earmark-music-fill", name: "File Earmark Music Fill", icon: "gfx/entity_icons/document/file-earmark-music-fill.svg", keywords: ["file", "earmark", "music", "fill", "document"] },
      { id: "file-earmark-music", name: "File Earmark Music", icon: "gfx/entity_icons/document/file-earmark-music.svg", keywords: ["file", "earmark", "music", "document"] },
      { id: "file-earmark-pdf-fill", name: "File Earmark Pdf Fill", icon: "gfx/entity_icons/document/file-earmark-pdf-fill.svg", keywords: ["file", "earmark", "pdf", "fill", "document"] },
      { id: "file-earmark-pdf", name: "File Earmark Pdf", icon: "gfx/entity_icons/document/file-earmark-pdf.svg", keywords: ["file", "earmark", "pdf", "document"] },
      { id: "file-earmark-person-fill", name: "File Earmark Person Fill", icon: "gfx/entity_icons/document/file-earmark-person-fill.svg", keywords: ["file", "earmark", "person", "fill", "document"] },
      { id: "file-earmark-person", name: "File Earmark Person", icon: "gfx/entity_icons/document/file-earmark-person.svg", keywords: ["file", "earmark", "person", "document"] },
      { id: "file-earmark-play-fill", name: "File Earmark Play Fill", icon: "gfx/entity_icons/document/file-earmark-play-fill.svg", keywords: ["file", "earmark", "play", "fill", "document"] },
      { id: "file-earmark-play", name: "File Earmark Play", icon: "gfx/entity_icons/document/file-earmark-play.svg", keywords: ["file", "earmark", "play", "document"] },
      { id: "file-earmark-plus-fill", name: "File Earmark Plus Fill", icon: "gfx/entity_icons/document/file-earmark-plus-fill.svg", keywords: ["file", "earmark", "plus", "fill", "document"] },
      { id: "file-earmark-plus", name: "File Earmark Plus", icon: "gfx/entity_icons/document/file-earmark-plus.svg", keywords: ["file", "earmark", "plus", "document"] },
      { id: "file-earmark-post-fill", name: "File Earmark Post Fill", icon: "gfx/entity_icons/document/file-earmark-post-fill.svg", keywords: ["file", "earmark", "post", "fill", "document"] },
      { id: "file-earmark-post", name: "File Earmark Post", icon: "gfx/entity_icons/document/file-earmark-post.svg", keywords: ["file", "earmark", "post", "document"] },
      { id: "file-earmark-ppt-fill", name: "File Earmark Ppt Fill", icon: "gfx/entity_icons/document/file-earmark-ppt-fill.svg", keywords: ["file", "earmark", "ppt", "fill", "document"] },
      { id: "file-earmark-ppt", name: "File Earmark Ppt", icon: "gfx/entity_icons/document/file-earmark-ppt.svg", keywords: ["file", "earmark", "ppt", "document"] },
      { id: "file-earmark-richtext-fill", name: "File Earmark Richtext Fill", icon: "gfx/entity_icons/document/file-earmark-richtext-fill.svg", keywords: ["file", "earmark", "richtext", "fill", "document"] },
      { id: "file-earmark-richtext", name: "File Earmark Richtext", icon: "gfx/entity_icons/document/file-earmark-richtext.svg", keywords: ["file", "earmark", "richtext", "document"] },
      { id: "file-earmark-ruled-fill", name: "File Earmark Ruled Fill", icon: "gfx/entity_icons/document/file-earmark-ruled-fill.svg", keywords: ["file", "earmark", "ruled", "fill", "document"] },
      { id: "file-earmark-ruled", name: "File Earmark Ruled", icon: "gfx/entity_icons/document/file-earmark-ruled.svg", keywords: ["file", "earmark", "ruled", "document"] },
      { id: "file-earmark-slides-fill", name: "File Earmark Slides Fill", icon: "gfx/entity_icons/document/file-earmark-slides-fill.svg", keywords: ["file", "earmark", "slides", "fill", "document"] },
      { id: "file-earmark-slides", name: "File Earmark Slides", icon: "gfx/entity_icons/document/file-earmark-slides.svg", keywords: ["file", "earmark", "slides", "document"] },
      { id: "file-earmark-spreadsheet-fill", name: "File Earmark Spreadsheet Fill", icon: "gfx/entity_icons/document/file-earmark-spreadsheet-fill.svg", keywords: ["file", "earmark", "spreadsheet", "fill", "document"] },
      { id: "file-earmark-spreadsheet", name: "File Earmark Spreadsheet", icon: "gfx/entity_icons/document/file-earmark-spreadsheet.svg", keywords: ["file", "earmark", "spreadsheet", "document"] },
      { id: "file-earmark-text-fill", name: "File Earmark Text Fill", icon: "gfx/entity_icons/document/file-earmark-text-fill.svg", keywords: ["file", "earmark", "text", "fill", "document"] },
      { id: "file-earmark-text", name: "File Earmark Text", icon: "gfx/entity_icons/document/file-earmark-text.svg", keywords: ["file", "earmark", "text", "document"] },
      { id: "file-earmark-word-fill", name: "File Earmark Word Fill", icon: "gfx/entity_icons/document/file-earmark-word-fill.svg", keywords: ["file", "earmark", "word", "fill", "document"] },
      { id: "file-earmark-word", name: "File Earmark Word", icon: "gfx/entity_icons/document/file-earmark-word.svg", keywords: ["file", "earmark", "word", "document"] },
      { id: "file-earmark-x-fill", name: "File Earmark X Fill", icon: "gfx/entity_icons/document/file-earmark-x-fill.svg", keywords: ["file", "earmark", "fill", "document"] },
      { id: "file-earmark-x", name: "File Earmark X", icon: "gfx/entity_icons/document/file-earmark-x.svg", keywords: ["file", "earmark", "document"] },
      { id: "file-earmark-zip-fill", name: "File Earmark Zip Fill", icon: "gfx/entity_icons/document/file-earmark-zip-fill.svg", keywords: ["file", "earmark", "zip", "fill", "document"] },
      { id: "file-earmark-zip", name: "File Earmark Zip", icon: "gfx/entity_icons/document/file-earmark-zip.svg", keywords: ["file", "earmark", "zip", "document"] },
      { id: "file-earmark", name: "File Earmark", icon: "gfx/entity_icons/document/file-earmark.svg", keywords: ["file", "earmark", "document"] },
      { id: "file-easel-fill", name: "File Easel Fill", icon: "gfx/entity_icons/document/file-easel-fill.svg", keywords: ["file", "easel", "fill", "document"] },
      { id: "file-easel", name: "File Easel", icon: "gfx/entity_icons/document/file-easel.svg", keywords: ["file", "easel", "document"] },
      { id: "file-excel-fill", name: "File Excel Fill", icon: "gfx/entity_icons/document/file-excel-fill.svg", keywords: ["file", "excel", "fill", "document"] },
      { id: "file-excel", name: "File Excel", icon: "gfx/entity_icons/document/file-excel.svg", keywords: ["file", "excel", "document"] },
      { id: "file-export", name: "File Export", icon: "gfx/entity_icons/document/file-export.svg", keywords: ["file", "export", "document"] },
      { id: "file-fill", name: "File Fill", icon: "gfx/entity_icons/document/file-fill.svg", keywords: ["file", "fill", "document"] },
      { id: "file-font-fill", name: "File Font Fill", icon: "gfx/entity_icons/document/file-font-fill.svg", keywords: ["file", "font", "fill", "document"] },
      { id: "file-font", name: "File Font", icon: "gfx/entity_icons/document/file-font.svg", keywords: ["file", "font", "document"] },
      { id: "file-function", name: "File Function", icon: "gfx/entity_icons/document/file-function.svg", keywords: ["file", "function", "document"] },
      { id: "file-horizontal", name: "File Horizontal", icon: "gfx/entity_icons/document/file-horizontal.svg", keywords: ["file", "horizontal", "document"] },
      { id: "file-image-fill", name: "File Image Fill", icon: "gfx/entity_icons/document/file-image-fill.svg", keywords: ["file", "image", "fill", "document"] },
      { id: "file-image", name: "File Image", icon: "gfx/entity_icons/document/file-image.svg", keywords: ["file", "image", "document"] },
      { id: "file-import", name: "File Import", icon: "gfx/entity_icons/document/file-import.svg", keywords: ["file", "import", "document"] },
      { id: "file-infinity", name: "File Infinity", icon: "gfx/entity_icons/document/file-infinity.svg", keywords: ["file", "infinity", "document"] },
      { id: "file-info", name: "File Info", icon: "gfx/entity_icons/document/file-info.svg", keywords: ["file", "info", "document"] },
      { id: "file-isr", name: "File Isr", icon: "gfx/entity_icons/document/file-isr.svg", keywords: ["file", "isr", "document"] },
      { id: "file-lambda", name: "File Lambda", icon: "gfx/entity_icons/document/file-lambda.svg", keywords: ["file", "lambda", "document"] },
      { id: "file-like", name: "File Like", icon: "gfx/entity_icons/document/file-like.svg", keywords: ["file", "like", "document"] },
      { id: "file-lock-fill", name: "File Lock Fill", icon: "gfx/entity_icons/document/file-lock-fill.svg", keywords: ["file", "lock", "fill", "document"] },
      { id: "file-lock", name: "File Lock", icon: "gfx/entity_icons/document/file-lock.svg", keywords: ["file", "lock", "document"] },
      { id: "file-lock2-fill", name: "File Lock2 Fill", icon: "gfx/entity_icons/document/file-lock2-fill.svg", keywords: ["file", "lock2", "fill", "document"] },
      { id: "file-lock2", name: "File Lock2", icon: "gfx/entity_icons/document/file-lock2.svg", keywords: ["file", "lock2", "document"] },
      { id: "file-medical-fill", name: "File Medical Fill", icon: "gfx/entity_icons/document/file-medical-fill.svg", keywords: ["file", "medical", "fill", "document"] },
      { id: "file-medical", name: "File Medical", icon: "gfx/entity_icons/document/file-medical.svg", keywords: ["file", "medical", "document"] },
      { id: "file-minus-fill", name: "File Minus Fill", icon: "gfx/entity_icons/document/file-minus-fill.svg", keywords: ["file", "minus", "fill", "document"] },
      { id: "file-minus", name: "File Minus", icon: "gfx/entity_icons/document/file-minus.svg", keywords: ["file", "minus", "document"] },
      { id: "file-music-fill", name: "File Music Fill", icon: "gfx/entity_icons/document/file-music-fill.svg", keywords: ["file", "music", "fill", "document"] },
      { id: "file-music", name: "File Music", icon: "gfx/entity_icons/document/file-music.svg", keywords: ["file", "music", "document"] },
      { id: "file-neutral", name: "File Neutral", icon: "gfx/entity_icons/document/file-neutral.svg", keywords: ["file", "neutral", "document"] },
      { id: "file-off", name: "File Off", icon: "gfx/entity_icons/document/file-off.svg", keywords: ["file", "off", "document"] },
      { id: "file-orientation", name: "File Orientation", icon: "gfx/entity_icons/document/file-orientation.svg", keywords: ["file", "orientation", "document"] },
      { id: "file-pdf-fill", name: "File Pdf Fill", icon: "gfx/entity_icons/document/file-pdf-fill.svg", keywords: ["file", "pdf", "fill", "document"] },
      { id: "file-pdf", name: "File Pdf", icon: "gfx/entity_icons/document/file-pdf.svg", keywords: ["file", "pdf", "document"] },
      { id: "file-pencil", name: "File Pencil", icon: "gfx/entity_icons/document/file-pencil.svg", keywords: ["file", "pencil", "document"] },
      { id: "file-person-fill", name: "File Person Fill", icon: "gfx/entity_icons/document/file-person-fill.svg", keywords: ["file", "person", "fill", "document"] },
      { id: "file-person", name: "File Person", icon: "gfx/entity_icons/document/file-person.svg", keywords: ["file", "person", "document"] },
      { id: "file-play-fill", name: "File Play Fill", icon: "gfx/entity_icons/document/file-play-fill.svg", keywords: ["file", "play", "fill", "document"] },
      { id: "file-play", name: "File Play", icon: "gfx/entity_icons/document/file-play.svg", keywords: ["file", "play", "document"] },
      { id: "file-plus-fill", name: "File Plus Fill", icon: "gfx/entity_icons/document/file-plus-fill.svg", keywords: ["file", "plus", "fill", "document"] },
      { id: "file-plus", name: "File Plus", icon: "gfx/entity_icons/document/file-plus.svg", keywords: ["file", "plus", "document"] },
      { id: "file-post-fill", name: "File Post Fill", icon: "gfx/entity_icons/document/file-post-fill.svg", keywords: ["file", "post", "fill", "document"] },
      { id: "file-post", name: "File Post", icon: "gfx/entity_icons/document/file-post.svg", keywords: ["file", "post", "document"] },
      { id: "file-power", name: "File Power", icon: "gfx/entity_icons/document/file-power.svg", keywords: ["file", "power", "document"] },
      { id: "file-ppt-fill", name: "File Ppt Fill", icon: "gfx/entity_icons/document/file-ppt-fill.svg", keywords: ["file", "ppt", "fill", "document"] },
      { id: "file-ppt", name: "File Ppt", icon: "gfx/entity_icons/document/file-ppt.svg", keywords: ["file", "ppt", "document"] },
      { id: "file-report", name: "File Report", icon: "gfx/entity_icons/document/file-report.svg", keywords: ["file", "report", "document"] },
      { id: "file-richtext-fill", name: "File Richtext Fill", icon: "gfx/entity_icons/document/file-richtext-fill.svg", keywords: ["file", "richtext", "fill", "document"] },
      { id: "file-richtext", name: "File Richtext", icon: "gfx/entity_icons/document/file-richtext.svg", keywords: ["file", "richtext", "document"] },
      { id: "file-ruled-fill", name: "File Ruled Fill", icon: "gfx/entity_icons/document/file-ruled-fill.svg", keywords: ["file", "ruled", "fill", "document"] },
      { id: "file-ruled", name: "File Ruled", icon: "gfx/entity_icons/document/file-ruled.svg", keywords: ["file", "ruled", "document"] },
      { id: "file-sad", name: "File Sad", icon: "gfx/entity_icons/document/file-sad.svg", keywords: ["file", "sad", "document"] },
      { id: "file-scissors", name: "File Scissors", icon: "gfx/entity_icons/document/file-scissors.svg", keywords: ["file", "scissors", "document"] },
      { id: "file-search", name: "File Search", icon: "gfx/entity_icons/document/file-search.svg", keywords: ["file", "search", "document"] },
      { id: "file-settings", name: "File Settings", icon: "gfx/entity_icons/document/file-settings.svg", keywords: ["file", "settings", "document"] },
      { id: "file-shredder", name: "File Shredder", icon: "gfx/entity_icons/document/file-shredder.svg", keywords: ["file", "shredder", "document"] },
      { id: "file-slides-fill", name: "File Slides Fill", icon: "gfx/entity_icons/document/file-slides-fill.svg", keywords: ["file", "slides", "fill", "document"] },
      { id: "file-slides", name: "File Slides", icon: "gfx/entity_icons/document/file-slides.svg", keywords: ["file", "slides", "document"] },
      { id: "file-smile", name: "File Smile", icon: "gfx/entity_icons/document/file-smile.svg", keywords: ["file", "smile", "document"] },
      { id: "file-spark", name: "File Spark", icon: "gfx/entity_icons/document/file-spark.svg", keywords: ["file", "spark", "document"] },
      { id: "file-spreadsheet-fill", name: "File Spreadsheet Fill", icon: "gfx/entity_icons/document/file-spreadsheet-fill.svg", keywords: ["file", "spreadsheet", "fill", "document"] },
      { id: "file-spreadsheet", name: "File Spreadsheet", icon: "gfx/entity_icons/document/file-spreadsheet.svg", keywords: ["file", "spreadsheet", "document"] },
      { id: "file-stack", name: "File Stack", icon: "gfx/entity_icons/document/file-stack.svg", keywords: ["file", "stack", "document"] },
      { id: "file-star", name: "File Star", icon: "gfx/entity_icons/document/file-star.svg", keywords: ["file", "star", "document"] },
      { id: "file-symlink", name: "File Symlink", icon: "gfx/entity_icons/document/file-symlink.svg", keywords: ["file", "symlink", "document"] },
      { id: "file-text-ai", name: "File Text Ai", icon: "gfx/entity_icons/document/file-text-ai.svg", keywords: ["file", "text", "ai", "document"] },
      { id: "file-text-fill", name: "File Text Fill", icon: "gfx/entity_icons/document/file-text-fill.svg", keywords: ["file", "text", "fill", "document"] },
      { id: "file-text-spark", name: "File Text Spark", icon: "gfx/entity_icons/document/file-text-spark.svg", keywords: ["file", "text", "spark", "document"] },
      { id: "file-text", name: "File Text", icon: "gfx/entity_icons/document/file-text.svg", keywords: ["file", "text", "document"] },
      { id: "file-time", name: "File Time", icon: "gfx/entity_icons/document/file-time.svg", keywords: ["file", "time", "document"] },
      { id: "file-type-bmp", name: "File Type Bmp", icon: "gfx/entity_icons/document/file-type-bmp.svg", keywords: ["file", "type", "bmp", "document"] },
      { id: "file-type-css", name: "File Type Css", icon: "gfx/entity_icons/document/file-type-css.svg", keywords: ["file", "type", "css", "document"] },
      { id: "file-type-csv", name: "File Type Csv", icon: "gfx/entity_icons/document/file-type-csv.svg", keywords: ["file", "type", "csv", "document"] },
      { id: "file-type-doc", name: "File Type Doc", icon: "gfx/entity_icons/document/file-type-doc.svg", keywords: ["file", "type", "doc", "document"] },
      { id: "file-type-docx", name: "File Type Docx", icon: "gfx/entity_icons/document/file-type-docx.svg", keywords: ["file", "type", "docx", "document"] },
      { id: "file-type-html", name: "File Type Html", icon: "gfx/entity_icons/document/file-type-html.svg", keywords: ["file", "type", "html", "document"] },
      { id: "file-type-jpg", name: "File Type Jpg", icon: "gfx/entity_icons/document/file-type-jpg.svg", keywords: ["file", "type", "jpg", "document"] },
      { id: "file-type-js", name: "File Type Js", icon: "gfx/entity_icons/document/file-type-js.svg", keywords: ["file", "type", "js", "document"] },
      { id: "file-type-jsx", name: "File Type Jsx", icon: "gfx/entity_icons/document/file-type-jsx.svg", keywords: ["file", "type", "jsx", "document"] },
      { id: "file-type-pdf", name: "File Type Pdf", icon: "gfx/entity_icons/document/file-type-pdf.svg", keywords: ["file", "type", "pdf", "document"] },
      { id: "file-type-php", name: "File Type Php", icon: "gfx/entity_icons/document/file-type-php.svg", keywords: ["file", "type", "php", "document"] },
      { id: "file-type-png", name: "File Type Png", icon: "gfx/entity_icons/document/file-type-png.svg", keywords: ["file", "type", "png", "document"] },
      { id: "file-type-ppt", name: "File Type Ppt", icon: "gfx/entity_icons/document/file-type-ppt.svg", keywords: ["file", "type", "ppt", "document"] },
      { id: "file-type-rs", name: "File Type Rs", icon: "gfx/entity_icons/document/file-type-rs.svg", keywords: ["file", "type", "rs", "document"] },
      { id: "file-type-sql", name: "File Type Sql", icon: "gfx/entity_icons/document/file-type-sql.svg", keywords: ["file", "type", "sql", "document"] },
      { id: "file-type-svg", name: "File Type Svg", icon: "gfx/entity_icons/document/file-type-svg.svg", keywords: ["file", "type", "svg", "document"] },
      { id: "file-type-ts", name: "File Type Ts", icon: "gfx/entity_icons/document/file-type-ts.svg", keywords: ["file", "type", "ts", "document"] },
      { id: "file-type-tsx", name: "File Type Tsx", icon: "gfx/entity_icons/document/file-type-tsx.svg", keywords: ["file", "type", "tsx", "document"] },
      { id: "file-type-txt", name: "File Type Txt", icon: "gfx/entity_icons/document/file-type-txt.svg", keywords: ["file", "type", "txt", "document"] },
      { id: "file-type-vue", name: "File Type Vue", icon: "gfx/entity_icons/document/file-type-vue.svg", keywords: ["file", "type", "vue", "document"] },
      { id: "file-type-xls", name: "File Type Xls", icon: "gfx/entity_icons/document/file-type-xls.svg", keywords: ["file", "type", "xls", "document"] },
      { id: "file-type-xml", name: "File Type Xml", icon: "gfx/entity_icons/document/file-type-xml.svg", keywords: ["file", "type", "xml", "document"] },
      { id: "file-type-zip", name: "File Type Zip", icon: "gfx/entity_icons/document/file-type-zip.svg", keywords: ["file", "type", "zip", "document"] },
      { id: "file-typography", name: "File Typography", icon: "gfx/entity_icons/document/file-typography.svg", keywords: ["file", "typography", "document"] },
      { id: "file-unknown", name: "File Unknown", icon: "gfx/entity_icons/document/file-unknown.svg", keywords: ["file", "unknown", "document"] },
      { id: "file-upload", name: "File Upload", icon: "gfx/entity_icons/document/file-upload.svg", keywords: ["file", "upload", "document"] },
      { id: "file-vector", name: "File Vector", icon: "gfx/entity_icons/document/file-vector.svg", keywords: ["file", "vector", "document"] },
      { id: "file-word-fill", name: "File Word Fill", icon: "gfx/entity_icons/document/file-word-fill.svg", keywords: ["file", "word", "fill", "document"] },
      { id: "file-word", name: "File Word", icon: "gfx/entity_icons/document/file-word.svg", keywords: ["file", "word", "document"] },
      { id: "file-x-fill", name: "File X Fill", icon: "gfx/entity_icons/document/file-x-fill.svg", keywords: ["file", "fill", "document"] },
      { id: "file-x", name: "File X", icon: "gfx/entity_icons/document/file-x.svg", keywords: ["file", "document"] },
      { id: "file-zip-fill", name: "File Zip Fill", icon: "gfx/entity_icons/document/file-zip-fill.svg", keywords: ["file", "zip", "fill", "document"] },
      { id: "file-zip", name: "File Zip", icon: "gfx/entity_icons/document/file-zip.svg", keywords: ["file", "zip", "document"] },
      { id: "file", name: "File", icon: "gfx/entity_icons/document/file.svg", keywords: ["file", "document"] },
      { id: "files-alt", name: "Files Alt", icon: "gfx/entity_icons/document/files-alt.svg", keywords: ["files", "alt", "document"] },
      { id: "files-off", name: "Files Off", icon: "gfx/entity_icons/document/files-off.svg", keywords: ["files", "off", "document"] },
      { id: "files", name: "Files", icon: "gfx/entity_icons/document/files.svg", keywords: ["files", "document"] },
      { id: "filetype-pdf", name: "Filetype Pdf", icon: "gfx/entity_icons/document/filetype-pdf.svg", keywords: ["filetype", "pdf", "document"] },
      { id: "folder-bolt", name: "Folder Bolt", icon: "gfx/entity_icons/document/folder-bolt.svg", keywords: ["folder", "bolt", "document"] },
      { id: "folder-cancel", name: "Folder Cancel", icon: "gfx/entity_icons/document/folder-cancel.svg", keywords: ["folder", "cancel", "document"] },
      { id: "folder-check", name: "Folder Check", icon: "gfx/entity_icons/document/folder-check.svg", keywords: ["folder", "check", "document"] },
      { id: "folder-code", name: "Folder Code", icon: "gfx/entity_icons/document/folder-code.svg", keywords: ["folder", "code", "document"] },
      { id: "folder-cog", name: "Folder Cog", icon: "gfx/entity_icons/document/folder-cog.svg", keywords: ["folder", "cog", "document"] },
      { id: "folder-down", name: "Folder Down", icon: "gfx/entity_icons/document/folder-down.svg", keywords: ["folder", "down", "document"] },
      { id: "folder-exclamation", name: "Folder Exclamation", icon: "gfx/entity_icons/document/folder-exclamation.svg", keywords: ["folder", "exclamation", "document"] },
      { id: "folder-fill", name: "Folder Fill", icon: "gfx/entity_icons/document/folder-fill.svg", keywords: ["folder", "fill", "document"] },
      { id: "folder-heart", name: "Folder Heart", icon: "gfx/entity_icons/document/folder-heart.svg", keywords: ["folder", "heart", "document"] },
      { id: "folder-minus", name: "Folder Minus", icon: "gfx/entity_icons/document/folder-minus.svg", keywords: ["folder", "minus", "document"] },
      { id: "folder-off", name: "Folder Off", icon: "gfx/entity_icons/document/folder-off.svg", keywords: ["folder", "off", "document"] },
      { id: "folder-open", name: "Folder Open", icon: "gfx/entity_icons/document/folder-open.svg", keywords: ["folder", "open", "document"] },
      { id: "folder-pause", name: "Folder Pause", icon: "gfx/entity_icons/document/folder-pause.svg", keywords: ["folder", "pause", "document"] },
      { id: "folder-pin", name: "Folder Pin", icon: "gfx/entity_icons/document/folder-pin.svg", keywords: ["folder", "pin", "document"] },
      { id: "folder-plus", name: "Folder Plus", icon: "gfx/entity_icons/document/folder-plus.svg", keywords: ["folder", "plus", "document"] },
      { id: "folder-question", name: "Folder Question", icon: "gfx/entity_icons/document/folder-question.svg", keywords: ["folder", "question", "document"] },
      { id: "folder-root", name: "Folder Root", icon: "gfx/entity_icons/document/folder-root.svg", keywords: ["folder", "root", "document"] },
      { id: "folder-search", name: "Folder Search", icon: "gfx/entity_icons/document/folder-search.svg", keywords: ["folder", "search", "document"] },
      { id: "folder-share", name: "Folder Share", icon: "gfx/entity_icons/document/folder-share.svg", keywords: ["folder", "share", "document"] },
      { id: "folder-star", name: "Folder Star", icon: "gfx/entity_icons/document/folder-star.svg", keywords: ["folder", "star", "document"] },
      { id: "folder-symlink-fill", name: "Folder Symlink Fill", icon: "gfx/entity_icons/document/folder-symlink-fill.svg", keywords: ["folder", "symlink", "fill", "document"] },
      { id: "folder-symlink", name: "Folder Symlink", icon: "gfx/entity_icons/document/folder-symlink.svg", keywords: ["folder", "symlink", "document"] },
      { id: "folder-up", name: "Folder Up", icon: "gfx/entity_icons/document/folder-up.svg", keywords: ["folder", "up", "document"] },
      { id: "folder-x", name: "Folder X", icon: "gfx/entity_icons/document/folder-x.svg", keywords: ["folder", "document"] },
      { id: "folder", name: "Folder", icon: "gfx/entity_icons/document/folder.svg", keywords: ["folder", "document"] },
      { id: "folders-off", name: "Folders Off", icon: "gfx/entity_icons/document/folders-off.svg", keywords: ["folders", "off", "document"] },
      { id: "folders", name: "Folders", icon: "gfx/entity_icons/document/folders.svg", keywords: ["folders", "document"] },
      { id: "git-pull-request-draft", name: "Git Pull Request Draft", icon: "gfx/entity_icons/document/git-pull-request-draft.svg", keywords: ["git", "pull", "request", "draft", "document"] },
      { id: "journal-album", name: "Journal Album", icon: "gfx/entity_icons/document/journal-album.svg", keywords: ["journal", "album", "document"] },
      { id: "journal-arrow-down", name: "Journal Arrow Down", icon: "gfx/entity_icons/document/journal-arrow-down.svg", keywords: ["journal", "arrow", "down", "document"] },
      { id: "journal-arrow-up", name: "Journal Arrow Up", icon: "gfx/entity_icons/document/journal-arrow-up.svg", keywords: ["journal", "arrow", "up", "document"] },
      { id: "journal-bookmark-fill", name: "Journal Bookmark Fill", icon: "gfx/entity_icons/document/journal-bookmark-fill.svg", keywords: ["journal", "bookmark", "fill", "document"] },
      { id: "journal-bookmark", name: "Journal Bookmark", icon: "gfx/entity_icons/document/journal-bookmark.svg", keywords: ["journal", "bookmark", "document"] },
      { id: "journal-check", name: "Journal Check", icon: "gfx/entity_icons/document/journal-check.svg", keywords: ["journal", "check", "document"] },
      { id: "journal-code", name: "Journal Code", icon: "gfx/entity_icons/document/journal-code.svg", keywords: ["journal", "code", "document"] },
      { id: "journal-medical", name: "Journal Medical", icon: "gfx/entity_icons/document/journal-medical.svg", keywords: ["journal", "medical", "document"] },
      { id: "journal-minus", name: "Journal Minus", icon: "gfx/entity_icons/document/journal-minus.svg", keywords: ["journal", "minus", "document"] },
      { id: "journal-plus", name: "Journal Plus", icon: "gfx/entity_icons/document/journal-plus.svg", keywords: ["journal", "plus", "document"] },
      { id: "journal-richtext", name: "Journal Richtext", icon: "gfx/entity_icons/document/journal-richtext.svg", keywords: ["journal", "richtext", "document"] },
      { id: "journal-text", name: "Journal Text", icon: "gfx/entity_icons/document/journal-text.svg", keywords: ["journal", "text", "document"] },
      { id: "journal-x", name: "Journal X", icon: "gfx/entity_icons/document/journal-x.svg", keywords: ["journal", "document"] },
      { id: "journal", name: "Journal", icon: "gfx/entity_icons/document/journal.svg", keywords: ["journal", "document"] },
      { id: "label-important", name: "Label Important", icon: "gfx/entity_icons/document/label-important.svg", keywords: ["label", "important", "document"] },
      { id: "label-off", name: "Label Off", icon: "gfx/entity_icons/document/label-off.svg", keywords: ["label", "off", "document"] },
      { id: "label", name: "Label", icon: "gfx/entity_icons/document/label.svg", keywords: ["label", "document"] },
      { id: "markdown-fill", name: "Markdown Fill", icon: "gfx/entity_icons/document/markdown-fill.svg", keywords: ["markdown", "fill", "document"] },
      { id: "markdown-off", name: "Markdown Off", icon: "gfx/entity_icons/document/markdown-off.svg", keywords: ["markdown", "off", "document"] },
      { id: "markdown", name: "Markdown", icon: "gfx/entity_icons/document/markdown.svg", keywords: ["markdown", "document"] },
      { id: "notebook-off", name: "Notebook Off", icon: "gfx/entity_icons/document/notebook-off.svg", keywords: ["notebook", "off", "document"] },
      { id: "notebook", name: "Notebook", icon: "gfx/entity_icons/document/notebook.svg", keywords: ["notebook", "document"] },
      { id: "paperclip", name: "Paperclip", icon: "gfx/entity_icons/document/paperclip.svg", keywords: ["paperclip", "document"] },
      { id: "pdf", name: "Pdf", icon: "gfx/entity_icons/document/pdf.svg", keywords: ["pdf", "document"] },
      { id: "pencil-bolt", name: "Pencil Bolt", icon: "gfx/entity_icons/document/pencil-bolt.svg", keywords: ["pencil", "bolt", "document"] },
      { id: "pencil-cancel", name: "Pencil Cancel", icon: "gfx/entity_icons/document/pencil-cancel.svg", keywords: ["pencil", "cancel", "document"] },
      { id: "pencil-check", name: "Pencil Check", icon: "gfx/entity_icons/document/pencil-check.svg", keywords: ["pencil", "check", "document"] },
      { id: "pencil-code", name: "Pencil Code", icon: "gfx/entity_icons/document/pencil-code.svg", keywords: ["pencil", "code", "document"] },
      { id: "pencil-cog", name: "Pencil Cog", icon: "gfx/entity_icons/document/pencil-cog.svg", keywords: ["pencil", "cog", "document"] },
      { id: "pencil-down", name: "Pencil Down", icon: "gfx/entity_icons/document/pencil-down.svg", keywords: ["pencil", "down", "document"] },
      { id: "pencil-exclamation", name: "Pencil Exclamation", icon: "gfx/entity_icons/document/pencil-exclamation.svg", keywords: ["pencil", "exclamation", "document"] },
      { id: "pencil-fill", name: "Pencil Fill", icon: "gfx/entity_icons/document/pencil-fill.svg", keywords: ["pencil", "fill", "document"] },
      { id: "pencil-heart", name: "Pencil Heart", icon: "gfx/entity_icons/document/pencil-heart.svg", keywords: ["pencil", "heart", "document"] },
      { id: "pencil-minus", name: "Pencil Minus", icon: "gfx/entity_icons/document/pencil-minus.svg", keywords: ["pencil", "minus", "document"] },
      { id: "pencil-off", name: "Pencil Off", icon: "gfx/entity_icons/document/pencil-off.svg", keywords: ["pencil", "off", "document"] },
      { id: "pencil-pause", name: "Pencil Pause", icon: "gfx/entity_icons/document/pencil-pause.svg", keywords: ["pencil", "pause", "document"] },
      { id: "pencil-pin", name: "Pencil Pin", icon: "gfx/entity_icons/document/pencil-pin.svg", keywords: ["pencil", "pin", "document"] },
      { id: "pencil-plus", name: "Pencil Plus", icon: "gfx/entity_icons/document/pencil-plus.svg", keywords: ["pencil", "plus", "document"] },
      { id: "pencil-question", name: "Pencil Question", icon: "gfx/entity_icons/document/pencil-question.svg", keywords: ["pencil", "question", "document"] },
      { id: "pencil-search", name: "Pencil Search", icon: "gfx/entity_icons/document/pencil-search.svg", keywords: ["pencil", "search", "document"] },
      { id: "pencil-share", name: "Pencil Share", icon: "gfx/entity_icons/document/pencil-share.svg", keywords: ["pencil", "share", "document"] },
      { id: "pencil-square", name: "Pencil Square", icon: "gfx/entity_icons/document/pencil-square.svg", keywords: ["pencil", "square", "document"] },
      { id: "pencil-star", name: "Pencil Star", icon: "gfx/entity_icons/document/pencil-star.svg", keywords: ["pencil", "star", "document"] },
      { id: "pencil-up", name: "Pencil Up", icon: "gfx/entity_icons/document/pencil-up.svg", keywords: ["pencil", "up", "document"] },
      { id: "pencil-x", name: "Pencil X", icon: "gfx/entity_icons/document/pencil-x.svg", keywords: ["pencil", "document"] },
      { id: "pencil", name: "Pencil", icon: "gfx/entity_icons/document/pencil.svg", keywords: ["pencil", "document"] },
      { id: "printer-fill", name: "Printer Fill", icon: "gfx/entity_icons/document/printer-fill.svg", keywords: ["printer", "fill", "document"] },
      { id: "printer-off", name: "Printer Off", icon: "gfx/entity_icons/document/printer-off.svg", keywords: ["printer", "off", "document"] },
      { id: "printer", name: "Printer", icon: "gfx/entity_icons/document/printer.svg", keywords: ["printer", "document"] },
      { id: "report-analytics", name: "Report Analytics", icon: "gfx/entity_icons/document/report-analytics.svg", keywords: ["report", "analytics", "document"] },
      { id: "report-medical", name: "Report Medical", icon: "gfx/entity_icons/document/report-medical.svg", keywords: ["report", "medical", "document"] },
      { id: "report-off", name: "Report Off", icon: "gfx/entity_icons/document/report-off.svg", keywords: ["report", "off", "document"] },
      { id: "report-search", name: "Report Search", icon: "gfx/entity_icons/document/report-search.svg", keywords: ["report", "search", "document"] },
      { id: "report", name: "Report", icon: "gfx/entity_icons/document/report.svg", keywords: ["report", "document"] },
      { id: "rubber-stamp-off", name: "Rubber Stamp Off", icon: "gfx/entity_icons/document/rubber-stamp-off.svg", keywords: ["rubber", "stamp", "off", "document"] },
      { id: "rubber-stamp", name: "Rubber Stamp", icon: "gfx/entity_icons/document/rubber-stamp.svg", keywords: ["rubber", "stamp", "document"] },
      { id: "signature-off", name: "Signature Off", icon: "gfx/entity_icons/document/signature-off.svg", keywords: ["signature", "off", "document"] },
      { id: "signature", name: "Signature", icon: "gfx/entity_icons/document/signature.svg", keywords: ["signature", "document"] },
      { id: "template-off", name: "Template Off", icon: "gfx/entity_icons/document/template-off.svg", keywords: ["template", "off", "document"] },
      { id: "template", name: "Template", icon: "gfx/entity_icons/document/template.svg", keywords: ["template", "document"] },
      { id: "writing-off", name: "Writing Off", icon: "gfx/entity_icons/document/writing-off.svg", keywords: ["writing", "off", "document"] },
      { id: "writing-sign-off", name: "Writing Sign Off", icon: "gfx/entity_icons/document/writing-sign-off.svg", keywords: ["writing", "sign", "off", "document"] },
      { id: "writing-sign", name: "Writing Sign", icon: "gfx/entity_icons/document/writing-sign.svg", keywords: ["writing", "sign", "document"] },
      { id: "writing", name: "Writing", icon: "gfx/entity_icons/document/writing.svg", keywords: ["writing", "document"] }
    ]
  }
};
window.ICON_CATEGORIES = ICON_CATEGORIES;

// Suggest icon based on entity name
function suggestIcon(name, category = null) {
  const lowerName = name.toLowerCase();
  const categoriesToSearch = category ? [ICON_CATEGORIES[category]] : Object.values(ICON_CATEGORIES);
  
  for (const cat of categoriesToSearch) {
    for (const icon of cat.icons) {
      if (icon.keywords.some(kw => lowerName.includes(kw))) {
        return { category: Object.keys(ICON_CATEGORIES).find(k => ICON_CATEGORIES[k] === cat), ...icon };
      }
    }
  }
  
  return null;
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// CONNECTION MANAGEMENT
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

function normalizeConnectionLabel(label) {
  const raw = String(label || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (/(company\s+secretary|secretary)/i.test(raw)) return "Company Secretary";
  if (/(director|managing director)/i.test(raw)) return "Director";
  if (/(llp member|designated member)/i.test(raw)) return "Designated Member";
  if (/(owner|beneficial owner)/i.test(raw)) return "Owner";
  if (/(ownership|voting|shares|right to appoint|significant influence|control)/i.test(lower)) return "PSC";
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function resolveConnectionDisplayLabel(fromLatLng, toLatLng, label, metadata = {}) {
  const relationLabel = String(label || "").trim();
  const fromLabel = String(metadata?.fromLabel || "").trim();
  const toLabel = String(metadata?.toLabel || "").trim();

  if (window._map && Array.isArray(fromLatLng) && Array.isArray(toLatLng)) {
    try {
      const p1 = window._map.latLngToContainerPoint(fromLatLng);
      const p2 = window._map.latLngToContainerPoint(toLatLng);
      const px = p1 && p2 && typeof p1.distanceTo === "function" ? p1.distanceTo(p2) : NaN;
      if (Number.isFinite(px) && px <= 110) {
        return toLabel || relationLabel || fromLabel || "Linked";
      }
    } catch (_) {
      // Fall back to geographic distance only.
    }

    const meters = window._map.distance(fromLatLng, toLatLng);
    if (Number.isFinite(meters) && meters <= 120) {
      return toLabel || relationLabel || fromLabel || "Linked";
    }
  }

  return relationLabel || toLabel || fromLabel || "Linked";
}
function mapConnectionTypeToStoreRelationship(type = "", label = "") {
  const normalizedType = String(type || "").toLowerCase();
  const normalizedLabel = String(label || "").toLowerCase();
  if (normalizedType === "officer") return "directs";
  if (normalizedType === "psc") return "controls";
  if (normalizedType === "manual") {
    if (normalizedLabel.includes("associate")) return "associated_with";
    if (normalizedLabel.includes("owner")) return "controls";
  }
  return "linked_to";
}

function addConnection(fromLatLng, toLatLng, label, type = 'officer', metadata = {}) {
  label = normalizeConnectionLabel(label);
  const displayLabel = resolveConnectionDisplayLabel(fromLatLng, toLatLng, label, metadata);
  const connectionId = `conn_${Date.now()}_${Math.random()}`;
  const from = normalizeLatLng(fromLatLng);
  const to = normalizeLatLng(toLatLng);
  if (!Number.isFinite(from[0]) || !Number.isFinite(from[1]) || !Number.isFinite(to[0]) || !Number.isFinite(to[1])) {
    return null;
  }
  
  const color = type === 'officer' ? '#a78bfa' : 
                type === 'psc' ? '#fbbf24' : 
                type === 'manual' ? '#22c55e' : '#64748b';
  
  const polyline = L.polyline([from, to], {
    color: color,
    weight: 3,
    opacity: 0.7,
    dashArray: type === 'manual' ? '8, 4' : '5, 5'
  }).addTo(connectionsLayer);
  
  // Store reference to connected entities for highlighting
  polyline._connectionData = {
    fromLatLng: from,
    toLatLng: to,
    connectionId: connectionId,
    metadata: metadata
  };
  
  // Make connection clickable
  polyline.on('click', function(e) {
    L.DomEvent.stopPropagation(e);
    showConnectionPopup(e.latlng, connectionId, label, metadata);
  });
  
  // Add label at midpoint
  if (displayLabel) {
    const midLat = (from[0] + to[0]) / 2;
    const midLng = (from[1] + to[1]) / 2;
    
    const labelIcon = L.divIcon({
      className: 'connection-label',
      html: `<div class="connection-label-text">${escapeHtml(displayLabel)}</div>`,
      iconSize: [150, 30],
      iconAnchor: [75, 15]
    });
    
    const labelMarker = L.marker([midLat, midLng], { icon: labelIcon }).addTo(connectionsLayer);
    if (metadata?.hoverDetail) {
      labelMarker.bindTooltip(String(metadata.hoverDetail), {
        sticky: true,
        direction: "top",
        offset: [0, -10],
        opacity: 0.95
      });
    }
    
    window._mapConnections.push({
      id: connectionId,
      type,
      label,
      displayLabel,
      fromLatLng: from,
      toLatLng: to,
      line: polyline,
      labelMarker: labelMarker,
      metadata: { ...(metadata || {}) }
    });
  } else {
    window._mapConnections.push({
      id: connectionId,
      type,
      fromLatLng: from,
      toLatLng: to,
      line: polyline,
      metadata: { ...(metadata || {}) }
    });
  }

  const conn = window._mapConnections[window._mapConnections.length - 1];
  if (window.EntityStore && conn?.metadata?.fromId && conn?.metadata?.toId) {
    const relId = window.EntityStore.addRelationship({
      type: mapConnectionTypeToStoreRelationship(type, label),
      fromId: conn.metadata.fromId,
      toId: conn.metadata.toId,
      label: label || "",
      attributes: { __legacyLine: true, sourceType: type || "manual" },
      source: conn.metadata?.source ? { method: String(conn.metadata.source) } : null
    });
    if (relId) {
      conn.metadata.storeRelId = relId;
    }
  }
  
  updateDashboardCounts();

  // Dashboard activity logging
  if (window.CRDashboard) window.CRDashboard.logActivity("Connection added", label || type, "connection");

  return connectionId;
}

// Highlight connections related to a specific lat/lng
let highlightedCircles = [];
function highlightConnections(latLng, radius = 50) {
  // Clear previous highlights
  clearConnectionHighlights();
  
  // Find all connections that involve this location (within radius meters)
  const relatedConnections = window._mapConnections.filter(conn => {
    const distFrom = map.distance(latLng, conn.fromLatLng);
    const distTo = map.distance(latLng, conn.toLatLng);
    return distFrom < radius || distTo < radius;
  });
  
  if (relatedConnections.length === 0) {
    setStatus('No connections found for this entity');
    return;
  }
  
  // Highlight the connections
  relatedConnections.forEach(conn => {
    // Make the line more prominent
    conn.line.setStyle({
      weight: 6,
      opacity: 1,
      className: 'highlighted-connection'
    });
    
    // Draw circles at the other end of each connection
    const otherEnd = map.distance(latLng, conn.fromLatLng) < radius ? conn.toLatLng : conn.fromLatLng;
    
    // Pulsing circle
    const pulseCircle = L.circle(otherEnd, {
      radius: 150,
      color: '#ef4444',
      fillColor: '#ef4444',
      fillOpacity: 0.3,
      weight: 3,
      className: 'pulse-circle'
    }).addTo(map);
    
    highlightedCircles.push(pulseCircle);
    
    // Connecting line highlight
    const highlightLine = L.polyline([latLng, otherEnd], {
      color: '#3b82f6',
      weight: 5,
      opacity: 0.8,
      dashArray: ''
    }).addTo(map);
    
    highlightedCircles.push(highlightLine);
  });
  
  setStatus(`Showing ${relatedConnections.length} connection${relatedConnections.length === 1 ? '' : 's'}`);
  
  // Auto-clear after 5 seconds
  setTimeout(() => {
    clearConnectionHighlights();
  }, 5000);
}

function clearConnectionHighlights() {
  // Remove highlight circles and lines
  highlightedCircles.forEach(circle => {
    map.removeLayer(circle);
  });
  highlightedCircles = [];
  
  // Reset connection line styles
  window._mapConnections.forEach(conn => {
    const color = conn.type === 'officer' ? '#a78bfa' : 
                  conn.type === 'psc' ? '#fbbf24' : 
                  conn.type === 'manual' ? '#22c55e' : '#64748b';
    
    conn.line.setStyle({
      color: color,
      weight: 3,
      opacity: 0.7,
      dashArray: conn.type === 'manual' ? '8, 4' : '5, 5'
    });
  });
}

function clearConnections() {
  window._mapConnections.forEach(conn => {
    connectionsLayer.removeLayer(conn.line);
    if (conn.labelMarker) connectionsLayer.removeLayer(conn.labelMarker);
  });
  window._mapConnections = [];
  updateDashboardCounts();
}

function refreshLegacyConnectionLabels() {
  if (!window._map || !Array.isArray(window._mapConnections)) return;
  const currentZoom = typeof window._map.getZoom === "function" ? Number(window._map.getZoom()) : 0;
  const showLabels = currentZoom >= 12;
  window._mapConnections.forEach((conn) => {
    if (!conn?.labelMarker || !conn?.line) return;
    const coords = conn.line.getLatLngs?.() || [];
    if (!coords[0] || !coords[1]) return;
    const fromLatLng = [coords[0].lat, coords[0].lng];
    const toLatLng = [coords[1].lat, coords[1].lng];
    const nextDisplay = resolveConnectionDisplayLabel(fromLatLng, toLatLng, conn.label || "", conn.metadata || {});
    conn.displayLabel = nextDisplay;
    const midLat = (fromLatLng[0] + toLatLng[0]) / 2;
    const midLng = (fromLatLng[1] + toLatLng[1]) / 2;
    conn.labelMarker.setLatLng([midLat, midLng]);
    conn.labelMarker.setOpacity(showLabels ? 1 : 0);
    conn.labelMarker.setIcon(L.divIcon({
      className: "connection-label",
      html: `<div class="connection-label-text">${escapeHtml(nextDisplay)}</div>`,
      iconSize: [150, 30],
      iconAnchor: [75, 15]
    }));
  });
}

map.on("zoomend moveend", refreshLegacyConnectionLabels);

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// ENTITY PLACEMENT
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

function startPlacementMode(category) {
  window._editingEntityId = null;
  window._placementMode = category;
  const catData = ICON_CATEGORIES[category];
  setStatus(`Click on map to place ${catData.name}...`);
  map.getContainer().style.cursor = 'crosshair';
}

function cancelPlacementMode() {
  window._placementMode = null;
  setStatus('Placement cancelled');
  map.getContainer().style.cursor = '';
}

function formatI2EntitySummary(i2EntityData) {
  if (!i2EntityData || !i2EntityData.entityName) return "";
  const values = i2EntityData.values ? Object.values(i2EntityData.values) : [];
  const preferredOrder = ["Full Name", "Name", "First Name", "Surname", "Date of Birth", "DOB", "Registration Mark", "VRM", "Organisation Name"];
  const selected = [];
  for (const pref of preferredOrder) {
    const found = values.find((v) => String(v.propertyName || "").toLowerCase() === pref.toLowerCase());
    if (found && !selected.includes(found)) selected.push(found);
    if (selected.length >= 4) break;
  }
  for (const v of values) {
    if (selected.length >= 4) break;
    if (!selected.includes(v)) selected.push(v);
  }
  const preview = selected.map((v) => `${escapeHtml(v.propertyName)}: ${escapeHtml(v.value)}`).join("<br>");
  return (
    `<br><span class="popup-label">i2 Type</span> <span class="popup-tag">${escapeHtml(i2EntityData.entityName)} (${escapeHtml(i2EntityData.entityId)})</span>` +
    (preview ? `<br>${preview}` : "")
  );
}

function isVehicleLikeI2Data(i2EntityData = null, iconData = null) {
  const iconCategory = String(iconData?.categoryName || iconData?.name || "").toLowerCase();
  if (iconCategory.includes("vehicle")) return true;
  const values = Array.isArray(i2EntityData?.values) ? i2EntityData.values : [];
  const propNames = values.map((v) => String(v?.propertyName || "").toLowerCase());
  return propNames.some((p) =>
    p === "registration mark" ||
    p === "vrm" ||
    p === "vehicle make" ||
    p === "vehicle model" ||
    p === "vehicle colour" ||
    p === "vehicle color"
  );
}

function normalizeVehicleI2EntityData(i2EntityData = null, iconData = null) {
  if (!i2EntityData || typeof i2EntityData !== "object") return i2EntityData;
  if (!isVehicleLikeI2Data(i2EntityData, iconData)) return i2EntityData;
  return {
    ...i2EntityData,
    entityId: "ET3",
    entityName: "Vehicle"
  };
}

function getI2ValueFromEntityValues(i2EntityData, names = []) {
  if (!i2EntityData || !Array.isArray(i2EntityData.values) || !Array.isArray(names)) return "";
  const lowered = names.map((n) => String(n || "").toLowerCase());
  const found = i2EntityData.values.find((v) => lowered.includes(String(v.propertyName || "").toLowerCase()));
  return found && found.value != null ? String(found.value) : "";
}

function formatPartialDobValue(dob) {
  if (!dob) return "";
  if (typeof dob === "string") {
    const raw = dob.trim();
    if (!raw) return "";
    const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymd) return `${ymd[3]}/${ymd[2]}/${ymd[1]}`;
    const my = raw.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (my) return `XX/${String(my[1]).padStart(2, "0")}/${my[2]}`;
    if (/^\d{4}$/.test(raw)) return `XX/XX/${raw}`;
    return raw;
  }
  if (typeof dob === "object") {
    const year = dob.year ? String(dob.year) : "";
    const month = dob.month ? String(dob.month).padStart(2, "0") : "";
    const day = dob.day ? String(dob.day).padStart(2, "0") : "XX";
    if (!year && !month) return "";
    if (year && month) return `${day}/${month}/${year}`;
    if (year) return `XX/XX/${year}`;
  }
  return "";
}

const COUNTRY_ALIAS_TO_ISO2 = {
  "united kingdom": "GB", "uk": "GB", "great britain": "GB", "britain": "GB", "british": "GB", "england": "GB", "scotland": "GB", "wales": "GB", "northern ireland": "GB",
  "united states": "US", "united states of america": "US", "usa": "US", "american": "US",
  "ireland": "IE", "irish": "IE",
  "france": "FR", "french": "FR", "germany": "DE", "german": "DE", "spain": "ES", "spanish": "ES", "italy": "IT", "italian": "IT",
  "netherlands": "NL", "dutch": "NL", "belgium": "BE", "belgian": "BE", "switzerland": "CH", "swiss": "CH", "austria": "AT", "austrian": "AT",
  "portugal": "PT", "portuguese": "PT", "poland": "PL", "polish": "PL", "romania": "RO", "romanian": "RO", "ukraine": "UA", "ukrainian": "UA",
  "russia": "RU", "russian": "RU", "turkey": "TR", "turkish": "TR", "greece": "GR", "greek": "GR",
  "india": "IN", "indian": "IN", "pakistan": "PK", "pakistani": "PK", "bangladesh": "BD", "bangladeshi": "BD", "china": "CN", "chinese": "CN", "japan": "JP", "japanese": "JP",
  "south korea": "KR", "korean": "KR", "singapore": "SG", "singaporean": "SG", "hong kong": "HK",
  "uae": "AE", "united arab emirates": "AE", "saudi arabia": "SA", "qatar": "QA", "kuwait": "KW", "oman": "OM",
  "nigeria": "NG", "nigerian": "NG", "ghana": "GH", "ghanaian": "GH", "kenya": "KE", "kenyan": "KE", "south africa": "ZA", "south african": "ZA",
  "canada": "CA", "canadian": "CA", "australia": "AU", "australian": "AU", "new zealand": "NZ", "new zealander": "NZ",
  "brazil": "BR", "brazilian": "BR", "mexico": "MX", "mexican": "MX", "argentina": "AR", "argentine": "AR"
};

function countryToIso2(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const direct = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(direct)) return direct;
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  return COUNTRY_ALIAS_TO_ISO2[key] || "";
}

function countryFlagEmoji(value) {
  const code = countryToIso2(value);
  if (!code) return "";
  const cps = [...code].map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...cps);
}

function formatCountryWithFlag(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const flag = countryFlagEmoji(text);
  return flag ? `${flag} ${text}` : text;
}
window.formatCountryWithFlag = formatCountryWithFlag;

function buildEntityHoverTooltipHtml(entity) {
  if (!entity) return "";
  const normalizedI2 = normalizeVehicleI2EntityData(entity.i2EntityData, entity.iconData);
  const values = normalizedI2?.values || [];
  const typeTag = normalizedI2?.entityName || entity.iconData?.categoryName || entity.iconData?.name || "Entity";

  let row1 = escapeHtml(entity.label || "Entity");
  let row2 = escapeHtml(typeTag);
  let row3 = "";

  if (entity.sourceType === "company") {
    const companyNo =
      getI2ValueFromEntityValues(entity.i2EntityData, ["Company/Registration Number", "Company Number", "Registration Number"]) ||
      String(entity.companyNumber || "");
    row2 = companyNo ? `Company #${escapeHtml(companyNo)}` : "Organisation";
  } else if (entity.sourceType === "officer" || String(typeTag).toLowerCase() === "person") {
    const dob =
      getI2ValueFromEntityValues(entity.i2EntityData, ["Date of Birth", "DOB"]) ||
      formatPartialDobValue(entity.dob || "");
    const nationality = getI2ValueFromEntityValues(entity.i2EntityData, ["Nationality"]);
    if (dob) row2 = `DOB ${escapeHtml(dob)}`;
    if (nationality) row3 = `Nationality ${escapeHtml(nationality)}`;
  }

  return `<div class="entity-hover-card"><strong>${row1}</strong><br>${row2}${row3 ? `<br>${row3}` : ""}</div>`;
}

function bindEntityHoverTooltip(marker, entity) {
  if (!marker || !entity) return;
  marker.bindTooltip(buildEntityHoverTooltipHtml(entity), {
    direction: "bottom",
    offset: [0, 16],
    sticky: true,
    opacity: 0.95,
    className: "entity-hover-tooltip"
  });
}

function buildEntityPopup(entityId, entity) {
  const popupStreetViewHtml =
    entity?.latLng && window.StreetView && typeof window.StreetView.getPopupThumbnailHtml === "function"
      ? window.StreetView.getPopupThumbnailHtml(entity.latLng[0], entity.latLng[1], { addressString: entity.address || entity.label || "" })
      : "";
  if (entity?.i2EntityData) {
    entity.i2EntityData = normalizeVehicleI2EntityData(entity.i2EntityData, entity.iconData);
  }
  if (entity?.sourceType === "officer") {
    const dob =
      getI2ValueFromEntityValues(entity.i2EntityData, ["Date of Birth", "DOB"]) ||
      formatPartialDobValue(entity.dob || "");
    const nationality = getI2ValueFromEntityValues(entity.i2EntityData, ["Nationality"]) || String(entity.nationality || "");
    const countryOfResidence =
      getI2ValueFromEntityValues(entity.i2EntityData, ["Country of Residence"]) ||
      String(entity.countryOfResidence || "");
    const nationalityDisplay = formatCountryWithFlag(nationality);
    const countryOfResidenceDisplay = formatCountryWithFlag(countryOfResidence);
    const role =
      getI2ValueFromEntityValues(entity.i2EntityData, ["Role", "Officer Role"]) ||
      String(entity.officerRole || "");
    const detailRows = [];
    if (entity.address) detailRows.push(`<span class="popup-label">Address</span> ${escapeHtml(entity.address)}`);
    if (entity.notes) detailRows.push(`<span class="popup-label">Notes</span> ${escapeHtml(entity.notes).replace(/\n/g, '<br>')}`);
    if (role) detailRows.push(`<span class="popup-label">Role</span> ${escapeHtml(role)}`);
    detailRows.push(`<span class="popup-label">Lat/Lng</span> ${entity.latLng[0].toFixed(5)}, ${entity.latLng[1].toFixed(5)}`);
    return `
      <strong>${escapeHtml(entity.label)}</strong>
      <span class="popup-label">Type</span> <span class="popup-tag" style="background:${entity.iconData.categoryColor || entity.iconData.color};">${escapeHtml(entity.iconData.categoryName || entity.iconData.name)}</span><br>
      ${dob ? `<span class="popup-label">DOB</span> ${escapeHtml(dob)}<br>` : ""}
      ${nationalityDisplay ? `<span class="popup-label">Nationality</span> <span class="popup-flag-chip">${escapeHtml(nationalityDisplay)}</span><br>` : ""}
      ${countryOfResidenceDisplay ? `<span class="popup-label">Country of Residence</span> <span class="popup-flag-chip">${escapeHtml(countryOfResidenceDisplay)}</span><br>` : ""}
      <details class="popup-more-details">
        <summary>See more</summary>
        ${detailRows.join("<br>")}
      </details>
      ${popupStreetViewHtml}
      ${formatI2EntitySummary(entity.i2EntityData)}
      <div class="popup-btn-row">
        <button class="popup-psc-btn" onclick="editEntity('${entityId}')">Edit</button>
        <button class="popup-psc-btn" onclick="drawConnectionFrom('${entityId}')">Connect</button>
        ${entity.officerId ? `<button class="popup-psc-btn" onclick="expandOfficerCompanies('${entityId}')">Expand Companies</button>` : ""}
        <button class="popup-psc-btn" onclick="removeEntity('${entityId}')">Remove</button>
      </div>
    `;
  }
  const vehicleMediaHtml = isVehicleEntityForPopup(entity) ? buildVehiclePopupMediaHtml(entity) : "";
  return `
    <strong>${escapeHtml(entity.label)}</strong>
    ${vehicleMediaHtml}
    <span class="popup-label">Type</span> <span class="popup-tag" style="background:${entity.iconData.categoryColor || entity.iconData.color};">${escapeHtml(entity.iconData.categoryName || entity.iconData.name)}</span><br>
    ${entity.address ? `<span class="popup-label">Address</span> ${escapeHtml(entity.address)}<br>` : ''}
    ${entity.notes ? `<span class="popup-label">Notes</span> ${escapeHtml(entity.notes).replace(/\n/g, '<br>')}<br>` : ''}
    <span class="popup-label">Lat/Lng</span> ${entity.latLng[0].toFixed(5)}, ${entity.latLng[1].toFixed(5)}
    ${popupStreetViewHtml}
    ${formatI2EntitySummary(entity.i2EntityData)}
    <div class="popup-btn-row">
      <button class="popup-psc-btn" onclick="editEntity('${entityId}')">Edit</button>
      <button class="popup-psc-btn" onclick="drawConnectionFrom('${entityId}')">Connect</button>
      <button class="popup-psc-btn" onclick="removeEntity('${entityId}')">Remove</button>
    </div>
  `;
}

function buildCompanyI2EntityData(companyData = {}) {
  const orgEntity = getI2EntityByKey("ET4") || getI2EntityByKey("Organisation");
  const values = [];
  if (companyData.name) values.push({ propertyName: "Organisation Name", value: String(companyData.name) });
  if (companyData.number) values.push({ propertyName: "Company/Registration Number", value: String(companyData.number) });
  if (companyData.address) values.push({ propertyName: "Address String", value: String(companyData.address) });
  if (companyData.postcode) values.push({ propertyName: "Post Code", value: String(companyData.postcode) });
  if (companyData.status) values.push({ propertyName: "Status", value: String(companyData.status) });

  return {
    entityId: orgEntity?.entity_id || "ET4",
    entityName: orgEntity?.entity_name || "Organisation",
    values
  };
}

function getCompanyEntityIconData() {
  const buildings = ICON_CATEGORIES.buildings || {};
  const officeIcon = (buildings.icons || []).find((ic) => ic.id === "office");
  return {
    id: "organisation",
    name: "Organisation",
    icon: officeIcon?.icon || buildings.defaultIcon || ICON_CATEGORIES.financial?.defaultIcon || ICON_CATEGORIES.people?.defaultIcon,
    categoryColor: buildings.color || "#64748b",
    categoryName: "Organisation"
  };
}

function createOrganisationMarker(latLng) {
  const iconData = getCompanyEntityIconData();
  const markerIcon = L.icon({
    iconUrl: iconData.icon,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14]
  });
  return L.marker(latLng, { icon: markerIcon });
}

function getOfficerEntityIconData() {
  const people = ICON_CATEGORIES.people || {};
  const personIcon = (people.icons || []).find((ic) => ic.id === "person") || (people.icons || [])[0];
  return {
    id: personIcon?.id || "person",
    name: personIcon?.name || "Person",
    icon: personIcon?.icon || people.defaultIcon || ICON_CATEGORIES.people?.defaultIcon,
    categoryColor: people.color || "#8b5cf6",
    categoryName: people.name || "People"
  };
}

function buildOfficerI2EntityData(personData = {}) {
  const personEntity = getI2EntityByKey("ET5") || getI2EntityByKey("Person");
  const values = [];
  if (personData.name) values.push({ propertyName: "Full Name", value: String(personData.name) });
  if (personData.dob) values.push({ propertyName: "Date of Birth", value: formatPartialDobValue(personData.dob) });
  if (personData.nationality) values.push({ propertyName: "Nationality", value: String(personData.nationality) });
  if (personData.countryOfResidence) values.push({ propertyName: "Country of Residence", value: String(personData.countryOfResidence) });
  if (personData.relationship) values.push({ propertyName: "Role", value: String(personData.relationship) });
  if (personData.address) values.push({ propertyName: "Address String", value: String(personData.address) });
  if (personData.postcode) values.push({ propertyName: "Post Code", value: String(personData.postcode) });
  return {
    entityId: personEntity?.entity_id || "ET5",
    entityName: personEntity?.entity_name || "Person",
    values
  };
}

function normalizeOfficerNameKey(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeDobKey(value) {
  return formatPartialDobValue(value || "").trim().toUpperCase();
}

function buildOfficerEntityKeys(personData = {}) {
  const nameKey = normalizeOfficerNameKey(personData.name);
  const postcodeKey = String(personData.postcode || "").trim().toUpperCase();
  const officerIdKey = String(personData.officerId || "").trim();
  const dobKey = normalizeDobKey(personData.dob);
  return {
    nameKey,
    postcodeKey,
    officerIdKey,
    namePostcodeKey: nameKey && postcodeKey ? `${nameKey}|${postcodeKey}` : "",
    nameDobKey: nameKey && dobKey ? `${nameKey}|${dobKey}` : ""
  };
}

function mergeOfficerEntityData(existing, personData = {}) {
  if (!existing) return;
  if (!existing.officerId && personData.officerId) existing.officerId = personData.officerId;
  if (!existing.countryOfResidence && personData.countryOfResidence) existing.countryOfResidence = personData.countryOfResidence;
  if (!existing.nationality && personData.nationality) existing.nationality = personData.nationality;
  if (!existing.dob && personData.dob) existing.dob = personData.dob;
  if (!existing.officerRole && personData.relationship) existing.officerRole = personData.relationship;
  if (!existing.companyName && personData.companyName) existing.companyName = String(personData.companyName);
  if (!existing.companyNumber && personData.companyNumber) existing.companyNumber = String(personData.companyNumber);
  if (!existing.notes && personData.notes) existing.notes = String(personData.notes);
  if (!existing.address && personData.address) existing.address = String(personData.address);
  existing.i2EntityData = buildOfficerI2EntityData({
    name: existing.label || personData.name || "",
    dob: existing.dob || personData.dob || "",
    nationality: existing.nationality || personData.nationality || "",
    countryOfResidence: existing.countryOfResidence || personData.countryOfResidence || "",
    relationship: existing.officerRole || personData.relationship || "",
    address: existing.address || personData.address || "",
    postcode: personData.postcode || ""
  });
}

function findExistingOfficerEntityId(personData = {}) {
  const keys = buildOfficerEntityKeys(personData);
  if (!window._officerEntityIndex) window._officerEntityIndex = {};
  if (!window._officerEntityByOfficerId) window._officerEntityByOfficerId = {};
  if (!window._officerEntityByNameDob) window._officerEntityByNameDob = {};

  let entityId = "";
  if (keys.officerIdKey) entityId = window._officerEntityByOfficerId[keys.officerIdKey] || "";
  if (!entityId && keys.nameDobKey) entityId = window._officerEntityByNameDob[keys.nameDobKey] || "";
  if (!entityId && keys.namePostcodeKey) entityId = window._officerEntityIndex[keys.namePostcodeKey] || "";

  if (!entityId) return null;
  const existing = getEntityById(entityId);
  return existing ? entityId : null;
}

function upsertOfficerEntityIndexes(entityId, personData = {}) {
  if (!entityId) return;
  const keys = buildOfficerEntityKeys(personData);
  if (!window._officerEntityIndex) window._officerEntityIndex = {};
  if (!window._officerEntityByOfficerId) window._officerEntityByOfficerId = {};
  if (!window._officerEntityByNameDob) window._officerEntityByNameDob = {};
  if (keys.namePostcodeKey) window._officerEntityIndex[keys.namePostcodeKey] = entityId;
  if (keys.officerIdKey) window._officerEntityByOfficerId[keys.officerIdKey] = entityId;
  if (keys.nameDobKey) window._officerEntityByNameDob[keys.nameDobKey] = entityId;
}

function registerOfficerMarkerAsEntity(marker, personData = {}) {
  if (!marker) return null;
  const keys = buildOfficerEntityKeys(personData);
  if (!keys.nameKey) return null;
  const existingId = findExistingOfficerEntityId(personData);
  if (existingId) {
    const existing = getEntityById(existingId);
    if (existing) {
      mergeOfficerEntityData(existing, personData);
      upsertOfficerEntityIndexes(existingId, {
        name: existing.label || personData.name,
        postcode: personData.postcode,
        officerId: existing.officerId || personData.officerId,
        dob: existing.dob || personData.dob
      });
      existing.marker.setPopupContent(buildEntityPopup(existingId, existing));
      bindEntityHoverTooltip(existing.marker, existing);
      marker.bindPopup(buildEntityPopup(existingId, existing));
      marker._entityId = existingId;
      bindEntityHoverTooltip(marker, existing);
      return existingId;
    }
  }

  const coords = normalizeLatLng(personData.latLng || marker.getLatLng());
  if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
  if (window.EntityStore) {
    const entityId = window.EntityStore.addEntity({
      type: "person",
      label: String(personData.name || "Person"),
      attributes: {
        address: String(personData.address || "").trim(),
        notes: personData.notes ? String(personData.notes) : "",
        dob: personData.dob || "",
        nationality: personData.nationality || "",
        countryOfResidence: personData.countryOfResidence || "",
        officerId: personData.officerId || "",
        officerRole: personData.relationship || "",
        companyName: personData.companyName ? String(personData.companyName) : "",
        companyNumber: personData.companyNumber ? String(personData.companyNumber) : "",
        sourceType: "officer"
      },
      latLng: coords,
      i2EntityData: buildOfficerI2EntityData(personData),
      _marker: marker,
      _visible: true
    });
    marker._entityId = entityId;
    const stored = getEntityById(entityId);
    if (stored) {
      marker.bindPopup(buildEntityPopup(entityId, stored));
      bindEntityHoverTooltip(marker, stored);
    }
    upsertOfficerEntityIndexes(entityId, personData);
    updateDashboardCounts();
    return entityId;
  }

  const entityId = `officer_entity_${Date.now()}_${Math.random()}`;
  const entity = {
    id: entityId,
    iconData: getOfficerEntityIconData(),
    label: String(personData.name || "Person"),
    address: String(personData.address || "").trim(),
    notes: personData.notes ? String(personData.notes) : "",
    latLng: coords,
    marker,
    i2EntityData: buildOfficerI2EntityData(personData),
    sourceType: "officer",
    dob: personData.dob || "",
    nationality: personData.nationality || "",
    countryOfResidence: personData.countryOfResidence || "",
    officerId: personData.officerId || "",
    officerRole: personData.relationship || "",
    companyName: personData.companyName ? String(personData.companyName) : "",
    companyNumber: personData.companyNumber ? String(personData.companyNumber) : ""
  };
  marker._entityId = entityId;
  bindEntityHoverTooltip(marker, entity);
  window._mapEntities.push(entity);
  upsertOfficerEntityIndexes(entityId, personData);
  updateDashboardCounts();
  return entityId;
}

function bindCompanyEntityMarkerClick(marker) {
  if (!marker || marker._companyEntityClickBound) return;
  marker.on("click", function(e) {
    L.DomEvent.stopPropagation(e);
    const entityId = marker._entityId;
    if (connectionDrawingMode && entityId && connectionDrawingMode.fromId !== entityId) {
      completeConnection(entityId);
      return;
    }
    highlightConnections(marker.getLatLng());
  });
  marker._companyEntityClickBound = true;
}

function registerCompanyMarkerAsEntity(marker, companyData = {}) {
  if (!marker) return null;
  const numberKey = String(companyData.number || "").trim().toUpperCase();
  if (!numberKey) return null;

  if (!window._companyEntityIndex) window._companyEntityIndex = {};

  const existingId = window._companyEntityIndex[numberKey];
  if (existingId) {
    const existing = getEntityById(existingId);
    if (existing) {
      marker._entityId = existingId;
      bindCompanyEntityMarkerClick(marker);
      bindEntityHoverTooltip(marker, existing);
      return existingId;
    }
  }

  const coords = normalizeLatLng(companyData.latLng || marker.getLatLng());
  if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) return null;
  if (window.EntityStore) {
    const entityId = window.EntityStore.addEntity({
      type: "organisation",
      label: String(companyData.name || numberKey),
      attributes: {
        address: String(companyData.address || "").trim(),
        notes: companyData.status ? `Status: ${companyData.status}` : "",
        companyNumber: numberKey,
        companyName: String(companyData.name || numberKey),
        status: String(companyData.status || ""),
        sourceType: "company"
      },
      latLng: coords,
      i2EntityData: buildCompanyI2EntityData(companyData),
      _marker: marker,
      _visible: true
    });
    marker._entityId = entityId;
    bindCompanyEntityMarkerClick(marker);
    const stored = getEntityById(entityId);
    if (stored) {
      marker.bindPopup(buildEntityPopup(entityId, stored));
      bindEntityHoverTooltip(marker, stored);
    }
    window._companyEntityIndex[numberKey] = entityId;
    updateDashboardCounts();
    return entityId;
  }

  const entityId = `company_entity_${numberKey}_${Date.now()}_${Math.random()}`;
  const entity = {
    id: entityId,
    iconData: getCompanyEntityIconData(),
    label: String(companyData.name || numberKey),
    address: String(companyData.address || "").trim(),
    notes: companyData.status ? `Status: ${companyData.status}` : "",
    latLng: coords,
    marker,
    i2EntityData: buildCompanyI2EntityData(companyData),
    sourceType: "company"
  };

  marker._entityId = entityId;
  bindCompanyEntityMarkerClick(marker);
  bindEntityHoverTooltip(marker, entity);
  window._mapEntities.push(entity);
  window._companyEntityIndex[numberKey] = entityId;
  updateDashboardCounts();
  return entityId;
}

function connectCompanyEntity(companyNumber) {
  const key = String(companyNumber || "").trim().toUpperCase();
  const entityId = window._companyEntityIndex ? window._companyEntityIndex[key] : null;
  if (!entityId) {
    setStatus(`Company ${key} is not yet registered as an Organisation entity`);
    return;
  }
  drawConnectionFrom(entityId);
}

function getCompanyEntityByNumber(companyNumber) {
  const key = String(companyNumber || "").trim().toUpperCase();
  if (!key || !window._companyEntityIndex) return null;
  const entityId = window._companyEntityIndex[key];
  return entityId ? getEntityById(entityId) : null;
}

function getNextPscFanIndex(companyEntityId) {
  if (!companyEntityId || !Array.isArray(window._mapConnections)) return 0;
  return window._mapConnections.filter((c) =>
    c?.metadata?.source === "psc_auto" && c?.metadata?.toId === companyEntityId
  ).length;
}

function offsetLatLngFromAnchor(anchor, fanIndex = 0, radiusDeg = 0.00115) {
  const base = normalizeLatLng(anchor);
  if (!Number.isFinite(base[0]) || !Number.isFinite(base[1])) return base;
  const idx = Number.isFinite(Number(fanIndex)) ? Number(fanIndex) : 0;
  const angleDeg = ((idx + 1) * 45) % 360;
  const ring = Math.floor(idx / 8);
  const distance = radiusDeg * (1 + ring * 0.5);
  const rad = angleDeg * (Math.PI / 180);
  return [base[0] + Math.sin(rad) * distance, base[1] + Math.cos(rad) * distance];
}

function removeCompanyEntitiesFromStore() {
  if (!window._companyEntityIndex) return;
  const removedIds = new Set(Object.values(window._companyEntityIndex));
  if (!removedIds.size) return;

  const toRemoveConnections = window._mapConnections
    .filter((c) => removedIds.has(c?.metadata?.fromId) || removedIds.has(c?.metadata?.toId))
    .map((c) => c.id);
  toRemoveConnections.forEach((id) => removeConnection(id));

  window._mapEntities = window._mapEntities.filter((e) => !removedIds.has(e.id));
  window._companyEntityIndex = {};
  updateDashboardCounts();
}

function refreshConnectionGeometry(connection) {
  if (!connection || !connection.line || !connection.metadata) return;
  const fromId = connection.metadata.fromId;
  const toId = connection.metadata.toId;
  if (!fromId || !toId) return;
  const fromEntity = getEntityById(fromId);
  const toEntity = getEntityById(toId);
  if (!fromEntity || !toEntity) return;
  connection.line.setLatLngs([fromEntity.latLng, toEntity.latLng]);
  if (connection.labelMarker) {
    const midLat = (fromEntity.latLng[0] + toEntity.latLng[0]) / 2;
    const midLng = (fromEntity.latLng[1] + toEntity.latLng[1]) / 2;
    connection.labelMarker.setLatLng([midLat, midLng]);
  }
}

function refreshConnectionsForEntity(entityId) {
  if (!entityId || !Array.isArray(window._mapConnections)) return;
  window._mapConnections.forEach((conn) => {
    if (!conn?.metadata) return;
    if (conn.metadata.fromId === entityId || conn.metadata.toId === entityId) {
      refreshConnectionGeometry(conn);
    }
  });
}

function hasPscAutoConnection(fromId, toId) {
  if (!fromId || !toId || !Array.isArray(window._mapConnections)) return false;
  return window._mapConnections.some((c) => {
    const md = c?.metadata || {};
    return md.source === "psc_auto" && md.fromId === fromId && md.toId === toId;
  });
}

function isAircraftEntityIcon(iconData = null, i2EntityData = null) {
  const id = String(iconData?.id || "").toLowerCase();
  const category = String(iconData?.categoryName || "").toLowerCase();
  const name = String(iconData?.name || "").toLowerCase();
  const i2Name = String(i2EntityData?.entityName || "").toLowerCase();
  if (id === "aircraft" || id === "aircraft_large") return true;
  if (i2Name === "aircraft") return true;
  return category.includes("aviation") && (name.includes("aircraft") || name.includes("plane") || name.includes("flight"));
}

function createAircraftEntityDivIcon() {
  const svg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c.6 0 1 .4 1 1v7.1l7.4 3.3c.5.2.8.7.7 1.2l-.3 1.4c-.1.6-.7 1-1.3.8l-6.5-1.7v3.9l2 1.5c.3.2.5.6.5 1v.8c0 .6-.5 1-1.1.9L12 22l-2.9.9c-.6.1-1.1-.3-1.1-.9v-.8c0-.4.2-.8.5-1l2-1.5v-3.9l-6.5 1.7c-.6.2-1.2-.2-1.3-.8l-.3-1.4c-.1-.5.2-1 .7-1.2L10.9 10.1V3c0-.6.4-1 1-1z"/></svg>';
  const html =
    `<div class="flight-icon flight-transit" style="--flight-icon-size:20px">` +
      `<span class="flight-inner" style="transform:rotate(0deg)">` +
        `${svg}` +
      `</span>` +
    `</div>`;
  return L.divIcon({
    className: "flight-marker entity-aircraft-marker",
    html,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -14]
  });
}

function createEntityMarkerIcon(iconData = {}, i2EntityData = null) {
  if (isAircraftEntityIcon(iconData, i2EntityData)) return createAircraftEntityDivIcon();
  return L.icon({
    iconUrl: iconData.icon,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
}

function placeEntity(latLng, iconData, label = '', address = '', notes = '', i2EntityData = null) {
  const coords = normalizeLatLng(latLng);
  if (!Number.isFinite(coords[0]) || !Number.isFinite(coords[1])) {
    setStatus("Invalid coordinates for entity placement");
    return null;
  }

  // Prefer the EntityStore/EntityRenderer path when available so the new core
  // systems (search, inspector, exports, graph) receive live updates.
  if (window.EntityRenderer && window.EntityStore) {
    const normalizedI2 = normalizeVehicleI2EntityData(i2EntityData, iconData) || null;
    const inferredType = typeof window.EntityRenderer.inferEntityType === "function"
      ? window.EntityRenderer.inferEntityType(iconData, null, normalizedI2)
      : "location";
    const entityId = window.EntityRenderer.placeEntityViaStore(
      inferredType,
      label || iconData?.name || "Entity",
      coords,
      { address: address || "", notes: notes || "" },
      null,
      normalizedI2
    );
    if (entityId) return entityId;
  }

  const entityId = `entity_${Date.now()}_${Math.random()}`;
  
  const icon = createEntityMarkerIcon(iconData, i2EntityData);
  
  const marker = L.marker(coords, { icon: icon, draggable: true });
  
  const entity = {
    id: entityId,
    iconData: iconData,
    label: label || iconData.name,
    address: address || '',
    notes: notes || '',
    latLng: coords,
    marker: marker,
    i2EntityData: normalizeVehicleI2EntityData(i2EntityData, iconData) || null
  };

  marker.bindPopup(buildEntityPopup(entityId, entity)).addTo(entitiesMarkerCluster);
  bindEntityHoverTooltip(marker, entity);
  marker.on("dragend", () => {
    const next = marker.getLatLng();
    entity.latLng = [Number(next.lat), Number(next.lng)];
    marker.setPopupContent(buildEntityPopup(entityId, entity));
    refreshConnectionsForEntity(entityId);
    setStatus(`Moved: ${entity.label}`);
  });

  // In connect mode, clicking another entity should complete the link immediately.
  marker.on('click', function(e) {
    L.DomEvent.stopPropagation(e);
    if (connectionDrawingMode && connectionDrawingMode.fromId !== entityId) {
      completeConnection(entityId);
      return;
    }
    highlightConnections(marker.getLatLng());
  });
  
  marker.openPopup();

  window._mapEntities.push(entity);

  // Right-click context menu for entity
  marker.on("contextmenu", (e) => {
    if (typeof window.showEntityContextMenu === "function") {
      window.showEntityContextMenu(e.originalEvent, entityId);
    }
  });

  updateDashboardCounts();

  // Dashboard activity logging
  if (window.CRDashboard) window.CRDashboard.logActivity("Entity placed", label || iconData?.name || "entity", "entity");

  return entityId;
}

function removeEntity(entityId) {
  if (window.EntityStore && window.EntityStore.getEntity(entityId)) {
    window.EntityStore.removeEntity(entityId);
    if (window._selectedEntityIds) window._selectedEntityIds.delete(entityId);
    if (window._companyEntityIndex) {
      Object.keys(window._companyEntityIndex).forEach((k) => {
        if (window._companyEntityIndex[k] === entityId) delete window._companyEntityIndex[k];
      });
    }
    if (window._officerEntityIndex) {
      Object.keys(window._officerEntityIndex).forEach((k) => {
        if (window._officerEntityIndex[k] === entityId) delete window._officerEntityIndex[k];
      });
    }
    if (window._officerEntityByOfficerId) {
      Object.keys(window._officerEntityByOfficerId).forEach((k) => {
        if (window._officerEntityByOfficerId[k] === entityId) delete window._officerEntityByOfficerId[k];
      });
    }
    if (window._officerEntityByNameDob) {
      Object.keys(window._officerEntityByNameDob).forEach((k) => {
        if (window._officerEntityByNameDob[k] === entityId) delete window._officerEntityByNameDob[k];
      });
    }
    setStatus('Entity removed');
    updateDashboardCounts();
    return;
  }

  const idx = window._mapEntities.findIndex(e => e.id === entityId);
  if (idx >= 0) {
    const entity = window._mapEntities[idx];
    window._selectedEntityIds.delete(entityId);
    entitiesMarkerCluster.removeLayer(entity.marker);
    window._mapEntities.splice(idx, 1);
    if (window._companyEntityIndex) {
      Object.keys(window._companyEntityIndex).forEach((k) => {
        if (window._companyEntityIndex[k] === entityId) delete window._companyEntityIndex[k];
      });
    }
    if (window._officerEntityIndex) {
      Object.keys(window._officerEntityIndex).forEach((k) => {
        if (window._officerEntityIndex[k] === entityId) delete window._officerEntityIndex[k];
      });
    }
    if (window._officerEntityByOfficerId) {
      Object.keys(window._officerEntityByOfficerId).forEach((k) => {
        if (window._officerEntityByOfficerId[k] === entityId) delete window._officerEntityByOfficerId[k];
      });
    }
    if (window._officerEntityByNameDob) {
      Object.keys(window._officerEntityByNameDob).forEach((k) => {
        if (window._officerEntityByNameDob[k] === entityId) delete window._officerEntityByNameDob[k];
      });
    }
    setStatus('Entity removed');
    updateDashboardCounts();
    if (window.CRDashboard) window.CRDashboard.logActivity("Entity removed", entity.label || entityId, "entity");
  }
}

function editEntity(entityId) {
  openEntityEditor(entityId);
}

function editEntityLabel(entityId) {
  editEntity(entityId);
}

function clearAllEntities() {
  if (window.EntityStore && window.EntityStore.getAll().length) {
    window.EntityStore.clear();
    window._mapEntities = [];
    window._mapConnections = [];
    setStatus('All custom entities removed');
    updateDashboardCounts();
    return;
  }

  clearEntitySelection();
  window._mapEntities.forEach(entity => {
    entitiesMarkerCluster.removeLayer(entity.marker);
  });
  window._mapEntities = [];
  setStatus('All custom entities removed');
  updateDashboardCounts();
}

const CAR_MAKE_LOGO_INDEX_DEFAULT = {};
let CAR_MAKE_LOGO_INDEX = { ...CAR_MAKE_LOGO_INDEX_DEFAULT };

function normalizeCarMakeKey(raw) {
  const text = String(raw || "");
  const latinized = typeof text.normalize === "function"
    ? text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    : text;
  return latinized.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function canonicalizeWikimediaFileUrl(urlRaw) {
  const url = String(urlRaw || "").trim();
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) return "";
  return url
    .replace(/^http:\/\//i, "https://")
    .replace(/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//i, "https://commons.wikimedia.org/wiki/Special:FilePath/");
}

function buildCarMakeLogoIndexFromVehicleEntities(rawEntities) {
  if (!rawEntities || typeof rawEntities !== "object") return {};
  const index = {};
  Object.entries(rawEntities).forEach(([entityId, entity]) => {
    if (!entity || typeof entity !== "object") return;
    const logoUrl = canonicalizeWikimediaFileUrl(entity.logo_url);
    if (!logoUrl) return;

    const labelKey = normalizeCarMakeKey(entity.label || "");
    if (labelKey) index[labelKey] = logoUrl;

    const idKey = normalizeCarMakeKey(entityId);
    if (idKey) index[idKey] = logoUrl;
  });

  const aliases = {
    landrover: ["land_rover", "land_rover_limited"],
    mercedes: ["mercedes_benz", "mercedes_benz_group"],
    mercedesbenz: ["mercedes_benz", "mercedes_benz_group"],
    mg: ["mg_motor", "mg_motor_uk", "saic_motor"],
    rollsroyce: ["rolls_royce_motor_cars", "rolls_royce_limited"],
    vauxhall: ["vauxhall_motors", "opel"],
    alfa: ["alfa_romeo"],
    alfaromeo: ["alfa_romeo"]
  };
  Object.entries(aliases).forEach(([target, refs]) => {
    if (index[target]) return;
    for (const ref of refs) {
      const k = normalizeCarMakeKey(ref);
      if (index[k]) {
        index[target] = index[k];
        break;
      }
    }
  });
  return index;
}

function setCarMakeLogoIndex(rawIndex) {
  if (!rawIndex || typeof rawIndex !== "object") {
    CAR_MAKE_LOGO_INDEX = { ...CAR_MAKE_LOGO_INDEX_DEFAULT };
    return;
  }
  CAR_MAKE_LOGO_INDEX = rawIndex;
}

let DVLA_VEHICLE_ICON_LOOKUP = null;
let VEHICLE_GT_IMAGE_INDEX = [];
const dvlaVehicleIconLookupPromise = fetch("data/dvla_vehicle_icon_lookup.json")
  .then((r) => (r.ok ? r.json() : null))
  .then((payload) => {
    if (!payload || typeof payload !== "object") return null;
    if (!payload.by_make || typeof payload.by_make !== "object") return null;
    DVLA_VEHICLE_ICON_LOOKUP = payload;
    return payload;
  })
  .catch(() => null);

const vehicleEntitiesLogoPromise = fetch("data/vehicle_entities.json")
  .then((r) => (r.ok ? r.json() : null))
  .then((entities) => {
    if (!entities) return null;
    const built = buildCarMakeLogoIndexFromVehicleEntities(entities);
    return Object.keys(built).length ? built : null;
  })
  .catch(() => null);

const vehicleGtImagePromise = fetch("data/vehicle_icons_granturismo.json")
  .then((r) => (r.ok ? r.json() : null))
  .then((payload) => {
    if (!payload || typeof payload !== "object") return null;
    VEHICLE_GT_IMAGE_INDEX = Object.entries(payload).map(([key, node]) => {
      const label = String(node?.label || "");
      const imageUrl = String(node?.image_url || "");
      const combined = `${key} ${label}`;
      const searchable = String(combined)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { key, label, imageUrl, searchable };
    }).filter((entry) => entry.imageUrl);
    return VEHICLE_GT_IMAGE_INDEX;
  })
  .catch(() => null);

function getVehicleMakeLogoPath(makeRaw) {
  const key = normalizeCarMakeKey(makeRaw);
  if (!key) return "";
  return String(CAR_MAKE_LOGO_INDEX[key] || "");
}

function normalizeVehicleSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getVehicleCarPlaceholderIcon() {
  const vehicles = ICON_CATEGORIES.vehicles || {};
  const carIcon = (vehicles.icons || []).find((ic) => ic.id === "car") || (vehicles.icons || [])[0];
  return String(carIcon?.icon || vehicles.defaultIcon || "gfx/map_icons/cars/car.png");
}

function getVehicleModelTokens(modelRaw = "") {
  const model = normalizeVehicleSearchText(modelRaw);
  if (!model) return [];
  const blacklist = new Set(["the", "and", "for", "with", "line", "series", "class", "sport", "edition", "model", "base"]);
  return model.split(" ").filter((t) => t && t.length >= 2 && !blacklist.has(t));
}

function getVehicleMakeAliases(makeRaw = "") {
  const make = normalizeVehicleSearchText(makeRaw);
  if (!make) return [];
  const aliases = new Set([make]);
  if (make.includes("mercedes")) aliases.add("benz");
  if (make.includes("benz")) aliases.add("mercedes");
  if (make === "vw") aliases.add("volkswagen");
  if (make === "volkswagen") aliases.add("vw");
  if (make.includes("alfa")) aliases.add("alfa romeo");
  if (make.includes("land rover")) aliases.add("range rover");
  return [...aliases];
}

function findGranTurismoVehicleImage(vehicle = {}) {
  if (!Array.isArray(VEHICLE_GT_IMAGE_INDEX) || !VEHICLE_GT_IMAGE_INDEX.length) return null;
  const make = normalizeVehicleSearchText(vehicle?.make || "");
  const model = normalizeVehicleSearchText(vehicle?.model || "");
  const year = parseVehicleYear(vehicle);
  if (!make && !model) return null;
  const modelTokens = getVehicleModelTokens(model);
  const makeAliases = getVehicleMakeAliases(make);

  let best = null;
  let bestScore = -1;
  for (const item of VEHICLE_GT_IMAGE_INDEX) {
    const hay = item.searchable;
    let score = 0;
    let makeHit = false;
    if (makeAliases.length) {
      for (const alias of makeAliases) {
        if (alias && hay.includes(alias)) {
          makeHit = true;
          break;
        }
      }
      if (makeHit) score += 32;
    }
    if (model && hay.includes(model)) score += 40;
    let tokenHit = 0;
    if (modelTokens.length) {
      for (const token of modelTokens) if (hay.includes(token)) tokenHit += 1;
      score += Math.round((tokenHit / modelTokens.length) * 35);
    }
    if (year && hay.includes(String(year))) score += 14;
    if (score > bestScore) {
      bestScore = score;
      best = { ...item, makeHit, tokenHit };
    }
  }
  if (!best) return null;
  if (best.makeHit && bestScore >= 24) return { ...best, score: bestScore };
  if (best.tokenHit >= 2 && bestScore >= 34) return { ...best, score: bestScore };
  return bestScore >= 46 ? { ...best, score: bestScore } : null;
}

function getDvlaVehicleShowcaseData(vehicle = {}) {
  const gtMatch = findGranTurismoVehicleImage(vehicle);
  const makeLogo = getVehicleMakeLogoPath(vehicle.make || "");
  const mapIcon = getDvlaVehicleIconPath(vehicle) || getVehicleCarPlaceholderIcon();
  return {
    matched: !!gtMatch,
    source: gtMatch ? "gran_turismo" : "placeholder",
    label: gtMatch?.label || `${String(vehicle.make || "Vehicle")} ${String(vehicle.model || "").trim()}`.trim(),
    imageUrl: gtMatch?.imageUrl || "",
    logoPath: makeLogo || "",
    placeholderIcon: mapIcon,
    mapIcon
  };
}

function parseVehicleYear(vehicle = {}) {
  const y = Number(vehicle?.yearOfManufacture || 0);
  if (Number.isFinite(y) && y >= 1900 && y <= 2100) return Math.trunc(y);
  const mfr = String(vehicle?.monthOfFirstRegistration || "");
  const m = mfr.match(/\b(19|20)\d{2}\b/);
  return m ? Number(m[0]) : 0;
}

function getDvlaVehicleIconPath(vehicle = {}) {
  const lookup = DVLA_VEHICLE_ICON_LOOKUP;
  if (!lookup || typeof lookup !== "object") return "";
  const byMake = lookup.by_make || {};
  const makeKey = normalizeCarMakeKey(vehicle?.make || "");
  if (!makeKey) return "";
  const makeNode = byMake[makeKey];
  if (!makeNode || typeof makeNode !== "object") return "";

  const years = makeNode.years || {};
  const vehicleYear = parseVehicleYear(vehicle);
  if (vehicleYear && years[String(vehicleYear)]?.icon) {
    return String(years[String(vehicleYear)].icon || "");
  }

  if (vehicleYear) {
    let bestYear = 0;
    let bestDist = 999;
    let bestScore = 0;
    Object.entries(years).forEach(([yearText, node]) => {
      const y = Number(yearText);
      if (!Number.isFinite(y)) return;
      const dist = Math.abs(y - vehicleYear);
      const score = Number(node?.score || 0);
      if (dist > 6) return;
      if (dist < bestDist || (dist === bestDist && score > bestScore)) {
        bestDist = dist;
        bestYear = y;
        bestScore = score;
      }
    });
    if (bestYear && years[String(bestYear)]?.icon) {
      return String(years[String(bestYear)].icon || "");
    }
  }

  return String(makeNode.default_icon || "");
}

window.getVehicleMakeLogoPath = getVehicleMakeLogoPath;
window.getDvlaVehicleIconPath = getDvlaVehicleIconPath;
window.getDvlaVehicleShowcaseData = getDvlaVehicleShowcaseData;
vehicleEntitiesLogoPromise.then((fromEntities) => {
  if (fromEntities && typeof fromEntities === "object" && Object.keys(fromEntities).length) {
    setCarMakeLogoIndex(fromEntities);
    return;
  }
  setCarMakeLogoIndex(CAR_MAKE_LOGO_INDEX_DEFAULT);
});
dvlaVehicleIconLookupPromise.then(() => {
  // no-op; ensures asynchronous load starts early
});
vehicleGtImagePromise.then(() => {
  // no-op; ensures asynchronous load starts early
});

function getVehicleEntityIconData(makeRaw = "", vehicle = null) {
  const vehicles = ICON_CATEGORIES.vehicles || {};
  const carIcon = (vehicles.icons || []).find((ic) => ic.id === "car") || (vehicles.icons || [])[0];
  const mappedVehicleIcon = vehicle ? getDvlaVehicleIconPath(vehicle) : "";
  const logoPath = getVehicleMakeLogoPath(makeRaw);
  return {
    id: carIcon?.id || "car",
    name: String(makeRaw || carIcon?.name || "Vehicle"),
    icon: mappedVehicleIcon || logoPath || carIcon?.icon || vehicles.defaultIcon || ICON_CATEGORIES.vehicles?.defaultIcon,
    categoryColor: vehicles.color || "#f59e0b",
    categoryName: vehicles.name || "Vehicles"
  };
}

function buildVehicleI2EntityData(vehicle = {}) {
  const values = [];
  const showcase = getDvlaVehicleShowcaseData(vehicle);
  if (vehicle.registrationNumber) values.push({ propertyName: "Registration Mark", value: String(vehicle.registrationNumber) });
  if (vehicle.make) values.push({ propertyName: "Vehicle Make", value: String(vehicle.make) });
  if (vehicle.model) values.push({ propertyName: "Vehicle Model", value: String(vehicle.model) });
  if (vehicle.colour) values.push({ propertyName: "Vehicle Colour", value: String(vehicle.colour) });
  if (vehicle.yearOfManufacture) values.push({ propertyName: "Year", value: String(vehicle.yearOfManufacture) });
  if (vehicle.fuelType) values.push({ propertyName: "Fuel Type", value: String(vehicle.fuelType) });
  if (vehicle.taxStatus) values.push({ propertyName: "Tax Status", value: String(vehicle.taxStatus) });
  if (vehicle.motStatus) values.push({ propertyName: "MOT Status", value: String(vehicle.motStatus) });
  if (showcase.imageUrl) values.push({ propertyName: "Vehicle Image URL", value: String(showcase.imageUrl) });
  if (showcase.source) values.push({ propertyName: "Vehicle Image Source", value: String(showcase.source) });
  if (showcase.mapIcon) values.push({ propertyName: "Vehicle Map Icon URL", value: String(showcase.mapIcon) });
  if (showcase.logoPath) values.push({ propertyName: "Vehicle Make Logo URL", value: String(showcase.logoPath) });
  return {
    entityId: "ET3",
    entityName: "Vehicle",
    values
  };
}

function addDvlaVehicleEntity(vehicle = {}, latLng = null) {
  const vrm = String(vehicle.registrationNumber || "").trim().toUpperCase();
  if (!vrm) return null;
  const center = latLng || [map.getCenter().lat, map.getCenter().lng];
  const label = [vrm, vehicle.make, vehicle.model].filter(Boolean).join(" | ");
  const notes = [
    vehicle.yearOfManufacture ? `Year ${vehicle.yearOfManufacture}` : "",
    vehicle.colour ? `Colour ${vehicle.colour}` : "",
    vehicle.fuelType ? `Fuel ${vehicle.fuelType}` : "",
    vehicle.taxStatus ? `Tax ${vehicle.taxStatus}` : "",
    vehicle.motStatus ? `MOT ${vehicle.motStatus}` : ""
  ].filter(Boolean).join(" | ");
  const entityId = placeEntity(
    center,
    getVehicleEntityIconData(vehicle.make, vehicle),
    label || vrm,
    "",
    notes,
    buildVehicleI2EntityData(vehicle)
  );
  if (entityId) setStatus(`Added vehicle entity: ${vrm}`);
  return entityId;
}

function isVehicleEntityForPopup(entity = {}) {
  const i2Name = String(entity?.i2EntityData?.entityName || "").toLowerCase();
  if (i2Name.includes("vehicle")) return true;
  const values = Array.isArray(entity?.i2EntityData?.values) ? entity.i2EntityData.values : [];
  return values.some((v) => String(v?.propertyName || "").toLowerCase() === "registration mark");
}

function buildVehiclePopupMediaHtml(entity = {}) {
  const values = Array.isArray(entity?.i2EntityData?.values) ? entity.i2EntityData.values : [];
  const valueOf = (name) => {
    const hit = values.find((v) => String(v?.propertyName || "").toLowerCase() === String(name).toLowerCase());
    return String(hit?.value || "");
  };
  const isLikelyMapIconUrl = (url) => {
    const u = String(url || "").trim().toLowerCase();
    if (!u) return false;
    return u.includes("/map_icons/") || u.startsWith("gfx/map_icons/");
  };
  const isHttpImage = (url) => /^https?:\/\//i.test(String(url || "").trim());
  const vehicle = {
    make: valueOf("Vehicle Make"),
    model: valueOf("Vehicle Model"),
    yearOfManufacture: valueOf("Year")
  };
  const showcase = getDvlaVehicleShowcaseData(vehicle);
  const storedSource = valueOf("Vehicle Image Source").toLowerCase();
  const storedImageUrl = valueOf("Vehicle Image URL");
  const source = storedSource || showcase.source;
  const imageUrl = storedSource === "gran_turismo"
    ? storedImageUrl
    : (isHttpImage(storedImageUrl) && !isLikelyMapIconUrl(storedImageUrl) ? storedImageUrl : showcase.imageUrl);
  const mapIconUrl = valueOf("Vehicle Map Icon URL") || showcase.mapIcon || showcase.placeholderIcon;
  const logoUrl = valueOf("Vehicle Make Logo URL") || showcase.logoPath;
  const showTopImage = !!imageUrl && source === "gran_turismo" && isHttpImage(imageUrl) && !isLikelyMapIconUrl(imageUrl);
  const title = showTopImage ? (showcase.label || "Matched vehicle image") : "Vehicle map icon";
  const topImageHtml = showTopImage
    ? `<img class="vehicle-popup-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" loading="lazy">`
    : "";
  const mapIconHtml = mapIconUrl
    ? `<img class="vehicle-popup-map-icon" src="${escapeHtml(mapIconUrl)}" alt="Vehicle map icon" loading="lazy">`
    : "";
  const logoHtml = logoUrl
    ? `<img class="vehicle-popup-logo" src="${escapeHtml(logoUrl)}" alt="${escapeHtml(vehicle.make || "Vehicle make")} logo" loading="lazy">`
    : "";
  return (
    `<div class="vehicle-popup-media">` +
      topImageHtml +
      `<div class="vehicle-popup-media-meta">` +
        `<div class="vehicle-popup-media-left">${mapIconHtml}${logoHtml}</div>` +
        `<span class="vehicle-popup-media-tag">${showTopImage ? "GT MATCH" : "MAP ICON"}</span>` +
      `</div>` +
    `</div>`
  );
}

// Update dashboard counters
function updateLayerSummaryCards() {
  const activeEl = document.getElementById("layer-summary-active");
  if (activeEl) activeEl.textContent = String(document.querySelectorAll(".layer-cb:checked").length);

  const warmedEl = document.getElementById("layer-summary-warmed");
  if (warmedEl) warmedEl.textContent = String(LAYER_WARM_SET.size);

  const prefetchChip = document.getElementById("layer-summary-prefetch");
  const prefetchDetail = document.getElementById("layer-summary-prefetch-detail");
  if (prefetchChip) {
    let label = "AUTO";
    let detail = "Adaptive idle warming";
    if (window.CRPrefetch) {
      label = window.CRPrefetch.enabled ? "ON" : "OFF";
      detail = window.CRPrefetch.enabled ? "Idle warming active" : "Prefetch paused";
    }
    prefetchChip.textContent = label;
    if (prefetchDetail) prefetchDetail.textContent = detail;
  }
}

function updateDashboardCounts() {
  const entityCount = document.getElementById('entity_count');
  const connectionCount = document.getElementById('connection_count');
  const totalEntities = window._mapEntities.length;
  const totalConnections = window._mapConnections.length;
  const activeLayerCount = document.querySelectorAll(".layer-cb:checked").length;

  if (entityCount) entityCount.textContent = totalEntities;
  if (connectionCount) connectionCount.textContent = totalConnections;

  const cpEntitiesChip = document.getElementById("cp-entities-chip");
  const cpLinksChip = document.getElementById("cp-links-chip");
  const cpActiveLayersChip = document.getElementById("cp-active-layers");
  if (cpEntitiesChip) cpEntitiesChip.textContent = String(totalEntities);
  if (cpLinksChip) cpLinksChip.textContent = String(totalConnections);
  if (cpActiveLayersChip) cpActiveLayersChip.textContent = String(activeLayerCount);

  updateLayerSummaryCards();

  // Sync KPI bar
  if (window.CRDashboard) window.CRDashboard.updateKPIs();
}

// Make functions globally accessible
window.removeEntity = removeEntity;
window.editEntity = editEntity;
window.editEntityLabel = editEntityLabel;
window.clearAllEntities = clearAllEntities;
window.drawConnectionFrom = drawConnectionFrom;
window.showConnectionPopup = showConnectionPopup;
window.removeConnection = removeConnection;
window.editConnection = editConnection;
window.highlightConnections = highlightConnections;
window.clearConnectionHighlights = clearConnectionHighlights;
window.startI2EntityPlacement = startI2EntityPlacement;
window.registerCompanyMarkerAsEntity = registerCompanyMarkerAsEntity;
window.connectCompanyEntity = connectCompanyEntity;
window.createOrganisationMarker = createOrganisationMarker;
window.addPersonToMap = addPersonToMap;
window.expandOfficerCompanies = expandOfficerCompanies;
window.getCompanyEntityByNumber = getCompanyEntityByNumber;
window.addDvlaVehicleEntity = addDvlaVehicleEntity;

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// MANUAL CONNECTION DRAWING
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

let connectionDrawingMode = null;

function drawConnectionFrom(entityId) {
  const entity = window._mapEntities.find(e => e.id === entityId);
  if (!entity) return;
  
  connectionDrawingMode = {
    fromId: entityId,
    fromEntity: entity,
    fromLatLng: entity.latLng
  };
  
  setStatus(`Click another entity to connect to ${entity.label}...`);
  map.getContainer().style.cursor = 'crosshair';
}

function cancelConnectionDrawing(statusMessage = 'Connection cancelled') {
  connectionDrawingMode = null;
  if (statusMessage) setStatus(statusMessage);
  map.getContainer().style.cursor = '';
}

function completeConnection(toEntityId) {
  if (!connectionDrawingMode) return;
  
  const toEntity = window._mapEntities.find(e => e.id === toEntityId);
  if (!toEntity || toEntity.id === connectionDrawingMode.fromId) {
    cancelConnectionDrawing();
    return;
  }
  
  const label = prompt(`Connection label (e.g., "business partner", "known associate"):`,'');
  if (label === null) {
    cancelConnectionDrawing();
    return;
  }
  
  addConnection(
    connectionDrawingMode.fromLatLng,
    toEntity.latLng,
    label,
    'manual',
    {
      fromId: connectionDrawingMode.fromId,
      toId: toEntityId,
      fromLabel: connectionDrawingMode.fromEntity.label,
      toLabel: toEntity.label
    }
  );
  
  setStatus(`Connected: ${connectionDrawingMode.fromEntity.label} -> ${toEntity.label}`);
  cancelConnectionDrawing(null);
}

function showConnectionPopup(latlng, connectionId, label, metadata) {
  const conn = window._mapConnections.find(c => c.id === connectionId);
  if (!conn) return;
  
  const popup = L.popup()
    .setLatLng(latlng)
    .setContent(`
      <strong>Connection</strong>
      <span class="popup-label">Label</span> ${escapeHtml(label || 'No label')}<br>
      ${metadata.fromLabel ? `<span class="popup-label">From</span> ${escapeHtml(metadata.fromLabel)}<br>` : ''}
      ${metadata.toLabel ? `<span class="popup-label">To</span> ${escapeHtml(metadata.toLabel)}<br>` : ''}
      ${metadata.hoverDetail ? `<span class="popup-label">Detail</span> <div class="conn-detail-wrap">${metadata.hoverDetail}</div>` : ''}
      <div class="popup-btn-row">
        <button class="popup-psc-btn" onclick="editConnection('${connectionId}')">Edit Label</button>
        <button class="popup-psc-btn" onclick="removeConnection('${connectionId}')">Remove</button>
      </div>
    `)
    .openOn(map);
}

function removeConnection(connectionId) {
  const idx = window._mapConnections.findIndex(c => c.id === connectionId);
  if (idx >= 0) {
    const conn = window._mapConnections[idx];
    if (window.EntityStore && conn?.metadata?.storeRelId) {
      window.EntityStore.removeRelationship(conn.metadata.storeRelId);
    }
    connectionsLayer.removeLayer(conn.line);
    if (conn.labelMarker) connectionsLayer.removeLayer(conn.labelMarker);
    window._mapConnections.splice(idx, 1);
    setStatus('Connection removed');
    updateDashboardCounts();
    map.closePopup();
  }
}

function editConnection(connectionId) {
  const conn = window._mapConnections.find(c => c.id === connectionId);
  if (!conn) return;
  
  const newLabel = prompt('Connection label:', conn.label || '');
  if (newLabel === null) return;
  
  conn.label = normalizeConnectionLabel(newLabel.trim());
  const coordsForDisplay = conn.line?.getLatLngs?.() || [];
  const fromLatLng = coordsForDisplay[0] ? [coordsForDisplay[0].lat, coordsForDisplay[0].lng] : conn.fromLatLng;
  const toLatLng = coordsForDisplay[1] ? [coordsForDisplay[1].lat, coordsForDisplay[1].lng] : conn.toLatLng;
  conn.displayLabel = resolveConnectionDisplayLabel(fromLatLng, toLatLng, conn.label, conn.metadata || {});
  
  // Update label marker
  if (conn.labelMarker) {
    connectionsLayer.removeLayer(conn.labelMarker);
  }
  
  if (conn.displayLabel || conn.label) {
    const coords = conn.line.getLatLngs();
    const midLat = (coords[0].lat + coords[1].lat) / 2;
    const midLng = (coords[0].lng + coords[1].lng) / 2;
    
    const labelIcon = L.divIcon({
      className: 'connection-label',
      html: `<div class="connection-label-text">${escapeHtml(conn.displayLabel || conn.label)}</div>`,
      iconSize: [150, 30],
      iconAnchor: [75, 15]
    });
    
    conn.labelMarker = L.marker([midLat, midLng], { icon: labelIcon }).addTo(connectionsLayer);
    if (conn?.metadata?.hoverDetail) {
      conn.labelMarker.bindTooltip(String(conn.metadata.hoverDetail), {
        sticky: true,
        direction: "top",
        offset: [0, -10],
        opacity: 0.95
      });
    }
  }
  
  setStatus('Connection updated');
  map.closePopup();
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// ENTITY SELECTOR UI
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

function initializeEntitySelector() {
  const container = document.getElementById('entity_selector');
  if (!container) return;
  
  container.innerHTML = '';

  const _CAT_ICON_MAP = {
    people:        { color: "#818cf8" },
    buildings:     { color: "#64748b" },
    organisation:  { color: "#10b981" },
    financial:     { color: "#059669" },
    vehicles:      { color: "#f59e0b" },
    aviation:      { color: "#60a5fa" },
    maritime:      { color: "#22d3ee" },
    military:      { color: "#94a3b8" },
    communication: { color: "#a78bfa" },
    events:        { color: "#fb923c" },
    document:      { color: "#6b7280" },
    social:        { color: "#ec4899" }
  };
  function _iconSpanHtml(entityId) {
    // Use ICON_CATEGORIES defaultIcon (guaranteed on-disk paths) with category colour.
    const catData = ICON_CATEGORIES[entityId];
    const color = catData?.color || _CAT_ICON_MAP[entityId]?.color || "#64748b";
    const url = catData?.defaultIcon || "";
    if (!url) return `<span class="entity-palette-icon" style="background-color:${color};"></span>`;
    return `<span class="entity-palette-icon" style="background-color:${color};-webkit-mask-image:url('${url}');mask-image:url('${url}');"></span>`;
  }

  if (I2_ENTITY_CATALOG.length) {
    const sorted = [...I2_ENTITY_CATALOG].sort((a, b) =>
      String(a.entity_name || "").localeCompare(String(b.entity_name || ""))
    );

    for (const entity of sorted) {
      const item = document.createElement("div");
      item.className = "entity-category";
      item.innerHTML = `
        <button type="button" class="entity-btn" data-i2-entity-id="${escapeHtml(entity.entity_id)}">
          ${_iconSpanHtml(entity.entity_id)}
          <span class="entity-name">${escapeHtml(humaniseFieldName(entity.entity_name || entity.entity_id))}</span>
        </button>
      `;

      const btn = item.querySelector(".entity-btn");
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        document.querySelectorAll(".entity-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        startI2EntityPlacement(entity.entity_id);
      });
      container.appendChild(item);
    }
  } else {
    // Fallback when i2 catalog is unavailable â€” sorted alphabetically by name.
    const sortedCats = Object.entries(ICON_CATEGORIES).sort((a, b) => a[1].name.localeCompare(b[1].name));
    for (const [catId, category] of sortedCats) {
      const categoryBtn = document.createElement('div');
      categoryBtn.className = 'entity-category';
      categoryBtn.innerHTML = `
        <button type="button" class="entity-btn" data-category="${catId}">
          ${_iconSpanHtml(catId)}
          <span class="entity-name">${category.name}</span>
        </button>
      `;
      const btn = categoryBtn.querySelector('.entity-btn');
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        startPlacementMode(catId);
        showEntityPlacementDialog(map.getCenter());
        document.querySelectorAll('.entity-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      container.appendChild(categoryBtn);
    }
  }
  
  // Add manual connection button
  const connBtn = document.createElement('button');
  connBtn.className = 'btn-secondary';
  connBtn.innerHTML = 'Draw Connection';
  connBtn.addEventListener('click', () => {
    const entityList = window._mapEntities.map((e, i) => `${i + 1}. ${e.label}`).join('\n');
    if (entityList) {
      alert(`Click the "Connect" button on any entity to start drawing connections.\n\nEntities on map:\n${entityList}`);
    } else {
      alert('No entities on map. Place entities first, then use the Connect button on each entity.');
    }
  });
  container.appendChild(connBtn);
  
  // Add cancel and clear buttons
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-secondary';
  cancelBtn.textContent = 'Cancel Placement';
  cancelBtn.addEventListener('click', () => {
    cancelPlacementMode();
    cancelConnectionDrawing();
    document.querySelectorAll('.entity-btn').forEach(b => b.classList.remove('active'));
  });
  container.appendChild(cancelBtn);
  
  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn-secondary';
  clearBtn.textContent = 'Clear All';
  clearBtn.addEventListener('click', () => {
    if (confirm('Remove all custom entities and connections from map?')) {
      clearAllEntities();
      clearConnections();
    }
  });
  container.appendChild(clearBtn);

  // Deselect entity palette buttons when clicking outside the panel/palette
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#entity_selector") && !e.target.closest("#entity-placement-panel")) {
      document.querySelectorAll(".entity-btn").forEach(b => b.classList.remove("active"));
    }
  }, { capture: false });
}

// Import tracking for bulk uploads
window._importedEntityIds = new Set();
window._importedConnectionIds = new Set();
window._importedOverlayLayers = [];

function normalizeFieldName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function detectImportColumns(headers) {
  const out = {
    name: null,
    dob: null,
    address: null,
    postcode: null,
    lat: null,
    lon: null,
    entityType: null,
    target: null,
    relation: null,
    notes: null
  };

  for (const raw of headers) {
    const h = normalizeFieldName(raw);
    if (!h) continue;

    if (!out.name && /^(name|full_name|person|subject|entity|primary_entity)$/.test(h)) out.name = raw;
    if (!out.dob && /^(dob|date_of_birth|birth_date|born)$/.test(h)) out.dob = raw;
    if (!out.address && /^(address|address_line_1|street|location|residence|home_address)$/.test(h)) out.address = raw;
    if (!out.postcode && /^(postcode|postal_code|zip|zip_code)$/.test(h)) out.postcode = raw;
    if (!out.lat && /^(lat|latitude|y)$/.test(h)) out.lat = raw;
    if (!out.lon && /^(lon|lng|longitude|x)$/.test(h)) out.lon = raw;
    if (!out.entityType && /^(entity_type|type|i2_type|category)$/.test(h)) out.entityType = raw;
    if (!out.target && /^(linked_to|linked_entity|associate|target|to|connection_to|related_to|link_to|company|organisation|organization|linked_company)$/.test(h)) out.target = raw;
    // Support both "Relationship" and shorthand "Link Type"/"Role" style columns.
    if (!out.relation && /^(relation|relationship|link|link_type|edge|association|role)$/.test(h)) out.relation = raw;
    if (!out.notes && /^(notes|comment|description|intel|intelligence)$/.test(h)) out.notes = raw;
  }
  return out;
}

function parseDobFromText(text) {
  const str = String(text || "");
  const m = str.match(/\b(?:dob|d\.o\.b\.?|born)\s*[:\-]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\b/i);
  if (!m) return null;
  return m[1].replace(/-/g, "/");
}

function extractNameFromMixedText(text) {
  const str = String(text || "").trim();
  if (!str) return "";
  const clean = str
    .replace(/\b(?:dob|d\.o\.b\.?|born)\b.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return clean || str;
}

function inferEntityKind(row, cols) {
  const typeText = String(row[cols.entityType] || "").toLowerCase();
  if (typeText.includes("person") || typeText.includes("subject")) return "person";
  if (typeText.includes("organisation") || typeText.includes("organization") || typeText.includes("company")) return "organisation";
  if (typeText.includes("address") || typeText.includes("location")) return "location";
  if (typeText.includes("phone") || typeText.includes("msisdn") || typeText.includes("imei") || typeText.includes("imsi") || typeText.includes("email")) return "communication";

  const hasDob = !!(row[cols.dob] || parseDobFromText(row[cols.name]));
  const hasAddress = !!(row[cols.address] || row[cols.postcode]);
  if (hasDob) return "person";
  if (hasAddress) return "location";
  return "generic";
}

function pickIconForImport(kind, label) {
  let categoryKey = "people";
  if (kind === "location") categoryKey = "buildings";
  if (kind === "organisation") categoryKey = "financial";
  if (kind === "communication") categoryKey = "communication";
  if (kind === "generic") {
    const suggestedAny = suggestIcon(label || "");
    if (suggestedAny?.category && ICON_CATEGORIES[suggestedAny.category]) {
      categoryKey = suggestedAny.category;
    } else {
      categoryKey = "people";
    }
  }
  const cat = ICON_CATEGORIES[categoryKey];
  const suggested = suggestIcon(label || "", categoryKey);
  const picked = suggested || cat.icons[0];
  return {
    ...picked,
    categoryColor: cat.color,
    categoryName: cat.name
  };
}

async function readSpreadsheetRows(file) {
  const buf = await file.arrayBuffer();
  if (!window.XLSX) throw new Error("XLSX parser library not loaded");

  const wb = XLSX.read(buf, { type: "array", cellDates: true, raw: false });
  if (!wb.SheetNames.length) return [];
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

function detectDelimiter(text) {
  const sample = String(text || "").split(/\r?\n/).slice(0, 2).join("\n");
  const counts = [
    { d: "\t", c: (sample.match(/\t/g) || []).length },
    { d: ",", c: (sample.match(/,/g) || []).length },
    { d: ";", c: (sample.match(/;/g) || []).length },
    { d: "|", c: (sample.match(/\|/g) || []).length }
  ].sort((a, b) => b.c - a.c);
  return counts[0]?.c > 0 ? counts[0].d : ",";
}

function parseDelimitedRows(text, delimiter = ",") {
  const lines = String(text || "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const parseLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === delimiter && !inQuotes) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((v) => String(v || "").trim());
  };
  const headers = parseLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

async function readDelimitedRows(file) {
  const txt = await file.text();
  return parseDelimitedRows(txt, detectDelimiter(txt));
}

function propertiesPreviewHtml(props = {}) {
  const entries = Object.entries(props).filter(([, v]) => v != null && String(v).trim() !== "").slice(0, 6);
  if (!entries.length) return '<span class="popup-label">Imported overlay feature</span>';
  return entries.map(([k, v]) => `<span class="popup-label">${escapeHtml(k)}</span> ${escapeHtml(String(v))}`).join("<br>");
}

async function importGeoJsonFile(file) {
  const summaryEl = document.getElementById("entity-import-summary");
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw new Error("Invalid JSON/GeoJSON file");
  }
  if (!parsed || parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("Expected GeoJSON FeatureCollection");
  }
  const layer = L.geoJSON(parsed, {
    style: () => ({ color: "#38bdf8", weight: 2, opacity: 0.8, fillOpacity: 0.08 }),
    pointToLayer: (f, ll) => L.circleMarker(ll, { radius: 5, color: "#22d3ee", fillColor: "#22d3ee", fillOpacity: 0.9, weight: 1.5 }),
    onEachFeature: (f, l) => {
      l.bindPopup(propertiesPreviewHtml(f.properties || {}));
    }
  }).addTo(entitiesOverlayLayer);
  window._importedOverlayLayers.push(layer);
  try {
    const b = layer.getBounds?.();
    if (b && b.isValid && b.isValid()) map.fitBounds(b, { padding: [24, 24], maxZoom: 13 });
  } catch (_) {}
  if (summaryEl) summaryEl.textContent = `Imported GeoJSON overlay: ${parsed.features.length} features from ${file.name}.`;
  setStatus(`Imported overlay ${file.name}`);
}

async function importJsonRowsFile(file) {
  const text = await file.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw new Error("Invalid JSON file");
  }
  if (parsed?.type === "FeatureCollection") {
    await importGeoJsonFile(file);
    return;
  }
  const rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.rows) ? parsed.rows : null);
  if (!rows) throw new Error("JSON must be an array of row objects or GeoJSON FeatureCollection");
  await importEntitiesFromRows(rows);
}

function getEntityById(entityId) {
  return window._mapEntities.find((e) => e.id === entityId) || null;
}

async function triggerGoogleEnrichmentForEntity(entityId, includeEnvironment = true) {
  if (!entityId || !window.GoogleIntelligenceService) return false;
  if (typeof window.GoogleIntelligenceService.enrichEntityInStore !== "function") return false;
  if (typeof window.GoogleIntelligenceService.isConfigured === "function" && !window.GoogleIntelligenceService.isConfigured()) return false;
  try {
    const res = await window.GoogleIntelligenceService.enrichEntityInStore(entityId, { includeEnvironment: !!includeEnvironment });
    if (!res?.ok) return false;
    const entity = getEntityById(entityId);
    if (entity?.marker) {
      entity.marker.setPopupContent(buildEntityPopup(entityId, entity));
      bindEntityHoverTooltip(entity.marker, entity);
    }
    if (window.CRDashboard) window.CRDashboard.logActivity("Google enrichment complete", entity?.label || entityId, "intel");
    return true;
  } catch (err) {
    console.warn("Google enrichment failed:", err);
    return false;
  }
}

function getNetworkPlacementLatLng(index) {
  const center = map.getCenter();
  const angle = index * 0.62;
  const radius = 0.03 + (index % 7) * 0.01;
  const lat = center.lat + Math.sin(angle) * radius;
  const lng = center.lng + Math.cos(angle) * radius;
  return [lat, lng];
}

async function importEntitiesFromRows(rows) {
  const summaryEl = document.getElementById("entity-import-summary");
  if (!Array.isArray(rows) || rows.length === 0) {
    if (summaryEl) summaryEl.textContent = "No rows found in file.";
    return;
  }

  const headers = Object.keys(rows[0] || {});
  const cols = detectImportColumns(headers);

  const nameToEntityId = new Map();
  let plotted = 0;
  let skipped = 0;
  let linked = 0;
  let networkPlaced = 0;
  let geoPlaced = 0;
  let networkIndex = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const sourceName = row[cols.name] || row.Name || row.name || "";
    const dobDetected = row[cols.dob] || parseDobFromText(sourceName);
    const label = extractNameFromMixedText(sourceName) || `Entity ${i + 1}`;
    const address = String(row[cols.address] || "").trim();
    const postcode = String(row[cols.postcode] || "").trim();
    const noteRaw = String(row[cols.notes] || "").trim();
    const entityKind = inferEntityKind(row, cols);
    let usedNetworkPlacement = false;

    let lat = parseFloat(String(row[cols.lat] || "").trim());
    let lon = parseFloat(String(row[cols.lon] || "").trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      lat = NaN;
      lon = NaN;
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      if (postcode) {
        const geo = await geocodePostcode(postcode);
        if (geo) {
          lat = geo.lat;
          lon = geo.lon;
        }
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const synthetic = getNetworkPlacementLatLng(networkIndex++);
      lat = synthetic[0];
      lon = synthetic[1];
      networkPlaced++;
      usedNetworkPlacement = true;
    } else {
      geoPlaced++;
    }

    const notes = [
      dobDetected ? `DOB: ${dobDetected}` : "",
      noteRaw,
      postcode ? `Postcode: ${postcode}` : "",
      usedNetworkPlacement ? "Placed by network layout (no geocode fields)" : ""
    ].filter(Boolean).join(" | ");

    const iconData = pickIconForImport(entityKind, label);
    const entityId = placeEntity([lat, lon], iconData, label, address || postcode, notes);
    window._importedEntityIds.add(entityId);
    nameToEntityId.set(label.toLowerCase(), entityId);
    plotted++;
  }

  // Second pass for inferred relationship links
  for (const row of rows) {
    const srcLabel = extractNameFromMixedText(row[cols.name] || row.Name || row.name || "").toLowerCase();
    const tgtLabel = String(row[cols.target] || "").trim().toLowerCase();
    if (!srcLabel || !tgtLabel) continue;

    const srcId = nameToEntityId.get(srcLabel);
    const tgtId = nameToEntityId.get(tgtLabel);
    if (!srcId || !tgtId || srcId === tgtId) continue;

    const srcEntity = getEntityById(srcId);
    const tgtEntity = getEntityById(tgtId);
    if (!srcEntity || !tgtEntity) continue;

    const relation = String(row[cols.relation] || row.relationship || row.Relationship || "Associate").trim();
    const connectionId = addConnection(
      srcEntity.latLng,
      tgtEntity.latLng,
      relation,
      "manual",
      {
        fromId: srcId,
        toId: tgtId,
        fromLabel: srcEntity.label,
        toLabel: tgtEntity.label,
        imported: true
      }
    );
    window._importedConnectionIds.add(connectionId);
    linked++;
  }

  if (summaryEl) {
    const mappedCols = Object.entries(cols).filter(([, v]) => !!v).map(([k, v]) => `${k}:${v}`).join(", ");
    summaryEl.textContent =
      `Imported ${plotted} entities (${geoPlaced} geospatial, ${networkPlaced} network-layout), skipped ${skipped}, inferred ${linked} links. ` +
      `Detected columns: ${mappedCols || "none"}.`;
  }
  setStatus(`Imported ${plotted} entities from spreadsheet`);
}

function clearImportedEntities() {
  for (const connId of Array.from(window._importedConnectionIds)) {
    removeConnection(connId);
  }
  window._importedConnectionIds.clear();

  for (const entityId of Array.from(window._importedEntityIds)) {
    removeEntity(entityId);
  }
  window._importedEntityIds.clear();
  for (const layer of window._importedOverlayLayers || []) {
    try { entitiesOverlayLayer.removeLayer(layer); } catch (_) {}
  }
  window._importedOverlayLayers = [];

  const summaryEl = document.getElementById("entity-import-summary");
  if (summaryEl) summaryEl.textContent = "Imported entities/overlays cleared.";
  setStatus("Imported entities removed");
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Load overlay data Ã¢â€â‚¬Ã¢â€â‚¬

// Police force boundaries
const OVERLAY_STATE_LAYER_MAP = {
  areasLoaded: ["areas"],
  airportsLoaded: ["airports_uk", "airports_global"],
  seaportsLoaded: ["seaports"],
  serviceStationsLoaded: ["service_stations"],
  undergroundLoaded: ["underground"],
  nationalRailLoaded: ["national_rail"],
  cellTowersLoaded: ["cellTowers"],
  shipsLoaded: ["ships"],
  crimeLoaded: ["crime"]
};

const __OVERLAY_LOAD_STATE = {
  areasLoaded: false,
  areasLoading: null,
  airportsLoaded: false,
  airportsLoading: null,
  seaportsLoaded: false,
  seaportsLoading: null,
  serviceStationsLoaded: false,
  serviceStationsLoading: null,
  undergroundLoaded: false,
  undergroundLoading: null,
  nationalRailLoaded: false,
  nationalRailLoading: null,
  cellTowersLoaded: false,
  cellTowersLoading: null,
  shipsLoaded: false,
  shipsLoading: null,
  crimeLoaded: false,
  crimeLoading: null
};

const OVERLAY_LOAD_STATE = new Proxy(__OVERLAY_LOAD_STATE, {
  set(target, prop, value) {
    target[prop] = value;
    if (value && OVERLAY_STATE_LAYER_MAP[prop]) {
      const ids = Array.isArray(OVERLAY_STATE_LAYER_MAP[prop])
        ? OVERLAY_STATE_LAYER_MAP[prop]
        : [OVERLAY_STATE_LAYER_MAP[prop]];
      ids.forEach((id) => markLayerDatasetWarm(id));
    }
    if (String(prop || "").endsWith("Loaded")) {
      updateLayerSummaryCards();
    }
    return true;
  },
  get(target, prop) {
    return target[prop];
  }
});

// â”€â”€ Ship vessel type classification â”€â”€
function _classifyVesselType(ship) {
  const t = String(ship.shipType || ship.type || "").toLowerCase();
  const name = String(ship.name || ship.shipName || "").toLowerCase();
  if (t.includes("cargo") || t.includes("bulk") || t.includes("container")) return "ship-cargo";
  if (t.includes("tanker") || t.includes("oil") || t.includes("chemical")) return "ship-tanker";
  if (t.includes("passenger") || t.includes("cruise") || t.includes("ferry")) return "ship-passenger";
  if (t.includes("fish") || t.includes("trawl")) return "ship-fishing";
  if (t.includes("tug") || t.includes("pilot") || t.includes("dredg") || t.includes("military") || t.includes("naval") || t.includes("patrol")) return "ship-special";
  if (t.includes("sail") || t.includes("yacht") || t.includes("pleasure")) return "ship-pleasure";
  if (name.includes("tanker")) return "ship-tanker";
  if (name.includes("ferry")) return "ship-passenger";
  return "ship-other";
}

const SHIP_CLASS_LABELS = {
  "ship-cargo": "Cargo",
  "ship-tanker": "Tanker",
  "ship-passenger": "Passenger",
  "ship-fishing": "Fishing",
  "ship-special": "Special",
  "ship-pleasure": "Pleasure",
  "ship-other": "General"
};

let AIS_SANCTION_HIGHLIGHT_ENABLED = false;
let AIS_SANCTION_INDEX_PROMISE = null;
let AIS_SANCTION_INDEX = null;
let AIS_SANCTION_MATCH_SCOPE = "global";
let AIS_SANCTION_LAST_MATCH_COUNT = 0;
let AIS_VESSEL_META_INDEX_PROMISE = null;
let AIS_VESSEL_META_INDEX = null;

function _normalizeShipNumber(value) {
  return String(value || "").replace(/^IMO/i, "").replace(/\D/g, "");
}

function _normalizeShipName(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function _parseCsvRowLite(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => String(v || "").trim());
}

async function _ensureSanctionedVesselIndexLoaded() {
  if (AIS_SANCTION_INDEX) return AIS_SANCTION_INDEX;
  if (AIS_SANCTION_INDEX_PROMISE) return AIS_SANCTION_INDEX_PROMISE;
  AIS_SANCTION_INDEX_PROMISE = fetch("/data/watchlists/maritime.csv")
    .then((r) => {
      if (!r.ok) throw new Error("maritime.csv unavailable");
      return r.text();
    })
    .then((text) => {
      const lines = String(text || "").split(/\r?\n/).filter((x) => String(x || "").trim());
      if (!lines.length) return { byMmsi: new Map(), byImo: new Map(), byName: new Map() };
      const headers = _parseCsvRowLite(lines[0]).map((h) => String(h || "").toLowerCase());
      const byMmsi = new Map();
      const byImo = new Map();
      const byName = new Map();
      for (let i = 1; i < lines.length; i++) {
        const cols = _parseCsvRowLite(lines[i]);
        if (!cols.length) continue;
        const row = {};
        headers.forEach((h, idx) => { row[h] = String(cols[idx] || "").trim(); });
        const rec = {
          id: String(row.id || ""),
          caption: String(row.caption || row.name || ""),
          mmsi: String(row.mmsi || ""),
          imo: String(row.imo || "").replace(/^IMO/i, ""),
          risk: String(row.risk || ""),
          flag: String(row.flag || ""),
          countries: String(row.countries || ""),
          datasets: String(row.datasets || ""),
          url: String(row.url || "")
        };
        const mmsiKey = _normalizeShipNumber(rec.mmsi);
        const imoKey = _normalizeShipNumber(rec.imo);
        const nameKey = _normalizeShipName(rec.caption);
        if (mmsiKey && !byMmsi.has(mmsiKey)) byMmsi.set(mmsiKey, rec);
        if (imoKey && !byImo.has(imoKey)) byImo.set(imoKey, rec);
        if (nameKey && !byName.has(nameKey)) byName.set(nameKey, rec);
      }
      return { byMmsi, byImo, byName };
    })
    .catch(() => ({ byMmsi: new Map(), byImo: new Map(), byName: new Map() }))
    .then((idx) => {
      AIS_SANCTION_INDEX = idx;
      return idx;
    })
    .finally(() => {
      AIS_SANCTION_INDEX_PROMISE = null;
    });
  return AIS_SANCTION_INDEX_PROMISE;
}

function _findSanctionMatchForShip(ship) {
  const idx = AIS_SANCTION_INDEX;
  if (!idx) return null;
  const scope = AIS_SANCTION_MATCH_SCOPE;
  const allowRecord = (rec) => {
    if (!rec) return false;
    if (scope !== "uk") return true;
    const countries = String(rec.countries || "").toLowerCase();
    const datasets = String(rec.datasets || "").toLowerCase();
    return (
      /(^|[;, ]+)(uk|gb|gbr)([;, ]+|$)/.test(countries) ||
      /(gb_|_gb|uk_|_uk|fcdo|nca|coastguard|uk_sanctions|gb_fcdo_sanctions)/.test(datasets)
    );
  };
  const mmsiKey = _normalizeShipNumber(ship?.mmsi);
  const imoKey = _normalizeShipNumber(ship?.imo);
  const nameKey = _normalizeShipName(ship?.name || ship?.shipName);
  if (mmsiKey && idx.byMmsi.has(mmsiKey)) {
    const rec = idx.byMmsi.get(mmsiKey);
    if (allowRecord(rec)) return rec;
  }
  if (imoKey && idx.byImo.has(imoKey)) {
    const rec = idx.byImo.get(imoKey);
    if (allowRecord(rec)) return rec;
  }
  if (nameKey && idx.byName.has(nameKey)) {
    const rec = idx.byName.get(nameKey);
    if (allowRecord(rec)) return rec;
  }
  return null;
}

function _makeShipIcon(heading, vesselClass, isSanctioned) {
  const shipSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2L6 12l1 6h10l1-6L12 2zm0 2.5L16 11H8l4-6.5zM7.5 18.5l-.3 1.5h9.6l-.3-1.5H7.5z"/></svg>';
  const sanctionClass = (AIS_SANCTION_HIGHLIGHT_ENABLED && isSanctioned) ? " ship-sanctioned" : "";
  const shipHtml =
    `<div class="ship-icon ${vesselClass}${sanctionClass}" style="--ship-icon-size:20px">` +
      `<span class="ship-inner" style="transform:rotate(${heading}deg)">` +
        `${shipSvg}` +
      `</span>` +
    `</div>`;
  return L.divIcon({
    className: "ship-marker",
    html: shipHtml,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -12]
  });
}

function _shipDisplayName(ship, sanction) {
  const direct = String(ship?.name || ship?.shipName || "").trim();
  if (direct) {
    const genericMatch = direct.match(/^vessel\s+(\d{6,10})$/i);
    if (genericMatch?.[1]) return `MMSI ${genericMatch[1]}`;
    return direct;
  }
  const sanctionName = String(sanction?.caption || "").trim();
  if (sanctionName) return sanctionName;
  const mmsi = String(ship?.mmsi || "").trim();
  return mmsi ? `MMSI ${mmsi}` : "Vessel";
}

function _shipFirstValue(ship, keys = []) {
  for (let i = 0; i < keys.length; i += 1) {
    const value = ship?.[keys[i]];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function _shipStatusText(ship) {
  const explicit = _shipFirstValue(ship, ["navStatus", "status", "navigationStatus"]);
  if (explicit) return explicit;
  const speed = Number(ship?.speed);
  if (!Number.isFinite(speed)) return "";
  if (speed >= 0.8) return "Under way";
  if (speed > 0.1) return "Maneuvering";
  return "Stationary";
}

function _shipHeadingCardinal(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const idx = Math.round((((n % 360) + 360) % 360) / 45) % 8;
  return dirs[idx] || "";
}

function _cleanShipText(value) {
  return String(value == null ? "" : value)
    .replace(/\uFFFD/g, "")
    .replace(/�/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function _ensureShipMetadataIndexLoaded() {
  if (AIS_VESSEL_META_INDEX) return AIS_VESSEL_META_INDEX;
  if (AIS_VESSEL_META_INDEX_PROMISE) return AIS_VESSEL_META_INDEX_PROMISE;
  AIS_VESSEL_META_INDEX_PROMISE = fetch("/data/live/ships_metadata.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((payload) => {
      const byMmsi = new Map();
      const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.items) ? payload.items : []);
      rows.forEach((row) => {
        if (!row || typeof row !== "object") return;
        const key = _normalizeShipNumber(row.mmsi);
        if (!key) return;
        if (!byMmsi.has(key)) byMmsi.set(key, row);
      });
      return { byMmsi };
    })
    .catch(() => ({ byMmsi: new Map() }))
    .then((idx) => {
      AIS_VESSEL_META_INDEX = idx;
      return idx;
    })
    .finally(() => {
      AIS_VESSEL_META_INDEX_PROMISE = null;
    });
  return AIS_VESSEL_META_INDEX_PROMISE;
}

function _mergeShipMetadata(ship, sanction) {
  const out = { ...(ship || {}) };
  const key = _normalizeShipNumber(ship?.mmsi);
  const meta = key ? AIS_VESSEL_META_INDEX?.byMmsi?.get(key) : null;
  const mergeIfMissing = (targetKey, source, sourceKeys) => {
    if (String(out?.[targetKey] || "").trim()) return;
    for (const sourceKey of sourceKeys) {
      const v = String(source?.[sourceKey] || "").trim();
      if (v) {
        out[targetKey] = v;
        return;
      }
    }
  };
  mergeIfMissing("name", meta, ["name", "shipName", "vesselName"]);
  mergeIfMissing("shipType", meta, ["shipType", "type", "vesselType"]);
  mergeIfMissing("callSign", meta, ["callSign", "callsign"]);
  mergeIfMissing("imo", meta, ["imo", "imoNumber"]);
  mergeIfMissing("flag", meta, ["flag", "flagState"]);
  mergeIfMissing("destination", meta, ["destination", "nextPort"]);
  mergeIfMissing("lastPort", meta, ["lastPort", "originPort"]);
  mergeIfMissing("built", meta, ["built", "builtYear", "yearBuilt"]);
  mergeIfMissing("deadweight", meta, ["deadweight", "dwt"]);
  mergeIfMissing("grossTonnage", meta, ["grossTonnage", "gt", "tonnage"]);
  mergeIfMissing("length", meta, ["length", "lengthM"]);
  mergeIfMissing("beam", meta, ["beam", "width", "beamM"]);

  if (!String(out.name || "").trim() && String(sanction?.caption || "").trim()) {
    out.name = String(sanction.caption).trim();
  }
  if (!String(out.imo || "").trim() && String(sanction?.imo || "").trim()) {
    out.imo = String(sanction.imo).trim();
  }
  if (!String(out.flag || "").trim() && String(sanction?.flag || "").trim()) {
    out.flag = String(sanction.flag).trim();
  }
  return out;
}

function _shipIsoToUtcText(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getUTCDate()).padStart(2, "0");
  const hh = String(parsed.getUTCHours()).padStart(2, "0");
  const min = String(parsed.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min} UTC`;
}

const MMSI_MID_COUNTRY_HINTS = {
  205: "Belgium", 209: "Cyprus", 210: "Cyprus", 211: "Germany", 212: "Cyprus",
  219: "Denmark", 220: "Denmark", 224: "Spain", 225: "Spain", 226: "France",
  227: "France", 228: "France", 229: "Malta", 230: "Finland", 231: "Faroe Islands",
  232: "United Kingdom", 233: "United Kingdom", 234: "United Kingdom", 235: "United Kingdom",
  236: "Gibraltar", 237: "Greece", 238: "Croatia", 239: "Greece", 240: "Greece",
  241: "Greece", 242: "Morocco", 244: "Netherlands", 245: "Netherlands", 246: "Netherlands",
  247: "Italy", 248: "Malta", 249: "Malta", 250: "Ireland", 251: "Iceland",
  252: "Liechtenstein", 253: "Luxembourg", 254: "Monaco", 255: "Portugal",
  256: "Malta", 257: "Norway", 258: "Norway", 259: "Norway", 261: "Poland",
  263: "Portugal", 265: "Sweden", 266: "Sweden", 267: "Slovakia", 268: "San Marino",
  269: "Switzerland", 271: "Turkey", 273: "Russia", 308: "Bahamas", 311: "Bahamas",
  312: "Belize", 314: "Barbados", 316: "Canada", 319: "Cayman Islands",
  338: "United States", 366: "United States", 367: "United States", 368: "United States", 369: "United States",
  370: "Panama", 371: "Panama", 372: "Panama", 373: "Panama", 374: "Panama",
  412: "China", 413: "China", 414: "China", 416: "Taiwan", 431: "Japan",
  440: "Korea", 441: "Korea", 470: "UAE", 477: "Hong Kong", 563: "Singapore",
  564: "Singapore", 636: "Liberia", 667: "Sierra Leone"
};

function _shipMmsiMidInfo(ship) {
  const mmsiDigits = _normalizeShipNumber(ship?.mmsi);
  if (!mmsiDigits || mmsiDigits.length < 3) return { mid: "", country: "" };
  const mid = Number(mmsiDigits.slice(0, 3));
  const country = MMSI_MID_COUNTRY_HINTS[mid] || "";
  return { mid: String(mid), country };
}

function _buildShipPopupHtml(ship, heading, sanction) {
  const merged = _mergeShipMetadata(ship, sanction);
  const vesselClass = _classifyVesselType(merged);
  const vesselClassLabel = SHIP_CLASS_LABELS[vesselClass] || "General";
  const vesselName = _shipDisplayName(merged, sanction);
  const vesselType = _shipFirstValue(merged, ["shipType", "type"]);
  const callSign = _shipFirstValue(merged, ["callSign", "callsign"]);
  const destination = _shipFirstValue(merged, ["destination", "dest", "nextPort"]);
  const eta = _shipFirstValue(merged, ["eta", "etaUtc", "etaIso"]);
  const lastPort = _shipFirstValue(merged, ["lastPort", "originPort", "fromPort"]);
  const atd = _shipFirstValue(merged, ["atd", "departureTime", "lastDeparture"]);
  const lastSeenRaw = _shipFirstValue(merged, ["lastSeen", "timestamp", "receivedAt", "_ingestedAt"]);
  const lastSeen = _shipIsoToUtcText(lastSeenRaw) || "";
  const speed = Number(merged?.speed);
  const speedText = Number.isFinite(speed) ? `${speed.toFixed(1)} knots` : "";
  const course = _shipFirstValue(merged, ["course", "cog"]) || (Number.isFinite(Number(merged?.heading)) ? String(Number(merged.heading).toFixed(1)) : "");
  const courseCardinal = _shipHeadingCardinal(course || merged?.heading);
  const draught = _shipFirstValue(merged, ["draught", "draft", "maxDraught"]);
  const imo = _shipFirstValue(merged, ["imo"]) || _shipFirstValue(sanction, ["imo"]);
  const gt = _shipFirstValue(merged, ["grossTonnage", "gt", "tonnage"]);
  const built = _shipFirstValue(merged, ["built", "builtYear", "yearBuilt"]);
  const dwt = _shipFirstValue(merged, ["deadweight", "dwt"]);
  const length = _shipFirstValue(merged, ["length", "lengthM"]);
  const beam = _shipFirstValue(merged, ["beam", "width", "beamM"]);
  const size = length && beam ? `${length} / ${beam} m` : _shipFirstValue(merged, ["size", "dimensions"]);
  const lat = Number(merged?.lat);
  const lon = Number(merged?.lon);
  const latLonText = Number.isFinite(lat) && Number.isFinite(lon) ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "";
  const statusText = _shipStatusText(merged);
  const etaText = eta ? _shipIsoToUtcText(eta) : "";
  const atdText = atd ? _shipIsoToUtcText(atd) : "";
  const flagText = _shipFirstValue(merged, ["flag"]) || _shipFirstValue(sanction, ["flag"]);
  const sanctionCountries = _shipFirstValue(sanction, ["countries"]);
  const mmsiInfo = _shipMmsiMidInfo(merged);
  const inferredCountry = sanctionCountries || mmsiInfo.country;
  const mmsiText = String(merged.mmsi || "").trim();

  const rows = [];
  const add = (label, value, suffix = "") => {
    const text = _cleanShipText(value);
    if (!text) return;
    const cleanSuffix = _cleanShipText(suffix);
    rows.push(`<span class="popup-label">${escapeHtml(label)}</span> ${escapeHtml(text)}${cleanSuffix}`);
  };

  add("Destination", destination);
  add("ETA", etaText);
  add("Class", vesselClassLabel);
  add("Speed", speedText);
  add("Course", course, course ? (courseCardinal ? `° (${courseCardinal})` : "°") : "");
  add("Draught", draught);
  add("Status", statusText);
  add("Last Report", lastSeen);
  add("Last Port", lastPort);
  add("ATD", atdText);
  add("Type", vesselType);
  add("Gross Tonnage", gt);
  add("Built", built);
  add("IMO", imo);
  add("Deadweight", dwt);
  add("Size", size);
  add("MMSI", mmsiText);
  add("MID", mmsiInfo.mid);
  add("Flag", flagText);
  add("Country", inferredCountry);
  add("Call Sign", callSign);
  add("Position", latLonText);

  const hasRichTelemetry = !!(destination || eta || lastPort || atd || callSign || vesselType || imo || gt || dwt || built || size || draught);
  const dataNote = !hasRichTelemetry
    ? '<span class="popup-label">Feed Note</span> Live AIS feed currently provides position/speed/heading for this vessel.'
    : "";

  return (
    `<strong>${escapeHtml(String(vesselName))}</strong><br>` +
    (rows.length ? rows.join("<br>") : '<span class="popup-label">No vessel metadata</span>') +
    (dataNote ? `<br>${dataNote}` : "") +
    (sanction ? `<br><span class="popup-label">Sanctions</span> Match` : "") +
    (sanction?.risk ? `<br><span class="popup-label">Risk</span> ${escapeHtml(String(sanction.risk))}` : "") +
    (sanction?.datasets ? `<br><span class="popup-label">Dataset</span> ${escapeHtml(String(sanction.datasets))}` : "") +
    (sanction?.url ? `<br><span class="popup-label">Source</span> <a href="${escapeHtml(String(sanction.url))}" target="_blank" rel="noopener noreferrer">Open</a>` : "")
  );
}
window.setAisSanctionHighlight = async function (enabled, options = null) {
  AIS_SANCTION_HIGHLIGHT_ENABLED = !!enabled;
  const requestedScope = String(options?.scope || AIS_SANCTION_MATCH_SCOPE || "global").toLowerCase();
  AIS_SANCTION_MATCH_SCOPE = requestedScope === "uk" ? "uk" : "global";
  await _ensureSanctionedVesselIndexLoaded();
  if (typeof ensureShipsLoaded === "function") {
    await ensureShipsLoaded();
  }
  if (!layers?.ships || typeof layers.ships.eachLayer !== "function") {
    AIS_SANCTION_LAST_MATCH_COUNT = 0;
    return { enabled: AIS_SANCTION_HIGHLIGHT_ENABLED, scope: AIS_SANCTION_MATCH_SCOPE, matched: 0, scanned: 0 };
  }
  let matched = 0;
  let scanned = 0;
  layers.ships.eachLayer((marker) => {
    const ship = marker?._shipData;
    if (!ship) return;
    scanned += 1;
    const heading = Number.isFinite(Number(ship.heading)) ? Number(ship.heading) : 0;
    const vesselClass = _classifyVesselType(ship);
    const sanction = marker._sanctionMatch || _findSanctionMatchForShip(ship);
    marker._sanctionMatch = sanction || null;
    if (sanction) matched += 1;
    marker.setIcon(_makeShipIcon(heading, vesselClass, !!sanction));
  });
  AIS_SANCTION_LAST_MATCH_COUNT = matched;
  return { enabled: AIS_SANCTION_HIGHLIGHT_ENABLED, scope: AIS_SANCTION_MATCH_SCOPE, matched, scanned };
};

window.getAisSanctionHighlightState = function () {
  return {
    enabled: AIS_SANCTION_HIGHLIGHT_ENABLED,
    scope: AIS_SANCTION_MATCH_SCOPE,
    matched: AIS_SANCTION_LAST_MATCH_COUNT
  };
};

// Ships (AISStream Live) loader
async function ensureShipsLoaded() {
  if (OVERLAY_LOAD_STATE.shipsLoaded) return true;
  if (OVERLAY_LOAD_STATE.shipsLoading) return OVERLAY_LOAD_STATE.shipsLoading;

  await Promise.all([
    _ensureSanctionedVesselIndexLoaded(),
    _ensureShipMetadataIndexLoaded()
  ]);

  OVERLAY_LOAD_STATE.shipsLoading = fetch("/data/live/ships_live.json")
    .then((r) => {
      if (!r.ok) throw new Error("Ships file not found");
      return r.json();
    })
    .then((ships) => {
      layers.ships.clearLayers();
      let count = 0;
      const ingestedAt = new Date().toISOString();
      (Array.isArray(ships) ? ships : []).forEach((ship) => {
        const lat = Number(ship?.lat);
        const lon = Number(ship?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        ship._ingestedAt = ship._ingestedAt || ingestedAt;

        const heading = Number.isFinite(Number(ship?.heading)) ? Number(ship.heading) : 0;
        const vesselClass = _classifyVesselType(ship);
        const sanction = _findSanctionMatchForShip(ship);
        const shipIcon = _makeShipIcon(heading, vesselClass, !!sanction);
        const marker = L.marker([lat, lon], { icon: shipIcon });
        marker._shipData = ship;
        marker._sanctionMatch = sanction || null;
        marker.bindPopup(_buildShipPopupHtml(ship, heading, sanction));
        layers.ships.addLayer(marker);
        count += 1;
      });

      console.log(`Ships loaded: ${count}`);
      OVERLAY_LOAD_STATE.shipsLoaded = true;
      AIS_SANCTION_LAST_MATCH_COUNT = 0;
      return true;
    })
    .catch((e) => {
      console.warn("Ships load failed:", e);
      setStatus?.("Ship data unavailable");
      return false;
    })
    .finally(() => {
      OVERLAY_LOAD_STATE.shipsLoading = null;
    });

  return OVERLAY_LOAD_STATE.shipsLoading;
}
window.ensureShipsLoaded = ensureShipsLoaded;



// Ã¢â€â‚¬Ã¢â€â‚¬ Cell Tower Overlay: Complete Implementation Ã¢â€â‚¬Ã¢â€â‚¬

// Ensure the layer exists (only creates once)
if (!layers.cellTowers) {

  layers.cellTowers = L.markerClusterGroup({

    iconCreateFunction: createEntityClusterIcon,

    showCoverageOnHover: false,
    maxClusterRadius: 50,
    spiderfyOnMaxZoom: true

  });

}


// Register with layer control if not already present
if (typeof overlayMaps !== "undefined" && !overlayMaps["Cell Towers"]) {

  overlayMaps["Cell Towers"] = layers.cellTowers;

}


// Lazy loader function
async function ensureCellTowersLoaded() {

  if (OVERLAY_LOAD_STATE.cellTowersLoaded) return true;

  if (OVERLAY_LOAD_STATE.cellTowersLoading) {
    return OVERLAY_LOAD_STATE.cellTowersLoading;
  }

  OVERLAY_LOAD_STATE.cellTowersLoading = fetch("data/infastructure/cell_towers_uk.geojson")

    .then((response) => {

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return response.json();

    })

    .then((geojson) => {

      if (!geojson || !Array.isArray(geojson.features)) {
        throw new Error("Invalid GeoJSON");
      }

      let count = 0;

      geojson.features.forEach((feature) => {

        try {

          const coords = feature?.geometry?.coordinates;

          if (!coords || coords.length < 2) return;

          const lon = coords[0];
          const lat = coords[1];

          if (
            typeof lat !== "number" ||
            typeof lon !== "number" ||
            lat === 0 ||
            lon === 0
          ) return;

          const props = feature.properties || {};

          const radio = String(props.radio || "Unknown");
          const mcc = String(props.mcc || "");
          const mnc = String(props.mnc || "");
          const lac = String(props.lac || "");
          const cellid = String(props.cellid || "");

          // Colour by radio type
          let color = "#22c55e";

          switch (radio) {

            case "LTE":
              color = "#3b82f6";
              break;

            case "GSM":
              color = "#f59e0b";
              break;

            case "UMTS":
              color = "#a855f7";
              break;

            case "NR":
            case "5G":
              color = "#ef4444";
              break;

          }

          const marker = L.circleMarker([lat, lon], {

            radius: 3,
            color: color,
            weight: 1,
            fillColor: color,
            fillOpacity: 0.7

          });

          marker.bindPopup(

            `<strong>Cell Tower</strong><br>` +
            `<span class="popup-label">Radio</span> ${escapeHtml(radio)}<br>` +
            (mcc ? `<span class="popup-label">MCC</span> ${escapeHtml(mcc)}<br>` : "") +
            (mnc ? `<span class="popup-label">MNC</span> ${escapeHtml(mnc)}<br>` : "") +
            (lac ? `<span class="popup-label">LAC</span> ${escapeHtml(lac)}<br>` : "") +
            (cellid ? `<span class="popup-label">Cell ID</span> ${escapeHtml(cellid)}` : "")

          );

          layers.cellTowers.addLayer(marker);

          count++;

        }
        catch (err) {

          // Ignore malformed records

        }

      });

      OVERLAY_LOAD_STATE.cellTowersLoaded = true;

      console.log(`Cell towers loaded: ${count}`);

      return true;

    })

    .catch((error) => {

      console.warn("Cell tower load failed:", error);

      if (typeof setStatus === "function") {
        setStatus("Cell tower data unavailable");
      }

      return false;

    })

    .finally(() => {

      OVERLAY_LOAD_STATE.cellTowersLoading = null;

    });

  return OVERLAY_LOAD_STATE.cellTowersLoading;

}

// Automatically load when overlay is enabled
map.on("overlayadd", function(e) {

  if (e.layer === layers.cellTowers) {
    ensureCellTowersLoaded();
  }

  if (e.layer === layers.ships) {
    ensureShipsLoaded();
  }

  if (e.layer === layers.crime) {
    ensureCrimeLoaded();
  }

});


function resolvePoliceForceName(props = {}) {
  if (!props || typeof props !== "object") return "Unknown Police Force";
  const directKeys = ["PFA22NM", "PFA23NM", "PFA21NM", "PFA20NM", "force_name", "FORCE_NAME", "name", "NAME"];
  for (const key of directKeys) {
    const v = props[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  const nmKey = Object.keys(props).find((k) => /(^|_)PFA\d{2}NM$/i.test(String(k)));
  if (nmKey && typeof props[nmKey] === "string" && props[nmKey].trim()) return props[nmKey].trim();
  return "Unknown Police Force";
}

function resolvePoliceForceCode(props = {}) {
  if (!props || typeof props !== "object") return "";
  const directKeys = ["PFA22CD", "PFA23CD", "PFA21CD", "PFA20CD", "force_code", "FORCE_CODE", "code", "CODE"];
  for (const key of directKeys) {
    const v = props[key];
    if ((typeof v === "string" || typeof v === "number") && String(v).trim()) return String(v).trim();
  }
  const cdKey = Object.keys(props).find((k) => /(^|_)PFA\d{2}CD$/i.test(String(k)));
  if (cdKey && props[cdKey] != null && String(props[cdKey]).trim()) return String(props[cdKey]).trim();
  return "";
}

async function ensurePoliceAreasLoaded() {
  if (OVERLAY_LOAD_STATE.areasLoaded) return true;
  if (OVERLAY_LOAD_STATE.areasLoading) return OVERLAY_LOAD_STATE.areasLoading;
  OVERLAY_LOAD_STATE.areasLoading = fetch("data/police_force_areas_wgs84.geojson")
    .then((r) => r.json())
    .then((data) => {
      L.geoJSON(data, {
        style: { color: "#818cf8", weight: 2, fillColor: "#818cf8", fillOpacity: 0.06, dashArray: "6 4" },
        onEachFeature: (f, l) => {
          const n = resolvePoliceForceName(f.properties || {});
          const code = resolvePoliceForceCode(f.properties || {});
          l.bindPopup(
            `<strong>${escapeHtml(n)}</strong><br>` +
            `<span class="popup-label">Police Force Area</span>` +
            (code ? `<br><span class="popup-label">Force Code</span> ${escapeHtml(code)}` : "")
          );
          l.on("click", () => {
            setActiveForce(n);
            showToast?.(`${n} selected`, "info");
          });
        }
      }).addTo(layers.areas);
      OVERLAY_LOAD_STATE.areasLoaded = true;
      return true;
    })
    .catch((e) => {
      console.warn("Police areas:", e);
      setStatus("Police force area data unavailable");
      return false;
    })
    .finally(() => {
      OVERLAY_LOAD_STATE.areasLoading = null;
    });
  return OVERLAY_LOAD_STATE.areasLoading;
}

// Airports
const UK_COUNTRIES = ["ENGLAND","SCOTLAND","WALES","NORTHERN IRELAND","IRELAND","UK"];
const AIRPORT_LOGO_MAP_DEFAULT = { iata: {}, icao: {}, name_hints: [] };
let AIRPORT_LOGO_MAP = { ...AIRPORT_LOGO_MAP_DEFAULT };
const AIRPORT_LOGO_HINT_CACHE = [];
const AIRPORT_LOGO_ICON_CACHE = {};
const airportLogoMapPromise = fetch("data/airport_logo_map.json")
  .then((r) => (r.ok ? r.json() : null))
  .catch(() => null);

function setAirportLogoMap(rawMap) {
  const nextMap = rawMap && typeof rawMap === "object" ? rawMap : AIRPORT_LOGO_MAP_DEFAULT;
  AIRPORT_LOGO_MAP = {
    iata: nextMap.iata && typeof nextMap.iata === "object" ? nextMap.iata : {},
    icao: nextMap.icao && typeof nextMap.icao === "object" ? nextMap.icao : {},
    name_hints: Array.isArray(nextMap.name_hints) ? nextMap.name_hints : []
  };
  AIRPORT_LOGO_HINT_CACHE.length = 0;
  AIRPORT_LOGO_MAP.name_hints.forEach((hint) => {
    const pattern = String(hint?.pattern || "").trim();
    const logo = String(hint?.logo || "").trim();
    if (!pattern || !logo) return;
    try {
      AIRPORT_LOGO_HINT_CACHE.push({ re: new RegExp(pattern), logo });
    } catch (_) {
      // invalid pattern, skip
    }
  });
}

function getAirportLogoPathFromProps(props = {}) {
  const icao = String(props?.icao || "").toUpperCase();
  const iata = String(props?.iata || "").toUpperCase();
  const name = String(props?.name || "").toUpperCase();

  if (iata && AIRPORT_LOGO_MAP.iata[iata]) return AIRPORT_LOGO_MAP.iata[iata];
  if (icao && AIRPORT_LOGO_MAP.icao[icao]) return AIRPORT_LOGO_MAP.icao[icao];

  for (const hint of AIRPORT_LOGO_HINT_CACHE) {
    if (hint.re.test(name)) return hint.logo;
  }
  return "";
}

function getAirportLogoIcon(logoPath, isUK) {
  const key = `${logoPath}|${isUK ? "uk" : "global"}`;
  if (AIRPORT_LOGO_ICON_CACHE[key]) return AIRPORT_LOGO_ICON_CACHE[key];
  const size = isUK ? 32 : 24;
  const icon = L.icon({
    iconUrl: logoPath,
    iconSize: [size, size],
    iconAnchor: [Math.round(size / 2), Math.round(size / 2)],
    popupAnchor: [0, -Math.round(size / 2)],
    className: "airport-logo-icon"
  });
  AIRPORT_LOGO_ICON_CACHE[key] = icon;
  return icon;
}

window.AIRPORT_INDEX = {
  all: [],
  uk: [],
  byIcao: {},
  byIata: {}
};

function normalizeAirportSearchText(v) {
  return String(v || "").toLowerCase().trim();
}

function airportPopupHtml(airport) {
  const logoPath = String(airport?.logoPath || "");
  const logoBlock = logoPath
    ? (
        `<div class="airport-logo-popup-wrap">` +
          `<img class="airport-logo-popup" src="${escapeHtml(logoPath)}" alt="${escapeHtml(airport?.name || "Airport logo")}" loading="lazy">` +
        `</div>`
      )
    : "";
  return (
    `<div class="airport-intel-popup">` +
      logoBlock +
      `<strong>${escapeHtml(airport?.name || "Airport")}</strong><br>` +
      `<span class="popup-label">ICAO</span> ${escapeHtml(airport?.icao || "N/A")} | <span class="popup-label">IATA</span> ${escapeHtml(airport?.iata || "N/A")}<br>` +
      `<span class="popup-label">Country</span> ${escapeHtml(airport?.country || "Unknown")}<br>` +
      `<span class="popup-label">Intel</span> Loading nearby flights...` +
    `</div>`
  );
}

function scoreAirportMatch(airport, query) {
  if (!query) return 0;
  const q = normalizeAirportSearchText(query);
  const iata = normalizeAirportSearchText(airport?.iata);
  const icao = normalizeAirportSearchText(airport?.icao);
  const name = normalizeAirportSearchText(airport?.name);
  const city = normalizeAirportSearchText(airport?.city);
  const country = normalizeAirportSearchText(airport?.country);

  if (iata && iata === q) return 100;
  if (icao && icao === q) return 98;
  if (name && name === q) return 95;
  if (city && city === q) return 90;

  let score = 0;
  if (iata && iata.startsWith(q)) score = Math.max(score, 85);
  if (icao && icao.startsWith(q)) score = Math.max(score, 82);
  if (name && name.includes(q)) score = Math.max(score, 78);
  if (city && city.includes(q)) score = Math.max(score, 72);
  if (country && country.includes(q)) score = Math.max(score, 60);
  return score;
}

function searchAirports(query, limit = 10) {
  const q = normalizeAirportSearchText(query);
  if (!q) return [];
  const pool = Array.isArray(window.AIRPORT_INDEX?.all) ? window.AIRPORT_INDEX.all : [];
  return pool
    .map((airport) => ({ airport, score: scoreAirportMatch(airport, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit))
    .map((x) => x.airport);
}

function ensureAirportLayerVisible(airport) {
  if (!airport) return;
  const layerId = airport.isUK ? "airports_uk" : "airports_global";
  const cb = document.querySelector(`.layer-cb[data-layer="${layerId}"]`);
  if (cb && !cb.checked) cb.checked = true;
  const layer = layers[layerId];
  if (layer && !map.hasLayer(layer)) layer.addTo(map);
}

function focusAirportOnMap(airport) {
  if (!airport || !Number.isFinite(airport.lat) || !Number.isFinite(airport.lon)) return;
  ensureAirportLayerVisible(airport);
  map.flyTo([airport.lat, airport.lon], Math.max(map.getZoom(), 9), { duration: 0.6 });
  if (airport.markerRef && typeof airport.markerRef.openPopup === "function") {
    setTimeout(() => {
      try { airport.markerRef.openPopup(); } catch (_) {}
    }, 220);
  }
}

function renderAirportSearchResults(items) {
  const wrap = document.getElementById("airport-search-results");
  if (!wrap) return;
  if (!Array.isArray(items) || items.length === 0) {
    wrap.innerHTML = `<div class="nr-empty">No airports matched this query.</div>`;
    return;
  }
  wrap.innerHTML = items.map((airport, idx) => {
    const label = `${airport.name || "Airport"} (${airport.iata && airport.iata !== "N/A" ? airport.iata : (airport.icao || "N/A")})`;
    const meta = [airport.city, airport.country].filter(Boolean).join(", ");
    return (
      `<button class="airport-result-item" type="button" data-airport-result="${idx}">` +
        `<span class="airport-result-name">${escapeHtml(label)}</span>` +
        `<span class="airport-result-meta">${escapeHtml(meta || "No location metadata")}</span>` +
      `</button>`
    );
  }).join("");

  const nodes = wrap.querySelectorAll("[data-airport-result]");
  nodes.forEach((node) => {
    node.addEventListener("click", () => {
      const i = Number(node.getAttribute("data-airport-result"));
      if (!Number.isFinite(i) || !items[i]) return;
      focusAirportOnMap(items[i]);
    });
  });
}

async function ensureAirportsLoaded() {
  if (OVERLAY_LOAD_STATE.airportsLoaded) return true;
  if (OVERLAY_LOAD_STATE.airportsLoading) return OVERLAY_LOAD_STATE.airportsLoading;
  window.AIRPORT_INDEX.all = [];
  window.AIRPORT_INDEX.uk = [];
  window.AIRPORT_INDEX.byIcao = {};
  window.AIRPORT_INDEX.byIata = {};
  OVERLAY_LOAD_STATE.airportsLoading = Promise.all([
    fetch("data/airports.geojson").then((r) => r.json()),
    airportLogoMapPromise
  ]).then(([data, logoMap]) => {
    if (logoMap) setAirportLogoMap(logoMap);
    L.geoJSON(data, {
      pointToLayer: (f, ll) => {
        const isUK = UK_COUNTRIES.includes((f.properties?.country || "").toUpperCase());
        const logoPath = isUK ? getAirportLogoPathFromProps(f.properties || {}) : "";
        if (logoPath) {
          return L.marker(ll, { icon: getAirportLogoIcon(logoPath, isUK) });
        }
        return L.circleMarker(ll, {
          radius: isUK ? 5 : 3,
          color: isUK ? "#38bdf8" : "#0284c7",
          fillColor: isUK ? "#38bdf8" : "#0284c7",
          fillOpacity: isUK ? 0.9 : 0.5,
          weight: isUK ? 2 : 1
        });
      },
      onEachFeature: (f, l) => {
        const c = (f.properties?.country || "").toUpperCase();
        const isUK = UK_COUNTRIES.includes(c);
        const logoPath = isUK ? getAirportLogoPathFromProps(f.properties || {}) : "";
        const airport = {
          icao: String(f.properties?.icao || "").toUpperCase(),
          iata: String(f.properties?.iata || "").toUpperCase(),
          name: String(f.properties?.name || "Unnamed"),
          city: String(f.properties?.city || ""),
          country: c,
          lat: Number(f.geometry?.coordinates?.[1]),
          lon: Number(f.geometry?.coordinates?.[0]),
          isUK,
          logoPath: logoPath || "",
          markerRef: l
        };
        window.AIRPORT_INDEX.all.push(airport);
        if (isUK) window.AIRPORT_INDEX.uk.push(airport);
        if (airport.icao) window.AIRPORT_INDEX.byIcao[airport.icao] = airport;
        if (airport.iata && airport.iata !== "N/A") window.AIRPORT_INDEX.byIata[airport.iata] = airport;

        l._airportMeta = airport;
        l.bindPopup(airportPopupHtml(airport));
        l.on("popupopen", () => {
          if (typeof window.buildAirportIntelPopup === "function") {
            try {
              const html = window.buildAirportIntelPopup(l._airportMeta);
              if (html) l.setPopupContent(html);
            } catch (_) {
              // keep fallback popup
            }
          }
        });
        (isUK ? layers.airports_uk : layers.airports_global).addLayer(l);
      }
    });
    OVERLAY_LOAD_STATE.airportsLoaded = true;
    return true;
  }).catch((e) => {
    console.warn("Airports:", e);
    return false;
  }).finally(() => {
    OVERLAY_LOAD_STATE.airportsLoading = null;
  });
  return OVERLAY_LOAD_STATE.airportsLoading;
}

// Seaports
async function ensureSeaportsLoaded() {
  if (OVERLAY_LOAD_STATE.seaportsLoaded) return true;
  if (OVERLAY_LOAD_STATE.seaportsLoading) return OVERLAY_LOAD_STATE.seaportsLoading;
  OVERLAY_LOAD_STATE.seaportsLoading = fetch("data/sea_ports_simple.geojson")
    .then((r) => r.json())
    .then((data) => {
      L.geoJSON(data, {
        pointToLayer: (_, ll) => L.circleMarker(ll, {
          radius: 5, color: "#2dd4bf", fillColor: "#2dd4bf", fillOpacity: 0.85, weight: 1.5
        }),
        onEachFeature: (f, l) =>
          l.bindPopup(`<strong>${f.properties?.name || "Seaport"}</strong><br><span class="popup-label">Seaport</span>`)
      }).addTo(layers.seaports);
      OVERLAY_LOAD_STATE.seaportsLoaded = true;
      return true;
    })
    .catch((e) => {
      console.warn("Seaports:", e);
      return false;
    })
    .finally(() => {
      OVERLAY_LOAD_STATE.seaportsLoading = null;
    });
  return OVERLAY_LOAD_STATE.seaportsLoading;
}

function getServiceStationKind(feature = {}) {
  const props = feature?.properties || {};
  const amenity = String(props.amenity || "").toLowerCase();
  if (amenity === "fuel") return "fuel";
  if (amenity === "charging_station") return "charging";
  if (amenity === "car_repair" || amenity === "car_wash") return "vehicle";
  if (amenity === "truck_stop") return "truck";
  return "general";
}

const SERVICE_STATION_FILTERS = {
  fuel: true,
  charging: true,
  vehicle: true,
  truck: true,
  general: true
};
const SERVICE_STATION_MARKERS = []; // { marker, kind }

function serviceStationIcon(kind = "general") {
  const symbol = kind === "fuel" ? "F" :
    kind === "charging" ? "EV" :
    kind === "vehicle" ? "R" :
    kind === "truck" ? "T" : "S";
  return L.divIcon({
    className: `service-station-marker service-station-${kind}`,
    html: `<span>${symbol}</span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12]
  });
}

function buildServiceStationPopupHtml(feature = {}) {
  const props = feature?.properties || {};
  const name = String(props.name || "").trim() || "Service Point";
  const amenity = String(props.amenity || "unknown");
  const opening = String(props["opening_hours"] || "").trim();
  const city = String(props["addr:city"] || "").trim();
  const street = String(props["addr:street"] || "").trim();
  const address = [street, city].filter(Boolean).join(", ");
  return (
    `<strong>${escapeHtml(name)}</strong><br>` +
    `<span class="popup-label">Type</span> ${escapeHtml(amenity)}<br>` +
    (address ? `<span class="popup-label">Area</span> ${escapeHtml(address)}<br>` : "") +
    (opening ? `<span class="popup-label">Hours</span> ${escapeHtml(opening)}<br>` : "") +
    `<span class="popup-label">Source</span> OSM POI`
  );
}

function applyServiceStationFilters() {
  if (!SERVICE_STATION_MARKERS.length) return;
  let visible = 0;
  for (const row of SERVICE_STATION_MARKERS) {
    const marker = row?.marker;
    const kind = row?.kind || "general";
    if (!marker) continue;
    const enabled = !!SERVICE_STATION_FILTERS[kind];
    const onLayer = layers.service_stations.hasLayer(marker);
    if (enabled && !onLayer) layers.service_stations.addLayer(marker);
    if (!enabled && onLayer) layers.service_stations.removeLayer(marker);
    if (enabled) visible += 1;
  }
  if (map.hasLayer(layers.service_stations)) {
    setStatus(`Service stations visible: ${visible}/${SERVICE_STATION_MARKERS.length}`);
  }
}

function syncServiceStationFilterFromUI() {
  const ids = ["fuel", "charging", "vehicle", "truck", "general"];
  for (const kind of ids) {
    const el = document.getElementById(`ss-filter-${kind}`);
    if (el) SERVICE_STATION_FILTERS[kind] = !!el.checked;
  }
  applyServiceStationFilters();
}

function setServiceStationFiltersAll(enabled) {
  const ids = ["fuel", "charging", "vehicle", "truck", "general"];
  for (const kind of ids) {
    SERVICE_STATION_FILTERS[kind] = !!enabled;
    const el = document.getElementById(`ss-filter-${kind}`);
    if (el) el.checked = !!enabled;
  }
  applyServiceStationFilters();
}

async function ensureServiceStationsLoaded() {
  if (OVERLAY_LOAD_STATE.serviceStationsLoaded) return true;
  if (OVERLAY_LOAD_STATE.serviceStationsLoading) return OVERLAY_LOAD_STATE.serviceStationsLoading;

  OVERLAY_LOAD_STATE.serviceStationsLoading = fetch("data/geojson/service_stations.geojson")
    .then((r) => r.json())
    .then((data) => {
      const features = Array.isArray(data?.features) ? data.features : [];

      if (!features.length) {
        setStatus("No service station features found.");
        return false;
      }

      features.forEach((f) => {
        const coords = f?.geometry?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) return;
        const lon = Number(coords[0]);
        const lat = Number(coords[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const kind = getServiceStationKind(f);
        const marker = L.marker([lat, lon], { icon: serviceStationIcon(kind) });
        marker.bindPopup(buildServiceStationPopupHtml(f));
        layers.service_stations.addLayer(marker);
        SERVICE_STATION_MARKERS.push({ marker, kind });
      });
      OVERLAY_LOAD_STATE.serviceStationsLoaded = true;
      applyServiceStationFilters();
      setStatus(`Service stations loaded (${features.length}).`);
      return true;
    })
    .catch((e) => {
      console.warn("Service stations:", e);
      return false;
    })
    .finally(() => {
      OVERLAY_LOAD_STATE.serviceStationsLoading = null;
    });
  return OVERLAY_LOAD_STATE.serviceStationsLoading;
}

// OS-derived rail/major-road legacy module removed.\r\n\r\n// TfL (Transport for London) ALL stations - Underground, DLR, Overground, Tram, Rail

// Map line names to roundel logo files
function getTfLRoundelIcon(lines) {
  const lineToLogo = {
    "Bakerloo": "data/TFL/logos/Bakerloo_line_roundel.svg.png",
    "Central": "data/TFL/logos/Central_Line_roundel.svg.png",
    "Circle": "data/TFL/logos/Circle_Line_roundel.svg.png",
    "District": "data/TFL/logos/District_line_roundel.svg.png",
    "Hammersmith & City": "data/TFL/logos/H&c_line_roundel.svg.png",
    "Jubilee": "data/TFL/logos/Jubilee_line_roundel.svg.png",
    "Metropolitan": "data/TFL/logos/Metropolitan_line_roundel.svg.png",
    "Piccadilly": "data/TFL/logos/Piccadilly_line_roundel.svg.png",
    "Victoria": "data/TFL/logos/Victoria_line_roundel.svg.png",
    "Waterloo & City": "data/TFL/logos/W&c_line_roundel.svg.png",
    "Northern": "data/TFL/logos/Underground.svg.png",
    "DLR": "data/TFL/logos/Underground.svg.png",
    "Elizabeth": "data/TFL/logos/Underground.svg.png"
  };
  
  // Pick the first line that has a specific logo, otherwise use generic Underground
  let logoPath = "data/TFL/logos/Underground.svg.png";
  
  if (lines && lines.length > 0) {
    for (const line of lines) {
      if (lineToLogo[line]) {
        logoPath = lineToLogo[line];
        break;
      }
    }
  }
  
  return L.icon({
    iconUrl: logoPath,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10],
    className: 'tfl-roundel-icon'
  });
}

// Load station line information first
let stationLinesData = {};

// Map polyline colors from london-lines.json to line metadata
const TFL_COLOR_TO_META = {
  "#9364cc": { id: "elizabeth-line", name: "Elizabeth", color: "#753bbd" },
  "#3c8cff": { id: "victoria", name: "Victoria", color: "#00a3e0" },
  "#149600": { id: "district", name: "District", color: "#007a33" },
  "#64500a": { id: "bakerloo", name: "Bakerloo", color: "#a45a2a" },
  "#8c505a": { id: "metropolitan", name: "Metropolitan", color: "#840b55" },
  "#ff64a0": { id: "hammersmith-city", name: "Hammersmith & City", color: "#e89cae" },
  "#ffff00": { id: "circle", name: "Circle", color: "#ffcd00" },
  "#ff0000": { id: "central", name: "Central", color: "#da291c" },
  "#0000c8": { id: "piccadilly", name: "Piccadilly", color: "#10069f" },
  "#808080": { id: "jubilee", name: "Jubilee", color: "#7c878e" },
  "#000000": { id: "northern", name: "Northern", color: "#000000" },
  "#00ffa0": { id: "waterloo-city", name: "Waterloo & City", color: "#6eceb2" },
  "#ffbe28": { id: "overground", name: "Overground", color: "#e87722" }
};

const TFL_STATUS_TONE = {
  good: "#22c55e",
  warning: "#f59e0b",
  bad: "#ef4444",
  neutral: "#94a3b8"
};

window._tflRouteRegistry = {};
window._selectedTflLineId = null;
window._lastTflStatuses = [];

window.updateSelectedTflLineInfo = function updateSelectedTflLineInfo() {
  const el = document.getElementById("tfl-selected-line");
  if (!el) return;
  const selectedId = window._selectedTflLineId;
  if (!selectedId) {
    el.textContent = "Selected: None";
    return;
  }

  const meta = window._tflRouteRegistry[selectedId];
  const status = (window._lastTflStatuses || []).find(
    (line) => String(line.id || "").toLowerCase() === selectedId
  );
  const label = status?.lineStatuses?.[0]?.statusSeverityDescription || "Status unknown";
  const name = meta?.name || selectedId;
  el.textContent = `Selected: ${name} (${label})`;
};

function getStatusToneFromSeverity(severity) {
  if (severity === 10) return "good";
  if (severity === 9) return "warning";
  if (severity <= 8) return "bad";
  return "neutral";
}

function applyTflLineVisual(lineMeta, statusSeverity) {
  const tone = getStatusToneFromSeverity(statusSeverity);
  const selected = window._selectedTflLineId && window._selectedTflLineId === lineMeta.id;
  const dimmed = window._selectedTflLineId && !selected;
  const glow = TFL_STATUS_TONE[tone] || TFL_STATUS_TONE.neutral;

  for (const seg of lineMeta.segments) {
    seg.setStyle({
      color: lineMeta.color,
      weight: selected ? 7 : 4,
      opacity: dimmed ? 0.16 : 0.82
    });

    if (seg._path) {
      seg._path.classList.remove("tfl-status-good", "tfl-status-warning", "tfl-status-bad", "tfl-line-selected", "tfl-line-dimmed");
      seg._path.classList.add(`tfl-status-${tone}`);
      if (selected) seg._path.classList.add("tfl-line-selected");
      if (dimmed) seg._path.classList.add("tfl-line-dimmed");
      seg._path.style.setProperty("--tfl-glow", glow);
    }
  }
}

window.updateTflLineStylesFromStatus = function updateTflLineStylesFromStatus(lines) {
  window._lastTflStatuses = Array.isArray(lines) ? lines : [];
  const statusById = {};
  for (const line of window._lastTflStatuses) {
    statusById[(line.id || "").toLowerCase()] = line.lineStatuses?.[0]?.statusSeverity ?? 10;
  }
  for (const meta of Object.values(window._tflRouteRegistry)) {
    const severity = statusById[meta.id] ?? 10;
    applyTflLineVisual(meta, severity);
  }
  window.updateSelectedTflLineInfo();
};

window.selectTflLine = function selectTflLine(lineId) {
  if (!lineId) return;
  const normalized = String(lineId).toLowerCase();
  window._selectedTflLineId = window._selectedTflLineId === normalized ? null : normalized;
  window.updateTflLineStylesFromStatus(window._lastTflStatuses);
  window.updateSelectedTflLineInfo();
  document.dispatchEvent(new CustomEvent("tfl-line-selection-changed", { detail: { lineId: window._selectedTflLineId } }));
};

window.focusTflLine = function focusTflLine(lineId) {
  const normalized = String(lineId || "").toLowerCase();
  const meta = window._tflRouteRegistry[normalized];
  if (!meta || !meta.segments || !meta.segments.length) return;
  const group = L.featureGroup(meta.segments);
  map.fitBounds(group.getBounds(), { padding: [80, 80], maxZoom: 12 });
};

async function ensureUndergroundLoaded() {
  if (OVERLAY_LOAD_STATE.undergroundLoaded) return true;
  if (OVERLAY_LOAD_STATE.undergroundLoading) return OVERLAY_LOAD_STATE.undergroundLoading;
  OVERLAY_LOAD_STATE.undergroundLoading = Promise.all([
    fetch("data/underground_map/underground-live-map-master/bin/lines_for_stations.json").then((r) => r.json()),
    fetch("data/underground_map/underground-live-map-master/bin/stations.json").then((r) => r.json()),
    fetch("data/underground_map/underground-live-map-master/bin/london-lines.json").then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
  ]).then(([lineInfo, stationData, lineRouteData]) => {
    stationLinesData = lineInfo || {};

    const seen = new Set();
    for (const [fullName, coords] of Object.entries(stationData || {})) {
      const parts = String(coords || "").split(",").map(Number);
      const lon = parts[0], lat = parts[1];
      if (isNaN(lat) || isNaN(lon)) continue;

      const key = lat.toFixed(4) + "," + lon.toFixed(4);
      if (seen.has(key)) continue;
      seen.add(key);

      const stationName = fullName
        .replace(/ Station$/i, "").replace(/ Rail Station$/i, "")
        .replace(/ DLR Station$/i, "").replace(/ Tram Stop$/i, "");

      const lines = stationLinesData[stationName] || [];
      let networkType = lines.length > 0 ? lines.join(", ") : "Underground";
      if (fullName.includes("DLR")) networkType = "DLR";
      else if (fullName.includes("Tram")) networkType = "Tram";

      const stationMarker = L.marker([lat, lon], {
        icon: getTfLRoundelIcon(lines),
        pane: "tflStationsPane"
      }).addTo(layers.underground);

      stationMarker.bindPopup(
        `<strong>${stationName}</strong><br>` +
        `<span class="popup-label">Lines</span> ${networkType}` +
        '<div class="tfl-arrivals"><div class="tfl-arrivals-loading">Loading arrivals...</div></div>'
      );

      stationMarker.on("popupopen", async () => {
        if (typeof window.buildTflStationPopup !== "function") return;
        try {
          const popupData = await window.buildTflStationPopup(stationName, networkType);
          stationMarker.setPopupContent(popupData.loadingHtml);
          const fullHtml = await popupData.fetchFull();
          stationMarker.setPopupContent(fullHtml);
        } catch (_) {
          stationMarker.setPopupContent(
            `<strong>${stationName}</strong><br>` +
            `<span class="popup-label">Lines</span> ${networkType}` +
            '<div class="tfl-arrivals"><div class="tfl-arrivals-empty">Arrivals unavailable</div></div>'
          );
        }
      });
    }

    if (!lineRouteData.polylines || !Array.isArray(lineRouteData.polylines)) {
      throw new Error("Invalid data structure - no polylines array");
    }

    let addedCount = 0;
    for (const segment of lineRouteData.polylines) {
      if (!Array.isArray(segment) || segment.length < 3) continue;

      const sourceColor = String(segment[0] || "").toLowerCase();
      const meta = TFL_COLOR_TO_META[sourceColor];
      const coords = segment.slice(2);
      if (!coords.length || !meta) continue;

      if (!window._tflRouteRegistry[meta.id]) {
        window._tflRouteRegistry[meta.id] = {
          id: meta.id,
          name: meta.name,
          color: meta.color,
          segments: []
        };
      }

      const routeSegment = L.polyline(coords, {
        color: meta.color,
        weight: 4,
        opacity: 0.82,
        smoothFactor: 1,
        className: "tfl-line",
        pane: "tflRoutesPane"
      }).addTo(layers.underground);

      routeSegment.on("click", (ev) => {
        L.DomEvent.stop(ev);
        window.selectTflLine(meta.id);
      });
      routeSegment.bindTooltip(meta.name, { sticky: true, opacity: 0.9, direction: "top" });

      window._tflRouteRegistry[meta.id].segments.push(routeSegment);
      addedCount += 1;
    }

    window.updateTflLineStylesFromStatus(window._lastTflStatuses);
    OVERLAY_LOAD_STATE.undergroundLoaded = true;
    console.log(`TfL underground loaded: ${addedCount} route segments`);
    return true;
  }).catch((e) => {
    console.warn("TfL underground data unavailable:", e?.message || e);
    setStatus("TfL underground dataset unavailable");
    return false;
  }).finally(() => {
    OVERLAY_LOAD_STATE.undergroundLoading = null;
  });
  return OVERLAY_LOAD_STATE.undergroundLoading;
}

// UI
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

function getCriteriaFromUI() {
  return {
    name:     document.getElementById("ch_name")?.value     || "",
    number:   document.getElementById("ch_number")?.value   || "",
    postcode: document.getElementById("ch_postcode")?.value || "",
    town:     document.getElementById("ch_town")?.value     || "",
    status:   document.getElementById("ch_status")?.value   || "",
    sic:      document.getElementById("ch_sic")?.value      || ""
  };
}
function pickSeed(c) { return c.number || c.postcode || c.name || c.town || ""; }
function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

// Ã¢â€â‚¬Ã¢â€â‚¬ Company Results list Ã¢â€â‚¬Ã¢â€â‚¬
const MAX_VISIBLE = 50;
function renderResults(container, rows, isPartial) {
  container.innerHTML = "";
  if (!rows.length) { container.innerHTML = '<div class="ch-result-count">No matches found</div>'; return; }
  const el = document.createElement("div"); el.className = "ch-result-count";
  const sfx = isPartial ? " (searching...)" : "";
  el.textContent = rows.length > MAX_VISIBLE
    ? `${MAX_VISIBLE} of ${rows.length} matches${sfx}` : `${rows.length} match${rows.length===1?"":"es"}${sfx}`;
  container.appendChild(el);
  for (const r of rows.slice(0, MAX_VISIBLE)) {
    const item = document.createElement("div"); item.className = "ch-result-item";
    item.innerHTML =
      `<div class="ch-r-name">${escapeHtml(r.CompanyName||"Unknown")}</div>` +
      `<div class="ch-r-detail">#${escapeHtml(r.CompanyNumber)} &middot; ${escapeHtml(r["RegAddress.PostTown"])} &middot; ${escapeHtml(r["RegAddress.PostCode"])}</div>`;
    item.addEventListener("click", () => plotCompanies([r]));
    container.appendChild(item);
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ PSC Results list Ã¢â€â‚¬Ã¢â€â‚¬


// Look up companies by number and plot them
async function lookupAndPlotCompanies(companyNumbers) {
  setStatus(`Looking up ${companyNumbers.length} compan${companyNumbers.length === 1 ? "y" : "ies"}...`);
  showProgress();

  const results = [];
  const uniqueNums = [...new Set(companyNumbers)];

  // For each company number, find the right subset file and search
  for (let i = 0; i < uniqueNums.length; i++) {
    const num = uniqueNums[i];
    const numClean = num.replace(/\D/g, "");
    if (!numClean) continue;
    const numInt = parseInt(numClean, 10);
    const entry = CH_INDEX.find(e => numInt >= e.start && numInt <= e.end);
    if (!entry) continue;

    try {
      await loadSubset(entry.file);
      const hits = filterByCriteria(CH_CACHE[entry.file] || [], { number: num }, 1);
      if (hits.length) results.push(hits[0]);
    } catch (e) {
      console.warn("Failed to load for company", num, e);
    }

    if (i % 5 === 0) {
      setProgress(i + 1, uniqueNums.length, results.length);
    }
  }

  hideProgress();

  if (results.length) {
    await plotCompanies(results);
    setStatus(`Plotted ${results.length} of ${uniqueNums.length} companies`);
  } else {
    setStatus("Could not find company data");
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Live search Ã¢â€â‚¬Ã¢â€â‚¬
let _seq = 0;
function liveSearch(container) {
  const c = getCriteriaFromUI(), seed = pickSeed(c).trim();
  if (!seed || seed.length < 3) { container.innerHTML = ""; return; }
  if (!Object.keys(CH_CACHE).length) {
    container.innerHTML = '<div class="ch-result-count">Press Enter to search</div>'; return;
  }
  const seq = ++_seq;
  const matches = searchCached(c, 200);
  if (seq !== _seq) return;
  CH_LAST_RESULTS = matches;
  renderResults(container, matches, Object.keys(CH_CACHE).length < CH_INDEX.length);
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Plot companies Ã¢â€â‚¬Ã¢â€â‚¬
async function plotCompanies(rows, clearFirst = false) {
  if (clearFirst) layers.companies.clearLayers();
  if (!rows.length) { setStatus("No companies to plot"); return; }
  setStatus(`Plotting ${rows.length} compan${rows.length===1?"y":"ies"}...`);
  let plotted = 0;
  let skipped = 0;
  const failedPostcodes = new Set();
  for (const r of rows) {
    try {
      const raw = r["RegAddress.PostCode"];
      if (!raw) { skipped++; continue; }
      const co = await geocodePostcode(raw);
      if (!co || !Number.isFinite(co.lat) || !Number.isFinite(co.lon)) {
        skipped++;
        failedPostcodes.add(String(raw).trim().toUpperCase());
        continue;
      }

      const coNum = escapeHtml(r.CompanyNumber);
      const companyName = escapeHtml(r.CompanyName);
      const popup =
        `<strong>${companyName}</strong>` +
        `<span class="popup-label">Company #</span> ${coNum}<br>` +
        (r["RegAddress.AddressLine1"] ? escapeHtml(r["RegAddress.AddressLine1"]) + "<br>" : "") +
        (r["RegAddress.PostTown"] ? escapeHtml(r["RegAddress.PostTown"]) + " " : "") + escapeHtml(raw) +
        (r.CompanyStatus ? `<br><span class="popup-label">Status</span> <span class="popup-tag">${escapeHtml(r.CompanyStatus)}</span>` : "") +
        (r["SICCode.SicText_1"] ? `<br><span class="popup-label">SIC</span> ${escapeHtml(r["SICCode.SicText_1"])}` : "") +
        `<div class="popup-btn-row">` +
        `<button class="popup-psc-btn" onclick="viewCompanyPsc('${coNum}', '${companyName.replace(/'/g, "\\'")}')">View PSC</button>` +
        `<button class="popup-psc-btn" onclick="connectCompanyEntity('${coNum}')">Connect</button>` +
        `<button class="popup-psc-btn" onclick="downloadCompanyProfile('${coNum}', '${companyName.replace(/'/g, "\\'")}')">Profile PDF</button>` +
        `<button class="popup-psc-btn" onclick="downloadFilingHistory('${coNum}', '${companyName.replace(/'/g, "\\'")}')">Filings PDF</button>` +
        `</div>`;

      const marker = createOrganisationMarker([co.lat, co.lon]);
      marker.bindPopup(popup).addTo(layers.companies);
      registerCompanyMarkerAsEntity(marker, {
        number: r.CompanyNumber,
        name: r.CompanyName,
        status: r.CompanyStatus || "",
        address: [r["RegAddress.AddressLine1"], r["RegAddress.PostTown"], raw].filter(Boolean).join(", "),
        postcode: raw,
        latLng: [co.lat, co.lon]
      });

      plotted++;
    } catch (err) {
      skipped++;
      console.warn("Skipping company row due to plot error:", r?.CompanyNumber || r, err);
    }
  }
  if (plotted) {
    if (!map.hasLayer(layers.companies)) {
      layers.companies.addTo(map);
      const cb = document.querySelector('[data-layer="companies"]');
      if (cb) cb.checked = true;
    }
    map.fitBounds(layers.companies.getBounds(), { padding: [40, 40] });
    const suffix = skipped ? ` (${skipped} skipped)` : "";
    setStatus(`${plotted} compan${plotted===1?"y":"ies"} plotted${suffix}`);
    if (failedPostcodes.size) {
      console.warn("Company geocode failed postcodes (sample):", Array.from(failedPostcodes).slice(0, 20));
    }
  } else {
    setStatus(`No geocodable postcodes in ${rows.length} results`);
    if (failedPostcodes.size) {
      console.warn("No companies plotted, failed postcodes (sample):", Array.from(failedPostcodes).slice(0, 40));
    }
  }
}

// View PSC for a company (called from popup button)
// NOW USES API - defined in psc_api.js
// This is just a fallback/compatibility wrapper
async function viewCompanyPsc(companyNumber, companyName = '') {
  // Call the API version from psc_api.js
  if (typeof viewCompanyPSC === 'function') {
    return viewCompanyPSC(companyNumber, companyName);
  }
  
  // Fallback if psc_api.js not loaded
  console.error('PSC API module not loaded');
  alert('PSC feature not available. Please refresh the page.');
}

// Add individual company to map with connection line
async function addCompanyToMap(companyNumber, companyName, personName = '', personLatLng = null, appointmentInfo = null) {
  if (!companyNumber) return;
  
  setStatus(`Adding ${companyName} to map...`);
  
  try {
    // Get company profile to get address/postcode
    const profile = await getCompanyProfile(companyNumber);
    
    if (!profile || !profile.registered_office_address) {
      alert('Could not get company address');
      setStatus('Failed to add company');
      return;
    }
    
    const addr = profile.registered_office_address;
    const postcode = addr.postal_code;
    
    if (!postcode) {
      alert('Company has no postcode');
      setStatus('Failed to add company');
      return;
    }
    
    // Lookup coordinates (local first, then postcodes.io fallback)
    const coords = await geocodePostcode(postcode);
    if (!coords) {
      alert(`Could not geocode postcode: ${postcode}`);
      setStatus('Failed to add company');
      return;
    }
    
    // Create marker
    const popup = `
      <strong>${escapeHtml(companyName)}</strong>
      <span class="popup-label">Company #</span> ${escapeHtml(companyNumber)}<br>
      ${addr.address_line_1 ? escapeHtml(addr.address_line_1) + '<br>' : ''}
      ${addr.locality ? escapeHtml(addr.locality) + ' ' : ''}${escapeHtml(postcode)}
      ${profile.company_status ? `<br><span class="popup-label">Status</span> <span class="popup-tag">${escapeHtml(profile.company_status)}</span>` : ''}
      ${personName ? `<br><span class="popup-label">Connected to</span> ${escapeHtml(personName)}` : ''}
      <div class="popup-btn-row">
        <button class="popup-psc-btn" onclick="viewCompanyPsc('${escapeHtml(companyNumber)}', '${escapeHtml(companyName).replace(/'/g, "\\'")}')">View PSC</button>
        <button class="popup-psc-btn" onclick="connectCompanyEntity('${escapeHtml(companyNumber)}')">Connect</button>
        <button class="popup-psc-btn" onclick="downloadCompanyProfile('${escapeHtml(companyNumber)}', '${escapeHtml(companyName).replace(/'/g, "\\'")}')">Profile PDF</button>
        <button class="popup-psc-btn" onclick="downloadFilingHistory('${escapeHtml(companyNumber)}', '${escapeHtml(companyName).replace(/'/g, "\\'")}')">Filings PDF</button>
      </div>
    `;
    
    const companyLatLng = [coords.lat, coords.lon];
    
    const marker = createOrganisationMarker(companyLatLng);
    marker.bindPopup(popup).addTo(layers.companies);
    registerCompanyMarkerAsEntity(marker, {
      number: companyNumber,
      name: companyName,
      status: profile.company_status || "",
      address: [addr.address_line_1, addr.address_line_2, addr.locality, postcode].filter(Boolean).join(", "),
      postcode,
      latLng: companyLatLng
    });
    
    // Store company data on marker
    marker._companyData = { number: companyNumber, name: companyName, latLng: companyLatLng };
    
    // Ensure layer is visible
    if (!map.hasLayer(layers.companies)) {
      layers.companies.addTo(map);
      const cb = document.querySelector('[data-layer="companies"]');
      if (cb) cb.checked = true;
    }
    
    // Draw connection line if person provided
    if (personLatLng && appointmentInfo) {
      const role = appointmentInfo.officer_role || 'officer';
      const appointedOn = appointmentInfo.appointed_on || '';
      const normalizedRole = normalizeConnectionLabel(role);
      const label = appointedOn ? `${normalizedRole} since ${appointedOn}` : normalizedRole;
      addConnection(personLatLng, companyLatLng, label, 'officer');
    }
    
    // Pan to marker
    map.panTo(companyLatLng);
    marker.openPopup();
    
    setStatus(`Added: ${companyName}`);
    
    return { marker, latLng: companyLatLng };
  } catch (error) {
    console.error('Error adding company to map:', error);
    alert('Failed to add company to map');
    setStatus('Error');
    return null;
  }
}

// Add person/officer to map
async function addPersonToMap(officerName, address, companies = [], options = {}) {
  if (!address || !address.postal_code) {
    alert('Officer has no valid address with postcode');
    return;
  }
  
  setStatus(`Adding ${officerName} to map...`);
  
  try {
    const postcode = address.postal_code;
    const coords = await geocodePostcode(postcode);
    if (!coords) {
      alert(`Could not geocode postcode: ${postcode}`);
      setStatus('Failed to add person');
      return;
    }
    
    // Create address string
    const addrParts = [];
    if (address.address_line_1) addrParts.push(address.address_line_1);
    if (address.address_line_2) addrParts.push(address.address_line_2);
    if (address.locality) addrParts.push(address.locality);
    if (address.postal_code) addrParts.push(address.postal_code);
    const addrString = addrParts.join(', ');
    const resolvedCompanyName = String(options?.companyName || companies?.[0] || "").trim();
    
    let personLatLng = [coords.lat, coords.lon];
    const linkedCompanyEntity = options.companyNumber ? getCompanyEntityByNumber(options.companyNumber) : null;
    if (linkedCompanyEntity?.latLng) {
      const fanIndex = getNextPscFanIndex(linkedCompanyEntity.id);
      personLatLng = offsetLatLngFromAnchor(linkedCompanyEntity.latLng, fanIndex);
    } else if (options.anchorLatLng) {
      personLatLng = offsetLatLngFromAnchor(options.anchorLatLng, 0);
    }

    const personPayload = {
      name: officerName,
      address: addrString,
      postcode,
      latLng: personLatLng,
      notes: companies.length ? `${companies.length} related compan${companies.length === 1 ? "y" : "ies"}` : "",
      dob: options?.pscData?.date_of_birth || options?.dob || "",
      nationality: options?.pscData?.nationality || options?.nationality || "",
      countryOfResidence: options?.pscData?.country_of_residence || options?.countryOfResidence || "",
      relationship: options?.relationship || options?.officerRole || "",
      officerId: options?.officerId || "",
      companyName: resolvedCompanyName,
      companyNumber: options?.companyNumber || ""
    };
    const existingOfficerId = findExistingOfficerEntityId(personPayload);
    if (existingOfficerId) {
      const existingEntity = getEntityById(existingOfficerId);
      if (existingEntity) {
        mergeOfficerEntityData(existingEntity, personPayload);
        upsertOfficerEntityIndexes(existingOfficerId, {
          name: existingEntity.label || personPayload.name,
          postcode: personPayload.postcode,
          officerId: existingEntity.officerId || personPayload.officerId,
          dob: existingEntity.dob || personPayload.dob
        });
        existingEntity.marker.setPopupContent(buildEntityPopup(existingOfficerId, existingEntity));
        bindEntityHoverTooltip(existingEntity.marker, existingEntity);
        if (linkedCompanyEntity && personPayload.relationship && !hasPscAutoConnection(existingOfficerId, linkedCompanyEntity.id)) {
          addConnection(
            existingEntity.latLng,
            linkedCompanyEntity.latLng,
            personPayload.relationship,
            "officer",
            {
              fromId: existingOfficerId,
              toId: linkedCompanyEntity.id,
              fromLabel: existingEntity.label,
              toLabel: linkedCompanyEntity.label,
              source: "psc_auto",
              hoverDetail: String(options?.relationshipDetail || "").trim()
            }
          );
        }
        map.panTo(existingEntity.latLng);
        existingEntity.marker.openPopup();
        setStatus(`Matched existing person: ${existingEntity.label}`);
        return { marker: existingEntity.marker, latLng: existingEntity.latLng, entityId: existingOfficerId, reused: true };
      }
    }

    const officerIconData = getOfficerEntityIconData();
    const marker = L.marker(personLatLng, {
      icon: L.icon({
        iconUrl: officerIconData.icon,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -14]
      }),
      draggable: true
    });
    marker.addTo(entitiesMarkerCluster);
    const personEntityId = registerOfficerMarkerAsEntity(marker, personPayload);
    const popup = personEntityId
      ? buildEntityPopup(personEntityId, getEntityById(personEntityId))
      : (
        `<strong>${escapeHtml(officerName)}</strong>` +
        `<span class="popup-label">Type</span> <span class="popup-tag" style="background:rgba(167,139,250,0.15); color:#c4b5fd; border:1px solid rgba(167,139,250,0.3);">Person/Officer</span><br>` +
        `<span class="popup-label">Address</span> ${escapeHtml(addrString)}`
      );
    marker.bindPopup(popup);
    
    // Add click handler to highlight connections
    marker.on('click', function(e) {
      L.DomEvent.stopPropagation(e);
      const entityId = marker._entityId;
      if (connectionDrawingMode && entityId && connectionDrawingMode.fromId !== entityId) {
        completeConnection(entityId);
        return;
      }
      highlightConnections(marker.getLatLng());
    });
    marker.on("dragend", () => {
      const entityId = marker._entityId;
      const entity = entityId ? getEntityById(entityId) : null;
      if (entity) {
        const next = marker.getLatLng();
        entity.latLng = [Number(next.lat), Number(next.lng)];
        marker.setPopupContent(buildEntityPopup(entityId, entity));
        refreshConnectionsForEntity(entityId);
      }
    });
    
    // Store person data on marker
    marker._personData = { name: officerName, companies: companies, latLng: personLatLng };
    
    const relationshipLabel = String(options.relationship || "").trim();
    if (personEntityId && linkedCompanyEntity && relationshipLabel && !hasPscAutoConnection(personEntityId, linkedCompanyEntity.id)) {
      addConnection(
        personLatLng,
        linkedCompanyEntity.latLng,
        relationshipLabel,
        "officer",
        {
          fromId: personEntityId,
          toId: linkedCompanyEntity.id,
          fromLabel: officerName,
          toLabel: linkedCompanyEntity.label,
          source: "psc_auto",
          hoverDetail: String(options.relationshipDetail || "").trim()
        }
      );
    }
    
    // Pan to marker
    map.panTo(personLatLng);
    marker.openPopup();
    
    setStatus(`Added person: ${officerName}`);
    
    return { marker, latLng: personLatLng };
  } catch (error) {
    console.error('Error adding person to map:', error);
    alert('Failed to add person to map');
    setStatus('Error');
    return null;
  }
}

function extractOfficerIdFromPath(rawPath = "") {
  const path = String(rawPath || "").trim();
  const match = path.match(/\/officers\/([^/]+)\/appointments/i);
  return match ? match[1] : "";
}

async function expandOfficerCompanies(entityId) {
  const entity = getEntityById(entityId);
  if (!entity) return;
  let officerId = String(entity.officerId || "").trim();
  if (!officerId && entity.companyNumber && typeof lookupCompanyOfficerMatch === "function") {
    try {
      const resolved = await lookupCompanyOfficerMatch(entity.companyNumber, entity.label);
      officerId = String(resolved?.officerId || "").trim();
      if (officerId) entity.officerId = officerId;
    } catch (err) {
      console.warn("Officer ID resolve fallback failed:", err);
    }
  }
  if (!officerId) {
    alert("No officer ID is stored for this person, so appointments cannot be expanded.");
    return;
  }
  setStatus(`Loading appointments for ${entity.label}...`);
  try {
    const appointments = typeof getOfficerAppointmentsAPI === "function"
      ? await getOfficerAppointmentsAPI(officerId)
      : [];
    if (!Array.isArray(appointments) || appointments.length === 0) {
      setStatus(`No company appointments found for ${entity.label}`);
      return;
    }
    let added = 0;
    for (const appt of appointments) {
      const companyNumber = String(appt?.appointed_to?.company_number || "").trim();
      const companyName = String(appt?.appointed_to?.company_name || "").trim();
      if (!companyNumber || !companyName) continue;
      await addCompanyToMap(
        companyNumber,
        companyName,
        entity.label,
        entity.latLng,
        {
          officer_role: String(appt?.officer_role || entity.officerRole || "Officer"),
          appointed_on: String(appt?.appointed_on || "")
        }
      );
      added += 1;
    }
    setStatus(`Expanded ${added} linked compan${added === 1 ? "y" : "ies"} for ${entity.label}`);
  } catch (err) {
    console.error("Expand officer companies failed:", err);
    setStatus("Failed to expand officer companies");
  }
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// API-BASED SEARCH (REPLACES LOCAL FILE SEARCH)
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

async function searchCompaniesViaAPI(criteria, limit = 100) {
  // Primary search by company name or number
  const nameQuery = criteria.name?.trim() || "";
  const numberQuery = criteria.number?.trim() || "";
  const postcodeFilter = criteria.postcode?.trim().toLowerCase() || "";
  const townFilter = criteria.town?.trim().toLowerCase() || "";
  const statusFilter = criteria.status?.trim().toLowerCase() || "";
  const sicFilter = criteria.sic?.trim() || "";
  
  const query = nameQuery || numberQuery;
  if (!query || query.length < 2) {
    return [];
  }
  
  try {
    const response = await fetchCH(`/search/companies?q=${encodeURIComponent(query)}&items_per_page=${limit}`);
    
    if (!response.ok) {
      console.error("API search failed:", response.status);
      return [];
    }
    
    const data = await response.json();
    let items = data.items || [];
    
    // Transform API results to match local format
    let results = items.map(item => ({
      CompanyName: item.title || item.company_name || "",
      CompanyNumber: item.company_number || "",
      "RegAddress.PostCode": item.address?.postal_code || "",
      "RegAddress.PostTown": item.address?.locality || "",
      "RegAddress.AddressLine1": item.address?.address_line_1 || "",
      CompanyStatus: item.company_status || "",
      "SICCode.SicText_1": item.sic_codes ? item.sic_codes.join(", ") : "",
      _rawSicCodes: item.sic_codes || []
    }));
    
    // Apply local filters (postcode, town) if specified
    if (postcodeFilter) {
      results = results.filter(r => 
        r["RegAddress.PostCode"].toLowerCase().includes(postcodeFilter)
      );
    }
    
    if (townFilter) {
      results = results.filter(r => 
        r["RegAddress.PostTown"].toLowerCase().includes(townFilter)
      );
    }
    
    // Filter by company status
    if (statusFilter) {
      results = results.filter(r => 
        (r.CompanyStatus || "").toLowerCase().includes(statusFilter)
      );
    }
    
    // Filter by SIC code
    if (sicFilter) {
      results = results.filter(r => 
        (r._rawSicCodes || []).some(sic => String(sic).includes(sicFilter))
      );
    }
    
    return results;
  } catch (err) {
    console.error("API search error:", err);
    return [];
  }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Clear Ã¢â€â‚¬Ã¢â€â‚¬
function clearAll() {
  _searchAbort = true;
  if (confirm('Clear all companies from map?')) {
    removeCompanyEntitiesFromStore();
    window._officerEntityIndex = {};
    window._officerEntityByOfficerId = {};
    window._officerEntityByNameDob = {};
    layers.companies.clearLayers();
  }
  ["ch_name","ch_number","ch_postcode","ch_town","ch_status","ch_sic"].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = "";
  });
  document.getElementById("ch_results").innerHTML = "";
  setSkeletonVisible("ch-results-skeleton", false);
  hideProgress(); CH_LAST_RESULTS = [];
  setStatus("Ready");
}

function clearPsc() {
  document.getElementById("psc_name").value = "";
  document.getElementById("psc_company").value = "";
  document.getElementById("psc_results").innerHTML = "";
  setSkeletonVisible("psc-results-skeleton", false);
  hidePscProgress();
  setStatus("Ready");
}

// Ã¢â€â‚¬Ã¢â€â‚¬ PSC Search handler (NOW USES API) Ã¢â€â‚¬Ã¢â€â‚¬
async function runPscSearch() {
  const nameVal = document.getElementById("psc_name")?.value?.trim() || "";
  const coVal = document.getElementById("psc_company")?.value?.trim() || "";
  const resultsDiv = document.getElementById("psc_results");

  if (!nameVal && !coVal) return;

  resultsDiv.innerHTML = '<div class="ch-loading">Searching via API...</div>';
  setSkeletonVisible("psc-results-skeleton", true);
  showPscProgress();

  if (coVal) {
    // Search by company number via API
    setPscProgress("Fetching PSC from API...", 50);
    setStatus(`Searching PSC for company #${coVal}...`);
    
    const pscRecords = await getPSCForCompanyAPI(coVal);
    hidePscProgress();
    setSkeletonVisible("psc-results-skeleton", false);
    
    // Get company details for better display
    let companyName = '';
    try {
      const companyProfile = await getCompanyProfile(coVal);
      if (companyProfile) {
        companyName = companyProfile.company_name || '';
      }
    } catch (e) {
      console.log('Could not fetch company name:', e);
    }
    
    displayPSCResults(resultsDiv, pscRecords, coVal, companyName || `Company #${coVal}`);
    setStatus(`${pscRecords.length} PSC record${pscRecords.length === 1 ? "" : "s"} for #${coVal}`);
    if (window.CRDashboard) window.CRDashboard.addSearchHistory("psc", coVal, pscRecords.length, { companyNumber: coVal });
  } else if (nameVal && nameVal.length >= 3) {
    // Search by officer name via API
    setPscProgress("Searching officers...", 20);
    setStatus(`Searching for "${nameVal}"...`);
    
    const results = await searchCompaniesByOfficerAPI(nameVal, 50);
    hidePscProgress();
    setSkeletonVisible("psc-results-skeleton", false);
    
    // Display officer search results
    if (window.CRDashboard) window.CRDashboard.addSearchHistory("officer", nameVal, results?.length || 0, { personName: nameVal });
    resultsDiv.innerHTML = '';
    if (!results || results.length === 0) {
      resultsDiv.innerHTML = '<div class="ch-result-count">No matches found</div>';
      setStatus('No officer matches found');
    } else {
      const header = document.createElement('div');
      header.className = 'ch-result-count';
      header.textContent = `${results.length} officer match${results.length === 1 ? '' : 'es'}`;
      resultsDiv.appendChild(header);
      
      results.slice(0, 30).forEach(officer => {
        const card = document.createElement('div');
        card.className = 'ch-result-item officer-card';
        card.dataset.officerPath = officer.links?.self || '';
        card.dataset.officerId = extractOfficerIdFromPath(officer.links?.self || '');
        card.dataset.officerName = officer.title || officer.name || 'Unknown';
        card.dataset.officerAddress = JSON.stringify(officer.address || {});
        card.dataset.officerDob = JSON.stringify(officer.date_of_birth || null);
        card.dataset.officerNationality = String(officer.nationality || "");
        card.dataset.officerCountryOfResidence = String(officer.country_of_residence || "");
        
        card.innerHTML = `
          <div class="ch-r-name">${escapeHtml(officer.title || officer.name || 'Unknown')} <span class="expand-icon">></span></div>
          <div class="ch-r-detail">
            ${officer.appointment_count ? `${officer.appointment_count} appointment${officer.appointment_count === 1 ? '' : 's'}` : ''}
            ${officer.date_of_birth ? ` - Born ${officer.date_of_birth.month}/${officer.date_of_birth.year}` : ''}
            ${officer.address_snippet ? `<br>${escapeHtml(officer.address_snippet)}` : ''}
          </div>
          ${officer.address?.postal_code ? `<button class="btn-add-company btn-sm btn-add-officer-map" style="margin-top: 6px;">Add Person to Map</button>` : ''}
          <div class="officer-companies" style="display: none;">
            <div class="officer-loading">Loading appointments...</div>
          </div>
        `;

        const addOfficerBtn = card.querySelector(".btn-add-officer-map");
        if (addOfficerBtn) {
          addOfficerBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const officerAddress = card.dataset.officerAddress ? JSON.parse(card.dataset.officerAddress) : null;
            const officerDob = card.dataset.officerDob ? JSON.parse(card.dataset.officerDob) : null;
            if (!officerAddress?.postal_code) return;
            await addPersonToMap(card.dataset.officerName || "Unknown", officerAddress, [], {
              officerId: card.dataset.officerId || "",
              dob: officerDob || "",
              nationality: card.dataset.officerNationality || "",
              countryOfResidence: card.dataset.officerCountryOfResidence || ""
            });
          });
        }
        
        // Click handler to expand/collapse
        card.addEventListener('click', async (e) => {
          if (e.target.closest('.btn-add-company')) return; // Don't trigger if clicking add button
          
          const companiesDiv = card.querySelector('.officer-companies');
          const expandIcon = card.querySelector('.expand-icon');
          const isExpanded = companiesDiv.style.display !== 'none';
          
          if (isExpanded) {
            companiesDiv.style.display = 'none';
            expandIcon.textContent = '>';
          } else {
            companiesDiv.style.display = 'block';
            expandIcon.textContent = 'v';
            
            // Fetch appointments if not already loaded
            if (!companiesDiv.dataset.loaded) {
              const officerId = card.dataset.officerId || extractOfficerIdFromPath(card.dataset.officerPath || "");
              if (!officerId) {
                companiesDiv.innerHTML = '<div class="officer-no-companies">Officer ID missing for appointments lookup</div>';
                return;
              }
              const appointments = await getOfficerAppointmentsAPI(officerId);
              
              companiesDiv.dataset.loaded = 'true';
              
              if (appointments.length === 0) {
                companiesDiv.innerHTML = '<div class="officer-no-companies">No appointments found</div>';
              } else {
                companiesDiv.innerHTML = '';
                appointments.slice(0, 20).forEach(appt => {
                  const companyItem = document.createElement('div');
                  companyItem.className = 'officer-company-item';
                  companyItem.innerHTML = `
                    <div class="officer-company-name">${escapeHtml(appt.appointed_to?.company_name || 'Unknown Company')}</div>
                    <div class="officer-company-detail">
                      #${escapeHtml(appt.appointed_to?.company_number || 'N/A')}
                      ${appt.officer_role ? ` - ${escapeHtml(appt.officer_role)}` : ''}
                      ${appt.appointed_on ? ` - Since ${appt.appointed_on}` : ''}
                    </div>
                    <button class="btn-add-company btn-sm" 
                            data-company-number="${escapeHtml(appt.appointed_to?.company_number || '')}"
                            data-company-name="${escapeHtml(appt.appointed_to?.company_name || '')}"
                            data-officer-name="${card.dataset.officerName}"
                            data-officer-role="${escapeHtml(appt.officer_role || 'officer')}"
                            data-appointed-on="${escapeHtml(appt.appointed_on || '')}">
                      Add to Map
                    </button>
                  `;
                  companiesDiv.appendChild(companyItem);
                });
                
                // Add click handlers for "Add to Map" buttons
                companiesDiv.querySelectorAll('.btn-add-company').forEach(btn => {
                  btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const companyNumber = btn.dataset.companyNumber;
                    const companyName = btn.dataset.companyName;
                    const officerName = btn.dataset.officerName;
                    const officerRole = btn.dataset.officerRole;
                    const appointedOn = btn.dataset.appointedOn;
                    
                    // Try to add person first if they have address
                    const officerAddress = card.dataset.officerAddress ? JSON.parse(card.dataset.officerAddress) : null;
                    const officerDob = card.dataset.officerDob ? JSON.parse(card.dataset.officerDob) : null;
                    let personLatLng = null;
                    
                    if (officerAddress && officerAddress.postal_code) {
                      const personResult = await addPersonToMap(officerName, officerAddress, [companyName], {
                        officerId: card.dataset.officerId || "",
                        dob: officerDob || "",
                        nationality: card.dataset.officerNationality || "",
                        countryOfResidence: card.dataset.officerCountryOfResidence || "",
                        relationship: officerRole,
                        companyNumber,
                        companyName
                      });
                      personLatLng = personResult?.latLng;
                    }
                    
                    // Add company with connection
                    if (companyNumber) {
                      const appointmentInfo = { officer_role: officerRole, appointed_on: appointedOn };
                      await addCompanyToMap(companyNumber, companyName, officerName, personLatLng, appointmentInfo);
                    }
                  });
                });
              }
            }
          }
        });
        
        resultsDiv.appendChild(card);
      });
      
      setStatus(`${results.length} officer match${results.length === 1 ? '' : 'es'}`);
    }
  } else {
    hidePscProgress();
    setSkeletonVisible("psc-results-skeleton", false);
    resultsDiv.innerHTML = '<div class="ch-result-count">Enter at least 3 characters</div>';
  }
}

// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
// BOOTSTRAP
// Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

document.addEventListener("DOMContentLoaded", async () => {
  // Runtime fallback so visual refresh is applied even when stale HTML template is served.
  document.body?.classList.add("ux-revamp");
  window.__CONTROL_ROOM_ACTIVE_TAB = "search";
  setStatus("Initializing...");
  // Compatibility-only preload (non-blocking): search path is API-driven.
  loadCompaniesHouseIndex().catch(() => console.log('Legacy company index not loaded'));

  setStatus("Ready - Live API search enabled");

  // i2 catalog now loads lazily when i2/entity placement UI is first used.
  initializeEntitySelector();
  initCrimeFilterUI();
  
  // Entity placement panel handlers
  const entityCategorySelect = document.getElementById('entity-category');
  const entityIconSelect = document.getElementById('entity-icon');
  const entityI2TypeSelect = document.getElementById('entity-i2-type');
  const entityLabelInput = document.getElementById('entity-label');
  const entityForm = document.getElementById('entity-placement-form');
  const entityI2FieldsWrap = document.getElementById('entity-i2-fields');
  const entityPanelClose = document.getElementById('entity-panel-close');
  const entityPanelMinimize = document.getElementById('entity-panel-minimize');
  const entityCancelBtn = document.getElementById('entity-cancel-btn');
  const entityImportFile = document.getElementById('entity-import-file');
  const entityImportRunBtn = document.getElementById('entity-import-run');
  const entityImportTemplateBtn = document.getElementById('entity-import-template');
  const entityImportClearBtn = document.getElementById('entity-import-clear');
  const entitySelectBoxBtn = document.getElementById('entity-select-box');
  const entitySelectAllBtn = document.getElementById('entity-select-all');
  const entityExportExcelBtn = document.getElementById('entity-export-excel');
  const entityImportPanel = document.querySelector('.entity-import-panel');

  // Runtime fallback: inject Number field if older index.html is loaded from cache.
  const placementAddressInput = document.getElementById("entity-placement-address");
  if (placementAddressInput && !document.getElementById("entity-placement-number")) {
    const numInput = document.createElement("input");
    numInput.type = "text";
    numInput.id = "entity-placement-number";
    numInput.placeholder = "House number (e.g. 1)";
    placementAddressInput.parentNode?.insertBefore(numInput, placementAddressInput);
  }
  const placementNumberInput = document.getElementById("entity-placement-number");
  const syncPlacementNumberFromAddress = () => {
    const addrVal = String(placementAddressInput?.value || "").trim();
    if (!addrVal || !placementNumberInput) return;
    const parsed = parseAddressString(addrVal);
    const parsedNum = String(parsed?.buildingNumber || "").trim();
    if (!parsedNum) return;
    const current = String(placementNumberInput.value || "").trim();
    const manual = placementNumberInput.dataset.manual === "1";
    if (!current || !manual) {
      placementNumberInput.value = parsedNum;
      placementNumberInput.dataset.manual = "0";
    }
  };
  placementAddressInput?.addEventListener("input", syncPlacementNumberFromAddress);
  placementAddressInput?.addEventListener("blur", syncPlacementNumberFromAddress);
  placementNumberInput?.addEventListener("input", () => {
    placementNumberInput.dataset.manual = String(placementNumberInput.value || "").trim() ? "1" : "0";
  });
  
  // Category change handler
  entityCategorySelect?.addEventListener('change', async (e) => {
    const category = e.target.value;
    ENTITY_ICON_MANUAL_OVERRIDE = false;
    updateIconDropdown(category);
    await ensureI2EntityCatalogLoaded(category);
    const defaultI2Entity = defaultI2EntityForCategory(category);
    if (defaultI2Entity && entityI2TypeSelect) {
      entityI2TypeSelect.value = defaultI2Entity.entity_id;
      renderI2FieldsForType(defaultI2Entity.entity_id);
    }
    autoSelectIconFromI2Fields(true);
  });

  entityI2TypeSelect?.addEventListener('change', async (e) => {
    if (!I2_CATALOG_LOADED) {
      await ensureI2EntityCatalogLoaded(entityCategorySelect?.value || "");
    }
    renderI2FieldsForType(e.target.value);
    autoSelectIconFromI2Fields(true);
  });
  entityI2TypeSelect?.addEventListener('focus', () => {
    if (!I2_CATALOG_LOADED) {
      ensureI2EntityCatalogLoaded(entityCategorySelect?.value || "");
    }
  });
  
  // Label input handler - auto-suggest icon (unless user locked icon)
  entityLabelInput?.addEventListener('input', (e) => {
    const label = e.target.value;
    const category = entityCategorySelect.value;
    
    if (label && category) {
      autoSelectIconFromI2Fields(false);
    }
  });

  entityIconSelect?.addEventListener('change', () => {
    ENTITY_ICON_MANUAL_OVERRIDE = true;
    updateEntityIconPreview(entityCategorySelect?.value || "", parseInt(entityIconSelect.value, 10));
  });

  entityI2FieldsWrap?.addEventListener('change', () => {
    const activeField = document.activeElement;
    if (activeField && activeField.matches && activeField.matches("[data-i2-property-id]")) {
      activeField.dataset.autogen = "0";
    }
    const addrField = getI2FieldByNames(["Address String", "Address"]);
    if (addrField && document.activeElement === addrField) {
      addrField.dataset.autogen = "0";
    }
    syncAddressStringDerivedFields();
    updateWarningMarkerVisibility();
    autoSelectIconFromI2Fields(false);
  });
  entityI2FieldsWrap?.addEventListener('input', () => {
    const activeField = document.activeElement;
    if (activeField && activeField.matches && activeField.matches("[data-i2-property-id]")) {
      activeField.dataset.autogen = "0";
    }
    const addrField = getI2FieldByNames(["Address String", "Address"]);
    if (addrField && document.activeElement === addrField) {
      addrField.dataset.autogen = "0";
    }
    syncAddressStringDerivedFields();
    autoSelectIconFromI2Fields(false);
  });
  
  // Form submission handler
  entityForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const rawLabel = entityLabelInput.value.trim();
    const categoryKey = entityCategorySelect.value;
    const iconIndex = parseInt(entityIconSelect.value, 10);
    const editingEntityId = window._editingEntityId;
    const editingEntity = editingEntityId ? getEntityById(editingEntityId) : null;
    const latLng = editingEntity ? editingEntity.latLng : window._pendingEntityLatLng;
    const i2EntityData = collectI2EntityFormData();
    if (!i2EntityData) {
      showToast("Select an i2 entity type for this entity", "error");
      return;
    }
    if (i2EntityData && i2EntityData.error) {
      showToast(i2EntityData.error, "error");
      return;
    }
    
    if (!categoryKey || isNaN(iconIndex) || !latLng) {
      showToast("Please fill in all required fields", "error");
      return;
    }
    
    const category = ICON_CATEGORIES[categoryKey];
    const iconData = {...category.icons[iconIndex]};
    iconData.categoryColor = category.color;
    iconData.categoryName = category.name;
    const label = inferEntityLabel(rawLabel, i2EntityData, iconData.name);
    const manualPlacementNumber = String(document.getElementById("entity-placement-number")?.value || "").trim();
    const manualPlacementAddress = String(document.getElementById("entity-placement-address")?.value || "").trim();
    const address = inferEntityAddress(i2EntityData) || manualPlacementAddress;
    const notes = inferEntityNotes(i2EntityData);
    if (!label) {
      showToast("Please enter a label or complete i2 name fields", "error");
      return;
    }
    
    // Prefer full-address geocode first for house-level precision; fallback to postcode centroid.
    let placementLatLng = latLng;
    const postcode = getI2ValueByNames(i2EntityData, ["Post Code", "Postal Code", "Postcode"]);
    const addressString = getI2ValueByNames(i2EntityData, ["Address String", "Address"]) || manualPlacementAddress;
    const i2BuildingNumber = getI2ValueByNames(i2EntityData, ["Building Number", "House Number"]);
    const preferredNumber = i2BuildingNumber || manualPlacementNumber;
    const hasLeadingNumber = /^\s*\d+[A-Za-z]?\b/.test(addressString || "");
    const geocodeAddressString = preferredNumber && addressString && !hasLeadingNumber
      ? `${preferredNumber} ${addressString}`
      : (addressString || "");
    const extractedPostcode = !postcode ? extractUkPostcode(geocodeAddressString) : "";
    let geoMethod = "";
    const parsedAddress = parseAddressString(geocodeAddressString || "") || null;
    const hasSpecificAddress = !!((preferredNumber || parsedAddress?.buildingNumber || parsedAddress?.streetName));
    if (geocodeAddressString) {
      const geoAddress = await geocodeAddress(geocodeAddressString, { strict: true });
      if (geoAddress && Number.isFinite(geoAddress.lat) && Number.isFinite(geoAddress.lon)) {
        placementLatLng = [geoAddress.lat, geoAddress.lon];
        geoMethod = "address";
      }
    }
    if (!geoMethod && geocodeAddressString && hasSpecificAddress) {
      const geoRelaxed = await geocodeAddress(geocodeAddressString, { strict: false });
      if (geoRelaxed && Number.isFinite(geoRelaxed.lat) && Number.isFinite(geoRelaxed.lon)) {
        placementLatLng = [geoRelaxed.lat, geoRelaxed.lon];
        geoMethod = "address_relaxed";
        showToast("Exact house match unavailable; using closest address result", "warning");
      }
    }
    const geoPostcode = postcode || extractedPostcode;
    if (!geoMethod && geoPostcode) {
      const geo = await geocodePostcode(geoPostcode);
      if (geo && Number.isFinite(geo.lat) && Number.isFinite(geo.lon)) {
        placementLatLng = [geo.lat, geo.lon];
        geoMethod = hasSpecificAddress ? "postcode_fallback" : "postcode";
        if (geoMethod === "postcode_fallback") {
          showToast("Address unresolved at house level; using postcode centroid", "warning");
        }
      }
    }
    if (!geoMethod && hasSpecificAddress && !geoPostcode) {
      showToast("Exact address match not found; entity not placed", "error");
      setStatus("Address geocode failed: no exact house-level match found");
      return;
    }

    if (editingEntity) {
      editingEntity.label = label;
      editingEntity.address = address;
      editingEntity.notes = notes;
      editingEntity.iconData = iconData;
      editingEntity.i2EntityData = i2EntityData;
      editingEntity.latLng = placementLatLng;

      if (window.EntityStore && window.EntityStore.getEntity(editingEntityId)) {
        const existing = window.EntityStore.getEntity(editingEntityId);
        const mergedAttrs = { ...(existing?.attributes || {}) };
        mergedAttrs.address = address;
        mergedAttrs.notes = notes;
        window.EntityStore.updateEntity(editingEntityId, {
          label,
          attributes: mergedAttrs,
          latLng: placementLatLng
        });
      }

      editingEntity.marker.setLatLng(placementLatLng);
      editingEntity.marker.setIcon(createEntityMarkerIcon(iconData, i2EntityData));
      editingEntity.marker.setPopupContent(buildEntityPopup(editingEntityId, editingEntity));
      bindEntityHoverTooltip(editingEntity.marker, editingEntity);
      refreshConnectionsForEntity(editingEntityId);
      refreshEntitySelectionStyles();
      map.panTo(placementLatLng);

      closeEntityPanel();
      setStatus(
        geoMethod === "address" ? `Updated: ${label} (full address geocoded)` :
        geoMethod === "address_relaxed" ? `Updated: ${label} (closest address geocoded)` :
        geoMethod === "postcode_fallback" ? `Updated: ${label} (postcode fallback)` :
        geoMethod === "postcode" ? `Updated: ${label} (postcode geocoded)` :
        `Updated: ${label}`
      );
      triggerGoogleEnrichmentForEntity(editingEntityId, true);
      return;
    }

    // Place new entity
    const newEntityId = placeEntity(placementLatLng, iconData, label, address, notes, i2EntityData);
    map.panTo(placementLatLng);
    closeEntityPanel();
    setStatus(
      geoMethod === "address" ? `Placed: ${label} (full address geocoded)` :
      geoMethod === "address_relaxed" ? `Placed: ${label} (closest address geocoded)` :
      geoMethod === "postcode_fallback" ? `Placed: ${label} (postcode fallback)` :
      geoMethod === "postcode" ? `Placed: ${label} (postcode geocoded)` :
      `Placed: ${label}`
    );
    if (newEntityId) triggerGoogleEnrichmentForEntity(newEntityId, true);
  });
  
  // Close button handlers
  entityPanelMinimize?.addEventListener('click', toggleEntityPanelMinimized);
  entityPanelClose?.addEventListener('click', closeEntityPanel);
  entityCancelBtn?.addEventListener('click', closeEntityPanel);

  // Show a preview card for imported documents (non-entity, non-intel files)
  async function showDocumentPreview(file, text, summaryEl) {
    const analyser = window.DocConverter?.analyseFile;
    let meta = null;
    if (analyser) {
      try { meta = await analyser(file); } catch (e) { console.warn("Analyse failed:", e); }
    }
    const originator = meta?.originator || "Unknown Source";
    const description = meta?.description || "Document";
    const concerns = meta?.concerns || file.name;
    const preview = text.length > 1200 ? text.substring(0, 1200) + "\u2026" : text;

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div class="doc-preview-card">
          <div class="doc-preview-header">
            <span class="doc-preview-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
            <span class="dc-badge dc-badge-orig">${escapeHtml(originator)}</span>
          </div>
          <div class="doc-preview-subject">${escapeHtml(concerns)}</div>
          <div class="doc-preview-desc">${escapeHtml(description)}</div>
          <div class="doc-preview-body"><pre class="dc-preview-text">${escapeHtml(preview)}</pre></div>
          ${text.length > 1200 ? '<button class="doc-preview-expand">Show full text</button>' : ""}
        </div>`;
      const expandBtn = summaryEl.querySelector(".doc-preview-expand");
      if (expandBtn) {
        expandBtn.addEventListener("click", () => {
          const pre = summaryEl.querySelector(".dc-preview-text");
          if (pre) pre.textContent = text;
          expandBtn.remove();
        });
      }
    }
    setStatus(`Previewing: ${file.name} (${originator})`);
    showToast(`${originator} document loaded â€” preview below`, "success", 3000);
  }

  entityImportRunBtn?.addEventListener('click', async () => {
    const file = entityImportFile?.files?.[0];
    const summaryEl = document.getElementById('entity-import-summary');
    if (!file) {
      if (summaryEl) summaryEl.textContent = 'Choose a file first (xlsx/csv/tsv/txt/json/geojson).';
      return;
    }

    if (summaryEl) summaryEl.textContent = `Parsing ${file.name}...`;
    setStatus(`Importing ${file.name}...`);
    if (entityImportRunBtn) entityImportRunBtn.disabled = true;
    try {
      const ext = (String(file.name).split(".").pop() || "").toLowerCase();
      if (["xlsx", "xls"].includes(ext)) {
        const rows = await readSpreadsheetRows(file);
        await importEntitiesFromRows(rows);
      } else if (ext === "pdf") {
        if (!window.pdfjsLib) throw new Error("PDF.js not loaded");
        const buf = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        const pages = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          pages.push(tc.items.map(item => item.str).join(" "));
        }
        const text = pages.join("\n");
        if (window.IntelImport?.detectIntelReport(text)) {
          await window.IntelImport.importFromText(text, file.name);
        } else {
          showDocumentPreview(file, text, summaryEl);
        }
      } else if (["csv", "tsv", "txt"].includes(ext)) {
        const text = await file.text();
        if (window.IntelImport?.detectIntelReport(text)) {
          await window.IntelImport.importFromText(text, file.name);
        } else {
          const rows = parseDelimitedRows(text, detectDelimiter(text));
          await importEntitiesFromRows(rows);
        }
      } else if (["docx", "doc", "rtf", "html", "htm", "xml", "odt"].includes(ext)) {
        const extractor = window.DocConverter?.extractText;
        if (!extractor) throw new Error("Document extractor not loaded");
        const text = await extractor(file);
        if (window.IntelImport?.detectIntelReport(text)) {
          await window.IntelImport.importFromText(text, file.name);
        } else {
          showDocumentPreview(file, text, summaryEl);
        }
      } else if (["geojson"].includes(ext)) {
        await importGeoJsonFile(file);
      } else if (["json"].includes(ext)) {
        await importJsonRowsFile(file);
      } else {
        throw new Error(`Unsupported file type .${ext || "unknown"}`);
      }
    } catch (err) {
      console.error('Entity import failed:', err);
      if (summaryEl) summaryEl.textContent = `Import failed: ${err.message || err}`;
      setStatus('Entity import failed');
      showToast(`Import failed: ${err.message || err}`, "error", 3200);
    } finally {
      if (entityImportRunBtn) entityImportRunBtn.disabled = false;
    }
  });

  entityImportTemplateBtn?.addEventListener('click', () => {
    const a = document.createElement("a");
    a.href = "data/example import.xlsx";
    a.download = "example import.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatus("Downloaded import template");
    showToast("Template downloaded", "success");
  });

  if (entityImportPanel && entityImportFile) {
    entityImportFile.addEventListener("change", () => {
      const chosen = entityImportFile.files?.[0];
      const summaryEl = document.getElementById('entity-import-summary');
      if (chosen && summaryEl) {
        summaryEl.textContent = `Selected: ${chosen.name}. Click "Import And Plot".`;
      }
    });
    entityImportPanel.addEventListener("dragover", (e) => {
      e.preventDefault();
      entityImportPanel.classList.add("dragover");
    });
    entityImportPanel.addEventListener("dragleave", () => {
      entityImportPanel.classList.remove("dragover");
    });
    entityImportPanel.addEventListener("drop", (e) => {
      e.preventDefault();
      entityImportPanel.classList.remove("dragover");
      const dropped = e.dataTransfer?.files?.[0];
      if (!dropped) return;
      const dt = new DataTransfer();
      dt.items.add(dropped);
      entityImportFile.files = dt.files;
      const summaryEl = document.getElementById('entity-import-summary');
      if (summaryEl) summaryEl.textContent = `Selected: ${dropped.name}. Click "Import And Plot".`;
    });
  }

  entityImportClearBtn?.addEventListener('click', () => {
    if (window._importedEntityIds.size === 0) {
      const summaryEl = document.getElementById('entity-import-summary');
      if (summaryEl) summaryEl.textContent = 'No imported entities to clear.';
      return;
    }
    clearImportedEntities();
  });

  entitySelectBoxBtn?.addEventListener('click', () => toggleEntityBoxSelectMode());
  entitySelectAllBtn?.addEventListener('click', () => selectAllEntities());

  // Map toolbar â€” floating quick-action buttons on the map canvas
  document.getElementById("map-tb-boxselect")?.addEventListener("click", () => toggleEntityBoxSelectMode());
  document.getElementById("map-tb-selectall")?.addEventListener("click", () => selectAllEntities());
  entityExportExcelBtn?.addEventListener('click', () => exportEntitiesToExcel());

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'a') {
      if (isEditingInputTarget(e.target)) return;
      e.preventDefault();
      selectAllEntities();
    }
    if (String(e.key || "") === "Escape" && entityBoxSelectMode) {
      toggleEntityBoxSelectMode(false);
    }
  });

  const resultsDiv = document.getElementById("ch_results");
  const pscResultsDiv = document.getElementById("psc_results");
  const btn        = document.getElementById("ch_search");
  const clearBtn   = document.getElementById("ch_clear");
  const pscBtn     = document.getElementById("psc_search");
  const pscClearBtn = document.getElementById("psc_clear");
  const toggleBtn  = document.getElementById("cp-toggle");
  const body       = document.getElementById("cp-body");
  const cpMenuBtn = document.getElementById("cp-menu-btn");
  const cpMenu = document.getElementById("cp-menu");
  const controlPanel = document.getElementById("control-panel");
  const controlPanelHeader = controlPanel?.querySelector(".cp-header");
  const entityPanel = document.getElementById("entity-placement-panel");
  const mobilePanelToggle = document.getElementById("mobile-panel-toggle");
  const mobileViewport = window.matchMedia("(max-width: 920px)");
  let mobilePanelHidden = false;
  const inputs = ["ch_name","ch_number","ch_postcode","ch_town"]
    .map(id => document.getElementById(id)).filter(Boolean);
  const pscInputs = ["psc_name","psc_company"]
    .map(id => document.getElementById(id)).filter(Boolean);

  function applyMobilePanelState(hidden) {
    if (!controlPanel || !mobilePanelToggle) return;
    mobilePanelHidden = !!hidden;
    const shouldHide = mobileViewport.matches && mobilePanelHidden;
    controlPanel.classList.toggle("mobile-hidden", shouldHide);
    mobilePanelToggle.textContent = shouldHide ? "Panel" : "Hide";
    mobilePanelToggle.setAttribute("aria-expanded", shouldHide ? "false" : "true");
    mobilePanelToggle.setAttribute("title", shouldHide ? "Show control panel" : "Hide control panel");
  }

  function syncMobileViewportLayout() {
    if (!controlPanel || !mobilePanelToggle) return;
    if (mobileViewport.matches) {
      if (!mobilePanelToggle.dataset.mobileInitDone) {
        mobilePanelToggle.dataset.mobileInitDone = "1";
        mobilePanelHidden = true;
      }
      applyMobilePanelState(mobilePanelHidden);
    } else {
      mobilePanelHidden = false;
      controlPanel.classList.remove("mobile-hidden");
      mobilePanelToggle.textContent = "Panel";
      mobilePanelToggle.setAttribute("aria-expanded", "true");
      mobilePanelToggle.setAttribute("title", "Toggle control panel");
    }
    map.invalidateSize(false);
  }

  mobilePanelToggle?.addEventListener("click", () => {
    applyMobilePanelState(!mobilePanelHidden);
    map.invalidateSize(false);
  });

  mobileViewport.addEventListener("change", syncMobileViewportLayout);
  syncMobileViewportLayout();
  makePanelDraggable(controlPanel, controlPanelHeader);
  makePanelDraggable(entityPanel, document.querySelector(".entity-panel-header"));

  map.on("click", () => {
    if (!mobileViewport.matches || mobilePanelHidden) return;
    if (window._placementMode || entityBoxSelectMode) return;
    applyMobilePanelState(true);
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ Panel collapse Ã¢â€â‚¬Ã¢â€â‚¬
  toggleBtn?.addEventListener("click", () => {
    body.classList.toggle("collapsed");
    toggleBtn.textContent = body.classList.contains("collapsed") ? "+" : "\u2212";
  });

  function activateControlPanelTab(tabId = "search") {
    const tab = document.querySelector(`.cp-tab[data-tab="${tabId}"]`);
    if (!tab) return;
    document.querySelectorAll(".cp-tab").forEach(t => {
      t.classList.remove("active");
      t.setAttribute("aria-selected", "false");
      t.setAttribute("tabindex", "-1");
    });
    document.querySelectorAll(".cp-tab-pane").forEach(p => {
      p.classList.remove("active");
      p.setAttribute("aria-hidden", "true");
    });
    tab.classList.add("active");
    tab.setAttribute("aria-selected", "true");
    tab.setAttribute("tabindex", "0");
    const pane = document.getElementById("tab-" + tab.dataset.tab);
    pane?.classList.add("active");
    pane?.setAttribute("aria-hidden", "false");
    controlPanel?.classList.remove("control-panel-layers-docked");
    window.__CONTROL_ROOM_ACTIVE_TAB = tabId;
    document.dispatchEvent(new CustomEvent("controlroom:tabchange", { detail: { tab: tabId } }));
  }

  // Tabs
  document.querySelectorAll(".cp-tab").forEach(tab => {
    tab.addEventListener("click", () => activateControlPanelTab(tab.dataset.tab));
  });
  document.querySelector(".cp-tabs")?.addEventListener("keydown", (e) => {
    const tabs = Array.from(document.querySelectorAll(".cp-tab"));
    const idx = tabs.indexOf(document.activeElement);
    if (idx < 0) return;
    let nextIdx = idx;
    if (e.key === "ArrowRight") nextIdx = (idx + 1) % tabs.length;
    if (e.key === "ArrowLeft") nextIdx = (idx - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") nextIdx = 0;
    if (e.key === "End") nextIdx = tabs.length - 1;
    if (nextIdx !== idx) {
      e.preventDefault();
      tabs[nextIdx].focus();
      activateControlPanelTab(tabs[nextIdx].dataset.tab);
    }
  });

  // Top menu dropdown
  cpMenuBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = !cpMenu?.classList.contains("hidden");
    cpMenu?.classList.toggle("hidden", open);
    cpMenu?.setAttribute("aria-hidden", open ? "true" : "false");
  });

  cpMenu?.querySelectorAll("[data-tab-target]")?.forEach((btnEl) => {
    btnEl.addEventListener("click", () => {
      const tabId = btnEl.getAttribute("data-tab-target") || "search";
      activateControlPanelTab(tabId);
      cpMenu.classList.add("hidden");
      cpMenu.setAttribute("aria-hidden", "true");
    });
  });

  function setLayerEnabled(layerId, enabled) {
    const cb = document.querySelector(`.layer-cb[data-layer="${layerId}"]`);
    if (!cb) return;
    if (cb.checked === enabled) return;
    cb.checked = !!enabled;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const layerLoadouts = {
    transport: {
      layersOn: ["underground", "national_rail", "service_stations", "bikes"],
      status: "Transport Sweep preset enabled"
    },
    aviation: {
      layersOn: ["airports_uk", "airports_global", "flights"],
      status: "Aviation Watch preset enabled"
    },
    maritime: {
      layersOn: ["seaports", "ships"],
      status: "Maritime Ops preset enabled"
    },
    infrastructure: {
      layersOn: ["cellTowers", "crime", "service_stations"],
      status: "Critical Infrastructure preset enabled"
    }
  };

  const layerPresetButtons = document.querySelectorAll(".layer-preset-btn[data-loadout]");
  const layerResetBtn = document.getElementById("layer-reset-btn");

  function setActiveLayerPreset(loadoutId) {
    layerPresetButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.loadout === loadoutId && !!loadoutId);
    });
  }

  function applyLayerLoadout(loadoutId) {
    const preset = layerLoadouts[loadoutId];
    if (!preset) return;
    (preset.layersOff || []).forEach((layerId) => setLayerEnabled(layerId, false));
    (preset.layersOn || []).forEach((layerId) => setLayerEnabled(layerId, true));
    setActiveLayerPreset(loadoutId);
    if (preset.status) setStatus(preset.status);
    showToast(`${preset.status || "Preset applied"}`, "success", 2200);
  }

  function resetLayerCatalog() {
    setActiveLayerPreset(null);
    document.querySelectorAll(".layer-cb").forEach((cb) => {
      const keepEnabled = cb.dataset.layer === "companies";
      setLayerEnabled(cb.dataset.layer, keepEnabled);
    });
    setStatus("Layer catalog reset to baseline");
    showToast("Layer catalog reset", "info", 2000);
  }

  layerPresetButtons.forEach((btn) => {
    btn.addEventListener("click", () => applyLayerLoadout(btn.dataset.loadout));
  });
  layerResetBtn?.addEventListener("click", resetLayerCatalog);

  const layerGroups = Array.from(document.querySelectorAll("#tab-layers details.layer-group"));
  const layerSearchInput = document.getElementById("layer-search-input");
  const layerSearchClearBtn = document.getElementById("layer-search-clear");
  const layerSearchEmpty = document.getElementById("layer-search-empty");

  function applyLayerSearchFilter(rawQuery = "") {
    const query = String(rawQuery || "").trim().toLowerCase();
    let visibleCount = 0;
    layerGroups.forEach((group) => {
      const rows = Array.from(group.querySelectorAll(".layer-row"));
      let groupVisible = false;
      rows.forEach((row) => {
        const target = (row.dataset.layerName || row.querySelector(".layer-name")?.textContent || "").toLowerCase();
        const match = !query || target.includes(query);
        row.classList.toggle("layer-row-hidden", !match);
        if (match) {
          groupVisible = true;
          visibleCount++;
        }
      });
      group.classList.toggle("layer-group-hidden", !groupVisible);
    });
    if (layerSearchEmpty) layerSearchEmpty.classList.toggle("hidden", !!visibleCount || !query);
  }

  layerSearchInput?.addEventListener("input", (ev) => applyLayerSearchFilter(ev.target.value));
  layerSearchInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      layerSearchInput.value = "";
      applyLayerSearchFilter("");
    }
  });
  layerSearchClearBtn?.addEventListener("click", () => {
    if (!layerSearchInput) return;
    layerSearchInput.value = "";
    applyLayerSearchFilter("");
    layerSearchInput.focus();
  });
  applyLayerSearchFilter("");

  document.addEventListener("click", (e) => {
    if (!cpMenu || !cpMenuBtn) return;
    if (cpMenu.classList.contains("hidden")) return;
    if (cpMenu.contains(e.target) || cpMenuBtn.contains(e.target)) return;
    cpMenu.classList.add("hidden");
    cpMenu.setAttribute("aria-hidden", "true");
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ Base layer pills Ã¢â€â‚¬Ã¢â€â‚¬
  document.querySelectorAll("#base-pills [data-base]").forEach(pill => {
    pill.addEventListener("click", () => {
      const name = pill.dataset.base;
      if (name === activeBase) return;
      map.removeLayer(baseLayers[activeBase]);
      baseLayers[name].addTo(map);
      activeBase = name;
      document.querySelectorAll("#base-pills [data-base]").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
    });
  });

  // â”€â”€ UI Theme select â”€â”€
  (function initThemeSelect() {
    const sel = document.getElementById("theme-select");
    const swatch = document.getElementById("theme-swatch-indicator");
    const allowedThemes = new Set(["indigo", "light", "noir", "warm", "arctic", "teal", "rose"]);
    const swatchColors = { indigo: "#6366f1", light: "#2563eb", noir: "#475569", warm: "#f59e0b", arctic: "#38bdf8", teal: "#2dd4bf", rose: "#f472b6" };
    const savedRaw = localStorage.getItem("cr-theme") || "indigo";
    const saved = allowedThemes.has(savedRaw) ? savedRaw : "indigo";
    document.documentElement.dataset.theme = saved;
    if (sel) {
      sel.value = saved;
      sel.addEventListener("change", () => {
        const theme = sel.value;
        if (!allowedThemes.has(theme)) return;
        document.documentElement.dataset.theme = theme;
        localStorage.setItem("cr-theme", theme);
        if (swatch) swatch.style.background = swatchColors[theme] || "#6366f1";
        rebuildBaseLayersForTheme(theme);
      });
    }
    if (swatch) swatch.style.background = swatchColors[saved] || "#6366f1";
  })();

  (function initDisclosureAccordion() {
    const groups = document.querySelectorAll(".cp-tab-pane");
    groups.forEach((pane) => {
      // Layers should allow multiple sections open simultaneously.
      if (pane.id === "tab-layers") return;
      const disclosures = pane.querySelectorAll("details.panel-disclosure");
      disclosures.forEach((d) => {
        d.addEventListener("toggle", () => {
          if (!d.open) return;
          disclosures.forEach((other) => {
            if (other !== d) other.open = false;
          });
        });
      });
    });
  })();

  // Ã¢"â‚¬Ã¢"â‚¬ Overlay toggles Ã¢"â‚¬Ã¢"â‚¬
  function syncLayerToolBlocks() {
    document.querySelectorAll("[data-layer-tools]").forEach((el) => {
      const layerId = el.getAttribute("data-layer-tools");
      const cb = document.querySelector(`.layer-cb[data-layer="${layerId}"]`);
      const enabled = !!cb?.checked;
      el.classList.toggle("hidden", !enabled);
    });
  }
document.querySelectorAll(".layer-cb").forEach(cb => {
  cb.addEventListener("change", async () => {
    try {
      const layerId = cb.dataset.layer;
      const layer = layers[layerId];
      if (!layer) return;

      if (cb.checked && layerId === "areas") {
        const ok = await ensurePoliceAreasLoaded();
        if (!ok) { cb.checked = false; return; }
      }
      if (cb.checked && layerId === "crime") {
        const ok = await ensureCrimeLoaded();
        if (!ok) { cb.checked = false; return; }
      }


      if (cb.checked && (layerId === "airports_uk" || layerId === "airports_global" || layerId === "flights")) {
        await ensureAirportsLoaded();
      }

      if (cb.checked && layerId === "seaports") {
        await ensureSeaportsLoaded();
      }
      if (cb.checked && layerId === "ships") {
        const ok = await ensureShipsLoaded();
        if (!ok) { cb.checked = false; return; }
      }

      if (cb.checked && layerId === "service_stations") {
        const ok = await ensureServiceStationsLoaded();
        if (!ok) { cb.checked = false; return; }
      }

      if (cb.checked && layerId === "underground") {
        const ok = await ensureUndergroundLoaded();
        if (!ok) { cb.checked = false; return; }
      }

      if (cb.checked && layerId === "national_rail") {
        if (typeof window.ensureNationalRailLoaded === "function") {
          const ok = await window.ensureNationalRailLoaded();
          if (!ok) { cb.checked = false; return; }
        }
      }

      // ADD THIS BLOCK
      if (cb.checked && layerId === "cellTowers") {
        const ok = await ensureCellTowersLoaded();
        if (!ok) { cb.checked = false; return; }
      }

      if (cb.checked) {
        layer.addTo(map);
      }
      else {
        map.removeLayer(layer);
      }

      if (layerId === "crime") {
        if (cb.checked) {
          CRIME_INCIDENT_LAYER?.addTo(map);
        } else {
          if (CRIME_INCIDENT_LAYER && map.hasLayer(CRIME_INCIDENT_LAYER)) {
            map.removeLayer(CRIME_INCIDENT_LAYER);
          }
          clearCrimeInspector();
        }
      }

      // Log layer toggle
      if (window.CRDashboard) {
        window.CRDashboard.logActivity(
          cb.checked ? "Layer enabled" : "Layer disabled",
          layerId,
          "layer"
        );
      }

    } finally {
      syncLayerToolBlocks();
      updateDashboardCounts();
    }
  });
});

  syncLayerToolBlocks();
  updateDashboardCounts();

  const LAYER_PREFETCH_KEY = "cr-layer-prefetch";
  const LAYER_PREFETCH_DISABLED_VALUE = "off";
  let layerPrefetchQueue = null;
  let layerPrefetchRunning = false;
  let layerPrefetchHandle = null;
  let layerPrefetchHooksBound = false;

  function shouldEnableLayerPrefetch() {
    if (localStorage.getItem(LAYER_PREFETCH_KEY) === LAYER_PREFETCH_DISABLED_VALUE) return false;
    const conn = navigator.connection;
    if (conn && (conn.saveData || conn.effectiveType === "2g")) return false;
    return true;
  }

  function buildLayerPrefetchQueue() {
    const jobs = [];
    const pushJob = (id, loader) => {
      if (typeof loader !== "function") return;
      jobs.push({ id, loader });
    };
    if (typeof ensureAirportsLoaded === "function") pushJob("airports", () => ensureAirportsLoaded());
    if (typeof ensureSeaportsLoaded === "function") pushJob("seaports", () => ensureSeaportsLoaded());
    if (typeof ensureServiceStationsLoaded === "function") pushJob("service_stations", () => ensureServiceStationsLoaded());
    if (typeof ensureUndergroundLoaded === "function") pushJob("underground", () => ensureUndergroundLoaded());
    if (typeof ensureCellTowersLoaded === "function") pushJob("cell_towers", () => ensureCellTowersLoaded());
    if (typeof ensureShipsLoaded === "function") pushJob("ships", () => ensureShipsLoaded());
    if (typeof window.ensureNationalRailLoaded === "function") {
      pushJob("national_rail", () => window.ensureNationalRailLoaded());
    }
    return jobs;
  }

  function clearLayerPrefetchHandle() {
    if (layerPrefetchHandle == null) return;
    if (typeof window.cancelIdleCallback === "function") {
      try { window.cancelIdleCallback(layerPrefetchHandle); }
      catch (_) { window.clearTimeout(layerPrefetchHandle); }
    } else {
      window.clearTimeout(layerPrefetchHandle);
    }
    layerPrefetchHandle = null;
  }

  function scheduleLayerPrefetchNext(delayOverride) {
    if (!layerPrefetchQueue || !layerPrefetchQueue.length) {
      layerPrefetchRunning = false;
      return;
    }
    clearLayerPrefetchHandle();
    const baseDelay = document.hidden ? 6000 : 2400;
    const delay = typeof delayOverride === "number" ? delayOverride : baseDelay;
    if (typeof window.requestIdleCallback === "function" && !document.hidden) {
      layerPrefetchHandle = window.requestIdleCallback(runLayerPrefetchJob, { timeout: delay });
    } else {
      layerPrefetchHandle = window.setTimeout(() => runLayerPrefetchJob(), delay);
    }
  }

  function runLayerPrefetchJob(deadline) {
    if (!layerPrefetchQueue || !layerPrefetchQueue.length) {
      layerPrefetchRunning = false;
      return;
    }
    if (deadline && !deadline.didTimeout && typeof deadline.timeRemaining === "function" && deadline.timeRemaining() < 8) {
      scheduleLayerPrefetchNext(1000);
      return;
    }
    const job = layerPrefetchQueue.shift();
    Promise.resolve()
      .then(() => job.loader())
      .then(() => console.debug(`[Prefetch] Layer ${job.id} warmed`))
      .catch((err) => console.warn(`[Prefetch] ${job.id} prefetch failed`, err))
      .finally(() => scheduleLayerPrefetchNext());
  }

  function startLayerPrefetch(reason) {
    if (layerPrefetchRunning) return;
    if (!shouldEnableLayerPrefetch()) return;
    if (!layerPrefetchQueue || !layerPrefetchQueue.length) {
      layerPrefetchQueue = buildLayerPrefetchQueue();
    }
    if (!layerPrefetchQueue.length) return;
    layerPrefetchRunning = true;
    const initialDelay = reason === "focus" ? 1200 : 3200;
    scheduleLayerPrefetchNext(initialDelay);
  }

  function initLayerPrefetchHooks() {
    if (layerPrefetchHooksBound) return;
    layerPrefetchHooksBound = true;
    if (!window.CRPrefetch) {
      window.CRPrefetch = {
        enable() {
          localStorage.removeItem(LAYER_PREFETCH_KEY);
          layerPrefetchQueue = buildLayerPrefetchQueue();
          layerPrefetchRunning = false;
          startLayerPrefetch("manual");
          updateLayerSummaryCards();
        },
        disable() {
          localStorage.setItem(LAYER_PREFETCH_KEY, LAYER_PREFETCH_DISABLED_VALUE);
          clearLayerPrefetchHandle();
          layerPrefetchQueue = null;
          layerPrefetchRunning = false;
          updateLayerSummaryCards();
        },
        get enabled() {
          return shouldEnableLayerPrefetch();
        }
      };
    }
    setTimeout(() => startLayerPrefetch("timeout"), 4200);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) startLayerPrefetch("visible");
    });
    window.addEventListener("focus", () => startLayerPrefetch("focus"), { passive: true });
    startLayerPrefetch("initial");
  }
  initLayerPrefetchHooks();

  // â”€â”€ Railway mode pills â”€â”€
  document.querySelectorAll("[data-rail-mode]").forEach(pill => {
    pill.addEventListener("click", () => {
      const mode = pill.dataset.railMode;
      document.querySelectorAll("[data-rail-mode]").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      if (window.setNrLineMode) window.setNrLineMode(mode);
    });
  });

  const airportSearchInput = document.getElementById("airport-search-q");
  const airportSearchBtn = document.getElementById("airport-search-btn");
  const airportSearchClearBtn = document.getElementById("airport-search-clear-btn");
  const ssFilterFuel = document.getElementById("ss-filter-fuel");
  const ssFilterCharging = document.getElementById("ss-filter-charging");
  const ssFilterVehicle = document.getElementById("ss-filter-vehicle");
  const ssFilterTruck = document.getElementById("ss-filter-truck");
  const ssFilterGeneral = document.getElementById("ss-filter-general");
  const ssFilterAllBtn = document.getElementById("ss-filter-all-btn");
  const ssFilterNoneBtn = document.getElementById("ss-filter-none-btn");
  const runAirportSearch = async () => {
    const q = String(airportSearchInput?.value || "").trim();
    if (!q) {
      renderAirportSearchResults([]);
      return;
    }
    const ok = await ensureAirportsLoaded();
    if (!ok) {
      const wrap = document.getElementById("airport-search-results");
      if (wrap) wrap.innerHTML = `<div class="nr-empty">Airport dataset unavailable.</div>`;
      return;
    }
    const hits = searchAirports(q, 12);
    renderAirportSearchResults(hits);
    if (hits.length === 1) {
      focusAirportOnMap(hits[0]);
    }
  };
  airportSearchBtn?.addEventListener("click", runAirportSearch);
  airportSearchInput?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      runAirportSearch();
    }
  });
  airportSearchClearBtn?.addEventListener("click", () => {
    if (airportSearchInput) airportSearchInput.value = "";
    const wrap = document.getElementById("airport-search-results");
    if (wrap) wrap.innerHTML = "";
  });

  [ssFilterFuel, ssFilterCharging, ssFilterVehicle, ssFilterTruck, ssFilterGeneral].forEach((el) => {
    el?.addEventListener("change", syncServiceStationFilterFromUI);
  });
  ssFilterAllBtn?.addEventListener("click", () => setServiceStationFiltersAll(true));
  ssFilterNoneBtn?.addEventListener("click", () => setServiceStationFiltersAll(false));

  // Ã¢â€â‚¬Ã¢â€â‚¬ Live company search DISABLED (now using API on button click) Ã¢â€â‚¬Ã¢â€â‚¬
  // const debouncedSearch = debounce(() => liveSearch(resultsDiv), 300);
  // inputs.forEach(input => input.addEventListener("input", debouncedSearch));

  // Ã¢â€â‚¬Ã¢â€â‚¬ Full company search (NOW USES API) Ã¢â€â‚¬Ã¢â€â‚¬
  const runSearch = async () => {
    const criteria = getCriteriaFromUI();
    if (!pickSeed(criteria).trim()) return;
    
    showProgress(); 
    setProgress(0, 1, 0);
    setStatus("Searching via API...");
    setSkeletonVisible("ch-results-skeleton", true);
    resultsDiv.innerHTML = '<div class="ch-loading">Searching Companies House API...</div>';
    
    try {
      const matches = await searchCompaniesViaAPI(criteria, 100);

      hideProgress();
      setSkeletonVisible("ch-results-skeleton", false);
      CH_LAST_RESULTS = matches;
      renderResults(resultsDiv, matches, false);

      // Log to search history
      if (window.CRDashboard) {
        const query = criteria.name || criteria.number || criteria.postcode || "search";
        window.CRDashboard.addSearchHistory("company", query, matches.length, {
          name: criteria.name, number: criteria.number
        });
      }

      if (matches.length) {
        setStatus(`Search returned ${matches.length} result${matches.length === 1 ? "" : "s"} - click entries to plot selected companies`);
      } else {
        setStatus("No matches found");
      }
    } catch (error) {
      hideProgress();
      setSkeletonVisible("ch-results-skeleton", false);
      console.error("Search error:", error);
      resultsDiv.innerHTML = '<div class="ch-error">Search failed. Check console for details.</div>';
      setStatus("Search failed");
      showToast("Search failed. Check connection or API proxy.", "error");
    }
  };
  btn?.addEventListener("click", runSearch);
  inputs.forEach(input => input.addEventListener("keydown", e => { if (e.key === "Enter") runSearch(); }));

  // Ã¢â€â‚¬Ã¢â€â‚¬ Clear company Ã¢â€â‚¬Ã¢â€â‚¬
  clearBtn?.addEventListener("click", clearAll);

  // Ã¢â€â‚¬Ã¢â€â‚¬ PSC search Ã¢â€â‚¬Ã¢â€â‚¬
  pscBtn?.addEventListener("click", runPscSearch);
  pscInputs.forEach(input => input.addEventListener("keydown", e => { if (e.key === "Enter") runPscSearch(); }));

  // Ã¢â€â‚¬Ã¢â€â‚¬ Clear PSC Ã¢â€â‚¬Ã¢â€â‚¬
  pscClearBtn?.addEventListener("click", clearPsc);
});
