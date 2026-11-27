/**
 * Comparación avanzada para el Analista: hasta 5 bancos × varios cortes × varias actividades.
 * Solo lee resultados ya calculados (rankings y subactividades) y usa la misma comparación oficial
 * (`compareRankings`) para los movimientos entre cortes consecutivos. No recalcula rankings.
 */
import { toCents, formatCents, pct } from './money.js';
import { compareRankings } from './compare.js';

export const MAX_BANCOS = 5;

/**
 * periods: períodos del store (ordenados por fecha). opts: { fechas, bancos, rankings, params }.
 * Devuelve { fechas, bancos, rankings, series, subactividades, movimientos, resumen }.
 */
export function comparar(periods, catalogs, { fechas = [], bancos = [], rankings = [], params } = {}) {
  const disponibles = periods.map((p) => p.fecha);
  const fs = [...new Set(fechas.length ? fechas : disponibles.slice(-2))].filter((f) => disponibles.includes(f)).sort();
  const rk = (rankings.length ? rankings : catalogs.macros).filter((r) => catalogs.macros.includes(r));
  const bk = [...new Set(bancos)].filter((b) => catalogs.bancoMap.has(b));
  if (!fs.length) throw Object.assign(new Error('Seleccione al menos un período cargado.'), { status: 400 });
  if (!bk.length) throw Object.assign(new Error('Seleccione al menos un banco.'), { status: 400 });
  if (bk.length > MAX_BANCOS) throw Object.assign(new Error(`Puede comparar hasta ${MAX_BANCOS} bancos a la vez.`), { status: 400 });

  const porFecha = new Map(periods.map((p) => [p.fecha, p]));
  const series = [];
  const subactividades = [];
  for (const f of fs) {
    const p = porFecha.get(f);
    for (const r of rk) {
      const filas = p.rankings[r] || [];
      // Participación de mercado: saldo del banco / saldo total del ranking (12 bancos), en enteros
      const totalRanking = filas.reduce((a, x) => a + toCents(x.Saldo_Actividad), 0n);
      for (const x of filas) {
        if (!bk.includes(x.Codigo_Banco)) continue;
        series.push({
          Fecha: f, Ranking: r, Codigo_Banco: x.Codigo_Banco, Banco: x.Banco, Posicion: x.Posicion,
          Saldo_Actividad: x.Saldo_Actividad, Ponderacion_Pct: x.Ponderacion_Pct,
          Participacion_Pct: pct(toCents(x.Saldo_Actividad), totalRanking, 2),
          Total_Ranking: formatCents(totalRanking), Operaciones_Validas: x.Operaciones_Validas,
        });
      }
    }
    for (const s of p.subactividades) {
      if (rk.includes(s.Ranking) && bk.includes(s.Codigo_Banco)) subactividades.push({ Fecha: f, Ranking: s.Ranking, Subactividad: s.Subactividad, Codigo_Banco: s.Codigo_Banco, Saldo: s.Saldo });
    }
  }

  // Movimientos entre cada par de cortes consecutivos seleccionados (y primero→último si hay más de dos)
  const pares = [];
  for (let i = 1; i < fs.length; i++) pares.push([fs[i - 1], fs[i]]);
  if (fs.length > 2) pares.push([fs[0], fs.at(-1)]);
  const movimientos = pares.flatMap(([a, b]) => compareRankings(porFecha.get(a), porFecha.get(b), params)
    .filter((m) => rk.includes(m.Ranking) && bk.includes(m.Codigo_Banco))
    .map((m) => ({ ...m, Par: `${a}-${b}`, Consecutivo: fs.indexOf(b) - fs.indexOf(a) === 1 })));

  // Resumen por banco y ranking entre el primer y el último corte
  const resumen = [];
  if (fs.length >= 1) {
    const ini = fs[0]; const fin = fs.at(-1);
    for (const r of rk) {
      for (const b of bk) {
        const a = series.find((s) => s.Fecha === ini && s.Ranking === r && s.Codigo_Banco === b);
        const z = series.find((s) => s.Fecha === fin && s.Ranking === r && s.Codigo_Banco === b);
        if (!a || !z) continue;
        const sa = toCents(a.Saldo_Actividad); const sz = toCents(z.Saldo_Actividad);
        resumen.push({
          Ranking: r, Codigo_Banco: b, Banco: z.Banco, Desde: ini, Hasta: fin,
          Posicion_Inicial: a.Posicion, Posicion_Final: z.Posicion, Cambio_Posicion: a.Posicion - z.Posicion,
          Saldo_Inicial: a.Saldo_Actividad, Saldo_Final: z.Saldo_Actividad, Var_Saldo: formatCents(sz - sa),
          Var_Saldo_Pct: sa === 0n ? null : pct(sz - sa, sa, 2),
          Participacion_Inicial: a.Participacion_Pct, Participacion_Final: z.Participacion_Pct,
        });
      }
    }
  }
  return { fechas: fs, bancos: bk, rankings: rk, series, subactividades, movimientos, resumen };
}
