const CONVENTIONAL_HEADER = /^(\w+(?:\([^)]*\))?!?:\s*)(.*)$/;
const SCISSORS_LINE = /^# -+ >8 -+/;

export function issueKeyRegex(projectKey) {
  return new RegExp(`\\b${projectKey}-\\d+\\b`);
}

export function parseIssueKey(projectKey, token = '') {
  const match = token.trim().toUpperCase().match(new RegExp(`^(?:${projectKey}-)?(\\d+)$`));
  return match ? `${projectKey}-${match[1]}` : null;
}

export function splitConventional(line) {
  const m = line.match(CONVENTIONAL_HEADER);
  return m ? { prefix: m[1], subject: m[2] } : { prefix: '', subject: line };
}

export function commitBody(lines) {
  const out = [];
  for (const line of lines) {
    if (SCISSORS_LINE.test(line)) break;
    if (!line.startsWith('#')) out.push(line);
  }
  return out.join('\n').trim();
}

export function detailLines({ body = '', breaking = '' } = {}) {
  const lines = [];
  const text = body
    .split('|')
    .map((l) => l.trim())
    .filter(Boolean);
  if (text.length) lines.push('', ...text);
  if (breaking) lines.push('', `BREAKING CHANGE: ${breaking}`);
  return lines;
}

export function formatMessage(format, key, line) {
  const { prefix, subject } = splitConventional(line);
  return format.replace('{key}', key).replace('{message}', line).replace('{prefix}', prefix).replace('{subject}', subject);
}

export function keyReserve({ format, projectKey }) {
  return format
    .replace('{prefix}', '')
    .replace('{subject}', '')
    .replace('{message}', '')
    .replace('{key}', `${projectKey}-00000`).length;
}
