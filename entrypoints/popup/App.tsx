import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import reactLogo from '@/assets/react.svg';
import wxtLogo from '/wxt.svg';
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

function Popup() {
  const [result, setResult] = useState<LastResult | null>(null);

  useEffect(() => {
    browser.storage.local.get('lastResult').then((stored) => {
      if (stored.lastResult) setResult(stored.lastResult as LastResult);
    });
    browser.action.setBadgeText({ text: '' });
  }, []);

  const statusLabel = result
    ? result.data.is_fake
      ? 'Terindikasi Hoaks'
      : 'Terindikasi Fakta'
    : '';

  return (
    <div
      style={{
        width: 320,
        fontFamily: 'sans-serif',
        background: '#1f2937',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        borderRadius: 12,
      }}
    >
      {/* URL bar */}
      <div
        style={{
          background: '#6879b8',
          color: '#e5e7eb',
          borderRadius: 20,
          padding: '10px 16px',
          fontSize: 13,
          border: '1px solid #374151',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {result?.url ? `URL: ${result.url}` : 'URL: —'}
      </div>

      {/* Text card */}
      <div
        style={{
          background: '#6879b8',
          borderRadius: 16,
          padding: 20,
          minHeight: 160,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <p
          style={{
            margin: 0,
            color: '#111827',
            fontSize: 22,
            fontWeight: 600,
            lineHeight: 1.3,
          }}
        >
          {result ? result.text.slice(0, 140) : 'Belum ada pengecekan.'}
        </p>
      </div>

      {/* Status pill */}
      {result && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              background: result.data.is_fake ? '#7f1d1d' : '#6879b8',
              color: '#fff',
              borderRadius: 16,
              padding: '10px 24px',
              fontSize: 16,
              fontWeight: 600,
              textAlign: 'center',
              border: '1px solid #374151',
            }}
          >
            {statusLabel}
            <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.85, marginTop: 2 }}>
              {(result.data.confidence * 100).toFixed(1)}% keyakinan
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Popup />);

export default Popup;
