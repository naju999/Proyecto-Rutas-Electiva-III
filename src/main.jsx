import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initPwaInstallListeners } from './pwa/pwaInstall';
import { AppStoreProvider } from './store/AppStore';
import { registerServiceWorker } from './pwa/registerServiceWorker';
import './styles.css';

initPwaInstallListeners();
void registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppStoreProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </AppStoreProvider>
  </React.StrictMode>
);
