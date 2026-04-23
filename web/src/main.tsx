import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Unregister service workers
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(r => r.forEach(w => w.unregister()));
}

function showError(msg: string) {
  const el = document.getElementById('pre-react');
  if (el) {
    el.style.background = '#1a0000';
    el.style.color = 'red';
    el.style.whiteSpace = 'pre-wrap';
    el.style.display = 'block';
    el.textContent = '❌ React error:\n' + msg;
  }
}

window.onerror = (_m, _s, _l, _c, error) => { showError(String(error?.stack || error || _m)); };
window.addEventListener('unhandledrejection', e => { showError('Promise: ' + String(e.reason?.stack || e.reason)); });

try {
  const root = createRoot(document.getElementById('root')!);
  root.render(<App />);
  const el = document.getElementById('pre-react');
  if (el) el.style.display = 'none';
} catch(e: any) {
  showError(e?.stack || String(e));
}
