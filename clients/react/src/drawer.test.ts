import assert from "node:assert/strict";
import test from "node:test";
import { animatedDrawerWidth } from "./app.js";

test("drawer width eases from the icon rail to its expanded minimum", () => {
  assert.equal(animatedDrawerWidth(76, 248, 1_000, 1_000), 76);
  const middle = animatedDrawerWidth(76, 248, 1_000, 1_120);
  assert.ok(middle > 162 && middle < 248);
  assert.equal(animatedDrawerWidth(76, 248, 1_000, 1_240), 248);
  assert.equal(animatedDrawerWidth(76, 248, 1_000, 2_000), 248);
});

test("drawer width reverses smoothly from its current animated width", () => {
  const interrupted = animatedDrawerWidth(76, 248, 1_000, 1_080);
  assert.ok(interrupted > 76 && interrupted < 248);
  assert.equal(animatedDrawerWidth(interrupted, 76, 1_080, 1_080), interrupted);
  const closing = animatedDrawerWidth(interrupted, 76, 1_080, 1_200);
  assert.ok(closing < interrupted && closing > 76);
  assert.equal(animatedDrawerWidth(interrupted, 76, 1_080, 1_320), 76);
});
