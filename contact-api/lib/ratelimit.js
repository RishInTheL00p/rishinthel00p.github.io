import { createHmac } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Keyed hash of the client IP, so raw IPs are never stored or logged.
 * @param {string} ip
 * @param {string} salt
 */
export function hashIp(ip, salt) {
  return createHmac('sha256', salt).update(ip || 'unknown').digest('hex');
}

/**
 * @typedef {{ success: boolean, reset: number }} LimitResult
 * @typedef {(ipHash: string) => Promise<LimitResult>} Limiter
 */

/**
 * Two limits, both must pass: 3 messages per 10 minutes per client, and 20 per
 * day across everyone (protects the inbox and the free email quota).
 * @param {{ url: string, token: string }} redisConfig
 * @returns {Limiter}
 */
export function createLimiter({ url, token }) {
  const redis = new Redis({ url, token });
  const perClient = new Ratelimit({
    redis,
    prefix: 'contact:ip',
    limiter: Ratelimit.slidingWindow(3, '10 m'),
    analytics: false,
  });
  const global = new Ratelimit({
    redis,
    prefix: 'contact:all',
    limiter: Ratelimit.fixedWindow(20, '1 d'),
    analytics: false,
  });
  return async (ipHash) => {
    const client = await perClient.limit(ipHash);
    if (!client.success) return { success: false, reset: client.reset };
    const all = await global.limit('global');
    return { success: all.success, reset: all.reset };
  };
}
