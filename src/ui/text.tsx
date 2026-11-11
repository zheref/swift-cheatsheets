import { Fragment, memo } from "react";
import { tokenize } from "../content/highlight";
import { parseInline } from "../content/inline";
import type { Highlight, Tone } from "../content/schema";

/** Rule and table text: `code` spans and **bold**, every character escaped by React. */
export const InlineText = memo(function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((seg, i) => {
        const inner = seg.bold ? <b>{seg.text}</b> : seg.text;
        return seg.code ? (
          <code className="inline" key={i}>
            {inner}
          </code>
        ) : (
          <Fragment key={i}>{inner}</Fragment>
        );
      })}
    </>
  );
});

/** A syntax-highlighted snippet. Tokenizing happens during render, so server and client agree. */
export const CodeBlock = memo(function CodeBlock({
  code,
  highlight,
  lang,
  tone,
}: {
  code: string;
  highlight: Highlight;
  lang: string;
  tone?: Tone;
}) {
  return (
    <pre className={tone ? `tone-${tone}` : undefined}>
      <code data-lang={lang}>
        {tokenize(code, highlight).map((t, i) =>
          t.cls ? (
            <span className={`t-${t.cls}`} key={i}>
              {t.text}
            </span>
          ) : (
            <Fragment key={i}>{t.text}</Fragment>
          ),
        )}
      </code>
    </pre>
  );
});
