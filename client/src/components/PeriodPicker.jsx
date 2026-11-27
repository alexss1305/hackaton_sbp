import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { fmtPeriodo } from '../format.js';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/** "20260731" -> "31/07/2026" */
const fmtCorte = (f) => `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}`;

/**
 * Selector de período tipo calendario: muestra los 12 meses del año y habilita solo los que tienen un
 * corte AT03 cargado. Navega entre años, cierra con Escape o clic fuera, y es operable con teclado.
 * periodos: [{ fecha: 'AAAAMMDD', filas, universo }]
 */
export default function PeriodPicker({ periodos, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const porMes = useMemo(() => new Map(periodos.map((p) => [p.fecha.slice(0, 6), p])), [periodos]);
  const anios = useMemo(() => [...new Set(periodos.map((p) => Number(p.fecha.slice(0, 4))))].sort(), [periodos]);
  const [anio, setAnio] = useState(() => Number((value || periodos.at(-1)?.fecha || '').slice(0, 4)) || new Date().getFullYear());

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const elegir = (f) => { onChange(f); setOpen(false); };
  const idx = periodos.findIndex((p) => p.fecha === value);
  const actual = periodos[idx];
  const minA = anios[0]; const maxA = anios.at(-1);

  return (
    <div className="period-picker" ref={ref}>
      <div className="pp-trigger-group">
        <button type="button" className="pp-step" aria-label="Período anterior" disabled={idx <= 0} onClick={() => onChange(periodos[idx - 1].fecha)}>
          <Icon name="back" />
        </button>
        <button type="button" className="pp-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => { if (!open && value) setAnio(Number(value.slice(0, 4))); setOpen(!open); }}>
          <Icon name="calendar" />
          <span className="pp-label">
            <b>{fmtPeriodo(value)}</b>
            {value && <small>Corte {fmtCorte(value)}</small>}
          </span>
          <Icon name="chevronDown" className="pp-caret" />
        </button>
        <button type="button" className="pp-step" aria-label="Período siguiente" disabled={idx < 0 || idx >= periodos.length - 1} onClick={() => onChange(periodos[idx + 1].fecha)}>
          <Icon name="chevron" />
        </button>
      </div>

      {open && (
        <div className="pp-pop" role="dialog" aria-label="Seleccionar período">
          <div className="pp-head">
            <button type="button" className="pp-nav" aria-label="Año anterior" disabled={anio <= minA} onClick={() => setAnio(anio - 1)}><Icon name="back" /></button>
            <b>{anio}</b>
            <button type="button" className="pp-nav" aria-label="Año siguiente" disabled={anio >= maxA} onClick={() => setAnio(anio + 1)}><Icon name="chevron" /></button>
          </div>
          <div className="pp-grid">
            {MESES.map((m, i) => {
              const key = `${anio}${String(i + 1).padStart(2, '0')}`;
              const p = porMes.get(key);
              const sel = p && p.fecha === value;
              return (
                <button key={key} type="button" disabled={!p} className={`pp-month ${sel ? 'on' : ''} ${p ? 'has' : ''}`}
                  title={p ? `Corte ${fmtCorte(p.fecha)} · ${p.universo.toLocaleString('es-PA')} operaciones válidas` : 'Sin datos cargados'}
                  onClick={() => p && elegir(p.fecha)}>
                  {m}
                  {p && <i className="pp-dot" />}
                </button>
              );
            })}
          </div>
          <div className="pp-list">
            <div className="pp-list-t">Períodos cargados</div>
            {[...periodos].reverse().map((p, i) => (
              <button key={p.fecha} type="button" className={p.fecha === value ? 'on' : ''} onClick={() => elegir(p.fecha)}>
                <span>{fmtPeriodo(p.fecha)}{i === 0 && <em>Más reciente</em>}</span>
                <small>{p.universo.toLocaleString('es-PA')} op. válidas</small>
              </button>
            ))}
          </div>
          {actual && <div className="pp-foot">Fecha de corte seleccionada: <b>{actual.fecha}</b></div>}
        </div>
      )}
    </div>
  );
}
