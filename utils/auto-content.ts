/** Artikel memakai batas karakter; media sosial memakai jumlah kata caption. */
export const MIN_AUTO_CONTENT_LENGTH = 300;
export const MIN_AUTO_SOCIAL_WORDS = 10;
export const MIN_MANUAL_CONTENT_WORDS = 10;

export function normalizeAutoContent(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

export function isSocialMediaUrl(url: string) {
  try {
    return /(^|\.)(facebook\.com|x\.com|twitter\.com|instagram\.com|threads\.net|threads\.com|reddit\.com)$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export function countAutoContentWords(text: string) {
  return normalizeAutoContent(text).split(/\s+/)
    .filter((word) => /[\p{L}\p{N}]/u.test(word) && !/^(?:https?:\/\/|www\.)/i.test(word)).length;
}

/** Manual memakai hitungan kata yang sama dengan caption media sosial. */
export function getManualContentError(text: string) {
  const words = countAutoContentWords(text);
  return words < MIN_MANUAL_CONTENT_WORDS
    ? `Teks terlalu singkat untuk diperiksa (${words}/${MIN_MANUAL_CONTENT_WORDS} kata). Pilih minimal ${MIN_MANUAL_CONTENT_WORDS} kata untuk Manual Checking.`
    : '';
}

export function getAutoContentError(text: string, url = '') {
  if (isSocialMediaUrl(url)) {
    const words = countAutoContentWords(text);
    return words < MIN_AUTO_SOCIAL_WORDS
      ? `Caption terlalu singkat untuk diperiksa otomatis (${words}/${MIN_AUTO_SOCIAL_WORDS} kata). Minimal ${MIN_AUTO_SOCIAL_WORDS} kata.`
      : '';
  }
  const length = normalizeAutoContent(text).length;
  return length < MIN_AUTO_CONTENT_LENGTH
    ? `Konten terlalu singkat untuk diperiksa otomatis (${length}/${MIN_AUTO_CONTENT_LENGTH} karakter). Minimal ${MIN_AUTO_CONTENT_LENGTH} karakter. Silakan gunakan mode Manual untuk teks pendek.`
    : '';
}
