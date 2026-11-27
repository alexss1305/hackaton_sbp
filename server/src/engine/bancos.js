/**
 * Fichas de bancos ("estado de cuenta" por banco). Solo lee resultados ya calculados de cada período.
 * El banco se identifica SIEMPRE por Codigo_Banco del catálogo Bancos_ficticios.csv (nunca por nombre),
 * así la ficha cuadra con lo que se sube aunque el nombre tenga diferencias.
 */
import { toCents, formatCents, pct } from './money.js';

function resumenBanco(p, codigo, macros) {
  const posiciones = macros.map((m) => {
    const r = p.rankings[m].find((x) => x.Codigo_Banco === codigo);
    return { Ranking: m, Posicion: r.Posicion, Saldo_Actividad: r.Saldo_Actividad, Ponderacion_Pct: r.Ponderacion_Pct, Operaciones_Validas: r.Operaciones_Validas };
  });
  const cartera = p.rankings[macros[0]].find((x) => x.Codigo_Banco === codigo).Total_Cartera_Local_Valida;
  const ind = p.indicadores.bancos.find((x) => x.Codigo_Banco === codigo) || {};
  return {
    Fecha: p.fecha, cartera, posiciones, lidera: posiciones.filter((x) => x.Posicion === 1).map((x) => x.Ranking),
    operaciones: ind.Operaciones ?? posiciones.reduce((a, x) => a + x.Operaciones_Validas, 0),
    morosidadPct: ind.Morosidad_Pct ?? null, vencidoPct: ind.Vencido_Pct ?? null, tasaPromedio: ind.Tasa_Promedio_Ponderada ?? null,
    saldoMoroso: ind.Saldo_Moroso ?? null, montoVencido: ind.Monto_Vencido ?? null, porVencer: ind.Por_Vencer ?? {},
  };
}

/** Lista de los bancos del catálogo con su resumen en el corte `fecha` y la variación frente al corte anterior. */
export function listaBancos(periods, catalogs, fecha) {
  const idx = periods.findIndex((p) => p.fecha === fecha);
  if (idx < 0) throw Object.assign(new Error(`No existe el período ${fecha}`), { status: 404 });
  const p = periods[idx]; const prev = idx > 0 ? periods[idx - 1] : null;
  const sistema = catalogs.bancos.reduce((a, b) => a + toCents(p.rankings[catalogs.macros[0]].find((x) => x.Codigo_Banco === b.codigo).Total_Cartera_Local_Valida), 0n);
  const filas = catalogs.bancos.map((b) => {
    const r = resumenBanco(p, b.codigo, catalogs.macros);
    const ant = prev ? toCents(prev.rankings[catalogs.macros[0]].find((x) => x.Codigo_Banco === b.codigo).Total_Cartera_Local_Valida) : null;
    const act = toCents(r.cartera);
    return {
      codigo: b.codigo, nombre: b.nombre, ...r,
      participacionSistemaPct: pct(act, sistema, 2),
      carteraAnterior: ant === null ? null : formatCents(ant), fechaAnterior: prev?.fecha ?? null,
      varCarteraPct: ant === null || ant === 0n ? null : pct(act - ant, ant, 2),
    };
  });
  // Puesto por tamaño de cartera (desempate por código, igual que los rankings)
  [...filas].sort((a, b) => { const d = toCents(b.cartera) - toCents(a.cartera); return d === 0n ? Number(a.codigo) - Number(b.codigo) : d > 0n ? 1 : -1; })
    .forEach((f, i) => { f.puestoCartera = i + 1; });
  return { fecha, fechaAnterior: prev?.fecha ?? null, sistema: formatCents(sistema), bancos: filas };
}

/** Ficha completa de un banco: resumen del corte, evolución en todos los cortes y desglose por subactividad. */
export function fichaBanco(periods, catalogs, codigo, fecha) {
  if (!catalogs.bancoMap.has(codigo)) throw Object.assign(new Error(`El banco ${codigo} no está en el catálogo`), { status: 404 });
  const lista = listaBancos(periods, catalogs, fecha);
  const resumen = lista.bancos.find((b) => b.codigo === codigo);
  const evolucion = periods.map((p) => {
    const r = resumenBanco(p, codigo, catalogs.macros);
    return {
      Fecha: p.fecha, cartera: r.cartera, operaciones: r.operaciones, morosidadPct: r.morosidadPct, vencidoPct: r.vencidoPct,
      ...Object.fromEntries(r.posiciones.map((x) => [`pos_${x.Ranking}`, x.Posicion])),
      ...Object.fromEntries(r.posiciones.map((x) => [`saldo_${x.Ranking}`, x.Saldo_Actividad])),
    };
  });
  const p = periods.find((x) => x.fecha === fecha);
  const subactividades = p.subactividades.filter((s) => s.Codigo_Banco === codigo).map((s) => ({ Ranking: s.Ranking, Subactividad: s.Subactividad, Saldo: s.Saldo, Operaciones: s.Operaciones }));
  return { codigo, nombre: catalogs.bancoMap.get(codigo), fecha, resumen, evolucion, subactividades, rankings: catalogs.macros };
}
