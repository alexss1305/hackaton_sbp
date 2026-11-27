# Rankings de Crédito por Actividad Económica · Hackathon SBP 2026

Plataforma web **local** que transforma los registros sintéticos AT03 en rankings de crédito por banco y
macroactividad, con reporte de calidad, desglose por subactividad, comparación entre períodos, tres perfiles de
usuario y exportaciones. **Todos los datos son ficticios.**

## Requisitos
- Node.js 20 o superior (probado con 22.23) y npm. No requiere base de datos, XAMPP ni conexión a Internet en ejecución.

## Instalación y ejecución
```bash
npm run setup      # instala dependencias y crea .env con contraseñas aleatorias (se muestran en consola)
npm run build      # compila el frontend React
npm start          # abre http://127.0.0.1:3001
```
Modo desarrollo (recarga en caliente): `npm run dev` → http://localhost:5173 (la API corre en el puerto 3001).

Otros comandos:
| Comando | Qué hace |
|---|---|
| `npm test` | Pruebas del motor de cálculo y de la API (node:test) |
| `npm run calc` | Procesa `data/periodos/*.csv` por línea de comandos y escribe los entregables en `output/` |

### Perfiles
| Perfil | Acceso | Opciones |
|---|---|---|
| Público | sin contraseña | Panel, rankings, filtros y subactividades, calidad de datos, descargas (rankings, subactividades, calidad) |
| Analista | `ANALISTA_PASSWORD` en `.env` | + comparar períodos y entidades, movimientos con explicación, reportes personalizados, filas excluidas y alertas |
| Administrador | `ADMIN_PASSWORD` en `.env` | + cargar/actualizar/retirar períodos, parámetros de movimiento significativo, catálogos, bitácora de operaciones |

El control se aplica **en el servidor** (middleware por perfil); el frontend solo oculta lo que el perfil no puede usar.
`.env` no se versiona (`.gitignore`); si no existe, el servidor genera contraseñas temporales y las muestra en consola.

## Arquitectura
```
client/  React + Vite + Recharts      → 5 módulos: panel, rankings, filtros, visualización/comparación, reportes
server/  Node.js + Express
  src/engine/   motor de cálculo puro, sin HTTP (determinista y probado)
    csv.js        lector CSV que conserva todo como texto (07, 001, 010 no pierden ceros)
    money.js      aritmética exacta en centavos (BigInt) y redondeo half-up
    validate.js   esquema de 61 columnas vs diccionario, formato de Fecha/Saldo, integridad referencial
    cascade.js    exclusiones en cascada E1–E4
    classify.js   clasificación por catálogo CINU + regla SB21 de CONSUMO
    aggregate.js  subactividad → actividad → cartera total, ponderación, posición, reconciliaciones, indicadores
    compare.js    movimientos entre períodos, regla configurable y explicación automática
    pipeline.js   orquestación por período; exports.js genera los CSV oficiales
  src/store/    persistencia en disco (data/), recálculo completo ante cada cambio, bitácora
  src/api/      rutas REST y control de acceso por perfil
data/catalogos  Bancos, CINU/SB109, SB21, diccionario AT03
data/periodos   archivos AT03 activos (uno por período); data/historial guarda los reemplazados
```
No se usa base de datos: ~83 000 filas se procesan en memoria en pocos segundos, y los resultados se
recalculan siempre desde los archivos fuente, por lo que son reproducibles.

## Reglas implementadas (INDICACIONES_RETO_RANKING_CREDITO.md)
1. **Ingesta:** los CSV se leen como texto; solo `Saldo` se convierte a centavos enteros. El período sale del campo `Fecha`, no del nombre del archivo. Un archivo con columnas distintas al diccionario (nombre u orden), filas con número de campos incorrecto, `Fecha` no AAAAMMDD o `Saldo` no numérico se **rechaza** con un mensaje que indica la línea.
2. **Integridad referencial:** `Codigo_Banco` y `Facilidad_Crediticia` no catalogados generan **alertas** (no excluyen).
3. **Cascada por período** (cada fila cuenta solo en el primer filtro que incumple): E1 duplicado de `Numero_Prestamo` (se conserva la primera ocurrencia del archivo) → E2 `Destino <> 'L'` (exacto) → E3 `Saldo <= 0` → E4 `Tipo_Actividad` fuera del catálogo CINU. Se verifica `leídas = E1+E2+E3+E4+universo`. El conteo independiente por regla se muestra aparte.
4. **Clasificación:** `Tipo_Actividad = Codigo_CINU` (nunca `Codigo_SB08_Referencia`). **CONSUMO/SB21:** CINU de crédito personal con facilidad `07` → `Tarjeta`. CINU de tarjeta sin `07` o de automóvil sin `03` → alerta, se mantiene la subactividad del catálogo.
5. **Agregación exacta:** saldo por subactividad → por actividad; `Total_Cartera_Local_Valida` sobre **todo** el universo del banco (6 macroactividades); `Ponderacion_Pct` redondeada a 4 decimales con redondeo aritmético calculado en enteros.
6. **Ranking:** 12 bancos siempre (saldo 0.00 si no tiene), orden por saldo descendente, desempate por `Codigo_Banco` ascendente.
7. **Reconciliaciones** R1, R2 y R3 calculadas por período y visibles en *Calidad de datos*.
8. **Comparación:** `Cambio_Posicion = Pos_anterior − Pos_actual`, `Var_Saldo`, `Var_Saldo_Pct`; consecutivos y primero→último, más cualquier par en la pantalla *Comparar*.

### Movimiento significativo (configurable)
Un movimiento es significativo si cumple **cualquiera** de las condiciones activas. Valores por defecto
(se cambian en *Administración → Regla de movimiento significativo*, se guardan en `data/params.json`):
- `|Cambio_Posicion| >= 2`
- cambio de líder (banco que entra o sale de la posición 1)
- `|Var_Saldo_Pct| >= 25 %` (0 desactiva la condición)

Para cada movimiento significativo se genera una **explicación automática por reglas** (sin IA) que identifica la
subactividad con mayor variación de saldo.

## Entregables y dónde encontrarlos
| # | Entregable | En la app | Archivo (`npm run calc`) |
|---|---|---|---|
| 2 | Rankings por período | Rankings / Reportes | `output/rankings.csv` |
| 3 | Desglose por subactividad | Filtros y subactividades / Reportes | `output/subactividades.csv` |
| 4 | Reporte de calidad E1–E4 | Calidad de datos / Reportes | `output/calidad.csv` (+ `filas_excluidas.csv`, `alertas.csv`) |
| 5 | Movimientos de posición | Comparar períodos / Reportes | `output/movimientos.csv` |
| 7 | Nuevo período sin editar código | Administración → cargar archivo | prueba `server/test/api.test.js` |

**Demostración del entregable 7:** en Administración, retire septiembre (queda en `data/historial/`), y vuelva a
cargar `AT03_sintetico_202609.csv`: la app valida el archivo, muestra una vista previa, recalcula y lista los
movimientos significativos frente a agosto.

## Pruebas y verificación
- `npm test`: 14 pruebas — ceros a la izquierda, centavos exactos y redondeo, cascada (incluido el caso de filas que incumplen varias reglas), primera ocurrencia en E1, reclasificación SB21 sin alterar el total de CONSUMO, 12 bancos y desempate, denominador común, rechazo de archivos inválidos, comparación y regla configurable, datos reales cuadrados, y la API de punta a punta (permisos por perfil, carga de septiembre, actualización de un período existente, cambio de parámetros).
- Contraste independiente: los rankings y subactividades de los 3 períodos se recalcularon con un script Python con `decimal` y coincidieron en las 216 filas de ranking y 792 de subactividad (0 diferencias).

### Resultados de calidad obtenidos
| Fecha | Leídas | E1 | E2 | E3 | E4 | Universo válido | Saldo universo |
|---|---|---|---|---|---|---|---|
| 20260731 | 25 000 | 20 | 886 | 48 | 42 | 24 004 | 4 342 391 663.85 |
| 20260831 | 27 500 | 25 | 967 | 52 | 46 | 26 410 | 4 733 510 382.80 |
| 20260930 | 30 000 | 30 | 1 058 | 58 | 52 | 28 802 | 5 152 103 850.27 |

## Restricciones respetadas
- Sin saldos, porcentajes ni posiciones fijados en el código (R2): todo sale de los archivos.
- Clasificación solo con catálogos (R3); nunca con nombres ni datos del cliente.
- Sin contraseñas, tokens ni llaves en el repositorio (R5).
