import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import App from './App';
import { AppErrorBoundary } from './components/common/PageErrorBoundary';
import { queryClient } from './services/queryClient';
import './styles/globals.css';
import 'leaflet/dist/leaflet.css';
import './i18n';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        {/* Dernier filet : une erreur hors des pages (en-tête, défilement…) ne donne plus une page blanche. */}
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
        {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>
);
