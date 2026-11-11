import { useCallback, useEffect, useState } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, type ThemeMode } from "./theme";

/**
 * The reader's theme. The server and the first client render both use the
 * default, so hydration matches; the real value — already applied to `<html>`
 * by `themeInitScript` before paint — is read after mount.
 */
export function useThemeMode(): [ThemeMode, () => void] {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME);
  useEffect(() => {
    setMode(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  }, []);
  const toggle = useCallback(() => {
    const root = document.documentElement;
    const next: ThemeMode = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    root.classList.remove("dark", "light");
    root.classList.add(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be unavailable (private mode, file:// on some browsers); the toggle still works for this visit.
    }
    setMode(next);
  }, []);
  return [mode, toggle];
}

/** The sheet currently at the top of the viewport, for the sidebar's active link. */
export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const en of entries) if (en.isIntersecting) setActive(en.target.id);
      },
      { rootMargin: "-60px 0px -70% 0px", threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [ids]);
  return active;
}
