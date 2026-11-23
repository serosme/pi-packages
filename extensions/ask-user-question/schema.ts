import type { Static } from 'typebox'
import { Type } from 'typebox'

export const MAX_QUESTIONS = 4
export const MIN_OPTIONS = 2
export const MAX_OPTIONS = 4
export const MAX_HEADER_LENGTH = 16
export const MAX_LABEL_LENGTH = 60

/** Row appended to every question, letting the user type a custom answer. */
export const OTHER_LABEL = 'Type something.'
/** Row appended to multi-select questions, committing the checked boxes. */
export const NEXT_LABEL = 'Next'
/** Next-row label on the last question of a multi-question call. */
export const SUBMIT_LABEL = 'Submit answers'
export const CANCEL_LABEL = 'Cancel'

/** Labels the model may not author: the runtime appends them itself. */
export const RESERVED_LABELS = ['Other', OTHER_LABEL, NEXT_LABEL] as const

const OptionSchema = Type.Object({
  label: Type.String({
    maxLength: MAX_LABEL_LENGTH,
    description: `MAX ${MAX_LABEL_LENGTH} CHARACTERS - hard limit, requests over the limit are rejected. The display text for this option that the user will see and select. Should be concise (1-5 words) and clearly describe the choice.`,
  }),
  description: Type.String({
    description:
      'Explanation of what this option means or what will happen if chosen. Useful for providing context about trade-offs or implications.',
  }),
})

const QuestionSchema = Type.Object({
  question: Type.String({
    description:
      'The complete question to ask the user. Should be clear, specific, and end with a question mark. Example: "Which library should we use for date formatting?" If multiSelect is true, phrase it accordingly, e.g. "Which features do you want to enable?"',
  }),
  header: Type.String({
    maxLength: MAX_HEADER_LENGTH,
    description: `MAX ${MAX_HEADER_LENGTH} CHARACTERS - hard limit, requests over the limit are rejected. Very short chip/tag shown next to the question. Examples: "Auth method", "Library", "Approach".`,
  }),
  options: Type.Array(OptionSchema, {
    minItems: MIN_OPTIONS,
    maxItems: MAX_OPTIONS,
    description: `The available choices for this question. Must have ${MIN_OPTIONS}-${MAX_OPTIONS} options. Each option should be a distinct, mutually exclusive choice (unless multiSelect is enabled). The "${OTHER_LABEL}" row is appended automatically - do NOT author it.`,
  }),
  multiSelect: Type.Optional(
    Type.Boolean({
      default: false,
      description: 'Set to true to allow the user to select multiple options instead of just one. Use when choices are not mutually exclusive.',
    }),
  ),
})

export const QuestionParamsSchema = Type.Object({
  questions: Type.Array(QuestionSchema, {
    minItems: 1,
    maxItems: MAX_QUESTIONS,
    description: `Questions to ask the user (1-${MAX_QUESTIONS} questions)`,
  }),
})

export type QuestionData = Static<typeof QuestionSchema>
export type QuestionParams = Static<typeof QuestionParamsSchema>

export type QuestionnaireError
  = | 'no_ui'
    | 'no_custom_ui'
    | 'no_questions'
    | 'too_many_questions'
    | 'duplicate_question'
    | 'empty_options'
    | 'reserved_label'
    | 'duplicate_option_label'

export interface QuestionAnswer {
  questionIndex: number
  question: string
  kind: 'option' | 'custom' | 'multi'
  /** Option label, custom text, or `null` for a multi-select answer without custom text. */
  answer: string | null
  /** Chosen option labels; multi-select only. */
  selected?: string[]
}

export interface QuestionnaireResult {
  answers: QuestionAnswer[]
  cancelled: boolean
  /** Indexes of questions left blank on a partial submit. */
  unanswered?: number[]
  error?: QuestionnaireError
}

export function isQuestionnaireResult(value: unknown): value is QuestionnaireResult {
  if (!value || typeof value !== 'object')
    return false
  const v = value as Record<string, unknown>
  return Array.isArray(v.answers) && typeof v.cancelled === 'boolean'
}

/**
 * Drop control bytes some models emit inside tool arguments (`GEMBA\r_LOG`).
 * A lone `\r` would otherwise return the terminal cursor to column 0 and let
 * later text overwrite the row. `\r\n` still collapses to a real newline.
 */
function normalizeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '')
}

function normalizeFields<T extends object>(value: T, keys: readonly (keyof T)[]): T {
  const out = { ...value }
  for (const key of keys) {
    if (typeof value[key] === 'string')
      out[key] = normalizeText(value[key] as string) as T[typeof key]
  }
  return out
}

/** Copy the params with every user-facing string normalized. Pure. */
export function normalizeParams(params: QuestionParams): QuestionParams {
  return {
    ...params,
    questions: params.questions.map(q => ({
      ...normalizeFields(q, ['question', 'header']),
      options: q.options.map(o => normalizeFields(o, ['label', 'description'])),
    })),
  }
}

export type ValidationResult
  = | { ok: true }
    | { ok: false, error: QuestionnaireError, message: string }

const RESERVED = new Set<string>(RESERVED_LABELS)

export function validateQuestionnaire(params: QuestionParams): ValidationResult {
  if (params.questions.length === 0) {
    return { ok: false, error: 'no_questions', message: 'Error: At least one question is required' }
  }
  if (params.questions.length > MAX_QUESTIONS) {
    return { ok: false, error: 'too_many_questions', message: `Error: At most ${MAX_QUESTIONS} questions are allowed per invocation` }
  }

  const seenQuestions = new Set<string>()
  for (const q of params.questions) {
    if (seenQuestions.has(q.question)) {
      return { ok: false, error: 'duplicate_question', message: 'Error: Question text must be unique within an invocation' }
    }
    seenQuestions.add(q.question)
  }

  for (const q of params.questions) {
    if (q.options.length < MIN_OPTIONS) {
      return { ok: false, error: 'empty_options', message: `Error: Each question requires at least ${MIN_OPTIONS} options` }
    }
    const seenLabels = new Set<string>()
    for (const o of q.options) {
      if (RESERVED.has(o.label)) {
        return { ok: false, error: 'reserved_label', message: `Error: Option label is reserved (${RESERVED_LABELS.join(', ')})` }
      }
      if (seenLabels.has(o.label)) {
        return { ok: false, error: 'duplicate_option_label', message: 'Error: Option labels must be unique within a question' }
      }
      seenLabels.add(o.label)
    }
  }

  return { ok: true }
}
