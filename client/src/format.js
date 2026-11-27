const money = new Intl.NumberFormat('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('es-PA');
const compact = new Intl.NumberFormat('es-PA', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtMoney = (v) => (v === null || v === undefined || v === '' ? '—' : money.format(Number(v)));
export const fmtInt = (v) => (v === null || v === undefined ? '—' : int.format(v));
export const fmtCompact = (v) => compact.format(Number(v));
export const fmtPct = (v, d = 4) => (v === null || v === undefined || v === '' ? '—' : `${Number(v).toFixed(d)}%`);

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** "20260731" -> "julio 2026" */
export const fmtPeriodo = (f) => (f && f.length === 8 ? `${MESES[Number(f.slice(4, 6)) - 1]} ${f.slice(0, 4)}` : f || '—');
export const fmtPeriodoCorto = (f) => (f && f.length === 8 ? `${MESES[Number(f.slice(4, 6)) - 1].slice(0, 3)} ${f.slice(2, 4)}` : f);
export const fmtFechaHora = (iso) => new Date(iso).toLocaleString('es-PA');

/** Capitaliza un nombre de ranking: "HIPOTECARIO" -> "Hipotecario" (solo visual). */
export const fmtRanking = (r) => (r ? r.charAt(0) + r.slice(1).toLowerCase() : r);

/** Paleta categórica validada (orden fijo; ver skill dataviz). Se asigna por entidad, nunca por rango. */
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];
