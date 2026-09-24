const RESEND_EMAILS = 'https://api.resend.com/emails';

/**
 * Sends a plain-text email through Resend's REST API. The recipient always
 * comes from server configuration, so this can't be used as an open relay.
 * Throws on network errors, timeouts or non-2xx responses.
 * @param {{ apiKey: string, from: string, to: string, replyTo: string, subject: string, text: string,
 *           fetchImpl?: typeof fetch, timeoutMs?: number }} args
 */
export async function sendMail({ apiKey, from, to, replyTo, subject, text, fetchImpl = fetch, timeoutMs = 8000 }) {
  const res = await fetchImpl(RESEND_EMAILS, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject, text }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`resend HTTP ${res.status}`);
}
