import { SVGPathData } from "svg-pathdata";
import type { PathSegment } from "@mgfx/demo-client/protocol";
import type { Rect } from "@mgfx/demo-client/ui";

export interface CanonicalPath {
  readonly resourceId: number;
  readonly segments: readonly PathSegment[];
  readonly bounds: Rect;
}

const paths = new Map<string, CanonicalPath>();
let nextPathId = 1;

export function canonicalPath(data: string): CanonicalPath {
  const existing = paths.get(data);
  if (existing) return existing;
  const commands = new SVGPathData(data).toAbs().normalizeHVZ(false, true, true)
    .normalizeST().qtToC().aToC().commands;
  const segments: PathSegment[] = [];
  const coordinates: number[] = [];
  for (const command of commands) {
    if (command.type === SVGPathData.MOVE_TO || command.type === SVGPathData.LINE_TO) {
      segments.push({ verb: command.type === SVGPathData.MOVE_TO ? "move" : "line",
        x: command.x, y: command.y });
      coordinates.push(command.x, command.y);
    } else if (command.type === SVGPathData.CURVE_TO) {
      segments.push({ verb: "cubic", x1: command.x1, y1: command.y1,
        x2: command.x2, y2: command.y2, x: command.x, y: command.y });
      coordinates.push(command.x1, command.y1, command.x2, command.y2, command.x, command.y);
    } else if (command.type === SVGPathData.CLOSE_PATH) {
      segments.push({ verb: "close" });
    }
  }
  if (segments.length === 0 || segments[0]?.verb !== "move") {
    throw new Error("Path contains no drawable contour");
  }
  const xs = coordinates.filter((_, index) => index % 2 === 0);
  const ys = coordinates.filter((_, index) => index % 2 === 1);
  const x = Math.min(...xs), y = Math.min(...ys);
  const bounds = { x, y, width: Math.max(0.0001, Math.max(...xs) - x),
    height: Math.max(0.0001, Math.max(...ys) - y) };
  const result = { resourceId: nextPathId++, segments, bounds };
  paths.set(data, result);
  return result;
}
