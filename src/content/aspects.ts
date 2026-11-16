/**
 * The aspects every published catalog covers (`content/aspects.yaml`): the registry, its
 * loader, and the question a test and a new catalog's author both ask — which required
 * parts does this catalog still lack? Node only, like the catalog loader beside it.
 */
import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { CatalogError } from "./load";
import { type Catalog, conceptId, scope, slug } from "./schema";

export const aspectPart = z
  .object({
    id: slug,
    /** A working title for the sheet that covers it; the stub the scaffold writes starts here. */
    title: z.string().min(1),
    /** The scope such a sheet usually has. */
    scope,
    /** A sheet with any of these concepts covers the part; the first is the canonical id. */
    concepts: z.array(conceptId).min(1),
    /** The least such a sheet answers. */
    covers: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const aspect = z
  .object({
    id: slug,
    title: z.string().min(1),
    parts: z.array(aspectPart).min(1),
  })
  .strict();

export const waiver = z
  .object({
    language: slug,
    aspect: slug,
    part: slug,
    /** Why the topic does not exist for this language or stack — a gap not yet written is not a reason. */
    reason: z.string().min(20),
  })
  .strict();

export const aspects = z
  .object({
    /** Catalogs still being brought up to the registry; a catalog listed here is not yet held to it. */
    pending: z.array(slug).optional(),
    aspects: z.array(aspect).min(1),
    waivers: z.array(waiver).optional(),
  })
  .strict();

export type AspectPart = z.infer<typeof aspectPart>;
export type Aspect = z.infer<typeof aspect>;
export type Aspects = z.infer<typeof aspects>;

/** `<contentRoot>/aspects.yaml`, validated: unique ids, one owner per concept, waivers that name real parts. */
export function loadAspects(contentRoot: string): Aspects {
  const file = path.join(contentRoot, "aspects.yaml");
  if (!fs.existsSync(file)) throw new CatalogError([`${file}: missing`]);
  let raw: unknown;
  try {
    raw = YAML.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    throw new CatalogError([`${file}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`]);
  }
  const parsed = aspects.safeParse(raw);
  if (!parsed.success) throw new CatalogError(parsed.error.issues.map((i) => `${file}: ${i.path.join(".") || "(root)"}: ${i.message}`));
  const problems: string[] = [];
  const repeated = (ids: string[]) => [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  const data = parsed.data;
  for (const id of repeated(data.aspects.map((a) => a.id))) problems.push(`${file}: duplicate aspect '${id}'`);
  // Part ids are unique across the registry: a scaffolded stub sheet is `<prefix>-<part>`.
  for (const id of repeated(data.aspects.flatMap((a) => a.parts.map((p) => p.id)))) problems.push(`${file}: duplicate part '${id}'`);
  for (const c of repeated(data.aspects.flatMap((a) => a.parts.flatMap((p) => p.concepts)))) problems.push(`${file}: concept '${c}' is claimed by more than one part`);
  for (const w of data.waivers ?? []) {
    if (!data.aspects.find((a) => a.id === w.aspect)?.parts.some((p) => p.id === w.part)) problems.push(`${file}: a waiver for '${w.language}' names '${w.aspect}/${w.part}', which is not a part`);
  }
  if (problems.length) throw new CatalogError(problems);
  return data;
}

export interface AspectGap {
  aspect: string;
  part: string;
  /** The concepts any one of which would cover it. */
  concepts: string[];
}

/** The required parts a catalog has no sheet for and no waiver against. */
export function aspectGaps(catalog: Catalog, registry: Aspects): AspectGap[] {
  const have = new Set(catalog.sheets.map((s) => s.concept));
  const waived = new Set((registry.waivers ?? []).filter((w) => w.language === catalog.language.id).map((w) => `${w.aspect}/${w.part}`));
  return registry.aspects.flatMap((a) =>
    a.parts
      .filter((p) => !p.concepts.some((c) => have.has(c)) && !waived.has(`${a.id}/${p.id}`))
      .map((p) => ({ aspect: a.id, part: p.id, concepts: p.concepts })),
  );
}

/** Whether a catalog is held to the registry yet. */
export const isPending = (registry: Aspects, languageId: string) => (registry.pending ?? []).includes(languageId);
