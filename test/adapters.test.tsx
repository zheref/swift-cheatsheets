// @vitest-environment jsdom
/**
 * The two adapters around the shared page stay thin: the Gatsby lifecycle
 * files and template, and the offline renderer and client.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { act, type ReactElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import gatsbyConfig from "../gatsby-config";
import { createPages, createPagesStatefully } from "../gatsby-node";
import { stopContentWatch } from "../src/adapters/gatsby/content";
import { wrapRootElement as wrapBrowser } from "../gatsby-browser";
import { onRenderBody, wrapRootElement as wrapSsr } from "../gatsby-ssr";
import CatalogTemplate, { Head } from "../src/adapters/gatsby/CatalogTemplate";
import { escapeHtml, scriptSafeJs, scriptSafeJson } from "../src/adapters/offline/escape";
import { CATALOG_ELEMENT_ID, LANGUAGES_ELEMENT_ID } from "../src/adapters/offline/ids";
import { offlineLanguages } from "../src/adapters/offline/paths";
import { renderOffline } from "../src/adapters/offline/render";
import { loadCatalog, loadSite } from "../src/content/load";
import NotFound, { Head as NotFoundHead } from "../src/pages/404";
import { UiProvider } from "../src/ui/Provider";
import { themeInitScript } from "../src/ui/theme";
import { FIXTURE_DIR, ROOT, swiftCatalog } from "./helpers";

beforeAll(() => {
  globalThis.IntersectionObserver ??= class {
    observe() {}
    disconnect() {}
  } as unknown as typeof IntersectionObserver;
});

const fixture = loadCatalog(FIXTURE_DIR);
type Call<F> = F extends (...a: infer A) => unknown ? A[0] : never;

describe("Gatsby adapter", () => {
  it("is configured for folder routes, with no plugins and no GraphQL typegen", () => {
    expect(gatsbyConfig).toMatchObject({ trailingSlash: "always", jsxRuntime: "automatic", graphqlTypegen: false, plugins: [] });
  });

  it("creates one page per published catalog, and the fixtures only on request", async () => {
    const run = async (env?: string) => {
      const createPage = vi.fn();
      const info = vi.fn();
      const prev = process.env.CHEATSHEETS_FIXTURES;
      if (env) process.env.CHEATSHEETS_FIXTURES = env;
      else delete process.env.CHEATSHEETS_FIXTURES;
      try {
        await (createPages as (a: unknown) => Promise<void>)({ actions: { createPage }, reporter: { info } });
      } finally {
        if (prev === undefined) delete process.env.CHEATSHEETS_FIXTURES;
        else process.env.CHEATSHEETS_FIXTURES = prev;
      }
      return createPage.mock.calls.map(([p]) => ({ path: p.path, id: p.context.catalog.language.id, component: p.component }));
    };
    const published = await run();
    expect(published.map(({ path, id }) => ({ path, id }))).toEqual([
      { path: "/", id: "swift" },
      { path: "/csharp/", id: "csharp" },
      { path: "/kotlin/", id: "kotlin" },
      { path: "/typescript/", id: "typescript" },
    ]);
    expect(published[0]!.component).toMatch(/src\/adapters\/gatsby\/CatalogTemplate\.tsx$/);
    const withFixtures = await run("1");
    expect(withFixtures.map((p) => p.path)).toEqual([
      ...published.map((p) => p.path),
      "/csharp-fixture/",
      "/kotlin-fixture/",
      "/swift-fixture/",
      "/typescript-fixture/",
    ]);
    expect(new Set([...published, ...withFixtures].map((p) => p.component)).size).toBe(1); // one template for every language
  });

  it("re-creates catalog pages when content changes under gatsby develop, and survives a bad save", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "develop-"));
    fs.cpSync(path.resolve("content"), path.join(tmp, "content"), { recursive: true });
    fs.mkdirSync(path.join(tmp, "src/adapters/gatsby"), { recursive: true });
    const cwd = process.cwd();
    const env = process.env.NODE_ENV;
    const createPage = vi.fn();
    const error = vi.fn();
    process.chdir(tmp);
    process.env.NODE_ENV = "development";
    try {
      await (createPagesStatefully as (a: unknown) => Promise<void>)({ actions: { createPage }, reporter: { info: vi.fn(), error } });
      const sheet = path.join(tmp, "content/languages/swift/sheets/solid.yaml");
      fs.writeFileSync(sheet, fs.readFileSync(sheet, "utf8").replace("title: SOLID in Swift", "title: SOLID in Swift (edited)"));
      const swiftPage = () => createPage.mock.calls.map(([p]) => p).find((p: { path: string }) => p.path === "/");
      await vi.waitFor(() => expect(swiftPage()).toBeDefined(), { timeout: 3000, interval: 50 });
      const ctx = swiftPage().context.catalog;
      expect(ctx.sheets.find((x: { id: string }) => x.id === "solid").title).toBe("SOLID in Swift (edited)");

      fs.writeFileSync(sheet, "id: [\n");
      await vi.waitFor(() => expect(error).toHaveBeenCalled(), { timeout: 3000, interval: 50 });
      expect(String(error.mock.calls[0]![0])).toMatch(/solid\.yaml/);
    } finally {
      stopContentWatch();
      process.chdir(cwd);
      process.env.NODE_ENV = env;
    }
  });

  it("does not watch content in a production build", async () => {
    const createPage = vi.fn();
    await (createPagesStatefully as (a: unknown) => Promise<void>)({ actions: { createPage }, reporter: { info: vi.fn(), error: vi.fn() } });
    expect(createPage).not.toHaveBeenCalled();
  });

  it("renders the template and its head from page context", () => {
    const { languages } = loadSite(path.resolve("test/fixtures/content"), ["fixture"]);
    const props = { pageContext: { catalog: fixture, languages } } as unknown as Call<typeof CatalogTemplate>;
    const html = renderToString(<UiProvider>{CatalogTemplate(props)}</UiProvider>);
    expect(html).toContain('id="fixture-collections"');
    expect(html).toContain('href="/swift-fixture/"');
    const head = renderToStaticMarkup(<>{Head(props as unknown as Call<typeof Head>)}</>);
    expect(head).toContain("<title>Kotlin Fixture Catalog</title>");
    expect(head).toContain('<html lang="en">');
  });

  it("wraps every page in the shared provider and sets the theme before paint", () => {
    for (const wrap of [wrapSsr, wrapBrowser]) {
      const el = (wrap as (a: { element: ReactElement }) => ReactElement)({ element: <p>x</p> });
      expect(el.type).toBe(UiProvider);
    }
    const setHtmlAttributes = vi.fn();
    const setHeadComponents = vi.fn();
    (onRenderBody as (a: unknown) => void)({ setHtmlAttributes, setHeadComponents });
    expect(setHtmlAttributes).toHaveBeenCalledWith({ "data-theme": "dark", className: "dark" });
    const head = renderToStaticMarkup(<>{setHeadComponents.mock.calls[0]![0]}</>);
    expect(head).toContain(themeInitScript.slice(0, 40));
  });

  it("renders a 404 page that points back to the catalog", () => {
    expect(renderToStaticMarkup(<UiProvider>{NotFound()}</UiProvider>)).toContain('href="/"');
    expect(renderToStaticMarkup(<>{NotFoundHead({} as Call<typeof NotFoundHead>)}</>)).toContain("Page not found");
  });
});

describe("offline adapter", () => {
  it("escapes everything it splices into the document", () => {
    expect(escapeHtml(`<a href="x">&`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;");
    expect(scriptSafeJson({ s: "</script><!--\u2028" })).toBe('{"s":"\\u003c/script>\\u003c!--\\u2028"}');
    expect(scriptSafeJs('a="</SCRIPT>"')).toBe('a="<\\/SCRIPT>"');
  });

  it("produces one self-contained document per catalog", () => {
    const html = renderOffline(fixture, "window.__client=1");
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Kotlin Fixture Catalog</title>");
    expect(html).toContain(`<script>${themeInitScript}</script>`);
    expect(html).toContain('id="fixture-concurrency"');
    expect(html).toContain("<script>window.__client=1</script>");
    const json = html.match(new RegExp(`<script type="application/json" id="${CATALOG_ELEMENT_ID}">(.*?)</script>`, "s"))![1]!;
    expect(JSON.parse(json).language.id).toBe("kotlin-fixture");
    expect(html).not.toContain(LANGUAGES_ELEMENT_ID);
  });

  it("embeds the selector's languages beside the catalog, with offline paths", () => {
    const { catalogs, languages } = loadSite(path.join(ROOT, "content"));
    const offline = offlineLanguages(languages, catalogs, catalogs[0]!);
    const html = renderOffline(catalogs[0]!, "", offline);
    const json = html.match(new RegExp(`<script type="application/json" id="${LANGUAGES_ELEMENT_ID}">(.*?)</script>`, "s"))![1]!;
    expect(JSON.parse(json).map((l: { href: string | null }) => l.href)).toEqual(["index.html", "offline/typescript.html", "offline/kotlin.html", "offline/csharp.html"]);
    expect(html).toContain('id="langnav"');
  });

  it("hydrates from the embedded catalog and languages in the browser entry", async () => {
    const { catalogs, languages } = loadSite(path.join(ROOT, "content"));
    const html = renderOffline(swiftCatalog(), "", offlineLanguages(languages, catalogs, catalogs[0]!));
    document.documentElement.innerHTML = html.replace(/^<!doctype html>\s*<html[^>]*>/, "").replace(/<\/html>\s*$/, "");
    const errors: unknown[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      await act(async () => {
        await import("../src/adapters/offline/client");
      });
    } finally {
      console.error = orig;
    }
    expect(errors).toEqual([]);
    expect(Object.keys(document.getElementById("root")!).some((k) => k.startsWith("__reactContainer"))).toBe(true);
    expect([...document.querySelectorAll("#langlist > li")].map((li) => li.getAttribute("data-state"))).toEqual([
      "current",
      "available",
      "available",
      "available",
    ]);
  });
});
