// server-shared: scan / text-log quota and rate-limit decisions (docs: Free vs Pro + Build decisions).
import type { ErrorCode } from '../../types/meal.ts';

export type Limits = {
  freeScansPerDay: number;
  proScansSoftCap: number;
  freeTextLogsPerDay: number;
  proTextLogsSoftCap: number;
};
export type UsageToday = { scans: number; text_logs: number; last_request_at: string | null };

export const DEFAULT_LIMITS: Limits = {
  freeScansPerDay: 1,
  proScansSoftCap: 30,
  freeTextLogsPerDay: 10,
  proTextLogsSoftCap: 100,
};
export const MIN_INTERVAL_MS = 3000;

/**
 * null = allowed. Free users over their limit get NEEDS_PRO (opens the paywall);
 * Pro users over the soft cap get QUOTA_EXCEEDED; anyone faster than 1 req / 3 s gets RATE_LIMITED.
 */
export function checkQuota(
  kind: 'scan' | 'text',
  usage: UsageToday | null,
  isPro: boolean,
  now: Date,
  limits: Limits = DEFAULT_LIMITS,
): ErrorCode | null {
  if (usage?.last_request_at && now.getTime() - Date.parse(usage.last_request_at) < MIN_INTERVAL_MS)
    return 'RATE_LIMITED';
  const used = kind === 'scan' ? (usage?.scans ?? 0) : (usage?.text_logs ?? 0);
  if (isPro)
    return used >= (kind === 'scan' ? limits.proScansSoftCap : limits.proTextLogsSoftCap) ? 'QUOTA_EXCEEDED' : null;
  return used >= (kind === 'scan' ? limits.freeScansPerDay : limits.freeTextLogsPerDay) ? 'NEEDS_PRO' : null;
}

/** Reads limits from env (Edge Function secrets); FREE_SCANS_PER_DAY is the doc's single setting. */
export function limitsFromEnv(get: (k: string) => string | undefined): Limits {
  const n = (k: string, d: number) => {
    const v = Number(get(k));
    return Number.isFinite(v) && v >= 0 && get(k) !== undefined && get(k) !== '' ? v : d;
  };
  return {
    freeScansPerDay: n('FREE_SCANS_PER_DAY', DEFAULT_LIMITS.freeScansPerDay),
    proScansSoftCap: n('PRO_SCANS_SOFT_CAP', DEFAULT_LIMITS.proScansSoftCap),
    freeTextLogsPerDay: n('FREE_TEXT_LOGS_PER_DAY', DEFAULT_LIMITS.freeTextLogsPerDay),
    proTextLogsSoftCap: n('PRO_TEXT_LOGS_SOFT_CAP', DEFAULT_LIMITS.proTextLogsSoftCap),
  };
}
