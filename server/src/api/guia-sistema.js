/**
 * Guía de uso de la plataforma para el asistente. Cada sección indica el perfil mínimo que puede hacerla,
 * las palabras clave para encontrarla y los pasos. El asistente solo ofrece las secciones del perfil del usuario.
 */
export const NIVEL = { publico: 1, analista: 2, administrador: 3 };

export const GUIA = [
  {
    id: 'ingresar', titulo: 'Ingresar y cambiar de perfil', perfil: 'publico', pantalla: null,
    claves: ['ingresar', 'login', 'perfil', 'contraseña', 'usuario', 'sesión', 'cerrar sesión', 'entrar'],
    pasos: [
      'En la pantalla de inicio elija "Público" para entrar sin contraseña.',
      'Si es personal de la Superintendencia elija "Personal de la Superintendencia", seleccione Analista o Administrador e ingrese su usuario y contraseña.',
      'Para cambiar de perfil use "Cerrar sesión" (arriba a la derecha) y vuelva a ingresar.',
    ],
  },
  {
    id: 'periodo', titulo: 'Cambiar el período (fecha de corte)', perfil: 'publico', pantalla: null,
    claves: ['período', 'periodo', 'fecha', 'corte', 'mes', 'calendario', 'cambiar mes'],
    pasos: [
      'Use el selector de período en la barra superior: las flechas ‹ › pasan al corte anterior o siguiente.',
      'Al abrirlo verá los meses del año; solo se pueden elegir los meses con datos cargados.',
      'Todas las pantallas se actualizan con el período elegido.',
    ],
  },
  {
    id: 'panel', titulo: 'Panel principal', perfil: 'publico', pantalla: 'panel',
    claves: ['panel', 'resumen', 'inicio', 'kpi', 'cartera del sistema', 'datos verificados'],
    pasos: [
      'Muestra la cartera local válida, la variación frente al corte anterior, las operaciones válidas y la morosidad del sistema.',
      'Haga clic en la tarjeta de un banco o en su barra de "Cartera local por banco" para abrir su ficha por pasos.',
      '"Datos verificados" indica que los totales cuadran; haga clic para ver el detalle en Calidad de datos.',
    ],
  },
  {
    id: 'rankings', titulo: 'Consultar un ranking', perfil: 'publico', pantalla: 'rankings',
    claves: ['ranking', 'posición', 'puesto', 'líder', 'primer lugar', 'hipotecario', 'construcción', 'industria', 'agropecuario', 'comercio', 'consumo', 'ponderación'],
    pasos: [
      'Abra "Rankings" en el menú lateral.',
      'Elija la categoría (Hipotecario, Construcción, Industria, Agropecuario, Comercio o Consumo).',
      'Haga clic en una barra o en una fila para ver el desglose por subactividad de ese banco.',
      'El total de la actividad aparece debajo del desglose. Puede descargar el ranking en CSV.',
    ],
  },
  {
    id: 'bancos', titulo: 'Ver la ficha de un banco', perfil: 'publico', pantalla: 'bancos',
    claves: ['banco', 'ficha', 'estado de cuenta', 'morosidad', 'vencimientos', 'evolución del banco'],
    pasos: [
      'Abra "Bancos" en el menú lateral; puede buscar por nombre o código y ordenar.',
      'Haga clic en la tarjeta de un banco para abrir su ficha.',
      'Recorra los pasos: Resumen, Posición en rankings, Subactividades, Calidad de cartera y Evolución.',
    ],
  },
  {
    id: 'filtros', titulo: 'Filtrar y graficar subactividades', perfil: 'publico', pantalla: 'explorar',
    claves: ['filtro', 'filtrar', 'subactividad', 'gráfico', 'dona', 'apiladas', 'top', 'rango de saldo'],
    pasos: [
      'Abra "Filtros y subactividades".',
      'Elija cortes, actividades, subactividades y bancos (puede combinar varios).',
      'Ajuste saldo mínimo o máximo y el top de bancos si lo necesita.',
      'Elija cómo agrupar (eje) y dividir (color), y el tipo de gráfico: barras apiladas, participación 100%, dona o evolución.',
    ],
  },
  {
    id: 'calidad', titulo: 'Revisar la calidad de los datos', perfil: 'publico', pantalla: 'calidad',
    claves: ['calidad', 'excluidas', 'e1', 'e2', 'e3', 'e4', 'duplicados', 'extranjero', 'cascada', 'reconciliación', 'universo'],
    pasos: [
      'Abra "Calidad de datos".',
      'Verá las exclusiones en cascada: E1 duplicados, E2 destino extranjero, E3 saldo no positivo y E4 actividad no catalogada, y el universo local válido.',
      'Las reconciliaciones confirman que los saldos cuadran al centavo.',
    ],
  },
  {
    id: 'reportes', titulo: 'Descargar reportes', perfil: 'publico', pantalla: 'reportes',
    claves: ['reporte', 'descargar', 'csv', 'pdf', 'imprimir', 'exportar'],
    pasos: [
      'Abra "Reportes y descargas".',
      'Elija el reporte, los períodos y filtros; revise la vista previa.',
      'Descargue en CSV o imprima / guarde como PDF.',
    ],
  },
  {
    id: 'comparar', titulo: 'Comparar bancos y períodos', perfil: 'analista', pantalla: 'comparar',
    claves: ['comparar', 'comparación', 'movimientos', 'sube', 'baja', 'variación', 'evolución', 'mapa de calor', 'significativo'],
    pasos: [
      'Abra "Comparar períodos" (perfil Analista).',
      'Marque las fechas de corte, hasta 5 bancos y las actividades.',
      'Elija la medida (saldo, participación, ponderación o posición) y el tipo de gráfico (evolución, barras, variación, mapa de calor o tabla).',
      'En "Movimientos de posición" filtre por par de cortes, tendencia, variación mínima o solo significativos; abajo están los principales movimientos explicados.',
      'Descargue la comparación en CSV o imprímala.',
    ],
  },
  {
    id: 'cargar', titulo: 'Cargar o actualizar un período', perfil: 'administrador', pantalla: 'admin',
    claves: ['cargar', 'subir', 'importar', 'archivo', 'at03', 'cargar período', 'subir archivo', 'nuevo período', 'actualizar período', 'diagnóstico'],
    pasos: [
      'Ingrese como Administrador y abra "Administración".',
      'En "Cargar o actualizar un período" arrastre el archivo AT03 (CSV separado por comas, UTF-8).',
      'Revise el diagnóstico: los errores bloqueantes impiden importar; las observaciones indican filas que se excluirán o datos fuera de formato, con línea y sugerencia.',
      'Si el período ya existe se reemplaza y el archivo anterior queda en el historial. Confirme para importar: los rankings se recalculan solos.',
    ],
  },
  {
    id: 'retirar', titulo: 'Retirar un período', perfil: 'administrador', pantalla: 'admin',
    claves: ['retirar', 'eliminar período', 'borrar período', 'quitar mes'],
    pasos: [
      'En "Administración" busque el período en la lista de períodos cargados.',
      'Use "Retirar" y confirme. El archivo pasa al historial y los rankings se recalculan.',
    ],
  },
  {
    id: 'parametros', titulo: 'Cambiar la regla de movimiento significativo', perfil: 'administrador', pantalla: 'admin',
    claves: ['parámetro', 'regla', 'umbral', 'movimiento significativo', 'configurar'],
    pasos: [
      'En "Administración" abra "Regla de movimiento significativo".',
      'Ajuste el cambio mínimo de posición, el umbral de variación de saldo y si se señala el cambio de líder.',
      'Guarde: las comparaciones se recalculan con la nueva regla.',
    ],
  },
  {
    id: 'permisos', titulo: 'Administrar permisos, catálogos y bitácora', perfil: 'administrador', pantalla: 'admin',
    claves: ['permiso', 'catálogo', 'bitácora', 'registro de operaciones', 'roles'],
    pasos: [
      'En "Administración" use "Perfiles y permisos" para activar o quitar funciones a Público y Analista.',
      'En "Catálogos" puede consultar o reemplazar un catálogo validado (se guarda copia del anterior).',
      'La "Bitácora" muestra qué se cargó, cuándo y con qué perfil.',
    ],
  },
];

/** Secciones visibles para un perfil (nunca ofrece pasos de un perfil superior). */
export const guiaPara = (perfil) => GUIA.filter((g) => (NIVEL[perfil] || 1) >= NIVEL[g.perfil]);

const normal = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Busca la sección más relacionada con la pregunta (modo guía sin IA). */
export function buscarGuia(pregunta, perfil, pantalla) {
  // Compara por raíz de palabra (4 letras): "cargo" coincide con "cargar", "periodos" con "período"
  const tokens = normal(pregunta).split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  const raiz = (w) => w.slice(0, Math.min(4, w.length));
  const coincide = (palabra) => tokens.some((t) => raiz(t) === raiz(palabra) || t === palabra);
  // Claves sin repetir tras quitar tildes ("período" y "periodo" cuentan una vez)
  const puntaje = (g) => [...new Set(g.claves.map(normal))].reduce((a, c) => {
    const ws = c.split(/\s+/).filter(Boolean);
    return a + (ws.every(coincide) ? ws.length * 2 : 0);
  }, 0) + (g.pantalla && g.pantalla === pantalla ? 1 : 0);
  // Hace falta al menos una palabra clave; la pantalla actual solo desempata
  const todas = GUIA.map((g) => ({ g, p: puntaje(g) })).filter((x) => x.p >= 2).sort((a, b) => b.p - a.p);
  const mejor = todas[0]?.g;
  if (mejor && (NIVEL[perfil] || 1) < NIVEL[mejor.perfil]) return { seccion: mejor, permitida: false };
  return mejor ? { seccion: mejor, permitida: true } : null;
}
