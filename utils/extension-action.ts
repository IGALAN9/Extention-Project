import { browser } from 'wxt/browser';

/** Chrome/MV3 memakai action; Firefox/MV2 masih memakai browserAction. */
export async function setExtensionBadge(text: string, color?: string) {
  try {
    const action = browser.action ?? browser.browserAction;
    if (!action) return;
    await action.setBadgeText({ text });
    if (color !== undefined) await action.setBadgeBackgroundColor({ color });
  } catch {
    // Badge hanya indikator tambahan. Kegagalannya tidak boleh menghentikan
    // render popup maupun pemeriksaan artikel/teks di background.
  }
}
