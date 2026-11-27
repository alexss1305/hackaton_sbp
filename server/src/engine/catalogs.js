import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, toObjects } from './csv.js';
import { RANKING_ORDER } from './rules.js';

export const CATALOG_FILES = {
  bancos: { file: 'Bancos_ficticios.csv', columns: ['Codigo_Banco', 'Nombre_Ficticio', 'Tipo_Licencia'] },
  cinu: { file: 'Catalogo_CINU_SB109_reto.csv', columns: ['Codigo_CINU', 'Descripcion', 'Macroactividad_Reto', 'Subactividad_Reto', 'Codigo_SB08_Referencia'] },
  sb21: { file: 'Tabla_SB21_simplificada.csv', columns: ['Codigo', 'Descripcion', 'Uso_en_reto'] },
  diccionario: { file: 'Diccionario_datos_AT03_reto.csv', columns: ['Campo', 'Descripcion_reto', 'Tipo', 'Regla_clave'] },
};

/** Lee un catálogo y valida que tenga las columnas esperadas. Lanza Error con mensaje claro. */
export function parseCatalog(kind, text) {
  const spec = CATALOG_FILES[kind];
  if (!spec) throw new Error(`Catálogo desconocido: ${kind}`);
  const { header, rows } = parseCsv(text);
  const missing = spec.columns.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`${spec.file}: faltan columnas ${missing.join(', ')}`);
  if (rows.length === 0) throw new Error(`${spec.file}: el catálogo está vacío`);
  const objs = toObjects(header, rows);
  const key = spec.columns[0];
  const vistos = new Set();
  objs.forEach((o, i) => {
    const v = o[key];
    if (v === undefined || v === '' || v !== v.trim()) throw new Error(`${spec.file}: ${key} vacío o con espacios en la línea ${i + 2}`);
    if (vistos.has(v)) throw new Error(`${spec.file}: ${key} "${v}" repetido (línea ${i + 2})`);
    vistos.add(v);
  });
  if (kind === 'cinu') {
    const sinClase = objs.findIndex((o) => !o.Macroactividad_Reto || !o.Subactividad_Reto);
    if (sinClase >= 0) throw new Error(`${spec.file}: Macroactividad_Reto o Subactividad_Reto vacío en la línea ${sinClase + 2}`);
  }
  return objs;
}

/** Construye las estructuras de catálogos a partir de los objetos ya leídos. */
export function buildCatalogs({ bancos, cinu, sb21, diccionario }) {
  const bancoMap = new Map(bancos.map((b) => [b.Codigo_Banco, b.Nombre_Ficticio]));
  const cinuMap = new Map(cinu.map((c) => [c.Codigo_CINU, {
    descripcion: c.Descripcion, macro: c.Macroactividad_Reto, sub: c.Subactividad_Reto,
  }]));
  const sb21Map = new Map(sb21.map((s) => [s.Codigo, s.Descripcion]));

  const macrosInCatalog = [...new Set(cinu.map((c) => c.Macroactividad_Reto))];
  const macros = [
    ...RANKING_ORDER.filter((m) => macrosInCatalog.includes(m)),
    ...macrosInCatalog.filter((m) => !RANKING_ORDER.includes(m)),
  ];
  const subsByMacro = Object.fromEntries(macros.map((m) => [m, []]));
  for (const c of cinu) {
    const list = subsByMacro[c.Macroactividad_Reto];
    if (!list.includes(c.Subactividad_Reto)) list.push(c.Subactividad_Reto);
  }
  return {
    bancoMap,
    bancos: bancos.map((b) => ({ codigo: b.Codigo_Banco, nombre: b.Nombre_Ficticio })),
    cinuMap,
    sb21Map,
    schema: diccionario.map((d) => d.Campo),
    macros,
    subsByMacro,
    raw: { bancos, cinu, sb21, diccionario },
  };
}

export function loadCatalogs(dir) {
  const parsed = {};
  for (const [kind, spec] of Object.entries(CATALOG_FILES)) {
    parsed[kind] = parseCatalog(kind, fs.readFileSync(path.join(dir, spec.file), 'utf8'));
  }
  return buildCatalogs(parsed);
}
