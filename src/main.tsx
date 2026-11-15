import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SpinningLogo } from './components/layout/SpinningLogo';
import './i18n'; // Initialize i18n
import './index.css';

// Development-only: Enable axe-core accessibility runtime checks
if (import.meta.env.DEV) {
  import('@axe-core/react').then((axe) => {
    axe.default(React, ReactDOM, 1000);
  });
}

// Loading fallback for i18n
function LoadingFallback() {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-md)',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--color-background)',
        color: 'var(--color-text)',
      }}
    >
      {/* Same animated logo as the header; still with reduced motion (OS setting) */}
      <SpinningLogo src="/logo-320" size={96} />
      Loading...
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Suspense fallback={<LoadingFallback />}>
      <App />
    </Suspense>
  </React.StrictMode>,
);
