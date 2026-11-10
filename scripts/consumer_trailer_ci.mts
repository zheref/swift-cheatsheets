#!/usr/bin/env node
// RENDERED BY hatsu:tenkai from scripts/consumer_trailer_ci.mts
// Trusted consumer check publisher. Tenkai places this on the consumer base;
// it runs no consumer PR code and executes only the digest-verified reader.
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const PIN = '16ff11b07b69305cf6a420972ca3d3926b44be67';
const DIGEST = 'd7cbb1dd4c6d8d5ff472b96922c5f5d3eda7fdcd69ea8e485becbfe8629e0da8';
const NAME = 'forbidden-commit-trailers';
const dataEnv = { ...process.env, GH_TOKEN: '', GITHUB_TOKEN: '' };
function required(name: string, pattern: RegExp): string {
  const value = process.env[name] ?? '';
  if (!pattern.test(value)) throw new Error(`invalid ${name}`);
  return value;
}
function execute(exe: string, args: string[]): string {
  const result = spawnSync(exe, args, { encoding: 'utf8', env: dataEnv, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0 || result.error) throw new Error(`${exe} failed while reading trusted policy or Git data`);
  return result.stdout;
}
const repo = required('GITHUB_REPOSITORY', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const head = required('HEAD_SHA', /^[0-9a-f]{40}$/);
const base = required('BASE_SHA', /^[0-9a-f]{40}$/);
const prNumber = required('PR_NUMBER', /^[1-9][0-9]*$/);
const runId = required('GITHUB_RUN_ID', /^[1-9][0-9]*$/);
const attempt = required('GITHUB_RUN_ATTEMPT', /^[1-9][0-9]*$/);
const workflow = required('GITHUB_WORKFLOW_REF', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/\.github\/workflows\/forbidden-commit-trailers\.yml@refs\/heads\/[A-Za-z0-9._/-]+$/);
if (!workflow.startsWith(`${repo}/`)) throw new Error('workflow repository does not match check repository');
const external = `${workflow}:${runId}:${attempt}`;
const details = `https://github.com/${repo}/actions/runs/${runId}/attempts/${attempt}`;
function api(method: string, endpoint: string, body: unknown): Record<string, any> {
  const result = spawnSync('gh', ['api', '--hostname', 'github.com', '--method', method, endpoint, '--input', '-'], {
    encoding: 'utf8', input: JSON.stringify(body), maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.error) throw new Error('GitHub check publication failed');
  return JSON.parse(result.stdout);
}
function identity(check: Record<string, any>, id?: number): number {
  // GitHub does not persist the details_url a GitHub Actions token requests on a check run: the
  // response carries the check's own page, https://github.com/<repo>/runs/<check id>, instead,
  // while name, head_sha, app.slug and external_id come back exactly as sent (observed live on a
  // consumer, 2026-11-04). Accept the requested run URL or exactly that rewrite; the producer,
  // workflow run and attempt stay bound by external_id, and the id was validated just before.
  if (!Number.isSafeInteger(check.id) || check.id <= 0 || (id !== undefined && check.id !== id) ||
      check.name !== NAME || check.head_sha !== head || check.app?.slug !== 'github-actions' ||
      check.external_id !== external ||
      (check.details_url !== details && check.details_url !== `https://github.com/${repo}/runs/${check.id}`)) {
    throw new Error('GitHub check response does not identify this producer, workflow run and exact PR head');
  }
  return check.id;
}
let checkId: number | undefined;
let temporary: string | undefined;
let passed = false;
let offending: string[] = [];
try {
  const created = api('POST', `repos/${repo}/check-runs`, {
    name: NAME, head_sha: head, status: 'in_progress', external_id: external, details_url: details,
  });
  // Bind the id GitHub created before verifying the response, so a refused
  // identity still completes this run's check instead of leaving it in progress.
  if (Number.isSafeInteger(created.id) && created.id > 0) checkId = created.id;
  identity(created);
  const root = resolve(process.argv[2] ?? '.');
  if (execute('git', ['-C', join(root, '.base'), 'rev-parse', 'HEAD']).trim() !== base) throw new Error('checkout differs from event base');
  temporary = mkdtempSync(join(tmpdir(), 'hatsu-consumer-trailers-'));
  const pr = join(temporary, 'pr.git');
  execute('git', ['init', '--bare', pr]);
  const token = process.env.GH_TOKEN;
  if (!token) throw new Error('check token is absent');
  // Fetch only Git objects from the fixed base repository's numeric PR ref.
  // No checkout, dependency install or PR code execution occurs. The ephemeral
  // auth header belongs to this one Git process and is never stored in config.
  const fetch = spawnSync('git', ['-C', pr, 'fetch', '--no-tags', `https://github.com/${repo}.git`, `refs/pull/${prNumber}/head:refs/heads/pr`], {
    encoding: 'utf8', maxBuffer: 1024 * 1024,
    env: { ...dataEnv, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
      GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`,
      GIT_CONFIG_KEY_1: 'credential.helper', GIT_CONFIG_VALUE_1: '' },
  });
  if (fetch.status !== 0 || fetch.error) throw new Error('PR Git-object fetch failed');
  execute('git', ['-C', pr, 'symbolic-ref', 'HEAD', 'refs/heads/pr']);
  if (execute('git', ['-C', pr, 'rev-parse', 'HEAD']).trim() !== head) throw new Error('fetched PR ref differs from event head');
  const policy = join(temporary, 'policy.json');
  const helper = join(temporary, 'reader.sh');
  writeFileSync(policy, execute('git', ['-C', join(root, '.base'), 'show', 'HEAD:nen/workflow.json']));
  execute('git', ['-C', pr, 'fetch', '--no-tags', join(root, '.base'), base]);
  execute('curl', ['--fail', '--silent', '--show-error', '--location', '--proto', '=https', '--tlsv1.2',
    `https://raw.githubusercontent.com/zheref/hatsu/${PIN}/scripts/branch_authorship_check.sh`, '-o', helper]);
  if (createHash('sha256').update(readFileSync(helper)).digest('hex') !== DIGEST) throw new Error('published reader digest mismatch');
  const result = spawnSync('sh', [helper, '--forbidden-only', '--forbid-trailers-from', policy, '--repo', pr, '--base', base], {
    encoding: 'utf8', env: dataEnv, maxBuffer: 8 * 1024 * 1024,
  });
  const fence = randomBytes(16).toString('hex');
  process.stdout.write(`::stop-commands::${fence}\n${result.stdout ?? ''}${result.stderr ?? ''}\n::${fence}::\n`);
  // Only the short SHAs that lead each reader finding reach the check; commit text stays in the log.
  offending = [...(result.stdout ?? '').matchAll(/^([0-9a-f]{7,40})  author=/gm)].map(match => match[1]);
  passed = result.status === 0 && !result.error;
} catch (error) {
  console.error(`consumer-trailer-ci: ${(error as Error).message}`);
} finally {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
  if (checkId !== undefined) {
    try {
      const conclusion = passed ? 'success' : 'failure';
      const response = api('PATCH', `repos/${repo}/check-runs/${checkId}`, {
        status: 'completed', conclusion, completed_at: new Date().toISOString(),
        output: { title: NAME, summary: passed ? 'Every PR commit passes the base trailer policy.' : `Trailer policy or trusted check execution failed; see ${details}`,
          ...(!passed && offending.length > 0 ? { text: `Commits failing the base trailer policy: ${offending.join(', ')}` } : {}) },
      });
      identity(response, checkId);
      if (response.status !== 'completed' || response.conclusion !== conclusion) throw new Error('GitHub did not persist the intended check conclusion');
    } catch (error) { passed = false; console.error(`consumer-trailer-ci: ${(error as Error).message}`); }
  }
}
process.exitCode = passed ? 0 : 1;
