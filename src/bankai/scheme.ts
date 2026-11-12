/**
 * The colour scheme: a pre-paint script and the hook that reads and switches it.
 *
 * The scheme lives on `<html>` as `data-theme` (what the palette's custom
 * properties key on) and as a `dark`/`light` class (what Chakra's `.dark`
 * condition keys on), and is remembered under a storage key the consumer names.
 */
import { useCallback, useEffect, useState } from "react";

export type ColorScheme = "dark" | "light";

/** A storage key the pre-paint script can carry: a build-time constant, never reader input. */
const STORAGE_KEY = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Applies the stored scheme before first paint. Inline it in `<head>`, so a
 * reader who chose light never sees a dark flash, and React never renders a
 * scheme-dependent attribute that could mismatch on hydration. The key is spliced
 * into a `<script>`, so it must be a plain identifier; anything else throws at
 * build time rather than ending the script early (CWE-116).
 */
export const schemeInitScript = (storageKey: string) => {
  if (!STORAGE_KEY.test(storageKey)) throw new Error(`schemeInitScript: storage key must match ${STORAGE_KEY}, got ${JSON.stringify(storageKey)}`);
  return (
    `(function(){var r=document.documentElement;try{var t=localStorage.getItem(${JSON.stringify(storageKey)});` +
    `if(t==="light"||t==="dark"){r.setAttribute("data-theme",t);r.className=t;}}catch(e){}})();`
  );
};

/**
 * The reader's scheme. The server and the first client render both use
 * `initial`, so hydration matches; the real value — already applied to `<html>`
 * by `schemeInitScript` before paint — is read after mount.
 */
export function useColorScheme(storageKey: string, initial: ColorScheme = "dark"): [ColorScheme, () => void] {
  const [scheme, setScheme] = useState<ColorScheme>(initial);
  useEffect(() => {
    setScheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  }, []);
  const toggle = useCallback(() => {
    const root = document.documentElement;
    const next: ColorScheme = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    root.classList.remove("dark", "light");
    root.classList.add(next);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // Storage can be unavailable (private mode, file:// on some browsers); the toggle still works for this visit.
    }
    setScheme(next);
  }, [storageKey]);
  return [scheme, toggle];
}
