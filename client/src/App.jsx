import { useCallback, useEffect, useState } from 'react';
import { api, setToken, getToken } from './api.js';
import { fmtPeriodo } from './format.js';
import { ErrorBox, Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Panel from './pages/Panel.jsx';
import Rankings from './pages/Rankings.jsx';
import Explorar from './pages/Explorar.jsx';
import Comparar from './pages/Comparar.jsx';
import Calidad from './pages/Calidad.jsx';
import Reportes from './pages/Reportes.jsx';
import Admin from './pages/Admin.jsx';

const NIVEL = { publico: 1, analista: 2, administrador: 3 };

/** Módulos y el perfil mínimo que los ve (lámina 5 y lámina 6). */
const PAGES = [
  { id: 'panel', label: 'Panel principal', min: 'publico', group: 'Consulta', C: Panel },
  { id: 'rankings', label: 'Rankings', min: 'publico', group: 'Consulta', C: Rankings },
  { id: 'explorar', label: 'Filtros y subactividades', min: 'publico', group: 'Consulta', C: Explorar },
  { id: 'calidad', label: 'Calidad de datos', min: 'publico', group: 'Consulta', C: Calidad },
  { id: 'reportes', label: 'Reportes y descargas', min: 'publico', group: 'Consulta', C: Reportes },
  { id: 'comparar', label: 'Comparar períodos', min: 'analista', group: 'Análisis', C: Comparar },
  { id: 'admin', label: 'Administración', min: 'administrador', group: 'Control', C: Admin },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState(null);
  const [fecha, setFecha] = useState('');
  const [page, setPage] = useState('panel');

  const loadMeta = useCallback(async () => {
    try {
      const m = await api('/meta');
      setMeta(m); setMetaError(null);
      setFecha((f) => (m.periodos.some((p) => p.fecha === f) ? f : m.periodos.at(-1)?.fecha || ''));
    } catch (e) { setMetaError(e); }
  }, []);

  useEffect(() => {
    (async () => {
      if (getToken()) {
        try { const me = await api('/auth/me'); if (me.perfil !== 'publico') setUser(me); else setToken(null); } catch { setToken(null); }
      }
      setChecking(false);
    })();
  }, []);
  useEffect(() => { if (user) loadMeta(); }, [user, loadMeta]);

  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignorar */ }
    setToken(null); setUser(null); setPage('panel');
  };

  if (checking) return null;
  if (!user) return <Login onLogin={(u) => { setUser(u); setPage('panel'); }} />;

  const visible = PAGES.filter((p) => NIVEL[user.perfil] >= NIVEL[p.min]);
  const current = visible.find((p) => p.id === page) || visible[0];
  const ctx = { meta, fecha, setFecha, perfil: user.perfil, nivel: NIVEL[user.perfil], reloadMeta: loadMeta, goTo: setPage };
  const Page = current.C;

  return (
    <div className="app">
      <header className="topbar">
        <div className="title">
          <strong>Rankings de Crédito por Actividad Económica</strong>
          <span>Hackathon SBP 2026 · Plataforma de consulta y análisis bancario</span>
        </div>
        {meta && meta.periodos.length > 0 && (
          <label className="field" style={{ color: '#fff' }}>
            <span style={{ color: 'rgba(255,255,255,.8)' }}>Período</span>
            <select value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Período">
              {meta.periodos.map((p) => <option key={p.fecha} value={p.fecha}>{fmtPeriodo(p.fecha)} ({p.fecha})</option>)}
            </select>
          </label>
        )}
        <div className="profile-chip">Perfil <b>{user.nombre}</b></div>
        <button className="btn" onClick={logout}>Cambiar perfil</button>
      </header>

      <div className="disclaimer" role="note">
        <b>⚠ Datos ficticios.</b>
        <span>Fuente: datos sintéticos AT03 suministrados por la SBP para el Hackathon 2026{fecha ? ` · Período mostrado: ${fmtPeriodo(fecha)} (Fecha ${fecha})` : ''}. Bancos y clientes no son reales; uso informativo, no constituye opinión formal de la SBP.</span>
      </div>

      <div className="body">
        <nav className="side" aria-label="Módulos">
          {['Consulta', 'Análisis', 'Control'].map((g) => {
            const items = visible.filter((p) => p.group === g);
            if (!items.length) return null;
            return (
              <div key={g} style={{ display: 'contents' }}>
                <div className="group">{g}</div>
                {items.map((p) => (
                  <button key={p.id} className={p.id === current.id ? 'active' : ''} onClick={() => setPage(p.id)} aria-current={p.id === current.id ? 'page' : undefined}>
                    {p.label}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <main>
          <ErrorBox error={metaError} />
          {!meta && !metaError && <Loading />}
          {meta && meta.periodos.length === 0 && current.id !== 'admin' && (
            <div className="alert info">No hay períodos cargados. {user.perfil === 'administrador' ? 'Cargue un archivo AT03 en Administración.' : 'Un Administrador debe cargar un archivo AT03.'}</div>
          )}
          {meta && (meta.periodos.length > 0 || current.id === 'admin') && <Page key={current.id} ctx={ctx} />}
        </main>
      </div>
      <footer>
        Cálculo determinista y reproducible desde los archivos AT03 y los catálogos CINU/SB109, SB21 y bancos. {meta && `Último cálculo: ${new Date(meta.calculadoEn).toLocaleString('es-PA')}.`}
      </footer>
    </div>
  );
}
