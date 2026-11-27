---
name: auditoria-backend
description: Auditar el backend Node.js (motor de cálculo, store, API, scripts y pruebas) contra INDICACIONES_RETO_RANKING_CREDITO.md como lo haría el jurado del Hackathon SBP 2026, encontrar errores de reglas, precisión, permisos o exportación, corregirlos y ampliar las pruebas. Úsala antes de una entrega, después de cambios en server/, o cuando pidan "revisar el backend", "buscar fallos", "auditar" o "qué nos encontraría el jurado".
---

# Auditoría del backend — Hackathon SBP 2026

Actúa como auditor senior de backend y especialista en lógica regulatoria/financiera en Node.js.
Revisa **todo** `server/src/engine/*.js`, `server/src/store/store.js`, `server/src/api/*.js`, `server/src/app.js`,
`server/src/index.js`, `server/scripts/*.js` y `server/test/*.js` frente a `INDICACIONES_RETO_RANKING_CREDITO.md`
(prevalece sobre `Hackathon_SBP_2026.pptx`). Busca cualquier error, discrepancia de regla, caso borde, riesgo de
precisión numérica, fallo de permisos, problema de estado o falla de exportación, y corrígelo de forma limpia y
determinista.

## Cómo trabajar
1. Lee el código actual completo antes de opinar: el equipo lo cambia seguido.
2. **Reproduce cada sospecha** con un script o una prueba antes de corregirla. No reportes fallos sin evidencia.
3. Corrige con el cambio mínimo y agrega una prueba que falle sin la corrección (`server/test/auditoria.test.js`).
4. Verifica que los resultados de los 3 períodos **no cambien**: `npm run calc` y compara `output/*.csv` con los
   anteriores; si cambian, explica por qué la versión nueva es la correcta.
5. Corre `npm test`. Todo en verde antes de entregar.

## Reglas a verificar sin excepción

### 1. Formato CSV, tipos y ceros a la izquierda (secciones 2.1 y 4.A)
- UTF-8 (tolerar BOM al leer), coma, punto decimal, montos con 2 decimales sin separador de miles, `NA` literal.
- Todos los códigos son texto y conservan ceros (`07`, `001`, `010`, `0701`); fechas `AAAAMMDD` reales.
- Comparaciones exactas: `Destino` exactamente `'L'` (ni `' L'` ni `'l'`).
- El período sale del campo `Fecha`, no del nombre del archivo. 61 columnas exactas (nombre y orden) del diccionario.

### 2. Cascada E1–E4 por período (sección 4.B)
- E1 duplicado de `Numero_Prestamo` → se conserva la **primera** ocurrencia del archivo; E2 `Destino <> 'L'`;
  E3 `Saldo <= 0`; E4 `Tipo_Actividad` fuera del catálogo CINU.
- Cada fila cuenta una sola vez, en el primer filtro que incumple: `leídas = E1+E2+E3+E4+universo`.
  El conteo independiente va aparte y rotulado.
- `Codigo_Banco` y `Facilidad_Crediticia` no catalogados son **alertas**, no exclusiones.
  Nunca usar `Codigo_SB08_Referencia` como llave.

### 3. Clasificación, CONSUMO/SB21 y aritmética exacta (secciones 4.C y 6)
- Montos en centavos `BigInt`; `Ponderacion_Pct` con redondeo half-up en enteros a 4 decimales. Nunca `float` para sumar.
- CINU crédito personal + facilidad `07` → subactividad Tarjeta (tomada del catálogo), sin alterar el total de CONSUMO.
- CINU Tarjeta sin `07` o Automóvil sin `03` → alerta, se mantiene la subactividad del catálogo.
- `Total_Cartera_Local_Valida_Banco` = todo el universo del banco (6 macroactividades), nunca filtrado.
- Cada ranking: exactamente los 12 bancos del catálogo (saldo `0.00` si no tiene), orden saldo desc,
  desempate `Codigo_Banco` asc. Un banco no catalogado no entra al ranking: queda como alerta y en R3.

### 4. Comparación entre períodos (sección 8)
- `Cambio_Posicion = Pos_anterior − Pos_actual`; `Var_Saldo`; `Var_Saldo_Pct = Var_Saldo / Saldo_anterior × 100`.
- Regla de movimiento significativo configurable (no fija). Explicación determinista con la subactividad de
  mayor variación; montos formateados sin pasar por `Number` (precisión exacta).

### 5. Restricciones, seguridad y exportaciones (secciones 9, 10, 11.2)
- R2: sin saldos, porcentajes ni posiciones fijados a mano. R3: clasificación solo por catálogos.
  R5: sin contraseñas, tokens ni llaves en el repositorio (las pruebas generan credenciales aleatorias).
- Revisa `uploadPeriod`, `deletePeriod`, `updateParams`, `updateCatalog`, `recalculate`: archivos con varias
  fechas, reemplazo y retiro (historial en `data/historial/`), bitácora, permisos 400/401/403 por perfil
  (incluidos perfiles inválidos como `constructor`), encabezados exactos de CSV, CRLF, sin BOM por defecto
  y ceros a la izquierda en las exportaciones.

## Entrega
- Lista de **todos** los hallazgos con archivo, explicación y evidencia (cómo se reprodujo).
- Detalle de cada corrección y de cada prueba agregada.
- Comandos ejecutados y su resultado (`npm test`, `npm run calc`, comparación de salidas).
- Agrega una entrada en `CHANGELOG.md` siguiendo la plantilla del archivo.
