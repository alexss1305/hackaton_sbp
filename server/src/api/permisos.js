/**
 * Permisos configurables por el Administrador (lámina 6: "configurar perfiles y permisos").
 * El Administrador siempre tiene todos los permisos y sus acciones propias (cargar períodos, parámetros,
 * catálogos, bitácora y permisos) no son configurables, para que nadie pueda bloquearse durante la demo.
 */
export const PERFILES_EDITABLES = ['publico', 'analista'];

export const PERMISOS = [
  { clave: 'descargar_rankings', grupo: 'Descargas', label: 'Descargar rankings (entregable 2)', defecto: ['publico', 'analista'] },
  { clave: 'descargar_subactividades', grupo: 'Descargas', label: 'Descargar desglose por subactividad (entregable 3)', defecto: ['publico', 'analista'] },
  { clave: 'descargar_calidad', grupo: 'Descargas', label: 'Descargar reporte de calidad (entregable 4)', defecto: ['publico', 'analista'] },
  { clave: 'descargar_excluidas', grupo: 'Descargas', label: 'Descargar lista de filas excluidas', defecto: ['analista'] },
  { clave: 'descargar_alertas', grupo: 'Descargas', label: 'Descargar alertas de calidad', defecto: ['analista'] },
  { clave: 'comparar_periodos', grupo: 'Análisis', label: 'Comparar períodos y entidades (movimientos y evolución)', defecto: ['analista'] },
  { clave: 'descargar_movimientos', grupo: 'Análisis', label: 'Descargar reporte de movimientos (entregable 5)', defecto: ['analista'] },
  { clave: 'consultar_registros', grupo: 'Análisis', label: 'Consultar registros (préstamos) de cada período', defecto: ['analista'] },
  { clave: 'asistente_ia', grupo: 'Análisis', label: 'Usar el asistente (explica resultados y guía el uso de la plataforma)', defecto: ['publico', 'analista'] },
];

export const CLAVES = PERMISOS.map((p) => p.clave);
export const defaultAsignaciones = () => Object.fromEntries(PERMISOS.map((p) => [p.clave, [...p.defecto]]));

/** Normaliza asignaciones recibidas: solo claves conocidas y perfiles editables; faltantes = valor por defecto. */
export function normalizar(asig = {}) {
  const base = defaultAsignaciones();
  for (const k of CLAVES) {
    if (Array.isArray(asig[k])) base[k] = [...new Set(asig[k].filter((p) => PERFILES_EDITABLES.includes(p)))];
  }
  return base;
}

export const tienePermiso = (asignaciones, perfil, clave) => perfil === 'administrador' || Boolean(asignaciones[clave]?.includes(perfil));
export const permisosDe = (asignaciones, perfil) => CLAVES.filter((k) => tienePermiso(asignaciones, perfil, k));
