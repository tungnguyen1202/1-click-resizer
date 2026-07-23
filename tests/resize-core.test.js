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
  // strips the new x-style labels too
  assert.strictEqual(RSZ.stripTrailingRatioLabel("Clip 9x16"), "Clip");
  assert.strictEqual(RSZ.stripTrailingRatioLabel("Clip 1x1"), "Clip");
  // tolerates accidental trailing spaces from manual renames
  assert.strictEqual(RSZ.stripTrailingRatioLabel("Clip 9-16 "), "Clip");
  assert.strictEqual(RSZ.buildName("Clip 9x16 ", "4-5"), "Clip 4x5");
});

test("buildName appends the x-style label and swaps any prior label", () => {
  var base = "Brand vid17.0 [editor.a][editor.b]";
  assert.strictEqual(RSZ.buildName(base, "4-5"), base + " 4x5");
  assert.strictEqual(RSZ.buildName(base, "9-16"), base + " 9x16");
  assert.strictEqual(RSZ.buildName(base, "1-1"), base + " 1x1");
  // swaps a prior x-style label (no stacking)
  assert.strictEqual(RSZ.buildName(base + " 9x16", "1-1"), base + " 1x1");
  // also swaps a legacy dash label from older versions
  assert.strictEqual(RSZ.buildName(base + " 4-5", "9-16"), base + " 9x16");
});

test("isLogoName detects the team's logo naming conventions", () => {
  // core hints: "logo" and "fav" (covers fav vid / fav video / favicon)
  assert.strictEqual(RSZ.isLogoName("Logo"), true);
  assert.strictEqual(RSZ.isLogoName("brand_logo.png"), true);
  assert.strictEqual(RSZ.isLogoName("fav vid"), true);
  assert.strictEqual(RSZ.isLogoName("Fav Video 01"), true);
  assert.strictEqual(RSZ.isLogoName("FAVICON"), true);
  // case-insensitive
  assert.strictEqual(RSZ.isLogoName("LOGO_final"), true);
  // non-logo overlays stay unmatched
  assert.strictEqual(RSZ.isLogoName("Text All-In-One"), false);
  assert.strictEqual(RSZ.isLogoName("background.mp4"), false);
  // guards
  assert.strictEqual(RSZ.isLogoName(""), false);
  assert.strictEqual(RSZ.isLogoName(null), false);
  assert.strictEqual(RSZ.isLogoName(undefined), false);
});

test("clamp01 keeps values in [0,1]", () => {
  assert.strictEqual(RSZ.clamp01(-0.2), 0);
  assert.strictEqual(RSZ.clamp01(1.4), 1);
  assert.strictEqual(RSZ.clamp01(0.42), 0.42);
});
