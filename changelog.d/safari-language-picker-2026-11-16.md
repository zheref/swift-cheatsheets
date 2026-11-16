### Fixed

- **The language selector works in Safari.** Clicking a language in the open list did nothing in Safari: Safari does not focus a link on a mouse press, so it focused the page-wide focus wrapper Gatsby puts around every page, and the selector read that as focus leaving it and closed the list before the click landed. The disclosure now closes only when focus moves to something outside it that does not contain it, so a press on a language follows its link in Safari as it does in Chrome, while Tab, Escape and a press outside still close the list.
