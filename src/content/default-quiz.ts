import { defineQuiz, type AuthoredQuiz } from "@/lib/domain/quiz";

/**
 * THE QUESTION BANK — the only place quiz content lives.
 * Edit text here; ids, validation and option handling are automatic
 * (see `lib/domain/quiz.ts`). To add another quiz, define a second
 * `AuthoredQuiz` and register it in `quizzes` below.
 *
 * CONTENT POLICY
 * - This default quiz contains NO statistics and NO statements of law that
 *   are not already hedged. Do not add figures (e.g. "X% of people are
 *   offline") or legal conclusions (e.g. "access to the internet is a
 *   human right under treaty Y") until the source has been verified and
 *   cited by the presenters.
 * - `reviewNotes` are editorial reminders for presenters; they are stripped
 *   before the quiz reaches the database or any client.
 */
export const digitalDivideQuiz: AuthoredQuiz = {
  title: "The Digital Divide Challenge",
  description:
    "When access to education, information, public services, and work moves online, to what extent does the digital divide become a human-rights problem, and who is responsible for addressing it?",
  questions: [
    {
      slug: "definition",
      prompt: "What does the digital divide refer to?",
      options: [
        "The difference between old and new computers.",
        "Inequalities in access to and use of digital technologies.",
        "Differences between social media platforms.",
        "Government restrictions on all internet use.",
      ],
      correct: "B",
      explanation:
        "The digital divide concerns unequal access to and use of digital technologies, including differences in affordability, quality, skills, and meaningful participation.",
    },
    {
      slug: "meaningful-access",
      prompt: "Which statement best describes meaningful digital access?",
      options: [
        "Having any internet connection, regardless of its quality.",
        "Owning the most expensive smartphone.",
        "Having reliable, affordable, usable, accessible, and sufficiently safe digital access.",
        "Using social media every day.",
      ],
      correct: "C",
      explanation:
        "A connection alone may not be sufficient. Devices, affordability, quality, digital skills, accessibility, and safety can determine whether people benefit from technology.",
    },
    {
      slug: "education-and-rights",
      prompt: "A university moves all assignments online, but some students cannot afford internet access. What is the main concern?",
      options: [
        "Students are not interested in education.",
        "The university must permanently ban all online learning.",
        "Digital exclusion may undermine equal access to educational opportunities.",
        "Internet access automatically guarantees equal educational outcomes.",
      ],
      correct: "C",
      explanation:
        "Digital exclusion can obstruct educational opportunities. Whether a particular situation constitutes a legal human-rights violation depends on the relevant circumstances and obligations.",
      reviewNotes:
        "Contains a deliberately hedged legal framing. Do not strengthen it to a categorical legal claim without a verified source (treaty, general comment or case).",
    },
    {
      slug: "inequality",
      prompt: "Why can the digital divide disproportionately affect rural and low-income communities?",
      options: [
        "People in these communities cannot learn technology.",
        "Infrastructure, affordability, devices, and support may be less accessible.",
        "Digital technology has no educational value.",
        "Rural communities are legally prohibited from using the internet.",
      ],
      correct: "B",
      explanation:
        "Digital exclusion often reflects structural barriers and unequal resources, not a lack of ability or ambition among the people affected.",
    },
    {
      slug: "responsibilities",
      prompt: "Who should be responsible for addressing digital exclusion?",
      options: [
        "Individuals alone.",
        "Governments alone, with no role for other organizations.",
        "Technology companies alone.",
        "Governments, businesses, educational institutions, and communities, with responsibilities appropriate to their roles.",
      ],
      correct: "D",
      explanation:
        "Closing the divide requires coordinated action. Different actors have different responsibilities and capacities.",
    },
    {
      slug: "solutions",
      prompt:
        "A student has a smartphone but cannot complete online assignments because mobile data is expensive and the platform is inaccessible. What is the strongest response?",
      options: [
        "Tell the student to try harder.",
        "Provide a combination of affordable connectivity, accessible services, and suitable learning alternatives.",
        "Require every student to buy the same expensive laptop immediately.",
        "Remove all online educational resources.",
      ],
      correct: "B",
      explanation:
        "Digital barriers can overlap. Effective solutions should respond to the actual barriers rather than assume that one intervention works for everyone.",
    },
    {
      slug: "evaluation",
      prompt: "Which is the strongest indicator that a digital-inclusion programme is working?",
      options: [
        "The number of promotional posters distributed.",
        "The number of devices purchased, without checking how they are used.",
        "Evidence that previously excluded students can now reliably access and complete their online learning.",
        "The number of meetings held by the organizing committee.",
      ],
      correct: "C",
      explanation:
        "Outcomes matter. Programmes should measure whether people can meaningfully use digital services, not only count activities or equipment.",
    },
  ],
};

/** Validated at import time: a malformed edit fails the build/tests instead of the classroom. */
export const defaultQuiz = defineQuiz(digitalDivideQuiz);

/** Registry for future custom quizzes. The host UI currently offers the default only. */
export const quizzes = { default: defaultQuiz } as const;
