/** Asistente: contexto de pantalla y guía por perfil (sin llamar al servicio de IA). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from '../src/store/store.js';
import { construirContexto, respuestaGuia } from '../src/api/asistente.js';
import { GUIA, guiaPara, buscarGuia } from '../src/api/guia-sistema.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const store = new Store(path.join(root, 'data'));

test('contexto: incluye pantalla, perfil, selección saneada y resumen de bancos ya calculado', () => {
  const c = construirContexto(store, {
    fecha: '20260930', pantalla: 'rankings', perfil: 'analista',
    seleccion: { ranking: 'HIPOTECARIO', banco: 'Banco Solidez', largo: 'x'.repeat(500), objeto: { a: 1 }, lista: ['101', '102'] },
  });
  assert.equal(c.periodo, '20260930');
  assert.equal(c.periodo_anterior, '20260831');
  assert.equal(c.pantalla, 'rankings');
  assert.equal(c.seleccion.ranking, 'HIPOTECARIO');
  assert.equal(c.seleccion.largo.length, 120); // recortado
  assert.equal(c.seleccion.objeto, undefined); // objetos no se envían
  assert.deepEqual(c.seleccion.lista, ['101', '102']);
  assert.equal(c.bancos_resumen.length, 12);
  assert.equal(c.rankings.HIPOTECARIO[0].Pos, 1);
});

test('guía: cada perfil solo ve sus funciones; las preguntas se resuelven por raíz de palabra', () => {
  assert.ok(guiaPara('publico').every((g) => g.perfil === 'publico'));
  assert.ok(guiaPara('analista').some((g) => g.id === 'comparar'));
  assert.ok(!guiaPara('analista').some((g) => g.perfil === 'administrador'));
  assert.equal(guiaPara('administrador').length, GUIA.length);
  assert.equal(buscarGuia('¿cómo cargo un período?', 'administrador').seccion.id, 'cargar');
  assert.equal(buscarGuia('quiero comparar bancos', 'analista').seccion.id, 'comparar');
  assert.equal(buscarGuia('quiero comparar bancos', 'publico').permitida, false);
  assert.equal(buscarGuia('hola', 'publico', 'panel'), null);
  assert.match(respuestaGuia('ficha de un banco', 'publico'), /1\. Abra "Bancos"/);
});
