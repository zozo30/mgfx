import assert from "node:assert/strict";
import test from "node:test";
import { createElement, useState } from "react";
import { Key, KeyModifier } from "@mgfx/demo-client/protocol";
import { TextField } from "./components.js";
import { ReactSurface } from "./renderer.js";

function textFieldSurface(onValue: (value: string) => void): ReactSurface {
  function Harness() {
    const [value, setValue] = useState("");
    onValue(value);
    return createElement(TextField, { value, onChange: setValue,
      style: { preferredSize: { width: 300, height: 54 } } });
  }
  const surface = new ReactSurface(() => {});
  surface.render(createElement(Harness));
  surface.resize({ width: 300, height: 54 });
  surface.pointerDown({ x: 18, y: 27 });
  surface.pointerUp({ x: 18, y: 27 });
  return surface;
}

test("sequential backspace presses advance the caret until the field is empty", async () => {
  let value = "";
  const surface = textFieldSurface((next) => { value = next; });
  surface.textInput("NATIVE");
  assert.equal(value, "NATIVE");
  for (let index = 0; index < 6; index += 1) {
    surface.keyDown({ key: Key.Backspace, modifiers: 0, repeat: index > 0 });
    surface.keyUp({ key: Key.Backspace, modifiers: 0, repeat: false });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(value, "NATIVE".slice(0, 5 - index));
  }
  assert.equal(value, "");
});

test("select all followed by backspace clears the complete text field value", () => {
  let value = "";
  const surface = textFieldSurface((next) => { value = next; });
  surface.textInput("COMMAND");
  surface.keyDown({ key: Key.SelectAll, modifiers: KeyModifier.Command, repeat: false });
  surface.keyDown({ key: Key.Backspace, modifiers: 0, repeat: false });
  assert.equal(value, "");
});
