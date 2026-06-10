import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api } from './api';
import Dashboard from './pages/Dashboard';
import Live from './pages/Live';
import Moderation from './pages/Moderation';
import ContentEditor from './pages/ContentEditor';
import MapEditor from './pages/MapEditor';
import Publish from './pages/Publish';

function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/admin-api/login', { password });
      onLogin();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-box" onSubmit={submit}>
        <h1>LARPSCAPE</h1>
        <div className="sub">Admin console — authorized personnel only</div>
        <input
          type="password"
          placeholder="Admin password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
        />
        <button className="primary" disabled={busy || !password}>Sign in</button>
        {error && <div className="error-text" style={{ marginTop: 10 }}>{error}</div>}
      </form>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    api.get('/admin-api/me').then(() => setAuthed(true)).catch(() => setAuthed(false));
    const onUnauth = () => setAuthed(false);
    window.addEventListener('admin-unauthorized', onUnauth);
    return () => window.removeEventListener('admin-unauthorized', onUnauth);
  }, []);

  if (authed === null) return null;
  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  const logout = async () => {
    await api.post('/admin-api/logout');
    setAuthed(false);
  };

  return (
    <div className="layout">
      <div className="sidebar">
        <div className="brand">LARPSCAPE ADMIN</div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/live">Live view</NavLink>
          <NavLink to="/moderation">Moderation</NavLink>
          <div className="nav-section">World</div>
          <NavLink to="/map">Map editor</NavLink>
          <div className="nav-section">Content</div>
          <NavLink to="/content/items">Items</NavLink>
          <NavLink to="/content/npcs">NPCs</NavLink>
          <NavLink to="/content/objects">Objects</NavLink>
          <NavLink to="/content/shops">Shops</NavLink>
          <NavLink to="/content/recipes">Recipes</NavLink>
          <NavLink to="/content/magic">Magic &amp; slayer</NavLink>
          <NavLink to="/content/spawns">Spawns</NavLink>
          <div className="nav-section">Release</div>
          <NavLink to="/publish">Publish</NavLink>
        </nav>
        <div className="spacer" />
        <div className="foot">
          <a href="https://larpscape.net" target="_blank" rel="noreferrer">larpscape.net</a>
          {' · '}
          <a onClick={logout} style={{ cursor: 'pointer' }}>Sign out</a>
        </div>
      </div>
      <div className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/live" element={<Live />} />
          <Route path="/moderation" element={<Moderation />} />
          <Route path="/map" element={<MapEditor />} />
          <Route path="/content/:section" element={<ContentEditor />} />
          <Route path="/publish" element={<Publish />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
}
