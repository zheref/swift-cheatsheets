// @vitest-environment jsdom
/**
 * The two adapters around the shared page stay thin: the Gatsby lifecycle
 * files and template, and the offline renderer and client.
 */
import { act, type ReactElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import gatsbyConfig from "../gatsby-config";
import { createPages } from "../gatsby-node";
import { wrapRootElement as wrapBrowser } from "../gatsby-browser";
import { onRenderBody, wrapRootElement as wrapSsr } from "../gatsby-ssr";
import CatalogTemplate, { Head } from "../src/adapters/gatsby/CatalogTemplate";
import { escapeHtml, scriptSafeJs, scriptSafeJson } from "../src/adapters/offline/escape";
import { CATALOG_ELEMENT_ID } from "../src/adapters/offline/ids";
import { renderOffline } from "../src/adapters/offline/render";
import { loadCatalog } from "../src/content/load";
import NotFound, { Head as NotFoundHead } from "../src/pages/404";
import { UiProvider } from "../src/ui/Provider";
import { themeInitScript } from "../src/ui/theme";
import { FIXTURE_DIR, swiftCatalog } from "./helpers";

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
    expect(published.map(({ path, id }) => ({ path, id }))).toEqual([{ path: "/", id: "swift" }]);
    expect(published[0]!.component).toMatch(/src\/adapters\/gatsby\/CatalogTemplate\.tsx$/);
    const withFixtures = await run("1");
    expect(withFixtures.map((p) => p.path)).toEqual(["/", "/kotlin-fixture/"]);
    expect(new Set(withFixtures.map((p) => p.component)).size).toBe(1); // one template for every language
  });

  it("renders the template and its head from page context", () => {
    const props = { pageContext: { catalog: fixture } } as unknown as Call<typeof CatalogTemplate>;
    const html = renderToString(<UiProvider>{CatalogTemplate(props)}</UiProvider>);
    expect(html).toContain('id="fixture-collections"');
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
  });

  it("hydrates from the embedded catalog in the browser entry", async () => {
    const html = renderOffline(swiftCatalog(), "");
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
  });
});
