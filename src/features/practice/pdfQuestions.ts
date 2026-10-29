export type PdfQuestionDraft = { number: string; statement: string; answerKey: string; included: boolean };

export function separateAlternatives(text: string): {
  statement: string;
  options: Array<{ key: string; text: string }>;
} {
  const statementLines: string[] = [];
  const options: Array<{ key: string; text: string }> = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.trim().match(/^([A-E])\s*[.)\-–:]\s*(.+)/i);
    if (match) {
      options.push({ key: match[1].toUpperCase(), text: match[2].trim() });
    } else if (options.length) {
      options[options.length - 1].text += `\n${line.trim()}`;
    } else {
      statementLines.push(line);
    }
  }
  return { statement: statementLines.join("\n").trim(), options };
}

/** Sugere blocos apenas quando cada questão começa numa linha identificada. */
export function splitPdfQuestions(pages: string[]): PdfQuestionDraft[] {
  const result: PdfQuestionDraft[] = [];
  for (const page of pages) {
    for (const line of page.split(/\r?\n/)) {
      if (/^\s*\d{1,4}\s*[-.:)]\s*[A-E]\s*$/i.test(line)) continue;
      const match = line.match(/^\s*(?:QUEST[AÃ]O\s*)?(\d{1,4})\s*[.)\-–:]\s*(.+)/i);
      if (match && match[2].trim().length > 3) {
        result.push({ number: match[1], statement: match[2].trim(), answerKey: "", included: true });
      } else if (result.length && line.trim()) {
        result[result.length - 1].statement += `\n${line.trim()}`;
      }
    }
  }
  return result;
}
