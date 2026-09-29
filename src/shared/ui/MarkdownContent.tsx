import type { ElementType, ReactNode } from "react";

type MarkdownAttachmentSources = Readonly<Record<string, string>>;

type MarkdownBlock =
  | { kind: "paragraph"; lines: string[] }
  | { kind: "heading"; level: number; text: string }
  | { kind: "code"; language: string; value: string }
  | { kind: "math"; value: string }
  | { kind: "unordered-list"; items: string[] }
  | { kind: "ordered-list"; items: string[] }
  | { kind: "blockquote"; lines: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "rule" };

type MarkdownContentProps = {
  source: string;
  attachmentSources?: MarkdownAttachmentSources;
  className?: string;
};

const FENCE_PATTERN = /^\s*(`{3,}|~{3,})(.*)$/;
const HEADING_PATTERN = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const UNORDERED_ITEM_PATTERN = /^\s*[-*+]\s+(.+)$/;
const ORDERED_ITEM_PATTERN = /^\s*\d+[.)]\s+(.+)$/;
const BLOCKQUOTE_PATTERN = /^\s*>\s?(.*)$/;
const RULE_PATTERN = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const TABLE_DIVIDER_PATTERN = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function isTableRow(line: string): boolean {
  return line.includes("|");
}

function parseTableRow(line: string): string[] {
  const trimmed = line.trim();
  const withoutEdges = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const cells = withoutEdges.endsWith("|")
    ? withoutEdges.slice(0, -1)
    : withoutEdges;
  return cells.split("|").map((cell) => cell.trim().replaceAll("\\|", "|"));
}

function isTableStart(lines: string[], index: number): boolean {
  return index + 1 < lines.length && isTableRow(lines[index]) && TABLE_DIVIDER_PATTERN.test(lines[index + 1]);
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index];
  return Boolean(
    FENCE_PATTERN.test(line) ||
      HEADING_PATTERN.test(line) ||
      RULE_PATTERN.test(line) ||
      UNORDERED_ITEM_PATTERN.test(line) ||
      ORDERED_ITEM_PATTERN.test(line) ||
      BLOCKQUOTE_PATTERN.test(line) ||
      line.trim().startsWith("$$") ||
      isTableStart(lines, index),
  );
}

function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(FENCE_PATTERN);
    if (fence) {
      const marker = fence[1];
      const value: string[] = [];
      const language = fence[2].trim().split(/\s+/)[0] ?? "";
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith(marker[0].repeat(marker.length))) {
        value.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", language, value: value.join("\n") });
      continue;
    }

    const heading = line.match(HEADING_PATTERN);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }

    if (RULE_PATTERN.test(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = parseTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim() && isTableRow(lines[index])) {
        rows.push(parseTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    if (line.trim().startsWith("$$")) {
      const trimmed = line.trim();
      const oneLine = trimmed.match(/^\$\$(.+)\$\$$/);
      if (oneLine) {
        blocks.push({ kind: "math", value: oneLine[1].trim() });
        index += 1;
        continue;
      }

      const value: string[] = [trimmed.slice(2)];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "$$") {
        value.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "math", value: value.join("\n").trim() });
      continue;
    }

    if (UNORDERED_ITEM_PATTERN.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(UNORDERED_ITEM_PATTERN);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ kind: "unordered-list", items });
      continue;
    }

    if (ORDERED_ITEM_PATTERN.test(line)) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(ORDERED_ITEM_PATTERN);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ kind: "ordered-list", items });
      continue;
    }

    if (BLOCKQUOTE_PATTERN.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const quote = lines[index].match(BLOCKQUOTE_PATTERN);
        if (!quote) break;
        quoteLines.push(quote[1]);
        index += 1;
      }
      blocks.push({ kind: "blockquote", lines: quoteLines });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: "paragraph", lines: paragraphLines });
  }

  return blocks;
}

function findClosingDelimiter(source: string, delimiter: string, start: number): number {
  return source.indexOf(delimiter, start);
}

function decodeAttachmentId(value: string): string | null {
  const prefix = value.startsWith("attachment://")
    ? "attachment://"
    : value.startsWith("attachment:")
      ? "attachment:"
      : null;
  if (!prefix) return null;
  const encodedId = value.slice(prefix.length);
  try {
    return decodeURIComponent(encodedId);
  } catch {
    return encodedId;
  }
}

function renderImage(
  alt: string,
  destination: string,
  attachmentSources: MarkdownAttachmentSources,
  key: string,
): ReactNode {
  const attachmentId = decodeAttachmentId(destination);
  const normalizedDestination = destination.replace(/^\.\/?/, "");
  const source = attachmentId
    ? attachmentSources[attachmentId]
    : attachmentSources[destination] ?? attachmentSources[normalizedDestination];
  if (!source) {
    return (
      <span
        key={key}
        role="img"
        aria-label={alt || "Imagem local indisponível"}
        className="inline-flex max-w-full items-center rounded-lg border border-dashed border-line bg-paper-deep px-3 py-2 text-xs text-muted"
      >
        {alt || "Imagem local indisponível"}
      </span>
    );
  }

  return (
    <img
      key={key}
      src={source}
      alt={alt}
      loading="lazy"
      className="max-h-[28rem] max-w-full rounded-xl border border-line object-contain"
    />
  );
}

function findNextMarker(source: string, start: number): number {
  const markers = ["![", "[", "`", "$$", "$", "**", "__", "*", "_"];
  return markers.reduce((earliest, marker) => {
    const position = source.indexOf(marker, start);
    return position >= 0 && position < earliest ? position : earliest;
  }, Number.POSITIVE_INFINITY);
}

function renderInline(
  source: string,
  attachmentSources: MarkdownAttachmentSources,
  keyPrefix: string,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let tokenIndex = 0;

  while (cursor < source.length) {
    if (source[cursor] === "\\" && cursor + 1 < source.length) {
      nodes.push(source[cursor + 1]);
      cursor += 2;
      continue;
    }

    const markerPosition = findNextMarker(source, cursor);
    if (!Number.isFinite(markerPosition)) {
      nodes.push(source.slice(cursor));
      break;
    }
    if (markerPosition > cursor) {
      nodes.push(source.slice(cursor, markerPosition));
      cursor = markerPosition;
      continue;
    }

    const key = `${keyPrefix}-${tokenIndex}`;
    tokenIndex += 1;

    if (source.startsWith("![", cursor)) {
      const labelEnd = source.indexOf("](", cursor + 2);
      const destinationEnd = labelEnd >= 0 ? source.indexOf(")", labelEnd + 2) : -1;
      if (labelEnd >= 0 && destinationEnd > labelEnd) {
        const alt = source.slice(cursor + 2, labelEnd).trim();
        const destination = source.slice(labelEnd + 2, destinationEnd).trim().split(/\s+/)[0] ?? "";
        nodes.push(renderImage(alt, destination, attachmentSources, key));
        cursor = destinationEnd + 1;
        continue;
      }
    }

    if (source[cursor] === "[") {
      const labelEnd = source.indexOf("](", cursor + 1);
      const destinationEnd = labelEnd >= 0 ? source.indexOf(")", labelEnd + 2) : -1;
      if (labelEnd >= 0 && destinationEnd > labelEnd) {
        const label = source.slice(cursor + 1, labelEnd);
        const destination = source.slice(labelEnd + 2, destinationEnd).trim();
        nodes.push(
          <span key={key} className="underline decoration-dotted underline-offset-2" title={destination}>
            {renderInline(label, attachmentSources, `${key}-label`)}
          </span>,
        );
        cursor = destinationEnd + 1;
        continue;
      }
    }

    if (source[cursor] === "`") {
      const runLength = source.slice(cursor).match(/^`+/)?.[0].length ?? 1;
      const delimiter = "`".repeat(runLength);
      const closing = findClosingDelimiter(source, delimiter, cursor + runLength);
      if (closing > cursor + runLength) {
        nodes.push(
          <code key={key} className="rounded bg-paper-deep px-1.5 py-0.5 text-[0.9em] text-ink">
            {source.slice(cursor + runLength, closing)}
          </code>,
        );
        cursor = closing + runLength;
        continue;
      }
    }

    const mathDelimiter = source.startsWith("$$", cursor) ? "$$" : source[cursor] === "$" ? "$" : null;
    if (mathDelimiter) {
      const closing = findClosingDelimiter(source, mathDelimiter, cursor + mathDelimiter.length);
      if (closing > cursor + mathDelimiter.length) {
        nodes.push(
          <span key={key} role="math" className="rounded-md bg-blue-500/10 px-1.5 py-0.5 font-mono text-[0.9em] text-blue-700 dark:text-blue-300">
            {source.slice(cursor + mathDelimiter.length, closing).trim()}
          </span>,
        );
        cursor = closing + mathDelimiter.length;
        continue;
      }
    }

    const emphasisDelimiter = source.startsWith("**", cursor)
      ? "**"
      : source.startsWith("__", cursor)
        ? "__"
        : source[cursor] === "*" || source[cursor] === "_"
          ? source[cursor]
          : null;
    if (emphasisDelimiter) {
      const closing = findClosingDelimiter(source, emphasisDelimiter, cursor + emphasisDelimiter.length);
      const content = closing > cursor + emphasisDelimiter.length
        ? source.slice(cursor + emphasisDelimiter.length, closing)
        : null;
      const isWordUnderscore = emphasisDelimiter === "_" &&
        /\w/.test(source[cursor - 1] ?? "") && /\w/.test(source[cursor + 1] ?? "");
      if (content !== null && !isWordUnderscore) {
        nodes.push(
          emphasisDelimiter.length === 2 ? (
            <strong key={key}>{renderInline(content, attachmentSources, `${key}-strong`)}</strong>
          ) : (
            <em key={key}>{renderInline(content, attachmentSources, `${key}-em`)}</em>
          ),
        );
        cursor = closing + emphasisDelimiter.length;
        continue;
      }
    }

    nodes.push(source[cursor]);
    cursor += 1;
  }

  return nodes;
}

function renderLines(
  lines: string[],
  attachmentSources: MarkdownAttachmentSources,
  keyPrefix: string,
): ReactNode[] {
  return lines.flatMap((line, index) => [
    ...(index > 0 ? [<br key={`${keyPrefix}-break-${index}`} />] : []),
    ...renderInline(line, attachmentSources, `${keyPrefix}-${index}`),
  ]);
}

export function MarkdownContent({ source, attachmentSources = {}, className = "" }: MarkdownContentProps) {
  const blocks = parseMarkdownBlocks(source);
  return (
    <div className={`grid gap-3 ${className}`.trim()}>
      {blocks.map((block, index) => {
        const key = `markdown-block-${index}`;
        switch (block.kind) {
          case "heading": {
            const Heading = `h${block.level}` as ElementType;
            return (
              <Heading key={key} className="font-heading text-[1.05em] font-bold text-ink">
                {renderInline(block.text, attachmentSources, key)}
              </Heading>
            );
          }
          case "paragraph":
            return <p key={key}>{renderLines(block.lines, attachmentSources, key)}</p>;
          case "code":
            return (
              <div key={key} className="overflow-hidden rounded-xl border border-line bg-forest text-left text-contrast">
                {block.language && (
                  <div className="border-b border-white/10 px-4 py-1.5 font-mono text-[0.68em] uppercase tracking-wider text-white/60">
                    {block.language}
                  </div>
                )}
                <pre className="overflow-x-auto px-4 py-3 text-[0.82em] leading-relaxed">
                  <code className="block whitespace-pre">{block.value}</code>
                </pre>
              </div>
            );
          case "math":
            return (
              <div key={key} role="math" className="overflow-x-auto rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-center">
                <code className="whitespace-pre font-mono text-[0.9em] text-blue-800 dark:text-blue-200">{block.value}</code>
              </div>
            );
          case "unordered-list":
            return (
              <ul key={key} className="list-disc space-y-1 pl-5">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, attachmentSources, `${key}-${itemIndex}`)}</li>
                ))}
              </ul>
            );
          case "ordered-list":
            return (
              <ol key={key} className="list-decimal space-y-1 pl-5">
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, attachmentSources, `${key}-${itemIndex}`)}</li>
                ))}
              </ol>
            );
          case "blockquote":
            return (
              <blockquote key={key} className="border-l-2 border-blue-500/50 pl-4 text-muted">
                {renderLines(block.lines, attachmentSources, key)}
              </blockquote>
            );
          case "table":
            return (
              <div key={key} className="overflow-x-auto rounded-xl border border-line">
                <table className="min-w-full border-collapse text-left text-[0.88em]">
                  <thead className="bg-paper-deep text-ink">
                    <tr>
                      {block.headers.map((header, headerIndex) => (
                        <th key={`${key}-header-${headerIndex}`} className="border-b border-line px-3 py-2 font-bold">
                          {renderInline(header, attachmentSources, `${key}-header-${headerIndex}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={`${key}-row-${rowIndex}`} className="odd:bg-paper/50">
                        {block.headers.map((_, cellIndex) => (
                          <td key={`${key}-cell-${rowIndex}-${cellIndex}`} className="border-b border-line px-3 py-2 align-top last:border-b-0">
                            {renderInline(row[cellIndex] ?? "", attachmentSources, `${key}-cell-${rowIndex}-${cellIndex}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "rule":
            return <hr key={key} className="border-line" />;
        }
      })}
    </div>
  );
}
