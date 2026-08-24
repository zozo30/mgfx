import assert from "node:assert/strict";
import test from "node:test";
import { filterCommands, type CommandItem } from "./navigation.js";

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
