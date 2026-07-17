import type { ExtensionAPI } from '@earendil-works/pi-coding-agent'
import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const LOG_FILE = join(homedir(), '.pi', 'agent', 'bash-log.jsonl')

export default function bashLogExtension(pi: ExtensionAPI): void {
  pi.on('session_start', async () => {
    await mkdir(dirname(LOG_FILE), { recursive: true })
  })

  pi.on('tool_call', async (event) => {
    if (event.toolName !== 'bash')
      return

    const record = {
      command: event.input.command as string,
    }

    appendFile(LOG_FILE, `${JSON.stringify(record)}\n`, 'utf8')
  })
}
