// ================== timeline.js ==================
// Horizontal scrollable timeline for entity events

(function () {
  "use strict";

  let _timelineEvents = [];
  let _zoomLevel = 1; // pixels per day
  const BASE_PX_PER_DAY = 2;

  function collectTimelineEvents() {
    const events = [];
    const entities = window._mapEntities || [];
    const connections = window._mapConnections || [];

    entities.forEach(e => {
      const i2 = e.i2EntityData || {};
      // Incorporation date
      const incDate = parseFlexibleDate(i2.values?.["Date of Incorporation"] || i2.values?.["IncorporationDate"] || "");
      if (incDate) {
        events.push({
          id: `inc_${e.id}`, date: incDate, type: "incorporation",
          label: `Incorporated: ${e.label}`, entityId: e.id, color: "#6366f1"
        });
      }
      // Dissolution date
      const disDate = parseFlexibleDate(i2.values?.["Date of Dissolution"] || i2.values?.["DissolutionDate"] || "");
      if (disDate) {
        events.push({
          id: `dis_${e.id}`, date: disDate, type: "dissolution",
          label: `Dissolved: ${e.label}`, entityId: e.id, color: "#ef4444"
        });
      }
      // Birth date (for persons)
      const birthDate = parseFlexibleDate(i2.values?.["Date of Birth"] || i2.values?.["DOB"] || "");
      if (birthDate) {
        events.push({
          id: `birth_${e.id}`, date: birthDate, type: "birth",
          label: `Born: ${e.label}`, entityId: e.id, color: "#8b5cf6"
        });
      }
      // Appointment date
      const apptDate = parseFlexibleDate(i2.values?.["Appointed On"] || i2.values?.["appointed_on"] || "");
      if (apptDate) {
        events.push({
          id: `appt_${e.id}`, date: apptDate, type: "appointment",
          label: `Appointed: ${e.label}`, entityId: e.id, color: "#22c55e"
        });
      }
      // Resignation date
      const resDate = parseFlexibleDate(i2.values?.["Resigned On"] || i2.values?.["resigned_on"] || "");
      if (resDate) {
        events.push({
          id: `res_${e.id}`, date: resDate, type: "resignation",
          label: `Resigned: ${e.label}`, entityId: e.id, color: "#f59e0b"
        });
      }
      // Entity creation time (always present)
      const createdMs = parseInt(e.id.replace(/^entity_/, "").split("_")[0]);
      if (createdMs && createdMs > 1000000000000) {
        events.push({
          id: `placed_${e.id}`, date: new Date(createdMs), type: "placed",
          label: `Placed: ${e.label}`, entityId: e.id, color: "#64748b"
        });
      }
    });

    connections.forEach(c => {
      const createdMs = parseInt((c.id || "").replace(/^conn_/, "").split("_")[0]);
      if (createdMs && createdMs > 1000000000000) {
        events.push({
          id: `conn_${c.id}`, date: new Date(createdMs), type: "connection",
          label: `Connected: ${c.label || "link"}`, entityId: c.from, color: "#38bdf8"
        });
      }
    });

    // Sort by date
    events.sort((a, b) => a.date.getTime() - b.date.getTime());
    return events;
  }

  function parseFlexibleDate(str) {
    if (!str) return null;
    str = String(str).trim();
    // ISO format
    const d = new Date(str);
    if (!isNaN(d.getTime()) && d.getFullYear() > 1800) return d;
    // month/year format (from PSC)
    const myMatch = str.match(/^(\d{1,2})\/(\d{4})$/);
    if (myMatch) return new Date(parseInt(myMatch[2]), parseInt(myMatch[1]) - 1, 1);
    // year only
    const yMatch = str.match(/^(\d{4})$/);
    if (yMatch) return new Date(parseInt(yMatch[1]), 0, 1);
    return null;
  }

  function refreshTimeline() {
    const container = document.getElementById("timeline-container");
    if (!container) return;

    _timelineEvents = collectTimelineEvents();

    if (!_timelineEvents.length) {
      container.innerHTML = `<div class="timeline-empty">
        <p>No timeline events. Place entities with date fields (companies, persons, officers) to populate the timeline.</p>
        <p style="font-size:10px;color:#64748b;">Dates extracted from: Date of Incorporation, Dissolution, Birth, Appointment, Resignation</p>
      </div>`;
      return;
    }

    const minDate = _timelineEvents[0].date;
    const maxDate = _timelineEvents[_timelineEvents.length - 1].date;
    const daySpan = Math.max((maxDate - minDate) / 86400000, 30);
    const pxPerDay = BASE_PX_PER_DAY * _zoomLevel;
    const totalWidth = Math.max(daySpan * pxPerDay + 200, container.clientWidth);

    // Build lanes (stagger vertically to avoid overlap)
    const lanes = assignLanes(_timelineEvents, pxPerDay, minDate);
    const laneHeight = 28;
    const headerHeight = 32;
    const totalHeight = headerHeight + (lanes.maxLane + 1) * laneHeight + 20;

    let html = `<div class="timeline-scroll" style="width:${totalWidth}px; height:${totalHeight}px; position:relative;">`;

    // Year/month markers
    html += renderTimeAxis(minDate, maxDate, pxPerDay, totalWidth, headerHeight);

    // Events
    _timelineEvents.forEach((ev, i) => {
      const x = ((ev.date - minDate) / 86400000) * pxPerDay + 60;
      const lane = lanes.assignments[i] || 0;
      const y = headerHeight + lane * laneHeight + 4;
      const dateStr = ev.date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      html += `<div class="tl-event" style="left:${x}px;top:${y}px" data-entity="${ev.entityId}" title="${esc(ev.label)} — ${dateStr}">
        <span class="tl-dot" style="background:${ev.color}"></span>
        <span class="tl-label">${esc(ev.label.slice(0, 35))}</span>
        <span class="tl-date">${dateStr}</span>
      </div>`;
    });

    // Today marker
    const now = new Date();
    if (now >= minDate && now <= new Date(maxDate.getTime() + 365 * 86400000)) {
      const x = ((now - minDate) / 86400000) * pxPerDay + 60;
      html += `<div class="tl-today" style="left:${x}px; top:0; height:${totalHeight}px">
        <span class="tl-today-label">TODAY</span>
      </div>`;
    }

    html += '</div>';

    container.innerHTML = html;

    // Click events → focus entity on map
    container.querySelectorAll("[data-entity]").forEach(el => {
      el.addEventListener("click", () => {
        const entityId = el.dataset.entity;
        const entity = (window._mapEntities || []).find(e => e.id === entityId);
        if (entity && entity.marker && window._map) {
          window._map.setView(entity.latLng, Math.max(window._map.getZoom(), 13));
          entity.marker.openPopup();
        }
      });
    });

    // Render toolbar
    renderTimelineToolbar();
    updateTimelineStats();
  }

  function assignLanes(events, pxPerDay, minDate) {
    const laneEnds = []; // track rightmost x of each lane
    const assignments = [];
    const minGap = 180; // min pixel gap between events in same lane

    events.forEach((ev, i) => {
      const x = ((ev.date - minDate) / 86400000) * pxPerDay;
      let assigned = false;
      for (let lane = 0; lane < laneEnds.length; lane++) {
        if (x - laneEnds[lane] >= minGap) {
          laneEnds[lane] = x;
          assignments[i] = lane;
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        assignments[i] = laneEnds.length;
        laneEnds.push(x);
      }
    });

    return { assignments, maxLane: Math.max(0, laneEnds.length - 1) };
  }

  function renderTimeAxis(minDate, maxDate, pxPerDay, totalWidth, headerHeight) {
    let html = '';
    const startYear = minDate.getFullYear();
    const endYear = maxDate.getFullYear() + 1;

    for (let year = startYear; year <= endYear; year++) {
      for (let month = 0; month < 12; month++) {
        const d = new Date(year, month, 1);
        if (d < minDate || d > new Date(maxDate.getTime() + 90 * 86400000)) continue;
        const x = ((d - minDate) / 86400000) * pxPerDay + 60;
        if (x < 0 || x > totalWidth) continue;
        const isJan = month === 0;
        html += `<div class="tl-axis-mark ${isJan ? "tl-axis-year" : ""}" style="left:${x}px;height:${headerHeight}px">
          <span class="tl-axis-label">${isJan ? year : d.toLocaleDateString("en-GB", { month: "short" })}</span>
        </div>`;
        // Vertical gridline
        html += `<div class="tl-gridline ${isJan ? "tl-gridline-year" : ""}" style="left:${x}px;top:${headerHeight}px;bottom:0"></div>`;
      }
    }
    return html;
  }

  function renderTimelineToolbar() {
    const toolbar = document.getElementById("timeline-toolbar");
    if (!toolbar) return;
    toolbar.innerHTML = `
      <button class="graph-tool-btn" id="tl-zoom-in" title="Zoom in">+</button>
      <button class="graph-tool-btn" id="tl-zoom-out" title="Zoom out">-</button>
      <button class="graph-tool-btn" id="tl-zoom-fit" title="Fit all">Fit</button>
      <span class="tl-zoom-label">Zoom: ${_zoomLevel.toFixed(1)}x</span>
    `;
    document.getElementById("tl-zoom-in")?.addEventListener("click", () => {
      _zoomLevel = Math.min(_zoomLevel * 1.5, 20);
      refreshTimeline();
    });
    document.getElementById("tl-zoom-out")?.addEventListener("click", () => {
      _zoomLevel = Math.max(_zoomLevel / 1.5, 0.1);
      refreshTimeline();
    });
    document.getElementById("tl-zoom-fit")?.addEventListener("click", () => {
      _zoomLevel = 1;
      refreshTimeline();
    });
  }

  function updateTimelineStats() {
    const statsEl = document.getElementById("timeline-stats");
    if (!statsEl) return;
    const total = _timelineEvents.length;
    const types = {};
    _timelineEvents.forEach(e => { types[e.type] = (types[e.type] || 0) + 1; });
    const breakdown = Object.entries(types).map(([t, c]) => `${t}: ${c}`).join(", ");
    statsEl.innerHTML = `<span>Events: <strong>${total}</strong></span> <span class="tl-breakdown">${esc(breakdown)}</span>`;
  }

  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Exports ──
  window.refreshTimeline = refreshTimeline;
})();
