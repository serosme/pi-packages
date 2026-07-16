import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { Key } from '@earendil-works/pi-tui'

const ALLOWED_TOOLS = ['ls', 'find', 'grep', 'read']

export default function readonlyExtension(pi: ExtensionAPI): void {
  let enabled = false
  let savedTools: string[] = []

  function toggle(ctx: ExtensionContext): void {
    if (enabled) {
      pi.setActiveTools([...ALLOWED_TOOLS, ...savedTools])
      savedTools = []
      ctx.ui.setStatus('readonly', undefined)
    }
    else {
      savedTools = pi.getActiveTools().filter(t => !ALLOWED_TOOLS.includes(t))
      pi.setActiveTools([...ALLOWED_TOOLS])
      ctx.ui.setStatus('readonly', ctx.ui.theme.fg('warning', '[readonly]'))
    }
    enabled = !enabled
  }

  pi.registerShortcut(Key.alt('`'), {
    handler: ctx => toggle(ctx),
  })

  pi.on('tool_call', async (event) => {
    if (!enabled || ALLOWED_TOOLS.includes(event.toolName))
      return

    return {
      block: true,
      reason: `[只读模式] 仅限 ${ALLOWED_TOOLS.join(', ')}`,
    }
  })

  pi.on('before_agent_start', async () => {
    if (!enabled)
      return

    return {
      message: {
        customType: 'readonly-mode-context',
        content: `[只读模式] 仅限 ${ALLOWED_TOOLS.join(', ')}`,
        display: false,
      },
    }
  })
}
