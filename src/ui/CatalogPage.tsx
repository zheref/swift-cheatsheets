/**
 * One language catalog as a page: sidebar, sticky top bar (search and the
 * language selector), every sheet.
 *
 * Framework-neutral React + Chakra. It receives a validated `Catalog` and the
 * registry's languages with their addresses already resolved, and knows nothing
 * about Gatsby, routing or any particular language — the Gatsby page template
 * and the offline export are thin adapters around it.
 */
import { Box, chakra, Flex, Grid, Heading, IconButton, Input, Text } from "@chakra-ui/react";
import { memo, type ReactNode, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { soleLanguage } from "../content/languages";
import type { Catalog, Highlight, Sheet, SiteLanguage } from "../content/schema";
import { buildIndex, cardKey, hitsLabel, search } from "../content/search";
import { AppliesLine, CardView, SourcesLine } from "./cards";
import { readingTopic, useActiveSection, useArrival, useThemeMode } from "./hooks";
import { AbsenceNotice, LanguageSelector } from "./languages";

const NARROW = "@media (max-width: 900px)";

const SheetSection = memo(function SheetSection({
  sheet,
  highlight,
  lang,
  visibleCards,
  hidden,
}: {
  sheet: Sheet;
  highlight: Highlight;
  lang: string;
  visibleCards: Set<string> | null;
  hidden: boolean;
}) {
  return (
    <chakra.section
      className="sheet"
      id={sheet.id}
      data-group={sheet.group}
      data-concept={sheet.concept}
      data-scope={sheet.scope}
      hidden={hidden}
      pt="16px"
      scrollMarginTop="64px"
    >
      <chakra.header className="sheethead" m="10px 0 14px" pb="8px" borderBottom="2px solid" borderColor="cs.line">
        <Heading as="h2" m={0} fontSize="21px" lineHeight="1.3" fontWeight={700} letterSpacing="-.01em" color="cs.fg">
          {sheet.title}
        </Heading>
        {sheet.subtitle ? (
          <Text m="4px 0 0" color="cs.dim" fontSize="13px">
            {sheet.subtitle}
          </Text>
        ) : null}
        <AppliesLine applies={sheet.applies} />
        <SourcesLine sources={sheet.sources} />
      </chakra.header>
      <Grid
        className="grid"
        templateColumns="repeat(auto-fill, minmax(370px, 1fr))"
        gap="12px"
        alignItems="start"
        css={{ [NARROW]: { gridTemplateColumns: "1fr" } }}
      >
        {sheet.cards.map((c) => (
          <CardView
            key={c.id}
            card={c}
            sheetId={sheet.id}
            highlight={highlight}
            lang={lang}
            hidden={visibleCards !== null && !visibleCards.has(cardKey(sheet.id, c.id))}
          />
        ))}
      </Grid>
    </chakra.section>
  );
});

function Sidebar({ catalog, active, onNavigate }: { catalog: Catalog; active: string | null; onNavigate: () => void }) {
  const items: ReactNode[] = [];
  let group: string | null = null;
  for (const s of catalog.sheets) {
    if (s.group !== group) {
      group = s.group;
      items.push(
        <Text
          as="div"
          className="navgroup"
          key={`g-${group}`}
          fontSize="10.5px"
          textTransform="uppercase"
          letterSpacing=".09em"
          color="cs.faint"
          m="14px 8px 5px"
          fontWeight={700}
        >
          {group}
        </Text>,
      );
    }
    const on = s.id === active;
    items.push(
      <chakra.a
        key={s.id}
        href={`#${s.id}`}
        data-target={s.id}
        className={on ? "active" : undefined}
        aria-current={on ? "location" : undefined}
        onClick={onNavigate}
        display="block"
        p="6px 9px"
        my="1px"
        borderRadius="7px"
        textDecoration="none"
        fontSize="13.2px"
        lineHeight="1.3"
        borderLeft="3px solid transparent"
        color="cs.dim"
        _hover={{ bg: "rgba(127,150,190,.12)", color: "cs.fg" }}
        css={{
          "&.active": {
            background: "color-mix(in srgb, var(--accent) 14%, transparent)",
            color: "var(--fg)",
            borderLeftColor: "var(--accent)",
            fontWeight: 600,
          },
          // A comfortable touch target inside the narrow-screen drawer (UX-3).
          [NARROW]: { display: "flex", alignItems: "center", minHeight: "44px" },
        }}
      >
        {s.title}
      </chakra.a>,
    );
  }
  return (
    <chakra.nav
      id="side"
      aria-label={`${catalog.language.name} sheets`}
      w="236px"
      flex="0 0 236px"
      bg="cs.bg2"
      borderRight="1px solid"
      borderColor="cs.line"
      position="sticky"
      top={0}
      h="100vh"
      overflowY="auto"
      p="14px 10px 40px"
      css={{
        WebkitOverflowScrolling: "touch",
        [NARROW]: {
          position: "fixed",
          left: 0,
          top: 0,
          zIndex: 60,
          transform: "translateX(-100%)",
          // Closed, the drawer is also invisible, so its links leave the tab order. Visibility
          // flips instantly on open (so focus can move in) and only after the slide on close.
          visibility: "hidden",
          transition: "transform .18s ease, visibility 0s linear .18s",
          boxShadow: "0 0 40px rgba(0,0,0,.5)",
        },
        "[data-nav-open] &": { [NARROW]: { transform: "none", visibility: "visible", transition: "transform .18s ease, visibility 0s" } },
        "@media (prefers-reduced-motion: reduce)": { transition: "none !important" },
      }}
    >
      <Heading as="h1" fontSize="14px" lineHeight="1.4" m="4px 8px 12px" letterSpacing=".02em" fontWeight={700} color="cs.fg">
        {catalog.language.title}
        <chakra.span display="block" fontSize="11px" color="cs.faint" fontWeight={400} mt="2px">
          {catalog.sheets.length} sheets · tap to jump
        </chakra.span>
      </Heading>
      {items}
    </chakra.nav>
  );
}

const barButton = {
  variant: "outline" as const,
  bg: "cs.bg2",
  borderColor: "cs.line",
  color: "cs.dim",
  borderRadius: "9px",
  h: "38px",
  minW: "38px",
  fontSize: "15px",
  _hover: { color: "cs.fg", bg: "cs.bg2" },
};
/** Touch-sized controls on narrow screens (UX-3). */
const narrowTarget = { height: "44px", minWidth: "44px" };

export function CatalogPage({ catalog, languages: given }: { catalog: Catalog; languages?: SiteLanguage[] }) {
  const { language, sheets } = catalog;
  const languages = useMemo(() => given ?? [soleLanguage(catalog)], [given, catalog]);
  const index = useMemo(() => buildIndex(catalog), [catalog]);
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  // A topic chosen from the absence notice: the search is cleared first, and the address
  // moves to the sheet only once it is shown again (a hidden section cannot be scrolled to).
  const [chosen, setChosen] = useState<string | null>(null);
  const result = useMemo(() => search(index, deferred), [index, deferred]);
  const [navOpen, setNavOpen] = useState(false);
  const ids = useMemo(() => sheets.map((s) => s.id), [sheets]);
  const active = useActiveSection(ids);
  const conceptAt = useCallback(() => {
    const topic = readingTopic(ids);
    return sheets.find((s) => s.id === topic)?.concept ?? null;
  }, [ids, sheets]);
  const [arrival, dismissArrival] = useArrival();
  const chooseTopic = useCallback(
    (sheet: string) => {
      setQuery("");
      dismissArrival();
      setChosen(sheet);
    },
    [dismissArrival],
  );
  // A switch whose concept this catalog DOES have (a hand-made `?concept=` link) lands on it.
  const arrivedAt = arrival ? sheets.find((s) => s.concept === arrival.concept) : undefined;
  useEffect(() => {
    if (chosen === null || deferred !== "") return;
    window.location.hash = chosen;
    setChosen(null);
  }, [chosen, deferred]);
  useEffect(() => {
    if (!arrivedAt) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}#${arrivedAt.id}`);
    document.getElementById(arrivedAt.id)?.scrollIntoView();
    dismissArrival();
  }, [arrivedAt, dismissArrival]);
  const [mode, toggleTheme] = useThemeMode();
  const input = useRef<HTMLInputElement>(null);
  const menu = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Opening the drawer moves focus into it; closing it returns focus to the menu button.
  useEffect(() => {
    if (navOpen) document.querySelector<HTMLElement>("#side a")?.focus({ preventScroll: true });
    else if (wasOpen.current) menu.current?.focus({ preventScroll: true });
    wasOpen.current = navOpen;
  }, [navOpen]);

  // The drawer only exists on narrow screens: widening the window closes it.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const wide = window.matchMedia("(min-width: 901px)");
    const onChange = () => wide.matches && setNavOpen(false);
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const q = input.current;
      if (!q) return;
      if (ev.key === "/" && document.activeElement !== q) {
        const t = ev.target as HTMLElement | null;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        ev.preventDefault();
        q.focus();
        q.select();
      }
      if (ev.key === "Escape") {
        setQuery("");
        setNavOpen(false);
        q.blur();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <Flex id="shell" minH="100vh" data-nav-open={navOpen ? "" : undefined} data-lang={language.id}>
      <Box
        id="scrim"
        aria-hidden="true"
        onClick={() => setNavOpen(false)}
        display="none"
        css={{ [NARROW]: { "[data-nav-open] &": { display: "block", position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 50 } } }}
      />
      <Sidebar catalog={catalog} active={active} onNavigate={() => setNavOpen(false)} />
      <Box as="main" id="main" flex="1" minW={0} p="0 20px 120px" inert={navOpen} css={{ [NARROW]: { padding: "0 12px 120px" } }}>
        <Flex
          id="topbar"
          position="sticky"
          top={0}
          zIndex={20}
          bg="cs.bg"
          p="12px 0 10px"
          borderBottom="1px solid"
          borderColor="cs.line"
          gap="8px"
          align="center"
        >
          <IconButton
            id="menu"
            ref={menu}
            aria-label="Show sheet navigation"
            aria-controls="side"
            aria-expanded={navOpen}
            onClick={() => setNavOpen((o) => !o)}
            display="none"
            {...barButton}
            css={{ [NARROW]: { display: "inline-flex", ...narrowTarget } }}
          >
            <span aria-hidden="true">☰</span>
          </IconButton>
          <Box role="search" flex="1" minW={0}>
            <Input
              id="q"
              ref={input}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${language.name}  (press /)`}
              aria-label={`Search all ${language.name} sheets`}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              w="100%"
              h="38px"
              bg="cs.bg2"
              borderColor="cs.line"
              color="cs.fg"
              borderRadius="9px"
              px="12px"
              fontSize="14px"
              _placeholder={{ color: "cs.faint" }}
              _focusVisible={{ borderColor: "cs.accent", outline: "2px solid var(--accent)", outlineOffset: "1px", boxShadow: "none" }}
              css={{ [NARROW]: { height: "44px" } }}
            />
          </Box>
          <LanguageSelector languages={languages} current={language.id} conceptAt={conceptAt} />
          <IconButton
            id="theme"
            aria-label={mode === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            onClick={toggleTheme}
            {...barButton}
            css={{ [NARROW]: narrowTarget }}
          >
            <span aria-hidden="true">☼</span>
          </IconButton>
        </Flex>
        {language.status === "fixture" ? (
          <Text id="fixture-note" role="note" m="12px 0 0" p="8px 12px" fontSize="13px" color="cs.fg" bg="cs.bg2" borderRadius="8px" borderLeft="3px solid var(--legacy)">
            Fixture catalog — test data that proves the page renders any language. It is not reference material.
          </Text>
        ) : null}
        {arrival && !arrivedAt ? (
          <AbsenceNotice arrival={arrival} catalog={catalog} languages={languages} onDismiss={dismissArrival} onChoose={chooseTopic} />
        ) : null}
        <Text id="hits" aria-live="polite" color="cs.faint" fontSize="12.5px" m={0} p="8px 2px 0" minH="1px">
          {deferred.trim() ? hitsLabel(result.count, deferred) : ""}
        </Text>
        {deferred.trim() && result.count === 0 ? (
          <Text id="empty" m="10px 2px 0" fontSize="13.5px" color="cs.dim">
            No {language.name} card matches. Search covers this language only — try other words, or switch language.
          </Text>
        ) : null}
        {sheets.map((s) => (
          <SheetSection
            key={s.id}
            sheet={s}
            highlight={language.highlight}
            lang={language.codeLanguage}
            visibleCards={result.visibleCards}
            hidden={result.visibleSheets !== null && !result.visibleSheets.has(s.id)}
          />
        ))}
      </Box>
    </Flex>
  );
}
