import { toCsv } from './csv.js';

/** Columnas oficiales de los entregables (Sección 10). */
export const COLUMNS = {
  rankings: ['Fecha', 'Ranking', 'Posicion', 'Codigo_Banco', 'Banco', 'Saldo_Actividad', 'Total_Cartera_Local_Valida', 'Ponderacion_Pct', 'Operaciones_Validas'],
  subactividades: ['Fecha', 'Ranking', 'Subactividad', 'Codigo_Banco', 'Saldo', 'Banco', 'Operaciones'],
  calidad: ['Fecha', 'Filas_Leidas', 'E1_Duplicados', 'E2_Destino_Extranjero', 'E3_Saldo_No_Positivo', 'E4_Actividad_No_Catalogada', 'Universo_Local_Valido', 'Saldo_Universo_Local_Valido', 'Indep_E1', 'Indep_E2', 'Indep_E3', 'Indep_E4', 'Cuadre_Cascada', 'Prestamos_Unicos_En_Universo', 'Reclasificadas_Tarjeta_SB21', 'Alertas', 'Reconciliacion_1', 'Reconciliacion_2', 'Reconciliacion_3'],
  movimientos: ['Fecha_Anterior', 'Fecha_Actual', 'Ranking', 'Codigo_Banco', 'Banco', 'Posicion_Anterior', 'Posicion_Actual', 'Cambio_Posicion', 'Tendencia', 'Saldo_Anterior', 'Saldo_Actual', 'Var_Saldo', 'Var_Saldo_Pct', 'Significativo', 'Motivo_Significativo', 'Explicacion'],
  excluidas: ['Fecha', 'Archivo', 'Linea_Archivo', 'Filtro', 'Motivo', 'Numero_Prestamo', 'Codigo_Banco', 'Destino', 'Saldo', 'Tipo_Actividad'],
  alertas: ['Fecha', 'Tipo', 'Numero_Prestamo', 'Codigo_Banco', 'Linea_Archivo', 'Mensaje'],
};

const pick = (periods, fechas) => (fechas?.length ? periods.filter((p) => fechas.includes(p.fecha)) : periods);

export function exportRankings(periods, { fechas, rankings, bancos } = {}) {
  const rows = pick(periods, fechas).flatMap((p) => Object.values(p.rankings).flat())
    .filter((r) => (!rankings?.length || rankings.includes(r.Ranking)) && (!bancos?.length || bancos.includes(r.Codigo_Banco)));
  return toCsv(rows, COLUMNS.rankings);
}

export function exportSubactividades(periods, { fechas, rankings, bancos, subactividades } = {}) {
  const rows = pick(periods, fechas).flatMap((p) => p.subactividades)
    .filter((r) => (!rankings?.length || rankings.includes(r.Ranking)) && (!bancos?.length || bancos.includes(r.Codigo_Banco))
      && (!subactividades?.length || subactividades.includes(r.Subactividad)));
  return toCsv(rows, COLUMNS.subactividades);
}

export const exportCalidad = (periods, { fechas } = {}) => toCsv(pick(periods, fechas).map((p) => p.quality), COLUMNS.calidad);

export function exportMovimientos(comparisons, { desde, hasta, soloSignificativos } = {}) {
  const rows = comparisons.filter((c) => (!desde || c.desde === desde) && (!hasta || c.hasta === hasta))
    .flatMap((c) => c.movimientos).filter((m) => !soloSignificativos || m.Significativo);
  return toCsv(rows, COLUMNS.movimientos);
}

export const exportExcluidas = (periods, { fechas } = {}) => toCsv(pick(periods, fechas).flatMap((p) => p.excluded), COLUMNS.excluidas);
export const exportAlertas = (periods, { fechas } = {}) => toCsv(pick(periods, fechas).flatMap((p) => p.alerts), COLUMNS.alertas);
