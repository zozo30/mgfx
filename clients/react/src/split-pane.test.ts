import assert from "node:assert/strict";
import test from "node:test";
import { clampSplitRatio } from "./components.js";

test("split pane ratio clamps to both configured limits", () => {
  assert.equal(clampSplitRatio(-1, 0.2, 0.8), 0.2);
  assert.equal(clampSplitRatio(0.45, 0.2, 0.8), 0.45);
  assert.equal(clampSplitRatio(2, 0.2, 0.8), 0.8);
});
