/**
 * A code block: pre-tokenized code, coloured by syntax role, with optional copy
 * feedback.
 *
 * It knows no language and runs no highlighter: the consumer tokenizes (at
 * build time or in render, so server and client agree) and passes the tokens;
 * `language` is only a label (`data-lang`). Without tokens the code is shown
 * plain. React escapes every token, so code can never inject markup.
 *
 * Required setup: the `<pre>` carries no styles of its own, so a consumer spreads
 * `codeBlockCss(<scope>)` and `syntaxCss` (src/bankai/system.ts) into its global CSS.
 * That gives the box and a horizontal scroll inside it, so a long line never widens
 * the page.
 */
import { Box, chakra, VisuallyHidden } from "@chakra-ui/react";
import { Fragment, memo } from "react";
import { useCopy } from "./behaviour";
import type { SyntaxRole } from "./system";
import { color, colorVar, focusRing, fontSize, media, radius, size, space } from "./tokens";

export interface CodeToken {
  text: string;
  /** The syntax role that colours it; absent or `null` for plain text. */
  kind?: SyntaxRole | null;
}

export interface CopyLabels {
  idle: string;
  copied: string;
  failed: string;
  /**
   * What is copied, appended to the button's accessible name only ("Copy" + " Kotlin
   * snippet"), so several copy buttons on one page are told apart. The visible label
   * stays the start of the name (WCAG 2.5.3).
   */
  context?: string;
}

const COPY_LABELS: CopyLabels = { idle: "Copy", copied: "Copied", failed: "Copy failed — select the text" };

export interface CodeBlockProps {
  code: string;
  /** The code's language, as a label for styling and tests (`data-lang`). */
  language: string;
  tokens?: readonly CodeToken[];
  /** An intent tone the consumer's styles key on (`tone-<tone>`). */
  tone?: string;
  /**
   * Shows a copy button once scripts run (never a dead control with scripts off),
   * and announces the result politely. `true` uses English labels.
   */
  copy?: boolean | Partial<CopyLabels>;
  /** How long the copied state lasts before the button reads idle again; a failure holds until the next press. */
  resetAfterMs?: number;
}

/** The consumer's labels over the defaults; a label given as `undefined` keeps its default. */
const mergeLabels = (given: boolean | Partial<CopyLabels>): CopyLabels => {
  const own = given === true || given === false ? {} : Object.fromEntries(Object.entries(given).filter(([, v]) => v !== undefined));
  return { ...COPY_LABELS, ...own };
};

/** Touch-sized on a coarse pointer or the narrow layout, the bar's control height otherwise (UX-3). */
const actionHeight = { minHeight: size.control, [media.touch]: { minHeight: size.touch } };

function CopyButton({ code, labels, resetAfterMs }: { code: string; labels: CopyLabels; resetAfterMs: number }) {
  const { available, state, count, copy } = useCopy(code, resetAfterMs);
  const label = labels[state === "idle" ? "idle" : state];
  // A repeated success changes the text by an invisible no-break space, so it is announced again.
  const announcement = state === "idle" ? "" : `${labels[state]}${count % 2 === 1 ? "" : "\u00a0"}`;
  return (
    <>
      {available ? (
        <chakra.button
          type="button"
          className="copy"
          data-state={state}
          onClick={copy}
          px={space.actionPaddingX}
          bg={color.card}
          border="1px solid"
          borderColor={color.line}
          borderRadius={radius.option}
          color={state === "failed" ? colorVar.caution : color.dim}
          fontSize={fontSize.hint}
          cursor="pointer"
          _hover={{ color: color.fg }}
          _focusVisible={focusRing.outside}
          css={actionHeight}
        >
          {label}
          {labels.context ? <VisuallyHidden>{` ${labels.context}`}</VisuallyHidden> : null}
        </chakra.button>
      ) : null}
      {/* Announced once per result; the button's own label changing is not reliably read. */}
      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
    </>
  );
}

export const CodeBlock = memo(function CodeBlock({ code, language, tokens, tone, copy, resetAfterMs = 2000 }: CodeBlockProps) {
  const block = (
    <pre className={tone ? `tone-${tone}` : undefined}>
      <code data-lang={language}>
        {tokens
          ? tokens.map((t, i) =>
              t.kind ? (
                <span className={`t-${t.kind}`} key={i}>
                  {t.text}
                </span>
              ) : (
                <Fragment key={i}>{t.text}</Fragment>
              ),
            )
          : code}
      </code>
    </pre>
  );
  if (!copy) return block;
  return (
    <Box className="codeblock">
      {/* Above the code, never over it: a long first line stays readable. The row is reserved at the
          button's own height, so the button appearing after hydration shifts nothing (UX-7). */}
      <Box display="flex" justifyContent="flex-end" mb={space.toolbarGap} css={actionHeight}>
        <CopyButton code={code} labels={mergeLabels(copy)} resetAfterMs={resetAfterMs} />
      </Box>
      {block}
    </Box>
  );
});
