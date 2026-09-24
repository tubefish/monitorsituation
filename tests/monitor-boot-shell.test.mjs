import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { brotliDecompressSync } from 'node:zlib';
import { Window } from 'happy-dom';

test('production output is branded before JavaScript and preserves the app mount', () => {
  const dir = mkdtempSync(join(tmpdir(), 'monitor-boot-'));
  try {
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist/dashboard.html'), readFileSync(new URL('../index.html', import.meta.url)));
    execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/monitor-postbuild.mjs', import.meta.url))], { cwd: dir });
    const html = readFileSync(join(dir, 'dist/index.html'), 'utf8');
    assert.equal(html, readFileSync(join(dir, 'dist/dashboard.html'), 'utf8'));
    for (const file of ['index.html.br', 'dashboard.html.br']) {
      assert.equal(brotliDecompressSync(readFileSync(join(dir, 'dist', file))).toString(), html);
    }
    const dom = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } });
    const doc = new dom.DOMParser().parseFromString(html, 'text/html');
    assert.equal(doc.title, '$MONITOR - Monitor the Situation');
    assert.equal(doc.querySelectorAll('#app').length, 1);
    assert.equal(doc.querySelector('#app .skeleton-brand').textContent, '$MONITOR');
    assert.doesNotMatch(doc.body.textContent, /World Monitor|WorldMonitor|Dashboard shell loading/);
    assert.ok(doc.querySelector('#country-deep-dive-panel'));
    assert.ok(doc.querySelector('script[type="module"]'));
    assert.deepEqual([...doc.querySelectorAll('.monitor-boot-nav button')].map(button => button.dataset.mobileTab), ['map', 'today', 'markets', 'more']);
    assert.ok([...doc.querySelectorAll('.monitor-boot-nav button')].every(button => button.disabled));

    const mapScript = html.match(/<script data-wm-map-prepaint>([\s\S]*?)<\/script>/)[1];
    const classes = new Set(['wm-map-collapsed']);
    vm.runInNewContext(mapScript, { document: { documentElement: { classList: { remove: name => classes.delete(name) } } } });
    assert.equal(classes.has('wm-map-collapsed'), false, 'map-first boot must not collapse before the app expands it');

    const script = html.match(/<script data-wm-prepaint>([\s\S]*?)<\/script>/)[1];
    for (const preference of ['dark', 'light', null, 'invalid', 'blocked']) {
      const root = { dataset: { theme: 'light' }, removeAttribute() {}, classList: { add() {} }, style: { setProperty() {} } };
      const storage = { getItem(key) { if (preference === 'blocked') throw new Error('Storage disabled'); return key === 'worldmonitor-theme' ? preference : null; } };
      vm.runInNewContext(script, { document: { documentElement: root }, location: { hostname: 'www.monitorsituation.xyz' }, localStorage: storage, window: {} });
      assert.equal(root.dataset.theme, preference === 'dark' ? 'dark' : 'light');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
