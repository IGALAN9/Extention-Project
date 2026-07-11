export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'CHECK_TEXT') {
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
    }
  });
});