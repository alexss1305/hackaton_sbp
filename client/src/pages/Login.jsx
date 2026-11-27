import { useState } from 'react';
import { api, setToken } from '../api.js';
import { ErrorBox } from '../components/ui.jsx';

const PERFILES = [
  { id: 'publico', nombre: 'Público', desc: 'Consultar rankings, aplicar filtros, ver gráficos y tablas, descargar información.' },
  { id: 'analista', nombre: 'Analista', desc: 'Además: comparar entidades y períodos, movimientos de posición y reportes personalizados.' },
  { id: 'administrador', nombre: 'Administrador', desc: 'Además: cargar o actualizar períodos, parámetros, catálogos y bitácora de operaciones.' },
];

export default function Login({ onLogin }) {
  const [perfil, setPerfil] = useState('publico');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api('/auth/login', { method: 'POST', body: { perfil, password } });
      setToken(r.token);
      onLogin({ perfil: r.perfil, nombre: r.nombre });
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="login" onSubmit={submit}>
        <div>
          <h1>Rankings de Crédito</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Hackathon SBP 2026 · Seleccione su perfil para ingresar</p>
        </div>
        <div className="profiles" role="radiogroup">
          {PERFILES.map((p) => (
            <label key={p.id} className={perfil === p.id ? 'on' : ''}>
              <input type="radio" name="perfil" checked={perfil === p.id} onChange={() => { setPerfil(p.id); setError(null); }} />
              <span><b>{p.nombre}</b><small>{p.desc}</small></span>
            </label>
          ))}
        </div>
        {perfil !== 'publico' && (
          <label className="field">Contraseña del perfil {PERFILES.find((p) => p.id === perfil).nombre}
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
          </label>
        )}
        <ErrorBox error={error} />
        <button className="btn primary" disabled={busy} style={{ justifyContent: 'center' }}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
        <small className="muted">⚠ Plataforma con datos ficticios para el Hackathon SBP 2026. Uso informativo.</small>
      </form>
    </div>
  );
}
