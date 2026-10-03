# Architecture

Verteon is a single VS Code extension. There is no server, no database, and no telemetry.

```
webview (media/main.js)
      │  postMessage: sendMessage, approvalResponse, stopAgent, refreshModels, ...
      ▼
SidebarProvider ──── owns history, cancellation, approvals, activity fan-out
      │
      ├── createProvider(config)          → AIProvider  (ollama | groq)
      ├── buildToolRegistry(config)       → ToolDefinition[]
      ├── buildSystemPrompt(...)          → contextManager + MemoryStore
      └── runAgentLoop(...)               → src/agent/agentLoop.ts
                │
                ├── provider.chatStream() → streaming text + tool calls
                ├── tool.execute(ctx)     → ctx.requestApproval / ctx.showDiff
                │                              ├── commandSafety.classifyCommand
                │                              └── secretDetection.redactSecrets
                └── HistoryStore / MemoryStore persistence
```

## Module map

| Path | Responsibility |
| --- | --- |
| `src/extension.ts` | Activation, command registration, first-run provider health check, secret preload |
| `src/types.ts` | `AIProvider`, `ToolDefinition`, `ToolContext`, `ActivityEvent`, `ApprovalRequest` |
| `src/config/configuration.ts` | Settings resolution; Groq key lookup order |
| `src/providers/` | Backend implementations behind the `AIProvider` interface |
| `src/agent/agentLoop.ts` | Bounded tool-calling loop, cancellation, truncation of tool output |
| `src/tools/` | Tool implementations grouped by domain |
| `src/security/` | Command risk classification and secret redaction |
| `src/context/` | System prompt construction, active-editor context, history trimming |
| `src/memory/` | Per-workspace notes and working commands (`workspaceState`) |
| `src/history/` | Saved conversations (`globalStorage/history.json`) |
| `src/ui/` | Webview host, message protocol, native diff review |
| `src/agents/`, `src/tasks/` | Reserved multi-agent and task infrastructure; not yet surfaced in the UI |
| `media/` | Webview markup/styles/behavior and the extension icon |
| `test/suite/` | Integration tests for safety, redaction, and loop termination |

## The tool contract

```ts
interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: object;              // surfaced to the model for tool calling
  execute(input, ctx: ToolContext): Promise<{ ok: boolean; output?: string; error?: string }>;
}
```

`ToolContext` gives every tool the same four handles:

- `workspaceRoot` — the only root tools are allowed to resolve paths against
- `requestApproval(request)` — resolves only when the user approves; must be awaited
- `emitActivity(event)` — writes to the live activity feed
- `showDiff(filePath, before, after, title)` — native VS Code diff review

Rules for tools:

1. Resolve paths against `workspaceRoot`; never trust a model-supplied absolute path.
2. Shell out through `classifyCommand` and honour a `blocked` result unconditionally.
3. Run writes through `requestApproval` so the setting can be honoured centrally.
4. Report failures as `ok: false` with a real message. The loop feeds errors back to the
   model instead of pretending the step succeeded.

## Extension points

**New provider** — implement `AIProvider`, add the id to the `agent.provider` enum, add a
`case` in `providerFactory.ts`. Nothing else changes.

**New tool** — implement `ToolDefinition` in the matching `src/tools/*.ts` file and register
it in `toolRegistry.ts`. Git tools stay behind `agent.enableGitTools`.

**New UI message** — add the case to the `onDidReceiveMessage` switch in `sidebarProvider.ts`
and handle it in `media/main.js`. Messages are plain objects; the provider-to-webview
vocabulary is the `postMessage` type set (`activity`, `status`, `approvalRequest`, …).

## Data locations

| Data | Where | Lifetime |
| --- | --- | --- |
| Provider key | VS Code secret storage, `.env`, or settings | Machine-local, never sent to the webview |
| Conversation history | `globalStorage/history.json` | Until deleted |
| Project memory | `workspaceState` (`aiAgent.projectMemory`) | Per workspace |
| Git tools | Read-only commands (`status`, `diff`, `log`) | N/A |
| Logs | `AI Agent` output channel | Session, opt-in via `agent.debugLogging` |
