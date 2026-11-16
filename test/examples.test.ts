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
  nugetPackages,
  type Runner,
  parseLanguages,
  runExamples,
  snippetEnv,
  typescriptRunner,
} from "../scripts/run-examples.mts";
import { validation } from "../src/content/schema";
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
    expect(count("typescript", "compiled")).toBeGreaterThanOrEqual(3);
    expect(count("kotlin", "compiled")).toBeGreaterThanOrEqual(1);
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

describe("running only some sheets", () => {
  it("reads the named sheets from their files, listed in language.yaml or not, and nothing else", async () => {
    const root = contentRoot("kotlin", [{ id: "listed", kind: "code", code: "a", expected: "x", validation: ran }]);
    const draft = { id: "draft", cards: [{ id: "new", kind: "code", code: "b", expected: "x", validation: ran }] };
    fs.writeFileSync(path.join(root, "content/languages/kotlin/sheets/draft.yaml"), JSON.stringify(draft));
    expect(collectExamples(root).map((e) => e.id)).toEqual(["kotlin/s--listed"]);
    expect(collectExamples(root, ["draft", "no-such-sheet"]).map((e) => e.id)).toEqual(["kotlin/draft--new"]);
    const skipped: Runner = { probe: async () => ({ missing: "no kotlinc" }), run: async () => [] };
    const report = await runExamples(root, { languages: ["kotlin"], sheets: ["draft"], runners: { kotlin: skipped }, log: () => {} });
    expect(report.outcomes.map((o) => o.id)).toEqual(["kotlin/draft--new"]);
  });

  it("reads another content root when one is named", async () => {
    const root = contentRoot("kotlin", [{ id: "here", kind: "code", code: "a", expected: "x", validation: ran }]);
    const other = contentRoot("kotlin", [{ id: "there", kind: "code", code: "b", expected: "x", validation: ran }]);
    expect(collectExamples(root, undefined, path.join(other, "content")).map((e) => e.id)).toEqual(["kotlin/s--there"]);
    const skipped: Runner = { probe: async () => ({ missing: "no kotlinc" }), run: async () => [] };
    const report = await runExamples(root, { languages: ["kotlin"], content: path.join(other, "content"), runners: { kotlin: skipped }, log: () => {} });
    expect(report.outcomes.map((o) => o.id)).toEqual(["kotlin/s--there"]);
  });
});

describe("an example's TypeScript run options", () => {
  it("carries the JSX dialect and the run conditions from the card to the runner", () => {
    const root = contentRoot("typescript", [
      { id: "a", kind: "code", code: "x", validation: { ...ran, jsx: "react", conditions: ["browser"], resolution: "bundler" } },
      { id: "b", kind: "code", code: "y", validation: ran },
    ]);
    expect(collectExamples(root).map(({ id, jsx, conditions, resolution }) => ({ id, jsx, conditions, resolution }))).toEqual([
      { id: "typescript/s--a", jsx: "react", conditions: ["browser"], resolution: "bundler" },
      { id: "typescript/s--b", jsx: undefined, conditions: undefined, resolution: undefined },
    ]);
  });

  it("is refused by the schema where it claims more than can be proved", () => {
    const problems = (v: object) => {
      const r = validation.safeParse(v);
      return r.success ? [] : r.error.issues.map((i) => i.message);
    };
    expect(problems({ ...ran, jsx: "react", conditions: ["browser"] })).toEqual([]);
    expect(problems({ ...ran, status: "compiled", jsx: "solid" })).toEqual([]);
    expect(problems({ ...ran, jsx: "solid" })).toEqual(["Solid JSX needs Solid's own compiler: the example can be `compiled`, not `ran`"]);
    expect(problems({ status: "excerpt", host: "a browser", jsx: "react" })).toEqual(["an excerpt is not compiled: it has no JSX dialect to compile with"]);
    expect(problems({ ...ran, status: "compiled", conditions: ["browser"] })).toEqual(["only a 'ran' example has run conditions"]);
    expect(problems({ ...ran, status: "compiled", resolution: "bundler" })).toEqual([]);
    expect(problems({ status: "excerpt", host: "a browser", resolution: "bundler" })).toEqual(["an excerpt is not compiled: it has no module resolution to compile with"]);
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

  it("reports example libraries that are not installed — a skip, never a pass", async () => {
    const root = tmp("no-libs-");
    fs.mkdirSync(path.join(root, "node_modules/typescript/bin"), { recursive: true });
    fs.writeFileSync(path.join(root, "node_modules/typescript/bin/tsc"), "");
    fs.mkdirSync(path.join(root, "examples"));
    fs.writeFileSync(path.join(root, "examples/package.json"), "{}");
    expect(await typescriptRunner(root).probe()).toEqual({ missing: "the example libraries are not installed (run `npm ci --prefix examples`)" });
  });

  it("runs an example without an examples/ package in the caller's scratch folder", async () => {
    // A root with the compiler but no examples/ package: nothing is written outside the scratch folder.
    const root = tmp("bare-root-");
    fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(root, "node_modules"));
    const content = contentRoot("typescript", [{ id: "plain", kind: "code", code: "console.log(6 * 7);", expected: "42", validation: ran }]);
    const report = await runExamples(content, { languages: ["typescript"], runners: { typescript: typescriptRunner(root) }, log: () => {} });
    expect(report.outcomes.map((o) => [o.id, o.result, o.detail])).toEqual([["typescript/s--plain", "pass", undefined]]);
    expect(fs.existsSync(path.join(root, "examples"))).toBe(false);
  }, 60_000);

  it.skipIf(!fs.existsSync(path.join(ROOT, "examples/node_modules")))(
    "resolves an example's libraries from examples/, compiles JSX per dialect, and passes run conditions",
    async () => {
      const react = 'import { renderToString } from "react-dom/server";\nconst Hi = ({ name }: { name: string }) => <b>Hi {name}</b>;\nconsole.log(renderToString(<Hi name="Ada" />));';
      const solid = 'import { createSignal } from "solid-js";\nexport function Counter() {\n  const [n, setN] = createSignal(0);\n  return <button onClick={() => setN(n() + 1)}>{n()}</button>;\n}';
      const signals = 'import { createEffect, createRoot, createSignal } from "solid-js";\ncreateRoot(() => {\n  const [n, setN] = createSignal(1);\n  createEffect(() => console.log(n()));\n  queueMicrotask(() => setN(2));\n});';
      const chakra =
        'import { ChakraProvider, Text, defaultSystem } from "@chakra-ui/react";\nimport { renderToStaticMarkup } from "react-dom/server";\n' +
        'const html = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><Text>hello</Text></ChakraProvider>);\nconsole.log(html.replace(/ class="[^"]*"/g, "").replace(/<style[^]*?<\\/style>/g, ""));';
      const root = contentRoot("typescript", [
        { id: "rx", kind: "code", code: 'import { map, of } from "rxjs";\nof(1, 2).pipe(map((n) => n * 10)).subscribe((v) => console.log(v));', expected: "10\n20", validation: ran },
        { id: "react", kind: "code", code: react, expected: "<b>Hi <!-- -->Ada</b>", validation: { ...ran, jsx: "react" } },
        { id: "react-typo", kind: "code", code: react.replace('name="Ada"', "name={1}"), expected: "x", validation: { ...ran, jsx: "react" } },
        { id: "solid", kind: "code", code: solid, validation: { ...ran, status: "compiled", jsx: "solid" } },
        { id: "solid-ran", kind: "code", code: solid, expected: "x", validation: { ...ran, jsx: "solid" } },
        { id: "signals", kind: "code", code: signals, expected: "1\n2", validation: { ...ran, conditions: ["browser"] } },
        { id: "no-such-lib", kind: "code", code: 'import x from "left-pad-not-installed";\nconsole.log(x);', expected: "x", validation: ran },
        { id: "chakra", kind: "code", code: chakra, expected: "<p>hello</p>", validation: { ...ran, jsx: "react", resolution: "bundler" } },
        { id: "chakra-node-next", kind: "code", code: chakra, expected: "<p>hello</p>", validation: { ...ran, jsx: "react" } },
      ]);
      const report = await runExamples(root, { languages: ["typescript"], runners: { typescript: typescriptRunner(ROOT) }, log: () => {} });
      expect(report.outcomes.map((o) => [o.id, o.result])).toEqual([
        ["typescript/s--rx", "pass"],
        ["typescript/s--react", "pass"],
        ["typescript/s--react-typo", "fail"],
        ["typescript/s--solid", "pass"],
        ["typescript/s--solid-ran", "fail"],
        ["typescript/s--signals", "pass"],
        ["typescript/s--no-such-lib", "fail"],
        ["typescript/s--chakra", "pass"],
        ["typescript/s--chakra-node-next", "fail"], // its declarations do not resolve without bundler resolution
      ]);
      expect(report.outcomes[2]!.detail).toMatch(/^tsc: \S+\.tsx\(\d+,\d+\): error TS2322/);
      expect(report.outcomes[4]!.detail).toBe("Solid JSX needs Solid's own compiler: mark the example `compiled`, not `ran`");
      expect(report.outcomes[6]!.detail).toMatch(/error TS2307/);
      // The work folder under examples/ is removed, whatever happened in it.
      expect(fs.existsSync(path.join(ROOT, "examples/.work")) ? fs.readdirSync(path.join(ROOT, "examples/.work")) : []).toEqual([]);
    },
    120_000,
  );

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

  it("puts the fetched jars and the serialization plugin on kotlinc's command line when no classpath is named", async () => {
    const bin = tmp("kbin-");
    const log = path.join(bin, "calls.log");
    stub(bin, "kotlinc", `echo "kotlinc $*" >> ${log}\ncase "$1" in -version) echo "info: kotlinc-jvm 9.9.9 (JRE 17.0.42+6-LTS)" >&2;; esac\nexit 0`);
    stub(bin, "kotlin", `echo ran`);
    const repo = tmp("krepo-");
    fs.mkdirSync(path.join(repo, "examples/kotlin/lib"), { recursive: true });
    for (const f of ["b.jar", "a.jar", "notes.txt"]) fs.writeFileSync(path.join(repo, "examples/kotlin/lib", f), "");
    const plugin = path.join(bin, "plugin.jar");
    fs.writeFileSync(plugin, "");
    const root = contentRoot("kotlin", [{ id: "ok", kind: "code", code: "fun main() = println(1)", expected: "ran", validation: ran }]);
    const runner = kotlinRunner({ PATH: `${bin}:${SYSTEM_PATH}`, KOTLIN_SERIALIZATION_PLUGIN: plugin }, repo);
    const report = await runExamples(root, { languages: ["kotlin"], runners: { kotlin: runner }, log: () => {} });
    expect(report.toolchains.kotlin).toBe("kotlinc 9.9.9, JVM 17.0.42, a, b");
    expect(report.outcomes.map((o) => o.result)).toEqual(["pass"]);
    const lib = path.join(repo, "examples/kotlin/lib");
    expect(fs.readFileSync(log, "utf8")).toContain(`kotlinc -cp ${lib}/a.jar:${lib}/b.jar -Xplugin=${plugin} -nowarn`);
    // A distribution's own plugin is found beside the compiler: lib/ (a zip install) or libexec/lib/ (Homebrew).
    fs.mkdirSync(path.join(path.dirname(bin), "lib"), { recursive: true });
    const shipped = path.join(path.dirname(bin), "lib/kotlinx-serialization-compiler-plugin.jar");
    fs.writeFileSync(shipped, "");
    try {
      fs.rmSync(log);
      await runExamples(root, { languages: ["kotlin"], runners: { kotlin: kotlinRunner({ PATH: `${bin}:${SYSTEM_PATH}` }) }, log: () => {} });
      expect(fs.readFileSync(log, "utf8")).toContain(`-Xplugin=${fs.realpathSync(shipped)}`);
    } finally {
      fs.rmSync(shipped);
    }
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

  it("gives an example the pinned NuGet packages its code asks for, and nuget.org only then", async () => {
    const bin = tmp("dbin-");
    const seen = path.join(bin, "seen");
    fs.mkdirSync(seen);
    // Keeps each project's files so the test can read what was generated.
    stub(bin, "dotnet", `case "$1" in\n--version) echo 9.0.100;;\nbuild) d=$(mktemp -d ${seen}/XXXXXX); cp "$2/Example.csproj" "$2/nuget.config" "$2/Program.cs" "$d/";;\nesac`);
    const repo = tmp("drepo-");
    fs.mkdirSync(path.join(repo, "examples/csharp"), { recursive: true });
    const write = (packages: object[]) => fs.writeFileSync(path.join(repo, "examples/csharp/packages.json"), JSON.stringify({ packages }));
    write([{ id: "System.Reactive", version: "6.1.0", when: "using System\\.Reactive" }]);
    const root = contentRoot("csharp", [
      { id: "rx", kind: "code", code: "using System.Reactive.Linq;", validation: { ...ran, status: "compiled" } },
      { id: "plain", kind: "code", code: "class A {}", validation: { ...ran, status: "compiled" } },
    ]);
    const report = await runExamples(root, { languages: ["csharp"], runners: { csharp: csharpRunner({ PATH: SYSTEM_PATH, DOTNET: path.join(bin, "dotnet") }, repo) }, log: () => {} });
    expect(report.outcomes.map((o) => o.result)).toEqual(["pass", "pass"]);
    const projects = fs.readdirSync(seen).map((d) => ({
      code: fs.readFileSync(path.join(seen, d, "Program.cs"), "utf8"),
      csproj: fs.readFileSync(path.join(seen, d, "Example.csproj"), "utf8"),
      nuget: fs.readFileSync(path.join(seen, d, "nuget.config"), "utf8"),
    }));
    const rx = projects.find((p) => p.code.includes("Reactive"))!;
    const plain = projects.find((p) => !p.code.includes("Reactive"))!;
    expect(rx.csproj).toContain('<PackageReference Include="System.Reactive" Version="[6.1.0]" />');
    expect(rx.nuget).toContain('<clear /><add key="nuget.org" value="https://api.nuget.org/v3/index.json" protocolVersion="3" />');
    expect(plain.csproj).not.toContain("PackageReference");
    expect(plain.nuget).toContain("<packageSources><clear /></packageSources>");

    expect(nugetPackages(undefined)).toEqual([]);
    expect(nugetPackages(tmp("no-packages-"))).toEqual([]);
    write([{ id: "Evil\" />", version: "1.0.0", when: "x" }]);
    expect(() => nugetPackages(repo)).toThrow("is not a package id and an exact version");
    write([{ id: "Fine", version: "1.*", when: "x" }]);
    expect(() => nugetPackages(repo)).toThrow("is not a package id and an exact version");
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
