/// <reference types="node" />
import { createHmac, randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  isStale,
  parseDodo,
  parseRazorpay,
  timingSafeEqual,
  verifyRazorpay,
  verifyStandardWebhook,
} from '@/features/billing/webhook';

const USER = '11111111-1111-4111-8111-111111111111';

describe('verifyRazorpay', () => {
  const secret = 'rzp_webhook_secret';
  const body = JSON.stringify({ event: 'subscription.charged', payload: {} });
  // Independent reference implementation: Node's crypto.
  const good = createHmac('sha256', secret).update(body).digest('hex');

  it('accepts a valid signature', async () => {
    expect(await verifyRazorpay(body, good, secret)).toBe(true);
  });
  it('rejects a tampered body, a wrong secret, junk and missing headers', async () => {
    expect(await verifyRazorpay(body + ' ', good, secret)).toBe(false);
    expect(await verifyRazorpay(body, good, 'other')).toBe(false);
    expect(await verifyRazorpay(body, 'zz', secret)).toBe(false);
    expect(await verifyRazorpay(body, null, secret)).toBe(false);
    expect(await verifyRazorpay(body, good, '')).toBe(false);
  });
});

describe('verifyStandardWebhook (Dodo)', () => {
  const key = randomBytes(24);
  const secret = `whsec_${key.toString('base64')}`;
  const body = JSON.stringify({ type: 'subscription.active', data: {} });
  const id = 'msg_123';
  const now = 1_760_000_000;
  const sign = (ts: number, b = body) => createHmac('sha256', key).update(`${id}.${ts}.${b}`).digest('base64');

  it('accepts a valid v1 signature, even among several entries', async () => {
    const sig = `v1,bogus= v1,${sign(now)}`;
    expect(await verifyStandardWebhook(body, { id, timestamp: String(now), signature: sig }, secret, now)).toBe(true);
  });
  it('rejects replays outside 5 minutes and tampered bodies', async () => {
    const old = now - 301;
    expect(
      await verifyStandardWebhook(body, { id, timestamp: String(old), signature: `v1,${sign(old)}` }, secret, now),
    ).toBe(false);
    expect(
      await verifyStandardWebhook(
        body + 'x',
        { id, timestamp: String(now), signature: `v1,${sign(now)}` },
        secret,
        now,
      ),
    ).toBe(false);
  });
  it('rejects other versions, missing headers and a bad secret', async () => {
    expect(
      await verifyStandardWebhook(body, { id, timestamp: String(now), signature: `v2,${sign(now)}` }, secret, now),
    ).toBe(false);
    expect(
      await verifyStandardWebhook(
        body,
        { id: null, timestamp: String(now), signature: `v1,${sign(now)}` },
        secret,
        now,
      ),
    ).toBe(false);
    expect(
      await verifyStandardWebhook(body, { id, timestamp: String(now), signature: `v1,${sign(now)}` }, 'whsec_###', now),
    ).toBe(false);
  });
});

describe('timingSafeEqual', () => {
  it('compares bytes', () => {
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(timingSafeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false);
  });
});

describe('parseRazorpay', () => {
  const event = (name: string, notes: Record<string, string> = { user_id: USER, plan: 'yearly' }) => ({
    entity: 'event',
    event: name,
    created_at: 1_760_000_000,
    payload: {
      subscription: {
        entity: { id: 'sub_ABC', plan_id: 'plan_Y', status: 'active', current_end: 1_791_536_000, notes },
      },
    },
  });

  it('recognises the trainer plan from notes or plan id', () => {
    expect(parseRazorpay(event('subscription.charged', { user_id: USER, plan: 'coach' }), {})?.plan).toBe('coach');
    expect(parseRazorpay(event('subscription.charged', { user_id: USER }), { coach: 'plan_Y' })?.plan).toBe('coach');
  });

  it('maps charged → active with period end, user and plan from notes', () => {
    expect(parseRazorpay(event('subscription.charged'), {})).toEqual({
      provider: 'razorpay',
      event: 'subscription.charged',
      ref: 'sub_ABC',
      user_id: USER,
      plan: 'yearly',
      status: 'active',
      current_period_end: new Date(1_791_536_000 * 1000).toISOString(),
      event_at: new Date(1_760_000_000 * 1000).toISOString(),
    });
  });
  it('maps halted / cancelled / completed', () => {
    expect(parseRazorpay(event('subscription.halted'), {})?.status).toBe('halted');
    expect(parseRazorpay(event('subscription.cancelled'), {})?.status).toBe('cancelled');
    expect(parseRazorpay(event('subscription.completed'), {})?.status).toBe('expired');
  });
  it('falls back to plan ids and ignores non-UUID user ids', () => {
    const e = parseRazorpay(event('subscription.activated', { user_id: 'nope' }), { yearly: 'plan_Y' });
    expect(e).toMatchObject({ plan: 'yearly', user_id: null });
  });
  it('ignores unrelated events', () => {
    expect(parseRazorpay({ event: 'payment.captured', payload: {} }, {})).toBeNull();
    expect(parseRazorpay('garbage', {})).toBeNull();
  });
});

describe('parseDodo', () => {
  const event = (type: string, data: Record<string, unknown> = {}) => ({
    business_id: 'bus_1',
    type,
    timestamp: '2026-10-15T10:00:00Z',
    data: {
      payload_type: 'Subscription',
      subscription_id: 'sub_dodo_1',
      product_id: 'pdt_M',
      status: 'active',
      next_billing_date: '2026-11-15T10:00:00Z',
      metadata: { user_id: USER },
      ...data,
    },
  });

  it('maps active / renewed → active with plan from the product id', () => {
    expect(parseDodo(event('subscription.active'), { monthly: 'pdt_M' })).toMatchObject({
      provider: 'dodo',
      ref: 'sub_dodo_1',
      user_id: USER,
      plan: 'monthly',
      status: 'active',
      current_period_end: '2026-11-15T10:00:00Z',
      event_at: '2026-10-15T10:00:00Z',
    });
    expect(parseDodo(event('subscription.renewed'), {})?.status).toBe('active');
  });
  it('maps on_hold, cancelled, expired and status-carrying updates', () => {
    expect(parseDodo(event('subscription.on_hold'), {})?.status).toBe('halted');
    expect(parseDodo(event('subscription.cancelled'), {})?.status).toBe('cancelled');
    expect(parseDodo(event('subscription.expired'), {})?.status).toBe('expired');
    expect(parseDodo(event('subscription.updated', { status: 'on_hold' }), {})?.status).toBe('halted');
  });
  it('works without metadata (user resolved later from provider_ref)', () => {
    expect(parseDodo(event('subscription.active', { metadata: undefined }), {})?.user_id).toBeNull();
  });
  it('ignores payment events and malformed payloads', () => {
    expect(parseDodo({ type: 'payment.succeeded', data: {} }, {})).toBeNull();
    expect(parseDodo(null, {})).toBeNull();
  });
});

describe('isStale', () => {
  it('skips events older than the stored state', () => {
    const e = parseDodo(
      { type: 'subscription.active', timestamp: '2026-10-15T10:00:00Z', data: { subscription_id: 's' } },
      {},
    )!;
    expect(isStale(e, '2026-10-15T11:00:00Z')).toBe(true);
    expect(isStale(e, '2026-10-15T09:00:00Z')).toBe(false);
    expect(isStale(e, null)).toBe(false);
  });
});
