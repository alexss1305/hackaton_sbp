/**
 * Usuarios del personal creados por el Administrador. Se guardan en data/usuarios.json (NO se versiona: R5),
 * con la contraseña cifrada con scrypt y sal aleatoria. Los usuarios definidos en .env siguen funcionando
 * como usuarios iniciales.
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

export const ROLES = ['analista', 'administrador'];
const USUARIO_RE = /^[a-z0-9._-]{3,32}$/;

function hash(password, sal = crypto.randomBytes(16).toString('hex')) {
  return { sal, hash: crypto.scryptSync(String(password), sal, 64).toString('hex') };
}
const err = (msg, status = 400) => Object.assign(new Error(msg), { status });

export class Usuarios {
  /** reservados: nombres de usuario de .env, que no se pueden repetir. */
  constructor(file, reservados = []) {
    this.file = file;
    this.reservados = reservados.map((u) => String(u).toLowerCase());
    try { this.lista = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.lista = []; }
    if (!Array.isArray(this.lista)) this.lista = [];
  }

  #guardar() { fs.writeFileSync(this.file, JSON.stringify(this.lista, null, 2)); }

  /** Vista pública (nunca incluye el hash ni la sal). */
  publicos() {
    return this.lista.map(({ usuario, nombre, rol, activo, creado, actualizado, creadoPor }) => ({ usuario, nombre, rol, activo, creado, actualizado, creadoPor }));
  }

  /** Devuelve el usuario si usuario+contraseña+rol coinciden y está activo; si no, null. */
  verificar(usuario, password, rol) {
    const u = this.lista.find((x) => x.usuario === String(usuario ?? '').trim().toLowerCase());
    if (!u || !u.activo || u.rol !== rol) return null;
    const calc = Buffer.from(hash(password, u.sal).hash, 'hex');
    const guardado = Buffer.from(u.hash, 'hex');
    return calc.length === guardado.length && crypto.timingSafeEqual(calc, guardado) ? u : null;
  }

  #validarPassword(p) {
    if (typeof p !== 'string' || p.length < 8 || p.length > 80) throw err('La contraseña debe tener entre 8 y 80 caracteres.');
  }

  /** Administradores activos que quedarían si se aplica `cambio` (incluye los de .env si hay). */
  #adminsActivos(excepto) {
    return this.lista.filter((x) => x.rol === 'administrador' && x.activo && x.usuario !== excepto).length;
  }

  crear({ usuario, nombre, rol, password }, por) {
    const u = String(usuario ?? '').trim().toLowerCase();
    if (!USUARIO_RE.test(u)) throw err('El usuario debe tener de 3 a 32 caracteres: letras minúsculas, números, punto, guion o guion bajo.');
    if (this.reservados.includes(u) || this.lista.some((x) => x.usuario === u)) throw err(`El usuario "${u}" ya existe.`);
    if (!ROLES.includes(rol)) throw err('Rol inválido: use Analista o Administrador.');
    this.#validarPassword(password);
    const ahora = new Date().toISOString();
    this.lista.push({ usuario: u, nombre: String(nombre ?? '').trim().slice(0, 80) || u, rol, activo: true, ...hash(password), creado: ahora, actualizado: ahora, creadoPor: por || null });
    this.#guardar();
    return this.publicos().find((x) => x.usuario === u);
  }

  /** Cambia nombre, rol, estado o contraseña. adminsEnv: cuántos administradores hay en .env. */
  actualizar(usuario, cambios, adminsEnv = 0) {
    const u = this.lista.find((x) => x.usuario === usuario);
    if (!u) throw err('Usuario no encontrado.', 404);
    const nuevoRol = cambios.rol ?? u.rol;
    const nuevoActivo = cambios.activo === undefined ? u.activo : Boolean(cambios.activo);
    if (!ROLES.includes(nuevoRol)) throw err('Rol inválido.');
    if (u.rol === 'administrador' && u.activo && (nuevoRol !== 'administrador' || !nuevoActivo) && this.#adminsActivos(u.usuario) + adminsEnv === 0) {
      throw err('No se puede dejar el sistema sin ningún Administrador activo.');
    }
    if (cambios.password !== undefined && cambios.password !== '') { this.#validarPassword(cambios.password); Object.assign(u, hash(cambios.password)); }
    if (cambios.nombre !== undefined) u.nombre = String(cambios.nombre).trim().slice(0, 80) || u.usuario;
    u.rol = nuevoRol; u.activo = nuevoActivo; u.actualizado = new Date().toISOString();
    this.#guardar();
    return this.publicos().find((x) => x.usuario === usuario);
  }

  eliminar(usuario, adminsEnv = 0) {
    const u = this.lista.find((x) => x.usuario === usuario);
    if (!u) throw err('Usuario no encontrado.', 404);
    if (u.rol === 'administrador' && u.activo && this.#adminsActivos(u.usuario) + adminsEnv === 0) throw err('No se puede eliminar al último Administrador activo.');
    this.lista = this.lista.filter((x) => x.usuario !== usuario);
    this.#guardar();
  }
}
