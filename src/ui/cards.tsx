import { Box, chakra, Heading, Text } from "@chakra-ui/react";
import { memo, type ReactNode } from "react";
import { radius } from "../bankai";
import type { Applicability, Card, Highlight, Source, Validation } from "../content/schema";
import { CodeBlock, InlineText } from "./text";
import { pageRadius, pageSize, textSize } from "./theme";

/** Comparison, table and diagram cards take the full row; a one-column comparison does not. */
export const isWide = (card: Card) =>
  card.kind === "table" || card.kind === "diagram" || (card.kind === "compare" && card.columns.length > 1);

/** Applicability as compact chips: platforms, requirements, version ranges. */
export function AppliesLine({ applies, runtimeless }: { applies?: Applicability; runtimeless?: boolean }) {
  if (!applies) return null;
  const chips = [
    ...(applies.platforms ?? []).map((p) => ({ k: `p-${p}`, label: p, title: "platform" })),
    ...(applies.requires ?? []).map((r) => ({ k: `r-${r}`, label: r, title: "requires" })),
    ...Object.entries(applies.versions ?? {}).map(([k, v]) => ({ k: `v-${k}`, label: `${k} ${v}`, title: "version" })),
    ...(applies.runtime && !runtimeless ? [{ k: "rt", label: applies.runtime, title: "runtime" }] : []),
  ];
  if (!chips.length) return null;
  return (
    <chakra.ul className="applies" display="flex" flexWrap="wrap" gap="1" listStyle="none" p={0} m={0} mt="1.5">
      {chips.map((c) => (
        <chakra.li
          key={c.k}
          title={c.title}
          fontSize={textSize.small}
          lineHeight="1.4"
          px="1.5"
          py="0.5"
          borderRadius={radius.pill}
          border="1px solid"
          borderColor="cs.line"
          color="cs.dim"
          bg="cs.bg2"
        >
          {c.label}
        </chakra.li>
      ))}
    </chakra.ul>
  );
}

export function SourcesLine({ sources }: { sources?: Source[] }) {
  if (!sources?.length) return null;
  return (
    <Text className="sources" m={0} mt="1.5" fontSize={textSize.small} color="cs.faint">
      Sources:{" "}
      {sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && " · "}
          <chakra.a href={s.url} color="cs.dim" textDecoration="underline" textUnderlineOffset="2px" rel="noopener noreferrer">
            {s.title}
          </chakra.a>
        </span>
      ))}
    </Text>
  );
}

/** How far an example was proved, in words a reader can act on (zheref/swift-cheatsheets#3). */
export function validationLabel(v: Validation): string {
  switch (v.status) {
    case "ran":
      return `Ran with ${v.toolchain} on ${v.date}: ${v.check === "exit-code" ? "it exited 0" : "the output matched the result shown"}.`;
    case "compiled":
      return `Compiled with ${v.toolchain} on ${v.date}; not run here${v.host ? ` — running it needs ${v.host}` : ""}.`;
    case "excerpt":
      return `Excerpt, not compiled or run here: it needs ${v.host}.`;
  }
}

/**
 * An example's setup steps and validation status, under its code. The steps read as prose, so on
 * narrow screens they take the 16px body size; long inline code wraps rather than being clipped.
 */
function ExampleMeta({ card }: { card: Card }) {
  if (card.kind !== "code" && card.kind !== "compare") return null;
  const { prerequisites, validation } = card;
  if (!prerequisites && !validation) return null;
  return (
    <Box className="example" m={0} mt="2" fontSize={textSize.small} color="cs.dim" overflowWrap="anywhere">
      {prerequisites ? (
        <div className="prerequisites">
          <span className="collabel tone-neutral">Setup</span>
          <chakra.ol m={0} mt="0.5" pl="4.5" fontSize={textSize.prose}>
            {prerequisites.map((p, i) => (
              <li key={i}>
                <InlineText text={p} />
              </li>
            ))}
          </chakra.ol>
        </div>
      ) : null}
      {validation ? (
        <Text className="validation" data-status={validation.status} m={0} mt="1">
          <InlineText text={validationLabel(validation)} />
        </Text>
      ) : null}
    </Box>
  );
}

/**
 * An example's result is printed output — shown as code — unless its validation says it was
 * not checked against standard output, in which case `expected` describes an effect in words.
 */
export const describesResult = (card: Card) =>
  (card.kind === "code" || card.kind === "compare") &&
  card.validation !== undefined &&
  (card.validation.status !== "ran" || card.validation.check === "exit-code");

function Expected({ card, highlight, lang }: { card: Card; highlight: Highlight; lang: string }) {
  if ((card.kind !== "code" && card.kind !== "compare") || !card.expected) return null;
  return (
    <Box className="expected" mt="2">
      <span className="collabel tone-good">Result</span>
      {describesResult(card) ? (
        <Text className="described" m={0} mt="0.5" fontSize={textSize.prose} overflowWrap="anywhere">
          <InlineText text={card.expected} />
        </Text>
      ) : (
        <CodeBlock code={card.expected} highlight={highlight} lang={lang} />
      )}
    </Box>
  );
}

function body(card: Card, highlight: Highlight, lang: string, titleId: string): ReactNode {
  switch (card.kind) {
    case "code":
      return (
        <>
          <CodeBlock code={card.code} highlight={highlight} lang={lang} tone="neutral" />
          <Expected card={card} highlight={highlight} lang={lang} />
        </>
      );
    case "compare":
      return (
        <>
          <div className="cols">
            {card.columns.map((col, i) => (
              <div className={`col tone-${col.tone}`} key={i}>
                <span className="collabel">{col.label}</span>
                <CodeBlock code={col.code} highlight={highlight} lang={lang} />
              </div>
            ))}
          </div>
          <Expected card={card} highlight={highlight} lang={lang} />
        </>
      );
    case "rules":
      return (
        <ul className="rules">
          {card.items.map((item, i) => (
            <li className={`tone-${item.tone}`} key={i}>
              <span className="bullet" />
              <InlineText text={item.text} />
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                {card.headers.map((h, i) => (
                  <th key={i}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {card.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c}>
                      <InlineText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "diagram":
      // Repository-owned SVG, validated inert at load time (src/content/load.ts); the
      // card's heading names the image for assistive technology (ids are schema slugs).
      return (
        <div
          className="dgwrap"
          dangerouslySetInnerHTML={{ __html: card.svg.replace(/^<svg\b/, `<svg aria-labelledby="${titleId}"`) }}
        />
      );
  }
}

export const CardView = memo(function CardView({
  card,
  sheetId,
  highlight,
  lang,
  hidden,
}: {
  card: Card;
  sheetId: string;
  highlight: Highlight;
  lang: string;
  hidden: boolean;
}) {
  const wide = isWide(card);
  const anchor = `${sheetId}--${card.id}`;
  return (
    <chakra.article
      className={`card${wide ? " wide" : ""}${card.kind === "diagram" ? " diagram" : ""}`}
      id={anchor}
      scrollMarginTop={pageSize.anchorOffset}
      data-kind={card.kind}
      data-concept={card.concept}
      hidden={hidden}
      bg="cs.card"
      border="1px solid"
      borderColor="cs.line"
      borderRadius={pageRadius.card}
      p="3"
      overflow="hidden"
      gridColumn={wide ? "1 / -1" : undefined}
      minW={0}
    >
      <Heading as="h3" id={`${anchor}-title`} m={0} mb="1" fontSize={textSize.heading} lineHeight="1.5" fontWeight={700} color="cs.fg" letterSpacing="-.005em">
        {card.title}
      </Heading>
      {card.note ? <p className="note">{card.note}</p> : null}
      {body(card, highlight, lang, `${anchor}-title`)}
      <ExampleMeta card={card} />
      <AppliesLine applies={card.applies} />
      <SourcesLine sources={card.sources} />
    </chakra.article>
  );
});
