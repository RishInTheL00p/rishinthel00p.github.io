import { z } from 'zod';

// Characters that must never reach an email header or log line.
const LINE_BREAK = /[\r\n\u2028\u2029]/;
// Control characters other than tab and newline (for the multi-line message).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** @param {number} max */
const singleLine = (max) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((s) => !LINE_BREAK.test(s) && !CONTROL.test(s), 'must be a single line of plain text');

/** Contact form payload. Strict: unknown keys are rejected. */
export const ContactSchema = z.strictObject({
  name: singleLine(100),
  email: z.email().max(254).refine((s) => !LINE_BREAK.test(s), 'invalid email'),
  message: z
    .string()
    .trim()
    .min(20)
    .max(2000)
    .refine((s) => !CONTROL.test(s), 'must be plain text'),
  // Honeypot: hidden from people, often filled by bots. Must be empty.
  website: z.string().max(200),
  token: z.string().min(1).max(2048),
});

/** @typedef {z.infer<typeof ContactSchema>} ContactPayload */
