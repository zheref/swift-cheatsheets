/**
 * One language catalog as a page: sidebar, sticky top bar (search and the
 * language selector), every sheet.
 *
 * Framework-neutral React + Chakra. It receives a validated `Catalog` and the
 * registry's languages with their addresses already resolved, and knows nothing
 * about Gatsby, routing or any particular language — the Gatsby page template
 * and the offline export are thin adapters around it. The layout, the topic
 * rail, the search field, the selector and the theme toggle are the Bankai
 * primitives (src/bankai/); this page composes them around one catalog.
 */
import { chakra, Grid, Heading, Text } from "@chakra-ui/react";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { AppShell, colorVar, media, radius, SearchField, ThemeToggle, TopicNav } from "../bankai";
import { soleLanguage } from "../content/languages";
import type { Catalog, Highlight, Sheet, SiteLanguage } from "../content/schema";
import { buildIndex, cardKey, hitsLabel, search } from "../content/search";
import { AppliesLine, CardView, SourcesLine } from "./cards";
import { readingTopic, useActiveSection, useArrival, useThemeMode } from "./hooks";
import { AbsenceNotice, LanguageSelector } from "./languages";
import { pageSize, textSize } from "./theme";

const NARROW = media.narrow;

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
      pt="4"
      scrollMarginTop={pageSize.anchorOffset}
    >
      <chakra.header className="sheethead" mt="2.5" mb="3.5" pb="2" borderBottom="2px solid" borderColor="cs.line">
        <Heading as="h2" m={0} fontSize={textSize.sheetTitle} lineHeight="1.3" fontWeight={700} letterSpacing="-.01em" color="cs.fg">
          {sheet.title}
        </Heading>
        {sheet.subtitle ? (
          <Text m={0} mt="1" color="cs.dim" fontSize={textSize.prose}>
            {sheet.subtitle}
          </Text>
        ) : null}
        <AppliesLine applies={sheet.applies} />
        <SourcesLine sources={sheet.sources} />
      </chakra.header>
      <Grid
        className="grid"
        templateColumns={`repeat(auto-fill, minmax(${pageSize.cardMin}, 1fr))`}
        gap="3"
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
  const items = useMemo(() => catalog.sheets.map((s) => ({ id: s.id, label: s.title, href: `#${s.id}`, group: s.group })), [catalog]);
  return (
    <TopicNav
      title={catalog.language.title}
      meta={<>{catalog.sheets.length} sheets · tap to jump</>}
      titleAs="h1"
      items={items}
      active={active}
      onNavigate={onNavigate}
    />
  );
}

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
  const closeNav = useCallback(() => setNavOpen(false), []);

  return (
    <AppShell
      open={navOpen}
      onOpenChange={setNavOpen}
      navLabel={`${language.name} sheets`}
      menuLabel="Show sheet navigation"
      rootProps={{ "data-lang": language.id }}
      nav={<Sidebar catalog={catalog} active={active} onNavigate={closeNav} />}
      bar={
        <>
          <SearchField
            id="q"
            value={query}
            onValueChange={setQuery}
            placeholder={`${language.name} sheets  (press /)`}
            label={`Search all ${language.name} sheets`}
          />
          <LanguageSelector languages={languages} current={language.id} conceptAt={conceptAt} />
          <ThemeToggle id="theme" scheme={mode} onToggle={toggleTheme} />
        </>
      }
    >
      {language.status === "fixture" ? (
        <Text id="fixture-note" role="note" m={0} mt="3" py="2" px="3" fontSize={textSize.prose} color="cs.fg" bg="cs.bg2" borderRadius={radius.code} borderLeft={`3px solid ${colorVar.caution}`}>
          Fixture catalog — test data that proves the page renders any language. It is not reference material.
        </Text>
      ) : null}
      {arrival && !arrivedAt ? (
        <AbsenceNotice arrival={arrival} catalog={catalog} languages={languages} onDismiss={dismissArrival} onChoose={chooseTopic} />
      ) : null}
      <Text id="hits" aria-live="polite" color="cs.faint" fontSize={textSize.small} m={0} pt="2" px="0.5" minH={pageSize.statusLine}>
        {deferred.trim() ? hitsLabel(result.count, deferred) : ""}
      </Text>
      {deferred.trim() && result.count === 0 ? (
        <Text id="empty" m={0} mt="2.5" mx="0.5" fontSize={textSize.prose} color="cs.dim">
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
    </AppShell>
  );
}
