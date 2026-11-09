import type { ExtensionContext } from '@earendil-works/pi-coding-agent'

/** Reads the DeepSeek credential saved by `/login deepseek`. */
export async function resolveApiKey(ctx: ExtensionContext): Promise<string> {
  const auth = await ctx.modelRegistry.getProviderAuth('deepseek')
  const apiKey = auth?.auth.apiKey?.trim()
  if (!apiKey) {
    throw new Error('No DeepSeek credential found. Run /login deepseek in Pi.')
  }
  return apiKey
}
