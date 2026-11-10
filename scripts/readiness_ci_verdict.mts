#!/usr/bin/env node
// RENDERED BY hatsu:tenkai from scripts/readiness_ci_verdict.mts
// Format a trusted nen pr ready JSON result for the advisory GitHub check (#131).
// This runs from .trusted, never from the pull request checkout.
import { randomBytes } from "node:crypto";
import { appendFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

type Result = { title: string; summary: string };
type Conjunct = { id: string; clause: string; order: number; status: string; reason: string | null; missing: string | null };

const SHA = /^[0-9a-f]{40}$/;
const CONJUNCTS = [
  ["mergeable", "CON-42/1"],
  ["checks-green", "CON-32(a)"],
  ["round-stalled", "CON-32(b)"],
  ["rounds-owed", "CON-32(b)"],
  ["approvals-at-head", "CON-32(b)/CON-16"],
  ["unresolved-threads", "CON-32(d)"],
] as const;

export function formatVerdict(raw: string, status: number, expectedHead: string): Result {
  if (status === 8) {
    return {
      title: "superseded",
      summary: "The pull request head moved during evaluation. This run asserts no readiness verdict.",
    };
  }
  if (status !== 0 && status !== 1) {
    return { title: "readiness undetermined", summary: `Nen exited ${status}; no readiness verdict is asserted.` };
  }

  let value: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    value = parsed as Record<string, unknown>;
  } catch {
    return { title: "readiness undetermined", summary: "Nen did not return valid JSON." };
  }
  if (value.contract !== "nen.pr.ready/v0.1" || value.judgedHead !== expectedHead || !SHA.test(expectedHead)) {
    return { title: "readiness undetermined", summary: "Nen returned a wrong contract or judged head." };
  }
  const verdict = value.verdict;
  if (verdict !== "ready" && verdict !== "not-ready" && verdict !== "unevaluated") {
    return { title: "readiness undetermined", summary: "Nen returned an unknown verdict." };
  }
  if ((status === 0) !== (verdict === "ready")) {
    return { title: "readiness undetermined", summary: "Nen's exit status and JSON verdict disagree." };
  }
  if (!Array.isArray(value.failing) || !Array.isArray(value.conjuncts)) {
    return { title: "readiness undetermined", summary: "Nen omitted the failing rows or conjuncts." };
  }
  if (value.conjuncts.length !== CONJUNCTS.length) {
    return { title: "readiness undetermined", summary: "Nen returned an incomplete conjunct table." };
  }
  const rows: Conjunct[] = [];
  for (const [index, row] of value.conjuncts.entries()) {
    const [id, clause] = CONJUNCTS[index];
    if (!row || typeof row !== "object" || row.id !== id || row.clause !== clause || row.order !== index + 1 ||
        !["ready", "failed", "unevaluated"].includes(row.status) ||
        (row.reason !== null && typeof row.reason !== "string") ||
        (row.missing !== null && typeof row.missing !== "string") ||
        (row.status === "failed" && !row.reason) ||
        (row.status === "unevaluated" && !row.missing) ||
        (row.status !== "failed" && row.reason !== null) ||
        (row.status !== "unevaluated" && row.missing !== null)) {
      return { title: "readiness undetermined", summary: "Nen returned a malformed conjunct." };
    }
    rows.push(row as Conjunct);
  }
  const failing: unknown[] = value.failing;
  const failed = rows.filter(row => row.status === "failed").map(row => row.id);
  if (failing.length !== failed.length || failing.some((id, index) => id !== failed[index])) {
    return { title: "readiness undetermined", summary: "Nen's failing list disagrees with its conjuncts." };
  }
  if (verdict === "ready" && (failing.length > 0 || rows.some(row => row.status !== "ready"))) {
    return { title: "readiness undetermined", summary: "Nen marked failing rows Ready." };
  }
  if (verdict === "not-ready" && rows.every(row => row.status === "ready")) {
    return { title: "readiness undetermined", summary: "Nen returned not-ready with every row Ready." };
  }

  const title = verdict;
  const lines = [`Verdict: ${verdict}`, `Judged head: ${expectedHead}`];
  for (const row of rows.filter(row => row.status !== "ready")) {
    const detail = row.status === "unevaluated" ? row.missing : row.reason;
    lines.push(`${row.id} (${row.clause}): ${row.status}${detail ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
  return { title, summary: lines.join("\n") };
}

function writeOutput(path: string, result: Result): void {
  let delimiter: string;
  do { delimiter = `EOF_${randomBytes(16).toString("hex")}`; }
  while (result.title.includes(delimiter) || result.summary.includes(delimiter));
  appendFileSync(path, `title<<${delimiter}\n${result.title}\n${delimiter}\nsummary<<${delimiter}\n${result.summary}\n${delimiter}\n`);
}

function main(): void {
  const { NEN, REPO, PR, RUN_ID, EVENT_HEAD, GITHUB_OUTPUT } = process.env;
  if (!NEN || !REPO || !PR || !RUN_ID || !EVENT_HEAD || !GITHUB_OUTPUT || !SHA.test(EVENT_HEAD)) {
    throw new Error("readiness CI requires NEN, REPO, PR, RUN_ID, EVENT_HEAD, and GITHUB_OUTPUT");
  }
  const args = ["pr", "ready", PR, "--gh-repo", REPO, "--json", "--gates",
    resolve(".trusted/nen/gates.json"), "--exclude-run", RUN_ID,
    "--exclude-check", "readiness", "--require-head", EVENT_HEAD];
  const run = spawnSync(NEN, args, { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, timeout: 60_000 });
  const result = run.error
    ? { title: "readiness undetermined", summary: "Nen could not be executed to a usable result." }
    : formatVerdict(run.stdout, run.status ?? -1, EVENT_HEAD);
  writeOutput(GITHUB_OUTPUT, result);
  // The title is only Nen's validated verdict vocabulary; no PR-derived text enters logs.
  process.stdout.write(`readiness: ${result.title}\n`);
}

function isEntryScript(): boolean {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(resolve(process.argv[1]))).href;
  } catch {
    // Importers can carry an unrelated, nonexistent argv[1]. Only direct
    // execution starts the CI command; the exported formatter stays usable.
    return false;
  }
}

if (isEntryScript()) main();
