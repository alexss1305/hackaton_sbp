import { formatCents, pct, centsToNumber, toCents } from './money.js';
import { MONTO_POR_VENCER_COLS, MONTO_VENCIDO_COLS } from './rules.js';

const cmpCodigo = (a, b) => {
  const na = Number(a); const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
};

/** Lista de bancos a incluir en cada ranking: los 12 del catálogo + cualquier código no catalogado presente. */
function bankList(rows, catalogs) {
  const codes = new Set(catalogs.bancos.map((b) => b.codigo));
  for (const r of rows) codes.add(r.Codigo_Banco);
  return [...codes].sort(cmpCodigo).map((c) => ({ codigo: c, nombre: catalogs.bancoMap.get(c) ?? `(No catalogado ${c})` }));
}

/**
 * Agregación de un período (Sección 4.C, pasos 5 a 9) sobre filas ya clasificadas.
 * Todos los montos se suman en centavos BigInt.
 */
export function aggregate(fecha, rows, catalogs) {
  const banks = bankList(rows, catalogs);
  const { macros, subsByMacro } = catalogs;

  // sub[macro][sub][banco] = { cents, ops } ; total[banco] = cents
  const sub = {};
  for (const m of macros) {
    sub[m] = {};
    for (const s of subsByMacro[m]) {
      sub[m][s] = {};
      for (const b of banks) sub[m][s][b.codigo] = { cents: 0n, ops: 0 };
    }
  }
  const total = Object.fromEntries(banks.map((b) => [b.codigo, 0n]));
  let universeTotal = 0n;

  for (const r of rows) {
    const cell = sub[r._macro][r._sub][r.Codigo_Banco];
    cell.cents += r._cents;
    cell.ops += 1;
    total[r.Codigo_Banco] += r._cents; // denominador: TODO el universo del banco (6 macros)
    universeTotal += r._cents;
  }

  const rankings = {};
  const subactividades = [];
  const recon1 = [];
  const recon2 = Object.fromEntries(banks.map((b) => [b.codigo, 0n]));

  for (const m of macros) {
    const entries = banks.map((b) => {
      let cents = 0n; let ops = 0;
      for (const s of subsByMacro[m]) {
        const cell = sub[m][s][b.codigo];
        cents += cell.cents; ops += cell.ops;
        subactividades.push({
          Fecha: fecha, Ranking: m, Subactividad: s, Codigo_Banco: b.codigo, Banco: b.nombre,
          Saldo: formatCents(cell.cents), Operaciones: cell.ops,
        });
      }
      recon2[b.codigo] += cents;
      // Reconciliación 1: suma de subactividades == saldo de la actividad (se recalcula de forma independiente)
      const subSum = subsByMacro[m].reduce((acc, s) => acc + sub[m][s][b.codigo].cents, 0n);
      recon1.push({ Fecha: fecha, Ranking: m, Codigo_Banco: b.codigo, Suma_Subactividades: formatCents(subSum), Saldo_Actividad: formatCents(cents), Cuadra: subSum === cents });
      return { b, cents, ops };
    });
    entries.sort((x, y) => (x.cents === y.cents ? cmpCodigo(x.b.codigo, y.b.codigo) : x.cents > y.cents ? -1 : 1));
    rankings[m] = entries.map((e, i) => ({
      Fecha: fecha,
      Ranking: m,
      Posicion: i + 1,
      Codigo_Banco: e.b.codigo,
      Banco: e.b.nombre,
      Saldo_Actividad: formatCents(e.cents),
      Total_Cartera_Local_Valida: formatCents(total[e.b.codigo]),
      Ponderacion_Pct: pct(e.cents, total[e.b.codigo], 4),
      Operaciones_Validas: e.ops,
    }));
  }

  const bancosTotal = Object.values(total).reduce((a, c) => a + c, 0n);
  const reconciliaciones = {
    r1: { descripcion: 'Suma de Saldo_Subactividad = Saldo_Actividad_Banco (por banco, ranking)', ok: recon1.every((x) => x.Cuadra), detalle: recon1 },
    r2: {
      descripcion: 'Suma de Saldo_Actividad_Banco de las macroactividades = Total_Cartera_Local_Valida_Banco',
      ok: banks.every((b) => recon2[b.codigo] === total[b.codigo]),
      detalle: banks.map((b) => ({ Fecha: fecha, Codigo_Banco: b.codigo, Suma_Actividades: formatCents(recon2[b.codigo]), Total_Cartera: formatCents(total[b.codigo]), Cuadra: recon2[b.codigo] === total[b.codigo] })),
    },
    r3: { descripcion: 'Suma de Total_Cartera de los bancos = Saldo del universo local válido', ok: bancosTotal === universeTotal, sumaBancos: formatCents(bancosTotal), universo: formatCents(universeTotal) },
  };

  return { banks, rankings, subactividades, totals: total, universeTotal, reconciliaciones, indicadores: indicators(fecha, rows, banks, rankings, macros) };
}

/** Indicadores adicionales (valor agregado; no intervienen en los rankings). */
function indicators(fecha, rows, banks, rankings, macros) {
  const per = Object.fromEntries(banks.map((b) => [b.codigo, {
    cartera: 0n, moroso: 0n, vencido: 0n, tasaPonderada: 0, ops: 0,
    porVencer: Object.fromEntries(MONTO_POR_VENCER_COLS.map((c) => [c, 0n])),
  }]));
  for (const r of rows) {
    const p = per[r.Codigo_Banco];
    p.cartera += r._cents; p.ops++;
    if (Number(r.Dias_Mora) > 0) p.moroso += r._cents;
    for (const c of MONTO_VENCIDO_COLS) p.vencido += toCents(r[c]) ?? 0n;
    for (const c of MONTO_POR_VENCER_COLS) p.porVencer[c] += toCents(r[c]) ?? 0n;
    p.tasaPonderada += Number(r.Tasa_Interes) * centsToNumber(r._cents);
  }
  const bancos = banks.map((b) => {
    const p = per[b.codigo];
    const cartera = centsToNumber(p.cartera);
    return {
      Fecha: fecha, Codigo_Banco: b.codigo, Banco: b.nombre, Cartera: cartera, Operaciones: p.ops,
      Saldo_Moroso: centsToNumber(p.moroso), Morosidad_Pct: Number(pct(p.moroso, p.cartera, 2)),
      Monto_Vencido: centsToNumber(p.vencido), Vencido_Pct: Number(pct(p.vencido, p.cartera, 2)),
      Tasa_Promedio_Ponderada: cartera ? Number((p.tasaPonderada / cartera).toFixed(2)) : 0,
      Por_Vencer: Object.fromEntries(Object.entries(p.porVencer).map(([k, v]) => [k, centsToNumber(v)])),
    };
  });
  // Concentración por ranking: HHI (0-10000) y participación de los 3 primeros
  const concentracion = macros.map((m) => {
    const saldos = rankings[m].map((r) => Number(r.Saldo_Actividad));
    const tot = saldos.reduce((a, s) => a + s, 0);
    const shares = saldos.map((s) => (tot ? (s / tot) * 100 : 0));
    return {
      Fecha: fecha, Ranking: m, Total: Number(tot.toFixed(2)),
      HHI: Number(shares.reduce((a, s) => a + s * s, 0).toFixed(1)),
      Top3_Pct: Number(shares.slice(0, 3).reduce((a, s) => a + s, 0).toFixed(2)),
    };
  });
  return { bancos, concentracion };
}
