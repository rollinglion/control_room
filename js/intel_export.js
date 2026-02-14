// ================== intel_export.js ==================
// i2 Analyst's Notebook ANX export + 5x5x5 Intelligence Report generator

(function () {
  "use strict";

  // ═══════════════════════════════════════════════════
  // i2 ANX (Analyst's Notebook XML) EXPORT
  // ═══════════════════════════════════════════════════

  // ANX is i2's XML chart format. This generates a valid XML file
  // that can be imported into Analyst's Notebook.
  function exportI2ANX() {
    const entities = window._mapEntities || [];
    const connections = window._mapConnections || [];

    if (!entities.length) {
      if (typeof showToast === "function") showToast("No entities to export", "error");
      return;
    }

    const timestamp = new Date().toISOString();
    const entityById = {};
    entities.forEach(e => { entityById[e.id] = e; });

    // Build XML
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<Chart xmlns="urn:i2:anb" SchemaVersion="3.0" TimeZone="UTC">\n`;
    xml += `  <Summary>\n`;
    xml += `    <Description>Control Room Export - ${escXml(timestamp)}</Description>\n`;
    xml += `    <DateTimeCreated>${timestamp}</DateTimeCreated>\n`;
    xml += `    <Notes>Exported from Control Room intelligence dashboard. Contains ${entities.length} entities and ${connections.length} connections.</Notes>\n`;
    xml += `  </Summary>\n`;

    // Chart Items (Entities)
    xml += `  <ChartItemCollection>\n`;
    entities.forEach((e, idx) => {
      const i2Type = mapToI2EntityType(e);
      const attrs = buildI2Attributes(e);
      xml += `    <ChartItem Id="${escXml(e.id)}" Label="${escXml(e.label)}">\n`;
      xml += `      <End>\n`;
      xml += `        <Entity EntityTypeId="${escXml(i2Type)}" Identity="${escXml(e.id)}">\n`;
      xml += `          <Icon IconStyle="Standard" />\n`;
      if (attrs.length) {
        xml += `          <CardCollection>\n`;
        xml += `            <Card>\n`;
        attrs.forEach(a => {
          xml += `              <Attribute AttributeClassId="${escXml(a.classId)}" Value="${escXml(a.value)}" />\n`;
        });
        xml += `            </Card>\n`;
        xml += `          </CardCollection>\n`;
      }
      xml += `        </Entity>\n`;
      xml += `      </End>\n`;
      // Position for visual layout
      xml += `      <Location>\n`;
      xml += `        <Point X="${(idx % 10) * 150}" Y="${Math.floor(idx / 10) * 120}" />\n`;
      xml += `      </Location>\n`;
      xml += `    </ChartItem>\n`;
    });

    // Links (Connections)
    connections.forEach(c => {
      const fromEntity = entityById[c.from];
      const toEntity = entityById[c.to];
      if (!fromEntity || !toEntity) return;

      xml += `    <ChartItem Id="${escXml(c.id)}" Label="${escXml(c.label || "")}">\n`;
      xml += `      <Link End1Id="${escXml(c.from)}" End2Id="${escXml(c.to)}" LinkTypeId="${escXml(mapToI2LinkType(c.type))}">\n`;
      if (c.label) {
        xml += `        <LinkStrength Value="Confirmed" />\n`;
        xml += `        <Attribute AttributeClassId="LinkLabel" Value="${escXml(c.label)}" />\n`;
      }
      xml += `      </Link>\n`;
      xml += `    </ChartItem>\n`;
    });

    xml += `  </ChartItemCollection>\n`;

    // Entity Types Definition
    xml += `  <EntityTypeCollection>\n`;
    const usedTypes = new Set(entities.map(e => mapToI2EntityType(e)));
    usedTypes.forEach(t => {
      xml += `    <EntityType Id="${escXml(t)}" Name="${escXml(t)}" />\n`;
    });
    xml += `  </EntityTypeCollection>\n`;

    // Link Types Definition
    xml += `  <LinkTypeCollection>\n`;
    const usedLinkTypes = new Set(connections.map(c => mapToI2LinkType(c.type)));
    usedLinkTypes.forEach(t => {
      xml += `    <LinkType Id="${escXml(t)}" Name="${escXml(t)}" />\n`;
    });
    xml += `  </LinkTypeCollection>\n`;

    // Attribute Classes
    xml += `  <AttributeClassCollection>\n`;
    const attrClasses = new Set();
    entities.forEach(e => {
      buildI2Attributes(e).forEach(a => attrClasses.add(a.classId));
    });
    attrClasses.add("LinkLabel");
    attrClasses.forEach(c => {
      xml += `    <AttributeClass Id="${escXml(c)}" Name="${escXml(c)}" Type="Text" />\n`;
    });
    xml += `  </AttributeClassCollection>\n`;

    xml += `</Chart>\n`;

    // Download
    downloadFile(xml, `control_room_i2_export_${Date.now()}.anx`, "application/xml");
    if (window.CRDashboard) window.CRDashboard.logActivity("i2 ANX exported", `${entities.length} entities, ${connections.length} links`, "export");
    if (typeof showToast === "function") showToast(`Exported ${entities.length} entities to i2 ANX format`, "success");
  }

  function mapToI2EntityType(entity) {
    const i2 = entity.i2EntityData;
    if (i2?.entityType) return i2.entityType;
    const cat = (entity.iconData?.category || "").toLowerCase();
    const map = {
      people: "Person", buildings: "Location", financial: "Organisation",
      vehicles: "Vehicle", aviation: "Aircraft", military: "Operation",
      communication: "Communication Entity", real_estate: "Location"
    };
    return map[cat] || "Entity";
  }

  function mapToI2LinkType(type) {
    const map = {
      officer: "Officer Appointment", psc: "Significant Control",
      manual: "Association", default: "Connection"
    };
    return map[type] || map.default;
  }

  function buildI2Attributes(entity) {
    const attrs = [];
    if (entity.label) attrs.push({ classId: "Label", value: entity.label });
    if (entity.address) attrs.push({ classId: "Address", value: entity.address });
    if (entity.notes) attrs.push({ classId: "Notes", value: entity.notes });
    if (entity.latLng) {
      attrs.push({ classId: "Latitude", value: String(entity.latLng[0]) });
      attrs.push({ classId: "Longitude", value: String(entity.latLng[1]) });
    }
    // i2 entity fields
    const values = entity.i2EntityData?.values || {};
    Object.entries(values).forEach(([k, v]) => {
      if (v && String(v).trim()) attrs.push({ classId: k.replace(/\s+/g, "_"), value: String(v) });
    });
    return attrs;
  }

  // ═══════════════════════════════════════════════════
  // 5x5x5 INTELLIGENCE REPORT
  // ═══════════════════════════════════════════════════

  // The 5x5x5 system is the UK law enforcement standard for grading intelligence:
  // Source Evaluation (A-E), Intelligence Assessment (1-5), Handling Code (1-5)

  const SOURCE_GRADES = {
    A: "Always reliable — Trusted, no doubt about authenticity, competence, or reliability",
    B: "Mostly reliable — Source from whom information received has in most instances proved to be reliable",
    C: "Sometimes reliable — Source from whom information received has occasionally proved to be reliable",
    D: "Unreliable — Source from whom information received has proved unreliable in the past",
    E: "Untested — Source whose reliability cannot be judged; no basis for evaluation"
  };

  const INTEL_GRADES = {
    1: "Known to be true — without reservation",
    2: "Known personally to the source but not corroborated",
    3: "Not known personally to the source but corroborated",
    4: "Cannot be judged — provided by a reliable source",
    5: "Suspected to be false or malicious"
  };

  const HANDLING_CODES = {
    1: "Permits further dissemination within law enforcement",
    2: "Permits dissemination to law enforcement and prosecuting authority",
    3: "Permits dissemination to non-prosecuting parties (e.g. regulatory bodies)",
    4: "Permits dissemination within originating agency only",
    5: "Permits dissemination to designated officers/intelligence staff only"
  };

  function generate5x5x5Report() {
    const modal = document.createElement("div");
    modal.className = "intel-report-overlay";
    modal.id = "intel-report-modal";

    const entities = window._mapEntities || [];
    const connections = window._mapConnections || [];
    const reportEntities = (window._5x5x5Entities || []).length ? window._5x5x5Entities : [];

    modal.innerHTML = `
      <div class="intel-report-dialog">
        <div class="intel-report-header">
          <span class="intel-report-title">5x5x5 INTELLIGENCE REPORT</span>
          <button class="intel-report-close" id="intel-report-close">&times;</button>
        </div>
        <div class="intel-report-body">
          <div class="intel-report-section">
            <label>Report Reference</label>
            <input type="text" id="ir-reference" placeholder="e.g. INT/2026/0214/001" value="INT/${new Date().getFullYear()}/${String(new Date().getMonth()+1).padStart(2,'0')}${String(new Date().getDate()).padStart(2,'0')}/${String(Math.floor(Math.random()*999)+1).padStart(3,'0')}" />
          </div>

          <div class="intel-report-section">
            <label>Reporting Officer</label>
            <input type="text" id="ir-officer" placeholder="Rank / Name / Collar Number" />
          </div>

          <div class="intel-report-section">
            <label>Date/Time of Intelligence</label>
            <input type="datetime-local" id="ir-datetime" value="${new Date().toISOString().slice(0,16)}" />
          </div>

          <div class="intel-report-row-3">
            <div class="intel-report-section">
              <label>Source Evaluation (A-E)</label>
              <select id="ir-source-grade">
                ${Object.entries(SOURCE_GRADES).map(([k, v]) => `<option value="${k}" title="${esc(v)}">${k} — ${v.split("—")[0].trim()}</option>`).join("")}
              </select>
            </div>
            <div class="intel-report-section">
              <label>Intelligence Assessment (1-5)</label>
              <select id="ir-intel-grade">
                ${Object.entries(INTEL_GRADES).map(([k, v]) => `<option value="${k}">${k} — ${v.split("—")[0].trim()}</option>`).join("")}
              </select>
            </div>
            <div class="intel-report-section">
              <label>Handling Code (1-5)</label>
              <select id="ir-handling-code">
                ${Object.entries(HANDLING_CODES).map(([k, v]) => `<option value="${k}">${k} — ${v.split("—")[0].trim()}</option>`).join("")}
              </select>
            </div>
          </div>

          <div class="intel-report-section">
            <label>Subject / Target</label>
            <input type="text" id="ir-subject" placeholder="Person, organisation, or subject of intelligence" />
          </div>

          <div class="intel-report-section">
            <label>Intelligence Text</label>
            <textarea id="ir-text" rows="6" placeholder="Detailed intelligence narrative..."></textarea>
          </div>

          <div class="intel-report-section">
            <label>Entities Referenced (${entities.length} on map, ${reportEntities.length} flagged)</label>
            <div class="ir-entity-chips" id="ir-entity-chips">
              ${entities.slice(0, 30).map(e => `<span class="ir-chip" data-eid="${e.id}">${esc(e.label.slice(0,25))}</span>`).join("")}
            </div>
          </div>

          <div class="intel-report-section">
            <label>Sanitisation Notes</label>
            <textarea id="ir-sanitisation" rows="2" placeholder="Any redactions or sanitisation applied..."></textarea>
          </div>

          <div class="intel-report-section">
            <label>Risk Assessment</label>
            <select id="ir-risk">
              <option value="low">Low — No threat to life or operations</option>
              <option value="medium">Medium — Potential operational risk</option>
              <option value="high">High — Significant risk to life, operations, or sources</option>
              <option value="critical">Critical — Immediate threat to life</option>
            </select>
          </div>

          <div class="intel-report-actions">
            <button class="btn-primary" id="ir-generate-pdf">Generate PDF Report</button>
            <button class="btn-secondary" id="ir-export-json">Export as JSON</button>
            <button class="btn-secondary" id="ir-copy-text">Copy as Text</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
    document.getElementById("intel-report-close")?.addEventListener("click", () => modal.remove());

    // Generate PDF
    document.getElementById("ir-generate-pdf")?.addEventListener("click", () => {
      const reportData = collectReportData();
      generateReportPDF(reportData);
      modal.remove();
    });

    // Export JSON
    document.getElementById("ir-export-json")?.addEventListener("click", () => {
      const reportData = collectReportData();
      downloadFile(JSON.stringify(reportData, null, 2), `5x5x5_report_${Date.now()}.json`, "application/json");
      modal.remove();
    });

    // Copy text
    document.getElementById("ir-copy-text")?.addEventListener("click", () => {
      const reportData = collectReportData();
      const text = formatReportAsText(reportData);
      navigator.clipboard?.writeText(text);
      if (typeof showToast === "function") showToast("Report copied to clipboard", "success");
    });
  }

  function collectReportData() {
    return {
      reference: document.getElementById("ir-reference")?.value || "",
      officer: document.getElementById("ir-officer")?.value || "",
      datetime: document.getElementById("ir-datetime")?.value || "",
      sourceGrade: document.getElementById("ir-source-grade")?.value || "E",
      intelGrade: document.getElementById("ir-intel-grade")?.value || "4",
      handlingCode: document.getElementById("ir-handling-code")?.value || "1",
      subject: document.getElementById("ir-subject")?.value || "",
      text: document.getElementById("ir-text")?.value || "",
      sanitisation: document.getElementById("ir-sanitisation")?.value || "",
      risk: document.getElementById("ir-risk")?.value || "low",
      entityCount: window._mapEntities?.length || 0,
      connectionCount: window._mapConnections?.length || 0,
      gradeLabel: `${document.getElementById("ir-source-grade")?.value || "E"}${document.getElementById("ir-intel-grade")?.value || "4"}${document.getElementById("ir-handling-code")?.value || "1"}`
    };
  }

  function formatReportAsText(r) {
    return `═══════════════════════════════════════════════
5x5x5 INTELLIGENCE REPORT
═══════════════════════════════════════════════
Reference:       ${r.reference}
Classification:  ${r.gradeLabel} (Source: ${r.sourceGrade}, Intel: ${r.intelGrade}, Handling: ${r.handlingCode})
Date/Time:       ${r.datetime}
Officer:         ${r.officer}
Risk Level:      ${r.risk.toUpperCase()}

───────────────────────────────────────────────
SUBJECT: ${r.subject}
───────────────────────────────────────────────

SOURCE EVALUATION: ${r.sourceGrade} — ${SOURCE_GRADES[r.sourceGrade] || "Unknown"}
INTEL ASSESSMENT:  ${r.intelGrade} — ${INTEL_GRADES[r.intelGrade] || "Unknown"}
HANDLING CODE:     ${r.handlingCode} — ${HANDLING_CODES[r.handlingCode] || "Unknown"}

───────────────────────────────────────────────
INTELLIGENCE:
${r.text}

───────────────────────────────────────────────
ENTITIES: ${r.entityCount} mapped | CONNECTIONS: ${r.connectionCount}
SANITISATION: ${r.sanitisation || "None"}

───────────────────────────────────────────────
Generated by Control Room — ${new Date().toISOString()}
═══════════════════════════════════════════════`;
  }

  function generateReportPDF(r) {
    if (typeof jspdf === "undefined" && typeof window.jspdf === "undefined") {
      if (typeof showToast === "function") showToast("jsPDF not loaded", "error");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = 210;
    const margin = 20;
    const textWidth = pageWidth - 2 * margin;
    let y = margin;

    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 40, "F");
    doc.setTextColor(45, 212, 191);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("5x5x5 INTELLIGENCE REPORT", margin, 18);
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184);
    doc.text(`Reference: ${r.reference}`, margin, 28);
    doc.text(`Classification: ${r.gradeLabel}`, margin, 34);
    doc.text(`Generated: ${new Date().toISOString()}`, pageWidth - margin - 60, 34);

    y = 50;

    // Grading strip
    doc.setFillColor(30, 41, 55);
    doc.rect(margin, y, textWidth, 24, "F");
    doc.setTextColor(251, 191, 36);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Source: ${r.sourceGrade}`, margin + 4, y + 8);
    doc.text(`Intelligence: ${r.intelGrade}`, margin + 45, y + 8);
    doc.text(`Handling: ${r.handlingCode}`, margin + 100, y + 8);
    const riskColors = { low: [34, 197, 94], medium: [245, 158, 11], high: [239, 68, 68], critical: [220, 38, 38] };
    const rc = riskColors[r.risk] || riskColors.low;
    doc.setTextColor(rc[0], rc[1], rc[2]);
    doc.text(`Risk: ${r.risk.toUpperCase()}`, margin + 4, y + 18);
    doc.setTextColor(148, 163, 184);
    doc.text(`Officer: ${r.officer}`, margin + 45, y + 18);
    doc.text(`Date: ${r.datetime}`, margin + 100, y + 18);
    y += 32;

    // Subject
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("SUBJECT", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(241, 245, 249);
    const subjectLines = doc.splitTextToSize(r.subject || "Not specified", textWidth);
    doc.text(subjectLines, margin, y);
    y += subjectLines.length * 5 + 8;

    // Intelligence text
    doc.setTextColor(226, 232, 240);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("INTELLIGENCE", margin, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(203, 213, 225);
    const intelLines = doc.splitTextToSize(r.text || "No intelligence text provided.", textWidth);
    intelLines.forEach(line => {
      if (y > 270) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 4.5;
    });
    y += 8;

    // Grading explanations
    if (y > 240) { doc.addPage(); y = margin; }
    doc.setFillColor(30, 41, 55);
    doc.rect(margin, y, textWidth, 30, "F");
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.text(`Source ${r.sourceGrade}: ${SOURCE_GRADES[r.sourceGrade] || ""}`, margin + 4, y + 6);
    doc.text(`Intel ${r.intelGrade}: ${INTEL_GRADES[r.intelGrade] || ""}`, margin + 4, y + 14);
    doc.text(`Handling ${r.handlingCode}: ${HANDLING_CODES[r.handlingCode] || ""}`, margin + 4, y + 22);
    y += 38;

    // Summary
    if (y > 260) { doc.addPage(); y = margin; }
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(8);
    doc.text(`Entities: ${r.entityCount} | Connections: ${r.connectionCount} | Sanitisation: ${r.sanitisation || "None"}`, margin, y);
    y += 10;
    doc.text("Generated by Control Room Intelligence Dashboard", margin, y);

    // Save
    doc.save(`5x5x5_${r.reference.replace(/[/\\]/g, "_")}_${Date.now()}.pdf`);
    if (window.CRDashboard) window.CRDashboard.logActivity("5x5x5 report generated", r.reference, "export");
    if (typeof showToast === "function") showToast("5x5x5 report PDF generated", "success");
  }

  // ═══════════════════════════════════════════════════
  // EXCEL STRUCTURED EXPORT
  // ═══════════════════════════════════════════════════

  function exportStructuredExcel() {
    if (typeof XLSX === "undefined") {
      if (typeof showToast === "function") showToast("XLSX library not loaded", "error");
      return;
    }

    const entities = window._mapEntities || [];
    const connections = window._mapConnections || [];
    const wb = XLSX.utils.book_new();

    // Cover sheet
    const coverData = [
      ["CONTROL ROOM — Intelligence Export"],
      ["Generated", new Date().toISOString()],
      ["Entities", entities.length],
      ["Connections", connections.length],
      [""],
      ["This workbook contains:"],
      ["1. Entity Register — All mapped entities with i2 attributes"],
      ["2. Link Matrix — All connections between entities"],
      ["3. Timeline — Chronological events extracted from entity data"],
      ["4. Geographic Summary — Entity distribution by region"]
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(coverData), "Cover");

    // Entity Register
    const entityRows = entities.map(e => ({
      ID: e.id,
      Label: e.label,
      Type: e.i2EntityData?.entityType || "",
      Category: e.iconData?.category || "",
      Address: e.address,
      Latitude: e.latLng?.[0],
      Longitude: e.latLng?.[1],
      Notes: e.notes,
      ...flattenI2Values(e.i2EntityData?.values)
    }));
    if (entityRows.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entityRows), "Entity Register");
    }

    // Link Matrix
    const linkRows = connections.map(c => {
      const from = entities.find(e => e.id === c.from);
      const to = entities.find(e => e.id === c.to);
      return {
        LinkID: c.id,
        FromID: c.from,
        FromLabel: from?.label || "",
        ToID: c.to,
        ToLabel: to?.label || "",
        LinkType: c.type,
        LinkLabel: c.label,
        Strength: "Confirmed"
      };
    });
    if (linkRows.length) {
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linkRows), "Link Matrix");
    }

    XLSX.writeFile(wb, `control_room_intel_export_${Date.now()}.xlsx`);
    if (window.CRDashboard) window.CRDashboard.logActivity("Excel intel report exported", `${entities.length} entities`, "export");
    if (typeof showToast === "function") showToast("Structured Excel report exported", "success");
  }

  function flattenI2Values(values) {
    if (!values || typeof values !== "object") return {};
    const flat = {};
    Object.entries(values).forEach(([k, v]) => {
      if (v && String(v).trim()) flat[`i2_${k.replace(/\s+/g, "_")}`] = String(v);
    });
    return flat;
  }

  // ═══════════════════════════════════════════════════
  // ADDITIONAL DATA SOURCES
  // ═══════════════════════════════════════════════════

  // Land Registry Price Paid (free CSV from gov.uk)
  async function searchLandRegistry(postcode) {
    if (!postcode) return [];
    try {
      const clean = postcode.replace(/\s+/g, "").toUpperCase();
      const url = `https://landregistry.data.gov.uk/data/ppi/transaction-record.json?propertyAddress.postcode=${encodeURIComponent(postcode)}&_pageSize=20&_sort=-transactionDate`;
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      const results = (data.result?.items || []).map(item => ({
        price: item.pricePaid,
        date: item.transactionDate,
        address: [item.propertyAddress?.paon, item.propertyAddress?.street, item.propertyAddress?.town].filter(Boolean).join(", "),
        postcode: item.propertyAddress?.postcode,
        type: item.propertyType?.replace("http://landregistry.data.gov.uk/def/common/", ""),
        newBuild: item.newBuild === "true"
      }));
      if (window.CRDashboard) window.CRDashboard.addSearchHistory("land_registry", postcode, results.length);
      return results;
    } catch (err) {
      console.warn("Land Registry search failed:", err);
      return [];
    }
  }

  // Insolvency Service — Disqualified Directors
  async function searchDisqualifiedDirectors(name) {
    if (!name || name.length < 3) return [];
    try {
      const apiKey = window.CH_API_KEY || "";
      if (!apiKey) return [];
      const url = `https://api.company-information.service.gov.uk/search/disqualified-officers?q=${encodeURIComponent(name)}&items_per_page=20`;
      const resp = await fetch(url, { headers: { Authorization: "Basic " + btoa(apiKey + ":") } });
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data.items || []).map(item => ({
        name: item.title,
        dateOfBirth: item.date_of_birth ? `${item.date_of_birth.month}/${item.date_of_birth.year}` : "",
        address: item.address ? [item.address.address_line_1, item.address.locality, item.address.postal_code].filter(Boolean).join(", ") : "",
        disqualifiedFrom: item.disqualified_from,
        disqualifiedUntil: item.disqualified_until,
        snippet: item.snippet || ""
      }));
    } catch (err) {
      console.warn("Disqualified directors search failed:", err);
      return [];
    }
  }

  // Charity Commission (basic search)
  async function searchCharities(name) {
    if (!name || name.length < 3) return [];
    try {
      const url = `https://api.charitycommission.gov.uk/register/api/allcharitydetailsV2/0/${encodeURIComponent(name)}/1/10`;
      const resp = await fetch(url);
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data || []).map(item => ({
        name: item.CharityName || item.charity_name,
        number: item.RegisteredCharityNumber || item.charity_number,
        status: item.CharityRegistrationStatus || "Unknown",
        activities: item.ActivitiesForGrantMaking || ""
      }));
    } catch (err) {
      console.warn("Charity Commission search failed:", err);
      return [];
    }
  }

  // ── Helpers ──
  function escXml(str) {
    return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  function esc(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Exports ──
  window.exportI2ANX = exportI2ANX;
  window.generate5x5x5Report = generate5x5x5Report;
  window.exportStructuredExcel = exportStructuredExcel;
  window.searchLandRegistry = searchLandRegistry;
  window.searchDisqualifiedDirectors = searchDisqualifiedDirectors;
  window.searchCharities = searchCharities;
})();
