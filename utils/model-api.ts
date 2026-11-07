export const MODEL_APIS = [
  { source: 'railway', baseUrl: '' },
  { source: 'local', baseUrl: 'http://localhost:8000' },
] as const;
//https://model-production-ce77.up.railway.app
const STATUS_TIMEOUT_MS = 4_000;
const PREDICTION_TIMEOUT_MS = 25_000;
type ModelApi = typeof MODEL_APIS[number];
type ExplainPayload = {
  text?: string;
  label: 'HOAKS' | 'FAKTA';
  confidence: number;
  word_scores: { word: string; score: number }[];
};

// Kesalahan input tidak akan membaik dengan mengirim teks yang sama ke server lain.
class RequestRejected extends Error {}

async function tryModelApis<T>(timeoutMs: number, run: (api: ModelApi, signal: AbortSignal) => Promise<T>): Promise<T> {
  for (const api of MODEL_APIS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await run(api, controller.signal);
    } catch (error) {
      if (error instanceof RequestRejected) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('API Railway dan API lokal tidak tersedia. Pastikan API lokal berjalan di http://localhost:8000.');
}

function isExplainPayload(value: unknown): value is ExplainPayload {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<ExplainPayload>;
  return (data.label === 'HOAKS' || data.label === 'FAKTA')
    && Number.isFinite(data.confidence)
    && Array.isArray(data.word_scores)
    && data.word_scores.every((item) => item && typeof item.word === 'string' && Number.isFinite(item.score));
}

export function explainWithModelApi(text: string) {
  return tryModelApis(PREDICTION_TIMEOUT_MS, async ({ baseUrl }, signal) => {
    const response = await fetch(`${baseUrl}/predict/explain`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      redirect: 'error',
      signal,
    });
    if (!response.ok) {
      // Server gagal, endpoint belum tersedia, atau sedang membatasi permintaan.
      if (response.status >= 500 || [404, 408, 429].includes(response.status)) {
        throw new Error(`API belum bisa memproses prediksi (HTTP ${response.status}).`);
      }
      const payload = await response.json().catch(() => null);
      throw new RequestRejected(typeof payload?.detail === 'string' && payload.detail
        ? payload.detail
        : `Permintaan prediksi ditolak (HTTP ${response.status}).`);
    }
    const payload: unknown = await response.json();
    if (!isExplainPayload(payload)) throw new Error('Format hasil prediksi API tidak valid.');
    return payload;
  });
}

export async function getModelApiStatus() {
  try {
    return await tryModelApis(STATUS_TIMEOUT_MS, async ({ baseUrl, source }, signal) => {
      const response = await fetch(`${baseUrl}/openapi.json`, { cache: 'no-store', signal });
      if (!response.ok) throw new Error('Spesifikasi API tidak tersedia.');
      const spec = await response.json();
      if (!spec?.paths?.['/predict/explain']?.post) throw new Error('Endpoint prediksi tidak tersedia.');
      return { online: true, source } as const;
    });
  } catch {
    return { online: false } as const;
  }
}
