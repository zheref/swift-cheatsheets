import { Fragment, memo } from "react";
import { CodeBlock as PrimitiveCodeBlock } from "../bankai";
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

/**
 * A syntax-highlighted snippet: this catalog's tokenizer feeding the Bankai code
 * block. Tokenizing happens during render, so server and client agree.
 */
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
  const tokens = tokenize(code, highlight).map((t) => ({ text: t.text, kind: t.cls }));
  return <PrimitiveCodeBlock code={code} language={lang} tokens={tokens} tone={tone} />;
});
