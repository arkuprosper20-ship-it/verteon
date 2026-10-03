# Security

Verteon executes commands and edits files on behalf of a model. The design goal is that the
developer, not the agent, holds the authority over anything that is hard to undo.

## Threat model

| Risk | Mitigation |
| --- | --- |
| The agent runs something destructive | Three-tier command classification with a non-overridable blocked tier |
| The agent silently changes files | `agent.requireFileApproval` plus native diff review before edits apply |
| Credentials leak into a model context | Sensitive-file refusal and secret redaction before content is sent |
| Credentials leak into the UI | Keys are never posted to the webview; the settings panel shows a mask |
| Credentials leak into Git | `.env` and key material are git-ignored; `.env` is excluded from the `.vsix` |
| Unbounded autonomous work | Hard iteration cap and explicit cancellation |
| Misleading state | Statuses reflect real probes and real results; failures are reported as failures |

## Command tiers

`src/security/commandSafety.ts` classifies every command the agent wants to run.

**blocked** — matched first, never runs, no approval path exists. Coverage includes
filesystem-root and home-directory recursive deletes, `mkfs`, `dd` to raw devices, fork
bombs, writes to raw devices, `shutdown`/`reboot`/`halt`, `format`, `diskpart`,
`reg delete`, recursive `Remove-Item`, `sudo rm -r -f`, remote-script pipes
(`curl … | sh`, `wget … | bash`), recursive world-writable chmod on `/`, and exfiltration
attempts that read `~/.ssh` private keys.

**approval** — modifies dependencies, files, or repository state: package installs,
`git push`/`commit`/`merge`/`rebase`/`reset --hard`/`clean`, `rm`/`del`, `mv` with globs,
`chmod`, `chown`, `npm run deploy|publish`, `docker rm|rmi|system prune`.

**safe** — read-only or standard verification: `git status|diff|log|show|branch`,
`ls|dir|pwd|cat|type|echo|find|grep|rg`, `npm test|run test|run lint|run build|run dev|ci`,
`yarn test|lint|build`, `tsc`, `eslint`, `jest`, `vitest`, `pytest`.

Anything unrecognised falls through to **approval**, not to safe. `classifyCommand` checks
blocked before approval before safe, so a command that matches both a safe prefix and a
destructive fragment is still treated as destructive.

Disabling `agent.requireCommandApproval` or `agent.requireFileApproval` suppresses the prompt
for the `approval` tier only. It cannot unblock the `blocked` tier.

## Approval semantics

- Approval is bound to one exact command string and one invocation.
- It is not remembered, not generalised, and not transferable to a similar command.
- Rejecting resolves the tool call as not executed; the model receives the rejection and can
  propose a different approach.
- File approvals route through `requestApproval` as well, with a separate setting.

## Secret handling

**Outbound.** `redactSecrets` replaces matches for private key blocks, AWS access key ids,
OpenAI-style `sk-…` keys, GitHub PATs, Slack tokens, Google API keys, JWT-shaped strings, and
generic `api_key=` / `secret=` / `password=` assignments with `[REDACTED_SECRET]` before the
content is sent to a provider. The UI reports how many values were redacted, so a silent
truncation of your source is not possible.

`isSensitiveFilename` refuses reads of `.env*`, `*.pem`, `*.key`, `*.pfx`, `*.p12`, `id_rsa`,
`id_ed25519`, `credentials.json`, and `secrets.json|yaml` before the file is read at all.

**Inbound.** Provider keys are looked up in this order:

1. `agent.groq.apiKey` VS Code setting
2. `GROQ_API_KEY` in the workspace `.env`, then the extension folder `.env`
3. VS Code secret storage entry `agent.groq.apiKey`
4. `GROQ_API_KEY` in the process environment

The webview never receives a key value. `postSettings` sends `'••••••••'` when a key exists
and an empty string when it does not.

**Repository.** `.gitignore` excludes `.env`, key and certificate extensions, `*.secret`,
credential directories, dependencies, build output, and VS Code state. `.env.example`
contains placeholders only. The published `.vsix` excludes `.env` via `.vscodeignore`.

## Webview posture

The webview runs with `default-src 'none'`, a nonce-scoped script allowlist, styles scoped to
the extension's resource root, and `localResourceRoots` limited to the extension directory.
No remote origin is granted to the webview.

## Known limitations

- Redaction is pattern-based. It targets common credential formats and cannot detect a secret
  with an unusual shape or one embedded in prose.
- The `safe` tier is a regex allowlist, not a semantic analysis. An unusual read-only command
  is treated as `approval`, which is the conservative direction.
- Prompt injection from repository content (a file instructing the agent to bypass approvals)
  cannot be fully prevented. The approval boundary and the blocked tier are the mitigation;
  review diffs before accepting them.
- Approving a command authorises it once. Review the exact string, since a shell command can
  do more than its name suggests.

## Reporting

Report suspected vulnerabilities privately to the maintainer rather than opening a public
issue. Include the version, reproduction steps, and the command or tool involved.
