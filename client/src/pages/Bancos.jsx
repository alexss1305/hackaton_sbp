import { useMemo, useState } from 'react';
import { usePublicarSeleccion } from '../asistenteContexto.js';
import { useApi, ErrorBox, Loading } from '../components/ui.jsx';
import { Icon } from '../components/brand.jsx';
import BancoCard from '../components/BancoCard.jsx';
import BancoFicha from '../components/BancoFicha.jsx';
import { tomarFoco } from '../foco.js';
import { fmtCorte, fmtMoney, fmtPct } from '../format.js';

const ORDEN = [
  { value: 'cartera', label: 'Mayor cartera' },
  { value: 'variacion', label: 'Mayor crecimiento' },
  { value: 'morosidad', label: 'Mayor morosidad' },
  { value: 'nombre', label: 'Nombre (A–Z)' },
  { value: 'codigo', label: 'Código' },
];

/** Módulo Bancos: fichas tipo contacto y "estado de cuenta" de cada banco del catálogo. */
export default function Bancos({ ctx }) {
  const { fecha } = ctx;
  const { data, error, loading } = useApi(`/bancos?fecha=${fecha}`);
  const [buscar, setBuscar] = useState('');
  const [orden, setOrden] = useState('cartera');
  const [sel, setSel] = useState(() => tomarFoco('bancos')?.banco || null);
  usePublicarSeleccion({ banco_codigo: sel || '', banco: (data?.bancos || []).find((b) => b.codigo === sel)?.nombre || '', busqueda: buscar, orden });

  const promedio = useMemo(() => {
    const b = data?.bancos || [];
    const tot = b.reduce((a, x) => a + Number(x.cartera), 0);
    return tot ? b.reduce((a, x) => a + (x.morosidadPct ?? 0) * Number(x.cartera), 0) / tot : null;
  }, [data]);
  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    const f = (data?.bancos || []).filter((b) => !q || b.nombre.toLowerCase().includes(q) || b.codigo.includes(q));
    const key = {
      cartera: (b) => -Number(b.cartera), variacion: (b) => -Number(b.varCarteraPct ?? -Infinity), morosidad: (b) => -(b.morosidadPct ?? 0),
      nombre: (b) => b.nombre, codigo: (b) => Number(b.codigo),
    }[orden];
    return [...f].sort((a, b) => { const x = key(a); const y = key(b); return typeof x === 'string' ? x.localeCompare(y, 'es') : x - y; });
  }, [data, buscar, orden]);

  if (sel) {
    return (
      <>
        <div className="page-head">
          <div><button type="button" className="btn link" onClick={() => setSel(null)}><Icon name="back" />Volver a Bancos</button></div>
        </div>
        <BancoFicha codigo={sel} fecha={fecha} modo="pagina" promedioMorosidad={promedio} />
      </>
    );
  }
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Bancos / {fmtCorte(fecha)}</h1>
          <p>Ficha de cada banco de licencia general: cartera, posiciones en los rankings, subactividades, calidad de cartera y evolución. Cada banco se identifica por su código del catálogo, así coincide siempre con los archivos cargados.</p>
        </div>
      </div>
      <div className="card toolbar">
        <label className="field">Buscar
          <input type="text" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre o código" />
        </label>
        <label className="field">Ordenar por
          <select value={orden} onChange={(e) => setOrden(e.target.value)}>{ORDEN.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        </label>
        {data && <span className="muted" style={{ paddingBottom: 8 }}>Sistema: {fmtMoney(data.sistema)} · morosidad promedio {fmtPct(promedio, 2)}</span>}
      </div>
      <ErrorBox error={error} />
      {loading ? <Loading /> : (
        <div className="bk-grid">
          {visibles.map((b, i) => <BancoCard key={b.codigo} b={b} promedioMorosidad={promedio} onOpen={setSel} style={{ animationDelay: `${i * 30}ms` }} />)}
          {!visibles.length && <p className="muted">Ningún banco coincide con la búsqueda.</p>}
        </div>
      )}
    </>
  );
}
