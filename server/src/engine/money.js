/**
 * Aritmética exacta: los montos se manejan como centavos enteros (BigInt).
 * Nunca se usa punto flotante para sumar saldos.
 */
const MONEY_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/** "84556.97" -> 8455697n. Devuelve null si el texto no es un monto válido. */
export function toCents(text) {
  const m = MONEY_RE.exec(String(text ?? '').trim());
  if (!m) return null;
  const cents = BigInt(m[2]) * 100n + BigInt((m[3] || '0').padEnd(2, '0'));
  return m[1] ? -cents : cents;
}

/** 8455697n -> "84556.97" */
export function formatCents(c) {
  const v = BigInt(c);
  const neg = v < 0n;
  const a = neg ? -v : v;
  return `${neg ? '-' : ''}${a / 100n}.${String(a % 100n).padStart(2, '0')}`;
}

/** 900719925474099301n -> "9,007,199,254,740,993.01" (exacto, sin pasar por Number). */
export function formatCentsMiles(c) {
  const [ent, dec] = formatCents(c).split('.');
  const neg = ent.startsWith('-');
  const digits = neg ? ent.slice(1) : ent;
  return `${neg ? '-' : ''}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${dec}`;
}

/** Centavos -> número JS (solo para gráficos/JSON, nunca para sumar). */
export const centsToNumber = (c) => Number(c) / 100;

/**
 * num/den*100 redondeado a `decimals` decimales con redondeo aritmético (half-up),
 * calculado en enteros. Devuelve texto con `decimals` decimales.
 */
export function pct(num, den, decimals = 4) {
  num = BigInt(num); den = BigInt(den);
  if (den === 0n) return (0).toFixed(decimals);
  const neg = (num < 0n) !== (den < 0n) && num !== 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const scale = 10n ** BigInt(decimals);
  const scaled = n * 100n * scale;
  let q = scaled / d;
  if ((scaled % d) * 2n >= d) q += 1n;
  const s = `${q / scale}.${String(q % scale).padStart(decimals, '0')}`;
  return neg && q !== 0n ? `-${s}` : s;
}
