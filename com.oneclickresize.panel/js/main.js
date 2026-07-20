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
  function refreshSource(force) {
    ensureJsx(function () {
      evalAsync("RSZ_activeSequenceInfo()", function (res) {
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

  function setAuto(on) {
    window.RSZ_AUTO = !!on;
    try { window.localStorage.setItem(AUTO_KEY, on ? "1" : "0"); } catch (e) {}
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    if (on) {
      autoTimer = setInterval(function () {
        var go = document.getElementById("go");
        if (go && go.disabled) { return; } // don't poll mid-resize
        refreshSource(false);
      }, 1500);
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
      if (ok && r.scaled) { sub += " · nền phóng to"; }
      if (ok && r.moved) { sub += " · căn safe zone"; }
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
    var stp = (typeof window.RSZ_SAFE_TOP === "number" && !isNaN(window.RSZ_SAFE_TOP)) ? window.RSZ_SAFE_TOP : 0.12;
    var sbt = (typeof window.RSZ_SAFE_BOTTOM === "number" && !isNaN(window.RSZ_SAFE_BOTTOM)) ? window.RSZ_SAFE_BOTTOM : 0.22;
    setStatus("Đang xử lý…");
    ensureJsx(function () {
      evalAsync('RSZ_runResizeAll(' + bg + ',' + stp + ',' + sbt + ')', function (res) {
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
  var SAFE_TOP_KEY = "rsz.safeTop";
  var SAFE_BOTTOM_KEY = "rsz.safeBottom";
  window.RSZ_BG_TRACK = parseInt(window.localStorage.getItem(BG_TRACK_KEY) || "1", 10) || 1;
  window.RSZ_SAFE_TOP = parseFloat(window.localStorage.getItem(SAFE_TOP_KEY) || "0.12");
  window.RSZ_SAFE_BOTTOM = parseFloat(window.localStorage.getItem(SAFE_BOTTOM_KEY) || "0.22");

  function showSettings(show) {
    var main = document.getElementById("main-view");
    var settings = document.getElementById("settings");
    if (main) { main.style.display = show ? "none" : "block"; }
    if (settings) { settings.style.display = show ? "block" : "none"; }
  }

  // ---- Safe-zone visual editor -------------------------------------------
  var MIN_BAND = 0.10; // keep at least this much band between top and bottom
  var MAX_MARGIN = 0.45;

  function clampFrac(v) {
    if (isNaN(v) || v < 0) { return 0; }
    if (v > MAX_MARGIN) { return MAX_MARGIN; }
    return v;
  }

  function saveZone() {
    window.localStorage.setItem(SAFE_TOP_KEY, String(window.RSZ_SAFE_TOP));
    window.localStorage.setItem(SAFE_BOTTOM_KEY, String(window.RSZ_SAFE_BOTTOM));
  }

  function renderZone() {
    var band = document.getElementById("szband");
    if (band) {
      band.style.top = (window.RSZ_SAFE_TOP * 100) + "%";
      band.style.bottom = (window.RSZ_SAFE_BOTTOM * 100) + "%";
    }
    var st = document.getElementById("safetop");
    var sb = document.getElementById("safebottom");
    if (st && document.activeElement !== st) { st.value = Math.round(window.RSZ_SAFE_TOP * 100); }
    if (sb && document.activeElement !== sb) { sb.value = Math.round(window.RSZ_SAFE_BOTTOM * 100); }
  }

  function setTop(f) {
    f = clampFrac(f);
    var maxTop = 1 - window.RSZ_SAFE_BOTTOM - MIN_BAND;
    if (maxTop < 0) { maxTop = 0; }
    if (f > maxTop) { f = maxTop; }
    window.RSZ_SAFE_TOP = f;
    renderZone(); saveZone();
  }

  function setBottom(f) {
    f = clampFrac(f);
    var maxBot = 1 - window.RSZ_SAFE_TOP - MIN_BAND;
    if (maxBot < 0) { maxBot = 0; }
    if (f > maxBot) { f = maxBot; }
    window.RSZ_SAFE_BOTTOM = f;
    renderZone(); saveZone();
  }

  function initDragHandle(handleId, edge) {
    var h = document.getElementById(handleId);
    var frame = document.getElementById("szframe");
    if (!h || !frame) { return; }
    function onMove(e) {
      // If the button was released outside the panel window, no mouseup ever
      // reaches us — stop dragging as soon as we see the button is up.
      if (e.buttons !== undefined && !(e.buttons & 1)) { onUp(); return; }
      var rect = frame.getBoundingClientRect();
      var y = (e.clientY - rect.top) / rect.height;
      if (edge === "top") { setTop(y); } else { setBottom(1 - y); }
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    h.addEventListener("mousedown", function (e) {
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

    var st = document.getElementById("safetop");
    var sb = document.getElementById("safebottom");
    if (st) { st.addEventListener("change", function () { setTop((parseFloat(st.value) || 0) / 100); }); }
    if (sb) { sb.addEventListener("change", function () { setBottom((parseFloat(sb.value) || 0) / 100); }); }
    initDragHandle("sz-top-h", "top");
    initDragHandle("sz-bot-h", "bottom");
    var reels = document.getElementById("sz-reels");
    if (reels) {
      reels.addEventListener("click", function () {
        window.RSZ_SAFE_TOP = 0.14;
        window.RSZ_SAFE_BOTTOM = 0.35;
        renderZone(); saveZone();
      });
    }
    renderZone();

    if (gear) { gear.addEventListener("click", function () { showSettings(true); }); }
    if (back) { back.addEventListener("click", function () { showSettings(false); }); }
    if (done) { done.addEventListener("click", function () { showSettings(false); }); }
  }
  initSettings();
})();
