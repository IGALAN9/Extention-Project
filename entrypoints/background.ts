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
    .replace(/\bLihat selengkapnya\b|\bSee more\b|\bSee less\b|\bShow more\b|\bShow less\b|\bTampilkan lebih sedikit\b/gi, '')
    .replace(/Missing context\. Reviewed by third-party fact-checkers\.?/gi, '')
    .replace(/\bSee why\b/gi, '')
    .replace(/Scan the QR code and confirm that the codes match to log in\.?/gi, '')
    .replace(/See more on Facebook/gi, '')
    .replace(/This post is missing context according to third-party fact-checkers\.?/gi, '')
    .replace(/Third-party fact-check/gi, '')
    .replace(/^Thread[\d.,KMB]+\s*views.*?\d{4}/i, '')
    .replace(/\bTranslate\b/gi, '')
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
  const isInstagram = /(^|\.)instagram\.com$/i.test(location.hostname);
  const isTwitter = /(^|\.)(x|twitter)\.com$/i.test(location.hostname);
  const isFacebook = /(^|\.)facebook\.com$/i.test(location.hostname);
  const isThreads = /(^|\.)(threads\.net|threads\.com)$/i.test(location.hostname);
  const extractInstagramCaption = () => {
    const article = document.querySelector('article');
    const candidates = article
      ? Array.from(article.querySelectorAll('span[dir="auto"], div[dir="auto"], h1'))
          .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
          .filter((text) => text.length >= 25)
          .filter((text) => !/^(View all|Lihat semua|Follow|Following|Balas|Reply|Like|Suka|Translate|Terjemahkan|See translation)/i.test(text))
      : [];
    // Caption biasanya merupakan blok teks terpanjang di dalam article, sedangkan
    // username, tombol, dan komentar hanya berupa teks pendek.
    const caption = candidates.sort((a, b) => b.length - a.length)[0];
    if (caption) return caption;

    // Fallback untuk layout Instagram yang belum merender article secara lengkap.
    const description = document.querySelector('meta[property="og:description"]')?.getAttribute('content') ?? '';
    const colonIndex = description.indexOf(':');
    return colonIndex >= 0 ? description.slice(colonIndex + 1).trim() : description.trim();
  };
  const extractTwitterCaption = () => {
    // X menandai isi post dengan data-testid ini. Ambil post pertama saja,
    // karena tweetText berikutnya biasanya adalah reply/komentar.
    const candidates = Array.from(document.querySelectorAll(
      'article[data-testid="tweet"] [data-testid="tweetText"], [data-testid="tweetText"]',
    ))
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((text) => text.length >= 20)
      .filter((text) => !/^(Replying to|Log in|Sign up|Translate|Show more|Show less)/i.test(text));
    return candidates[0] ?? '';
  };
  const extractFacebookCaption = () => {
    // Jangan menganggap dialog login/QR Facebook sebagai caption post.
    if (/Scan the QR code and confirm that the codes match to log in/i.test(document.body.textContent ?? '')) {
      return '';
    }

    // Tutup panel fact-checker Facebook yang menutupi caption Reels.
    const overlayCandidates = Array.from(document.querySelectorAll('[role="dialog"], div'))
      .filter((node) => {
        const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        return /Missing context\. Reviewed by third-party fact-checkers/i.test(text) && text.length < 800;
      })
      .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0));
    const overlay = overlayCandidates[0];
    if (overlay) {
      const closeButton = overlay.querySelector('[aria-label="Close"], [aria-label="Tutup"], button');
      if (closeButton instanceof HTMLElement) closeButton.click();
      else overlay.remove();
    }

    // Caption post Facebook biasanya berada di container ini, termasuk post video.
    const messageRoot = document.querySelector(
      '[data-ad-comet-preview="message"], [data-testid="post_message"]',
    );
    if (messageRoot) {
      const text = messageRoot.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      if (text) return text;
    }

    // Fallback untuk Feed/Reels: caption dapat berada langsung di overlay
    // tanpa wrapper article, seperti div dir="auto" pada Facebook Reels.
    const post = document.querySelector('[role="article"], article');
    const scope = post || document;
    const candidates = Array.from(scope.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
          .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
          .filter((text) => text.length >= 20)
          .filter((text) => !/Missing context|third-party fact-checkers|See why/i.test(text))
          .filter((text) => !/^(Like|Suka|Comment|Komentar|Share|Bagikan|Follow|Ikuti|See more|See less|Lihat selengkapnya)$/i.test(text));
    return candidates.sort((a, b) => b.length - a.length)[0] ?? '';
  };
  const extractThreadsCaption = () => {
    const post = document.querySelector('[role="article"], article');
    const scope = post || document;
    const candidates = Array.from(scope.querySelectorAll('div[dir="auto"], span[dir="auto"]'))
      .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() ?? '')
      .filter((text) => text.length >= 20)
      .filter((text) => !/^(Translate|Follow|Following|Reply|Like|Repost|Share|See translation|Log in|Sign up)/i.test(text))
      .filter((text) => !/third-party fact-check|missing context/i.test(text));
    // Pada halaman Thread, caption muncul lebih dulu sebelum daftar komentar.
    return candidates[0] ?? '';
  };
  const steps = [{
    key: 'visit_url', label: `Membaca ${location.hostname.replace(/^www\./, '')}`, status: 'success',
  }];
  const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
    || document.querySelector('h1')?.textContent?.trim() || document.title.trim() || null;
  steps.push({ key: 'extract_title', label: title ? 'Judul artikel berhasil ditemukan' : 'Judul artikel tidak ditemukan', status: title ? 'success' : 'warning' });

  let rawText: string;
  if (isInstagram) {
    rawText = extractInstagramCaption();
    if (rawText) steps.push({ key: 'extract_content', label: 'Caption Instagram berhasil ditemukan', status: 'success' });
  } else if (isTwitter) {
    rawText = extractTwitterCaption();
    if (rawText) steps.push({ key: 'extract_content', label: 'Caption X berhasil ditemukan', status: 'success' });
  } else if (isFacebook) {
    rawText = extractFacebookCaption();
    if (rawText) steps.push({ key: 'extract_content', label: 'Caption Facebook berhasil ditemukan', status: 'success' });
  } else if (isThreads) {
    rawText = extractThreadsCaption();
    if (rawText) steps.push({ key: 'extract_content', label: 'Caption Threads berhasil ditemukan', status: 'success' });
  } else {
    const root = document.querySelector('article, main, [role="main"]') || document.body;
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('script, style, noscript, iframe, nav, footer, header, aside, form, button, svg, [aria-hidden="true"]').forEach((node) => node.remove());
    const paragraphs = Array.from(clone.querySelectorAll('p, h2, h3, li'))
      .map((node) => node.textContent?.trim() ?? '')
      .filter((text) => text.length > 25);
    rawText = paragraphs.length ? paragraphs.join(' ') : (clone.textContent ?? '');
  }
  const content = trimLead(removeNoise(rawText)).slice(0, 10000);
  const minimumLength = isInstagram || isTwitter || isFacebook || isThreads ? 20 : 300;
  if (content.length < minimumLength) {
    const platform = isInstagram ? 'Instagram' : isTwitter ? 'X' : isFacebook ? 'Facebook' : isThreads ? 'Threads' : '';
    steps.push({ key: 'extract_content', label: platform ? `Caption ${platform} tidak ditemukan atau terlalu singkat` : 'Konten artikel terlalu singkat', status: 'fail' });
    return { success: false, error: platform ? `Caption ${platform} tidak ditemukan. Silakan gunakan mode Manual.` : 'Artikel terlalu singkat untuk diperiksa otomatis. Silakan gunakan mode Manual.', steps };
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

    /** Jalankan ekstraksi DOM dan XAI untuk satu tab; dipakai klik popup dan auto saat halaman dibuka. */
    const inspectAutoPage = async (tabId: number, fallbackUrl = '') => {
      const [injection] = await browser.scripting.executeScript({
        target: { tabId },
        func: extractArticleFromActivePage,
      });
      const extracted = injection?.result;
      if (!extracted?.success || !extracted.article) {
        return { success: false, error: extracted?.error || 'Artikel tidak dapat diekstrak dari halaman ini.' };
      }
      const data = await explainText(extracted.article.content);
      const result = {
        text: extracted.article.content,
        url: extracted.article.url ?? fallbackUrl ?? extracted.article.source,
        data: { ...data, article: extracted.article },
        timestamp: Date.now(),
      };
      await browser.storage.local.set({ lastAutoResult: result });
      browser.action.setBadgeText({ text: '1' });
      browser.action.setBadgeBackgroundColor({ color: '#ff5a17' });
      return { success: true, result };
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
          await browser.storage.local.remove('lastAutoResult');
          return await inspectAutoPage(message.tabId, sender.tab?.url ?? '');
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

    // Dikirim segera saat halaman baru terbuka agar hasil artikel sebelumnya tidak tertinggal di popup.
    if (message.type === 'AUTO_PAGE_OPENED') {
      return browser.storage.local.get(['extensionEnabled', 'selectedMode']).then(async (stored) => {
        if (stored.extensionEnabled !== false && stored.selectedMode !== 'manual') {
          await browser.storage.local.remove('lastAutoResult');
          browser.action.setBadgeText({ text: '' });
        }
        return { success: true };
      });
    }

    // Dikirim content script tepat setelah halaman baru selesai dimuat saat mode Auto aktif.
    if (message.type === 'CHECK_AUTO_FROM_PAGE') {
      return browser.storage.local.get(['extensionEnabled', 'selectedMode']).then(async (stored) => {
        // selectedMode yang belum ada diperlakukan sebagai Auto agar pengguna baru langsung mendapat pemeriksaan otomatis.
        if (stored.extensionEnabled === false || stored.selectedMode === 'manual' || !sender.tab?.id) {
          return { success: false, skipped: true };
        }
        try {
          await browser.storage.local.remove('lastAutoResult');
          const pageUrl = sender.tab.url ?? '';
          const isFacebookPage = /(^|\.)facebook\.com/i.test(new URL(pageUrl).hostname);
          let latestResult;

          // Facebook/Reels sering merender caption beberapa detik setelah video muncul.
          // Coba sekarang, lalu ulangi tiap 5 detik maksimal 6 kali (30 detik).
          for (let attempt = 0; attempt < (isFacebookPage ? 6 : 1); attempt += 1) {
            latestResult = await inspectAutoPage(sender.tab.id, pageUrl);
            if (latestResult.success || !isFacebookPage || attempt === 5) return latestResult;
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
          return latestResult ?? { success: false, skipped: true };
        } catch {
          // Tidak mengganggu halaman pengguna bila URL bukan artikel atau tidak dapat diekstrak.
          return { success: false, skipped: true };
        }
      });
    }
  });
});
