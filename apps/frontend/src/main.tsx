import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { FiltersProvider } from './FiltersContext';
import { PreferencesProvider } from './PreferencesContext';
import { ErrorBoundary } from './ErrorBoundary';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <FiltersProvider>
          <PreferencesProvider>
            <App />
          </PreferencesProvider>
        </FiltersProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
