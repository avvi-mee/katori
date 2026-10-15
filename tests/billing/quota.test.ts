import { describe, expect, it } from 'vitest';

import { checkQuota, DEFAULT_LIMITS, limitsFromEnv } from '@/features/billing/quota';

const now = new Date('2026-10-15T10:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

describe('checkQuota', () => {
  it('gives free users exactly FREE_SCANS_PER_DAY = 1 scan', () => {
    expect(DEFAULT_LIMITS.freeScansPerDay).toBe(1);
    expect(checkQuota('scan', null, false, now)).toBeNull();
    expect(checkQuota('scan', { scans: 1, text_logs: 0, last_request_at: ago(60_000) }, false, now)).toBe('NEEDS_PRO');
  });

  it('lets Pro scan up to the soft cap', () => {
    expect(checkQuota('scan', { scans: 29, text_logs: 0, last_request_at: ago(60_000) }, true, now)).toBeNull();
    expect(checkQuota('scan', { scans: 30, text_logs: 0, last_request_at: ago(60_000) }, true, now)).toBe(
      'QUOTA_EXCEEDED',
    );
  });

  it('rate-limits to one request per 3 seconds for everyone', () => {
    expect(checkQuota('scan', { scans: 0, text_logs: 0, last_request_at: ago(2000) }, true, now)).toBe('RATE_LIMITED');
    expect(checkQuota('text', { scans: 0, text_logs: 0, last_request_at: ago(3001) }, false, now)).toBeNull();
  });

  it('counts text logs separately from scans', () => {
    expect(checkQuota('text', { scans: 1, text_logs: 9, last_request_at: null }, false, now)).toBeNull();
    expect(checkQuota('text', { scans: 0, text_logs: 10, last_request_at: null }, false, now)).toBe('NEEDS_PRO');
  });
});

describe('limitsFromEnv', () => {
  it('reads overrides and ignores junk', () => {
    const env: Record<string, string> = {
      FREE_SCANS_PER_DAY: '3',
      PRO_SCANS_SOFT_CAP: 'lots',
      FREE_TEXT_LOGS_PER_DAY: '',
    };
    expect(limitsFromEnv((k) => env[k])).toEqual({ ...DEFAULT_LIMITS, freeScansPerDay: 3 });
  });
});
