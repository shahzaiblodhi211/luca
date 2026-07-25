(function () {
  var SOURCE = "luca-inspector";
  var PARENT = "luca-parent";
  var mode = "off";
  var selected = null;
  var overlay = null;
  var hoverEl = null;

  function previewBase() {
    var b = typeof window.__LUCA_PREVIEW_BASE__ === "string"
      ? window.__LUCA_PREVIEW_BASE__
      : "";
    return b.replace(/\/+$/, "");
  }

  function installPreviewLinkFix() {
    var base = previewBase();
    if (!base) return;
    document.addEventListener(
      "click",
      function (e) {
        var t = e.target;
        if (!t || !t.closest) return;
        var el = t.closest("a[href]");
        if (!el) return;
        var href = el.getAttribute("href");
        if (
          !href ||
          href.charAt(0) === "#" ||
          /^https?:/i.test(href) ||
          /^mailto:/i.test(href)
        ) {
          return;
        }
        if (href.indexOf(base + "/") === 0 || href === base) return;
        if (href.charAt(0) === "/") {
          e.preventDefault();
          window.location.href = base + (href === "/" ? "" : href);
        }
      },
      true,
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installPreviewLinkFix);
  } else {
    installPreviewLinkFix();
  }

  function post(type, payload) {
    try {
      window.parent.postMessage(
        { source: SOURCE, type: type, payload: payload || {} },
        "*",
      );
    } catch (e) {}
  }

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "luca-inspect-overlay";
    overlay.style.cssText =
      "position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #10b981;box-shadow:0 0 0 1px rgba(16,185,129,0.35);border-radius:2px;transition:all 0.08s ease;display:none;";
    document.documentElement.appendChild(overlay);
    return overlay;
  }

  function rectFor(el) {
    var r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }

  function positionOverlay(el) {
    var o = ensureOverlay();
    if (!el) {
      o.style.display = "none";
      return;
    }
    var r = rectFor(el);
    o.style.display = "block";
    o.style.top = r.top + "px";
    o.style.left = r.left + "px";
    o.style.width = r.width + "px";
    o.style.height = r.height + "px";
  }

  function cssPath(el) {
    if (!el || el === document.body) return "body";
    var parts = [];
    var cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      var tag = cur.tagName.toLowerCase();
      var sib = cur.parentElement ? cur.parentElement.children : [];
      var idx = 1;
      for (var i = 0; i < sib.length; i++) {
        if (sib[i] === cur) break;
        if (sib[i].tagName === cur.tagName) idx++;
      }
      parts.unshift(tag + ":nth-of-type(" + idx + ")");
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function readPayload(el) {
    var cs = window.getComputedStyle(el);
    var text = (el.innerText || el.textContent || "").trim();
    if (text.length > 800) text = text.slice(0, 800);
    return {
      tagName: el.tagName.toLowerCase(),
      text: text,
      selector: cssPath(el),
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontStyle: cs.fontStyle,
      color: cs.color,
    };
  }

  function onMove(e) {
    if (mode !== "inspect") return;
    var t = e.target;
    if (!t || t === document.documentElement || t.id === "luca-inspect-overlay")
      return;
    if (t.closest && t.closest("#luca-inspect-overlay")) return;
    hoverEl = t;
    positionOverlay(t);
  }

  function onClick(e) {
    if (mode !== "inspect") return;
    e.preventDefault();
    e.stopPropagation();
    var t = e.target;
    if (!t || t.id === "luca-inspect-overlay") return;
    selected = t;
    positionOverlay(t);
    post("select", readPayload(t));
  }

  function setMode(next) {
    mode = next === "inspect" ? "inspect" : "off";
    if (mode === "off") {
      hoverEl = null;
      selected = null;
      positionOverlay(null);
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.body.style.cursor = "";
    } else {
      document.addEventListener("mousemove", onMove, true);
      document.addEventListener("click", onClick, true);
      document.body.style.cursor = "crosshair";
    }
  }

  function applyLive(p) {
    if (!selected) return;
    if (p.text != null) selected.textContent = p.text;
    if (p.fontSize) selected.style.fontSize = p.fontSize;
    if (p.fontWeight) selected.style.fontWeight = p.fontWeight;
    if (p.fontStyle) selected.style.fontStyle = p.fontStyle;
    if (p.color) selected.style.color = p.color;
    positionOverlay(selected);
    post("select", readPayload(selected));
  }

  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || d.source !== PARENT) return;
    if (d.type === "set-mode") setMode(d.mode);
    if (d.type === "apply-live") applyLive(d.payload || {});
    if (d.type === "clear-selection") {
      selected = null;
      positionOverlay(hoverEl);
    }
  });

  post("ready", {});
})();
