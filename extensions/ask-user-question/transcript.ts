import type { AgentToolResult, Theme, ToolRenderResultOptions } from '@earendil-works/pi-coding-agent'
import type { Component } from '@earendil-works/pi-tui'
import type { QuestionAnswer, QuestionnaireResult, QuestionParams } from './schema.ts'
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui'
import { isQuestionnaireResult } from './schema.ts'
import { S } from './symbols.ts'

/** Rows laid out at render time so wrapping follows the terminal width. */
class WidthLines implements Component {
  private readonly layout: (width: number) => string[]

  constructor(layout: (width: number) => string[]) {
    this.layout = layout
  }

  render(width: number): string[] {
    return this.layout(width)
  }

  invalidate(): void {}
}

function answerText(answer: QuestionAnswer | undefined): string {
  if (!answer)
    return '(not answered)'
  if (answer.kind === 'multi') {
    const values = [
      ...(answer.selected ?? []),
    ]
    if (answer.answer)
      values.push(`"${answer.answer}"`)
    return values.length > 0
      ? values.join(', ')
      : '(no input)'
  }
  if (answer.kind === 'custom') {
    return answer.answer
      ? `"${answer.answer}"`
      : '(no input)'
  }
  return answer.answer ?? '(no input)'
}

function firstTextLine(result: AgentToolResult<QuestionnaireResult>): string {
  const text = result.content.find(content => content.type === 'text')?.text ?? ''
  return text.split('\n')[0] ?? ''
}

function hanging(prefix: string, text: string, width: number): string[] {
  const indent = visibleWidth(prefix)
  return wrapTextWithAnsi(text, Math.max(1, width - indent)).map(
    (line, index) => (index === 0
      ? prefix
      : ' '.repeat(indent)) + line,
  )
}

/** `Ask | Auth method | Library`: headers name the questions. */
export function renderAskCall(args: QuestionParams | undefined, theme: Theme): Component {
  const headers = (args?.questions ?? []).map(question => question.header).filter(Boolean)
  const title = theme.fg('toolTitle', theme.bold('Ask'))
  const text = headers.length > 0
    ? `${title} ${theme.fg('accent', headers.join(` ${S.separator} `))}`
    : title
  return new WidthLines(width => [
    truncateToWidth(text, width, S.ellipsis),
  ])
}

/** Compact chat receipt: one answer line per question. */
export function renderAskResult(
  result: AgentToolResult<QuestionnaireResult>,
  _options: ToolRenderResultOptions,
  theme: Theme,
  context: { args?: QuestionParams },
): Component {
  const details = isQuestionnaireResult(result.details)
    ? result.details
    : undefined
  if (details?.error) {
    return new WidthLines(() => [
      theme.fg('error', `${S.fail} ${firstTextLine(result)}`),
    ])
  }
  if (!details) {
    return new WidthLines(() => [
      theme.fg('success', S.ok),
    ])
  }
  if (details.cancelled) {
    return new WidthLines(() => [
      theme.fg('dim', `${S.fail} no answer`),
    ])
  }

  const questions = context.args?.questions ?? []
  return new WidthLines((width) => {
    if (questions.length <= 1) {
      const answer = details.answers[0]
      return hanging(`${theme.fg('success', S.ok)} `, answerText(answer), width)
    }

    const headerWidth = Math.max(...questions.map(question => visibleWidth(question.header)))
    return questions.flatMap((question, index) => {
      const answer = details.answers.find(a => a.questionIndex === index)
      const header = question.header + ' '.repeat(headerWidth - visibleWidth(question.header))
      return hanging(`  ${theme.fg('muted', header)}  `, answerText(answer), width)
    })
  })
}
