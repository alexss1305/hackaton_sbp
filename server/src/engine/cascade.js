import { toCents } from './money.js';
import { DESTINO_LOCAL } from './rules.js';

export const FILTERS = [
  { id: 'E1', nombre: 'Duplicado', regla: 'Numero_Prestamo repetido en el período (se conserva la primera ocurrencia del archivo)' },
  { id: 'E2', nombre: 'Destino extranjero', regla: "Destino <> 'L'" },
  { id: 'E3', nombre: 'Saldo no positivo', regla: 'Saldo <= 0' },
  { id: 'E4', nombre: 'Actividad no catalogada', regla: 'Tipo_Actividad no existe en Catalogo_CINU_SB109_reto' },
];

/**
 * Exclusiones en cascada (Sección 4.B) sobre las filas de UN período, en el orden del archivo.
 * Cada fila excluida se cuenta solo en el primer filtro que incumple.
 * También calcula el conteo independiente de cada regla (informativo, se rotula aparte).
 */
export function applyCascade(rows, cinuMap) {
  const seen = new Set();
  const universe = [];
  const excluded = [];
  const counts = { E1: 0, E2: 0, E3: 0, E4: 0 };
  const independent = { E1: 0, E2: 0, E3: 0, E4: 0 };

  for (const r of rows) {
    const cents = toCents(r.Saldo);
    const fails = {
      E1: seen.has(r.Numero_Prestamo),
      E2: r.Destino !== DESTINO_LOCAL,
      E3: cents === null || cents <= 0n,
      E4: !cinuMap.has(r.Tipo_Actividad),
    };
    seen.add(r.Numero_Prestamo);
    for (const k of Object.keys(fails)) if (fails[k]) independent[k]++;
    const first = FILTERS.find((f) => fails[f.id]);
    if (first) {
      counts[first.id]++;
      excluded.push({
        Fecha: r.Fecha, Archivo: r._file, Linea_Archivo: r._line, Filtro: first.id, Motivo: first.nombre,
        Numero_Prestamo: r.Numero_Prestamo, Codigo_Banco: r.Codigo_Banco, Destino: r.Destino,
        Saldo: r.Saldo, Tipo_Actividad: r.Tipo_Actividad,
      });
    } else {
      universe.push({ ...r, _cents: cents });
    }
  }
  return { universe, excluded, counts, independent };
}
