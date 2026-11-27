/**
 * Reglas del reto (INDICACIONES_RETO_RANKING_CREDITO.md). Son reglas, no resultados:
 * ningún saldo, porcentaje ni posición está fijado aquí.
 */

/** Destino válido para el universo local (Sección 4, E2). */
export const DESTINO_LOCAL = 'L';

/** Regla especial de CONSUMO con Tabla SB21 (Sección 6). */
export const CONSUMO_RULES = {
  CINU_CREDITO_PERSONAL: 'K.64.649.6492.64921',
  CINU_AUTOMOVIL: 'K.64.649.6492.64922',
  CINU_TARJETA: 'K.64.649.6499.64991',
  FACILIDAD_TARJETA: '07',
  FACILIDAD_AUTO: '03',
};

/** Rankings en el orden de prioridad del reto (Sección 5). */
export const RANKING_ORDER = ['HIPOTECARIO', 'CONSTRUCCION', 'INDUSTRIA', 'AGROPECUARIO', 'COMERCIO', 'CONSUMO'];

export const MONTO_VENCIDO_COLS = [
  'Monto_Vencido_30_dias', 'Monto_Vencido_60_dias', 'Monto_Vencido_90_dias', 'Monto_Vencido_120_dias',
  'Monto_Vencido_180_dias', 'Monto_Vencido_1_ano', 'Monto_Vencido_mas_1_ano',
];
export const MONTO_POR_VENCER_COLS = [
  'Monto_por_Vencer_30_dias', 'Monto_por_Vencer_60_dias', 'Monto_por_Vencer_90_dias', 'Monto_por_Vencer_120_dias',
  'Monto_por_Vencer_180_dias', 'Monto_por_Vencer_1_ano', 'Monto_por_Vencer_1_a_5_anos',
  'Monto_por_Vencer_5_a_10_anos', 'Monto_por_Vencer_mas_10_anos',
];
