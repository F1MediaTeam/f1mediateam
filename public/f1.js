/* F1 Media Team — first-party analytics */
(function () {
  "use strict";

  // Everything below runs on someone else's website. The entire file is wrapped
  // and every listener is individually guarded, because a thrown error here
  // surfaces in a client's console — or worse, stops their own scripts. The
  // rule throughout: if anything is unavailable or unexpected, do nothing.
  try {
    var script = document.currentScript;
    if (!script) return;
    var siteKey = script.getAttribute("data-site");
    if (!siteKey) return;

    // Beacons go to the origin that served this file, never a third party.
    var endpoint = new URL(script.src, location.href).origin + "/api/pulse/ingest";

    // Cheap client-side skip. The server does the real filtering — this only
    // avoids the obvious cost of headless traffic.
    if (navigator.webdriver) return;
    if (/bot|crawl|spider|headless|lighthouse|preview/i.test(navigator.userAgent)) return;

    var started = Date.now();
    var engagedMs = 0;
    var lastResume = Date.now();
    var currentPath = location.pathname + location.search;
    var vitals = {};
    var sentFinal = false;
    var maxScroll = 0;
    var signalsSent = 0;

    function post(body, useBeacon) {
      try {
        var payload = JSON.stringify(body);
        // sendBeacon survives the page being torn down, which is the only way
        // to reliably capture engagement time and Core Web Vitals. Content-type
        // stays text/plain so the request is CORS-simple and never preflights —
        // a preflight on pagehide would be dropped.
        if (useBeacon && navigator.sendBeacon) {
          navigator.sendBeacon(endpoint, new Blob([payload], { type: "text/plain" }));
          return;
        }
        fetch(endpoint, {
          method: "POST",
          body: payload,
          keepalive: true,
          headers: { "Content-Type": "text/plain" },
          credentials: "omit",
          mode: "cors",
        }).catch(function () {});
      } catch (e) {}
    }

    function base(kind, path) {
      return {
        k: siteKey,
        t: kind,
        p: path || currentPath,
        r: document.referrer || "",
        w: window.innerWidth || 0,
      };
    }

    // ---- pageview -----------------------------------------------------------
    function sendPageview(path) {
      var b = base("pv", path);
      try {
        var q = new URLSearchParams(location.search);
        b.us = q.get("utm_source") || "";
        b.um = q.get("utm_medium") || "";
        b.uc = q.get("utm_campaign") || "";
      } catch (e) {}
      post(b, false);
    }

    // ---- Core Web Vitals ----------------------------------------------------
    // Collected as they occur and sent once, on the way out. Sending each
    // metric as it arrives would mean five requests per pageview; LCP and CLS
    // are not final until the page is hidden anyway.
    function observe(type, cb, opts) {
      try {
        var o = new PerformanceObserver(function (list) {
          try {
            cb(list.getEntries());
          } catch (e) {}
        });
        o.observe(Object.assign({ type: type, buffered: true }, opts || {}));
      } catch (e) {}
    }

    try {
      var nav = performance.getEntriesByType("navigation")[0];
      if (nav && nav.responseStart > 0) vitals.TTFB = Math.round(nav.responseStart);
    } catch (e) {}

    observe("paint", function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].name === "first-contentful-paint") {
          vitals.FCP = Math.round(entries[i].startTime);
        }
      }
    });

    observe("largest-contentful-paint", function (entries) {
      var last = entries[entries.length - 1];
      if (last) vitals.LCP = Math.round(last.startTime);
    });

    var cls = 0;
    observe("layout-shift", function (entries) {
      for (var i = 0; i < entries.length; i++) {
        // Shifts within 500ms of an interaction are the user's doing, not the
        // page's, and are excluded from the metric by definition.
        if (!entries[i].hadRecentInput) cls += entries[i].value;
      }
      vitals.CLS = Math.round(cls * 1000) / 1000;
    });

    var inp = 0;
    observe("event", function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var d = entries[i].duration;
        if (d > inp) inp = d;
      }
      if (inp > 0) vitals.INP = Math.round(inp);
    }, { durationThreshold: 40 });

    // ---- engagement ---------------------------------------------------------
    // Time the tab was actually visible, not wall-clock since load.
    function pause() {
      if (lastResume) engagedMs += Date.now() - lastResume;
      lastResume = 0;
    }
    function resume() {
      if (!lastResume) lastResume = Date.now();
    }

    function sendFinal() {
      if (sentFinal) return;
      sentFinal = true;
      pause();
      var b = base("end");
      b.e = Math.min(engagedMs, 30 * 60 * 1000); // cap absurd values from parked tabs
      b.v = vitals;
      b.m = maxScroll;
      post(b, true);

      // Slow for a real person on a real device, which is the only definition
      // that matters. 4s is Google's own "poor" threshold for LCP.
      try {
        if (vitals.LCP && vitals.LCP > 4000) signal("slow_page", "LCP", vitals.LCP);
      } catch (e) {}
    }

    document.addEventListener(
      "visibilitychange",
      function () {
        try {
          if (document.visibilityState === "hidden") {
            // Mobile browsers frequently never fire pagehide; hidden is the
            // only reliable "user is leaving" signal there.
            sendFinal();
          } else {
            resume();
          }
        } catch (e) {}
      },
      true
    );
    window.addEventListener("pagehide", sendFinal, true);

    // ---- SPA navigation -----------------------------------------------------
    function onRouteChange() {
      try {
        var next = location.pathname + location.search;
        if (next === currentPath) return;
        // Close out the previous view before opening the next one, or the time
        // spent on it is lost.
        pause();
        var b = base("end", currentPath);
        b.e = engagedMs;
        b.v = vitals;
        post(b, false);

        currentPath = next;
        engagedMs = 0;
        lastResume = Date.now();
        vitals = {};
        started = Date.now();
        sendPageview(currentPath);
      } catch (e) {}
    }

    try {
      ["pushState", "replaceState"].forEach(function (name) {
        var original = history[name];
        if (typeof original !== "function") return;
        history[name] = function () {
          var result = original.apply(this, arguments);
          onRouteChange();
          return result;
        };
      });
      window.addEventListener("popstate", onRouteChange, true);
    } catch (e) {}

    // ---- what the visitor actually ran into ---------------------------------
    //
    // A crawler finds every page that exists. It never finds the dead URL a
    // customer reached from an old Facebook post, and it cannot see the
    // checkout throwing an error on someone's phone. Only the people on the
    // site can report that, and the tag is already there.

    // Hard cap per pageview. A site erroring in a loop must not be able to
    // beacon thousands of times from one tab — that would be an attack on
    // ourselves, delivered by our own script.
    var SIGNAL_LIMIT = 12;

    /** Strip the query string off any URL before it is reported.
     *
     *  Stack traces carry the page URL through, and a page URL can carry
     *  ?email=someone@example.com. Reporting the error is useful; making that
     *  address permanent in our database is exactly the accident this file
     *  exists to avoid. */
    function safeUrl(u) {
      try {
        var url = new URL(u, location.href);
        return url.origin + url.pathname;
      } catch (e) {
        return String(u || "").split("?")[0].slice(0, 200);
      }
    }

    function signal(kind, detail, value) {
      try {
        if (signalsSent >= SIGNAL_LIMIT) return;
        signalsSent += 1;
        var b = base("sg");
        b.s = kind;
        if (detail != null) b.d = String(detail).slice(0, 300);
        if (value != null) b.n = value;
        post(b, true);
      } catch (e) {}
    }

    // Their site is broken. The single most useful thing we can tell a client,
    // and the one they are least likely to discover on their own.
    window.addEventListener(
      "error",
      function (ev) {
        try {
          if (!ev) return;
          // A failed image or script tag raises an error event with no message.
          if (!ev.message) {
            var t = ev.target;
            if (t && t.src) signal("js_error", "failed to load " + safeUrl(t.src));
            return;
          }
          var where = ev.filename ? safeUrl(ev.filename) + ":" + (ev.lineno || 0) : "";
          signal("js_error", (ev.message + " " + where).trim());
        } catch (e) {}
      },
      true
    );

    window.addEventListener("unhandledrejection", function (ev) {
      try {
        var r = ev && ev.reason;
        var msg = r && r.message ? r.message : String(r || "unhandled rejection");
        signal("js_error", "unhandled promise: " + msg);
      } catch (e) {}
    });

    // A real person hit a dead page. Read from the page's own headings rather
    // than guessed: we cannot see the HTTP status from in here, so the only
    // honest signal is the site saying so itself.
    try {
      var head = ((document.title || "") + " " + ((document.querySelector("h1") || {}).textContent || "")).toLowerCase();
      if (/\b404\b|page not found|page can.t be found|nothing was found/.test(head)) {
        signal("not_found", document.referrer ? safeUrl(document.referrer) : "(no referrer)");
      }
    } catch (e) {}

    // Clicking the same spot over and over means it looks clickable and is
    // not. Three inside half a second, within a thumb's width.
    var clicks = [];
    document.addEventListener(
      "click",
      function (ev) {
        try {
          var now = Date.now();
          clicks.push({ x: ev.clientX, y: ev.clientY, t: now });
          clicks = clicks.filter(function (c) { return now - c.t < 500; });
          if (clicks.length < 3) return;
          var first = clicks[0];
          for (var i = 1; i < clicks.length; i++) {
            if (Math.abs(clicks[i].x - first.x) > 30 || Math.abs(clicks[i].y - first.y) > 30) return;
          }
          clicks = [];
          // The element's identity only — its tag, id and classes. Never its
          // text, which on a form could be anything.
          var el = ev.target;
          var what = el && el.tagName ? el.tagName.toLowerCase() : "unknown";
          if (el && el.id) what += "#" + String(el.id).slice(0, 40);
          else if (el && el.className && typeof el.className === "string")
            what += "." + el.className.split(/\s+/)[0].slice(0, 40);
          signal("rage_click", what, 3);
        } catch (e) {}
      },
      true
    );

    // How far down the page people actually get. Sampled on scroll, reported
    // once at the end — scrolling fires constantly and a beacon per frame
    // would be indefensible.
    window.addEventListener(
      "scroll",
      function () {
        try {
          var doc = document.documentElement;
          var full = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
          if (full <= window.innerHeight) return; // nothing to scroll
          var pct = Math.round(((window.scrollY + window.innerHeight) / full) * 100);
          if (pct > maxScroll) maxScroll = Math.min(100, pct);
        } catch (e) {}
      },
      { passive: true }
    );

    // ---- conversions --------------------------------------------------------
    // Records that something happened and where. Never what was typed: no
    // input is read anywhere in this file, and the submit handler deliberately
    // touches only the form's own id/name.
    document.addEventListener(
      "click",
      function (ev) {
        try {
          var el = ev.target;
          if (!el || !el.closest) return;
          var a = el.closest("a");
          if (!a) return;
          var href = a.getAttribute("href") || "";
          if (!href) return;

          var b;
          if (/^tel:/i.test(href)) {
            b = base("cv");
            b.c = "tel_click";
            b.g = "";
          } else if (/^mailto:/i.test(href)) {
            b = base("cv");
            b.c = "mailto_click";
            b.g = "";
          } else if (/^https?:\/\//i.test(href)) {
            var host = "";
            try {
              host = new URL(href, location.href).hostname;
            } catch (e) {}
            if (!host || host === location.hostname) return; // internal link
            b = base("cv");
            b.c = "outbound_click";
            b.g = host; // destination domain only, never the full URL
          } else {
            return;
          }
          post(b, true);
        } catch (e) {}
      },
      true
    );

    document.addEventListener(
      "submit",
      function (ev) {
        try {
          var f = ev.target;
          if (!f || f.tagName !== "FORM") return;
          var b = base("cv");
          b.c = "form_submit";
          // The form's own identifier, nothing from inside it.
          b.g = (f.getAttribute("id") || f.getAttribute("name") || "form").slice(0, 60);
          post(b, true);
        } catch (e) {}
      },
      true
    );

    // ---- go -----------------------------------------------------------------
    sendPageview(currentPath);
  } catch (e) {
    // Never surface anything into the host page.
  }
})();
