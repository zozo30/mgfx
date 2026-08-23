import assert from "node:assert/strict";
import test from "node:test";
import { loadLucideIcons } from "./icon-pack.js";

test("the installed Lucide pack supplies direct SVG path data", async () => {
  const icons = await loadLucideIcons(["activity", "badge-check", "circle", "pause-circle"]);
  assert.deepEqual(icons.map((icon) => icon.name), ["activity", "badge-check", "circle", "pause-circle"]);
  assert.ok(icons.every((icon) => icon.path.startsWith("M") || icon.path.startsWith("m")));
  assert.match(icons[2]!.path, /A10 10/);
  assert.match(icons[3]!.path, /L/);
});
