/**
 * A selector that is a disclosure of plain links: `<details>`/`<summary>` inside
 * a labelled navigation landmark, so it opens from the keyboard and works with
 * scripts off. One option is current, the others are links, and an option with
 * no address is listed but not linked, its hint saying why.
 *
 * Links rather than a `<select>` that navigates on change, so arrowing through
 * the options never leaves the page (WCAG 3.2.2). It knows nothing about what
 * is being selected — a language, a version, a platform — or how addresses are
 * routed: the consumer resolves every `href`, and can recompute them when the
 * list opens (`onOpen`).
 */
import { chakra, VisuallyHidden } from "@chakra-ui/react";
import { type LiHTMLAttributes, memo, type ReactNode, useId } from "react";
import { useDisclosure } from "./behaviour";
import { color, focusRing, fontSize, layer, lineHeight, media, overlay, radius, size, space } from "./tokens";

export interface SelectorOption {
  id: string;
  label: ReactNode;
  /** `null`: listed, not linkable (the hint should say why). Ignored for the current option. */
  href: string | null;
  current?: boolean;
  /** One line under the label: "current language", "not yet published", "same topic: …". */
  hint?: string;
  /** Spread on the option's `<li>` as given: the consumer's own hooks (`data-*`). */
  itemProps?: LiHTMLAttributes<HTMLLIElement> & Record<`data-${string}`, string | undefined>;
}

export interface SelectorIds {
  nav: string;
  menu: string;
  toggle: string;
  list: string;
}

export interface DisclosureSelectorProps {
  /** Names the landmark, and prefixes the toggle's accessible name ("Language: Swift"). */
  label: string;
  /** The toggle's visible text: the current option's name. */
  value: ReactNode;
  options: readonly SelectorOption[];
  /** Called as the list opens, before it shows: the moment to recompute addresses. */
  onOpen?: () => void;
  /** Element ids; generated when omitted. */
  ids?: Partial<SelectorIds>;
}

const optionStyle = {
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "center",
  gap: space.optionLineGap,
  minHeight: size.option,
  padding: space.optionPadding,
  borderRadius: radius.option,
  fontSize: fontSize.control,
  lineHeight: lineHeight.control,
  textDecoration: "none",
  [media.touch]: { minHeight: size.touch },
};

const Hint = ({ children }: { children: string }) => (
  <chakra.span className="hint" display="block" fontSize={fontSize.hint} color={color.faint} fontWeight={400}>
    {children}
  </chakra.span>
);

function Option({ option }: { option: SelectorOption }) {
  const { label, href, current, hint, itemProps } = option;
  if (current) {
    return (
      <li {...itemProps}>
        <chakra.span aria-current="true" css={optionStyle} color={color.fg} fontWeight={700}>
          <span>
            <span aria-hidden="true">✓ </span>
            {label}
          </span>
          {hint ? <Hint>{hint}</Hint> : null}
        </chakra.span>
      </li>
    );
  }
  if (href === null) {
    return (
      <li {...itemProps}>
        {/* No link to follow, and the hint says why; `aria-disabled` is not allowed on a generic span (ARIA 1.2). */}
        <chakra.span css={optionStyle} color={color.faint}>
          <span>{label}</span>
          {hint ? <Hint>{hint}</Hint> : null}
        </chakra.span>
      </li>
    );
  }
  return (
    <li {...itemProps}>
      <chakra.a
        href={href}
        css={optionStyle}
        color={color.dim}
        _hover={{ bg: overlay.hover, color: color.fg }}
        _focusVisible={focusRing.inside}
      >
        <chakra.span color={color.fg} fontWeight={600}>
          {label}
        </chakra.span>
        {hint ? <Hint>{hint}</Hint> : null}
      </chakra.a>
    </li>
  );
}

export const DisclosureSelector = memo(function DisclosureSelector({ label, value, options, onOpen, ids: given }: DisclosureSelectorProps) {
  const auto = useId();
  const ids: SelectorIds = {
    nav: given?.nav ?? `${auto}nav`,
    menu: given?.menu ?? `${auto}menu`,
    toggle: given?.toggle ?? `${auto}toggle`,
    list: given?.list ?? `${auto}list`,
  };
  // Outside presses and focus close the list; Escape closes it back onto the toggle and goes no
  // further, so a page-level Escape (clearing a search) does not also fire.
  const { open, setOpen, root, toggle: summary, onKeyDown } = useDisclosure<HTMLDetailsElement, HTMLElement>();

  return (
    <chakra.nav id={ids.nav} aria-label={label} flex="0 0 auto">
      <chakra.details
        id={ids.menu}
        ref={root}
        open={open}
        onToggle={(ev) => {
          const opened = ev.currentTarget.open;
          if (opened) onOpen?.();
          setOpen(opened);
        }}
        onKeyDown={onKeyDown}
        position="relative"
      >
        <chakra.summary
          id={ids.toggle}
          ref={summary}
          display="flex"
          alignItems="center"
          gap={space.inlineGap}
          h={size.control}
          px={space.togglePaddingX}
          bg={color.surface}
          border="1px solid"
          borderColor={color.line}
          borderRadius={radius.control}
          color={color.fg}
          fontSize={fontSize.control}
          fontWeight={600}
          cursor="pointer"
          whiteSpace="nowrap"
          userSelect="none"
          listStyle="none"
          _focusVisible={focusRing.outside}
          css={{ "&::-webkit-details-marker": { display: "none" }, [media.touch]: { height: size.touch } }}
        >
          <VisuallyHidden>{`${label}: `}</VisuallyHidden>
          {/* A long value is clipped on narrow screens so the bar keeps its width; the full value stays in the accessible name. */}
          <chakra.span overflow="hidden" textOverflow="ellipsis" css={{ [media.narrow]: { maxWidth: size.clipNarrow } }}>
            {value}
          </chakra.span>
          <chakra.span aria-hidden="true" fontSize={fontSize.hint} color={color.dim}>
            ▾
          </chakra.span>
        </chakra.summary>
        <chakra.ul
          id={ids.list}
          listStyle="none"
          m={0}
          p={space.menuPadding}
          position="absolute"
          right={0}
          top={`calc(100% + ${space.menuOffset})`}
          zIndex={layer.menu}
          minW={size.menuMin}
          maxW={`calc(100vw - ${size.menuViewportMargin})`}
          bg={color.card}
          border="1px solid"
          borderColor={color.line}
          borderRadius={radius.menu}
          boxShadow={overlay.menuShadow}
        >
          {options.map((o) => (
            <Option key={o.id} option={o} />
          ))}
        </chakra.ul>
      </chakra.details>
    </chakra.nav>
  );
});
