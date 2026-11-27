import { useState } from 'react';
import { api, setToken } from '../api.js';
import { ErrorBox } from '../components/ui.jsx';
import { Icon, Monogram } from '../components/brand.jsx';

const PERSONAL = [
  { id: 'analista', nombre: 'Analista', icon: 'chart' },
  { id: 'administrador', nombre: 'Administrador', icon: 'shield' },
];

function Hero({ titulo, texto }) {
  return (
    <div className="login-hero">
      <Monogram inverse subtitle="de Bancos de Panamá" title="Superintendencia" />
      <div>
        <div className="gold-rule" />
        <h1>{titulo}</h1>
        <p>{texto}</p>
      </div>
    </div>
  );
}

export default function Login({ onLogin }) {
  const [paso, setPaso] = useState('inicio'); // 'inicio' | 'personal'
  const [perfil, setPerfil] = useState('analista');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const entrar = async (body) => {
    setBusy(true); setError(null);
    try {
      const r = await api('/auth/login', { method: 'POST', body });
      setToken(r.token);
      onLogin({ perfil: r.perfil, nombre: r.nombre });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const submitPersonal = (e) => {
    e.preventDefault();
    if (!usuario.trim() || !password) { setError(new Error('Ingrese su usuario y contraseña.')); return; }
    entrar({ perfil, usuario, password });
  };

  return (
    <div className="login-page">
      <div className="login-shell">
        {paso === 'inicio' ? (
          <>
            <Hero
              titulo="Ranking de Créditos"
              texto="Posición de cada banco por actividad económica, comparación entre períodos y reportes con su respaldo."
            />
            <div className="login-side">
              <div className="login-box">
                <h2>Ranking de Créditos / Superintendencia de Bancos de Panamá</h2>
                <p className="lead">Seleccione su perfil para ingresar.</p>
                <div className="gold-line" />
                <ErrorBox error={error} />
                <button type="button" className="choice" disabled={busy} onClick={() => entrar({ perfil: 'publico' })}>
                  <span className="ci"><Icon name="globe" /></span>
                  <span><b>Público</b><small>Consultar rankings, filtros, gráficos y descargas. Sin contraseña.</small></span>
                  <Icon name="chevron" className="arrow" />
                </button>
                <button type="button" className="choice staff" onClick={() => { setPaso('personal'); setError(null); }}>
                  <span className="ci"><Icon name="briefcase" /></span>
                  <span><b>Personal de la Superintendencia</b><small>Analistas y administradores. Requiere usuario y contraseña.</small></span>
                  <Icon name="chevron" className="arrow" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <Hero
              titulo="Acceso del personal"
              texto="Análisis comparativo, movimientos de posición, carga de períodos, parámetros y catálogos."
            />
            <div className="login-side">
              <form className="login-box" onSubmit={submitPersonal}>
                <button type="button" className="btn link" onClick={() => { setPaso('inicio'); setError(null); setPassword(''); }}>
                  <Icon name="back" /> Volver
                </button>
                <h2>Personal de la Superintendencia</h2>
                <p className="lead">Seleccione su perfil e ingrese sus credenciales.</p>
                <div className="seg" role="radiogroup" aria-label="Perfil">
                  {PERSONAL.map((p) => (
                    <button key={p.id} type="button" role="radio" aria-checked={perfil === p.id} className={perfil === p.id ? 'on' : ''} onClick={() => { setPerfil(p.id); setError(null); }}>
                      <Icon name={p.icon} />{p.nombre}
                    </button>
                  ))}
                </div>
                <label className="field-lg">Usuario
                  <span className="in"><Icon name="user" /><input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus autoComplete="username" /></span>
                </label>
                <label className="field-lg">Contraseña
                  <span className="in"><Icon name="lock" /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></span>
                </label>
                <ErrorBox error={error} />
                <button className="btn primary btn-lg" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
              </form>
            </div>
          </>
        )}
      </div>
      <div className="fine-print">Datos sintéticos con estructura AT03 / Hackathon SBP 2026 / Uso informativo</div>
    </div>
  );
}
