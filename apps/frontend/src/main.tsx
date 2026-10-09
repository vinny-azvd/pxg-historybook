import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { FiltersProvider } from './FiltersContext';
import { PreferencesProvider } from './PreferencesContext';
import { ThemeProvider } from './theme/ThemeContext';
import { initSkin } from './theme/skins';
import { ErrorBoundary } from './ErrorBoundary';
import './styles.css';
import './themes/types.css';
// Skin files come after styles.css: their :root[data-skin] rules must win.
import './themes/classic.css';
import './themes/gameboy.css';
import './themes/battle.css';
import './themes/cards.css';
import './themes/fonts';

// Set html[data-skin] before React renders so there is no flash of the
// wrong look (the module runs before the first paint of the app).
initSkin();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ThemeProvider>
          <FiltersProvider>
            <PreferencesProvider>
              <App />
            </PreferencesProvider>
          </FiltersProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
