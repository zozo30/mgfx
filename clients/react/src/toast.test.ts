import assert from "node:assert/strict";
import test from "node:test";
import { toastAnimation } from "./navigation.js";

test("toast presentation eases in, holds, and fades before dismissal", () => {
  assert.deepEqual(toastAnimation(0, 3_200), { opacity: 0, translateY: 22 });
  const entering = toastAnimation(110, 3_200);
  assert.ok(entering.opacity > 0 && entering.opacity < 1);
  assert.ok(entering.translateY > 0 && entering.translateY < 22);
  assert.deepEqual(toastAnimation(500, 3_200), { opacity: 1, translateY: 0 });
  const exiting = toastAnimation(3_100, 3_200);
  assert.ok(exiting.opacity > 0 && exiting.opacity < 1);
  assert.equal(toastAnimation(3_200, 3_200).opacity, 0);
});
