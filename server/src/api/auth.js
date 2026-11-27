/**
 * Control básico de acceso por perfil (no es seguridad productiva; es suficiente para la demo local).
 * - Público: no requiere contraseña.
 * - Analista y Administrador (personal de la Superintendencia): usuario y contraseña definidos en .env
 *   (ANALISTA_USER / ANALISTA_PASSWORD y ADMIN_USER / ADMIN_PASSWORD). Si falta un usuario se usa "analista" o
 *   "admin"; si falta una contraseña se genera una aleatoria al iniciar y se muestra en la consola.
 *   Nunca se guardan credenciales en el repositorio.
 */
import crypto from 'node:crypto';

export const PERFILES = {
  publico: { nombre: 'Público', nivel: 1 },
  analista: { nombre: 'Analista', nivel: 2 },
  administrador: { nombre: 'Administrador', nivel: 3 },
};

/** true solo para 'publico' | 'analista' | 'administrador' (evita claves heredadas como 'constructor'). */
export const esPerfil = (p) => typeof p === 'string' && Object.hasOwn(PERFILES, p);

const sessions = new Map(); // token -> { perfil, creado }
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Usuario por defecto de cada perfil del personal (se puede cambiar en .env). */
export const USUARIOS_POR_DEFECTO = { analista: 'analista', administrador: 'admin' };

/** Lee las credenciales del personal desde .env: { analista: { usuario, password }, administrador: {...} }. */
export function initPasswords() {
  const cred = {};
  for (const [perfil, userVar, pwVar] of [['analista', 'ANALISTA_USER', 'ANALISTA_PASSWORD'], ['administrador', 'ADMIN_USER', 'ADMIN_PASSWORD']]) {
    const usuario = process.env[userVar] || USUARIOS_POR_DEFECTO[perfil];
    let password = process.env[pwVar];
    if (!password) {
      password = crypto.randomBytes(6).toString('base64url');
      console.warn(`[auth] ${pwVar} no está definido en .env. Credenciales temporales para "${perfil}": usuario ${usuario} / contraseña ${password}`);
    }
    cred[perfil] = { usuario, password };
  }
  return cred;
}

/** Acepta { perfil: 'contraseña' } (forma anterior) o { perfil: { usuario, password } }. */
const credencial = (creds, perfil) => {
  const c = creds?.[perfil];
  return typeof c === 'string' ? { usuario: USUARIOS_POR_DEFECTO[perfil], password: c } : c;
};

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function login(creds, perfil, password, usuario) {
  if (!esPerfil(perfil)) return null;
  if (perfil !== 'publico') {
    const c = credencial(creds, perfil);
    if (!c || typeof c.password !== 'string' || !c.password) return null; // sin contraseña configurada no hay acceso
    // Se comparan ambos valores siempre, para no revelar cuál de los dos es incorrecto
    const okUser = safeEqual(String(usuario ?? '').trim().toLowerCase(), String(c?.usuario ?? '').toLowerCase());
    const okPass = safeEqual(password ?? '', c?.password ?? '');
    if (!c || !okUser || !okPass) return null;
  }
  const token = crypto.randomBytes(24).toString('base64url');
  const ahora = Date.now();
  for (const [t, s] of sessions) if (ahora - s.creado >= SESSION_TTL_MS) sessions.delete(t); // limpia sesiones vencidas
  sessions.set(token, { perfil, creado: ahora });
  return token;
}

export function logout(token) { sessions.delete(token); }

/** Middleware: identifica el perfil por el token Bearer; sin token = público. */
export function authenticate(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const s = token && sessions.get(token);
  if (s && Date.now() - s.creado < SESSION_TTL_MS && esPerfil(s.perfil)) { req.perfil = s.perfil; req.token = token; } else {
    if (s) sessions.delete(token);
    req.perfil = 'publico';
  }
  next();
}

/** Middleware: exige un perfil de al menos el nivel indicado. */
export const requirePerfil = (minimo) => (req, res, next) => {
  if (esPerfil(req.perfil) && PERFILES[req.perfil].nivel >= PERFILES[minimo].nivel) return next();
  res.status(403).json({ error: `Acción disponible solo para el perfil ${PERFILES[minimo].nombre}${minimo === 'administrador' ? '' : ' o superior'}.` });
};
