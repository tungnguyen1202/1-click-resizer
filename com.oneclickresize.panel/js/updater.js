// In-panel auto-update: checks the git remote for a newer version.json and,
// when found, shows an "update available" banner whose button runs `git pull`
// and reloads the panel. Uses the colleague's own git credentials, so it works
// with the private repo and needs no token in the panel.
//
// Requires: the panel installed via clone + symlink (so a .git repo exists),
// Node enabled (--enable-nodejs, set in the manifest), and git on disk.
// If any of those are missing, the feature silently disables itself.
(function () {
  var nodeRequire =
    (typeof window !== "undefined" && window.cep_node && window.cep_node.require)
      ? window.cep_node.require
      : (typeof require === "function" ? require : null);
  if (!nodeRequire) { return; }

  var fs, path, cp;
  try {
    fs = nodeRequire("fs");
    path = nodeRequire("path");
    cp = nodeRequire("child_process");
  } catch (e) { return; }

  var cs = new CSInterface();

  function repoDir() {
    var ext = cs.getSystemPath(SystemPath.EXTENSION);
    try { ext = fs.realpathSync(ext); } catch (e) {}  // resolve the symlink to the clone
    return path.dirname(ext);                          // repo root = parent of the bundle
  }

  function findGit() {
    var cands = ["/usr/bin/git", "/opt/homebrew/bin/git", "/usr/local/bin/git"];
    for (var i = 0; i < cands.length; i++) {
      try { if (fs.existsSync(cands[i])) { return cands[i]; } } catch (e) {}
    }
    return "git";
  }

  var GIT = findGit();
  var REPO = repoDir();

  function git(args, cb) {
    var env = {};
    try { for (var k in process.env) { env[k] = process.env[k]; } } catch (e) {}
    env.GIT_TERMINAL_PROMPT = "0"; // never block on a credential prompt (no TTY)
    // SSH remotes: fail fast instead of hanging on a passphrase/host prompt.
    env.GIT_SSH_COMMAND = "ssh -oBatchMode=yes -oStrictHostKeyChecking=accept-new";
    try {
      cp.execFile(GIT, args, { cwd: REPO, timeout: 30000, env: env }, function (err, stdout) {
        cb(err, (stdout || "").toString().replace(/\s+$/, ""));
      });
    } catch (e) { cb(e, ""); }
  }

  function parseVersion(str) { try { return JSON.parse(str).version; } catch (e) { return null; } }

  function localVersion() {
    try { return parseVersion(fs.readFileSync(path.join(REPO, "version.json"), "utf8")); }
    catch (e) { return null; }
  }

  // returns >0 if a is newer than b
  function cmpVersion(a, b) {
    var pa = String(a).split("."), pb = String(b).split(".");
    for (var i = 0; i < 3; i++) {
      var na = parseInt(pa[i] || "0", 10) || 0;
      var nb = parseInt(pb[i] || "0", 10) || 0;
      if (na > nb) { return 1; }
      if (na < nb) { return -1; }
    }
    return 0;
  }

  function setBtn(btn, text, disabled) { btn.textContent = text; btn.disabled = !!disabled; }

  var DISMISS_KEY = "rsz.dismissedVersion";
  // The version this page was loaded with — if version.json on disk moves past
  // it (maintainer published, or someone ran git pull by hand), the running
  // code is stale and only needs a reload, not a pull.
  var bootVersion = localVersion();
  var bannerVersion = null; // avoid repainting the same banner every tick
  // Tick intervals (overridable for tests).
  var LOCAL_MS = window.__RSZ_UPD_LOCAL_MS || 20000;    // disk check: cheap fs read
  var REMOTE_MS = window.__RSZ_UPD_REMOTE_MS || 300000; // remote check: git fetch

  function dismissed(v) {
    try { return window.localStorage.getItem(DISMISS_KEY) === String(v); } catch (e) { return false; }
  }

  // While an update/reload is in flight, the watchers must not repaint the
  // banner out from under the "Đang cập nhật…"/"Xong ✓" button states.
  var updating = false;

  // Re-eval the jsx (a page reload alone keeps the old ExtendScript), then reload.
  function reloadPanel(btn) {
    updating = true;
    var jsxPath = cs.getSystemPath(SystemPath.EXTENSION) + "/jsx/premiere.jsx";
    cs.evalScript('$.evalFile("' + jsxPath.replace(/"/g, '\\"') + '")', function () {
      if (btn) { setBtn(btn, "Xong ✓ đang tải lại…", true); }
      setTimeout(function () { window.location.reload(); }, 400);
    });
  }

  function busyGuard(text) {
    var go = document.getElementById("go");
    if (go && go.disabled) {
      if (text) { text.textContent = "Đợi resize xong rồi bấm lại nhé"; }
      return true;
    }
    return false;
  }

  function runUpdate() {
    var btn = document.getElementById("ub-update");
    var text = document.querySelector("#update-bar .ub-text");
    if (busyGuard(text)) { return; }
    var before = localVersion();
    updating = true;
    setBtn(btn, "Đang cập nhật…", true);
    git(["pull", "--ff-only", "origin", "main"], function (err) {
      if (err) {
        updating = false;
        setBtn(btn, "Thử lại", false);
        if (text) { text.textContent = "Cập nhật lỗi — kiểm tra quyền truy cập repo"; }
        return;
      }
      var after = localVersion();
      if (!after || cmpVersion(after, before) <= 0) {
        // Pull "succeeded" but nothing advanced (odd branch/state) — don't
        // reload into an endless banner loop.
        updating = false;
        setBtn(btn, "Thử lại", false);
        if (text) { text.textContent = "Không nhận được bản mới — kiểm tra bản cài (nhánh main?)"; }
        return;
      }
      reloadPanel(btn);
    });
  }

  // mode "pull": a newer release is on GitHub → button pulls then reloads.
  // mode "reload": the files on disk are already newer than the running code
  // (maintainer publish / manual git pull) → button just reloads.
  function showBanner(version, mode) {
    if (bannerVersion === mode + ":" + version) { return; }
    var bar = document.getElementById("update-bar");
    if (!bar) { return; }
    bannerVersion = mode + ":" + version;
    var text = bar.querySelector(".ub-text");
    var btn = document.getElementById("ub-update");
    if (mode === "reload") {
      if (text) { text.textContent = "Đã có v" + version + " trên máy"; }
      setBtn(btn, "⟳ Tải lại", false);
      btn.onclick = function () {
        var t = bar.querySelector(".ub-text");
        if (busyGuard(t)) { return; }
        reloadPanel(btn);
      };
    } else {
      if (text) { text.textContent = "Có bản mới v" + version; }
      setBtn(btn, "↑ Cập nhật", false);
      btn.onclick = runUpdate;
    }
    bar.style.display = "flex";
    document.getElementById("ub-dismiss").onclick = function () {
      bar.style.display = "none";
      bannerVersion = null;
      // Remember the declined version so this exact release stops nagging;
      // a genuinely newer one will still show the banner.
      try { window.localStorage.setItem(DISMISS_KEY, String(version)); } catch (e) {}
    };
  }

  // Disk watch: catches a publish/pull that already changed the files under us.
  function checkLocal() {
    if (updating) { return; }
    var cur = localVersion();
    if (!cur || !bootVersion || cur === bootVersion) { return; }
    if (dismissed(cur)) { return; }
    showBanner(cur, "reload");
  }

  // Remote watch: catches a new release for panels left open all day.
  function checkRemote() {
    if (updating) { return; }
    var local = localVersion();
    if (!local) { return; }               // not a git clone / no version file → skip
    // Copy-installs (no .git) must no-op — and never let git discover some
    // unrelated ancestor repository instead.
    try { if (!fs.existsSync(path.join(REPO, ".git"))) { return; } } catch (e2) { return; }
    git(["fetch", "--quiet"], function (err) {
      if (err) { return; }                // offline or no repo access → skip silently
      git(["show", "origin/main:version.json"], function (err2, out) {
        if (err2) { return; }
        var remote = parseVersion(out);
        if (!remote || cmpVersion(remote, local) <= 0) { return; }
        if (dismissed(remote)) { return; }
        showBanner(remote, "pull");
      });
    });
  }

  function start() {
    // Keep the header badge honest: show the actually-installed version.
    try {
      var badge = document.querySelector(".ver b");
      if (badge && bootVersion) { badge.textContent = "V" + bootVersion; }
    } catch (e) {}
    checkRemote();
    setInterval(checkLocal, LOCAL_MS);
    setInterval(checkRemote, REMOTE_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
