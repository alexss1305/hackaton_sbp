const money = new Intl.NumberFormat('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat('es-PA');
const compact = new Intl.NumberFormat('es-PA', { notation: 'compact', maximumFractionDigits: 1 });

const vacio = (v) => v === null || v === undefined || v === '';

/** Monto con signo de dólar. No usar para conteos, porcentajes, posiciones ni días. */
export const fmtMoney = (v) => (vacio(v) ? '—' : `$${money.format(Number(v))}`);
export const fmtMoneyCompact = (v) => (vacio(v) ? '—' : `$${compact.format(Number(v))}`);
export const fmtInt = (v) => (v === null || v === undefined ? '—' : int.format(v));
export const fmtCompact = (v) => compact.format(Number(v));
export const fmtPct = (v, d = 4) => (vacio(v) ? '—' : `${Number(v).toFixed(d)}%`);

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "20260731" -> "31/07/2026". Es el formato de pantalla de toda fecha de corte. */
export const fmtCorte = (f) => (f && String(f).length === 8 ? `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}` : f || '—');
/** Compatibilidad: los selectores y encabezados muestran el día de corte. */
export const fmtPeriodo = fmtCorte;
export const fmtPeriodoCorto = fmtCorte;
/** "20260731" -> "julio 2026". Solo para títulos que nombran el mes, junto a la fecha completa. */
export const fmtMes = (f) => (f && String(f).length === 8 ? `${MESES[Number(f.slice(4, 6)) - 1]} ${f.slice(0, 4)}` : f || '—');
export const fmtFechaHora = (iso) => new Date(iso).toLocaleString('es-PA');

/** Suma montos ya calculados por el servidor, en centavos, solo para un total visual. */
export function sumMoney(values) {
  let cents = 0n;
  for (const v of values) {
    if (v === null || v === undefined || v === '') continue;
    const neg = String(v).trim().startsWith('-');
    const [w, f = ''] = String(v).trim().replace('-', '').split('.');
    const whole = BigInt(w || '0');
    const frac = BigInt((f.replace(/\D/g, '') + '00').slice(0, 2) || '0');
    const c = whole * 100n + frac;
    cents += neg ? -c : c;
  }
  const neg = cents < 0n;
  const abs = (neg ? -cents : cents).toString().padStart(3, '0');
  return `${neg ? '-' : ''}${abs.slice(0, -2)}.${abs.slice(-2)}`;
}

/** Capitaliza un nombre de ranking: "HIPOTECARIO" -> "Hipotecario" (solo visual). */
export const fmtRanking = (r) => (r ? r.charAt(0) + r.slice(1).toLowerCase() : r);

/** Paleta categórica validada (orden fijo). Se asigna por categoría, nunca por rango. */
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)'];

/** Nombre del ranking como lo publica la SBP (solo para mostrar; el cálculo y las exportaciones usan Macroactividad_Reto). */
const NOMBRE_SBP = {
  HIPOTECARIO: 'Crédito Hipotecario', CONSTRUCCION: 'Créditos para la Construcción', INDUSTRIA: 'Créditos para la Industria',
  AGROPECUARIO: 'Créditos Agropecuarios', COMERCIO: 'Crédito Comercial', CONSUMO: 'Crédito al Consumo',
};
export const fmtRankingSBP = (r) => NOMBRE_SBP[r] || fmtRanking(r);
