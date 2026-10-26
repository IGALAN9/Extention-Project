const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const compile = (file) => ts.transpileModule(readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const validationModule = { exports: {} };
vm.runInNewContext(compile('utils/auto-content.ts'), { exports: validationModule.exports, URL });
const validation = validationModule.exports;
const backgroundCode = compile('entrypoints/background.ts');
const shortCaption = 'MBG akhirnya dihentikan';
const validSocialCaption = 'Informasi ini disampaikan secara resmi untuk menjelaskan kondisi terkini masyarakat';
const sender = { tab: { id: 1, url: 'https://x.com/example/status/123' } };
const newsSender = { tab: { id: 1, url: 'https://example.com/artikel' } };
const payload = { label: 'FAKTA', confidence: 0.9, word_scores: [{ word: 'contoh', score: -0.1 }] };

function article(content, url = sender.tab.url) {
  return { success: true, article: { content, title: 'Contoh', url, source: new URL(url).hostname, quality: 'clean', steps: [] } };
}

/** Jalankan handler background asli dengan API browser/model yang terkontrol. */
function createBackground({ extract = () => article(shortCaption), predict, stored = {} } = {}) {
  const state = { extensionEnabled: true, selectedMode: 'auto', ...stored };
  const requests = [];
  const injections = [];
  let listener;
  let badge = '';
  const browser = {
    runtime: { onMessage: { addListener: (fn) => { listener = fn; } } },
    storage: { local: {
      get: async () => ({ ...state }),
      set: async (values) => { Object.assign(state, values); },
      remove: async (key) => { delete state[key]; },
    } },
    scripting: { executeScript: async (options) => {
      injections.push(options);
      return [{ result: await extract(injections.length) }];
    } },
    action: {
      setBadgeText: async ({ text }) => { badge = text; },
      setBadgeBackgroundColor: async () => {},
    },
  };
  vm.runInNewContext(backgroundCode, {
    exports: {}, browser, Error, URL,
    defineBackground: (fn) => fn(),
    require: (name) => {
      assert.equal(name, '../utils/auto-content');
      return validation;
    },
    fetch: async (url, options) => {
      requests.push({ url, text: JSON.parse(options.body).text });
      return predict ? predict() : { ok: true, json: async () => payload };
    },
    // Retry timer tidak perlu menunggu 5 detik pada pengujian terkontrol.
    setTimeout: (fn) => { queueMicrotask(fn); },
  });
  return { state, requests, injections, badge: () => badge, send: (message, source = sender) => listener(message, source) };
}

test('batas Auto artikel: 299 ditolak, 300 diterima, whitespace dinormalisasi', () => {
  assert.match(validation.getAutoContentError('a'.repeat(299)), /299\/300 karakter/);
  assert.equal(validation.getAutoContentError('a'.repeat(300)), '');
  assert.match(validation.getAutoContentError(' '.repeat(500) + shortCaption + '\n'.repeat(300)), /terlalu singkat/);
});

test('batas sosial: 9 kata ditolak dan tepat 10 kata diterima walaupun kurang dari 300 karakter', () => {
  const nineWords = validSocialCaption.split(' ').slice(0, 9).join(' ');
  assert.match(validation.getAutoContentError(nineWords, sender.tab.url), /9\/10 kata/);
  assert.equal(validation.countAutoContentWords(validSocialCaption), 10);
  assert.equal(validation.getAutoContentError(validSocialCaption, sender.tab.url), '');
  assert.ok(validSocialCaption.length < 300);
  assert.match(validation.getAutoContentError('a'.repeat(400), sender.tab.url), /1\/10 kata/);
});

test('Facebook, X/Twitter, Instagram, Threads, dan Reddit memakai batas 10 kata', () => {
  for (const host of ['facebook.com', 'm.facebook.com', 'x.com', 'twitter.com', 'instagram.com', 'threads.net', 'threads.com', 'www.reddit.com']) {
    assert.equal(validation.getAutoContentError(validSocialCaption, 'https://' + host + '/post'), '', host);
    assert.match(validation.getAutoContentError(shortCaption, 'https://' + host + '/post'), /3\/10 kata/, host);
  }
  assert.match(validation.getAutoContentError(validSocialCaption, 'https://turnbackhoax.id/article'), /300 karakter/);
  assert.match(validation.getAutoContentError(validSocialCaption, 'https://facebook.com.example.org/article'), /300 karakter/);
});

test('penghitung kata mengabaikan whitespace berulang, emoji, tanda baca, dan link mandiri', () => {
  const nineWords = validSocialCaption.split(' ').slice(0, 9).join('\n\t ');
  const noisy = '  ' + nineWords + ' !!! 😀 https://t.co/example www.example.com  ';
  assert.equal(validation.countAutoContentWords(noisy), 9);
  assert.match(validation.getAutoContentError(noisy, sender.tab.url), /9\/10 kata/);
});

test('Auto dari halaman menolak caption X pendek dan membersihkan klasifikasi lama', async () => {
  const bg = createBackground({ stored: { lastAutoResult: { text: 'hasil lama' } } });
  const response = await bg.send({ type: 'CHECK_AUTO_FROM_PAGE' });
  assert.equal(response.success, false);
  assert.match(response.error, /terlalu singkat/);
  assert.equal(bg.requests.length, 0);
  assert.equal(bg.injections.length, 1);
  assert.equal(bg.injections[0].args[0], 300);
  assert.equal(bg.injections[0].args[1], 10);
  assert.match(response.error, /3\/10 kata/);
  assert.equal(bg.state.lastAutoResult, null);
  assert.equal(bg.state.autoError, response.error);
  assert.equal(bg.state.autoChecking, false);
  assert.equal(bg.state.autoPageUrl, sender.tab.url);
  assert.equal(bg.badge(), '');
});

test('tombol Periksa halaman ini juga menolak teks 299 karakter sebelum API', async () => {
  const bg = createBackground({ extract: () => article('a'.repeat(299), 'https://example.com') });
  const response = await bg.send({ type: 'CHECK_AUTO_PAGE', tabId: 1, url: 'https://example.com' }, {});
  assert.equal(response.success, false);
  assert.match(bg.state.autoError, /299\/300 karakter/);
  assert.equal(bg.state.autoPageUrl, 'https://example.com');
  assert.equal(bg.requests.length, 0);
});

test('artikel 300 karakter diperiksa dan hasil valid menggantikan pesan error', async () => {
  const content = 'a'.repeat(300);
  const bg = createBackground({ extract: () => article(content, newsSender.tab.url), stored: { autoError: 'error lama' } });
  const response = await bg.send({ type: 'CHECK_AUTO_FROM_PAGE' }, newsSender);
  assert.equal(response.success, true);
  assert.equal(bg.requests.length, 1);
  assert.equal(bg.requests[0].text, content);
  assert.equal(bg.state.lastAutoResult.text, content);
  assert.equal(bg.state.autoError, '');
  assert.equal(bg.state.autoChecking, false);
});

test('caption tepat 10 kata dikirim ke API dari halaman maupun tombol Auto', async () => {
  for (const message of [{ type: 'CHECK_AUTO_FROM_PAGE' }, { type: 'CHECK_AUTO_PAGE', tabId: 1, url: sender.tab.url }]) {
    const bg = createBackground({ extract: () => article(validSocialCaption) });
    const response = await bg.send(message);
    assert.equal(response.success, true);
    assert.equal(bg.requests.length, 1);
    assert.equal(bg.requests[0].text, validSocialCaption);
    assert.equal(bg.state.autoError, '');
  }
});

test('teks yang ditolak extractor tidak dikirim ke model dan pesannya disimpan', async () => {
  const error = validation.getAutoContentError(shortCaption, sender.tab.url);
  const bg = createBackground({ extract: () => ({ success: false, error, retryable: false }) });
  const response = await bg.send({ type: 'CHECK_AUTO_FROM_PAGE' });
  assert.equal(response.error, error);
  assert.equal(bg.state.autoError, error);
  assert.equal(bg.requests.length, 0);
});

test('respons prediksi halaman lama tidak menimpa penolakan halaman baru', async () => {
  let resolvePrediction;
  let notifyPredictionStarted;
  const predictionStarted = new Promise((resolve) => { notifyPredictionStarted = resolve; });
  const prediction = new Promise((resolve) => { resolvePrediction = resolve; });
  const bg = createBackground({
    extract: (attempt) => article(attempt === 1 ? validSocialCaption : shortCaption),
    predict: () => { notifyPredictionStarted(); return prediction; },
  });
  const oldCheck = bg.send({ type: 'CHECK_AUTO_FROM_PAGE' });
  await predictionStarted;
  await bg.send({ type: 'AUTO_PAGE_OPENED' });
  const newCheck = await bg.send({ type: 'CHECK_AUTO_FROM_PAGE' });
  resolvePrediction({ ok: true, json: async () => payload });
  const oldResponse = await oldCheck;
  assert.equal(newCheck.success, false);
  assert.equal(oldResponse.skipped, true);
  assert.equal(bg.state.lastAutoResult, null);
  assert.match(bg.state.autoError, /terlalu singkat/);
  assert.equal(bg.state.autoChecking, false);
  assert.equal(bg.requests.length, 1);
  assert.equal(bg.badge(), '');
});

test('halaman sosial tetap retry saat belum ada konten, lalu memeriksa teks yang memenuhi batas', async () => {
  const bg = createBackground({ extract: (attempt) => attempt === 1
    ? { success: false, retryable: true, error: validation.getAutoContentError('', sender.tab.url) }
    : article(validSocialCaption) });
  const response = await bg.send({ type: 'CHECK_AUTO_FROM_PAGE' });
  assert.equal(response.success, true);
  assert.equal(bg.injections.length, 2);
  assert.equal(bg.requests.length, 1);
});

test('error API pada Auto disimpan, hasil lama dihapus, dan status loading berakhir', async () => {
  const bg = createBackground({ extract: () => article(validSocialCaption), predict: () => { throw new Error('API tidak tersedia'); } });
  const response = await bg.send({ type: 'CHECK_AUTO_FROM_PAGE' });
  assert.equal(response.error, 'API tidak tersedia');
  assert.equal(bg.state.autoError, 'API tidak tersedia');
  assert.equal(bg.state.autoChecking, false);
  assert.equal(bg.state.lastAutoResult, null);
});

test('batas Manual: kosong dan 9 kata ditolak, tepat 10 kata diterima', () => {
  assert.match(validation.getManualContentError(''), /0\/10 kata/);
  assert.match(validation.getManualContentError(' \n\t '), /0\/10 kata/);
  assert.match(validation.getManualContentError(validSocialCaption.split(' ').slice(0, 9).join(' ')), /9\/10 kata/);
  assert.equal(validation.getManualContentError(validSocialCaption), '');
  assert.equal(validation.getManualContentError('a b c d e f g h i j'), '');
  assert.match(validation.getManualContentError('a'.repeat(400)), /1\/10 kata/);
});

test('Manual tidak menghitung whitespace, emoji, tanda baca, atau URL mandiri sebagai kata', () => {
  const nineWords = validSocialCaption.split(' ').slice(0, 9).join('\n\t ');
  assert.match(validation.getManualContentError(nineWords + ' !!! 😀 https://t.co/example www.example.com'), /9\/10 kata/);
  assert.equal(validation.getManualContentError('  ' + validSocialCaption.split(' ').join('\n\t ') + '  '), '');
});

test('Manual menolak teks kurang dari 10 kata sebelum API dan menghapus hasil sebelumnya', async () => {
  for (const text of ['', shortCaption, validSocialCaption.split(' ').slice(0, 9).join(' '), null, 123]) {
    const bg = createBackground({ stored: { selectedMode: 'manual', lastResult: { text: 'hasil lama' } } });
    const response = await bg.send({ type: 'CHECK_TEXT', text });
    assert.equal(response.success, false);
    assert.match(response.error, /Minimal|minimal/);
    assert.equal(bg.requests.length, 0);
    assert.equal(bg.injections.length, 0);
    assert.equal(bg.state.lastResult, null);
    assert.equal(bg.state.manualError, response.error);
    assert.equal(bg.badge(), '');
  }
});

test('Manual tepat 10 kata diterima di situs biasa dan medsos meskipun kurang dari 300 karakter', async () => {
  for (const source of [sender, newsSender]) {
    const bg = createBackground({ stored: { selectedMode: 'manual', manualError: 'error lama' } });
    const response = await bg.send({ type: 'CHECK_TEXT', text: validSocialCaption }, source);
    assert.equal(response.success, true);
    assert.equal(bg.requests.length, 1);
    assert.equal(bg.requests[0].text, validSocialCaption);
    assert.equal(bg.state.lastResult.text, validSocialCaption);
    assert.equal(bg.state.lastResult.url, source.tab.url);
    assert.equal(bg.state.manualError, '');
    assert.equal(bg.injections.length, 0);
  }
});

test('CHECK_TEXT dari highlight tetap memakai batas 10 kata saat mode Auto dipilih', async () => {
  const bg = createBackground();
  const response = await bg.send({ type: 'CHECK_TEXT', text: shortCaption });
  assert.equal(response.success, false);
  assert.match(response.error, /3\/10 kata/);
  assert.equal(bg.requests.length, 0);
});

test('Manual yang dimatikan tidak mengirim teks ke API', async () => {
  const bg = createBackground({ stored: { selectedMode: 'manual', extensionEnabled: false } });
  const response = await bg.send({ type: 'CHECK_TEXT', text: validSocialCaption });
  assert.equal(response.success, false);
  assert.match(response.error, /dimatikan/);
  assert.equal(bg.requests.length, 0);
});

test('Manual menyimpan pesan error API tanpa meninggalkan hasil sebelumnya', async () => {
  const bg = createBackground({ stored: { selectedMode: 'manual', lastResult: { text: 'hasil lama' } },
    predict: () => { throw new Error('API tidak tersedia'); } });
  const response = await bg.send({ type: 'CHECK_TEXT', text: validSocialCaption });
  assert.equal(response.success, false);
  assert.equal(response.error, 'API tidak tersedia');
  assert.equal(bg.state.lastResult, null);
  assert.equal(bg.state.manualError, response.error);
});

test('Manual menerima teks lebih dari 10 kata', async () => {
  const bg = createBackground({ stored: { selectedMode: 'manual' } });
  const text = validSocialCaption + ' dengan jelas';
  const response = await bg.send({ type: 'CHECK_TEXT', text });
  assert.equal(response.success, true);
  assert.equal(bg.requests.length, 1);
  assert.equal(bg.requests[0].text, text);
  assert.equal(bg.state.lastResult.text, text);
  assert.equal(bg.injections.length, 0);
});
