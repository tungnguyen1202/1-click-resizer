// 1-Click Resizer — settings storage.
//
// Why not just localStorage: a CEP panel is served from file://, where
// localStorage lives in a CSXS cache folder the host can clear — so the editor's
// guide/track settings appear to reset and have to be re-entered per project.
// The real store here is a JSON file under the user's Application Support
// folder, deliberately OUTSIDE the panel's git clone so reinstalling or updating
// the panel never wipes it. Settings therefore survive Premiere restarts and
// apply to every project: set them once. localStorage is still written as a
// mirror, and is the fallback when Node isn't reachable.
//
// Shape stored: { bgTrack: 1, guide: {"9-16":..,"4-5":..,"1-1":..,"2-3":..},
//                 mode: "GG"|"PIN", auto: true }
window.RSZ_PREFS = (function () {
  var LS_KEY = "rsz.settings";

  var nodeRequire =
    (typeof window !== "undefined" && window.cep_node && window.cep_node.require)
      ? window.cep_node.require
      : (typeof require === "function" ? require : null);

  var fs = null, path = null, DIR = null, FILE = null;
  try {
    if (nodeRequire) {
      fs = nodeRequire("fs");
      path = nodeRequire("path");
      var env = (typeof process !== "undefined" && process.env) ? process.env : {};
      var home = env.HOME || env.USERPROFILE;
      var mac = (typeof process !== "undefined" && process.platform === "darwin");
      if (home) {
        DIR = mac
          ? path.join(home, "Library", "Application Support", "1-Click Resizer Settings")
          : path.join(home, ".1-click-resizer");
        FILE = path.join(DIR, "settings.json");
      }
    }
  } catch (e) { fs = null; FILE = null; }

  function hasDisk() { return !!(fs && path && FILE); }

  // mkdir -p, done by hand: CEP's bundled Node predates mkdirSync's recursive
  // option in some Premiere generations.
  function mkdirp(dir) {
    try { if (fs.existsSync(dir)) { return true; } } catch (e) {}
    var parent = path.dirname(dir);
    if (parent && parent !== dir) { mkdirp(parent); }
    try { fs.mkdirSync(dir); return true; }
    catch (e2) { try { return fs.existsSync(dir); } catch (e3) { return false; } }
  }

  function readDisk() {
    if (!hasDisk()) { return null; }
    try {
      if (!fs.existsSync(FILE)) { return null; }
      var obj = JSON.parse(fs.readFileSync(FILE, "utf8"));
      return (obj && typeof obj === "object") ? obj : null;
    } catch (e) { return null; }
  }

  function writeDisk(obj) {
    if (!hasDisk()) { return false; }
    try {
      mkdirp(DIR);
      fs.writeFileSync(FILE, JSON.stringify(obj, null, 2), "utf8");
      return true;
    } catch (e) { return false; }
  }

  function readLS() {
    try { return JSON.parse(window.localStorage.getItem(LS_KEY) || "null"); }
    catch (e) { return null; }
  }

  function writeLS(obj) {
    try { window.localStorage.setItem(LS_KEY, JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }

  // Settings saved by v1.8.0 and earlier lived in one localStorage key per
  // setting. Read them once so nobody loses what they had already configured.
  function readLegacy() {
    function ls(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
    var bg = ls("rsz.bgTrack"), guide = ls("rsz.guideY"),
        mode = ls("rsz.mode"), auto = ls("rsz.autoDetect");
    if (bg === null && guide === null && mode === null && auto === null) { return null; }
    var out = {};
    if (bg !== null) { out.bgTrack = parseInt(bg, 10); }
    if (guide !== null) { try { out.guide = JSON.parse(guide); } catch (e) {} }
    if (mode !== null) { out.mode = mode; }
    if (auto !== null) { out.auto = auto !== "0"; }
    return out;
  }

  return {
    // Absolute path of the settings file (null when Node isn't reachable) —
    // surfaced in Settings so the user can see where it lives.
    file: FILE,
    onDisk: hasDisk(),

    // Best available saved settings, or null when nothing was ever saved.
    load: function () { return readDisk() || readLS() || readLegacy(); },

    // Persist to disk (source of truth) and mirror into localStorage.
    // Returns true when at least one store accepted the write.
    save: function (obj) {
      var d = writeDisk(obj);
      var l = writeLS(obj);
      return d || l;
    }
  };
})();
