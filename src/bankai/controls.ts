/** Shared control styles: the square bar button and its touch size (UX-3). */
import { color, fontSize, radius, size } from "./tokens";

/** A square icon control in a bar: the menu button, the theme toggle. */
export const barButton = {
  variant: "outline" as const,
  bg: color.surface,
  borderColor: color.edge,
  color: color.dim,
  borderRadius: radius.control,
  h: size.control,
  minW: size.control,
  fontSize: fontSize.icon,
  _hover: { color: color.fg, bg: color.surface },
};

/** Touch-sized controls on narrow screens (UX-3). */
export const narrowTarget = { height: size.touch, minWidth: size.touch };
