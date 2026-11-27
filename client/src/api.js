/** Cliente HTTP de la API. El token de sesión se guarda en sessionStorage (se borra al cerrar la pestaña). */
const TOKEN_KEY = 'sbp-token';
export const getToken = () => sessionStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(message, status, detalles, diagnostico) { super(message); this.status = status; this.detalles = detalles; this.diagnostico = diagnostico; }
}

export async function api(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const token = getToken();
  const h = { ...headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  let payload = body;
  if (body !== undefined && typeof body !== 'string') { h['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers: h, body: payload });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. ¿Está ejecutándose el backend (npm run dev)?', 0);
  }
  if (!res.ok) {
    let data = {};
    try { data = await res.json(); } catch { /* sin cuerpo JSON */ }
    throw new ApiError(data.error || `Error ${res.status}`, res.status, data.detalles, data.diagnostico);
  }
  return raw ? res : res.json();
}

/** Descarga un CSV de la API (con el token del perfil) como archivo. */
export async function download(path, fallbackName = 'export.csv', opts = {}) {
  const res = await api(path, { ...opts, raw: true });
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName;
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const qs = (o) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : v)}`);
  return p.length ? `?${p.join('&')}` : '';
};
