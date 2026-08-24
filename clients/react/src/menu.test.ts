import assert from "node:assert/strict";
import test from "node:test";
import { nextMenuIndex, type MenuItem } from "./navigation.js";

const items: readonly MenuItem[] = [
  { label: "ONE" },
  { label: "DISABLED", disabled: true },
  { label: "THREE" },
];

test("menu navigation wraps and skips disabled options", () => {
  assert.equal(nextMenuIndex(items, 0, 1), 2);
  assert.equal(nextMenuIndex(items, 2, 1), 0);
  assert.equal(nextMenuIndex(items, 0, -1), 2);
});

test("menu navigation reports no target when every option is disabled", () => {
  assert.equal(nextMenuIndex([{ label: "NO", disabled: true }], 0, 1), -1);
  assert.equal(nextMenuIndex([], -1, 1), -1);
});
