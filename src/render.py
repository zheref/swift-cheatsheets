"""HTML renderer for the Swift interview cheat sheets.

Content lives in the `data_*.py` modules as plain Python dicts; this module turns
them into a single self-contained HTML file (no network dependencies) with a
sidebar, live search and a client-side Swift syntax highlighter.
"""

import html


# --------------------------------------------------------------------------
# Card constructors. Each returns a plain dict consumed by `render_card`.
# --------------------------------------------------------------------------

def code(title, note, snippet, tone="neutral"):
    """A single code snippet card."""
    return {"kind": "code", "t": title, "n": note, "c": snippet.strip("\n"), "tone": tone}


def cmp(title, note, cols):
    """A side-by-side comparison card.

    `cols` is a list of (label, tone, snippet) tuples. Tone drives the accent
    colour: good / bad / modern / legacy / neutral.
    """
    return {"kind": "cmp", "t": title, "n": note,
            "cols": [{"l": l, "tone": tn, "c": c.strip("\n")} for (l, tn, c) in cols]}


def rules(title, note, items):
    """A bullet card. `items` is a list of (tone, text) tuples."""
    return {"kind": "rules", "t": title, "n": note,
            "items": [{"tone": tn, "x": x} for (tn, x) in items]}


def table(title, note, headers, rows):
    """A comparison table card (short cells only)."""
    return {"kind": "table", "t": title, "n": note, "h": headers, "r": rows}


def diagram(title, note, svg):
    """An infographic card. `svg` is trusted, pre-built markup from svgkit."""
    return {"kind": "svg", "t": title, "n": note, "svg": svg}


def sheet(sid, title, group, subtitle, cards):
    return {"id": sid, "title": title, "group": group, "sub": subtitle, "cards": cards}


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------

def e(s):
    """Escape text for HTML body context (quotes left intact for readability)."""
    return html.escape(s, quote=False)


def render_card(c):
    kind = c["kind"]
    note = f'<p class="note">{e(c["n"])}</p>' if c.get("n") else ""
    head = f'<h3>{e(c["t"])}</h3>{note}'

    if kind == "code":
        body = f'<pre class="tone-{c["tone"]}"><code>{e(c["c"])}</code></pre>'
        return f'<article class="card" data-kind="code">{head}{body}</article>'

    if kind == "svg":
        return (f'<article class="card wide diagram" data-kind="svg">{head}'
                f'<div class="dgwrap">{c["svg"]}</div></article>')

    if kind == "cmp":
        cols = "".join(
            f'<div class="col tone-{col["tone"]}">'
            f'<span class="collabel">{e(col["l"])}</span>'
            f'<pre><code>{e(col["c"])}</code></pre></div>'
            for col in c["cols"]
        )
        span = " wide" if len(c["cols"]) > 1 else ""
        return f'<article class="card{span}" data-kind="cmp">{head}<div class="cols">{cols}</div></article>'

    if kind == "rules":
        items = "".join(
            f'<li class="tone-{i["tone"]}"><span class="bullet"></span>{md(i["x"])}</li>'
            for i in c["items"]
        )
        return f'<article class="card" data-kind="rules">{head}<ul class="rules">{items}</ul></article>'

    if kind == "table":
        th = "".join(f"<th>{e(h)}</th>" for h in c["h"])
        tr = "".join(
            "<tr>" + "".join(f"<td>{md(cell)}</td>" for cell in row) + "</tr>"
            for row in c["r"]
        )
        return (f'<article class="card wide" data-kind="table">{head}'
                f'<div class="tablewrap"><table><thead><tr>{th}</tr></thead>'
                f'<tbody>{tr}</tbody></table></div></article>')

    raise ValueError(kind)


def md(s):
    """Minimal inline markdown: `code` spans and **bold**."""
    out, i, parts = "", 0, []
    s = e(s)
    # `code`
    chunks = s.split("`")
    for idx, ch in enumerate(chunks):
        parts.append(ch if idx % 2 == 0 else f"<code class='inline'>{ch}</code>")
    out = "".join(parts)
    # **bold**
    chunks = out.split("**")
    out = "".join(ch if idx % 2 == 0 else f"<b>{ch}</b>" for idx, ch in enumerate(chunks))
    return out


def render_sheet(s):
    cards = "".join(render_card(c) for c in s["cards"])
    return (f'<section class="sheet" id="{s["id"]}" data-group="{e(s["group"])}">'
            f'<header class="sheethead"><h2>{e(s["title"])}</h2>'
            f'<p>{e(s["sub"])}</p></header>'
            f'<div class="grid">{cards}</div></section>')


def render_nav(sheets):
    out, current = [], None
    for s in sheets:
        if s["group"] != current:
            current = s["group"]
            out.append(f'<div class="navgroup">{e(current)}</div>')
        out.append(f'<a href="#{s["id"]}" data-target="{s["id"]}">{e(s["title"])}</a>')
    return "".join(out)


def build(sheets, title="Swift Interview Cheat Sheets"):
    return HTML.replace("{{TITLE}}", e(title)) \
               .replace("{{NAV}}", render_nav(sheets)) \
               .replace("{{BODY}}", "".join(render_sheet(s) for s in sheets)) \
               .replace("{{COUNT}}", str(len(sheets)))


# --------------------------------------------------------------------------
# Shell
# --------------------------------------------------------------------------

HTML = r"""<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>{{TITLE}}</title>
<style>
:root{
  --bg:#0e1117; --bg2:#151a23; --card:#161b25; --line:#262d3a;
  --fg:#e6edf3; --dim:#93a1b5; --faint:#6b7a90;
  --kw:#ff79c6; --str:#7ee787; --typ:#7dd3fc; --num:#ffab70; --com:#6b7a90; --attr:#d2a8ff; --mem:#ffd580;
  --good:#3fb950; --bad:#f85149; --modern:#58a6ff; --legacy:#d29922;
  --accent:#58a6ff;
}
html[data-theme="light"]{
  --bg:#ffffff; --bg2:#f4f6fa; --card:#ffffff; --line:#dfe4ec;
  --fg:#161b22; --dim:#4c5a6e; --faint:#79879b;
  --kw:#b3319b; --str:#0a7d34; --typ:#0666b8; --num:#a04b00; --com:#79879b; --attr:#7a3ecb; --mem:#8a5a00;
  --good:#137a2b; --bad:#c1272d; --modern:#0666b8; --legacy:#8a5a00;
  --accent:#0666b8;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  background:var(--bg); color:var(--fg);
  font:15px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;
  -webkit-text-size-adjust:100%;
}
code,pre{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace}

/* ---------- layout ---------- */
#shell{display:flex; min-height:100vh}
#side{
  width:236px; flex:0 0 236px; background:var(--bg2); border-right:1px solid var(--line);
  position:sticky; top:0; height:100vh; overflow-y:auto; padding:14px 10px 40px;
  -webkit-overflow-scrolling:touch;
}
#side h1{font-size:14px; margin:4px 8px 12px; letter-spacing:.02em}
#side h1 span{display:block; font-size:11px; color:var(--faint); font-weight:400; margin-top:2px}
.navgroup{font-size:10.5px; text-transform:uppercase; letter-spacing:.09em; color:var(--faint);
  margin:14px 8px 5px; font-weight:700}
#side a{
  display:block; padding:6px 9px; margin:1px 0; border-radius:7px; text-decoration:none;
  color:var(--dim); font-size:13.2px; line-height:1.3; border-left:3px solid transparent;
}
#side a:hover{background:rgba(127,150,190,.12); color:var(--fg)}
#side a.active{background:rgba(88,166,255,.14); color:var(--fg); border-left-color:var(--accent); font-weight:600}
#main{flex:1; min-width:0; padding:0 20px 120px}

#topbar{
  position:sticky; top:0; z-index:20; background:var(--bg); padding:12px 0 10px;
  border-bottom:1px solid var(--line); display:flex; gap:8px; align-items:center;
}
#q{
  flex:1; background:var(--bg2); border:1px solid var(--line); color:var(--fg);
  border-radius:9px; padding:9px 12px; font-size:14px; outline:none;
}
#q:focus{border-color:var(--accent)}
.btn{
  background:var(--bg2); border:1px solid var(--line); color:var(--dim);
  border-radius:9px; padding:9px 11px; font-size:13px; cursor:pointer; white-space:nowrap;
}
.btn:hover{color:var(--fg)}
#menu{display:none}
#hits{color:var(--faint); font-size:12.5px; padding:8px 2px 0}

/* ---------- sheets ---------- */
.sheet{padding-top:16px; scroll-margin-top:64px}
.sheethead{margin:10px 0 14px; padding-bottom:8px; border-bottom:2px solid var(--line)}
.sheethead h2{margin:0; font-size:21px; letter-spacing:-.01em}
.sheethead p{margin:4px 0 0; color:var(--dim); font-size:13px}
.grid{display:grid; grid-template-columns:repeat(auto-fill,minmax(370px,1fr)); gap:12px; align-items:start}
.card{
  background:var(--card); border:1px solid var(--line); border-radius:11px; padding:11px 12px 12px;
  overflow:hidden;
}
.card.wide{grid-column:1/-1}
.card h3{margin:0 0 3px; font-size:14.2px; color:var(--fg); letter-spacing:-.005em}
.note{margin:0 0 8px; font-size:12.4px; color:var(--dim); line-height:1.45}
pre{
  margin:0; background:var(--bg2); border:1px solid var(--line); border-radius:8px;
  padding:9px 10px; overflow-x:auto; font-size:12.6px; line-height:1.55; white-space:pre;
}
pre + pre{margin-top:7px}
code.inline{background:var(--bg2); border:1px solid var(--line); border-radius:5px;
  padding:.5px 4px; font-size:11.9px; color:var(--typ)}
.cols{display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:9px}
.col{min-width:0}
.collabel{
  display:inline-block; font-size:10.8px; font-weight:800; letter-spacing:.06em;
  text-transform:uppercase; margin-bottom:4px; padding:2px 7px; border-radius:20px;
}
.tone-good .collabel,pre.tone-good{--tc:var(--good)}
.tone-bad .collabel,pre.tone-bad{--tc:var(--bad)}
.tone-modern .collabel,pre.tone-modern{--tc:var(--modern)}
.tone-legacy .collabel,pre.tone-legacy{--tc:var(--legacy)}
.tone-neutral .collabel,pre.tone-neutral{--tc:var(--faint)}
.collabel{color:var(--tc); background:color-mix(in srgb,var(--tc) 16%,transparent)}
.col pre{border-left:3px solid var(--tc)}
pre.tone-good,pre.tone-bad,pre.tone-modern,pre.tone-legacy{border-left:3px solid var(--tc)}

ul.rules{margin:0; padding:0; list-style:none}
ul.rules li{
  position:relative; padding:5px 0 5px 20px; font-size:13px; line-height:1.5;
  border-bottom:1px solid var(--line);
}
ul.rules li:last-child{border-bottom:0}
.bullet{position:absolute; left:2px; top:11px; width:8px; height:8px; border-radius:3px; background:var(--tc,var(--faint))}
li.tone-good{--tc:var(--good)} li.tone-bad{--tc:var(--bad)}
li.tone-modern{--tc:var(--modern)} li.tone-legacy{--tc:var(--legacy)} li.tone-neutral{--tc:var(--faint)}
li.tone-good .bullet{border-radius:8px}
li.tone-bad .bullet{border-radius:1px}

/* ---------- diagrams ---------- */
.card.diagram{background:var(--card)}
.dgwrap{overflow-x:auto; -webkit-overflow-scrolling:touch}
svg.dg{display:block; width:100%; min-width:720px; height:auto}
svg.dg text{
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;
  fill:var(--dim);
}
svg.dg text.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace; fill:var(--dim)}
@media (max-width:900px){ svg.dg{min-width:820px} }

.tablewrap{overflow-x:auto}
table{border-collapse:collapse; width:100%; font-size:12.6px}
th,td{text-align:left; padding:6px 9px; border-bottom:1px solid var(--line); vertical-align:top}
th{color:var(--faint); font-size:10.8px; text-transform:uppercase; letter-spacing:.06em}
tbody tr:hover{background:rgba(127,150,190,.07)}

/* ---------- syntax ---------- */
.t-kw{color:var(--kw)} .t-str{color:var(--str)} .t-typ{color:var(--typ)}
.t-num{color:var(--num)} .t-com{color:var(--com); font-style:italic}
.t-attr{color:var(--attr)} .t-mem{color:var(--mem)}

.hidden{display:none !important}

/* ---------- responsive ---------- */
@media (max-width:900px){
  #side{position:fixed; left:0; top:0; z-index:60; transform:translateX(-100%); transition:transform .18s ease;
    box-shadow:0 0 40px rgba(0,0,0,.5)}
  body.navopen #side{transform:none}
  #menu{display:block}
  #main{padding:0 12px 120px}
  .grid{grid-template-columns:1fr}
  #scrim{position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:50; display:none}
  body.navopen #scrim{display:block}
}
@media print{
  #side,#topbar,#scrim{display:none}
  body{background:#fff}
  .card{break-inside:avoid; page-break-inside:avoid}
}
</style>
</head>
<body>
<div id="scrim"></div>
<div id="shell">
  <nav id="side">
    <h1>Swift Interview Cheat Sheets<span>{{COUNT}} sheets &middot; tap to jump</span></h1>
    {{NAV}}
  </nav>
  <main id="main">
    <div id="topbar">
      <button class="btn" id="menu">&#9776;</button>
      <input id="q" type="search" placeholder="Search everything  (press /)" autocomplete="off" autocorrect="off" spellcheck="false">
      <button class="btn" id="theme">&#9788;</button>
    </div>
    <div id="hits"></div>
    {{BODY}}
  </main>
</div>
<script>
(function(){
  "use strict";

  /* ---------------- Swift syntax highlighting ----------------
     Runs on textContent (already unescaped by the parser), then re-escapes
     every token, so no snippet can ever inject markup. */
  var KW = ["func","let","var","struct","class","enum","actor","protocol","extension","import",
    "return","if","else","guard","switch","case","default","for","in","while","repeat","do","try",
    "catch","throw","throws","rethrows","async","await","defer","init","deinit","self","Self","nil",
    "true","false","some","any","where","as","is","inout","static","private","public","internal",
    "fileprivate","open","final","lazy","weak","unowned","mutating","nonmutating","associatedtype",
    "typealias","subscript","get","set","willSet","didSet","override","convenience","required",
    "indirect","operator","nonisolated","isolated","sending","consuming","borrowing","package","each","break","continue","fallthrough"];
  var RX = new RegExp(
      "(\\/\\/[^\\n]*)"                         /* 1 line comment  */
    + "|(\\/\\*[\\s\\S]*?\\*\\/)"               /* 2 block comment */
    + "|(\"(?:\\\\.|[^\"\\\\])*\")"             /* 3 string        */
    + "|(@[A-Za-z_][\\w]*)"                     /* 4 attribute     */
    + "|(#[A-Za-z]+)"                           /* 5 directive     */
    + "|(\\b\\d[\\d_]*(?:\\.\\d+)?\\b)"         /* 6 number        */
    + "|\\b(" + KW.join("|") + ")\\b"           /* 7 keyword       */
    + "|(\\b[A-Z][A-Za-z0-9_]*\\b)"             /* 8 type          */
    + "|(\\.[a-z_][\\w]*)"                      /* 9 member        */
  , "g");
  var CLS = [null,"t-com","t-com","t-str","t-attr","t-attr","t-num","t-kw","t-typ","t-mem"];

  function esc(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}

  function highlight(src){
    var out = "", last = 0, m;
    RX.lastIndex = 0;
    while((m = RX.exec(src)) !== null){
      out += esc(src.slice(last, m.index));
      var cls = null;
      for(var g = 1; g < m.length; g++){ if(m[g] !== undefined){ cls = CLS[g]; break; } }
      out += '<span class="' + cls + '">' + esc(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    return out + esc(src.slice(last));
  }

  var blocks = document.querySelectorAll("pre > code");
  for(var i = 0; i < blocks.length; i++){
    blocks[i].innerHTML = highlight(blocks[i].textContent);
  }

  /* ---------------- search ---------------- */
  var q = document.getElementById("q");
  var hits = document.getElementById("hits");
  var cards = [].slice.call(document.querySelectorAll(".card"));
  var sheets = [].slice.call(document.querySelectorAll(".sheet"));
  cards.forEach(function(c){ c._hay = c.textContent.toLowerCase(); });
  sheets.forEach(function(s){ s._hay = s.querySelector(".sheethead").textContent.toLowerCase(); });

  function filter(){
    var terms = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    if(!terms.length){
      cards.forEach(function(c){ c.classList.remove("hidden"); });
      sheets.forEach(function(s){ s.classList.remove("hidden"); });
      hits.textContent = "";
      return;
    }
    var n = 0;
    sheets.forEach(function(s){
      var shown = 0;
      var sheetMatch = terms.every(function(t){ return s._hay.indexOf(t) > -1; });
      [].slice.call(s.querySelectorAll(".card")).forEach(function(c){
        var ok = sheetMatch || terms.every(function(t){ return c._hay.indexOf(t) > -1; });
        c.classList.toggle("hidden", !ok);
        if(ok){ shown++; n++; }
      });
      s.classList.toggle("hidden", shown === 0);
    });
    hits.textContent = n + " card" + (n === 1 ? "" : "s") + " matching “" + q.value + "”";
  }
  q.addEventListener("input", filter);
  document.addEventListener("keydown", function(ev){
    if(ev.key === "/" && document.activeElement !== q){ ev.preventDefault(); q.focus(); q.select(); }
    if(ev.key === "Escape"){ q.value = ""; filter(); q.blur(); }
  });

  /* ---------------- active section in nav ---------------- */
  var links = {};
  [].slice.call(document.querySelectorAll("#side a")).forEach(function(a){
    links[a.dataset.target] = a;
    a.addEventListener("click", function(){ document.body.classList.remove("navopen"); });
  });
  var obs = new IntersectionObserver(function(entries){
    entries.forEach(function(en){
      if(en.isIntersecting){
        for(var k in links){ links[k].classList.remove("active"); }
        var a = links[en.target.id];
        if(a){ a.classList.add("active"); }
      }
    });
  }, {rootMargin:"-60px 0px -70% 0px", threshold:0});
  sheets.forEach(function(s){ obs.observe(s); });

  /* ---------------- chrome ---------------- */
  document.getElementById("menu").addEventListener("click", function(){
    document.body.classList.toggle("navopen");
  });
  document.getElementById("scrim").addEventListener("click", function(){
    document.body.classList.remove("navopen");
  });
  var root = document.documentElement;
  try{ var saved = localStorage.getItem("cheat-theme"); if(saved){ root.dataset.theme = saved; } }catch(e){}
  document.getElementById("theme").addEventListener("click", function(){
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try{ localStorage.setItem("cheat-theme", root.dataset.theme); }catch(e){}
  });
})();
</script>
</body>
</html>
"""
