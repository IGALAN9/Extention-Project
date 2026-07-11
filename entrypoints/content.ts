export default defineContentScript({
  matches: ['<all_urls>'],
  main(ctx) {
    let tooltipEl: HTMLDivElement | null = null;

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
        background: '#1f2937',
        color: '#fff',
        padding: '8px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        fontFamily: 'sans-serif',
        zIndex: '999999',
        maxWidth: '280px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      });

      const preview = document.createElement('div');
      preview.textContent = `"${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`;
      tooltipEl.appendChild(preview);

      const btn = document.createElement('button');
      btn.textContent = 'Cek Fakta';
      Object.assign(btn.style, {
        background: '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: '4px',
        padding: '4px 8px',
        fontSize: '12px',
        cursor: 'pointer',
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