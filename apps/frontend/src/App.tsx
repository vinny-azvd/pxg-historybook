import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useFilters } from './FiltersContext';
import { PlayerFilter } from './components/PlayerFilter';
import { PeriodFilter } from './components/PeriodFilter';
import { ThemePicker } from './theme/ThemePicker';
import { OverviewPage } from './pages/OverviewPage';
import { HuntPage } from './pages/HuntPage';
import { HuntDetailPage } from './pages/HuntDetailPage';
import { TrendsPage } from './pages/TrendsPage';
import { TerrorPage } from './pages/TerrorPage';
import { TerrorDetailPage } from './pages/TerrorDetailPage';
import { MdPage } from './pages/MdPage';
import { MdDetailPage } from './pages/MdDetailPage';
import { DataPage } from './pages/DataPage';
import { RaresPage } from './pages/RaresPage';

const isLocalDataMode = import.meta.env.VITE_DATA_MODE === 'local';

// Single source of the menu order for every skin. Tendências stays second to
// last so "Dados" (import/export, local mode only) closes the menu.
const NAV_ITEMS: { to: string; label: string; end?: boolean; localOnly?: boolean }[] = [
  { to: '/', label: 'Visão Geral', end: true },
  { to: '/hunts', label: 'Hunts' },
  { to: '/terror', label: 'Terror' },
  { to: '/md', label: 'MD' },
  { to: '/raros', label: 'Raros' },
  { to: '/trends', label: 'Tendências' },
  { to: '/data', label: 'Dados', localOnly: true },
];

// Scrolls the compact (horizontally scrollable) nav just enough to show `link`
// completely, with a little air on both sides. The nav is position:relative,
// so offsetLeft is measured from the nav itself. Browsers only scroll a
// partly visible focused link when it is mostly hidden, which left the focus
// ring cut off, so focus calls this too.
function revealNavLink(nav: HTMLElement | null, link: HTMLElement | null) {
  if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
  const pad = 12;
  const left = link.offsetLeft - pad;
  const right = link.offsetLeft + link.offsetWidth + pad - nav.clientWidth;
  let next = nav.scrollLeft;
  if (next > left) next = left;
  if (next < right) next = right;
  nav.scrollTo({ left: Math.max(0, next), behavior: 'auto' });
}

export default function App() {
  const location = useLocation();
  const { player, sessionType, from, to } = useFilters();
  const [navOpen, setNavOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const filtersToggleRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const activeFilters = (player ? 1 : 0) + (sessionType ? 1 : 0) + (from || to ? 1 : 0);

  // Publishes the sticky bar's real height as --topbar-h on <html> for every
  // skin: html's scroll-padding-top (styles.css) and the Game Boy START panel
  // follow it, so a focused element never ends up under the bar even when the
  // bar wraps onto two or three rows.
  useEffect(() => {
    const root = document.documentElement;
    const bar = headerRef.current;
    if (!bar) return;
    const publish = () => root.style.setProperty('--topbar-h', `${bar.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--topbar-h');
    };
  }, []);

  // Going to another page folds the START menu away and brings the active
  // link FULLY into view in the horizontally scrollable compact nav (.nav is
  // position:relative, so offsetLeft is measured from the nav itself). Runs
  // again once the web fonts are in, because they change the link widths.
  useEffect(() => {
    setNavOpen(false);
    let cancelled = false;
    function revealActive() {
      const nav = navRef.current;
      revealNavLink(nav, nav?.querySelector<HTMLElement>('a.active') ?? null);
    }
    revealActive();
    const fonts = document.fonts;
    fonts?.ready.then(() => {
      if (!cancelled) revealActive();
    });
    // Skin fonts are fetched lazily, after this effect: widths change then.
    fonts?.addEventListener('loadingdone', revealActive);
    return () => {
      cancelled = true;
      fonts?.removeEventListener('loadingdone', revealActive);
    };
  }, [location.pathname]);

  // Escape / outside press fold the two mobile panels.
  useEffect(() => {
    if (!navOpen && !filtersOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      if (navOpen) {
        setNavOpen(false);
        navToggleRef.current?.focus();
      }
      if (filtersOpen) {
        setFiltersOpen(false);
        filtersToggleRef.current?.focus();
      }
    }
    function onPointerDown(e: PointerEvent) {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setNavOpen(false);
        setFiltersOpen(false);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [navOpen, filtersOpen]);

  function skipToContent(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    mainRef.current?.focus();
    mainRef.current?.scrollIntoView();
  }

  return (
    <div className="app-shell" data-nav-open={navOpen} data-filters-open={filtersOpen}>
      <a href="#conteudo" className="skip-link" onClick={skipToContent}>
        Pular para o conteúdo
      </a>
      <header className="topbar" ref={headerRef}>
        <Link to="/" className="brand" aria-label="Hunt History Analyser, início">
          <span className="brand-full">Hunt History Analyser</span>
          <span className="brand-short" aria-hidden="true">
            HHA
          </span>
        </Link>
        {/* Hidden by default; the Game Boy skin shows it as START on phones. */}
        <button
          ref={navToggleRef}
          type="button"
          className="nav-toggle"
          aria-expanded={navOpen}
          aria-controls="site-nav"
          aria-label="START, menu de navegação"
          onClick={() => {
            setNavOpen((v) => !v);
            setFiltersOpen(false);
          }}
        >
          START
        </button>
        <nav
          className="nav"
          id="site-nav"
          ref={navRef}
          aria-label="Principal"
          onFocus={(e) => revealNavLink(navRef.current, (e.target as HTMLElement).closest('a'))}
        >
          {NAV_ITEMS.filter((item) => !item.localOnly || isLocalDataMode).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          ref={filtersToggleRef}
          type="button"
          className="filters-toggle secondary"
          aria-expanded={filtersOpen}
          aria-controls="topbar-filters"
          aria-label={activeFilters > 0 ? `Filtros (${activeFilters} ${activeFilters === 1 ? 'ativo' : 'ativos'})` : 'Filtros'}
          onClick={() => {
            setFiltersOpen((v) => !v);
            setNavOpen(false);
          }}
        >
          Filtros
          {activeFilters > 0 && (
            <span className="filters-toggle-count" aria-hidden="true">
              {activeFilters}
            </span>
          )}
        </button>
        <div className="topbar-filters" id="topbar-filters">
          <PlayerFilter />
          <PeriodFilter />
        </div>
        <ThemePicker />
      </header>
      <main className="main" id="conteudo" tabIndex={-1} ref={mainRef}>
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/hunts" element={<HuntPage />} />
          <Route path="/hunts/:id" element={<HuntDetailPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/terror" element={<TerrorPage />} />
          <Route path="/terror/:id" element={<TerrorDetailPage />} />
          <Route path="/md" element={<MdPage />} />
          <Route path="/md/:id" element={<MdDetailPage />} />
          <Route path="/raros" element={<RaresPage />} />
          {isLocalDataMode && <Route path="/shinies" element={<Navigate to="/raros?aba=shinies" replace />} />}
          {isLocalDataMode && <Route path="/data" element={<DataPage />} />}
        </Routes>
      </main>
      <footer className="app-credits">
        Projeto de fã, sem fins lucrativos. Imagens de Pokémon:{' '}
        <a href="https://github.com/PokeAPI/sprites" target="_blank" rel="noreferrer">PokeAPI/sprites</a>. Banners de
        bosses:{' '}
        <a href="https://wiki.pokexgames.com" target="_blank" rel="noreferrer">wiki.pokexgames.com</a>. Pokémon e seus
        personagens são marcas de Nintendo, Creatures Inc. e GAME FREAK inc. (© The Pokémon Company); os nomes de
        hunts e variantes pertencem ao PokéXGames.
      </footer>
    </div>
  );
}
