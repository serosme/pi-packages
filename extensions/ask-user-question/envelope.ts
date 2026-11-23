import type { QuestionAnswer, QuestionnaireResult, QuestionParams } from './schema.ts'

const DECLINE_MESSAGE = 'User declined to answer questions'
const ENVELOPE_PREFIX = 'User has answered your questions:'
const ENVELOPE_SUFFIX = 'You can now continue with the user\'s answers in mind.'

function answerScalar(answer: QuestionAnswer): string {
  if (answer.kind === 'multi') {
    const values = [
      ...(answer.selected ?? []),
    ]
    if (answer.answer)
      values.push(answer.answer)
    return values.length > 0
      ? values.join(', ')
      : '(no input)'
  }
  if (answer.kind === 'custom') {
    return answer.answer && answer.answer.length > 0
      ? answer.answer
      : '(no input)'
  }
  return answer.answer ?? '(no input)'
}

function answerSegment(answer: QuestionAnswer): string {
  return `"${answer.question}"="${answerScalar(answer)}".`
}

export function buildToolResult(text: string, details: QuestionnaireResult) {
  return {
    content: [
      { type: 'text' as const, text },
    ],
    details,
  }
}

/**
 * Map the dialog result to the model-facing text. Cancelling and an entirely
 * blank submission both collapse to one canonical decline signal.
 */
export function buildQuestionnaireResponse(result: QuestionnaireResult | null | undefined, params: QuestionParams) {
  if (!result || result.cancelled) {
    return buildToolResult(DECLINE_MESSAGE, { answers: result?.answers ?? [], cancelled: true })
  }

  const segments: string[] = []
  const answered = new Set<number>()
  for (let i = 0; i < params.questions.length; i++) {
    const answer = result.answers.find(a => a.questionIndex === i)
    if (!answer)
      continue
    answered.add(i)
    segments.push(answerSegment(answer))
  }

  if (segments.length === 0) {
    return buildToolResult(DECLINE_MESSAGE, { answers: result.answers, cancelled: true })
  }

  const unanswered = params.questions
    .map((_, index) => index)
    .filter(index => !answered.has(index))
  if (unanswered.length > 0) {
    const names = unanswered.map(index => `"${params.questions[index]?.question}"`).join(', ')
    segments.push(`unanswered: ${names}.`)
  }

  const details: QuestionnaireResult = unanswered.length > 0
    ? { ...result, unanswered }
    : result
  return buildToolResult(`${ENVELOPE_PREFIX} ${segments.join(' ')} ${ENVELOPE_SUFFIX}`, details)
}
