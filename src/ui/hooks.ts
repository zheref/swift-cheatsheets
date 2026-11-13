import { useCallback, useEffect, useState } from "react";
import { useColorScheme } from "../bankai";
import { type Arrival, readArrival, sheetOfHash } from "../content/languages";
import { DEFAULT_THEME, THEME_STORAGE_KEY, type ThemeMode } from "./theme";

/** The reader's theme, remembered under this reference's storage key (src/bankai/scheme.ts). */
export const useThemeMode = (): [ThemeMode, () => void] => useColorScheme(THEME_STORAGE_KEY, DEFAULT_THEME);

/**
 * How far down the viewport the sticky top bar reaches, as drawn — one row wide, two rows on the
 * narrow layout, taller again with enlarged text — so "under the bar" is never a guessed number.
 */
export const topbarBottom = () => document.getElementById("topbar")?.getBoundingClientRect().bottom ?? 0;

/** A sheet counts as reached once its top is within this distance below the bar. */
const REACHED = 20;

/** The sheet currently at the top of the viewport, for the sidebar's active link. */
export function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const en of entries) if (en.isIntersecting) setActive(en.target.id);
      },
      { rootMargin: `-${Math.round(topbarBottom())}px 0px -70% 0px`, threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

/**
 * The sheet the reader is on, read from the page when it is needed (the selector
 * opening), not tracked on every scroll. The sheet the address names wins while it
 * is on screen — a reader who picked a short or final sheet that cannot scroll to
 * the top is still on it; otherwise the last visible sheet whose top has passed
 * the top bar as drawn. An unscrolled page with no address has no topic yet, so switching
 * from it lands on the other language's top.
 */
export function readingTopic(ids: string[]): string | null {
  const hashed = sheetOfHash(window.location.hash);
  const named = ids.includes(hashed) ? document.getElementById(hashed) : null;
  if (named && !named.hidden) {
    const r = named.getBoundingClientRect();
    if (r.bottom >= 0 && r.top <= window.innerHeight) return hashed;
  }
  if (window.scrollY <= 0) return null;
  const cutoff = topbarBottom() + REACHED;
  let current: string | null = null;
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && !el.hidden && el.getBoundingClientRect().top <= cutoff) current = id;
  }
  return current;
}

/**
 * The language switch this page was opened by (`?from=…&concept=…`), read after
 * mount so the server and first client render agree. Dismissing it drops the
 * query from the address without a reload, so a later reload does not repeat it.
 */
export function useArrival(): [Arrival | null, () => void] {
  const [arrival, setArrival] = useState<Arrival | null>(null);
  useEffect(() => {
    // The same switch read again keeps its object, so nothing downstream re-runs for a hash-only step.
    const read = () => {
      const next = readArrival(window.location.search);
      setArrival((prev) => (prev && next && prev.from === next.from && prev.concept === next.concept ? prev : next));
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const dismiss = useCallback(() => {
    const { pathname, hash } = window.location;
    window.history.replaceState(window.history.state, "", pathname + hash);
    setArrival(null);
  }, []);
  return [arrival, dismiss];
}
