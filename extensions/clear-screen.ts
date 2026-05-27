/**
 * 清屏扩展
 *
 * 扩展加载时清空终端屏幕、滚动缓冲区并将光标重置到左上角。
 * 在 TUI 接管终端前执行，避免与后续渲染冲突。
 * 非 TTY 环境（管道、重定向）下自动跳过。
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  if (!process.stdout.isTTY) return;
  // \x1b[2J — 清空屏幕
  // \x1b[H  — 光标移至左上角
  // \x1b[3J — 清空滚动缓冲区
  process.stdout.write("\x1b[2J\x1b[H\x1b[3J");
}
