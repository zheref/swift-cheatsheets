/**
 * A code block: pre-tokenized code, coloured by syntax role, with optional copy
 * feedback.
 *
 * It knows no language and runs no highlighter: the consumer tokenizes (at
 * build time or in render, so server and client agree) and passes the tokens;
 * `language` is only a label (`data-lang`). Without tokens the code is shown
 * plain. React escapes every token, so code can never inject markup.
 */
import { Box, chakra, VisuallyHidden } from "@chakra-ui/react";
import { Fragment, memo } from "react";
import { useCopy } from "./behaviour";
import type { SyntaxRole } from "./system";
import { color, colorVar, focusRing, fontSize, media, radius, size } from "./tokens";

export interface CodeToken {
  text: string;
  /** The syntax role that colours it; absent or `null` for plain text. */
  kind?: SyntaxRole | null;
}

export interface CopyLabels {
  idle: string;
  copied: string;
  failed: string;
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
  /** How long the copied/failed state lasts before the button reads idle again. */
  resetAfterMs?: number;
}

function CopyButton({ code, labels, resetAfterMs }: { code: string; labels: CopyLabels; resetAfterMs: number }) {
  const { available, state, copy } = useCopy(code, resetAfterMs);
  return (
    <>
      {available ? (
        <chakra.button
          type="button"
          className="copy"
          data-state={state}
          onClick={copy}
          minH="32px"
          px="8px"
          bg={color.card}
          border="1px solid"
          borderColor={color.line}
          borderRadius={radius.option}
          color={state === "failed" ? colorVar.caution : color.dim}
          fontSize={fontSize.hint}
          cursor="pointer"
          _hover={{ color: color.fg }}
          _focusVisible={focusRing.outside}
          css={{ [media.touch]: { minHeight: size.touch } }}
        >
          {labels[state === "idle" ? "idle" : state]}
        </chakra.button>
      ) : null}
      {/* Announced once per result; the button's own label changing is not reliably read. */}
      <VisuallyHidden role="status" aria-live="polite">
        {state === "idle" ? "" : labels[state]}
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
  const labels = { ...COPY_LABELS, ...(copy === true ? {} : copy) };
  return (
    <Box className="codeblock">
      {/* Above the code, never over it: a long first line stays readable. */}
      <Box display="flex" justifyContent="flex-end" minH="32px" mb="4px">
        <CopyButton code={code} labels={labels} resetAfterMs={resetAfterMs} />
      </Box>
      {block}
    </Box>
  );
});
