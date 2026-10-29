import { expect, it } from "vitest";
import { separateAlternatives, splitPdfQuestions } from "./pdfQuestions";

it("separa questões numeradas sem inventar gabarito", () => {
  const drafts = splitPdfQuestions(["QUESTÃO 1. Primeira pergunta?\nA) Um\nB) Dois\n2) Segunda pergunta?"]);
  expect(drafts).toHaveLength(2);
  expect(drafts[0].statement).toContain("A) Um");
  expect(drafts[1].answerKey).toBe("");
});

it("não trata linhas isoladas de gabarito como questões", () => {
  expect(splitPdfQuestions(["QUESTÃO 1. Qual alternativa está correta?\nA) Uma\nB) Duas\n1-A\n2-B"]))
    .toHaveLength(1);
});

it("separa alternativas do enunciado antes de salvar", () => {
  expect(separateAlternatives("Qual é a resposta?\nA) Primeira linha\ncontinuação\nB) Outra"))
    .toEqual({ statement: "Qual é a resposta?", options: [
      { key: "A", text: "Primeira linha\ncontinuação" }, { key: "B", text: "Outra" },
    ] });
});
