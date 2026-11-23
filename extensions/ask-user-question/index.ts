import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import type { QuestionnaireResult, QuestionParams } from './schema.ts'
import { buildQuestionnaireResponse, buildToolResult } from './envelope.ts'
import {
  MAX_OPTIONS,
  MAX_QUESTIONS,
  MIN_OPTIONS,
  normalizeParams,
  OTHER_LABEL,
  QuestionParamsSchema,
  validateQuestionnaire,
} from './schema.ts'
import { renderAskCall, renderAskResult } from './transcript.ts'
import { Questionnaire } from './view.ts'

export const ASK_USER_QUESTION_TOOL_NAME = 'ask_user_question'

const WAITING_MESSAGE = 'Waiting for your answer'

const ERROR_NO_UI = 'Error: UI not available (running in non-interactive mode)'

const ERROR_NO_CUSTOM_UI
  = 'Error: this client cannot render the questionnaire (custom UI is unavailable, e.g. RPC/ACP hosts such as Zed or VS Code). The user never saw the questions - do NOT treat this as a decline. Ask the questions as plain chat text instead, without using this tool.'

const DEFAULT_DESCRIPTION = `Ask the user one or more structured questions during execution. Use when you need to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take

Usage notes:
- Every question gets an automatically appended "${OTHER_LABEL}" row, where the user can type a custom answer. Do NOT author "Other" or "${OTHER_LABEL}" as an option label - reserved labels are rejected.
- Set multiSelect: true when multiple answers are valid. Multi-select questions get a "Next" row to commit the checked boxes.
- If you recommend a specific option, make that the first option and append "(Recommended)" to its label.
- Do not stack multiple ask_user_question calls back-to-back - group all clarifying questions into one invocation.`

const DEFAULT_PROMPT_SNIPPET = `Ask the user up to ${MAX_QUESTIONS} structured questions (${MIN_OPTIONS}-${MAX_OPTIONS} options each) when requirements are ambiguous`

const DEFAULT_PROMPT_GUIDELINES: string[] = [
  `Use ask_user_question whenever the user's request is underspecified and you cannot proceed without concrete decisions - you can ask up to ${MAX_QUESTIONS} questions per invocation.`,
  `Each question MUST have ${MIN_OPTIONS}-${MAX_OPTIONS} options. Every option needs a concise label (1-5 words) and a description explaining the choice. The user can type a custom answer via the automatically appended "${OTHER_LABEL}" row, or press Esc to abandon the questionnaire.`,
  'If you recommend a specific option, make it the first option and end its label with "(Recommended)".',
]

/** Hide the tool from non-interactive runs, restore it when a UI is available. */
function reconcile(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const active = pi.getActiveTools()
  const hasTool = active.includes(ASK_USER_QUESTION_TOOL_NAME)
  if (!ctx.hasUI && hasTool) {
    pi.setActiveTools(active.filter(name => name !== ASK_USER_QUESTION_TOOL_NAME))
  }
  else if (ctx.hasUI && !hasTool) {
    pi.setActiveTools([...active, ASK_USER_QUESTION_TOOL_NAME])
  }
}

export function registerAskUserQuestionTool(pi: ExtensionAPI): void {
  pi.registerTool<typeof QuestionParamsSchema, QuestionnaireResult>({
    name: ASK_USER_QUESTION_TOOL_NAME,
    label: 'Ask User Question',
    description: DEFAULT_DESCRIPTION,
    promptSnippet: DEFAULT_PROMPT_SNIPPET,
    promptGuidelines: DEFAULT_PROMPT_GUIDELINES,
    parameters: QuestionParamsSchema,
    // A single editor slot exists, and our dialog mounts inline. Sequential
    // execution keeps a second call from replacing (and stranding) the first.
    executionMode: 'sequential',
    renderCall: renderAskCall,
    renderResult: renderAskResult,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const typed = normalizeParams(params as QuestionParams)
      if (!ctx.hasUI) {
        return buildToolResult(ERROR_NO_UI, { answers: [], cancelled: true, error: 'no_ui' })
      }

      const validation = validateQuestionnaire(typed)
      if (!validation.ok) {
        return buildToolResult(validation.message, {
          answers: [],
          cancelled: true,
          error: validation.error,
        })
      }

      // RPC hosts implement select/input but not custom TUI components.
      if ((ctx as { mode?: string }).mode === 'rpc') {
        return buildToolResult(ERROR_NO_CUSTOM_UI, { answers: [], cancelled: true, error: 'no_custom_ui' })
      }

      let result: QuestionnaireResult | undefined
      try {
        result = await ctx.ui.custom<QuestionnaireResult>(
          (tui, theme, keybindings, done) => new Questionnaire({
            tui,
            theme,
            keybindings,
            questions: typed.questions,
            done,
          }),
          {
            blocked: { kind: 'question', message: WAITING_MESSAGE },
          },
        )
      }
      catch {
        return buildToolResult(ERROR_NO_CUSTOM_UI, { answers: [], cancelled: true, error: 'no_custom_ui' })
      }

      if (!result) {
        return buildToolResult(ERROR_NO_CUSTOM_UI, { answers: [], cancelled: true, error: 'no_custom_ui' })
      }
      return buildQuestionnaireResponse(result, typed)
    },
  })
}

export default function (pi: ExtensionAPI) {
  pi.on('before_agent_start', (_event, ctx) => reconcile(pi, ctx))
  registerAskUserQuestionTool(pi)
}
