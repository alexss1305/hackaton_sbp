/**
 * Control básico de acceso por perfil (no es seguridad productiva; es suficiente para la demo local).
 * - Público: no requiere contraseña.
 * - Analista y Administrador: contraseña definida en .env (ANALISTA_PASSWORD / ADMIN_PASSWORD).
 *   Si no existe, se genera una aleatoria al iniciar y se muestra en la consola. Nunca se guardan en el repo.
 */
import crypto from 'node:crypto';

export const PERFILES = {
  publico: { nombre: 'Público', nivel: 1 },
  analista: { nombre: 'Analista', nivel: 2 },
  administrador: { nombre: 'Administrador', nivel: 3 },
};

const sessions = new Map(); // token -> { perfil, creado }
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function initPasswords() {
  const pw = {};
  for (const [perfil, envVar] of [['analista', 'ANALISTA_PASSWORD'], ['administrador', 'ADMIN_PASSWORD']]) {
    if (process.env[envVar]) pw[perfil] = process.env[envVar];
    else {
      pw[perfil] = crypto.randomBytes(6).toString('base64url');
      console.warn(`[auth] ${envVar} no está definido en .env. Contraseña temporal para "${perfil}": ${pw[perfil]}`);
    }
  }
  return pw;
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function login(passwords, perfil, password) {
  if (!PERFILES[perfil]) return null;
  if (perfil !== 'publico' && !safeEqual(password ?? '', passwords[perfil])) return null;
  const token = crypto.randomBytes(24).toString('base64url');
  sessions.set(token, { perfil, creado: Date.now() });
  return token;
}

export function logout(token) { sessions.delete(token); }

/** Middleware: identifica el perfil por el token Bearer; sin token = público. */
export function authenticate(req, _res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const s = token && sessions.get(token);
  if (s && Date.now() - s.creado < SESSION_TTL_MS) { req.perfil = s.perfil; req.token = token; } else req.perfil = 'publico';
  next();
}

/** Middleware: exige un perfil de al menos el nivel indicado. */
export const requirePerfil = (minimo) => (req, res, next) => {
  if (PERFILES[req.perfil].nivel >= PERFILES[minimo].nivel) return next();
  res.status(403).json({ error: `Acción disponible solo para el perfil ${PERFILES[minimo].nombre}${minimo === 'administrador' ? '' : ' o superior'}.` });
};
