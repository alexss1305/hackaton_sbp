import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon } from './brand.jsx';
import { fmtMes } from '../format.js';
import { getSeleccion } from '../asistenteContexto.js';
import './chat.css';

const KEY = 'sbp-chat';
const SUGERENCIAS = {
  panel: ['¿Qué banco tiene la mayor cartera y cuánto creció?', '¿Cómo está la morosidad del sistema?', '¿Qué significa "Datos verificados"?'],
  rankings: ['Explícame este ranking', '¿Quién lidera y con qué saldo?', '¿Cómo veo el desglose de un banco?'],
  bancos: ['Resume la situación de este banco', '¿Qué banco tiene mayor morosidad?', '¿Cómo leo la ficha de un banco?'],
  explorar: ['¿Qué subactividad pesa más en lo que estoy viendo?', '¿Cómo combino filtros?', '¿Qué muestra el gráfico de dona?'],
  calidad: ['¿Por qué se excluyeron filas este mes?', '¿Qué es E2?', '¿Qué es el universo local válido?'],
  reportes: ['¿Cómo descargo el ranking en CSV?', '¿Qué reporte me sirve para comparar meses?'],
  comparar: ['Explica los principales movimientos de esta comparación', '¿Qué banco creció más?', '¿Cómo cambio el tipo de gráfico?'],
  admin: ['¿Cómo cargo un período nuevo?', '¿Qué hago si el archivo tiene errores?', '¿Cómo cambio la regla de movimiento significativo?'],
};

/** Negritas (**x**), viñetas y pasos numerados, sin interpretar HTML. */
function Texto({ value }) {
  return value.split('\n').map((line, i) => {
    if (!line.trim()) return <div key={i} style={{ height: 6 }} />;
    const titulo = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (titulo) return <p key={i} className="ch-h">{titulo[1].replace(/\*\*/g, '')}</p>;
    const num = /^\s*(\d+)[.)]\s+/.exec(line);
    const bullet = /^\s*[-*•]\s+/.test(line);
    const limpio = line.replace(/^\s*(\d+[.)]|[-*•])\s+/, '');
    const content = limpio.split(/\*\*(.+?)\*\*/g).map((p, j) => (j % 2 ? <b key={j}>{p}</b> : p));
    if (num) return <div key={i} className="ch-step"><span>{num[1]}</span><div>{content}</div></div>;
    return bullet ? <div key={i} className="ch-bullet">• {content}</div> : <p key={i}>{content}</p>;
  });
}

/** Chat flotante del asistente: se abre desde el botón inferior derecho y conoce la pantalla actual. */
export default function ChatFlotante({ pantalla, fecha, perfilNombre, iaConfigurada }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState(() => { try { return JSON.parse(sessionStorage.getItem(KEY)) || []; } catch { return []; } });
  const [texto, setTexto] = useState('');
  const [busy, setBusy] = useState(false);
  const fin = useRef(null);
  const input = useRef(null);

  useEffect(() => { sessionStorage.setItem(KEY, JSON.stringify(mensajes.slice(-30))); }, [mensajes]);
  useEffect(() => { if (abierto) { fin.current?.scrollIntoView({ behavior: 'smooth' }); input.current?.focus(); } }, [abierto, mensajes, busy]);
  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [abierto]);

  const enviar = async (q) => {
    const pregunta = (q ?? texto).trim();
    if (!pregunta || busy) return;
    const historial = mensajes.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMensajes((m) => [...m, { role: 'user', content: pregunta }]);
    setTexto(''); setBusy(true);
    try {
      const r = await api('/asistente', { method: 'POST', body: { fecha, pregunta, historial, pantalla: pantalla.id, seleccion: { pantalla: pantalla.label, ...getSeleccion() } } });
      setMensajes((m) => [...m, { role: 'assistant', content: r.respuesta, modelo: r.modelo }]);
    } catch (e) {
      setMensajes((m) => [...m, { role: 'assistant', content: e.message, error: true }]);
    } finally { setBusy(false); }
  };

  const sugerencias = SUGERENCIAS[pantalla.id] || SUGERENCIAS.panel;
  return (
    <>
      {abierto && (
        <section className="ch-panel" role="dialog" aria-label="Asistente SBP">
          <header className="ch-head">
            <span className="ch-logo"><Icon name="spark" /></span>
            <div className="ch-title"><b>Asistente SBP</b><span>{iaConfigurada ? 'IA · explica y guía' : 'Modo guía'}</span></div>
            {mensajes.length > 0 && <button type="button" className="ch-icon" onClick={() => setMensajes([])} title="Nueva conversación" aria-label="Nueva conversación"><Icon name="back" /></button>}
            <button type="button" className="ch-icon" onClick={() => setAbierto(false)} title="Minimizar" aria-label="Minimizar"><Icon name="chevronDown" /></button>
          </header>
          <div className="ch-ctx" title="El asistente responde sobre esta pantalla y período">
            <Icon name="info" />Viendo: <b>{pantalla.label}</b> · {fmtMes(fecha)} · {perfilNombre}
          </div>
          <div className="ch-log" aria-live="polite">
            {mensajes.length === 0 && (
              <div className="ch-hola">
                <span className="ch-logo big"><Icon name="spark" /></span>
                <b>Hola, ¿en qué te ayudo?</b>
                <p>Puedo explicarte lo que ves en esta pantalla y guiarte paso a paso en cualquier función de la plataforma.</p>
              </div>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={`ch-msg ${m.role} ${m.error ? 'err' : ''}`}>
                <Texto value={m.content} />
                {m.modelo === 'guia' && <small className="ch-tag">Respuesta de la guía (sin IA)</small>}
              </div>
            ))}
            {busy && <div className="ch-msg assistant ch-typing" aria-label="Escribiendo"><i /><i /><i /></div>}
            <div ref={fin} />
          </div>
          {!busy && (mensajes.length === 0 || mensajes.at(-1).role === 'assistant') && (
            <div className="ch-sug">
              {sugerencias.map((s) => <button key={s} type="button" onClick={() => enviar(s)}>{s}</button>)}
            </div>
          )}
          <form className="ch-input" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
            <input ref={input} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escriba su pregunta…" maxLength={1000} aria-label="Pregunta para el asistente" />
            <button type="submit" disabled={!texto.trim() || busy} aria-label="Enviar"><Icon name="arrow" /></button>
          </form>
          <small className="ch-pie">Las cifras oficiales vienen del cálculo determinista; el asistente solo las explica.</small>
        </section>
      )}
      <button type="button" className={`ch-fab ${abierto ? 'on' : ''}`} onClick={() => setAbierto((a) => !a)} aria-label={abierto ? 'Cerrar asistente' : 'Abrir asistente'} aria-expanded={abierto}>
        <Icon name={abierto ? 'close' : 'spark'} />
        {!abierto && <span>Asistente</span>}
      </button>
    </>
  );
}
