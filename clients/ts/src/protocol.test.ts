import assert from "node:assert/strict";
import test from "node:test";
import { AnimationClock, ClipboardClient, decodeAnimationTime, decodeServerHello, decodeText, decodeWindowChromeMetrics, encodeCursor, encodeMessage, encodeResourceId, encodeText, encodeTextureCreate, encodeWindowChrome, encodeWindowConfig, encodeWindowState, FrameEncoder, FramePacer, GraphicsBackend, MessageParser, MessageType, ServerCapability } from "./protocol.js";

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
    ServerCapability.PointerInput | ServerCapability.TextInput, 4);
  assert.deepEqual(decodeServerHello(payload), {
    version: 1,
    backend: GraphicsBackend.Metal,
    capabilities: ServerCapability.ClientWindowLifecycle |
      ServerCapability.PointerInput | ServerCapability.TextInput,
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
