/**
 * Asistente de IA (criterio 6 del reto): EXPLICA y responde preguntas sobre resultados YA CALCULADOS.
 * Nunca calcula rankings: recibe como contexto los rankings, la calidad y los movimientos que produjo el motor
 * determinista (server/src/engine) y se le indica que no invente ni recalcule cifras.
 *
 * Credenciales: ANTHROPIC_API_KEY en .env (no versionado). Sin clave, el asistente queda deshabilitado.
 */
import Anthropic from '@anthropic-ai/sdk';
import { compareRankings } from '../engine/compare.js';

const MODEL = 'claude-opus-5-5';
const MAX_PREGUNTA = 1000;
const MAX_TURNOS = 6;

export const asistenteDisponible = () => Boolean(process.env.ANTHROPIC_API_KEY);

let client = null;
const getClient = () => (client ??= new Anthropic());

const SYSTEM = `Eres el asistente de la plataforma "Rankings de Crédito por Actividad Económica" del Hackathon SBP 2026 (Superintendencia de Bancos de Panamá).
Tu función es EXPLICAR y AYUDAR A EXPLORAR resultados que ya calculó un motor determinista. Reglas:
- Usa EXCLUSIVAMENTE los datos del bloque <datos>. No inventes cifras, bancos, períodos ni causas que no estén en los datos.
- No recalcules rankings, posiciones, saldos ni ponderaciones: cítalos tal como aparecen. Puedes describir comparaciones evidentes (mayor/menor, sube/baja) y citar diferencias que ya vengan calculadas (Var_Saldo, Var_Saldo_Pct, Cambio_Posicion).
- Si la pregunta no se puede responder con los datos, dilo claramente y sugiere qué pantalla de la plataforma consultar (Rankings, Filtros y subactividades, Calidad de datos, Comparar períodos, Reportes).
- Todos los bancos y clientes son ficticios; los datos son sintéticos. No des recomendaciones de inversión ni opiniones regulatorias formales.
- Responde en español, breve y claro (máximo ~200 palabras), con viñetas cuando ayuden. Montos con separador de miles.`;

/** Arma el contexto compacto del período a partir de los resultados del motor. */
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

/**
 * Responde una pregunta. historial: [{ role: 'user'|'assistant', content: string }] de turnos previos.
 * Devuelve { respuesta, modelo }.
 */
export async function preguntar(store, { fecha, pregunta, historial = [] }) {
  if (!asistenteDisponible()) {
    const e = new Error('El asistente de IA no está configurado: falta ANTHROPIC_API_KEY en el archivo .env del servidor.'); e.status = 503; throw e;
  }
  const q = String(pregunta ?? '').trim();
  if (!q) { const e = new Error('Escriba una pregunta.'); e.status = 400; throw e; }
  if (q.length > MAX_PREGUNTA) { const e = new Error(`La pregunta supera ${MAX_PREGUNTA} caracteres.`); e.status = 400; throw e; }

  const contexto = buildContext(store, fecha);
  const previos = (Array.isArray(historial) ? historial : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNOS * 2)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  while (previos.length && previos[0].role !== 'user') previos.shift();

  try {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      // El contexto del período va en el system (estable entre preguntas) y se cachea.
      system: [
        { type: 'text', text: SYSTEM },
        { type: 'text', text: `<datos>\n${JSON.stringify(contexto)}\n</datos>`, cache_control: { type: 'ephemeral' } },
      ],
      messages: [...previos, { role: 'user', content: q }],
    });
    if (response.stop_reason === 'refusal') {
      return { respuesta: 'No puedo responder esa pregunta. Intente reformularla en relación con los rankings, la calidad de datos o los movimientos del período.', modelo: response.model };
    }
    const texto = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
    return { respuesta: texto || 'No obtuve una respuesta. Intente de nuevo.', modelo: response.model };
  } catch (err) {
    let e;
    if (err instanceof Anthropic.AuthenticationError) e = new Error('La clave ANTHROPIC_API_KEY no es válida.');
    else if (err instanceof Anthropic.RateLimitError) e = new Error('El servicio de IA está saturado; intente de nuevo en unos segundos.');
    else if (err instanceof Anthropic.APIConnectionError) e = new Error('No hay conexión con el servicio de IA.');
    else if (err instanceof Anthropic.APIError) e = new Error(`El servicio de IA respondió con un error (${err.status ?? 'sin código'}).`);
    else throw err;
    e.status = 502;
    throw e;
  }
}
