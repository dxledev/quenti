import type { FacingTerm } from "@quenti/interfaces";
import {
  type MatchData,
  type MultipleChoiceData,
  type TermWithDistractors,
  type TestQuestion,
  TestQuestionType,
  type TrueFalseData,
} from "@quenti/interfaces";
import { getRandom, shuffleArray } from "@quenti/lib/array";
import type { StudySetAnswerMode } from "@quenti/prisma/client";

export const getAnswerMode = (
  answerMode: StudySetAnswerMode,
): StudySetAnswerMode => {
  if (answerMode == "Both") return Math.random() > 0.5 ? "Word" : "Definition";
  return answerMode;
};

const MAX_CHOICES = 4;

// Cortex distractors are missing when embeddings are unavailable (e.g. no
// Cohere key), so top up with random terms from the set.
const withFallbackDistractors = (
  term: TermWithDistractors,
  distractors: FacingTerm[],
  allTerms: FacingTerm[],
  count: number,
): FacingTerm[] => {
  if (distractors.length >= count) return distractors;
  const taken = new Set([term.id, ...distractors.map((d) => d.id)]);
  const extras = shuffleArray(allTerms.filter((t) => !taken.has(t.id)));
  return [...distractors, ...extras.slice(0, count - distractors.length)];
};

export const generateTrueFalseQuestion = (
  term: TermWithDistractors,
  answerMode: StudySetAnswerMode,
  allTerms: FacingTerm[],
): TestQuestion<TrueFalseData> => {
  const evaluation = Math.random() > 0.5;
  const mode = getAnswerMode(answerMode);
  const found = term.distractors
    .filter((d) => d.type == mode)
    .map((d) => allTerms.find((t) => t.id == d.distractingId))
    .filter((t): t is FacingTerm => !!t);
  const distractor = !evaluation
    ? getRandom(withFallbackDistractors(term, found, allTerms, 1))
    : undefined;

  return {
    type: TestQuestionType.TrueFalse,
    answerMode: mode,
    data: {
      term,
      distractor,
    },
    answered: false,
  };
};

export const generateMcqQuestion = (
  term: TermWithDistractors,
  answerMode: StudySetAnswerMode,
  alTerms: FacingTerm[],
): TestQuestion<MultipleChoiceData> => {
  const mode = getAnswerMode(answerMode);

  const found = shuffleArray(
    term.distractors.filter((d) => d.type == mode),
  )
    .map((d) => alTerms.find((t) => t.id == d.distractingId))
    .filter((t): t is FacingTerm => !!t);
  const distractorTerms = withFallbackDistractors(
    term,
    found,
    alTerms,
    MAX_CHOICES - 1,
  );

  const choices = shuffleArray([term, ...distractorTerms]);

  return {
    type: TestQuestionType.MultipleChoice,
    answerMode: mode,
    data: {
      term,
      choices,
    },
    answered: false,
  };
};

export const generateMatchQuestion = (
  terms: FacingTerm[],
  answerMode: StudySetAnswerMode,
): TestQuestion<MatchData> => {
  return {
    type: TestQuestionType.Match,
    answerMode: getAnswerMode(answerMode),
    data: {
      terms: shuffleArray(Array.from(terms)),
      zones: terms,
      answer: [],
    },
    answered: false,
  };
};

export const generateWriteQuestion = (
  term: FacingTerm,
  answerMode: StudySetAnswerMode,
): TestQuestion => {
  return {
    type: TestQuestionType.Write,
    answerMode: getAnswerMode(answerMode),
    data: { term, answer: "" },
    answered: false,
  };
};
