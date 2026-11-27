# Registro de cambios

Historial de cambios del proyecto, **un apartado por commit**, del más reciente al más antiguo.
Cada entrada indica el commit, la fecha, el autor, qué cambió y cómo se verificó.

**Cómo agregar una entrada:** al hacer un commit, copie la plantilla del final, péguela debajo de este texto
(encima de la entrada más reciente) y complétela. Como el hash se conoce después del commit, puede hacer el commit
con la entrada y completar el hash en el commit siguiente, o usar `git commit --amend` antes de subirlo.

---

## (pendiente) — Auditoría del backend: casos borde, seguridad y exportaciones
**Fecha:** 2026-11-27 · **Autor:** margelinho

**Motivo:** auditoría completa del backend contra `INDICACIONES_RETO_RANKING_CREDITO.md` con la nueva skill `auditoria-backend`. Cada hallazgo se reprodujo antes de corregirlo.

**Hallazgos y correcciones**
- **Login con perfiles heredados** (`server/src/api/auth.js`, `routes.js`): `login(..., 'constructor', '', '')` devolvía una sesión válida porque `PERFILES['constructor']` existe en `Object.prototype`. Ahora solo se aceptan claves propias (`esPerfil`), el login responde 400 con un perfil inválido, no hay acceso si falta la contraseña configurada y las sesiones vencidas se limpian.
- **Ranking con 13 bancos** (`server/src/engine/aggregate.js`): un `Codigo_Banco` no catalogado se agregaba como banco extra del ranking. Ahora cada ranking tiene exactamente los bancos del catálogo (12); la fila no se excluye, queda como alerta y su saldo se informa en R3 (`saldoBancosNoCatalogados`).
- **Fechas imposibles** (`server/src/engine/validate.js`): `20261399` o `20260230` pasaban la validación. Ahora `Fecha` debe ser una fecha real del calendario.
- **Precisión en la explicación automática** (`server/src/engine/compare.js`, `money.js`): los montos se formateaban con `Number`, que pierde centavos sobre 2^53. Ahora se usa `formatCentsMiles` en `BigInt`. La redacción del cambio de líder solo dice "pasa a liderar" o "pierde el liderazgo" cuando corresponde.
- **Retiro de un período dentro de un archivo con varios meses** (`server/src/store/store.js`): retirar julio movía el archivo completo y borraba también agosto sin aviso. Ahora se rechaza con un mensaje claro.
- **CSV oficiales con BOM** (`server/src/api/routes.js`): las descargas empezaban con BOM, y un script de comparación podía leer el encabezado como `\ufeffFecha`. Ahora salen sin BOM, igual que los archivos del reto (con `?bom=1` para Excel), y el nombre del archivo descargado se sanea.
- **Subactividad Tarjeta fija en el código** (`server/src/engine/classify.js`, `rules.js`): ahora se toma del catálogo CINU (R3).
- **Catálogos con llaves repetidas o vacías** (`server/src/engine/catalogs.js`): ahora se rechazan al cargar o reemplazar un catálogo.
- **Parámetros**: `cambioLider: "false"` (texto) se interpretaba como verdadero. Corregido.
- **Demo** (`server/scripts/demo.js`): el período a retirar se elegía por nombre de archivo; ahora por el campo `Fecha`.

**Pruebas:** nuevo `server/test/auditoria.test.js` con 18 casos (fechas reales, dos fechas en un archivo, `Destino` exacto, cascada múltiple, primera ocurrencia en E1, banco y facilidad no catalogados, reclasificación SB21 con centavos, ponderación exacta con 300 montos, cambio de líder con montos grandes, división por cero en `Var_Saldo_Pct`, exportaciones con encabezados exactos, CRLF, sin BOM y ceros a la izquierda, catálogos inválidos, perfiles heredados, retiro seguro y parámetros).

**Verificación:** `npm test` 36 de 36 en verde. `npm run calc`: `rankings.csv`, `subactividades.csv`, `calidad.csv` y `movimientos.csv` idénticos byte a byte a los anteriores, y recálculo independiente en Python con 0 diferencias (216 filas de ranking, 792 de subactividad).

**Skill:** `.claude/skills/auditoria-backend/SKILL.md` (ejecutar con `/auditoria-backend` en Claude Code).

---

## 671a178 — Estilo institucional SBP y acceso en dos pasos
**Fecha:** 2026-11-27 · **Autor:** margelinho

**Motivo:** la interfaz se veía simple. Se eligió la dirección «Institucional» (paleta del sitio de la SBP) y se aplicaron los cambios pedidos al inicio de sesión.

**Cambios**
- **Estilo institucional** (`client/src/index.css`): paleta índigo, degradado azul-violeta y dorado; tipografía Plus Jakarta Sans; barra superior blanca con monograma, banner con degradado y líneas doradas, menú lateral con marca dorada, KPI y tarjetas con acento dorado. Se retiró el modo oscuro automático.
- **Marca e íconos** (`client/src/components/brand.jsx`): monograma propio «SBP» (no es el logo oficial) e íconos de línea sin dependencias nuevas.
- **Inicio de sesión en dos pasos** (`client/src/pages/Login.jsx`): «Público» o «Personal de la Superintendencia»; la segunda vista pide perfil (Analista/Administrador), usuario y contraseña. Título: «Ranking de Créditos · Superintendencia de Bancos de Panamá».
- **Usuario + contraseña** (`server/src/api/auth.js`, `routes.js`, `scripts/setup-env.js`, `.env.example`): nuevas variables `ANALISTA_USER` y `ADMIN_USER` (por defecto `analista` y `admin`). Un `.env` anterior sigue funcionando.
- **Aviso de datos sintéticos discreto:** se quitó el banner amarillo y el sello «DATOS FICTICIOS»; el aviso queda en el pie de cada pantalla y del informe (lámina 9 y criterio 4 siguen cubiertos).

**Verificación:** `npm test` con 18 de 18 pruebas en verde (se agregaron casos de usuario incorrecto); compilación del frontend sin errores; recorrido en navegador: inicio, acceso del personal como Administrador, Panel y Rankings, sin errores en consola.

---

## e3a2c92 — Cumplimiento del reto: validación por tipos, permisos editables, asistente IA y demo
**Fecha:** 2026-11-27 · **Autor:** margelinho · **Archivos:** 27 (+771 / −70)

**Motivo:** revisión de la plataforma contra `INDICACIONES_RETO_RANKING_CREDITO.md`, sección por sección, y cierre de las brechas encontradas.

**Cambios**
- **Validación de tipos (4.A):** cada campo se valida contra la columna `Tipo` del diccionario AT03 (`server/src/engine/validate.js` › `typeAlerts`). Los valores inválidos generan alertas agrupadas por campo, sin excluir filas.
- **Reporte de calidad:** columnas `Indep_E1..Indep_E4` con el conteo independiente de cada regla, rotulado como informativo.
- **Carga segura** (`server/src/store/store.js`): se rechaza una carga que retiraría otros períodos, y un archivo con el mismo nombre que otro de un mes distinto se guarda con otro nombre en vez de sobrescribirlo.
- **Perfiles y permisos editables (lámina 6):** `server/src/api/permisos.js`, matriz en *Administración → Perfiles y permisos*, persistida en `data/permisos.json`. El servidor la aplica en cada ruta; las funciones de Administrador no se pueden delegar.
- **Asistente de IA (criterio 6):** `server/src/api/asistente.js` y la pantalla *Asistente IA*. Usa el modelo `claude-opus-5-5` y recibe solo resultados ya calculados; no recalcula. Requiere `ANTHROPIC_API_KEY` en `.env` (opcional).
- **Demo del entregable 7:** `npm run demo:preparar` / `npm run demo:restaurar` (`server/scripts/demo.js`).
- **R5:** las pruebas generan contraseñas aleatorias en cada ejecución.
- **Documentación:** `docs/CUMPLIMIENTO.md` (requisito → código → prueba), README y skill `reportes-visuales` actualizados.

**Verificación:** `npm test` con 18 de 18 pruebas en verde; recálculo independiente en Python con 0 diferencias; recorrido de las pantallas con los 3 perfiles en un navegador sin interfaz, sin errores.

**Pendiente:** probar el asistente con una `ANTHROPIC_API_KEY` real.

---

## 1ef5d25 — Reportes: constructor con vista previa imprimible y skill de diseño visual
**Fecha:** 2026-11-27 · **Autor:** margelinho · **Archivos:** 4 (+618 / −43)

**Motivo:** el módulo de Reportes se veía vacío, tenía poca personalización y no había un reporte para presentar.

**Cambios**
- **Nueva pantalla *Reportes*** (`client/src/pages/Reportes.jsx`): plantillas (ejecutivo, rankings detallados, comparación, calidad), período, rankings, bancos a destacar, filas por tabla y secciones a elegir, con vista previa tipo documento.
- **Secciones** (`client/src/components/report/sections.jsx`): resumen, líderes y concentración (HHI), mapa de calor de ponderación, gráfico por ranking con composición por subactividad, movimientos con explicación, embudo de calidad E1–E4, morosidad y nota metodológica.
- **PDF / impresión en A4** con gráficos de ancho fijo (`client/src/index.css`).
- **Skill** `.claude/skills/reportes-visuales/SKILL.md` con las reglas de datos, color e impresión y una plantilla para secciones nuevas.

**Verificación:** capturas en un navegador sin interfaz; se corrigieron las explicaciones encimadas y las barras de calidad. La plantilla de rankings detallados sale en 7 hojas.

---

## 6148fc2 — Proyecto inicial: plataforma de rankings de crédito AT03
**Fecha:** 2026-11-27 · **Autor:** margelinho · **Archivos:** 54 (+88 471 / −1, incluye los CSV de datos)

**Cambios**
- **Motor de cálculo** (`server/src/engine/`): lectura de CSV como texto, validación del esquema de 61 columnas, cascada E1–E4, clasificación CINU + regla SB21, rankings, ponderación con redondeo half-up, reconciliaciones R1–R3, comparación entre períodos con regla configurable y explicación automática. Aritmética exacta en centavos.
- **API Express** con 3 perfiles, carga y actualización de períodos, parámetros, catálogos y bitácora.
- **Frontend React + Vite + Recharts:** Panel, Rankings, Filtros y subactividades, Calidad de datos, Reportes, Comparar períodos y Administración. Aviso permanente de datos ficticios.
- **Exportaciones CSV** de los entregables 2 a 5 y `npm run calc`.
- **README** con instalación, arquitectura y reglas.

**Verificación:** 14 pruebas (motor y API); recálculo independiente en Python `decimal` con 0 diferencias en 216 filas de ranking y 792 de subactividad.

---

## ba4b7fa — Initial commit
**Fecha:** 2026-11-27 · **Autor:** alexss1305

Creación del repositorio con un `README.md` mínimo.

---

<!-- Plantilla para nuevas entradas:

## <hash> — <título del commit>
**Fecha:** AAAA-MM-DD · **Autor:** <usuario> · **Archivos:** N (+x / −y)

**Motivo:** por qué se hizo el cambio.

**Cambios**
- Qué cambió y en qué archivos.

**Verificación:** pruebas o revisiones realizadas.

**Pendiente:** (opcional)
-->
