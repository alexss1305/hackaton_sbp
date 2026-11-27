/**
 * Asistente de IA (criterio 6 del reto): EXPLICA resultados YA CALCULADOS.
 * No calcula rankings. La clave GEMINI_API_KEY vive solo en .env.
 */
import { compareRankings } from '../engine/compare.js';

const MODEL = 'gemini-2.0-flash';
const MAX_PREGUNTA = 1000;
const MAX_TURNOS = 6;

export const asistenteDisponible = () => Boolean(process.env.GEMINI_API_KEY);

const SYSTEM = `Eres el asistente de la plataforma "Rankings de Crédito por Actividad Económica" del Hackathon SBP 2026 (Superintendencia de Bancos de Panamá).
Tu función es EXPLICAR y AYUDAR A EXPLORAR resultados que ya calculó un motor determinista. Reglas:
- Usa EXCLUSIVAMENTE los datos del bloque <datos>. No inventes cifras, bancos, períodos ni causas que no estén en los datos.
- No recalcules rankings, posiciones, saldos ni ponderaciones: cítalos tal como aparecen. Puedes describir comparaciones evidentes (mayor/menor, sube/baja) y citar diferencias que ya vengan calculadas (Var_Saldo, Var_Saldo_Pct, Cambio_Posicion).
- Si la pregunta no se puede responder con los datos, dilo claramente y sugiere qué pantalla de la plataforma consultar (Rankings, Filtros y subactividades, Calidad de datos, Comparar períodos, Reportes).
- Todos los bancos y clientes son ficticios; los datos son sintéticos. No des recomendaciones de inversión ni opiniones regulatorias formales.
- Responde en español, breve y claro (máximo ~200 palabras). Montos con signo de dólar y separador de miles.`;

function buildContext(store, fecha) {
  const p = store.period(fecha);
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
  };
}

export async function preguntar(store, { fecha, pregunta, historial = [] }) {
  if (!asistenteDisponible()) {
    const e = new Error('El asistente de IA no está configurado: falta GEMINI_API_KEY en el archivo .env del servidor.'); e.status = 503; throw e;
  }
  const q = String(pregunta ?? '').trim();
  if (!q) { const e = new Error('Escriba una pregunta.'); e.status = 400; throw e; }
  if (q.length > MAX_PREGUNTA) { const e = new Error(`La pregunta supera ${MAX_PREGUNTA} caracteres.`); e.status = 400; throw e; }

  const contexto = buildContext(store, fecha);
  const previos = (Array.isArray(historial) ? historial : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNOS * 2)
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content.slice(0, 4000) }] }));
  while (previos.length && previos[0].role !== 'user') previos.shift();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [...previos, { role: 'user', parts: [{ text: `<datos>\n${JSON.stringify(contexto)}\n</datos>\n\nPregunta: ${q}` }] }],
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
      : 'El servicio de IA respondió con un error. Intente de nuevo en unos segundos.');
    e.status = 502;
    throw e;
  }
  const texto = (body.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('\n').trim();
  return { respuesta: texto || 'No obtuve una respuesta. Intente de nuevo.', modelo: MODEL };
}
