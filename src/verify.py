"""Sanity checks on the generated index.html.

Run from anywhere:  python3 src/verify.py

Covers:
  * well-formedness (every tag opened is closed, in order)
  * no raw markup leaked into a code block (escaping is intact)
  * every sidebar link points at a real section id
  * no unreplaced template placeholders or Python repr artefacts
"""

import os
import re
import sys
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TARGET = os.path.join(ROOT, "index.html")

VOID = {"meta", "br", "hr", "img", "input", "link", "source"}


class Checker(HTMLParser):
    """Minimal structural validator: matches open/close tags and collects ids."""

    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.stack = []
        self.errors = []
        self.ids = set()
        self.hrefs = []
        self.counts = {}

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "section" and "id" in a:
            self.ids.add(a["id"])
        if tag == "a" and a.get("href", "").startswith("#"):
            self.hrefs.append(a["href"][1:])
        for token in a.get("class", "").split():
            self.counts[token] = self.counts.get(token, 0) + 1
        if tag not in VOID:
            self.stack.append(tag)

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append("closing </%s> with an empty stack" % tag)
        elif self.stack[-1] != tag:
            self.errors.append("expected </%s>, got </%s>" % (self.stack[-1], tag))
            if tag in self.stack:
                while self.stack and self.stack.pop() != tag:
                    pass
        else:
            self.stack.pop()


def main():
    if not os.path.exists(TARGET):
        sys.exit("index.html not found - run `python3 src/build.py` first.")
    src = open(TARGET, encoding="utf-8").read()
    failures = []

    checker = Checker()
    checker.feed(src)
    if checker.stack:
        failures.append("unclosed tags: %s" % checker.stack)
    failures += checker.errors

    missing = [h for h in checker.hrefs if h not in checker.ids]
    if missing:
        failures.append("nav links with no matching section: %s" % missing)

    # Sheets sharing a group must be adjacent, or the sidebar repeats a heading.
    groups = re.findall(r'<section class="sheet" id="[^"]+" data-group="([^"]+)"', src)
    seen, previous = set(), None
    for g in groups:
        if g != previous and g in seen:
            failures.append("group %r is split across non-adjacent sheets" % g)
        seen.add(g)
        previous = g

    blocks = re.findall(r"<pre[^>]*><code>(.*?)</code></pre>", src, re.S)
    if not blocks:
        failures.append("no code blocks found")
    for b in blocks:
        if re.search(r"<[A-Za-z/]", b):
            failures.append("raw markup leaked into a code block: %r" % b[:80])

    for token in ("{{TITLE}}", "{{NAV}}", "{{BODY}}", "{{COUNT}}"):
        if token in src:
            failures.append("unreplaced placeholder %s" % token)

    for artefact in ("\\n\\n", "{'kind'", "None</", "[{'"):
        if artefact in src:
            failures.append("suspicious artefact in output: %s" % artefact)

    # A tone name landing in the `size` slot of svgkit.text() renders invisibly.
    bogus = re.findall(r'font-size="([A-Za-z][^"]*)"', src)
    if bogus:
        failures.append("non-numeric font-size in a diagram: %s" % sorted(set(bogus)))

    svgs = re.findall(r'<svg class="dg"', src)
    print("sections: %d   nav links: %d   code blocks: %d   diagrams: %d"
          % (len(checker.ids), len(checker.hrefs), len(blocks), len(svgs)))
    print("cards: %d   comparisons: %d   tables: %d   rule lists: %d"
          % (checker.counts.get("card", 0), checker.counts.get("cols", 0),
             checker.counts.get("tablewrap", 0), checker.counts.get("rules", 0)))
    print("size: %d KB" % (len(src) // 1024))

    if failures:
        print("\nFAILURES:")
        for f in failures[:40]:
            print("  -", f)
        sys.exit(1)
    print("\nAll checks passed.")


if __name__ == "__main__":
    main()
