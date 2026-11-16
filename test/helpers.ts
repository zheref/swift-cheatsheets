import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadCatalog } from "../src/content/load";

export const ROOT = path.resolve(__dirname, "..");
export const SWIFT_DIR = path.join(ROOT, "content/languages/swift");
export const FIXTURE_ROOT = path.join(ROOT, "test/fixtures/content");
export const FIXTURE_DIR = path.join(FIXTURE_ROOT, "languages/kotlin-fixture");

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

let swift: ReturnType<typeof loadCatalog> | undefined;
/** The real Swift catalog, loaded once per test file. */
export const swiftCatalog = () => (swift ??= loadCatalog(SWIFT_DIR));

let legacy: ReturnType<typeof loadCatalog> | undefined;
/**
 * The Swift catalog cut down to the 29 sheets the pre-migration page had. The catalog grows by
 * appending sheets, so anything compared with a legacy fixture is compared on this slice.
 */
export const legacySwiftCatalog = () => {
  if (legacy) return legacy;
  const { anchors } = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/legacy-inventory.json"), "utf8")) as { anchors: string[] };
  const all = swiftCatalog();
  return (legacy = { ...all, sheets: all.sheets.filter((s) => anchors.includes(s.id)) });
};
