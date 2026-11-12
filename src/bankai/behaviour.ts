/**
 * The primitives' behaviour, as framework-neutral React hooks: no styling
 * engine, no DOM structure, no router. The Chakra components beside this file
 * compose them; a consumer on another styling engine (Tailwind, CSS modules)
 * composes the same hooks around its own markup and gets the same keyboard,
 * focus and feedback semantics.
 */
import { type KeyboardEvent as ReactKeyboardEvent, type RefObject, useCallback, useEffect, useRef, useState } from "react";

/** The latest value of a callback, so a document listener need not re-subscribe when a consumer passes an inline one. */
function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}

export type CopyState = "idle" | "copied" | "failed";

/**
 * Copy feedback. `available` is false on the server and until mount, and stays
 * false where the clipboard API is missing, so a consumer never renders a dead
 * button. `copied` returns to idle `resetAfterMs` after each success; `failed`
 * holds until the next press, since it carries an instruction a reader may still
 * be finding. `count` grows with every result, so a repeated one can be announced
 * again. Nothing is set after unmount, even if the clipboard answers late.
 */
export function useCopy(
  text: string,
  resetAfterMs = 2000,
): { available: boolean; state: CopyState; count: number; copy: () => Promise<void> } {
  const [available, setAvailable] = useState(false);
  const [result, setResult] = useState<{ state: CopyState; count: number }>({ state: "idle", count: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    setAvailable(typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function");
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  const copy = useCallback(async () => {
    clearTimeout(timer.current);
    let next: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      next = "failed";
    }
    if (!mounted.current) return;
    setResult((r) => ({ state: next, count: r.count + 1 }));
    if (next === "copied") timer.current = setTimeout(() => setResult((r) => ({ ...r, state: "idle" })), resetAfterMs);
  }, [text, resetAfterMs]);
  return { available, state: result.state, count: result.count, copy };
}

/**
 * A dismissable disclosure: a pointer press or focus outside `root` closes it,
 * and Escape inside it closes it, returns focus to `toggle` and goes no further
 * (so a page-level Escape does not also fire).
 */
export function useDisclosure<R extends HTMLElement, T extends HTMLElement>(): {
  open: boolean;
  setOpen: (open: boolean) => void;
  root: RefObject<R | null>;
  toggle: RefObject<T | null>;
  onKeyDown: (ev: ReactKeyboardEvent) => void;
} {
  const [open, setOpen] = useState(false);
  const root = useRef<R>(null);
  const toggle = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (ev: Event) => {
      if (!root.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);
  const onKeyDown = (ev: ReactKeyboardEvent) => {
    if (ev.key !== "Escape" || !open) return;
    ev.stopPropagation();
    setOpen(false);
    toggle.current?.focus();
  };
  return { open, setOpen, root, toggle, onKeyDown };
}

/**
 * A navigation drawer that exists below a breakpoint: opening moves focus to the
 * panel's first link, closing returns it to the trigger, Escape closes it, and
 * the window widening past `wideQuery` closes it.
 */
export function useDrawer<P extends HTMLElement, T extends HTMLElement>(
  open: boolean,
  onOpenChange: (open: boolean) => void,
  wideQuery: string,
): { panel: RefObject<P | null>; trigger: RefObject<T | null> } {
  const panel = useRef<P>(null);
  const trigger = useRef<T>(null);
  const wasOpen = useRef(false);
  const change = useLatest(onOpenChange);
  useEffect(() => {
    if (open) panel.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    else if (wasOpen.current) trigger.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const wide = window.matchMedia(wideQuery);
    const onChange = () => wide.matches && change.current(false);
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, [change, wideQuery]);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") change.current(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [change]);
  return { panel, trigger };
}

/**
 * A page-wide search field's keys: `shortcut` focuses and selects it from
 * anywhere but another text field, and Escape clears it and lets go of focus.
 * `false` turns the shortcut off (WCAG 2.1.4: a product offering a
 * single-character shortcut should let the reader turn it off).
 */
export function useSearchKeys<T extends HTMLInputElement>(shortcut: string | false, onClear: () => void): RefObject<T | null> {
  const input = useRef<T>(null);
  const clear = useLatest(onClear);
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const q = input.current;
      if (!q) return;
      if (shortcut !== false && ev.key === shortcut && document.activeElement !== q) {
        const t = ev.target as HTMLElement | null;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        ev.preventDefault();
        q.focus();
        q.select();
      }
      if (ev.key === "Escape") {
        clear.current();
        q.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shortcut, clear]);
  return input;
}
