const SENSITIVE_PATTERNS: Array<[RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, "Bearer [REDACTED]"],
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]"],
  [/(postgres(?:ql)?|rediss?):\/\/[^\s"']+/gi, "$1://[REDACTED]"],
  [/(password|secret|pin|token)(["']?\s*[:=]\s*["']?)[^"'\s,}]+/gi, "$1$2[REDACTED]"],
];

/**
 * Removes tokens, connection strings and credentials from text before it is
 * logged. Error messages from drivers often embed a connection string.
 */
export function scrubSensitive(text: string): string {
  return SENSITIVE_PATTERNS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text);
}
