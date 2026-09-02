"""Tiny SVG layout helpers for the infographic cards.

Everything is drawn with CSS custom properties (var(--modern), var(--bg2), ...)
so a single diagram renders correctly in both the dark and light themes.
"""

import html as _html

CANVAS = 940                     # every diagram uses the same viewBox width

TONES = {
    "neutral": "var(--faint)",
    "modern": "var(--modern)",
    "good": "var(--good)",
    "bad": "var(--bad)",
    "legacy": "var(--legacy)",
    "accent": "var(--accent)",
    "type": "var(--typ)",
    "attr": "var(--attr)",
    "str": "var(--str)",
}


def _e(s):
    return _html.escape(str(s), quote=False)


def color(tone):
    return TONES.get(tone, TONES["neutral"])


# --------------------------------------------------------------------------
# primitives
# --------------------------------------------------------------------------

def canvas(height, body, width=CANVAS):
    """Wrap `body` in an <svg> with the shared arrow-head marker defs."""
    heads = "".join(
        '<marker id="ah-%s" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" '
        'markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" fill="%s"/></marker>' % (t, c)
        for t, c in TONES.items()
    )
    return ('<svg class="dg" viewBox="0 0 %d %d" xmlns="http://www.w3.org/2000/svg" '
            'role="img"><defs>%s</defs>%s</svg>' % (width, height, heads, body))


def text(x, y, s, size=11, tone=None, anchor="start", cls="", weight=None):
    fill = ' fill="%s"' % color(tone) if tone else ""
    w = ' font-weight="%s"' % weight if weight else ""
    c = ' class="%s"' % cls if cls else ""
    return '<text x="%s" y="%s" font-size="%s" text-anchor="%s"%s%s%s>%s</text>' % (
        x, y, size, anchor, fill, w, c, _e(s))


def box(x, y, w, h, title, lines=(), tone="neutral", fill="var(--bg2)",
        title_size=12.5, line_size=10.5, dash=False, radius=9, mono_lines=True):
    """A labelled rounded rectangle with optional detail lines."""
    c = color(tone)
    d = ' stroke-dasharray="5 4"' if dash else ""
    out = ['<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s" stroke="%s" '
           'stroke-width="1.6"%s/>' % (x, y, w, h, radius, fill, c, d)]
    out.append(text(x + 11, y + 19, title, title_size, tone, weight="700"))
    for i, ln in enumerate(lines):
        out.append(text(x + 11, y + 36 + i * 13.5, ln, line_size,
                        cls="mono" if mono_lines else ""))
    return "".join(out)


def band(x, y, w, h, tone="neutral", radius=10, opacity=".07"):
    """A soft background block used to group things."""
    return ('<rect x="%s" y="%s" width="%s" height="%s" rx="%s" fill="%s" '
            'opacity="%s"/>' % (x, y, w, h, radius, color(tone), opacity))


def chip(x, y, label, tone="neutral", pad=8, h=18, char=6.1):
    """Small pill. Returns (svg, width)."""
    w = len(label) * char + pad * 2
    c = color(tone)
    s = ('<rect x="%s" y="%s" width="%.1f" height="%s" rx="%s" fill="%s" opacity=".16"/>'
         % (x, y, w, h, h / 2.0, c))
    s += text(x + w / 2.0, y + h - 5.5, label, 10, tone, anchor="middle", weight="700")
    return s, w


def chips(x, y, items, gap=6):
    """Row of chips: items is a list of (label, tone)."""
    out, cx = [], x
    for label, tone in items:
        s, w = chip(cx, y, label, tone)
        out.append(s)
        cx += w + gap
    return "".join(out), cx - x - gap


def arrow(x1, y1, x2, y2, tone="neutral", dash=False, label=None,
          label_side="above", width=1.6):
    """Straight arrow with a head at (x2, y2)."""
    c = color(tone)
    d = ' stroke-dasharray="5 4"' if dash else ""
    out = ['<line x1="%s" y1="%s" x2="%s" y2="%s" stroke="%s" stroke-width="%s"%s '
           'marker-end="url(#ah-%s)"/>' % (x1, y1, x2, y2, c, width, d, tone)]
    if label:
        mx, my = (x1 + x2) / 2.0, (y1 + y2) / 2.0
        dy = -6 if label_side == "above" else 13
        out.append(text(mx, my + dy, label, 9.5, tone, anchor="middle", weight="700"))
    return "".join(out)


def elbow(points, tone="neutral", dash=False, label=None, label_at=None):
    """Poly-line arrow through `points` (list of (x, y)), head at the last point."""
    c = color(tone)
    d = ' stroke-dasharray="5 4"' if dash else ""
    path = " ".join(("M%s,%s" if i == 0 else "L%s,%s") % p for i, p in enumerate(points))
    out = ['<path d="%s" fill="none" stroke="%s" stroke-width="1.6"%s '
           'marker-end="url(#ah-%s)" stroke-linejoin="round"/>' % (path, c, d, tone)]
    if label and label_at:
        out.append(text(label_at[0], label_at[1], label, 9.5, tone,
                        anchor="middle", weight="700"))
    return "".join(out)


def bracket(x, y1, y2, tone="neutral", label=None):
    """Vertical curly-ish bracket with a rotated label."""
    c = color(tone)
    out = ['<path d="M%s,%s q-6,0 -6,6 L%s,%s q0,6 6,6" fill="none" stroke="%s" '
           'stroke-width="1.3" opacity=".8"/>' % (x, y1, x - 6, y2 - 6, c)]
    if label:
        my = (y1 + y2) / 2.0
        out.append('<text x="%s" y="%s" font-size="10" font-weight="700" fill="%s" '
                   'text-anchor="middle" transform="rotate(-90 %s %s)">%s</text>'
                   % (x - 12, my, c, x - 12, my, _e(label)))
    return "".join(out)


def title(x, y, s, tone="accent", size=12):
    return text(x, y, s, size, tone, weight="800")


def row(n, width=CANVAS, gap=26, margin=3):
    """Evenly split `width` into n columns. Returns (x_positions, column_width)."""
    w = (width - 2 * margin - gap * (n - 1)) / float(n)
    return [margin + i * (w + gap) for i in range(n)], w
