import assert from "node:assert/strict";
import test from "node:test";
import { FrameEncoder, Key } from "./protocol.js";
import { box, cacheNativeTextAdvance, circle, column, Component, ComponentHost, constrain,
  focusable, mesh, richText, row, scrollView, stack, text, type Element } from "./ui.js";

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

test("single-sided absolute insets position preferred sizes without stretching", () => {
  const hits: string[] = [];
  class AbsoluteComponent extends Component {
    build(): Element {
      return stack([
        { ...box({ position: "absolute", inset: { top: 14, left: 20, right: 20 },
          preferredSize: { height: 32 } }, "top"), onClick: () => hits.push("top") },
        { ...box({ position: "absolute", inset: { right: 7, bottom: 9 },
          preferredSize: { width: 24, height: 18 } }, "corner"),
          onClick: () => hits.push("corner") },
      ], {}, "root");
    }
  }
  const host = new ComponentHost();
  host.rebuild(new AbsoluteComponent());
  host.layout({ width: 200, height: 100 });
  assert.equal(host.pointerDown({ x: 30, y: 20 }), true);
  host.pointerUp({ x: 30, y: 20 });
  assert.equal(host.pointerDown({ x: 180, y: 80 }), true);
  host.pointerUp({ x: 180, y: 80 });
  assert.deepEqual(hits, ["top", "corner"]);
  assert.equal(host.pointerDown({ x: 100, y: 70 }), false);
});

test("visible overflow remains interactive while clipped overflow does not", () => {
  let visibleClicks = 0;
  class OverflowComponent extends Component {
    build(): Element {
      const overflow = (clip: boolean, key: string) => stack([
        { ...box({ position: "absolute", inset: { top: 40, left: 0 },
          preferredSize: { width: 80, height: 30 } }),
          onClick: () => { visibleClicks += 1; } },
      ], { preferredSize: { width: 80, height: 30 }, clip }, key);
      return row([overflow(false, "visible"), overflow(true, "clipped")]);
    }
  }
  const host = new ComponentHost();
  host.rebuild(new OverflowComponent()); host.layout({ width: 160, height: 80 });
  assert.equal(host.pointerDown({ x: 20, y: 50 }), true);
  host.pointerUp({ x: 20, y: 50 });
  assert.equal(visibleClicks, 1);
  assert.equal(host.pointerDown({ x: 100, y: 50 }), false);
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

test("transformed components paint transform commands and hit their visual position", () => {
  let clicks = 0;
  class TransformComponent extends Component {
    build(): Element {
      return row([{ ...box({ preferredSize: { width: 20, height: 20 }, transform: {
        translateX: 40, rotation: 8, scaleX: 1.1, scaleY: 1.1,
      } }, "moving"), onClick: () => { clicks += 1; } }]);
    }
  }
  const host = new ComponentHost();
  host.rebuild(new TransformComponent()); host.layout({ width: 100, height: 40 });
  assert.equal(host.pointerDown({ x: 10, y: 10 }), false);
  assert.equal(host.pointerDown({ x: 50, y: 10 }), true);
  host.pointerUp({ x: 50, y: 10 });
  assert.equal(clicks, 1);
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 100, height: 40 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt16LE(16), 9);
});

test("component opacity lowers around the complete subtree", () => {
  class OpacityComponent extends Component {
    build(): Element {
      return stack([circle({ preferredSize: { width: 20, height: 20 },
        background: { red: 1, green: 0, blue: 0, alpha: 1 } })], { opacity: 0.4 });
    }
  }
  const host = new ComponentHost(); host.rebuild(new OpacityComponent());
  host.layout({ width: 40, height: 40 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 40, height: 40 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt16LE(16), 11);
  assert.equal(frame.readUInt16LE(frame.length - 16), 12);
});

test("component shadow draws before its own clipping and content", () => {
  class ShadowComponent extends Component {
    build(): Element {
      return box({ preferredSize: { width: 80, height: 40 }, cornerRadius: 10, clip: true,
        background: { red: 0.2, green: 0.4, blue: 0.8, alpha: 1 },
        shadow: { color: { red: 0, green: 0, blue: 0, alpha: 0.6 },
          blur: 16, spread: 2, offsetY: 6 } });
    }
  }
  const host = new ComponentHost(); host.rebuild(new ShadowComponent());
  host.layout({ width: 100, height: 60 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 100, height: 60 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt16LE(16), 13);
  assert.equal(frame.readUInt16LE(68), 4);
});

test("radial component fill lowers without a client triangle fan", () => {
  class RadialComponent extends Component {
    build(): Element {
      return box({ preferredSize: { width: 100, height: 60 }, cornerRadius: 12,
        backgroundRadialGradient: {
          inner: { red: 1, green: 0.7, blue: 0.2, alpha: 1 },
          outer: { red: 0.1, green: 0.05, blue: 0.3, alpha: 1 },
          centerX: 0.25, centerY: 0.3, radius: 90,
        } });
    }
  }
  const host = new ComponentHost(); host.rebuild(new RadialComponent());
  host.layout({ width: 100, height: 60 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 100, height: 60 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt16LE(16), 14);
  assert.equal(frame.readUInt16LE(88), 3);
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

test("scrolling chains to an outer view when a nested view reaches its edge", () => {
  let innerDelta = 0, outerDelta = 0;
  class NestedScrollComponent extends Component {
    build(): Element {
      const inner = scrollView(box({ preferredSize: { width: 100, height: 100 } }), 50,
        { preferredSize: { width: 100, height: 50 } }, "inner",
        (_x, y) => { innerDelta += y; });
      const content = column([inner, box({ preferredSize: { width: 100, height: 150 } })]);
      return scrollView(content, 0, { preferredSize: { width: 100, height: 50 } }, "outer",
        (_x, y) => { outerDelta += y; });
    }
  }
  const host = new ComponentHost(); host.rebuild(new NestedScrollComponent());
  host.layout({ width: 100, height: 50 });
  assert.equal(host.scroll({ x: 20, y: 20 }, 0, 18), true);
  assert.equal(innerDelta, 0);
  assert.equal(outerDelta, 18);
});

test("scroll deltas clamp to the remaining content extent", () => {
  let received = 0;
  class ScrollComponent extends Component {
    build(): Element {
      return scrollView(box({ preferredSize: { width: 100, height: 90 } }), 0,
        { preferredSize: { width: 100, height: 50 } }, "scroll",
        (_x, y) => { received += y; });
    }
  }
  const host = new ComponentHost(); host.rebuild(new ScrollComponent());
  host.layout({ width: 100, height: 50 });
  assert.equal(host.scroll({ x: 20, y: 20 }, 0, 200), true);
  assert.equal(received, 40);
});

test("overflowing scroll views paint a retained scrollbar above their content", () => {
  class ScrollComponent extends Component {
    build(): Element {
      return scrollView(box({ preferredSize: { width: 100, height: 200 } }), 50,
        { preferredSize: { width: 100, height: 80 } }, "scroll", () => {});
    }
  }
  const host = new ComponentHost(); host.rebuild(new ScrollComponent());
  host.layout({ width: 100, height: 80 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 100, height: 80 });
  encoder.endFrame();
  const frame = encoder.finish();
  const opcodes: number[] = [];
  let offset = 16;
  for (let index = 0; index < frame.readUInt32LE(12); index++) {
    opcodes.push(frame.readUInt16LE(offset));
    offset += 8 + frame.readUInt32LE(offset + 4);
  }
  assert.equal(opcodes.filter((opcode) => opcode === 15).length, 2);
  assert.equal(opcodes.at(-2), 5);
  assert.equal(opcodes.at(-1), 3);
});

test("retained scrollbar track and thumb support pointer dragging", () => {
  class DraggableScroll extends Component {
    offset = 0;
    build(): Element {
      return scrollView(box({ preferredSize: { width: 100, height: 240 } }), this.offset,
        { preferredSize: { width: 100, height: 100 } }, "scroll",
        (_x, y) => { this.offset = Math.max(0, this.offset + y); this.invalidate(); });
    }
  }
  const component = new DraggableScroll();
  const host = new ComponentHost(); host.rebuild(component);
  host.layout({ width: 100, height: 100 });
  assert.equal(host.pointerDown({ x: 87, y: 70 }), true);
  host.layout({ width: 100, height: 100 });
  const trackJump = component.offset;
  assert.ok(trackJump > 0);
  assert.equal(host.pointerMove({ x: 87, y: 84 }), true);
  host.layout({ width: 100, height: 100 });
  assert.ok(component.offset > trackJump);
  assert.equal(host.pointerUp({ x: 40, y: 84 }), true);
});

test("vertical scroll content stretches across the viewport cross axis", () => {
  let clicked = false;
  class WideScrollComponent extends Component {
    build(): Element {
      return scrollView(column([{ ...box({ preferredSize: { width: 30, height: 100 } }),
        onClick: () => { clicked = true; } }], { crossAxisAlignment: "stretch" }), 0,
      { preferredSize: { width: 120, height: 50 } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new WideScrollComponent());
  host.layout({ width: 120, height: 50 });
  assert.equal(host.pointerDown({ x: 110, y: 20 }), false);
  assert.equal(host.pointerDown({ x: 80, y: 20 }), true);
  host.pointerUp({ x: 80, y: 20 });
  assert.equal(clicked, true);
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
      return text("Árvíztűrő — Ω", { fontSize: 20, fontFamily: "rounded",
        fontWeight: "semibold", fontStyle: "italic",
        letterSpacing: 1,
        textDecoration: "underline line-through",
        fontResourceId: 42,
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
  assert.equal(frame.readUInt8(24), 3);
  assert.equal(frame.readUInt8(25), 3);
  assert.equal(frame.readUInt8(26), 1);
  assert.equal(frame.readUInt8(27), 3);
  assert.ok(Math.abs(frame.readFloatLE(56) - 0.05) < 0.00001);
  assert.equal(frame.readUInt8(60), 3);
  assert.equal(frame.readUInt32LE(64), 42);
  assert.equal(frame.subarray(68, 68 + Buffer.byteLength("Árvíztűrő — Ω")).toString(),
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

test("styled rich text wraps into aligned compact native lines", () => {
  cacheNativeTextAdvance("system", "ALPHA", 3);
  cacheNativeTextAdvance("system", " ", 0.5);
  cacheNativeTextAdvance("serif", "BETA", 4, "regular", "italic");
  cacheNativeTextAdvance("serif", " ", 0.5, "regular", "italic");
  cacheNativeTextAdvance("system", "GAMMA", 4, "bold");
  class WrappedRichText extends Component {
    build(): Element {
      return column([richText([
        { value: "ALPHA " },
        { value: "BETA ", style: { fontFamily: "serif", fontStyle: "italic" } },
        { value: "GAMMA", style: { fontWeight: "bold" } },
      ], { fontSize: 10, fontFamily: "system", wrap: true, lineHeight: 14,
        textAlign: "center" })], {
        padding: { top: 0, right: 20, bottom: 0, left: 20 },
        crossAxisAlignment: "stretch",
      });
    }
  }
  const host = new ComponentHost(); host.rebuild(new WrappedRichText());
  host.layout({ width: 120, height: 40 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 120, height: 40 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 3);
  assert.equal(frame.readUInt16LE(16), 24);
  assert.ok(Math.abs(frame.readFloatLE(24) - -0.625) < 0.0001);
  const secondCommand = 16 + 8 + frame.readUInt32LE(20);
  assert.equal(frame.readUInt16LE(secondCommand), 24);
  assert.ok(Math.abs(frame.readFloatLE(secondCommand + 8) - -1 / 3) < 0.0001);
  assert.ok(Math.abs(frame.readFloatLE(secondCommand + 12) - 0.3) < 0.0001);
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
  assert.equal(frame.readUInt16LE(secondCommand), 15);
  assert.ok(Math.abs(frame.readFloatLE(secondCommand + 8) - -0.6) < 0.0001);
});

test("filled and bordered circles emit one server SDF command", () => {
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
  assert.equal(frame.readUInt32LE(12), 2);
  assert.equal(frame.readUInt16LE(16), 16);
});

test("semantic arcs emit one server SDF command without client tessellation", () => {
  class ArcComponent extends Component {
    build(): Element {
      return box({ preferredSize: { width: 120, height: 120 }, backgroundArc: {
        startAngle: -90, sweepAngle: 270, thickness: 14, roundCaps: true,
        color: { red: 0.2, green: 0.8, blue: 1, alpha: 1 },
      } });
    }
  }
  const host = new ComponentHost(); host.rebuild(new ArcComponent());
  host.layout({ width: 120, height: 120 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 120, height: 120 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 2);
  assert.equal(frame.readUInt16LE(16), 46);
  assert.equal(frame.readUInt32LE(20), 48);
  assert.ok(Math.abs(frame.readFloatLE(40) + Math.PI / 2) < 0.00001);
});

test("animated semantic arcs accept rotations accumulated over long runtimes", () => {
  class ArcComponent extends Component {
    build(): Element {
      return box({ preferredSize: { width: 80, height: 80 }, backgroundArc: {
        startAngle: 86_400_145, sweepAngle: 82, thickness: 10,
        color: { red: 0.5, green: 0.3, blue: 1, alpha: 1 },
      } });
    }
  }
  const host = new ComponentHost(); host.rebuild(new ArcComponent());
  host.layout({ width: 80, height: 80 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 80, height: 80 });
  encoder.endFrame();
  assert.equal(encoder.finish().readUInt16LE(16), 46);
});

test("gradient arcs remain one semantic server command", () => {
  class GradientArcComponent extends Component {
    build(): Element {
      return box({ preferredSize: { width: 120, height: 120 }, backgroundArc: {
        startAngle: 0, sweepAngle: 180, thickness: 16,
        startColor: { red: 0.1, green: 0.8, blue: 1, alpha: 1 },
        endColor: { red: 0.8, green: 0.2, blue: 1, alpha: 0.7 },
      } });
    }
  }
  const host = new ComponentHost(); host.rebuild(new GradientArcComponent());
  host.layout({ width: 120, height: 120 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 120, height: 120 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 2);
  assert.equal(frame.readUInt16LE(16), 47);
  assert.equal(frame.readUInt32LE(20), 64);
});

test("gradient circles emit one server SDF command instead of a triangle fan", () => {
  class GradientCircle extends Component {
    build(): Element {
      return circle({ preferredSize: { width: 60, height: 60 }, backgroundGradient: {
        start: { red: 0.1, green: 0.9, blue: 0.7, alpha: 1 },
        end: { red: 0.5, green: 0.2, blue: 1, alpha: 1 }, direction: "diagonal",
      } });
    }
  }
  const host = new ComponentHost(); host.rebuild(new GradientCircle());
  host.layout({ width: 60, height: 60 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 60, height: 60 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 2);
  assert.equal(frame.readUInt16LE(16), 25);
  assert.equal(frame.readUInt32LE(20), 52);
});

test("technical grids lower to one clipped server pattern command", () => {
  class GridComponent extends Component {
    build(): Element {
      return box({ preferredSize: { width: 400, height: 240 }, cornerRadius: 16,
        background: { red: 0.02, green: 0.03, blue: 0.06, alpha: 1 },
        backgroundGrid: { spacing: 20, minorWidth: 1, majorWidth: 2, majorEvery: 4,
          minorColor: { red: 0.2, green: 0.4, blue: 0.8, alpha: 0.2 },
          majorColor: { red: 0.3, green: 0.7, blue: 1, alpha: 0.4 } } });
    }
  }
  const host = new ComponentHost(); host.rebuild(new GridComponent());
  host.layout({ width: 400, height: 240 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 400, height: 240 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt16LE(16), 15);
  const gridOffset = 16 + 8 + frame.readUInt32LE(20);
  assert.equal(frame.readUInt16LE(gridOffset), 26);
  assert.equal(frame.readUInt32LE(gridOffset + 4), 76);
  assert.equal(frame.readFloatLE(gridOffset + 8 + 40), 16);
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
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 2);
  assert.equal(frame.readUInt16LE(16), 15);
});

test("linear gradients lower to one constant-size server command", () => {
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
  assert.equal(frame.readUInt32LE(12), 2);
  assert.equal(frame.readUInt16LE(16), 18);
  assert.equal(frame.readUInt32LE(20), 56);
  assert.equal(frame.readFloatLE(44), 0); // Horizontal direction.
});

test("conic gradients lower rotation and rounded masking to one command", () => {
  class ConicComponent extends Component {
    build(): Element {
      return box({ preferredSize: { width: 60, height: 60 }, cornerRadius: 30,
        backgroundConicGradient: {
          start: { red: 0, green: 0.8, blue: 1, alpha: 1 },
          middle: { red: 0.8, green: 0.2, blue: 1, alpha: 1 },
          end: { red: 0, green: 0.8, blue: 1, alpha: 1 }, rotation: 90 } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new ConicComponent()); host.layout({ width: 60, height: 60 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 60, height: 60 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 2);
  assert.equal(frame.readUInt16LE(16), 23);
  assert.ok(Math.abs(frame.readFloatLE(48) - Math.PI / 2) < 0.00001);
  assert.equal(frame.readFloatLE(52), 30);
});

test("rounded images lower to the server image-surface shader", () => {
  class RoundedImage extends Component {
    build(): Element {
      return box({ preferredSize: { width: 100, height: 60 }, cornerRadius: 12,
        backgroundImage: { textureId: 3, sampling: "nearest" } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new RoundedImage());
  host.layout({ width: 100, height: 60 });
  const encoder = new FrameEncoder();
  host.paint(encoder, { width: 100, height: 60 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 2);
  assert.equal(frame.readUInt16LE(16), 19);
  assert.equal(frame.readUInt32LE(28), 1);
  assert.equal(frame.readFloatLE(80), 12);
});

test("image color effects lower to one filtered server draw", () => {
  class FilteredImage extends Component {
    build(): Element {
      return box({ preferredSize: { width: 100, height: 60 }, cornerRadius: 10,
        backgroundImage: { textureId: 3,
          effects: { saturation: 1.5, contrast: 1.2, brightness: 0.1,
            hueRotation: 0.5, blur: 2 } } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new FilteredImage()); host.layout({ width: 100, height: 60 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 100, height: 60 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt16LE(16), 45);
  assert.ok(Math.abs(frame.readFloatLE(84) - 1.5) < 0.0001);
  assert.ok(Math.abs(frame.readFloatLE(96) - 0.5) < 0.0001);
  assert.ok(Math.abs(frame.readFloatLE(100) - 2) < 0.0001);
});

test("image fitting honors edge alignment for letterboxing and cropping", () => {
  const render = (fit: "contain" | "cover") => {
    class AlignedImage extends Component {
      build(): Element {
        return box({ preferredSize: { width: 100, height: 100 }, backgroundImage: {
          textureId: 3, sourceSize: { width: 200, height: 100 }, fit,
          alignX: "end", alignY: "end" } });
      }
    }
    const host = new ComponentHost();
    host.rebuild(new AlignedImage()); host.layout({ width: 100, height: 100 });
    const encoder = new FrameEncoder(); host.paint(encoder, { width: 100, height: 100 });
    encoder.endFrame();
    return encoder.finish();
  };
  const contained = render("contain");
  assert.equal(contained.readUInt16LE(16), 6);
  assert.equal(contained.readFloatLE(36), 0); // Aligned to the bottom: top is y=50.
  assert.equal(contained.readFloatLE(44), -1);
  const covered = render("cover");
  assert.equal(covered.readFloatLE(48), 0.5); // Right half of the wide source remains visible.
  assert.equal(covered.readFloatLE(56), 1);
});

test("source-region cover crops inside the selected atlas frame", () => {
  class Sprite extends Component { build(): Element { return box({
    preferredSize: { width: 100, height: 100 }, backgroundImage: {
      textureId: 4, sourceSize: { width: 400, height: 200 },
      sourceRect: { x: 100, y: 50, width: 100, height: 50 },
      fit: "cover", alignX: "end" } }); } }
  const host = new ComponentHost(); host.rebuild(new Sprite()); host.layout({ width: 100, height: 100 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 100, height: 100 });
  encoder.endFrame(); const frame = encoder.finish();
  assert.equal(frame.readUInt16LE(16), 6);
  assert.equal(frame.readFloatLE(48), 0.375);
  assert.equal(frame.readFloatLE(56), 0.5);
  assert.equal(frame.readFloatLE(52), 0.25);
  assert.equal(frame.readFloatLE(60), 0.5);
});

test("image tiles lower size and animated phase to one server draw", () => {
  class TiledImage extends Component {
    build(): Element {
      return box({ preferredSize: { width: 120, height: 60 }, cornerRadius: 10,
        backgroundImage: { textureId: 5, tileSize: { width: 30, height: 20 },
          tileOffsetX: 7.5, tileOffsetY: -5, repeatX: true, repeatY: true } });
    }
  }
  const host = new ComponentHost(); host.rebuild(new TiledImage());
  host.layout({ width: 120, height: 60 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 120, height: 60 });
  encoder.endFrame(); const frame = encoder.finish();
  assert.equal(frame.readUInt16LE(16), 39);
  assert.equal(frame.readUInt32LE(28), 6); // Repeat X and Y with linear sampling.
  assert.equal(frame.readFloatLE(48), -0.25);
  assert.equal(frame.readFloatLE(52), 0.25);
  assert.equal(frame.readFloatLE(56), 3.75);
  assert.equal(frame.readFloatLE(60), 3.25);
  assert.equal(frame.readFloatLE(80), 10);
});

test("nine-slice backgrounds preserve source and layout insets", () => {
  class Panel extends Component { build(): Element { return box({
    preferredSize: { width: 200, height: 80 }, cornerRadius: 9,
    backgroundImage: { textureId: 6, sourceSize: { width: 100, height: 50 },
      nineSlice: { source: { left: 10, top: 5, right: 20, bottom: 10 },
        destination: { left: 16, top: 8, right: 24, bottom: 12 } } } }); } }
  const host = new ComponentHost(); host.rebuild(new Panel()); host.layout({ width: 200, height: 80 });
  const encoder = new FrameEncoder(); host.paint(encoder, { width: 200, height: 80 });
  encoder.endFrame(); const frame = encoder.finish();
  assert.equal(frame.readUInt16LE(16), 40);
  assert.ok(Math.abs(frame.readFloatLE(80) - 0.1) < 0.00001);
  assert.ok(Math.abs(frame.readFloatLE(88) - 0.2) < 0.00001);
  assert.equal(frame.readFloatLE(96), 16);
  assert.equal(frame.readFloatLE(112), 9);
});

test("diagonal patterns lower to one constant-size server command", () => {
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
  assert.equal(frame.readUInt32LE(12), 4); // Base, pattern, border, end.
  assert.equal(frame.readUInt16LE(80), 17);
});

test("dot grids lower to one constant-size server command", () => {
  class GridComponent extends Component {
    build(): Element {
      const ink = { red: 0.4, green: 0.9, blue: 0.6, alpha: 1 };
      return box({ preferredSize: { width: 52, height: 52 },
        backgroundDotGrid: { rows: 4, columns: 4, filledMask: 0xa142,
          activeIndex: 3, fillColor: ink, ringColor: ink } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new GridComponent());
  host.layout({ width: 52, height: 52 });
  const encoder = new FrameEncoder();
  host.paint(encoder, { width: 52, height: 52 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 2);
  assert.equal(frame.readUInt16LE(16), 20);
  assert.equal(frame.readUInt32LE(20), 96);
});

test("animated wave dots lower to one constant-size server command", () => {
  class WaveComponent extends Component {
    build(): Element {
      const low = { red: 0.2, green: 0.4, blue: 1, alpha: 1 };
      const high = { red: 0.2, green: 1, blue: 0.7, alpha: 1 };
      return box({ preferredSize: { width: 400, height: 70 },
        backgroundWaveDots: { count: 24, inset: 12, minimumRadius: 3.5,
          maximumRadius: 15, phase: 2, frequency: 0.56, borderWidth: 1,
          troughStartColor: low, troughEndColor: high,
          crestStartColor: high, crestEndColor: low, borderColor: high } });
    }
  }
  const host = new ComponentHost();
  host.rebuild(new WaveComponent());
  host.layout({ width: 400, height: 70 });
  const encoder = new FrameEncoder();
  host.paint(encoder, { width: 400, height: 70 });
  encoder.endFrame();
  const frame = encoder.finish();
  assert.equal(frame.readUInt32LE(12), 2);
  assert.equal(frame.readUInt16LE(16), 21);
  assert.equal(frame.readUInt32LE(20), 128);
});

test("indexed meshes lower to a persistent server resource reference", () => {
  class MeshComponent extends Component {
    build(): Element {
      return mesh({ resourceId: 31,
        positions: [{ x: 0.5, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
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
  assert.equal(frame.readUInt16LE(16), 22);
  assert.equal(frame.readUInt32LE(24), 31);
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
