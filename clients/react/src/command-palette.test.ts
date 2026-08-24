import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { Key } from "@mgfx/demo-client/protocol";
import { CommandPalette, filterCommands, type CommandItem } from "./navigation.js";
import { ReactSurface } from "./renderer.js";

const commands: readonly CommandItem[] = [
  { id: "graphics", label: "OPEN GRAPHICS LAB", detail: "Vector rendering",
    keywords: ["metal", "route"] },
  { id: "components", label: "OPEN COMPONENT LAB", detail: "Native controls",
    keywords: ["ui", "route"] },
];

test("command palette searches labels, details, and keywords with every token", () => {
  assert.deepEqual(filterCommands(commands, "graphics vector").map((item) => item.id),
    ["graphics"]);
  assert.deepEqual(filterCommands(commands, "native ui").map((item) => item.id),
    ["components"]);
  assert.deepEqual(filterCommands(commands, "route").map((item) => item.id),
    ["graphics", "components"]);
});

test("command palette ignores surrounding whitespace and returns no false match", () => {
  assert.equal(filterCommands(commands, "   ").length, 2);
  assert.equal(filterCommands(commands, "missing").length, 0);
});

test("command palette retains text focus while filtered rows reconcile", async () => {
  let frame: Buffer<ArrayBufferLike> = Buffer.alloc(0);
  const surface = new ReactSurface((next) => { frame = next; });
  surface.render(createElement(CommandPalette, { open: true, commands,
    onSelect: () => {}, onDismiss: () => {} }));
  surface.resize({ width: 800, height: 600 });
  surface.pointerDown({ x: 100, y: 145 });
  surface.pointerUp({ x: 100, y: 145 });
  surface.textInput("graphics");
  assert.equal(frame.includes(Buffer.from("graphics")), true);
  for (let index = 0; index < 8; index += 1) {
    surface.keyDown({ key: Key.Backspace, modifiers: 0, repeat: false });
    surface.keyUp({ key: Key.Backspace, modifiers: 0, repeat: false });
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.equal(frame.includes(Buffer.from("Type a command")), true);
});
