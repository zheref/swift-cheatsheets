/**
 * The example runner (scripts/run-examples.mts, zheref/swift-cheatsheets#3, AC-2): what it
 * collects, how it judges, that a missing toolchain is reported as skipped and never as a pass,
 * and — with the real TypeScript compiler and Node — that a wrong output or a type error fails.
 * Kotlin and C# are driven through stub executables here, so CI needs neither toolchain.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectExamples,
  csharpRunner,
  type Example,
  exitStatus,
  findExecutable,
  judge,
  kotlinRunner,
  normalizeOutput,
  type Runner,
  parseLanguages,
  runExamples,
  snippetEnv,
  typescriptRunner,
} from "../scripts/run-examples.mts";
import { ROOT } from "./helpers";

const tmp = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

/** A content root holding one catalog of the given language with the given cards. */
function contentRoot(codeLanguage: string, cards: object[]): string {
  const root = tmp("examples-");
  const dir = path.join(root, "content/languages", codeLanguage);
  fs.mkdirSync(path.join(dir, "sheets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "language.yaml"), `id: ${codeLanguage}\ncodeLanguage: ${codeLanguage}\nsheets: [s]\n`);
  fs.writeFileSync(path.join(dir, "sheets/s.yaml"), JSON.stringify({ id: "s", cards }));
  // A catalog in another language is ignored.
  fs.mkdirSync(path.join(root, "content/languages/swift"), { recursive: true });
  fs.writeFileSync(path.join(root, "content/languages/swift/language.yaml"), "id: swift\ncodeLanguage: swift\nsheets: []\n");
  return root;
}

const ran = { status: "ran", toolchain: "t", date: "2026-11-11" };
const example = (over: Partial<Example> = {}): Example => ({ id: "x/s--c", language: "typescript", status: "ran", check: "stdout", code: "", expected: "ok", ...over });

/** Where the stubs find `grep` and friends. */
const SYSTEM_PATH = "/usr/bin:/bin";

/** An executable shell script in `dir`. */
function stub(dir: string, name: string, body: string) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return file;
}

describe("collecting examples", () => {
  it("collects every compiled or run example of the three catalogs, and nothing else", () => {
    const all = collectExamples(ROOT);
    const count = (lang: string, status: string) => all.filter((e) => e.language === lang && e.status === status).length;
    expect(new Set(all.map((e) => e.language))).toEqual(new Set(["typescript", "kotlin", "csharp"]));
    expect(all.length).toBe(new Set(all.map((e) => e.id)).size);
    expect(count("typescript", "compiled")).toBe(3);
    expect(count("kotlin", "compiled")).toBe(1);
    expect(all.every((e) => e.code.length > 0)).toBe(true);
  });

  it("refuses a catalog that promises validated examples in a language it cannot run", () => {
    const root = contentRoot("rust", []);
    fs.appendFileSync(path.join(root, "content/languages/rust/language.yaml"), "requireExampleMetadata: true\n");
    expect(() => collectExamples(root)).toThrow("rust: requireExampleMetadata is set, but scripts/run-examples.mts has no runner for 'rust'");
  });

  it("expands a compare card into one example per column and skips excerpts and plain cards", () => {
    const root = contentRoot("kotlin", [
      { id: "both", kind: "compare", columns: [{ label: "old", code: "a" }, { label: "new", code: "b" }], expected: "same", validation: ran },
      { id: "frag", kind: "code", code: "c", validation: { status: "excerpt", host: "h" } },
      { id: "bare", kind: "code", code: "d" },
      { id: "tests", kind: "code", code: "e", validation: { ...ran, check: "exit-code" } },
    ]);
    expect(collectExamples(root).map(({ id, check, expected }) => ({ id, check, expected }))).toEqual([
      { id: "kotlin/s--both[old]", check: "stdout", expected: "same" },
      { id: "kotlin/s--both[new]", check: "stdout", expected: "same" },
      { id: "kotlin/s--tests", check: "exit-code", expected: undefined },
    ]);
  });
});

describe("judging an example", () => {
  it("compares output the way a reader would: line endings, trailing spaces and blank edges ignored — indentation kept", () => {
    expect(normalizeOutput("a  \r\nb\n\n")).toBe("a\nb");
    expect(normalizeOutput("\n  ok\n")).toBe("  ok");
    expect(judge(example({ expected: "   ok" }), { code: 0, stdout: "ok\n", stderr: "" }).result).toBe("fail");
    expect(judge(example({ expected: "a\nb" }), { code: 0, stdout: "a \r\nb\n", stderr: "" }).result).toBe("pass");
  });

  it("fails a different output and shows both", () => {
    const o = judge(example({ expected: "3" }), { code: 0, stdout: "4\n", stderr: "" });
    expect(o).toMatchObject({ result: "fail" });
    expect(o.detail).toContain("--- expected\n3\n--- got\n4");
  });

  it("fails a non-zero exit whatever the check, and passes exit-code and compiled examples on 0", () => {
    expect(judge(example({ check: "exit-code" }), { code: 1, stdout: "", stderr: "boom\n" })).toMatchObject({ result: "fail", detail: "exited 1: boom" });
    expect(judge(example({ check: "exit-code", expected: undefined }), { code: 0, stdout: "noise", stderr: "" }).result).toBe("pass");
    expect(judge(example({ status: "compiled" }), { code: 0, stdout: "", stderr: "" }).result).toBe("pass");
  });
});

describe("finding toolchains", () => {
  it("takes an explicit path only when it exists, else searches PATH", () => {
    const bin = tmp("bin-");
    const tool = stub(bin, "tool", "true");
    expect(findExecutable([path.join(bin, "absent"), "tool"], { PATH: bin })).toBe(tool);
    expect(findExecutable([undefined, tool], { PATH: "" })).toBe(tool);
    expect(findExecutable(["tool"], { PATH: "" })).toBeNull();
  });

  it("reports Kotlin and .NET as missing when nothing provides them", async () => {
    const env = { PATH: tmp("empty-"), HOME: tmp("home-") };
    expect(await kotlinRunner(env).probe()).toEqual({ missing: "kotlinc not found (put it on PATH or set KOTLINC)" });
    expect(await csharpRunner(env).probe()).toEqual({ missing: "dotnet not found (put it on PATH or set DOTNET)" });
  });
});

describe("running examples", () => {
  it("skips the examples of a missing toolchain — never a pass — and fails the run only when told to", async () => {
    const root = contentRoot("csharp", [{ id: "a", kind: "code", code: "x", expected: "y", validation: ran }]);
    const missing: Runner = { probe: async () => ({ missing: "no dotnet" }), run: async () => [] };
    const lines: string[] = [];
    const report = await runExamples(root, { languages: ["csharp"], runners: { csharp: missing }, log: (l) => lines.push(l) });
    expect(report).toEqual({
      toolchains: { csharp: "missing: no dotnet" },
      outcomes: [{ id: "csharp/s--a", status: "ran", result: "skipped", detail: "no dotnet" }],
    });
    expect(lines).toEqual(["csharp: 1 examples SKIPPED — no dotnet"]);
    expect(exitStatus(report, false)).toBe(0);
    expect(exitStatus(report, true)).toBe(1);
    expect(exitStatus({ toolchains: {}, outcomes: [{ id: "a", status: "ran", result: "fail" }] }, false)).toBe(1);
  });

  it("does not pass a requested language that ran nothing, and refuses an unknown or missing --lang", async () => {
    const root = contentRoot("kotlin", []);
    const lines: string[] = [];
    const report = await runExamples(root, { languages: ["kotlin"], log: (l) => lines.push(l) });
    expect(report).toEqual({ toolchains: { kotlin: "no examples" }, outcomes: [] });
    expect(lines).toEqual(["kotlin: no compiled or run examples found"]);
    expect(exitStatus(report, false)).toBe(0);
    expect(exitStatus(report, true)).toBe(1);
    expect(parseLanguages("typescript,csharp")).toEqual(["typescript", "csharp"]);
    expect(parseLanguages("typscript")).toEqual({ error: "--lang: unknown language typscript (expected typescript, kotlin or csharp)" });
    expect(parseLanguages("--require-all")).toMatchObject({ error: expect.stringMatching(/^--lang needs a value/) });
    expect(parseLanguages(undefined)).toMatchObject({ error: expect.stringMatching(/^--lang needs a value/) });
  });

  it("type-checks and runs TypeScript for real: a pass, a wrong output, a type error, a compile-only example", async () => {
    const root = contentRoot("typescript", [
      { id: "good", kind: "code", code: "console.log([1, 2].map((n) => n * 2));", expected: "[ 2, 4 ]", validation: ran },
      { id: "wrong", kind: "code", code: "console.log(1 + 1);", expected: "3", validation: ran },
      { id: "untyped", kind: "code", code: 'const n: number = "two";\nconsole.log(n);', expected: "two", validation: ran },
      { id: "dom", kind: "code", code: 'document.title = "x";', validation: { ...ran, status: "compiled" } },
    ]);
    const lines: string[] = [];
    const report = await runExamples(root, { languages: ["typescript"], runners: { typescript: typescriptRunner(ROOT) }, log: (l) => lines.push(l) });
    expect(report.toolchains.typescript).toMatch(/^Node \d+\.\d+\.\d+, TypeScript \d+\.\d+\.\d+$/);
    expect(report.outcomes.map((o) => [o.id, o.result])).toEqual([
      ["typescript/s--good", "pass"],
      ["typescript/s--wrong", "fail"],
      ["typescript/s--untyped", "fail"],
      ["typescript/s--dom", "pass"],
    ]);
    expect(report.outcomes[2]!.detail).toMatch(/^tsc: .*error TS2322/);
    expect(lines.some((l) => l.includes("FAIL ran      typescript/s--wrong"))).toBe(true);
  }, 60_000);

  it("reports a TypeScript toolchain that is not installed", async () => {
    expect(await typescriptRunner(tmp("no-modules-")).probe()).toEqual({ missing: "typescript is not installed in node_modules (run `npm ci`)" });
  });

  it("drives kotlinc and the kotlin runner: classpath, compile failures, run output", async () => {
    const bin = tmp("kbin-");
    const log = path.join(bin, "calls.log");
    // kotlinc: reports a version, fails on a file containing BROKEN, otherwise "compiles".
    stub(bin, "kotlinc", `echo "kotlinc $*" >> ${log}\ncase "$1" in -version) echo "info: kotlinc-jvm 9.9.9 (JRE 17.0.42+6-LTS)" >&2; exit 0;; esac\nfor a; do f="$a"; case "$a" in *.kt) src="$a";; esac; done\nif grep -q BROKEN "$src"; then echo "main.kt:1:1: error: unresolved reference" >&2; exit 1; fi\nexit 0`);
    stub(bin, "kotlin", `echo "kotlin $*" >> ${log}\necho "ran\${SECRET_TOKEN:+ LEAKED}"`);
    stub(bin, "java", `echo 'openjdk version "17.0.99"' >&2`);
    const root = contentRoot("kotlin", [
      { id: "ok", kind: "code", code: "fun main() = println(1)", expected: "ran", validation: ran },
      { id: "broken", kind: "code", code: "BROKEN", expected: "ran", validation: ran },
      { id: "lib", kind: "code", code: "class A", validation: { ...ran, status: "compiled" } },
    ]);
    const runner = kotlinRunner({ PATH: `${bin}:${SYSTEM_PATH}`, KOTLIN_CLASSPATH: "/libs/a.jar:/libs/b.jar", SECRET_TOKEN: "leak" });
    const report = await runExamples(root, { languages: ["kotlin"], runners: { kotlin: runner }, log: () => {} });
    expect(report.toolchains.kotlin).toBe("kotlinc 9.9.9, JVM 17.0.42, a, b"); // the JRE kotlinc reports, not `java` on PATH
    expect(report.outcomes.map((o) => [o.id, o.result])).toEqual([
      ["kotlin/s--ok", "pass"],
      ["kotlin/s--broken", "fail"],
      ["kotlin/s--lib", "pass"],
    ]);
    expect(report.outcomes[1]!.detail).toBe("kotlinc: main.kt:1:1: error: unresolved reference");
    const calls = fs.readFileSync(log, "utf8");
    expect(calls).toMatch(/kotlinc -cp \/libs\/a\.jar:\/libs\/b\.jar -nowarn \S+\/main\.kt -d \S+\/out/);
    expect(calls).toMatch(/kotlin -cp \S+\/out:\/libs\/a\.jar:\/libs\/b\.jar MainKt/);
    expect(calls.match(/^kotlin -cp/gm)).toHaveLength(1); // only the `ran` example that compiled is executed
  });

  it("drives dotnet: one console project per example, build failures, run output", async () => {
    const bin = tmp("dbin-");
    const log = path.join(bin, "calls.log");
    stub(bin, "dotnet", `echo "dotnet $*" >> ${log}\ncase "$1" in\n--version) echo 9.0.100;;\nbuild) if grep -q BROKEN "$2/Program.cs"; then echo "Program.cs(1,1): error CS0103"; exit 1; fi; grep -q "<TargetFramework>net9.0</TargetFramework>" "$2/Example.csproj" || exit 3; grep -q "<clear />" "$2/nuget.config" || exit 4;;\n*.dll) [ "$HOME" = "$TMPDIR" ] || echo "HOME is not the scratch folder"; echo "hello\${SECRET_TOKEN:+ LEAKED}";;\nesac`);
    const root = contentRoot("csharp", [
      { id: "ok", kind: "code", code: 'Console.WriteLine("hello");', expected: "hello", validation: ran },
      { id: "broken", kind: "code", code: "BROKEN", expected: "hello", validation: ran },
      { id: "lib", kind: "code", code: "class A {}", validation: { ...ran, status: "compiled" } },
    ]);
    const report = await runExamples(root, {
      languages: ["csharp"],
      runners: { csharp: csharpRunner({ PATH: SYSTEM_PATH, DOTNET: path.join(bin, "dotnet"), SECRET_TOKEN: "leak" }) },
      log: () => {},
    });
    expect(report.toolchains.csharp).toBe(".NET SDK 9.0.100 (net9.0)");
    expect(report.outcomes.map((o) => [o.id, o.result])).toEqual([
      ["csharp/s--ok", "pass"],
      ["csharp/s--broken", "fail"],
      ["csharp/s--lib", "pass"],
    ]);
    expect(report.outcomes[1]!.detail).toBe("dotnet build: Program.cs(1,1): error CS0103");
    const calls = fs.readFileSync(log, "utf8");
    // Every build ignores MSBuild files above its folder; the run executes the built assembly, not `dotnet run`.
    expect(calls.match(/^dotnet build .* -p:ImportDirectoryBuildProps=false -p:ImportDirectoryBuildTargets=false -p:ImportDirectoryPackagesProps=false -noAutoResponse$/gm)).toHaveLength(3);
    expect(calls).toMatch(/^dotnet \S+\/out\/Example\.dll$/m);
    expect(calls).not.toMatch(/^dotnet run/m);
  });

  it("runs a snippet without the caller's environment, in a scratch HOME", async () => {
    const root = contentRoot("typescript", [
      { id: "env", kind: "code", code: 'import { realpathSync } from "node:fs";\nconsole.log(process.env.SECRET_TOKEN ?? "none", realpathSync(process.env.HOME!) === process.cwd());', expected: "none true", validation: ran },
    ]);
    const before = process.env.SECRET_TOKEN;
    process.env.SECRET_TOKEN = "leak";
    try {
      const report = await runExamples(root, { languages: ["typescript"], runners: { typescript: typescriptRunner(ROOT) }, log: () => {} });
      expect(report.outcomes.map((o) => [o.result, o.detail])).toEqual([["pass", undefined]]);
    } finally {
      if (before === undefined) delete process.env.SECRET_TOKEN;
      else process.env.SECRET_TOKEN = before;
    }
    expect(snippetEnv({ PATH: "/bin", JAVA_HOME: "/jdk", GH_TOKEN: "t" }, "/w", ["JAVA_HOME"])).toEqual({ PATH: "/bin", HOME: "/w", TMPDIR: "/w", LANG: "C.UTF-8", JAVA_HOME: "/jdk" });
  }, 60_000);
});
