import { CONSUMO_RULES as C } from './rules.js';

function alert(r, mensaje) {
  return { Fecha: r.Fecha, Tipo: 'Coherencia CONSUMO', Numero_Prestamo: r.Numero_Prestamo, Codigo_Banco: r.Codigo_Banco, Linea_Archivo: r._line, Mensaje: mensaje };
}

/**
 * Asigna Macroactividad_Reto y Subactividad_Reto a cada fila del universo local válido usando SOLO
 * el catálogo CINU (llave Tipo_Actividad = Codigo_CINU) y la regla SB21 de CONSUMO (Sección 6).
 * Devuelve las filas clasificadas y las alertas de coherencia (que no excluyen filas).
 */
export function classify(universe, cinuMap) {
  const alerts = [];
  let reclasificadas = 0;
  const rows = universe.map((r) => {
    const cat = cinuMap.get(r.Tipo_Actividad);
    let sub = cat.sub;
    const fac = r.Facilidad_Crediticia;
    if (r.Tipo_Actividad === C.CINU_CREDITO_PERSONAL && fac === C.FACILIDAD_TARJETA) {
      sub = C.SUBACTIVIDAD_TARJETA; // Crédito personal + facilidad 07 => Tarjeta
      reclasificadas++;
    } else if (r.Tipo_Actividad === C.CINU_TARJETA && fac !== C.FACILIDAD_TARJETA) {
      alerts.push(alert(r, `CINU de Tarjeta con facilidad ${fac} (se esperaba ${C.FACILIDAD_TARJETA}); se mantiene la subactividad del catálogo`));
    } else if (r.Tipo_Actividad === C.CINU_AUTOMOVIL && fac !== C.FACILIDAD_AUTO) {
      alerts.push(alert(r, `CINU de Automóvil con facilidad ${fac} (se esperaba ${C.FACILIDAD_AUTO}); se mantiene la subactividad del catálogo`));
    }
    return { ...r, _macro: cat.macro, _sub: sub };
  });
  return { rows, alerts, reclasificadas };
}
