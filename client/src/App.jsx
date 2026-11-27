import { useCallback, useEffect, useState } from 'react';
import { api, setToken, getToken } from './api.js';
import { fmtCorte } from './format.js';
import { ErrorBox, Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Panel from './pages/Panel.jsx';
import Rankings from './pages/Rankings.jsx';
import Bancos from './pages/Bancos.jsx';
import Explorar from './pages/Explorar.jsx';
import Comparar from './pages/Comparar.jsx';
import Calidad from './pages/Calidad.jsx';
import Reportes from './pages/Reportes.jsx';
import Admin from './pages/Admin.jsx';
import ChatFlotante from './components/ChatFlotante.jsx';
import Registros from './pages/Registros.jsx';
import Publicaciones from './pages/Publicaciones.jsx';
import { Icon, Monogram } from './components/brand.jsx';
import PeriodPicker from './components/PeriodPicker.jsx';
import AcercaDatos from './components/AcercaDatos.jsx';
import { Avisos, Esqueleto } from './components/efectos.jsx';

const MENU_KEY = 'sbp-menu-colapsado';
const esMovil = () => window.matchMedia('(max-width: 960px)').matches;

const NIVEL = { publico: 1, analista: 2, administrador: 3 };

/** Módulos y el perfil mínimo que los ve (lámina 5 y lámina 6). */
const PAGES = [
  { id: 'panel', label: 'Panel principal', icon: 'dashboard', min: 'publico', group: 'Consulta', C: Panel },
  { id: 'rankings', label: 'Rankings', icon: 'trophy', min: 'publico', group: 'Consulta', C: Rankings },
  { id: 'bancos', label: 'Bancos', icon: 'briefcase', min: 'publico', group: 'Consulta', C: Bancos },
  { id: 'publicaciones', label: 'Publicaciones', icon: 'calendar', min: 'publico', group: 'Consulta', C: Publicaciones },
  { id: 'explorar', label: 'Filtros y subactividades', icon: 'filter', min: 'publico', group: 'Consulta', C: Explorar },
  { id: 'calidad', label: 'Calidad de datos', icon: 'check', min: 'publico', group: 'Consulta', C: Calidad },
  { id: 'reportes', label: 'Reportes y descargas', icon: 'download', min: 'publico', group: 'Consulta', C: Reportes },
  { id: 'comparar', label: 'Comparar períodos', icon: 'compare', min: 'publico', permiso: 'comparar_periodos', group: 'Análisis', C: Comparar },
  { id: 'registros', label: 'Registros', icon: 'table', min: 'publico', permiso: 'consultar_registros', group: 'Análisis', C: Registros },
  { id: 'admin', label: 'Administración', icon: 'settings', min: 'administrador', group: 'Control', C: Admin },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState(null);
  const [fecha, setFecha] = useState('');
  const [page, setPage] = useState('panel');
  // Escritorio: menú expandido o reducido a íconos (se recuerda). Móvil: panel deslizable que se abre con ☰
  const [colapsado, setColapsado] = useState(() => localStorage.getItem(MENU_KEY) === '1');
  const [drawer, setDrawer] = useState(false);
  const toggleMenu = () => {
    if (esMovil()) { setDrawer((d) => !d); return; }
    setColapsado((c) => { localStorage.setItem(MENU_KEY, c ? '0' : '1'); return !c; });
  };
  const irA = (id) => { setPage(id); setDrawer(false); };
  useEffect(() => {
    if (!drawer) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDrawer(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);

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
  const ctx = { meta, fecha, setFecha, perfil: user.perfil, perfilNombre: user.nombre, nivel: NIVEL[user.perfil], puede, reloadMeta: loadMeta, goTo: irA };
  const Page = current.C;

  const iniciales = user.nombre.slice(0, 2).toUpperCase();

  return (
    <div className="app">
      <header className="topnav">
        <button type="button" className="menu-toggle" onClick={toggleMenu} aria-label={colapsado || !drawer ? 'Mostrar u ocultar el menú' : 'Cerrar el menú'} aria-expanded={!colapsado || drawer} aria-controls="menu-lateral">
          <Icon name="menu" />
        </button>
        <Monogram title="Ranking de Créditos" subtitle="Superintendencia de Bancos de Panamá" />
        {meta && meta.periodos.length > 0 && (
          <>
            <PeriodPicker periodos={meta.periodos} value={fecha} onChange={setFecha} />
            <AcercaDatos meta={meta} fecha={fecha} />
          </>
        )}
        <div className="user-chip">
          <span className="avatar">{iniciales}</span>
          <span><b>{user.nombre}</b><button className="btn link" onClick={logout}><Icon name="logout" />Cerrar sesión</button></span>
        </div>
      </header>

      <section className="banner">
        <nav className="crumb" aria-label="Ruta">
          <button type="button" onClick={() => irA('panel')}>Inicio</button>
          <span aria-hidden="true">/</span>
          <button type="button" onClick={() => irA(visible.find((p) => p.group === current.group)?.id || 'panel')}>{current.group}</button>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{current.label}</span>
        </nav>
        <h1>Ranking de Créditos por Actividad Económica</h1>
      </section>

      <div className={`body ${colapsado ? 'menu-colapsado' : ''}`}>
        {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(false)} aria-hidden="true" />}
        <nav id="menu-lateral" className={`side ${drawer ? 'drawer-open' : ''}`} aria-label="Módulos">
          <button type="button" className="side-collapse" onClick={toggleMenu} title={colapsado ? 'Expandir menú' : 'Reducir menú'}>
            <Icon name={drawer ? 'close' : 'sidebar'} /><span className="side-text">{drawer ? 'Cerrar menú' : 'Reducir menú'}</span>
          </button>
          {['Consulta', 'Análisis', 'Control'].map((g) => {
            const items = visible.filter((p) => p.group === g);
            if (!items.length) return null;
            return (
              <div key={g} style={{ display: 'contents' }}>
                <div className="group">{g}</div>
                {items.map((p) => (
                  <button key={p.id} className={p.id === current.id ? 'active' : ''} onClick={() => irA(p.id)} aria-current={p.id === current.id ? 'page' : undefined} title={colapsado ? p.label : undefined}>
                    <Icon name={p.icon} /><span className="side-text">{p.label}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <main>
          <ErrorBox error={metaError} />
          {!meta && !metaError && <Esqueleto />}
          {meta && meta.periodos.length === 0 && current.id !== 'admin' && (
            <div className="alert info">No hay períodos cargados. {user.perfil === 'administrador' ? 'Cargue un archivo AT03 en Administración.' : 'Un Administrador debe cargar un archivo AT03.'}</div>
          )}
          {meta && (meta.periodos.length > 0 || current.id === 'admin') && <div className="page-anim" key={current.id}><Page ctx={ctx} /></div>}
        </main>
      </div>
      <footer>
        <span>
          Fuente: archivos AT03{fecha ? ` / Corte ${fmtCorte(fecha)}` : ''} / Cálculo determinista desde los catálogos CINU/SB109, SB21 y bancos.
          {meta && ` Último cálculo: ${new Date(meta.calculadoEn).toLocaleString('es-PA')}.`}
        </span>
        <span className="footer-note"><Icon name="info" />Datos sintéticos / Uso informativo, no constituye opinión de la SBP</span>
      </footer>
      {puede('asistente_ia') && meta && (
        <ChatFlotante pantalla={{ id: current.id, label: current.label }} fecha={fecha} perfilNombre={user.nombre} iaConfigurada={Boolean(meta.asistenteDisponible)} />
      )}
      <Avisos />
    </div>
  );
}
