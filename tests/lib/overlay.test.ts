import { describe, expect, it } from 'vitest';

import { applyOp, overlay, type OutboxItem, type OutboxOp } from '@/lib/outbox';

const item = (op: OutboxOp): OutboxItem => ({ id: crypto.randomUUID(), op, created_at: 0, attempts: 0, next_at: 0 });

describe('local-first rows', () => {
  it('upserts by primary key, including composite keys', () => {
    const rows = [{ user_id: 'u', date: '2026-10-01', steps: 4000 }];
    const out = applyOp(rows, {
      kind: 'upsert',
      table: 'activity_days',
      rows: [{ user_id: 'u', date: '2026-10-01', steps: 9000 }],
    });
    expect(out).toEqual([{ user_id: 'u', date: '2026-10-01', steps: 9000 }]);
    expect(
      applyOp(out, { kind: 'upsert', table: 'activity_days', rows: [{ user_id: 'u', date: '2026-10-02', steps: 1 }] }),
    ).toHaveLength(2);
  });

  it('overlays queued writes for the table in order and marks them pending', () => {
    const server = [
      { id: 'a', value: 1 },
      { id: 'b', value: 1 },
    ];
    const queue = [
      item({ kind: 'upsert', table: 'habit_logs', rows: [{ id: 'c', value: 2 }] }),
      item({ kind: 'delete', table: 'habit_logs', match: { id: 'a' } }),
      item({ kind: 'upsert', table: 'runs', rows: [{ id: 'z' }] }),
      item({ kind: 'delete-meal', mealId: 'm' }),
    ];
    expect(overlay('habit_logs', server, queue)).toEqual([
      { id: 'b', value: 1 },
      { id: 'c', value: 2, pending: true },
    ]);
  });
});
