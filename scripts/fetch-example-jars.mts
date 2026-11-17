/**
 * Downloads the jars the Kotlin examples import (examples/kotlin/jars.txt) from Maven Central
 * into examples/kotlin/lib/, and refuses any file whose SHA-256 differs from the pinned one.
 *
 *   node scripts/fetch-example-jars.mts
 *
 * A jar already present with the right digest is kept; nothing else is ever written.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Jar {
  group: string;
  artifact: string;
  version: string;
  sha256: string;
}

/** The pinned jars of a `jars.txt`: `group:artifact:version sha256` per line, `#` comments. */
export function parseJars(text: string): Jar[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((line) => {
      const m = /^([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+):([A-Za-z0-9_.-]+) ([0-9a-f]{64})$/.exec(line);
      if (!m) throw new Error(`jars.txt: '${line}' is not 'group:artifact:version sha256'`);
      return { group: m[1]!, artifact: m[2]!, version: m[3]!, sha256: m[4]! };
    });
}

export const jarFile = (j: Jar) => `${j.artifact}-${j.version}.jar`;
export const jarUrl = (j: Jar) => `https://repo1.maven.org/maven2/${j.group.replaceAll(".", "/")}/${j.artifact}/${j.version}/${jarFile(j)}`;
export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** One HTTP GET: `fetch` in production, a fake in the tests. */
export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

/**
 * Brings `<dir>/lib` in line with `<dir>/jars.txt`: keeps a jar whose digest is right, fetches
 * the others, and writes a download only when its digest is the pinned one. `false` when any
 * jar was refused.
 */
export async function fetchJars(dir: string, fetcher: Fetcher = fetch, log: (line: string) => void = console.log): Promise<boolean> {
  const lib = path.join(dir, "lib");
  fs.mkdirSync(lib, { recursive: true });
  let ok = true;
  for (const jar of parseJars(fs.readFileSync(path.join(dir, "jars.txt"), "utf8"))) {
    const file = path.join(lib, jarFile(jar));
    if (fs.existsSync(file) && sha256(fs.readFileSync(file)) === jar.sha256) {
      log(`kept     ${jarFile(jar)}`);
      continue;
    }
    const res = await fetcher(jarUrl(jar));
    const bytes = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    if (!bytes || sha256(bytes) !== jar.sha256) {
      log(`REFUSED  ${jarFile(jar)}: ${bytes ? `digest ${sha256(bytes)} is not the pinned one` : `HTTP ${res.status}`}`);
      ok = false;
      continue;
    }
    fs.writeFileSync(file, bytes);
    log(`fetched  ${jarFile(jar)}`);
  }
  return ok;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit((await fetchJars(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../examples/kotlin"))) ? 0 : 1);
}
