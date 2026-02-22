// ================== ux_assistant.js ==================
// Command palette + lightweight workflow helpers.
(function () {
  "use strict";

  const STATE = {
    open: false,
    selectedIndex: 0,
    filtered: [],
    built: false
  };

  const IDS = {
    overlay: "cr-cmd-overlay",
    input: "cr-cmd-input",
    list: "cr-cmd-list",
    hint: "cr-cmd-hint"
  };

  function byId(id) { return document.getElementById(id); }

  function isInputLike(el) {
    if (!el) return false;
    const tag = String(el.tagName || "").toLowerCase();
    if (tag === "textarea" || tag === "select") return true;
    if (tag === "input") return true;
    return !!el.isContentEditable;
  }

  function click(id) { byId(id)?.click(); }

  function activeTab() {
    return String(window.__CONTROL_ROOM_ACTIVE_TAB || "search");
  }

  function focusFirstVisible(ids) {
    for (const id of ids) {
      const el = byId(id);
      if (!el) continue;
      const hidden = el.offsetParent === null;
      if (hidden) continue;
      el.focus();
      return true;
    }
    return false;
  }

  function fitMapToAllEntities() {
    const map = window._map;
    const entities = Array.isArray(window._mapEntities) ? window._mapEntities : [];
    if (!map || !entities.length || !window.L || !window.L.latLngBounds) {
      window.showToast?.("No entities to fit", "info");
      return;
    }
    const points = entities
      .map((e) => (Array.isArray(e?.latLng) ? e.latLng : null))
      .filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!points.length) {
      window.showToast?.("No valid entity coordinates", "info");
      return;
    }
    const bounds = window.L.latLngBounds(points);
    map.fitBounds(bounds, { padding: [42, 42], maxZoom: 15 });
    window.setStatus?.(`Focused ${points.length} entities`);
  }

  function baseMapAction(baseName) {
    return () => {
      const btn = document.querySelector(`#base-pills .kpi-pill[data-base="${baseName}"]`);
      if (!btn) {
        window.showToast?.(`Base map "${baseName}" unavailable`, "error");
        return;
      }
      btn.click();
    };
  }

  function openSearchAndFocus() {
    click("cp-tab-btn-search");
    focusFirstVisible(["ch_name", "ch_api_search", "psc_name"]);
  }

  function openEntitiesAndPlace() {
    click("cp-tab-btn-entities");
    if (typeof window.startI2EntityPlacement === "function") {
      const categories = Object.keys(window.ICON_CATEGORIES || {});
      if (categories.length) {
        window.startI2EntityPlacement(categories[0]);
        window.showToast?.("Select a map point to place the new entity", "info");
        return;
      }
    }
    focusFirstVisible(["entity-search-input", "entity-category"]);
    window.showToast?.("Select an entity type to begin placement", "info");
  }

  function openLayersAndFocusSearch() {
    click("cp-tab-btn-layers");
    focusFirstVisible(["layer-search-input", "crime-force-search"]);
  }

  function runGoogleProbe() {
    click("google-api-selftest-btn");
  }

  async function enrichSelected() {
    const ids = Array.from(window._selectedEntityIds || []);
    if (!ids.length) {
      window.showToast?.("Select one or more entities first", "info");
      return;
    }
    if (!window.GoogleIntelligenceService?.isConfigured?.()) {
      window.showToast?.("Google key not configured", "error");
      return;
    }
    let ok = 0;
    for (const id of ids) {
      const res = await window.GoogleIntelligenceService.enrichEntityInStore(id, { includeEnvironment: true }).catch(() => null);
      if (res?.ok) ok += 1;
    }
    window.showToast?.(`Enriched ${ok}/${ids.length} selected`, ok ? "success" : "info");
  }

  function zoomToSelection() {
    const ids = Array.from(window._selectedEntityIds || []);
    if (!ids.length) return fitMapToAllEntities();
    const entities = ids
      .map((id) => (window.EntityStore?.getEntity?.(id) || (window._mapEntities || []).find((e) => e.id === id) || null))
      .filter(Boolean);
    const pts = entities
      .map((e) => e.latLng)
      .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!pts.length) return;
    if (window._map && window.L?.latLngBounds) {
      window._map.fitBounds(window.L.latLngBounds(pts), { padding: [60, 60], maxZoom: 16 });
      window.setStatus?.(`Focused ${pts.length} selected entities`);
    }
  }

  function commands() {
    return [
      { id: "declutter", title: "UI: Declutter / Collapse Menus", hint: "Collapse open menus and overlays", keys: "declutter collapse menus", run: collapseAllMenus },
      { id: "search", title: "Search: Company / Officer", hint: "Open Search tab and focus input", keys: "s find company officer", run: openSearchAndFocus },
      { id: "entities", title: "Entities: Place New", hint: "Open placement workflow", keys: "entity place add", run: openEntitiesAndPlace },
      { id: "layers", title: "Layers: Open + Focus Filter", hint: "Open Layers tab and focus layer search", keys: "layers filter overlay", run: openLayersAndFocusSearch },
      { id: "fit_all", title: "Map: Fit All Entities", hint: "Zoom to all entity markers", keys: "map fit bounds entities", run: fitMapToAllEntities },
      { id: "fit_selected", title: "Map: Zoom to Selection", hint: "Zoom to selected entities", keys: "map zoom selection selected", run: zoomToSelection },
      { id: "base_dark", title: "Base Map: Dark", hint: "Switch base map", keys: "base dark", run: baseMapAction("Dark") },
      { id: "base_grey", title: "Base Map: Grey", hint: "Switch base map", keys: "base grey gray", run: baseMapAction("Grey") },
      { id: "base_street", title: "Base Map: Street", hint: "Switch base map", keys: "base street", run: baseMapAction("Street") },
      { id: "base_sat", title: "Base Map: Satellite", hint: "Switch base map", keys: "base satellite sat", run: baseMapAction("Satellite") },
      { id: "save", title: "Workspace: Quick Save", hint: "Save current workspace", keys: "save workspace", run: () => window.CRDashboard?.saveWorkspace?.("quicksave") },
      { id: "health", title: "System: Refresh Health Checks", hint: "Re-run service checks", keys: "health check services", run: () => window.runSystemHealthChecksNow?.() },
      { id: "google_probe", title: "Google: Run API Probe", hint: "Check Google API response", keys: "google probe test", run: runGoogleProbe },
      { id: "google_enrich", title: "Google: Enrich Selected Entities", hint: "Attach location intelligence", keys: "google enrich selected", run: enrichSelected },
      { id: "help", title: "Help: Keyboard Shortcuts", hint: "Open help overlay", keys: "help shortcuts", run: () => window.CRDashboard?.showShortcutsOverlay?.() }
    ];
  }

  function filterCommands(query) {
    const q = String(query || "").trim().toLowerCase();
    const all = commands();
    if (!q) return all;
    return all
      .map((c) => {
        const hay = `${c.title} ${c.hint} ${c.keys}`.toLowerCase();
        let score = 0;
        if (hay.includes(q)) score += 1;
        if (c.title.toLowerCase().startsWith(q)) score += 2;
        if (c.keys.includes(q)) score += 1;
        return { c, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.c.title.localeCompare(b.c.title))
      .map((x) => x.c);
  }

  function renderList() {
    const list = byId(IDS.list);
    if (!list) return;
    const rows = STATE.filtered.length ? STATE.filtered : [];
    if (!rows.length) {
      list.innerHTML = `<div class="cr-cmd-empty">No actions match this query.</div>`;
      return;
    }
    list.innerHTML = rows.map((c, idx) => {
      const active = idx === STATE.selectedIndex ? " active" : "";
      return `<button type="button" class="cr-cmd-item${active}" data-cmd-id="${c.id}">
        <span class="cr-cmd-title">${c.title}</span>
        <span class="cr-cmd-sub">${c.hint}</span>
      </button>`;
    }).join("");

    list.querySelectorAll(".cr-cmd-item").forEach((el) => {
      el.addEventListener("click", () => {
        const cmd = STATE.filtered.find((c) => c.id === el.getAttribute("data-cmd-id"));
        if (!cmd) return;
        closePalette();
        Promise.resolve(cmd.run?.()).catch(() => {});
      });
    });
  }

  function setQueryAndRender(value) {
    STATE.filtered = filterCommands(value);
    if (STATE.selectedIndex >= STATE.filtered.length) STATE.selectedIndex = 0;
    renderList();
  }

  function openPalette() {
    ensureBuilt();
    const overlay = byId(IDS.overlay);
    const input = byId(IDS.input);
    const hint = byId(IDS.hint);
    if (!overlay || !input) return;
    STATE.open = true;
    STATE.selectedIndex = 0;
    overlay.classList.remove("hidden");
    input.value = "";
    setQueryAndRender("");
    hint.textContent = `Active tab: ${activeTab()}. Enter to run, Esc to close.`;
    window.setTimeout(() => input.focus(), 0);
  }

  function closePalette() {
    const overlay = byId(IDS.overlay);
    if (!overlay) return;
    STATE.open = false;
    overlay.classList.add("hidden");
  }

  function runCurrentSelection() {
    const cmd = STATE.filtered[STATE.selectedIndex];
    if (!cmd) return;
    closePalette();
    Promise.resolve(cmd.run?.()).catch(() => {});
  }

  function onPaletteKeydown(ev) {
    if (!STATE.open) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      closePalette();
      return;
    }
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      STATE.selectedIndex = Math.min(STATE.selectedIndex + 1, Math.max(0, STATE.filtered.length - 1));
      renderList();
      return;
    }
    if (ev.key === "ArrowUp") {
      ev.preventDefault();
      STATE.selectedIndex = Math.max(STATE.selectedIndex - 1, 0);
      renderList();
      return;
    }
    if (ev.key === "Enter") {
      ev.preventDefault();
      runCurrentSelection();
    }
  }

  function ensureBuilt() {
    if (STATE.built || byId(IDS.overlay)) {
      STATE.built = true;
      return;
    }
    const wrap = document.createElement("div");
    wrap.id = IDS.overlay;
    wrap.className = "cr-cmd-overlay hidden";
    wrap.innerHTML = `
      <div class="cr-cmd-modal" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="cr-cmd-top">
          <input id="${IDS.input}" type="text" placeholder="Type an action..." autocomplete="off" />
          <button type="button" class="cr-cmd-close" aria-label="Close palette">&times;</button>
        </div>
        <div id="${IDS.hint}" class="cr-cmd-hint">Enter to run, Esc to close.</div>
        <div id="${IDS.list}" class="cr-cmd-list"></div>
      </div>
    `;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", (ev) => {
      if (ev.target === wrap) closePalette();
    });
    wrap.querySelector(".cr-cmd-close")?.addEventListener("click", closePalette);
    byId(IDS.input)?.addEventListener("input", (ev) => {
      STATE.selectedIndex = 0;
      setQueryAndRender(ev.target.value);
    });
    byId(IDS.input)?.addEventListener("keydown", onPaletteKeydown);
    STATE.built = true;
  }

  function wireGlobalHotkeys() {
    document.addEventListener("keydown", (ev) => {
      const key = String(ev.key || "");
      const ctrlOrMeta = ev.ctrlKey || ev.metaKey;

      if (ctrlOrMeta && key.toLowerCase() === "k") {
        ev.preventDefault();
        if (STATE.open) closePalette();
        else openPalette();
        return;
      }

      if (STATE.open) return;

      if (key === "/" && !isInputLike(document.activeElement)) {
        ev.preventDefault();
        const tab = activeTab();
        if (tab === "layers") {
          if (!focusFirstVisible(["layer-search-input", "crime-force-search"])) openPalette();
        } else if (tab === "entities") {
          if (!focusFirstVisible(["entity-search-input", "entity-label"])) openPalette();
        } else {
          if (!focusFirstVisible(["ch_name", "ch_api_search", "psc_name"])) openPalette();
        }
      }
    });
  }

  function wireButtons() {
    byId("kpi-btn-command")?.addEventListener("click", openPalette);
    byId("kpi-btn-minimize-ui")?.addEventListener("click", collapseAllMenus);
  }

  function ensureRecoDock() {
    if (byId("cr-reco-dock")) return byId("cr-reco-dock");
    const el = document.createElement("div");
    el.id = "cr-reco-dock";
    el.className = "cr-reco-dock";
    el.innerHTML = `
      <div class="cr-reco-head">
        <span>Smart Suggestions</span>
        <div class="cr-reco-head-actions">
          <button type="button" id="cr-reco-refresh" title="Refresh suggestions">&#8635;</button>
          <button type="button" id="cr-reco-min" title="Minimize suggestions">_</button>
        </div>
      </div>
      <div id="cr-reco-body" class="cr-reco-body"></div>
    `;
    document.body.appendChild(el);
    byId("cr-reco-refresh")?.addEventListener("click", renderRecommendations);
    byId("cr-reco-min")?.addEventListener("click", () => {
      el.classList.toggle("collapsed");
      try { localStorage.setItem("cr_reco_collapsed", el.classList.contains("collapsed") ? "1" : "0"); } catch (_) {}
    });
    try {
      const collapsed = localStorage.getItem("cr_reco_collapsed") === "1";
      el.classList.toggle("collapsed", collapsed);
    } catch (_) {}
    return el;
  }

  function mapStateSnapshot() {
    const entities = Array.isArray(window._mapEntities) ? window._mapEntities : [];
    const links = Array.isArray(window._mapConnections) ? window._mapConnections : [];
    const selected = Array.from(window._selectedEntityIds || []);
    const searchName = String(byId("ch_name")?.value || "").trim();
    const searchNumber = String(byId("ch_number")?.value || "").trim();
    const layersOn = document.querySelectorAll(".layer-cb:checked").length;
    const map = window._map;
    const zoom = map && typeof map.getZoom === "function" ? Number(map.getZoom()) : null;
    const tab = activeTab();
    return { entities: entities.length, links: links.length, selected: selected.length, searchName, searchNumber, layersOn, zoom, tab };
  }

  function recoFromCommandId(id) {
    const cmd = commands().find((c) => c.id === id);
    if (!cmd) return null;
    return { id: cmd.id, title: cmd.title, hint: cmd.hint, run: cmd.run };
  }

  function computeRecommendations() {
    const st = mapStateSnapshot();
    const out = [];
    const push = (id) => {
      const c = recoFromCommandId(id);
      if (!c) return;
      if (out.some((x) => x.id === c.id)) return;
      out.push(c);
    };

    if (st.entities === 0) {
      push("search");
      push("entities");
      push("layers");
    } else {
      if (st.selected > 0) {
        push("fit_selected");
        if (window.GoogleIntelligenceService?.isConfigured?.()) push("google_enrich");
      } else {
        push("fit_all");
      }
      if (st.links === 0 && st.entities >= 2) {
        push("entities");
      }
      if (st.zoom != null && st.zoom < 9) {
        push("fit_all");
      }
      if (st.layersOn <= 1) {
        push("layers");
      }
    }

    if (st.searchName || st.searchNumber) {
      push("search");
    }
    push("save");
    return out.slice(0, 3);
  }

  function renderRecommendations() {
    const body = byId("cr-reco-body");
    if (!body) return;
    const recs = computeRecommendations();
    if (!recs.length) {
      body.innerHTML = `<div class="cr-reco-empty">No suggestions right now.</div>`;
      return;
    }
    body.innerHTML = recs.map((r, idx) =>
      `<button type="button" class="cr-reco-item" data-reco-id="${r.id}">
        <span class="cr-reco-rank">#${idx + 1}</span>
        <span class="cr-reco-text">
          <span class="cr-reco-title">${r.title}</span>
          <span class="cr-reco-sub">${r.hint}</span>
        </span>
      </button>`
    ).join("");
    body.querySelectorAll(".cr-reco-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-reco-id");
        const cmd = recs.find((r) => r.id === id);
        if (!cmd) return;
        Promise.resolve(cmd.run?.()).catch(() => {});
      });
    });
  }

  function wireRecommendationUpdates() {
    ensureRecoDock();
    renderRecommendations();
    window.setInterval(renderRecommendations, 6000);
    document.addEventListener("click", () => {
      window.setTimeout(renderRecommendations, 120);
    }, true);
    if (window._map?.on) {
      window._map.on("moveend zoomend", () => window.setTimeout(renderRecommendations, 80));
    } else {
      const wait = window.setInterval(() => {
        if (window._map?.on) {
          window.clearInterval(wait);
          window._map.on("moveend zoomend", () => window.setTimeout(renderRecommendations, 80));
        }
      }, 600);
    }
  }

  function normalizeDisclosureDefaults() {
    document.querySelectorAll("#control-panel details.panel-disclosure[open]").forEach((d) => {
      if (d.dataset.startOpen === "1") return;
      d.removeAttribute("open");
    });
  }

  function collapseAllMenus() {
    document.querySelectorAll("#control-panel details.panel-disclosure[open]").forEach((d) => d.removeAttribute("open"));
    document.querySelectorAll("#tab-layers details.panel-disclosure[open]").forEach((d) => d.removeAttribute("open"));
    byId("entity-inspector")?.classList.remove("open");
    byId("bottom-panel")?.classList.remove("open");
    byId("control-panel")?.classList.add("collapsed");
    byId("cr-reco-dock")?.classList.add("collapsed");
    window.showToast?.("UI decluttered. Expand sections as needed.", "info", 2400);
  }

  function firstRunHints() {
    try {
      const key = "cr_onboarding_v1";
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, String(Date.now()));
    } catch (_) {
      return;
    }
    window.setTimeout(() => {
      window.showToast?.("Tip: Press Ctrl+K for the command palette", "info", 3600);
    }, 1200);
    window.setTimeout(() => {
      window.showToast?.("Tip: Press / to jump to context search", "info", 3600);
    }, 4600);
  }

  function init() {
    ensureBuilt();
    wireButtons();
    wireGlobalHotkeys();
    wireRecommendationUpdates();
    normalizeDisclosureDefaults();
    firstRunHints();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
