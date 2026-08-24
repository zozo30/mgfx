import assert from "node:assert/strict";
import test from "node:test";
import { flattenTree, type TreeItem } from "./components.js";

const tree: readonly TreeItem[] = [{ id: "root", label: "ROOT", children: [
  { id: "branch", label: "BRANCH", children: [{ id: "leaf", label: "LEAF" }] },
] }];

test("tree flattening includes only expanded descendants with parent depth", () => {
  assert.deepEqual(flattenTree(tree, new Set()).map((entry) => entry.item.id), ["root"]);
  const visible = flattenTree(tree, new Set(["root", "branch"]));
  assert.deepEqual(visible.map((entry) => [entry.item.id, entry.depth, entry.parentId]), [
    ["root", 0, undefined], ["branch", 1, "root"], ["leaf", 2, "branch"],
  ]);
});
