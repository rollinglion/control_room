// ================== psc_api.js ==================
// PSC (Persons with Significant Control) API Integration
// Uses Companies House API instead of local files

// ══════════════════════════════════════════════════════
// API CLIENT
// ══════════════════════════════════════════════════════

const PSC_API = {
  cache: new Map(),
  cacheTTL: 600000 // 10 minutes
};

// Get PSC for a company via API
async function getPSCForCompanyAPI(companyNumber) {
  if (!companyNumber) return [];
  
  const cacheKey = `psc_${companyNumber.toUpperCase()}`;
  const cached = PSC_API.cache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < PSC_API.cacheTTL)) {
    return cached.data;
  }
  
  try {
    const response = await fetchCH(`/company/${encodeURIComponent(companyNumber)}/persons-with-significant-control`);

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`No PSC data for company ${companyNumber}`);
        return [];
      }
      console.error("PSC API failed:", response.status);
      return [];
    }
    
    const data = await response.json();
    const items = data.items || [];
    
    // Transform to standard format
    const pscs = items.map(item => ({
      name: item.name || item.name_elements?.forename + ' ' + item.name_elements?.surname || 'Unknown',
      kind: item.kind || '',
      nationality: item.nationality || '',
      country_of_residence: item.country_of_residence || '',
      natures_of_control: item.natures_of_control || [],
      notified_on: item.notified_on || '',
      ceased_on: item.ceased_on || null,
      address: item.address || {},
      date_of_birth: item.date_of_birth || null,
      identification: item.identification || null
    }));
    
    // Cache results
    PSC_API.cache.set(cacheKey, {
      data: pscs,
      timestamp: Date.now()
    });
    
    // LRU cleanup
    if (PSC_API.cache.size > 100) {
      const firstKey = PSC_API.cache.keys().next().value;
      PSC_API.cache.delete(firstKey);
    }
    
    return pscs;
  } catch (err) {
    console.error("PSC API error:", err);
    return [];
  }
}

// Search for companies by officer name via API
async function searchCompaniesByOfficerAPI(officerName, limit = 50) {
  if (!officerName || officerName.trim().length < 3) return [];
  
  try {
    const response = await fetchCH(`/search/officers?q=${encodeURIComponent(officerName)}&items_per_page=${limit}`);
    
    if (!response.ok) {
      console.error("Officer search failed:", response.status);
      return [];
    }
    
    const data = await response.json();
    return data.items || [];
  } catch (err) {
    console.error("Officer search error:", err);
    return [];
  }
}

// Get officer appointments via API
async function getOfficerAppointmentsAPI(officerId) {
  if (!officerId) return [];
  
  const cacheKey = `appointments_${officerId}`;
  const cached = PSC_API.cache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp < PSC_API.cacheTTL)) {
    return cached.data;
  }
  
  try {
    const response = await fetchCH(`/officers/${encodeURIComponent(officerId)}/appointments`);
    
    if (!response.ok) {
      console.error("Appointments API failed:", response.status);
      return [];
    }
    
    const data = await response.json();
    const items = data.items || [];
    
    PSC_API.cache.set(cacheKey, { data: items, timestamp: Date.now() });
    return items;
  } catch (err) {
    console.error("Appointments API error:", err);
    return [];
  }
}

// Get company filing history via API
async function getFilingHistoryAPI(companyNumber, limit = 100) {
  if (!companyNumber) return [];
  
  try {
    const response = await fetchCH(`/company/${encodeURIComponent(companyNumber)}/filing-history?items_per_page=${limit}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`No filing history for company ${companyNumber}`);
        return [];
      }
      console.error("Filing history API failed:", response.status);
      return [];
    }
    
    const data = await response.json();
    return data.items || [];
  } catch (err) {
    console.error("Filing history API error:", err);
    return [];
  }
}

// ══════════════════════════════════════════════════════
// PDF GENERATION
// ══════════════════════════════════════════════════════

function downloadPSCReport(companyNumber, companyName, pscData) {
  if (!window.jspdf) {
    alert("PDF library not loaded. Please refresh the page.");
    return;
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  let yPos = 20;
  const leftMargin = 20;
  const pageWidth = 190;
  
  // Title
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text("Persons with Significant Control", leftMargin, yPos);
  yPos += 10;
  
  // Company details
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  doc.text(`Company: ${companyName}`, leftMargin, yPos);
  yPos += 6;
  doc.text(`Company Number: ${companyNumber}`, leftMargin, yPos);
  yPos += 6;
  doc.text(`Report Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, leftMargin, yPos);
  yPos += 12;
  
  // Line separator
  doc.setDrawColor(100, 100, 100);
  doc.line(leftMargin, yPos, pageWidth, yPos);
  yPos += 10;
  
  if (!pscData || pscData.length === 0) {
    doc.setFontSize(11);
    doc.text("No PSC records found for this company.", leftMargin, yPos);
  } else {
    pscData.forEach((psc, index) => {
      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      
      // PSC Number
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.text(`PSC #${index + 1}`, leftMargin, yPos);
      yPos += 8;
      
      // Name
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.text(`Name:`, leftMargin, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(psc.name || 'Unknown', leftMargin + 40, yPos);
      yPos += 6;
      
      // Kind
      if (psc.kind) {
        doc.setFont(undefined, 'bold');
        doc.text(`Type:`, leftMargin, yPos);
        doc.setFont(undefined, 'normal');
        const kindText = psc.kind.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        doc.text(kindText, leftMargin + 40, yPos);
        yPos += 6;
      }
      
      // Nationality
      if (psc.nationality) {
        doc.setFont(undefined, 'bold');
        doc.text(`Nationality:`, leftMargin, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(psc.nationality, leftMargin + 40, yPos);
        yPos += 6;
      }
      
      // Country of residence
      if (psc.country_of_residence) {
        doc.setFont(undefined, 'bold');
        doc.text(`Country:`, leftMargin, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(psc.country_of_residence, leftMargin + 40, yPos);
        yPos += 6;
      }
      
      // Date notified
      if (psc.notified_on) {
        doc.setFont(undefined, 'bold');
        doc.text(`Notified:`, leftMargin, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(psc.notified_on, leftMargin + 40, yPos);
        yPos += 6;
      }
      
      // Natures of control
      if (psc.natures_of_control && psc.natures_of_control.length > 0) {
        doc.setFont(undefined, 'bold');
        doc.text(`Control:`, leftMargin, yPos);
        yPos += 5;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        psc.natures_of_control.forEach(nature => {
          const lines = doc.splitTextToSize(`• ${nature.replace(/-/g, ' ')}`, pageWidth - leftMargin - 10);
          lines.forEach(line => {
            if (yPos > 270) {
              doc.addPage();
              yPos = 20;
            }
            doc.text(line, leftMargin + 5, yPos);
            yPos += 4;
          });
        });
        doc.setFontSize(11);
        yPos += 3;
      }
      
      // Address
      if (psc.address && Object.keys(psc.address).length > 0) {
        doc.setFont(undefined, 'bold');
        doc.text(`Address:`, leftMargin, yPos);
        yPos += 5;
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        
        const addressParts = [];
        if (psc.address.address_line_1) addressParts.push(psc.address.address_line_1);
        if (psc.address.address_line_2) addressParts.push(psc.address.address_line_2);
        if (psc.address.locality) addressParts.push(psc.address.locality);
        if (psc.address.region) addressParts.push(psc.address.region);
        if (psc.address.postal_code) addressParts.push(psc.address.postal_code);
        if (psc.address.country) addressParts.push(psc.address.country);
        
        addressParts.forEach(part => {
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(part, leftMargin + 5, yPos);
          yPos += 4;
        });
        doc.setFontSize(11);
      }
      
      yPos += 8;
      
      // Separator line between PSCs
      if (index < pscData.length - 1) {
        doc.setDrawColor(200, 200, 200);
        doc.line(leftMargin, yPos, pageWidth, yPos);
        yPos += 8;
      }
    });
  }
  
  // Footer on last page
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Control Room PSC Report - Page ${i} of ${pageCount}`,
      pageWidth / 2,
      285,
      { align: 'center' }
    );
  }
  
  // Download
  const fileName = `PSC_${companyNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

// Download filing history as PDF
async function downloadFilingHistory(companyNumber, companyName) {
  if (!window.jspdf) {
    alert("PDF library not loaded. Please refresh the page.");
    return;
  }
  
  setStatus(`Fetching filing history for ${companyName}...`);
  
  const filings = await getFilingHistoryAPI(companyNumber, 100);
  
  if (filings.length === 0) {
    alert('No filing history found for this company');
    setStatus('No filing history');
    return;
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  let yPos = 20;
  const leftMargin = 20;
  const pageWidth = 190;
  
  // Title
  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text("Filing History", leftMargin, yPos);
  yPos += 10;
  
  // Company details
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  doc.text(`Company: ${companyName}`, leftMargin, yPos);
  yPos += 6;
  doc.text(`Company Number: ${companyNumber}`, leftMargin, yPos);
  yPos += 6;
  doc.text(`Total Filings: ${filings.length}`, leftMargin, yPos);
  yPos += 6;
  doc.text(`Report Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, leftMargin, yPos);
  yPos += 12;
  
  // Line separator
  doc.setDrawColor(100, 100, 100);
  doc.line(leftMargin, yPos, pageWidth, yPos);
  yPos += 10;
  
  filings.forEach((filing, index) => {
    // Check if we need a new page
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }
    
    // Filing number
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text(`#${index + 1}`, leftMargin, yPos);
    yPos += 6;
    
    // Date
    if (filing.date) {
      doc.setFont(undefined, 'bold');
      doc.text(`Date:`, leftMargin + 5, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(filing.date, leftMargin + 40, yPos);
      yPos += 5;
    }
    
    // Description
    if (filing.description) {
      doc.setFont(undefined, 'bold');
      doc.text(`Type:`, leftMargin + 5, yPos);
      yPos += 5;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      const descLines = doc.splitTextToSize(filing.description, pageWidth - leftMargin - 10);
      descLines.forEach(line => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        doc.text(line, leftMargin + 10, yPos);
        yPos += 4;
      });
      doc.setFontSize(11);
      yPos += 2;
    }
    
    // Category
    if (filing.category) {
      doc.setFont(undefined, 'bold');
      doc.text(`Category:`, leftMargin + 5, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(filing.category.replace(/-/g, ' '), leftMargin + 40, yPos);
      yPos += 5;
    }
    
    // Type
    if (filing.type) {
      doc.setFont(undefined, 'bold');
      doc.text(`Form:`, leftMargin + 5, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(filing.type.toUpperCase(), leftMargin + 40, yPos);
      yPos += 5;
    }
    
    yPos += 5;
    
    // Separator line between filings
    if (index < filings.length - 1) {
      doc.setDrawColor(200, 200, 200);
      doc.line(leftMargin, yPos, pageWidth, yPos);
      yPos += 6;
    }
  });
  
  // Footer on all pages
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Control Room Filing History Report - Page ${i} of ${pageCount}`,
      pageWidth / 2,
      285,
      { align: 'center' }
    );
  }
  
  // Download
  const fileName = `FilingHistory_${companyNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
  
  setStatus(`Downloaded filing history for ${companyName}`);
}

// Download comprehensive company profile as PDF
async function downloadCompanyProfile(companyNumber, companyName) {
  if (!window.jspdf) {
    alert("PDF library not loaded. Please refresh the page.");
    return;
  }
  
  setStatus(`Fetching comprehensive company data for ${companyName}...`);
  
  // Fetch all company data in parallel
  const [profile, pscData, filingHistory] = await Promise.all([
    getCompanyProfile(companyNumber),
    getPSCForCompanyAPI(companyNumber),
    getFilingHistoryAPI(companyNumber, 20)
  ]);
  
  if (!profile) {
    alert('Could not fetch company profile');
    setStatus('Failed to fetch profile');
    return;
  }
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  let yPos = 20;
  const leftMargin = 20;
  const pageWidth = 190;
  
  // Helper to check page break
  const checkPageBreak = (needed = 15) => {
    if (yPos > 270 - needed) {
      doc.addPage();
      yPos = 20;
      return true;
    }
    return false;
  };
  
  const addSection = (title) => {
    checkPageBreak(20);
    doc.setFontSize(13);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(60, 60, 180);
    doc.text(title, leftMargin, yPos);
    doc.setTextColor(0);
    yPos += 8;
  };
  
  // ═══ HEADER ═══
  doc.setFontSize(20);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(40, 40, 140);
  doc.text("COMPREHENSIVE COMPANY PROFILE", leftMargin, yPos);
  doc.setTextColor(0);
  yPos += 12;
  
  // Company Name
  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  const nameLines = doc.splitTextToSize(companyName, pageWidth - 20);
  nameLines.forEach(line => {
    doc.text(line, leftMargin, yPos);
    yPos += 8;
  });
  yPos += 3;
  
  // Company Number
  doc.setFontSize(12);
  doc.setFont(undefined, 'normal');
  doc.text(`Company Number: ${companyNumber}`, leftMargin, yPos);
  yPos += 8;
  
  // Report date
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`Report Generated: ${new Date().toLocaleDateString('en-GB')} at ${new Date().toLocaleTimeString('en-GB')}`, leftMargin, yPos);
  doc.setTextColor(0);
  yPos += 10;
  
  // Separator
  doc.setDrawColor(100, 100, 100);
  doc.line(leftMargin, yPos, pageWidth, yPos);
  yPos += 12;
  
  // ═══ COMPANY STATUS ═══
  addSection("COMPANY STATUS");
  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  
  const statusData = [
    ['Status:', profile.company_status || 'Unknown'],
    ['Type:', profile.type || 'N/A'],
    ['Incorporated:', profile.date_of_creation || 'N/A'],
  ];
  
  if (profile.date_of_cessation) {
    statusData.push(['Ceased:', profile.date_of_cessation]);
  }
  if (profile.jurisdiction) {
    statusData.push(['Jurisdiction:', profile.jurisdiction]);
  }
  if (profile.has_been_liquidated) {
    statusData.push(['Liquidated:', 'Yes']);
  }
  if (profile.has_charges) {
    statusData.push(['Has Charges:', 'Yes']);
  }
  if (profile.has_insolvency_history) {
    statusData.push(['Insolvency History:', 'Yes']);
  }
  
  statusData.forEach(([label, value]) => {
    doc.setFont(undefined, 'bold');
    doc.text(label, leftMargin + 5, yPos);
    doc.setFont(undefined, 'normal');
    doc.text(value, leftMargin + 50, yPos);
    yPos += 6;
  });
  yPos += 5;
  
  // ═══ REGISTERED OFFICE ADDRESS ═══
  if (profile.registered_office_address) {
    addSection("REGISTERED OFFICE ADDRESS");
    doc.setFont(undefined, 'normal');
    
    const addr = profile.registered_office_address;
    const addrParts = [];
    if (addr.care_of) addrParts.push(`C/O ${addr.care_of}`);
    if (addr.po_box) addrParts.push(`PO Box ${addr.po_box}`);
    if (addr.address_line_1) addrParts.push(addr.address_line_1);
    if (addr.address_line_2) addrParts.push(addr.address_line_2);
    if (addr.locality) addrParts.push(addr.locality);
    if (addr.region) addrParts.push(addr.region);
    if (addr.postal_code) addrParts.push(addr.postal_code);
    if (addr.country) addrParts.push(addr.country);
    
    addrParts.forEach(part => {
      doc.text(part, leftMargin + 5, yPos);
      yPos += 5;
    });
    yPos += 5;
  }
  
  // ═══ NATURE OF BUSINESS (SIC) ═══
  if (profile.sic_codes && profile.sic_codes.length > 0) {
    addSection("NATURE OF BUSINESS (SIC CODES)");
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    
    profile.sic_codes.forEach((sic, idx) => {
      checkPageBreak();
      doc.setFont(undefined, 'bold');
      doc.text(`${idx + 1}.`, leftMargin + 5, yPos);
      doc.setFont(undefined, 'normal');
      const sicLines = doc.splitTextToSize(sic, pageWidth - 35);
      sicLines.forEach((line, lineIdx) => {
        doc.text(line, leftMargin + (lineIdx === 0 ? 12 : 15), yPos);
        yPos += 4;
      });
      yPos += 2;
    });
    doc.setFontSize(11);
    yPos += 5;
  }
  
  // ═══ ACCOUNTS ═══
  if (profile.accounts) {
    addSection("ACCOUNTS INFORMATION");
    doc.setFont(undefined, 'normal');
    
    const acc = profile.accounts;
    if (acc.next_due) {
      doc.setFont(undefined, 'bold');
      doc.text('Next Due:', leftMargin + 5, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(acc.next_due, leftMargin + 50, yPos);
      yPos += 6;
    }
    if (acc.overdue) {
      doc.setTextColor(200, 0, 0);
      doc.setFont(undefined, 'bold');
      doc.text('*** ACCOUNTS OVERDUE ***', leftMargin + 5, yPos);
      doc.setTextColor(0);
      doc.setFont(undefined, 'normal');
      yPos += 6;
    }
    if (acc.last_accounts) {
      doc.setFont(undefined, 'bold');
      doc.text('Last Accounts:', leftMargin + 5, yPos);
      yPos += 6;
      doc.setFont(undefined, 'normal');
      doc.text(`Made up to: ${acc.last_accounts.made_up_to || 'N/A'}`, leftMargin + 10, yPos);
      yPos += 5;
      if (acc.last_accounts.type) {
        doc.text(`Type: ${acc.last_accounts.type}`, leftMargin + 10, yPos);
        yPos += 5;
      }
    }
    if (acc.accounting_reference_date) {
      doc.setFont(undefined, 'bold');
      doc.text('Accounting Reference Date:', leftMargin + 5, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(`${acc.accounting_reference_date.day}/${acc.accounting_reference_date.month}`, leftMargin + 65, yPos);
      yPos += 6;
    }
    yPos += 5;
  }
  
  // ═══ CONFIRMATION STATEMENT ═══
  if (profile.confirmation_statement) {
    addSection("CONFIRMATION STATEMENT");
    doc.setFont(undefined, 'normal');
    
    const cs = profile.confirmation_statement;
    if (cs.next_due) {
      doc.setFont(undefined, 'bold');
      doc.text('Next Due:', leftMargin + 5, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(cs.next_due, leftMargin + 50, yPos);
      yPos += 6;
    }
    if (cs.overdue) {
      doc.setTextColor(200, 0, 0);
      doc.setFont(undefined, 'bold');
      doc.text('*** CONFIRMATION STATEMENT OVERDUE ***', leftMargin + 5, yPos);
      doc.setTextColor(0);
      doc.setFont(undefined, 'normal');
      yPos += 6;
    }
    if (cs.last_made_up_to) {
      doc.setFont(undefined, 'bold');
      doc.text('Last Made Up To:', leftMargin + 5, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(cs.last_made_up_to, leftMargin + 50, yPos);
      yPos += 6;
    }
    yPos += 5;
  }
  
  // ═══ PREVIOUS NAMES ═══
  if (profile.previous_company_names && profile.previous_company_names.length > 0) {
    addSection("PREVIOUS COMPANY NAMES");
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    
    profile.previous_company_names.forEach((prev, idx) => {
      checkPageBreak();
      doc.setFont(undefined, 'bold');
      doc.text(`${idx + 1}.`, leftMargin + 5, yPos);
      doc.setFont(undefined, 'normal');
      doc.text(prev.name, leftMargin + 12, yPos);
      yPos += 5;
      if (prev.ceased_on) {
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`(Changed on ${prev.ceased_on})`, leftMargin + 15, yPos);
        doc.setTextColor(0);
        doc.setFontSize(10);
        yPos += 5;
      }
    });
    doc.setFontSize(11);
    yPos += 5;
  }
  
  // ═══ PERSONS WITH SIGNIFICANT CONTROL ═══
  if (pscData && pscData.length > 0) {
    addSection("PERSONS WITH SIGNIFICANT CONTROL (PSC)");
    doc.setFontSize(10);
    
    pscData.slice(0, 10).forEach((psc, idx) => {
      checkPageBreak(25);
      doc.setFont(undefined, 'bold');
      doc.text(`${idx + 1}. ${psc.name}`, leftMargin + 5, yPos);
      yPos += 5;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(9);
      
      if (psc.kind) {
        doc.text(`Type: ${formatPSCKind(psc.kind)}`, leftMargin + 10, yPos);
        yPos += 4;
      }
      if (psc.nationality) {
        doc.text(`Nationality: ${psc.nationality}`, leftMargin + 10, yPos);
        yPos += 4;
      }
      if (psc.notified_on) {
        doc.text(`Notified: ${psc.notified_on}`, leftMargin + 10, yPos);
        yPos += 4;
      }
      if (psc.natures_of_control && psc.natures_of_control.length > 0) {
        doc.text(`Control: ${psc.natures_of_control.slice(0, 2).join(', ')}`, leftMargin + 10, yPos);
        yPos += 4;
      }
      doc.setFontSize(10);
      yPos += 3;
    });
    
    if (pscData.length > 10) {
      doc.setFontSize(9);
      doc.setTextColor(100);
      doc.text(`... and ${pscData.length - 10} more PSC record(s)`, leftMargin + 5, yPos);
      doc.setTextColor(0);
      doc.setFontSize(10);
      yPos += 5;
    }
    doc.setFontSize(11);
    yPos += 5;
  }
  
  // ═══ RECENT FILING HISTORY ═══
  if (filingHistory && filingHistory.length > 0) {
    addSection("RECENT FILING HISTORY (Last 20)");
    doc.setFontSize(9);
    
    filingHistory.forEach((filing, idx) => {
      checkPageBreak(12);
      doc.setFont(undefined, 'bold');
      doc.text(`${filing.date || 'N/A'}`, leftMargin + 5, yPos);
      doc.setFont(undefined, 'normal');
      const desc = filing.description || filing.type || 'Unknown filing';
      const descLines = doc.splitTextToSize(desc, pageWidth - 50);
      doc.text(descLines[0], leftMargin + 30, yPos);
      yPos += 4;
      if (descLines.length > 1) {
        descLines.slice(1).forEach(line => {
          doc.text(line, leftMargin + 30, yPos);
          yPos += 3;
        });
      }
      yPos += 2;
    });
    doc.setFontSize(11);
    yPos += 5;
  }
  
  // ═══ FOOTER ═══
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120);
    
    // Page number
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      285,
      { align: 'center' }
    );
    
    // Watermark
    doc.text(
      `Control Room - Comprehensive Company Profile`,
      leftMargin,
      285
    );
    
    doc.text(
      `${companyNumber}`,
      pageWidth - 10,
      285,
      { align: 'right' }
    );
  }
  
  // Download
  const fileName = `CompanyProfile_${companyNumber}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(fileName);
  
  setStatus(`Downloaded comprehensive profile for ${companyName}`);
}

// ══════════════════════════════════════════════════════
// UI FUNCTIONS
// ══════════════════════════════════════════════════════

function formatPSCKind(kind) {
  if (!kind) return '';
  return kind
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function renderPSCCard(psc, companyNumber, companyName) {
  const card = document.createElement('div');
  card.className = 'psc-card';
  
  const isIndividual = psc.kind && (psc.kind.includes('individual') || psc.kind.includes('person'));
  const isCorporate = !isIndividual;
  
  const kindClass = isIndividual ? 'psc-tag-individual' : 'psc-tag-corporate';
  const kindText = formatPSCKind(psc.kind);
  
  let html = `
    <div class="psc-card-header">
      <div class="psc-name">${escapeHtml(psc.name)}</div>
      ${kindText ? `<span class="popup-tag ${kindClass}">${escapeHtml(kindText)}</span>` : ''}
    </div>
  `;
  
  if (psc.nationality || psc.country_of_residence) {
    html += `<div class="psc-detail">`;
    if (psc.nationality) html += `<span class="psc-label">Nationality:</span> ${escapeHtml(psc.nationality)} `;
    if (psc.country_of_residence) html += `<span class="psc-label">Country:</span> ${escapeHtml(psc.country_of_residence)}`;
    html += `</div>`;
  }
  
  if (psc.notified_on) {
    html += `<div class="psc-detail"><span class="psc-label">Notified:</span> ${escapeHtml(psc.notified_on)}</div>`;
  }
  
  if (psc.natures_of_control && psc.natures_of_control.length > 0) {
    html += `<div class="psc-natures">`;
    psc.natures_of_control.slice(0, 3).forEach(nature => {
      html += `<span class="psc-nature-tag">${escapeHtml(nature.replace(/-/g, ' '))}</span>`;
    });
    if (psc.natures_of_control.length > 3) {
      html += `<span class="psc-nature-tag">+${psc.natures_of_control.length - 3} more</span>`;
    }
    html += `</div>`;
  }
  
  card.innerHTML = html;
  return card;
}

function displayPSCResults(container, pscData, companyNumber, companyName) {
  container.innerHTML = '';
  
  if (!pscData || pscData.length === 0) {
    container.innerHTML = '<div class="ch-result-count">No PSC records found</div>';
    return;
  }
  
  // Header with download button
  const header = document.createElement('div');
  header.className = 'psc-results-header';
  header.innerHTML = `
    <div class="ch-result-count">${pscData.length} PSC record${pscData.length === 1 ? '' : 's'}</div>
    <button class="btn-download-pdf" onclick="downloadPSCReport('${escapeHtml(companyNumber)}', '${escapeHtml(companyName)}', window._currentPSCData)">
      📄 Download PDF
    </button>
  `;
  container.appendChild(header);
  
  // Store data globally for PDF download
  window._currentPSCData = pscData;
  
  // PSC cards
  pscData.forEach(psc => {
    container.appendChild(renderPSCCard(psc, companyNumber, companyName));
  });
}

// View PSC for company (called from popup or elsewhere)
async function viewCompanyPSC(companyNumber, companyName = '') {
  // Switch to People tab
  document.querySelectorAll(".cp-tab").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".cp-tab-pane").forEach(p => p.classList.remove("active"));
  document.querySelector('[data-tab="people"]')?.classList.add("active");
  document.getElementById("tab-people")?.classList.add("active");
  
  const resultsDiv = document.getElementById("psc_results");
  resultsDiv.innerHTML = '<div class="ch-loading">Loading PSC data from API...</div>';
  showPscProgress();
  setPscProgress("Fetching PSC records...", 50);
  setStatus(`Loading PSC for company #${companyNumber}...`);
  
  const pscRecords = await getPSCForCompanyAPI(companyNumber);
  
  hidePscProgress();
  
  // Get company name if not provided
  if (!companyName && pscRecords.length === 0) {
    companyName = `Company #${companyNumber}`;
  }
  
  displayPSCResults(resultsDiv, pscRecords, companyNumber, companyName);
  setStatus(`${pscRecords.length} PSC record${pscRecords.length === 1 ? '' : 's'} for #${companyNumber}`);
}
