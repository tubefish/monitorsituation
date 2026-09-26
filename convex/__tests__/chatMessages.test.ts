import { convexTest } from 'convex-test';
import { describe, expect, test } from 'vitest';
import { api } from '../_generated/api';
import schema from '../schema';

const modules = import.meta.glob('../**/*.ts');
const alice = { subject: 'alice', tokenIdentifier: 'clerk|alice', name: 'Alice', pictureUrl: 'https://example.org/avatar.png' };
const bob = { subject: 'bob', tokenIdentifier: 'clerk|bob', name: 'Bob' };
const page = { paginationOpts: { cursor: null, numItems: 30 } };

describe('Global Chat access', () => {
  test('requires authentication to read or post and prevents deleting another member’s message', async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.chatMessages.list, page)).rejects.toThrow(/Sign in/);
    await expect(t.mutation(api.chatMessages.send, { body: 'Hello' })).rejects.toThrow(/Sign in/);

    await t.withIdentity(alice).mutation(api.chatMessages.send, { body: 'Hello' });
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
    await t.withIdentity(bob).mutation(api.chatMessages.send, { body: 'Replying', replyTo: id });
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
    await expect(asAlice.mutation(api.chatMessages.send, { body: ' ' })).rejects.toThrow(/1–500/);
    await expect(asAlice.mutation(api.chatMessages.send, { body: 'x'.repeat(501) })).rejects.toThrow(/1–500/);
    for (let i = 0; i < 5; i++) await asAlice.mutation(api.chatMessages.send, { body: `Message ${i}` });
    await expect(asAlice.mutation(api.chatMessages.send, { body: 'Sixth' })).rejects.toThrow(/too quickly/);
    expect((await asAlice.query(api.chatMessages.list, page)).page).toHaveLength(5);
  });
});
