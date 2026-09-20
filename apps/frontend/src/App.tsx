import { NavLink, Route, Routes } from 'react-router-dom';
import { PlayerFilter } from './components/PlayerFilter';
import { PeriodFilter } from './components/PeriodFilter';
import { DashboardPage } from './pages/DashboardPage';
import { HuntsHistoryPage } from './pages/HuntsHistoryPage';
import { HuntDetailPage } from './pages/HuntDetailPage';
import { UploadPage } from './pages/UploadPage';
import { TrendsPage } from './pages/TrendsPage';

export default function App() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="brand">Hunt History Analyser</span>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Dashboard
          </NavLink>
          <NavLink to="/hunts" className={({ isActive }) => (isActive ? 'active' : '')}>
            Histórico
          </NavLink>
          <NavLink to="/trends" className={({ isActive }) => (isActive ? 'active' : '')}>
            Tendências
          </NavLink>
          <NavLink to="/upload" className={({ isActive }) => (isActive ? 'active' : '')}>
            Importar hunt
          </NavLink>
        </nav>
        <PlayerFilter />
        <PeriodFilter />
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/hunts" element={<HuntsHistoryPage />} />
          <Route path="/hunts/:id" element={<HuntDetailPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/upload" element={<UploadPage />} />
        </Routes>
      </main>
    </div>
  );
}
