import type { QuestionDto } from "@healthcare/shared-contracts";

export function computeAgeFromDob(dob: string, refDate: Date = new Date()): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return undefined;
  const birth = new Date(`${dob}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return undefined;
  let age = refDate.getUTCFullYear() - birth.getUTCFullYear();
  const m = refDate.getUTCMonth() - birth.getUTCMonth();
  if (m < 0 || (m === 0 && refDate.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}

/**
 * Evaluates knockout branching (`display_conditions.depends_on`) and demographic conditions
 * purely in memory (zero browser storage) to determine whether a question should render.
 */
export function isQuestionVisible(
  question: QuestionDto,
  answers: Record<string, unknown>,
  demographics: { sex_at_birth?: string; age?: number },
): boolean {
  const cond = question.display_conditions ?? {};

  if (demographics.sex_at_birth && cond.sex_at_birth !== undefined) {
    const allowed = Array.isArray(cond.sex_at_birth) ? cond.sex_at_birth : [cond.sex_at_birth];
    if (!allowed.includes(demographics.sex_at_birth as never)) return false;
  }

  if (demographics.age !== undefined) {
    if (typeof cond.min_age === "number" && demographics.age < cond.min_age) return false;
    if (typeof cond.max_age === "number" && demographics.age > cond.max_age) return false;
  }

  if (cond.depends_on && typeof cond.depends_on === "object") {
    for (const [depKey, expected] of Object.entries(cond.depends_on)) {
      const actual = answers[depKey];
      if (Array.isArray(expected)) {
        if (!expected.includes(actual)) return false;
      } else if (actual !== expected) {
        return false;
      }
    }
  }

  return true;
}

export function getVisibleQuestions(
  questions: readonly QuestionDto[],
  answers: Record<string, unknown>,
  demographics: { sex_at_birth?: string; age?: number },
): QuestionDto[] {
  return questions.filter((q) => isQuestionVisible(q, answers, demographics));
}
