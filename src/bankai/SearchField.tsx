/**
 * A search landmark holding one field, with the page-wide keyboard of a
 * reference: the shortcut key (`/`) focuses and selects it from anywhere but
 * another text field, and Escape clears it and lets go of focus. Filtering is
 * the consumer's; this only owns the field and its keys.
 *
 * The field's purpose stays visible while the reader types (UX-10): a search
 * icon and a short visible label sit inside the boundary, before the text, and
 * the boundary — not the bare input — carries the edge colour and the focus ring.
 */
import { Box, chakra, Input } from "@chakra-ui/react";
import { useSearchKeys } from "./behaviour";
import { SearchIcon } from "./icons";
import { color, colorVar, focusRing, fontSize, media, radius, size, space } from "./tokens";

export interface SearchFieldProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  /** The accessible name: what is searched ("Search all Kotlin sheets"). It should start with `visibleLabel` (WCAG 2.5.3). */
  label: string;
  /** The short label always shown inside the field, before the text. */
  visibleLabel?: string;
  /** What to type, and the shortcut; it goes when the reader types, the visible label stays. */
  placeholder: string;
  /** The key that focuses the field from anywhere on the page; `false` turns it off. */
  shortcut?: string | false;
}

export function SearchField({ id, value, onValueChange, label, visibleLabel = "Search", placeholder, shortcut = "/" }: SearchFieldProps) {
  const input = useSearchKeys<HTMLInputElement>(shortcut, () => onValueChange(""));

  return (
    <Box
      role="search"
      flex="1"
      minW={0}
      display="flex"
      alignItems="center"
      h={size.control}
      bg={color.surface}
      border="1px solid"
      borderColor={color.edge}
      borderRadius={radius.control}
      pl={space.inputPaddingX}
      css={{
        [media.narrow]: { height: size.touch },
        "&:has(input:focus-visible)": { borderColor: colorVar.accent, ...focusRing.outside },
      }}
    >
      <chakra.label
        htmlFor={id}
        display="inline-flex"
        alignItems="center"
        gap={space.inlineGap}
        flex="0 0 auto"
        color={color.dim}
        fontSize={fontSize.control}
        fontWeight={600}
        cursor="text"
      >
        <SearchIcon />
        {visibleLabel}
      </chakra.label>
      <Input
        id={id}
        ref={input}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        flex="1"
        minW={0}
        h="100%"
        bg="transparent"
        border={0}
        borderRadius={radius.control}
        color={color.fg}
        px={space.inlineGap}
        pr={space.inputPaddingX}
        fontSize={fontSize.input}
        _placeholder={{ color: color.faint }}
        _focusVisible={{ outline: "none", boxShadow: "none" }}
      />
    </Box>
  );
}
