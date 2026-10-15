import { FunctionsHttpError } from '@supabase/supabase-js';

import type { ErrorCode } from '@/types/meal';

import { t, type MessageKey } from './i18n';
import { supabase } from './supabase';

export type ApiCode = ErrorCode | 'BAD_REQUEST' | 'NOT_FOUND' | 'INTERNAL' | 'NETWORK';

export class ApiError extends Error {
  constructor(
    public code: ApiCode,
    message: string,
  ) {
    super(message);
  }
}

/** Calls an Edge Function and turns its { error: { code, message } } contract into ApiError. */
export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body: body as Record<string, unknown> });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    const payload = await error.context
      .json()
      .catch(() => null as { error?: { code?: ApiCode; message?: string } } | null);
    throw new ApiError(payload?.error?.code ?? 'INTERNAL', payload?.error?.message ?? error.message);
  }
  throw new ApiError('NETWORK', error.message);
}

const KNOWN = new Set<ApiCode>([
  'UNAUTHENTICATED',
  'QUOTA_EXCEEDED',
  'NEEDS_PRO',
  'BAD_IMAGE',
  'AI_UNAVAILABLE',
  'RATE_LIMITED',
  'NETWORK',
  'NOT_FOUND',
]);

/** Designed copy for each error code — never a raw server message. */
export function errorText(e: unknown): string {
  const code = e instanceof ApiError ? e.code : null;
  return code && KNOWN.has(code) ? t(`err.${code}` as MessageKey) : t('err.generic');
}

export const errorCode = (e: unknown): ApiCode => (e instanceof ApiError ? e.code : 'INTERNAL');
