---
name: reportes-visuales
description: Diseñar, mejorar o agregar reportes, gráficos, tablas y secciones visuales en el frontend React de la plataforma de rankings de crédito AT03 (Hackathon SBP 2026). Úsala cuando pidan un reporte nuevo, una sección del reporte ejecutivo, un gráfico (Recharts), un mapa de calor, KPIs, un PDF imprimible o mejorar cómo se ve cualquier pantalla de client/src.
---

# Reportes visuales — Rankings de crédito SBP 2026

Guía para construir reportes y visualizaciones en `client/` con un estilo consistente y sin romper las
reglas del reto. Léela completa antes de tocar `client/src/pages/Reportes.jsx` o `client/src/components/report/`.

## 1. Reglas que no se negocian (afectan la nota)

1. **El frontend nunca calcula cifras oficiales.** Posiciones, saldos, `Total_Cartera_Local_Valida`,
   `Ponderacion_Pct`, conteos E1–E4 y movimientos vienen de la API (`server/src/engine`). En el cliente solo se
   **formatea, filtra y ordena**. Sumar en el cliente solo para totales visuales (p. ej. "mercado total" de un
   gráfico), nunca para un dato que el jurado compara con la clave oficial (R2, criterio 1).
2. **Montos llegan como texto con 2 decimales** (`"98378105.44"`). Mostrar con `fmtMoney`; porcentajes con
   `fmtPct(v, 4)` para ponderación (4 decimales exigidos) y `fmtPct(v, 2)` para variaciones.
3. **Todo reporte muestra fuente, período y aviso de datos ficticios** (lámina 9). Usar `ReportHeader`, que
   incluye el sello "DATOS FICTICIOS" y `meta.fuente`.
4. **Permisos, no niveles:** cada función se habilita con `ctx.puede('<clave>')` (claves en
   `server/src/api/permisos.js`: `comparar_periodos`, `descargar_movimientos`, `descargar_rankings`, …). El Administrador
   las edita en vivo, así que **nunca** use `nivel >= 2` para decidir qué mostrar. El servidor ya bloquea con 403; el
   frontend oculta el botón o lo muestra deshabilitado con "sin permiso". Una sección nueva que dependa de un permiso
   lleva `permiso: '<clave>'` en `SECCIONES`.
5. **La IA no calcula rankings.** Las explicaciones de movimientos son deterministas (`compare.js`); si se agrega
   IA, solo para explicar o consultar, con los números ya calculados como entrada.
6. **Los CSV oficiales no cambian de columnas** (`server/src/engine/exports.js` → `COLUMNS`). Un reporte visual
   es adicional, no reemplaza los entregables 2–5.

## 2. Dónde está cada cosa

| Archivo | Qué contiene |
|---|---|
| `client/src/pages/Reportes.jsx` | Constructor: plantillas (`PLANTILLAS`), lista de secciones (`SECCIONES`), carga de datos y vista previa |
| `client/src/components/report/sections.jsx` | Una función por sección (`KpiSection`, `RankingSection`, `HeatmapSection`, …) y `REPORT_W` |
| `client/src/components/ui.jsx` | `SortableTable`, `MultiSelect`, `Select`, `ChartTooltip`, `Legend`, `Kpi`, `Badge`, `Trend`, `useApi` |
| `client/src/format.js` | Formateadores (`fmtMoney`, `fmtPct`, `fmtCompact`, `fmtPeriodo`, `fmtRanking`) y `SERIES` |
| `client/src/index.css` | Tokens de color (`--series-*`, `--up`, `--down`), estilos `.r-*` del documento y reglas `@media print` |
| `client/src/api.js` | `api()`, `download()`, `qs()` |

Datos disponibles por período (todos los perfiles): `/periods/:fecha/resumen` (quality, lideres, indicadores),
`/periods/:fecha/rankings`, `/periods/:fecha/subactividades`, `/periods/:fecha/quality`. Analista:
`/compare?desde&hasta`, `/series?ranking`.

## 3. Sistema visual

**Color: se asigna por la función que cumple, nunca por gusto.**
- **12 bancos = una sola serie** → todas las barras en `var(--series-1)` (azul). Nunca 12 colores distintos.
- **Bancos destacados** por el usuario → `var(--series-2)` (naranja) en barras y fondo `.r-hl` en tablas.
- **Categorías** (subactividades, ≤ 6 por ranking) → `SERIES[i]` en el **orden del catálogo**
  (`meta.subactividades[ranking]`). El color sigue a la categoría: si se filtra, la sobreviviente no cambia de color.
- **Comparar hasta 4 bancos** en líneas → `SERIES[0..3]`; más de 4 se pliega o se usan múltiplos pequeños.
- **Magnitud** (mapa de calor) → rampa secuencial azul de claro a oscuro (`SEQ` en `sections.jsx`); texto blanco
  solo en los pasos oscuros.
- **Polaridad** (sube/baja) → `var(--up)` azul / `var(--down)` rojo con línea de referencia en 0.
- Verde/ámbar/rojo de estado (`.badge`, `.r-check`) son solo para ✓/✕ de controles, siempre con ícono y texto.

**Marcas y ejes:** barras con extremo redondeado de 4 px (`radius={[0, 4, 4, 0]}` horizontales), separación entre
barras (`barCategoryGap`), cuadrícula solo en el eje de valor, sin líneas de eje ni ticks. **Nunca doble eje Y.**
Etiquetas de valor selectivas (`LabelList` con `fmtCompact`), no en cada punto de una línea.

**Texto:** valores y leyendas en tinta de texto (`--text-primary`/`--text-secondary`), nunca en el color de la serie.
Toda gráfica con ≥ 2 series lleva `<Legend>`; con 1 serie el título la nombra. Siempre que haya gráfico, existe una
tabla con los mismos datos (accesibilidad y para que el jurado lea cifras exactas).

**Interacción:** todo gráfico en pantalla tiene `<Tooltip content={<ChartTooltip valueFormatter={…} />} />`.
Filtros en una fila arriba del contenido.

## 4. Documento imprimible (PDF)

- El reporte es un `<article className="report">` de 760 px que **siempre usa la paleta clara** (es papel),
  incluso en modo oscuro. No agregue colores de tema oscuro dentro de `.report`.
- **Gráficos con ancho fijo** `width={REPORT_W}` (700 px), **sin `ResponsiveContainer`**, e
  `isAnimationActive={false}`: así la impresión no se deforma ni sale vacía.
- Cada sección usa `<Section>` (numeración automática, `break-inside: avoid`). Una sección no debería pasar de
  una hoja A4; si crece, divídala (como `RankingSection`, una por ranking).
- La impresión oculta todo lo que tenga `.no-print`, la barra lateral y el aviso superior (el documento ya trae el suyo).

## 5. Cómo agregar una sección nueva

1. En `sections.jsx`, crear la función:
   ```jsx
   export function MiSeccion({ n, resumen, destacados }) {
     const data = [...resumen.indicadores.bancos].sort((a, b) => b.X - a.X); // ordenar, no recalcular
     return (
       <Section n={n} title="Título claro" subtitle="Qué mide y cómo leerlo (una frase).">
         <BarChart width={REPORT_W} height={24 * data.length + 30} data={data} layout="vertical" barCategoryGap={3}>
           {/* … ejes, Tooltip con ChartTooltip, Bar con Cell: destacados en --series-2 */}
         </BarChart>
         <table className="r-table">{/* mismas cifras en tabla */}</table>
       </Section>
     );
   }
   ```
2. En `Reportes.jsx`: agregar `{ id, label, permiso? }` a `SECCIONES`, renderizarla en el
   bloque que arma `secs` y, si aplica, incluirla en alguna entrada de `PLANTILLAS`.
3. Si necesita datos nuevos, agregarlos en el **servidor** (motor o ruta), con prueba en `server/test/`, nunca
   calculándolos en el cliente.

## 6. Verificación antes de entregar

- [ ] `npm run build` sin errores y `npx oxlint src` (en `client/`) sin errores nuevos.
- [ ] `npm test` en la raíz sigue en verde si se tocó el servidor.
- [ ] Revisar la pantalla y el PDF (botón "Descargar PDF / Imprimir"): sin textos encimados, tablas completas,
      una sección no partida entre hojas, encabezado con período y sello de datos ficticios.
- [ ] Probar como **Público** (no debe ver movimientos ni comparaciones con los permisos por defecto) y como **Analista**;
      si se agregó un permiso, quitarlo en *Administración → Perfiles y permisos* y confirmar que la opción desaparece.
- [ ] Las cifras mostradas coinciden con `output/rankings.csv` (`npm run calc`) para el período elegido.
