import { Box, chakra, Heading, Text } from "@chakra-ui/react";
import { memo, type ReactNode } from "react";
import type { Applicability, Card, Highlight, Source } from "../content/schema";
import { CodeBlock, InlineText } from "./text";

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
    <chakra.ul className="applies" display="flex" flexWrap="wrap" gap="4px" listStyle="none" p={0} m="6px 0 0">
      {chips.map((c) => (
        <chakra.li
          key={c.k}
          title={c.title}
          fontSize="12px"
          lineHeight="1.4"
          px="7px"
          py="1px"
          borderRadius="20px"
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
    <Text className="sources" m="6px 0 0" fontSize="12px" color="cs.faint">
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

function Expected({ text, highlight, lang }: { text?: string; highlight: Highlight; lang: string }) {
  if (!text) return null;
  return (
    <Box className="expected" mt="7px">
      <span className="collabel tone-good">Result</span>
      <CodeBlock code={text} highlight={highlight} lang={lang} />
    </Box>
  );
}

function body(card: Card, highlight: Highlight, lang: string, titleId: string): ReactNode {
  switch (card.kind) {
    case "code":
      return (
        <>
          <CodeBlock code={card.code} highlight={highlight} lang={lang} tone="neutral" />
          <Expected text={card.expected} highlight={highlight} lang={lang} />
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
          <Expected text={card.expected} highlight={highlight} lang={lang} />
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
      scrollMarginTop="64px"
      data-kind={card.kind}
      data-concept={card.concept}
      hidden={hidden}
      bg="cs.card"
      border="1px solid"
      borderColor="cs.line"
      borderRadius="11px"
      p="11px 12px 12px"
      overflow="hidden"
      gridColumn={wide ? "1 / -1" : undefined}
      minW={0}
    >
      <Heading as="h3" id={`${anchor}-title`} m="0 0 3px" fontSize="14.2px" lineHeight="1.5" fontWeight={700} color="cs.fg" letterSpacing="-.005em">
        {card.title}
      </Heading>
      {card.note ? <p className="note">{card.note}</p> : null}
      {body(card, highlight, lang, `${anchor}-title`)}
      <AppliesLine applies={card.applies} />
      <SourcesLine sources={card.sources} />
    </chakra.article>
  );
});
