import assert from "node:assert/strict";
import test from "node:test";
import { FrameEncoder, Key } from "./protocol.js";
import { box, cacheNativeTextAdvance, circle, column, Component, ComponentHost, constrain, focusable, mesh, row, scrollView, stack, text, type Element } from "./ui.js";

test("constraints clamp desired sizes", () => {
  assert.deepEqual(constrain({ width: 200, height: 5 }, {
    minWidth: 10, maxWidth: 100, minHeight: 20, maxHeight: 80,
  }), { width: 100, height: 20 });
});

test("retained component host performs flex layout and hit testing", () => {
  class TestComponent extends Component {
    clicks = 0;
    builds = 0;
    build(): Element {
      this.builds += 1;
      return row([
        { ...box({ preferredSize: { width: 20, height: 30 }, flexGrow: 1 }, "red"),
          onClick: () => { this.clicks += 1; this.invalidate(); } },
        box({ preferredSize: { width: 40, height: 30 }, flexGrow: 1 }, "blue"),
      ], { padding: { top: 10, right: 10, bottom: 10, left: 10 }, gap: 5,
        crossAxisAlignment: "stretch" }, "root");
    }
  }
  const component = new TestComponent();
  const host = new ComponentHost();
  host.rebuild(component);
  host.layout({ width: 200, height: 100 });
  assert.deepEqual(host.rootBounds(), { x: 0, y: 0, width: 200, height: 100 });
  assert.equal(host.pointerDown({ x: 20, y: 20 }), true);
  assert.equal(component.clicks, 0);
  assert.equal(host.pointerUp({ x: 20, y: 20 }), true);
  assert.equal(component.clicks, 1);
  host.layout({ width: 200, height: 100 });
  assert.equal(component.builds, 2);
  assert.equal(host.pointerDown({ x: 199, y: 99 }), false);
});

test("pointer capture reports element-local drag coordinates", () => {
  const points: string[] = [];
  class DragComponent extends Component {
    build(): Element {
      return row([{ ...box({ preferredSize: { width: 50, height: 30 } }, "drag"),
        onPointerDown: (point) => points.push(`down:${point.x},${point.y}`),
        onPointerMove: (point) => points.push(`move:${point.x},${point.y}`),
        onPointerUp: (point) => points.push(`up:${point.x},${point.y}`) }],
      { padding: { top: 10, right: 0, bottom: 0, left: 20 } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new DragComponent());
  host.layout({ width: 100, height: 50 });
  host.pointerDown({ x: 25, y: 15 });
  host.pointerMove({ x: 60, y: 25 });
  host.pointerUp({ x: 60, y: 25 });
  assert.deepEqual(points, ["down:5,5", "move:40,15", "up:40,15"]);
});

test("keyboard focus traverses and activates controls", () => {
  let first = 0, second = 0;
  class KeyboardComponent extends Component {
    build(): Element {
      return row([
        { ...box({ preferredSize: { width: 50, height: 50 } }, "first"), onClick: () => { first += 1; } },
        { ...box({ preferredSize: { width: 50, height: 50 } }, "second"), onClick: () => { second += 1; } },
      ]);
    }
  }
  const host = new ComponentHost();
  host.rebuild(new KeyboardComponent());
  host.layout({ width: 100, height: 50 });
  assert.equal(host.keyDown(Key.Tab, false, false), true);
  host.keyDown(Key.Enter, false, false);
  host.keyUp(Key.Enter);
  assert.equal(first, 1);
  host.keyDown(Key.Tab, false, false);
  host.keyDown(Key.Space, false, false);
  host.keyUp(Key.Space);
  assert.equal(second, 1);
  host.keyDown(Key.Tab, true, false);
  host.keyDown(Key.Enter, false, false);
  host.keyUp(Key.Enter);
  assert.equal(first, 2);
});

test("scroll events target the clipped container under the pointer", () => {
  let received = 0;
  class ScrollComponent extends Component {
    build(): Element {
      return scrollView(box({ preferredSize: { width: 100, height: 200 } }), 0,
        { preferredSize: { width: 100, height: 50 } }, "scroll",
        (_x, y) => { received += y; });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new ScrollComponent());
  host.layout({ width: 100, height: 50 });
  assert.equal(host.scroll({ x: 20, y: 20 }, 0, 12), true);
  assert.equal(received, 12);
  assert.equal(host.scroll({ x: 120, y: 20 }, 0, 12), false);
});

test("UTF-8 text and editing keys route only to the focused node", () => {
  let value = "";
  class FieldComponent extends Component {
    build(): Element {
      return focusable(box({ preferredSize: { width: 100, height: 40 } }), {
        onTextInput: (text) => { value += text; },
        onKeyDown: (key) => { if (key === Key.Backspace) value = [...value].slice(0, -1).join(""); },
      });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new FieldComponent());
  host.layout({ width: 100, height: 40 });
  assert.equal(host.textInput("ignored"), false);
  host.keyDown(Key.Tab, false, false);
  assert.equal(host.textInput("hé"), true);
  host.keyDown(Key.Backspace, false, false);
  assert.equal(value, "h");
});

test("system text lowers to one server-shaped UTF-8 command", () => {
  class TextComponent extends Component {
    build(): Element {
      return text("Árvíztűrő — Ω", { fontSize: 20, fontFamily: "system",
        color: { red: 0.6, green: 0.9, blue: 1, alpha: 1 } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new TextComponent());
  host.layout({ width: 300, height: 40 });
  const encoder = new FrameEncoder();
  host.paint(encoder, { width: 300, height: 40 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt16LE(16), 8);
  assert.equal(frame.subarray(56, 56 + Buffer.byteLength("Árvíztűrő — Ω")).toString(),
    "Árvíztűrő — Ω");
});

test("multiline system text emits one compact shaped command per visible line", () => {
  class LinesComponent extends Component {
    build(): Element {
      return text("ONE\nΩ", { fontSize: 18, lineHeight: 24, fontFamily: "system" });
    }
  }
  const host = new ComponentHost(); host.rebuild(new LinesComponent());
  host.layout({ width: 200, height: 60 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 200, height: 60 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 3);
  assert.equal(frame.readUInt16LE(16), 8);
  const secondCommand = 16 + 8 + 32 + Buffer.byteLength("ONE");
  assert.equal(frame.readUInt16LE(secondCommand), 8);
  assert.equal(frame.subarray(secondCommand + 8 + 32,
    secondCommand + 8 + 32 + Buffer.byteLength("Ω")).toString(), "Ω");
});

test("native metrics drive automatic wrapping and centered line placement", () => {
  cacheNativeTextAdvance("system", "ONE", 2);
  cacheNativeTextAdvance("system", "TWO", 2);
  cacheNativeTextAdvance("system", " ", 0.5);
  class WrappedComponent extends Component {
    build(): Element {
      return column([text("ONE TWO", { fontSize: 10, lineHeight: 12,
        fontFamily: "system", wrap: true, textAlign: "center" })], {
        padding: { top: 0, right: 35, bottom: 0, left: 35 },
        crossAxisAlignment: "stretch",
      });
    }
  }
  const host = new ComponentHost(); host.rebuild(new WrappedComponent());
  host.layout({ width: 100, height: 30 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 100, height: 30 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 3);
  assert.equal(frame.readUInt16LE(16), 8);
  assert.ok(Math.abs(frame.readFloatLE(28) - -0.2) < 0.0001);
  const secondCommand = 16 + 8 + 32 + Buffer.byteLength("ONE");
  assert.equal(frame.readUInt16LE(secondCommand), 8);
});

test("cached native advance participates in row measurement", () => {
  cacheNativeTextAdvance("system", "METRIC", 2);
  class MetricsComponent extends Component {
    build(): Element {
      return row([text("METRIC", { fontSize: 10, fontFamily: "system" }),
        box({ preferredSize: { width: 10, height: 10 },
          background: { red: 1, green: 0, blue: 0, alpha: 1 } })]);
    }
  }
  const host = new ComponentHost(); host.rebuild(new MetricsComponent());
  host.layout({ width: 100, height: 20 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 100, height: 20 });
  encoder.endFrame();
  const frame = encoder.finish();
  const secondCommand = 16 + 8 + 32 + Buffer.byteLength("METRIC");
  assert.equal(frame.readUInt16LE(secondCommand), 2);
  assert.ok(Math.abs(frame.readFloatLE(secondCommand + 8 + 8) - -0.6) < 0.0001);
});

test("filled and bordered circles emit portable triangle meshes", () => {
  class ShapeComponent extends Component {
    build(): Element {
      return circle({ preferredSize: { width: 40, height: 40 },
        background: { red: 0.2, green: 0.8, blue: 0.5, alpha: 1 }, borderWidth: 4,
        borderColor: { red: 0.8, green: 1, blue: 0.9, alpha: 1 } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new ShapeComponent());
  host.layout({ width: 40, height: 40 });
  const encoder = new FrameEncoder();
  host.paint(encoder, { width: 40, height: 40 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 3); // Fill mesh, ring mesh, end-frame.
});

test("rounded rectangle fill and border are independently drawable", () => {
  class RoundedComponent extends Component {
    build(): Element {
      return box({ preferredSize: { width: 80, height: 40 }, cornerRadius: 10,
        background: { red: 0.1, green: 0.2, blue: 0.4, alpha: 1 }, borderWidth: 3,
        borderColor: { red: 0.4, green: 0.7, blue: 1, alpha: 1 } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new RoundedComponent());
  host.layout({ width: 80, height: 40 });
  const encoder = new FrameEncoder();
  host.paint(encoder, { width: 80, height: 40 });
  encoder.endFrame();
  assert.equal(encoder.finish().readUInt32LE(12), 3);
});

test("linear gradients lower to interpolated portable vertex colors", () => {
  class GradientComponent extends Component {
    build(): Element {
      return box({ preferredSize: { width: 100, height: 40 },
        backgroundGradient: {
          start: { red: 1, green: 0, blue: 0, alpha: 1 },
          end: { red: 0, green: 0, blue: 1, alpha: 1 },
          direction: "horizontal",
        } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new GradientComponent());
  host.layout({ width: 100, height: 40 });
  const encoder = new FrameEncoder();
  host.paint(encoder, { width: 100, height: 40 });
  encoder.endFrame();
  const frame = encoder.finish();
  const firstVertexColor = 16 + 8 + 8 + 8;
  const thirdVertexColor = firstVertexColor + 24 * 2;
  assert.equal(frame.readFloatLE(firstVertexColor), 1);
  assert.equal(frame.readFloatLE(firstVertexColor + 8), 0);
  assert.equal(frame.readFloatLE(thirdVertexColor), 0);
  assert.equal(frame.readFloatLE(thirdVertexColor + 8), 1);
});

test("diagonal patterns fill a clipped area with portable stripe geometry", () => {
  class PatternComponent extends Component {
    build(): Element {
      return box({ preferredSize: { width: 120, height: 60 },
        background: { red: 0.02, green: 0.02, blue: 0.02, alpha: 1 },
        backgroundPattern: { color: { red: 1, green: 0.5, blue: 0.1, alpha: 1 },
          stripeWidth: 8, gap: 8, direction: "forward" },
        borderWidth: 2, borderColor: { red: 0.8, green: 0.8, blue: 0.8, alpha: 1 } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new PatternComponent());
  host.layout({ width: 120, height: 60 });
  const encoder = new FrameEncoder();
  host.paint(encoder, { width: 120, height: 60 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 6); // Base, clip, stripes, pop, border, end.
});

test("indexed normalized meshes lower to backend-neutral colored triangles", () => {
  class MeshComponent extends Component {
    build(): Element {
      return mesh({ positions: [{ x: 0.5, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
        indices: [0, 1, 2], color: { red: 1, green: 0.4, blue: 0.1, alpha: 1 } },
      { preferredSize: { width: 100, height: 50 } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new MeshComponent());
  host.layout({ width: 100, height: 50 });
  const encoder = new FrameEncoder();
  host.paint(encoder, { width: 100, height: 50 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 2);
  assert.equal(frame.readUInt32LE(28), 3);
});

test("absolute layers use stable z-index order for hit testing", () => {
  const hits: string[] = [];
  class Layers extends Component {
    build(): Element {
      const inset = { top: 0, right: 0, bottom: 0, left: 0 };
      return stack([
        { ...box({ position: "absolute", inset, zIndex: 4 }, "lower"),
          onClick: () => hits.push("lower") },
        { ...box({ position: "absolute", inset, zIndex: 20 }, "upper"),
          onClick: () => hits.push("upper") },
      ], {}, "layers");
    }
  }
  const host = new ComponentHost();
  host.rebuild(new Layers()); host.layout({ width: 160, height: 90 });
  host.pointerDown({ x: 40, y: 30 }); host.pointerUp({ x: 40, y: 30 });
  assert.deepEqual(hits, ["upper"]);
});

test("a modal layer isolates keyboard focus from lower routes", () => {
  const hits: string[] = [];
  class ModalLayers extends Component {
    build(): Element {
      return stack([
        { ...box({}, "route"), onClick: () => hits.push("route") },
        { ...box({ position: "absolute", inset: { top: 0, right: 0, bottom: 0, left: 0 },
          zIndex: 100, modal: true }, "dialog"), onClick: () => hits.push("dialog") },
      ]);
    }
  }
  const host = new ComponentHost();
  host.rebuild(new ModalLayers()); host.layout({ width: 160, height: 90 });
  host.keyDown(Key.Tab, false, false);
  host.keyDown(Key.Enter, false, false); host.keyUp(Key.Enter);
  assert.deepEqual(hits, ["dialog"]);
});
