import { createHash } from "node:crypto";
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
