/**
 * Genera data/ejemplos/AT03_ejemplo_con_errores.csv: 200 filas tomadas del período más reciente con errores
 * típicos inyectados, para demostrar el diagnóstico de carga (Administración → Cargar un período).
 * Uso: npm run ejemplo:errores
 *
 * Los errores son de formato y coherencia (advertencias) más casos que afectan el cálculo. No hay errores
 * bloqueantes, así que el archivo se puede importar; para ver un rechazo, cambie un Saldo a "12.345".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const periodos = path.join(root, 'data/periodos');
const salida = path.join(root, 'data/ejemplos');
const fuente = fs.readdirSync(periodos).filter((f) => f.toLowerCase().endsWith('.csv')).sort().at(-1);
if (!fuente) { console.error('No hay archivos en data/periodos.'); process.exit(1); }

const lineas = fs.readFileSync(path.join(periodos, fuente), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).slice(0, 201);
const header = lineas[0].split(',');
const filas = lineas.slice(1).map((l) => l.split(','));
const col = (c) => header.indexOf(c);
const set = (i, c, v) => { filas[i][col(c)] = v; };

// Mismo período, pero con otra fecha de corte para no reemplazar uno real al probar
const FECHA = '20261031';
for (const f of filas) f[col('Fecha')] = FECHA;

set(0, 'Facilidad_Crediticia', '7'); // cero a la izquierda perdido (Excel)
set(1, 'Tipo_Credito', '1'); // "001" -> "1"
set(2, 'Codigo_Region', ''); // celda vacía
set(3, 'Destino', 'l'); // minúscula: E2
set(4, 'Destino', ' L'); // con espacio: E2
set(5, 'Tipo_Actividad', ` ${filas[5][col('Tipo_Actividad')]}`); // CINU con espacio: E4
set(6, 'Fecha_Vencimiento', '20200101'); // vence antes del corte
set(7, 'Valor_Inicial', '1.00'); // menor que el saldo
set(8, 'Codigo_Banco', '199'); // banco no catalogado
set(9, 'Tasa_Interes', 'cinco'); // tipo inválido
set(10, 'Saldo', '0.00'); // E3
set(11, 'Numero_Prestamo', filas[12][col('Numero_Prestamo')]); // duplicado: la línea 14 cae en E1
set(13, 'Perfil_Vencimiento', '02'); // con Dias_Mora 0
set(14, 'Tamano_Empresa', '06'); set(14, 'Genero', 'NA'); // persona natural sin género
set(15, 'Codigo_Subsidiaria', '001'); // debería ser NA

fs.mkdirSync(salida, { recursive: true });
const destino = path.join(salida, 'AT03_ejemplo_con_errores.csv');
fs.writeFileSync(destino, [header, ...filas].map((r) => r.join(',')).join('\r\n') + '\r\n', 'utf8');
console.log(`Creado ${path.relative(root, destino)} (200 filas, Fecha ${FECHA}) a partir de ${fuente}.`);
