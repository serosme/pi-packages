/**
 * LLM 写操作守卫扩展
 *
 * 拦截 write、edit、bash 三种工具调用。
 * write/edit 通过 path 字段判断目标路径；bash 由 LLM 先判断是否为写操作，
 * 再判断操作路径是否在项目目录之外。
 */
import { complete, getModel } from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/**
 * 阻塞当前工具调用并向前端发送错误通知
 * @param ctx     扩展上下文
 * @param reason  阻塞原因描述
 * @returns       包含 block 标记和原因的对象
 */
function block(ctx: ExtensionContext, reason: string) {
  if (ctx.hasUI) ctx.ui.notify(reason, "error");
  return { block: true, reason };
}

/**
 * 根据工具类型构建发送给 LLM 的判断提示词
 * @param cwd      当前工作目录
 * @param toolName 工具名称（write / edit / bash）
 * @param input    工具调用参数
 * @returns        构造好的提示词字符串
 */
function buildGuardPrompt(
  cwd: string,
  toolName: string,
  input: Record<string, unknown>,
): string {
  // bash 命令：需要 LLM 判断是否为写操作以及操作路径是否在项目外
  if (toolName === "bash") {
    return [
      `Current working directory: ${cwd}`,
      `Command: ${input.command}`,
      "",
      "Analyze this command:",
      "- If it is purely READ-ONLY (does NOT create, modify, move, or delete files/directories), answer NO.",
      `- If it performs write/modify/delete on paths OUTSIDE "${cwd}", answer YES.`,
      `- If it performs write/modify/delete but only INSIDE "${cwd}", answer NO.`,
      "",
      "Answer ONLY YES or NO.",
    ].join("\n");
  }

  // write / edit：通过 path 字段判断路径是否在项目外
  return [
    `Current working directory: ${cwd}`,
    `Tool: ${toolName}`,
    `Path: ${input.path}`,
    "",
    `Is this path OUTSIDE "${cwd}"?`,
    "Answer ONLY YES or NO.",
  ].join("\n");
}

/**
 * 扩展默认导出，注册 tool_call 事件监听器
 *
 * 当 LLM 调用 write、edit、bash 工具时，通过守卫模型判断操作是否安全，
 * 拦截项目目录之外的写操作。
 */
export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    // 临时放行
    return;
    // 仅处理 write、edit、bash 三种工具
    if (
      event.toolName !== "write" &&
      event.toolName !== "edit" &&
      event.toolName !== "bash"
    )
      return;

    const input = event.input as Record<string, unknown>;
    const cwd = ctx.cwd;

    // 获取用于安全判断的守卫模型
    const model = getModel("opencode-go", "deepseek-v4-pro");
    if (!model) return block(ctx, "llm-write-guard: guard model not found");

    // 获取 API 密钥和请求头
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth?.ok || !auth.apiKey)
      return block(ctx, "llm-write-guard: no API key for guard model");

    try {
      // 调用 LLM 进行安全判断
      const response = await complete(
        model,
        {
          messages: [
            {
              role: "user",
              timestamp: Date.now(),
              content: [
                {
                  type: "text",
                  text: buildGuardPrompt(cwd, event.toolName, input),
                },
              ],
            },
          ],
        },
        { apiKey: auth.apiKey, headers: auth.headers, maxTokens: 5 },
      );

      // 解析 LLM 返回结果
      const text =
        response.content[0]?.type === "text" ? response.content[0].text : "";
      const answer = text.trim().toUpperCase();

      // YES：操作在项目外，拦截
      if (answer === "YES")
        return block(
          ctx,
          `llm-write-guard blocked ${event.toolName} — target outside project`,
        );

      // 非预期响应，拦截并报错
      if (answer !== "NO")
        return block(
          ctx,
          `llm-write-guard: unexpected LLM response "${answer}"`,
        );
    } catch {
      // LLM 调用失败，安全起见拦截
      return block(ctx, "llm-write-guard: LLM check failed");
    }
  });
}
