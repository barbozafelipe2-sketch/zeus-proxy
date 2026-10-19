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

function sensitiveJsonKey(key) {
  const normalizedKey = key.replace(/([a-z0-9])([A-Z])/g, '$1_$2');
  if (/^(?:token_usage|token_count|token_budget|token_total)$/i.test(normalizedKey)) return false;
  return /(?:^|[_.-])(?:api[_-]?key|access[_-]?token|auth[_-]?token|refresh[_-]?token|token|secret|password|passwd|private[_-]?key|database[_-]?url|connection[_-]?string|credentials?|authorization)(?:$|[_.-])/i.test(normalizedKey);
}

function jsonStringEnd(text, start) {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '"') return i + 1;
  }
  return text.length;
}

function jsonValueEnd(text, start) {
  if (text[start] === '"') return jsonStringEnd(text, start);
  if (text[start] === '{' || text[start] === '[') {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '"') { i = jsonStringEnd(text, i) - 1; continue; }
      if (text[i] === '{' || text[i] === '[') depth++;
      else if (text[i] === '}' || text[i] === ']') {
        if (--depth === 0) return i + 1;
      }
    }
    // An incomplete credential container must not leave its contents visible.
    return text.length;
  }
  let end = start;
  while (end < text.length && !/[\s,}\]]/.test(text[end])) end++;
  return end;
}

function redactJsonFields(text) {
  // Read JSON string tokens and balanced values rather than matching value text
  // with a regexp. This also works for JSON embedded in chat/log context, keeps
  // harmless formatting intact, and uses no recursion for nested containers.
  const chunks = [];
  let copied = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue;
    const end = jsonStringEnd(text, i);
    let colon = end;
    while (/\s/.test(text[colon] || '') && colon < text.length) colon++;
    if (text[colon] !== ':') { i = end - 1; continue; }
    let key;
    try { key = JSON.parse(text.slice(i, end)); } catch { i = end - 1; continue; }
    if (!sensitiveJsonKey(key)) { i = end - 1; continue; }
    let start = colon + 1;
    while (start < text.length && /\s/.test(text[start])) start++;
    const valueEnd = jsonValueEnd(text, start);
    if (valueEnd === start) { i = end - 1; continue; }
    chunks.push(text.slice(copied, start), '"[REDACTED]"');
    copied = valueEnd;
    i = valueEnd - 1;
  }
  return chunks.length ? chunks.join('') + text.slice(copied) : text;
}

export function isSensitiveFilename(name = '') {
  const normalized = String(name || '').replace(/\\/g, '/');
  const base = normalized.split('/').pop() || '';
  return SENSITIVE_BASENAMES.some((re) => re.test(base)) || SENSITIVE_EXTENSIONS.test(base);
}

export function redactSecrets(value = '') {
  let text = String(value || '');
  if (!text) return text;

  // Decode credential property names and remove complete values before other
  // filters can alter escape sequences or quoted strings.
  text = redactJsonFields(text);

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

  // URLs containing embedded credentials.
  text = text.replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)([^\s@/]+)(@)/gi, '$1[REDACTED]$3');
  return text;
}

export function safeExtractedText(text, filename = '') {
  if (isSensitiveFilename(filename)) return '[Sensitive configuration/credential file omitted from AI context.]';
  return redactSecrets(text);
}
