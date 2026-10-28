import { expect, it } from "vitest";
import { splitPdfQuestions } from "./pdfQuestions";

it("separa questões numeradas sem inventar gabarito", () => {
  const drafts = splitPdfQuestions(["QUESTÃO 1. Primeira pergunta?\nA) Um\nB) Dois\n2) Segunda pergunta?"]);
  expect(drafts).toHaveLength(2);
  expect(drafts[0].statement).toContain("A) Um");
  expect(drafts[1].answerKey).toBe("");
});
