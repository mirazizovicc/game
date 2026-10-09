import { describe, expect, it } from "vitest";
import { defaultQuiz, digitalDivideQuiz } from "@/content/default-quiz";
import { defineQuiz, orderOptions, type AuthoredQuiz } from "@/lib/domain/quiz";

const base = (): AuthoredQuiz => ({
  title: "T",
  questions: [{ slug: "one", prompt: "Q?", options: ["a1", "b1", "c1", "d1"], correct: "B", explanation: "Because." }],
});

describe("default quiz (content from the brief)", () => {
  it("has the seven specified questions with four options each", () => {
    expect(defaultQuiz.questions).toHaveLength(7);
    for (const question of defaultQuiz.questions) expect(question.options).toHaveLength(4);
  });

  it("has the specified correct answers: B, C, C, B, D, B, C", () => {
    expect(defaultQuiz.questions.map((q) => q.correctOptionId.toUpperCase())).toEqual(["B", "C", "C", "B", "D", "B", "C"]);
  });

  it("uses the default 20 second limit and has a non-empty explanation for every question", () => {
    for (const question of defaultQuiz.questions) {
      expect(question.timeLimitSec).toBe(20);
      expect(question.explanation.length).toBeGreaterThan(20);
    }
  });

  it("points each correct id at an existing option", () => {
    for (const question of defaultQuiz.questions) {
      expect(question.options.map((o) => o.id)).toContain(question.correctOptionId);
    }
  });

  it("does not embed statistics (digits/percentages) in questions or explanations", () => {
    const text = digitalDivideQuiz.questions.flatMap((q) => [q.prompt, q.explanation, ...q.options]).join(" ");
    expect(text).not.toMatch(/\d/);
    expect(text).not.toMatch(/%/);
  });

  it("does not leak editorial reviewNotes into the runtime quiz", () => {
    expect(JSON.stringify(defaultQuiz)).not.toContain("hedged legal framing");
  });
});

describe("defineQuiz validation", () => {
  it("accepts a valid quiz and produces stable ids", () => {
    const a = defineQuiz(base());
    const b = defineQuiz(base());
    expect(a.id).toBe(b.id);
    expect(a.questions[0]?.correctOptionId).toBe("b");
  });

  it("changes the quiz id when content changes, so running games are never altered", () => {
    const edited = base();
    (edited.questions[0] as { explanation: string }).explanation = "Different.";
    expect(defineQuiz(edited).id).not.toBe(defineQuiz(base()).id);
  });

  it("rejects a correct answer that has no matching option", () => {
    const quiz = base();
    (quiz.questions[0] as { options: string[]; correct: "A" | "B" | "C" | "D" }).options = ["x", "y"];
    (quiz.questions[0] as { correct: "A" | "B" | "C" | "D" }).correct = "D";
    expect(() => defineQuiz(quiz)).toThrow();
  });

  it("rejects too few/many options, duplicate options and duplicate slugs", () => {
    const one = base();
    (one.questions[0] as { options: string[] }).options = ["only"];
    expect(() => defineQuiz(one)).toThrow();

    const five = base();
    (five.questions[0] as { options: string[] }).options = ["1", "2", "3", "4", "5"];
    expect(() => defineQuiz(five)).toThrow();

    const dup = base();
    (dup.questions[0] as { options: string[] }).options = ["same", "Same", "c", "d"];
    expect(() => defineQuiz(dup)).toThrow();

    const slugs = base();
    slugs.questions.push({ ...(slugs.questions[0] as object) } as AuthoredQuiz["questions"][number]);
    expect(() => defineQuiz(slugs)).toThrow();
  });

  it("rejects empty prompts, bad time limits and empty quizzes", () => {
    const empty = base();
    (empty.questions[0] as { prompt: string }).prompt = "   ";
    expect(() => defineQuiz(empty)).toThrow();

    const time = base();
    (time.questions[0] as { timeLimitSec?: number }).timeLimitSec = 1;
    expect(() => defineQuiz(time)).toThrow();

    expect(() => defineQuiz({ title: "T", questions: [] })).toThrow();
  });
});

describe("option shuffling", () => {
  const question = defaultQuiz.questions[0]!;

  it("keeps the authored order when shuffling is off", () => {
    expect(orderOptions(question.options, false, "seed", question.id).map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("is deterministic for the same seed (host and phones agree)", () => {
    const first = orderOptions(question.options, true, "seed-1", question.id).map((o) => o.id);
    const second = orderOptions(question.options, true, "seed-1", question.id).map((o) => o.id);
    expect(first).toEqual(second);
  });

  it("is a permutation: nothing lost, nothing duplicated, and ids still map to the same text", () => {
    for (let i = 0; i < 50; i += 1) {
      const shuffled = orderOptions(question.options, true, `seed-${i}`, question.id);
      expect(shuffled.map((o) => o.id).sort()).toEqual(["a", "b", "c", "d"]);
      for (const option of shuffled) expect(question.options.find((o) => o.id === option.id)?.text).toBe(option.text);
    }
  });

  it("actually reorders for some seeds, and does not mutate the source", () => {
    const orders = new Set(Array.from({ length: 30 }, (_, i) => orderOptions(question.options, true, `s${i}`, question.id).map((o) => o.id).join("")));
    expect(orders.size).toBeGreaterThan(1);
    expect(question.options.map((o) => o.id)).toEqual(["a", "b", "c", "d"]);
  });
});
