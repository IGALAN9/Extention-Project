export default defineContentScript({
  matches: ['<all_urls>'],
  main(ctx) {
    let tooltipEl: HTMLDivElement | null = null;
    let isExtensionEnabled = true;

    browser.storage.local.get('extensionEnabled').then((stored) => {
      isExtensionEnabled = stored.extensionEnabled !== false;
    });
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.extensionEnabled) {
        isExtensionEnabled = changes.extensionEnabled.newValue !== false;
        if (!isExtensionEnabled) removeTooltip();
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
