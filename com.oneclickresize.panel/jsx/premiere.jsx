// 1-Click Resizer — Premiere DOM layer.
//
// ┌─ PROBE FINDINGS (from diagnostic.jsx, probe v1 2026-07-16) ─────────────┐
// │ POSITION_UNITS       = "normalized"   // Position prints as 0.5,0.5      │
// │ Motion component: find by displayName === "Motion" (was index 1; Opacity │
// │   was index 0 — locate by name, do NOT hardcode the index)              │
// │ Position property: displayName === "Position" ([x,y] normalized)        │
// │ Scale property:    displayName === "Scale"    (percent; Uniform Scale on)│
// │ DUPLICATE_METHOD   = "clone"  // activeSequence.clone() is a function;   │
// │   qe.duplicate() and createClone() are undefined. clone() does not       │
// │   return the new sequence → diff app.project.sequences IDs to find it.   │
// │ app.project.activeSequence is assignable (settable).                     │
// │ NATIVE_SIZE = UNAVAILABLE  // getXMPMetadata() exposes stDim:w/h for only │
// │   SOME clips (a few .mp4/.mov); most .mp4, ALL .png, .aep, .aegraphic     │
// │   return no dimensions. Coverage-by-native-size is therefore infeasible.  │
// │ REPOSITION MODEL (native-size-free): overlay SCALE is never touched.      │
// │   • Logo (clip name contains "Logo"): pin Y to its nearer edge, marginPx  │
// │     away (keep X). • Text/graphic/MOGRT (Graphics component): snap Y to    │
// │   the target ratio's guide line (keep X). • Background track (default V1): │
// │   FILL scale-up by cover math over BOTH axes scale*max(1,tgtW/srcW,        │
// │   tgtH/srcH). Everything else on overlay tracks is left untouched.         │
// │ NOTE: v1 operates on the fixed Motion effect only (find component by      │
// │   displayName "Motion"; props by displayName "Scale"/"Position").         │
// └────────────────────────────────────────────────────────────────────────┘

#include "resize-core.jsx"

// ---- small DOM helpers -----------------------------------------------------

function RSZ_findComponent(clip, name) {
  for (var c = 0; c < clip.components.numItems; c++) {
    if (clip.components[c].displayName === name) { return clip.components[c]; }
  }
  return null;
}

function RSZ_findProp(comp, name) {
  for (var p = 0; p < comp.properties.numItems; p++) {
    if (comp.properties[p].displayName === name) { return comp.properties[p]; }
  }
  return null;
}

// A clip is a graphic (Essential Graphics / MOGRT / title) if any component's
// display name contains "Graphic". Such clips are never scaled.
function RSZ_isGraphicClip(clip) {
  for (var c = 0; c < clip.components.numItems; c++) {
    var dn = clip.components[c].displayName;
    if (dn && dn.indexOf("Graphic") !== -1) { return true; }
  }
  return false;
}

// Minimal JSON string escaper. ExtendScript (ES3) has no reliable JSON global,
// so payloads are built by hand; only string values need escaping. Sequence
// names may contain quotes/backslashes; control chars are replaced with space.
function RSZ_esc(s) {
  s = String(s);
  var out = "";
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    var code = s.charCodeAt(i);
    if (ch === '"') { out += '\\"'; }
    else if (ch === '\\') { out += '\\\\'; }
    else if (code < 32) { out += " "; }
    else { out += ch; }
  }
  return out;
}

// ---- source selection -------------------------------------------------------

// Resolve a Sequence object from a Project-panel projectItem (a sequence need
// not be open to be cloned). Match by the sequence's own projectItem node id
// when available; fall back to name.
function RSZ_seqFromProjectItem(item) {
  if (!item) { return null; }
  var seqs = app.project.sequences;
  var i, s;
  for (i = 0; i < seqs.numSequences; i++) {
    s = seqs[i];
    try {
      if (s.projectItem && item.nodeId && s.projectItem.nodeId === item.nodeId) { return s; }
    } catch (e) {}
  }
  for (i = 0; i < seqs.numSequences; i++) {           // fallback: by name
    if (seqs[i].name === item.name) { return seqs[i]; }
  }
  return null;
}

function RSZ_isSequenceItem(item) {
  try { return !!(item && typeof item.isSequence === "function" && item.isSequence()); }
  catch (e) { return false; }
}

// The sequence to act on: the one SELECTED in the Project panel if it is a
// sequence, otherwise the open/active sequence. Returns { seq, from }.
function RSZ_resolveSource() {
  try {
    if (typeof app.getCurrentProjectViewSelection === "function") {
      var sel = app.getCurrentProjectViewSelection();
      if (sel && sel.length) {
        for (var i = 0; i < sel.length; i++) {
          if (RSZ_isSequenceItem(sel[i])) {
            var s = RSZ_seqFromProjectItem(sel[i]);
            if (s) { return { seq: s, from: "selection" }; }
          }
        }
      }
    }
  } catch (e) {}
  var a = app.project.activeSequence;
  return a ? { seq: a, from: "active" } : { seq: null, from: "none" };
}

// Diagnostics for when no source can be found — surfaced to the panel so a
// single failed run tells us exactly which API is missing.
function RSZ_sourceDiag() {
  var hasSelApi = (typeof app.getCurrentProjectViewSelection === "function");
  var selCount = -1, seqSel = 0;
  try {
    if (hasSelApi) {
      var sel = app.getCurrentProjectViewSelection();
      selCount = sel ? sel.length : 0;
      for (var i = 0; i < selCount; i++) { if (RSZ_isSequenceItem(sel[i])) { seqSel++; } }
    }
  } catch (e) {}
  return '"selApi":' + (hasSelApi ? 'true' : 'false')
       + ',"selCount":' + selCount + ',"seqSelected":' + seqSel
       + ',"hasActive":' + (app.project.activeSequence ? 'true' : 'false');
}

// ---- sequence info ---------------------------------------------------------

// Internal: returns the live objects + geometry (not for evalScript).
function RSZ_activeInfoObj() {
  var r = RSZ_resolveSource();
  var seq = r.seq;
  if (!seq) { return null; }
  var st = seq.getSettings();
  var w = st.videoFrameWidth;
  var h = st.videoFrameHeight;
  return { seq: seq, from: r.from, name: seq.name, width: w, height: h, ratio: RSZ.detectRatio(w, h) };
}

// Public (evalScript): JSON string for the panel. detectRatio is the single
// source of truth for the ratio label; the panel only displays it.
function RSZ_activeSequenceInfo() {
  var o = RSZ_activeInfoObj();
  if (!o) { return "null"; }
  return '{"name":"' + RSZ_esc(o.name) + '","width":' + o.width
       + ',"height":' + o.height + ',"from":"' + o.from + '"'
       + ',"ratio":' + (o.ratio ? ('"' + o.ratio + '"') : 'null') + '}';
}

// ---- duplication -----------------------------------------------------------

function RSZ_sequenceIdSet() {
  var ids = {};
  var seqs = app.project.sequences;
  for (var i = 0; i < seqs.numSequences; i++) { ids[seqs[i].sequenceID] = true; }
  return ids;
}

// clone() does not return the new sequence, so find it by diffing sequence IDs.
function RSZ_duplicateSequence(sourceSeq) {
  var before = RSZ_sequenceIdSet();
  sourceSeq.clone();
  var seqs = app.project.sequences;
  for (var i = 0; i < seqs.numSequences; i++) {
    if (!before[seqs[i].sequenceID]) { return seqs[i]; }
  }
  return null;
}

// Sets the frame size and verifies it actually took effect (some hosts can
// silently ignore setSettings fields). Returns false on mismatch so the caller
// can report FRAME_SIZE_FAILED instead of pretending the resize happened.
function RSZ_setFrameSize(seq, w, h) {
  if (!seq) { return false; }
  var st = seq.getSettings();
  st.videoFrameWidth = w;
  st.videoFrameHeight = h;
  seq.setSettings(st);
  var chk = seq.getSettings();
  return (chk.videoFrameWidth === w && chk.videoFrameHeight === h);
}

// ---- per-clip FILL (background track only) ---------------------------------

function RSZ_applyFill(clip, srcW, srcH, tgtW, tgtH) {
  var motion = RSZ_findComponent(clip, "Motion");
  if (!motion) { return false; }
  var scaleProp = RSZ_findProp(motion, "Scale");
  if (!scaleProp) { return false; }
  var cur = scaleProp.getValue();
  var next = RSZ.fillScale(cur, srcW, srcH, tgtW, tgtH);
  if (next === cur) { return false; }
  scaleProp.setValue(next, true);
  // With Uniform Scale unticked, "Scale" drives height only — scale the width
  // by the same factor so the background fills without distortion.
  var uni = RSZ_findProp(motion, "Uniform Scale");
  if (uni && !uni.getValue()) {
    var sw = RSZ_findProp(motion, "Scale Width");
    if (sw) { sw.setValue(sw.getValue() * (next / cur), true); }
  }
  return true;
}

function RSZ_isLogoClip(clip) {
  return !!(clip.name && String(clip.name).toLowerCase().indexOf("logo") !== -1);
}

// Set an overlay clip's vertical Motion Position, keeping X and Scale.
// Returns true if it moved.
function RSZ_setClipY(clip, newY) {
  var motion = RSZ_findComponent(clip, "Motion");
  if (!motion) { return false; }
  var posProp = RSZ_findProp(motion, "Position");
  if (!posProp) { return false; }
  var pos = posProp.getValue(); // [x, y] normalized
  if (pos[1] === newY) { return false; }
  posProp.setValue([pos[0], newY], true);
  return true;
}

// Pin a logo to its nearer edge (keep X + Scale).
function RSZ_repositionLogo(clip, frameH, marginPx) {
  var motion = RSZ_findComponent(clip, "Motion");
  if (!motion) { return false; }
  var posProp = RSZ_findProp(motion, "Position");
  if (!posProp) { return false; }
  var pos = posProp.getValue();
  var ny = RSZ.edgePinY(pos[1], frameH, marginPx);
  if (pos[1] === ny) { return false; }
  posProp.setValue([pos[0], ny], true);
  return true;
}

// Make a sequence the active one — assignment first, openSequence as fallback
// (needed when the source was picked in the Project panel but not open).
function RSZ_makeActive(seq) {
  try { app.project.activeSequence = seq; } catch (e) {}
  try {
    var a = app.project.activeSequence;
    if ((!a || a.sequenceID !== seq.sequenceID) && seq.sequenceID
        && typeof app.project.openSequence === "function") {
      app.project.openSequence(seq.sequenceID);
    }
  } catch (e2) {}
}

// ---- orchestration ---------------------------------------------------------

// Args (all numbers): bgTrack = 1-based background track (default 1);
// guide9/guide45/guide11 = the text guide Y (normalized 0..1) per ratio
// (default 0.5 = centre); logoMargin = logo edge margin in px (default 50).
// Overlays keep their Scale: text/graphic/MOGRT snap to the target ratio's
// guide Y (X unchanged); logos pin to their nearer edge, marginPx away.
// Returns a hand-built JSON string (no JSON global in ExtendScript). Each
// target is isolated in try/catch so one failure still returns well-formed
// results and always restores the original active sequence.
function RSZ_runResizeAll(bgTrack, guide9, guide45, guide11, logoMargin) {
  bgTrack = parseInt(bgTrack, 10);
  if (!bgTrack || bgTrack < 1) { bgTrack = 1; }
  function guideOf(v) { v = parseFloat(v); return isNaN(v) ? 0.5 : RSZ.clamp01(v); }
  var guideByRatio = { "9-16": guideOf(guide9), "4-5": guideOf(guide45), "1-1": guideOf(guide11) };
  logoMargin = parseFloat(logoMargin);
  if (isNaN(logoMargin) || logoMargin < 0) { logoMargin = 50; }

  var info = RSZ_activeInfoObj();
  if (!info) { return '{"ok":false,"error":"NO_ACTIVE_SEQUENCE",' + RSZ_sourceDiag() + '}'; }
  if (!info.ratio) {
    return '{"ok":false,"error":"UNKNOWN_RATIO","width":' + info.width + ',"height":' + info.height + '}';
  }

  var sourceSeq = info.seq;
  var srcW = info.width;
  var srcH = info.height;
  var baseName = info.name;
  var targets = RSZ.otherRatios(info.ratio);
  var parts = [];

  for (var t = 0; t < targets.length; t++) {
    var tgtRatio = targets[t];
    var tgt = RSZ.RATIOS[tgtRatio];
    var item;
    var dup = null; // visible in catch so a stranded duplicate can be reported
    try {
      // Re-select the source each time so every duplicate derives from the
      // original (also opens it if it was only selected in the Project panel).
      RSZ_makeActive(sourceSeq);
      dup = RSZ_duplicateSequence(sourceSeq);
      if (!dup) {
        item = '{"ratio":"' + tgtRatio + '","error":"DUPLICATE_FAILED"}';
      } else if (!RSZ_setFrameSize(dup, tgt.w, tgt.h)) {
        // Don't scale/clamp against a frame that never changed.
        dup.name = RSZ.buildName(baseName, tgtRatio);
        item = '{"ratio":"' + tgtRatio + '","error":"FRAME_SIZE_FAILED","orphan":"'
             + RSZ_esc(dup.name) + '"}';
      } else {
        dup.name = RSZ.buildName(baseName, tgtRatio);

        var scaled = 0;   // background clips scaled to fill
        var moved = 0;    // overlays repositioned (guide / logo pin)
        var bgIndex = bgTrack - 1;
        // If the configured background track doesn't exist on this sequence
        // (e.g. a setting left over from a larger project), fall back to V1 so
        // the real background is never mistaken for an overlay.
        if (bgIndex < 0 || bgIndex >= dup.videoTracks.numTracks) { bgIndex = 0; }
        var guideY = guideByRatio[tgtRatio];

        for (var vt = 0; vt < dup.videoTracks.numTracks; vt++) {
          var track = dup.videoTracks[vt];
          for (var c = 0; c < track.clips.numItems; c++) {
            var clip = track.clips[c];
            if (vt === bgIndex) {
              // Background: cover the new frame on both axes (fillScale is a
              // no-op when the current scale already covers).
              if (!RSZ_isGraphicClip(clip)) {
                try { if (RSZ_applyFill(clip, srcW, srcH, tgt.w, tgt.h)) { scaled++; } } catch (ce) {}
              }
            } else if (RSZ_isLogoClip(clip)) {
              // Logo: keep Scale, pin to its nearer edge (marginPx away).
              try { if (RSZ_repositionLogo(clip, tgt.h, logoMargin)) { moved++; } } catch (le) {}
            } else if (RSZ_isGraphicClip(clip)) {
              // Text / graphic / MOGRT: keep Scale, snap Y to this ratio's guide.
              try { if (RSZ_setClipY(clip, guideY)) { moved++; } } catch (se) {}
            }
          }
        }
        item = '{"ratio":"' + tgtRatio + '","name":"' + RSZ_esc(dup.name)
             + '","scaled":' + scaled + ',"moved":' + moved + '}';
      }
    } catch (te) {
      item = '{"ratio":"' + tgtRatio + '","error":"' + RSZ_esc(String(te)) + '"'
           + (dup ? ',"orphan":"' + RSZ_esc(dup.name) + '"' : '') + '}';
    }
    parts.push(item);
  }

  RSZ_makeActive(sourceSeq);
  return '{"ok":true,"source":"' + info.ratio + '","from":"' + info.from
       + '","results":[' + parts.join(",") + '],"error":null}';
}
