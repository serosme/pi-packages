import type { KeybindingsManager } from '@earendil-works/pi-tui'
import type { QuestionAnswer, QuestionData, QuestionnaireResult } from './schema.ts'
import { Key, matchesKey } from '@earendil-works/pi-tui'
import { NEXT_LABEL, OTHER_LABEL } from './schema.ts'

const KB = {
  up: 'tui.select.up',
  down: 'tui.select.down',
  confirm: 'tui.select.confirm',
  submit: 'tui.input.submit',
  cancel: 'tui.select.cancel',
  newLine: 'tui.input.newLine',
} as const

export type Row
  = | { kind: 'option', index: number, label: string, description: string }
    | { kind: 'other', label: string }
    | { kind: 'next', label: string }

/** Author options, then the always-present custom row, then `Next` for multi-select. */
export function rowsFor(question: QuestionData): Row[] {
  const rows: Row[] = question.options.map((o, index) => ({
    kind: 'option',
    index,
    label: o.label,
    description: o.description,
  }))
  rows.push({ kind: 'other', label: OTHER_LABEL })
  if (question.multiSelect === true)
    rows.push({ kind: 'next', label: NEXT_LABEL })
  return rows
}

export function isMultiQuestionnaire(questions: readonly QuestionData[]): boolean {
  return questions.length > 1
}

function pageCount(questions: readonly QuestionData[]): number {
  return isMultiQuestionnaire(questions)
    ? questions.length + 1
    : 1
}

export interface DialogState {
  /** Question index, or `questions.length` for the Submit review page. */
  tab: number
  row: number
  inputMode: boolean
  answers: Map<number, QuestionAnswer>
  drafts: Map<number, string>
  submitRow: 0 | 1
}

export interface DialogRuntime {
  keybindings: KeybindingsManager
  questions: readonly QuestionData[]
  buffer: string
  cursorLine: number
  lineCount: number
}

export interface ApplyContext {
  questions: readonly QuestionData[]
}

export type Effect
  = | { kind: 'setInput', value: string }
    | { kind: 'done', result: QuestionnaireResult }

export type Action
  = | { kind: 'move', next: number, buffer: string }
    | { kind: 'toggle', index: number, buffer: string }
    | { kind: 'commit', buffer: string }
    | { kind: 'pick', index: number }
    | { kind: 'tab', next: number, buffer: string }
    | { kind: 'submitMove', next: 0 | 1 }
    | { kind: 'submit' }
    | { kind: 'cancel' }

export type KeyAction = Action | { kind: 'forward' } | { kind: 'ignore' }

export interface ApplyResult {
  state: DialogState
  effects: readonly Effect[]
}

export function initialState(): DialogState {
  return {
    tab: 0,
    row: 0,
    inputMode: false,
    answers: new Map(),
    drafts: new Map(),
    submitRow: 0,
  }
}

function questionAt(state: DialogState, ctx: ApplyContext): QuestionData | undefined {
  return ctx.questions[state.tab]
}

function rowsAt(state: DialogState, ctx: ApplyContext): Row[] {
  const question = questionAt(state, ctx)
  return question
    ? rowsFor(question)
    : []
}

function customDraftFor(state: DialogState, tab: number): string {
  const draft = state.drafts.get(tab)
  if (draft !== undefined)
    return draft
  const answer = state.answers.get(tab)
  if (answer?.kind === 'custom' || answer?.kind === 'multi')
    return answer.answer ?? ''
  return ''
}

function withDraft(state: DialogState, tab: number, value: string): Map<number, string> {
  const drafts = new Map(state.drafts)
  drafts.set(tab, value)
  return drafts
}

export function checkedFor(question: QuestionData | undefined, answer: QuestionAnswer | undefined): Set<number> {
  const checked = new Set<number>()
  if (!question)
    return checked
  const selected = answer?.selected ?? []
  question.options.forEach((option, index) => {
    if (selected.includes(option.label))
      checked.add(index)
  })
  return checked
}

function selectedLabels(question: QuestionData, checked: ReadonlySet<number>): string[] {
  const labels: string[] = []
  question.options.forEach((option, index) => {
    if (checked.has(index))
      labels.push(option.label)
  })
  return labels
}

/** Mirror the current multi-select boxes and custom text into the answer map. */
function persistMulti(state: DialogState, ctx: ApplyContext, buffer: string): Map<number, QuestionAnswer> {
  const question = questionAt(state, ctx)
  const answers = new Map(state.answers)
  if (!question?.multiSelect)
    return answers

  const selected = selectedLabels(question, checkedFor(question, state.answers.get(state.tab)))
  const text = buffer.trim()
  if (selected.length === 0 && text.length === 0) {
    answers.delete(state.tab)
    return answers
  }
  answers.set(state.tab, {
    questionIndex: state.tab,
    question: question.question,
    kind: 'multi',
    answer: text.length > 0
      ? text
      : null,
    selected,
  })
  return answers
}

/** Row to focus when entering a tab: the previous answer, or the first row. */
function answeredRow(state: DialogState, ctx: ApplyContext, tab: number): number {
  const question = ctx.questions[tab]
  const answer = state.answers.get(tab)
  const rows = question
    ? rowsFor(question)
    : []
  if (!answer || !question)
    return 0

  if (answer.kind === 'option') {
    const index = rows.findIndex(row => row.kind === 'option' && row.label === answer.answer)
    if (index >= 0)
      return index
  }
  if (answer.kind === 'multi') {
    const index = rows.findIndex(row => row.kind === 'next')
    if (index >= 0)
      return index
  }
  if (answer.kind === 'custom') {
    const index = rows.findIndex(row => row.kind === 'other')
    if (index >= 0)
      return index
  }
  return 0
}

function resultOf(state: DialogState, ctx: ApplyContext, cancelled: boolean): QuestionnaireResult {
  const answers: QuestionAnswer[] = []
  for (let i = 0; i < ctx.questions.length; i++) {
    const answer = state.answers.get(i)
    if (!answer)
      continue
    answers.push(answer)
  }
  const answered = new Set(answers.map(a => a.questionIndex))
  const unanswered = ctx.questions
    .map((_, index) => index)
    .filter(index => !answered.has(index))

  return {
    answers,
    cancelled,
    ...(cancelled || answers.length === 0 || unanswered.length === 0
      ? {}
      : { unanswered }),
  }
}

function done(state: DialogState, ctx: ApplyContext, cancelled: boolean): ApplyResult {
  return {
    state,
    effects: [
      {
        kind: 'done',
        result: resultOf(state, ctx, cancelled),
      },
    ],
  }
}

function switchTab(state: DialogState, ctx: ApplyContext, nextTab: number, buffer: string): ApplyResult {
  const question = questionAt(state, ctx)
  const drafts = state.inputMode
    ? withDraft(state, state.tab, buffer)
    : state.drafts
  const answers = state.inputMode && question?.multiSelect
    ? persistMulti(state, ctx, buffer)
    : state.answers
  const base: DialogState = {
    ...state,
    answers,
    drafts,
  }

  // Submit review page.
  if (nextTab >= ctx.questions.length) {
    return {
      state: {
        ...base,
        tab: nextTab,
        row: 0,
        inputMode: false,
        submitRow: 0,
      },
      effects: [],
    }
  }

  const draft = customDraftFor(base, nextTab)
  return {
    state: {
      ...base,
      tab: nextTab,
      row: answeredRow(base, ctx, nextTab),
      inputMode: false,
      submitRow: 0,
    },
    effects: [
      { kind: 'setInput', value: draft },
    ],
  }
}

function advance(state: DialogState, ctx: ApplyContext, buffer: string): ApplyResult {
  if (!isMultiQuestionnaire(ctx.questions))
    return done(state, ctx, false)
  if (state.tab < ctx.questions.length - 1)
    return switchTab(state, ctx, state.tab + 1, buffer)
  return switchTab(state, ctx, ctx.questions.length, buffer)
}

function move(state: DialogState, action: Extract<Action, { kind: 'move' }>, ctx: ApplyContext): ApplyResult {
  const rows = rowsAt(state, ctx)
  if (rows.length === 0)
    return { state, effects: [] }
  const question = questionAt(state, ctx)
  const leavingInput = state.inputMode
  const answers = leavingInput && question?.multiSelect
    ? persistMulti(state, ctx, action.buffer)
    : state.answers
  const drafts = leavingInput
    ? withDraft(state, state.tab, action.buffer)
    : state.drafts
  const target = rows[action.next]
  const inputMode = target?.kind === 'other'
  const next: DialogState = {
    ...state,
    row: action.next,
    inputMode,
    answers,
    drafts,
  }
  return {
    state: next,
    effects: inputMode
      ? [
          {
            kind: 'setInput',
            value: customDraftFor(next, state.tab),
          },
        ]
      : [],
  }
}

function toggle(state: DialogState, action: Extract<Action, { kind: 'toggle' }>, ctx: ApplyContext): ApplyResult {
  const question = questionAt(state, ctx)
  if (!question?.multiSelect)
    return { state, effects: [] }

  const checked = checkedFor(question, state.answers.get(state.tab))
  if (checked.has(action.index))
    checked.delete(action.index)
  else checked.add(action.index)

  const selected = selectedLabels(question, checked)
  const text = action.buffer.trim()
  const answers = new Map(state.answers)
  if (selected.length === 0 && text.length === 0) {
    answers.delete(state.tab)
  }
  else {
    answers.set(state.tab, {
      questionIndex: state.tab,
      question: question.question,
      kind: 'multi',
      answer: text.length > 0
        ? text
        : null,
      selected,
    })
  }
  return {
    state: { ...state, answers },
    effects: [],
  }
}

function finishQuestion(state: DialogState, answer: QuestionAnswer, buffer: string, ctx: ApplyContext): ApplyResult {
  const answers = new Map(state.answers)
  answers.set(state.tab, answer)
  return advance({
    ...state,
    answers,
    inputMode: false,
    drafts: withDraft(state, state.tab, buffer),
  }, ctx, buffer)
}

function commitSingle(state: DialogState, buffer: string, ctx: ApplyContext): ApplyResult {
  const question = questionAt(state, ctx)
  const rows = rowsAt(state, ctx)
  if (!question)
    return { state, effects: [] }

  let answer: QuestionAnswer | null = null
  if (state.inputMode) {
    const text = buffer.trim()
    if (text.length === 0)
      return { state, effects: [] }
    answer = {
      questionIndex: state.tab,
      question: question.question,
      kind: 'custom',
      answer: text,
    }
  }
  else {
    const row = rows[state.row]
    if (row?.kind === 'option') {
      answer = {
        questionIndex: state.tab,
        question: question.question,
        kind: 'option',
        answer: row.label,
      }
    }
  }
  if (!answer)
    return { state, effects: [] }

  return finishQuestion(state, answer, buffer, ctx)
}

function commitMulti(state: DialogState, buffer: string, ctx: ApplyContext): ApplyResult {
  const question = questionAt(state, ctx)
  if (!question)
    return { state, effects: [] }

  const answer: QuestionAnswer = {
    questionIndex: state.tab,
    question: question.question,
    kind: 'multi',
    answer: buffer.trim().length > 0
      ? buffer.trim()
      : null,
    selected: state.answers.get(state.tab)?.selected ?? [],
  }
  return finishQuestion(state, answer, buffer, ctx)
}

export function reduce(state: DialogState, action: Action, ctx: ApplyContext): ApplyResult {
  switch (action.kind) {
    case 'move':
      return move(state, action, ctx)

    case 'toggle':
      return toggle(state, action, ctx)

    case 'pick': {
      const row = rowsAt(state, ctx)[action.index]
      if (row?.kind !== 'option')
        return { state, effects: [] }
      return commitSingle({ ...state, row: action.index, inputMode: false }, customDraftFor(state, state.tab), ctx)
    }

    case 'commit': {
      const question = questionAt(state, ctx)
      if (!question)
        return { state, effects: [] }
      return question.multiSelect
        ? commitMulti(state, action.buffer, ctx)
        : commitSingle(state, action.buffer, ctx)
    }

    case 'tab':
      return switchTab(state, ctx, action.next, action.buffer)

    case 'submitMove':
      return {
        state: { ...state, submitRow: action.next },
        effects: [],
      }

    case 'submit':
      return done(state, ctx, false)

    case 'cancel':
      return done(state, ctx, true)
  }
}

function isConfirm(kb: KeybindingsManager, data: string): boolean {
  return kb.matches(data, KB.confirm) || kb.matches(data, KB.submit)
}

function tabAction(data: string, state: DialogState, runtime: DialogRuntime, pages: number): KeyAction | undefined {
  if (!isMultiQuestionnaire(runtime.questions))
    return undefined
  if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
    return { kind: 'tab', next: (state.tab + 1) % pages, buffer: runtime.buffer }
  }
  if (matchesKey(data, Key.shift('tab')) || matchesKey(data, Key.left)) {
    return { kind: 'tab', next: (state.tab - 1 + pages) % pages, buffer: runtime.buffer }
  }
  return undefined
}

function digitRow(data: string, rows: readonly Row[]): number | undefined {
  for (let i = 1; i <= 9; i++) {
    if (matchesKey(data, String(i) as '1')) {
      const row = rows[i - 1]
      return row && row.kind !== 'next'
        ? i - 1
        : undefined
    }
  }
  return undefined
}

function wrap(index: number, length: number): number {
  if (length <= 0)
    return 0
  return ((index % length) + length) % length
}

export function routeKey(data: string, state: DialogState, runtime: DialogRuntime): KeyAction {
  const kb = runtime.keybindings

  if (state.inputMode) {
    if (kb.matches(data, KB.newLine))
      return { kind: 'forward' }
    if (isConfirm(kb, data))
      return { kind: 'commit', buffer: runtime.buffer }
    if (kb.matches(data, KB.cancel))
      return { kind: 'cancel' }
    if (kb.matches(data, KB.up) && runtime.cursorLine > 0)
      return { kind: 'forward' }
    if (kb.matches(data, KB.down) && runtime.cursorLine < runtime.lineCount - 1)
      return { kind: 'forward' }
    if (kb.matches(data, KB.up)) {
      const rows = rowsAt(state, { questions: runtime.questions })
      return {
        kind: 'move',
        next: wrap(state.row - 1, rows.length),
        buffer: runtime.buffer,
      }
    }
    if (kb.matches(data, KB.down)) {
      const rows = rowsAt(state, { questions: runtime.questions })
      return {
        kind: 'move',
        next: wrap(state.row + 1, rows.length),
        buffer: runtime.buffer,
      }
    }
    return { kind: 'forward' }
  }

  const pages = pageCount(runtime.questions)

  // Submit review page.
  if (state.tab >= runtime.questions.length) {
    if (kb.matches(data, KB.cancel))
      return { kind: 'cancel' }
    const tab = tabAction(data, state, runtime, pages)
    if (tab)
      return tab
    if (kb.matches(data, KB.up) || kb.matches(data, KB.down)) {
      return {
        kind: 'submitMove',
        next: state.submitRow === 0
          ? 1
          : 0,
      }
    }
    if (isConfirm(kb, data)) {
      return state.submitRow === 1
        ? { kind: 'cancel' }
        : { kind: 'submit' }
    }
    return { kind: 'ignore' }
  }

  const tab = tabAction(data, state, runtime, pages)
  if (tab)
    return tab

  const rows = rowsAt(state, { questions: runtime.questions })
  if (kb.matches(data, KB.up)) {
    return {
      kind: 'move',
      next: wrap(state.row - 1, rows.length),
      buffer: runtime.buffer,
    }
  }
  if (kb.matches(data, KB.down)) {
    return {
      kind: 'move',
      next: wrap(state.row + 1, rows.length),
      buffer: runtime.buffer,
    }
  }

  const question = runtime.questions[state.tab]
  if (!question)
    return { kind: 'ignore' }

  const digit = digitRow(data, rows)
  if (question.multiSelect) {
    if (matchesKey(data, Key.space)) {
      return rows[state.row]?.kind === 'option'
        ? { kind: 'toggle', index: state.row, buffer: runtime.buffer }
        : { kind: 'ignore' }
    }
    if (digit !== undefined) {
      return rows[digit]?.kind === 'option'
        ? { kind: 'toggle', index: digit, buffer: runtime.buffer }
        : { kind: 'move', next: digit, buffer: runtime.buffer }
    }
    if (isConfirm(kb, data)) {
      const row = rows[state.row]
      if (row?.kind === 'next')
        return { kind: 'commit', buffer: runtime.buffer }
      if (row?.kind === 'option')
        return { kind: 'toggle', index: state.row, buffer: runtime.buffer }
      return { kind: 'move', next: state.row, buffer: runtime.buffer }
    }
    if (kb.matches(data, KB.cancel))
      return { kind: 'cancel' }
    return { kind: 'ignore' }
  }

  if (digit !== undefined) {
    return rows[digit]?.kind === 'option'
      ? { kind: 'pick', index: digit }
      : { kind: 'move', next: digit, buffer: runtime.buffer }
  }
  if (isConfirm(kb, data)) {
    // Revisiting a tab focuses a previously typed custom answer without
    // entering edit mode; Enter re-activates the input instead of doing nothing.
    if (rows[state.row]?.kind === 'other')
      return { kind: 'move', next: state.row, buffer: runtime.buffer }
    return { kind: 'commit', buffer: runtime.buffer }
  }
  if (kb.matches(data, KB.cancel))
    return { kind: 'cancel' }
  return { kind: 'ignore' }
}
