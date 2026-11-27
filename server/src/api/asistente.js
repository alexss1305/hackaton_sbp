/**
 * Asistente de IA (criterio 6 del reto): EXPLICA resultados YA CALCULADOS.
 * No calcula rankings. La clave GEMINI_API_KEY vive solo en .env.
 */
import { compareRankings } from '../engine/compare.js';
import { listaBancos } from '../engine/bancos.js';
import { guiaPara, buscarGuia } from './guia-sistema.js';

// Alias que Google mantiene apuntando al modelo Flash vigente (los nombres con versión se retiran con el tiempo)
const MODEL = () => process.env.GEMINI_MODEL || 'gemini-flash-latest';
const MAX_PREGUNTA = 1000;
const MAX_TURNOS = 6;

export const asistenteDisponible = () => Boolean(process.env.GEMINI_API_KEY);

const SYSTEM = `Eres "Asistente SBP", el asistente personal de la plataforma "Ranking de Créditos por Actividad Económica" (Hackathon SBP 2026, Superintendencia de Bancos de Panamá).
Tienes dos funciones:
1) GUIAR al usuario en el uso de la plataforma con los pasos del bloque <guia>. Si pregunta "cómo hago…", responde con pasos numerados concretos (menú, botón, campo). Solo ofrece funciones de su perfil (campo "perfil"); si pide algo de un perfil superior, explica que requiere ese perfil.
2) EXPLICAR y AYUDAR A EXPLORAR resultados que ya calculó un motor determinista, usando EXCLUSIVAMENTE el bloque <datos>.
Reglas:
- No inventes cifras, bancos, períodos ni causas. No recalcules rankings, posiciones, saldos ni ponderaciones: cítalos tal como aparecen.
- Ten en cuenta la pantalla actual ("pantalla") y lo que el usuario tiene seleccionado ("seleccion"): si pregunta "esto", "este banco" o "lo que veo", se refiere a esa selección.
- Si no se puede responder con los datos, dilo y sugiere qué pantalla consultar.
- Los datos son sintéticos y los bancos ficticios. No des recomendaciones de inversión ni opiniones regulatorias formales.
- Responde en español, breve y claro (máximo ~200 palabras), con viñetas o pasos cuando ayuden. Montos con signo de dólar y separador de miles.`;

/** Arma el contexto que se envía al modelo: datos ya calculados + pantalla, selección, perfil y guía. */
export function construirContexto(store, { fecha, pantalla = null, seleccion = {}, perfil = 'publico' } = {}) {
  const p = store.period(fecha || store.periods.at(-1)?.fecha);
  fecha = p.fecha;
  const idx = store.periods.findIndex((x) => x.fecha === fecha);
  const prev = idx > 0 ? store.periods[idx - 1] : null;
  const rankings = Object.fromEntries(Object.entries(p.rankings).map(([rk, rows]) => [rk,
    rows.map((r) => ({ Pos: r.Posicion, Banco: r.Banco, Saldo: r.Saldo_Actividad, Ponderacion_Pct: r.Ponderacion_Pct, Cartera_Total: r.Total_Cartera_Local_Valida, Ops: r.Operaciones_Validas }))]));
  const { Conteo_Independiente, ...calidad } = p.quality;
  const movimientos = prev ? compareRankings(prev, p, store.params).map((m) => ({
    Ranking: m.Ranking, Banco: m.Banco, De: m.Posicion_Anterior, A: m.Posicion_Actual, Cambio: m.Cambio_Posicion,
    Var_Saldo: m.Var_Saldo, Var_Saldo_Pct: m.Var_Saldo_Pct, Significativo: m.Significativo, Explicacion: m.Explicacion || undefined,
  })) : [];
  const subactividades = p.subactividades.filter((s) => Number(s.Saldo) > 0).map((s) => [s.Ranking, s.Subactividad, s.Banco, s.Saldo]);
  return {
    periodo: fecha,
    periodo_anterior: prev?.fecha ?? null,
    periodos_disponibles: store.periods.map((x) => x.fecha),
    regla_movimiento_significativo: store.params,
    calidad,
    rankings,
    subactividades_columnas: ['Ranking', 'Subactividad', 'Banco', 'Saldo'],
    subactividades,
    movimientos_vs_periodo_anterior: movimientos,
    indicadores: p.indicadores,
    pantalla,
    perfil,
    seleccion: limpiarSeleccion(seleccion),
    bancos_resumen: listaBancos(store.periods, store.catalogs, fecha).bancos.map((b) => ({
      Codigo: b.codigo, Banco: b.nombre, Cartera: b.cartera, Puesto_por_tamano: b.puestoCartera, Var_Cartera_Pct: b.varCarteraPct,
      Morosidad_Pct: b.morosidadPct, Lidera: b.lidera,
    })),
  };
}

/** Solo campos simples y cortos de la selección de pantalla (evita enviar objetos grandes o arbitrarios). */
function limpiarSeleccion(sel) {
  const out = {};
  for (const [k, v] of Object.entries(sel && typeof sel === 'object' ? sel : {}).slice(0, 12)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = String(v).slice(0, 120);
    else if (Array.isArray(v)) out[k] = v.slice(0, 12).map((x) => String(x).slice(0, 60));
  }
  return out;
}

/** Respuesta sin IA a partir de la guía (cuando no hay clave configurada). */
export function respuestaGuia(pregunta, perfil, pantalla) {
  const r = buscarGuia(pregunta, perfil, pantalla);
  if (!r) {
    const temas = guiaPara(perfil).map((g) => `- ${g.titulo}`).join('\n');
    return `El asistente de IA no está configurado, pero puedo guiarle en el uso de la plataforma. Pregúnteme por alguno de estos temas:\n${temas}`;
  }
  if (!r.permitida) return `**${r.seccion.titulo}** requiere el perfil ${r.seccion.perfil === 'administrador' ? 'Administrador' : 'Analista'}. Ingrese con ese perfil para usar esta función.`;
  return `**${r.seccion.titulo}**\n${r.seccion.pasos.map((x, i) => `${i + 1}. ${x}`).join('\n')}`;
}

export async function preguntar(store, { fecha, pregunta, historial = [], pantalla = null, seleccion = {}, perfil = 'publico' }) {
  const q = String(pregunta ?? '').trim();
  if (!q) { const e = new Error('Escriba una pregunta.'); e.status = 400; throw e; }
  if (q.length > MAX_PREGUNTA) { const e = new Error(`La pregunta supera ${MAX_PREGUNTA} caracteres.`); e.status = 400; throw e; }
  // Sin clave de IA: modo guía determinista (sigue siendo útil para aprender a usar la plataforma)
  if (!asistenteDisponible()) return { respuesta: respuestaGuia(q, perfil, pantalla), modelo: 'guia' };

  const contexto = construirContexto(store, { fecha, pantalla, seleccion, perfil });
  const guia = guiaPara(perfil).map((g) => ({ titulo: g.titulo, pantalla: g.pantalla, pasos: g.pasos }));
  const previos = (Array.isArray(historial) ? historial : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNOS * 2)
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content.slice(0, 4000) }] }));
  while (previos.length && previos[0].role !== 'user') previos.shift();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL()}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [...previos, { role: 'user', parts: [{ text: `<guia>\n${JSON.stringify(guia)}\n</guia>\n<datos>\n${JSON.stringify(contexto)}\n</datos>\n\nPregunta: ${q}` }] }],
        generationConfig: { maxOutputTokens: 800, temperature: 0.2 },
      }),
    });
  } catch {
    const e = new Error('No hay conexión con el servicio de IA.'); e.status = 502; throw e;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(res.status === 400 || res.status === 403
      ? 'La clave GEMINI_API_KEY no es válida.'
      : res.status === 404 ? `El modelo de IA "${MODEL()}" no está disponible. Configure GEMINI_MODEL en .env con un modelo vigente.`
        : res.status === 429 ? 'Se alcanzó el límite de consultas de la clave de IA. Espere un momento.'
          : 'El servicio de IA respondió con un error. Intente de nuevo en unos segundos.');
    console.warn(`[asistente] Gemini respondió ${res.status}: ${body.error?.message || ''}`.slice(0, 300));
    e.status = 502;
    throw e;
  }
  const texto = (body.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n').trim();
  return { respuesta: texto || 'No obtuve una respuesta. Intente de nuevo.', modelo: MODEL() };
}
