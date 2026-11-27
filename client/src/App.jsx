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
import Asistente from './pages/Asistente.jsx';
import { Icon, Monogram } from './components/brand.jsx';

const NIVEL = { publico: 1, analista: 2, administrador: 3 };

/** Módulos y el perfil mínimo que los ve (lámina 5 y lámina 6). */
const PAGES = [
  { id: 'panel', label: 'Panel principal', icon: 'dashboard', min: 'publico', group: 'Consulta', C: Panel },
  { id: 'rankings', label: 'Rankings', icon: 'trophy', min: 'publico', group: 'Consulta', C: Rankings },
  { id: 'explorar', label: 'Filtros y subactividades', icon: 'filter', min: 'publico', group: 'Consulta', C: Explorar },
  { id: 'calidad', label: 'Calidad de datos', icon: 'check', min: 'publico', group: 'Consulta', C: Calidad },
  { id: 'reportes', label: 'Reportes y descargas', icon: 'download', min: 'publico', group: 'Consulta', C: Reportes },
  { id: 'comparar', label: 'Comparar períodos', icon: 'compare', min: 'publico', permiso: 'comparar_periodos', group: 'Análisis', C: Comparar },
  { id: 'asistente', label: 'Asistente IA', icon: 'spark', min: 'publico', permiso: 'asistente_ia', group: 'Análisis', C: Asistente },
  { id: 'admin', label: 'Administración', icon: 'settings', min: 'administrador', group: 'Control', C: Admin },
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

  const puede = (k) => Boolean(meta?.permisos?.includes(k));
  const visible = PAGES.filter((p) => NIVEL[user.perfil] >= NIVEL[p.min] && (!p.permiso || puede(p.permiso)));
  const current = visible.find((p) => p.id === page) || visible[0];
  const ctx = { meta, fecha, setFecha, perfil: user.perfil, perfilNombre: user.nombre, nivel: NIVEL[user.perfil], puede, reloadMeta: loadMeta, goTo: setPage };
  const Page = current.C;

  const iniciales = user.nombre.slice(0, 2).toUpperCase();

  return (
    <div className="app">
      <header className="topnav">
        <Monogram title="Ranking de Créditos" subtitle="Superintendencia de Bancos de Panamá" />
        {meta && meta.periodos.length > 0 && (
          <label className="period-select">
            <Icon name="calendar" />
            <select value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Período">
              {meta.periodos.map((p) => <option key={p.fecha} value={p.fecha}>{fmtPeriodo(p.fecha)}</option>)}
            </select>
          </label>
        )}
        <div className="user-chip">
          <span className="avatar">{iniciales}</span>
          <span><b>{user.nombre}</b><button className="btn link" onClick={logout}><Icon name="logout" />Cerrar sesión</button></span>
        </div>
      </header>

      <section className="banner">
        <div className="crumb">Inicio / {current.group} / {current.label}</div>
        <h1>Ranking de Créditos por Actividad Económica</h1>
        <div className="banner-meta">
          {fecha && <span className="chip-dark"><Icon name="calendar" />{fmtPeriodo(fecha)} · Fecha {fecha}</span>}
          <span className="chip-dark"><Icon name="table" />Fuente: archivos AT03</span>
        </div>
      </section>

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
                    <Icon name={p.icon} />{p.label}
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
        <span>
          Fuente: archivos AT03{fecha ? ` · Período ${fmtPeriodo(fecha)} (Fecha ${fecha})` : ''} · Cálculo determinista desde los catálogos CINU/SB109, SB21 y bancos.
          {meta && ` Último cálculo: ${new Date(meta.calculadoEn).toLocaleString('es-PA')}.`}
        </span>
        <span className="footer-note"><Icon name="info" />Datos sintéticos · Uso informativo, no constituye opinión de la SBP</span>
      </footer>
    </div>
  );
}
