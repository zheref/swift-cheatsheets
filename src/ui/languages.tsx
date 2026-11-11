/**
 * The language selector and the absence notice (zheref/swift-cheatsheets#2).
 *
 * The selector is a disclosure of plain links — `<details>`/`<summary>`, so it
 * opens from the keyboard and works with scripts off — listing every registry
 * language in order. Opening it reads the topic the reader is on, so each link
 * points at the equivalent topic, or carries the concept for the target to
 * explain its absence; a language with no catalog in this build is listed as not
 * yet published, never linked. Links rather than
 * a `<select>` that navigates on change, so arrowing through the options never
 * leaves the page (WCAG 3.2.2).
 */
import { Box, chakra, Heading, Text, VisuallyHidden } from "@chakra-ui/react";
import { type KeyboardEvent, memo, useEffect, useRef, useState } from "react";
import { type Arrival, relatedTopics, switchLink, topicsOf } from "../content/languages";
import type { Catalog, SiteLanguage } from "../content/schema";

const NARROW = "@media (max-width: 900px)";

const optionStyle = {
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "center",
  gap: "1px",
  minHeight: "40px",
  padding: "6px 10px",
  borderRadius: "7px",
  fontSize: "13.5px",
  lineHeight: 1.3,
  textDecoration: "none",
  [NARROW]: { minHeight: "44px" },
};

const Hint = ({ children }: { children: string }) => (
  <chakra.span className="hint" display="block" fontSize="11.5px" color="cs.faint" fontWeight={400}>
    {children}
  </chakra.span>
);

export const LanguageSelector = memo(function LanguageSelector({
  languages,
  current,
  conceptAt,
}: {
  languages: SiteLanguage[];
  current: string;
  /** Reads the concept the reader is on, or `null` at the top of the page. */
  conceptAt: () => string | null;
}) {
  const [open, setOpen] = useState(false);
  // Until the list first opens (and with scripts off) the links go to each language's top.
  const [concept, setConcept] = useState<string | null>(null);
  const root = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const self = languages.find((l) => l.id === current);

  // A pointer press or focus outside closes the list, as any disclosure menu does.
  useEffect(() => {
    if (!open) return;
    const outside = (ev: Event) => {
      if (!root.current?.contains(ev.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);

  // Escape closes the open list and returns focus to its toggle — without also
  // clearing the search, which the page's own Escape handler would do.
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key !== "Escape" || !open) return;
    ev.stopPropagation();
    setOpen(false);
    summary.current?.focus();
  };

  return (
    <chakra.nav id="langnav" aria-label="Language" flex="0 0 auto">
      <chakra.details
        id="lang"
        ref={root}
        open={open}
        onToggle={(ev) => {
          const opened = ev.currentTarget.open;
          if (opened) setConcept(conceptAt());
          setOpen(opened);
        }}
        onKeyDown={onKeyDown}
        position="relative"
      >
        <chakra.summary
          id="lang-toggle"
          ref={summary}
          display="flex"
          alignItems="center"
          gap="6px"
          h="38px"
          px="11px"
          bg="cs.bg2"
          border="1px solid"
          borderColor="cs.line"
          borderRadius="9px"
          color="cs.fg"
          fontSize="13.5px"
          fontWeight={600}
          cursor="pointer"
          whiteSpace="nowrap"
          userSelect="none"
          listStyle="none"
          _focusVisible={{ outline: "2px solid var(--accent)", outlineOffset: "1px" }}
          css={{ "&::-webkit-details-marker": { display: "none" }, [NARROW]: { height: "44px" } }}
        >
          <VisuallyHidden>Language: </VisuallyHidden>
          {self?.name ?? current}
          <chakra.span aria-hidden="true" fontSize="12px" color="cs.dim">
            ▾
          </chakra.span>
        </chakra.summary>
        <chakra.ul
          id="langlist"
          listStyle="none"
          m={0}
          p="5px"
          position="absolute"
          right={0}
          top="calc(100% + 6px)"
          zIndex={30}
          minW="240px"
          maxW="calc(100vw - 24px)"
          bg="cs.card"
          border="1px solid"
          borderColor="cs.line"
          borderRadius="10px"
          boxShadow="0 10px 30px rgba(0,0,0,.35)"
        >
          {languages.map((l) => {
            const link = switchLink(l, concept, current);
            if (l.id === current) {
              return (
                <li key={l.id} data-lang-option={l.id} data-state="current">
                  <chakra.span aria-current="true" css={optionStyle} color="cs.fg" fontWeight={700}>
                    <span>
                      <span aria-hidden="true">✓ </span>
                      {l.name}
                    </span>
                    <Hint>current language</Hint>
                  </chakra.span>
                </li>
              );
            }
            if (link.href === null) {
              return (
                <li key={l.id} data-lang-option={l.id} data-state="unavailable">
                  <chakra.span aria-disabled="true" css={optionStyle} color="cs.faint">
                    <span>{l.name}</span>
                    <Hint>not yet published</Hint>
                  </chakra.span>
                </li>
              );
            }
            return (
              <li key={l.id} data-lang-option={l.id} data-state="available" data-match={concept ? (link.match ? "same" : "absent") : undefined}>
                <chakra.a
                  href={link.href}
                  css={optionStyle}
                  color="cs.dim"
                  _hover={{ bg: "rgba(127,150,190,.12)", color: "cs.fg" }}
                  _focusVisible={{ outline: "2px solid var(--accent)", outlineOffset: "-2px" }}
                >
                  <chakra.span color="cs.fg" fontWeight={600}>
                    {l.name}
                  </chakra.span>
                  {concept ? <Hint>{link.match ? `same topic: ${link.match.title}` : "no equivalent topic yet"}</Hint> : null}
                </chakra.a>
              </li>
            );
          })}
        </chakra.ul>
      </chakra.details>
    </chakra.nav>
  );
});

/**
 * Shown on a page reached by switching from a topic this language does not
 * have: names the missing topic and the language it came from, and offers the
 * related topics here (or every topic, when none is related). Focus moves to it
 * when it appears, so a screen-reader user hears why they landed at the top.
 */
export function AbsenceNotice({
  arrival,
  catalog,
  languages,
  onDismiss,
}: {
  arrival: Arrival;
  catalog: Catalog;
  languages: SiteLanguage[];
  onDismiss: () => void;
}) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, [arrival]);
  const from = languages.find((l) => l.id === arrival.from);
  const missing = from?.topics.find((t) => t.concept === arrival.concept);
  const { name } = catalog.language;
  const offer = relatedTopics(topicsOf(catalog), arrival.concept);
  return (
    <chakra.section
      id="absence"
      ref={box}
      tabIndex={-1}
      aria-labelledby="absence-title"
      m="14px 0 0"
      p="12px 14px"
      bg="cs.bg2"
      border="1px solid"
      borderColor="cs.line"
      borderLeft="3px solid var(--legacy)"
      borderRadius="10px"
      _focusVisible={{ outline: "2px solid var(--accent)", outlineOffset: "2px" }}
    >
      <Heading as="h2" id="absence-title" m={0} fontSize="15px" lineHeight="1.4" fontWeight={700} color="cs.fg">
        No {name} equivalent for “{missing?.title ?? arrival.concept}”
      </Heading>
      <Text m="4px 0 8px" fontSize="13px" color="cs.dim">
        {from ? `You switched from ${from.name}, ` : "You arrived "}
        on a topic ({arrival.concept}) this {name} catalog does not cover yet.{" "}
        {offer.related ? `Related ${name} topics:` : `Every ${name} topic:`}
      </Text>
      <chakra.ul display="flex" flexWrap="wrap" gap="6px" listStyle="none" p={0} m="0 0 10px">
        {offer.topics.map((t) => (
          <li key={t.sheet}>
            <chakra.a
              href={`#${t.sheet}`}
              onClick={onDismiss}
              display="inline-flex"
              alignItems="center"
              minH="32px"
              px="10px"
              borderRadius="20px"
              border="1px solid"
              borderColor="cs.line"
              bg="cs.card"
              color="cs.fg"
              fontSize="13px"
              textDecoration="none"
              _hover={{ borderColor: "cs.accent" }}
              css={{ [NARROW]: { minHeight: "44px" } }}
            >
              {t.title}
            </chakra.a>
          </li>
        ))}
      </chakra.ul>
      <Box>
        <chakra.button
          type="button"
          id="absence-dismiss"
          onClick={onDismiss}
          h="32px"
          px="10px"
          bg="transparent"
          border="1px solid"
          borderColor="cs.line"
          borderRadius="8px"
          color="cs.dim"
          fontSize="12.5px"
          cursor="pointer"
          _hover={{ color: "cs.fg" }}
          _focusVisible={{ outline: "2px solid var(--accent)", outlineOffset: "1px" }}
          css={{ [NARROW]: { height: "44px" } }}
        >
          Dismiss
        </chakra.button>
      </Box>
    </chakra.section>
  );
}
