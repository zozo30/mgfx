import { createConnection, type Socket } from "node:net";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { App } from "./app.js";
import { ReactSurface } from "./renderer.js";
import { decodeImageFile, type DecodedImage } from "./image-codec.js";
import { loadLucideIcons } from "./icon-pack.js";
import { AnimationClock, ClipboardClient, decodeAnimationTime, decodeKey, decodePoint, decodeScroll,
  decodeServerHello, decodeSize, decodeText, decodeTextMetrics, decodeWindowChromeMetrics,
  encodeCursor, encodeFontCreate, encodeMeshCreate, encodePathCreate, encodeText,
  encodeTextureCreate, encodeWindowChrome, encodeWindowConfig, encodeWindowState, FramePacer, GraphicsBackend, MessageParser,
  MessageType, sendMessage, TextMetricsClient } from "@mgfx/demo-client/protocol";

const userId = process.geteuid?.() ?? process.getuid?.();
if (userId === undefined) throw new Error("MGFX React requires a POSIX Node.js platform");
const socketPath = process.argv[2] ?? `/tmp/mgfx-${userId}.sock`;
const imagePath = process.argv[3] ?? fileURLToPath(new URL("../assets/demo.svg", import.meta.url));
let headerImage: DecodedImage = { width: 64, height: 64, rgba: demoTexture() };
const vectorIcons = await loadLucideIcons(["activity", "badge-check", "gamepad-2", "grid"]);
try {
  headerImage = await decodeImageFile(imagePath);
  console.log(`Decoded ${imagePath}: ${headerImage.width}×${headerImage.height} RGBA8`);
} catch (error) {
  console.warn(`Could not decode ${imagePath}; using generated texture:`, error);
}
const socket = await connectWithRetry(socketPath);
let shuttingDown = false;
let customFontResourceId: number | undefined;
try {
  const fontBytes = await readFile("/System/Library/Fonts/Monaco.ttf");
  customFontResourceId = 1;
  sendMessage(socket, MessageType.FontCreate, encodeFontCreate(customFontResourceId, fontBytes));
  console.log(`Uploaded Monaco.ttf as font resource ${customFontResourceId}`);
} catch (error) {
  console.warn("Could not load the optional custom-font demo resource:", error);
}
sendMessage(socket, MessageType.TextureCreate, encodeTextureCreate(1,
  headerImage.width, headerImage.height, headerImage.rgba));
const animationClock = new AnimationClock((requestSequence) =>
  sendMessage(socket, MessageType.RequestAnimationFrame, Buffer.alloc(0), requestSequence));
const clipboard = new ClipboardClient(
  (text) => sendMessage(socket, MessageType.ClipboardWrite, text),
  (requestSequence) => sendMessage(socket, MessageType.ClipboardRead,
    Buffer.alloc(0), requestSequence),
);
const framePacer = new FramePacer((frame, sequence) =>
  sendMessage(socket, MessageType.Frame, frame, sequence));
const textMetrics = new TextMetricsClient((payload, sequence) =>
  sendMessage(socket, MessageType.TextMeasure, payload, sequence));
const surface = new ReactSurface(
  (frame) => framePacer.submit(frame),
  {
    setTitle: (title) => sendMessage(socket, MessageType.WindowTitle, encodeText(title)),
    configure: (config) => sendMessage(socket, MessageType.WindowConfig, encodeWindowConfig(config)),
    setState: (state) => sendMessage(socket, MessageType.WindowState, encodeWindowState(state)),
    setCursor: (cursor) => sendMessage(socket, MessageType.WindowCursor, encodeCursor(cursor)),
    writeClipboard: (text) => clipboard.write(text),
    readClipboard: () => clipboard.read(),
    setChrome: (mode, height) => sendMessage(socket, MessageType.WindowChrome,
      encodeWindowChrome(mode, height)),
  },
  {
    createPath: (id, segments) => sendMessage(socket, MessageType.PathCreate,
      encodePathCreate(id, segments)),
    createMesh: (id, vertices, indices) => sendMessage(socket, MessageType.MeshCreate,
      encodeMeshCreate(id, vertices, indices)),
    measureText: (family, text, weight, style, letterSpacing, fontResourceId) =>
      textMetrics.measure(family, text, weight, style, letterSpacing, fontResourceId),
  },
);
let chromeMetrics = { leadingInset: 132, titleBarHeight: 56 };
const renderApplication = () => surface.render(
  <App animationClock={animationClock} chromeMetrics={chromeMetrics}
    customFontResourceId={customFontResourceId}
    headerImageSize={{ width: headerImage.width, height: headerImage.height }}
    vectorIcons={vectorIcons} />);
renderApplication();
const parser = new MessageParser();

socket.on("data", (chunk) => {
  try {
    for (const message of parser.push(chunk)) {
      switch (message.type) {
      case MessageType.Resize: surface.resize(decodeSize(message.payload)); break;
      case MessageType.PointerMove: surface.pointerMove(decodePoint(message.payload)); break;
      case MessageType.PointerDown: surface.pointerDown(decodePoint(message.payload)); break;
      case MessageType.PointerUp: surface.pointerUp(decodePoint(message.payload)); break;
      case MessageType.KeyDown: surface.keyDown(decodeKey(message.payload)); break;
      case MessageType.KeyUp: surface.keyUp(decodeKey(message.payload)); break;
      case MessageType.Scroll: surface.scroll(decodeScroll(message.payload)); break;
      case MessageType.TextInput: surface.textInput(decodeText(message.payload)); break;
      case MessageType.ServerHello: {
        const hello = decodeServerHello(message.payload);
        console.log(`MGFX server ready: protocol ${hello.version}, ${GraphicsBackend[hello.backend]}, capabilities 0x${hello.capabilities.toString(16)}`);
        break;
      }
      case MessageType.FramePresented: framePacer.presented(message.sequence); break;
      case MessageType.AnimationFrame:
        animationClock.receive(message.sequence, decodeAnimationTime(message.payload)); break;
      case MessageType.ClipboardText:
        clipboard.receive(message.sequence, decodeText(message.payload)); break;
      case MessageType.WindowChromeMetrics:
        chromeMetrics = decodeWindowChromeMetrics(message.payload);
        renderApplication();
        break;
      case MessageType.TextMetrics:
        textMetrics.receive(message.sequence, decodeTextMetrics(message.payload));
        break;
      case MessageType.Close: socket.end(); break;
      }
    }
  } catch (error) {
    console.error("MGFX React protocol error:", error);
    socket.destroy();
  }
});
socket.on("close", () => { clipboard.close(); textMetrics.close(); process.exit(0); });
socket.on("error", (error) => {
  if (!shuttingDown) console.error("MGFX React socket error:", error.message);
});
process.on("SIGINT", () => {
  shuttingDown = true;
  if (socket.writable) sendMessage(socket, MessageType.Close);
  socket.end();
});
console.log(`MGFX React client connected to ${socketPath}`);

function demoTexture(): Buffer {
  const size = 64, pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4;
    const checker = ((x >> 3) + (y >> 3)) % 2 === 0;
    const ring = Math.abs(Math.hypot(x - 31.5, y - 31.5) - 20) < 3;
    pixels[offset] = ring ? 255 : checker ? 30 : 8;
    pixels[offset + 1] = ring ? 154 : checker ? 92 : 24;
    pixels[offset + 2] = ring ? 28 : checker ? 170 : 48;
    pixels[offset + 3] = 255;
  }
  return pixels;
}

async function connectWithRetry(path: string): Promise<Socket> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
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
