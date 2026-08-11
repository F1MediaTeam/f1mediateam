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
      post(b, true);
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
