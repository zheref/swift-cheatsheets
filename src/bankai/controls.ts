/** Shared control styles: the square bar button and its touch size (UX-3). Heights are minimums, so a control grows with its text. */
import { color, fontSize, radius, size } from "./tokens";

/** A square icon control in a bar: the menu button, the theme toggle. */
export const barButton = {
  variant: "outline" as const,
  bg: color.surface,
  borderColor: color.edge,
  color: color.dim,
  borderRadius: radius.control,
  minH: size.control,
  minW: size.control,
  fontSize: fontSize.icon,
  _hover: { color: color.fg, bg: color.surface },
};

/** Touch-sized controls on the narrow layout and on any coarse pointer (UX-3): spread under `media.touch`. */
export const touchTarget = { minHeight: size.touch, minWidth: size.touch };
