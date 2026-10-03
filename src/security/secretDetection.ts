// Common secret/credential patterns. Deliberately conservative (some false positives
// are acceptable — the cost of leaking a real secret to a model is much higher).
const SECRET_PATTERNS: RegExp[] = [
  /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g,
  /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9_\-\.]{16,}['"]/gi,
  /(?:secret|token|password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/gi,
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /sk-[A-Za-z0-9]{20,}/g, // OpenAI-style secret keys
  /ghp_[A-Za-z0-9]{30,}/g, // GitHub personal access token
  /xox[baprs]-[A-Za-z0-9-]{10,}/g, // Slack tokens
  /AIza[0-9A-Za-z\-_]{35}/g, // Google API key
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // JWT-shaped
];

const SENSITIVE_FILENAME_PATTERNS: RegExp[] = [
  /^\.env(\..*)?$/,
  /\.pem$/,
  /\.key$/,
  /\.pfx$/,
  /\.p12$/,
  /id_rsa$/,
  /id_ed25519$/,
  /credentials(\.json)?$/i,
  /secrets?\.(json|ya?ml)$/i,
];

export function isSensitiveFilename(relativePath: string): boolean {
  const base = relativePath.split(/[\\/]/).pop() ?? relativePath;
  return SENSITIVE_FILENAME_PATTERNS.some((p) => p.test(base));
}

export function redactSecrets(content: string): { redacted: string; found: number } {
  let found = 0;
  let redacted = content;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match) => {
      found++;
      return '[REDACTED_SECRET]';
    });
  }
  return { redacted, found };
}
