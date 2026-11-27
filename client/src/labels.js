/** Etiquetas de pantalla. Los nombres de campo del CSV oficial no se muestran al usuario. */

export const CAMPOS = {
  Fecha: 'Fecha de corte',
  Codigo_Banco: 'Código del banco',
  Codigo_Subsidiaria: 'Código de subsidiaria',
  Preferencial_No_Preferencial: 'Tramo de tasa',
  Aplica_FECI: 'Aplica FECI',
  Tipo_Credito: 'Tipo de crédito',
  Facilidad_Crediticia: 'Facilidad crediticia',
  Clasificacion_Prestamo: 'Clasificación del préstamo',
  Destino: 'Destino',
  Codigo_Region: 'Región',
  ID_Cliente: 'Identificación del cliente',
  Tamano_Empresa: 'Tamaño de la empresa',
  Genero: 'Género',
  Numero_Prestamo: 'Número de préstamo',
  Nombre_Cliente: 'Nombre del cliente',
  ID_Grupo_Economico: 'Grupo económico',
  Tipo_Relacion: 'Tipo de relación',
  Tipo_Actividad: 'Código de actividad',
  Tasa_Interes: 'Tasa de interés',
  Valor_Inicial: 'Valor inicial',
  Intereses_por_Cobrar: 'Intereses por cobrar',
  Fecha_Inicial_Prestamo: 'Fecha de otorgamiento',
  Fecha_Vencimiento: 'Fecha de vencimiento',
  Fecha_Refinanciamiento: 'Fecha de refinanciamiento',
  Fecha_Restructuracion: 'Fecha de reestructuración',
  Numero_Facilidad_Anterior: 'Facilidad anterior',
  Primera_Garantia: 'Primera garantía',
  Valor_Primera_Garantia: 'Valor de la primera garantía',
  Segunda_Garantia: 'Segunda garantía',
  Valor_Segunda_Garantia: 'Valor de la segunda garantía',
  Provision: 'Provisión',
  Provision_NIIF: 'Provisión NIIF',
  Provision_Complementaria_no_NIIF: 'Provisión complementaria',
  Saldo: 'Saldo',
  Cantidad_Cuotas_por_Vencer: 'Cuotas por vencer',
  Monto_por_Vencer_30_dias: 'Por vencer a 30 días',
  Monto_por_Vencer_60_dias: 'Por vencer a 60 días',
  Monto_por_Vencer_90_dias: 'Por vencer a 90 días',
  Monto_por_Vencer_120_dias: 'Por vencer a 120 días',
  Monto_por_Vencer_180_dias: 'Por vencer a 180 días',
  Monto_por_Vencer_1_ano: 'Por vencer a 1 año',
  Monto_por_Vencer_1_a_5_anos: 'Por vencer de 1 a 5 años',
  Monto_por_Vencer_5_a_10_anos: 'Por vencer de 5 a 10 años',
  Monto_por_Vencer_mas_10_anos: 'Por vencer a más de 10 años',
  Cantidad_Cuotas_Vencidas: 'Cuotas vencidas',
  Monto_Vencido_30_dias: 'Vencido a 30 días',
  Monto_Vencido_60_dias: 'Vencido a 60 días',
  Monto_Vencido_90_dias: 'Vencido a 90 días',
  Monto_Vencido_120_dias: 'Vencido a 120 días',
  Monto_Vencido_180_dias: 'Vencido a 180 días',
  Monto_Vencido_1_ano: 'Vencido a 1 año',
  Monto_Vencido_mas_1_ano: 'Vencido a más de 1 año',
  Fecha_Proximo_Pago_Capital: 'Próximo pago de capital',
  Periodicidad_Pago_Capital: 'Periodicidad del capital',
  Fecha_Proximo_Pago_Interes: 'Próximo pago de interés',
  Periodicidad_Pago_Intereses: 'Periodicidad del interés',
  Dias_Mora: 'Días de mora',
  Perfil_Vencimiento: 'Perfil de vencimiento',
  Monto_Cuota_Pagar: 'Cuota a pagar',
  Metodologia_Calculo_Intereses: 'Base de cálculo de intereses',
  Categoria_Cambio: 'Categoría de cambio',
  Estado: 'Estado',
  Filtro: 'Regla de exclusión',
  Macroactividad: 'Actividad',
  Subactividad: 'Subactividad',
};

const MONTOS = new Set([
  'Valor_Inicial', 'Intereses_por_Cobrar', 'Valor_Primera_Garantia', 'Valor_Segunda_Garantia',
  'Provision', 'Provision_NIIF', 'Provision_Complementaria_no_NIIF', 'Saldo',
  'Monto_por_Vencer_30_dias', 'Monto_por_Vencer_60_dias', 'Monto_por_Vencer_90_dias', 'Monto_por_Vencer_120_dias',
  'Monto_por_Vencer_180_dias', 'Monto_por_Vencer_1_ano', 'Monto_por_Vencer_1_a_5_anos', 'Monto_por_Vencer_5_a_10_anos',
  'Monto_por_Vencer_mas_10_anos', 'Monto_Vencido_30_dias', 'Monto_Vencido_60_dias', 'Monto_Vencido_90_dias',
  'Monto_Vencido_120_dias', 'Monto_Vencido_180_dias', 'Monto_Vencido_1_ano', 'Monto_Vencido_mas_1_ano', 'Monto_Cuota_Pagar',
]);
const FECHAS = new Set(['Fecha', 'Fecha_Inicial_Prestamo', 'Fecha_Vencimiento', 'Fecha_Refinanciamiento', 'Fecha_Restructuracion', 'Fecha_Proximo_Pago_Capital', 'Fecha_Proximo_Pago_Interes']);

export const esMonto = (campo) => MONTOS.has(campo);
export const esFecha = (campo) => FECHAS.has(campo);
export const etiquetaCampo = (campo) => CAMPOS[campo] || campo.replaceAll('_', ' ');

/** Traduce el motivo interno del motor a una frase. El CSV oficial conserva el texto original. */
export function etiquetaMotivo(motivo) {
  if (!motivo) return '';
  return String(motivo).split('; ').map((parte) => {
    const p = parte.toLowerCase();
    if (p.includes('líder') || p.includes('lider')) return 'Cambio de líder';
    if (p.includes('cambio_posicion') || p.includes('cambio de posicion')) return 'Cambio de posición de 2 o más puestos';
    if (p.includes('var_saldo')) return 'Variación de saldo relevante';
    return parte.replaceAll('_', ' ');
  }).join(' / ');
}

export const REGLAS = {
  E1: {
    nombre: 'Préstamo duplicado',
    frase: 'El mismo número de préstamo aparece más de una vez en el período; se conserva la primera aparición.',
  },
  E2: {
    nombre: 'Destino extranjero',
    frase: 'El crédito no está destinado al mercado local.',
  },
  E3: {
    nombre: 'Saldo no positivo',
    frase: 'El saldo es cero o negativo.',
  },
  E4: {
    nombre: 'Actividad no catalogada',
    frase: 'El código de actividad no existe en el catálogo CINU.',
  },
};

export const ERRORES_ARCHIVO = [
  { titulo: 'Columnas distintas al diccionario', significa: 'El archivo no trae las 61 columnas, o no están en el mismo orden.', corregir: 'Exporte de nuevo el AT03 con el diccionario del reto, sin agregar ni quitar columnas.' },
  { titulo: 'Fecha inválida', significa: 'La fecha de corte no tiene ocho dígitos en formato año, mes y día.', corregir: 'Use la fecha de fin de mes, por ejemplo 20260930, como texto y no como número de Excel.' },
  { titulo: 'Saldo no numérico', significa: 'El saldo no se puede leer como monto con punto decimal.', corregir: 'Quite separadores de miles y use punto para los decimales, por ejemplo 1500.25.' },
  { titulo: 'Período que borraría otro corte', significa: 'El archivo reemplazaría un archivo que también contiene otro mes.', corregir: 'Suba un archivo con un solo período, como los CSV oficiales del reto.' },
  { titulo: 'Archivo vacío', significa: 'No llegaron filas de datos.', corregir: 'Verifique que el CSV tenga encabezado y al menos una operación.' },
];
