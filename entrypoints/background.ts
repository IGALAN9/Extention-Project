export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender) => {
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

        return fetch('http://localhost:8000/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message.text }),
        })
          .then((res) => res.json())
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
  });
});
