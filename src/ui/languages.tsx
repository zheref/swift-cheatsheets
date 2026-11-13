/**
 * The language selector and the absence notice (zheref/swift-cheatsheets#2).
 *
 * The selector is the Bankai disclosure selector (src/bankai/DisclosureSelector.tsx)
 * listing every registry language in order. Opening it reads the topic the reader
 * is on, so each link points at the equivalent topic, or carries the concept for
 * the target to explain its absence; a language with no catalog in this build is
 * listed as not yet published, never linked.
 */
import { Box, chakra, Heading, Text } from "@chakra-ui/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { color, colorVar, DisclosureSelector, focusRing, fontSize, media, radius, type SelectorOption, size } from "../bankai";
import { type Arrival, relatedTopics, switchLink, topicsOf } from "../content/languages";
import type { Catalog, SiteLanguage } from "../content/schema";
import { pageRadius, pageSize, textSize } from "./theme";

/** Touch-sized targets (UX-3) on narrow screens and on any coarse pointer, whatever the width. */
const TOUCH = media.touch;

const TOGGLE_ID = "lang-toggle";
const IDS = { nav: "langnav", menu: "langmenu", toggle: TOGGLE_ID, list: "langlist" };

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
  // Until the list first opens (and with scripts off) the links go to each language's top.
  const [concept, setConcept] = useState<string | null>(null);
  const self = languages.find((l) => l.id === current);
  const options = useMemo(
    () =>
      languages.map((l): SelectorOption => {
        if (l.id === current) {
          return { id: l.id, label: l.name, href: null, current: true, hint: "current language", itemProps: { "data-lang-option": l.id, "data-state": "current" } };
        }
        const link = switchLink(l, concept, current);
        if (link.href === null) {
          return { id: l.id, label: l.name, href: null, hint: "not yet published", itemProps: { "data-lang-option": l.id, "data-state": "unavailable" } };
        }
        return {
          id: l.id,
          label: l.name,
          href: link.href,
          hint: concept ? (link.match ? `same topic: ${link.match.title}` : "no equivalent topic yet") : undefined,
          itemProps: { "data-lang-option": l.id, "data-state": "available", "data-match": concept ? (link.match ? "same" : "absent") : undefined },
        };
      }),
    [languages, concept, current],
  );
  const onOpen = useCallback(() => setConcept(conceptAt()), [conceptAt]);
  return <DisclosureSelector label="Language" value={self?.name ?? current} options={options} onOpen={onOpen} ids={IDS} />;
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
  onChoose,
}: {
  arrival: Arrival;
  catalog: Catalog;
  languages: SiteLanguage[];
  onDismiss: () => void;
  /** Takes the reader to an offered topic: clears whatever hides it, then navigates. */
  onChoose: (sheet: string) => void;
}) {
  const box = useRef<HTMLElement>(null);
  // Keyed on the values, not the object: history steps that re-read the same arrival
  // (a hash change on this page) must not pull focus back up here (WCAG 2.4.3).
  useEffect(() => {
    box.current?.focus({ preventScroll: true });
  }, [arrival.from, arrival.concept]);
  // A switch never comes from the page's own language; a hand-made link claiming so reads as unknown.
  const from = languages.find((l) => l.id === arrival.from && l.id !== catalog.language.id);
  const missing = from?.topics.find((t) => t.concept === arrival.concept);
  const { name } = catalog.language;
  const offer = relatedTopics(topicsOf(catalog), arrival.concept);
  return (
    <chakra.section
      id="absence"
      ref={box}
      tabIndex={-1}
      aria-labelledby="absence-title"
      m={0}
      mt="3.5"
      py="3"
      px="3.5"
      bg="cs.bg2"
      border="1px solid"
      borderColor="cs.line"
      borderLeft={`3px solid ${colorVar.caution}`}
      borderRadius={pageRadius.notice}
      _focusVisible={{ ...focusRing.outside, outlineOffset: "2px" }}
    >
      <Heading as="h2" id="absence-title" m={0} fontSize={textSize.heading} lineHeight="1.4" fontWeight={700} color="cs.fg">
        No {name} equivalent for “{missing?.title ?? arrival.concept}”
      </Heading>
      <Text m={0} mt="1" mb="2" fontSize={textSize.prose} color="cs.dim">
        {from ? `You switched from ${from.name}, ` : "You arrived "}
        on a topic this {name} catalog does not cover yet.{" "}
        {offer.related ? `Related ${name} topics:` : `Every ${name} topic:`}
      </Text>
      <chakra.ul display="flex" flexWrap="wrap" gap="2" listStyle="none" p={0} m={0} mb="2.5">
        {offer.topics.map((t) => (
          <li key={t.sheet}>
            <chakra.a
              href={`#${t.sheet}`}
              onClick={(ev) => {
                // A search may be hiding the topic, and a hidden section cannot be scrolled to:
                // let the page clear the filter and navigate once the section is shown.
                ev.preventDefault();
                onChoose(t.sheet);
              }}
              display="inline-flex"
              alignItems="center"
              minH={pageSize.chip}
              px="2.5"
              borderRadius={radius.pill}
              border="1px solid"
              borderColor={color.edge}
              bg="cs.card"
              color="cs.fg"
              fontSize={fontSize.control}
              textDecoration="none"
              _hover={{ borderColor: color.accent }}
              _focusVisible={focusRing.outside}
              css={{ [TOUCH]: { minHeight: size.touch } }}
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
          onClick={() => {
            onDismiss();
            // The focused button goes away with the notice: hand focus to the language toggle,
            // the control that brought the reader here, rather than dropping it on <body> (WCAG 2.4.3).
            document.getElementById(TOGGLE_ID)?.focus({ preventScroll: true });
          }}
          h={pageSize.chip}
          px="2.5"
          bg="transparent"
          border="1px solid"
          borderColor={color.edge}
          borderRadius={radius.code}
          color="cs.dim"
          fontSize={fontSize.control}
          cursor="pointer"
          _hover={{ color: "cs.fg" }}
          _focusVisible={focusRing.outside}
          css={{ [TOUCH]: { height: size.touch } }}
        >
          Dismiss
        </chakra.button>
      </Box>
    </chakra.section>
  );
}
