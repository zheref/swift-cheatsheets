/** A square bar control that switches the colour scheme; its name says what pressing it does. */
import { IconButton } from "@chakra-ui/react";
import { barButton, narrowTarget } from "./controls";
import type { ColorScheme } from "./scheme";
import { media } from "./tokens";

export interface ThemeToggleProps {
  scheme: ColorScheme;
  onToggle: () => void;
  id?: string;
  labels?: { toLight: string; toDark: string };
}

const LABELS = { toLight: "Switch to light theme", toDark: "Switch to dark theme" };

export function ThemeToggle({ scheme, onToggle, id, labels = LABELS }: ThemeToggleProps) {
  return (
    <IconButton
      id={id}
      aria-label={scheme === "dark" ? labels.toLight : labels.toDark}
      onClick={onToggle}
      {...barButton}
      css={{ [media.narrow]: narrowTarget }}
    >
      <span aria-hidden="true">☼</span>
    </IconButton>
  );
}
