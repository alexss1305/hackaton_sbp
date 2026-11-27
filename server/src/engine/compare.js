import { toCents, formatCents, pct } from './money.js';

/** Parámetros por defecto de "movimiento significativo" (configurables por el Administrador). */
export const DEFAULT_PARAMS = {
  minCambioPosicion: 2, // |Cambio_Posicion| >= N
  cambioLider: true, // cambio en la posición 1
  umbralVarSaldoPct: 25, // |Var_Saldo_Pct| >= umbral (%); null o 0 para desactivar
};

const fmtMoney = (c) => Number(formatCents(c)).toLocaleString('es-PA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Compara los rankings de dos períodos (Sección 8).
 * Cambio_Posicion = Posicion_anterior − Posicion_actual (positivo = sube).
 */
export function compareRankings(prev, curr, params = DEFAULT_PARAMS) {
  const p = { ...DEFAULT_PARAMS, ...params };
  const movimientos = [];
  for (const ranking of Object.keys(curr.rankings)) {
    const prevRows = prev.rankings[ranking] || [];
    const prevBy = new Map(prevRows.map((r) => [r.Codigo_Banco, r]));
    const prevLeader = prevRows[0]?.Codigo_Banco;
    const currLeader = curr.rankings[ranking][0]?.Codigo_Banco;
    const leaderChanged = prevLeader && currLeader && prevLeader !== currLeader;

    for (const r of curr.rankings[ranking]) {
      const a = prevBy.get(r.Codigo_Banco);
      const saldoAnt = a ? toCents(a.Saldo_Actividad) : 0n;
      const saldoAct = toCents(r.Saldo_Actividad);
      const varSaldo = saldoAct - saldoAnt;
      const varPct = saldoAnt === 0n ? null : pct(varSaldo, saldoAnt, 2);
      const cambio = a ? a.Posicion - r.Posicion : null;

      const motivos = [];
      if (cambio !== null && Math.abs(cambio) >= p.minCambioPosicion) motivos.push(`|Cambio_Posicion| >= ${p.minCambioPosicion}`);
      if (p.cambioLider && leaderChanged && (r.Codigo_Banco === currLeader || r.Codigo_Banco === prevLeader)) motivos.push('Cambio de líder');
      if (p.umbralVarSaldoPct && varPct !== null && Math.abs(Number(varPct)) >= p.umbralVarSaldoPct) motivos.push(`|Var_Saldo_Pct| >= ${p.umbralVarSaldoPct}%`);

      movimientos.push({
        Fecha_Anterior: prev.fecha,
        Fecha_Actual: curr.fecha,
        Ranking: ranking,
        Codigo_Banco: r.Codigo_Banco,
        Banco: r.Banco,
        Posicion_Anterior: a ? a.Posicion : null,
        Posicion_Actual: r.Posicion,
        Cambio_Posicion: cambio,
        Tendencia: cambio === null ? 'Nuevo' : cambio > 0 ? 'Sube' : cambio < 0 ? 'Baja' : 'Se mantiene',
        Saldo_Anterior: formatCents(saldoAnt),
        Saldo_Actual: formatCents(saldoAct),
        Var_Saldo: formatCents(varSaldo),
        Var_Saldo_Pct: varPct,
        Significativo: motivos.length > 0,
        Motivo_Significativo: motivos.join('; '),
        Explicacion: '',
      });
    }
  }
  for (const m of movimientos) if (m.Significativo) m.Explicacion = explain(m, prev, curr);
  return movimientos;
}

/** Explicación automática y determinista de un movimiento: identifica la subactividad que más aportó. */
function explain(m, prev, curr) {
  const deltas = new Map();
  for (const s of curr.subactividades) if (s.Ranking === m.Ranking && s.Codigo_Banco === m.Codigo_Banco) deltas.set(s.Subactividad, toCents(s.Saldo));
  for (const s of prev.subactividades) if (s.Ranking === m.Ranking && s.Codigo_Banco === m.Codigo_Banco) deltas.set(s.Subactividad, (deltas.get(s.Subactividad) ?? 0n) - toCents(s.Saldo));
  let driver = null;
  for (const [sub, d] of deltas) if (!driver || (d < 0n ? -d : d) > (driver.d < 0n ? -driver.d : driver.d)) driver = { sub, d };

  const v = toCents(m.Var_Saldo);
  let txt;
  if (m.Cambio_Posicion > 0) txt = `${m.Banco} sube del puesto ${m.Posicion_Anterior} al ${m.Posicion_Actual} en ${m.Ranking}`;
  else if (m.Cambio_Posicion < 0) txt = `${m.Banco} baja del puesto ${m.Posicion_Anterior} al ${m.Posicion_Actual} en ${m.Ranking}`;
  else txt = `${m.Banco} se mantiene en el puesto ${m.Posicion_Actual} en ${m.Ranking}`;
  if (m.Motivo_Significativo.includes('líder')) txt += m.Posicion_Actual === 1 ? ' y pasa a liderar el ranking' : ' y pierde el liderazgo';
  txt += `. Su saldo ${v >= 0n ? 'crece' : 'cae'} ${fmtMoney(v < 0n ? -v : v)}`;
  if (m.Var_Saldo_Pct !== null) txt += ` (${Number(m.Var_Saldo_Pct) >= 0 ? '+' : ''}${m.Var_Saldo_Pct}%)`;
  if (driver && driver.d !== 0n) txt += `; la subactividad con mayor variación es ${driver.sub} (${driver.d >= 0n ? '+' : '−'}${fmtMoney(driver.d < 0n ? -driver.d : driver.d)})`;
  return txt + '.';
}
