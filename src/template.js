// ── Entry point ───────────────────────────────────────────────────────────────
// Supports both new sections-based payload and legacy textboxes/tables payload

export function buildHTML(execName, event, sections, legacyTextboxes, legacyTables, theme) {

  // Legacy fallback for old POC payload format
  if ((!sections || sections.length === 0) && legacyTextboxes) {
    return buildLegacyHTML(execName, legacyTextboxes, legacyTables || {});
  }

  const nameLower = execName.toLowerCase();
  const eventName = (event && event.name) || "Executive Briefing";
  const showConfidential = event && event.show_confidential !== false;
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

  // Build interior section HTML
  const bodyHTML = renderSections(execName, nameLower, sections, eventName, coverStyle);

  const coverHTML = hasBriefHeader
    ? `<!-- BRIEF HEADER (no cover page, no running header) -->
<div class="page content-page">
  <div class="page-body">
    ${renderSectionRows(execName, nameLower, sections, eventName)}
  </div>
</div>`
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
</style>
</head>
<body data-exec-name="${esc(execName)}" data-footer-conf="${confidentialLabel}">
${coverHTML}
</body>
</html>`;
}

// ── Section renderer ──────────────────────────────────────────────────────────

function filterInteriorSections(sections, nameLower) {
  return sections.filter(s => {
    if (s.type === "brief_title") return false;
    if (s.type === "footer") return false;
    if (s.type === "exec_enhancements") {
      return !!getOverride(s, nameLower);
    }
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
const TOC_SKIP = new Set(["table_of_contents", "logo", "large_image", "brief_title", "brief_header", "brief_overview", "footer"]);
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

function renderSections(execName, nameLower, sections, eventName, coverStyle) {
  if (coverStyle === "compact") return "";
  const interior = filterInteriorSections(sections, nameLower);
  if (interior.length === 0) return "";
  const rowsHTML = renderSectionRows(execName, nameLower, sections, eventName);
  return `<div class="page content-page">
  <div class="page-header">
    <div class="page-header-title">${esc(eventName)}</div>
    <div class="page-header-right">${esc(eventName)}  |  Confidential</div>
  </div>
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

function renderSection(section, execName, nameLower, eventName, sectionIndex = 0, tocEntries = []) {
  const type = section.type;
  const title = section.title || "";
  const br = section.border_radius ? `border-radius:${section.border_radius}px;` : "";
  const bgColor = getBgColor(section.background_color);
  const bgStyle = bgColor ? `background:${bgColor};${br}padding:0.25in 0.3in;margin-bottom:0.2in;` : "";
  const textColor = bgColor && bgColor !== "#ffffff" && bgColor !== "#f3f4f6" ? "color:#ffffff;" : "";
  const barStyle = textColor ? "color:#ffffff;background:transparent;border-bottom-color:rgba(255,255,255,0.4);" : "";

  const content = getContent(section, nameLower);

  const html = (() => { switch (type) {

    case "exec_enhancements":
    case "callout":
    case "event_highlights":
    case "brief_overview":
    case "text":
    case "custom": {
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar" style="${barStyle}">${esc(title)}</div>` : ""}
        <div class="section-richtext" style="${textColor}">${content || ""}</div>
      </div>`;
    }

    case "html_content": {
      // Raw HTML injection — body_text is trusted HTML authored in the code editor.
      // Bypasses stripFontFamily so the author's styles are preserved exactly.
      const rawHtml = section.body_text || "";
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar" style="${barStyle}">${esc(title)}</div>` : ""}
        <div class="html-content-body">${rawHtml}</div>
      </div>`;
    }

    case "two_column": {
      const col1Content = stripInlineStyles(section.left_label || "");
      const col2Content = stripInlineStyles(section.body_text || "");
      if (!col1Content && !col2Content) return "";
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar">${esc(title)}</div>` : ""}
        <div class="two-col-layout">
          <div class="two-col-label section-richtext">${col1Content}</div>
          <div class="two-col-content section-richtext">${col2Content}</div>
        </div>
      </div>`;
    }

    case "three_column": {
      const col1Content = stripInlineStyles(section.left_label || "");
      const col2Content = stripInlineStyles(section.body_text || "");
      const col3Content = stripInlineStyles(section.body_text_2 || "");
      if (!col1Content && !col2Content && !col3Content) return "";
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar">${esc(title)}</div>` : ""}
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
        <div class="section-bar">${esc(title)}</div>
        <table class="kv-table"><tbody>${rows}</tbody></table>
      </div>`;
    }

    case "gym_hours": {
      const items = (section.gym_data && section.gym_data[execName])
        ? section.gym_data[execName]
        : section.items;
      if (!items || items.length === 0) return "";
      // col_1 = hotel name (resolver key, not displayed)
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
        <div class="section-bar">${esc(title || "Gym Hours")}</div>
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
      return `<div class="section-wrap" style="${bgStyle}">
        <div class="section-bar">${esc(title || "Hotel & Travel Info")}</div>
        <div class="hotel-layout">
          <div class="hotel-col-label">Hotel</div>
          <div class="hotel-col-content">
            <div class="hotel-name">${formatHotelName(info.hotel_name)}</div>
            ${tableRows ? `<table class="hotel-mini-table"><tbody>${tableRows}</tbody></table>` : ""}
            ${extras}
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
        ${title ? `<div class="section-bar" style="${barStyle}">${esc(title)}</div>` : ""}
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
        <div class="section-bar">${esc(title)}</div>
        <table><thead><tr>${headerCells}</tr></thead><tbody>${rows}</tbody></table>
      </div>${footNote}`;
    }

    case "rehearsal_schedule": {
      // Auto-generated: body_text is pre-rendered HTML from DB rehearsal data
      const rehContent = content ? content.trim() : "";
      if (!rehContent || rehContent === "<!-- no rehearsals -->") return "";
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar" style="${barStyle}">${esc(title)}</div>` : ""}
        <div class="html-content-body">${rehContent}</div>
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
        ${title ? `<div class="section-bar" style="${textColor}">${esc(title)}</div>` : ""}
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
      const headerCells = `<th style="text-align:left;padding:6pt 8pt;font-size:8pt">Area</th>` + days.map(d => `<th style="text-align:center;padding:5pt 4pt;font-size:7.5pt;line-height:1.3">${fmtDayHdr(d)}</th>`).join('');
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
          dayCells += `<td class="meal-cell" colspan="${span}" style="font-size:7pt;white-space:nowrap">${txt}</td>`;
          ci += span;
        }
        return `<tr><td style="padding:5pt 8pt;font-size:8pt"><div class="meal-venue">${esc(item.col_1 || '')}</div>${item.col_2 ? `<div class="meal-location">${esc(item.col_2)}</div>` : ''}</td>${dayCells}</tr>`;
      }).join('');
      return `<div class="section-wrap" style="${bgStyle}">
        ${title ? `<div class="section-bar" style="${barStyle}">${esc(title)}</div>` : ""}
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
        ${title ? `<div class="section-bar" style="${barStyle}">${esc(title)}</div>` : ""}
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
        ${title ? `<div class="section-bar">${esc(title)}</div>` : ""}
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
        ${title ? `<div class="section-bar" style="${barStyle}">${esc(title)}</div>` : ""}
        <div style="padding:2px 0;">${rows}</div>
      </div>`;
    }

    default: {
      if (content) {
        return `<div class="section-wrap" style="${bgStyle}">
          ${title ? `<div class="section-bar">${esc(title)}</div>` : ""}
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
  const anchorEl = `<a name="${anchorId}" style="display:block;height:0;"></a>`;
  return html.replace(/(<div class="section-wrap")([^>]*>)/, `$1 id="${anchorId}"$2${anchorEl}`);
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
  font-family: 'ServiceNow Sans Display';
  font-weight: 700;
  font-style: normal;
  src: url('data:font/otf;base64,T1RUTwANAIAAAwBQQ0ZGIMd1D/0AAADcAACg6URTSUdVV1WLAAChyAAAAChHREVGQz5DKQAAofAAAAFkR1BPUwB6KA8AAKNUAADELEdTVUJnsgf+AAFngAAADOpPUy8ywFF1rgABdGwAAABgY21hcGg3h5gAAXTMAAAG6GhlYWQtng/wAAF7tAAAADZoaGVhCq8FqgABe+wAAAAkaG10eIGZLbYAAXwQAAAKYG1heHACmFAAAAGGcAAAAAZuYW1lxvvnmAABhngAAAbIcG9zdP8xAJoAAY1AAAAAIAEABAIAAQEBG1NlcnZpY2VOb3dTYW5zLURpc3BsYXlCb2xkAAEBAUb51gD51wH52AL4FAT7swwD9y4MBB6gAQUmP4uLHqABBSY/i4sMB/sN+4MdAAAGo/opBR0AACWvD7UdAACRnRIdAAApFhEBvgIAAQAGAAgADgAVABwAIwAqADEAOAA/AEYATABSAF0AZwBtAHQAegCBAIcAjQCUAJsApQCsALMAugDBAMgAzgDUAN8A5gDwAPcA+wEGAQ0BFAEWARwBJgEtATQBOgFFAVABVwFdAWMBagFxAXUBfAGDAYkBjwGWAZ0BpAGrAa4BtAG7AcIByQHWAd0B5AHvAfUB+wICAgkCEAIWAh4CKQIwAjcCPgJCAkgCTwJWAl0CZAJqAnECeAKFAowCkwKYAp4CpAKvArgCvgLJAtAC1gLdAuQC6gL0AvsDAQMNAxMDGgMhAygDLwM2Az0DRANLA1EDVwNiA2wDcgN5A38DhgOMA5IDmQOgA6oDsQO4A78DxgPNA9MD2QPkA+sD9QP8BAAECwQSBBkEHwQoBC8ENgQ8BD4ERQRQBFsEYgRuBHQEegSBBIgEjASTBJoEoASrBLEEuAS/BMYEzQTQBNYE3QTkBOsE+AT/BQYFEQUXBR0FJAUrBTIFOAVABUsFUgVZBV0FYwVqBXEFeAV/BYUFjAWTBaAFpwWuBbMFuQW/BcoF0wXZBeQF6wXxBfgF/wYFBg8GFgYcBiIGKAYuBjQGOgZABkYGTAZSBlgGXgZkBmoGcAZ2BnwGggaIBo4GlAaaBqAGpgasBrIGtQa6Br8GwgbFBswG0wbaBtwG4wbqBvEG+Ab/BwYHDQcUBxsHIgcpBzAHNwc+B0UHTAdVB1wHYgdoB3AHdwd+B4QHjAeUB5sHpweuB7UHvAfDB8oH0QfYB98H5gftB/QH+wgCCAkIEAgXCB4IJQgsCDMIPwhLCFIIWQhgCGoIeAiHCJgIoQipCLEIvQjKCNEI4AjuCP0JCwkaCSoJOwlNCWAJcgmFCYwJkwmaCaEJsAm3CbsJwgnJCdAJ1wneCegJ7wn6CgMKCgoVChsKIgopCjEKPQpGClEKWQphCmgKbwp2Cn8KhgqRCpgKoQqrCrgKwwrNCtoK5grvCv8LDgsdCyoLMQs5C0QLTAtWC2ILbwt/C4wLkwuaC6QLqwu0C7sLxAvLC9QL3QvkC+sL8gv5DAAMBwwODBoMJgw1DEEMTwxbDGkMdQyDDJEMnQypDLUMwQzNDNkM4AzmDO0M9gz9DQQNCw0UDR0NJA0vDTYNPQ1EDUsNVA1bDWINbg11DXwNgw2KDZENmA2fDasNtw3DDcoN0Q32DhIubnVsbENSQWJyZXZldW5pMDFDRHVuaTFFQUN1bmkxRUEwQW1hY3JvbkFvZ29uZWtBRWFjdXRldW5pMDFFMnVuaTFFMDRDYWN1dGVDY2Fyb25DY2lyY3VtZmxleENkb3RhY2NlbnREY2Fyb251bmkxRTEyRGNyb2F0dW5pMUUwQ0VicmV2ZUVjYXJvbnVuaTAyMjh1bmkxRUM2RWRvdGFjY2VudHVuaTFFQjhFbWFjcm9uRW9nb25la3VuaTFFQkN1bmkwMThGR2JyZXZlR2Nhcm9uR2NpcmN1bWZsZXh1bmkwMTIyR2RvdGFjY2VudHVuaTFFMjBIYmFySGNpcmN1bWZsZXh1bmkxRTIydW5pMUUyNElKSWJyZXZlSWRvdGFjY2VudEltYWNyb25Jb2dvbmVrSXRpbGRldW5pMDA0QTAzMDFKY2lyY3VtZmxleHVuaTAxMzZMYWN1dGVMY2Fyb251bmkxRTNDdW5pMDEzQkxkb3R1bmkxRTM2dW5pMUUzOE5hY3V0ZU5jYXJvbnVuaTFFNEF1bmkwMTQ1dW5pMUU0NHVuaTFFNDZFbmdPYnJldmV1bmkwMUQxdW5pMUVEOHVuaTFFQ0NPaHVuZ2FydW1sYXV0T21hY3JvbnVuaTAxRUFPc2xhc2hhY3V0ZVJhY3V0ZVJjYXJvbnVuaTAxNTZ1bmkxRTVBdW5pMUU1Q1NhY3V0ZVNjZWRpbGxhU2NpcmN1bWZsZXh1bmkwMjE4dW5pMUU2MnVuaTFFOUVUYmFyVGNhcm9udW5pMDE2MnVuaTFFNzB1bmkwMjFBdW5pMUU2Q1VicmV2ZXVuaTAxRDN1bmkxRUU0VWh1bmdhcnVtbGF1dFVtYWNyb25Vb2dvbmVrVXJpbmdVdGlsZGVXYWN1dGVXY2lyY3VtZmxleFdkaWVyZXNpc1dncmF2ZVljaXJjdW1mbGV4dW5pMUU4RVlncmF2ZXVuaTAyMzJ1bmkxRUY4WmFjdXRlWmRvdGFjY2VudHVuaTFFOTJLLnNzMDF1bmkwMTM2LnNzMDFhYnJldmV1bmkwMUNFdW5pMUVBRHVuaTFFQTFhbWFjcm9uYW9nb25la2FlYWN1dGV1bmkwMUUzdW5pMUUwNWNhY3V0ZWNjYXJvbmNjaXJjdW1mbGV4Y2RvdGFjY2VudGRjYXJvbnVuaTFFMTNkY3JvYXR1bmkxRTBEZWJyZXZlZWNhcm9udW5pMDIyOXVuaTFFQzdlZG90YWNjZW50dW5pMUVCOWVtYWNyb25lb2dvbmVrdW5pMUVCRHVuaTAyNTlnYnJldmVnY2Fyb25nY2lyY3VtZmxleHVuaTAxMjNnZG90YWNjZW50dW5pMUUyMWhiYXJoY2lyY3VtZmxleHVuaTFFMjN1bmkxRTI1aWJyZXZlaS5sb2NsVFJLaW1hY3JvbmlvZ29uZWtpdGlsZGVpanVuaTAyMzd1bmkwMDZBMDMwMWpjaXJjdW1mbGV4dW5pMDEzN2tncmVlbmxhbmRpY2xhY3V0ZWxjYXJvbnVuaTFFM0R1bmkwMTNDbGRvdHVuaTFFMzd1bmkxRTM5bmFjdXRlbmFwb3N0cm9waGVuY2Fyb251bmkxRTRCdW5pMDE0NnVuaTFFNDV1bmkxRTQ3ZW5nb2JyZXZldW5pMDFEMnVuaTFFRDl1bmkxRUNEb2h1bmdhcnVtbGF1dG9tYWNyb251bmkwMUVCb3NsYXNoYWN1dGVyYWN1dGVyY2Fyb251bmkwMTU3dW5pMUU1QnVuaTFFNURzYWN1dGVzY2VkaWxsYXNjaXJjdW1mbGV4dW5pMDIxOXVuaTFFNjN0YmFydGNhcm9udW5pMDE2M3VuaTFFNzF1bmkwMjFCdW5pMUU2RHVicmV2ZXVuaTAxRDR1bmkxRUU1dWh1bmdhcnVtbGF1dHVtYWNyb251b2dvbmVrdXJpbmd1dGlsZGV3YWN1dGV3Y2lyY3VtZmxleHdkaWVyZXNpc3dncmF2ZXljaXJjdW1mbGV4dW5pMUU4RnlncmF2ZXVuaTAyMzN1bmkxRUY5emFjdXRlemRvdGFjY2VudHVuaTFFOTNhLm9yZG5iLm9yZG5jLm9yZG5kLm9yZG5lLm9yZG5mLm9yZG5nLm9yZG5oLm9yZG5pLm9yZG5qLm9yZG5rLm9yZG5sLm9yZG5tLm9yZG5uLm9yZG5vLm9yZG5wLm9yZG5xLm9yZG5yLm9yZG5zLm9yZG50Lm9yZG51Lm9yZG52Lm9yZG53Lm9yZG54Lm9yZG55Lm9yZG56Lm9yZG5mX2ZmX2ZfaWZfZl9sZl9pZl9sdW5pMDM5NHVuaTAzQTl1bmkwM0JDcGl1bmkyMTYwdW5pMjE2MXVuaTIxNjJ1bmkyMTYzdW5pMjE2NHVuaTIxNjV1bmkyMTY2dW5pMjE2N3VuaTIxNjh1bmkyMTY5dW5pMjE2QXVuaTIxNkJ1bmkyMTZDdW5pMjE2RHVuaTIxNkV1bmkyMTZGemVyby56ZXJvemVyby50Zm9uZS50ZnR3by50ZnRocmVlLnRmZm91ci50ZmZpdmUudGZzaXgudGZzZXZlbi50ZmVpZ2h0LnRmbmluZS50Znplcm8udGYuemVyb3VuaTIwODB1bmkyMDgxdW5pMjA4MnVuaTIwODN1bmkyMDg0dW5pMjA4NXVuaTIwODZ1bmkyMDg3dW5pMjA4OHVuaTIwODl1bmkyMDcwdW5pMDBCOXVuaTAwQjJ1bmkwMEIzdW5pMjA3NHVuaTIwNzV1bmkyMDc2dW5pMjA3N3VuaTIwNzh1bmkyMDc5dW5pMjA4MC56ZXJvdW5pMjA3MC56ZXJvdW5pMDBBMHVuaTIwNDJ1bmkyMDUxY29sb24uY2FzZXNlbWljb2xvbi5jYXNlZXhjbGFtZG93bi5jYXNlcXVlc3Rpb25kb3duLmNhc2VwZXJpb2QudGZjb21tYS50ZmNvbG9uLnRmc2VtaWNvbG9uLnRmbnVtYmVyc2lnbi50ZnVuaTIwMTB1bmRlcnNjb3JlLmNhc2VwYXJlbmxlZnQuY2FzZXBhcmVucmlnaHQuY2FzZWJyYWNlbGVmdC5jYXNlYnJhY2VyaWdodC5jYXNlYnJhY2tldGxlZnQuY2FzZWJyYWNrZXRyaWdodC5jYXNlZ3VpbGxlbW90bGVmdC5jYXNlZ3VpbGxlbW90cmlnaHQuY2FzZWd1aWxzaW5nbGxlZnQuY2FzZWd1aWxzaW5nbHJpZ2h0LmNhc2V1bmkwRTNGdW5pMjYyRXVuaTIxMTN1bmkyMTE2cmVnaXN0ZXJlZC5zczAzdW5pMjBCRkV1cm91bmkyMEI0dW5pMjBCRHVuaTIwQjl1bmkyMEFBdW5pMjBBOXVuaTIwQkYudGZjZW50LnRmY3VycmVuY3kudGZkb2xsYXIudGZFdXJvLnRmc3RlcmxpbmcudGZ5ZW4udGZ1bmkyMjE5dW5pMjIxNW5vdGVxdWFsZ3JlYXRlcmVxdWFsbGVzc2VxdWFsYXBwcm94ZXF1YWxpbmZpbml0eWludGVncmFsdW5pMjEyNnVuaTIyMDZwcm9kdWN0c3VtbWF0aW9ucmFkaWNhbHBhcnRpYWxkaWZmdW5pMDBCNXBsdXMuY2FzZW1pbnVzLmNhc2VtdWx0aXBseS5jYXNlZGl2aWRlLmNhc2VlcXVhbC5jYXNlbm90ZXF1YWwuY2FzZWdyZWF0ZXIuY2FzZWxlc3MuY2FzZWFwcHJveGVxdWFsLmNhc2Vhc2NpaXRpbGRlLmNhc2Vsb2dpY2Fsbm90LmNhc2VpbmZpbml0eS5jYXNlcGx1cy50Zm1pbnVzLnRmbXVsdGlwbHkudGZlcXVhbC50ZnBlcmNlbnQudGZwbHVzLnRmLmNhc2VtaW51cy50Zi5jYXNlbXVsdGlwbHkudGYuY2FzZWVxdWFsLnRmLmNhc2VhcnJvd3VwdW5pMjE5N2Fycm93cmlnaHR1bmkyMTk4YXJyb3dkb3dudW5pMjE5OWFycm93bGVmdHVuaTIxOTZhcnJvd2JvdGhhcnJvd3VwZG51bmkyMUE5dW5pMjFBQXVuaTIxQjB1bmkyMUIxdW5pMjFCMnVuaTIxQjN1bmkyMUI0YXJyb3d1cC5zczAydW5pMjE5Ny5zczAyYXJyb3dyaWdodC5zczAydW5pMjE5OC5zczAyYXJyb3dkb3duLnNzMDJ1bmkyMTk5LnNzMDJhcnJvd2xlZnQuc3MwMnVuaTIxOTYuc3MwMmFycm93Ym90aC5zczAyYXJyb3d1cGRuLnNzMDJ1bmkyMUE5LnNzMDJ1bmkyMUFBLnNzMDJ1bmkyMUIwLnNzMDJ1bmkyMUIxLnNzMDJ1bmkyMUIzLnNz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AJz/7wFC/+YBSP/uAY7/9AGP//IBlP/3AZb/8QHB/+sBxf/yAcj/vwHJ/9kB2P/kAdn/9AHb/9UB3f/tAd//6gHh/80B4//nAeX/5gH2//YCHP/vABgAlv/HAJz/5gFC/90BSP/jAY7/6AGP/+YBlP/SAZb/5AHB/78Bxf/FAcj/xAHJ/7wB2P/XAdv/xQHd/9YB3//TAeH/xwHj/9sB5f/XAfb/6QH//9QCAP/DAhP/4wIc//QAMwFC/+YBSP/mAXcABwGO//gBkP/6AZH/uwGS/+YBk/+9AZX/9QGW//kBw/++AcT/sQHFABYBx//WAcj/hwHY/74B2f/BAdv/8QHh/9sB9v/nAfn/2gH6/+0B/wAaAgAACQIJ/9YCCv/SAgv/8wIM/8oCDf/nAg7/1wIR/+kCHP+yAh3/sQIe/60CH//AAiD/swIh/8MCIv/DAiP/3wIk/6wCJv/dAif/0AIo/74CN//CAjj/vgI5/9YCOv/CAjv/2gI8/9wCPv+9Aj//1AAWAJb/2gCc/+sBQv/2AUj/+gGU//oBw//vAcj/xQHJ/8kB2P/aAdv/ygHd/+MB3//hAeH/ygHj/94B5f/ZAfb/+AH//+wCEv/zAhP/4gI4//ICOv/zAj7/8QAgAJb/4gCc/94BSP/7AZH/3wGS//YBk//iAcEABwHD//MBxP/hAcUADgHI/5sByf/UAdj/uAHZ/8cB2//KAd3/6QHf/+cB4f/AAeP/1wHl/9MB6QAIAfr/8gIT/+ICHP/HAh3/4AIe/90CH//yAiD/4gIk/90CKP/uAjj/9AI+//MACQCcABEA8gBUAUgADAGqAAEBuwAVAb0AFAHi//4B5gAVAecAFQAZAAQACwAFAAsABgALAAcACwAIAAsACQALAAoACwALAAsADAALAA0ACwAOAAsADwALABAACwBJAAsASgALAEsACwCcABoA8gBdAUgAFQGqAAEBuwAeAb0AHQHh//8B5gAeAecAHgARAAQACwAFAAsABgALAAcACwAIAAsACQALAAoACwALAAsADAALAA0ACwAOAAsADwALABAACwCcABoA8gBAAUgAFQGq//YAHAAEABQABQAUAAYAFAAHABQACAAUAAkAFAAKABQACwAUAAwAFAANABQADgAUAA8AFAAQABQAnAAjAKUACACmAAgApwAIAKgACACpAAgA8gA9AUgAHgGk/+wBqv/tAaz/7AG7AA4BvQANAeYADgHnAA4ABACcABcA8gA4AUgAEgGq//YAGQAEAA4ABQAOAAYADgAHAA4ACAAOAAkADgAKAA4ACwAOAAwADgANAA4ADgAOAA8ADgAQAA4AnAAbAKUABwCmAAcApwAHAKgABwCpAAcA8gA9AUgAFgGk//QBpf/zAar/5gGs//EAEQDyACsBo//0AaT//wGl//8Bpv//Aaf/2wGo//QBqf/bAaoAAQGr//QBrP/0Abf/9AHiAAMB7AAIAe4ACAHy//4B9P/+ABEABAAMAAUADAAGAAwABwAMAAgADAAJAAwACgAMAAsADAAMAAwADQAMAA4ADAAPAAwAEAAMAJwAHQDyAD8BSAAYAar/9gAHAEkAEQBKABEASwARAPIAKwGn/+8Bqf/vAaoAAQACAbQAAQHc//0ABAG0AAEB3P//AekACwHrAAsABQG0//YB6AAWAekADQHqABYB6wANAAgBrv/sAa//9gG0/+0Btv/uAegAGwHpABMB6gAbAesAEwAFAbT/9gHoABQB6QAKAeoAFAHrAAoACAGu//UBr//zAbT/5gG2//EB6AAZAekADwHqABkB6wAPACEAggAIAIMACACEAAgAhQAIAIYACACHAAgAiAAIAJYAEgCXAAsAmAALAJkACwCaAAsAmwALAJwADwCdABcAngAXAJ8AFwCgABcAoQAXAKIAFwCjABcApAAXAa3/9AGu//8Br///AbD//wGx/9wBsv/0AbP/2wG0AAEBtf/3Abb/9AG4//QABQG0//YB6AAVAekADwHqABUB6wAPAAMBsf/wAbP/7wG0AAEAAgDyACsBqv/2AAEBtP/2AAUA6gAfAOsAFADtACoA8AAMAPUAIAAEAFb/7ADqABUA9QAWAQH/6AAEAFb/8gDqABUA9QAWAQH/6wAEAB//3gAh/94AOv/uAQH/8AACAdv/4AHh/9kAEgBHAC8Alv/OAOoAFgDvADgA8gBVAPMAVQD0AFUA9QBVAPwAbgD9AA0BIwASATIAHwFC/+wBuwApAb0AKQHF//IB5gApAecAKQAKAcEADwHFABQB2//QAd3/8gHf//EB4f/FAeP/3AHl/9oB5v+tAef/rQAkAB//3wAh/98AMP/QADr/7gBHAB4AVv/ZAG3/0QBu/9EAlv+eAJwAGQDJ/9YA2P/ZAO8AJgDyAFUA8wBVAPQAVQD1AFUA/AAYAQH/3AEZ//oBGv/6AUL/uAFIABQBjv++AY//9AGQ//ABkf/JAZP/2QGU/9EBlf/aAZb/0AG7ABwBvQAOAcX/qwHmAA4B5wAOAAoAlv/DAJz/xQFC/+MBSP/XAY//0gGQ/+oBlP+rAZX/8AHL/+MBzP/DAAkAlv+6AJz/3QFC/9YBSP/TAY7/5AGP/9YBlP+5AZb/4wHM/9oAMwAf/+0AIf/tADoADQBW/+EAnP/uALD/8QCx//EAwv/qAMn/3gDP//EA0P/xANf/3gDY/+IA3QAGAOIAUADpACcA6gCFAOsAbQDtAEcA7gBCAPAAdwD1AIYBAf/jARH/5AES/+QBKgAQAUIAHwFIABcBjgARAY8AEgGQAAwBkf/IAZL/7wGT/8kBlAAWAZYADwHA//IBwQAVAcL/pgHFABwBzP/YAc7/swHa//EB2//XAdz/1wHh/8oB4v/iAeP/5AHl/+IB+v/zAgcAFwATACH/ygAw/8YAgf/LAMn/vwDY/7IBLf/NAUL/xwFI/8oBjv/OAY//1gGQ/88Bkf+lAZL/xQGT/6cBlf/IAZb/0wHI/zcBy//GAcz/pAAXACH/vwAw/7YAgf/VAJb/hgDJ/8wA2P/OAPIAXQEd/+gBHv/oAUL/pgGO/6MBj//MAZD/ygGR/8UBkv/KAZP/xAGU/7IBlf/FAZb/rgG7AD0BvQA2Acn/NwHL/78ADgAf/+gAIf/oADD/8wCW/9kAnP/mAcP/4gHI/78Byf/HAcz/6AHh/8MB4v/eAeP/1QHl/80B+f/zAA4AH//mACH/5gAw//QAlv/dAJz/4gHD/+IBxQAHAcj/tAHJ/8kBzP/dAeH/wQHi/90B4//VAeX/zwABAJb/6wAKAB//5AAh/+QAlv+/AJz/6QGO/8EBj//rAZT/ywGW/8EBxf+1Acz/6QAGADr/6ACD/6oBXAABAV8AAQFtAAEBb///ABEAMP/ZAJb/ugCcABgAyf/YANj/3QDyAFMBQv/GAUgAEwGO/88BkP/wAZH/0QGS//ABk//ZAZT/3wGV/9sBuwAyAb0AIQAFADD/5wCW/8IAnAAOAY7/0AGU/98ASgAf/80AIf/NADD/xABBAAIAQgBuAEMAWwBE/+gARQAJAEYALwBHACgASABiAFUAMABW/8sAgf/SAJb/6wCc//IAyf/IANT/xgDY/8QA4gABAOf/0QDo/9YA6QAdAOoAEgDrADUA7QBcAO4ABQDvADEA8AAOAPIAYgDzAGIA9ABiAPUAYgD8AHkA/QAbAP//9wEAADcBAf/RAR3/6gEe//QBIgAIASMAHwEk//sBJf/7ASj/3wEt/9cBMgAqAUL/vAFI/98BS//mAUz/6AFN/+YBT//nAVD/5wFT/+QBjv/HAY//0gGQ/88Bkf+8AZL/ywGT/7wBlP/wAZX/ygGW/8sBuwAzAb0AIQHC//ABxf/XAdr/xwHc/8wB5gAiAecAIgH6/8YCB//aAAUBxf/xAdv/xwHd/9wB3//ZAgf/7QA5AB//4gAh/+IAMP/dAEIAawBDAEcARgAfAEcALwBIAFYAVQAgAFb/3wCB/+kAyf/dAM3/3ADU/+QA2P/YAOIAMADn/+YA6P/sAOkAPADqAEsA6wBpAO0AfQDuACsA7wA3APAAVQDyAFQA8wBUAPQAVAD1AFQA/ABrAP0ACwEAACcBAf/hASIAKQEjAA8BJP/vASX/7wEoAAEBLf/uATIAHQFC/9cBUwACAY7/2wGP/+4BkP/pAZH/0AGS/+ABk//QAZX/4gGW/+UBuwA5Ab0AJgHa/9sB3P/bAeYAJwHnACcB+v/dAAcBr//8AbX/+QHF/9cB2//LAd3/2wHf/9oCB//WADoAH//hACH/4QAw/9wAQgBsAEMASABGAB8ARwAvAEgAVwBVACAAVv/eAIH/5wDJ/9wAzf/cANT/5ADY/9YA4gAxAOf/5QDo/+sA6QA8AOoARwDrAGkA7QB9AO4ALADvADgA8ABTAPIAVQDzAFUA9ABVAPUAVQD8AGwA/QAMAQAAJwEB/+EBFf/XASIAKQEjABABJP/wASX/8AEoAAEBLf/sATIAHQFC/9cBUwADAY7/1wGP/+sBkP/nAZH/yQGS/90Bk//KAZX/4AGW/+QBuwA6Ab0AJwHa/9kB3P/aAeYAKAHnACgB+v/bAAQBuwAiAb0ADwHmABAB5wAQACQAH//KACH/ygAw/8EAOv/VAEEAMgBCAEQAQwBtAET/+gBFAEoARgAvAEcAPQBIAE8AVQAwAFb/ywCB/9gAlv/PAJz/8wGO/78Bj//SAZD/zgGR/8IBkv/MAZP/wwGU/9wBlf/KAZb/xAG7AD8Bxf/LAcv/wwHN/9oBzv/IAeD/xwHi/8wB5gA5AecAOQH6/8gABAHM/9kB4f/HAeP/3AHl/9kAIAAf/+IAIf/iADD/1QA6//EAQQAgAEIAawBDAF4ARQA0AEYAIgBHAC8ASABWAFUAIwBW/+EAgf/wAJwAEAGO/9UBj//sAZD/4gGR/9MBkv/gAZP/1gGV/94Blv/bAbsAOQHF/+UBy//VAc7/2gHg/9sB4v/bAeYAJwHnACcB+v/cAAkBqgACAcX/4AHL/94BzP/TAeH/ywHj/9sB5f/aAekAAQH6/+YAIAAf/+EAIf/hADD/0gA6/+8AQQAgAEIAawBDAF8ARQA0AEYAIgBHAC8ASABXAFUAIwBW/94Agf/uAJwAEAGO/80Bj//oAZD/3QGR/8kBkv/dAZP/zwGV/9kBlv/XAbsAOgHF/+UBy//NAc7/1QHg/9kB4v/aAeYAKAHnACgB+v/XAAMBuwAiAeYAEAHnABAAJgAf/9wAIf/cADr/7gB6ABAAewAQAHwAEAB9ABAAfgAQAH8AEACAABAA2v/nANv/5wDc/+cA3f/nAN7/5wDf/+cA4P/nAPIADADzAAwA9AAMAPUADAEB//ABJgABAScAAQEoAAEBKQABASoAAQErAAEBLAABAUn/sgFK/7IBS/+yAUz/sgFN/7IBTv+yAU//sgFQ/7IBpAAIACYAH//cACH/3AA6/+4AegARAHsAEQB8ABEAfQARAH4AEQB/ABEAgAARANr/5wDb/+cA3P/nAN3/5wDe/+cA3//nAOD/5wDyAAwA8wAMAPQADAD1AAwBAf/wASYAAQEnAAEBKAABASkAAQEqAAEBKwABASwAAQFJ/7IBSv+yAUv/sgFM/7IBTf+yAU7/sgFP/7IBUP+yAaQACABKAB//3wAh/98AQgBnAEMANABGAAkASABWAFUACgBW/9kAgwAgAIkACACKAAgAiwAIAIwACACNAAgAjgAIAI8ACACQAAgAkQAIAJIACACTAAgAlAAIAJUACACu/8QAr//+ALL/4AC0AAYAwP/3AML/tgDM/8QAzf/+AM//vQDQ/70A0f/gANQABgDX/7oA2//YANwAEgDd/9EA4P/EAOIARwDn/9EA6P/cAOkAXADqAFMA6wB4AO0AngDuAEYA8ABRAPP/0QD0/90A9QBUAQAAFQEB/94BBv/oAQ//twEQ//EBE//TARX/+QEiAEoBJf/6ASgAIQEq/+EBLf/eATj/+wE6/98BPAADAU7/+gFTACQBtAAgAd0AHQHfAB0B4f/iAeMAHQHlAB0ALwAf/98AIf/fAEIAXABDACkASABLAFb/2ACv//UAsv/bALT//QDA/+0Awv/AAM3/9ADP/8cA0P/HANH/2ADU//wA2//PANwACQDd/9sA4gBCAOf/2wDo/+IA6QBTAOoAXQDrAHEA7QCVAO4APQDvAAgA8ABRAPP/2wD0/+IA9QBeAQAABwEB/9wBEP/nARP/zgEV/+8BIgBBASX/9AEoABgBKv/rAS3/4gE4//EBPP/5AU7/8AFTABsBtAAXADQAH//fACH/3wBCAFEAQwAeAEgAQABW/9kArv/EAK///gCy/+AAtAAGAMD/9wDC/7YAzP/EAM3//gDP/70A0P+9ANH/4ADUAAYA1/+6ANv/2ADcABIA3f/RAOD/xADiAEcA5//RAOj/3ADpAFwA6gBTAOsAeADtAJ4A7gBGAPAAUQDz/9EA9P/dAPUAVAEB/94BBv/oAQ//twEQ//EBE//TARX/+QEiAEoBJf/6ASgAIQEq/+EBLf/eATj/+gE6/98BPAACAU7/+QFTACQBtAAgAAQAOv/0AFb/7gD1AAcBAf/qAAMAOv/tAIP/qQGqAAcAEQBCADMASAAiAFb/4QDU/+cA3P/0AOIAOADpAD4A6gBuAOsAZgDtAIAA7gArAPAAWAD1AG8BAf/iASIALAEoAAMBKv/6ABEAQgAzAEgAIgBW/+EA1P/nANz/9ADiADgA6QA+AOoAbgDrAGYA7QCAAO4AKwDwAFgA9QBvAQH/4gEiACwBKAADASr/+QACAB//7gAh/+4AAwA6/+8Ag/+9Aar//gADAZD/8gGU/+4BzP/QABEBj//tAZD/2gGR/+UBk//qAZT/zAGV/+EBuwALAb0ABwHF/9MBy//UAdv/0QHc/+4B3f/kAd//4AHh/+IB5gALAecACwAEAdv/3QHh/88B4//zAeX/8QAEAZH/vAGS/+oBk/+9AZQACAACAbsAIgG9AA8ABgHb/8gB3f/cAd//2AHh/78B4//UAeX/zAAGAdv/xwHd/+EB3//eAeH/xQHj/9cB5f/PAAEBkv/vAAQBxQAVAdr/7QHb/9oB3P/WAAEBlP/nAAEBlP/QAAEBjv/yAAUBjv/vAZH/3AGS/+0Bk//cAZX/7gABAZT/6QADAZH/1AGS//MBk//XAAIBkf/TAZP/1wACAY7/6wGW/+wABAGP//ABkP/lAZH/9AGV/+0ACAGO/9sBj//lAZD/6QGR/94Bkv/jAZP/4AGV/+IBlv/hAAgBjv/yAZD/9AGR/8UBkv/jAZP/yAGUAA4Blf/oAZb/9AAEAY7/2wGP/88BlP+7AZb/4QAEAY7/1QGP/8oBlP+2AZb/3gACAY//7gGU/8AABAGO/94Bj//KAZT/ugGW/+MAAQGU/8EAAQGU/8kABAGO/9UBj//NAZT/twGW/90AAQGU/90AAQGU/94AAQGU/9EAAQGU/8oAAwGP/9YBkP/XAZT/tAAEAY//0gGQ/+8BlP+qAZX/8gABAZT/1AAEAY//1AGQ/9YBlP+2AZX/8wABAZT/0gABAZT/3AAEAY//zwGQ/9UBlP+qAZX/8QACKMAABAAAKRIqqAA4AF0AAP/aAAoABf/V/9H/0f/M/77/vf/UAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//QAAAAAAAAAAAAAAAAAAAAA/+P/3f/v/+8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/5AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/5QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+NAAAAAAAAAAAAAAAAAAAAAAAA/7sAAAAA/+sAAP/y/+0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/3wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAP/iAAD/4QAA/80AAAAA/90AAAAAAAAAAAAAAAD/8//w/8P/2/+x//P/6P/u/87/vv/j/+X/7P/x//L/9P/Z//MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/h/+b/7AAAAAAAAAAAAAAAAAAA/8YAAAAAAAD/2f/h/9n/1P/CAAAAAAAA/9L/vf/QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/ZAAAAAAAAAAD/5QAA/+D/4v/Y/+v/6gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/RAAD/0QAAAAAAAAAAAAD/8v/l//T/2wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/9v/4QAAAAAAAAAAAAAAAAAAAAD/2QAAAAD/0gAAAAAAAP/KAAAAAAAAAAD/vQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAI/8UAAAAAAAD/3QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/MAAD/zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/7gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/7gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/lAAD/2gAA/5f/zv+OAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/XAAAAAAAAAAAAAP/sAAAAAP/k/9X/5wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/3QAA//T/4v/GAAD/4wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/b/+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAYAAAAAAAAAAAAAAAAAAAAAAAAAAP/yAAAAAAAAAAAAAAAA/8T/2/+xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/w//EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/8wAAAAD/8P/nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/P/9H/1AAAAAAAAAAAAAAAAAAA/7YAAP/nAAD/xP/N/8b/yP+3/+n/5gAA/8D/rf+/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/OAAAAAAAAAAD/z//i/83/z/++//H/1v/sAAAAAAAAAAAAAAAA/+cAAAAAAAAAAAAAAAAAAP+//+D/vv/hAAAAAAAAAAD/2//R/9j/xQAAAAAAAP/q//H/6gAA/+AAAAAAAAAAAAAAAAAAAP/i/8f/yQAAAAAAAAAAAAAAAAAAAAD/xP/XAAD/wgAAAAD/2v/B/9T/zv/RAAD/rwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/f/7UAAAAAAAD/z//iAAAAAAAAAAAAAP/fAAAAAAAAAAAAAAAA//QAAAAAAAAAAAAAAAAAAP+9/9T/vQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/9wAAAAAAAAAAAAAAAAAAP/zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/oAAgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/wAAD/yf/L/5n/1P+aAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/DAAAAAAAAAAD/6P/ZAAAAAP/u/+P/8wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/5wAAAAAAAAAAAAAAAAAAAAAAAAAAAAcAAAAAAAAAAAAAAAAAAAAA/8oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+IAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA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AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/6AAA//P/5v/MAAD/8gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+kAAAAAAAAAAP/7AAAAAP/6//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/z/+v/8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//P/3QAA/+//6v/nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/2AAAAAP/u/+b/+gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//AAAAAA/97/3gAAAAAAAAAAAAAAAAAAAAAAAP/WAAAAAAAA//H/5AAA/9L/1//LAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/2AAAAAP/v/93/9gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/4wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/9QAAP+qAA8AAAAAAAAAAAAAAAAAAAAA/90AAAAAAAAAAAAAAAD/vv/GAAD/5//W/+7/6f/qAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//MAAAAAAAAAAP/y//r/+gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//v/9P/7AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP+XAAAAAAAAAAAAAAAAAAAAAAAA/6//8QAAAAD/6gAA/8//qP+oAAAAAAAI/8H/tf+8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/8UAAAAAAAD/+QAA/8n/yv/k/+n/4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/hAAAAAP/FAAAAAAAAAAD/+v/eAAD/3gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/9D/3AAAAAAAAAAAAAAAAAAAAAAAAP/WAAAAAAAA//P/4wAA/8b/0P/EAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/1AAAAAP/v/93/+QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/3wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/8sAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/zAAAAAAAAAAD/5wAA/+//4v/JAAD/9AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+0AAAAAAAAAAP/5AAAAAP/2//T/+wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/7AAAAAP/6AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+8AAAAAAAAAAAAAAAAAAAAA//n/6P/S//n/4v/5AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/+4AAAAAAAAAAAAAAAAAAP/7//oAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/5AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgANAAMAAwAAAY0BlwABAaMBvgAMAcABxQAoAcgByQAuAcsBzgAwAdQB9QA0AfkB+gBWAf0B/gBYAgcCBwBaAgwCDABbAhMCEwBcAhwCHABdAAIAQwADAAMAKwGNAY0ALAGOAY4AMwGPAY8ANwGQAZAANgGRAZEAMQGSAZIAMAGTAZMANQGUAZQANAGVAZUALwGWAZYAMgGXAZcALAGjAawALQGtAbYALgG3AbcALQG4AbgALgG5AbkAKwG6AbsADQG8Ab0ABwG+Ab4ADQHAAcAAHQHBAcEAJAHCAcIAJQHDAcMAIwHEAcQAGwHFAcUAEQHIAcgAKAHJAckAEgHLAcsAHAHMAcwAJwHNAc0AHgHOAc4AJgHUAdcADAHYAdgAKQHZAdkAKgHaAdoAHwHbAdsAIQHcAdwAEwHdAd0AFQHeAd4AFwHfAd8AGQHgAeAAIAHhAeEAIgHiAeIAFAHjAeMAFgHkAeQAGAHlAeUAGgHmAecADQHoAegADgHpAekADwHqAeoADgHrAesADwHsAewACAHtAe0ACgHuAe4ACAHvAe8ACgHwAfEAEAHyAfIACQHzAfMACwH0AfQACQH1AfUACwH5AfkAAgH6AfoAAQIHAgcABQIMAgwABAITAhMABgIcAhwAAwACAH8AAwADAA4ABAAQABIAEQATACgAFAAVAFYAFgAbAEMAHAAvAFYAMAAwAEcAMQAxAFYAMgA4AEMAOQBIAFYASQBLABMATABgAFYAYQBwAEMAcQByAFYAcwBzAEMAdAB5AFYAegCAAC0AgQCBAE8AggCIABQAiQCVAEQAlgCWABoAlwCbABUAnACcACoAnQCkABYApQCpAC4AqgCrAFYArAC7AC8AvAC9AFIAvgDDABkAxADIABcAyQDJAB4AygDXABkA2ADYACEA2QDZAEsA2gDgAEYA4QDlAFIA5gD1AFMA9gD3AFIA+AD4AEwA+QEBAFQBAgEEAEwBBgEMAEwBDQEcABkBHQEdAEwBHgEeAFIBHwEfABcBIAElAEwBJgEsADABLQEtAFIBLgE0AE0BNQFBAE4BQgFCACMBQwFHADEBSAFIADoBSQFQADIBUQFVADMBVgFvAEIBcAF2AEsBdwF4AEIBjQGNAA8BjgGOADcBjwGPADkBkAGQAEEBkQGRACQBkgGSAFEBkwGTACcBlAGUACYBlQGVAD8BlgGWADYBlwGXAA8BowGsADsBrQG2ADQBtwG3ADsBuAG4ADQBuQG5AA4BugG7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AZH/7wGS/+4Bk//wAZX/+QHBAAkBw//wAcT/7wHFABMByP+iAcz/zwHY/6sB2f/DAdv/6gHh/9cB+f/yAfr/8QH/ABcCAwALAgcADwId/+8CN//tAAgAOv/4AOIAFgDqAFIA6wApAPAAPAD1AFMBAf/8AW0ACAC5AAT/5wAF/+cABv/nAAf/5wAI/+cACf/nAAr/5wAL/+cADP/nAA3/5wAO/+cAD//nABD/5wAW//cAF//3ABj/9wAZ//cAGv/3ABv/9wAy//cAM//3ADT/9wA1//cANv/3ADf/9wA4//cASf/qAEr/6gBL/+oAYf/3AGL/9wBj//cAZP/3AGX/9wBm//cAZ//3AGj/9wBp//cAav/3AGv/9wBs//cAbf/3AG7/9wBv//cAcP/3AHP/9wCc//gArP/rAK3/6wCu/+sAr//rALD/6wCx/+sAsv/rALP/6wC0/+sAtf/rALb/6wC3/+sAuP/rALn/6wC6/+sAu//rAL7/5gC//+YAwP/mAMH/5gDC/+YAw//mAMT/6QDF/+kAxv/pAMf/6QDI/+kAyv/mAMv/5gDM/+YAzf/mAM7/5gDP/+YA0P/mANH/5gDS/+YA0//mANT/5gDV/+YA1v/mANf/5gDa/+kA2//pANz/6QDd/+kA3v/pAN//6QDg/+kA4gA3AOkAHQDqAFUA6wBMAO0AWwDuABMA8ABCAPUAVgD4//gBAv/4AQP/+AEE//gBBv/4AQf/+AEI//gBCf/4AQr/+AEL//gBDP/4AQ3/5gEO/+YBD//mARD/5gER/+YBEv/mARP/5gEU/+YBFf/mARb/5gEX/+YBGP/mARn/5gEa/+YBG//mARz/5gEd//gBH//pASD/+AEh//gBIgABASP/+AEk//gBJf/4ASb/7QEn/+0BKP/tASn/7QEq/+0BK//tASz/7QE1//gBNv/4ATf/+AE4//gBOf/4ATr/+AE7//gBPP/4AT3/+AE+//gBP//4AUD/+AFB//gBUf/6AVL/+gFT//oBVP/6AVX/+gG6/+4Bu//uAb7/7gHBAAcBxQANAcz/7gHU/+gB1f/oAdb/6AHX/+gB4f/VAeP/8wHl//EB5v/uAef/7gHs/+0B7f/0Ae7/7QHv//QB8v/uAfT/7gIHAAgAGAAdAGQAKQAbACwAQQBCAHIAQwDBAEUA6AB2ACkAfABAAIQAKgCQACUApwBCAOIAIQDpAB0A6gBVAOsATADtAFsA7gATAPAAQgD1AFYBIgAHAdsADQHhAE8B4wA5AeUAOQANAOIAIQDpAB0A6gBVAOsATADtAFsA7gATAPAAQgD1AFYBIgAHAdsAAQHhADIB4wAfAeUAHwAhACcAKgBAADQAQgDRAEMApwBFAGgAjQAOAOIAIQDmABkA5wAZAOj//gDpAB0A6gBVAOsATADsABkA7QBbAO4AEwDvABkA8ABCAPEAGQDyABkA8wAZAPQAGQD1AFYBIgAHAb8AHgHbAG0B3QBqAd8AagHhAEMB4wBqAeUAagHwADIB8QAyABMAKQATACwAEQBCAKkARQC4AOIAIQDpAB0A6gBVAOsATADtAFsA7gATAPAAQgD1AFYBIgAHAdsAXAHdAEgB3wBIAeEAbAHjAF4B5QBdAAsA4gAhAOkAHQDqAFUA6wBMAO0AWwDuABMA8ABCAPUAVgEiAAcB2//nAeH/+QALAEIAOgBDABAA4gAhAOkAHQDqAFUA6wBMAO0AWwDuABMA8ABCAPUAVgEiAAcADwDiACEA6QAdAOoAVQDrAEwA7QBbAO4AEwDwAEIA9QBWASIABwHbAC0B3QAdAd8AHQHhAC0B4wAgAeUAIAAOAOIAIQDpAB0A6gBVAOsATADtAFsA7gATAPAAQgD1AFYBIgAHAbsAEgG9ABEB2//nAeYAEgHnABIAEABIAIsA4gAhAOkAHQDqAFUA6wBMAO0AWwDuABMA8ABCAPUAVgEiAAcB2wA2Ad0AIAHfACAB4QBaAeMASAHlAEgACgDiACYA6QAiAOoAWQDrAFEA7QBgAO4AGADwAEcA9QBaAQH/+gEiAAwADgDiACYA6QAiAOoAWQDrAFEA7QBgAO4AGADwAEcA9QBaAQH/+gEiAAwB2wAUAeEAVQHjAEAB5QBAABwA4gAmAOYAIADnACAA6AAgAOkAIgDqAFkA6wBRAOwAIADtAGAA7gAYAO8AIADwAEcA8QAgAPIAIADzACAA9AAgAPUAWgEB//oBIgAMAb8AJQHbAHQB3QBxAd8AcQHhAEoB4wBxAeUAcQHwADgB8QA4ACsAH//oACH/6AA6//oAVv/nAG3/ywBu/8sAwP/gAM3/5wDR/84A1P/vAOIALADpAEcA6gAqAOsAZwDtAIgA7gAuAPAAOgD1ACsBAf/fARD/2gEV/+IBGQAJARoACQEiADQBKAALATz/7AFM/8IBTv/jAWsAGQFsABkBbQALAW4AGgFvAAkBpgAkAacAJQGoAB8BqQAeAasAHwG0ABYBuwAmAb0AJQHmACYB5wAmACIAH//XACH/1wA6/+kAVv/pAIL/1wCD/9cAhP/XAIX/1wCG/9cAh//XAIj/1wCW/+IAl//bAJj/2wCZ/9sAmv/bAJv/2wCd/+YAnv/mAJ//5gCg/+YAof/mAKL/5gCj/+YApP/mAQH/6gHF/7sB3f/cAd//3AHp/5EB6/+RAfD/3wHx/98CB//BAAoAH//XACH/1wA6/+kAVv/pAPIAIQEB/+oBuwAMAdv/5AHmAAwB5wAMAAUAH//XACH/1wA6/+kAVv/pAQH/6gAcAB//1wAh/9cAOv/pAFb/6QCC/28Ag/9vAIT/bwCF/28Ahv9vAIf/bwCI/28Alv+OAQH/6gFC/7EBSf+xAUr/sQFL/7EBTP+xAU3/sQFO/7EBT/+xAVD/sQHF/4UB6P+QAen/lAHq/5AB6/+UAgf/hQAJAOIAIQDpAB0A6gBVAOsATADtAFsA7gATAPAAQgD1AFYBIgAHAAoA4gAhAOkAHQDqAFUA6wBMAO0AWwDuABMA8ABCAPIAHwD1AFYBIgAHAA4AOv/3AFb/+wCd/7wAnv+8AJ//vACg/7wAof+8AKL/vACj/7wApP+8AOoALQDwABcA9QAuAQH//AAGADr/9wBW//sA6gAtAPAAFwD1AC4BAf/8AAwAH//2ACH/9gDiADEA6QAtAOoAZADrAFwA7QBqAO4AIwDwAFEA9QBlAQH/8wEiABYAKQBW//cAlv/hAJz/tgDJ/+QA2P/yAOIAKADqAF4A6wA4AO4ACQDwAEcA9QBfAQH/7gFI//cBaAAJAZD/+wGR/+8Bkv/7AZP/8QGV//sBsAAKAbEACQGyAAcBwQAPAcT/8gHFABIByP+kAcn/zQHM/9IB2P+iAdn/ugHb/8cB3f/hAd//3wHh/74B4//UAeX/zwH6//EB///yAgMADgIHAAUCHf/xABUAlv/HAJz/pgFC/+wBSP/bAcX/8gHI/60Byf+7Acv/8AHM/84B2P+1Adn/0wHb/7oB3f/PAd//ygHh/7gB4//LAeX/yAH6//AB///VAgMABQIH/+wAIQAE/9kABf/ZAAb/2QAH/9kACP/ZAAn/2QAK/9kAC//ZAAz/2QAN/9kADv/ZAA//2QAQ/9kAEf/bABL/2wAT/9sAOv/3AFb/+wCc/9cApf/nAKb/5wCn/+cAqP/nAKn/5wDqAC0A8AAXAPUALgEB//wBuv/wAbv/5AG+//AB5v/kAef/5AAJAB//9wAh//cAVv/2AOIAHQDqAFYA6wAzAPAAQAD1AFcBAf/uAAcA4gAzAOoAbgDrAFQA7gAmAPAAWgD1AG8BXwAJABEAlv/LAJz/7QHB/8wBxf/QAcj/xwHJ/78BzP/pAdj/4gHb/8QB3f/YAd//1QHh/8kB4//cAeX/2AH//9gCA//PAgf/0ACmAAT/hQAF/4UABv+FAAf/hQAI/4UACf+FAAr/hQAL/4UADP+FAA3/hQAO/4UAD/+FABD/hQAf/9sAIf/bAFb/0wCs/5AArf+QAK7/qgCv/+AAsP/hALH/4QCy/9kAs/+QALT/5AC1/6AAtv+QALf/kAC4/84Auf+QALr/kAC7/5AAvv+GAL//hgDA/9kAwf+GAML/2gDD/4YAxP+MAMX/jADG/4wAx/+MAMj/jADK/4YAy/+GAMz/qQDN/+AAzv+GAM//4QDQ/+EA0f/YANL/hgDT/4YA1P/kANX/oADW/4YA1//NANr/kgDb/74A3P/tAN3/7gDe/5IA3/+SAOD/tADiAD8A5/+gAOj/3wDpADsA6gByAOsAagDtAHkA7gAxAPAAYADz/6AA9P/gAPUAcwD4/6oBAf/OAQL/qgED/6oBBP+qAQb/yQEH/6oBCP+qAQn/qgEK/6oBC/+4AQz/qgEN/4YBDv+GAQ//nQEQ/9MBEf/UARL/1AET/8wBFP+GARX/2gEW/5UBF/+TARj/hgEZ/4YBGv+GARv/wQEc/4YBHf+qAR//jAEg/6oBIf+qASIAJAEj/6oBJP+qASX/7AEm/5UBJ/+VASj//AEp/5UBKgABASv/lQEs/5UBLf/qATX/qgE2/6oBN/+qATj/2wE5/9YBOv/UATv/qgE8/+MBPf+qAT7/qgE//6oBQP+qAUH/yQFC/6cBQ/+pAUT/qQFF/6kBRv+pAUf/qQFI/6IBSf+pAUr/qQFL/9QBTP/MAU3/qQFO/9oBT/+pAVD/wQFR/6QBUv+kAVP//gFU/6QBVf+kAWsACgFsAAoBbgALAbQABwG9/74B1P+qAdX/qgHW/6oB1/+qAez/qQHu/6kB8v+9AfT/vQBJAB//2wAh/9sAVv/TAK7/qwCv/+AAsP/gALH/4ACy/9oAtP/kALX/oQC4/88AwP/ZAML/2wDM/6oAzf/gAM//4ADQ/+AA0f/ZANT/5ADV/6AA1//OANv/vwDc/+0A3f/uAOD/tQDiAD8A5/+gAOj/3wDpADsA6gByAOsAagDtAHkA7gAxAPAAYADyAAkA8/+gAPT/4AD1AHMBAf/OAQb/ygEL/7kBD/+dARD/0wER/9UBEv/VARP/zAEV/9sBFv+VARf/kwEb/8IBIgAlASX/7AEo//wBKv/9AS3/6gE4/9wBOf/WATr/1QE8/+QBQf/KAUv/1QFM/8wBTv/bAVD/wgFT//4BawAKAWwACgFuAAsBtAAHAbv/2wG9/9oB5v/bAef/2wBEAB//2wAh/9sAVv/TAK7/qwCv/+AAsP/gALH/4ACy/9oAtP/kALX/oQC4/88AwP/ZAML/2wDM/6oAzf/gAM//4ADQ/+AA0f/ZANT/5ADV/6AA1//OANv/vwDc/+0A3f/uAOD/tQDiAD8A5/+gAOj/3wDpADsA6gByAOsAagDtAHkA7gAxAPAAYADz/6AA9P/gAPUAcwEB/84BBv/KAQv/uQEP/50BEP/TARH/1QES/9UBE//MARX/2wEW/5UBF/+TARv/wgEiACUBJf/sASj//AEq//0BLf/qATj/3AE5/9YBOv/VATz/5AFB/8oBS//VAUz/zAFO/9sBUP/CAVP//gFrAAoBbAAKAW4ACwG0AAcACgBFACYA4gAnAOkAIgDqAFoA6wBSAO0AYADuABkA8ABHAPUAWwEiAAwACgBCAA8A4gAnAOkAIgDqAFoA6wBSAO0AYADuABkA8ABHAPUAWwEiAAwACQDiACcA6QAiAOoAWgDrAFIA7QBgAO4AGQDwAEcA9QBbASIADABMAB//1wAh/9cAMP/WAFb/zQCB/90AlgAEAK//4ACy/80AtP/oAMD/2QDJ/7gAzf/gAM//tgDQ/7YA0f/NANT/6ADY/6kA2/+8ANz/9QDd/8oA4gAwAOf/yADo/9EA6QBAAOoATwDrAGYA7QCBAO4AKwDwAEcA8//IAPT/0QD1AFABAf/JARD/0wET/8ABFf/bASIALQEl/98BKAAEASr/2gEt/9QBOP/dATz/5QFC/9cBSP/TAU7/6gFTAAYBawASAWwAEgFu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AekAkQHqAHcB6wCRAe0AQAHvAEAB8ADfAfEA3wH6AHYB/QBnAf4AZwIHAMAADwDiACkA6QAmAOoAXgDrAFYA7QBkAO4AGwDwAEwA8gAdAPUAXwEiABABuwAOAb0ADgHb//kB5gAOAecADgBJALAAEgCxABIAvAAkAL0AJADPABIA0AASANkAHwDhACQA4gB2AOMAJADkACQA5QAkAOYAMQDnADEA6AANAOkAbQDqAF4A6wBWAOwAMQDtAJYA7gAbAO8AMQDwAJkA8QAxAPIAMQDzADEA9AAxAPUAXwD2ACQA9wAkAPkAJAD6ACQA+wAkAPwAJAD9ACQA/gAkAP8AJAEAACQBAQAkAR4AJAEiABABKAAgAS0AJAEuACcBLwAnATAAJwExACcBMgAnATMAJwE0ACcBUwAiAXAAHwFxAB8BcgAfAXMAHwF0AB8BdQAfAXYAHwG/ACwBwQA+AcUASQHbAAEB3QArAd8AKwHoABgB6QAZAeoAGAHrABkB8AAyAfEAMgH9AAkB/gAJAgcARgAJAOIAKQDpACYA6gBeAOsAVgDtAGQA7gAbAPAATAD1AF8BIgAQAA8Alv+1AJz/0AFC/94BSP/YAcH/3QHF/+AByP/KAcn/vQHY/9cB2//GAd3/2gHf/9kB///cAgP/6wIH/94AEgAhAAEA6wBJAO0AcAEiABwBXAABAV8ACwFl//8BawABAWwAAQFtAAYBbgABAW///wGqAAgB2//RAd3/8AHf//AB8P/zAfH/8wAKACEAAQEiAA4BXAABAV8ACwFl//8BbQAGAW///wGqAAgB3f/iAd//4gAMACEAAQDqAFsA6wAwAVwAAQFfAAsBZf//AW0ABgFv//8BqgAIAcH/7gHF//ECB//2AAoAIQABAVwAAQFfAAsBZf//AW0ABgFv//8BqgAIAcH/7gHF//ECB//2AAwAIQABAOoAMgDrAEMA7QBBAVwAAQFfAAsBZf//AW0ABgFv//8BqgAIAcX/4QIH/+EADQAh//wA8gAdAPMAHQD0AB0A9QAdAQH/5wFoAAkBsAAJAbEACAGyAAgBuwABAeYAAQHnAAEAAgFfAAEBbf//AAMBXwABAW0AAQHb/9sADADiADcA6QAzAOoATgDrAGUA7QBqAO4AKQDwAE4A9QBPASIAGAHb/9EB3f/nAd//5QBQAAMAMQCyAEQAtABrALgACgC8AGwAvQBsAMAAXADRAEQA1ABrANkAHwDhAGwA4gCXAOMAbADkAGwA5QBsAOYAcADnAHAA6AABAOkAwgDqAI8A6wDdAOwAcADtAQQA7gCmAO8AcADwAKUA8QBwAPIAcADzAHAA9ABwAPUAkAD2AGwA9wBsAPkAbAD6AGwA+wBsAPwAbAD9AGwA/gBsAP8AbAEAAGwBAQBsAQYATgETADcBFQBeAR4AbAEiALABKACHAS0AbAEuABgBLwAYATAAGAExABgBMgAYATMAGAE0ABgBOgBBATwAaAFTAIkBcAAfAXEAHwFyAB8BcwAfAXQAHwF1AB8BdgAfAbkAMQG/AH4BwQAtAcUATQHbAGMB3QCEAd8AhAHoAB4B6QA5AeoAHgHrADkB8ACHAfEAhwIHAFEANQC8ACgAvQAoAOEAKADiAHEA4wAoAOQAKADlACgA5gAzAOcAMwDoADMA6QAzAOoAcADrAGUA7AAzAO0AagDuACkA7wAzAPAATgDxADMA8gAzAPMAMwD0ADMA9QBPAPYAKAD3ACgA+QAoAPoAKAD7ACgA/AAoAP0AKAD+ACgA/wAoAQAAKAEBACgBHgAoASIAGAEtACgBLgAMAS8ADAEwAAwBMQAMATIADAEzAAwBNAAMAb8ANgHBAA8BxQAoAdsAHQHdAD0B3wA9AfAAPwHxAD8CBwAwAFQAAwAgALAAVgC4AEAAvABfAL0AXwDPAFYA0QArANkAXwDhAF8A4gCxAOMAXwDkAF8A5QBfAOYATADnAEwA6ABMAOkAbgDqAO8A6wDEAOwATADtAIcA7gApAO8ATADwAE4A8QBMAPIATADzAEwA9ABMAPUATwD2AF8A9wBfAPkAXwD6AF8A+wBfAPwAXwD9AF8A/gBfAP8AXwEAAF8BAQBfAQsAKwERAEkBEwAeARsAMwEeAF8BIgAYAS0AXwEuAGMBLwBjATAAYwExAGMBMgBjATMAYwE0AGMBOQBTAToAJwFwAF8BcQBfAXIAXwFzAF8BdABfAXUAXwF2AF8BuQAgAbwAFgG9//8BvwBuAcEAfwHFAIAB2wAUAd0ASwHfAEcB6ABWAekAWwHqAFYB6wBbAe0ABwHvAAcB8ABwAfEAcAH6AE0B/QBEAf4ARAIHAIoAUgADABUAtAA9ALgALAC8AFcAvQBXANEAPgDUAD0A2QBIAOEAVwDiAKoA4wBXAOQAVwDlAFcA5gBkAOcAZADoAGQA6QCiAOoAxwDrAGUA7ABkAO0A1gDuACkA7wBkAPAATgDxAGQA8gBkAPMAZAD0AGQA9QBPAPYAVwD3AFcA+QBXAPoAVwD7AFcA/ABXAP0AVwD+AFcA/wBXAQAAVwEBAFcBCwAXAREAIQETADEBFQAwARsAHwEeAFcBIgAYAS0AVwEuAFIBLwBSATAAUgExAFIBMgBSATMAUgE0AFIBOQArAToAOwE8ADoBcABIAXEASAFyAEgBcwBIAXQASAF1AEgBdgBIAbkAFQG/AGEBwQBaAcUAcQHbADUB3QBqAd8AagHoAC4B6QA5AeoALgHrADkB8ABoAfEAaAH6ACwB/QAbAf4AGwIHAHIADADiADcA6QAzAOoAWADrAC4A7QABAO4AKQDwAE4A9QBPASIAGAHb/9YB3f/tAd//7ABBALwAHAC9ABwA2QARAOEAHADiAG4A4wAcAOQAHADlABwA5gAoAOcAKADoACgA6QBoAOoATgDrAGUA7AAoAO0AagDuACkA7wAoAPAATgDxACgA8gAoAPMAKAD0ACgA9QBPAPYAHAD3ABwA+QAcAPoAHAD7ABwA/AAcAP0AHAD+ABwA/wAcAQAAHAEBABwBHgAcASIAGAEoACUBLQAcAS4AHgEvAB4BMAAeATEAHgEyAB4BMwAeATQAHgFTACcBcAARAXEAEQFyABEBcwARAXQAEQF1ABEBdgARAb8AIwHBACwBxQBBAdsABAHdACwB3wAsAekACgHrAAoB8AArAfEAKwIHAD0ADgDiADcA6QAzAOoATgDrAGUA7QBqAO4AKQDwAE4A9QBPASIAGAG7AB4BvQAdAdv//AHmAB4B5wAeAEUAAwANAK4ABwC8AEwAvQBMANkAKgDhAEwA4gCVAOMATADkAEwA5QBMAOYAVwDnAFcA6ABXAOkAnwDqAE4A6wBlAOwAVwDtAGoA7gApAO8AVwDwAKkA8QBXAPIAVwDzAFcA9ABXAPUATwD2AEwA9wBMAPkATAD6AEwA+wBMAPwATAD9AEwA/gBMAP8ATAEAAEwBAQBMAR4ATAEiABgBLQBMAS4AOAEvADgBMAA4ATEAOAEyADgBMwA4ATQAOAFwACoBcQAqAXIAKgFzACoBdAAqAXUAKgF2ACoBuQANAb8AWgHBADgBxQBQAdsAQgHdAGEB3wBhAegAEQHpAB4B6gARAesAHgHwAGMB8QBjAfoADwIHAFYADQDiADcA6QAzAOoATgDrAGUA7QBqAO4AKQDwAE4A8gAdAPUATwEiABgBuwAJAeYACQHnAAkADwDiADcA6QAzAOoATgDrAGUA7QBqAO4AKQDwAE4A8gAdAPMAHQD0AB0A9QBPASIAGAG7AAkB5gAJAecACQAQAOIANwDpADMA6gBOAOsAZQDtAGoA7gApAPAATgDyAB0A9QBPASIAGAG7AAkB2//jAd3/9AHf//EB5gAJAecACQBGAAMALgC8AGkAvQBpANkAHADhAGkA4gCUAOMAaQDkAGkA5QBpAOYAbQDnAG0A6ABtAOkAvwDqAE4A6wBlAOwAbQDtAGoA7gApAO8AbQDwAE4A8QBtAPIAbQDzAG0A9ABtAPUATwD2AGkA9wBpAPkAaQD6AGkA+wBpAPwAaQD9AGkA/gBpAP8AaQEAAGkBAQBpAR4AaQEiABgBLQBpAS4AFQEvABUBMAAVATEAFQEyABUBMwAVATQAFQFwABwBcQAcAXIAHAFzABwBdAAcAXUAHAF2ABwBuQAuAbsACQG/AHsBwQAqAcUASgHbAGAB3QCBAd8AgQHmAAkB5wAJAegAGwHpADYB6gAbAesANgHwAIQB8QCEAgcATgBLAAMAHQC8AFwAvQBcANkAXADhAFwA4gCuAOMAXADkAFwA5QBcAOYASQDnAEkA6ABJAOkAawDqAE4A6wBlAOwASQDtAGoA7gApAO8ASQDwAE4A8QBJAPIASQDzAEkA9ABJAPUATwD2AFwA9wBcAPkAXAD6AFwA+wBcAPwAXAD9AFwA/gBcAP8AXAEAAFwBAQBcAR4AXAEiABgBLQBcAS4AYAEvAGABMABgATEAYAEyAGABMwBgATQAYAFwAFwBcQBcAXIAXAFzAFwBdABcAXUAXAF2AFwBuQAdAbsACQG8ABMBvQAFAb8AawHBAHwBxQB9AdsAEQHdAEgB3wBEAeYACQHnAAkB6ABTAekAWAHqAFMB6wBYAfAAbQHxAG0B+gBKAf0AQQH+AEECBwCHAA4AIf/oAQH/2QEZAAUBGgAFAaYAIQGnACEBqAAbAakAGgGrABsBrgACAbsAIQG9ACAB5gAhAecAIQAKAOIAKgDpACcA6gBeAOsAVwDtAGUA7gAcAPAATQD1AF8BIgAR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Adv/0wHd//IB3//yAAUAIf/0AO4ABwGkAAcBpQAIAawABwAFACH/9AGkAAcBpQAIAawABwIH//gABAAh//QBpAAHAaUACAGsAAcADwCW/8UAnP/rAUL/4wFI/+oBwf/uAcX/7QHI/9MByf/EAdj/3wHb/80B3f/jAd//4gH//+MCA//tAgf/7QADACH//ADtAAoBAf/tAEwAAwAyACH//ACyAFAAvABxAL0AcQDAAGEAzQBoANkAQwDhAHEA4gBxAOMAcQDkAHEA5QBxAOYAfgDnAH4A6AAfAOkAfgDqAH4A6wB+AOwAfgDtAQkA7gB+AO8AfgDwAH4A8QB+APIAfgDzAH4A9AB+APUAfgD2AHEA9wBxAPkAcQD6AHEA+wBxAPwAcQD9AHEA/gBxAP8AcQEAAHEBAQA6AQYAUwEeAHEBKACMAS0AcQEuAE4BLwBOATAATgExAE4BMgBOATMATgE0AE4BUwCOAXAAQwFxAEMBcgBDAXMAQwF0AEMBdQBDAXYAQwG5ADIBvwCAAcEATQHFAGQB2wCOAd0AnAHfAJwB6AApAekAQwHqACkB6wBDAfAAkQHxAJEB+gAoAf0AEAH+ABACBwBpAAsAIf/8AO0ACgDyAB0BAf/tAbsANwG9ADYB2//jAd3/9wHf//cB5gA3AecANwALACH//ADtAAoA8gAdAQH/7QG7AJUBvQCUAdsAdAHdAGcB3wBnAeYAlQHnAJUABAAh//wA7QAKAPIAHQEB/+0ACQAh//wA7QAKAPIAHQEB/+0BuwAxAb0AMAHb//MB5gAxAecAMQAEACH//ADrADoA7QBgASIADAACACH//ADqAEsAAwAh//wA6gAiAO0AMgAEACH//AHb/+EB3f//Ad///wAIACH//AG7ADUBvQA1AdsACQHd//8B3///AeYANQHnADUAAQAh//wAHQAh//QAMP/nAJb/0wCc/7AAyf/KANj/3gEB/9UBSP/6AZH/2wGS/+wBk//hAZT/4gGV//IBwQARAcP/4QHE/9UBxQAXAcj/pwHJ/8QB2P/IAdv/uQHd/9QB3//UAfn/7AH6/+gB///NAgMADQIHAAwCHf/UAAIAIf/7AQH/5AApACH/5wAw/9MAlv/YAJwAJQDJ/9AA2P/WAQH/2QEZAAEBGgABAUIABgFIACEBkf/fAZL/+gGT/+QBlP/pAZX/+wGl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B8gHjAfIB4wHkgekB7wHpAeYB6QHmAeeB7wHpAeqB7AHvAe2B7wHzgfyB8IHyAfOB9QH2gfyB+AH8gfmB/IH7AfyCCIIFggiCAoIIggKCCIICggiB/gIIgf+CAQIFggiCAoIIggWCCIIEAgiCBYIIggcCCIIKAAACC4AAAhAAAAINAAACDoAAAhAAAAIRgAACF4AAAhMAAAIUgAACFgAAAheAAAIZAAACGoIdgiICHYIcAh2CHAIdgh8CIIIiAiOAAAIlAAACKYImgimCSQIpgkkCKYJJAimCQwJHgkMCKYJEgkeCJoIpgkkCKYJKgimCKAIpgk8CLgIrAi4CLIIuAi+CMQJAAqMCQAI4gjWCOIIygjiCMoI0AjWCOII3AjiCOgI9AkACPQJAAjuCQAI9AkACPoJAAk2CTAJNgkkCTYJJAk2CSQJBgkwCTYJDAkeCQwJNgkSCTYJGAkeCTAJNgkkCTYJKgk2CTAJNgk8CUIJSAlsCU4JbAlUCWwJVAlsCVoJbAlgCWwJZglsCXIJfgmQCX4JkAl+CXgJfgmECYoJkAm6CagJugmWCboJrgm6Ca4JugmcCboJogm6CagJugmuCboJtAm6CcAJxgnMCeQJ0gnkCdgJ5AneCeQJ6gnwCfwJ9gn8ChQKGgoUCgIKFAoaCggKGgoOChoKFAoaCiAKGgogCiYKLAoyC4gLdgpoCmIKaApECjgKPgpoCkQKSgpiClAKYgpoClYKXApiCmgKbgp0CnoKtgqeCrYKkgq2CpIKtgqSCrYKgAqMCoAKtgqGCowKngq2CpIKtgqeCrYKmAq2Cp4KqgqkCqoKsAq2CrwKwgrICs4K4ArOCtQKzgrUCtoK4ArmCuAK5grsCv4LFgr+CvIK/gryCvgLFgr+CwQLCgsWCxALFgscCzoLHAs6CxwLOgsiCzoLKAs6Cy4LOgs0CzoLagtYC2oLUgtqC1ILagtSC2oLQAtqC0YLTAtYC2oLUgtqC1gLagteC2oLZAtqC3ALiAt2C4gLjguIC3wLiAuCC4gLjgAAC5QAAAusAAALmgAAC6AAAAumAAALrAAAC7IAAAu4C8QL1gvEC74LxAu+C8QLygvQC9YMqAyuC+IL6AviC9wL4gvoC+4L9Av6DAAMBgwMDBIMGAweDCQMKgwwDDYMPAxCDEgMTgxUDLQMugxaDGAMZgxsDHIMeAx+DIQMigyQAAAMlgycDKIMqAyuDLQMugABAWYDVwABAWYDsQABAWb/FAABAWYCqAABAWYDXwABAWYDSQABAWYDdQABAWYAAAABAWYDbQABAkECqAABAkEDXwABAp8AAAABAkEDSQABAUYAAAABAUb/FAABAUYCqAABAX4DXwABAXn/YAABAX4CqAABAX4DVwABAXkAAAABAX4DiQABARsAAAABAP0DXwABARv/PgABARv/FAABAP0CqAABAUcAAAABASj/YAABASgDVwABASgDsQABASgDiQABASj/FAABASgCqAABASgDXwABASgDSQABASgAAAABASgDbQABAXsDXwABAXsDVwABAX3//AABAXsCqAABAXsDiQABAX3/8AABAXsDSQABAZQAAAABAZQCqAABAVwDVwABAVwAAAABAVwDiQABAVz/FAABAIECqAABAg8AAAABArACqAABAIEDVwABAIEDsQABAIEDiQABAIEDXwABAIEDSQABAIEAAAABAIEDbQABAaQCqAABAaQDXwABAQMAAAABAaQDVwABAIADXwABARb/PgABARYADAABARYAAAABAIACqAABARb/FAABAIADSQABAU0AAAABALcCqAABAV0DXwABAV3/PgABAV0ADAABAV0DiQABAV3/FAABAV0CqAABAV0AAAABAV0DbQABAVz/YAABAVwCqAABAYADVwABAYADsQABAYL/FAABAYADSQABAYACqAABAYADXwABAYIAAAABAYADbQABA7cAAAABAXwCtAABAUIAAAABATgDXwABAUIADAABAUL/FAABATgDSQABASEDXwABATX/YAABAT0AAAABASEDVwABATUADAABATX/FAABASkCqAABATgAAAABATgCqAABATcAAAABATcDXwABATf/YAABATf/PgABATcADAABATf/FAABATcCqAABAUQDVwABAUQDsQABAUT/FAABAUQDXwABAUQDSQABAUQCqAABAUQDdQABAUQAAAABAUQDbQABAfMCqAABAfMDVwABAfMDsQABAfMDXwABAUICqAABAUIDVwABAUIDsQABAUIDiQABAUIDXwABAUIDSQABAUIDbQABAR8DXwABARQAAAABAR8DiQABART/FAABAR8CqAABATAAAAABATAADAABAQ0B8QABAQ0CvgABAQ0AAAABAasB8QABAasCqAABAmcAAAABAasCkgABASAAAAABARQCqAABAST/YAABARYB8QABARQCoAABASYAAAABARQC0gABAT7/PgABAT4AAAABAT7/FAABASAB8QABAQ3/YAABAQ0CoAABAQ0C+gABAQ0C0gABAQ3/FAABAQ0CqAABAQ0CkgABAQ8B8QABAQ8AAAABAQ0CtgABAQYAAAABAQYB8QABAPkB8QABAPkCqAABAPkCoAABAPkCNgABAPkC0gABAQj/YAABAPkCkgABARcDVwABARcAAAABARcDiQABARf/FAABARcCqAABAHQB8QABAHQCoAABAHQC+gABAHQC0gABAHQCqAABAHQCkgABAHQAAAABAHQCtgABAWf/fgABAX8C0gABAHMC0gABAHMB8QABAHMCqAABAFv/fgABAHMCoAABAR0AAAABAR0ADAABAR0CqAABAHYDXwABAHb/PgABAHYADAABAHYAAAABAHYCqAABAHb/FAABAHYDSQABAK0AAAABAK0CqAABAcEAAAABAcQB8QABASICqAABAR//PgABAR8ADAABASIC0gABAR//FAABASIB8QABAR8AAAABASICtgABARf/YAABARcB8QABARoCoAABARoC+gABASD/FAABARoCqAABARoCkgABARwB8QABAR0B8QABASMAAAABARwCqAABASIAAAABARoCtgABAnsAAAABARQB8AABAHIAAAABAMACqAABAHIADAABAMAB8QABAHL/FAABAMACkgABAOkCqAABAP3/YAABAQAAAAABAOkCoAABAP0ADAABAP3/FAABAOwB8QABAMUAAAABAMX/YAABAMX/PgABAMUADAABAMX/FAABAH8CrAABARACoAABARAC+gABAS7/FAABARACqAABARAB8QABARACkgABARACvgABAS4AAAABARACtgABAZ4B8QABAZ4CoAABAZ4C+gABAZ4AAAABAZ4CqAABARkB8QABARkCoAABARkC+gABARkC0gABARkCqAABARkCkgABARkCtgABAOcCqAABAOIAAAABAOcC0gABAOL/FAABAOcB8QABAMICsgABAM0BUAABAM0CrAABAMABUAABAMACswABALoA4AABALoCswABAMcBUAABAMcDLAABAFQBUAABAFQDSQABAH4A9QABAI8DSQABANABUAABANADLAAB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AAEAQgABAEgAAQBOAAEAVAABAFoAAQBgAAEAYAABAGYAAQBsAAEAcgABAHgAAQB+AAAAhAAAAIoAAACQAAAAlgABAOAB8QABAGgB8QABAQYB8QABAKIB8QABAKAB8QABAOkB8QABAK8B8QABAGUB8QABANMB8QABAJ0B8QABAG4B8QABAGIAAAABAKoAAAABAFQAAAABAOcAAAAEAAoALAAKACwAAgAKABAAFgAcAAEAiAAAAAEAiAKoAAEBqQAAAAEBqQKoAAIACgAQABYAHAABAIkAAAABAIkCqAABAa4AAAABAa4CqAABAAAACgH0AxAAAkRGTFQADmxhdG4ANgAEAAAAAP//AA8AAAABAAIAAwAFAA8AEAARABIAEwAUABUAFgAXABgAOgAJQVpFIABeQ0FUIACEQ1JUIACqS0FaIADQTU9MIAD2TkxEIAEcUk9NIAFCVEFUIAFoVFJLIAGOAAD//wAPAAAAAQACAAQABQAPABAAEQASABMAFAAVABYAFwAYAAD//wAQAAAAAQACAAMABQAGAA8AEAARABIAEwAUABUAFgAXABgAAP//ABAAAAABAAIAAwAFAA0ADwAQABEAEgATABQAFQAWABcAGAAA//8AEAAAAAEAAgADAAUABwAPABAAEQASABMAFAAVABYAFwAYAAD//wAQAAAAAQACAAMABQAIAA8AEAARABIAEwAUABUAFgAXABgAAP//ABAAAAABAAIAAwAFAAwADwAQABEAEgATABQAFQAWABcAGAAA//8AEAAAAAEAAgADAAUADgAPABAAEQASABMAFAAVABYAFwAYAAD//wAQAAAAAQACAAMABQALAA8AEAARABIAEwAUABUAFgAXABgAAP//ABAAAAABAAIAAwAFAAkADwAQABEAEgATABQAFQAWABcAGAAA//8AEAAAAAEAAgADAAUACgAPABAAEQASABMAFAAVABYAFwAYABlhYWx0AJhjYWx0AJ5jYXNlAKRjY21wAKpjY21wAKpsaWdhALZsb2NsALxsb2NsALxsb2NsALxsb2NsALxsb2NsALxsb2NsAMJsb2NsAMJsb2NsAMhsb2NsAM5vcmRuANRwbnVtANpzaW5mAOBzczAxAOZzczAyAPBzczAzAPpzdWJzAQRzdXBzAQp0bnVtARB6ZXJvARYAAAABAAAAAAABAAsAAAAB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AAADegAAAAAAAAAAA3QAAAN0AAAAAAAAAAAAAAADAb8B8AHHAgsCNQH6AfEB2gHbAcUCHQG7AdQBugHIAbwBvQIkAiECIwHBAfkABAAUABYAHAAiADEAMgA5AD4ASQBMAE4AVwBYAGEAcQBzAHQAegCCAIkAlgCXAJwAnQClAd4ByQHfAisB2AKMAKwAvAC+AMQAygDZANoA4QDmAPIA9gD5AQIBAwENAR0BHwEgASYBLgE1AUIBQwFIAUkBUQHcAgEB3QIpAbkBwAIJAhECCgITAgIB/AKKAf0BdwHsAioB/gKUAgACJwGvAbACjQI0AfsBwwKVAa4BeAHtAcIADAAFAAgAEAAKAA8AEQAZACwAIwAnACkARQBAAEIAQwAhAF8AaQBiAGUAbwBnAh8AbQCQAIoAjQCOAJ4AcgEtALQArQCwALgAsgC3ALkAwQDUAMsAzwDRAO0A6ADqAOsAyQELARUBDgERARsBEwIgARkBPAE2ATkBOgFKAR4BTAANALUABgCuAA4AtgAXAL8AGgDCABsAwwAYAMAAHQDFAB8AxwAtANUAJADMACoA0gAuANYAJQDNADUA3QAzANsANwDfADYA3gA7AOMAOgDiAEgA8ABGAO4AQQDpAEcA7wBEAOcAPwDxAEsA9QBNAPcA+ABPAPoAUgD9AFAA+wBTAP4AVgEBAFkBBABcAQgAWgEGAQUAYAEMAGsBFwBjAQ8AagEWAHABHAB1ASEAdwEjAHYBIgB7AScAfgEqAH0BKQB8ASgAhQExAIQBMACDAS8AlQFBAJIBPgCLATcAlAFAAJEBPQCTAT8AmQFFAJ8BSwCgAKYBUgCoAVQApwFTAAcArwBkARAAjAE4ABMAuwA0ANwAbAEYABIAugBuARoAfwErAIcBMwAmAM4AowFPApECiwKSApYCkwKOAnQCdQJ4AnwCfQJ6AnMCcgJ7AnYCeQAVAL0AIADIAB4AxgA4AOAAPADkAD0A5QBUAP8AVQEAAFEA/ABdAQkAXgEKAFsBBwB4ASQAeQElAIABLACIATQAhgEyAJsBRwCYAUQAmgFGAKEBTQCpAVUACwCzAAkAsQArANMALwDXACgA0ABoARQAZgESAI8BOwCiAU4ApAFQAeoB6wHmAegB6QHnAgMCBQHEAhICEAJSAkwCTgJQAlQCVQJTAk0CTwJRAjECHgIbAjICJgIl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AGoAdQBsAGkAZQBuAGgAYQBoAG4ALgBkAGUATABhAHcAZgB1AGwAIAB1AHMAZQAgAG8AZgAgAHQAaABlACAAZgBvAG4AdABzACAAbwByACAAdABoAGUAIABkAGEAdABhACAAYwBvAG4AdABhAGkAbgBlAGQAIAB3AGkAdABoAGkAbgAgAHQAaABlACAAZgBvAG4AdAAgAGYAaQBsAGUAcwAgAGUAeABjAGwAdQBkAGUAcwAgAG0AbwBkAGkAZgB5AGkAbgBnACwAIAByAGUAYQBzAHMAZQBtAGIAbABpAG4AZwAsACAAcgBlAG4AYQBtAGkAbgBnACwAIABzAHQAbwByAGkAbgBnACAAbwBuACAAcAB1AGIAbABpAGMAbAB5ACAAYQB2AGEAaQBsAGEAYgBsAGUAIABzAGUAcgB2AGUAcgBzACwAIAByAGUAZABpAHMAdABpAGIAdQB0AHIAaQBuAGcAIABhAG4AZAAgAHMAZQBsAGwAaQBuAGcALgAgAEEAbgB5ACAAdQBuAGwAYQB3AGYAdQBsACAAdQBzAGUAIABvAGYAIAB0AGgAaQBzACAAdAB5AHAAbwBnAHIAYQBwAGgAaQBjACAAcwBvAGYAdAB3AGEAcgBlACAAdwBpAGwAbAAgAGIAZQAgAHAAcgBvAHMAZQBjAHUAdABlAGQALgAgAEYAbwByACAAYQBkAGQAaQB0AGkAbwBuAGEAbAAgAGkAbgBmAG8AcgBtAGEAdABpAG8AbgAgAHMAZQBlACAAYwBvAG4AdABhAGMAdAAgAGwAZQBnAGEAbABuAG8AdABpAGMAZQBzAEAAcwBlAHIAdgBpAGMAZQBuAG8AdwAuAGMAbwBtAGgAdAB0AHAAcwA6AC8ALwB3AHcAdwAuAHMAZQByAHYAaQBjAGUAbgBvAHcALgBjAG8AbQBTAGUAcgB2AGkAYwBlAE4AbwB3ACAAUwBhAG4AcwBEAGkAcwBwAGwAYQB5ACAAQgBvAGwAZABTAGUAcgB2AGkAYwBlAE4AbwB3ACAAUwBhAG4AcwAgAEQAaQBzAHAAbABhAHkAQgBvAGwAZABBAGwAdABlAHIAbgBhAHQAaQB2AGUAIABLAEgAdQBtAGEAbgBpAHMAdAAgAEEAcgByAG8AdwBzAFIAZQBnAGkAcwB0AGUAcgBlAGQAIABTAG0AYQBsAGwAAwAAAAAAAP8uAJoAAAAAAAAAAAAAAAAAAAAAAAAAAA==') format('opentype');
}
@font-face {
  font-family: 'Segoe UI';
  font-weight: 400;
  font-style: normal;
  src: url('data:font/ttf;base64,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EQc1JREzAn/+CLnBAUO9AkhwAlI3fWD9CAAAAAABAGgCSAKSBa4AFgAwQC0MAQECCwEDAQIBAAMDSgACAAEDAgFnAAMAAANVAAMDAF0AAAMATSUjJxAEDRgrASE1Nz4BNTQmIyIHNTYzMhYVFA8BFSECkv3W8Gg4TD52YlSXdorNpAGCAkhy7GZtNzpJZpVMhGyZw5wEAAAAAQCBAjMCjgWuACAASrEGZERAPxIBAwQRAQIDGQEBAgEBAAEAAQUABUoABAADAgQDZwACAAEAAgFnAAAFBQBXAAAABV8ABQAFTykjIiEjIgYKGiuxBgBEEzUWMzI2NTQrATUzMjU0IyIHNTYzMhYVFAcVFhUUBiMigWdyUFzbVFDFkF5cV35xhpGxqo6JAmiOTEtAjXaGd0WLM3dglzYEKqB1lAACAC8CSAKqBZoACgASAC9ALAYBAAQBSgADBAODAAEAAYQFAQQAAARVBQEEBABdAgEABABNFRESEREQBg0aKwEjFSM1ITUBMxEzAyMGBwMhETQCqm6E/ncBcZxu7gQMGtoBAAMUzMxcAir95wGbHyr+rgFDIAAAAAAAADACRgABAAAAAAAAADIAZgABAAAAAAABAAgAqwABAAAAAAACAAcAxAABAAAAAAADABAA7gABAAAAAAAEAAgBEQABAAAAAAAFACABXAABAAAAAAAGAAcBjQABAAAAAAAHAHsCjQABAAAAAAAIABUDNQABAAAAAAALACoDoQABAAAAAAANAUwGZgABAAAAAAAOACoICQADAAEEAwACAAwINAADAAEEBQACABAIQgADAAEEBgACAAwIVAADAAEEBwACABAIYgADAAEECAACABAIdAADAAEECQAAAGQAAAADAAEECQABABAAmQADAAEECQACAA4AtAADAAEECQADACAAzAADAAEECQAEABAA/wADAAEECQAFAEABGgADAAEECQAGAA4BfQADAAEECQAHAPYBlQADAAEECQAIACoDCQADAAEECQALAFQDSwADAAEECQANApgDzAADAAEECQAOAFQHswADAAEECgACAAwIhgADAAEECwACABAIlAADAAEEDAACAAwIpgADAAEEDgACAAwItAADAAEEEAACAA4IwgADAAEEEwACABII0gADAAEEFAACAAwI5gADAAEEFQACABAI9AADAAEEFgACAAwJBgADAAEEGQACAA4JFAADAAEEGwACABAJJAADAAEEHQACAAwJNgADAAEEHwACAAwJRAADAAEEJAACAA4JUgADAAEELQACAA4JYgADAAEICgACAAwJcgADAAEIFgACAAwJgAADAAEMCgACAAwJjgADAAEMDAACAAwJnACpACAAMgAwADAANgAgAE0AaQBjAHIAbwBzAG8AZgB0ACAAQwBvAHIAcABvAHIAYQB0AGkAbwBuAC4AIABBAGwAbAAgAFIAaQBnAGgAdABzACAAUgBlAHMAZQByAHYAZQBkAC4AAKkgMjAwNiBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCBSaWdodHMgUmVzZXJ2ZWQuAABTAGUAZwBvAGUAIABVAEkAAFNlZ29lIFVJAABSAGUAZwB1AGwAYQByAABSZWd1bGFyAABTAGUAZwBvAGUAIABVAEkAIABSAGUAZwB1AGwAYQByAABTZWdvZSBVSSBSZWd1bGFyAABTAGUAZwBvAGUAIABVAEkAAFNlZ29lIFVJAABWAGUAcgBzAGkAbwBuACAAMQAuADAAMAA7ACAAdAB0AGYAYQB1AHQAbwBoAGkAbgB0ACAAKAB2ADEALgA2ACkAAFZlcnNpb24gMS4wMDsgdHRmYXV0b2hpbnQgKHYxLjYpAABTAGUAZwBvAGUAVQBJAABTZWdvZVVJAABTAGUAZwBvAGUAIABpAHMAIABlAGkAdABoAGUAcgAgAGEAIAByAGUAZwBpAHMAdABlAHIAZQBkACAAdAByAGEAZABlAG0AYQByAGsAIABvAHIAIABhACAAdAByAGEAZABlAG0AYQByAGsAIABvAGYAIABNAGkAYwByAG8AcwBvAGYAdAAgAEMAbwByAHAAbwByAGEAdABpAG8AbgAgAGkAbgAgAHQAaABlACAAVQBuAGkAdABlAGQAIABTAHQAYQB0AGUAcwAgAGEAbgBkAC8AbwByACAAbwB0AGgAZQByACAAYwBvAHUAbgB0AHIAaQBlAHMALgAAU2Vnb2UgaXMgZWl0aGVyIGEgcmVnaXN0ZXJlZCB0cmFkZW1hcmsgb3IgYSB0cmFkZW1hcmsgb2YgTWljcm9zb2Z0IENvcnBvcmF0aW9uIGluIHRoZSBVbml0ZWQgU3RhdGVzIGFuZC9vciBvdGhlciBjb3VudHJpZXMuAABNAGkAYwByAG8AcwBvAGYAdAAgAEMAbwByAHAAbwByAGEAdABpAG8AbgAATWljcm9zb2Z0IENvcnBvcmF0aW9uAABoAHQAdABwADoALwAvAHcAdwB3AC4AbQBpAGMAcgBvAHMAbwBmAHQALgBjAG8AbQAvAHQAeQBwAG8AZwByAGEAcABoAHkALwBmAG8AbgB0AHMALwAAaHR0cDovL3d3dy5taWNyb3NvZnQuY29tL3R5cG9ncmFwaHkvZm9udHMvAABZAG8AdQAgAG0AYQB5ACAAdQBzAGUAIAB0AGgAaQBzACAAZgBvAG4AdAAgAGEAcwAgAHAAZQByAG0AaQB0AHQAZQBkACAAYgB5ACAAdABoAGUAIABFAFUATABBACAAZgBvAHIAIAB0AGgAZQAgAHAAcgBvAGQAdQBjAHQAIABpAG4AIAB3AGgAaQBjAGgAIAB0AGgAaQBzACAAZgBvAG4AdAAgAGkAcwAgAGkAbgBjAGwAdQBkAGUAZAAgAHQAbwAgAGQAaQBzAHAAbABhAHkAIABhAG4AZAAgAHAAcgBpAG4AdAAgAGMAbwBuAHQAZQBuAHQALgAgAFkAbwB1ACAAbQBhAHkAIABvAG4AbAB5ACAAKABpACkAIABlAG0AYgBlAGQAIAB0AGgAaQBzACAAZgBvAG4AdAAgAGkAbgAgAGMAbwBuAHQAZQBuAHQAIABhAHMAIABwAGUAcgBtAGkAdAB0AGUAZAAgAGIAeQAgAHQAaABlACAAZQBtAGIAZQBkAGQAaQBuAGcAIAByAGUAcwB0AHIAaQBjAHQAaQBvAG4AcwAgAGkAbgBjAGwAdQBkAGUAZAAgAGkAbgAgAHQAaABpAHMAIABmAG8AbgB0ADsAIABhAG4AZAAgACgAaQBpACkAIAB0AGUAbQBwAG8AcgBhAHIAaQBsAHkAIABkAG8AdwBuAGwAbwBhAGQAIAB0AGgAaQBzACAAZgBvAG4AdAAgAHQAbwAgAGEAIABwAHIAaQBuAHQAZQByACAAbwByACAAbwB0AGgAZQByACAAbwB1AHQAcAB1AHQAIABkAGUAdgBpAGMAZQAgAHQAbwAgAGgAZQBsAHAAIABwAHIAaQBuAHQAIABjAG8AbgB0AGUAbgB0AC4AAFlvdSBtYXkgdXNlIHRoaXMgZm9udCBhcyBwZXJtaXR0ZWQgYnkgdGhlIEVV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Da4Nrg2uDa4Nrg2uCF4DzA3ADcANwA3ADcANwAy0CXwAAgBT/80AVP++AAgAIv9aACv/ZgBE/5oARf+aAEb/mgBI/5oAUP+aAFL/mgATAAv/fwANAEQAHABEACT/5QAo/+UAKwBeADD/5QA1/20ANv/lADf/iwA4/7YAOv9kADsAOwBV/+UAV//VAFj/5QBa/9sAnf9kAL3/2wADADX/pAA6/74Anf++AA4AIAACACT/yQAo/8kAMP/lADL/yQBr/88Ah//JAJL/yQCT/8kAlP/JAJX/yQCW/8kAmP/JAK8AHQANAA3/fwAP/38AIv/fADX/pAA5/8sAO//PAID/3wCB/98Agv/fAIP/3wCE/98Ahf/fAIb/tgAMACIACgArAEQANQAEADgAHQA5AAgAgAAKAIEACgCCAAoAgwAKAIQACgCFAAoArwASABAADf9mAA//ZgAi/3sAK/++ADT/5QA1AA4AQv+0AEcACgCA/3sAgf97AIL/ewCD/3sAhP97AIX/ewCG/0wArwAnAAQANf/PADf/5QBa/+UAvf/lABMADf+aAA//mgAi/9sAK/++AEL/5QCA/9sAgf/bAIL/2wCD/9sAhP/bAIX/2wCG/5gAoP/lAKH/5QCi/+UAo//lAKT/5QCl/+UApv/lACcADQAnABwAJwAk/6YAKP+mACsAWgAw/6YAMv+mADkAJQA7ACcARP/lAEX/5QBG/+UASP/lAFD/5QBS/+UAVf/RAFf/tgBY/8sAWv+kAIf/mgCS/6YAk/+mAJT/pgCV/6YAlv+mAJj/pgCn/+UAqP/lAKn/5QCq/+UAq//lAK3/zwCvACcAsv/lALP/5QC0/+UAtf/lALb/5QC9/6QAHwAL/zEAIP+aACIAOwAk/74AKP++ACsAZAAw/7oAMv+6ADX/jwA2/+MAN/+LADj/zwA6/38AOwA7AFX/5QBX/5oAWP++AFr/tACH/74Akv+6AJP/ugCU/7oAlf+6AJb/ugCY/7oAmf/jAJr/4wCb/+MAnP/jAJ3/fwC9/7QADwAN/6QAD/+kACL/5QAr//YANf+kADn/2wA6/+cAO//PAID/5QCB/+UAgv/lAIP/5QCE/+UAhf/lAJ3/5wAmAA3+ugAP/roAIv9iACj/9gAr/38AOAAnADn/wwBC/74ARP+0AEX/tABG/7QASP+0AFD/tABS/7YAgP9iAIH/YgCC/2IAg/9iAIT/YgCF/2IAhv7pAKD/vgCh/74Aov++AKP/vgCk/74Apf++AKb/vgCn/7QAqP+0AKn/tACq/7QAq/+0ALL/tACz/7QAtP+0ALX/tAC2/7QADgAN/6QAD/9/ACL/5QA1/6QAOf/bADr/9gA7/88AgP/lAIH/5QCC/+UAg//lAIT/5QCF/+UAnf/2ACAAHABSACT/4wAo/+MAKwA5ADD/7AAy/+wANf/LADr/2QBE/8sARf/LAEb/xwBI/8cAUP/FAFL/ywCH/+UAkv/sAJP/7ACU/+wAlf/sAJb/7ACY/+wAnf/ZAKf/vgCo/74Aqf++AKr/vgCr/74Asv/FALP/xQC0/8UAtf/FALb/xQAFAFX/vgBX/88AWP/lAFr/0QC9/9EATQAN/38AD/9MABv/6QAc/+kAIv9mACT/pAAo/6QAK/+PADD/pAAy/6QANQAnADcAKwA4ACcAOf/6ADoAHQBC/ycARP8tAEX/LQBG/y0AR/+gAEj/LQBO/04AT/9OAFD/LQBR/04AUv8tAFP/TgBU/2YAVv9OAFf/mgBY/48AWf9MAFr/jwBb/38Aa/+aAHv/zwCA/2YAgf9mAIL/ZgCD/2YAhP9mAIX/ZgCG/wwAh/+kAJL/pACT/6QAlP+kAJX/pACW/6QAmP+kAJ0AHQCg/ycAof8nAKL/JwCj/z8ApP8nAKX/JwCm/ycAp/8bAKj/LQCp/y0Aqv8tAKv/LQCt/+kArgAxAK8AbwCx/04Asv8tALP/LQC0/y0Atf8tALb/LQC5/04Auv9OALv/TgC8/04Avf+PAAIAIv/XAIb/iwA/AA3/MwAP/xsAIv+LACT/1QAo/9UAK/+6ADD/9AAy/9UANP/lADUAJwBC/20ARP9/AEX/fwBG/38ASP9/AE7/tABP/7QAUP9/AFH/tABS/38AU/+0AFT/vgBW/7QAa//PAH//dQCA/4sAgf+LAIL/iwCD/4sAhP+LAIX/iwCG/0QAh//hAJL/9ACT//QAlP/0AJX/9ACW//QAmP/0AKD/bQCh/20Aov9tAKP/bQCk/20Apf9tAKb/bQCn/38AqP9/AKn/fwCq/38Aq/9/AK4AHQCvAFoAsf+0ALL/fwCz/38AtP9/ALX/fwC2/38Auf+0ALr/tAC7/7QAvP+0ACgADf+LAA//fwAi/7YANQAnAEL/tABE/88ARf/PAEb/zwBI/88AUP/PAFL/zwBr/88AewAnAH//pACA/7YAgf+2AIL/tgCD/7YAhP+2AIX/tgCG/5oAoP+0AKH/tACi/7QAo/+0AKT/tACl/7QApv+0AKf/zwCo/88Aqf/PAKr/zwCr/88ArgAxAK8AZACy/88As//PALT/zwC1/88Atv/PABEADQBEAA8AOQAcAFIAJP/pACj/6QArAGAAMP/pADL/6QA1ACEAh//pAJL/6QCT/+kAlP/pAJX/6QCW/+kAmP/pAK8AUgA/AA3/UAAP/z0AIv9iACT/0wAo/9MAK/++ADD/0wAy/9MANP/lADUAJwBC/zkARP9MAEX/TABG/0wAR//lAEj/TABO/3MAT/9zAFD/TABR/3MAUv9MAFP/cwBU/3sAVv9zAGv/zwB//xsAgP9iAIH/YgCC/2IAg/9iAIT/YgCF/2IAhv8/AIf/zQCS/9MAk//TAJT/0wCV/9MAlv/TAJj/0wCg/zkAof85AKL/OQCj/2YApP9/AKX/OQCm/zkAp/9MAKj/TACp/0wAqv9MAKv/TACvAFoAsf9zALL/TACz/0wAtP9MALX/TAC2/0wAuf9zALr/cwC7/3MAvP9zAAYAKwBSADUAJwBa/8sAewAnAK8ARgC9/8sAAQBLAOkACgBC/+UAR//2AFn/5wCg/+UAof/lAKL/5QCj/+UApP/lAKX/5QCm/+UABAArAEYANf+aADr/tACd/7QAAgAF/5gACv+YABUADf9/AA7/mgAP/38AGwBSABwAUgAgAEIAPgCNAEMAEgBJABIAVQAlAFcAJwBYACcAWQASAFoAIQBeAFIAewAnAKwALQCuABIArwB5AL0AIQC+ABIAAQBLAC8AAQBLACMAFgANAFIADv91AA8AUgAbAFIAHABSAET/1wBF/+UARv/XAEj/1wBQ/9cAUv/lAFX/8ACn/+UAqP/XAKn/1wCq/9cAq//XALL/1wCz/9cAtP/XALX/1wC2/9cADAAF/28ACv9vAEL/5QBH/9sAWf/nAKD/5QCh/+UAov/lAKP/5QCk/+UApf/lAKb/5QAKAEL/5QBH/9sAWf/nAKD/5QCh/+UAov/lAKP/5QCk/+UApf/lAKb/5QABAEsAZgAgAA3/YgAO/38AD/9WABsAUgAcAFIARP/lAEX/5QBG/+UARwAnAEj/5QBO//wAT//8AFD/5QBS/+UAVAAOAFUAOwBXAFIAWABSAFkAOwBaAFIAWwAnAKf/5QCo/+UAqf/lAKr/5QCr/+UAsv/lALP/5QC0/+UAtf/lALb/5QC9AFIAFAAO/48AIP/LAET/5QBF/+UARv/wAEj/8ABQ//AAUv/wAFkAHQB7ACcAp//lAKj/8ACp//AAqv/wAKv/8ACy//AAs//wALT/8AC1//AAtv/wAAIABf++AAr/vgAaAA3/iwAP/38AQv/bAET/9ABF//AARv/0AEj/9ABQ//QAUv/wAKD/2wCh/9sAov/bAKP/2wCk/9sApf/bAKb/2wCn//QAqP/0AKn/9ACq//QAq//0ALL/9ACz//QAtP/0ALX/9AC2//QAEgAN/6YAD/+aAET/+gBF//YARv/2AEj/+gBQ//oAUv/2AKf/+gCo//YAqf/2AKr/9gCr//YAsv/6ALP/+gC0//oAtf/6ALb/+gAQAET/8ABF//AARv/wAEj/8ABQ//AAUv/wAKf/8ACo//AAqf/wAKr/8ACr//AAsv/wALP/8AC0//AAtf/wALb/8AAXAAUAHQAKAB0ADf+aAA//gQAg/7QARP/2AEX/9gBG//YARwAEAEj/9gBQ//YAUv/2AFUABgCn//YAqP/2AKn/9gCq//YAq//2ALL/9gCz//YAtP/2ALX/9gC2//YAAQBLAMsAAQBLAKAABgArAFIANf/PADgAUgA7AFIAWgAMAL0ADAAFADX/zwA3/88AOP/PADr/mgCd/5oAAwA6/5oASwC8AJ3/mgAGACsAXgA1/20AN/+LADj/tgA6/2QAnf9kAAYAKwBeADX/bQA3/4sAOP+wADr/ZACd/2QAAQArAA4ABAAk/8kAKP/JADD/yQAy/8kAAQArAD0ABAAi/+UANf+kADn/2wA7/88AAwBC/+UAR//nAFn/5QACABYABQAFAAAACgALAAEAIgAoAAMAKwAtAAoAMAA8AA0AQwBEABoARgBIABwASwBMAB8ATwBTACEAVQBaACYAXABcACwAYQBhAC0AawBrAC4AewB7AC8AfwCLADAAkACQAD0AkgCWAD4AmACYAEMAnQCeAEQAsgC2AEYAuAC4AEsAvQC+AEwAAAABAAAAANPngVEAAAAAr/U8rwAAAADAyCbd') format('truetype');
}
@font-face {
  font-family: 'Segoe UI';
  font-weight: 700;
  font-style: normal;
  src: url('data:font/ttf;base64,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TAgIAAAIEAgPCwkABwAGIQYKFSszESEgERAAIQMRMzI2NTQmI6QB/AL8/l/+pbmg0u/t1gWa/UX+sf5wBJP8c/zZzesAAQCkAAAEAAWaAAsAKUAmAAMABAUDBGUAAgIBXQABAVRLAAUFAF0AAABVAEwRERERERAGChorKQERIREhESERIREhBAD8pAM7/ggB1f4rAhkFmv75/sH++v64AAABAKQAAAPhBZoACQAjQCAAAQACAwECZQAAAARdAAQEVEsAAwNVA0wREREREAUKGSsBIREhESERIREhA+H+BgHR/i/+vQM9BJP+oP76/dMFmgAAAAABAEr/5wU9BbIAGQA7QDgKAQIBCwEFAhUBAwQAAQADBEoABQAEAwUEZQACAgFfAAEBXEsAAwMAXwAAAF0ATBESJCMkIQYKGislBiEgABEQACEyFxEmIyICFRQWMzI3ESERIQU90v7I/qb+cQG0AWrkrqbwyf3jwXRE/uECYmB5AX8BUAFSAao//tFg/vva3fIhARgBAgAAAAEApAAABX0FmgALACFAHgAEAAEABAFlBQEDA1RLAgEAAFUATBEREREREAYKGispAREhESERIREhESEFff68/a7+vQFDAlIBRAJI/bgFmv3EAjwAAAEALAAAAl8FmgALAClAJgQBAAAFXQYBBQVUSwMBAQECXQACAlUCTAAAAAsACxERERERBwoZKwEVIxEzFSE1MxEjNQJfeHj9zXh4BZr6/Fr6+gOm+gAAAAABACH/5wL6BZoADAAjQCAGAQECBQEAAQJKAAICVEsAAQEAYAAAAF0ATBIjIgMKFysBEAAjIicRFjMyGQEhAvr+9f1xYFNn3QFCAjn+4P7OJwEvPwFIA1QAAQCkAAAFTAWaABAAH0AcEAoEAwACAUoDAQICVEsBAQAAVQBMFREVEAQKGCspAQEmJyMRIREhETM2NwEhAQVM/mj+XgwaBf69AUMFDBwBjAGB/gwCbxI9/UIFmv1aHDQCVv1UAAEApAAAA/oFmgAFABlAFgABAVRLAAICAF4AAABVAEwRERADChcrKQERIREhA/r8qgFDAhMFmvtsAAAAAAEApAAABwYFmgAbACFAHhYMBAMAAwFKBAEDA1RLAgECAABVAEwXERcXEAUKGSspARE0NyMGBwEhASYnIxYVESERIQEWFzM2NwEhBwb+wQwIGRT+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AAEECQALAFQDVwADAAEECQANApgD2AADAAEECQAOAFQHvwADAAEECgACAA4JEgADAAEECgAEACAJIgADAAEECwACABIJRAADAAEECwAEACQJWAADAAEEDAACAAgJfgADAAEEDAAEABoJiAADAAEEDgACABAJpAADAAEEDgAEACIJtgADAAEEEAACABIJ2gADAAEEEAAEACQJ7gADAAEEEwACAAYKFAADAAEEEwAEABgKHAADAAEEFAACAA4KNgADAAEEFAAEACAKRgADAAEEFQACABQKaAADAAEEFQAEACYKfgADAAEEFgACAA4KpgADAAEEFgAEACAKtgADAAEEGQACABQK2AADAAEEGQAEACYK7gADAAEEGwACAAoLFgADAAEEGwAEABwLIgADAAEEHQACAAYLQAADAAEEHQAEABgLSAADAAEEHwACAAoLYgADAAEEHwAEABwLbgADAAEEJAACAAwLjAADAAEEJAAEAB4LmgADAAEELQACAAoLugADAAEELQAEABwLxgADAAEICgACAA4L5AADAAEICgAEACAL9AADAAEIFgACAA4MFgADAAEIFgAEACAMJgADAAEMCgACAA4MSAADAAEMCgAEACAMWAADAAEMDAACAAgMegADAAEMDAAEABoMhACpACAAMgAwADAANgAgAE0AaQBjAHIAbwBzAG8AZgB0ACAAQwBvAHIAcABvAHIAYQB0AGkAbwBuAC4AIABBAGwAbAAgAFIAaQBnAGgAdABzACAAUgBlAHMAZQByAHYAZQBkAC4AAKkgMjAwNiBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCBSaWdodHMgUmVzZXJ2ZWQuAABTAGUAZwBvAGUAIABVAEkAAFNlZ29lIFVJAABCAG8AbABkAABCb2xkAABTAGUAZwBvAGUAIABVAEkAIABCAG8AbABkAABTZWdvZSBVSSBCb2xkAABTAGUAZwBvAGUAIABVAEkAIABCAG8AbABkAABTZWdvZSBVSSBCb2xkAABWAGUAcgBzAGkAbwBuACAAMQAuADAAMAA7ACAAdAB0AGYAYQB1AHQAbwBoAGkAbgB0ACAAKAB2ADEALgA2ACkAAFZlcnNpb24gMS4wMDsgdHRmYXV0b2hpbnQgKHYxLjYpAABTAGUAZwBvAGUAVQBJAC0AQgBvAGwAZAAAU2Vnb2VVSS1Cb2xkAABTAGUAZwBvAGUAIABpAHMAIABlAGkAdABoAGUAcgAgAGEAIAByAGUAZwBpAHMAdABlAHIAZQBkACAAdAByAGEAZABlAG0AYQByAGsAIABvAHIAIABhACAAdAByAGEAZABlAG0AYQByAGsAIABvAGYAIABNAGkAYwByAG8AcwBvAGYAdAAgAEMAbwByAHAAbwByAGEAdABpAG8AbgAgAGkAbgAgAHQAaABlACAAVQBuAGkAdABlAGQAIABTAHQAYQB0AGUAcwAgAGEAbgBkAC8AbwByACAAbwB0AGgAZQByACAAYwBvAHUAbgB0AHIAaQBlAHMALgAAU2Vnb2UgaXMgZWl0aGVyIGEgcmVnaXN0ZXJlZCB0cmFkZW1hcmsgb3IgYSB0cmFkZW1hcmsgb2YgTWljcm9zb2Z0IENvcnBvcmF0aW9uIGluIHRoZSBVbml0ZWQgU3RhdGVzIGFuZC9vciBvdGhlciBjb3VudHJpZXMuAABNAGkAYwByAG8AcwBvAGYAdAAgAEMAbwByAHAAbwByAGEAdABpAG8AbgAATWljcm9zb2Z0IENvcnBvcmF0aW9uAABoAHQAdABwADoALwAvAHcAdwB3AC4AbQBpAGMAcgBvAHMAbwBmAHQALgBjAG8AbQAvAHQAeQBwAG8AZwByAGEAcABoAHkALwBmAG8AbgB0AHMALwAAaHR0cDovL3d3dy5taWNyb3NvZnQuY29tL3R5cG9ncmFwaHkvZm9udHMvAABZAG8AdQAgAG0AYQB5ACAAdQBzAGUAIAB0AGgAaQBzACAAZgBvAG4AdAAgAGEAcwAgAHAAZQByAG0AaQB0AHQAZQBkACAAYgB5ACAAdABoAGUAIABFAFUATABBACAAZgBvAHIAIAB0AGgAZQAgAHAAcgBvAGQAdQBjAHQAIABpAG4AIAB3AGgAaQBjAGgAIAB0AGgAaQBzACAAZgBvAG4AdAAgAGkAcwAgAGkAbgBjAGwAdQBkAGUAZAAgAHQAbwAgAGQAaQBzAHAAbABhAHkAIABhAG4AZAAgAHAAcgBpAG4AdAAgAGMAbwBuAHQAZQBuAHQALgAgAFkAbwB1ACAAbQBhAHkAIABvAG4AbAB5ACAAKABpACkAIABlAG0AYgBlAGQAIAB0AGgAaQBzACAAZgBvAG4AdAAgAGkAbgAgAGMAbwBuAHQAZQBuAHQAIABhAHMAIABwAGUAcgBtAGkAdAB0AGUAZAAgAGIAeQAgAHQAaABlACAAZQBtAGIAZQBkAGQAaQBuAGcAIAByAGUAcwB0AHIAaQBjAHQAaQBvAG4AcwAgAGkAbgBjAGwAdQBkAGUAZAAgAGkAbgAgAHQAaABpAHMAIABmAG8AbgB0ADsAIABhAG4AZAAgACgAaQBpACkAIAB0AGUAbQBwAG8AcgBhAHIAaQBsAHkAIABkAG8AdwBuAGwAbwBhAGQAIAB0AGgAaQBzACAAZgBvAG4AdAAgAHQAbwAgAGEAIABwAHIAaQBuAHQAZQByACAAbwByACAAbwB0AGgAZQByACAAbwB1AHQAcAB1AHQAIABkAGUAdgBpAGMAZQAgAHQAbwAgAGgAZQBsAHAAIABwAHIAaQBuAHQAIABjAG8AbgB0AGUAbgB0AC4AAFlvdSBtYXkgdXNlIHRoaXMgZm9udCBhcyBwZXJtaXR0ZWQgYnkgdGhlIEVVTEEgZm9yIHRoZSBwcm9kdWN0IGluIHdoaWNoIHRoaXMgZm9udCBpcyBpbmNsdWRlZCB0byBkaXNwbGF5IGFuZCBwcmludCBjb250ZW50LiBZb3UgbWF5IG9ubHkgKGkpIGVtYmVkIHRoaXMgZm9udCBpbiBjb250ZW50IGFzIHBlcm1pdHRlZCBieSB0aGUgZW1iZWRkaW5nIHJlc3RyaWN0aW9ucyBpbmNsdWRlZCBpbiB0aGlzIGZvbnQ7IGFuZCAoaWkpIHRlbXBvcmFyaWx5IGRvd25sb2FkIHRoaXMgZm9udCB0byBhIHByaW50ZXIgb3Igb3RoZXIgb3V0cHV0IGRldmljZSB0byBoZWxwIHByaW50IGNvbnRlbnQuAABoAHQAdABwADoALwAvAHcAdwB3AC4AbQBpAGMAcgBvAHMAbwBmAHQALgBjAG8AbQAvAHQAeQBwAG8AZwByAGEAcABoAHkALwBmAG8AbgB0AHMALwAAaHR0cDovL3d3dy5taWNyb3NvZnQuY29tL3R5cG9ncmFwaHkvZm9udHMvAABOAGUAZwByAGUAdABhAAAAUwBlAGcAbwBlACAAVQBJACAATgBlAGcAcgBlAHQAYQAAAHQAdQENAG4A6QAAAFMAZQBnAG8AZQAgAFUASQAgAHQAdQENAG4A6QAAAGYAZQBkAAAAUwBlAGcAbwBlACAAVQBJACAAZgBlAGQAAABGAGUAdAB0AAAAUwBlAGcAbwBlACAAVQBJACAARgBlAHQAdAAAA4gDvQPEA78DvQOxAAAAUwBlAGcAbwBlACAAVQBJACADiAO9A8QDvwO9A7EAAABOAGUAZwByAGkAdABhAAAAUwBlAGcAbwBlACAAVQBJACAATgBlAGcAcgBpAHQAYQAAAEwAaQBoAGEAdgBvAGkAdAB1AAAAUwBlAGcAbwBlACAAVQBJACAATABpAGgAYQB2AG8AaQB0AHUAAABHAHIAYQBzAAAAUwBlAGcAbwBlACAAVQBJACAARwByAGEAcwAAAEYA6QBsAGsA9gB2AOkAcgAAAFMAZQBnAG8AZQAgAFUASQAgAEYA6QBsAGsA9gB2AOkAcgAAAEcAcgBhAHMAcwBlAHQAdABvAAAAUwBlAGcAbwBlACAAVQBJACAARwByAGEAcwBzAGUAdAB0AG8AAABWAGUAdAAAAFMAZQBnAG8AZQAgAFUASQAgAFYAZQB0AAAASABhAGwAdgBmAGUAdAAAAFMAZQBnAG8AZQAgAFUASQAgAEgAYQBsAHYAZgBlAHQAAABQAG8AZwByAHUAYgBpAG8AbgB5AAAAUwBlAGcAbwBlACAAVQBJACAAUABvAGcAcgB1AGIAaQBvAG4AeQAAAE4AZQBnAHIAaQB0AG8AAABTAGUAZwBvAGUAIABVAEkAIABOAGUAZwByAGkAdABvAAAEHwQ+BDsEQwQ2BDgEQAQ9BEsEOQAAAFMAZQBnAG8AZQAgAFUASQAgBB8EPgQ7BEMENgQ4BEAEPQRLBDkAAABUAHUBDQBuAOkAAABTAGUAZwBvAGUAIABVAEkAIABUAHUBDQBuAOkAAABGAGUAdAAAAFMAZQBnAG8AZQAgAFUASQAgAEYAZQB0AAAASwBhAGwBMQBuAAAAUwBlAGcAbwBlACAAVQBJACAASwBhAGwBMQBuAAAASwByAGUAcABrAG8AAABTAGUAZwBvAGUAIABVAEkAIABLAHIAZQBwAGsAbwAAAEwAbwBkAGkAYQAAAFMAZQBnAG8AZQAgAFUASQAgAEwAbwBkAGkAYQAAAE4AZQBnAHIAaQB0AGEAAABTAGUAZwBvAGUAIABVAEkAIABOAGUAZwByAGkAdABhAAAATgBlAGcAcgBpAHQAbwAA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/+wAtf/sALb/7AC9/7YAHwAL/zMAIP+uACIALQAk/80AKP/NACsAOQAw/80AMv/NADX/eQA2/9cAN/+LADj/uAA6/28AOwA7AFX/7ABX/6QAWP/DAFr/uACH/80Akv/NAJP/zQCU/80Alf/NAJb/zQCY/80Amf/XAJr/1wCb/9cAnP/XAJ3/mgC9/8UADwAN/5oAD/+wACL/4QAr/+wANf+uADn/zQA6/9cAO//XAID/4QCB/+EAgv/hAIP/4QCE/+EAhf/hAJ3/7gAmAA3+ogAP/s0AIv+HACgACgAr/3kAOAAjADn/0wBC/80ARP/DAEX/wwBG/8MASP/DAFD/wwBS/8MAgP+HAIH/hwCC/4cAg/+HAIT/hwCF/4cAhv7NAKD/zQCh/80Aov/NAKP/zQCk/80Apf/NAKb/zQCn/8MAqP/DAKn/wwCq/8MAq//DALL/wwCz/8MAtP/DALX/wwC2/8MADgAN/7AAD/+wACL/7AA1/64AOf/XADr/4QA7/9cAgP/sAIH/7ACC/+wAg//sAIT/7ACF/+wAnf/4ACAAHABSACT/7AAo/+wAKwAxADD/7AAy/+wANf/XADr/7ABE/80ARf/NAEb/zQBI/80AUP/NAFL/zQCH/+wAkv/sAJP/7ACU/+wAlf/sAJb/7ACY/+wAnf/hAKf/zQCo/80Aqf/NAKr/zQCr/80Asv/NALP/zQC0/80Atf/NALb/zQAFAFX/zQBX/9cAWP/sAFr/zQC9/9sATgAN/28AD/9GABv/7gAc/+4AIv9xACT/uAAo/7gAK/95ADD/tAAy/7QANQApADcAOwA4ACkAOf/8ADoAKQBC/1IARP9IAEX/SABG/0gAR/+uAEj/SABO/3MAT/9zAFD/SABR/30AUv9IAFP/ZgBU/2YAVv9zAFf/rgBY/6QAWf9xAFr/pABb/7AAa/+uAHv/1wCA/4UAgf+FAIL/hQCD/4UAhP+FAIX/hQCG/vYAh/+4AJL/uACT/7gAlP+4AJX/uACW/7gAmP+4AJ0AFwCg/1IAof9SAKL/UgCj/1IApP9SAKX/UgCm/1IAp/9IAKj/SACp/0gAqv9IAKv/SACsABAArf/uAK4ASACvAHsAsf9mALL/SACz/0gAtP9IALX/SAC2/0gAuf9zALr/cwC7/3MAvP9zAL3/qAADACL/0wAr/9sAhv9qAEIADf8zAA//MwAb/9cAHP/XACAAEAAi/5YAJP/XACj/1wAr/40AMP/8ADL/5wA0/+wANQApAEL/ZgBE/3sARf97AEb/ewBI/4UATv+4AE//wwBQ/3sAUf+4AFL/ewBT/7gAVP+yAFb/yQBr/9cAf/+PAID/lgCB/5YAgv+WAIP/lgCE/5YAhf+WAIb/MQCH/9cAkv/8AJP//ACU//wAlf/8AJb//ACY//wAoP9mAKH/ZgCi/2YAo/9mAKT/ZgCl/2YApv9mAKf/ewCo/3sAqf97AKr/ewCr/3sArgAdAK8AcQCx/8MAsv97ALP/ewC0/3sAtf97ALb/ewC5/8kAuv/JALv/yQC8/8kALAAN/4UAD/+FABv/7AAc/+wAIv+4ADUAHQBC/64ARP/JAEX/yQBG/8kASP/JAFD/yQBS/9cAa//XAHsAKQB//7gAgP+4AIH/uACC/7gAg/+4AIT/uACF/7gAhv9vAKD/rgCh/64Aov+uAKP/rgCk/64Apf+uAKb/rgCn/8kAqP/JAKn/yQCq/8kAq//JAKwAFwCt/+wArgAxAK8AcQCy/8kAs//JALT/yQC1/8kAtv/JABEADQA7AA8AOwAcADsAJP/hACj/4QArAEQAMP/hADL/4QA1ACkAh//hAJL/4QCT/+EAlP/hAJX/4QCW/+EAmP/hAK8AUgBBAA3/HQAP/x0AIv9mACT/zQAo/80AK/+NADD/zQAy/80ANP/sADUAKQBC/0gARP9IAEX/SABG/0gAR//hAEj/SABO/3sAT/97AFD/SABR/3cAUv9IAFP/ewBU/48AVv97AGv/1wB//0gAgP9mAIH/ZgCC/2YAg/9mAIT/ZgCF/2YAhv8MAIf/1wCS/80Ak//NAJT/zQCV/80Alv/NAJj/zQCg/0gAof9IAKL/SACj/2YApP9vAKX/SACm/0gAp/9IAKj/SACp/0gAqv9IAKv/SACsABAArf/XAK8AcQCx/3sAsv9IALP/SAC0/0gAtf9IALb/SAC5/3sAuv97ALv/ewC8/3sABgArADEANQApAFr/zQB7ACkArwBGAL3/1QABAEsAqgAKAEL/7ABH//YAWf/XAKD/7ACh/+wAov/sAKP/7ACk/+wApf/sAKb/7AAEACsARgA1/64AOv/DAJ3/xQACAAX/rgAK/3EAGAALACsADf+aAA7/rgAP/5oAGwBSABwAUgAgAD0APgBOAEMAHwBJABIATAAKAE0ACgBVACcAVwApAFgAKQBZABIAWgApAF4AOwB7ACkArAA9AK4AKQCvAJYAvQAbAL4ADgABAEsAEgABAEsAHQAXAA0AUgAO/48ADwBSABsAUgAcAFIARP/jAEX/7ABG/+MASP/jAFD/4wBS/+wAVf/0AFsAEACn/+wAqP/jAKn/4wCq/+MAq//jALL/4wCz/+MAtP/jALX/4wC2/+MAAgAF/64ACv+FAA0ABf+NAAr/XABC/+wAR//hAEv//ABZ/9cAoP/sAKH/7ACi/+wAo//sAKT/7ACl/+wApv/sAAoAQv/sAEf/4QBZ/9cAoP/sAKH/7ACi/+wAo//sAKT/7ACl/+wApv/sAAEASwBaACMADf9cAA7/mgAP/1wAGwBSABwAUgBE//gARf/4AEb/+ABHADMASP/4AEkABgBKAAgATgAGAE8ABgBQ//gAUv/sAFQADABVADsAVgAGAFcAUgBYAEYAWQA3AFoAUgBbACkAp//4AKj/+ACp//gAqv/4AKv/+ACy//gAs//4ALT/+AC1//gAtv/4AL0AQgAUAA7/pAAg/64ARP/4AEX/+ABG//gASP/4AFD/+ABS//gAWQAdAHsAKQCn/+wAqP/4AKn/+ACq//gAq//4ALL/+ACz//gAtP/4ALX/+AC2//gAAgAF/80ACv+uABoADf+FAA//hQBC/+EARP/yAEX/8gBG/+wASP/sAFD/7ABS/+wAoP/hAKH/4QCi/+EAo//hAKT/4QCl/+EApv/hAKf/8gCo/+wAqf/sAKr/7ACr/+wAsv/sALP/7AC0/+wAtf/sALb/7AASAA3/rgAP/64ARP/2AEX/9gBG//YASP/2AFD/9gBS//YAp//2AKj/9gCp//YAqv/2AKv/9gCy//YAs//2ALT/9gC1//YAtv/2ABAARP/dAEX/3QBG/90ASP/dAFD/3QBS/90Ap//sAKj/3QCp/90Aqv/dAKv/3QCy/90As//dALT/3QC1/90Atv/dABcABQAXAAoAKQAN/48AD/+PACAAAgBE/+wARf/sAEb/7ABHABAASP/sAFD/7ABS/+wAVQAEAKf/7ACo/+wAqf/sAKr/7ACr/+wAsv/sALP/7AC0/+wAtf/sALb/7AABAEsAoAABAEsAZAAGACsAUgA1/9cAOABSADsAUgBaAAoAvQAKAAUANf/XADf/1wA4/9cAOv+uAJ3/rgAEADr/rgBLAK4AWgAXAJ3/rgAGACsATgA1/3EAN/+PADj/vgA6/2YAnf+FAAYAKwBOADX/cQA3/48AOP+4ADr/ZgCd/4UAAQArABIABAAk/8MAKP/DADD/0wAy/9MAAQArADEADQAN/5oAD/+aACL/5QA1/7YAOf/VADv/2QCA/+UAgf/lAIL/5QCD/+UAhP/lAIX/5QCG/8cABAAi/+EANf+uADn/0wA7/9cABAAi/+EANf+uADn/zQA7/9cAPwAN/3UAD/9mACL/gwAk/90AKP/dACv/zQAw/90AMv/dADT/7AA1AB8AQv9iAET/cQBF/3EARv9xAEf/7ABI/3EATv+PAE//jwBQ/3EAUf+PAFL/cQBT/48AVP+YAFb/jwBr/9kAf/9MAID/gwCB/4MAgv+DAIP/gwCE/4MAhf+DAIb/aACH/9cAkv/dAJP/3QCU/90Alf/dAJb/3QCY/90AoP9iAKH/YgCi/2IAo/+HAKT/mgCl/2IApv9iAKf/cQCo/3EAqf9xAKr/cQCr/3EArwBIALH/jwCy/3EAs/9xALT/cQC1/3EAtv9xALn/jwC6/48Au/+PALz/jwAmAA3+/gAP/v4AIv+DACj/+AAr/5oAOAAfADn/zwBC/80ARP/FAEX/xQBG/8UASP/FAFD/xQBS/8cAgP+DAIH/gwCC/4MAg/+DAIT/gwCF/4MAhv8lAKD/zQCh/80Aov/NAKP/zQCk/80Apf/NAKb/zQCn/8UAqP/FAKn/xQCq/8UAq//FALL/xQCz/8UAtP/FALX/xQC2/8UAAQBX/+EAAwBC/+wAR//hAFn/1wADAEL/7ABH/+EAWf/hABcABQAXAAoAFwAN/64AD/+cACD/xQBE//gARf/4AEb/+ABHAAQASP/4AFD/+ABS//gAVQAEAKf/+ACo//gAqf/4AKr/+ACr//gAsv/4ALP/+AC0//gAtf/4ALb/+AAKAEL/7ABH//gAWf/uAKD/7ACh/+wAov/sAKP/7ACk/+wApf/sAKb/7AACABYABQAFAAAACgALAAEAIgAoAAMAKwAtAAoAMAA8AA0AQwBEABoARgBIABwASwBMAB8ATwBTACEAVQBaACYAXABcACwAYQBhAC0AawBrAC4AewB7AC8AfwCLADAAkACQAD0AkgCWAD4AmACYAEMAnQCfAEQAsgC2AEcAuAC4AEwAvQC+AE0AAAAAAAEAAAAA0+eBUQAAAACv9TyvAAAAAMDIJvA=') format('truetype');
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

@page { size: 7.5in 10in; margin: 0 0 0.4in 0; }

table, td, th, caption { font-family: inherit; }
body {
  font-family: 'Inter', Helvetica, Arial, sans-serif;
  color: #1a1a1a;
  font-size: 10pt;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.page {
  width: 7.5in;
  min-height: 10in;
  page-break-after: always;
  position: relative;
  overflow: hidden;
}

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
  font-family: 'ServiceNow Sans Display', 'Inter', sans-serif;
  font-size: 30pt;
  font-weight: 700;
  line-height: 1.15;
  margin-bottom: 0.1in;
}
.cover-event {
  color: var(--accent);
  font-family: 'ServiceNow Sans Display', 'Inter', sans-serif;
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
  font-family: 'ServiceNow Sans Display', 'Inter', sans-serif;
  font-size: 7.5pt;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  text-align: left;
  margin-bottom: 0.1in;
  border-bottom: 2px solid #032D42;
  break-after: avoid;
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
  color: #032D42;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 0.07in;
  border-bottom: 2px solid var(--accent);
  padding-bottom: 4px;
}
/* ── Meal Schedule ── */
.meal-table { width:100%; border-collapse:collapse; font-size:9pt; }
.meal-table th { background:#032D42; color:#fff; padding:6pt 8pt; text-align:center; font-weight:600; font-size:8.5pt; }
.meal-table th:first-child { text-align:left; }
.meal-table td { border:1px solid #d1d5db; padding:6pt 8pt; vertical-align:top; }
.meal-table td:first-child { width:22%; font-size:8.5pt; }
.meal-table td.meal-cell { text-align:center; font-size:8.5pt; color:#374151; }
.meal-venue { font-weight:700; color:#111; margin-bottom:2pt; }
.meal-location { font-size:7.5pt; color:#6b7280; }
.meal-table tr:nth-child(even) td { background:#f9fafb; }

.wag-table, td, th, caption { font-family: inherit; }
body {
  font-family: 'Inter', Helvetica, Arial, sans-serif;
  font-size: 7.5pt;
  line-height: 1.4;
  color: #1a1a1a;
}
.wag-body * { font-size: 7.5pt !important; font-family: 'Inter', Helvetica, Arial, sans-serif !important; }
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
      const items = (section.gym_data && section.gym_data[execName])
        ? section.gym_data[execName]
        : section.items;
      if (!items || items.length === 0) return "";
      // col_1 = hotel name (resolver key, not displayed)
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
