import { type ParsedColor, type ShellColors, toHex } from "./parse";

type Rgb = [number, number, number];
type Lab = [number, number, number];

const GRAY = {
  50: "#F7FAFC",
  100: "#EDF2F7",
  200: "#E2E8F0",
  300: "#CBD5E0",
  400: "#A0AEC0",
  500: "#718096",
  600: "#4A5568",
  700: "#2D3748",
  750: "#242C3A",
  800: "#1A202C",
  850: "#191D28",
  900: "#171923",
  1000: "#171923",
};

const BLUE = {
  50: "#e0edff",
  100: "#b0caff",
  200: "#7ea6ff",
  300: "#4b83ff",
  400: "#1a5fff",
  500: "#0042da",
  600: "#0036b4",
  700: "#002782",
  800: "#001751",
};

const WHITE_ALPHA = {
  50: 0.04,
  100: 0.06,
  200: 0.08,
  300: 0.16,
  400: 0.24,
  500: 0.36,
  600: 0.48,
  700: 0.64,
  800: 0.8,
  900: 0.92,
};

const fromHex = (hex: string): Rgb => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

const toLinear = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (x: number) =>
  (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) * 255;

const toLab = ([r, g, b]: Rgb): Lab => {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)] as Rgb;
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

/** Linear sRGB, unclamped. */
const fromLabLinear = ([L, a, b]: Lab): Rgb => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
};

const inGamut = (rgb: Rgb) => rgb.every((c) => c >= -0.0005 && c <= 1.0005);

const fromLab = (lab: Lab): Rgb => {
  const rgb = fromLabLinear(lab);
  return rgb.map((c) =>
    Math.round(Math.min(255, Math.max(0, fromLinear(c)))),
  ) as Rgb;
};

/** Keeps lightness and hue, lowering chroma until the colour fits in sRGB. */
const fromLch = (L: number, C: number, H: number): Rgb => {
  let chroma = C;
  for (let i = 0; i < 24; i++) {
    const lab: Lab = [L, chroma * Math.cos(H), chroma * Math.sin(H)];
    if (inGamut(fromLabLinear(lab)) || chroma < 0.001) return fromLab(lab);
    chroma *= 0.92;
  }
  return fromLab([L, 0, 0]);
};

const mix = (from: Rgb, to: Rgb, t: number): Rgb => {
  const a = toLab(from);
  const b = toLab(to);
  return fromLab([0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * t) as Lab);
};

const lightness = (rgb: Rgb) => toLab(rgb)[0];

// Same threshold the shell's own scripts use to pick light/dark
const isLight = ([r, g, b]: Rgb) => r * 299 + g * 587 + b * 114 > 127500;

const rgbOf = (color: ParsedColor | undefined, fallback: string): Rgb =>
  color ? [color.r, color.g, color.b] : fromHex(fallback);

const css = (rgb: Rgb) => toHex({ r: rgb[0], g: rgb[1], b: rgb[2] });

const GRAY_LAB = Object.fromEntries(
  Object.entries(GRAY).map(([step, hex]) => [step, lightness(fromHex(hex))]),
);
const L_DARKEST = GRAY_LAB["1000"]!;
const L_LIGHTEST = GRAY_LAB["50"]!;
// Where each gray step sits between the app's darkest (0) and lightest (1) gray
const position = (step: keyof typeof GRAY) =>
  (GRAY_LAB[step]! - L_DARKEST) / (L_LIGHTEST - L_DARKEST);

export interface SystemPalette {
  mode: "light" | "dark";
  /** CSS custom properties to set on the root element */
  vars: Record<string, string>;
  /** A few resolved colours for previews */
  preview: { bg: string; card: string; mutedCard: string; accent: string };
}

/**
 * Re-tints the app's existing gray + blue scales from a shell theme, keeping
 * each step's role (gray.750 is still a card, blue.400 is still the accent).
 *
 * Alpha from the shell's colours is dropped for the solid page surfaces (a web
 * page can't be see-through) without touching the RGB channels; it's still
 * exposed through `--quenti-shell-background`.
 */
export const derivePalette = (colors: ShellColors): SystemPalette => {
  const background = rgbOf(
    colors.background ?? colors.backgroundAlt,
    "#171923",
  );
  const light = isLight(background);
  const foreground = rgbOf(colors.foreground, light ? "#1a202c" : "#f7fafc");
  const primary = rgbOf(colors.primary, "#4b83ff");
  const surfaceSource = colors.backgroundGray ?? colors.backgroundAlt;

  let lightEnd: Rgb;
  let darkEnd: Rgb;
  let surface: Rgb;
  let surfaceStep: keyof typeof GRAY;

  if (light) {
    lightEnd = background;
    darkEnd =
      lightness(foreground) > 0.4
        ? mix(foreground, [0, 0, 0], 0.55)
        : foreground;
    surface = surfaceSource
      ? rgbOf(surfaceSource, "#e2e8f0")
      : mix(lightEnd, darkEnd, 0.12);
    if (lightness(surface) >= lightness(lightEnd))
      surface = mix(lightEnd, darkEnd, 0.12);
    surfaceStep = 200;
  } else {
    darkEnd = background;
    lightEnd = mix([255, 255, 255], foreground, 0.16);
    surface = surfaceSource
      ? rgbOf(surfaceSource, "#242c3a")
      : mix(darkEnd, lightEnd, 0.1);
    if (lightness(surface) <= lightness(darkEnd))
      surface = mix(darkEnd, lightEnd, 0.1);
    surfaceStep = 750;
  }

  const tSurface = position(surfaceStep);
  const gray = (step: keyof typeof GRAY): Rgb => {
    const t = position(step);
    // The dark half of the ramp runs darkEnd -> surface (dark) or darkEnd -> ... -> surface (light)
    if (light) {
      return t >= tSurface
        ? mix(surface, lightEnd, (t - tSurface) / (1 - tSurface))
        : mix(darkEnd, surface, t / tSurface);
    }
    return t <= tSurface
      ? mix(darkEnd, surface, t / tSurface)
      : mix(surface, lightEnd, (t - tSurface) / (1 - tSurface));
  };

  const vars: Record<string, string> = {};
  for (const step of Object.keys(GRAY)) {
    vars[`--chakra-colors-gray-${step}`] = css(
      gray(step as unknown as keyof typeof GRAY),
    );
  }

  // Blue: keep the app's lightness/chroma shape, swap in the shell's hue
  const [, pa, pb] = toLab(primary);
  const hue = Math.atan2(pb, pa);
  const primaryChroma = Math.min(0.16, Math.max(0.07, Math.hypot(pa, pb)));
  const defaultChroma = Math.hypot(
    ...(toLab(fromHex(BLUE[400])).slice(1) as [number, number]),
  );
  for (const [step, hex] of Object.entries(BLUE)) {
    const [L, a, b] = toLab(fromHex(hex));
    const C = (Math.hypot(a, b) / defaultChroma) * primaryChroma;
    vars[`--chakra-colors-blue-${step}`] = css(fromLch(L, C, hue));
  }

  // Dark mode text is whiteAlpha.* in Chakra; tint it instead of pure white
  if (!light) {
    for (const [step, alpha] of Object.entries(WHITE_ALPHA)) {
      vars[`--chakra-colors-whiteAlpha-${step}`] = `rgba(${lightEnd.join(
        ", ",
      )}, ${alpha})`;
    }
  }

  const backgroundAlpha = colors.background?.a ?? 1;
  vars["--quenti-shell-background"] = `rgba(${background.join(
    ", ",
  )}, ${backgroundAlpha})`;
  vars["--quenti-shell-foreground"] = css(foreground);

  return {
    mode: light ? "light" : "dark",
    vars,
    preview: {
      bg: vars["--chakra-colors-gray-" + (light ? "50" : "1000")]!,
      card: light ? "#ffffff" : vars["--chakra-colors-gray-700"]!,
      mutedCard: vars["--chakra-colors-gray-" + (light ? "100" : "750")]!,
      accent: vars["--chakra-colors-blue-400"]!,
    },
  };
};
