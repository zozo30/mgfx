import { createConnection, type Socket } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { TypeScriptDemo, type Size } from "./demo.js";
import {
  AnimationClock,
  decodeAnimationTime,
  decodeCapabilityWord,
  decodePoint,
  decodeKey,
  decodeScroll,
  decodeResourceStatus,
  decodeResourceTrace,
  decodeText,
  decodeSize,
  decodeServerCapabilities, decodeServerHello,
  GraphicsBackend,
  FramePacer,
  encodeCursor,
  encodeText,
  encodeWindowConfig,
  encodeWindowState,
  MessageParser,
  MessageType,
  ResourceAction,
  ResourceKind,
  ResourceState,
  sendMessage,
} from "./protocol.js";

const effectiveUserId = process.geteuid?.() ?? process.getuid?.();
if (effectiveUserId === undefined) {
  throw new Error("MGFX local Unix sockets require a POSIX Node.js platform");
}
const socketPath = process.argv[2] ?? `/tmp/mgfx-${effectiveUserId}.sock`;
const socket = await connectWithRetry(socketPath);
const parser = new MessageParser();
const demo = new TypeScriptDemo();
const animationClock = new AnimationClock((requestSequence) =>
  sendMessage(socket, MessageType.RequestAnimationFrame, Buffer.alloc(0), requestSequence));
let viewport: Size = { width: 0, height: 0 };
const framePacer = new FramePacer((frame, sequence) =>
  sendMessage(socket, MessageType.Frame, frame, sequence));
const resizeDeadline = setTimeout(() => {
  console.error("MGFX server accepted the socket but did not send an initial Resize event");
  socket.destroy();
}, 2_000);

function submitFrame(): void {
  if (viewport.width <= 0 || viewport.height <= 0) return;
  framePacer.submit(demo.frame(viewport));
}

socket.on("data", (chunk) => {
  try {
    for (const message of parser.push(chunk)) {
      if (message.type === MessageType.Resize) {
        viewport = decodeSize(message.payload);
        if (viewport.width > 0 && viewport.height > 0) clearTimeout(resizeDeadline);
        submitFrame();
      } else if (message.type === MessageType.ServerHello) {
        const hello = decodeServerHello(message.payload);
        const backend = GraphicsBackend[hello.backend] ?? `backend-${hello.backend}`;
        console.log(`MGFX server ready: protocol ${hello.version}, ${backend}, capabilities 0x${hello.capabilities.toString(16)}`);
      } else if (message.type === MessageType.ServerCapabilities) {
        console.log(`MGFX extended capabilities 0x${decodeServerCapabilities(message.payload).toString(16)}`);
      } else if (message.type === MessageType.ServerCapabilityWord) {
        const word = decodeCapabilityWord(message.payload);
        console.log(`MGFX capability word ${word.index}: 0x${word.capabilities.toString(16)}`);
      } else if (message.type === MessageType.ResourceStatus) {
        const status = decodeResourceStatus(message.payload);
        console.log(`MGFX ${ResourceKind[status.kind]?.toLowerCase()} resource ${status.id} ` +
          `${ResourceState[status.state]?.toLowerCase()}`);
      } else if (message.type === MessageType.ResourceTrace) {
        const trace = decodeResourceTrace(message.payload);
        console.log(`MGFX ${ResourceKind[trace.kind]?.toLowerCase()} ${trace.id} ` +
          `${ResourceAction[trace.action]?.toLowerCase()}: ` +
          `${trace.resources}/${trace.maximumResources} resources, ` +
          `${trace.cost}/${trace.maximumCost} cost`);
      } else if (message.type === MessageType.FramePresented) {
        framePacer.presented(message.sequence);
      } else if (message.type === MessageType.AnimationFrame) {
        animationClock.receive(message.sequence, decodeAnimationTime(message.payload));
      } else if (message.type === MessageType.PointerDown) {
        if (demo.pointerDown(decodePoint(message.payload))) submitFrame();
      } else if (message.type === MessageType.PointerMove) {
        if (demo.pointerMove(decodePoint(message.payload))) submitFrame();
      } else if (message.type === MessageType.PointerUp) {
        if (demo.pointerUp(decodePoint(message.payload))) submitFrame();
      } else if (message.type === MessageType.KeyDown) {
        if (demo.keyDown(decodeKey(message.payload))) submitFrame();
      } else if (message.type === MessageType.KeyUp) {
        if (demo.keyUp(decodeKey(message.payload))) submitFrame();
      } else if (message.type === MessageType.Scroll) {
        if (demo.scroll(decodeScroll(message.payload))) submitFrame();
      } else if (message.type === MessageType.TextInput) {
        if (demo.textInput(decodeText(message.payload))) submitFrame();
      } else if (message.type === MessageType.Close) {
        socket.end();
      }
    }
  } catch (error) {
    console.error("MGFX protocol error:", error);
    socket.destroy();
  }
});

socket.on("close", () => process.exit(0));
socket.on("error", (error) => console.error("MGFX socket error:", error.message));
process.on("SIGINT", () => {
  sendMessage(socket, MessageType.Close);
  socket.end();
});

sendMessage(socket, MessageType.WindowTitle, encodeText("MGFX TypeScript Client"));
sendMessage(socket, MessageType.WindowConfig, encodeWindowConfig({
  width: 960,
  height: 640,
  minimumWidth: 640,
  minimumHeight: 480,
}));
sendMessage(socket, MessageType.WindowState, encodeWindowState({ mode: "normal", resizable: true }));
sendMessage(socket, MessageType.WindowCursor, encodeCursor("arrow"));

console.log(`MGFX TypeScript client connected to ${socketPath}`);

async function connectWithRetry(path: string): Promise<Socket> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      return await new Promise<Socket>((resolve, reject) => {
        const candidate = createConnection({ path });
        candidate.once("connect", () => resolve(candidate));
        candidate.once("error", reject);
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await delay(50);
    }
  }
  throw new Error(`Could not connect to ${path}: ${lastError?.message ?? "unknown error"}. ` +
    "Start the server with: open ../../build-clangd/MGFXServer.app");
}
