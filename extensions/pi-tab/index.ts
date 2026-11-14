import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { spawn } from 'node:child_process'
import { execPath } from 'node:process'

export default function (pi: ExtensionAPI) {
  pi.registerCommand('tab', {
    description: 'Open a fresh pi session in a new Windows Terminal tab at the current directory',
    handler: async (_args, ctx) => {
      spawn(
        'wt.exe',
        [
          '-w',
          '0',
          'new-tab',
          '-d',
          ctx.cwd,
          execPath,
        ],
        { stdio: 'ignore' },
      ).on('error', () => {}).unref()
    },
  })
}
