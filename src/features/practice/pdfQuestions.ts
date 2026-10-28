export type PdfQuestionDraft = { number: string; statement: string; answerKey: string; included: boolean };

/** Sugere blocos apenas quando cada questão começa numa linha identificada. */
export function splitPdfQuestions(pages: string[]): PdfQuestionDraft[] {
  const result: PdfQuestionDraft[] = [];
  for (const page of pages) {
    for (const line of page.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:QUEST[AÃ]O\s*)?(\d{1,4})\s*[.)\-–:]\s*(.+)/i);
      if (match) {
        result.push({ number: match[1], statement: match[2].trim(), answerKey: "", included: true });
      } else if (result.length && line.trim()) {
        result[result.length - 1].statement += `\n${line.trim()}`;
      }
    }
  }
  return result;
}
