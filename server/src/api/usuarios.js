import express from 'express';
import { ROLES } from '../store/usuarios.js';
import { cerrarSesionesDe, USUARIOS_POR_DEFECTO } from './auth.js';

const NOMBRE_ROL = { analista: 'Analista', administrador: 'Administrador' };

/**
 * Administración de usuarios del personal (solo Administrador). Se monta en /api.
 * Los usuarios iniciales de .env se muestran como "de sistema" y no se editan aquí.
 */
export function usuariosRouter(store, passwords, admin) {
  const r = express.Router();
  const adminsEnv = () => (passwords?.administrador ? 1 : 0);
  const delSistema = () => ROLES.filter((rol) => passwords?.[rol]).map((rol) => ({
    usuario: (typeof passwords[rol] === 'string' ? USUARIOS_POR_DEFECTO[rol] : passwords[rol].usuario) || USUARIOS_POR_DEFECTO[rol],
    nombre: `${NOMBRE_ROL[rol]} inicial (.env)`, rol, activo: true, sistema: true,
  }));

  r.get('/admin/usuarios', admin, (req, res) => res.json({ roles: ROLES, usuarios: [...delSistema(), ...store.usuarios.publicos()] }));

  r.post('/admin/usuarios', admin, express.json(), (req, res, next) => {
    try {
      const u = store.usuarios.crear(req.body || {}, req.usuario);
      store.addLog(req.perfil, 'Usuario creado', `${u.usuario} (${NOMBRE_ROL[u.rol]})`);
      res.status(201).json(u);
    } catch (e) { next(e); }
  });

  r.put('/admin/usuarios/:usuario', admin, express.json(), (req, res, next) => {
    try {
      const antes = store.usuarios.publicos().find((x) => x.usuario === req.params.usuario);
      const u = store.usuarios.actualizar(req.params.usuario, req.body || {}, adminsEnv());
      const cambios = [];
      if (antes && antes.rol !== u.rol) cambios.push(`rol ${NOMBRE_ROL[antes.rol]} → ${NOMBRE_ROL[u.rol]}`);
      if (antes && antes.activo !== u.activo) cambios.push(u.activo ? 'activado' : 'desactivado');
      if (req.body?.password) cambios.push('contraseña cambiada');
      if (antes && antes.nombre !== u.nombre) cambios.push('nombre actualizado');
      // Un cambio de rol, estado o contraseña cierra sus sesiones abiertas
      if (cambios.some((c) => !c.startsWith('nombre'))) cerrarSesionesDe(u.usuario);
      store.addLog(req.perfil, 'Usuario actualizado', `${u.usuario}: ${cambios.join(', ') || 'sin cambios'}`);
      res.json(u);
    } catch (e) { next(e); }
  });

  r.delete('/admin/usuarios/:usuario', admin, (req, res, next) => {
    try {
      if (req.params.usuario === req.usuario) return res.status(400).json({ error: 'No puede eliminar su propio usuario mientras tiene la sesión abierta.' });
      store.usuarios.eliminar(req.params.usuario, adminsEnv());
      cerrarSesionesDe(req.params.usuario);
      store.addLog(req.perfil, 'Usuario eliminado', req.params.usuario);
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
  return r;
}
