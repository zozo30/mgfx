import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface VectorIcon { readonly name: string; readonly path: string }

export async function loadLucideIcons(names: readonly string[]): Promise<VectorIcon[]> {
  return Promise.all(names.map(async (name) => {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid icon name ${name}`);
    const location = fileURLToPath(new URL(`../node_modules/lucide-static/icons/${name}.svg`,
      import.meta.url));
    const source = await readFile(location, "utf8");
    const paths = [...source.matchAll(/<(path|line|polyline|polygon|rect|circle|ellipse)\b([^>]*)\/?\s*>/g)]
      .map((match) => primitivePath(match[1]!, attributes(match[2]!))).filter(Boolean);
    if (paths.length === 0) throw new Error(`Lucide icon ${name} contains no paths`);
    return { name, path: paths.join(" ") };
  }));
}

function attributes(source: string): Readonly<Record<string, string>> {
  return Object.fromEntries([...source.matchAll(/([\w:-]+)="([^"]*)"/g)]
    .map((match) => [match[1]!, match[2]!]));
}

function primitivePath(tag: string, attr: Readonly<Record<string, string>>): string {
  const number = (name: string, fallback = 0) => Number(attr[name] ?? fallback);
  switch (tag) {
  case "path": return attr.d ?? "";
  case "line": return `M${number("x1")} ${number("y1")}L${number("x2")} ${number("y2")}`;
  case "polyline": case "polygon": {
    const points = (attr.points?.match(/-?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    if (points.length < 4 || points.length % 2 !== 0) return "";
    let path = `M${points[0]} ${points[1]}`;
    for (let index = 2; index < points.length; index += 2) path += `L${points[index]} ${points[index + 1]}`;
    return tag === "polygon" ? `${path}Z` : path;
  }
  case "circle": {
    const cx = number("cx"), cy = number("cy"), radius = number("r");
    return radius > 0 ? `M${cx - radius} ${cy}A${radius} ${radius} 0 1 0 ${cx + radius} ${cy}` +
      `A${radius} ${radius} 0 1 0 ${cx - radius} ${cy}` : "";
  }
  case "ellipse": {
    const cx = number("cx"), cy = number("cy"), rx = number("rx"), ry = number("ry");
    return rx > 0 && ry > 0 ? `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}` +
      `A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}` : "";
  }
  case "rect": {
    const x = number("x"), y = number("y"), width = number("width"), height = number("height");
    const rx = Math.min(Math.max(number("rx", number("ry")), 0), width / 2);
    const ry = Math.min(Math.max(number("ry", rx), 0), height / 2);
    if (width <= 0 || height <= 0) return "";
    if (rx === 0 || ry === 0) return `M${x} ${y}H${x + width}V${y + height}H${x}Z`;
    return `M${x + rx} ${y}H${x + width - rx}A${rx} ${ry} 0 0 1 ${x + width} ${y + ry}` +
      `V${y + height - ry}A${rx} ${ry} 0 0 1 ${x + width - rx} ${y + height}` +
      `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + height - ry}` +
      `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
  }
  default: return "";
  }
}
