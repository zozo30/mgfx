import assert from "node:assert/strict";
import test from "node:test";
import { parseSvgVectorDocument } from "./svg-document.js";

test("SVG documents lower inherited paint, primitives, and group transforms to vector layers", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 120 80" fill="none"
      stroke="currentColor" stroke-width="2" stroke-dasharray="3 2" stroke-dashoffset="-1">
    <g transform="translate(10 5) scale(2)">
      <rect x="0" y="0" width="20" height="12" rx="3" />
      <circle cx="28" cy="10" r="6" fill="#20d890" stroke="none" opacity="0.5" />
    </g>
  </svg>`, { red: 0.4, green: 0.8, blue: 1, alpha: 1 });
  assert.deepEqual(document.viewBox, { x: 0, y: 0, width: 120, height: 80 });
  assert.equal(document.layers.length, 2);
  assert.equal(document.layers[0]?.strokeWidth, 4);
  assert.deepEqual(document.layers[0]?.dash, { length: 6, gap: 4, offset: -2 });
  assert.equal(document.layers[1]?.dash, undefined);
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

test("SVG documents lower user-space linear gradients to native path paint", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 100 60" fill="none">
    <defs><linearGradient id="glow" gradientUnits="userSpaceOnUse" x1="5" y1="10" x2="45" y2="30"
      spreadMethod="repeat">
      <stop offset="0%" stop-color="#ff8000" stop-opacity="0.5"/>
      <stop offset="50%" stop-color="#8060ff" stop-opacity="0.9"/>
      <stop offset="100%" style="stop-color: #20d890; stop-opacity: 0.75"/>
    </linearGradient></defs>
    <g transform="translate(10 4)"><rect x="0" y="0" width="50" height="30"
      fill="url(#glow)" fill-opacity="0.8"/></g>
  </svg>`);
  const gradient = document.layers[0]?.fillGradient;
  assert.deepEqual(gradient?.start, { x: 15, y: 14 });
  assert.deepEqual(gradient?.end, { x: 55, y: 34 });
  assert.equal(gradient?.startColor.alpha, 0.4);
  assert.ok(Math.abs((gradient?.endColor.alpha ?? 0) - 0.6) < 1e-9);
  assert.equal(gradient?.stops?.length, 3);
  assert.equal(gradient?.stops?.[1]?.offset, 0.5);
  assert.equal(gradient?.spread, "repeat");
  assert.equal(document.layers[0]?.fill, undefined);
});

test("SVG object-bounding-box gradients map onto transformed path bounds", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 100 50">
    <defs><linearGradient id="horizontal"><stop offset="0" stop-color="red"/>
      <stop offset="1" stop-color="blue"/></linearGradient></defs>
    <rect x="10" y="5" width="40" height="20" transform="translate(3 2)" fill="url(#horizontal)"/>
  </svg>`);
  assert.deepEqual(document.layers[0]?.fillGradient?.start, { x: 13, y: 7 });
  assert.deepEqual(document.layers[0]?.fillGradient?.end, { x: 53, y: 7 });
});

test("SVG linear gradients inherit stops and geometry through local references", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 80 20">
    <defs>
      <linearGradient id="palette"><stop offset="0" stop-color="#ff4000"/>
        <stop offset=".5" stop-color="#8050ff"/><stop offset="1" stop-color="#20d890"/>
      </linearGradient>
      <linearGradient id="positioned" href="#palette" gradientUnits="userSpaceOnUse"
        x1="10" y1="0" x2="70" y2="0"/>
    </defs>
    <rect width="80" height="20" fill="url(#positioned)"/>
  </svg>`);
  assert.equal(document.layers[0]?.fillGradient?.stops?.length, 3);
  assert.deepEqual(document.layers[0]?.fillGradient?.start, { x: 10, y: 0 });
  assert.deepEqual(document.layers[0]?.fillGradient?.end, { x: 70, y: 0 });
  assert.throws(() => parseSvgVectorDocument(`<svg viewBox="0 0 10 10"><defs>
    <linearGradient id="a" href="#b"/><linearGradient id="b" href="#a"/>
    </defs><rect width="10" height="10" fill="url(#a)"/></svg>`), /reference cycle/);
});

test("SVG centered radial gradients lower to source-space basis paint", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 60 40"><defs>
    <radialGradient id="orb" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#20d890"/>
    </radialGradient></defs><ellipse cx="30" cy="20" rx="20" ry="10" fill="url(#orb)"/>
  </svg>`);
  const radial = document.layers[0]?.fillRadialGradient;
  assert.deepEqual(radial?.center, { x: 30, y: 20 });
  assert.ok(Math.abs((radial?.axisX.x ?? 0) - 20) < 0.001);
  assert.ok(Math.abs((radial?.axisY.y ?? 0) - 10) < 0.001);
  assert.equal(document.layers[0]?.fillGradient, undefined);
});

test("SVG multi-stop radial gradients retain ordered native stops", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 40 40"><defs>
    <radialGradient id="orb" fx="35%" fy="40%" fr="5%" spreadMethod="reflect"><stop offset="0" stop-color="#ffffff"/>
      <stop offset="45%" stop-color="#40e0b0"/><stop offset="1" stop-color="#108050"/>
    </radialGradient></defs><circle cx="20" cy="20" r="18" fill="url(#orb)"/></svg>`);
  const radial = document.layers[0]?.fillRadialGradient;
  assert.equal(radial?.stops?.length, 3);
  assert.equal(radial?.spread, "reflect");
  assert.ok(Math.abs((radial?.focal?.x ?? 0) - 14.6) < 0.001);
  assert.ok(Math.abs((radial?.focal?.y ?? 0) - 16.4) < 0.001);
  assert.ok(Math.abs((radial?.focalRadius ?? 0) - 0.1) < 0.0001);
  assert.equal(radial?.stops?.[1]?.offset, 0.45);
  assert.ok((radial?.stops?.[1]?.color.green ?? 0) > 0.85);
});

test("SVG radial gradients inherit local geometry, spread, and stops", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 40 40"><defs>
    <radialGradient id="base" r="40%" fx="30%" fy="40%" fr="5%" spreadMethod="repeat">
      <stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#40e0b0"/>
      <stop offset="1" stop-color="#108050"/></radialGradient>
    <radialGradient id="derived" xlink:href="#base" cx="60%"/>
    </defs><circle cx="20" cy="20" r="20" fill="url(#derived)"/></svg>`);
  const radial = document.layers[0]?.fillRadialGradient;
  assert.deepEqual(radial?.center, { x: 24, y: 20 });
  assert.deepEqual(radial?.focal, { x: 12, y: 16 });
  assert.ok(Math.abs((radial?.focalRadius ?? 0) - 0.125) < 0.0001);
  assert.equal(radial?.spread, "repeat");
  assert.equal(radial?.stops?.length, 3);
  assert.throws(() => parseSvgVectorDocument(`<svg viewBox="0 0 10 10"><defs>
    <radialGradient id="a" href="#b"/><radialGradient id="b" href="#a"/>
    </defs><rect width="10" height="10" fill="url(#a)"/></svg>`), /reference cycle/);
});

test("SVG vector lowering reports unresolved gradient paint", () => {
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 10 10"><path d="M0 0H10V10Z" fill="url(#missing)"/></svg>`),
  /gradient #missing/);
});

test("SVG documents lower linear-gradient dashed strokes without client geometry", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 40 20" fill="none">
    <defs><linearGradient id="edge"><stop offset="0" stop-color="#ff8000"/>
      <stop offset="1" stop-color="#ffe050"/></linearGradient></defs>
    <path d="M2 10H38" stroke="url(#edge)" stroke-width="2"
      stroke-dasharray="5 3 1 3" stroke-dashoffset="-1"
      stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="6"/>
  </svg>`);
  assert.deepEqual(document.layers[0]?.strokeGradient?.start, { x: 2, y: 10 });
  assert.deepEqual(document.layers[0]?.strokeGradient?.end, { x: 38, y: 10 });
  assert.deepEqual(document.layers[0]?.dash, { values: [5, 3, 1, 3], offset: -1 });
  assert.equal(document.layers[0]?.lineCap, "square");
  assert.equal(document.layers[0]?.lineJoin, "miter");
  assert.equal(document.layers[0]?.miterLimit, 6);
  assert.equal(document.layers[0]?.stroke, undefined);
});
