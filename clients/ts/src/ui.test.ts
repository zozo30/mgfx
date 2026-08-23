import assert from "node:assert/strict";
import test from "node:test";
import { FrameEncoder, Key } from "./protocol.js";
import { box, circle, Component, ComponentHost, constrain, focusable, row, scrollView, type Element } from "./ui.js";

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
