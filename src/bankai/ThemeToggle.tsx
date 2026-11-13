/**
 * A square bar control that switches the colour scheme. Its name says what pressing it does, and
 * its icon shows the scheme it switches to: a sun on the dark page, a moon on the light one. The
 * icon follows `<html data-theme>` in CSS, so it is right from the pre-paint script on, before
 * hydration reads the scheme.
 */
import { IconButton } from "@chakra-ui/react";
import { barButton, narrowTarget } from "./controls";
import { MoonIcon, SunIcon } from "./icons";
import type { ColorScheme } from "./scheme";
import { media } from "./tokens";

export interface ThemeToggleProps {
  scheme: ColorScheme;
  onToggle: () => void;
  id?: string;
  labels?: { toLight: string; toDark: string };
}

const LABELS = { toLight: "Switch to light theme", toDark: "Switch to dark theme" };

const LIGHT = 'html[data-theme="light"] &';

export function ThemeToggle({ scheme, onToggle, id, labels = LABELS }: ThemeToggleProps) {
  return (
    <IconButton
      id={id}
      aria-label={scheme === "dark" ? labels.toLight : labels.toDark}
      onClick={onToggle}
      {...barButton}
      css={{
        [media.narrow]: narrowTarget,
        "& .to-dark": { display: "none" },
        [LIGHT]: { "& .to-light": { display: "none" }, "& .to-dark": { display: "block" } },
      }}
    >
      <SunIcon className="to-light" />
      <MoonIcon className="to-dark" />
    </IconButton>
  );
}
