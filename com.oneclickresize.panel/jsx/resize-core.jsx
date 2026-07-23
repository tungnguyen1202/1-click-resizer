var RSZ = (function () {
  var EPS = 0.02;
  var RATIOS = {
    "9-16": { w: 1080, h: 1920 },
    "4-5":  { w: 1080, h: 1350 },
    "1-1":  { w: 1080, h: 1080 }
  };
  var ORDER = ["9-16", "4-5", "1-1"];
  // Internal ratio keys stay "9-16"; the name suffix uses the "x" style.
  var LABELS = { "9-16": "9x16", "4-5": "4x5", "1-1": "1x1" };
  // Every trailing label we recognise when stripping (new + legacy dash form),
  // so re-resizing a file named either way swaps cleanly.
  var STRIP_SUFFIXES = ["9x16", "4x5", "1x1", "9-16", "4-5", "1-1"];

  function aspectOf(w, h) { return w / h; }

  function detectRatio(w, h) {
    if (!w || !h) { return null; }
    var a = aspectOf(w, h);
    var best = null;
    var bestDiff = EPS;
    for (var i = 0; i < ORDER.length; i++) {
      var r = RATIOS[ORDER[i]];
      var diff = Math.abs(aspectOf(r.w, r.h) - a);
      if (diff <= bestDiff) { bestDiff = diff; best = ORDER[i]; }
    }
    return best;
  }

  function otherRatios(label) {
    var out = [];
    for (var i = 0; i < ORDER.length; i++) {
      if (ORDER[i] !== label) { out.push(ORDER[i]); }
    }
    return out;
  }

  function stripTrailingRatioLabel(name) {
    // Tolerate accidental trailing spaces from manual renames.
    while (name.length && name.charAt(name.length - 1) === " ") {
      name = name.substring(0, name.length - 1);
    }
    for (var i = 0; i < STRIP_SUFFIXES.length; i++) {
      var suffix = " " + STRIP_SUFFIXES[i];
      if (name.length >= suffix.length &&
          name.substring(name.length - suffix.length) === suffix) {
        return name.substring(0, name.length - suffix.length);
      }
    }
    return name;
  }

  // targetLabel is an internal ratio key ("9-16"); the suffix uses LABELS.
  function buildName(originalName, targetLabel) {
    var suffix = LABELS[targetLabel] || targetLabel;
    return stripTrailingRatioLabel(originalName) + " " + suffix;
  }

  // A clip is treated as a logo when its name contains any of these hints
  // (case-insensitive substring). The team names logo files like "logo",
  // "fav vid", "fav video" — "fav" covers all of those. Add more hints here to
  // teach the panel new naming conventions; keep them lowercase.
  var LOGO_NAME_HINTS = ["logo", "fav"];

  function isLogoName(name) {
    if (!name) { return false; }
    var n = String(name).toLowerCase();
    for (var i = 0; i < LOGO_NAME_HINTS.length; i++) {
      if (n.indexOf(LOGO_NAME_HINTS[i]) !== -1) { return true; }
    }
    return false;
  }

  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }

  return {
    RATIOS: RATIOS,
    ORDER: ORDER,
    LABELS: LABELS,
    detectRatio: detectRatio,
    otherRatios: otherRatios,
    stripTrailingRatioLabel: stripTrailingRatioLabel,
    buildName: buildName,
    clamp01: clamp01,
    LOGO_NAME_HINTS: LOGO_NAME_HINTS,
    isLogoName: isLogoName
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = RSZ; }
