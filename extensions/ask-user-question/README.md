# ask-user-question（精简版）

Pi 扩展：注册 `ask_user_question` 工具，让模型在需求不明确时弹出结构化问卷，而不是自己猜。

本目录是对上游插件的**独立精简重写**，保留了核心问答体验，去掉了大部分外围能力。

## 上游

- 源码：<https://github.com/juicesharp/rpiv-mono/tree/main/packages/rpiv-ask-user-question>
- npm：`@juicesharp/rpiv-ask-user-question`
- 上游 License：MIT（<https://github.com/juicesharp/rpiv-mono/blob/main/packages/rpiv-ask-user-question/LICENSE>）

本目录约 1.6k 行；上游同包约 6.7k 行源码 + 13k 行测试。

## 与上游的差异

### 保留

- 1–4 个问题，每个问题 2–4 个选项（`label` + `description`）
- `header`、`label` 的长度限制和保留标签校验
- 每题自动追加 `Type something.` 自定义回答行
- 多选问题的 `Next` / `Submit answers` 行，勾选 + 自定义文本可同时提交
- 多问题 Tab 栏和 `Submit` 汇总页，允许部分提交
- 行内多行输入（方向键、粘贴、`Shift+Enter`、`Ctrl+U`）
- 聊天记录里的 `Ask` 调用和答案表格
- 非交互运行时从模型工具列表移除工具
- 参数中的 `\r` 归一化
- `ctx.ui.custom` 的 `blocked` 状态（OSC 7501）

### 移除

| 能力 | 上游 | 本版本 |
| --- | --- | --- |
| 选项预览分栏 | 支持 `preview` markdown、左右/堆叠布局 | 无 |
| 笔记 | 每题笔记 + Submit 页全局笔记 | 无 |
| 收起 | `Ctrl+]`、隐藏 Overlay、raw 键盘监听 | 无 |
| Overlay 仲裁 | 内联槽位 / overlay / 叠层 / 让位 | 只使用内联 `ctx.ui.custom` |
| RPC/ACP 回退 | `select` / `input` 逐题原生对话框 | 返回 `no_custom_ui` |
| i18n | 9 种语言、`/languages` | 无，界面英文 |
| 配置文件 | `collapseKey`、`notesKey`、`guidance.*` | 无 |
| 事件 | `rpiv:ask-user:prompt/blocked/answer/answer-result` | 无 |
| 外部答题通道 | 按 `toolCallId` 从总线上答题 | 无 |
| 终端提醒 | BEL、Herdr blocked 事件 | 无 |
| 懒加载/预热 | 首次调用导入 + 启动预热 + 坏缓存恢复 | 直接静态导入 |
| 外部编辑器 | `Ctrl+G` 打开 Pi 配置的编辑器 | 无 |
| 双编码参数修复 | `prepareArguments` 解码 JSON 字符串 | 无 |

### 调整

| 项目 | 上游 | 本版本 |
| --- | --- | --- |
| 并发 | 多个问卷可并行，靠 overlay 错开 | `executionMode: 'sequential'`，一次只开一个 |
| 代码结构 | 40+ 文件、状态机 + selector + props adapter 分层 | 7 个文件，reducer 直接驱动组件 |
| 符号 | `❯ ✔ ✎ ✓ ✗ ■ □ ● ○ ─ … ·` | 只使用一套精简符号（见下） |
| 测试 | 43 个测试文件 | 无测试文件，靠类型检查与本地冒烟 |
| 工具名 | `ask_user_question` | 相同，便于替换 |

## 功能

- 1–4 个问题，每个问题 2–4 个选项
- 每个问题自动追加 `Type something.`，可输入自定义答案
- `multiSelect: true` 时自动追加 `Next`；最后一道多选显示 `Submit answers`
- 多个问题时显示 Tab 栏和 `Submit` 汇总页
- 允许部分提交；未答问题会写进给模型的 `unanswered:` 段
- 非交互运行（`ctx.hasUI === false`）时自动隐藏工具
- 聊天记录里显示 `Ask | Header` 和答案

## 符号：只有一套

**当前只有一套符号，没有预设，也没有环境变量。**
早期版本里的 `compatible` / `unicode` / `ascii` 三套预设和 `PI_ASK_USER_SYMBOLS` 已全部删除；要改符号只能改 `symbols.ts`。

| 位置 | 符号 |
| --- | --- |
| 当前行指针 | `>` |
| 多选已勾 / 未勾 | `[*]` / `[ ]` |
| 单选已答后缀 | `*` |
| Tab 已答 / 未答 | `*` / `-` |
| 汇总页已答 / 未答 | `*` / `-` |
| 提交按钮标记 | `+` |
| 边框 | `-` |
| 截断省略 | `...` |
| 底部提示分隔 | 竖线 |
| 上下左右 | `↑` `↓` `←` `→` |
| 聊天成功 / 失败 | `+` / `-` |

其余都是 ASCII 字母、数字和 `>`。不再使用 `✔` `✎` `✓` `✗` `■` `□` `●` `○` `─` `…` `·` 等可能按双宽渲染的符号。

## 键位

| 键 | 行为 |
| --- | --- |
| `↑` / `↓` | 移动行，首尾循环 |
| `Enter` | 确认选项 / 提交自定义答案 / 激活 Submit 项 |
| `Shift+Enter` | 自定义答案中换行 |
| `Esc` | 取消整个问卷 |
| `Tab` / `Shift+Tab`，`←` / `→` | 多问题时切换 Tab |
| `1`–`9` | 单选直接选中该行；多选切换该行；`Type something.` 行则进入输入 |
| `Space` | 多选切换勾选；`Type something.` 行内输入空格 |

多选时 `Enter` 在普通选项上等同 `Space`（只切换勾选）；聚焦 `Next` 时 `Enter` 才提交。

## 工具协议

```text
ask_user_question({
  questions: [{
    question: string,
    header: string,              // ≤16 字符
    options: [{
      label: string,             // ≤60 字符
      description: string,
    }],                          // 2–4 个
    multiSelect?: boolean,       // 默认 false
  }],                            // 1–4 个
})
```

保留标签：`Other`、`Type something.`、`Next` 不能由模型编写。

返回：

```text
{
  content: [{ type: 'text', text }],   // 给模型的信封文本
  details: {
    answers: Array<{
      questionIndex: number
      question: string
      kind: 'option' | 'custom' | 'multi'
      answer: string | null
      selected?: string[]              // 仅 multi
    }>,
    cancelled: boolean,
    unanswered?: number[],             // 部分提交时未答问题下标
    error?: QuestionnaireError,
  },
}
```

成功信封：

```text
User has answered your questions: "Q1"="A". "Q2"="X, Y". You can now continue with the user's answers in mind.
```

部分提交：

```text
User has answered your questions: "Q1"="A". unanswered: "Q2". You can now continue...
```

取消或完全空白：

```text
User declined to answer questions
```

错误码：

```text
no_ui
no_custom_ui
no_questions
too_many_questions
duplicate_question
empty_options
reserved_label
duplicate_option_label
```

## 文件

| 文件 | 职责 |
| --- | --- |
| `index.ts` | 工具注册、`before_agent_start` 同步工具可见性、`execute` 流程 |
| `schema.ts` | TypeBox schema、常量、参数归一化、运行期校验、结果类型 |
| `state.ts` | 纯状态机：行模型、reducer、按键路由 |
| `view.ts` | TUI 对话框：Tab 栏、选项/多选、自定义输入、汇总页、高度裁剪 |
| `envelope.ts` | 结果信封（给模型的文本 + `details`） |
| `transcript.ts` | 聊天记录中的调用/结果渲染 |
| `symbols.ts` | 唯一符号表 |

## 已知限制

- 不支持选项 `preview` 预览分栏
- 不支持 `Ctrl+]` 收起、Overlay 叠层、其他 overlay 冲突让位；问卷始终挂在内联编辑器槽位
- 不支持 RPC/ACP 宿主的原生对话框回退；这类宿主返回 `no_custom_ui`，并提示模型改用聊天文本
- 无 i18n、无配置文件、无笔记、无事件、无外部答题通道
- 未处理模型把嵌套参数序列化成 JSON 字符串的情况（上游 `prepareArguments` 的用途）
- 没有自动化测试文件
