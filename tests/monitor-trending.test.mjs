import assert from 'node:assert/strict';
import test from 'node:test';
import { getLongTrending, normalizeLongAssets } from '../api/_monitor-trending-data.js';

const address = (n) => `0x${n.toString(16).padStart(40, '0')}`;
const asset = (n, fdv, symbol = 'LONG') => ({
  asset_address: address(n),
  auction_pool: {
    pool_current_fdv_usd: fdv,
    base_token: { token_symbol: symbol, token_name: 'Long Token', token_image_public_url: 'https://storage.long.xyz/icon.png' },
    quote_token: { token_symbol: 'NVDA' },
  },
});

test('normalizes Long 18-decimal FDV and keeps the highest ten valid assets', () => {
  const assets = Array.from({ length: 12 }, (_, index) => asset(index + 1, `${index + 1}${'0'.repeat(18)}`, `T${index + 1}`));
  assets.push(asset(12, `999${'0'.repeat(18)}`)); // Duplicate must not change the ranking.
  assets.push(asset(100, 'invalid'));
  const tokens = normalizeLongAssets({ data: { Asset: assets } });
  assert.equal(tokens.length, 10);
  assert.equal(tokens[0].symbol, 'T12');
  assert.equal(tokens[0].fdvUsd, 12);
  assert.equal(tokens[0].pair, 'NVDA');
  assert.equal(tokens.at(-1).fdvUsd, 3);
});

test('rejects malformed upstream data and fails closed on GraphQL errors', async () => {
  assert.throws(() => normalizeLongAssets({ data: {} }), /Invalid LONG/);
  await assert.rejects(
    getLongTrending('test-key', async (_url, options) => {
      assert.equal(options.headers['X-Api-Key'], 'test-key');
      assert.equal(JSON.parse(options.body).variables.where.chain_id._eq, 4663);
      return { ok: true, json: async () => ({ errors: [{ message: 'Forbidden' }] }) };
    }),
    /GraphQL query failed/,
  );
});
