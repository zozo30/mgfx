import assert from "node:assert/strict";
import test from "node:test";
import { disclosureProgress } from "./components.js";

test("disclosure animation expands, completes, and reverses from an interruption", () => {
  assert.equal(disclosureProgress(0, 1, 1_000, 1_000), 0);
  const middle = disclosureProgress(0, 1, 1_000, 1_130);
  assert.ok(middle > 0 && middle < 1);
  assert.equal(disclosureProgress(0, 1, 1_000, 1_260), 1);
  assert.equal(disclosureProgress(middle, 0, 1_130, 1_130), middle);
  const closing = disclosureProgress(middle, 0, 1_130, 1_260);
  assert.ok(closing > 0 && closing < middle);
  assert.equal(disclosureProgress(middle, 0, 1_130, 1_390), 0);
});
