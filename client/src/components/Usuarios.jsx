import { useState } from 'react';
import { api } from '../api.js';
import { useApi, ErrorBox, Loading } from './ui.jsx';
import { useConfirmar } from './Confirmar.jsx';
import { fmtFechaHora } from '../format.js';
import './admin.css';

const ROL = { analista: 'Analista', administrador: 'Administrador' };
const VACIO = { usuario: '', nombre: '', rol: 'analista', password: '' };

/** Administración de usuarios del personal: crear, editar rol, activar/desactivar, cambiar contraseña y eliminar. */
export default function Usuarios() {
  const { data, error, loading, reload } = useApi('/admin/usuarios');
  const [form, setForm] = useState(VACIO);
  const [editando, setEditando] = useState(null); // usuario en edición
  const [cambio, setCambio] = useState({});
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [dlg, confirmar] = useConfirmar();

  const ejecutar = async (fn, texto) => {
    setErr(null); setMsg(null);
    try { await fn(); setMsg(texto); reload(); return true; } catch (e) { setErr(e); return false; }
  };
  const crear = async (e) => {
    e.preventDefault();
    if (await ejecutar(() => api('/admin/usuarios', { method: 'POST', body: form }), `Usuario "${form.usuario.trim().toLowerCase()}" creado como ${ROL[form.rol]}.`)) setForm(VACIO);
  };
  const guardar = async (u) => {
    const c = { ...cambio };
    if (!c.password) delete c.password;
    const cambiaRol = c.rol && c.rol !== u.rol;
    if (cambiaRol || c.password) {
      const ok = await confirmar({
        titulo: `Actualizar a ${u.usuario}`, confirmarTexto: 'Guardar cambios',
        mensaje: 'Las sesiones abiertas de este usuario se cerrarán y deberá volver a ingresar.',
        cambios: [
          ...(cambiaRol ? [{ dato: 'Rol', antes: ROL[u.rol], despues: ROL[c.rol] }] : []),
          ...(c.password ? [{ dato: 'Contraseña', antes: '••••••', despues: 'nueva' }] : []),
        ],
      });
      if (!ok) return;
    }
    if (await ejecutar(() => api(`/admin/usuarios/${u.usuario}`, { method: 'PUT', body: c }), `Usuario "${u.usuario}" actualizado.`)) { setEditando(null); setCambio({}); }
  };
  const alternar = async (u) => {
    const ok = await confirmar({
      titulo: `${u.activo ? 'Desactivar' : 'Activar'} a ${u.usuario}`, peligro: u.activo, confirmarTexto: u.activo ? 'Desactivar' : 'Activar',
      mensaje: u.activo ? 'No podrá ingresar hasta que se vuelva a activar. Sus sesiones abiertas se cierran.' : 'Podrá volver a ingresar con su usuario y contraseña.',
    });
    if (ok) ejecutar(() => api(`/admin/usuarios/${u.usuario}`, { method: 'PUT', body: { activo: !u.activo } }), `Usuario "${u.usuario}" ${u.activo ? 'desactivado' : 'activado'}.`);
  };
  const eliminar = async (u) => {
    const ok = await confirmar({ titulo: `Eliminar a ${u.usuario}`, peligro: true, palabra: u.usuario, confirmarTexto: 'Eliminar usuario', mensaje: 'Se eliminará el usuario de forma permanente. Sus registros en la bitácora se conservan.' });
    if (ok) ejecutar(() => api(`/admin/usuarios/${u.usuario}`, { method: 'DELETE' }), `Usuario "${u.usuario}" eliminado.`);
  };
  const cambiarInicial = async (u) => {
    const pw = cambio.password || '';
    const ok = await confirmar({ titulo: `Nueva contraseña para ${u.usuario}`, confirmarTexto: 'Guardar contraseña', mensaje: 'Se actualiza el archivo .env local (no se sube al repositorio). La contraseña no se vuelve a mostrar.' });
    if (ok && await ejecutar(() => api('/admin/contrasena', { method: 'PUT', body: { perfil: u.rol, password: pw } }), 'Contraseña actualizada.')) { setEditando(null); setCambio({}); }
  };

  return (
    <div className="card">
      <h2>Usuarios y roles</h2>
      <p className="sub">Cree usuarios del personal con rol Analista o Administrador. Las contraseñas se guardan cifradas en <code>data/usuarios.json</code>, que no se sube al repositorio. Los usuarios iniciales vienen del archivo <code>.env</code>.</p>
      <form className="us-form" onSubmit={crear}>
        <label className="field">Usuario<input type="text" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} placeholder="ej. jperez" required autoComplete="off" /></label>
        <label className="field">Nombre<input type="text" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre y apellido" /></label>
        <label className="field">Rol<select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}><option value="analista">Analista</option><option value="administrador">Administrador</option></select></label>
        <label className="field">Contraseña<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required autoComplete="new-password" placeholder="Mínimo 8 caracteres" /></label>
        <button className="btn primary" type="submit">Crear usuario</button>
      </form>
      {msg && <div className="alert success" style={{ marginTop: 12 }}>{msg}</div>}
      <div style={{ marginTop: 12 }}><ErrorBox error={err || error} /></div>
      {loading ? <Loading /> : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead><tr><th>Usuario</th><th>Nombre</th><th>Rol</th><th>Estado</th><th>Actualizado</th><th /></tr></thead>
            <tbody>
              {(data?.usuarios || []).map((u) => (
                <tr key={u.usuario + (u.sistema ? '-env' : '')}>
                  <td><b>{u.usuario}</b>{u.sistema && <span className="muted"> · inicial</span>}</td>
                  <td>{editando === u.usuario && !u.sistema
                    ? <input type="text" defaultValue={u.nombre} onChange={(e) => setCambio({ ...cambio, nombre: e.target.value })} />
                    : u.nombre}</td>
                  <td>{editando === u.usuario && !u.sistema
                    ? <select defaultValue={u.rol} onChange={(e) => setCambio({ ...cambio, rol: e.target.value })}><option value="analista">Analista</option><option value="administrador">Administrador</option></select>
                    : <span className={`us-rol ${u.rol}`}>{ROL[u.rol]}</span>}</td>
                  <td>{u.activo ? <span className="badge ok">Activo</span> : <span className="badge muted">Inactivo</span>}</td>
                  <td>{u.actualizado ? fmtFechaHora(u.actualizado) : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {editando === u.usuario ? (
                      <>
                        <input type="password" placeholder={u.sistema ? 'Nueva contraseña' : 'Nueva contraseña (opcional)'} minLength={8} onChange={(e) => setCambio({ ...cambio, password: e.target.value })} style={{ minWidth: 160 }} autoComplete="new-password" />{' '}
                        <button className="btn primary" onClick={() => (u.sistema ? cambiarInicial(u) : guardar(u))}>Guardar</button>{' '}
                        <button className="btn" onClick={() => { setEditando(null); setCambio({}); }}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button className="btn" onClick={() => { setEditando(u.usuario); setCambio({}); }}>{u.sistema ? 'Cambiar contraseña' : 'Editar'}</button>
                        {!u.sistema && <>{' '}<button className="btn" onClick={() => alternar(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button>{' '}<button className="btn danger" onClick={() => eliminar(u)}>Eliminar</button></>}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dlg}
    </div>
  );
}
