import { useEffect } from 'react';

/**
 * Lo que el usuario tiene seleccionado en la pantalla actual (ranking, bancos, fechas…), para que el
 * asistente responda sobre "lo que estoy viendo". Cada página publica su selección con usePublicarSeleccion.
 */
let seleccion = {};
export const getSeleccion = () => seleccion;

export function usePublicarSeleccion(obj) {
  const clave = JSON.stringify(obj);
  useEffect(() => {
    seleccion = JSON.parse(clave);
    return () => { seleccion = {}; };
  }, [clave]);
}
