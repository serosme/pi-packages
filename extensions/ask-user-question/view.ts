import type { Theme } from '@earendil-works/pi-coding-agent'
import type { Component, EditorTheme, KeybindingsManager, TUI } from '@earendil-works/pi-tui'
import type { QuestionAnswer, QuestionData, QuestionnaireResult } from './schema.ts'
import type { Action, DialogState, Effect } from './state.ts'
import { CURSOR_MARKER, Editor, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui'
import { CANCEL_LABEL, NEXT_LABEL, SUBMIT_LABEL } from './schema.ts'
import { checkedFor, initialState, isMultiQuestionnaire, reduce, routeKey, rowsFor } from './state.ts'
import { S } from './symbols.ts'

const NO_INPUT = '(no input)'

export interface QuestionnaireConfig {
  tui: TUI
  theme: Theme
  questions: readonly QuestionData[]
  keybindings: KeybindingsManager
  done: (result: QuestionnaireResult) => void
}

function editorTheme(theme: Theme): EditorTheme {
  return {
    borderColor: text => theme.fg('borderMuted', text),
    selectList: {
      selectedPrefix: text => theme.bg('selectedBg', theme.fg('accent', text)),
      selectedText: text => theme.bg('selectedBg', theme.bold(text)),
      description: text => theme.fg('muted', text),
      scrollInfo: text => theme.fg('dim', text),
      noMatch: text => theme.fg('warning', text),
    },
  }
}

function borderLine(width: number, theme: Theme): string {
  return theme.fg('accent', S.border.repeat(Math.max(1, width)))
}

function cursorOffset(editor: Editor): number {
  const cursor = editor.getCursor()
  const lines = editor.getLines()
  let offset = cursor.col
  for (let i = 0; i < cursor.line; i++) offset += (lines[i]?.length ?? 0) + 1
  return offset
}

interface InputRowOptions {
  buffer: string
  offset: number | undefined
  rowPrefix: string
  continuationPrefix: string
  contentWidth: number
  selectedText: (text: string) => string
}

/** Render the headless editor's buffer with a reverse-video cursor cell. */
function renderInputRow(options: InputRowOptions): string[] {
  const { buffer, rowPrefix, continuationPrefix, contentWidth, selectedText } = options
  const offset = Math.max(0, Math.min(options.offset ?? buffer.length, buffer.length))
  const char = buffer[offset]
  const atLineEnd = char === undefined || char === '\n'
  const cursor = atLineEnd || char === ' '
    ? '\xA0'
    : char
  const after = atLineEnd
    ? buffer.slice(offset)
    : buffer.slice(offset + 1)
  const raw = `${buffer.slice(0, offset)}${CURSOR_MARKER}\x1B[7m${cursor}\x1B[27m${after}`
  return wrapTextWithAnsi(raw, Math.max(1, contentWidth)).map(
    (segment, index) => selectedText(`${index === 0
      ? rowPrefix
      : continuationPrefix}${segment}`),
  )
}

function answerText(answer: QuestionAnswer | undefined): string {
  if (!answer)
    return NO_INPUT
  if (answer.kind === 'multi') {
    const values = [
      ...(answer.selected ?? []),
    ]
    if (answer.answer)
      values.push(answer.answer)
    return values.length > 0
      ? values.join(', ')
      : NO_INPUT
  }
  if (answer.kind === 'custom') {
    return answer.answer && answer.answer.length > 0
      ? answer.answer
      : NO_INPUT
  }
  return answer.answer ?? NO_INPUT
}

function windowBody(lines: readonly string[], focus: readonly [number, number], max: number, theme: Theme): string[] {
  if (lines.length <= max)
    return [...lines]
  const [focusStart, focusEnd] = focus
  let start = Math.max(0, Math.min(focusStart - Math.floor(max / 2), lines.length - max))
  if (start > focusStart)
    start = focusStart
  if (start + max < focusEnd)
    start = Math.max(0, focusEnd - max)
  const out = lines.slice(start, start + max)
  if (start > 0)
    out[0] = theme.fg('dim', `  ${S.up} more above`)
  if (start + max < lines.length)
    out[out.length - 1] = theme.fg('dim', `  ${S.down} more below`)
  return out
}

export class Questionnaire implements Component {
  private state: DialogState = initialState()
  private readonly tui: TUI
  private readonly theme: Theme
  private readonly questions: readonly QuestionData[]
  private readonly keybindings: KeybindingsManager
  private readonly finish: (result: QuestionnaireResult) => void
  private readonly inlineInput: Editor
  private finished = false

  constructor(config: QuestionnaireConfig) {
    this.tui = config.tui
    this.theme = config.theme
    this.questions = config.questions
    this.keybindings = config.keybindings
    this.finish = config.done

    const theme = editorTheme(config.theme)
    this.inlineInput = new Editor(config.tui, theme)
    // The key router owns confirm/cancel; a submit inside the editor would
    // clear its buffer.
    this.inlineInput.disableSubmit = true
  }

  private runtime() {
    const cursor = this.inlineInput.getCursor()
    const lines = this.inlineInput.getLines()
    return {
      keybindings: this.keybindings,
      questions: this.questions,
      buffer: this.inlineInput.getExpandedText(),
      cursorLine: cursor.line,
      lineCount: Math.max(1, lines.length),
    }
  }

  handleInput(data: string): void {
    if (this.finished)
      return
    const action = routeKey(data, this.state, this.runtime())
    if (action.kind === 'forward') {
      if (this.state.inputMode)
        this.inlineInput.handleInput(data)
      this.tui.requestRender()
      return
    }
    if (action.kind !== 'ignore')
      this.apply(action)
  }

  private apply(action: Action): void {
    const result = reduce(this.state, action, { questions: this.questions })
    this.state = result.state
    for (const effect of result.effects) this.runEffect(effect)
    this.tui.requestRender()
  }

  private runEffect(effect: Effect): void {
    switch (effect.kind) {
      case 'setInput':
        this.inlineInput.setText(effect.value)
        return
      case 'done':
        if (this.finished)
          return
        this.finished = true
        this.finish(effect.result)
    }
  }

  invalidate(): void {
    this.inlineInput.invalidate()
  }

  render(width: number): string[] {
    const theme = this.theme
    const multi = isMultiQuestionnaire(this.questions)
    const border = borderLine(width, theme)
    const isReview = this.state.tab >= this.questions.length

    const top: string[] = [border]
    if (multi)
      top.push(...this.renderTabBar(width))

    const heading = isReview
      ? this.renderReviewHeading()
      : this.renderHeading(width)
    const body = isReview
      ? this.renderReview(width)
      : this.renderOptions(width)
    const footer = [
      border,
      theme.fg('dim', truncateToWidth(` ${this.hintText()} `, width, S.ellipsis)),
    ]

    const lines = [
      ...top,
      ...heading,
      ...body.lines,
      ...footer,
    ]
    const terminalRows = Math.max(4, this.tui.terminal.rows)
    const budget = Math.min(terminalRows, Math.max(12, Math.floor(terminalRows * 0.7)))
    if (lines.length <= budget)
      return lines

    const fixed = top.length + heading.length + footer.length
    const available = Math.max(1, budget - fixed)
    return [
      ...top,
      ...heading,
      ...windowBody(body.lines, body.focus, available, theme),
      ...footer,
    ].slice(0, budget)
  }

  private renderTabBar(width: number): string[] {
    const theme = this.theme
    const pieces: string[] = [` ${S.tabLeft} `]
    this.questions.forEach((question, index) => {
      const label = question.header || `Q${index + 1}`
      const box = this.state.answers.has(index)
        ? S.tabDone
        : S.tabTodo
      const segment = ` ${box} ${label} `
      const styled = index === this.state.tab
        ? theme.bg('selectedBg', theme.fg('text', segment))
        : theme.fg(box === S.tabDone
            ? 'success'
            : 'muted', segment)
      pieces.push(styled, ' ')
    })
    const submit = ` ${S.submitMark} Submit `
    pieces.push(
      this.state.tab === this.questions.length
        ? theme.bg('selectedBg', theme.fg('text', submit))
        : theme.fg(this.state.answers.size === this.questions.length
            ? 'success'
            : 'dim', submit),
      ` ${S.tabRight}`,
    )
    return [
      truncateToWidth(pieces.join(''), width, S.ellipsis),
      '',
    ]
  }

  private renderHeading(width: number): string[] {
    const question = this.questions[this.state.tab]
    if (!question)
      return []
    const lines: string[] = []
    if (!isMultiQuestionnaire(this.questions) && question.header) {
      lines.push(this.theme.bg('selectedBg', ` ${question.header} `), '')
    }
    lines.push(truncateToWidth(this.theme.bold(question.question), width, S.ellipsis), '')
    return lines
  }

  private renderReviewHeading(): string[] {
    return [
      this.theme.fg('accent', this.theme.bold(' Review answers')),
      '',
    ]
  }

  private renderOptions(width: number): { lines: string[], focus: [number, number] } {
    const question = this.questions[this.state.tab]
    if (!question) {
      return {
        lines: [],
        focus: [0, 0],
      }
    }
    const body = question.multiSelect === true
      ? this.renderMultiOptions(question, width)
      : this.renderSingleOptions(question, width)

    return body
  }

  private renderSingleOptions(question: QuestionData, width: number): { lines: string[], focus: [number, number] } {
    const theme = this.theme
    const rows = rowsFor(question)
    const numberWidth = String(rows.length).length
    const draft = this.inlineInput.getExpandedText()
    const answer = this.state.answers.get(this.state.tab)
    const lines: string[] = []
    let focus: [number, number] = [0, 0]

    rows.forEach((row, index) => {
      const start = lines.length
      const active = index === this.state.row
      const prefix = `${active ? S.pointer : S.pointerIdle}${String(index + 1).padStart(numberWidth)}. `
      const continuation = ' '.repeat(visibleWidth(prefix))
      const contentWidth = Math.max(1, width - visibleWidth(prefix))

      if (row.kind === 'other' && active && this.state.inputMode) {
        lines.push(...renderInputRow({
          buffer: draft,
          offset: cursorOffset(this.inlineInput),
          rowPrefix: prefix,
          continuationPrefix: continuation,
          contentWidth,
          selectedText: text => theme.fg('accent', theme.bold(text)),
        }))
      }
      else {
        const confirmed = row.kind === 'option'
          ? answer?.kind === 'option' && answer.answer === row.label
          : answer?.kind === 'custom'
        const label = row.kind === 'other' && draft.length > 0
          ? draft
          : row.label
        const wrapped = wrapTextWithAnsi(confirmed
          ? label + S.confirmed
          : label, contentWidth)
        wrapped.forEach((segment, lineIndex) => {
          const line = `${lineIndex === 0
            ? prefix
            : continuation}${segment}`
          lines.push(active
            ? theme.fg('accent', theme.bold(line))
            : confirmed
              ? theme.fg('success', line)
              : line)
        })
      }

      if (row.kind === 'option' && row.description) {
        for (const segment of wrapTextWithAnsi(row.description, Math.max(1, width - visibleWidth(continuation)))) {
          lines.push(continuation + theme.fg('muted', segment))
        }
      }
      if (active)
        focus = [start, lines.length]
    })

    return { lines, focus }
  }

  private renderMultiOptions(question: QuestionData, width: number): { lines: string[], focus: [number, number] } {
    const theme = this.theme
    const rows = rowsFor(question)
    const draft = this.inlineInput.getExpandedText()
    const checkedSet = checkedFor(question, this.state.answers.get(this.state.tab))
    const isLast = this.state.tab === this.questions.length - 1
    const lines: string[] = []
    let focus: [number, number] = [0, 0]
    const continuation = '  '

    rows.forEach((row, index) => {
      const start = lines.length
      const active = index === this.state.row
      const pointer = active ? S.pointer : S.pointerIdle

      if (row.kind === 'next') {
        const label = isLast ? SUBMIT_LABEL : NEXT_LABEL
        const text = `${pointer}${label}`
        lines.push(active
          ? theme.fg('accent', theme.bold(text))
          : theme.fg('muted', text))
      }
      else {
        const checked = row.kind === 'option'
          ? checkedSet.has(index)
          : draft.trim().length > 0
        const box = checked
          ? theme.fg('accent', S.checked)
          : theme.fg('muted', S.unchecked)
        const prefix = `${pointer}${index + 1}. ${box} `
        const inputWidth = Math.max(1, width - visibleWidth(prefix))
        if (row.kind === 'other' && active && this.state.inputMode) {
          lines.push(...renderInputRow({
            buffer: draft,
            offset: cursorOffset(this.inlineInput),
            rowPrefix: prefix,
            continuationPrefix: ' '.repeat(visibleWidth(prefix)),
            contentWidth: inputWidth,
            selectedText: text => theme.fg('accent', theme.bold(text)),
          }))
        }
        else {
          const label = row.kind === 'other' && draft.length > 0
            ? draft
            : row.label
          for (const [lineIndex, segment] of wrapTextWithAnsi(label, inputWidth).entries()) {
            const text = `${lineIndex === 0
              ? prefix
              : ' '.repeat(visibleWidth(prefix))}${segment}`
            lines.push(active
              ? theme.fg('accent', theme.bold(text))
              : text)
          }
        }
        if (row.kind === 'option' && row.description) {
          for (const segment of wrapTextWithAnsi(row.description, Math.max(1, width - continuation.length))) {
            lines.push(continuation + theme.fg('muted', segment))
          }
        }
      }
      if (active)
        focus = [start, lines.length]
    })

    return { lines, focus }
  }

  private renderReview(width: number): { lines: string[], focus: [number, number] } {
    const theme = this.theme
    const lines: string[] = []
    this.questions.forEach((question, index) => {
      const label = question.header || `Q${index + 1}`
      const answer = this.state.answers.get(index)
      if (!answer) {
        lines.push(truncateToWidth(theme.fg('muted', ` ${S.reviewTodo} ${label}`), width, S.ellipsis))
        lines.push(truncateToWidth(theme.fg('dim', '   (not answered)'), width, S.ellipsis))
        return
      }
      lines.push(truncateToWidth(theme.fg('muted', ` ${S.reviewDone} ${label}`), width, S.ellipsis))
      lines.push(truncateToWidth(`   ${theme.fg('muted', S.arrow)} ${answerText(answer)}`, width, S.ellipsis))
    })

    lines.push('')
    const pickerStart = lines.length
    for (let i = 0; i < 2; i++) {
      const active = this.state.submitRow === i
      const pointer = active ? S.pointer : S.pointerIdle
      const label = i === 0
        ? SUBMIT_LABEL
        : CANCEL_LABEL
      const text = `${pointer}${i + 1}. ${label}`
      lines.push(active
        ? theme.fg('accent', theme.bold(text))
        : theme.fg('text', text))
    }

    return {
      lines,
      focus: [pickerStart, pickerStart + 2],
    }
  }

  private hintText(): string {
    const nav = `${S.up}${S.down} move`
    const sep = ` ${S.separator} `
    if (this.state.inputMode) {
      return [
        'Enter submit answer',
        'Shift+Enter newline',
        nav,
        'Esc cancel',
      ].join(sep)
    }
    if (this.state.tab >= this.questions.length) {
      return [
        'Enter choose',
        nav,
        'Tab switch',
        'Esc cancel',
      ].join(sep)
    }

    const question = this.questions[this.state.tab]
    const parts = ['Enter confirm', nav]
    if (question?.multiSelect === true)
      parts.push('Space toggle')
    if (isMultiQuestionnaire(this.questions))
      parts.push('Tab switch')
    parts.push('Esc cancel')
    return parts.join(sep)
  }
}
