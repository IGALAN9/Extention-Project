/**
 * Fungsi mandiri yang disuntikkan langsung ke tab aktif untuk mode Auto.
 * Tidak boleh memakai closure karena browser menserialisasi fungsi ini ke halaman.
 */
function extractArticleFromActivePage() {
  const removeNoise = (text: string) => text
    .replace(/ADVERTISEMENT/gi, '')
    .replace(/Scroll ke bawah untuk melanjutkan membaca/gi, '')
    .replace(/SCROLL TO CONTINUE(?: WITH CONTENT)?/gi, '')
    .replace(/GULIR UNTUK LANJUT BACA/gi, '')
    .replace(/\bIklan\b|\bBaca Juga\b|\bBagikan\b|\bDengarkan artikel\b/gi, '')
    .replace(/\[Gambas:[^\]]+\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const trimLead = (text: string) => {
    const markers = ['VIVA -', 'Jakarta -', 'JAKARTA, KOMPAS.com', 'Jakarta, CNN Indonesia', 'Jakarta (ANTARA)', 'Suara.com -', 'Liputan6.com, Jakarta', 'TRIBUNNEWS.COM'];
    for (const marker of markers) {
      const index = text.indexOf(marker);
      if (index > 0 && index < 300) return text.slice(index);
    }
    return text;
  };
  const steps = [{
    key: 'visit_url', label: `Membaca ${location.hostname.replace(/^www\./, '')}`, status: 'success',
  }];
  const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
    || document.querySelector('h1')?.textContent?.trim() || document.title.trim() || null;
  steps.push({ key: 'extract_title', label: title ? 'Judul artikel berhasil ditemukan' : 'Judul artikel tidak ditemukan', status: title ? 'success' : 'warning' });

  const root = document.querySelector('article, main, [role="main"]') || document.body;
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('script, style, noscript, iframe, nav, footer, header, aside, form, button, svg, [aria-hidden="true"]').forEach((node) => node.remove());
  const paragraphs = Array.from(clone.querySelectorAll('p, h2, h3, li'))
    .map((node) => node.textContent?.trim() ?? '')
    .filter((text) => text.length > 25);
  const rawText = paragraphs.length ? paragraphs.join(' ') : (clone.textContent ?? '');
  const content = trimLead(removeNoise(rawText)).slice(0, 10000);
  if (content.length < 300) {
    steps.push({ key: 'extract_content', label: 'Konten artikel terlalu singkat', status: 'fail' });
    return { success: false, error: 'Artikel terlalu singkat untuk diperiksa otomatis. Silakan gunakan mode Manual.', steps };
  }
  steps.push({ key: 'extract_content', label: 'Isi konten berhasil diekstrak', status: 'success' });
  const noiseHits = (rawText.match(/ADVERTISEMENT|IKLAN|Baca Juga|Bagikan|Dengarkan artikel/gi) ?? []).length;
  const quality = noiseHits >= 6 ? 'dirty' : 'clean';
  steps.push({ key: 'clean_content', label: quality === 'clean' ? 'Konten berhasil dibersihkan' : 'Konten mungkin masih mengandung sedikit noise', status: quality === 'clean' ? 'success' : 'warning' });
  return {
    success: true,
    article: {
      title,
      content,
      url: location.href,
      source: location.hostname.replace(/^www\./, ''),
      published: document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ?? null,
      quality,
      steps,
    },
  };
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender) => {
    const explainText = async (text: string) => {
      const res = await fetch('http://localhost:8000/predict/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.detail || 'Gagal menjalankan penjelasan XAI.');
      return {
        ...payload,
        is_fake: payload.label === 'HOAKS',
        influentialWords: payload.word_scores.slice(0, 5),
        model_scores: { bilstm: 0, gru: 0, cnn_bilstm: 0 },
      };
    };

    if (message.type === 'GET_API_STATUS') {
      return fetch('http://localhost:8000/openapi.json', { cache: 'no-store' })
        .then((response) => ({ online: response.ok }))
        .catch(() => ({ online: false }));
    }

    if (message.type === 'CHECK_TEXT') {
      return browser.storage.local.get('extensionEnabled').then((stored) => {
        if (stored.extensionEnabled === false) {
          return { success: false, error: 'Pemeriksaan extension sedang dimatikan.' };
        }

        // Endpoint XAI juga mengembalikan label dan confidence, serta skor SHAP per kata.
        return explainText(message.text)
          .then(async (data) => {
          const result = {
            text: message.text,
            url: sender.tab?.url ?? '',
            data,
            timestamp: Date.now(),
          };
          await browser.storage.local.set({ lastResult: result });
          browser.action.setBadgeText({ text: '1' });
          browser.action.setBadgeBackgroundColor({ color: '#2563eb' });
          return { success: true, data };
        })
        .catch((err) => ({ success: false, error: err.message }));
      });
    }

    if (message.type === 'CHECK_AUTO_PAGE') {
      return browser.storage.local.get('extensionEnabled').then(async (stored) => {
        if (stored.extensionEnabled === false) return { success: false, error: 'Pemeriksaan extension sedang dimatikan.' };
        try {
          const [injection] = await browser.scripting.executeScript({
            target: { tabId: message.tabId },
            func: extractArticleFromActivePage,
          });
          const extracted = injection?.result;
          if (!extracted?.success || !extracted.article) {
            return {
              success: false,
              error: extracted?.error || 'Artikel tidak dapat diekstrak dari halaman ini.',
            };
          }
          const data = await explainText(extracted.article.content);
          const result = {
            text: extracted.article.content,
            url: extracted.article.url ?? sender.tab?.url ?? extracted.article.source,
            data: { ...data, article: extracted.article },
            timestamp: Date.now(),
          };
          await browser.storage.local.set({ lastAutoResult: result });
          return { success: true, result };
        } catch (err) {
          const message = err instanceof Error ? err.message : '';
          const blockedPage = /Cannot access contents of url|Cannot access a chrome|Missing host permission/i.test(message);
          return {
            success: false,
            error: blockedPage
              ? 'Mode Auto tidak dapat membaca halaman internal browser atau halaman yang dibatasi.'
              : message || 'Gagal membaca artikel pada halaman ini.',
          };
        }
      });
    }
  });
});
