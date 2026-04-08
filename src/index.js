import puppeteer from "@cloudflare/puppeteer";
import { buildHTML, buildBriefingBookHTML, buildWordHTML } from "./template.js";

export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ status: "ok" });
    }

    // Handle OPTIONS preflight before auth check so CORS works from file:// and SN
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.headers.get("X-API-Key") !== env.API_KEY) {
      return json({ error: "Unauthorized" }, 401);
    }

    if (url.pathname === "/places" && request.method === "POST") {
      let data;
      try { data = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

      // Place details lookup by place_id
      if (data.place_id) {
        const res = await fetch(
          `https://places.googleapis.com/v1/places/${data.place_id}`,
          {
            headers: {
              "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
              "X-Goog-FieldMask": "displayName,formattedAddress",
            },
          }
        );
        const result = await res.json();
        return new Response(JSON.stringify({
          name: result.displayName?.text || "",
          address: result.formattedAddress || "",
        }), { headers: { "Content-Type": "application/json", ...corsHeaders() } });
      }

      // Autocomplete by query string
      if (data.query) {
        const res = await fetch(
          "https://places.googleapis.com/v1/places:autocomplete",
          {
            method: "POST",
            headers: {
              "X-Goog-Api-Key": env.GOOGLE_PLACES_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              input: data.query,
              includedPrimaryTypes: ["lodging"],
              languageCode: "en",
            }),
          }
        );
        const result = await res.json();
        const suggestions = (result.suggestions || []).map(s => ({
          label: s.placePrediction?.text?.text || "",
          place_id: s.placePrediction?.placeId || "",
        }));
        return new Response(JSON.stringify({ suggestions }), {
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }

      return json({ error: "query or place_id required" }, 400);
    }

    if (url.pathname === "/preview" && request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (url.pathname === "/preview" && request.method === "POST") {
      let data;
      try { data = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      const execName = data.exec_name;
      if (!execName) return json({ error: "exec_name is required" }, 400);
      const outputMode = url.searchParams.get("output");
      const html = outputMode === "word"
        ? buildWordHTML(execName, data.event || {}, data.sections || [], data.theme)
        : buildHTML(execName, data.event || {}, data.sections || [], data.textboxes, data.tables, data.theme);
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() } });
    }

    // ── POST /generate-briefing-book ─────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/generate-briefing-book") {
      let payload;
      try { payload = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
      const { exec_name, event, meetings, sections } = payload;
      if (!exec_name) return json({ error: "exec_name is required" }, 400);

      const html = buildBriefingBookHTML(exec_name, event || {}, meetings || [], sections || []);
      const browser = await puppeteer.launch(env.BROWSER);
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdfBuffer = await page.pdf({
        format: "Letter",
        printBackground: true,
        margin: { top: "0.5in", bottom: "0.5in", left: "0.6in", right: "0.6in" },
      });
      await browser.close();

      const filename = (exec_name || "Exec").replace(/\s+/g, "_") + "_Briefing_Book.pdf";
      const format = url.searchParams.get("format");

      if (format === "base64") {
        return new Response(
          JSON.stringify({ pdf: uint8ToBase64(new Uint8Array(pdfBuffer)), name: filename }),
          { headers: { "Content-Type": "application/json", ...corsHeaders() } }
        );
      }
      return new Response(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
          ...corsHeaders(),
        },
      });
    }

    if (request.method !== "POST" || url.pathname !== "/generate") {
      return json({ error: "POST /generate only" }, 404);
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const { exec_names, theme } = data;
    if (!exec_names || exec_names.length === 0) {
      return json({ error: "exec_names is required" }, 400);
    }

    const browser = await puppeteer.launch(env.BROWSER);
    const zipEntries = [];

    for (const execName of exec_names) {
      const html = buildHTML(execName, data.event || {}, data.sections || [], data.textboxes, data.tables, theme);
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const footerData = await page.evaluate(() => {
        function htmlEsc(s) {
          return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }
        return {
          execName: htmlEsc(document.body.dataset.execName || ""),
          footerConf: htmlEsc(document.body.dataset.footerConf || ""),
        };
      });

      // Build footer from footer section config if present and enabled
      const footerSec = (data.sections || []).find(s => s.type === "footer" && s.subhead !== "0" && s.subhead !== 0);
      let footerTemplate;
      if (footerSec) {
        let cfg = {};
        try { cfg = JSON.parse(footerSec.body_text || "{}"); } catch {}
        const eventName = (data.event && data.event.name) || "";
        function resolveZone(val, customText) {
          switch (val) {
            case "exec_name": return footerData.execName;
            case "event_name": return esc(eventName);
            case "page_number": return `<span class="pageNumber"></span>&nbsp;/&nbsp;<span class="totalPages"></span>`;
            case "confidential": return "Confidential";
            case "date": return new Date().toLocaleDateString("en-US", {month:"short",day:"numeric",year:"numeric"});
            case "custom": return esc(customText || "");
            default: return "";
          }
          function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
        }
        const left   = resolveZone(cfg.left,   cfg.left_text);
        const center = resolveZone(cfg.center, cfg.center_text);
        const right  = resolveZone(cfg.right,  cfg.right_text);
        const cellStyle = `font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;color:#111111;padding:0;`;
        footerTemplate = `<div style="width:100%;padding:0 0.5in;box-sizing:border-box;border-top:1px solid #111111;margin-top:4px;padding-top:3px;"><table style="width:100%;border-collapse:collapse;"><tr>
    <td style="${cellStyle}width:33%;text-align:left;">${left}</td>
    <td style="${cellStyle}width:34%;text-align:center;">${center}</td>
    <td style="${cellStyle}width:33%;text-align:right;">${right}</td>
  </tr></table></div>`;
      } else {
        footerTemplate = `<div style="width:100%;padding:0 0.5in;box-sizing:border-box;font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;color:#111111;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #111111;padding-top:3px;margin-top:4px;"><span>${footerData.execName}</span><span>${footerData.footerConf}</span></div>`;
      }
      const pdf = await page.pdf({
        preferCSSPageSize: true,
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate,
      });
      await page.close();
      const safe = execName.replace(/[^a-zA-Z0-9_-]/g, "_");
      zipEntries.push({ name: `${safe}_briefing.pdf`, data: pdf });
    }

    await browser.close();

    const zipBytes = buildZip(zipEntries);
    const wantsBase64 = url.searchParams.get("format") === "base64";

    if (wantsBase64) {
      const pdfs = zipEntries.map(e => ({
        name: e.name,
        data: uint8ToBase64(e.data),
      }));
      return new Response(JSON.stringify({ pdfs }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(zipBytes, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="exec_briefings.zip"',
      },
    });
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Safe base64 encoder that works on large Uint8Arrays without spread operator
function uint8ToBase64(bytes) {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildZip(entries) {
  const enc = new TextEncoder();
  const parts = [];
  const centralDir = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    parts.push(local, data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    centralDir.push(cd);

    offset += 30 + nameBytes.length + data.length;
  }

  const cdBytes = concat(centralDir);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdBytes.length, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  return concat([...parts, cdBytes, eocd]);
}

function concat(arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}

function crc32(data) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })());
  let c = 0xFFFFFFFF;
  for (const b of data) c = table[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
