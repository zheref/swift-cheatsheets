/**
 * A rail of topic links, in reading order, under uppercase group labels: a
 * title, then each group's label wherever the group changes. The current topic
 * is marked for sight (`.active`) and for assistive technology
 * (`aria-current="location"`). Links are plain anchors; the consumer supplies
 * every `href`, so in-page anchors and routed pages work alike.
 */
import { chakra, Heading, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { color, colorVar, fontSize, lineHeight, media, overlay, radius, size, space } from "./tokens";

export interface TopicItem {
  id: string;
  label: ReactNode;
  href: string;
  /** Consecutive items sharing a group sit under one label. */
  group?: string;
}

export interface TopicNavProps {
  title: ReactNode;
  /** Small print under the title. */
  meta?: ReactNode;
  /** The title's heading level: the page's own `h1` when the rail names the page. */
  titleAs?: "h1" | "h2";
  items: readonly TopicItem[];
  /** The current item's id. */
  active: string | null;
  /** Called when a link is followed: the moment to close a drawer. */
  onNavigate?: () => void;
}

export function TopicNav({ title, meta, titleAs = "h2", items, active, onNavigate }: TopicNavProps) {
  const rows: ReactNode[] = [];
  let group: string | undefined;
  for (const item of items) {
    if (item.group !== undefined && item.group !== group) {
      group = item.group;
      rows.push(
        <Text
          as="div"
          className="navgroup"
          key={`g-${group}`}
          fontSize={fontSize.groupLabel}
          textTransform="uppercase"
          letterSpacing=".09em"
          color={color.faint}
          m={space.groupLabelMargin}
          fontWeight={700}
        >
          {group}
        </Text>,
      );
    }
    const on = item.id === active;
    rows.push(
      <chakra.a
        key={item.id}
        href={item.href}
        data-target={item.id}
        className={on ? "active" : undefined}
        aria-current={on ? "location" : undefined}
        onClick={onNavigate}
        display="block"
        p={space.navItemPadding}
        my={space.navItemGap}
        borderRadius={radius.option}
        textDecoration="none"
        fontSize={fontSize.control}
        lineHeight={String(lineHeight.control)}
        borderLeft="3px solid transparent"
        color={color.dim}
        _hover={{ bg: overlay.hover, color: color.fg }}
        css={{
          "&.active": {
            background: overlay.selected,
            color: colorVar.fg,
            borderLeftColor: colorVar.accent,
            fontWeight: 600,
          },
          // A comfortable touch target inside the narrow-screen drawer (UX-3).
          [media.narrow]: { display: "flex", alignItems: "center", minHeight: size.touch },
        }}
      >
        {item.label}
      </chakra.a>,
    );
  }
  return (
    <>
      <Heading as={titleAs} fontSize={fontSize.navTitle} lineHeight={lineHeight.title} m={space.navTitleMargin} letterSpacing=".02em" fontWeight={700} color={color.fg}>
        {title}
        {meta ? (
          <chakra.span display="block" fontSize={fontSize.meta} color={color.faint} fontWeight={400} mt="2px">
            {meta}
          </chakra.span>
        ) : null}
      </Heading>
      {rows}
    </>
  );
}
