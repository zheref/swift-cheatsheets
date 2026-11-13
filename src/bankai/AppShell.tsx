/**
 * The reference layout: a navigation rail beside a main column whose top bar
 * stays put. On narrow screens the rail becomes a drawer behind a menu button.
 *
 * The shell owns the drawer's behaviour and nothing else: opening moves focus
 * into it, closing returns focus to the menu button, Escape and the scrim close
 * it, widening the window past the breakpoint closes it, and while it is open
 * the main column is inert and its closed links leave the tab order. What the
 * rail lists, what the bar holds and what the page says are the consumer's.
 */
import { Box, chakra, Flex, IconButton } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useDrawer } from "./behaviour";
import { barButton, touchTarget } from "./controls";
import { MenuIcon } from "./icons";
import { color, layer, media, motion, overlay, size, space, wideQuery } from "./tokens";

export interface AppShellIds {
  shell: string;
  scrim: string;
  nav: string;
  main: string;
  topbar: string;
  menu: string;
}

const DEFAULT_IDS: AppShellIds = { shell: "shell", scrim: "scrim", nav: "side", main: "main", topbar: "topbar", menu: "menu" };

export interface AppShellProps {
  /** The rail's content, typically a `TopicNav`. */
  nav: ReactNode;
  /** Names the rail's navigation landmark. */
  navLabel: string;
  /** Names the menu button that shows the rail on narrow screens. */
  menuLabel: string;
  /** The top bar's controls, after the menu button: a search, a selector, a theme toggle. */
  bar: ReactNode;
  children: ReactNode;
  /** Whether the narrow-screen drawer is open; the shell asks to change it, the consumer decides. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ids?: Partial<AppShellIds>;
  /** Spread on the outermost element after the shell's own attributes: the consumer's hooks (`data-*`). */
  rootProps?: Record<`data-${string}`, string | undefined>;
}

export function AppShell({ nav, navLabel, menuLabel, bar, children, open, onOpenChange, ids: given, rootProps }: AppShellProps) {
  const ids = { ...DEFAULT_IDS, ...given };
  const { panel: rail, trigger: menu } = useDrawer<HTMLElement, HTMLButtonElement>(open, onOpenChange, wideQuery);

  return (
    <Flex id={ids.shell} minH="100vh" data-nav-open={open ? "" : undefined} {...rootProps}>
      <Box
        id={ids.scrim}
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
        display="none"
        css={{ [media.narrow]: { "[data-nav-open] &": { display: "block", position: "fixed", inset: 0, background: overlay.scrim, zIndex: layer.scrim } } }}
      />
      <chakra.nav
        id={ids.nav}
        ref={rail}
        aria-label={navLabel}
        w={size.rail}
        flex={`0 0 ${size.rail}`}
        bg={color.surface}
        borderRight="1px solid"
        borderColor={color.line}
        position="sticky"
        top={0}
        h="100vh"
        overflowY="auto"
        p={space.railPadding}
        css={{
          WebkitOverflowScrolling: "touch",
          [media.narrow]: {
            position: "fixed",
            left: 0,
            top: 0,
            zIndex: layer.drawer,
            transform: "translateX(-100%)",
            // Closed, the drawer is also invisible, so its links leave the tab order. Visibility
            // flips instantly on open (so focus can move in) and only after the slide on close.
            visibility: "hidden",
            transition: `transform ${motion.drawer}, visibility 0s linear ${motion.drawerDuration}`,
            boxShadow: overlay.drawerShadow,
          },
          "[data-nav-open] &": { [media.narrow]: { transform: "none", visibility: "visible", transition: `transform ${motion.drawer}, visibility 0s` } },
          [media.reducedMotion]: { transition: "none !important" },
        }}
      >
        {nav}
      </chakra.nav>
      <Box as="main" id={ids.main} flex="1" minW={0} p={space.mainPadding} inert={open} css={{ [media.narrow]: { padding: space.mainPaddingNarrow } }}>
        <Flex
          id={ids.topbar}
          position="sticky"
          top={0}
          zIndex={layer.topbar}
          bg={color.bg}
          p={space.barPadding}
          borderBottom="1px solid"
          borderColor={color.line}
          gap={space.barGap}
          align="center"
          // A narrow bar wraps: the consumer's search can take a full-width row of its own (SearchField).
          css={{ [media.narrow]: { flexWrap: "wrap" } }}
        >
          <IconButton
            id={ids.menu}
            ref={menu}
            aria-label={menuLabel}
            aria-controls={ids.nav}
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
            display="none"
            {...barButton}
            // On the narrow layout the menu leads the bar's first row and pushes the other controls to its end.
            css={{ [media.narrow]: { display: "inline-flex", marginInlineEnd: "auto" }, [media.touch]: touchTarget }}
          >
            <MenuIcon />
          </IconButton>
          {bar}
        </Flex>
        {children}
      </Box>
    </Flex>
  );
}
