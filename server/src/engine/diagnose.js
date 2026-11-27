/**
 * Diagnóstico de un archivo AT03 ANTES de importarlo.
 *
 * Revisa el archivo como lo hace el motor (mismas reglas) y explica, campo por campo y línea por línea, qué está
 * mal, vacío o fuera de formato. Clasifica cada hallazgo por gravedad:
 *   - "bloqueante": el archivo no se puede importar (estructura, Fecha o Saldo ilegibles).
 *   - "calculo":    la fila se importa pero afecta el ranking (se excluye en E1–E4 o queda fuera de un catálogo).
 *   - "advertencia": dato fuera de formato o incoherente que NO cambia el ranking (se informa como alerta).
 * El reto solo permite excluir filas por E1–E4, por eso nada de "advertencia" excluye filas.
 */
import { parseCsv } from './csv.js';
import { toCents, formatCents } from './money.js';
import { esFechaValida, validateAt03 } from './validate.js';
import { applyCascade } from './cascade.js';
import { classify } from './classify.js';
import { DESTINO_LOCAL, MONTO_POR_VENCER_COLS, MONTO_VENCIDO_COLS } from './rules.js';

export const MAX_EJEMPLOS = 50;

/**
 * Dominios de los campos de código según la descripción del diccionario AT03 del reto.
 * Son reglas de formato (valores permitidos), no resultados.
 */
const DOMINIOS = {
  Preferencial_No_Preferencial: ['0001', '0002'],
  Aplica_FECI: ['SI', 'NO', 'NA'],
  Tipo_Credito: ['001', '002'],
  Clasificacion_Prestamo: ['01', '02', '03', '04', '05'],
  Destino: ['L', 'E'],
  Codigo_Region: ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010', '170', '188', '724', '840'],
  Tamano_Empresa: ['01', '02', '03', '04', '05', '06'],
  Genero: ['01', '02', 'NA'],
  Primera_Garantia: ['0101', '0201', '0301', '0701', 'NA'],
  Periodicidad_Pago_Capital: ['01', '02', '03', '04'],
  Periodicidad_Pago_Intereses: ['01', '02', '03', '04'],
  Perfil_Vencimiento: ['01', '02'],
  Metodologia_Calculo_Intereses: ['01', '02'],
};
/** Campos que el diccionario indica "siempre NA en el reto". */
const SIEMPRE_NA = ['Codigo_Subsidiaria', 'ID_Grupo_Economico', 'Tipo_Relacion', 'Fecha_Refinanciamiento', 'Fecha_Restructuracion', 'Numero_Facilidad_Anterior', 'Segunda_Garantia', 'Categoria_Cambio'];

const TIPOS = {
  'Fecha (AAAAMMDD)': { test: esFechaValida, esperado: 'fecha AAAAMMDD válida' },
  'Fecha/Texto': { test: (v) => v === 'NA' || esFechaValida(v), esperado: 'fecha AAAAMMDD o NA' },
  'Numerico (Decimal)': { test: (v) => v === 'NA' || /^-?\d+(\.\d+)?$/.test(v), esperado: 'número con punto decimal, sin separador de miles' },
  'Numerico (Entero)': { test: (v) => v === 'NA' || /^-?\d+$/.test(v), esperado: 'número entero' },
};

/** Si un código numérico perdió ceros a la izquierda ("7" en vez de "07"), devuelve el valor correcto. */
function ceroPerdido(v, permitidos) {
  if (!/^\d+$/.test(v)) return null;
  const c = permitidos.find((p) => /^\d+$/.test(p) && p.length > v.length && p === v.padStart(p.length, '0'));
  return c ?? null;
}

class Hallazgos {
  constructor(max) { this.map = new Map(); this.max = max; }
  add(gravedad, regla, campo, linea, valor, esperado, sugerencia = '') {
    const key = `${gravedad}|${regla}|${campo}`;
    let h = this.map.get(key);
    if (!h) { h = { gravedad, regla, campo, cantidad: 0, ejemplos: [] }; this.map.set(key, h); }
    h.cantidad++;
    if (h.ejemplos.length < this.max) h.ejemplos.push({ linea, valor, esperado, sugerencia });
  }
  list() {
    const orden = { bloqueante: 0, calculo: 1, advertencia: 2 };
    return [...this.map.values()].sort((a, b) => orden[a.gravedad] - orden[b.gravedad] || b.cantidad - a.cantidad);
  }
}

/** Detecta el separador real de la primera línea para dar un mensaje claro si no es coma. */
function detectarSeparador(text) {
  const primera = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
  const cuenta = (ch) => primera.split(ch).length - 1;
  const cand = [[',', 'coma'], [';', 'punto y coma'], ['|', 'barra vertical'], ['\t', 'tabulador']].map(([c, n]) => ({ c, n, k: cuenta(c) }));
  return cand.sort((a, b) => b.k - a.k)[0];
}

/**
 * Diagnostica el texto de un archivo AT03.
 * Devuelve { importable, estado, archivo, resumen, porPeriodo, hallazgos, totales }.
 * maxEjemplos limita los ejemplos por regla (la descarga CSV usa Infinity para listar todos).
 */
export function diagnosticarAt03(text, archivo, catalogs, { maxEjemplos = MAX_EJEMPLOS } = {}) {
  const H = new Hallazgos(maxEjemplos);
  const schema = catalogs.schema;
  const resumen = { archivo, bytes: Buffer.byteLength(text, 'utf8'), filas: 0, columnas: 0, fechas: [], bom: text.charCodeAt(0) === 0xfeff };

  // ---------- 1. Estructura ----------
  if (!text.trim()) {
    H.add('bloqueante', 'Archivo vacío', '(archivo)', 1, '', 'encabezado + filas de datos');
    return cerrar(H, resumen, []);
  }
  if (text.includes('�')) H.add('advertencia', 'Codificación distinta de UTF-8', '(archivo)', 0, 'caracteres �', 'UTF-8 sin BOM', 'Guarde el archivo como CSV UTF-8');
  const sep = detectarSeparador(text);
  if (sep.c !== ',' && sep.k > 5) {
    H.add('bloqueante', 'Separador incorrecto', '(archivo)', 1, sep.n, 'coma (,)', `El archivo usa ${sep.n}; expórtelo como CSV separado por comas`);
    return cerrar(H, resumen, []);
  }
  const { header, rows } = parseCsv(text);
  resumen.columnas = header.length;
  resumen.filas = rows.length;
  const estructura = validateAt03(header, rows, schema);
  if (header.length !== schema.length || schema.some((c, i) => header[i] !== c)) {
    const faltan = schema.filter((c) => !header.includes(c));
    const sobran = header.filter((c) => !schema.includes(c));
    if (faltan.length) H.add('bloqueante', 'Columnas faltantes', faltan.slice(0, 6).join(', ') + (faltan.length > 6 ? '…' : ''), 1, `${faltan.length} faltante(s)`, `${schema.length} columnas del diccionario`);
    if (sobran.length) H.add('bloqueante', 'Columnas no reconocidas', sobran.slice(0, 6).join(', ') + (sobran.length > 6 ? '…' : ''), 1, `${sobran.length} extra`, 'solo las columnas del diccionario');
    if (!faltan.length && !sobran.length) H.add('bloqueante', 'Columnas en otro orden', '(encabezado)', 1, header.slice(0, 3).join(','), 'el orden del diccionario AT03');
    return cerrar(H, resumen, []);
  }
  if (rows.length === 0) {
    H.add('bloqueante', 'Sin filas de datos', '(archivo)', 2, '', 'al menos una fila');
    return cerrar(H, resumen, []);
  }

  const dic = new Map(catalogs.raw.diccionario.map((d) => [d.Campo, d.Tipo]));
  const sb21 = [...catalogs.sb21Map.keys()];
  const bancos = [...catalogs.bancoMap.keys()];
  const objetos = [];

  rows.forEach((arr, idx) => {
    const linea = idx + 2;
    if (arr.length !== schema.length) {
      H.add('bloqueante', 'Número de campos incorrecto', '(fila)', linea, `${arr.length} campos`, `${schema.length} campos`, arr.length > schema.length ? '¿Usó coma como decimal (5,5) o hay un texto con comas sin comillas?' : 'Faltan valores: use NA en los campos que no aplican');
      return;
    }
    const r = { _file: archivo, _line: linea };
    schema.forEach((c, i) => { r[c] = arr[i]; });

    // ---------- 2. Celdas vacías, espacios y tipos ----------
    for (const c of schema) {
      const v = r[c];
      if (v === '') { H.add(c === 'Fecha' || c === 'Saldo' ? 'bloqueante' : 'advertencia', 'Celda vacía', c, linea, '(vacío)', 'un valor o NA', 'El reto no admite celdas vacías: use NA si no aplica'); continue; }
      if (v !== v.trim()) H.add('advertencia', 'Espacios al inicio o al final', c, linea, JSON.stringify(v), v.trim());
      const t = TIPOS[dic.get(c)];
      if (t && c !== 'Fecha' && !t.test(v)) H.add('advertencia', 'Tipo de dato inválido', c, linea, v, t.esperado);
    }
    if (r.Fecha !== '' && !esFechaValida(r.Fecha)) H.add('bloqueante', 'Fecha de corte inválida', 'Fecha', linea, r.Fecha, 'AAAAMMDD real (ej. 20260930)');
    const saldo = toCents(r.Saldo);
    if (r.Saldo !== '' && saldo === null) {
      H.add('bloqueante', 'Saldo no numérico', 'Saldo', linea, r.Saldo, 'monto con punto y hasta 2 decimales, sin separador de miles');
    }

    // ---------- 3. Códigos, ceros a la izquierda y dominios ----------
    const revisarCodigo = (campo, permitidos, gravedad, regla) => {
      const v = r[campo];
      if (v === '' || permitidos.includes(v)) return;
      const fix = ceroPerdido(v, permitidos);
      if (fix) H.add(gravedad, 'Cero a la izquierda perdido', campo, linea, v, fix, `Probablemente el archivo pasó por Excel: "${v}" debería ser "${fix}"`);
      else H.add(gravedad, regla, campo, linea, v, permitidos.length <= 8 ? permitidos.join(' / ') : 'un valor del catálogo');
    };
    revisarCodigo('Codigo_Banco', bancos, 'calculo', 'Banco no catalogado');
    revisarCodigo('Facilidad_Crediticia', sb21, 'advertencia', 'Facilidad no catalogada en SB21');
    for (const [campo, dom] of Object.entries(DOMINIOS)) if (campo !== 'Destino') revisarCodigo(campo, dom, 'advertencia', 'Valor fuera del dominio del diccionario');
    if (r.Destino !== '' && !DOMINIOS.Destino.includes(r.Destino)) H.add('advertencia', 'Valor fuera del dominio del diccionario', 'Destino', linea, r.Destino, 'L / E');
    for (const c of SIEMPRE_NA) if (r[c] !== '' && r[c] !== 'NA') H.add('advertencia', 'Debería ser NA en el reto', c, linea, r[c], 'NA');

    // ---------- 4. Coherencia interna (no cambia el ranking) ----------
    if (saldo !== null && saldo > 0n) {
      const tramos = [...MONTO_POR_VENCER_COLS, ...MONTO_VENCIDO_COLS].reduce((a, c) => a + (toCents(r[c]) ?? 0n), 0n);
      if (tramos !== saldo) H.add('advertencia', 'Saldo distinto de la suma de tramos', 'Saldo', linea, formatCents(saldo), `suma de tramos ${formatCents(tramos)}`);
      const vi = toCents(r.Valor_Inicial);
      if (vi !== null && vi < saldo) H.add('advertencia', 'Valor_Inicial menor que Saldo', 'Valor_Inicial', linea, r.Valor_Inicial, `>= ${r.Saldo}`);
    }
    if (esFechaValida(r.Fecha)) {
      if (esFechaValida(r.Fecha_Inicial_Prestamo) && r.Fecha_Inicial_Prestamo > r.Fecha) H.add('advertencia', 'Fecha inicial posterior al corte', 'Fecha_Inicial_Prestamo', linea, r.Fecha_Inicial_Prestamo, `<= ${r.Fecha}`);
      if (esFechaValida(r.Fecha_Vencimiento) && r.Fecha_Vencimiento <= r.Fecha) H.add('advertencia', 'Vencimiento no posterior al corte', 'Fecha_Vencimiento', linea, r.Fecha_Vencimiento, `> ${r.Fecha}`);
    }
    if (/^\d+$/.test(r.Dias_Mora) && ['01', '02'].includes(r.Perfil_Vencimiento) && (r.Perfil_Vencimiento === '02') !== (Number(r.Dias_Mora) > 0)) {
      H.add('advertencia', 'Perfil_Vencimiento incoherente con Dias_Mora', 'Perfil_Vencimiento', linea, `${r.Perfil_Vencimiento} con ${r.Dias_Mora} días`, '02 si y solo si Dias_Mora > 0');
    }
    if (DOMINIOS.Tamano_Empresa.includes(r.Tamano_Empresa) && DOMINIOS.Genero.includes(r.Genero) && (r.Genero === 'NA') !== (r.Tamano_Empresa !== '06')) {
      H.add('advertencia', 'Genero incoherente con Tamano_Empresa', 'Genero', linea, `${r.Genero} con tamaño ${r.Tamano_Empresa}`, 'NA si y solo si Tamano_Empresa <> 06');
    }
    objetos.push(r);
  });

  // ---------- 5. Vista previa del cálculo por período (mismas reglas E1–E4 del motor) ----------
  const porFecha = new Map();
  for (const r of objetos) {
    if (!esFechaValida(r.Fecha) || toCents(r.Saldo) === null) continue;
    if (!porFecha.has(r.Fecha)) porFecha.set(r.Fecha, []);
    porFecha.get(r.Fecha).push(r);
  }
  const porPeriodo = [...porFecha.keys()].sort().map((fecha) => {
    const filas = porFecha.get(fecha);
    const { universe, counts, excluded } = applyCascade(filas, catalogs.cinuMap);
    // Cada fila excluida se lista una sola vez, en el primer filtro que incumple (igual que el reporte de calidad)
    for (const e of excluded) {
      if (e.Filtro === 'E1') H.add('calculo', 'E1 · Numero_Prestamo duplicado en el período', 'Numero_Prestamo', e.Linea_Archivo, e.Numero_Prestamo, 'único por período', 'Se conserva la primera ocurrencia; esta fila se excluye');
      else if (e.Filtro === 'E2') {
        const casiLocal = e.Destino !== 'L' && e.Destino.trim().toUpperCase() === DESTINO_LOCAL;
        H.add('calculo', 'E2 · Destino distinto de L', 'Destino', e.Linea_Archivo, e.Destino, 'L', casiLocal ? 'Parece local, pero la regla exige exactamente "L" (mayúscula, sin espacios)' : 'Operación extranjera: se excluye');
      } else if (e.Filtro === 'E3') H.add('calculo', 'E3 · Saldo cero o negativo', 'Saldo', e.Linea_Archivo, e.Saldo, '> 0', 'Se excluye');
      else if (e.Filtro === 'E4') {
        const conEspacios = catalogs.cinuMap.has(String(e.Tipo_Actividad).trim());
        H.add('calculo', 'E4 · Actividad CINU no catalogada', 'Tipo_Actividad', e.Linea_Archivo, e.Tipo_Actividad, 'código del Catalogo_CINU_SB109_reto', conEspacios ? 'Tiene espacios: sin ellos sí existe en el catálogo' : 'Se excluye');
      }
    }
    const { reclasificadas, alerts } = classify(universe, catalogs.cinuMap);
    for (const a of alerts) H.add('advertencia', 'Coherencia CONSUMO / SB21', 'Facilidad_Crediticia', a.Linea_Archivo, a.Mensaje.split(';')[0], 'Tarjeta con facilidad 07; Automóvil con facilidad 03', 'Se mantiene la subactividad del catálogo (no se excluye)');
    const saldo = universe.reduce((a, r) => a + r._cents, 0n);
    return {
      Fecha: fecha, Filas_Leidas: filas.length,
      E1_Duplicados: counts.E1, E2_Destino_Extranjero: counts.E2, E3_Saldo_No_Positivo: counts.E3, E4_Actividad_No_Catalogada: counts.E4,
      Universo_Local_Valido: universe.length, Saldo_Universo_Local_Valido: formatCents(saldo), Reclasificadas_Tarjeta_SB21: reclasificadas,
    };
  });
  resumen.fechas = porPeriodo.map((p) => p.Fecha);
  if (!estructura.ok && !H.list().some((h) => h.gravedad === 'bloqueante')) {
    for (const e of estructura.errors) H.add('bloqueante', 'Estructura', '(archivo)', 0, e, 'formato AT03');
  }
  return cerrar(H, resumen, porPeriodo);
}

function cerrar(H, resumen, porPeriodo) {
  const hallazgos = H.list();
  const totales = { bloqueante: 0, calculo: 0, advertencia: 0 };
  for (const h of hallazgos) totales[h.gravedad] += h.cantidad;
  const importable = totales.bloqueante === 0;
  const estado = !importable ? 'rechazado' : totales.calculo + totales.advertencia > 0 ? 'con_observaciones' : 'limpio';
  return { importable, estado, resumen, porPeriodo, hallazgos, totales };
}

/** Lista plana de hallazgos para descargar como CSV (una fila por ejemplo). */
export function hallazgosPlano(diag) {
  return diag.hallazgos.flatMap((h) => h.ejemplos.map((e) => ({
    Gravedad: h.gravedad, Regla: h.regla, Campo: h.campo, Total_En_Archivo: h.cantidad,
    Linea: e.linea, Valor: e.valor, Esperado: e.esperado, Sugerencia: e.sugerencia,
  })));
}
