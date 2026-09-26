import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from '../_generated/api';
import schema from '../schema';

const modules = import.meta.glob('../**/*.ts');
const alice = { subject: 'alice', tokenIdentifier: 'clerk|alice', name: 'Alice', pictureUrl: 'https://example.org/avatar.png' };
const bob = { subject: 'bob', tokenIdentifier: 'clerk|bob', name: 'Bob' };
const page = { room: 'global' as const, paginationOpts: { cursor: null, numItems: 30 } };

describe('Global Chat access', () => {
  test('requires authentication to read or post and prevents deleting another member’s message', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.chatMessages.list, page)).rejects.toThrow(/Sign in/);
    await expect(t.mutation(api.chatMessages.send, { room: 'global', body: 'Hello' })).rejects.toThrow(/Sign in/);

    await t.withIdentity(alice).mutation(api.chatMessages.send, { room: 'global', body: 'Hello' });
    const result = await t.withIdentity(bob).query(api.chatMessages.list, page);
    expect(result.page).toHaveLength(1);
    expect(result.page[0]).toMatchObject({ displayName: 'Alice', body: 'Hello', avatarUrl: alice.pictureUrl });
    const id = result.page[0]!._id;
    await t.withIdentity(alice).mutation(api.chatMessages.setMyProfile, {
      displayName: 'AliceNew', avatarUrl: 'https://img.clerk.com/alice.png',
    });
    expect((await t.withIdentity(bob).query(api.chatMessages.list, page)).page[0]).toMatchObject({
      displayName: 'AliceNew', avatarUrl: 'https://img.clerk.com/alice.png',
    });
    await t.withIdentity(bob).mutation(api.chatMessages.setMyProfile, { displayName: 'Bob' });
    await t.withIdentity(bob).mutation(api.chatMessages.send, { room: 'global', body: 'Replying', replyTo: id });
    expect((await t.withIdentity(alice).query(api.chatMessages.list, page)).page[0]).toMatchObject({
      displayName: 'Bob', replyTo: id, replyDisplayName: 'AliceNew', replyExcerpt: 'Hello',
    });
    await expect(t.withIdentity(bob).mutation(api.chatMessages.remove, { id })).rejects.toThrow(/unavailable/);
    await t.withIdentity(alice).mutation(api.chatMessages.remove, { id });
    expect((await t.withIdentity(bob).query(api.chatMessages.list, page)).page).toHaveLength(1);
  });

  test('enforces message length and the five messages per ten seconds limit', async () => {
    const t = convexTest(schema, modules);
    const asAlice = t.withIdentity(alice);
    await expect(asAlice.mutation(api.chatMessages.send, { room: 'global', body: ' ' })).rejects.toThrow(/1–500/);
    await expect(asAlice.mutation(api.chatMessages.send, { room: 'global', body: 'x'.repeat(501) })).rejects.toThrow(/1–500/);
    for (let i = 0; i < 5; i++) await asAlice.mutation(api.chatMessages.send, { room: 'global', body: `Message ${i}` });
    await expect(asAlice.mutation(api.chatMessages.send, { room: 'global', body: 'Sixth' })).rejects.toThrow(/too quickly/);
    expect((await asAlice.query(api.chatMessages.list, page)).page).toHaveLength(5);
  });

  test('keeps room histories separate, ties presence to identity, and rejects cross-room replies', async () => {
    const t = convexTest(schema, modules);
    const asAlice = t.withIdentity(alice);
    await expect(t.mutation(api.chatMessages.heartbeat, { room: 'global' })).rejects.toThrow(/Sign in/);
    await asAlice.mutation(api.chatMessages.heartbeat, { room: 'global' });
    expect(await t.query(api.chatMessages.countOnline, { room: 'global', refresh: 0 })).toBe(1);
    await asAlice.mutation(api.chatMessages.send, { room: 'global', body: 'Hello global' });
    const id = (await asAlice.query(api.chatMessages.list, page)).page[0]!._id;
    await asAlice.mutation(api.chatMessages.heartbeat, { room: 'crypto' });
    expect(await t.query(api.chatMessages.countOnline, { room: 'global', refresh: 1 })).toBe(0);
    expect(await t.query(api.chatMessages.countOnline, { room: 'crypto', refresh: 1 })).toBe(1);
    await asAlice.mutation(api.chatMessages.send, { room: 'crypto', body: 'Hello crypto' });
    expect((await asAlice.query(api.chatMessages.list, page)).page).toHaveLength(1);
    expect((await asAlice.query(api.chatMessages.list, { ...page, room: 'crypto' })).page).toHaveLength(1);
    await expect(asAlice.mutation(api.chatMessages.send, { room: 'markets', body: 'Wrong room', replyTo: id }))
      .rejects.toThrow(/same room/);
  });
});
