# Matriz de cumplimiento — INDICACIONES_RETO_RANKING_CREDITO.md

Cada requisito del documento del reto (que prevalece sobre la presentación) con dónde está implementado, cómo se
prueba y qué mostrar al jurado. Rutas relativas a la raíz del repositorio.

## 2.1 Formato técnico de los CSV
| Requisito | Implementación | Prueba / evidencia |
|---|---|---|
| UTF-8, coma, CRLF, encabezado; BOM tolerado | `server/src/engine/csv.js` (`parseCsv`) | `engine.test.js` › "CSV conserva ceros…" |
| Códigos como texto, ceros a la izquierda (`07`, `001`, `010`) | Todo se lee como texto; solo `Saldo` se convierte | idem; `output/rankings.csv` |
| `NA` = no aplica | `validate.js` › `typeAlerts` admite `NA` donde el diccionario lo permite | `engine.test.js` › "tipos de datos…" |
| Comparaciones exactas (`Destino` = `L`) | `cascade.js` (`r.Destino !== 'L'`) | `engine.test.js` › cascada (`'l'` minúscula se excluye) |

## 4.A Ingesta y validación
| Requisito | Implementación | Prueba / evidencia |
|---|---|---|
| 61 columnas con nombres y orden del diccionario | `validate.js` › `validateAt03` (usa `Diccionario_datos_AT03_reto.csv`) | `engine.test.js`, `api.test.js` › archivo inválido → 400 con mensaje |
| Tipos de datos y campos mínimos | `validate.js` › `typeAlerts` (columna `Tipo` del diccionario). Fecha/Saldo inválidos rechazan el archivo; el resto genera **alertas** (no excluye) | `engine.test.js` › "tipos de datos…" |
| Integridad referencial banco/facilidad = alerta, no exclusión | `validate.js` › `referentialAlerts` | Pantalla *Calidad de datos* › Alertas |
| Período desde `Fecha`, no del nombre | `pipeline.js` › `readAt03` agrupa por `Fecha` | Admin › carga de archivo (vista previa muestra la Fecha) |

## 4.B Exclusiones en cascada
| Requisito | Implementación | Prueba / evidencia |
|---|---|---|
| E1 duplicados (primera ocurrencia) → E2 `Destino<>'L'` → E3 `Saldo<=0` → E4 CINU no catalogado | `cascade.js` › `applyCascade` | `engine.test.js` › cascada y "E1 conserva la PRIMERA…" |
| Cada fila cuenta una sola vez | idem (`FILTERS.find`) | idem |
| `leídas = E1+E2+E3+E4+universo` | `pipeline.js` › `Cuadre_Cascada` | *Calidad de datos* (insignia "Cuadra"); `output/calidad.csv` |
| Conteo independiente rotulado aparte | `Indep_E1..E4` en `calidad.csv` y texto en *Calidad de datos* | `engine.test.js` › cascada |

## 4.C Clasificación y agregación
| Requisito | Implementación | Prueba / evidencia |
|---|---|---|
| Llave `Tipo_Actividad = Codigo_CINU` (no SB08) | `classify.js` | — |
| Agrupación subactividad → actividad | `aggregate.js` | `engine.test.js` › ranking |
| Denominador sobre todo el universo del banco | `aggregate.js` (`total[banco]` antes de cualquier filtro) | `engine.test.js` › "denominador sobre todo el universo" y "datos reales" |
| Ponderación a 4 decimales, redondeo aritmético | `money.js` › `pct` (enteros, half-up) | `engine.test.js` › montos y redondeo |
| Orden por saldo, desempate por código, 12 bancos siempre | `aggregate.js` | `engine.test.js` › "12 bancos siempre, desempate…" |
| Aritmética exacta | `money.js` (centavos BigInt) | Contraste independiente Python `decimal`: 0 diferencias |

## 5 y 6. Rankings y regla CONSUMO/SB21
| Requisito | Implementación | Prueba / evidencia |
|---|---|---|
| HIPOTECARIO, CONSTRUCCION, INDUSTRIA, AGROPECUARIO, COMERCIO, CONSUMO | Nombres del catálogo (`catalogs.js`) | *Rankings* |
| Crédito personal + facilidad `07` → Tarjeta | `classify.js` | `engine.test.js` › "regla SB21…" |
| Total de CONSUMO no cambia | idem | idem |
| Tarjeta sin `07` / Automóvil sin `03` → alerta, se conserva la subactividad | `classify.js` | idem |

## 7. Controles mínimos
| Requisito | Implementación | Dónde verlo |
|---|---|---|
| Unicidad de `Numero_Prestamo` en el universo | `pipeline.js` › `Prestamos_Unicos_En_Universo` | *Calidad de datos* |
| Exclusión auditable (lista con motivo) | `cascade.js` › `excluded`; `export/excluidas.csv` | *Calidad de datos* › Filas excluidas |
| Reconciliaciones R1, R2, R3 | `aggregate.js` › `reconciliaciones` | *Calidad de datos*; *Reportes* › sección calidad |
| Señalar cambios de posición al cargar un corte | `store.js` › `uploadPeriod` devuelve movimientos significativos | *Administración* › resultado de la carga |

## 8. Comparación entre períodos
| Requisito | Implementación | Dónde verlo |
|---|---|---|
| Consecutivos y primero→último | `pipeline.js` › `buildComparisons` | `output/movimientos.csv` |
| `Cambio_Posicion = anterior − actual`, `Var_Saldo`, `Var_Saldo_Pct` | `compare.js` (`Var_Saldo_Pct` vacío si el saldo anterior es 0) | `engine.test.js` › comparación |
| Regla de movimiento significativo configurable | `compare.js` › `DEFAULT_PARAMS`; *Administración* › Regla | `api.test.js` › "cambia la regla…" |

## 9. Restricciones
| Requisito | Cómo se cumple |
|---|---|
| No usar datos del cliente para clasificar | `classify.js` solo usa `Tipo_Actividad` y `Facilidad_Crediticia` |
| No codificar resultados | Todo se calcula desde `data/` (ver `npm run calc`) |
| IA no sustituye el cálculo | `server/src/api/asistente.js`: recibe resultados ya calculados y se le prohíbe recalcular |

## 10. Entregables
| # | Entregable | Dónde |
|---|---|---|
| 1 | Prototipo local documentado | `npm run setup && npm run build && npm start` |
| 2 | Rankings exportables | *Rankings*, *Reportes*, `output/rankings.csv` |
| 3 | Desglose por subactividad | *Filtros y subactividades*, `output/subactividades.csv` |
| 4 | Reporte de calidad E1–E4 | *Calidad de datos*, `output/calidad.csv` |
| 5 | Movimientos de posición | *Comparar períodos*, `output/movimientos.csv` |
| 6 | README | `README.md` |
| 7 | Nuevo período sin tocar código | `npm run demo:preparar` → cargar en *Administración*; `api.test.js` › "carga septiembre" |
| 8 | Tres perfiles con opciones distintas | Inicio de sesión; permisos editables en *Administración* › Perfiles y permisos; `api.test.js` |

## 11.2 Requisitos mínimos
| Req. | Cómo se cumple |
|---|---|
| R1 Ejecución local | Node.js + React; sin servicios externos (la IA es opcional) |
| R2 Cálculo desde archivos | Motor en `server/src/engine`; 0 cifras fijas |
| R3 Solo catálogos | `classify.js` |
| R4 Código + README | `README.md`, este documento |
| R5 Sin secretos | `.env` ignorado; `npm run setup` genera contraseñas; las pruebas usan contraseñas aleatorias |
| R6 Explicación del equipo | Este documento sirve de guion por módulo |

## 12. Autoverificación
Todos los puntos de la lista se cubren con `npm test` (18 pruebas) y la pantalla *Calidad de datos*.
