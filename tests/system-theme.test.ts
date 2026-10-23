import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

import { derivePalette } from "../packages/lib/system-theme/palette";
import {
  parseColorsQml,
  parseQtColor,
  parseQtHex,
  toHex,
} from "../packages/lib/system-theme/parse";

describe("Qt colour parsing", () => {
  test("#RRGGBB has no alpha", () => {
    expect(parseQtHex("#0e1e36")).toStrictEqual({ r: 14, g: 30, b: 54, a: 1 });
  });

  test("#AARRGGBB puts alpha first and keeps RGB channels", () => {
    const color = parseQtHex("#e00e1e36")!;
    expect([color.r, color.g, color.b]).toStrictEqual([14, 30, 54]);
    expect(color.a).toBeCloseTo(224 / 255);
    expect(toHex(color)).toBe("#0e1e36");
  });

  test("hex is case-insensitive", () => {
    expect(parseQtHex("#E00E1E36")).toStrictEqual(parseQtHex("#e00e1e36"));
  });

  test("#RGB expands", () => {
    expect(parseQtHex("#fa0")).toStrictEqual({ r: 255, g: 170, b: 0, a: 1 });
  });

  test.each([
    "Qt.rgba(14 / 255, 30 / 255, 54 / 255, 0.88)",
    "Qt.rgba(14/255,30/255,54/255,0.88)",
    "Qt.rgba(0.0549019608, 0.1176470588, 0.2117647059, 0.88)",
  ])("Qt.rgba %s", (value) => {
    expect(parseQtColor(value)).toStrictEqual({ r: 14, g: 30, b: 54, a: 0.88 });
  });

  test("Qt.rgba without alpha is opaque", () => {
    expect(parseQtColor("Qt.rgba(1, 0, 0)")).toStrictEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 1,
    });
  });

  test("rejects garbage", () => {
    expect(parseQtHex("#12345")).toBeNull();
    expect(parseQtColor("Qt.rgba(a, b, c)")).toBeNull();
    expect(parseQtColor("red")).toBeNull();
  });

  test("parses a whole Colors.qml, mixed formats", () => {
    const colors = parseColorsQml(`pragma Singleton
Singleton {
    readonly property color background: "#e00e1e36"
    readonly property color backgroundAlt: "#0E1E36"
    readonly property color backgroundAlpha: Qt.rgba(14 / 255, 30 / 255, 54 / 255, 0.88)
    readonly property color foreground: "#f4b999" // peach
}`);
    expect(toHex(colors.background!)).toBe("#0e1e36");
    expect(colors.background!.a).toBeCloseTo(224 / 255);
    expect(toHex(colors.backgroundAlt!)).toBe("#0e1e36");
    expect(colors.backgroundAlpha!.a).toBe(0.88);
    expect(toHex(colors.foreground!)).toBe("#f4b999");
  });
});

const THEMES = join(homedir(), ".config", "themes");
const real = (name: string) => {
  try {
    return parseColorsQml(readFileSync(join(THEMES, name, "Colors.qml"), "utf8"));
  } catch {
    return null;
  }
};

describe("palette derivation", () => {
  test("dark theme: stays dark, keeps the gray ramp ordered, background is gray.1000", () => {
    const colors = parseColorsQml(`
      property color background: "#e00e1e36"
      property color backgroundGray: "#2a3a56"
      property color foreground: "#f4b999"
      property color primary: "#9279aa"`);
    const palette = derivePalette(colors);
    expect(palette.mode).toBe("dark");
    expect(palette.vars["--chakra-colors-gray-1000"]).toBe("#0e1e36");
    expect(palette.vars["--chakra-colors-gray-750"]).toBe("#2a3a56");
    const steps = [1000, 850, 800, 750, 700, 600, 500, 400, 300, 200, 100, 50];
    const lum = steps.map((s) => {
      const hex = palette.vars[`--chakra-colors-gray-${s}`]!;
      return parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16);
    });
    expect([...lum].sort((a, b) => a - b)).toStrictEqual(lum);
    expect(palette.vars["--quenti-shell-background"]).toMatch(/^rgba\(14, 30, 54, 0\.87/);
  });

  test("light theme: detected as light, gray.50 is the background", () => {
    const palette = derivePalette(
      parseColorsQml(`
      property color background: "#f3e4cb"
      property color backgroundGray: "#d6c2a1"
      property color foreground: "#4d2e1a"
      property color primary: "#a32f1a"`),
    );
    expect(palette.mode).toBe("light");
    expect(palette.vars["--chakra-colors-gray-50"]).toBe("#f3e4cb");
    expect(palette.vars["--chakra-colors-gray-200"]).toBe("#d6c2a1");
  });

  test("every shipped theme produces a complete, valid palette", () => {
    for (const name of ["akane", "akaito", "fuschia", "nord", "gruvbox"]) {
      const colors = real(name);
      if (!colors) continue;
      const palette = derivePalette(colors);
      expect(palette.mode).toBe(name == "akaito" ? "light" : "dark");
      for (const value of Object.values(palette.vars)) {
        expect(value).not.toMatch(/NaN|undefined/);
      }
    }
  });
});
