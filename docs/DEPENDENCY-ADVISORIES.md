# Dependency advisories

Where the build's dependency tree stands against the OSV audit, and why each advisory still in
the lockfile is accepted rather than fixed. Re-run the audit after any dependency change:

```bash
node <hatsu>/scripts/dependency_audit_resolve.mts <checkout> --stack gatsby --query
```

It reads `package-lock.json` only and executes nothing. Its exit stays `1` while an accepted
finding below is in the lockfile — the audit honours no suppression key, by design — so this page
is the record that each remaining HIGH finding is known, unreachable today, and owned.

## Fixed by an override

`package.json` → `overrides` lifts each of these to a line that carries the fix (the four other
overrides there — `path-to-regexp`, `immutable`, `lodash`, `tmp` — came from
zheref/swift-cheatsheets#1's review). Each row was checked against the code that calls it, and
the build stays byte-identical: `public/` and the offline `index.html` match the pre-override
build file for file.

| Package | From → to | Advisories | Caller, and why the bump is compatible |
| --- | --- | --- | --- |
| `serialize-javascript` | 5.0.1 → 7.1.4 | GHSA-5c6j-r48x-rmvq (HIGH); also GHSA-qj8w-gfj5-8c6v, GHSA-m5mm-p8h7-m29v | `css-minimizer-webpack-plugin` 2 calls `serialize(options)` to hand its options to a worker. 7.x keeps that call, is still CommonJS, and only hardens the output; the worker path minifies to the same CSS under 5.0.1 and 7.1.4. |
| `sharp` (under the optional `gatsby-sharp`) | 0.32.6 → 0.35.5 | GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w (HIGH) | `gatsby-sharp` calls `simd`, `concurrency` and the constructor; `gatsby-plugin-utils`' remote-file polyfill calls `resize`, `jpeg`/`png`/`webp`/`avif`, `toFormat`, `toBuffer`, `stats` and `failOn` — all present in 0.35. 0.35 also ships prebuilt binaries, so the install script that fetched libvips is gone. The one call 0.35 drops, `sharp.vendor` in Gatsby's engine bundler, sits inside a `try` and runs only when a page is DSG or SSR; every page here is static and no engine is built. |
| `webpack-dev-middleware` | 5.3.4 → 7.4.6 | GHSA-g84c-rxfj-3j2c (HIGH) | `gatsby develop` only: it passes `publicPath`, `stats` and `serverSideRender`, then reads `res.locals.webpack.devMiddleware.stats` and `context.watching` — all unchanged in 7.x. Under `gatsby develop` every page, page-data and GraphQL response matches 5.3.4; an encoded `..` path is now refused (403), which is the advisory's fix. |

## Accepted

| Advisory | Package | Why it is not fixed | Reachability | Owner | Revisit when |
| --- | --- | --- | --- | --- | --- |
| GHSA-7mx3-vvmw-hjmv (HIGH) — prototype pollution in `mergeDeep` | `@graphql-tools/utils` 8.13.1, 9.2.1 | The fix is 12.0.1. 12.x no longer exports `AggregateError`, which `@graphql-tools/code-file-loader` 7 (`new utils_1.AggregateError`) and `@graphql-tools/load` 7 (`instanceof utils_1.AggregateError`) still use, so an override would turn their error paths into a `TypeError`. | Build-time only, and only for GraphQL typegen. Gatsby requires these modules at start but calls them only from `writeTypeScriptTypes`, which runs when `graphqlTypegen` is on; `gatsby-config.ts` sets it `false`. `mergeDeep` is reached through `@graphql-tools/merge` on that path, over the site's own schema, never over outside input. | zheref (maintainer) | Gatsby moves to `@graphql-tools/*` 8+ or `@graphql-codegen` 5+; or before `graphqlTypegen` is turned on |
| GHSA-qr28-fpjm-wq7f (HIGH) — quadratic replacement of percent-encoded runs | `decode-uri-component` 0.2.2 | The fix is 0.5.1, which is ESM-only. Its one caller, `query-string` 6.14.1, is CommonJS and calls the default export directly, so it cannot load 0.5. `query-string` 7 still pins 0.2.x and 8 is itself ESM-only. | Development only. `query-string` is imported by one Gatsby file, the develop-only 404 page (`internal-plugins/dev-404-page`), which parses `location.search` in the developer's own browser. Neither the production bundles in `public/` nor the offline `index.html` contain it. | zheref (maintainer) | Gatsby replaces or upgrades `query-string`, or ships a release that moves it |

No Gatsby release moves either one yet: 5.16.1 is the latest stable, and the 5.17.0-next and
5.18.0-react19 prereleases pin the same `query-string` 6 and `@graphql-tools/*` 7 ranges
(checked 2026-11-11). Both accepted findings also assume the site stays as it is today: no Gatsby
plugins, typegen off, no image processing (zheref/swift-cheatsheets#6).
