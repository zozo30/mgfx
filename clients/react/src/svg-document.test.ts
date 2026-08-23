import assert from "node:assert/strict";
import test from "node:test";
import { parseSvgVectorDocument } from "./svg-document.js";

test("SVG documents lower inherited paint, primitives, and group transforms to vector layers", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 120 80" fill="none"
      stroke="currentColor" stroke-width="2">
    <g transform="translate(10 5) scale(2)">
      <rect x="0" y="0" width="20" height="12" rx="3" />
      <circle cx="28" cy="10" r="6" fill="#20d890" stroke="none" opacity="0.5" />
    </g>
  </svg>`, { red: 0.4, green: 0.8, blue: 1, alpha: 1 });
  assert.deepEqual(document.viewBox, { x: 0, y: 0, width: 120, height: 80 });
  assert.equal(document.layers.length, 2);
  assert.equal(document.layers[0]?.strokeWidth, 4);
  assert.deepEqual(document.layers[0]?.stroke,
    { red: 0.4, green: 0.8, blue: 1, alpha: 1 });
  assert.equal(document.layers[1]?.fill?.alpha, 0.5);
  assert.match(document.layers[0]?.path ?? "", /M16 5/);
});

test("SVG vector lowering rejects executable or external document content", () => {
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 10 10"><script>bad()</script><path d="M0 0L1 1"/></svg>`),
  /external or executable/);
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 10 10"><image href="https://example.com/a.png"/></svg>`),
  /external or executable/);
});
