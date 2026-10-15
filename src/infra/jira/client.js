import { loadCredentials } from '../storage/credentials.js';

const TIMEOUT_MS = 10_000;

export class JiraError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'JiraError';
    this.status = status;
  }
}

export async function request(path, { method = 'GET', body } = {}) {
  const { baseUrl, email, token } = loadCredentials();
  const auth = Buffer.from(`${email}:${token}`).toString('base64');

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new JiraError(res.status, `Jira respondeu ${res.status} em ${method} ${path}: ${text.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}
