import assert from "node:assert/strict";
import test from "node:test";
import { AnimationClock, ClipboardClient, decodeAnimationTime, decodeServerHello, decodeText, decodeTextMetrics, decodeWindowChromeMetrics, encodeCursor, encodeMessage, encodePathCreate, encodeResourceId, encodeText, encodeTextMeasure, encodeTextureCreate, encodeWindowChrome, encodeWindowConfig, encodeWindowState, FrameEncoder, FramePacer, GraphicsBackend, MessageParser, MessageType, ServerCapability, TextMetricsClient } from "./protocol.js";

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
        endColor: { red: 0.8, green: 0.2, blue: 1, alpha: 1 } },
      lineCap: "round", lineJoin: "round",
    });
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 7);
  assert.equal(bytes.readUInt32LE(24), 12);
  assert.equal(bytes.readUInt8(28), 7);
  assert.equal(bytes.readFloatLE(24 + 124), 1);
});

test("system Unicode text is a compact skippable display-list command", () => {
  const frame = new FrameEncoder();
  frame.systemText("Hello — Ω", -0.8, 0.6, 0.08,
    { red: 0.7, green: 0.9, blue: 1, alpha: 1 }, "monospace", "bold");
  frame.endFrame();
  const bytes = frame.finish();
  assert.equal(bytes.readUInt16LE(16), 8);
  assert.equal(bytes.readUInt8(24), 1);
  assert.equal(bytes.readUInt8(25), 1);
  assert.equal(bytes.subarray(56, 56 + Buffer.byteLength("Hello — Ω")).toString(), "Hello — Ω");
});

test("native text metrics correlate asynchronous measurement replies", async () => {
  const sent: Array<{ payload: Buffer; sequence: number }> = [];
  const metrics = new TextMetricsClient((payload, sequence) => sent.push({ payload, sequence }));
  const pending = metrics.measure("system", "Árvíztűrő — Ω", "bold");
  assert.deepEqual(sent[0]?.payload, encodeTextMeasure("system", "Árvíztűrő — Ω", "bold"));
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
