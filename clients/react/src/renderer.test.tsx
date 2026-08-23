import assert from "node:assert/strict";
import test from "node:test";
import { ReactSurface } from "./renderer.js";
import { useState } from "react";
import { AnimationClock, Key, KeyModifier, type WindowConfig } from "@mgfx/demo-client/protocol";
import { Button, Mesh, Path, RichText, Svg, Text, TextField } from "./components.js";
import { Window } from "./native-window.js";
import { ConicBadge, DiagonalPattern, DotGrid, WavePattern } from "./app.js";
import { Router, useRouter } from "./navigation.js";
import { AnimationProvider } from "./animation.js";

test("React JSX commits an MGFX binary frame", () => {
  let frame: Buffer | undefined;
  const surface = new ReactSurface((value) => { frame = value; });
  surface.render(<mgfx-column style={{ padding: { top: 8, right: 8, bottom: 8, left: 8 } }}>
    <mgfx-circle style={{ preferredSize: { width: 24, height: 24 },
      background: { red: 0.2, green: 0.8, blue: 0.5, alpha: 1 } }} />
    <mgfx-text value="REACT" />
  </mgfx-column>);
  surface.resize({ width: 200, height: 100 });
  assert.ok(frame);
  assert.equal(frame.toString("ascii", 0, 4), "MGFX");
  assert.equal(frame.readUInt32LE(8), frame.length);
});

test("React Text defaults to native server shaping", () => {
  let frame: Buffer | undefined;
  const surface = new ReactSurface((value) => { frame = value; });
  surface.render(<Text value="default native text" style={{ fontSize: 18 }} />);
  surface.resize({ width: 240, height: 40 });
  assert.ok(frame);
  assert.equal(frame.readUInt16LE(40), 8);
});

test("React RichText lowers styled spans to one native command", () => {
  let frame: Buffer | undefined;
  const surface = new ReactSurface((value) => { frame = value; });
  surface.render(<RichText style={{ fontSize: 24 }} spans={[
    { value: "Rich ", style: { fontWeight: "bold", color: { red: 1, green: 0, blue: 0, alpha: 1 } } },
    { value: "text", style: { fontFamily: "serif", fontStyle: "italic",
      color: { red: 0, green: 1, blue: 1, alpha: 1 } } },
  ]} />);
  surface.resize({ width: 300, height: 60 });
  assert.ok(frame);
  assert.equal(frame.readUInt16LE(40), 24);
  assert.equal(frame.readUInt32LE(60), 2);
});

test("React Path uploads canonical curves once and emits DrawPath instead of triangles", () => {
  let uploads = 0;
  let frame: Buffer | undefined;
  const surface = new ReactSurface((value) => { frame = value; }, undefined, {
    createPath: (_id, segments) => {
      uploads += 1;
      assert.deepEqual(segments.map((segment) => segment.verb), ["move", "cubic"]);
    },
  });
  surface.render(<Path data="M2 12C4 2 20 2 22 12"
    viewBox={{ x: 0, y: 0, width: 24, height: 24 }} strokeWidth={2}
    strokeColor={{ red: 1, green: 0.5, blue: 0.1, alpha: 1 }} />);
  surface.resize({ width: 100, height: 100 });
  surface.resize({ width: 120, height: 100 });
  assert.equal(uploads, 1);
  assert.ok(frame);
  assert.equal(frame.readUInt16LE(40), 7);
});

test("React Path lowers animated conic paint without generating client geometry", () => {
  let frame: Buffer | undefined;
  const surface = new ReactSurface((value) => { frame = value; }, undefined, {
    createPath: () => {},
  });
  surface.render(<Path data="M2 2H22V22H2Z" viewBox={{ x: 0, y: 0, width: 24, height: 24 }}
    conicGradient={{ center: { x: 12, y: 12 }, rotation: 0.5, stops: [
      { offset: 0, color: { red: 0.1, green: 0.8, blue: 1, alpha: 1 } },
      { offset: 0.5, color: { red: 0.8, green: 0.2, blue: 1, alpha: 1 } },
      { offset: 1, color: { red: 0.1, green: 0.8, blue: 1, alpha: 1 } },
    ] }} style={{ preferredSize: { width: 100, height: 100 } }} />);
  surface.resize({ width: 100, height: 100 });
  assert.ok(frame);
  assert.equal(frame.readUInt16LE(40), 37);
  assert.equal(frame.readFloatLE(40 + 8 + 136), 0.5);
});

test("React Path lowers persistent textures as native vector paint", () => {
  let frame: Buffer | undefined;
  const surface = new ReactSurface((value) => { frame = value; }, undefined, {
    createPath: () => {},
  });
  surface.render(<Path data="M2 2H22V22H2Z" viewBox={{ x: 0, y: 0, width: 24, height: 24 }}
    texture={{ textureId: 7, sourceRect: { x: 0, y: 0, width: 8, height: 8 },
      repeatX: true, repeatY: true, sampling: "nearest" }}
    style={{ preferredSize: { width: 100, height: 100 } }} />);
  surface.resize({ width: 100, height: 100 });
  assert.ok(frame);
  assert.equal(frame.readUInt16LE(40), 38);
  assert.equal(frame.readUInt32LE(40 + 8 + 128), 7);
  assert.equal(frame.readUInt8(40 + 8 + 133), 1);
});

test("React Svg composes a complete document from persistent server paths", () => {
  let uploads = 0;
  let frame: Buffer | undefined;
  const surface = new ReactSurface((value) => { frame = value; }, undefined, {
    createPath: () => { uploads += 1; },
  });
  surface.render(<Svg source={`<svg viewBox="0 0 40 24" fill="none" stroke="url(#edge)"
      stroke-width="2" stroke-dasharray="3 2"><defs><linearGradient id="edge">
        <stop offset="0" stop-color="#20d890"/><stop offset="1" stop-color="#4cc9ff"/>
      </linearGradient></defs>
    <rect x="1" y="1" width="38" height="22" rx="4"/>
    <circle cx="12" cy="12" r="6" fill="#22cc88" stroke="none"/>
  </svg>`} color={{ red: 0.3, green: 0.8, blue: 1, alpha: 1 }}
    style={{ preferredSize: { width: 200, height: 120 } }} />);
  surface.resize({ width: 200, height: 120 });
  assert.equal(uploads, 2);
  assert.ok(frame);
  assert.equal(frame.readUInt32LE(12), 4);
  const opcodes: number[] = [];
  let extendedPathOffset = -1;
  for (let offset = 16; offset < frame.length;) {
    const opcode = frame.readUInt16LE(offset);
    opcodes.push(opcode);
    if (opcode === 28) extendedPathOffset = offset;
    offset += 8 + frame.readUInt32LE(offset + 4);
  }
  assert.ok(opcodes.includes(28));
  assert.equal(frame.readFloatLE(extendedPathOffset + 16), 2);
});

test("React Svg clips a sliced symbol around its persistent path draw", () => {
  let frame: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  const surface = new ReactSurface((value) => { frame = value; }, undefined, {
    createPath: () => {},
  });
  surface.render(<Svg source={`<svg viewBox="0 0 100 50"><defs>
    <symbol id="wide" viewBox="0 0 20 10"><rect width="20" height="10"/></symbol>
    </defs><use href="#wide" x="10" y="5" width="20" height="20"
      preserveAspectRatio="xMidYMid slice" fill="#20d890"/></svg>`}
    style={{ preferredSize: { width: 200, height: 100 } }} />);
  surface.resize({ width: 200, height: 100 });
  const commands: { opcode: number; offset: number }[] = [];
  for (let offset = 16; offset < frame.length;) {
    commands.push({ opcode: frame.readUInt16LE(offset), offset });
    offset += 8 + frame.readUInt32LE(offset + 4);
  }
  assert.deepEqual(commands.map(({ opcode }) => opcode), [1, 4, 7, 5, 3]);
  const clipOffset = commands[1]!.offset + 8;
  assert.ok(Math.abs(frame.readFloatLE(clipOffset) - 0.1) < 1e-6);
  assert.ok(Math.abs(frame.readFloatLE(clipOffset + 4) - 0.1) < 1e-6);
  assert.ok(Math.abs(frame.readFloatLE(clipOffset + 8) - 0.3) < 1e-6);
  assert.ok(Math.abs(frame.readFloatLE(clipOffset + 12) - 0.5) < 1e-6);
});

test("React Mesh uploads indexed geometry once and draws its resource ID", () => {
  let uploads = 0;
  let frame: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  const surface = new ReactSurface((value) => { frame = value; }, undefined, {
    createPath: () => {},
    createMesh: (id, vertices, indices) => {
      uploads += 1; assert.equal(id, 31); assert.equal(vertices.length, 3);
      assert.deepEqual(indices, [0, 1, 2]);
    },
  });
  const color = { red: 1, green: 0.4, blue: 0.1, alpha: 1 };
  const data = { resourceId: 31,
    positions: [{ x: 0.5, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    indices: [0, 1, 2], color };
  surface.render(<Mesh data={data} style={{ preferredSize: { width: 100, height: 50 } }} />);
  surface.resize({ width: 100, height: 50 });
  surface.resize({ width: 120, height: 60 });
  assert.equal(uploads, 1);
  assert.equal(frame.readUInt16LE(40), 22);
  assert.equal(frame.readUInt32LE(48), 31);
});

test("React requests wrapping metrics per unique text run and relayouts once", async () => {
  let frames = 0, requests = 0;
  const measured = new Set<string>();
  const surface = new ReactSurface(() => { frames += 1; }, undefined, {
    createPath: () => {},
    measureText: async (family, value) => {
      requests += 1;
      assert.equal(family, "system");
      measured.add(value);
      return 8.75;
    },
  });
  surface.render(<mgfx-text value="ASYNC METRIC 937 SECOND LINE 937"
    textStyle={{ fontSize: 20, lineHeight: 24, fontFamily: "system", wrap: true }} />);
  surface.resize({ width: 400, height: 60 });
  const approximateFrames = frames;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(requests, 6);
  assert.deepEqual(measured, new Set(["ASYNC", "METRIC", "937", "SECOND", "LINE", " "]));
  assert.equal(frames, approximateFrames + 1);
  surface.resize({ width: 420, height: 60 });
  assert.equal(requests, 6);
});

test("React measures wrapped rich-text words with each span's native style", async () => {
  let frames = 0;
  const requests: string[] = [];
  const surface = new ReactSurface(() => { frames += 1; }, undefined, {
    createPath: () => {},
    measureText: async (family, value, weight, style) => {
      requests.push(`${family}:${weight}:${style}:${value}`);
      return value === " " ? 0.5 : 4;
    },
  });
  surface.render(<RichText style={{ fontSize: 20, lineHeight: 26, wrap: true }} spans={[
    { value: "ASYNC-RICH ", style: { fontWeight: "semibold" } },
    { value: "SERIF-WORD", style: { fontFamily: "serif", fontStyle: "italic" } },
  ]} />);
  surface.resize({ width: 130, height: 60 });
  const approximateFrames = frames;
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(new Set(requests), new Set([
    "system:semibold:regular:ASYNC-RICH",
    "system:semibold:regular: ",
    "serif:regular:italic:SERIF-WORD",
  ]));
  assert.equal(frames, approximateFrames + 1);
});

test("native router pushes and pops React route history", () => {
  let observed = "";
  function Home() {
    const router = useRouter(); observed = `${router.route}:${router.canGoBack}`;
    return <mgfx-stack style={{ preferredSize: { width: 100, height: 50 } }}
      onClick={() => router.push("details")} />;
  }
  function Details() {
    const router = useRouter(); observed = `${router.route}:${router.canGoBack}`;
    return <mgfx-stack style={{ preferredSize: { width: 100, height: 50 } }}
      onClick={router.back} />;
  }
  const surface = new ReactSurface(() => {});
  surface.render(<Router initialRoute="home" routes={{ home: <Home />, details: <Details /> }} />);
  surface.resize({ width: 100, height: 50 });
  assert.equal(observed, "home:false");
  surface.pointerDown({ x: 20, y: 20 }); surface.pointerUp({ x: 20, y: 20 });
  assert.equal(observed, "details:true");
  surface.pointerDown({ x: 20, y: 20 }); surface.pointerUp({ x: 20, y: 20 });
  assert.equal(observed, "home:false");
});

test("MGFX pointer events drive React hook state and a new commit", () => {
  let frames = 0;
  function Counter() {
    const [count, setCount] = useState(0);
    return <mgfx-stack style={{ preferredSize: { width: 100, height: 50 },
      background: { red: 0.2, green: 0.3, blue: 0.6, alpha: 1 } }}
      onClick={() => setCount((value) => value + 1)}>
      <mgfx-text value={`COUNT ${count}`} />
    </mgfx-stack>;
  }
  const surface = new ReactSurface(() => { frames += 1; });
  surface.render(<Counter />);
  surface.resize({ width: 100, height: 50 });
  const before = frames;
  surface.pointerDown({ x: 20, y: 20 });
  surface.pointerUp({ x: 20, y: 20 });
  assert.ok(frames > before);
});

test("controlled TextField owns focus, UTF-8 input, and Backspace", () => {
  let observed = "";
  function Form() {
    const [value, setValue] = useState("");
    return <TextField value={value} onChange={(next) => { observed = next; setValue(next); }} />;
  }
  const surface = new ReactSurface(() => {});
  surface.render(<Form />);
  surface.resize({ width: 240, height: 48 });
  surface.pointerDown({ x: 20, y: 20 });
  surface.pointerUp({ x: 20, y: 20 });
  surface.textInput("é");
  assert.equal(observed, "é");
  surface.keyDown({ key: Key.Backspace, modifiers: 0, repeat: false });
  assert.equal(observed, "");
});

test("TextField edits Unicode at its movable caret", () => {
  let observed = "abc";
  function Form() {
    const [value, setValue] = useState("abc");
    return <TextField value={value} onChange={(next) => { observed = next; setValue(next); }} />;
  }
  const surface = new ReactSurface(() => {});
  surface.render(<Form />); surface.resize({ width: 260, height: 48 });
  surface.pointerDown({ x: 240, y: 20 }); surface.pointerUp({ x: 240, y: 20 });
  surface.keyDown({ key: Key.ArrowLeft, modifiers: 0, repeat: false });
  surface.textInput("Ω");
  assert.equal(observed, "abΩc");
  surface.keyDown({ key: Key.Backspace, modifiers: 0, repeat: false });
  assert.equal(observed, "abc");
});

test("TextField positions and replaces a pointer-dragged selection", () => {
  let observed = "abcde";
  function Form() {
    const [value, setValue] = useState("abcde");
    return <TextField value={value} onChange={(next) => { observed = next; setValue(next); }} />;
  }
  const surface = new ReactSurface(() => {});
  surface.render(<Form />); surface.resize({ width: 260, height: 48 });
  surface.pointerDown({ x: 25, y: 20 });
  surface.pointerMove({ x: 62, y: 20 });
  surface.pointerUp({ x: 62, y: 20 });
  surface.textInput("X");
  assert.equal(observed, "aXe");
});

test("TextField extends keyboard selection and supports Select All", () => {
  let observed = "abc";
  function Form() {
    const [value, setValue] = useState("abc");
    return <TextField value={value} onChange={(next) => { observed = next; setValue(next); }} />;
  }
  const surface = new ReactSurface(() => {});
  surface.render(<Form />); surface.resize({ width: 260, height: 48 });
  surface.pointerDown({ x: 240, y: 20 }); surface.pointerUp({ x: 240, y: 20 });
  surface.keyDown({ key: Key.ArrowLeft, modifiers: KeyModifier.Shift, repeat: false });
  surface.keyDown({ key: Key.ArrowLeft, modifiers: KeyModifier.Shift, repeat: false });
  surface.textInput("X");
  assert.equal(observed, "aX");
  surface.keyDown({ key: Key.SelectAll, modifiers: KeyModifier.Command, repeat: false });
  surface.textInput("Ω");
  assert.equal(observed, "Ω");
});

test("focused TextField caret blinks on the native animation clock", async () => {
  const requests: number[] = [];
  const clock = new AnimationClock((sequence) => requests.push(sequence));
  let frame: Buffer = Buffer.alloc(0);
  const surface = new ReactSurface((next) => { frame = next; });
  surface.render(<AnimationProvider clock={clock}>
    <TextField value="blink" onChange={() => {}} />
  </AnimationProvider>);
  surface.resize({ width: 260, height: 48 });
  surface.pointerDown({ x: 240, y: 20 }); surface.pointerUp({ x: 240, y: 20 });
  assert.equal(requests.length, 1);
  clock.receive(requests[0]!, 1_000_000_000n);
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  const visible = Buffer.from(frame);
  clock.receive(requests[1]!, 1_700_000_000n);
  await new Promise<void>((resolve) => setTimeout(resolve, 10));
  assert.notDeepEqual(frame, visible);
});

test("TextField semantic shortcuts use the native clipboard service", async () => {
  let observed = "hello";
  let copied = "";
  function Form() {
    const [value, setValue] = useState("hello");
    return <TextField value={value} onChange={(next) => { observed = next; setValue(next); }} />;
  }
  const surface = new ReactSurface(() => {}, {
    setTitle: () => {}, configure: () => {}, setState: () => {}, setCursor: () => {},
    writeClipboard: (text) => { copied = text; }, readClipboard: async () => "native",
    setChrome: () => {},
  });
  surface.render(<Form />);
  surface.resize({ width: 240, height: 48 });
  surface.pointerDown({ x: 20, y: 20 });
  surface.pointerUp({ x: 20, y: 20 });
  surface.keyDown({ key: Key.Copy, modifiers: 8, repeat: false });
  assert.equal(copied, "hello");
  surface.keyDown({ key: Key.Cut, modifiers: 8, repeat: false });
  assert.equal(observed, "");
  surface.keyDown({ key: Key.Paste, modifiers: 8, repeat: false });
  await Promise.resolve();
  assert.equal(observed, "native");
});

test("Window declaratively emits native title and size commands", () => {
  let title = "";
  let config: WindowConfig | undefined;
  let windowState = "";
  let chrome = "";
  const surface = new ReactSurface(() => {}, {
    setTitle: (value) => { title = value; },
    configure: (value) => { config = value; },
    setState: (value) => { windowState = `${value.mode}:${value.resizable}`; },
    setCursor: () => {},
    writeClipboard: () => {}, readClipboard: async () => "",
    setChrome: (mode, height) => { chrome = `${mode}:${height}`; },
  });
  surface.render(<Window title="DECLARATIVE WINDOW" width={900} height={600}
    minimumWidth={640} minimumHeight={480} chrome="overlay" draggableHeight={72}>
    <mgfx-box />
  </Window>);
  assert.equal(title, "DECLARATIVE WINDOW");
  assert.deepEqual(config, { width: 900, height: 600, minimumWidth: 640, minimumHeight: 480 });
  assert.equal(windowState, "normal:true");
  assert.equal(chrome, "overlay:72");
});

test("React hover state drives the native cursor", () => {
  const cursors: string[] = [];
  const surface = new ReactSurface(() => {}, {
    setTitle: () => {}, configure: () => {}, setState: () => {},
    setCursor: (cursor) => { cursors.push(cursor); },
    writeClipboard: () => {}, readClipboard: async () => "",
    setChrome: () => {},
  });
  surface.render(<Button label="OPEN" onPress={() => {}}
    style={{ preferredSize: { width: 100, height: 48 } }} />);
  surface.resize({ width: 100, height: 48 });
  surface.pointerMove({ x: 20, y: 20 });
  assert.equal(cursors.at(-1), "pointer");
  surface.pointerMove({ x: 200, y: 200 });
  assert.equal(cursors.at(-1), "arrow");
});

test("dot-grid animation timestamps produce visibly different frames", () => {
  let frame: Buffer = Buffer.alloc(0);
  const surface = new ReactSurface((value) => { frame = value; });
  surface.render(<DotGrid time={0} />);
  surface.resize({ width: 52, height: 52 });
  const first = Buffer.from(frame);
  surface.render(<DotGrid time={280} />);
  assert.notDeepEqual(frame, first);
});

test("diagonal pattern animation advances from left to right", () => {
  let frame: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  const surface = new ReactSurface((value) => { frame = value; });
  const patternOffset = (): number => {
    let offset = 16;
    while (offset < frame.length) {
      const opcode = frame.readUInt16LE(offset);
      const payloadSize = frame.readUInt32LE(offset + 4);
      if (opcode === 17) return frame.readFloatLE(offset + 8 + 24);
      offset += 8 + payloadSize;
    }
    throw new Error("DrawDiagonalPattern command not found");
  };
  surface.render(<DiagonalPattern time={0} />);
  surface.resize({ width: 1200, height: 92 });
  const first = patternOffset();
  surface.render(<DiagonalPattern time={180} />);
  assert.ok(patternOffset() < first);
});

test("wave animation emits one server pattern instead of circle nodes", () => {
  let frame: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  const surface = new ReactSurface((value) => { frame = value; });
  surface.render(<WavePattern time={480} />);
  surface.resize({ width: 1200, height: 70 });
  let offset = 16, waveCommands = 0;
  while (offset < frame.length) {
    const opcode = frame.readUInt16LE(offset);
    const payloadSize = frame.readUInt32LE(offset + 4);
    if (opcode === 21) waveCommands += 1;
    assert.notEqual(opcode, 16); // No individual DrawCircle records.
    offset += 8 + payloadSize;
  }
  assert.equal(waveCommands, 1);
});

test("conic badge animation changes only server gradient parameters", () => {
  let frame: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  const surface = new ReactSurface((value) => { frame = value; });
  surface.render(<ConicBadge time={0} />); surface.resize({ width: 52, height: 52 });
  const first = Buffer.from(frame);
  surface.render(<ConicBadge time={400} />);
  assert.notDeepEqual(frame, first);
  let offset = 16, conicCommands = 0;
  while (offset < frame.length) {
    const opcode = frame.readUInt16LE(offset);
    const payloadSize = frame.readUInt32LE(offset + 4);
    if (opcode === 23) conicCommands += 1;
    offset += 8 + payloadSize;
  }
  assert.equal(conicCommands, 1);
});
