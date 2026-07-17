var RSZ = (function () {
  var EPS = 0.02;
  var RATIOS = {
    "9-16": { w: 1080, h: 1920 },
    "4-5":  { w: 1080, h: 1350 },
    "1-1":  { w: 1080, h: 1080 }
  };
  var ORDER = ["9-16", "4-5", "1-1"];

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
    for (var i = 0; i < ORDER.length; i++) {
      var suffix = " " + ORDER[i];
      if (name.length >= suffix.length &&
          name.substring(name.length - suffix.length) === suffix) {
        return name.substring(0, name.length - suffix.length);
      }
    }
    return name;
  }

  function buildName(originalName, targetLabel) {
    return stripTrailingRatioLabel(originalName) + " " + targetLabel;
  }

  // Cover math over BOTH axes: the factor that keeps a frame-filling clip
  // covering the target frame. detectRatio matches by aspect only, so the
  // source may be any resolution (720x1280, 2160x3840, ...) — width matters
  // as much as height. Never scales down (floor at 1).
  function fillScale(currentScale, srcW, srcH, tgtW, tgtH) {
    if (!(srcW > 0) || !(srcH > 0)) { return currentScale; }
    var factor = tgtW / srcW;
    var byH = tgtH / srcH;
    if (byH > factor) { factor = byH; }
    if (factor < 1) { factor = 1; }
    return currentScale * factor;
  }

  function clampVal(v, lo, hi) {
    if (lo > hi) { var t = lo; lo = hi; hi = t; }
    if (v < lo) { return lo; }
    if (v > hi) { return hi; }
    return v;
  }

  // Clamp a normalized position [x,y] into the safe-zone rectangle. Returns
  // { x, y, changed } — `changed` is true if either coordinate moved (so the
  // caller can skip a needless setValue). Only positions OUTSIDE the zone move.
  function clampToSafe(x, y, left, right, top, bottom) {
    var nx = clampVal(x, left, right);
    var ny = clampVal(y, top, bottom);
    return { x: nx, y: ny, changed: (nx !== x || ny !== y) };
  }

  return {
    RATIOS: RATIOS,
    ORDER: ORDER,
    detectRatio: detectRatio,
    otherRatios: otherRatios,
    stripTrailingRatioLabel: stripTrailingRatioLabel,
    buildName: buildName,
    fillScale: fillScale,
    clampToSafe: clampToSafe
  };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = RSZ; }
