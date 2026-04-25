// ── Entry point ───────────────────────────────────────────────────────────────
// Supports both new sections-based payload and legacy textboxes/tables payload

export function buildHTML(execName, event, sections, legacyTextboxes, legacyTables, theme, headerFooter = {}) {

  // Legacy fallback for old POC payload format
  if ((!sections || sections.length === 0) && legacyTextboxes) {
    return buildLegacyHTML(execName, legacyTextboxes, legacyTables || {});
  }

  const nameLower = execName.toLowerCase();
  const eventName = (event && event.name) || "Executive Briefing";
  const showConfidential = event && event.show_confidential !== false;
  const hTop    = headerFooter.headerHeight || '0in';
  const hBottom = headerFooter.footerHeight  || '0.4in';
  const hasGraphicHeader = sections.some(s => s.type === "graphic_header");
  // Add 0.25in breathing room below graphic header on every page (incl. continuations)
  const hTopPadded = hasGraphicHeader
    ? `${(parseFloat(hTop) + 0.25).toFixed(2)}in`
    : hTop;
  const confidentialLabel = showConfidential ? `${esc(eventName)}  |  Confidential` : esc(eventName);
  const coverStyle = (event && event.cover_style) || "full";
  const accentColor = (theme && theme.accent_color) || "var(--accent)";
  const accentText  = (theme && theme.accent_text_color) || "#000000";
  const highlightColor = (theme && theme.highlight_color) || "var(--highlight)";
  const highlightText  = (theme && theme.highlight_text_color) || "#ffffff";

  // Find cover content
  const overviewSection = sections.find(s => s.type === "brief_overview");
  const introCopy = getContent(overviewSection, nameLower) || "";
  const hasBriefHeader = sections.some(s => s.type === "brief_header");

  // Build interior section HTML (fallback for standard full-cover layout)
  const bodyHTML = renderSections(execName, nameLower, sections, eventName, coverStyle);

  // Check if FPG sections exist — if so, use renderInteriorHTML to put FPGs at body
  // level where CSS named pages (page: fpg) are honoured, suppressing the header.
  const hasFPGSections = filterInteriorSections(sections, nameLower).some(
    s => s.type === "full_page_graphic" || s.type === "travel_page");

  const coverHTML = (hasBriefHeader || hasGraphicHeader)
    ? (hasFPGSections
      ? `<!-- GRAPHIC HEADER — FPG sections lifted to body level for named page support -->
${renderInteriorHTML(execName, nameLower, sections, eventName)}`
      : `<!-- ${hasBriefHeader ? 'BRIEF' : 'GRAPHIC'} HEADER (no cover page, no running header) -->
<div class="page content-page">
  <div class="page-body">
    ${renderSectionRows(execName, nameLower, sections, eventName)}
  </div>
</div>`)
    : coverStyle === "compact"
    ? `<!-- COMPACT HEADER (no separate cover page) -->
<div class="page content-page">
  <div class="compact-header">
    <div class="compact-header-left">
      <div class="compact-eyebrow">Executive Briefing</div>
      <div class="compact-name">${esc(execName)}</div>
      <div class="compact-meta">${esc(eventName)}${event && event.event_dates ? "  &nbsp;|&nbsp;  " + esc(event.event_dates) : ""}${event && event.location ? "  &nbsp;|&nbsp;  " + esc(event.location) : ""}</div>
    </div>
    <div class="compact-header-right">
      <div class="compact-conf">${confidentialLabel}</div>
      <div class="compact-brand">ServiceNow</div>
    </div>
  </div>
  <div class="page-body">
    ${renderSectionRows(execName, nameLower, sections, eventName)}
  </div>
</div>`
    : `<!-- FULL COVER PAGE -->
<div class="page cover">
  <div class="cover-eyebrow">Executive Briefing</div>
  <div class="cover-name">Prepared for<br>${esc(execName)}</div>
  <div class="cover-event">${esc(eventName)}</div>
  ${event && event.event_dates ? `<div class="cover-dates">${esc(event.event_dates)}${event.location ? "  &nbsp;|&nbsp;  " + esc(event.location) : ""}</div>` : ""}
  <div class="cover-rule"></div>
  ${introCopy ? `<div class="cover-intro">${introCopy}</div>` : ""}
  <div class="cover-footer">
    <div class="cover-footer-left">
      <div class="cover-dot"></div>
      <div class="cover-footer-brand">ServiceNow</div>
    </div>
    <div class="cover-footer-conf">${confidentialLabel}</div>
  </div>
</div>

<!-- INTERIOR PAGES -->
${bodyHTML}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
:root {
  --accent: ${accentColor};
  --accent-text: ${accentText};
  --highlight: ${highlightColor};
  --highlight-text: ${highlightText};
}
${baseCSS()}
:root { --fpg-title-top: calc(${hTopPadded} + 0.3in); }
@page { margin: ${hTopPadded} 0 ${hBottom} 0; }
@page fpg { margin: 0 0 ${hBottom} 0; }
/* Standalone FPG (direct body child) — no .page-body padding to undo */
body > .fpg-wrap { margin: 0; page-break-before: auto; }
/* Gallery: full-bleed page, header overlays on top, footer suppressed via merge */
@page gallery { margin: 0; }
.gallery-page { page: gallery; }
.gallery-page .page-body { padding: 0; margin: 0; }
.gallery-wrap > .gallery-content { position: absolute; top: ${hTopPadded}; left: 0.5in; right: 0.5in; bottom: ${hBottom}; z-index: 1; overflow: hidden; display: flex; flex-direction: column; }
</style>
</head>
<body data-exec-name="${esc(execName)}" data-footer-conf="${confidentialLabel}"${(event && event.section_bar_style && event.section_bar_style !== 'classic') ? ` class="bar-${event.section_bar_style}"` : ''}>
${coverHTML}
</body>
</html>`;
}

// ── Section renderer ──────────────────────────────────────────────────────────

function filterInteriorSections(sections, nameLower) {
  return sections.filter(s => {
    if (s.type === "brief_title") return false;
    if (s.type === "footer") return false;
    if (s.type === "graphic_header") return false;
    if (s.type === "graphic_footer") return false;
    if (s.type === "exec_enhancements") {
      return !!getOverride(s, nameLower);
    }
    // Skip auto-generated sections that have no content for this exec
    const bt = (s.body_text || "").trim();
    if (s.type === "rehearsal_schedule" && (!bt || bt === "<!-- no rehearsals -->")) return false;
    if (s.type === "at_a_glance_schedule" && (!bt || bt === "<!-- no meetings -->")) return false;
    if (s.type === "panel_details" && (!bt || bt.startsWith("<!-- no panels"))) return false;
    return true;
  });
}

// Convert a section title to a stable anchor slug.
// Used by both the TOC renderer and section id injection — they must match.
function titleToAnchor(title) {
  return "sec-" + (title || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+-$/g, "");
}

// Build TOC entry list from the interior sections array.
// Excludes types that shouldn't appear as TOC entries.
const TOC_SKIP = new Set(["table_of_contents", "logo", "large_image", "brief_title", "brief_header", "brief_overview", "footer", "graphic_header", "graphic_footer", "full_page_graphic", "travel_page"]);
function buildTocEntries(interior) {
  return interior
    .filter(s => !TOC_SKIP.has(s.type) && (s.title || "").trim())
    .map(s => ({ anchor: titleToAnchor(s.title), title: s.title }));
}

function renderSectionRows(execName, nameLower, sections, eventName) {
  const interior = filterInteriorSections(sections, nameLower);
  if (interior.length === 0) return "";
  const tocEntries = buildTocEntries(interior);
  const rows = groupIntoRows(interior);
  let idx = 0;
  return rows.map(row => {
    if (row.type === "pair") {
      const li = idx++, ri = idx++;
      return renderRow(row, execName, nameLower, eventName, li, ri, tocEntries);
    }
    return renderRow(row, execName, nameLower, eventName, idx++, null, tocEntries);
  }).join("\n");
}

// FPG sections are emitted as direct body children so `page: fpg` is honoured
// by Chromium, suppressing the Puppeteer header on those pages.
// Non-FPG sections are grouped into normal .page.content-page blocks.
function renderInteriorHTML(execName, nameLower, sections, eventName) {
  const interior = filterInteriorSections(sections, nameLower);
  if (interior.length === 0) return "";
  const tocEntries = buildTocEntries(interior);

  // Find graphic header for headed FPGs — bake it into the FPG HTML
  const ghSec = sections.find(s => s.type === "graphic_header" && (s.image_url || s.image_b64));
  const ghSrc = ghSec ? (ghSec.image_url || `data:${ghSec.image_mime || 'image/jpeg'};base64,${ghSec.image_b64}`) : "";
  const ghHtml = ghSec ? `<img src="${ghSrc}" style="position:absolute;top:0;left:0;width:100%;height:${ghSec.banner_height || '1in'};object-fit:cover;z-index:5;" />` : "";

  const segments = [];
  let currentGroup = [];
  for (const s of interior) {
    if (s.type === "full_page_graphic" || s.type === "travel_page") {
      const fpgCfg = s.fpg_config || {};
      if (currentGroup.length > 0) { segments.push({ type: "content", items: currentGroup }); currentGroup = []; }
      segments.push({ type: "fpg", section: s });
    } else if (s.type === "photo_gallery" || s.type === "full_page_content") {
      if (currentGroup.length > 0) { segments.push({ type: "content", items: currentGroup }); currentGroup = []; }
      segments.push({ type: "gallery", section: s });
    } else {
      currentGroup.push(s);
    }
  }
  if (currentGroup.length > 0) segments.push({ type: "content", items: currentGroup });

  let idx = 0;
  return segments.map(seg => {
    if (seg.type === "fpg") {
      return renderSection(seg.section, execName, nameLower, eventName, idx++, tocEntries, ghHtml);
    }
    if (seg.type === "gallery") {
      const galleryHTML = renderSection(seg.section, execName, nameLower, eventName, idx++, tocEntries, ghHtml);
      return `<div class="page gallery-page">${galleryHTML}</div>`;
    }
    const rows = groupIntoRows(seg.items);
    const rowsHTML = rows.map(row => {
      if (row.type === "pair") {
        const li = idx++, ri = idx++;
        return renderRow(row, execName, nameLower, eventName, li, ri, tocEntries);
      }
      return renderRow(row, execName, nameLower, eventName, idx++, null, tocEntries);
    }).join("\n");
    return `<div class="page content-page">
  <div class="page-body">${rowsHTML}</div>
</div>`;
  }).join("\n");
}

function renderSections(execName, nameLower, sections, eventName, coverStyle, hidePageHeader = false) {
  if (coverStyle === "compact") return "";
  const interior = filterInteriorSections(sections, nameLower);
  if (interior.length === 0) return "";
  const rowsHTML = renderSectionRows(execName, nameLower, sections, eventName);
  const pageHeaderHTML = hidePageHeader ? "" : `<div class="page-header">
    <div class="page-header-title">${esc(eventName)}</div>
    <div class="page-header-right">${esc(eventName)}  |  Confidential</div>
  </div>`;
  return `<div class="page content-page">
  ${pageHeaderHTML}
  <div class="page-body">
    ${rowsHTML}
  </div>
</div>`;
}

function groupIntoRows(sections) {
  const rows = [];
  let i = 0;
  while (i < sections.length) {
    const s = sections[i];
    if (s.width === "half") {
      const next = sections[i + 1];
      if (next && next.width === "half") {
        rows.push({ type: "pair", left: s, right: next });
        i += 2;
        continue;
      }
    }
    rows.push({ type: "single", section: s });
    i++;
  }
  return rows;
}

function renderRow(row, execName, nameLower, eventName, leftIdx, rightIdx, tocEntries) {
  if (row.type === "pair") {
    return `<div class="row-pair">
      <div class="col-half">${renderSection(row.left, execName, nameLower, eventName, leftIdx, tocEntries)}</div>
      <div class="col-half">${renderSection(row.right, execName, nameLower, eventName, rightIdx, tocEntries)}</div>
    </div>`;
  }
  return renderSection(row.section, execName, nameLower, eventName, leftIdx, tocEntries);
}

function renderSection(section, execName, nameLower, eventName, sectionIndex = 0, tocEntries = [], ghHtml = "") {
  const type = section.type;
  const title = section.title || "";
  const br = section.border_radius ? `border-radius:${section.border_radius}px;` : "";
  const bgColor = getBgColor(section.background_color);
  const bgStyle = bgColor ? `background:${bgColor};${br}padding:0.25in 0.3in;margin-bottom:0.2in;` : "";
  const textColor = bgColor && bgColor !== "#ffffff" && bgColor !== "#f3f4f6" ? "color:#ffffff;" : "";
  const barStyle = textColor ? "color:#ffffff;background:transparent;border-bottom-color:rgba(255,255,255,0.4);" : "";
  const customHeader = section.header_text && String(section.header_text).trim() ? String(section.header_text) : null;
  const asIs = !!(customHeader || section.title_mixed_case);
  const mc = asIs ? ' mc' : '';
  const T = (t, fallback = '') => {
    const src = customHeader || t || fallback;
    return esc(src);
  };

  const content = getContent(section, nameLower);

  const html = (() => { switch (type) {

    case "exec_enhancements":
    case "callout":
    case "event_highlights":
    case "brief_overview":
    case "text":
    case "custom": {
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar${mc}" style="${barStyle}${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>` : ""}
        <div class="section-richtext" style="${textColor}">${content || ""}</div>
      </div>`;
    }

    case "html_content": {
      // Raw HTML injection — body_text is trusted HTML authored in the code editor.
      // Bypasses stripFontFamily so the author's styles are preserved exactly.
      const rawHtml = section.body_text || "";
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar${mc}" style="${barStyle}${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>` : ""}
        <div class="html-content-body">${rawHtml}</div>
      </div>`;
    }

    case "two_column": {
      const col1Content = stripInlineStylesPDF(section.left_label || "");
      const col2Content = stripInlineStylesPDF(section.body_text || "");
      if (!col1Content && !col2Content) return "";
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar${mc}" style="${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>` : ""}
        <div class="two-col-layout">
          <div class="two-col-label section-richtext">${col1Content}</div>
          <div class="two-col-content section-richtext">${col2Content}</div>
        </div>
      </div>`;
    }

    case "three_column": {
      const col1Content = stripInlineStylesPDF(section.left_label || "");
      const col2Content = stripInlineStylesPDF(section.body_text || "");
      const col3Content = stripInlineStylesPDF(section.body_text_2 || "");
      if (!col1Content && !col2Content && !col3Content) return "";
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar${mc}" style="${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>` : ""}
        <div class="three-col-layout">
          <div class="three-col-label section-richtext">${col1Content}</div>
          <div class="three-col-right">
            <div class="three-col-col section-richtext">${col2Content}</div>
            <div class="three-col-col section-richtext">${col3Content}</div>
          </div>
        </div>
      </div>`;
    }

    case "logistical_details": {
      const rows = (section.items || []).map(item =>
        `<tr><td class="kv-label">${esc(item.col_1 || "")}</td><td>${esc(item.col_2 || "")}</td></tr>`
      ).join("");
      return `<div class="section-wrap" style="${bgStyle}">
        <div class="section-bar${mc}" style="${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>
        <table class="kv-table"><tbody>${rows}</tbody></table>
      </div>`;
    }

    case "gym_hours": {
      const items = (section.gym_data && section.gym_data[execName]) || [];
      if (!items || items.length === 0) return "";
      // col_2 = gym name, col_3 = hours, col_4 = location, col_5 = notes
      const gymBlocks = items.map(item => {
        const gymName = item.col_2 || "";
        const details = [
          ["Hours",    item.col_3],
          ["Location", item.col_4],
          ["Notes",    item.col_5],
        ].filter(([, v]) => v);
        const detailRows = details.map(([label, value]) =>
          `<tr><td class="hotel-mini-label">${esc(label)}</td><td class="hotel-mini-value">${esc(value)}</td></tr>`
        ).join("");
        return `
          ${gymName ? `<div class="hotel-name">${esc(gymName)}</div>` : ""}
          ${detailRows ? `<table class="hotel-mini-table"><tbody>${detailRows}</tbody></table>` : ""}`;
      }).join(`<div style="margin-top:10px;"></div>`);
      return `<div class="section-wrap" style="${bgStyle}">
        <div class="section-bar${mc}" style="${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title, "Gym Hours")}</div>
        <div class="hotel-layout">
          <div class="hotel-col-label">Gym</div>
          <div class="hotel-col-content">${gymBlocks}</div>
        </div>
      </div>`;
    }

    case "hotel_info": {
      const info = (section.travel_data || {})[execName] || {};
      if (!info.hotel_name) return "";
      const tableRows = [
        ["Check-in",        formatDate(info.check_in)],
        ["Check-out",       formatDate(info.check_out)],
        ["Confirmation #",  info.confirmation_number],
      ]
        .filter(([, v]) => v)
        .map(([label, value]) =>
          `<tr><td class="hotel-mini-label">${esc(label)}</td><td class="hotel-mini-value">${esc(value)}</td></tr>`
        ).join("");
      const extras = [
        ["Name",  info.name_on_reservation],
        ["Notes", info.notes],
      ]
        .filter(([, v]) => v)
        .map(([label, value]) =>
          `<div class="hotel-detail-row"><span class="hotel-detail-label">${esc(label)}:</span> ${esc(value)}</div>`
        ).join("");
      const hotelCopy = (section.body_text || '').trim();
      const vipLocation = (info.vip || '').trim();
      const vipMsg = (section.body_text_2 || '').trim();
      const vipBlock = vipLocation ? `
        <div style="margin-top:6pt;">
          ${vipMsg ? `<div style="margin-bottom:3pt;">${vipMsg}</div>` : ''}
          <div style="font-weight:bold;">${esc(vipLocation)}</div>
        </div>` : '';
      return `<div class="section-wrap" style="${bgStyle}">
        <div class="section-bar${mc}" style="${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title, "Hotel & Travel Info")}</div>
        ${hotelCopy ? `<div style="margin-bottom:6pt;">${hotelCopy}</div>` : ""}
        <div class="hotel-layout">
          <div class="hotel-col-label">Hotel</div>
          <div class="hotel-col-content">
            <div class="hotel-name">${formatHotelName(info.hotel_name)}</div>
            ${tableRows ? `<table class="hotel-mini-table"><tbody>${tableRows}</tbody></table>` : ""}
            ${extras}
            ${vipBlock}
          </div>
        </div>
      </div>`;
    }

    case "key_contacts": {
      const items = section.items || [];
      if (!items.length) return "";
      const bullets = items.map(item => {
        const name  = esc(item.col_1 || "");
        const role  = esc(item.col_2 || "");
        const phone = esc(item.col_3 || "");
        const email = item.col_4 ? `<a href="mailto:${esc(item.col_4)}" style="color:#0563C1;text-decoration:underline;">${esc(item.col_4)}</a>` : "";
        const parts = [role ? `<strong>${role}</strong>: ${name}` : name];
        if (email) parts.push(`(${email})`);
        if (phone) parts.push(`- ${phone}`);
        return `<div style="font-size:9pt;padding:2px 0;"><span style="font-size:5.5pt;vertical-align:middle;margin-right:4px;">&#x2022;</span>${parts.join(" ")}</div>`;
      }).join("");
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar${mc}" style="${barStyle}${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>` : ""}
        <div>${bullets}</div>
      </div>`;
    }

    case "run_of_show": {
      const rosItems = section.items || [];
      if (!rosItems.length) return "";
      const rosHeaders = ["Time", "Topic", "Presenter"];
      const rosColKeys = ["col_1", "col_2", "col_3"];
      const headerCells = rosHeaders.map(h => `<th>${esc(h)}</th>`).join("");
      const rows = rosItems.map(item => {
        const isExec = nameLower && (item.col_3 || "").toLowerCase().includes(nameLower);
        const cells = rosColKeys.map((k, idx) => {
          const bold = idx === 0 ? ' style="font-weight:bold;"' : '';
          return `<td${bold}>${esc(item[k] || "")}</td>`;
        }).join("");
        return `<tr class="${isExec ? "exec-row" : ""}">${cells}</tr>`;
      }).join("");
      const rosTs = section.body_text_2 ? section.body_text_2.trim() : "";
      const footNote = rosTs ? `<div style="text-align:right;font-size:8pt;color:#999;margin-top:2px;">Last updated: ${esc(new Date(rosTs).toLocaleString())}</div>` : "";
      return `<div class="section-wrap" style="${bgStyle}">
        <div class="section-bar${mc}" style="${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>
        <table><thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table>
      </div>${footNote}`;
    }

    case "rehearsal_schedule": {
      // Auto-generated: body_text is pre-rendered HTML from DB rehearsal data
      const rehContent = content ? content.trim() : "";
      if (!rehContent || rehContent === "<!-- no rehearsals -->") return "";
      const showLastUpdated = section.left_label === '1' && section.body_text_2;
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar${mc}" style="${barStyle}${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>` : ""}
        <div class="html-content-body">${rehContent}</div>
        ${showLastUpdated ? `<div style="margin-top:4pt;">${section.body_text_2}</div>` : ""}
      </div>`;
    }

    case "event_schedule": {
      const headers = ["Time", "Session", "Location"];
      const colKeys = ["col_1", "col_2", "col_3"];
      return renderTable(section, title, headers, colKeys, nameLower, bgStyle);
    }

    case "logo": {
      const logoScale = Math.max(0.25, (parseInt(section.left_label) || 100) / 100);
      const logoMaxPx = Math.round(96 * logoScale);
      if (section.image_b64) {
        const mime = section.image_mime || "image/png";
        return `<div class="section-wrap logo-wrap" style="${bgStyle}">
          <img src="data:${mime};base64,${section.image_b64}" style="max-height:${logoMaxPx}px;max-width:${logoMaxPx * 4}px;object-fit:contain;" alt="Logo">
        </div>`;
      }
      return `<div class="section-wrap logo-wrap" style="${bgStyle}">
        <div class="large-image-placeholder">[ Logo — attach image to section ]</div>
      </div>`;
    }

    case "brief_header": {
      const bannerHtml = section.body_text || "<strong style=\"color:#ffffff\">Executive Briefing</strong>";
      const docTitle = section.left_label || "";
      const logoB64 = section.logo_b64 || "";
      const logoMime = section.logo_mime || "image/png";
      return `<div class="section-wrap" style="margin-bottom:0.2in;">
        ${logoB64 ? `<div style="margin-bottom:0.1in;"><img src="data:${logoMime};base64,${logoB64}" style="max-height:1in;max-width:1in;object-fit:contain;display:block;"></div>` : ""}
        <div style="background:#032D42;padding:0.18in 0.2in;margin-bottom:0.28in;border-radius:6px;">
          <div style="font-size:20pt;font-weight:bold;line-height:1.1;text-align:left;">${bannerHtml}</div>
        </div>
        <div style="font-size:11pt;font-weight:bold;color:#111111;">
          ${esc(execName)}${docTitle ? ` — ${esc(docTitle)}` : ""}
        </div>
        ${section.event_meta ? `<div style="font-size:9pt;color:#555555;margin-top:4pt;">${esc(section.event_meta)}</div>` : ""}
      </div>`;
    }

    case "week_at_a_glance": {
      const cols = (section.items || []).slice(0, 4);
      const colCards = cols.map(item => `
        <div class="wag-card">
          <div class="wag-date">${esc(item.col_1 || "")}</div>
          <div class="wag-body">${stripFontFamily(stripInlineStyles(item.col_2 || ""))}</div>
        </div>`).join("");
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar${mc}" style="${textColor}${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>` : ""}
        <div class="wag-grid">${colCards}</div>
      </div>`;
    }

    case "meal_schedule": {
      const mealRows = (section.meal_data && section.meal_data[nameLower !== undefined ? Object.keys(section.meal_data).find(k => k.toLowerCase() === nameLower) || Object.keys(section.meal_data)[0] : Object.keys(section.meal_data || {})[0]]) || section.items || [];
      if (!mealRows.length) return "";
      let config = {};
      try { config = JSON.parse(section.body_text || '{}'); } catch {}
      const days = config.days || ['Day 1', 'Day 2', 'Day 3', 'Day 4'];
      const fmtDayHdr = (d) => {
        const ci = d.indexOf(',');
        if (ci < 0) return esc(d);
        return `${esc(d.slice(0, ci))}<br/>${esc(d.slice(ci + 1).trim())}`;
      };
      const DBold = `'ServiceNow Sans Display Bold','ServiceNow Sans Display','SNSansDisplay',sans-serif`;
      const SReg  = `'ServiceNow Sans','ServiceNowSans',sans-serif`;
      const headerCells = `<th style="text-align:left;padding:6pt 8pt;font-size:9pt;vertical-align:middle;font-family:${DBold}">Area</th>` + days.map(d => `<th style="text-align:center;padding:5pt 4pt;font-size:8.5pt;line-height:1.3;vertical-align:middle;font-family:${SReg}">${fmtDayHdr(d)}</th>`).join('');
      const bodyRows = mealRows.map(item => {
        let cells = [];
        try { cells = JSON.parse(item.col_4 || '[]'); } catch {}
        cells = Array(4).fill(null).map((_, i) => cells[i] || { text: '', span: 1 });
        let dayCells = '';
        let ci = 0;
        while (ci < 4) {
          const cell = cells[ci] || { text: '', span: 1 };
          const span = Math.min(Math.max(cell.span || 1, 1), 4 - ci);
          const txt = (cell.text || '').replace(/\n/g, '<br/>');
          dayCells += `<td class="meal-cell" colspan="${span}" style="font-size:8pt;white-space:nowrap;vertical-align:middle;font-family:${SReg}">${txt}</td>`;
          ci += span;
        }
        return `<tr><td style="padding:5pt 8pt;font-size:8pt;vertical-align:middle;font-family:${DBold}"><div class="meal-venue">${esc(item.col_1 || '')}</div>${item.col_2 ? `<div class="meal-location">${esc(item.col_2)}</div>` : ''}</td>${dayCells}</tr>`;
      }).join('');
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar${mc}" style="${barStyle}${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>` : ""}
        <table class="meal-table"><thead><tr style="background:#032D42;color:#fff">${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>
      </div>`;
    }

    case "at_a_glance_schedule": {
      // Pre-rendered HTML arrives via per-exec override from EBGenerator.
      // content is already resolved by getContent() above — override wins over body_text.
      // Skip entirely if empty or the sentinel "no meetings" comment.
      const aagContent = content ? content.trim() : "";
      if (!aagContent || aagContent === "<!-- no meetings -->") return "";
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar${mc}" style="${barStyle}${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>` : ""}
        <div class="html-content-body">${aagContent}</div>
      </div>`;
    }

    case "large_image": {
      // First item: col_1=Headline, col_2=Subhead, col_3=Caption
      const imgItem = (section.items || [])[0] || {};
      const headline  = imgItem.col_1 || "";
      const subhead   = imgItem.col_2 || "";
      const caption   = section.caption || imgItem.col_3 || "";
      const imgTag    = section.image_b64
        ? `<img src="data:${section.image_mime || "image/png"};base64,${section.image_b64}" class="large-img" alt="${esc(headline)}">`
        : `<div class="large-image-placeholder">[ Image — attach image to section ]</div>`;
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar${mc}" style="${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>` : ""}
        ${headline ? `<div class="img-headline">${esc(headline)}</div>` : ""}
        ${subhead  ? `<div class="img-subhead">${esc(subhead)}</div>`   : ""}
        ${imgTag}
        ${caption  ? `<div class="img-caption">${caption}</div>`         : ""}
      </div>`;
    }

    case "table_of_contents": {
      if (tocEntries.length === 0) return "";
      const rows = tocEntries.map(e =>
        `<div style="padding:2px 0;"><span style="font-size:5.5pt;vertical-align:middle;margin-right:4px;">&#x2022;</span><a class="toc-link" href="#${e.anchor}">${esc(e.title)}</a></div>`
      ).join("");
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar${mc}" style="${barStyle}${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>` : ""}
        <div style="padding:2px 0;">${rows}</div>
      </div>`;
    }

    case "travel_page":
    case "full_page_graphic": {
      const fpgConfig = section.fpg_config || {};
      const overlaysHtml = (fpgConfig.overlays || []).map(o => {
        const rawContent = (o.resolved_content !== undefined ? o.resolved_content : (o.content || ""))
          .replace(/\r/g, "")                       // strip carriage returns
          .replace(/<br\s*\/?>\s*<\/p>/gi, "</p>")  // strip trailing <br> before </p>
          .replace(/[\u000B\u000C\u0085\u2028\u2029]/g, ""); // strip exotic line separators
        const isHtml   = o.is_html === true || (typeof rawContent === "string" && rawContent.trim().startsWith("<"));
        const isButton = o.overlay_type === "button";
        const os = [
          `top:${o.top || "0pt"}`, `left:${o.left || "0pt"}`,
          o.width  ? `width:${o.width};max-width:${o.width}` : "",
          o.height ? `height:${o.height}` : "",
          // font/color/align now come from rich text HTML inline styles; keep overlay-level as fallback
          o.font_size     ? `font-size:${o.font_size}` : "",
          o.font_weight && o.font_weight !== 'normal' ? `font-weight:${o.font_weight}` : "",
          o.color         ? `color:${o.color}` : "",
          o.text_align && o.text_align !== 'left' ? `text-align:${o.text_align}` : "",
          o.bg_color      ? `background:${o.bg_color}` : "",
          o.padding       ? `padding:${o.padding}` : "",
          o.border_radius ? `border-radius:${o.border_radius}` : "",
          isHtml          ? "white-space:normal" : "",
          isButton        ? "display:inline-flex;align-items:center;justify-content:center" : "",
        ].filter(Boolean).join(";");
        const content = isHtml ? rawContent : esc(rawContent);
        const linked = (isButton && o.href)
          ? `<a href="${esc(o.href)}" style="display:block;width:100%;height:100%;text-decoration:none;color:inherit;">${content}</a>`
          : content;
        return `<div class="fpg-overlay" style="${os}">${linked}</div>`;
      }).join("");
      const hideFooter = fpgConfig.hide_footer === true || fpgConfig.hide_footer === "true";
      const showHeader = fpgConfig.show_header === true || fpgConfig.show_header === "true";
      const headerHtml = (showHeader && ghHtml) ? ghHtml : "";
      const hideTitle = fpgConfig.hide_title === true || fpgConfig.hide_title === "true";
      const fpgTitleText = customHeader || section.title || "";
      const titleHtml = (!hideTitle && fpgTitleText.trim())
        ? `<div class="fpg-title${mc}">${T(section.title)}</div>`
        : "";
      const fpgImgSrc = section.image_url || (section.image_b64 ? `data:image/jpeg;base64,${section.image_b64}` : "");
      return `<div class="fpg-wrap${hideFooter ? ' fpg-no-footer' : ''}">${headerHtml}${fpgImgSrc
        ? `<img src="${fpgImgSrc}" alt="" />`
        : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#999;font-size:11pt;">[No background — select a Slide Background in section settings]</div>`
      }${overlaysHtml}${titleHtml}</div>`;
    }

    case "photo_gallery": {
      let gc = {};
      try { gc = JSON.parse(section.body_text || '{}'); } catch {}
      const gLayout = gc.layout || '4_up';
      const gTitle = gc.page_title || '';
      // Hide empty slots — a slot needs a photo OR a name. Title alone is treated as empty.
      // Middle gaps collapse; subsequent slots shift up into the freed positions.
      const gSlots = (gc.slots || []).filter(s => s && ((s.photo && String(s.photo).trim()) || (s.name && String(s.name).trim())));
      if (!gSlots.length) return '';
      const GF = "font-family:'ServiceNow Sans Display Bold','Inter',sans-serif;";
      const BF = "font-family:'ServiceNow Sans','Inter',Arial,sans-serif;";
      const bgImg = gc.bg_image || '';

      const is12 = gLayout === '12_up';
      const cols = is12 ? 2 : gLayout === '1_up' ? 1 : gLayout === '2_up' ? 2 : gLayout === '4_up' ? 2 : 3;
      const gTitleHtml = gTitle ? `<div style="${GF}font-size:24pt;font-weight:900;color:#000;margin-bottom:12pt;">${esc(gTitle)}</div>` : '';

      let slotsHtml;
      if (is12) {
        const rows = [];
        for (let i = 0; i < gSlots.length; i += 2) {
          const makeCard = (slot) => {
            if (!slot) return '<td style="width:50%;padding:4pt 6pt;vertical-align:middle;border:none;text-align:left;"></td>';
            const photo = slot.photo ? `<img src="${slot.photo}" style="width:67pt;height:67pt;border-radius:6pt;object-fit:cover;display:block;" />` : `<div style="width:67pt;height:67pt;border-radius:6pt;background:rgba(0,0,0,0.06);"></div>`;
            return `<td style="width:50%;padding:4pt 6pt;vertical-align:middle;border:none;text-align:left;">
              <table style="border-collapse:collapse;width:100%;"><tr>
                <td style="padding:0 10pt 0 0;vertical-align:middle;border:none;width:67pt;">${photo}</td>
                <td style="vertical-align:middle;border:none;text-align:left;">
                  <div style="font-family:'ServiceNow Sans Display Bold','Inter',sans-serif;font-size:11pt;font-weight:700;color:#000;">${esc(slot.name || '')}</div>
                  <div style="font-family:'ServiceNow Sans','Inter',sans-serif;font-size:8pt;font-weight:500;color:#555;">${esc(slot.title || '')}</div>
                </td>
              </tr></table>
            </td>`;
          };
          rows.push(`<tr>${makeCard(gSlots[i])}${makeCard(gSlots[i+1])}</tr>`);
        }
        slotsHtml = `<table style="width:100%;border-collapse:collapse;">${rows.join('')}</table>`;
      } else {
        const photoSize = cols === 1 ? '300pt' : cols === 2 ? '220pt' : '100pt';
        const nameSize = cols === 1 ? '14pt' : cols === 2 ? '11pt' : '9pt';
        const subSize = cols === 1 ? '10pt' : cols === 2 ? '8pt' : '7pt';
        const NF = "font-family:'ServiceNow Sans Display Bold','Inter',sans-serif;";
        const TF = "font-family:'ServiceNow Sans','Inter',sans-serif;";
        const cells = gSlots.map(slot => {
          const photo = slot.photo
            ? `<div style="width:${photoSize};height:${photoSize};border-radius:8pt;overflow:hidden;margin:0 auto 6pt;flex-shrink:0;"><img src="${slot.photo}" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`
            : `<div style="width:${photoSize};height:${photoSize};border-radius:8pt;background:rgba(0,0,0,0.06);margin:0 auto 6pt;flex-shrink:0;"></div>`;
          return `<td style="width:${Math.floor(100/cols)}%;text-align:center;vertical-align:top;padding:6pt 4pt;border:none;">
            ${photo}
            <div style="${NF}font-size:${nameSize};font-weight:700;color:#000;">${esc(slot.name || '')}</div>
            <div style="${TF}font-size:${subSize};font-weight:500;color:#555;margin-top:1pt;">${esc(slot.title || '')}</div>
          </td>`;
        });
        const rows = [];
        for (let i = 0; i < cells.length; i += cols) {
          rows.push(`<tr>${cells.slice(i, i + cols).join('')}</tr>`);
        }
        slotsHtml = `<table style="width:100%;border-collapse:collapse;">${rows.join('')}</table>`;
      }

      const bgUrl = gc.bg_image_url || '';
      const bgSrc = bgUrl || (bgImg ? (bgImg.startsWith('data:') ? bgImg : `data:image/jpeg;base64,${bgImg}`) : '');
      const bgImgHtml = bgSrc ? `<img class="gallery-bg" src="${bgSrc}" />` : '';
      return `<div class="gallery-wrap">${bgImgHtml}${ghHtml}<div class="gallery-content">${gTitleHtml}${slotsHtml}</div></div>`;
    }

    case "full_page_content": {
      let fc = {};
      try { fc = JSON.parse(section.body_text || '{}'); } catch {}
      const fcTitle = fc.page_title || '';
      const fcAreas = fc.areas || [];
      const fcBg = fc.bg_image || '';
      const fcBgColor = fc.bg_color || '#fff';
      const GF = "font-family:'ServiceNow Sans Display Bold','Inter',sans-serif;";
      const BF = "font-family:'ServiceNow Sans','Inter',Arial,sans-serif;";

      const fcTitleHtml = fcTitle ? `<div style="${GF}font-size:24pt;font-weight:700;color:#000;margin-bottom:12pt;">${esc(fcTitle)}</div>` : '';

      const fcBgUrl = fc.bg_image_url || '';
      const fcBgSrc = fcBgUrl || (fcBg ? (fcBg.startsWith('data:') ? fcBg : `data:image/jpeg;base64,${fcBg}`) : '');
      const fcBgHtml = fcBgSrc ? `<img class="gallery-bg" src="${fcBgSrc}" />` : '';

      // Build area cells — use flex layout when areas have height_pct, grid otherwise
      const useFlexLayout = fcAreas.some(a => a.height_pct);

      const buildAreaInner = (a) => {
        if (a.type === 'text') {
          let html = (a.content || '')
            .replace(/<ul>/g, '<ul style="list-style-type:disc;padding-left:1.6em;margin:0 0 4pt 0;">')
            .replace(/<ol>/g, '<ol style="list-style-type:decimal;padding-left:1.6em;margin:0 0 4pt 0;">')
            .replace(/<li>/g, '<li style="display:list-item;margin-bottom:2pt;">')
            .replace(/<li><p>/g, '<li style="display:list-item;margin-bottom:2pt;"><p style="display:inline;margin:0;">');
          return `<div style="${BF}font-size:10pt;color:#111;line-height:1.5;">${html}</div>`;
        } else if (a.type === 'image' && a.content) {
          const imgStyle = `width:100%;height:100%;object-fit:cover;display:block;${a.rounded_mask ? `border-radius:${a.border_radius || 8}pt;` : ''}`;
          return `<img src="${a.content}" style="${imgStyle}" />`;
        } else if (a.type === 'table') {
          let tbl = { title:'', headers:[], rows:[], header_bg:'#032D42', alt_rows:true, font_size:'base' };
          if (typeof a.content === 'object' && a.content?.headers) tbl = { ...tbl, ...a.content };
          else if (typeof a.content === 'string') { try { const p = JSON.parse(a.content); if (p.headers) tbl = { ...tbl, ...p }; } catch {} }
          if (tbl.headers.length > 0) {
            const fs = tbl.font_size === 'xl' ? '11pt' : tbl.font_size === 'lg' ? '9.5pt' : '8pt';
            const pad = tbl.font_size === 'xl' ? '4pt 6pt' : tbl.font_size === 'lg' ? '3.5pt 5pt' : '3pt 5pt';
            const titleHtml = tbl.title ? `<div style="${GF}font-size:${tbl.font_size === 'xl' ? '13pt' : '11pt'};font-weight:700;color:#000;margin-bottom:4pt;">${esc(tbl.title)}</div>` : '';
            const hdrCells = tbl.headers.map(h => `<th style="${BF}font-size:${fs};font-weight:700;color:#fff;padding:${pad};text-align:left;">${esc(h)}</th>`).join('');
            const bodyRows = (tbl.rows || []).map((row, ri) => {
              const bg = tbl.alt_rows && ri % 2 === 1 ? '#f3f4f6' : '#fff';
              const cells = row.map(c => `<td style="${BF}font-size:${fs};color:#111;padding:${pad};border-top:0.5pt solid #e5e7eb;">${esc(c || '')}</td>`).join('');
              return `<tr style="background:${bg}">${cells}</tr>`;
            }).join('');
            return `${titleHtml}<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:${tbl.header_bg || '#032D42'}">${hdrCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
          }
        }
        return '';
      };

      let layoutHtml;
      if (useFlexLayout) {
        const flexCells = fcAreas.map(a => {
          const aStyle = [
            `flex:0 0 calc(${a.height_pct || 33.33}% - 4pt)`,
            a.type !== 'text' ? `overflow:hidden` : '',
            a.bg_color ? `background:${a.bg_color}` : '',
            a.outline ? `border:1.5pt solid #94a3b8` : '',
            a.border_radius ? `border-radius:${a.border_radius}pt` : '',
            `padding:6pt`,
          ].filter(Boolean).join(';');
          return `<div style="${aStyle}">${buildAreaInner(a)}</div>`;
        }).join('');
        layoutHtml = `<div style="display:flex;flex-direction:column;gap:6pt;flex:1;">${flexCells}</div>`;
      } else {
        const rowCount = fcAreas.reduce((m, a) => Math.max(m, (a.row || 0) + (a.rowspan || 1)), 1);
        const areaCells = fcAreas.map(a => {
          const aStyle = [
            `grid-column:${a.col+1}/span ${a.colspan}`,
            `grid-row:${a.row+1}/span ${a.rowspan}`,
            `overflow:hidden`,
            `min-height:0`,
            a.bg_color ? `background:${a.bg_color}` : '',
            a.outline ? `border:1.5pt solid #94a3b8` : '',
            a.border_radius ? `border-radius:${a.border_radius}pt` : '',
            `padding:6pt`,
          ].filter(Boolean).join(';');
          return `<div style="${aStyle}">${buildAreaInner(a)}</div>`;
        }).join('');
        layoutHtml = `<div style="display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(${rowCount},minmax(0,1fr));gap:6pt;flex:1;min-height:0;">${areaCells}</div>`;
      }

      return `<div class="gallery-wrap" style="background:${fcBgColor};">${fcBgHtml}${ghHtml}<div class="gallery-content">${fcTitleHtml}${layoutHtml}</div></div>`;
    }

    default: {
      if (content) {
        return `<div class="section-wrap" style="${bgStyle}">
          ${title ? `<div class="section-bar${mc}" style="${mc ? 'text-transform:none;letter-spacing:normal;' : ''}">${T(title)}</div>` : ""}
          <div class="section-richtext">${content}</div>
        </div>`;
      }
      return "";
    }
  } })();

  if (!html) return "";
  // Inject id + named anchor using the section title as the stable slug.
  // Title-based anchors are immune to counting errors — both TOC and target
  // compute the same anchor from the same title string, so they always match.
  if (!title) return html;
  const anchorId = titleToAnchor(title);
  return html.replace(/(<div class="section-wrap")([^>]*>)/, `$1 id="${anchorId}"$2`);
}

function renderTable(section, title, headers, colKeys, highlightNameLower, bgStyle) {
  const headerCells = headers.map(h => `<th>${esc(h)}</th>`).join("");
  const rows = (section.items || []).map(item => {
    const cells = colKeys.map(k => `<td>${esc(item[k] || "")}</td>`).join("");
    const isExec = highlightNameLower && colKeys.some(k =>
      (item[k] || "").toLowerCase().includes(highlightNameLower)
    );
    return `<tr class="${isExec ? "exec-row" : ""}">${cells}</tr>`;
  }).join("");

  return `<div class="section-wrap" style="${bgStyle}">
    <div class="section-bar">${esc(title)}</div>
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${headers.length}" class="empty-row">No data</td></tr>`}</tbody>
    </table>
  </div>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getOverride(section, nameLower) {
  if (!section.overrides || section.overrides.length === 0) return null;
  return section.overrides.find(o =>
    o.exec_name && o.exec_name.toLowerCase() === nameLower
  ) || null;
}

function getContent(section, nameLower) {
  if (!section) return "";
  const override = getOverride(section, nameLower);
  if (!override) return stripFontFamily(section.body_text || "");
  if (override.override_type === "addition") {
    const base = stripFontFamily(section.body_text || "");
    const addition = stripFontFamily(override.body_text || "");
    return base + (addition ? `<div class="exec-addition">${addition}</div>` : "");
  }
  return stripFontFamily(override.body_text || "");
}

function stripFontFamily(html) {
  return html
    .replace(/font-family\s*:[^;}"']*/gi, "")
    .replace(/<font[^>]*>/gi, "")
    .replace(/<\/font>/gi, "");
}

function stripInlineStyles(html) {
  return html
    .replace(/font-family\s*:[^;}"']*/gi, "")
    .replace(/font-size\s*:[^;}"']*/gi, "")
    .replace(/<font[^>]*>/gi, "")
    .replace(/<\/font>/gi, "");
}

// PDF variant: keeps font-family so custom fonts (Light, Display Bold) render correctly
function stripInlineStylesPDF(html) {
  return html
    .replace(/<font[^>]*>/gi, "")
    .replace(/<\/font>/gi, "");
}

function formatHotelName(name) {
  if (!name) return "";
  const parts = name.split(", ");
  if (parts.length <= 2) return esc(name);
  const lines = [
    esc(parts[0]),                          // Hotel name
    esc(parts[1]),                          // Street
    parts.slice(2).map(esc).join(", "),     // City, State, Country on one line
  ];
  return lines.join("<br>");
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function getBgColor(colorChoice) {
  const map = {
    navy: "#032D42",
    green: "var(--accent)",
    gray: "#f3f4f6",
    white: "#ffffff",
  };
  return map[colorChoice] || null;
}

function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── CSS ───────────────────────────────────────────────────────────────────────

function baseCSS() {
  return `
@font-face {
  font-family: 'ServiceNow Sans Display Bold';
  font-weight: 1 999;
  font-style: normal;
  src: url('https://pub-bf3b287548d84cf0ab2439f9baa452da.r2.dev/fonts/servicenow-sans-display-bold.otf') format('opentype');
}
@font-face {
  font-family: 'ServiceNow Sans';
  font-weight: 400;
  font-style: normal;
  src: url('https://pub-bf3b287548d84cf0ab2439f9baa452da.r2.dev/fonts/servicenow-sans.otf');
}
@font-face {
  font-family: 'Segoe UI';
  font-weight: 400;
  font-style: normal;
  src: url('https://pub-bf3b287548d84cf0ab2439f9baa452da.r2.dev/fonts/segoe-ui-regular.ttf') format('truetype');
}
@font-face {
  font-family: 'Segoe UI';
  font-weight: 700;
  font-style: normal;
  src: url('https://pub-bf3b287548d84cf0ab2439f9baa452da.r2.dev/fonts/segoe-ui-bold.ttf') format('truetype');
}
@font-face {
  font-family: 'ServiceNow Sans Light';
  font-weight: 1 999;
  font-style: normal;
  src: url('https://pub-bf3b287548d84cf0ab2439f9baa452da.r2.dev/fonts/servicenow-sans-light.otf') format('opentype');
}


*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page { size: 7.5in 10in; margin: 0 0 0.4in 0; }
@page fpg-no-footer { size: 7.5in 10in; margin: 0; }

table, td, th, caption { font-family: inherit; }
body {
  font-family: 'ServiceNow Sans', 'Inter', Arial, sans-serif;
  color: #1a1a1a;
  font-size: 10pt;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  width: 7.5in;
  page-break-after: always;
  position: relative;
  overflow: hidden;
}
.page.cover { min-height: 10in; }

/* ── Cover ── */
.cover {
  background: #032D42;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 0.75in 0.65in 0.65in;
  height: 9.6in;
}
.cover-eyebrow {
  color: var(--accent);
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 0.18in;
}
.cover-name {
  color: #ffffff;
  font-family: 'ServiceNow Sans Display Bold', 'Inter', sans-serif;
  font-size: 30pt;
  font-weight: 700;
  line-height: 1.15;
  margin-bottom: 0.1in;
}
.cover-event {
  color: var(--accent);
  font-family: 'ServiceNow Sans Display Bold', 'Inter', sans-serif;
  font-size: 12pt;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin-bottom: 0.06in;
}
.cover-dates {
  color: rgba(255,255,255,0.6);
  font-size: 9pt;
  margin-bottom: 0.3in;
}
.cover-rule {
  width: 0.55in;
  height: 3px;
  background: var(--accent);
  margin-bottom: 0.25in;
}
.cover-intro {
  color: rgba(255,255,255,0.82);
  font-size: 10pt;
  line-height: 1.65;
  max-width: 5.2in;
}
.cover-footer {
  position: absolute;
  bottom: 0.3in;
  left: 0.65in;
  right: 0.65in;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.cover-footer-left { display: flex; align-items: center; gap: 8px; }
.cover-dot { width: 8px; height: 8px; background: var(--accent); border-radius: 50%; }
.cover-footer-brand { color: rgba(255,255,255,0.5); font-size: 7.5pt; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; }
.cover-footer-conf { color: rgba(255,255,255,0.35); font-size: 7.5pt; }

/* ── Content pages ── */
.content-page { background: #ffffff; }

.page-header {
  background: #032D42;
  padding: 0.12in 0.5in;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-header-title { color: #ffffff; font-size: 8pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
.page-header-right { color: rgba(255,255,255,0.5); font-size: 7.5pt; }

.page-body { padding: 0.3in 0.5in 0.3in; }

/* ── Section layout ── */
.section-wrap { margin-bottom: 0.22in; break-inside: avoid; }

/* ── Full-page graphic section ── */
.fpg-wrap {
  page: fpg;
  page-break-before: always;
  page-break-after: always;
  margin: -0.3in -0.5in;
  width: 7.5in;
  height: 9.6in;
  position: relative;
  overflow: hidden;
  background: #000;
}
.fpg-wrap.fpg-no-footer {
  page: fpg-no-footer;
  height: 10in;
}
.fpg-wrap img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
.fpg-overlay { position: absolute; word-wrap: break-word; overflow-wrap: break-word; overflow: hidden; box-sizing: border-box; white-space: pre-wrap; font-family: 'ServiceNow Sans Display Bold', 'Inter', Arial, sans-serif; font-size: 12pt; color: #000000; }
.fpg-title {
  position: absolute;
  top: calc(var(--fpg-title-top, 0.5in) - 1.5em);
  left: 0.5in;
  z-index: 10;
  font-family: 'ServiceNow Sans Display Bold', 'Inter', sans-serif;
  font-size: 7.5pt;
  font-weight: 700;
  color: #000000;
  letter-spacing: 0.1em;
}
.fpg-title.mc { letter-spacing: normal; }
body.bar-display .fpg-title { font-size: 10pt; letter-spacing: 0; }
body.bar-display-16 .fpg-title { font-size: 16pt; letter-spacing: 0; }
body.bar-display-20 .fpg-title { font-size: 20pt; letter-spacing: 0; }
body.bar-display-24 .fpg-title { font-size: 24pt; letter-spacing: 0; }

/* ── Photo gallery section ── */
.gallery-wrap {
  position: relative;
  width: 7.5in;
  height: 10in;
  overflow: hidden;
}
.gallery-wrap > .gallery-bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; display: block; z-index: 0; }
.gallery-wrap > .gallery-content { position: absolute; top: 0; left: 0; right: 0; bottom: 0; z-index: 1; }
.gallery-wrap .gallery-content img { display: block; border-radius: 8pt; object-fit: cover; }
.fpg-overlay p { margin: 0; padding: 0; }
.fpg-overlay strong { font-weight: bold; }
.fpg-overlay em { font-style: italic; }
.fpg-overlay u { text-decoration: underline; }

/* Full Page Content text areas */
.fpc-text { font-size: 10pt; }
.fpc-text p { margin: 0 0 3pt 0; padding: 0; }
.fpc-text ul { list-style: disc outside !important; padding-left: 1.6em !important; margin: 0 0 4pt 0; }
.fpc-text ol { list-style: decimal outside !important; padding-left: 1.6em !important; margin: 0 0 4pt 0; }
.fpc-text li { margin-bottom: 2pt; display: list-item !important; }
.fpc-text li > p { display: inline; margin: 0; }
.fpc-text strong { font-weight: bold; }
.fpc-text em { font-style: italic; }
.fpc-text u { text-decoration: underline; }
.fpc-text h2 { font-size: 14pt; font-weight: bold; margin: 0 0 6pt 0; }
.fpc-text h3 { font-size: 12pt; font-weight: bold; margin: 0 0 4pt 0; }

.row-pair {
  display: flex;
  gap: 0.2in;
  margin-bottom: 0.22in;
  break-inside: avoid;
}
.col-half { flex: 1; min-width: 0; }
.col-half .section-wrap { margin-bottom: 0; }

.section-bar {
  background: #ffffff;
  color: #032D42;
  padding: 4px 0;
  font-family: 'ServiceNow Sans Display Bold', 'Inter', sans-serif;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-align: left;
  margin-bottom: 0.1in;
  border-bottom: 2px solid #032D42;
  break-after: avoid;
}
.section-bar:not(.mc) { }
.section-bar.mc { letter-spacing: normal; }
body.bar-display .section-bar {
  font-size: 10pt;
  text-transform: none;
  letter-spacing: 0;
  border-bottom: none;
  padding-bottom: 0;
}
body.bar-display-16 .section-bar {
  font-size: 16pt;
  text-transform: none;
  letter-spacing: 0;
  border-bottom: none;
  padding-bottom: 0;
}
body.bar-display-20 .section-bar {
  font-size: 20pt;
  text-transform: none;
  letter-spacing: 0;
  border-bottom: none;
  padding-bottom: 0;
}
body.bar-display-24 .section-bar {
  font-size: 24pt;
  text-transform: none;
  letter-spacing: 0;
  border-bottom: none;
  padding-bottom: 0;
}

.section-richtext {
  font-size: 9.5pt;
  line-height: 1.6;
  padding: 0 2px;
}

.toc-body { padding: 2px 0; }
.toc-row {
  padding: 3px 0;
  border-bottom: 1px dotted #cccccc;
}
.toc-row:last-child { border-bottom: none; }
.toc-link {
  color: #4169E1;
  text-decoration: none;
  font-size: 9.5pt;
}
.toc-link:hover { text-decoration: underline; }
.section-richtext p { margin-bottom: 0.08in; }
.section-richtext ul, .section-richtext ol { padding-left: 1.2em; margin-bottom: 0.08in; }

/* ── Tables ── */
table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }

thead th {
  background: #032D42;
  color: #ffffff;
  padding: 6px 8px;
  text-align: left;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

tbody td {
  padding: 6px 8px;
  border-bottom: 1px solid #e5e7eb;
  vertical-align: top;
  line-height: 1.4;
}

tbody tr:nth-child(even) td { background: #f8fafc; }

tbody tr.exec-row td {
  background: var(--highlight);
  color: var(--highlight-text);
  font-weight: 600;
}

.empty-row { color: #9ca3af; font-style: italic; padding: 10px 8px; }

/* ── Key-value table ── */
.kv-table { width: 100%; border-collapse: collapse; font-size: 9pt; }
.kv-table td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
.kv-table .kv-label { font-weight: 700; color: #374151; width: 35%; white-space: nowrap; }

/* ── Two-column layout ── */
.two-col-layout { display: flex; gap: 0; font-size: 9pt; }
.two-col-label { width: 33%; font-weight: 700; color: #032D42; padding: 4px 12px 4px 0; border-right: 2px solid #e5e7eb; font-size: 9pt; }
.two-col-content { width: 67%; padding: 4px 0 4px 14px; font-size: 8.5pt; }
.two-col-content p, .two-col-content li, .two-col-content td, .two-col-content div { font-size: 8.5pt; }

/* ── Three-column layout ── */
.three-col-layout { display: flex; gap: 0; font-size: 9pt; }
.three-col-label { width: 33%; font-weight: 700; color: #032D42; padding: 4px 12px 4px 0; border-right: 2px solid #e5e7eb; font-size: 9pt; }
.three-col-right { width: 67%; display: flex; gap: 0.15in; padding-left: 14px; }
.three-col-col { flex: 1; min-width: 0; padding: 4px 0; font-size: 8.5pt; }
.three-col-col p, .three-col-col li, .three-col-col td, .three-col-col div { font-size: 8.5pt; }

/* ── Hotel info layout ── */
.hotel-layout { display: flex; gap: 0; font-size: 9pt; }
.hotel-col-label { width: 33%; font-weight: 700; color: #374151; padding: 6px 8px 6px 0; border-right: 2px solid #e5e7eb; }
.hotel-col-content { width: 67%; padding: 6px 0 6px 14px; }
.hotel-name { font-weight: 700; color: #032D42; font-size: 10pt; margin-bottom: 6px; }
.hotel-mini-table { border-collapse: collapse; font-size: 8.5pt; margin-bottom: 5px; }
.hotel-mini-label { font-weight: 600; color: #6b7280; padding: 2px 12px 2px 0; white-space: nowrap; vertical-align: top; }
.hotel-mini-value { color: #374151; padding: 2px 0; vertical-align: top; }
.hotel-detail-row { font-size: 8.5pt; color: #374151; margin-bottom: 3px; }
.hotel-detail-label { font-weight: 600; color: #6b7280; }

/* ── Large image placeholder ── */
.large-image-placeholder {
  background: #f3f4f6;
  border: 1px dashed #d1d5db;
  border-radius: 8px;
  padding: 0.4in;
  text-align: center;
  color: #9ca3af;
  font-size: 9pt;
}

/* ── Logo ── */
.logo-wrap { text-align: left; padding: 0.1in 0; }
.logo-img { max-height: 1in; max-width: 1in; object-fit: contain; }

/* ── Large image ── */
.large-img { width: 100%; border-radius: 8px; display: block; margin: 0.1in 0; }
.img-headline { font-size: 13pt; font-weight: 700; color: #032D42; margin-bottom: 0.04in; }
.img-subhead  { font-size: 10pt; color: #6b7280; margin-bottom: 0.1in; }
.img-caption  { font-size: 10pt; color: #111111; margin-top: 0.06in; font-style: italic; }

/* ── HTML content (raw injection) ── */
.html-content-body {
  font-size: 9.5pt;
  line-height: 1.6;
}
.html-content-body p { margin-bottom: 0.08in; }
.html-content-body ul, .html-content-body ol { padding-left: 1.2em; margin-bottom: 0.08in; }
.html-content-body table td, .html-content-body table th { border: none !important; border-top: none !important; border-bottom: none !important; border-left: none !important; border-right: none !important; }

/* ── Exec addition ── */
.exec-addition {
  margin-top: 0.1in;
  padding-top: 0.08in;
  border-top: 1px solid var(--accent);
  font-size: 9pt;
  line-height: 1.6;
}

/* ── Week at a Glance ── */
.wag-grid {
  display: flex;
  gap: 0.15in;
  break-inside: avoid;
}
.wag-card {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 0.07in 0.08in;
  min-width: 0;
  break-inside: avoid;
}
.wag-date {
  font-size: 7.5pt;
  font-weight: 700;
  font-family: 'ServiceNow Sans Display Bold','ServiceNow Sans Display','SNSansDisplay',sans-serif;
  color: #032D42;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.07in;
  border-bottom: 2px solid var(--accent);
  padding-bottom: 4px;
}
/* ── Meal Schedule ── */
.meal-table { width:100%; border-collapse:collapse; font-size:9pt; font-family:'ServiceNow Sans','ServiceNowSans',sans-serif; }
.meal-table th { background:#032D42; color:#fff; padding:6pt 8pt; text-align:center; font-weight:600; font-size:8.5pt; vertical-align:middle; font-family:'ServiceNow Sans','ServiceNowSans',sans-serif; }
.meal-table th:first-child { text-align:left; font-family:'ServiceNow Sans Display Bold','ServiceNow Sans Display','SNSansDisplay',sans-serif; }
.meal-table td { border:1px solid #d1d5db; padding:6pt 8pt; vertical-align:middle; }
.meal-table td:first-child { width:22%; font-size:8.5pt; font-family:'ServiceNow Sans Display Bold','ServiceNow Sans Display','SNSansDisplay',sans-serif; }
.meal-table td.meal-cell { text-align:center; font-size:8.5pt; color:#374151; font-family:'ServiceNow Sans','ServiceNowSans',sans-serif; }
.meal-venue { font-weight:700; color:#111; margin-bottom:2pt; }
.meal-location { font-size:7.5pt; color:#6b7280; }
.meal-table tr:nth-child(even) td { background:#f9fafb; }

.wag-table, td, th, caption { font-family: inherit; }
body {
  font-family: 'ServiceNow Sans','ServiceNowSans',sans-serif;
  font-size: 7.5pt;
  line-height: 1.4;
  color: #1a1a1a;
}
.wag-body * { font-size: 7.5pt !important; font-family: 'ServiceNow Sans','ServiceNowSans',sans-serif !important; }
.wag-body p { margin-bottom: 0.05in; }
.wag-body ul { list-style-type: disc; padding-left: 1.4em; margin-bottom: 0.05in; }
.wag-body ol { list-style-type: decimal; padding-left: 1.4em; margin-bottom: 0.05in; }
.wag-body li { margin-bottom: 0.02in; }

/* ── Compact header (no-cover mode) ── */
.compact-header {
  background: #032D42;
  padding: 0.18in 0.5in;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.compact-header-left { flex: 1; }
.compact-header-right { text-align: right; }
.compact-eyebrow {
  color: var(--accent);
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 0.04in;
}
.compact-name {
  color: #ffffff;
  font-size: 16pt;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 0.04in;
}
.compact-meta {
  color: rgba(255,255,255,0.6);
  font-size: 8.5pt;
}
.compact-brand {
  color: rgba(255,255,255,0.5);
  font-size: 7.5pt;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 0.04in;
}
.compact-conf {
  color: rgba(255,255,255,0.35);
  font-size: 7.5pt;
}
`;
}

// ── Briefing Book ─────────────────────────────────────────────────────────────

export function buildBriefingBookHTML(execName, event, meetings, sections) {
  const eventName     = event?.name || "";
  const eventDates    = event?.event_dates || "";
  const eventLocation = event?.location || "";
  const nameLower     = execName.toLowerCase();

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
${baseCSS()}
/* ── Briefing book cover ── */
.bb-cover {
  width: 7.5in;
  min-height: 10in;
  background: #032D42;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  padding: 0.75in 0.65in 0.65in;
  page-break-after: always;
}
.bb-cover-label {
  color: var(--accent, #81b5a1);
  font-size: 8pt;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  margin-bottom: 0.18in;
}
.bb-cover-exec {
  color: #ffffff;
  font-size: 30pt;
  font-weight: 700;
  line-height: 1.15;
  margin-bottom: 0.1in;
}
.bb-cover-event {
  color: var(--accent, #81b5a1);
  font-size: 12pt;
  font-weight: 600;
  letter-spacing: 0.04em;
  margin-bottom: 0.06in;
}
.bb-cover-dates {
  color: rgba(255,255,255,0.6);
  font-size: 9pt;
  margin-bottom: 0.04in;
}
.bb-cover-location {
  color: rgba(255,255,255,0.5);
  font-size: 9pt;
}
/* ── Briefing book body pages ── */
.bb-page {
  width: 7.5in;
  min-height: 10in;
  page-break-before: always;
  padding: 0.5in 0.6in;
  background: #ffffff;
}
.meeting-meta {
  font-size: 9pt;
  color: #6b7280;
  margin: 0.06in 0 0.12in 0;
  line-height: 1.5;
}
.staff-line {
  font-size: 8.5pt;
  font-style: italic;
  color: #9ca3af;
  margin-bottom: 0.1in;
}
.sub-bar {
  font-size: 8pt;
  font-weight: 700;
  color: #032D42;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 3px;
  margin: 0.15in 0 0.08in 0;
}
.bb-richtext {
  font-size: 9.5pt;
  line-height: 1.6;
}
.bb-richtext p { margin-bottom: 0.06in; }
.bb-richtext ul, .bb-richtext ol { padding-left: 1.2em; margin-bottom: 0.06in; }
/* ── Schedule table ── */
.schedule-table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-top: 0.1in; }
.schedule-table th { background: #032D42; color: #fff; padding: 6px 8px; text-align: left; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; }
.schedule-table td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
.schedule-table tr:nth-child(even) td { background: #f8fafc; }
</style>
</head>
<body>`;

  // ── Cover page ──
  html += `<div class="bb-cover">
  <div class="bb-cover-label">Media &amp; Analyst Briefing Book</div>
  <div class="bb-cover-exec">${esc(execName)}</div>
  <div class="bb-cover-event">${esc(eventName)}</div>
  ${eventDates   ? `<div class="bb-cover-dates">${esc(eventDates)}</div>` : ""}
  ${eventLocation ? `<div class="bb-cover-location">${esc(eventLocation)}</div>` : ""}
</div>`;

  // ── Schedule at a glance ──
  html += `<div class="bb-page">
  <div class="section-bar">Schedule at a Glance</div>
  <table class="schedule-table">
    <thead><tr><th>Date</th><th>Time</th><th>Contact</th><th>Company</th><th>Room</th></tr></thead>
    <tbody>`;
  for (const m of meetings) {
    html += `<tr>
      <td>${esc(m.meeting_date || "")}</td>
      <td>${esc(m.start_time || "")}–${esc(m.end_time || "")}</td>
      <td>${esc(m.contact_name || "")}</td>
      <td>${esc(m.contact_company || "")}</td>
      <td>${esc(m.room || "")}</td>
    </tr>`;
  }
  html += `</tbody></table></div>`;

  // ── Per-meeting brief pages ──
  for (const m of meetings) {
    html += `<div class="bb-page">
  <div class="section-bar">${esc(m.contact_name || "Meeting")} — ${esc(m.contact_company || "")}</div>
  <div class="meeting-meta">${esc(m.meeting_type || "")} | ${esc(m.meeting_date || "")} | ${esc(m.start_time || "")}–${esc(m.end_time || "")} | ${esc(m.room || "")}</div>
  ${m.staff_assigned ? `<div class="staff-line">Staffed by ${esc(m.staff_assigned)}</div>` : ""}
  ${m.goals               ? `<div class="sub-bar">Interview Goals</div><div class="bb-richtext">${m.goals}</div>` : ""}
  ${m.background          ? `<div class="sub-bar">Background</div><div class="bb-richtext">${m.background}</div>` : ""}
  ${m.anticipated_questions ? `<div class="sub-bar">Anticipated Questions</div><div class="bb-richtext">${m.anticipated_questions}</div>` : ""}
</div>`;
  }

  // ── Appended standard sections (key messages, FAQs, etc.) ──
  if (sections && sections.length > 0) {
    html += `<div class="bb-page">`;
    for (const sec of sections) {
      html += renderSection(sec, execName, nameLower, eventName);
    }
    html += `</div>`;
  }

  html += `</body></html>`;
  return html;
}

// ── Word-optimised HTML builder ───────────────────────────────────────────────
// Generates inline-styled HTML for conversion to .docx via the html-to-docx worker.
// No CSS classes, no <style> block, no embedded fonts — only inline style attributes.

export function buildWordHTML(execName, event, sections, theme) {
  const nameLower  = execName.toLowerCase();
  const eventName  = (event && event.name) || "Executive Briefing";
  const eventDates = (event && event.event_dates) || "";
  const location   = (event && event.location) || "";

  // Resolve theme colors (fall back to ServiceNow navy/green)
  const accentColor    = (theme && theme.accent_color && !theme.accent_color.startsWith("var(")) ? theme.accent_color : "#032D42";
  const highlightColor = (theme && theme.highlight_color && !theme.highlight_color.startsWith("var(")) ? theme.highlight_color : "#62D84E";

  const briefHeader = (sections || []).find(s => s.type === "brief_header");

  const interior = (sections || []).filter(s => {
    if (s.type === "brief_title") return false;
    if (s.type === "brief_header") return false;
    if (s.type === "footer") return false;
    if (s.type === "graphic_header") return false;
    if (s.type === "graphic_footer") return false;
    if (s.type === "exec_enhancements") return !!getOverride(s, nameLower);
    return true;
  });

  // Pre-build TOC entries so wordSection can render them
  const tocEntries = interior
    .filter(s => !["table_of_contents","logo","large_image","brief_title","brief_header","brief_overview"].includes(s.type) && (s.title || "").trim())
    .map(s => s.title);

  const sectionsHTML = interior.map(s => wordSection(s, execName, nameLower, accentColor, highlightColor, tocEntries)).filter(Boolean).join("\n");
  const meta = [eventDates, location].filter(Boolean).join("  |  ");

  const rawHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>${esc(execName)} — ${esc(eventName)}</title>
<style>
body, p, div, span, td, th, table, ul, ol, li, h1, h2, h3, h4, h5, h6, strong, em, b, i, a { font-family: Arial, Helvetica, sans-serif !important; }
</style>
</head>
<body style="font-family:Arial,Helvetica,sans-serif;font-size:11pt;color:#111111;margin:0;padding:0;">
${briefHeader ? `
${briefHeader.logo_b64 ? `<p style="font-family:Arial,Helvetica,sans-serif;margin:0 0 6pt 0;"><img src="data:${briefHeader.logo_mime || 'image/png'};base64,${briefHeader.logo_b64}" width="144" height="auto"></p>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#032D42;border:none;">
  <tr>
    <td style="padding:8pt 8pt;border:none;vertical-align:middle;">
      <span style="font-family:Arial,Helvetica,sans-serif;font-size:20pt;font-weight:bold;">${((briefHeader.body_text || "<span style=\"color:#ffffff\">Executive Briefing</span>")).replace(/^<p[^>]*>/i,"").replace(/<\/p>$/i,"")}</span>
    </td>
  </tr>
</table>
<p style="font-family:Arial,Helvetica,sans-serif;font-size:11pt;font-weight:bold;color:#111111;margin:16pt 0 ${briefHeader.event_meta ? "2pt" : "18pt"} 0;">${esc(execName)}${briefHeader.left_label ? ` — ${esc(briefHeader.left_label)}` : ''}</p>
${briefHeader.event_meta ? `<p style="font-family:Arial,Helvetica,sans-serif;font-size:9pt;color:#555555;margin:0 0 18pt 0;">${esc(briefHeader.event_meta)}</p>` : ""}
` : `
<table width="100%" cellpadding="0" cellspacing="0" style="background:${accentColor};margin:0 0 18pt 0;">
  <tr>
    <td style="padding:14pt 18pt 10pt 18pt;">
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:16pt;font-weight:bold;color:#ffffff;margin:0 0 4pt 0;">${esc(execName)}</p>
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:10pt;color:#aaaaaa;margin:0;">${esc(eventName)}${meta ? `  |  ${esc(meta)}` : ''}</p>
    </td>
  </tr>
</table>
`}
${sectionsHTML}
</body>
</html>`;
  return rawHtml
    .replace(/style="([^"]*)"/g, (_, s) => `style="font-family:Arial,Helvetica,sans-serif;${s}"`)
    .replace(/<(p|li|span|strong|em|b|i|a|h[1-6])\b([^>]*?)>/gi, (match, tag, attrs) => {
      if (/style\s*=/.test(attrs)) return match;
      return `<${tag}${attrs} style="font-family:Arial,Helvetica,sans-serif;">`;
    });
}

function wordSection(section, execName, nameLower, accentColor, highlightColor, tocEntries) {
  const type    = section.type;
  const title   = section.title || "";
  const content = getContent(section, nameLower);

  const bgRaw  = getBgColor(section.background_color);
  const bgHex  = bgRaw && !bgRaw.startsWith("var(") ? bgRaw : null;
  const onDark = bgHex && bgHex !== "#ffffff" && bgHex !== "#f3f4f6";

  const FF = `font-family:Arial,Helvetica,sans-serif;`;
  const wrapStyle  = bgHex ? `${FF}background:${bgHex};padding:10pt 14pt;margin-bottom:14pt;` : `${FF}margin-bottom:14pt;`;
  const titleStyle = `${FF}font-size:8pt;font-weight:bold;color:#444444;border-bottom:2px solid #cccccc;padding-bottom:2pt;margin:0 0 6pt 0;letter-spacing:0.5pt;`;
  const bodyStyle  = onDark ? `${FF}color:#ffffff;` : `${FF}color:#111111;`;
  const anchorId   = title ? titleToAnchor(title) : "";
  const titleHTML  = title ? `<div id="${anchorId}" style="${titleStyle}">${esc(title.toUpperCase())}</div>` : "";

  switch (type) {

    case "brief_overview":
    case "exec_enhancements":
    case "callout":
    case "event_highlights":
    case "custom":
    case "html_content": {
      const body = stripInlineStyles(type === "html_content" ? (section.body_text || "") : (content || ""));
      if (!body) return "";
      return `<div style="${wrapStyle}">${titleHTML}<div style="${bodyStyle}">${body}</div></div>`;
    }

    case "logistical_details": {
      const rows = (section.items || []).map(item =>
        `<tr><td style="font-weight:bold;padding:4pt 8pt;border:1px solid #cccccc;width:35%;vertical-align:top;">${esc(item.col_1 || "")}</td><td style="padding:4pt 8pt;border:1px solid #cccccc;vertical-align:top;">${esc(item.col_2 || "")}</td></tr>`
      ).join("");
      if (!rows) return "";
      return `<div style="${wrapStyle}">${titleHTML}<table style="border-collapse:collapse;width:100%;font-size:10pt;"><tbody>${rows}</tbody></table></div>`;
    }

    case "gym_hours": {
      const items = (section.gym_data && section.gym_data[execName]) || [];
      if (!items || items.length === 0) return "";
      // col_2 = gym name, col_3 = hours, col_4 = location, col_5 = notes
      const gymContent = items.map(item => {
        const gymName = item.col_2 || "";
        const details = [
          ["Hours",    item.col_3],
          ["Location", item.col_4],
          ["Notes",    item.col_5],
        ].filter(([, v]) => v);
        const detailRows = details.map(([label, value]) =>
          `<tr><td style="font-weight:bold;padding:2pt 8pt 2pt 0;font-size:9pt;color:#6b7280;white-space:nowrap;vertical-align:top;">${esc(label)}</td><td style="padding:2pt 0;font-size:9pt;vertical-align:top;">${esc(value)}</td></tr>`
        ).join("");
        return `${gymName ? `<div style="font-weight:bold;color:#032D42;margin-bottom:3pt;">${esc(gymName)}</div>` : ""}${detailRows ? `<table style="border-collapse:collapse;margin-bottom:8pt;">${detailRows}</table>` : ""}`;
      }).join("");
      return `<div style="${wrapStyle}">${titleHTML}<table style="border-collapse:collapse;width:100%;font-size:10pt;"><tr><td style="font-weight:bold;padding:4pt 8pt 4pt 0;width:30%;vertical-align:top;border-right:2px solid #e5e7eb;">Gym</td><td style="padding:4pt 0 4pt 14pt;vertical-align:top;">${gymContent}</td></tr></table></div>`;
    }

    case "two_column": {
      const leftLabel    = section.left_label || "";
      const rightContent = section.body_text  || "";
      if (!leftLabel && !rightContent) return "";
      return `<div style="${wrapStyle}">${titleHTML}<table style="border-collapse:collapse;width:100%;font-size:10pt;"><tr><td style="font-weight:bold;padding:4pt 8pt;border:1px solid #cccccc;width:30%;vertical-align:top;">${esc(leftLabel)}</td><td style="padding:4pt 8pt;border:1px solid #cccccc;vertical-align:top;">${rightContent}</td></tr></table></div>`;
    }

    case "three_column": {
      const leftLabel = section.left_label  || "";
      const col2      = section.body_text   || "";
      const col3      = section.body_text_2 || "";
      if (!leftLabel && !col2 && !col3) return "";
      return `<div style="${wrapStyle}">${titleHTML}<table style="border-collapse:collapse;width:100%;font-size:10pt;"><tr><td style="font-weight:bold;padding:4pt 8pt;border:1px solid #cccccc;width:25%;vertical-align:top;">${esc(leftLabel)}</td><td style="padding:4pt 8pt;border:1px solid #cccccc;width:37%;vertical-align:top;">${col2}</td><td style="padding:4pt 8pt;border:1px solid #cccccc;width:38%;vertical-align:top;">${col3}</td></tr></table></div>`;
    }

    case "rehearsal_schedule": {
      // Auto-generated: body_text is pre-rendered HTML from DB rehearsal data
      const rehContentW = content ? content.trim() : "";
      if (!rehContentW || rehContentW === "<!-- no rehearsals -->") return "";
      return `<div style="${wrapStyle}">${titleHTML}<div>${rehContentW}</div></div>`;
    }

    case "run_of_show": {
      const rosHeaders = ["Time", "Topic", "Presenter"];
      const rosKeys    = ["col_1", "col_2", "col_3"];
      const colWidths  = ["22%", "52%", "26%"];
      const thStyle = `background:${accentColor};color:#ffffff;padding:4pt 6pt;border:1px solid #aaaaaa;font-size:9pt;text-align:left;`;
      const headerRow = rosHeaders.map((h, idx) => `<th style="${thStyle}width:${colWidths[idx]};">${esc(h)}</th>`).join("");
      const dataRows  = (section.items || []).map((item, i) => {
        const isExec = ((item.col_3 || "").toLowerCase().includes(nameLower));
        const rowBg  = isExec ? `background:${highlightColor};` : (i % 2 === 1 ? "background:#f8f8f8;" : "");
        const cells  = rosKeys.map((k, idx) => {
          const boldStyle = idx === 0 ? "font-weight:bold;" : "";
          return `<td style="${rowBg}${boldStyle}padding:3pt 6pt;border:1px solid #cccccc;font-size:9pt;vertical-align:top;">${esc(item[k] || "")}</td>`;
        }).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      if (!dataRows) return "";
      const rosTs2 = section.body_text_2 ? section.body_text_2.trim() : "";
      const rosFootnote = rosTs2 ? `<div style="text-align:right;font-size:7pt;color:#999999;margin-top:2pt;">Last updated: ${esc(new Date(rosTs2).toLocaleString())}</div>` : "";
      return `<div style="${wrapStyle}">${titleHTML}<table style="border-collapse:collapse;width:100%;"><thead><tr>${headerRow}</tr></thead><tbody>${dataRows}</tbody></table>${rosFootnote}</div>`;
    }

    case "event_schedule": {
      const esHeaders = ["Time", "Session", "Location"];
      const esKeys    = ["col_1", "col_2", "col_3"];
      const thStyle2 = `background:${accentColor};color:#ffffff;padding:4pt 6pt;border:1px solid #aaaaaa;font-size:9pt;text-align:left;`;
      const headerRow2 = esHeaders.map(h => `<th style="${thStyle2}">${esc(h)}</th>`).join("");
      const dataRows2  = (section.items || []).map((item, i) => {
        const isExec = esKeys.some(k => (item[k] || "").toLowerCase().includes(nameLower));
        const rowBg  = isExec ? `background:${highlightColor};` : (i % 2 === 1 ? "background:#f8f8f8;" : "");
        const cells  = esKeys.map(k =>
          `<td style="${rowBg}padding:3pt 6pt;border:1px solid #cccccc;font-size:9pt;vertical-align:top;">${esc(item[k] || "")}</td>`
        ).join("");
        return `<tr>${cells}</tr>`;
      }).join("");
      if (!dataRows2) return "";
      return `<div style="${wrapStyle}">${titleHTML}<table style="border-collapse:collapse;width:100%;"><thead><tr>${headerRow2}</tr></thead><tbody>${dataRows2}</tbody></table></div>`;
    }

    case "key_contacts": {
      const items = section.items || [];
      if (!items.length) return "";
      const bullets = items.map(item => {
        const name  = esc(item.col_1 || "");
        const role  = esc(item.col_2 || "");
        const phone = esc(item.col_3 || "");
        const email = item.col_4 ? `<a href="mailto:${esc(item.col_4)}" style="color:#0563C1;text-decoration:underline;">${esc(item.col_4)}</a>` : "";
        const parts = [role ? `<strong>${role}</strong>: ${name}` : name];
        if (email) parts.push(`(${email})`);
        if (phone) parts.push(`- ${phone}`);
        return `<div style="${FF}font-size:9pt;padding:2px 0;"><span style="font-size:5.5pt;vertical-align:middle;margin-right:4px;">&#x2022;</span>${parts.join(" ")}</div>`;
      }).join("");
      return `<div style="${wrapStyle}">${titleHTML}<div>${bullets}</div></div>`;
    }

    case "week_at_a_glance": {
      const cols = (section.items || []).slice(0, 4);
      if (!cols.length) return "";
      const cells = cols.map(item =>
        `<td style="padding:6pt 8pt;border:1px solid #cccccc;vertical-align:top;width:25%;"><div style="font-weight:bold;color:${accentColor};font-size:9pt;margin-bottom:4pt;">${esc(item.col_1 || "")}</div><div style="font-size:9pt;">${item.col_2 || ""}</div></td>`
      ).join("");
      return `<div style="${wrapStyle}">${titleHTML}<table style="border-collapse:collapse;width:100%;"><tr>${cells}</tr></table></div>`;
    }

    case "meal_schedule": {
      const mealRowsW = (section.meal_data && section.meal_data[Object.keys(section.meal_data)[0]]) || section.items || [];
      if (!mealRowsW.length) return "";
      let configW = {};
      try { configW = JSON.parse(section.body_text || '{}'); } catch {}
      const daysW = configW.days || ['Day 1', 'Day 2', 'Day 3', 'Day 4'];
      const fmtDayHdrW = (d) => { const ci = d.indexOf(','); return ci < 0 ? esc(d) : `${esc(d.slice(0,ci))}<br/>${esc(d.slice(ci+1).trim())}`; };
      const hdrW = `<th style="text-align:left;padding:4pt 6pt;border:1px solid #d1d5db;font-size:9pt">Area</th>` + daysW.map(d => `<th style="text-align:center;padding:4pt 6pt;border:1px solid #d1d5db;font-size:9pt;line-height:1.3">${fmtDayHdrW(d)}</th>`).join('');
      const rowsW = mealRowsW.map(item => {
        let cells = [];
        try { cells = JSON.parse(item.col_4 || '[]'); } catch {}
        cells = Array(4).fill(null).map((_, i) => cells[i] || { text: '', span: 1 });
        let dc = ''; let ci = 0;
        while (ci < 4) {
          const cell = cells[ci] || { text: '', span: 1 };
          const span = Math.min(Math.max(cell.span || 1, 1), 4 - ci);
          dc += `<td colspan="${span}" style="text-align:center;padding:4pt 6pt;border:1px solid #d1d5db;font-size:9pt">${(cell.text||'').replace(/\n/g,'<br/>')}</td>`;
          ci += span;
        }
        return `<tr><td style="padding:4pt 6pt;border:1px solid #d1d5db;font-size:9pt"><strong>${esc(item.col_1||'')}</strong>${item.col_2?`<br/><span style="font-size:8pt;color:#6b7280">${esc(item.col_2)}</span>`:''}</td>${dc}</tr>`;
      }).join('');
      return `<div style="${wrapStyle}">${titleHTML}<table style="border-collapse:collapse;width:100%"><thead><tr style="background:#032D42;color:#fff">${hdrW}</tr></thead><tbody>${rowsW}</tbody></table></div>`;
    }

    case "at_a_glance_schedule":
    case "meeting_briefs": {
      if (!content || content.trim() === "<!-- no meetings -->") return "";
      return `<div style="${wrapStyle}">${titleHTML}<div style="${bodyStyle}font-size:10pt;">${content}</div></div>`;
    }

    case "panel_details": {
      if (!content || content.trim().startsWith("<!-- no panels")) return "";
      return `<div style="${wrapStyle}">${titleHTML}<div style="${bodyStyle}font-size:10pt;">${content}</div></div>`;
    }

    case "brief_title": {
      const body = getContent(section, nameLower);
      return `<div style="${FF}background:${accentColor};color:#ffffff;padding:14pt 8pt;margin-bottom:18pt;">
        <div style="${FF}font-size:16pt;font-weight:bold;color:#ffffff;margin:0 0 4pt 0;">${esc(execName)}</div>
        ${body ? `<div style="${FF}font-size:10pt;color:rgba(255,255,255,0.85);">${body}</div>` : ""}
      </div>`;
    }

    case "brief_header": {
      // Strip outer <p> tags that Tiptap wraps content in — LibreOffice ignores
      // font-size on parent <p> when a child <p> is present (nested p = invalid HTML)
      const bannerInner = (section.body_text || "<span style=\"color:#ffffff\">Executive Briefing</span>")
        .replace(/^<p[^>]*>/i, "").replace(/<\/p>$/i, "");
      const docTitle = section.left_label || "";
      const logoB64 = section.logo_b64 || "";
      const logoMime = section.logo_mime || "image/png";
      return `${logoB64 ? `<p style="${FF}margin:0 0 6pt 0;"><img src="data:${logoMime};base64,${logoB64}" width="144" height="auto"></p>` : ""}
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#032D42;border:none;margin-bottom:14pt;">
  <tr><td style="padding:14pt 8pt;border:none;">
    <span style="${FF}font-size:20pt;font-weight:bold;">${bannerInner}</span>
  </td></tr>
</table>
<p style="${FF}font-size:11pt;font-weight:bold;color:#111111;margin:16pt 0 ${section.event_meta ? "2pt" : "18pt"} 0;">${esc(execName)}${docTitle ? ` — ${esc(docTitle)}` : ""}</p>
${section.event_meta ? `<p style="${FF}font-size:9pt;color:#555555;margin:0 0 18pt 0;">${esc(section.event_meta)}</p>` : ""}`;
    }

    case "table_of_contents": {
      if (!tocEntries || !tocEntries.length) return "";
      const bullets = tocEntries.map(t => {
        const href = titleToAnchor(t);
        return `<div style="${FF}font-size:9pt;padding:2px 0;"><span style="font-size:5.5pt;vertical-align:middle;margin-right:4px;">&#x2022;</span><a href="#${href}" style="${FF}color:#4169E1;text-decoration:underline;">${esc(t)}</a></div>`;
      }).join("");
      return `<div style="${wrapStyle}">${titleHTML}<div>${bullets}</div></div>`;
    }

    case "large_image": {
      if (!section.image_b64) return "";
      const caption = section.caption || "";
      return `${title ? `<div id="${anchorId}" style="${titleStyle}page-break-after:avoid;">${esc(title.toUpperCase())}</div>` : ""}<div style="${FF}margin:0 0 14pt 0;"><img src="data:${section.image_mime || "image/png"};base64,${section.image_b64}" style="${FF}width:550px;height:auto;display:block;">${caption ? `<div style="${FF}font-size:10pt;color:#111111;font-style:italic;margin-top:4pt;">${caption}</div>` : ""}</div>`;
    }

    case "hotel_info":
    case "logo": {
      if (!section.image_b64) return "";
      const logoScaleW = Math.max(0.25, (parseInt(section.left_label) || 100) / 100);
      const logoWidthPx = Math.round(144 * logoScaleW);
      return `<p style="${FF}margin:0 0 10pt 0;"><img src="data:${section.image_mime || "image/png"};base64,${section.image_b64}" width="${logoWidthPx}" height="auto"></p>`;
    }

    default: {
      if (!content) return "";
      return `<div style="${wrapStyle}">${titleHTML}<div style="${bodyStyle}">${content}</div></div>`;
    }
  }
}

// ── Legacy support (old textboxes/tables payload) ─────────────────────────────

function buildLegacyHTML(execName, textboxes, tables) {
  const eventName    = textboxes.event_name    || "Executive Briefing";
  const introCopy    = textboxes.intro_copy    || "";
  const keynoteTitle = textboxes.keynote_title || "Opening Keynote";
  const keynoteMeta  = textboxes.keynote_meta  || "";
  const runOfShow    = tables.run_of_show       || [];
  const nameLower    = execName.toLowerCase();

  const rosRows = runOfShow.slice(1).map(row => {
    const isExec = row.some(cell => cell.toLowerCase().includes(nameLower));
    const cells  = row.map(cell => `<td>${esc(cell)}</td>`).join("");
    return `<tr class="${isExec ? "exec-row" : ""}">${cells}</tr>`;
  }).join("\n");

  const headerRow = runOfShow[0]
    ? runOfShow[0].map(h => `<th>${esc(h)}</th>`).join("")
    : "<th>TIME</th><th>SEGMENT</th><th>SPEAKER</th><th>DURATION</th><th>NOTES</th>";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8">
<style>
${baseCSS()}
th:nth-child(1), td:nth-child(1) { width: 11%; }
th:nth-child(2), td:nth-child(2) { width: 26%; }
th:nth-child(3), td:nth-child(3) { width: 20%; }
th:nth-child(4), td:nth-child(4) { width: 10%; }
th:nth-child(5), td:nth-child(5) { width: 33%; }
</style>
</head>
<body data-exec-name="${esc(execName)}" data-footer-conf="${esc(eventName)}  |  Confidential">
<div class="page cover">
  <div class="cover-eyebrow">Executive Briefing</div>
  <div class="cover-name">Prepared for<br>${esc(execName)}</div>
  <div class="cover-event">${esc(eventName)}</div>
  <div class="cover-rule"></div>
  <div class="cover-intro">${esc(introCopy)}</div>
  <div class="cover-footer">
    <div class="cover-footer-left"><div class="cover-dot"></div><div class="cover-footer-brand">ServiceNow</div></div>
    <div class="cover-footer-conf">${esc(eventName)}  |  Confidential</div>
  </div>
</div>
<div class="page content-page">
  <div class="page-header">
    <div class="page-header-title">Keynote — Run of Show</div>
    <div class="page-header-right">${esc(eventName)}  |  Confidential</div>
  </div>
  <div class="page-body">
    <div class="section-bar">Run of Show</div>
    <div style="font-size:9pt;color:#6b7280;margin-bottom:0.18in;padding-left:2px;">${esc(keynoteTitle)}&nbsp;&nbsp;|&nbsp;&nbsp;${esc(keynoteMeta)}</div>
    <table>
      <thead><tr>${headerRow}</tr></thead>
      <tbody>${rosRows || '<tr><td colspan="5" class="empty-row">No run of show data provided</td></tr>'}</tbody>
    </table>
  </div>
</div>
</body>
</html>`;
}
