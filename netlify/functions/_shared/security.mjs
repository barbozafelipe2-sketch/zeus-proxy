const SENSITIVE_BASENAMES = [
  /^\.env(?:\..*)?$/i,
  /^\.npmrc$/i,
  /^\.pypirc$/i,
  /^\.netrc$/i,
  /^credentials(?:\..*)?$/i,
  /^secrets?(?:\..*)?$/i,
  /^service[-_.]?account.*\.json$/i,
  /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?$/i,
];

const SENSITIVE_EXTENSIONS = /\.(?:pem|key|p12|pfx|jks|keystore)$/i;

export function isSensitiveFilename(name = '') {
  const normalized = String(name || '').replace(/\\/g, '/');
  const base = normalized.split('/').pop() || '';
  return SENSITIVE_BASENAMES.some((re) => re.test(base)) || SENSITIVE_EXTENSIONS.test(base);
}

export function redactSecrets(value = '') {
  let text = String(value || '');
  if (!text) return text;

  // Private key / certificate-like secret blocks.
  text = text.replace(/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]');

  // Authorization headers and common token prefixes.
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+\/-]{12,}/gi, 'Bearer [REDACTED]');
  text = text.replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED API TOKEN]');
  text = text.replace(/\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{16,}\b/g, '[REDACTED GITHUB TOKEN]');
  text = text.replace(/\b(?:nfp|nf)_[A-Za-z0-9_-]{16,}\b/g, '[REDACTED NETLIFY TOKEN]');
  text = text.replace(/\bvercel_[A-Za-z0-9_-]{16,}\b/gi, '[REDACTED VERCEL TOKEN]');
  text = text.replace(/\bglpat-[A-Za-z0-9_-]{16,}\b/g, '[REDACTED GITLAB TOKEN]');
  text = text.replace(/\bnpm_[A-Za-z0-9]{20,}\b/g, '[REDACTED NPM TOKEN]');
  text = text.replace(/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/g, '[REDACTED SLACK TOKEN]');
  text = text.replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED AWS ACCESS KEY]');
  text = text.replace(/\bAIza[0-9A-Za-z_-]{20,}\b/g, '[REDACTED GOOGLE API KEY]');

  // Key/value lines such as OPENAI_API_KEY=..., password: ..., DATABASE_URL=...
  text = text.replace(
    /(^|\n)(\s*(?:export\s+)?[A-Z0-9_.-]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|PASSWD|PRIVATE[_-]?KEY|DATABASE[_-]?URL|CONNECTION[_-]?STRING|CLIENT[_-]?SECRET)[A-Z0-9_.-]*\s*[:=]\s*)([^\n]+)/gi,
    (_, prefix, key) => `${prefix}${key}[REDACTED]`,
  );

  // JSON-style secret fields.
  text = text.replace(
    /("(?:api[_-]?key|token|secret|password|private[_-]?key|client[_-]?secret|database[_-]?url|connection[_-]?string)"\s*:\s*")([^"]+)(")/gi,
    '$1[REDACTED]$3',
  );

  // URLs containing embedded credentials.
  text = text.replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)([^\s@/]+)(@)/gi, '$1[REDACTED]$3');
  return text;
}

export function safeExtractedText(text, filename = '') {
  if (isSensitiveFilename(filename)) return '[Sensitive configuration/credential file omitted from AI context.]';
  return redactSecrets(text);
}
