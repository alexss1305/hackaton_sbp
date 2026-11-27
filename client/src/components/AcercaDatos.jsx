import { useEffect, useRef, useState } from 'react';
import { Icon } from './brand.jsx';
import { fmtCorte, fmtInt, fmtFechaHora, fmtMes } from '../format.js';

/** Botón ⓘ con la fuente y el período de los datos (lámina 9: mostrar fuente, período y que son datos sintéticos). */
export default function AcercaDatos({ meta, fecha }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [open]);
  const p = meta?.periodos?.find((x) => x.fecha === fecha);
  return (
    <div className="ad-info" ref={ref}>
      <button type="button" className="ad-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" title="Fuente y período de los datos">
        <Icon name="info" /><span>Fuente: AT03</span>
      </button>
      {open && (
        <div className="ad-pop" role="dialog" aria-label="Acerca de los datos">
          <b>Acerca de los datos</b>
          <dl>
            <dt>Fuente</dt><dd>Archivos AT03 (Átomo 03) y catálogos CINU/SB109, SB21 y bancos</dd>
            <dt>Período</dt><dd>{fmtMes(fecha)} · fecha de corte {fmtCorte(fecha)}</dd>
            {p && <><dt>Archivo</dt><dd>{p.archivos.join(', ')}</dd><dt>Filas</dt><dd>{fmtInt(p.filas)} leídas · {fmtInt(p.universo)} válidas</dd></>}
            <dt>Períodos</dt><dd>{(meta?.periodos || []).map((x) => fmtMes(x.fecha)).join(' · ')}</dd>
            {meta?.calculadoEn && <><dt>Cálculo</dt><dd>{fmtFechaHora(meta.calculadoEn)} · determinista y reproducible</dd></>}
          </dl>
          <p className="ad-nota"><Icon name="info" />Datos sintéticos con estructura AT03 del Hackathon SBP 2026. Uso informativo; no constituye opinión formal de la SBP.</p>
        </div>
      )}
    </div>
  );
}
