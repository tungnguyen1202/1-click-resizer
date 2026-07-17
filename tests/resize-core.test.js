const test = require("node:test");
const assert = require("node:assert");
const RSZ = require("../com.oneclickresize.panel/jsx/resize-core.jsx");

test("detectRatio matches the three standard 1080 sizes", () => {
  assert.strictEqual(RSZ.detectRatio(1080, 1920), "9-16");
  assert.strictEqual(RSZ.detectRatio(1080, 1350), "4-5");
  assert.strictEqual(RSZ.detectRatio(1080, 1080), "1-1");
});

test("detectRatio matches by aspect ratio at other resolutions", () => {
  assert.strictEqual(RSZ.detectRatio(2160, 3840), "9-16");
  assert.strictEqual(RSZ.detectRatio(1920, 1080), null); // 16:9 is not in our set
});

test("detectRatio returns null on bad input", () => {
  assert.strictEqual(RSZ.detectRatio(0, 100), null);
  assert.strictEqual(RSZ.detectRatio(100, 0), null);
});

test("detectRatio tolerance boundary (EPS = 0.02 on aspect)", () => {
  // 1080/1900 = 0.5684 vs 0.5625 -> diff ~0.006, inside tolerance
  assert.strictEqual(RSZ.detectRatio(1080, 1900), "9-16");
  // 1080/2100 = 0.5143 -> ~0.048 from 9:16, outside tolerance
  assert.strictEqual(RSZ.detectRatio(1080, 2100), null);
});

test("otherRatios returns the two remaining labels in order", () => {
  assert.deepStrictEqual(RSZ.otherRatios("9-16"), ["4-5", "1-1"]);
  assert.deepStrictEqual(RSZ.otherRatios("4-5"), ["9-16", "1-1"]);
  assert.deepStrictEqual(RSZ.otherRatios("1-1"), ["9-16", "4-5"]);
});

test("stripTrailingRatioLabel removes only a trailing known label", () => {
  assert.strictEqual(RSZ.stripTrailingRatioLabel("Clip 9-16"), "Clip");
  assert.strictEqual(RSZ.stripTrailingRatioLabel("Clip 4-5"), "Clip");
  assert.strictEqual(RSZ.stripTrailingRatioLabel("Clip"), "Clip");
  // must not strip a label that is not at the end
  assert.strictEqual(RSZ.stripTrailingRatioLabel("9-16 master"), "9-16 master");
  // must not strip a bracketed tag that merely contains digits
  assert.strictEqual(RSZ.stripTrailingRatioLabel("vid17.0 [tung]"), "vid17.0 [tung]");
  // tolerates accidental trailing spaces from manual renames
  assert.strictEqual(RSZ.stripTrailingRatioLabel("Clip 9-16 "), "Clip");
  assert.strictEqual(RSZ.buildName("Clip 9-16 ", "4-5"), "Clip 4-5");
});

test("buildName copies base name and appends target label", () => {
  var base = "Brand vid17.0 [editor.a][editor.b]";
  assert.strictEqual(RSZ.buildName(base, "4-5"), base + " 4-5");
  // re-resizing an already-labelled sequence swaps the label, no stacking
  assert.strictEqual(RSZ.buildName(base + " 9-16", "1-1"), base + " 1-1");
});

test("fillScale covers the target frame on both axes, never scales down", () => {
  // 1080x1920 (9-16) -> 1080x1350 (4-5): smaller on both axes, no change
  assert.strictEqual(RSZ.fillScale(100, 1080, 1920, 1080, 1350), 100);
  // 1080x1920 -> 1080x1080 (1-1): no change
  assert.strictEqual(RSZ.fillScale(100, 1080, 1920, 1080, 1080), 100);
  // 1080x1080 (1-1) -> 1080x1920 (9-16): taller, scale up 1920/1080
  assert.ok(Math.abs(RSZ.fillScale(100, 1080, 1080, 1080, 1920) - 177.78) < 0.1);
  // preserves the editor's existing zoom: 150% base, 4-5 -> 9-16
  assert.ok(Math.abs(RSZ.fillScale(150, 1080, 1350, 1080, 1920) - 213.33) < 0.1);
  // equal frames: unchanged
  assert.strictEqual(RSZ.fillScale(100, 1080, 1080, 1080, 1080), 100);
  // WIDTH matters: 720x1280 (9-16) -> 1080x1080 (1-1) needs 1.5x to span width
  assert.strictEqual(RSZ.fillScale(100, 720, 1280, 1080, 1080), 150);
  // 540x675 (4-5) -> 1080x1080 (1-1): width factor 2.0 beats height factor 1.6
  assert.strictEqual(RSZ.fillScale(100, 540, 675, 1080, 1080), 200);
  // degenerate source dims are a no-op, never Infinity/NaN
  assert.strictEqual(RSZ.fillScale(100, 0, 0, 1080, 1920), 100);
  assert.strictEqual(RSZ.fillScale(100, -10, 1920, 1080, 1920), 100);
});

test("clampToSafe only moves positions outside the zone", () => {
  // inside the zone -> unchanged
  var a = RSZ.clampToSafe(0.5, 0.5, 0.05, 0.95, 0.12, 0.78);
  assert.strictEqual(a.x, 0.5);
  assert.strictEqual(a.y, 0.5);
  assert.strictEqual(a.changed, false);
  // below the safe bottom -> pulled up to the bottom edge
  var b = RSZ.clampToSafe(0.5, 0.92, 0.05, 0.95, 0.12, 0.78);
  assert.strictEqual(b.y, 0.78);
  assert.strictEqual(b.changed, true);
  // above the safe top -> pulled down to the top edge
  var c = RSZ.clampToSafe(0.5, 0.03, 0.05, 0.95, 0.12, 0.78);
  assert.strictEqual(c.y, 0.12);
  assert.strictEqual(c.changed, true);
  // outside horizontally -> clamped in x
  var d = RSZ.clampToSafe(0.99, 0.5, 0.05, 0.95, 0.12, 0.78);
  assert.strictEqual(d.x, 0.95);
  assert.strictEqual(d.changed, true);
  // inverted bounds are normalized, not honored blindly
  var e = RSZ.clampToSafe(0.5, 0.5, 0.9, 0.1, 0.8, 0.2);
  assert.strictEqual(e.x, 0.5);
  assert.strictEqual(e.y, 0.5);
  assert.strictEqual(e.changed, false);
});
