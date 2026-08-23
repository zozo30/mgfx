import assert from "node:assert/strict";
import test from "node:test";
import { AnimationClock, ClipboardClient, decodeAnimationTime, decodeResourceStatus, decodeServerCapabilities, decodeServerHello, decodeText, decodeTextMetrics, decodeWindowChromeMetrics, encodeCursor, encodeFontCreate, encodeMeshCreate, encodeMessage, encodePathCreate, encodeResourceId, encodeText, encodeTextMeasure, encodeTextureCreate, encodeWindowChrome, encodeWindowConfig, encodeWindowState, ExtendedServerCapability, FrameEncoder, FramePacer, GraphicsBackend, MessageParser, MessageType, ResourceKind, ResourceState, ServerCapability, TextDecoration, TextMetricsClient } from "./protocol.js";

test("MGIP parser accepts fragmented messages", () => {
  const encoded = encodeMessage(MessageType.Resize, Buffer.from([1, 2, 3, 4]), 42);
  const parser = new MessageParser();
  assert.deepEqual(parser.push(encoded.subarray(0, 7)), []);
  const messages = parser.push(encoded.subarray(7));
  assert.equal(messages.length, 1);
  assert.equal(messages[0]?.type, MessageType.Resize);
  assert.equal(messages[0]?.sequence, 42);
  assert.deepEqual(messages[0]?.payload, Buffer.from([1, 2, 3, 4]));
});

test("server hello identifies backend and portable capabilities", () => {
  const payload = Buffer.alloc(8);
  payload.writeUInt16LE(1, 0);
  payload.writeUInt16LE(GraphicsBackend.Metal, 2);
  payload.writeUInt32LE(ServerCapability.ClientWindowLifecycle |
    ServerCapability.PointerInput | ServerCapability.TextInput |
    ServerCapability.TransformStack, 4);
  assert.deepEqual(decodeServerHello(payload), {
    version: 1,
    backend: GraphicsBackend.Metal,
    capabilities: ServerCapability.ClientWindowLifecycle |
      ServerCapability.PointerInput | ServerCapability.TextInput |
      ServerCapability.TransformStack,
  });
  assert.throws(() => decodeServerHello(Buffer.alloc(7)));
});

test("extended capabilities preserve bits beyond the legacy hello word", () => {
  const payload = Buffer.alloc(8);
  const capabilities = 0xffff_ffffn | ExtendedServerCapability.CapabilityWords64 |
    ExtendedServerCapability.ResourceStatusEvents | ExtendedServerCapability.LinearGradientCircles |
    ExtendedServerCapability.GridPatterns | ExtendedServerCapability.DashedPathStrokes;
  const allCapabilities = capabilities | ExtendedServerCapability.GradientPathStrokes;
  const completeCapabilities = allCapabilities | ExtendedServerCapability.ExtendedPathStrokeStyles |
    ExtendedServerCapability.CustomPathMiterLimits |
    ExtendedServerCapability.ArbitraryPathDashArrays |
    ExtendedServerCapability.MultiStopPathGradients |
    ExtendedServerCapability.PathGradientSpreadModes;
  payload.writeBigUInt64LE(completeCapabilities);
  assert.equal(decodeServerCapabilities(payload), completeCapabilities);
  assert.throws(() => decodeServerCapabilities(Buffer.alloc(4)));
});

test("resource status identifies native readiness and rejection", () => {
  const payload = Buffer.alloc(8);
  payload.writeUInt8(ResourceKind.Path, 0);
  payload.writeUInt8(ResourceState.Ready, 1);
  payload.writeUInt32LE(72, 4);
  assert.deepEqual(decodeResourceStatus(payload), {
    kind: ResourceKind.Path, state: ResourceState.Ready, id: 72,
  });
  payload.writeUInt8(ResourceState.Rejected, 1);
  assert.equal(decodeResourceStatus(payload).state, ResourceState.Rejected);
  payload.writeUInt16LE(1, 2);
  assert.throws(() => decodeResourceStatus(payload));
});

test("frame pacer keeps only the newest frame while one is in flight", () => {
  const sent: Array<{ frame: string; sequence: number }> = [];
  const pacer = new FramePacer((frame, sequence) => sent.push({ frame: frame.toString(), sequence }));
  pacer.submit(Buffer.from("one"));
  pacer.submit(Buffer.from("two"));
  pacer.submit(Buffer.from("three"));
  assert.deepEqual(sent, [{ frame: "one", sequence: 1 }]);
  pacer.presented(99);
  assert.equal(sent.length, 1);
  pacer.presented(1);
  assert.deepEqual(sent, [{ frame: "one", sequence: 1 }, { frame: "three", sequence: 2 }]);
});

test("animation clock coalesces callbacks onto a native display tick", () => {
  const requests: number[] = [];
  const times: number[] = [];
  const clock = new AnimationClock((sequence) => requests.push(sequence));
  clock.request((time) => times.push(time));
  clock.request((time) => times.push(time + 1));
  assert.deepEqual(requests, [1]);
  clock.receive(99, 5_000_000_000n);
  assert.equal(times.length, 0);
  clock.receive(1, 5_000_000_000n);
  assert.equal(times.join(","), "0,1");
  clock.request((time) => times.push(time));
  assert.deepEqual(requests, [1, 2]);
  clock.receive(2, 5_016_000_000n);
  assert.equal(times[2], 16);
  const encoded = Buffer.alloc(8); encoded.writeBigUInt64LE(5_016_000_000n);
  assert.equal(decodeAnimationTime(encoded), 5_016_000_000n);
});

test("MGFX frame declares its exact size and command count", () => {
  const frame = new FrameEncoder();
  frame.clear({ red: 0, green: 0, blue: 0, alpha: 1 });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.toString("ascii", 0, 4), "MGFX");
  assert.equal(bytes.readUInt16LE(4), 1);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  assert.equal(bytes.readUInt32LE(12), 2);
});

test("MGFX clip stack uses skippable protocol commands", () => {
  const frame = new FrameEncoder();
  frame.pushClip({ left: 0.1, top: 0.2, right: 0.8, bottom: 0.9 });
  frame.popClip();
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt32LE(12), 3);
  assert.equal(bytes.readUInt16LE(16), 4);
  assert.equal(bytes.readUInt32LE(20), 16);
  assert.equal(bytes.readUInt16LE(40), 5);
  assert.equal(bytes.readUInt32LE(44), 0);
});

test("MGFX affine transforms use balanced skippable commands", () => {
  const frame = new FrameEncoder();
  frame.pushTransform({ m11: 0.8, m12: 0.2, m21: -0.2, m22: 0.8,
    translateX: 0.1, translateY: -0.1 });
  frame.popTransform(); frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 9);
  assert.equal(bytes.readUInt32LE(20), 24);
  assert.ok(Math.abs(bytes.readFloatLE(24) - 0.8) < 0.00001);
  assert.equal(bytes.readUInt16LE(48), 10);
  assert.throws(() => frame.pushTransform({ m11: Number.NaN, m12: 0, m21: 0, m22: 1,
    translateX: 0, translateY: 0 }));
});

test("MGFX inherited opacity uses balanced skippable commands", () => {
  const frame = new FrameEncoder();
  frame.pushOpacity(0.625); frame.popOpacity(); frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 11);
  assert.equal(bytes.readUInt32LE(20), 4);
  assert.ok(Math.abs(bytes.readFloatLE(24) - 0.625) < 0.00001);
  assert.equal(bytes.readUInt16LE(28), 12);
  assert.throws(() => frame.pushOpacity(1.1));
});

test("MGFX soft shadow is one fixed backend-neutral command", () => {
  const frame = new FrameEncoder();
  frame.shadow({ destination: { left: -0.5, top: 0.5, right: 0.5, bottom: -0.5 },
    cornerRadius: 14, blur: 18, spread: 2,
    color: { red: 0, green: 0.1, blue: 0.2, alpha: 0.55 } });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 13);
  assert.equal(bytes.readUInt32LE(20), 44);
  assert.equal(bytes.readFloatLE(40), 14);
  assert.equal(bytes.readFloatLE(44), 18);
  assert.throws(() => frame.shadow({ destination: { left: 0, top: 0, right: 1, bottom: 1 },
    cornerRadius: 0, blur: 300, spread: 0,
    color: { red: 0, green: 0, blue: 0, alpha: 1 } }));
});

test("MGFX radial gradient remains a compact server primitive", () => {
  const frame = new FrameEncoder();
  frame.radialGradient({ destination: { left: -1, top: 1, right: 1, bottom: -1 },
    centerX: 0.3, centerY: 0.4, radius: 120, cornerRadius: 16,
    innerColor: { red: 1, green: 0.8, blue: 0.2, alpha: 1 },
    outerColor: { red: 0.1, green: 0, blue: 0.4, alpha: 0.8 } });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 14);
  assert.equal(bytes.readUInt32LE(20), 64);
  assert.equal(bytes.readFloatLE(48), 120);
  assert.throws(() => frame.radialGradient({
    destination: { left: -1, top: 1, right: 1, bottom: -1 }, centerX: 2, centerY: 0,
    radius: 10, cornerRadius: 0,
    innerColor: { red: 1, green: 1, blue: 1, alpha: 1 },
    outerColor: { red: 0, green: 0, blue: 0, alpha: 1 } }));
});

test("MGFX linear gradient is one fixed server command", () => {
  const frame = new FrameEncoder();
  frame.linearGradient({ destination: { left: -1, top: 1, right: 1, bottom: -1 },
    cornerRadius: 12, direction: "diagonal",
    startColor: { red: 0.2, green: 0.8, blue: 1, alpha: 1 },
    endColor: { red: 0.7, green: 0.2, blue: 1, alpha: 0.75 } });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 18);
  assert.equal(bytes.readUInt32LE(20), 56);
  assert.equal(bytes.readFloatLE(44), 2);
  assert.equal(bytes.readFloatLE(76), 0.75);
  assert.throws(() => frame.linearGradient({
    destination: { left: -1, top: 1, right: 1, bottom: -1 }, cornerRadius: -1,
    direction: "horizontal", startColor: { red: 0, green: 0, blue: 0, alpha: 1 },
    endColor: { red: 1, green: 1, blue: 1, alpha: 1 } }));
});

test("MGFX linear-gradient circle is one fixed server command", () => {
  const frame = new FrameEncoder();
  frame.linearGradientCircle({ destination: { left: -0.5, top: 0.5, right: 0.5, bottom: -0.5 },
    direction: "vertical",
    startColor: { red: 0.1, green: 0.9, blue: 0.7, alpha: 1 },
    endColor: { red: 0.5, green: 0.2, blue: 1, alpha: 0.8 } });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 25);
  assert.equal(bytes.readUInt32LE(20), 52);
  assert.equal(bytes.readFloatLE(40), 1);
  assert.ok(Math.abs(bytes.readFloatLE(72) - 0.8) < 0.0001);
});

test("MGFX technical grid is constant-size regardless of area", () => {
  const frame = new FrameEncoder();
  frame.gridPattern({ destination: { left: -1, top: 1, right: 1, bottom: -1 },
    spacing: 24, minorWidth: 1, majorWidth: 2, offsetX: 3, offsetY: -4,
    majorEvery: 5, cornerRadius: 12,
    minorColor: { red: 0.2, green: 0.4, blue: 0.8, alpha: 0.25 },
    majorColor: { red: 0.3, green: 0.7, blue: 1, alpha: 0.5 } });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 26);
  assert.equal(bytes.readUInt32LE(20), 76);
  assert.equal(bytes.readFloatLE(64), 12);
  assert.throws(() => frame.gridPattern({ destination: { left: -1, top: 1, right: 1, bottom: -1 },
    spacing: 1, minorWidth: 1, majorWidth: 2, offsetX: 0, offsetY: 0,
    majorEvery: 5, cornerRadius: 0,
    minorColor: { red: 1, green: 1, blue: 1, alpha: 1 },
    majorColor: { red: 1, green: 1, blue: 1, alpha: 1 } }));
});

test("MGFX conic gradient is one fixed server command", () => {
  const frame = new FrameEncoder();
  frame.conicGradient({ destination: { left: -1, top: 1, right: 1, bottom: -1 },
    centerX: 0.5, centerY: 0.5, rotation: 1.25, cornerRadius: 30,
    startColor: { red: 0.1, green: 0.8, blue: 1, alpha: 1 },
    middleColor: { red: 0.7, green: 0.2, blue: 1, alpha: 1 },
    endColor: { red: 0.1, green: 0.8, blue: 1, alpha: 1 } });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 23);
  assert.equal(bytes.readUInt32LE(20), 80);
  assert.ok(Math.abs(bytes.readFloatLE(48) - 1.25) < 0.00001);
  assert.equal(bytes.readFloatLE(52), 30);
});

test("MGFX rounded rectangle combines fill and border in one command", () => {
  const frame = new FrameEncoder();
  frame.roundedRect({ destination: { left: -0.7, top: 0.5, right: 0.7, bottom: -0.5 },
    cornerRadius: 18, borderWidth: 3,
    fillColor: { red: 0.1, green: 0.2, blue: 0.5, alpha: 1 },
    borderColor: { red: 0.5, green: 0.8, blue: 1, alpha: 0.9 } });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 15);
  assert.equal(bytes.readUInt32LE(20), 56);
  assert.equal(bytes.readFloatLE(40), 18);
  assert.equal(bytes.readFloatLE(44), 3);
  assert.throws(() => frame.roundedRect({
    destination: { left: 0, top: 1, right: 1, bottom: 0 }, cornerRadius: -1, borderWidth: 0,
    fillColor: { red: 1, green: 1, blue: 1, alpha: 1 },
    borderColor: { red: 0, green: 0, blue: 0, alpha: 0 } }));
});

test("MGFX circle combines fill and ring in one command", () => {
  const frame = new FrameEncoder();
  frame.circle({ destination: { left: -0.4, top: 0.4, right: 0.4, bottom: -0.4 },
    borderWidth: 2.5,
    fillColor: { red: 0.1, green: 0.8, blue: 0.4, alpha: 1 },
    borderColor: { red: 0.7, green: 1, blue: 0.8, alpha: 0.9 } });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 16);
  assert.equal(bytes.readUInt32LE(20), 52);
  assert.equal(bytes.readFloatLE(40), 2.5);
  assert.throws(() => frame.circle({
    destination: { left: -1, top: 1, right: 1, bottom: -1 }, borderWidth: -1,
    fillColor: { red: 1, green: 1, blue: 1, alpha: 1 },
    borderColor: { red: 0, green: 0, blue: 0, alpha: 0 } }));
});

test("MGFX diagonal pattern is constant-size regardless of area", () => {
  const frame = new FrameEncoder();
  frame.diagonalPattern({ destination: { left: -1, top: 1, right: 1, bottom: -1 },
    stripeWidth: 8, gap: 10, offset: 3.5, backward: true,
    color: { red: 1, green: 0.5, blue: 0.1, alpha: 0.8 } });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 17);
  assert.equal(bytes.readUInt32LE(20), 48);
  assert.equal(bytes.readFloatLE(40), 8);
  assert.equal(bytes.readFloatLE(52), 1);
  assert.throws(() => frame.diagonalPattern({
    destination: { left: -1, top: 1, right: 1, bottom: -1 }, stripeWidth: 0,
    gap: 2, offset: 0, backward: false,
    color: { red: 1, green: 1, blue: 1, alpha: 1 } }));
});

test("text input decodes validated UTF-8", () => {
  assert.equal(decodeText(encodeText("árvíz")), "árvíz");
  assert.throws(() => decodeText(Buffer.from([0xc3, 0x28])));
});

test("window configuration has a fixed language-neutral payload", () => {
  const payload = encodeWindowConfig({ width: 1100, height: 700, minimumWidth: 720, minimumHeight: 520 });
  assert.equal(payload.length, 16);
  assert.deepEqual([payload.readUInt32LE(0), payload.readUInt32LE(4),
    payload.readUInt32LE(8), payload.readUInt32LE(12)], [1100, 700, 720, 520]);
  assert.throws(() => encodeWindowConfig({ width: -1, height: 700, minimumWidth: 0, minimumHeight: 0 }));
});

test("window state encodes mode and resizability", () => {
  assert.deepEqual(encodeWindowState({ mode: "fullscreen", resizable: false }), Buffer.from([2, 0, 0, 0]));
  assert.deepEqual(encodeWindowState({ mode: "maximized", resizable: true }), Buffer.from([1, 1, 0, 0]));
});

test("portable cursors use a fixed reserved payload", () => {
  assert.deepEqual(encodeCursor("pointer"), Buffer.from([1, 0, 0, 0]));
  assert.deepEqual(encodeCursor("text"), Buffer.from([2, 0, 0, 0]));
  assert.deepEqual(encodeCursor("resize-horizontal"), Buffer.from([4, 0, 0, 0]));
});

test("client window chrome declares overlay drag height", () => {
  assert.deepEqual(encodeWindowChrome("overlay", 82), Buffer.from([1, 0, 0, 0, 82, 0, 0, 0]));
  assert.throws(() => encodeWindowChrome("overlay", 513));
});

test("native window chrome metrics report the actual control-safe inset", () => {
  const payload = Buffer.alloc(8);
  payload.writeFloatLE(132, 0);
  payload.writeFloatLE(28, 4);
  assert.deepEqual(decodeWindowChromeMetrics(payload), { leadingInset: 132, titleBarHeight: 28 });
});

test("RGBA textures are persistent resource uploads and frames reference their ID", () => {
  const upload = encodeTextureCreate(7, 2, 1, Buffer.from([
    255, 0, 0, 255, 0, 255, 0, 255,
  ]));
  assert.equal(upload.readUInt32LE(0), 7);
  assert.deepEqual([upload.readUInt32LE(4), upload.readUInt32LE(8)], [2, 1]);
  assert.deepEqual(encodeResourceId(7), Buffer.from([7, 0, 0, 0]));
  const frame = new FrameEncoder();
  frame.image(7, { left: -1, top: 1, right: 1, bottom: -1 });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 6);
  assert.equal(bytes.readUInt32LE(24), 7);
});

test("rounded image surfaces encode radius and sampling without client geometry", () => {
  const frame = new FrameEncoder();
  frame.imageSurface(9, { left: -0.5, top: 0.5, right: 0.5, bottom: -0.5 },
    { left: 0.1, top: 0.2, right: 0.9, bottom: 0.8 },
    { red: 0.8, green: 1, blue: 0.7, alpha: 0.9 }, 14, "nearest");
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 19);
  assert.equal(bytes.readUInt32LE(20), 64);
  assert.equal(bytes.readUInt32LE(24), 9);
  assert.equal(bytes.readUInt32LE(28), 1);
  assert.equal(bytes.readFloatLE(80), 14);
  assert.throws(() => frame.imageSurface(0,
    { left: 0, top: 1, right: 1, bottom: 0 }, undefined, undefined, 0));
});

test("dot grids encode all cells as one fixed pattern command", () => {
  const frame = new FrameEncoder();
  frame.dotGrid({ destination: { left: -1, top: 1, right: 1, bottom: -1 },
    rows: 4, columns: 4, filledMask: 0xa142, activeIndex: 7,
    inset: 6, radius: 4, borderWidth: 2,
    fillColor: { red: 0.4, green: 0.9, blue: 0.6, alpha: 1 },
    ringColor: { red: 0.4, green: 0.9, blue: 0.6, alpha: 0.8 },
    highlightColor: { red: 0.8, green: 1, blue: 0.9, alpha: 1 } });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 20);
  assert.equal(bytes.readUInt32LE(20), 96);
  assert.equal(bytes.readUInt32LE(48), 0xa142);
  assert.equal(bytes.readInt32LE(52), 7);
  assert.throws(() => frame.dotGrid({ destination: { left: 0, top: 1, right: 1, bottom: 0 },
    rows: 6, columns: 6, filledMask: 0, activeIndex: -1, inset: 0, radius: 2,
    borderWidth: 1, fillColor: { red: 1, green: 1, blue: 1, alpha: 1 },
    ringColor: { red: 1, green: 1, blue: 1, alpha: 1 },
    highlightColor: { red: 1, green: 1, blue: 1, alpha: 1 } }));
});

test("animated wave dots remain one fixed server command", () => {
  const frame = new FrameEncoder();
  frame.waveDots({ destination: { left: -1, top: 1, right: 1, bottom: -1 }, count: 24,
    inset: 12, minimumRadius: 3.5, maximumRadius: 15, phase: 1.25,
    frequency: 0.56, borderWidth: 1,
    troughStartColor: { red: 0.22, green: 0.36, blue: 1, alpha: 1 },
    troughEndColor: { red: 0.16, green: 1, blue: 0.62, alpha: 1 },
    crestStartColor: { red: 0.56, green: 0.36, blue: 1, alpha: 1 },
    crestEndColor: { red: 0.16, green: 1, blue: 0.82, alpha: 1 },
    borderColor: { red: 0.72, green: 0.94, blue: 1, alpha: 0.65 } });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 21);
  assert.equal(bytes.readUInt32LE(20), 128);
  assert.equal(bytes.readUInt32LE(40), 24);
  assert.ok(Math.abs(bytes.readFloatLE(60) - 1.25) < 0.00001);
  assert.throws(() => frame.waveDots({ destination: { left: 0, top: 1, right: 1, bottom: 0 },
    count: 0, inset: 0, minimumRadius: 1, maximumRadius: 2, phase: 0, frequency: 1,
    borderWidth: 0, troughStartColor: { red: 0, green: 0, blue: 0, alpha: 1 },
    troughEndColor: { red: 0, green: 0, blue: 0, alpha: 1 },
    crestStartColor: { red: 0, green: 0, blue: 0, alpha: 1 },
    crestEndColor: { red: 0, green: 0, blue: 0, alpha: 1 },
    borderColor: { red: 0, green: 0, blue: 0, alpha: 1 } }));
});

test("canonical paths upload once and frames reference server-side vector geometry", () => {
  const upload = encodePathCreate(12, [
    { verb: "move", x: 2, y: 12 },
    { verb: "cubic", x1: 4, y1: 2, x2: 20, y2: 2, x: 22, y: 12 },
  ]);
  assert.equal(upload.readUInt32LE(0), 12);
  assert.equal(upload.readUInt32LE(4), 2);
  assert.equal(upload.readUInt8(16), 1);
  assert.equal(upload.readUInt8(44), 3);
  const frame = new FrameEncoder();
  frame.path(12, { left: -1, top: 1, right: 1, bottom: -1 },
    { x: 0, y: 0, width: 24, height: 24 }, {
      stroke: { red: 1, green: 0.5, blue: 0.1, alpha: 1 }, strokeWidth: 2,
      fillGradient: { start: { x: 0, y: 0 }, end: { x: 24, y: 0 },
        startColor: { red: 0, green: 0.4, blue: 0.8, alpha: 1 },
        endColor: { red: 0.8, green: 0.2, blue: 1, alpha: 1 },
        stops: [
          { offset: 0, color: { red: 0, green: 0.4, blue: 0.8, alpha: 1 } },
          { offset: 0.5, color: { red: 0.2, green: 1, blue: 0.6, alpha: 1 } },
          { offset: 1, color: { red: 0.8, green: 0.2, blue: 1, alpha: 1 } },
        ], spread: "reflect" },
      lineCap: "square", lineJoin: "miter",
      miterLimit: 6,
      strokeGradient: { start: { x: 0, y: 0 }, end: { x: 24, y: 24 },
        startColor: { red: 1, green: 0.2, blue: 0.1, alpha: 1 },
        endColor: { red: 1, green: 0.9, blue: 0.2, alpha: 1 } },
      dash: { values: [7, 4, 2, 4], offset: -2 },
    });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 31);
  assert.equal(bytes.readUInt32LE(20), 268);
  assert.equal(bytes.readUInt32LE(24), 12);
  assert.equal(bytes.readUInt8(28), 15);
  assert.equal(bytes.readUInt8(30), 2);
  assert.equal(bytes.readUInt8(31), 2);
  assert.equal(bytes.readFloatLE(24 + 124), 1);
  assert.equal(bytes.readFloatLE(24 + 128 + 8), 24);
  assert.equal(bytes.readFloatLE(24 + 176), 6);
  assert.equal(bytes.readFloatLE(24 + 180), -2);
  assert.equal(bytes.readUInt16LE(24 + 184), 4);
  assert.equal(bytes.readUInt8(24 + 186), 3);
  assert.equal(bytes.readUInt8(24 + 187), 0);
  assert.equal(bytes.readUInt8(24 + 188), 2);
  assert.deepEqual([0, 1, 2, 3].map((index) => bytes.readFloatLE(24 + 192 + index * 4)),
    [7, 4, 2, 4]);
  assert.equal(bytes.readFloatLE(24 + 208 + 20), 0.5);
});

test("indexed meshes upload once and frames reference their resource", () => {
  const color = { red: 1, green: 0.4, blue: 0.1, alpha: 1 };
  const upload = encodeMeshCreate(31, [
    { position: { x: 0.5, y: 0 }, color },
    { position: { x: 0, y: 1 }, color },
    { position: { x: 1, y: 1 }, color },
  ], [0, 1, 2]);
  assert.equal(upload.readUInt32LE(0), 31);
  assert.equal(upload.readUInt32LE(4), 3);
  assert.equal(upload.readUInt32LE(8), 3);
  const frame = new FrameEncoder();
  frame.meshResource(31, { left: -1, top: 1, right: 1, bottom: -1 },
    { x: 0, y: 0, width: 1, height: 1 });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 22);
  assert.equal(bytes.readUInt32LE(20), 40);
  assert.equal(bytes.readUInt32LE(24), 31);
});

test("system Unicode text is a compact skippable display-list command", () => {
  const frame = new FrameEncoder();
  frame.systemText("Hello — Ω", -0.8, 0.6, 0.08,
    { red: 0.7, green: 0.9, blue: 1, alpha: 1 }, "monospace", "semibold", "italic", 0.075,
    TextDecoration.Underline | TextDecoration.LineThrough, 42);
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 8);
  assert.equal(bytes.readUInt8(24), 1);
  assert.equal(bytes.readUInt8(25), 3);
  assert.equal(bytes.readUInt8(26), 1);
  assert.equal(bytes.readUInt8(27), 3);
  assert.ok(Math.abs(bytes.readFloatLE(56) - 0.075) < 0.00001);
  assert.equal(bytes.readUInt8(60), 3);
  assert.equal(bytes.readUInt32LE(64), 42);
  assert.equal(bytes.subarray(68, 68 + Buffer.byteLength("Hello — Ω")).toString(), "Hello — Ω");
});

test("font files upload once as bounded persistent resources", () => {
  const font = encodeFontCreate(42, Buffer.from([0, 1, 0, 0, 4, 8, 15, 16, 23, 42]));
  assert.equal(font.readUInt32LE(0), 42);
  assert.deepEqual(font.subarray(4), Buffer.from([0, 1, 0, 0, 4, 8, 15, 16, 23, 42]));
});

test("rich text packs styled UTF-8 runs into one display-list command", () => {
  const frame = new FrameEncoder();
  frame.richText([
    { text: "Rich ", color: { red: 1, green: 0.4, blue: 0.2, alpha: 1 }, weight: "bold" },
    { text: "Ω", color: { red: 0.2, green: 0.9, blue: 1, alpha: 1 }, family: "serif",
      style: "italic", decoration: TextDecoration.Underline, fontResourceId: 42 },
  ], -0.7, 0.5, 0.08);
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 24);
  assert.equal(bytes.readUInt32LE(36), 2);
  assert.equal(bytes.readUInt8(40), 0);
  assert.equal(bytes.readUInt8(41), 1);
  assert.equal(bytes.subarray(72, 77).toString(), "Rich ");
  const second = 77;
  assert.equal(bytes.readUInt8(second), 2);
  assert.equal(bytes.readUInt8(second + 2), 1);
  assert.equal(bytes.readUInt8(second + 3), TextDecoration.Underline);
  assert.equal(bytes.readUInt32LE(second + 8), 42);
});

test("native text metrics correlate asynchronous measurement replies", async () => {
  const sent: Array<{ payload: Buffer; sequence: number }> = [];
  const metrics = new TextMetricsClient((payload, sequence) => sent.push({ payload, sequence }));
  const pending = metrics.measure("serif", "Árvíztűrő — Ω", "medium", "italic", 0.075, 42);
  assert.deepEqual(sent[0]?.payload,
    encodeTextMeasure("serif", "Árvíztűrő — Ω", "medium", "italic", 0.075, 42));
  assert.equal(sent[0]?.payload.readUInt8(0), 2);
  assert.equal(sent[0]?.payload.readUInt8(3), 2);
  assert.ok(Math.abs(sent[0]!.payload.readFloatLE(4) - 0.075) < 0.00001);
  assert.equal(sent[0]?.payload.readUInt32LE(8), 42);
  const payload = Buffer.alloc(4); payload.writeFloatLE(6.25);
  metrics.receive(sent[0]!.sequence + 1, 99);
  metrics.receive(sent[0]!.sequence, decodeTextMetrics(payload));
  assert.equal(await pending, 6.25);
});

test("clipboard replies resolve only their correlated request", async () => {
  const writes: string[] = [];
  const reads: number[] = [];
  const clipboard = new ClipboardClient((text) => writes.push(text.toString()),
    (sequence) => reads.push(sequence));
  clipboard.write("árvíz");
  const result = clipboard.read();
  assert.deepEqual(writes, ["árvíz"]);
  assert.deepEqual(reads, [1]);
  clipboard.receive(99, "wrong");
  clipboard.receive(1, "native text");
  assert.equal(await result, "native text");
});
