import { createHash } from "node:crypto";
import { z } from "zod";
import { DEFAULT_TIME_LIMIT_SEC, MAX_TIME_LIMIT_SEC, MIN_TIME_LIMIT_SEC } from "./constants";
import { seededShuffle } from "./shuffle";
import type { Question, Quiz, QuizOption } from "./types";

/**
 * Authoring format for quizzes. Content authors write plain text options and a
 * letter for the correct answer; ids, hashing and validation happen in
 * `defineQuiz`, so editing questions never requires touching components.
 */
const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

export const authoredQuestionSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{1,40}$/, "slug must be lowercase letters, digits or dashes"),
    prompt: z.string().trim().min(1).max(300),
    options: z.array(z.string().trim().min(1).max(200)).min(2).max(4),
    correct: z.enum(OPTION_LETTERS),
    explanation: z.string().trim().min(1).max(600),
    timeLimitSec: z.number().int().min(MIN_TIME_LIMIT_SEC).max(MAX_TIME_LIMIT_SEC).optional(),
    /** Editorial note for presenters. Never sent to clients or stored with the quiz. */
    reviewNotes: z.string().max(500).optional(),
  })
  .superRefine((question, ctx) => {
    const correctIndex = OPTION_LETTERS.indexOf(question.correct);
    if (correctIndex >= question.options.length) {
      ctx.addIssue({ code: "custom", message: `correct answer ${question.correct} has no matching option`, path: ["correct"] });
    }
    const lowered = question.options.map((option) => option.toLowerCase());
    if (new Set(lowered).size !== lowered.length) {
      ctx.addIssue({ code: "custom", message: "options must be distinct", path: ["options"] });
    }
  });

export const authoredQuizSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    questions: z.array(authoredQuestionSchema).min(1).max(50),
  })
  .superRefine((quiz, ctx) => {
    const slugs = quiz.questions.map((q) => q.slug);
    if (new Set(slugs).size !== slugs.length) {
      ctx.addIssue({ code: "custom", message: "question slugs must be unique", path: ["questions"] });
    }
  });

export type AuthoredQuiz = z.input<typeof authoredQuizSchema>;

/**
 * Validates an authored quiz and turns it into the runtime `Quiz`.
 * The quiz id is a content hash, so editing a question produces a NEW quiz id
 * and can never alter a game that is already in progress.
 */
export function defineQuiz(authored: AuthoredQuiz): Quiz {
  const parsed = authoredQuizSchema.parse(authored);
  const canonical = JSON.stringify({
    t: parsed.title,
    q: parsed.questions.map((q) => [q.slug, q.prompt, q.options, q.correct, q.explanation, q.timeLimitSec ?? null]),
  });
  const quizId = `qz-${createHash("sha256").update(canonical).digest("hex").slice(0, 12)}`;

  const questions: Question[] = parsed.questions.map((q) => {
    const options: QuizOption[] = q.options.map((text, index) => ({
      id: (OPTION_LETTERS[index] as string).toLowerCase(),
      text,
    }));
    return {
      id: `${quizId}:${q.slug}`,
      prompt: q.prompt,
      options,
      correctOptionId: q.correct.toLowerCase(),
      explanation: q.explanation,
      timeLimitSec: q.timeLimitSec ?? DEFAULT_TIME_LIMIT_SEC,
    };
  });

  return { id: quizId, title: parsed.title, description: parsed.description, questions };
}

/** Option order shown to everyone. Correctness is always by option id, never position. */
export function orderOptions(options: readonly QuizOption[], shuffle: boolean, seed: string, questionId: string): QuizOption[] {
  return shuffle ? seededShuffle(options, `${seed}:${questionId}`) : [...options];
}
