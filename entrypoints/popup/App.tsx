import { useEffect, useState } from 'react';
import './App.css';

interface PredictResult {
  text: string;
  label: string;
  confidence: number;
  is_fake: boolean;
  model_scores: { bilstm: number; gru: number; cnn_bilstm: number };
}

interface LastResult {
  text: string;
  url: string;
  data: PredictResult;
  timestamp: number;
}

type Mode = 'auto' | 'manual';
type ApiStatus = 'checking' | 'online' | 'offline';

function Popup() {
  const [mode, setMode] = useState<Mode>('manual');
  const [result, setResult] = useState<LastResult | null>(null);
  const [isEnabled, setIsEnabled] = useState(true);
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking');

  const checkApiStatus = () => {
    setApiStatus('checking');
    browser.runtime
      .sendMessage({ type: 'GET_API_STATUS' })
      .then((response) => setApiStatus(response?.online ? 'online' : 'offline'))
      .catch(() => setApiStatus('offline'));
  };

  useEffect(() => {
    browser.storage.local.get(['lastResult', 'extensionEnabled']).then((stored) => {
      if (stored.lastResult) setResult(stored.lastResult as LastResult);
      if (typeof stored.extensionEnabled === 'boolean') setIsEnabled(stored.extensionEnabled);
    });
    browser.action.setBadgeText({ text: '' });
    checkApiStatus();
  }, []);

  const isFake = result?.data.is_fake;
  const statusLabel = isFake ? 'Terindikasi Hoaks' : 'Terindikasi Fakta';
  const pageUrl = result?.url || 'WWW.EXAMPLE.COM';

  return (
    <main className="popup-shell">
      {/* Sakelar global: menonaktifkan/mengaktifkan interaksi cek fakta di halaman. */}
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

      {/* Menampilkan URL sumber dari hasil pemeriksaan terakhir. */}
      <div className="url-pill" title={result?.url ?? undefined}>
        URL: {pageUrl}
      </div>

      {/* Navigasi mode; Auto sengaja masih berupa placeholder Coming Soon. */}
      <div className="mode-switch" aria-label="Pilih mode pemeriksaan">
        <button
          className={mode === 'auto' ? 'active' : ''}
          type="button"
          onClick={() => setMode('auto')}
        >
          Auto
        </button>
        <button
          className={mode === 'manual' ? 'active' : ''}
          type="button"
          onClick={() => setMode('manual')}
        >
          Manual
        </button>
      </div>

      {/* Indikator koneksi backend. Tombol ini bisa ditekan untuk mengecek ulang API. */}
      <button className={`api-status ${apiStatus}`} type="button" onClick={checkApiStatus}>
        <span aria-hidden="true" />
        {apiStatus === 'checking' ? 'Mengecek API...' : apiStatus === 'online' ? 'API terhubung' : 'API tidak terhubung'}
      </button>

      {mode === 'auto' ? (
        /* Placeholder sampai fitur pemindaian otomatis diimplementasikan. */
        <section className="coming-soon" aria-live="polite">
          <div className="soon-icon" aria-hidden="true">✦</div>
          <h1>Mode Otomatis</h1>
          <p>Coming Soon</p>
          <span>Nantinya halaman akan dipindai secara otomatis untuk membantu menemukan informasi yang perlu diperiksa.</span>
        </section>
      ) : !isEnabled ? (
        /* Tampilan pengganti ketika sakelar extension sedang dimatikan. */
        <section className="disabled-state" aria-live="polite">
          <span aria-hidden="true">&#x23FB;</span>
          <h1>Pemeriksaan dimatikan</h1>
          <p>Tekan tombol power di kanan atas untuk mengaktifkan kembali extension.</p>
        </section>
      ) : (
        /* Mode manual: teks pilihan, hasil prediksi, dan metadata klasifikasi. */
        <section className="manual-content" aria-live="polite">
          <div className={result ? 'article-card has-result' : 'article-card'}>
            <p>
              {result
                ? result.text
                : 'Pilih atau highlight teks pada halaman, lalu tekan tombol “Cek Fakta” untuk memulai pemeriksaan.'}
            </p>
          </div>

          {result ? (
            <>
              {/* Warna hijau/merah mengikuti status fakta atau hoaks dari API. */}
              <div className={`result-pill ${isFake ? 'hoax' : 'fact'}`}>
                <span>{statusLabel}</span>
                <small>{(result.data.confidence * 100).toFixed(1)}% keyakinan</small>
              </div>
              <div className="keyword-label">Kata Berpengaruh:</div>
              <div className="keywords" aria-label="Kata berpengaruh">
                <span className={isFake ? 'negative' : 'positive'}>{result.data.label || 'Analisis'}</span>
                <span className={isFake ? 'negative' : 'positive'}>Teks pilihan</span>
              </div>
            </>
          ) : (
            <div className="checking-pill">Menunggu teks dipilih</div>
          )}
        </section>
      )}

      {/* Petunjuk hanya ditampilkan ketika mode manual benar-benar aktif. */}
      {mode === 'manual' && (
        <p className="manual-hint">Mode manual aktif — pilih teks pada halaman untuk cek fakta.</p>
      )}
    </main>
  );
}

export default Popup;
