import { NavLink, Route, Routes } from 'react-router-dom';
import { PlayerFilter } from './components/PlayerFilter';
import { PeriodFilter } from './components/PeriodFilter';
import { OverviewPage } from './pages/OverviewPage';
import { HuntPage } from './pages/HuntPage';
import { HuntDetailPage } from './pages/HuntDetailPage';
import { TrendsPage } from './pages/TrendsPage';
import { TerrorPage } from './pages/TerrorPage';
import { TerrorDetailPage } from './pages/TerrorDetailPage';
import { MdPage } from './pages/MdPage';
import { MdDetailPage } from './pages/MdDetailPage';
import { DataPage } from './pages/DataPage';

const isLocalDataMode = import.meta.env.VITE_DATA_MODE === 'local';

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">Hunt History Analyser</span>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Visão Geral
          </NavLink>
          <NavLink to="/hunts" className={({ isActive }) => (isActive ? 'active' : '')}>
            Hunts
          </NavLink>
          <NavLink to="/trends" className={({ isActive }) => (isActive ? 'active' : '')}>
            Tendências
          </NavLink>
          <NavLink to="/terror" className={({ isActive }) => (isActive ? 'active' : '')}>
            Terror
          </NavLink>
          <NavLink to="/md" className={({ isActive }) => (isActive ? 'active' : '')}>
            MD
          </NavLink>
          {isLocalDataMode && (
            <NavLink to="/data" className={({ isActive }) => (isActive ? 'active' : '')}>
              Dados
            </NavLink>
          )}
        </nav>
        <PlayerFilter />
        <PeriodFilter />
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<OverviewPage />} />
          <Route path="/hunts" element={<HuntPage />} />
          <Route path="/hunts/:id" element={<HuntDetailPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/terror" element={<TerrorPage />} />
          <Route path="/terror/:id" element={<TerrorDetailPage />} />
          <Route path="/md" element={<MdPage />} />
          <Route path="/md/:id" element={<MdDetailPage />} />
          {isLocalDataMode && <Route path="/data" element={<DataPage />} />}
        </Routes>
      </main>
    </div>
  );
}
