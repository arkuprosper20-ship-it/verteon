export type RiskTier = 'safe' | 'approval' | 'blocked';

// Patterns that are always blocked outright — never run, no approval flow.
const BLOCKED_PATTERNS: RegExp[] = [
  /\brm\s+(?:-r\s*-f|-rf|-fr|-Rf|-fR)\s+\/+(?:\s|$)/i,
  /\brm\s+(?:-r\s*-f|-rf|-fr|-Rf|-fR)\s+~(?:\s|$)/i,
  /\brm\s+--recursive\s+--force\s+\/+(?:\s|$)/i,
  /\brm\s+--recursive\s+--force\s+~(?:\s|$)/i,
  /\bdd\s+if=.*of=\/dev\/(sd|nvme|disk)/i,
  /\bmkfs\.\w+/i,
  /\bmkfs\s+-t\s+\w+/i,
  /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, // fork bomb
  />\s*\/dev\/sd[a-z]/i,
  /\bshutdown\b|\breboot\b|\bhalt\b/i,
  /\bformat\s+[a-z]:/i, // windows format c:
  /\bdiskpart\b/i,
  /\breg\s+delete\b/i,
  /\brmdir\s+\/[sq](?:\s+\/[sq])?\s+[a-z]:\\/i,
  /\brd\s+\/[sq](?:\s+\/[sq])?\s+[a-z]:\\/i,
  /\bRemove-Item\s+-Recurse/i,
  /\bsudo\s+rm\s+-r\s*-f/i,
  /curl[^|]*\|\s*(sudo\s+)?(sh|bash)\b/i, // pipe remote script to shell
  /wget[^|]*\|\s*(sudo\s+)?(sh|bash)\b/i,
  /\bchmod\s+-R\s+777\s+\//i,
  /\bchmod\s+777\s+-R\s+\//i,
  /\.ssh\/(id_rsa|id_ed25519)\b.*(cat|cp|scp|curl|nc)\b/i,
];

// Patterns that require explicit user approval before running.
const APPROVAL_PATTERNS: RegExp[] = [
  /\bnpm\s+(install|i|uninstall|remove)\b/i,
  /\byarn\s+(add|remove|install)\b/i,
  /\bpnpm\s+(add|remove|install)\b/i,
  /\bpip\s+install\b/i,
  /\bgit\s+(push|reset\s+--hard|clean\s+-[fd]|checkout\s+--\s|rebase|merge|commit)\b/i,
  /\brm\s+-r?f?\b/i,
  /\bdel\s+\/[sf]/i, // windows del /s /f
  /\bmv\b.*\*/,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bnpm\s+run\s+(deploy|publish)\b/i,
  /\bdocker\s+(rm|rmi|system\s+prune)\b/i,
];

// Patterns that are considered safe (read-only / low-impact) — used only to
// short-circuit obviously-fine commands like "npm test".
const SAFE_PATTERNS: RegExp[] = [
  /^\s*(git\s+(status|diff|log|show|branch)\b)/i,
  /^\s*(ls|dir|pwd|cat|type|echo|find|grep|rg)\b/i,
  /^\s*npm\s+(test|run\s+test|run\s+lint|run\s+build|run\s+dev|ci)\b/i,
  /^\s*yarn\s+(test|lint|build)\b/i,
  /^\s*(tsc|eslint|jest|vitest|pytest)\b/i,
];

export function classifyCommand(command: string): { tier: RiskTier; reason: string } {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return { tier: 'blocked', reason: 'Matches a high-risk destructive command pattern.' };
    }
  }
  for (const pattern of APPROVAL_PATTERNS) {
    if (pattern.test(command)) {
      return { tier: 'approval', reason: 'This command modifies dependencies, files, or repository state.' };
    }
  }
  for (const pattern of SAFE_PATTERNS) {
    if (pattern.test(command)) {
      return { tier: 'safe', reason: 'Read-only or standard test/build command.' };
    }
  }
  // Default: unknown commands require approval rather than being silently blocked or allowed.
  return { tier: 'approval', reason: 'Command is not on the recognized safe list, so approval is required.' };
}
