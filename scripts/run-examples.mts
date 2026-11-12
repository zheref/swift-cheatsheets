/**
 * Runs the catalogs' examples with the real compilers and runtimes, so a
 * `validation` status on a card is something this machine can reproduce
 * (zheref/swift-cheatsheets#3, AC-2).
 *
 *   node scripts/run-examples.mts [--lang typescript,kotlin,csharp] [--require-all] [--json <file>]
 *
 * Every `code` card — and every column of a `compare` card — whose `validation.status` is
 * `ran` is compiled and executed, and its standard output must equal `expected` (or, with
 * `check: exit-code`, the program must exit 0); a `compiled` example is compiled only. The
 * snippet on the page IS the program: nothing is wrapped or prepended. Excerpts are listed,
 * never run.
 *
 * Toolchains, each found on PATH unless named by an environment variable:
 *   typescript  `tsc` from this repository's node_modules, then `node` (22.18+ strips types);
 *               each example is a `.mts` module, as its setup tells the reader
 *   kotlin      `kotlinc` and the `kotlin` runner beside it ($KOTLINC), plus $KOTLIN_CLASSPATH
 *               (colon-separated jars, e.g. kotlinx-coroutines-core-jvm) for library examples
 *   csharp      `dotnet` ($DOTNET, else ~/.dotnet/dotnet, the install script's default)
 * A missing toolchain skips its examples and says so — it never counts as a pass. With
 * `--require-all`, a skipped example fails the run.
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
  validation?: { status: string; check?: string };
}

/** Every example of the catalogs under `root/content/languages` that claims to compile or run. */
export function collectExamples(root: string): Example[] {
  const langRoot = path.join(root, "content/languages");
  const out: Example[] = [];
  for (const dir of fs.readdirSync(langRoot, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    const lang = YAML.parse(fs.readFileSync(path.join(langRoot, dir.name, "language.yaml"), "utf8")) as { codeLanguage: string; sheets: string[] };
    if (!(EXAMPLE_LANGUAGES as readonly string[]).includes(lang.codeLanguage)) continue;
    for (const sheet of lang.sheets) {
      const doc = YAML.parse(fs.readFileSync(path.join(langRoot, dir.name, "sheets", `${sheet}.yaml`), "utf8")) as { cards: RawCard[] };
      for (const card of doc.cards) {
        const status = card.validation?.status;
        if (status !== "ran" && status !== "compiled") continue;
        const base: Omit<Example, "id" | "code"> = {
          language: lang.codeLanguage as ExampleLanguage,
          status,
          check: card.validation?.check === "exit-code" ? ("exit-code" as const) : ("stdout" as const),
          ...(card.expected === undefined ? {} : { expected: card.expected }),
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
    .trim();

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

const fileName = (id: string) => id.replace(/[^A-Za-z0-9]+/g, "_");

export interface Runner {
  /** The versions the toolchain reports, or why it is unavailable. */
  probe(): Promise<{ toolchain: string } | { missing: string }>;
  run(examples: Example[], work: string): Promise<Outcome[]>;
}

/** TypeScript: one strict type-check over every example, then each `ran` one under Node's type stripping. */
export function typescriptRunner(root: string): Runner {
  const tsc = path.join(root, "node_modules/typescript/bin/tsc");
  return {
    async probe() {
      if (!fs.existsSync(tsc)) return { missing: "typescript is not installed in node_modules (run `npm ci`)" };
      const [t, n] = await Promise.all([exec(process.execPath, [tsc, "--version"]), exec(process.execPath, ["--version"])]);
      return { toolchain: `Node ${n.stdout.trim().replace(/^v/, "")}, TypeScript ${t.stdout.trim().replace(/^Version /, "")}` };
    },
    async run(examples, work) {
      const files = examples.map((e) => {
        const file = path.join(work, `${fileName(e.id)}.mts`);
        fs.writeFileSync(file, e.code.endsWith("\n") ? e.code : `${e.code}\n`);
        return file;
      });
      const config = {
        compilerOptions: {
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
          typeRoots: [path.join(root, "node_modules/@types")],
        },
        files: files.map((f) => path.basename(f)),
      };
      fs.writeFileSync(path.join(work, "tsconfig.json"), JSON.stringify(config, null, 2));
      const check = await exec(process.execPath, [tsc, "-p", work], { cwd: work });
      // tsc names each file relative to its cwd, which may differ from `work` by a symlink
      // (macOS /var → /private/var): key the errors by file name, never by the printed path.
      const errors = new Map<string, string[]>();
      for (const line of check.stdout.split("\n")) {
        const m = /^(.+?\.mts)\(\d+,\d+\): error/.exec(line);
        if (!m) continue;
        const file = path.basename(m[1]!);
        errors.set(file, [...(errors.get(file) ?? []), line.trim().replace(m[1]!, file)]);
      }
      // A failure no file is blamed for (a bad option, a missing @types package) fails every example.
      const unattributed = check.code !== 0 && !errors.size ? `tsc exited ${check.code}: ${(check.stdout + check.stderr).trim().split("\n").slice(0, 4).join(" | ")}` : null;
      return pool(examples, 6, async (e, i) => {
        if (unattributed) return { id: e.id, status: e.status, result: "fail" as const, detail: unattributed };
        const typeErrors = errors.get(path.basename(files[i]!));
        if (typeErrors) return { id: e.id, status: e.status, result: "fail" as const, detail: `tsc: ${typeErrors.slice(0, 4).join(" | ")}` };
        if (e.status === "compiled") return { id: e.id, status: e.status, result: "pass" as const };
        return judge(e, await exec(process.execPath, [files[i]!], { cwd: work, timeout: 60_000 }));
      });
    },
  };
}

/** Kotlin/JVM: each example compiled on its own (each has its own `main`), then run with the `kotlin` runner. */
export function kotlinRunner(env: NodeJS.ProcessEnv = process.env): Runner {
  const kotlinc = findExecutable([env.KOTLINC, "kotlinc"], env);
  const kotlin = kotlinc ? path.join(path.dirname(kotlinc), "kotlin") : null;
  const classpath = (env.KOTLIN_CLASSPATH ?? "").split(":").filter(Boolean);
  return {
    async probe() {
      if (!kotlinc || !kotlin || !fs.existsSync(kotlin)) return { missing: "kotlinc not found (put it on PATH or set KOTLINC)" };
      const [k, j] = await Promise.all([exec(kotlinc, ["-version"], { env }), exec("java", ["-version"], { env })]);
      const kv = /kotlinc-jvm ([\w.-]+)/.exec(k.stderr + k.stdout)?.[1] ?? "unknown";
      const jv = /version "([^"]+)"/.exec(j.stderr + j.stdout)?.[1] ?? "unknown";
      const libs = classpath.map((c) => path.basename(c, ".jar")).join(", ");
      return { toolchain: `kotlinc ${kv}, JVM ${jv}${libs ? `, ${libs}` : ""}` };
    },
    async run(examples, work) {
      return pool(examples, 4, async (e) => {
        const dir = path.join(work, fileName(e.id));
        fs.mkdirSync(dir, { recursive: true });
        const src = path.join(dir, "main.kt");
        fs.writeFileSync(src, e.code);
        const cp = classpath.join(":");
        const compile = await exec(kotlinc!, [...(cp ? ["-cp", cp] : []), "-nowarn", src, "-d", path.join(dir, "out")], { env, timeout: 240_000 });
        if (compile.code !== 0) return { id: e.id, status: e.status, result: "fail" as const, detail: `kotlinc: ${compile.stderr.trim().split("\n").slice(0, 4).join(" | ")}` };
        if (e.status === "compiled") return { id: e.id, status: e.status, result: "pass" as const };
        return judge(e, await exec(kotlin!, ["-cp", [path.join(dir, "out"), ...classpath].join(":"), "MainKt"], { env, timeout: 60_000 }));
      });
    },
  };
}

/** C#/.NET: each example is the Program.cs of its own console project (top-level statements). */
export function csharpRunner(env: NodeJS.ProcessEnv = process.env): Runner {
  const dotnet = findExecutable([env.DOTNET, "dotnet", path.join(env.HOME ?? os.homedir(), ".dotnet/dotnet")], env);
  let framework = "net8.0";
  return {
    async probe() {
      if (!dotnet) return { missing: "dotnet not found (put it on PATH or set DOTNET)" };
      const v = (await exec(dotnet, ["--version"], { env })).stdout.trim();
      framework = `net${v.split(".")[0]}.0`;
      return { toolchain: `.NET SDK ${v} (${framework})` };
    },
    async run(examples, work) {
      return pool(examples, 3, async (e) => {
        const dir = path.join(work, fileName(e.id));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, "Example.csproj"),
          `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>${framework}</TargetFramework>` +
            `<Nullable>enable</Nullable><ImplicitUsings>enable</ImplicitUsings><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup></Project>\n`,
        );
        fs.writeFileSync(path.join(dir, "Program.cs"), e.code);
        const denv = { ...env, DOTNET_CLI_TELEMETRY_OPTOUT: "1", DOTNET_NOLOGO: "1", DOTNET_SKIP_FIRST_TIME_EXPERIENCE: "1" };
        const build = await exec(dotnet!, ["build", dir, "-nologo", "-v", "q", "-clp:ErrorsOnly"], { env: denv, timeout: 240_000 });
        if (build.code !== 0) return { id: e.id, status: e.status, result: "fail" as const, detail: `dotnet build: ${(build.stdout + build.stderr).trim().split("\n").slice(0, 4).join(" | ")}` };
        if (e.status === "compiled") return { id: e.id, status: e.status, result: "pass" as const };
        return judge(e, await exec(dotnet!, ["run", "--no-build", "--project", dir], { env: denv, timeout: 60_000 }));
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
  opts: { languages?: readonly ExampleLanguage[]; runners?: Partial<Record<ExampleLanguage, Runner>>; log?: (line: string) => void } = {},
): Promise<Report> {
  const log = opts.log ?? console.log;
  const languages = opts.languages ?? EXAMPLE_LANGUAGES;
  const runners: Record<ExampleLanguage, Runner> = { typescript: typescriptRunner(root), kotlin: kotlinRunner(), csharp: csharpRunner(), ...opts.runners };
  const all = collectExamples(root);
  const report: Report = { toolchains: {}, outcomes: [] };
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "cheatsheet-examples-"));
  try {
    for (const language of languages) {
      const examples = all.filter((e) => e.language === language);
      if (!examples.length) continue;
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

/** The process exit status a report earns. */
export const exitStatus = (report: Report, requireAll: boolean) =>
  report.outcomes.some((o) => o.result === "fail" || (requireAll && o.result === "skipped")) ? 1 : 0;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const languages = flag("--lang")?.split(",") as ExampleLanguage[] | undefined;
  const report = await runExamples(root, languages ? { languages } : {});
  const json = flag("--json");
  if (json) fs.writeFileSync(json, `${JSON.stringify(report, null, 2)}\n`);
  const count = (r: Outcome["result"]) => report.outcomes.filter((o) => o.result === r).length;
  console.log(`\n${count("pass")} passed, ${count("fail")} failed, ${count("skipped")} skipped (toolchain missing)`);
  process.exit(exitStatus(report, args.includes("--require-all")));
}
