import assert from "node:assert/strict";
import test from "node:test";
import { ReactSurface } from "./renderer.js";
import { useState } from "react";
import { Key, type WindowConfig } from "@mgfx/demo-client/protocol";
import { Button, TextField } from "./components.js";
import { Window } from "./native-window.js";
import { DotGrid } from "./app.js";

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
