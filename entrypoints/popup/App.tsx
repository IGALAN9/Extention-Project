import { useEffect, useState } from 'react';
import './App.css';

type WordScore = { word: string; score: number };
type ArticleInfo = {
  title: string | null;
  source: string | null;
  published?: string | null;
  quality: 'clean' | 'dirty' | 'unsupported';
  steps: Array<{ key: string; label: string; status: 'success' | 'warning' | 'fail' }>;
};

interface PredictResult {
  text: string;
  label: string;
  confidence: number;
  is_fake: boolean;
  model_scores: { bilstm: number; gru: number; cnn_bilstm: number };
  influentialWords?: WordScore[];
  article?: ArticleInfo;
}

interface LastResult {
  text: string;
  url: string;
  data: PredictResult;
  timestamp: number;
}

type Mode = 'auto' | 'manual';
type ApiStatus = 'checking' | 'online' | 'offline';
type AutoState = 'idle' | 'loading' | 'error';

/** Bagian hasil yang dipakai oleh mode Manual dan Auto. */
function ResultDetails({ result }: { result: LastResult }) {
  const isFake = result.data.is_fake;
  return (
    <>
      <div className={`result-pill ${isFake ? 'hoax' : 'fact'}`}>
        <span>{isFake ? 'Terindikasi Hoaks' : 'Terindikasi Fakta'}</span>
        <small>{(result.data.confidence * 100).toFixed(1)}% keyakinan</small>
      </div>
      <div className="keyword-label">5 Kata Berpengaruh:</div>
      <div className="keywords" aria-label="Lima kata paling berpengaruh">
        {result.data.influentialWords?.length ? (
          result.data.influentialWords.map(({ word, score }) => (
            <span className={isFake ? 'negative' : 'positive'} key={word} title={`Skor pengaruh XAI: ${score}`}>
              {word}
            </span>
          ))
        ) : (
          <span className="unavailable">Penjelasan belum tersedia</span>
        )}
      </div>
    </>
  );
}

function DisabledState() {
  return (
    <section className="disabled-state" aria-live="polite">
      <span aria-hidden="true">&#x23FB;</span>
      <h1>Pemeriksaan dimatikan</h1>
      <p>Tekan tombol power di kanan atas untuk mengaktifkan kembali extension.</p>
    </section>
  );
}

function Popup() {
  // Auto adalah mode utama saat popup pertama kali dibuka.
  const [mode, setMode] = useState<Mode>('auto');
  const [result, setResult] = useState<LastResult | null>(null);
  const [autoResult, setAutoResult] = useState<LastResult | null>(null);
  const [isEnabled, setIsEnabled] = useState(true);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [autoState, setAutoState] = useState<AutoState>('idle');
  const [autoError, setAutoError] = useState('');

  const checkApiStatus = () => {
    setApiStatus('checking');
    browser.runtime.sendMessage({ type: 'GET_API_STATUS' })
      .then((response) => setApiStatus(response?.online ? 'online' : 'offline'))
      .catch(() => setApiStatus('offline'));
  };

  /** Ekstrak konten tab aktif, lalu analisis hasilnya menggunakan endpoint XAI. */
  const runAutoCheck = async () => {
    if (!isEnabled) return;
    setAutoState('loading');
    setAutoError('');
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('Tab aktif tidak ditemukan.');
      const response = await browser.runtime.sendMessage({ type: 'CHECK_AUTO_PAGE', tabId: tab.id });
      if (!response?.success) throw new Error(response?.error || 'Gagal memeriksa artikel.');
      setAutoResult(response.result as LastResult);
      setAutoState('idle');
    } catch (error) {
      setAutoError(error instanceof Error ? error.message : 'Gagal memeriksa artikel.');
      setAutoState('error');
    }
  };

  useEffect(() => {
    browser.storage.local.get(['lastResult', 'lastAutoResult', 'extensionEnabled', 'selectedMode']).then((stored) => {
      if (stored.lastResult) setResult(stored.lastResult as LastResult);
      if (stored.lastAutoResult) setAutoResult(stored.lastAutoResult as LastResult);
      if (typeof stored.extensionEnabled === 'boolean') setIsEnabled(stored.extensionEnabled);
      if (stored.selectedMode === 'auto' || stored.selectedMode === 'manual') setMode(stored.selectedMode);
      else browser.storage.local.set({ selectedMode: 'auto' });
    });
    browser.action.setBadgeText({ text: '' });
    checkApiStatus();
  }, []);

  // Popup langsung mengosongkan hasil lama saat halaman baru memulai pemeriksaan Auto.
  useEffect(() => {
    const handleStorageChange = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName === 'local' && changes.lastAutoResult) {
        setAutoResult((changes.lastAutoResult.newValue as LastResult | undefined) ?? null);
      }
    };
    browser.storage.onChanged.addListener(handleStorageChange);
    return () => browser.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const currentUrl = (mode === 'auto' ? autoResult?.url : result?.url) || 'WWW.EXAMPLE.COM';

  return (
    <main className="popup-shell">
      {/* Sakelar global untuk mengaktifkan atau mematikan pemeriksaan. */}
      <button
        aria-label={isEnabled ? 'Matikan pemeriksaan extension' : 'Nyalakan pemeriksaan extension'}
        className={`power-button ${isEnabled ? 'is-on' : 'is-off'}`}
        title={isEnabled ? 'Matikan pemeriksaan' : 'Nyalakan pemeriksaan'}
        type="button"
        onClick={() => {
          const nextState = !isEnabled;
          setIsEnabled(nextState);
          browser.storage.local.set({ extensionEnabled: nextState });
          checkApiStatus();
        }}
      >
        <span aria-hidden="true">&#x23FB;</span>
      </button>

      <div className="url-pill" title={currentUrl}>URL: {currentUrl}</div>

      <div className="mode-switch" aria-label="Pilih mode pemeriksaan">
        <button
          className={mode === 'auto' ? 'active' : ''}
          type="button"
          onClick={() => { setMode('auto'); browser.storage.local.set({ selectedMode: 'auto' }); runAutoCheck(); }}
        >Auto</button>
        <button className={mode === 'manual' ? 'active' : ''} type="button" onClick={() => { setMode('manual'); browser.storage.local.set({ selectedMode: 'manual' }); }}>Manual</button>
      </div>

      <button className={`api-status ${apiStatus}`} type="button" onClick={checkApiStatus}>
        <span aria-hidden="true" />
        {apiStatus === 'checking' ? 'Mengecek API...' : apiStatus === 'online' ? 'API terhubung' : 'API tidak terhubung'}
      </button>

      {mode === 'auto' ? (
        !isEnabled ? <DisabledState /> : (
          <section className="auto-content" aria-live="polite">
            <div className={`article-card ${autoResult ? 'has-result' : ''}`}>
              <p>
                {autoState === 'loading' ? 'Sedang membaca dan membersihkan artikel pada halaman ini...'
                  : autoResult ? autoResult.text
                    : autoError || 'Tekan tombol di bawah untuk mengekstrak artikel dari halaman ini secara otomatis.'}
              </p>
            </div>
            {autoResult && (
              <>
                <ResultDetails result={autoResult} />
                <div className="auto-source" title={autoResult.data.article?.title ?? undefined}>
                  {autoResult.data.article?.title || 'Artikel tanpa judul'}
                  <span>
                    {autoResult.data.article?.source || 'Sumber tidak diketahui'} · {autoResult.data.article?.quality === 'clean' ? 'Konten bersih' : 'Konten perlu ditinjau'}
                    {autoResult.data.article?.published ? ` · ${new Date(autoResult.data.article.published).toLocaleDateString('id-ID')}` : ''}
                  </span>
                </div>
                {autoResult.data.article?.steps?.length ? (
                  <details className="auto-steps">
                    <summary>Detail ekstraksi</summary>
                    <ul>
                      {autoResult.data.article.steps.map((step) => (
                        <li className={step.status} key={step.key}>{step.label}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </>
            )}
            <button className="auto-action" type="button" disabled={autoState === 'loading'} onClick={runAutoCheck}>
              {autoState === 'loading' ? 'Menganalisis artikel...' : 'Periksa halaman ini'}
            </button>
          </section>
        )
      ) : !isEnabled ? <DisabledState /> : (
        <section className="manual-content" aria-live="polite">
          <div className={result ? 'article-card has-result' : 'article-card'}>
            <p>{result ? result.text : 'Pilih atau highlight teks pada halaman, lalu tekan tombol Cek Fakta untuk memulai pemeriksaan.'}</p>
          </div>
          {result ? <ResultDetails result={result} /> : <div className="checking-pill">Menunggu teks dipilih</div>}
        </section>
      )}

      {mode === 'manual' && <p className="manual-hint">Mode manual aktif - pilih teks pada halaman untuk cek fakta.</p>}
    </main>
  );
}

export default Popup;
