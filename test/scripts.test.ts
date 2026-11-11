/**
 * The repository's own guards and tools: the built-page verifier (the `lint`
 * check behind AC-3/AC-5's "no external requests") and the LAN server.
 */
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHandler, lanAddress, resolveRequest, start } from "../scripts/serve.mts";
import { checkPage, cssReferences, verifyRepository } from "../scripts/verify.mts";
import { ROOT } from "./helpers";

const page = (body: string, sheets = ["a"]) =>
  `<!doctype html><html><head></head><body><nav id="side">${sheets.map((s) => `<a href="#${s}">${s}</a>`).join("")}</nav>` +
  sheets.map((s) => `<section class="sheet" id="${s}" data-group="g"><pre><code><span class="t-kw">let</span> x</code></pre></section>`).join("") +
  `${body}</body></html>`;

describe("verify: built-page checks", () => {
  it("passes a clean page", () => {
    expect(checkPage(page(""), ["a"], true).problems).toEqual([]);
  });

  it("flags every way an offline page could fetch something", () => {
    const forms = [
      '<img src="https://x.test/a.png">',
      '<img srcset="https://x.test/c.png 1x">',
      '<object data="https://x.test/d"></object>',
      '<svg><image href="https://x.test/e.png"></image></svg>',
      '<svg><use xlink:href="https://x.test/s.svg#i"></use></svg>',
      '<link rel="stylesheet" href="/site.css">',
      '<script src="/app.js"></script>',
      "<style>@import url(https://x.test/a.css);</style>",
      "<style>body{background:url(https://x.test/b.png)}</style>",
      '<div style="background:url(https://x.test/b.png)"></div>',
      '<video poster="https://x.test/p.png"></video>',
    ];
    for (const form of forms) expect(checkPage(page(form), ["a"], true).problems.join("\n"), form).toMatch(/offline file references/);
    // Links a reader follows and same-document references are not requests.
    expect(checkPage(page('<a href="https://swift.org">docs</a><svg><path marker-end="url(#m)"></path></svg>'), ["a"], true).problems).toEqual([]);
  });

  it("checks every srcset candidate and quoted @import on the site, not just the first or the label", () => {
    const mixed = '<img srcset="/small.png 1x, https://cdn.example/large.png 2x">';
    expect(checkPage(page(mixed), ["a"], false).problems.join()).toMatch(/external resource: <img srcset>: https:\/\/cdn\.example\/large\.png/);
    expect(checkPage(page('<img srcset="/a.png 1x, /b.png 2x">'), ["a"], false).problems).toEqual([]);
    for (const css of ['@import "https://cdn.example/theme.css";', "@import 'https://cdn.example/theme.css';", "@import url(https://cdn.example/theme.css);"]) {
      expect(checkPage(page(`<style>${css}</style>`), ["a"], false).problems.join(), css).toMatch(/external resource: <style>: https:\/\/cdn\.example/);
    }
    expect(checkPage(page('<style>@import "/local.css";</style>'), ["a"], false).problems).toEqual([]);
  });

  it("lets the site load its own files but nothing external", () => {
    expect(checkPage(page('<script src="/app.js"></script><link rel="preload" href="/page-data/app.json">'), ["a"], false).problems).toEqual([]);
    expect(checkPage(page('<script src="https://cdn.test/x.js"></script>'), ["a"], false).problems.join()).toMatch(/external resource/);
    expect(checkPage(page('<link href="//cdn.test/x.css" rel="stylesheet">'), ["a"], false).problems.join()).toMatch(/external resource/);
  });

  it("checks structure: section order, links, groups, code blocks, artefacts", () => {
    expect(checkPage(page("", ["a", "b"]), ["b", "a"], true).problems.join()).toMatch(/do not match/);
    expect(checkPage(page('<nav id="side"><a href="#nope">x</a></nav>'), ["a"], true).problems.join()).toMatch(/no target: nope/);
    const split = page("", ["a", "b", "c"]).replace('id="b" data-group="g"', 'id="b" data-group="h"');
    expect(checkPage(split, ["a", "b", "c"], true).problems.join()).toMatch(/group 'g' is split/);
    expect(checkPage(page("").replace("<span class=\"t-kw\">let</span>", "<b>let</b>"), ["a"], true).problems.join()).toMatch(/raw markup/);
    expect(checkPage(page("<p>[object Object]</p>"), ["a"], true).problems.join()).toMatch(/artefact/);
    expect(checkPage(page('<svg class="dg"><text font-size="good">x</text></svg>'), ["a"], true).problems.join()).toMatch(/font-size/);
  });

  it("reads url() and @import forms out of CSS", () => {
    expect(cssReferences("a{b:url('x.png')} c{d:url(#m)} @import \"y.css\"; @import url(z.css);")).toEqual(["x.png", "z.css", "y.css"]);
  });

  it("checks the repository's built pages, and fails when there is nothing to check", () => {
    const lines: string[] = [];
    const built = fs.existsSync(path.join(ROOT, "public/index.html"));
    if (built) expect(verifyRepository(ROOT, (l) => lines.push(l))).toEqual([]);

    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "verify-"));
    fs.mkdirSync(path.join(empty, "content/languages/x"), { recursive: true });
    fs.writeFileSync(path.join(empty, "content/languages/x/language.yaml"), "id: x\nroute: /x/\nstatus: draft\nsheets: [a]\n");
    fs.writeFileSync(path.join(empty, "content/languages/.DS_Store"), ""); // a stray file is not a catalog
    expect(verifyRepository(empty, () => {})).toEqual(["content/languages: no published catalog to check"]);

    fs.writeFileSync(path.join(empty, "content/languages/x/language.yaml"), "id: x\nroute: /x/\nstatus: published\nsheets: [a]\n");
    expect(verifyRepository(empty, () => {})).toEqual([
      "public/x/index.html: missing — run `npm run build`",
      "offline/x.html: missing — run `npm run build`",
    ]);
  });
});

describe("serve: the LAN static server", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "serve-"));
  const site = path.join(root, "site");
  let server: http.Server;
  let base = "";

  beforeAll(async () => {
    fs.mkdirSync(path.join(site, "sub"), { recursive: true });
    fs.writeFileSync(path.join(site, "index.html"), "<p>home</p>");
    fs.writeFileSync(path.join(site, "sub/index.html"), "<p>sub</p>");
    fs.writeFileSync(path.join(site, "404.html"), "<p>missing</p>");
    fs.writeFileSync(path.join(root, "outside.txt"), "secret");
    fs.mkdirSync(path.join(root, "sitex"));
    fs.writeFileSync(path.join(root, "sitex/x.txt"), "sibling");
    server = http.createServer(createHandler(site));
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  const get = (p: string, method = "GET") =>
    new Promise<{ status: number; body: string; type: string }>((resolve, reject) => {
      const req = http.request(`${base}${p}`, { method }, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body, type: String(res.headers["content-type"]) }));
      });
      req.on("error", reject);
      req.end();
    });

  it("serves files and folder index pages", async () => {
    expect(await get("/")).toMatchObject({ status: 200, body: "<p>home</p>", type: "text/html; charset=utf-8" });
    expect(await get("/sub/")).toMatchObject({ status: 200, body: "<p>sub</p>" });
  });

  it("answers a missing file with the site's 404 page", async () => {
    expect(await get("/nope")).toMatchObject({ status: 404, body: "<p>missing</p>" });
  });

  it("never serves anything outside the site folder", async () => {
    for (const p of ["/../outside.txt", "/%2e%2e/outside.txt", "/..%2foutside.txt", "/%2e%2e%2fsitex/x.txt", "/%00", "/%E0%A4%A"]) {
      const res = await get(p);
      expect(res.status, p).toBe(404);
      expect(res.body, p).not.toMatch(/secret|sibling/);
    }
    expect(resolveRequest(site, "/../sitex/x.txt")).toBeNull();
  });

  it("starts from the command line, printing the LAN address it was given", async () => {
    const lines: string[] = [];
    const s = start(["--port", "0", "--host", "127.0.0.1", "--dir", site, "--lan", "192.0.2.7"], (l) => lines.push(l));
    expect(typeof s).not.toBe("string");
    await new Promise((r) => setTimeout(r, 50));
    expect(lines.join("\n")).toMatch(/iPad etc : http:\/\/192\.0\.2\.7:\d+\//);
    (s as http.Server).close();
    expect(lanAddress()).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
  });

  it("refuses to start without a built site, or with only one of --cert and --key", () => {
    expect(start(["--dir", path.join(root, "nope")])).toMatch(/index\.html is missing/);
    expect(start(["--dir", site, "--cert", "c.pem"])).toMatch(/--cert and --key go together/);
    expect(start(["--dir", site, "--key", "k.pem"])).toMatch(/--cert and --key go together/);
  });

  it("allows only GET and HEAD, and HEAD sends no body", async () => {
    expect((await get("/", "POST")).status).toBe(405);
    expect(await get("/", "HEAD")).toMatchObject({ status: 200, body: "" });
  });
});
