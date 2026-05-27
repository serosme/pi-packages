---
name: commit
description: 通过分析暂存区更改，生成 Conventional Commits 风格的提交信息。当用户需要提交代码、编写提交信息时使用。
---

# commit

## 提交步骤

### 第一步：获取暂存区变更

先获取暂存区文件列表：

```bash
git diff --staged --name-status
```

- 如果暂存区为空，输出「暂存区无变更，提交终止」并停止
- **不要执行任何修改暂存区的命令，如 `git add`**

再逐文件查看具体改动：

```bash
git diff --staged -- <file>
```

### 第二步：构建提交信息

#### 语言选择

获取最新一条历史提交信息

```bash
git log -1 --format="%s"
```

- 若该提交使用中文，则本次提交信息使用中文
- 若无历史提交或该提交使用英文，则本次提交信息使用英文

#### 构建 subject（必选，type + description）

- **type**：从**使用方视角**判断本次变更的实质影响
  - 核心问题：**这个仓库「被使用」时，产出是什么？本次变更对产出做了什么？**
  - `feat`：为仓库的**核心产出**新增能力或内容
    - 判断标准：这次变更是否让使用者得到了**新的、可用的东西**？
    - 示例：skills 仓库新增/更新 SKILL.md 时应使用 `feat`（使用者获得了一个新 skill）
    - 示例：dotfiles 仓库新增一个 dotfile 时应使用 `feat`（使用者获得了一个新配置）
  - `fix`：修复核心产出的错误、缺陷或逻辑问题
  - `perf`：优化核心产出的性能或质量，不影响功能
  - `refactor`：重构但不改变对外行为（如调整内部结构、拆分文件）
  - `style`：不影响内容的格式调整（空格、换行、缩进）
  - `test`：新增或修改测试
  - `chore`：不直接影响核心产出的维护性操作（依赖、脚本、配置）
  - `docs`：仅对**说明书类内容**（README、使用指南、注释）的变更，**且该变更不改变仓库的核心产出**
  - `build`：影响构建系统或外部依赖的变更（如打包配置、依赖管理、构建脚本）
  - `ci`：持续集成配置文件和脚本的变更（如 GitHub Actions、Jenkins、流水线配置）
- **不添加 scope**
- **description**：
  - 祈使句，首字母小写，不以句号结尾
  - 描述做了什么

#### 构建 body 和 footer

- 用户明确要求（如「写详细点」、「加上 body」等）
- 变更包含突破性变化（diff 中包含函数签名变更、删除接口、修改配置默认值等）
  - 此时 body 必须包含 `BREAKING CHANGE` footer
- **body 格式**：
  - 空一行与 subject 分隔
  - 描述**为什么做**（变更原因、之前的问题、影响范围）
  - 句子正常以句号结尾
- **footer 格式**：
  - `BREAKING CHANGE: <描述>`
  - 其他 `token: 内容`，如 `Closes #123`

### 第三步：输出提交信息、等待确认并执行提交

向用户展示完整的提交消息，**经用户确认后**根据内容结构执行对应命令：

- **仅有 subject（无 body 和 footer）**

  ```bash
  git commit -m "<subject>"
  ```

- **有 subject 和 body（无 footer）**

  ```bash
  git commit -m "<subject>" -m "<body>"
  ```

- **三者齐全（subject + body + footer）**

  ```bash
  git commit -m "<subject>" -m "<body>" -m "<footer>"
  ```
