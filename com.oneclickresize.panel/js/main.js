(function () {
  var cs = new CSInterface();

  function evalAsync(script, cb) { cs.evalScript(script, cb); }

  // Pure display formatting only — the ratio itself is decided by ExtendScript's
  // detectRatio and arrives on info.ratio. No ratio classification lives here.
  var RATIO_DISPLAY = { "9-16": "9 : 16", "4-5": "4 : 5", "1-1": "1 : 1" };

  function setStatus(message) {
    var el = document.getElementById("status-msg");
    if (el) { el.textContent = message || ""; }
  }

  // The panel's ScriptPath can load lazily; make sure the jsx layer is present
  // before calling into it (also lets the updater hot-reload a fresh jsx).
  // Cached after the first success so the realtime poll costs one evalScript.
  var jsxReady = false;
  function ensureJsx(cb) {
    if (jsxReady) { cb(); return; }
    evalAsync("typeof RSZ_activeSequenceInfo", function (t) {
      if (t === "function") { jsxReady = true; cb(); return; }
      var p = cs.getSystemPath(SystemPath.EXTENSION) + "/jsx/premiere.jsx";
      evalAsync('$.evalFile("' + p.replace(/"/g, '\\"') + '")', function () { jsxReady = true; cb(); });
    });
  }

  // ENGINE pill: can the panel actually talk to Premiere's script engine?
  // Green once RSZ_activeSequenceInfo answers with parseable data; red when
  // evalScript fails (jsx not loaded / "EvalScript error."). The realtime
  // poll keeps this self-healing.
  function paintEngine(ok) {
    var pill = document.getElementById("pill-engine");
    if (!pill) { return; }
    pill.className = ok ? "pill ok" : "pill rec";
    pill.innerHTML = '<span class="dot"></span>' + (ok ? "ENGINE OK" : "ENGINE ERR");
    pill.title = ok ? "Đã kết nối script engine của Premiere"
                    : "Không nói chuyện được với Premiere — thử tắt/bật lại panel";
  }

  // Header pill = selection state. A sequence selected in the Project panel →
  // green + its name (so you never resize the wrong one). Nothing selected, or
  // another kind of object clicked → red + "Chưa chọn Sequence".
  function paintSequenceState(info) {
    var pill = document.getElementById("pill-seq");
    if (pill) {
      var selected = !!(info && info.from === "selection");
      pill.className = selected ? "pill ok" : "pill rec";
      pill.innerHTML = '<span class="dot"></span><span class="pill-label"></span>';
      var label = pill.querySelector(".pill-label");
      if (selected) {
        var nm = info.name || "Sequence";
        label.textContent = nm.length > 26 ? (nm.substring(0, 25) + "…") : nm;
        pill.title = nm; // full name on hover
      } else {
        label.textContent = "Chưa chọn Sequence";
        pill.title = "Hãy click chọn một sequence ở Project panel rồi bấm RESIZE";
      }
    }
    var rb = document.querySelector(".ratiobox");
    if (rb) {
      rb.className = "ratiobox " + (!info || !info.ratio ? "none"
        : info.ratio === "4-5" ? "r45"
        : info.ratio === "1-1" ? "r11" : "r916");
    }
  }

  function resetMeta(el) {
    el.querySelector("b").textContent = "—";
    el.querySelector("span").textContent = "chọn hoặc mở một sequence để bắt đầu";
  }

  // force=true (manual ⟳) always repaints; the realtime poll passes false so
  // an unchanged answer costs nothing and never wipes a visible status message.
  var lastSourceRes = null;
  var sourceInFlight = false;
  function refreshSource(force) {
    // Skip a poll tick if the previous probe hasn't answered yet — keeps the
    // fast interval from stacking evalScript calls when Premiere is busy.
    if (sourceInFlight && !force) { return; }
    sourceInFlight = true;
    ensureJsx(function () {
      evalAsync("RSZ_activeSequenceInfo()", function (res) {
        sourceInFlight = false;
        if (!force && res === lastSourceRes) { return; }
        lastSourceRes = res;
        var el = document.querySelector(".source .meta");
        var info = null;
        try { info = res && res !== "null" ? JSON.parse(res) : null; }
        catch (e) {
          paintEngine(false);
          resetMeta(el);
          paintSequenceState(null);
          setStatus("Không đọc được thông tin sequence.");
          return;
        }
        paintEngine(true);
        if (info) {
          el.querySelector("b").textContent = RATIO_DISPLAY[info.ratio] || "—";
          el.querySelector("span").textContent = info.width + " × " + info.height;
          setStatus("");
        } else {
          resetMeta(el);
        }
        paintSequenceState(info);
      });
    });
  }

  // ---- Realtime auto-detect (the AUTO badge is a working toggle) -----------
  // Premiere never emits a usable sequence-changed CSXS event, so poll cheaply:
  // one evalScript per tick, DOM untouched unless the answer actually changed.
  var AUTO_KEY = "rsz.autoDetect";
  var autoTimer = null;

  function paintAutoBadge() {
    var b = document.getElementById("auto-toggle");
    if (!b) { return; }
    var on = window.RSZ_AUTO;
    b.className = "autobadge" + (on ? "" : " off");
    b.textContent = on ? "AUTO" : "AUTO OFF";
    b.title = on ? "Đang tự nhận diện realtime — bấm để tắt"
                 : "Đã tắt tự nhận diện — bấm để bật (hoặc dùng nút ⟳)";
  }

  var AUTO_POLL_MS = 300; // near-instant selection detection

  function setAuto(on) {
    window.RSZ_AUTO = !!on;
    try { window.localStorage.setItem(AUTO_KEY, on ? "1" : "0"); } catch (e) {}
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    if (on) {
      autoTimer = setInterval(function () {
        var go = document.getElementById("go");
        if (go && go.disabled) { return; } // don't poll mid-resize
        refreshSource(false);             // skipped if a probe is still in flight
      }, AUTO_POLL_MS);
    }
    paintAutoBadge();
  }

  function renderResults(payload) {
    var outs = document.getElementById("outs");
    outs.innerHTML = "";
    if (!payload.ok) {
      outs.innerHTML = '<p class="hint">' +
        (payload.error === "UNKNOWN_RATIO" ? "ratio nguồn không nằm trong 9:16 / 4:5 / 1:1"
         : payload.error === "NO_ACTIVE_SEQUENCE" ? "chưa chọn hoặc mở sequence nào"
         : "có lỗi xảy ra") + "</p>";
      return;
    }
    for (var i = 0; i < payload.results.length; i++) {
      var r = payload.results[i];
      var row = document.createElement("div");
      row.className = "orow show";
      var ok = !r.error;
      row.innerHTML = '<span class="oico"></span><div class="oinfo"><b></b><span></span></div>' +
        '<span class="ostatus"><span class="dot"></span>' + (ok ? "DONE" : "ERROR") + '</span>';
      row.querySelector(".oinfo b").textContent = r.name || (RATIO_DISPLAY[r.ratio] || r.ratio);
      var sub = RATIO_DISPLAY[r.ratio] || r.ratio;
      if (ok && r.moved) { sub += " · đã canh " + r.moved + " lớp"; }
      if (!ok) {
        sub = "không tạo được";
        if (r.orphan) { sub += " — bản dở dang: " + r.orphan; }
      }
      row.querySelector(".oinfo span").textContent = sub;
      outs.appendChild(row);
    }
  }

  function setBusy(busy) {
    var f = document.getElementById("foot-status");
    if (f) {
      f.className = "ai" + (busy ? " busy" : "");
      f.innerHTML = '<span class="dot"></span>' + (busy ? "BUSY" : "READY");
    }
  }

  function run() {
    var btn = document.getElementById("go");
    btn.disabled = true;
    setBusy(true);
    var bg = parseInt(window.RSZ_BG_TRACK, 10) || 1;
    var g = window.RSZ_GUIDE || {};
    var g9 = gnum(g["9-16"], 0.5), g45 = gnum(g["4-5"], 0.5), g11 = gnum(g["1-1"], 0.5);
    setStatus("Đang xử lý…");
    ensureJsx(function () {
      evalAsync('RSZ_runResizeAll(' + bg + ',' + g9 + ',' + g45 + ',' + g11 + ')', function (res) {
        btn.disabled = false;
        setBusy(false);
        var payload = null;
        try { payload = JSON.parse(res); }
        catch (e) { setStatus("Không đọc được phản hồi từ Premiere."); return; }
        setStatus("");
        renderResults(payload);
      });
    });
  }

  window.initPanel = function () {
    document.getElementById("go").addEventListener("click", run);
    var refreshBtn = document.getElementById("refresh");
    if (refreshBtn) { refreshBtn.addEventListener("click", function () { refreshSource(true); }); }
    var autoBtn = document.getElementById("auto-toggle");
    if (autoBtn) { autoBtn.addEventListener("click", function () { setAuto(!window.RSZ_AUTO); }); }
    refreshSource(true);
    // Realtime detection is the poll (AUTO toggle, on by default); the focus
    // listener is a free extra kick when the user clicks into the panel.
    window.addEventListener("focus", function () { refreshSource(false); });
    window.RSZ_AUTO = (function () {
      try { return window.localStorage.getItem(AUTO_KEY) !== "0"; } catch (e) { return true; }
    })();
    setAuto(window.RSZ_AUTO);
  };

  window.initPanel();

  var BG_TRACK_KEY = "rsz.bgTrack";
  var GUIDE_KEY = "rsz.guideY";       // JSON {"9-16":..,"4-5":..,"1-1":..}

  function gnum(v, def) {
    v = parseFloat(v);
    if (isNaN(v)) { return def; }
    return v < 0 ? 0 : (v > 1 ? 1 : v);
  }

  window.RSZ_BG_TRACK = parseInt(window.localStorage.getItem(BG_TRACK_KEY) || "1", 10) || 1;
  window.RSZ_GUIDE = (function () {
    var d = { "9-16": 0.5, "4-5": 0.5, "1-1": 0.5 };
    try {
      var saved = JSON.parse(window.localStorage.getItem(GUIDE_KEY) || "{}");
      d["9-16"] = gnum(saved["9-16"], 0.5);
      d["4-5"] = gnum(saved["4-5"], 0.5);
      d["1-1"] = gnum(saved["1-1"], 0.5);
    } catch (e) {}
    return d;
  })();

  function showSettings(show) {
    var main = document.getElementById("main-view");
    var settings = document.getElementById("settings");
    if (main) { main.style.display = show ? "none" : "block"; }
    if (settings) { settings.style.display = show ? "block" : "none"; }
  }

  // ---- Text guide editor (one horizontal guide line per ratio) -----------
  var RATIO_ASPECT = { "9-16": 1920 / 1080, "4-5": 1350 / 1080, "1-1": 1 };
  // Reference safe-zone insets (fraction of the frame) shown as a faint box to
  // help align the guide line. 9:16 ~ Reels; 4:5 / 1:1 a modest inset.
  var SAFE_REF = {
    "9-16": { top: 0.12, bottom: 0.33, side: 0.06 },
    "4-5":  { top: 0.08, bottom: 0.10, side: 0.06 },
    "1-1":  { top: 0.08, bottom: 0.12, side: 0.06 }
  };
  var GZ_WIDTH = 92; // px; frame height = width * aspect
  var curRatio = "9-16";

  function saveGuide() {
    try { window.localStorage.setItem(GUIDE_KEY, JSON.stringify(window.RSZ_GUIDE)); } catch (e) {}
  }

  function renderGuide() {
    var frame = document.getElementById("gzframe");
    var line = document.getElementById("gzline");
    var input = document.getElementById("guideY");
    var y = window.RSZ_GUIDE[curRatio];
    if (frame) { frame.style.height = Math.round(GZ_WIDTH * RATIO_ASPECT[curRatio]) + "px"; }
    var safe = document.getElementById("gzsafe");
    var sr = SAFE_REF[curRatio];
    if (safe && sr) {
      safe.style.top = (sr.top * 100) + "%";
      safe.style.bottom = (sr.bottom * 100) + "%";
      safe.style.left = (sr.side * 100) + "%";
      safe.style.right = (sr.side * 100) + "%";
    }
    if (line) { line.style.top = (y * 100) + "%"; }
    if (input && document.activeElement !== input) { input.value = Math.round(y * 100); }
    var tabs = document.querySelectorAll(".gz-tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].className = "gz-tab" + (tabs[i].getAttribute("data-ratio") === curRatio ? " active" : "");
    }
  }

  function setGuideY(f) {
    window.RSZ_GUIDE[curRatio] = gnum(f, 0.5);
    renderGuide(); saveGuide();
  }

  function initGuideDrag() {
    var handle = document.getElementById("gzline");
    var frame = document.getElementById("gzframe");
    if (!handle || !frame) { return; }
    function onMove(e) {
      if (e.buttons !== undefined && !(e.buttons & 1)) { onUp(); return; }
      var rect = frame.getBoundingClientRect();
      setGuideY((e.clientY - rect.top) / rect.height);
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    handle.addEventListener("mousedown", function (e) {
      e.preventDefault();
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function initSettings() {
    var gear = document.getElementById("gear");
    var back = document.getElementById("settings-back");
    var done = document.getElementById("settings-done");
    var input = document.getElementById("bgtrack");
    if (input) {
      input.value = window.RSZ_BG_TRACK;
      input.addEventListener("change", function () {
        var v = parseInt(input.value, 10);
        if (!v || v < 1) { v = 1; }
        if (v > 20) { v = 20; }
        window.RSZ_BG_TRACK = v;
        input.value = v;
        window.localStorage.setItem(BG_TRACK_KEY, String(v));
      });
    }

    // ratio tabs
    var tabs = document.querySelectorAll(".gz-tab");
    for (var i = 0; i < tabs.length; i++) {
      (function (tab) {
        tab.addEventListener("click", function () {
          curRatio = tab.getAttribute("data-ratio");
          renderGuide();
        });
      })(tabs[i]);
    }
    var gy = document.getElementById("guideY");
    if (gy) { gy.addEventListener("change", function () { setGuideY((parseFloat(gy.value) || 0) / 100); }); }
    initGuideDrag();
    renderGuide();

    if (gear) { gear.addEventListener("click", function () { showSettings(true); }); }
    if (back) { back.addEventListener("click", function () { showSettings(false); }); }
    if (done) { done.addEventListener("click", function () { showSettings(false); }); }
  }
  initSettings();
})();
