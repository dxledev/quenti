export interface ParsedColor {
  /** 0-255 */
  r: number;
  g: number;
  b: number;
  /** 0-1 */
  a: number;
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

const byte = (n: number) => Math.round(clamp(n, 0, 255));

/**
 * Parses a hex colour using Qt's rules: `#RGB`, `#RRGGBB` and `#AARRGGBB`.
 * Qt puts alpha FIRST, so `#e00e1e36` is rgb(14, 30, 54) at 224/255 opacity.
 */
export const parseQtHex = (value: string): ParsedColor | null => {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value.trim());
  if (!match) return null;

  let hex = match[1]!;
  if (hex.length == 3) hex = hex.replace(/./g, (c) => c + c);

  const hasAlpha = hex.length == 8;
  const offset = hasAlpha ? 2 : 0;

  return {
    r: parseInt(hex.slice(offset, offset + 2), 16),
    g: parseInt(hex.slice(offset + 2, offset + 4), 16),
    b: parseInt(hex.slice(offset + 4, offset + 6), 16),
    a: hasAlpha ? parseInt(hex.slice(0, 2), 16) / 255 : 1,
  };
};

// A number, or a division of two (`14 / 255`)
const NUMBER = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:\s*\/\s*[+-]?(?:\d+\.?\d*|\.\d+))?`;
const RGBA = new RegExp(
  String.raw`^Qt\.rgba?\(\s*(${NUMBER})\s*,\s*(${NUMBER})\s*,\s*(${NUMBER})\s*(?:,\s*(${NUMBER})\s*)?\)$`,
);

const evaluate = (expression: string) => {
  const [numerator, denominator] = expression.split("/").map(Number);
  if (numerator === undefined || Number.isNaN(numerator)) return NaN;
  if (denominator === undefined) return numerator;
  return denominator === 0 || Number.isNaN(denominator)
    ? NaN
    : numerator / denominator;
};

/** Parses `Qt.rgba(14 / 255, 30 / 255, 54 / 255, 0.88)` (channels are 0-1) */
export const parseQtRgba = (value: string): ParsedColor | null => {
  const match = RGBA.exec(value.trim());
  if (!match) return null;

  const [r, g, b] = [match[1], match[2], match[3]].map((x) =>
    evaluate(x!.replace(/\s+/g, "")),
  );
  const a = match[4] === undefined ? 1 : evaluate(match[4].replace(/\s+/g, ""));
  if ([r, g, b, a].some((x) => x === undefined || Number.isNaN(x))) return null;

  return {
    r: byte(r! * 255),
    g: byte(g! * 255),
    b: byte(b! * 255),
    a: clamp(a, 0, 1),
  };
};

export const parseQtColor = (value: string): ParsedColor | null => {
  const trimmed = value.trim().replace(/;$/, "").trim();
  const quoted = /^(["'])(.*)\1$/.exec(trimmed);
  return quoted ? parseQtHex(quoted[2]!) : parseQtRgba(trimmed);
};

export type ShellColors = Record<string, ParsedColor>;

/** Extracts every `property color <name>: <value>` from a Colors.qml */
export const parseColorsQml = (source: string): ShellColors => {
  const colors: ShellColors = {};
  for (const line of source.split("\n")) {
    const match =
      /^\s*(?:readonly\s+)?property\s+color\s+(\w+)\s*:\s*(.+?)\s*$/.exec(
        line.replace(/\/\/.*$/, ""),
      );
    if (!match) continue;
    const color = parseQtColor(match[2]!);
    if (color) colors[match[1]!] = color;
  }
  return colors;
};

export const toHex = ({ r, g, b }: Pick<ParsedColor, "r" | "g" | "b">) =>
  `#${[r, g, b].map((c) => byte(c).toString(16).padStart(2, "0")).join("")}`;
