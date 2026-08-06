export default defineContentScript({
  matches: ['<all_urls>'],
  main(ctx) {
    let tooltipEl: HTMLDivElement | null = null;
    let isExtensionEnabled = true;

    type StepStatus = 'success' | 'warning' | 'fail';
    type ProcessStep = { key: string; label: string; status: StepStatus };

    /** Membersihkan teks artikel dengan aturan yang diadaptasi dari extractor lama. */
    function removeNoise(text: string) {
      return text
        .replace(/ADVERTISEMENT/gi, '')
        .replace(/Scroll ke bawah untuk melanjutkan membaca/gi, '')
        .replace(/SCROLL TO CONTINUE(?: WITH CONTENT)?/gi, '')
        .replace(/GULIR UNTUK LANJUT BACA/gi, '')
        .replace(/\bIklan\b/gi, '')
        .replace(/\bBaca Juga\b/gi, '')
        .replace(/\bBagikan\b/gi, '')
        .replace(/\bDengarkan artikel\b/gi, '')
        .replace(/\bTampilkan Ringkasan Artikel\b/gi, '')
        .replace(/Add as a preferred source on Google/gi, '')
        .replace(/\[Gambas:[^\]]+\]/gi, '')
        .replace(/Copyright © ANTARA.*$/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    function trimBeforeArticleLead(text: string) {
      const markers = [
        'VIVA –', 'VIVA -', 'Jakarta -', 'JAKARTA, KOMPAS.com',
        'Jakarta, CNN Indonesia', 'Jakarta (ANTARA)', 'Suara.com -',
        'Liputan6.com, Jakarta', 'TRIBUNNEWS.COM',
      ];
      for (const marker of markers) {
        const index = text.indexOf(marker);
        if (index > 0 && index < 300) return text.slice(index);
      }
      return text;
    }

    function detectNoise(text: string) {
      return [
        /ADVERTISEMENT/gi, /Scroll ke bawah untuk melanjutkan membaca/gi,
        /IKLAN/gi, /SCROLL TO CONTINUE/gi, /GULIR UNTUK LANJUT BACA/gi,
        /Baca Juga/gi, /Berlangganan/gi, /Bagikan/gi, /Dengarkan artikel/gi,
      ].reduce((total, pattern) => total + (text.match(pattern)?.length ?? 0), 0);
    }

    /** Ekstraksi aman dari DOM tab aktif; tidak melakukan fetch atau akses URL lain. */
    function extractCurrentArticle() {
      const steps: ProcessStep[] = [{
        key: 'visit_url',
        label: `Membaca ${location.hostname.replace(/^www\./, '')}`,
        status: 'success',
      }];
      const title = document.querySelector('meta[property="og:title"]')?.getAttribute('content')
        || document.querySelector('h1')?.textContent?.trim()
        || document.title.trim()
        || null;
      steps.push({
        key: 'extract_title',
        label: title ? 'Judul artikel berhasil ditemukan' : 'Judul artikel tidak ditemukan',
        status: title ? 'success' : 'warning',
      });

      const root = document.querySelector('article, main, [role="main"]') || document.body;
      const clone = root.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('script, style, noscript, iframe, nav, footer, header, aside, form, button, svg, [aria-hidden="true"]').forEach((node) => node.remove());

      // Prioritaskan paragraf agar menu dan elemen navigasi tidak ikut dianalisis.
      const paragraphs = Array.from(clone.querySelectorAll('p, h2, h3, li'))
        .map((node) => node.textContent?.trim() ?? '')
        .filter((text) => text.length > 25);
      const rawText = paragraphs.length ? paragraphs.join(' ') : (clone.textContent ?? '');
      const cleanText = trimBeforeArticleLead(removeNoise(rawText)).slice(0, 10000);

      if (!cleanText) {
        steps.push({ key: 'extract_content', label: 'Gagal mengekstrak konten', status: 'fail' });
        return { success: false, error: 'Konten artikel tidak dapat diekstrak. Silakan gunakan mode Manual.' };
      }
      steps.push({ key: 'extract_content', label: 'Isi konten berhasil diekstrak', status: 'success' });

      const noiseHits = detectNoise(rawText);
      const quality = cleanText.length < 300 ? 'unsupported' : noiseHits >= 6 ? 'dirty' : 'clean';
      if (quality === 'unsupported') {
        steps.push({ key: 'clean_content', label: 'Konten artikel terlalu singkat', status: 'fail' });
        return { success: false, error: 'Artikel terlalu singkat untuk diperiksa otomatis. Silakan gunakan mode Manual.', steps };
      }
      steps.push({
        key: 'clean_content',
        label: quality === 'clean' ? 'Konten berhasil dibersihkan' : 'Konten mungkin masih mengandung sedikit noise',
        status: quality === 'clean' ? 'success' : 'warning',
      });
      return {
        success: true,
        article: {
          title,
          content: cleanText,
          url: location.href,
          source: location.hostname.replace(/^www\./, ''),
          published: document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ?? null,
          quality,
          steps,
        },
      };
    }

    browser.storage.local.get('extensionEnabled').then((stored) => {
      isExtensionEnabled = stored.extensionEnabled !== false;
    });

    /** Mode Auto berjalan sekali setelah halaman artikel selesai dimuat. */
    browser.storage.local.get(['extensionEnabled', 'selectedMode']).then((stored) => {
      // Jika belum pernah memilih mode, Auto adalah default utama.
      if (stored.extensionEnabled === false || stored.selectedMode === 'manual' || !/^https?:$/.test(location.protocol)) return;
      const requestAutoCheck = () => {
        // Bersihkan hasil artikel sebelumnya sebelum proses artikel baru dimulai.
        browser.runtime.sendMessage({ type: 'AUTO_PAGE_OPENED' }).catch(() => undefined);
        window.setTimeout(() => {
          browser.runtime.sendMessage({ type: 'CHECK_AUTO_FROM_PAGE' }).catch(() => undefined);
        }, 700);
      };
      if (document.readyState === 'complete') requestAutoCheck();
      else window.addEventListener('load', requestAutoCheck, { once: true });
    });
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.extensionEnabled) {
        isExtensionEnabled = changes.extensionEnabled.newValue !== false;
        if (!isExtensionEnabled) removeTooltip();
      }
    });

    // Dipanggil dari mode Auto di popup untuk mengekstrak artikel pada tab aktif.
    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'EXTRACT_CURRENT_ARTICLE') {
        if (!isExtensionEnabled) return { success: false, error: 'Pemeriksaan extension sedang dimatikan.' };
        return extractCurrentArticle();
      }
    });

    function removeTooltip() {
      tooltipEl?.remove();
      tooltipEl = null;
    }

    function showTooltip(text: string, x: number, y: number) {
      removeTooltip();

      tooltipEl = document.createElement('div');
      Object.assign(tooltipEl.style, {
        position: 'fixed',
        left: `${x}px`,
        top: `${y + 10}px`,
        boxSizing: 'border-box',
        width: '270px',
        background: '#ff7945',
        color: '#211815',
        padding: '10px',
        border: '4px solid #ff5a17',
        borderRadius: '14px',
        fontSize: '12px',
        fontFamily: 'Arial, Helvetica, sans-serif',
        zIndex: '999999',
        boxShadow: '3px 5px 6px rgba(30,20,14,0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: '9px',
      });

      const preview = document.createElement('div');
      preview.textContent = `"${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`;
      Object.assign(preview.style, {
        lineHeight: '1.25',
        maxHeight: '31px',
        overflow: 'hidden',
      });
      tooltipEl.appendChild(preview);

      const btn = document.createElement('button');
      btn.textContent = 'Cek Fakta';
      Object.assign(btn.style, {
        background: '#fff',
        color: '#2e2927',
        border: 'none',
        borderRadius: '999px',
        padding: '5px 10px',
        fontSize: '12px',
        fontFamily: 'Arial, Helvetica, sans-serif',
        cursor: 'pointer',
        boxShadow: '1px 2px 4px rgba(30,20,14,0.32)',
      });

      btn.addEventListener('click', async () => {
        console.log('[CONTENT] Button clicked, sending message for text:', text);
        btn.textContent = 'Memeriksa...';
        btn.disabled = true;

        try {
          const response = await browser.runtime.sendMessage({ type: 'CHECK_TEXT', text });
          console.log('[CONTENT] Response received:', response);

          preview.textContent = response?.success
            ? '✓ Selesai — buka ikon extension untuk lihat hasil'
            : `Gagal: ${response?.error ?? 'unknown error'}`;
        } catch (err) {
          console.error('[CONTENT] sendMessage error:', err);
          preview.textContent = `Error: ${err}`;
        }

        btn.remove();
      });

      tooltipEl.appendChild(btn);
      document.body.appendChild(tooltipEl);
    }

    // Pakai ctx.addEventListener, bukan document.addEventListener,
    // biar otomatis di-cleanup pas content script di-reload
    ctx.addEventListener(document, 'mouseup', (e) => {
      if (!isExtensionEnabled) {
        removeTooltip();
        return;
      }
      // Kalau mouseup terjadi di dalam tooltip yang sedang aktif (misal klik tombol), abaikan
      if (tooltipEl && tooltipEl.contains(e.target as Node)) {
        return;
      }

      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (!text || text.length < 3) {
        removeTooltip();
        return;
      }

      const range = selection!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      showTooltip(text, rect.left, rect.bottom);
    });

    ctx.addEventListener(document, 'mousedown', (e) => {
      if (tooltipEl && !tooltipEl.contains(e.target as Node)) {
        removeTooltip();
      }
    });
  },
});
