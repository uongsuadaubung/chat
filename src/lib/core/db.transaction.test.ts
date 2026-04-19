// tests/db.transaction.test.ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '$lib/core/db';

describe('Transactional Outbox Database', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });

  it('should have transactional_outbox table', async () => {
    const tables = db.tables.map((t) => t.name);
    expect(tables).toContain('transactional_outbox');
  });
});
