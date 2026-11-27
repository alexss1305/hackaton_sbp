import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { ErrorBox, Select } from '../components/ui.jsx';
import { fmtPeriodo } from '../format.js';

const SUGERENCIAS = [
  '¿Quién lidera cada ranking y con qué participación?',
  '¿Cuáles fueron los movimientos más importantes frente al mes anterior y por qué?',
  '¿Qué banco tiene la cartera más concentrada en construcción?',
  '¿Cuántas filas se excluyeron y por qué motivos?',
  'Resume en 3 viñetas el desempeño de Banco Solidez.',
];

/** Muestra texto con viñetas y negritas simples (**texto**) sin interpretar HTML. */
function Texto({ value }) {
  return value.split('\n').map((line, i) => {
    const bullet = /^\s*[-*•]\s+/.test(line);
    const parts = line.replace(/^\s*[-*•]\s+/, '').split(/\*\*(.+?)\*\*/g);
    const content = parts.map((p, j) => (j % 2 ? <b key={j}>{p}</b> : p));
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
    return bullet ? <div key={i} className="chat-bullet">• {content}</div> : <p key={i} style={{ margin: '2px 0' }}>{content}</p>;
  });
}

export default function Asistente({ ctx }) {
  const { meta, fecha, setFecha } = ctx;
  const [mensajes, setMensajes] = useState([]);
  const [pregunta, setPregunta] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes, busy]);

  const enviar = async (texto) => {
    const q = (texto ?? pregunta).trim();
    if (!q || busy) return;
    const historial = mensajes.map(({ role, content }) => ({ role, content }));
    setMensajes((m) => [...m, { role: 'user', content: q }]);
    setPregunta(''); setBusy(true); setError(null);
    try {
      const r = await api('/asistente', { method: 'POST', body: { fecha, pregunta: q, historial } });
      setMensajes((m) => [...m, { role: 'assistant', content: r.respuesta }]);
    } catch (e) {
      setError(e);
      setMensajes((m) => m.slice(0, -1));
      setPregunta(q);
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Asistente IA</h1>
          <p>Haga preguntas en lenguaje natural sobre los resultados del período. La IA <b>explica y resume</b> los rankings, movimientos y la calidad de datos que ya calculó el motor; <b>no calcula ni modifica</b> rankings.</p>
        </div>
        <Select label="Período consultado" value={fecha} onChange={(f) => { setFecha(f); setMensajes([]); }} options={meta.periodos.map((p) => ({ value: p.fecha, label: fmtPeriodo(p.fecha) }))} />
      </div>

      {!meta.asistenteDisponible ? (
        <div className="alert info">
          <b>El asistente no está configurado en este servidor.</b> Para habilitarlo, agregue <code>ANTHROPIC_API_KEY=…</code> al archivo <code>.env</code> y reinicie el servidor. El resto de la plataforma funciona sin IA.
        </div>
      ) : (
        <div className="card chat">
          <div className="chat-log" aria-live="polite">
            {mensajes.length === 0 && (
              <div className="chat-empty">
                <p className="muted">Pruebe con una de estas preguntas:</p>
                <div className="chips">{SUGERENCIAS.map((s) => <button key={s} className="chip" onClick={() => enviar(s)}>{s}</button>)}</div>
              </div>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>
                <div className="who">{m.role === 'user' ? 'Usted' : 'Asistente'}</div>
                {m.role === 'assistant' ? <Texto value={m.content} /> : m.content}
              </div>
            ))}
            {busy && <div className="bubble assistant"><div className="who">Asistente</div><span className="muted">Analizando los resultados del período…</span></div>}
            <div ref={endRef} />
          </div>
          <ErrorBox error={error} />
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
            <input type="text" value={pregunta} maxLength={1000} onChange={(e) => setPregunta(e.target.value)} placeholder={`Pregunte sobre ${fmtPeriodo(fecha)}…`} aria-label="Pregunta" disabled={busy} />
            <button className="btn primary" disabled={busy || !pregunta.trim()}>Enviar</button>
            {mensajes.length > 0 && <button type="button" className="btn" onClick={() => setMensajes([])} disabled={busy}>Nueva conversación</button>}
          </form>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>⚠ Respuestas generadas por IA a partir de datos ficticios; verifique las cifras en Rankings o Reportes. Las cifras oficiales provienen siempre del cálculo determinista.</p>
        </div>
      )}
    </>
  );
}
