import assert from "node:assert/strict";
import test from "node:test";
import { canonicalPath } from "./vector-path.js";

test("SVG paths normalize to backend-neutral move, line, cubic, and close commands", () => {
  const path = canonicalPath("m2 2h20v20H2z");
  assert.deepEqual(path.segments.map((segment) => segment.verb),
    ["move", "line", "line", "line", "close"]);
  assert.deepEqual(path.bounds, { x: 2, y: 2, width: 20, height: 20 });
});

test("quadratic curves and arcs become canonical cubic commands without triangles", () => {
  const path = canonicalPath("M2 12 Q12 2 18 12 A4 4 0 0 1 22 16");
  assert.ok(path.segments.slice(1).every((segment) => segment.verb === "cubic"));
  assert.equal("indices" in path, false);
  assert.equal("positions" in path, false);
});

test("canonical path resources are stable for repeated component renders", () => {
  const first = canonicalPath("M0 0L10 10");
  const second = canonicalPath("M0 0L10 10");
  assert.equal(first, second);
  assert.equal(first.resourceId, second.resourceId);
});
