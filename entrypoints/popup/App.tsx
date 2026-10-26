import { useEffect, useRef, useState } from 'react';
import AboutPage from './AboutPage';
import { getAutoContentError, getManualContentError, MIN_MANUAL_CONTENT_WORDS } from '../../utils/auto-content';
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
type AutoProgress = { percent: number; label: string };

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
          result.data.influentialWords.map(({ word, score }) => {
            const direction = score < 0 ? 'positive' : score > 0 ? 'negative' : 'neutral';
            const directionLabel = score < 0 ? 'mengarah Fakta' : score > 0 ? 'mengarah Hoaks' : 'netral';
            return (
              <span className={direction} key={`${word}-${score}`} title={`Skor XAI: ${score} (${directionLabel})`}>
                {word}
              </span>
            );
          })
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
  // Navigasi About hanya mengganti tampilan; state pemeriksaan tetap hidup.
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const aboutButtonRef = useRef<HTMLButtonElement>(null);
  const closeAbout = () => {
    setIsAboutOpen(false);
    requestAnimationFrame(() => aboutButtonRef.current?.focus());
  };
  // Auto adalah mode utama saat popup pertama kali dibuka.
  const [mode, setMode] = useState<Mode>('auto');
  const [result, setResult] = useState<LastResult | null>(null);
  const [manualError, setManualError] = useState('');
  const [autoResult, setAutoResult] = useState<LastResult | null>(null);
  const [isEnabled, setIsEnabled] = useState(true);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');
  const [autoState, setAutoState] = useState<AutoState>('idle');
  const [autoProgress, setAutoProgress] = useState<AutoProgress>({ percent: 0, label: '' });
  const [autoError, setAutoError] = useState('');
  const [autoPageUrl, setAutoPageUrl] = useState('');

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
    setAutoResult(null);
    setAutoProgress({ percent: 10, label: 'Menyiapkan pemeriksaan...' });
    setAutoError('');
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error('Tab aktif tidak ditemukan.');
      setAutoPageUrl(tab.url ?? '');
      const response = await browser.runtime.sendMessage({ type: 'CHECK_AUTO_PAGE', tabId: tab.id, url: tab.url });
      if (response?.skipped) return;
      if (!response?.success) throw new Error(response?.error || 'Gagal memeriksa artikel.');
      // Hasil dan status berasal dari storage background agar respons lama
      // tidak menimpa pemeriksaan baru ketika URL/halaman sudah berubah.
    } catch (error) {
      setAutoResult(null);
      setAutoError(error instanceof Error ? error.message : 'Gagal memeriksa artikel.');
      setAutoState('error');
    }
  };

  useEffect(() => {
    browser.storage.local.get(['lastResult', 'manualError', 'lastAutoResult', 'extensionEnabled', 'selectedMode', 'autoChecking', 'autoProgress', 'autoError', 'autoPageUrl']).then((stored) => {
      const savedManualResult = stored.lastResult as LastResult | null | undefined;
      const savedManualError = (stored.manualError as string | undefined)
        || (savedManualResult ? getManualContentError(savedManualResult.text) : '');
      // Sembunyikan hasil lama yang belum memenuhi batas minimum Manual.
      if (savedManualResult && !savedManualError) setResult(savedManualResult);
      setManualError(savedManualError);
      const savedAutoResult = stored.lastAutoResult as LastResult | null | undefined;
      const savedError = (stored.autoError as string | undefined)
        || (savedAutoResult ? getAutoContentError(savedAutoResult.text, savedAutoResult.url) : '');
      // Jangan tampilkan lagi klasifikasi caption pendek yang tersimpan dari
      // versi extension sebelum batas minimum Auto diberlakukan.
      // Hasil yang baru selesai mungkin sudah tersimpan sebelum background
      // mematikan loading. Simpan di state; visibleAutoResult menunggu loading.
      if (savedAutoResult && !savedError) setAutoResult(savedAutoResult);
      setAutoError(savedError);
      setAutoPageUrl((stored.autoPageUrl as string | undefined) || savedAutoResult?.url || '');
      if (typeof stored.extensionEnabled === 'boolean') setIsEnabled(stored.extensionEnabled);
      setAutoState(stored.autoChecking === true ? 'loading' : savedError ? 'error' : 'idle');
      if (stored.autoProgress) setAutoProgress(stored.autoProgress as AutoProgress);
      if (stored.selectedMode === 'auto' || stored.selectedMode === 'manual') setMode(stored.selectedMode);
      else browser.storage.local.set({ selectedMode: 'auto' });
    });
    browser.action.setBadgeText({ text: '' });
    checkApiStatus();
  }, []);

  // Popup langsung mengosongkan hasil lama saat halaman baru memulai pemeriksaan Auto.
  useEffect(() => {
    const handleStorageChange = (changes: Record<string, { newValue?: unknown }>, areaName: string) => {
      if (areaName === 'local' && changes.lastResult) {
        const nextResult = (changes.lastResult.newValue as LastResult | null | undefined) ?? null;
        const contentError = nextResult ? getManualContentError(nextResult.text) : '';
        setResult(contentError ? null : nextResult);
        setManualError(contentError);
      }
      if (areaName === 'local' && changes.manualError) {
        setManualError((changes.manualError.newValue as string | undefined) ?? '');
      }
      if (areaName === 'local' && changes.lastAutoResult) {
        const nextResult = (changes.lastAutoResult.newValue as LastResult | null | undefined) ?? null;
        const contentError = nextResult ? getAutoContentError(nextResult.text, nextResult.url) : '';
        setAutoResult(contentError ? null : nextResult);
        if (contentError) setAutoError(contentError);
      }
      if (areaName === 'local' && changes.autoError) {
        setAutoError((changes.autoError.newValue as string | undefined) ?? '');
      }
      if (areaName === 'local' && changes.autoPageUrl) {
        setAutoPageUrl((changes.autoPageUrl.newValue as string | undefined) ?? '');
      }
      if (areaName === 'local' && changes.autoChecking) {
        const checking = changes.autoChecking.newValue === true;
        setAutoState(checking ? 'loading' : changes.autoError?.newValue ? 'error' : 'idle');
        if (checking) {
          setAutoResult(null);
          setAutoError('');
        }
      }
      if (areaName === 'local' && changes.autoProgress?.newValue) {
        setAutoProgress(changes.autoProgress.newValue as AutoProgress);
      }
    };
    browser.storage.onChanged.addListener(handleStorageChange);
    return () => browser.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const visibleAutoResult = autoState !== 'loading' && !autoError ? autoResult : null;
  const currentUrl = (mode === 'auto' ? autoPageUrl || visibleAutoResult?.url : result?.url) || 'WWW.EXAMPLE.COM';

  return (
    <main
      className={`popup-shell${isAboutOpen ? ' popup-shell--about' : ''}`}
      onKeyDown={(event) => {
        if (isAboutOpen && event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          closeAbout();
        }
      }}
    >
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

      {isAboutOpen && <AboutPage onBack={closeAbout} />}

      {/* Tetap terpasang saat About dibuka agar mode dan hasil tidak direset. */}
      <div hidden={isAboutOpen}>
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
            <div className={`article-card ${visibleAutoResult ? 'has-result' : ''}`}>
              <p>
                {autoState === 'loading' ? 'Sedang mengecek website...'
                  : autoError || visibleAutoResult?.text || 'Tekan tombol di bawah untuk mengekstrak artikel dari halaman ini secara otomatis.'}
              </p>
            </div>
            {autoState === 'loading' && (
              <div className="auto-progress" aria-live="polite">
                <div className="auto-progress__label">
                  <span>{autoProgress.label || 'Sedang mengecek website...'}</span>
                  <strong>{Math.round(autoProgress.percent)}%</strong>
                </div>
                <div
                  className="auto-progress__track"
                  role="progressbar"
                  aria-label="Proses pemeriksaan website"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(autoProgress.percent)}
                >
                  <span style={{ width: `${Math.max(4, Math.min(100, autoProgress.percent))}%` }} />
                </div>
              </div>
            )}
            {visibleAutoResult && (
              <>
                <ResultDetails result={visibleAutoResult} />
                <div className="auto-source" title={visibleAutoResult.data.article?.title ?? undefined}>
                  {visibleAutoResult.data.article?.title || 'Artikel tanpa judul'}
                  <span>
                    {visibleAutoResult.data.article?.source || 'Sumber tidak diketahui'} · {visibleAutoResult.data.article?.quality === 'clean' ? 'Konten bersih' : 'Konten perlu ditinjau'}
                    {visibleAutoResult.data.article?.published ? ` · ${new Date(visibleAutoResult.data.article.published).toLocaleDateString('id-ID')}` : ''}
                  </span>
                </div>
                {visibleAutoResult.data.article?.steps?.length ? (
                  <details className="auto-steps">
                    <summary>Detail ekstraksi</summary>
                    <ul>
                      {visibleAutoResult.data.article.steps.map((step) => (
                        <li className={step.status} key={step.key}>{step.label}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </>
            )}
            <button className="auto-action" type="button" disabled={autoState === 'loading'} onClick={runAutoCheck}>
              {autoState === 'loading' ? 'Sedang mengecek website...' : 'Periksa halaman ini'}
            </button>
          </section>
        )
      ) : !isEnabled ? <DisabledState /> : (
        <section className="manual-content" aria-live="polite">
          <div className={result && !manualError ? 'article-card has-result' : 'article-card'}>
            <p>{manualError || (result ? result.text : `Pilih atau highlight minimal ${MIN_MANUAL_CONTENT_WORDS} kata pada halaman, lalu tekan tombol Cek Fakta untuk memulai pemeriksaan.`)}</p>
          </div>
          {result && !manualError ? <ResultDetails result={result} /> : <div className="checking-pill">{manualError ? 'Pemeriksaan tidak berhasil' : 'Menunggu teks dipilih'}</div>}
        </section>
      )}

      {mode === 'manual' && <p className="manual-hint">Mode manual aktif - pilih minimal {MIN_MANUAL_CONTENT_WORDS} kata untuk cek fakta.</p>}
      </div>

      {/* Selalu tersedia pada layar Auto/Manual, loading, error, dan nonaktif. */}
      <button
        ref={aboutButtonRef}
        className="about-button"
        type="button"
        hidden={isAboutOpen}
        aria-label="Tentang extension"
        title="About Us"
        onClick={() => setIsAboutOpen(true)}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="6.5" r="1.8" />
          <path d="M10 10h3v8h2v2H9v-2h2v-6h-1z" />
        </svg>
      </button>
    </main>
  );
}

export default Popup;
