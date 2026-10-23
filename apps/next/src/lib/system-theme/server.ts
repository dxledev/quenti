import { createHash } from "crypto";
import { readFile, realpath } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

import { parseColorsQml, toHex } from "@quenti/lib/system-theme/parse";

export interface SystemThemeSnapshot {
  /** Changes whenever the active theme's colours or location change */
  id: string;
  /** Directory name the shell currently points at, e.g. `akane` or `island` */
  source: string;
  colors: Record<string, { hex: string; alpha: number }>;
}

const POLL_MS = 500;

const themesDir = () =>
  join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "themes");

// `.caelestia-use` is the selector theme-apply flips between `current` (static
// themes) and `.dynamic/<provider>` (caelestia / noctalia / island). `current`
// is the fallback when the selector isn't there.
const CANDIDATES = [".caelestia-use", "current"];

export const readSystemTheme = async (
  root = themesDir(),
): Promise<SystemThemeSnapshot | null> => {
  for (const candidate of CANDIDATES) {
    try {
      const directory = await realpath(join(root, candidate));
      const contents = await readFile(join(directory, "Colors.qml"), "utf8");
      const parsed = parseColorsQml(contents);
      if (!Object.keys(parsed).length) continue;

      return {
        id: createHash("sha1")
          .update(`${directory}\n${contents}`)
          .digest("hex"),
        source: directory.split("/").filter(Boolean).pop() ?? candidate,
        colors: Object.fromEntries(
          Object.entries(parsed).map(([name, color]) => [
            name,
            { hex: toHex(color), alpha: color.a },
          ]),
        ),
      };
    } catch {
      // Selector missing, or mid-swap: try the next candidate
    }
  }
  return null;
};

type Listener = (snapshot: SystemThemeSnapshot) => void;

interface Watcher {
  listeners: Set<Listener>;
  timer?: ReturnType<typeof setInterval>;
  last?: SystemThemeSnapshot;
  busy: boolean;
}

// Theme swaps are `mv -Tf` symlink flips and whole-directory replacements,
// which fs.watch handles poorly. Re-reading one tiny file is cheaper than
// getting that right, and only runs while a client is connected.
const globalForWatcher = globalThis as unknown as {
  systemThemeWatcher?: Watcher;
};
const watcher = (globalForWatcher.systemThemeWatcher ??= {
  listeners: new Set(),
  busy: false,
});

const tick = async () => {
  if (watcher.busy) return;
  watcher.busy = true;
  try {
    const snapshot = await readSystemTheme();
    // A failed read (mid-swap) keeps the last good theme
    if (snapshot && snapshot.id !== watcher.last?.id) {
      watcher.last = snapshot;
      watcher.listeners.forEach((listener) => listener(snapshot));
    }
  } finally {
    watcher.busy = false;
  }
};

export const subscribeToSystemTheme = (listener: Listener) => {
  watcher.listeners.add(listener);
  if (watcher.last) listener(watcher.last);
  if (!watcher.timer) {
    watcher.timer = setInterval(() => void tick(), POLL_MS);
    void tick();
  }

  return () => {
    watcher.listeners.delete(listener);
    if (!watcher.listeners.size && watcher.timer) {
      clearInterval(watcher.timer);
      watcher.timer = undefined;
      watcher.last = undefined;
    }
  };
};
