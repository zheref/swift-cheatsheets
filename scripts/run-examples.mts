/**
 * Runs the catalogs' examples with the real compilers and runtimes, so a
 * `validation` status on a card is something this machine can reproduce
 * (zheref/swift-cheatsheets#3, AC-2).
 *
 *   node scripts/run-examples.mts [--lang typescript,kotlin,csharp] [--sheets <id>,<id>] [--content <dir>]
 *                                 [--require-all] [--json <file>]
 *
 * `--sheets` runs only the named sheets — for iterating on one — read straight from their
 * files, so a sheet still being written need not be listed in its language.yaml yet.
 * `--content` reads the catalogs of another content root (`<dir>/languages/<id>/`), such as a
 * draft kept outside `content/`; the toolchains and example libraries are still this repository's.
 *
 * Every `code` card — and every column of a `compare` card — whose `validation.status` is
 * `ran` is compiled and executed, and its standard output must equal `expected` (or, with
 * `check: exit-code`, the program must exit 0); a `compiled` example is compiled only. The
 * snippet on the page IS the program: nothing is wrapped or prepended. Excerpts are listed,
 * never run.
 *
 * Toolchains, each found on PATH unless named by an environment variable:
 *   typescript  `tsc` from this repository's node_modules, then `node` (22.18+ strips types);
 *               each example is a `.mts` module, as its setup tells the reader. The libraries an
 *               example imports come from `examples/node_modules` (`npm ci --prefix examples`):
 *               the site never depends on them. `validation.jsx` makes an example a `.tsx` file
 *               (`react`: the automatic JSX transform, nothing bundled, then run; `solid`:
 *               type-checked only), `validation.conditions` are Node export conditions for the
 *               run, and `validation.resolution: bundler` type-checks with bundler resolution
 *   kotlin      `kotlinc` and the `kotlin` runner beside it ($KOTLINC), plus the jars the examples
 *               import: $KOTLIN_CLASSPATH (colon-separated), else every jar in
 *               `examples/kotlin/lib` (`node scripts/fetch-example-jars.mts`)
 *   csharp      `dotnet` ($DOTNET, else ~/.dotnet/dotnet, the install script's default); an
 *               example whose code matches a package's `when` in `examples/csharp/packages.json`
 *               gets that pinned NuGet package, every other example the SDK alone
 * A missing toolchain skips its examples and says so — it never counts as a pass. With
 * `--require-all`, a skipped example fails the run.
 *
 * Running this executes every `ran` card as a program on this machine: a content change that
 * adds or edits one is a code change. Snippets get a scratch HOME and TMPDIR and none of the
 * caller's environment beyond PATH and LANG (`snippetEnv`); C# builds ignore MSBuild files above
 * the work folder (`MSBUILD_ISOLATION`).
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import YAML from "yaml";

const run = promisify(execFile);

export type ExampleLanguage = "typescript" | "kotlin" | "csharp";
export const EXAMPLE_LANGUAGES: readonly ExampleLanguage[] = ["typescript", "kotlin", "csharp"];

export interface Example {
  /** `<catalog>/<sheet>--<card>`, with `[<column>]` for one column of a compare card. */
  id: string;
  language: ExampleLanguage;
  status: "ran" | "compiled";
  check: "stdout" | "exit-code";
  code: string;
  expected?: string;
  /** TypeScript only: the example is a `.tsx` file in this JSX dialect. */
  jsx?: "react" | "solid";
  /** TypeScript only: Node export conditions the run needs, e.g. `browser`. */
  conditions?: string[];
  /** TypeScript only: type-check with bundler module resolution, for a library whose types need it. */
  resolution?: "bundler";
}

export interface Outcome {
  id: string;
  status: Example["status"];
  result: "pass" | "fail" | "skipped";
  detail?: string;
}

interface RawCard {
  id: string;
  kind: string;
  code?: string;
  columns?: { label: string; code: string }[];
  expected?: string;
  validation?: { status: string; check?: string; jsx?: "react" | "solid"; conditions?: string[]; resolution?: "bundler" };
}

/**
 * Every example of the catalogs under `root/content/languages` that claims to compile or run —
 * or, with `only`, those of the named sheets alone, wherever a catalog has such a file.
 */
export function collectExamples(root: string, only?: readonly string[], contentRoot = path.join(root, "content")): Example[] {
  const langRoot = path.join(contentRoot, "languages");
  const out: Example[] = [];
  for (const dir of fs.readdirSync(langRoot, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const lang = YAML.parse(fs.readFileSync(path.join(langRoot, dir.name, "language.yaml"), "utf8")) as {
      codeLanguage: string;
      sheets: string[];
      requireExampleMetadata?: boolean;
    };
    if (!(EXAMPLE_LANGUAGES as readonly string[]).includes(lang.codeLanguage)) {
      // A catalog that promises validated examples in a language this runner cannot run would read as 0 failures.
      if (lang.requireExampleMetadata) throw new Error(`${dir.name}: requireExampleMetadata is set, but scripts/run-examples.mts has no runner for '${lang.codeLanguage}'`);
      continue;
    }
    const sheetFile = (sheet: string) => path.join(langRoot, dir.name, "sheets", `${sheet}.yaml`);
    for (const sheet of only ? only.filter((s) => fs.existsSync(sheetFile(s))) : lang.sheets) {
      const doc = YAML.parse(fs.readFileSync(sheetFile(sheet), "utf8")) as { cards: RawCard[] };
      for (const card of doc.cards) {
        const status = card.validation?.status;
        if (status !== "ran" && status !== "compiled") continue;
        const base: Omit<Example, "id" | "code"> = {
          language: lang.codeLanguage as ExampleLanguage,
          status,
          check: card.validation?.check === "exit-code" ? ("exit-code" as const) : ("stdout" as const),
          ...(card.expected === undefined ? {} : { expected: card.expected }),
          ...(card.validation?.jsx ? { jsx: card.validation.jsx } : {}),
          ...(card.validation?.conditions?.length ? { conditions: card.validation.conditions } : {}),
          ...(card.validation?.resolution ? { resolution: card.validation.resolution } : {}),
        };
        const id = `${dir.name}/${sheet}--${card.id}`;
        if (card.kind === "code" && card.code) out.push({ id, code: card.code, ...base });
        if (card.kind === "compare") for (const col of card.columns ?? []) out.push({ id: `${id}[${col.label}]`, code: col.code, ...base });
      }
    }
  }
  return out;
}

/** Output compared the way a reader compares it: line endings and trailing whitespace ignored. */
export const normalizeOutput = (s: string) =>
  s
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/^\n+|\n+$/g, ""); // blank lines around the output, never a line's own indentation

/** The verdict on one executed example. */
export function judge(example: Example, exit: { code: number; stdout: string; stderr: string }): Outcome {
  const base = { id: example.id, status: example.status };
  if (exit.code !== 0) return { ...base, result: "fail", detail: `exited ${exit.code}: ${(exit.stderr || exit.stdout).trim().split("\n").slice(0, 6).join(" | ")}` };
  if (example.status === "compiled" || example.check === "exit-code") return { ...base, result: "pass" };
  const got = normalizeOutput(exit.stdout);
  const want = normalizeOutput(example.expected ?? "");
  return got === want ? { ...base, result: "pass" } : { ...base, result: "fail", detail: `output differs\n--- expected\n${want}\n--- got\n${got}` };
}

interface Exit {
  code: number;
  stdout: string;
  stderr: string;
}

async function exec(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {}): Promise<Exit> {
  try {
    const { stdout, stderr } = await run(cmd, args, { maxBuffer: 16 * 1024 * 1024, timeout: opts.timeout ?? 120_000, ...opts });
    return { code: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: unknown; stdout?: string; stderr?: string; message?: string };
    // The process's own output says why; the error message only when it printed nothing (it never started, say).
    return { code: typeof e.code === "number" ? e.code : 1, stdout: e.stdout ?? "", stderr: e.stderr || (e.stdout ? "" : (e.message ?? String(err))) };
  }
}

/** The first executable named, or found on PATH, that exists. */
export function findExecutable(candidates: (string | undefined)[], env: NodeJS.ProcessEnv = process.env): string | null {
  for (const c of candidates) {
    if (!c) continue;
    if (c.includes("/")) {
      if (fs.existsSync(c)) return c;
      continue;
    }
    for (const dir of (env.PATH ?? "").split(path.delimiter)) {
      const full = path.join(dir, c);
      if (dir && fs.existsSync(full)) return full;
    }
  }
  return null;
}

async function pool<T, R>(items: T[], size: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

/** A file or folder name per example, unique by position: ids differing only in punctuation never collide. */
const fileName = (id: string, index: number) => `${String(index).padStart(3, "0")}_${id.replace(/[^A-Za-z0-9]+/g, "_")}`;

/**
 * The environment a snippet runs in: enough to find its runtime, and nothing of the caller's —
 * no tokens, no keys. A `ran` card is a program executed on the machine of whoever runs this,
 * so its process gets a scratch HOME and TMPDIR inside the work folder.
 */
export function snippetEnv(env: NodeJS.ProcessEnv, dir: string, keep: string[] = []): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { PATH: env.PATH ?? "", HOME: dir, TMPDIR: dir, LANG: env.LANG ?? "C.UTF-8" };
  for (const k of keep) if (env[k] !== undefined) out[k] = env[k];
  return out;
}

/**
 * MSBuild imports `Directory.Build.*` and `Directory.Packages.props` from every folder above a
 * project, and a `Directory.Build.rsp` as arguments; the work folder sits under a temp directory
 * other users may write to. These keep the build to the files this runner wrote.
 */
export const MSBUILD_ISOLATION = [
  "-p:ImportDirectoryBuildProps=false",
  "-p:ImportDirectoryBuildTargets=false",
  "-p:ImportDirectoryPackagesProps=false",
  "-noAutoResponse",
];

export interface Runner {
  /** The versions the toolchain reports, or why it is unavailable. */
  probe(): Promise<{ toolchain: string } | { missing: string }>;
  run(examples: Example[], work: string): Promise<Outcome[]>;
}

/** Where the example-only libraries live: `<root>/examples`, its own package and lockfile. */
export const examplesDir = (root: string) => path.join(root, "examples");

/**
 * TypeScript: one strict type-check over every example, then each `ran` one under Node's type
 * stripping. When the repository has an `examples/` package the files are written beneath it, so
 * `import "rxjs"` resolves exactly as it would in a reader's project.
 */
export function typescriptRunner(root: string): Runner {
  const tsc = path.join(root, "node_modules/typescript/bin/tsc");
  const libs = examplesDir(root);
  const hasLibs = fs.existsSync(path.join(libs, "package.json"));
  return {
    async probe() {
      if (!fs.existsSync(tsc)) return { missing: "typescript is not installed in node_modules (run `npm ci`)" };
      if (hasLibs && !fs.existsSync(path.join(libs, "node_modules"))) return { missing: "the example libraries are not installed (run `npm ci --prefix examples`)" };
      const [t, n] = await Promise.all([exec(process.execPath, [tsc, "--version"]), exec(process.execPath, ["--version"])]);
      return { toolchain: `Node ${n.stdout.trim().replace(/^v/, "")}, TypeScript ${t.stdout.trim().replace(/^Version /, "")}` };
    },
    async run(examples, scratch) {
      // Under examples/ so Node and tsc find its node_modules; without that package, the caller's scratch folder.
      if (hasLibs) fs.mkdirSync(path.join(libs, ".work"), { recursive: true });
      const work = hasLibs ? fs.mkdtempSync(path.join(libs, ".work", "run-")) : scratch;
      try {
        return await runTypescript(examples, work, tsc, path.join(hasLibs ? libs : root, "node_modules/@types"));
      } finally {
        if (hasLibs) fs.rmSync(work, { recursive: true, force: true });
      }
    },
  };
}

async function runTypescript(examples: Example[], work: string, tsc: string, typeRoot: string): Promise<Outcome[]> {
  const files = examples.map((e, i) => {
    const file = path.join(work, `${fileName(e.id, i)}.${e.jsx ? "tsx" : "mts"}`);
    fs.writeFileSync(file, e.code.endsWith("\n") ? e.code : `${e.code}\n`);
    return file;
  });
  // A `.tsx` file is a module only when its package says so (a `.mts` file always is).
  fs.writeFileSync(path.join(work, "package.json"), `${JSON.stringify({ type: "module", private: true })}\n`);
  const options = {
    strict: true,
    noUncheckedIndexedAccess: true,
    noEmit: true,
    target: "ES2023",
    lib: ["ESNext", "DOM", "DOM.Iterable"],
    module: "NodeNext",
    moduleResolution: "NodeNext",
    moduleDetection: "force",
    erasableSyntaxOnly: true,
    verbatimModuleSyntax: true,
    allowImportingTsExtensions: true,
    skipLibCheck: true,
    types: ["node"],
    typeRoots: [typeRoot],
  };
  // One compilation per combination: two JSX dialects cannot share one, and a library whose
  // declarations import without extensions (as bundlers allow) needs bundler resolution.
  const settings = (e: Example) => ({
    ...(e.jsx === "solid" ? { jsx: "preserve", jsxImportSource: "solid-js" } : { jsx: "react-jsx" }),
    ...(e.resolution === "bundler" ? { module: "ESNext", moduleResolution: "Bundler" } : {}),
  });
  const kinds = [...new Set(examples.map((e) => JSON.stringify(settings(e))))];
  const projects = kinds.map((kind, n) => ({
    name: n ? `tsconfig.${n}.json` : "tsconfig.json",
    settings: JSON.parse(kind) as Record<string, string>,
    files: files.filter((_, i) => JSON.stringify(settings(examples[i]!)) === kind),
  }));
  // tsc names each file relative to its cwd, which may differ from `work` by a symlink
  // (macOS /var → /private/var): key the errors by file name, never by the printed path.
  const errors = new Map<string, string[]>();
  let unattributed: string | null = null;
  for (const project of projects) {
    fs.writeFileSync(path.join(work, project.name), JSON.stringify({ compilerOptions: { ...options, ...project.settings }, files: project.files.map((f) => path.basename(f)) }, null, 2));
    const check = await exec(process.execPath, [tsc, "-p", path.join(work, project.name)], { cwd: work });
    let blamed = 0;
    for (const line of check.stdout.split("\n")) {
      const m = /^(.+?\.(?:mts|tsx))\(\d+,\d+\): error/.exec(line);
      if (!m) continue;
      blamed++;
      const file = path.basename(m[1]!);
      errors.set(file, [...(errors.get(file) ?? []), line.trim().replace(m[1]!, file)]);
    }
    // A failure no file is blamed for (a bad option, a missing @types package) fails every example.
    if (check.code !== 0 && !blamed) unattributed ??= `tsc exited ${check.code}: ${(check.stdout + check.stderr).trim().split("\n").slice(0, 4).join(" | ")}`;
  }
  return pool(examples, 6, async (e, i) => {
    if (unattributed) return { id: e.id, status: e.status, result: "fail" as const, detail: unattributed };
    const typeErrors = errors.get(path.basename(files[i]!));
    if (typeErrors) return { id: e.id, status: e.status, result: "fail" as const, detail: `tsc: ${typeErrors.slice(0, 4).join(" | ")}` };
    if (e.status === "compiled") return { id: e.id, status: e.status, result: "pass" as const };
    let entry = files[i]!;
    if (e.jsx === "solid") return { id: e.id, status: e.status, result: "fail" as const, detail: "Solid JSX needs Solid's own compiler: mark the example `compiled`, not `ran`" };
    if (e.jsx === "react") {
      // Node strips types but not JSX: the automatic runtime's transform, nothing bundled.
      const { transform } = await import("esbuild");
      entry = entry.replace(/\.tsx$/, ".mjs");
      fs.writeFileSync(entry, (await transform(e.code, { loader: "tsx", jsx: "automatic", format: "esm", target: "es2023" })).code);
    }
    const flags = (e.conditions ?? []).map((c) => `--conditions=${c}`);
    return judge(e, await exec(process.execPath, [...flags, entry], { cwd: work, env: snippetEnv(process.env, work), timeout: 60_000 }));
  });
}

/** Kotlin/JVM: each example compiled on its own (each has its own `main`), then run with the `kotlin` runner. */
export function kotlinRunner(env: NodeJS.ProcessEnv = process.env, root?: string): Runner {
  const kotlinc = findExecutable([env.KOTLINC, "kotlinc"], env);
  const kotlin = kotlinc ? path.join(path.dirname(kotlinc), "kotlin") : null;
  // $KOTLIN_CLASSPATH wins; otherwise the jars `scripts/fetch-example-jars.mts` verified and placed.
  const jarDir = root ? path.join(examplesDir(root), "kotlin/lib") : null;
  const fetched = jarDir && fs.existsSync(jarDir) ? fs.readdirSync(jarDir).filter((f) => f.endsWith(".jar")).sort().map((f) => path.join(jarDir, f)) : [];
  const classpath = env.KOTLIN_CLASSPATH ? env.KOTLIN_CLASSPATH.split(":").filter(Boolean) : fetched;
  // `@Serializable` needs the compiler plugin that ships in the distribution's lib/ folder.
  // (a zip install keeps lib/ beside bin/, Homebrew under libexec/), or $KOTLIN_SERIALIZATION_PLUGIN names it.
  const home = kotlinc && fs.existsSync(kotlinc) ? path.dirname(path.dirname(fs.realpathSync(kotlinc))) : null;
  const plugin = [
    env.KOTLIN_SERIALIZATION_PLUGIN,
    ...(home ? ["lib", "libexec/lib"].flatMap((d) => ["kotlinx-serialization-compiler-plugin.jar", "kotlin-serialization-compiler-plugin.jar"].map((f) => path.join(home, d, f))) : []),
  ].find((f) => f && fs.existsSync(f));
  const plugins = plugin ? [`-Xplugin=${plugin}`] : [];
  return {
    async probe() {
      if (!kotlinc || !kotlin || !fs.existsSync(kotlin)) return { missing: "kotlinc not found (put it on PATH or set KOTLINC)" };
      const [k, j] = await Promise.all([exec(kotlinc, ["-version"], { env }), exec("java", ["-version"], { env })]);
      const kv = /kotlinc-jvm ([\w.-]+)/.exec(k.stderr + k.stdout)?.[1] ?? "unknown";
      // The JVM kotlinc itself reports runs the examples ($JAVA_HOME's); `java` on PATH is only a fallback.
      const jv = /\(JRE ([\d._]+)/.exec(k.stderr + k.stdout)?.[1] ?? /version "([^"]+)"/.exec(j.stderr + j.stdout)?.[1] ?? "unknown";
      const libs = classpath.map((c) => path.basename(c, ".jar")).join(", ");
      return { toolchain: `kotlinc ${kv}, JVM ${jv}${libs ? `, ${libs}` : ""}` };
    },
    async run(examples, work) {
      return pool(examples, 4, async (e, i) => {
        const dir = path.join(work, fileName(e.id, i));
        fs.mkdirSync(dir, { recursive: true });
        const src = path.join(dir, "main.kt");
        fs.writeFileSync(src, e.code);
        const cp = classpath.join(":");
        const compile = await exec(kotlinc!, [...(cp ? ["-cp", cp] : []), ...plugins, "-nowarn", src, "-d", path.join(dir, "out")], { env, timeout: 240_000 });
        if (compile.code !== 0) return { id: e.id, status: e.status, result: "fail" as const, detail: `kotlinc: ${compile.stderr.trim().split("\n").slice(0, 4).join(" | ")}` };
        if (e.status === "compiled") return { id: e.id, status: e.status, result: "pass" as const };
        const run = snippetEnv(env, dir, ["JAVA_HOME"]);
        return judge(e, await exec(kotlin!, ["-cp", [path.join(dir, "out"), ...classpath].join(":"), "MainKt"], { env: run, timeout: 60_000 }));
      });
    },
  };
}

/** C#/.NET: each example is the Program.cs of its own console project (top-level statements). */
export interface NugetPackage {
  id: string;
  version: string;
  /** A regular expression: an example whose code matches it references the package. */
  when: string;
}

/** The pinned NuGet packages examples may reference, from `examples/csharp/packages.json`. */
export function nugetPackages(root: string | undefined): NugetPackage[] {
  const file = root ? path.join(examplesDir(root), "csharp/packages.json") : null;
  if (!file || !fs.existsSync(file)) return [];
  const { packages } = JSON.parse(fs.readFileSync(file, "utf8")) as { packages: NugetPackage[] };
  for (const p of packages) if (!/^[A-Za-z0-9_.-]+$/.test(p.id) || !/^\d+\.\d+\.\d+(?:[-.][A-Za-z0-9.]+)?$/.test(p.version)) throw new Error(`${file}: '${p.id}' '${p.version}' is not a package id and an exact version`);
  return packages;
}

export function csharpRunner(env: NodeJS.ProcessEnv = process.env, root?: string): Runner {
  const dotnet = findExecutable([env.DOTNET, "dotnet", path.join(env.HOME ?? os.homedir(), ".dotnet/dotnet")], env);
  const allowed = nugetPackages(root);
  let framework = "net8.0";
  return {
    async probe() {
      if (!dotnet) return { missing: "dotnet not found (put it on PATH or set DOTNET)" };
      const v = (await exec(dotnet, ["--version"], { env })).stdout.trim();
      framework = `net${v.split(".")[0]}.0`;
      return { toolchain: `.NET SDK ${v} (${framework})` };
    },
    async run(examples, work) {
      return pool(examples, 3, async (e, i) => {
        const dir = path.join(work, fileName(e.id, i));
        fs.mkdirSync(dir, { recursive: true });
        const packages = allowed.filter((p) => new RegExp(p.when).test(e.code));
        fs.writeFileSync(
          path.join(dir, "Example.csproj"),
          `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>${framework}</TargetFramework>` +
            `<Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup>` +
            (packages.length ? `<ItemGroup>${packages.map((p) => `<PackageReference Include="${p.id}" Version="[${p.version}]" />`).join("")}</ItemGroup>` : "") +
            `</Project>\n`,
        );
        fs.writeFileSync(path.join(dir, "Program.cs"), e.code);
        // The SDK alone has no package source at all; an allowlisted package gets nuget.org and nothing else.
        // Either way a NuGet.Config above the folder is ignored.
        const sources = packages.length ? `<clear /><add key="nuget.org" value="https://api.nuget.org/v3/index.json" protocolVersion="3" />` : `<clear />`;
        fs.writeFileSync(path.join(dir, "nuget.config"), `<?xml version="1.0" encoding="utf-8"?>\n<configuration><packageSources>${sources}</packageSources></configuration>\n`);
        const denv = { ...env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1", DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1" };
        const out = path.join(dir, "out");
        const build = await exec(dotnet!, ["build", dir, "-o", out, "-nologo", "-v", "q", "-clp:ErrorsOnly", ...MSBUILD_ISOLATION], { env: denv, timeout: 240_000 });
        if (build.code !== 0) return { id: e.id, status: e.status, result: "fail" as const, detail: `dotnet build: ${(build.stdout + build.stderr).trim().split("\n").slice(0, 4).join(" | ")}` };
        if (e.status === "compiled") return { id: e.id, status: e.status, result: "pass" as const };
        // Run the built assembly directly: `dotnet run` would evaluate the project (and its imports) again.
        const run = { ...snippetEnv(env, dir), DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1" };
        return judge(e, await exec(dotnet!, [path.join(out, "Example.dll")], { env: run, cwd: dir, timeout: 60_000 }));
      });
    },
  };
}

export interface Report {
  toolchains: Record<string, string>;
  outcomes: Outcome[];
}

/** Runs the examples of the chosen languages; missing toolchains skip theirs, named. */
export async function runExamples(
  root: string,
  opts: { languages?: readonly ExampleLanguage[]; sheets?: readonly string[]; content?: string; runners?: Partial<Record<ExampleLanguage, Runner>>; log?: (line: string) => void } = {},
): Promise<Report> {
  const log = opts.log ?? console.log;
  const languages = opts.languages ?? EXAMPLE_LANGUAGES;
  const runners: Record<ExampleLanguage, Runner> = { typescript: typescriptRunner(root), kotlin: kotlinRunner(process.env, root), csharp: csharpRunner(process.env, root), ...opts.runners };
  const all = collectExamples(root, opts.sheets, opts.content);
  const report: Report = { toolchains: {}, outcomes: [] };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "cheatsheet-examples-"));
  try {
    for (const language of languages) {
      const examples = all.filter((e) => e.language === language);
      if (!examples.length) {
        report.toolchains[language] = "no examples";
        log(`${language}: no compiled or run examples found`);
        continue;
      }
      const probe = await runners[language].probe();
      if ("missing" in probe) {
        report.toolchains[language] = `missing: ${probe.missing}`;
        report.outcomes.push(...examples.map((e) => ({ id: e.id, status: e.status, result: "skipped" as const, detail: probe.missing })));
        log(`${language}: ${examples.length} examples SKIPPED — ${probe.missing}`);
        continue;
      }
      report.toolchains[language] = probe.toolchain;
      log(`${language}: ${examples.length} examples with ${probe.toolchain}`);
      const dir = path.join(work, language);
      fs.mkdirSync(dir);
      const outcomes = await runners[language].run(examples, dir);
      for (const o of outcomes) log(`  ${o.result.toUpperCase().padEnd(4)} ${o.status.padEnd(8)} ${o.id}${o.result === "fail" ? `\n      ${o.detail?.replace(/\n/g, "\n      ")}` : ""}`);
      report.outcomes.push(...outcomes);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  return report;
}

/**
 * The process exit status a report earns. With `requireAll`, a skipped example fails it, and so
 * does a requested language that ran nothing — a run that checked nothing is not a pass.
 */
export const exitStatus = (report: Report, requireAll: boolean) =>
  report.outcomes.some((o) => o.result === "fail" || (requireAll && o.result === "skipped")) ||
  (requireAll && Object.values(report.toolchains).includes("no examples"))
    ? 1
    : 0;

/** The `--lang` list, refused when it is empty or names a language this runner does not have. */
export function parseLanguages(value: string | undefined): ExampleLanguage[] | { error: string } {
  if (value === undefined || value === "" || value.startsWith("--")) return { error: "--lang needs a value: a comma-separated list of typescript, kotlin, csharp" };
  const langs = value.split(",");
  const unknown = langs.filter((l) => !(EXAMPLE_LANGUAGES as readonly string[]).includes(l));
  return unknown.length ? { error: `--lang: unknown language ${unknown.join(", ")} (expected typescript, kotlin or csharp)` } : (langs as ExampleLanguage[]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const languages = args.includes("--lang") ? parseLanguages(flag("--lang")) : undefined;
  if (languages && "error" in languages) {
    console.error(languages.error);
    process.exit(2);
  }
  const sheets = flag("--sheets")?.split(",").filter(Boolean);
  const content = flag("--content");
  const report = await runExamples(root, { ...(languages ? { languages } : {}), ...(sheets?.length ? { sheets } : {}), ...(content ? { content: path.resolve(content) } : {}) });
  const json = flag("--json");
  if (json) fs.writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);
  const count = (r: Outcome["result"]) => report.outcomes.filter((o) => o.result === r).length;
  console.log(`\n${count("pass")} passed, ${count("fail")} failed, ${count("skipped")} skipped (toolchain missing)`);
  process.exit(exitStatus(report, args.includes("--require-all")));
}
