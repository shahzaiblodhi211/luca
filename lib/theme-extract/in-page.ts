/**
 * Browser-side collectors for page.evaluate().
 *
 * Implemented via `new Function` so Playwright's serialization does not pick up
 * bundler helpers (e.g. `__name`) that do not exist in the page context.
 */

export type InPageRawPass = {
  cssVariables: Array<{
    name: string;
    rawValue: string;
    resolved: string;
    source: ":root" | "html";
  }>;
  elements: Array<{
    selector: string;
    tagName: string;
    backgroundColor: string;
    color: string;
    borderColor: string;
    boxShadow: string;
  }>;
};

export type InPageAssetsRaw = {
  faviconUrl: string | null;
  logoUrl: string | null;
  svgColors: string[];
  manifestHref: string | null;
  metaThemeColor: string | null;
};

/** Runs inside the page for one color-scheme pass. */
export const collectThemePassInPage = new Function(`
  var SELECTORS = ["html", "body", "main", "header", "footer", "nav", "h1", "p", "button", "a"];

  function looksLikeColorToken(value) {
    var v = String(value || "").trim();
    if (!v) return false;
    if (v.charAt(0) === "#") return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(v);
    if (/^(rgb|hsl)a?\\(/i.test(v)) return true;
    if (/^(oklch|oklab|lab|lch|color|hwb)\\(/i.test(v)) return true;
    // Common named colors only (avoid keywords like solid / ellipse)
    return /^(transparent|currentcolor|black|white|red|blue|green|gray|grey|silver|navy|teal|aqua|fuchsia|lime|maroon|olive|purple|yellow|orange|pink|cyan|magenta)$/i.test(v);
  }

  function isTransparent(value) {
    var v = String(value || "").trim().toLowerCase();
    if (!v || v === "transparent" || v === "none") return true;
    if (v === "rgba(0, 0, 0, 0)" || v === "rgba(0,0,0,0)") return true;
    var m = v.match(/^rgba?\\(\\s*([\\d.]+)[\\s,]+([\\d.]+)[\\s,]+([\\d.]+)(?:[\\s,/]+([\\d.]+%?))?\\s*\\)$/);
    if (m && m[4] !== undefined) {
      var a = String(m[4]).endsWith("%")
        ? Number(String(m[4]).slice(0, -1)) / 100
        : Number(m[4]);
      if (a === 0) return true;
    }
    return false;
  }

  function toRgbViaCanvas(cssColor) {
    try {
      var canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      var ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = cssColor;
      // If browser rejected the color, fillStyle stays as previous
      if (!ctx.fillStyle || ctx.fillStyle === "#000000" && !/black|#000|rgb\\(0/i.test(cssColor) && cssColor !== "black") {
        // still try reading — many modern formats work
      }
      ctx.fillRect(0, 0, 1, 1);
      var data = ctx.getImageData(0, 0, 1, 1).data;
      if (data[3] === 0) return null;
      return "rgb(" + data[0] + ", " + data[1] + ", " + data[2] + ")";
    } catch (e) {
      return null;
    }
  }

  function resolveColor(value) {
    var v = String(value || "").trim();
    if (!v || isTransparent(v)) return "";
    if (/^rgba?\\(/i.test(v) && !isTransparent(v)) return v;
    var viaCanvas = toRgbViaCanvas(v);
    if (viaCanvas) return viaCanvas;
    var probe = document.createElement("div");
    probe.style.color = v;
    document.documentElement.appendChild(probe);
    var resolved = getComputedStyle(probe).color;
    probe.remove();
    if (isTransparent(resolved)) return "";
    return resolved;
  }

  function opaqueBackground(el) {
    var cur = el;
    for (var depth = 0; cur && depth < 8; depth++) {
      var bg = getComputedStyle(cur).backgroundColor;
      if (!isTransparent(bg)) return bg;
      cur = cur.parentElement;
    }
    // Fallback: sample from html
    var htmlBg = getComputedStyle(document.documentElement).backgroundColor;
    if (!isTransparent(htmlBg)) return htmlBg;
    return "";
  }

  function readVarsFrom(el, source) {
    if (!el) return [];
    var style = getComputedStyle(el);
    var out = [];
    for (var i = 0; i < style.length; i++) {
      var name = style.item(i);
      if (!name || name.indexOf("--") !== 0) continue;
      var rawValue = style.getPropertyValue(name).trim();
      if (!rawValue) continue;
      // Skip non-color tokens (spacing, styles, fonts, etc.)
      if (!looksLikeColorToken(rawValue) && rawValue.indexOf("var(") !== 0) continue;
      // Skip obvious non-color var() chains without color keywords
      if (rawValue.indexOf("var(") === 0 && !/color|bg|background|fg|foreground|accent|brand|primary|secondary|border|text|fill|stroke|theme/i.test(name)) {
        continue;
      }
      var resolved = resolveColor(rawValue);
      if (!resolved || isTransparent(resolved)) continue;
      // Drop false positives: non-color raw that resolved to default black
      if (!looksLikeColorToken(rawValue) && rawValue.indexOf("var(") !== 0) continue;
      if (!looksLikeColorToken(rawValue) && resolved === "rgb(0, 0, 0)" && !/black|#000/i.test(rawValue)) continue;
      out.push({
        name: name,
        rawValue: rawValue,
        resolved: resolved,
        source: source
      });
    }
    return out;
  }

  var root = document.documentElement;
  var cssVariables = readVarsFrom(root, ":root").concat(
    readVarsFrom(document.querySelector("html"), "html")
  );

  var seen = {};
  var dedupedVars = [];
  for (var vi = 0; vi < cssVariables.length; vi++) {
    var v = cssVariables[vi];
    var key = v.source + ":" + v.name;
    if (seen[key]) continue;
    seen[key] = true;
    dedupedVars.push(v);
  }

  var elements = [];
  for (var si = 0; si < SELECTORS.length; si++) {
    var selector = SELECTORS[si];
    var el = document.querySelector(selector);
    if (!el) continue;
    var cs = getComputedStyle(el);
    var backgroundColor = selector === "body" || selector === "html" || selector === "main"
      ? opaqueBackground(el)
      : (isTransparent(cs.backgroundColor) ? "" : cs.backgroundColor);
    var color = resolveColor(cs.color);
    var borderRaw = cs.borderTopColor || cs.borderColor || cs.getPropertyValue("border-color");
    var borderColor = isTransparent(borderRaw) ? "" : resolveColor(borderRaw);
    // Ignore inherited currentColor borders that match text exactly with 0 width
    var bw = parseFloat(cs.borderTopWidth || "0");
    if (bw === 0) borderColor = "";
    var boxShadow = cs.boxShadow;
    elements.push({
      selector: selector,
      tagName: el.tagName.toLowerCase(),
      backgroundColor: backgroundColor || "",
      color: color || "",
      borderColor: borderColor || "",
      boxShadow: boxShadow === "none" ? "" : boxShadow
    });
  }

  return { cssVariables: dedupedVars, elements: elements };
`) as () => InPageRawPass;

/** Asset / head scan — runs once (scheme-independent). */
export const collectAssetsInPage = new Function(`
  function abs(href) {
    if (!href) return null;
    try { return new URL(href, document.baseURI).href; }
    catch (e) { return href; }
  }

  var iconLink = document.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]');
  var faviconUrl = abs(iconLink && iconLink.href) || abs("/favicon.ico");
  if (faviconUrl && faviconUrl.indexOf("data:,") === 0) faviconUrl = null;

  var logoEl = document.querySelector('header img[src], nav img[src], a[href="/"] img[src], img[alt*="logo" i], img[class*="logo" i]');
  var logoUrl = abs(logoEl && logoEl.getAttribute("src"));

  var svgColors = {};
  var svgs = document.querySelectorAll("svg");
  for (var s = 0; s < svgs.length; s++) {
    var svg = svgs[s];
    var nodes = svg.querySelectorAll("*");
    for (var n = 0; n < nodes.length; n++) {
      var node = nodes[n];
      ["fill", "stroke"].forEach(function (attr) {
        var val = node.getAttribute(attr);
        if (!val || val === "none" || val === "currentColor") return;
        var hex = val.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/);
        if (hex) svgColors[hex[0].toUpperCase()] = true;
      });
    }
    ["fill", "stroke"].forEach(function (attr) {
      var val = svg.getAttribute(attr);
      if (!val) return;
      var hex = val.match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/);
      if (hex) svgColors[hex[0].toUpperCase()] = true;
    });
  }

  var manifest = document.querySelector('link[rel="manifest"]');
  var metaTheme = document.querySelector('meta[name="theme-color"]');

  return {
    faviconUrl: faviconUrl,
    logoUrl: logoUrl,
    svgColors: Object.keys(svgColors),
    manifestHref: abs(manifest && manifest.href),
    metaThemeColor: (metaTheme && metaTheme.content && metaTheme.content.trim()) || null
  };
`) as () => InPageAssetsRaw;
