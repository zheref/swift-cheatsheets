/**
 * A search landmark holding one field, with the page-wide keyboard of a
 * reference: the shortcut key (`/`) focuses and selects it from anywhere but
 * another text field, and Escape clears it and lets go of focus. Filtering is
 * the consumer's; this only owns the field and its keys.
 */
import { Box, Input } from "@chakra-ui/react";
import { useSearchKeys } from "./behaviour";
import { color, focusRing, fontSize, media, radius, size, space } from "./tokens";

export interface SearchFieldProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  /** The accessible name: what is searched ("Search all Kotlin sheets"). */
  label: string;
  /** The field's only visible text, so it is required: what to type, and the shortcut. */
  placeholder: string;
  /** The key that focuses the field from anywhere on the page; `false` turns it off. */
  shortcut?: string | false;
}

export function SearchField({ id, value, onValueChange, label, placeholder, shortcut = "/" }: SearchFieldProps) {
  const input = useSearchKeys<HTMLInputElement>(shortcut, () => onValueChange(""));

  return (
    <Box role="search" flex="1" minW={0}>
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
        w="100%"
        h={size.control}
        bg={color.surface}
        borderColor={color.line}
        color={color.fg}
        borderRadius={radius.control}
        px={space.inputPaddingX}
        fontSize={fontSize.input}
        _placeholder={{ color: color.faint }}
        _focusVisible={{ borderColor: color.accent, ...focusRing.outside, boxShadow: "none" }}
        css={{ [media.narrow]: { height: size.touch } }}
      />
    </Box>
  );
}
