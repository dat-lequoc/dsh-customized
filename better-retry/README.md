# dsh-better-retry

面向 DeepSeek Harness Web 的错误分类与自动重试规则管理插件。它将匹配消息模式的 `PI_AI_ERROR` 重新分类为 `RATE_LIMIT`，交给 DSH 自带的 `@deepseek-ai/dsh-llm-retry` 执行。请求原文和诊断信息保持不变，重试次数、指数退避、抖动和取消由服务商的 DSH 重试策略决定。

## 安装与更新

```sh
dsh plugin --profile web add github:leolee9086/dsh-better-retry
```

固定版本时，把命令末尾替换为 `github:leolee9086/dsh-better-retry#COMMIT_SHA`。仓库提交了 `lib/` 构建产物，安装机器无需构建。更新时同样安装目标 commit，然后重新加载 Host 插件或重启 DSH，刷新 Web 页面。

需要包含 `llm`、`settings`、`connection` 和标准 `llm-retry` 的 DSH Web profile。本版使用 DSH 的 `connection.rpc.handle/call` 和 `settings.section` 扩展接口；在本地 DSH `0.1.3-alpha.1` 开发版本上开发。较旧版本若缺少这些接口，需要先升级 Harness。

```sh
dsh --profile web --dump-config
```

配置应同时包含 `llm-retry` 和 `dsh-better-retry`。配置转储只证明组合存在；还需打开下面的管理页，确认 Host 能返回规则列表。

## 两个可见入口

- **设置 → 自动重试**：查看全部内置和自定义模式、启用/停用、删除自定义模式、添加模式和测试消息。
- **错误行 → 纳入自动重试 / 管理消息模式**：直接预览当前错误，或在错误下方展开同一套管理面板。

英文界面对应 **Automatic retry**、**Enable automatic retry** 和 **Manage message patterns**。

## 纳入一条错误

1. 点击错误行的“纳入自动重试”，展开预览表单。
2. 默认使用“规范化后完整匹配”：移除已知的 request/trace/correlation id 和 UUID，统一大小写与空白，保留消息中的短单词及顺序。
3. 服务商 ID 默认为 `*`（所有服务商）。填入具体 ID 可以将模式限定到该服务商。
4. 点击“预览匹配”，检查规范化消息、当前命中模式和样本匹配项。
5. 点击“确认纳入自动重试”。只有 Host 完成持久化并确认当前错误能命中启用规则，才会显示保存成功。

例如 `upstream_error: Upstream request failed` 可以独立保存；再加入另一类错误不会修改或破坏它。修改预览表单后需要重新预览，不能用旧的预览结果确认新内容。

保存影响后续请求，包括手动重新发起的请求，**不会自动恢复已经结束的回合**。看到 `RATE_LIMIT` 和重试记录只能证明 DSH 原有机制正在执行，不能单凭这些记录判断是本插件触发。

## 消息模式管理

每条模式显示匹配文本、匹配方式、错误码、服务商范围和启用状态。

| 操作 | 效果 |
| --- | --- |
| 停用/启用 | 保存后影响下一次分类；停用项仍在列表中可恢复 |
| 删除 | 删除自定义模式；内置模式通过停用管理 |
| 添加消息模式 | 手动输入消息样本，预览并保存 |
| 测试消息是否命中 | 在 Host 上使用与真实流处理相同的匹配器，显示当前命中的启用模式 |
| 刷新列表 | 重新读取 Host 当前规则；其他页面编辑后可手动刷新 |

设置由 DSH settings provider 保存在 `dsh-better-retry` 命名空间。旧版 `rules: string[]` 会作为**互相独立的规范化完整匹配规则**读取，并在第一次成功管理操作时迁移为 `patterns`。内置规则的停用状态保存在 `disabledBuiltins`。

## 两种匹配方式与相似样本

**规范化后完整匹配**是默认方式：去掉已知易变字段后，消息必须完全相同。它允许较短但明确的消息，不会因为机械的长度阈值悄悄丢失保存结果。

**包含连续片段**用于一类更宽的消息。片段必须连续存在于所选错误中，至少 24 个字符且包含至少 3 个空白分隔词；不支持任意正则表达式。保存前 Host 会再次验证片段能匹配当前样本。

插件参考本进程最近 100 种错误与已保存模式的样本，按错误码和服务商范围筛选相似样本，提出连续公共片段建议。只有明确采用并重新预览、确认后，建议才成为规则。已有规则不会因为新的历史样本而自动扩大或缩小。

运行期样本只保存在内存中，重启后清空；保存的模式与规范化样本持久化。插件不会扫描全部旧会话，也不向外部服务发送这些样本。

## 内置模式

以下两条默认启用，并可在管理页停用：

```text
Too many pending requests, please retry later
Our servers are currently overloaded. Please try again later
```

初始 `unknown:`、`server_error:` 标签和请求 ID 不影响上述匹配。停用内置模式只停止本插件的额外分类，不会关闭 DSH 对原生 `RATE_LIMIT` 的重试。

## 行为范围与故障排查

- 本插件仅重新分类 `PI_AI_ERROR`。`RATE_LIMIT` 已由 DSH 处理；其他错误码保持原状。
- 对包含已知身份验证、余额不足、无效请求或取消措辞的消息拒绝纳入。文本识别并不覆盖所有服务商的表达，保存前仍需检查模式含义。
- 是否实际重试取决于服务商策略。重试被关闭或次数耗尽时，即使命中模式也不会无限重试。可按对应服务商配置调整 `maxRetries`、`backoff.initialDelayMs`、`backoff.maxDelayMs`、`backoff.jitterRatio`。
- 管理页报错或请求返回 404：确认 Host 和 Client 都更新到同一版本；只刷新浏览器不能替代 Host 重新加载。
- 保存后未命中：在管理页粘贴同一条消息测试，核对模式是否启用、服务商 ID、错误码及匹配方式。
- 原始 `ctx.llm.stream()` 的调用者不会因此获得新的重试循环；实际重试仍由 DSH Agent 的既有执行器负责。

## 开发与验证

```sh
pnpm install
pnpm run check
pnpm run bundle
```

聚焦测试覆盖真实 Host `apply` 注册的流处理与管理接口、旧规则迁移、多个模式并存、服务商范围、内置启停、并发保存，以及 React 界面的“预览 → 确认保存 → 管理 → 停用 → 删除”操作链路。不通过付费 API 制造故障。

发布时一并提交源码与 `lib/` 构建产物。

## 仓库与许可证

项目：<https://github.com/leolee9086/dsh-better-retry>

Topics：`dsh-plugin`、`deepseek-harness`、`cordis`、`retry`、`exponential-backoff`。

MIT。

## 赞赏

如果这个项目帮到了你，可以请我喝杯咖啡：

![赞赏码](assets/sponsor-qr.png)

也欢迎通过 [爱发电](https://afdian.net/a/leolee9086) 支持。