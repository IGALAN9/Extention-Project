const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const compile = (file) => ts.transpileModule(readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const actionCode = compile('utils/extension-action.ts');
const popupCode = compile('entrypoints/popup/App.tsx');
const validationModule = { exports: {} };
vm.runInNewContext(compile('utils/auto-content.ts'), { exports: validationModule.exports, URL });

function loadAction(browser) {
  const mod = { exports: {} };
  vm.runInNewContext(actionCode, {
    exports: mod.exports,
    require: (name) => {
      assert.equal(name, 'wxt/browser');
      return { browser };
    },
  });
  return mod.exports;
}

test('badge memakai action pada MV3 dan browserAction pada Firefox/MV2', async () => {
  for (const key of ['action', 'browserAction']) {
    const calls = [];
    const api = {
      async setBadgeText(value) { assert.equal(this, api); calls.push(value.text); },
      async setBadgeBackgroundColor(value) { assert.equal(this, api); calls.push(value.color); },
    };
    const { setExtensionBadge } = loadAction({ [key]: api });
    await setExtensionBadge('1', '#ff5a17');
    await setExtensionBadge('');
    assert.deepEqual(calls, ['1', '#ff5a17', '']);
  }
});

test('action diprioritaskan jika kedua API tersedia', async () => {
  const calls = [];
  const api = (name) => ({ setBadgeText: async () => { calls.push(name); } });
  await loadAction({ action: api('action'), browserAction: api('browserAction') }).setExtensionBadge('');
  assert.deepEqual(calls, ['action']);
});

test('API badge tidak ada atau gagal tidak melempar error ke pemanggil', async () => {
  for (const browser of [
    {},
    { browserAction: { setBadgeText() { throw new Error('API invalidated'); } } },
    { action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => { throw new Error('Badge gagal'); } } },
  ]) {
    await assert.doesNotReject(loadAction(browser).setExtensionBadge('1', '#2563eb'));
  }
});

for (const key of ['action', 'browserAction', 'missing', 'rejecting']) {
  test(`inisialisasi popup tidak crash: ${key}`, async () => {
    // Jalankan komponen dan efek mount aslinya dengan API browser terkontrol.
    // Kasus browserAction sengaja tidak menyediakan action, seperti Firefox/MV2.
    const effects = [];
    const messages = [];
    const badges = [];
    const listeners = [];
    const browser = {
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener: (fn) => { listeners.push(fn); }, removeListener() {} },
      },
      runtime: { sendMessage: async (message) => { messages.push(message.type); return { online: false }; } },
    };
    if (key !== 'missing') browser[key === 'rejecting' ? 'browserAction' : key] = {
      setBadgeText: async ({ text }) => {
        if (key === 'rejecting') throw new Error('Badge tidak tersedia');
        badges.push(text);
      },
    };
    const mod = { exports: {} };
    vm.runInNewContext(popupCode, {
      exports: mod.exports,
      browser,
      URL,
      require: (name) => {
        if (name === 'react') return {
          useState: (value) => [value, () => {}],
          useRef: () => ({ current: null }),
          useEffect: (effect) => { effects.push(effect); },
        };
        if (name === 'react/jsx-runtime') return require(name);
        if (name === './AboutPage') return { default: () => null };
        if (name === '../../utils/auto-content') return validationModule.exports;
        if (name === '../../utils/extension-action') return loadAction(browser);
        assert.equal(name, './App.css');
        return {};
      },
    });
    const tree = mod.exports.default();
    assert.equal(tree.type, 'main');
    assert.doesNotThrow(() => effects.forEach((effect) => effect()));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(messages, ['GET_API_STATUS']);
    assert.equal(listeners.length, 1);
    assert.deepEqual(badges, key === 'action' || key === 'browserAction' ? [''] : []);
  });
}
