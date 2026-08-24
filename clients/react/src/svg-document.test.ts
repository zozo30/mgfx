import assert from "node:assert/strict";
import test from "node:test";
import { TextDecoration } from "@mgfx/demo-client/protocol";
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
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 10 10"><use href="https://example.com/a.svg#shape"/></svg>`),
  /local fragment/);
});

test("SVG local use instances expand symbols into independently transformed native paths", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 80 30" fill="none">
    <defs><symbol id="mark" fill="currentColor"><path d="M0 0H10V8H0Z"/></symbol>
      <g id="nested"><g transform="translate(1 1)"><circle cx="3" cy="3" r="2"/></g></g>
    </defs>
    <use href="#mark" x="5" y="4" color="#20d890"/>
    <use xlink:href="#mark" x="30" y="2" color="#4cc9ff" transform="scale(1.5)"/>
    <use href="#nested" x="60" y="4" fill="#ff8020"/>
  </svg>`);
  assert.equal(document.layers.length, 3);
  assert.match(document.layers[0]?.path ?? "", /M5 4/);
  assert.match(document.layers[1]?.path ?? "", /M45 3/);
  assert.ok((document.layers[0]?.fill?.green ?? 0) > 0.8);
  assert.ok((document.layers[1]?.fill?.blue ?? 0) > 0.9);
  assert.match(document.layers[2]?.path ?? "", /M62 8/);
});

test("SVG symbol instances map viewBox coordinates with meet alignment and none stretching", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 100 60">
    <defs><symbol id="mark" viewBox="10 20 20 10"><rect x="10" y="20" width="20" height="10"/></symbol></defs>
    <use href="#mark" x="5" y="4" width="40" height="40" fill="#20d890"/>
    <use href="#mark" x="50" y="4" width="40" height="40"
      preserveAspectRatio="none" fill="#4cc9ff"/>
  </svg>`);
  assert.equal(document.layers.length, 2);
  assert.match(document.layers[0]?.path ?? "", /M5 14H45V34H5z/);
  assert.match(document.layers[1]?.path ?? "", /M50 4H90V44H50z/);
});

test("SVG symbol instances clip slice overflow to their transformed viewport", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 60 40"><defs>
    <symbol id="mark" viewBox="0 0 20 10"><rect width="20" height="10"/></symbol>
    </defs><use href="#mark" x="5" y="4" width="20" height="20"
      preserveAspectRatio="xMidYMid slice" fill="#20d890"/></svg>`);
  assert.equal(document.layers.length, 1);
  assert.match(document.layers[0]?.path ?? "", /M-5 4H35V24H-5z/);
  assert.deepEqual(document.layers[0]?.clip, { x: 5, y: 4, width: 20, height: 20 });
});

test("SVG symbol instances reject invalid and non-rectangular viewport clips", () => {
  assert.throws(() => parseSvgVectorDocument(`<svg viewBox="0 0 50 50"><defs>
    <symbol id="mark" viewBox="0 0 10 10"><rect width="10" height="10"/></symbol>
    </defs><use href="#mark" width="0" height="20"/></svg>`), /positive numeric width/);
  assert.throws(() => parseSvgVectorDocument(`<svg viewBox="0 0 50 50"><defs>
    <symbol id="mark" viewBox="0 0 20 10"><rect width="20" height="10"/></symbol>
    </defs><use href="#mark" width="20" height="20" transform="rotate(10)"
      preserveAspectRatio="xMidYMid slice"/></svg>`), /requires polygon clipping/);
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 10 10" data-mgfx-clip="0 0 1 1"><rect width="10" height="10"/></svg>`),
  /reserved MGFX attribute/);
});

test("SVG rectangular clip paths transform and intersect through nested groups", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 60 40"><defs>
    <clipPath id="outer"><rect x="5" y="4" width="30" height="20"/></clipPath>
    <clipPath id="inner" transform="translate(2 3)"><rect x="10" width="20" height="30"/></clipPath>
    </defs><g transform="translate(3 2)" clip-path="url(#outer)">
      <rect width="50" height="35" clip-path="url(#inner)" fill="#20d890"/>
    </g></svg>`);
  assert.equal(document.layers.length, 1);
  assert.deepEqual(document.layers[0]?.clip, { x: 15, y: 6, width: 20, height: 20 });
});

test("SVG clip paths reject missing, external, and non-rectangular definitions", () => {
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 10 10"><rect width="10" height="10" clip-path="url(#missing)"/></svg>`),
  /missing #missing/);
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 10 10"><rect width="10" height="10" clip-path="url(other.svg#clip)"/></svg>`),
  /local fragment/);
  assert.throws(() => parseSvgVectorDocument(`<svg viewBox="0 0 10 10"><defs>
    <clipPath id="round"><rect width="8" height="8" rx="2"/></clipPath></defs>
    <rect width="10" height="10" clip-path="url(#round)"/></svg>`), /rounded rects/);
});

test("SVG internal CSS cascades tag, class, id, inline, gradient, and clip styles", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 60 40"><style>
    path { fill: #203040; stroke: #ffffff; }
    .paint { fill: #20d890; stroke-width: 3; }
    #hero { fill: #4cc9ff; stroke-linecap: square; }
    .hidden { display: none; }
    .gradient { fill: url(#glow); clip-path: url(#window); }
    stop.hot { stop-color: #ff8020; stop-opacity: 0.5; }
  </style><defs>
    <linearGradient id="glow"><stop class="hot"/><stop offset="1" stop-color="#8060ff"/></linearGradient>
    <clipPath id="window"><rect x="30" y="5" width="20" height="20"/></clipPath>
  </defs>
  <path id="hero" class="paint" d="M0 0H20V20H0Z" style="fill: #ffe75a"/>
  <path class="hidden" d="M0 0H60V40H0Z"/>
  <circle class="gradient" cx="40" cy="15" r="12"/>
  </svg>`);
  assert.equal(document.layers.length, 2);
  assert.ok((document.layers[0]?.fill?.red ?? 0) > 0.9);
  assert.equal(document.layers[0]?.strokeWidth, 3);
  assert.equal(document.layers[0]?.lineCap, "square");
  assert.deepEqual(document.layers[1]?.clip, { x: 30, y: 5, width: 20, height: 20 });
  assert.ok((document.layers[1]?.fillGradient?.startColor.red ?? 0) > 0.9);
  assert.equal(document.layers[1]?.fillGradient?.startColor.alpha, 0.5);
});

test("SVG internal CSS rejects unsafe or unsupported stylesheet features", () => {
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 10 10"><style>@import url(https://example.com/a.css);</style><rect width="10" height="10"/></svg>`),
  /external or nested content/);
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 10 10"><style>.card path { fill: red; }</style><path d="M0 0H10V10H0Z"/></svg>`),
  /Unsupported SVG CSS selector/);
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 10 10"><style>.card { filter: blur(2px); }</style><path class="card" d="M0 0H10V10H0Z"/></svg>`),
  /Unsupported SVG CSS property filter/);
});

test("SVG CSS styles retain symbol paint and compose use transforms with instance position", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 60 40"><style>
    .mark { fill: #20d890; }
    .large { transform: scale(2); }
  </style><defs><symbol id="mark" class="mark" viewBox="0 0 10 8">
    <rect width="10" height="8"/></symbol></defs>
    <use class="large" href="#mark" x="5" y="4" width="10" height="8"/>
  </svg>`);
  assert.equal(document.layers.length, 1);
  assert.match(document.layers[0]?.path ?? "", /M10 8H30V24H10z/);
  assert.ok((document.layers[0]?.fill?.green ?? 0) > 0.8);
});

test("SVG text lowers native typography, baseline position, entities, transforms, and anchor", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 80 40"><style>
    .label { fill: #4cc9ff; font-family: rounded; font-size: 10; font-weight: 700;
      font-style: italic; letter-spacing: 0.5; text-decoration: underline; text-anchor: middle; }
  </style><g transform="translate(2 3)"><text class="label" x="20" y="25">MGFX &amp; Ω</text></g>
  </svg>`);
  assert.equal(document.layers.length, 1);
  assert.deepEqual(document.layers[0]?.text, {
    value: "MGFX & Ω", x: 20, y: 25, fontSize: 10,
    color: { red: 0.2980392156862745, green: 0.788235294117647, blue: 1, alpha: 1 },
    family: "rounded", weight: "bold", fontStyle: "italic", letterSpacing: 0.05,
    decoration: TextDecoration.Underline,
    anchor: "middle",
    sourceTransform: { a: 1, b: 0, c: 0, d: 1, e: 2, f: 3 },
  });
});

test("SVG text lowers styled tspans to native rich-text runs", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 80 20"><style>
    .accent { fill: #20d890; font-family: serif; font-style: italic; letter-spacing: 1; }
  </style><text x="40" y="15" font-size="10" fill="#ffffff" text-anchor="middle">
    Hello <tspan class="accent" font-weight="700">native</tspan> text
  </text></svg>`);
  assert.deepEqual(document.layers[0]?.richText, {
    x: 40, y: 15, fontSize: 10, anchor: "middle", runs: [
      { text: "Hello ", color: { red: 1, green: 1, blue: 1, alpha: 1 }, family: "system",
        weight: "regular", style: "regular" },
      { text: "native", color: { red: 0.12549019607843137, green: 0.8470588235294118,
        blue: 0.5647058823529412, alpha: 1 }, family: "serif", weight: "bold",
        style: "italic", letterSpacing: 0.1 },
      { text: " text", color: { red: 1, green: 1, blue: 1, alpha: 1 }, family: "system",
        weight: "regular", style: "regular" },
    ],
  });
});

test("SVG text rejects unsupported positioned spans, strokes, and entities", () => {
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 40 20"><text><tspan dx="2">nested</tspan></text></svg>`),
  /require an explicit x/);
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 40 20"><text stroke="red">outlined</text></svg>`), /stroke is not supported/);
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 40 20"><text>bad &unknown;</text></svg>`), /Unsupported SVG text entity/);
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 40 20"><text text-decoration="overline">bad</text></svg>`),
  /Unsupported SVG text-decoration/);
});

test("SVG positioned tspans restart compact native run groups without glyph geometry", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 100 50">
    <text x="4" y="8" font-size="10">first
      <tspan x="12" y="25" dx="2" dy="3" fill="#20d890">second</tspan> tail
      <tspan x="20" dy="12" font-weight="700">third</tspan>
    </text></svg>`);
  assert.equal(document.layers.length, 3);
  assert.deepEqual(document.layers.map((layer) => ({ x: layer.richText?.x, y: layer.richText?.y,
    text: layer.richText?.runs.map((run) => run.text).join("") })), [
    { x: 4, y: 8, text: "first " },
    { x: 14, y: 28, text: "second tail " },
    { x: 20, y: 40, text: "third" },
  ]);
  assert.equal(document.layers[1]?.richText?.runs[0]?.color.green, 0.8470588235294118);
  assert.equal(document.layers[2]?.richText?.runs[0]?.weight, "bold");
});

test("SVG nested tspans inherit native styles and font-metric decorations", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 100 30"><style>
    .marked { fill: #ff8a1e; font-size: 15; text-decoration: underline; }
    .removed { font-family: serif; font-size: 9; font-style: italic;
      text-decoration: underline line-through; }
  </style><text x="8" y="20" font-size="12">outer <tspan class="marked">nested
    <tspan class="removed">deep</tspan></tspan> tail</text></svg>`);
  const runs = document.layers[0]?.richText?.runs;
  assert.deepEqual(runs?.map((run) => ({ text: run.text, family: run.family,
    style: run.style, scale: run.fontScale ?? 1,
    decoration: run.decoration ?? TextDecoration.None })), [
    { text: "outer ", family: "system", style: "regular", scale: 1,
      decoration: TextDecoration.None },
    { text: "nested ", family: "system", style: "regular", scale: 1.25,
      decoration: TextDecoration.Underline },
    { text: "deep", family: "serif", style: "italic",
      scale: 0.75, decoration: TextDecoration.Underline | TextDecoration.LineThrough },
    { text: " tail", family: "system", style: "regular", scale: 1,
      decoration: TextDecoration.None },
  ]);
});

test("SVG text preserves rotation, skew, and nonuniform scaling as affine display state", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 80 40"><text x="20" y="25"
    font-size="10" transform="matrix(1.2 0.3 0.2 0.8 4 5)">Affine</text></svg>`);
  assert.deepEqual(document.layers[0]?.text?.sourceTransform,
    { a: 1.2, b: 0.3, c: 0.2, d: 0.8, e: 4, f: 5 });
});

test("SVG local use rejects unresolved and cyclic references", () => {
  assert.throws(() => parseSvgVectorDocument(
    `<svg viewBox="0 0 10 10"><use href="#missing"/></svg>`), /missing #missing/);
  assert.throws(() => parseSvgVectorDocument(`<svg viewBox="0 0 10 10"><defs>
    <symbol id="a"><use href="#b"/></symbol><symbol id="b"><use href="#a"/></symbol>
    </defs><use href="#a"/></svg>`), /reference cycle/);
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

test("SVG radial gradient strokes remain native path paint", () => {
  const document = parseSvgVectorDocument(`<svg viewBox="0 0 40 20"><defs>
    <radialGradient id="ring"><stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#20d890"/></radialGradient></defs>
    <rect x="2" y="2" width="36" height="16" fill="#081018"
      stroke="url(#ring)" stroke-width="3" stroke-dasharray="5 3"/></svg>`);
  const layer = document.layers[0];
  assert.equal(layer?.strokeGradient, undefined);
  assert.deepEqual(layer?.strokeRadialGradient?.center, { x: 20, y: 10 });
  assert.ok(Math.abs((layer?.strokeRadialGradient?.axisX.x ?? 0) - 18) < 0.001);
  assert.equal(layer?.strokeWidth, 3);
  assert.deepEqual(layer?.dash, { length: 5, gap: 3 });
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
