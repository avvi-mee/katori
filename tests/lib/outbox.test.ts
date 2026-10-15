import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  backoff,
  clearOutbox,
  enqueue,
  flush,
  listOutbox,
  PermanentError,
  useOutbox,
  type OutboxOp,
} from '@/lib/outbox';

const save = (n: number): OutboxOp => ({ kind: 'confirm-meal', body: { client_id: `c${n}` }, pending: null });

beforeEach(async () => {
  await clearOutbox();
});

describe('outbox', () => {
  it('keeps ops in order and exposes them to the UI', async () => {
    await enqueue(save(1), 1000);
    await enqueue({ kind: 'delete-meal', mealId: 'm1' }, 2000);
    expect((await listOutbox()).map((i) => i.op.kind)).toEqual(['confirm-meal', 'delete-meal']);
    expect(useOutbox.getState().items).toHaveLength(2);
  });

  it('replays everything once the network is back', async () => {
    await enqueue(save(1), 1000);
    await enqueue(save(2), 1001);
    const seen: string[] = [];
    const r = await flush(async (op) => {
      if (op.kind === 'confirm-meal') seen.push(op.body.client_id as string);
    }, 5000);
    expect(r).toEqual({ sent: 2, dropped: 0, remaining: 0 });
    expect(seen).toEqual(['c1', 'c2']);
  });

  it('stops on a transient failure and retries later with backoff (nothing is lost)', async () => {
    await enqueue(save(1), 1000);
    await enqueue(save(2), 1001);
    const r = await flush(async () => {
      throw new Error('offline');
    }, 5000);
    expect(r).toEqual({ sent: 0, dropped: 0, remaining: 2 });
    const [first, second] = await listOutbox();
    expect(first).toMatchObject({ attempts: 1, next_at: 5000 + backoff(1) });
    expect(second).toMatchObject({ attempts: 0 });
    // Not due yet: nothing is sent.
    expect((await flush(async () => undefined, 5001)).sent).toBe(1); // second op is due, first is not
    expect((await flush(async () => undefined, 5000 + backoff(1))).sent).toBe(1);
    expect(await listOutbox()).toEqual([]);
  });

  it('drops ops that can never succeed', async () => {
    await enqueue(save(1), 1000);
    await enqueue(save(2), 1001);
    const r = await flush(async (op) => {
      if (op.kind === 'confirm-meal' && op.body.client_id === 'c1') throw new PermanentError('expired draft');
    }, 5000);
    expect(r).toEqual({ sent: 1, dropped: 1, remaining: 0 });
  });

  it('never runs two flushes at once', async () => {
    await enqueue(save(1), 1000);
    let calls = 0;
    const send = async () => {
      calls++;
      await new Promise((res) => setTimeout(res, 20));
    };
    await Promise.all([flush(send, 5000), flush(send, 5000)]);
    expect(calls).toBe(1);
  });

  it('caps backoff at 10 minutes', () => {
    expect(backoff(1)).toBe(5000);
    expect(backoff(2)).toBe(10000);
    expect(backoff(20)).toBe(600000);
  });
});
