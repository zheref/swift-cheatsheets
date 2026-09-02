# Swift Interview Cheat Sheets

A single, self-contained HTML page holding 21 dense cheat sheets on SwiftUI, TCA, Swift
concurrency, Combine, SOLID, functional Swift, Clean Code, iOS architecture,
modularization, testing and Core Bluetooth — including eight hand-laid-out SVG
infographics.

Designed to be opened on a second screen (iPad, phone, laptop) and skimmed while you code:
sidebar navigation, instant full-text search, syntax-highlighted snippets, dark/light
themes, and a responsive layout that collapses to one column on small screens.

- **No build step required to read it** — `index.html` is committed and has zero external
  dependencies (no CDN, no fonts, no network).
- **A build step to change it** — the content lives as Python data in `src/`, and
  `src/build.py` regenerates the page.

---

## Quick start

```bash
cd ~/Code/WebStorm/Claude/swift-cheatsheets

# just read it locally
open index.html

# or serve it to every device on your Wi-Fi
./serve.command
```

`serve.command` prints both URLs it is listening on:

```
  This Mac : http://localhost:8000/
  iPad etc : http://192.168.1.42:8000/
```

Open the second URL on your iPad, phone or other laptop. **Type the `http://` prefix
explicitly** — modern browsers upgrade bare addresses to HTTPS, which a plain HTTP server
cannot answer.

---

## Serving over the local network

### Option A — plain HTTP (simplest)

```bash
./serve.command          # port 8000
./serve.command 8080     # custom port
```

Requirements:

- Both devices on the **same Wi-Fi network** (not a guest network, and no VPN active on
  either device — a VPN routes traffic away from the LAN).
- macOS may ask to allow **Python** to accept incoming connections the first time.
  Approve it, or the other device will simply time out.
- If macOS Firewall is on: *System Settings → Network → Firewall → Options* and allow
  incoming connections for Python.

### Option B — HTTPS (when the browser refuses HTTP)

Some browsers force every address to HTTPS and will not fall back. The symptom is
`ERR_SSL_PROTOCOL_ERROR` on the client and a wall of binary garbage plus
`code 400, message Bad request version` in the server log — that garbage is a TLS
handshake arriving at a plain HTTP server.

```bash
./serve-https.command        # port 8443
./serve-https.command 9443   # custom port
```

This generates a throwaway self-signed certificate in `.localcert/` (git-ignored) with the
correct `subjectAltName=IP:<your-ip>`, which Safari requires, and regenerates it
automatically if your Mac's IP changes.

The first visit shows a certificate warning — this is expected for a self-signed cert:

- **Safari** → *Show Details* → *visit this website* → *Visit Website*
- **Chrome / Edge** → *Advanced* → *Proceed to … (unsafe)*

After accepting once, the device remembers it.

### Option C — no server at all

`index.html` is fully self-contained, so you can just AirDrop it to the iPad and open it
from **Files**. Search, navigation, diagrams and the theme toggle all work offline. This is
the most reliable option when you are short on time.

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `ERR_SSL_PROTOCOL_ERROR` | browser forced HTTPS on a plain HTTP server | type `http://…` explicitly, or use `./serve-https.command` |
| Connection times out | firewall, different subnet, or an active VPN | approve the macOS firewall prompt; disable VPN; confirm both devices are on the same SSID |
| `Address already in use` | a previous server is still running | `lsof -ti :8000 \| xargs kill`, or pick another port |
| Page loads but looks unstyled | you opened a partial file | rebuild with `make build` |
| Browser keeps redirecting to HTTPS | cached HTTPS-upgrade for that host:port | use a different port, an incognito window, or turn off Chrome's *Always use secure connections* |

---

## Editing the content

Everything on the page is generated from plain Python data structures — there is no HTML
to hand-edit.

```bash
make build     # regenerate index.html
make verify    # structural checks on the output
make           # both
```

### Project layout

```
swift-cheatsheets/
├── index.html              generated — the whole deliverable, ~255 KB, no dependencies
├── serve.command           HTTP server for LAN access
├── serve-https.command     HTTPS server (self-signed) for TLS-forcing browsers
├── Makefile                build / verify / serve / clean
└── src/
    ├── build.py            assembles every sheet into index.html  (sheet ORDER lives here)
    ├── render.py           HTML shell, CSS, client-side JS, card renderers
    ├── svgkit.py           tiny SVG layout helpers (boxes, arrows, chips, bands)
    ├── diagrams.py         the eight infographics
    ├── verify.py           post-build sanity checks
    ├── data_swiftui.py     SwiftUI: state & data flow, views/layout, vs UIKit
    ├── data_tca.py         TCA: core loop, composition/dependencies/testing, navigation
    ├── data_conc.py        concurrency: core, actors/Sendable, Swift 6 do's & don'ts, GCD vs Combine vs async
    ├── data_combine.py     Combine core, and the timers/async pattern cookbook
    ├── data_extra.py       SwiftUI + Combine wiring, Clean Code
    ├── data_principles.py  SOLID, functional Swift, language essentials
    └── data_ios.py         architecture, modularization, testing, Core Bluetooth
```

### Adding a card

Cards are built with five constructors from `render.py`:

| Constructor | Renders |
| --- | --- |
| `code(title, note, snippet)` | one syntax-highlighted snippet |
| `cmp(title, note, [(label, tone, snippet), …])` | side-by-side comparison columns |
| `rules(title, note, [(tone, text), …])` | a colour-coded bullet list |
| `table(title, note, headers, rows)` | a comparison table |
| `diagram(title, note, svg)` | a full-width SVG infographic |

`tone` is one of `good` (green), `bad` (red), `modern` (blue), `legacy` (amber) or
`neutral`. Bullet and table text supports `` `inline code` `` and `**bold**`.

```python
# src/data_swiftui.py
code("Derived binding",
     "Wrap get/set when the view needs a different shape than the model.",
     r"""
let upper = Binding(
  get: { name.uppercased() },
  set: { name = $0.lowercased() }
)
"""),
```

Snippets are raw Python strings (`r"""…"""`) so Swift backslashes survive; they are
HTML-escaped at build time and highlighted in the browser, so any code is safe to paste
verbatim — including generics such as `AnyPublisher<Int, Never>`.

### Adding a sheet

1. Build it with `sheet(id, title, group, subtitle, cards)` in a `data_*.py` module.
2. Import the module in `src/build.py` and add the sheet to the `SHEETS` list — position in
   that list controls both the sidebar order and the scroll order.
3. `make` to rebuild and verify.

`group` is the sidebar heading a sheet is filed under; sheets sharing a group must be
adjacent in `SHEETS`.

### Adding a diagram

Compose one in `src/diagrams.py` with the `svgkit` helpers (`box`, `arrow`, `elbow`,
`band`, `chips`, `row`, `bracket`) and wrap it in `canvas(height, body)`. The canvas is
940 units wide; colours are CSS custom properties, so diagrams follow the light/dark theme
automatically.

To eyeball a diagram's layout without a browser, rasterize it — substitute the CSS
variables for hex values first, since `var(--x)` means nothing to a standalone renderer.

---

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` | focus the search box |
| `Esc` | clear the search and unfocus |
| `☀` button | toggle dark / light (remembered per browser) |
| `☰` button | show the sidebar on narrow screens |

---

## Requirements

- **Python 3.9+** — preinstalled on macOS. No packages, no virtualenv.
- **openssl** — preinstalled on macOS; only used by `serve-https.command`.
- Any modern browser. Rendering uses `color-mix()` and CSS nesting-free plain CSS —
  Safari 16.4+, Chrome 111+.
