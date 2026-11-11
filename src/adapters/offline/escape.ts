/** Escaping for the hand-assembled offline document (kept out of .tsx, where `</` reads as JSX). */

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON that is safe inside a <script> element: no `</script>`, no HTML comment openers, no line separators. */
export const scriptSafeJson = (value: unknown) =>
  JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** A script body that cannot close its own element. */
export const scriptSafeJs = (js: string) => js.replace(/<\/(script)/gi, "<\\/$1");
