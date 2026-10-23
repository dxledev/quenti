import React from "react";

import {
  type SystemPalette,
  derivePalette,
} from "@quenti/lib/system-theme/palette";
import type { ShellColors } from "@quenti/lib/system-theme/parse";

import { localStorageManager, useColorMode } from "@chakra-ui/react";

import type { SystemThemeSnapshot } from "./server";

// Not "system": Chakra uses that for the OS prefers-color-scheme
export const SOURCE_KEY = "quenti-theme-source";
export const CACHE_KEY = "quenti-system-theme";

interface State {
  active: boolean;
  palette?: SystemPalette;
}

let state: State = { active: false };
const listeners = new Set<() => void>();
const setState = (next: State) => {
  state = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

const storage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key: string, value: string | null) => {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // storage unavailable
    }
  },
};

// Everything we may set, so vars from the pre-paint script are cleaned up too
const MANAGED =
  /^--(chakra-colors-(gray|blue|whiteAlpha)-\d+|quenti-shell-.+)$/;
const clearVars = () => {
  document.documentElement.removeAttribute("data-system-theme");
  const style = document.documentElement.style;
  Array.from(style)
    .filter((name) => MANAGED.test(name))
    .forEach((name) => style.removeProperty(name));
};
const applyVars = (vars: Record<string, string>) => {
  clearVars();
  document.documentElement.setAttribute("data-system-theme", "");
  Object.entries(vars).forEach(([name, value]) => {
    document.documentElement.style.setProperty(name, value);
  });
};

export const enableSystemTheme = () => {
  storage.set(SOURCE_KEY, "system");
  setState({ ...state, active: true });
};

export const disableSystemTheme = () => {
  storage.set(SOURCE_KEY, null);
  storage.set(CACHE_KEY, null);
  clearVars();
  setState({ active: false });
};

// Lets us tell our own colour-mode writes apart from the user's
let applying = false;

/**
 * Any manual light/dark choice (settings, footer, menus, command palette)
 * leaves System mode, so the shell's grays never sit under the wrong mode.
 */
export const colorModeManager = {
  ...localStorageManager,
  set: (value: "light" | "dark") => {
    if (!applying && state.active) disableSystemTheme();
    localStorageManager.set(value);
  },
};

export const useSystemThemeActive = () =>
  React.useSyncExternalStore(
    subscribe,
    () => state.active,
    () => false,
  );

export const useSystemPalette = () =>
  React.useSyncExternalStore(
    subscribe,
    () => state.palette,
    () => undefined,
  );

/** Whether a shell theme can be read at all (false when deployed) */
export const useSystemThemeAvailable = () => {
  const [available, setAvailable] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/system-theme")
      .then((res) => !cancelled && setAvailable(res.ok))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
};

const toColors = (snapshot: SystemThemeSnapshot): ShellColors =>
  Object.fromEntries(
    Object.entries(snapshot.colors).map(([name, { hex, alpha }]) => [
      name,
      {
        r: parseInt(hex.slice(1, 3), 16),
        g: parseInt(hex.slice(3, 5), 16),
        b: parseInt(hex.slice(5, 7), 16),
        a: alpha,
      },
    ]),
  );

let transitionTimer: ReturnType<typeof setTimeout> | undefined;
// Soft cross-fade on live changes so a wallpaper switch isn't jarring
const softTransition = () => {
  const root = document.documentElement;
  root.setAttribute("data-system-theme-transition", "");
  clearTimeout(transitionTimer);
  transitionTimer = setTimeout(
    () => root.removeAttribute("data-system-theme-transition"),
    500,
  );
};

/** Keeps the app in sync with the shell while System is selected. Renders nothing. */
export const SystemThemeSync = () => {
  const active = useSystemThemeActive();
  const { setColorMode } = useColorMode();
  const setColorModeRef = React.useRef(setColorMode);
  setColorModeRef.current = setColorMode;

  // Restore the preference after hydration (avoids an SSR mismatch). Deferred
  // a tick: Chakra's provider re-writes the stored mode in its own mount effect
  // (which runs after this one) and that must not read as a manual choice.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (storage.get(SOURCE_KEY) == "system") enableSystemTheme();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    if (!active) return;

    let first = true;
    const source = new EventSource("/api/system-theme/stream");

    source.onmessage = (event) => {
      const palette = derivePalette(
        toColors(JSON.parse(event.data as string) as SystemThemeSnapshot),
      );
      if (!first) softTransition();
      first = false;

      applyVars(palette.vars);
      storage.set(
        CACHE_KEY,
        JSON.stringify({ vars: palette.vars, mode: palette.mode }),
      );
      applying = true;
      try {
        setColorModeRef.current(palette.mode);
      } finally {
        applying = false;
      }
      setState({ active: true, palette });
    };

    // No theme source (e.g. deployed): fall back to a normal mode
    void fetch("/api/system-theme").then((res) => {
      if (res.status == 404) disableSystemTheme();
    });

    return () => source.close();
  }, [active]);

  return null;
};

/** Runs before first paint (see _document) so there's no flash of the old colours */
export const preloadScript = `try{if(localStorage.getItem(${JSON.stringify(
  SOURCE_KEY,
)})==="system"){var c=JSON.parse(localStorage.getItem(${JSON.stringify(
  CACHE_KEY,
)}));document.documentElement.setAttribute("data-system-theme","");for(var k in c.vars)document.documentElement.style.setProperty(k,c.vars[k])}}catch(e){}`;
