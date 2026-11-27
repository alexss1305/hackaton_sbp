import { useEffect, useState } from 'react';

const reducido = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Anima el primer número de un texto ya formateado ("$5,152.1 M", "28,802", "+8.40%") desde 0 hasta su valor,
 * conservando el formato (separadores, decimales, prefijos y sufijos).
 */
export function Contador({ value, ms = 700 }) {
  const texto = String(value ?? '');
  const m = /-?\d[\d,]*(\.\d+)?/.exec(texto);
  const [t, setT] = useState(m && !reducido() ? 0 : 1);
  useEffect(() => {
    if (!m || reducido()) { setT(1); return undefined; }
    let raf; const ini = performance.now();
    setT(0);
    const paso = (now) => { const x = Math.min(1, (now - ini) / ms); setT(1 - (1 - x) ** 3); if (x < 1) raf = requestAnimationFrame(paso); };
    raf = requestAnimationFrame(paso);
    // Si el navegador pausa la animación (pestaña oculta, impresión), la cifra igual llega a su valor final
    const seguro = setTimeout(() => setT(1), ms + 150);
    return () => { cancelAnimationFrame(raf); clearTimeout(seguro); };
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m || t >= 1) return texto;
  const num = Number(m[0].replace(/,/g, ''));
  const dec = m[1] ? m[1].length - 1 : 0;
  const actual = (num * t).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return texto.slice(0, m.index) + actual + texto.slice(m.index + m[0].length);
}

/** Bloques grises animados mientras carga una pantalla. */
export function Esqueleto({ filas = 3 }) {
  return (
    <div className="sk" aria-busy="true" aria-label="Cargando">
      <div className="sk-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="sk-b sk-kpi" />)}</div>
      {[...Array(filas)].map((_, i) => <div key={i} className="sk-b sk-card" style={{ animationDelay: `${i * 120}ms` }} />)}
    </div>
  );
}

/** Avisos flotantes breves (descargas, acciones completadas). */
const oyentes = new Set();
export function avisar(texto, tipo = 'ok') {
  const a = { id: Math.random().toString(36).slice(2), texto, tipo };
  for (const fn of oyentes) fn(a);
}
export function Avisos() {
  const [lista, setLista] = useState([]);
  useEffect(() => {
    const fn = (a) => {
      setLista((l) => [...l.slice(-2), a]);
      setTimeout(() => setLista((l) => l.filter((x) => x.id !== a.id)), 3200);
    };
    oyentes.add(fn);
    return () => oyentes.delete(fn);
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {lista.map((a) => <div key={a.id} className={`toast ${a.tipo}`}>{a.texto}</div>)}
    </div>
  );
}
