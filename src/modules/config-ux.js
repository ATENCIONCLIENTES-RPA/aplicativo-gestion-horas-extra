/* =====================================================================================================================
   Centro de configuración · capa de experiencia (solo presentación)
   · Iconos propios (no dependen de ninguna librería externa).
   · Tooltips explicativos con posicionamiento inteligente (escritorio: globo con flecha · móvil: hoja inferior).
   · Mejora progresiva de lo que ya dibuja la aplicación: tarjetas plegables, interruptores, fichas de días, unidades en
     campos numéricos y botones de ayuda junto a cada parámetro. No cambia valores, eventos, nombres ni peticiones.
   ===================================================================================================================== */
(function(){
'use strict';
if(window.CfgUX)return;

/* ───────── Iconos (trazos de 24×24) ───────── */
const ICON={
  sliders:'<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  building:'<path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2M10 6h4M10 10h4M10 14h4M10 18h4"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  moon:'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  list:'<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  calendar:'<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  coin:'<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8M12 18V6"/>',
  percent:'<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  briefcase:'<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  shield:'<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.6 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  history:'<path d="M3 12a9 9 0 1 0 9-9 9.8 9.8 0 0 0-6.7 2.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
  help:'<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  alert:'<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>',
  bulb:'<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/>',
  toggle:'<rect width="20" height="12" x="2" y="6" rx="6"/><circle cx="16" cy="12" r="2"/>',
  utensils:'<path d="M3 2v7a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6a2 2 0 0 0 2 2h3Zm0 0v7"/>',
  clip:'<path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l8.6-8.6a4 4 0 1 1 5.6 5.7l-8.6 8.5a2 2 0 0 1-2.8-2.8l8.5-8.5"/>',
  pen:'<path d="M12 20h9"/><path d="M16.4 3.6a1 1 0 0 1 3 3L7.4 18.6a2 2 0 0 1-.9.5l-2.9.8a.5.5 0 0 1-.6-.6l.8-2.9a2 2 0 0 1 .5-.9z"/>',
  userCheck:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m16 11 2 2 4-4"/>',
  calc:'<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M8 6h8M16 14v4M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01"/>',
  trend:'<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  db:'<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5M3 12a9 3 0 0 0 18 0"/>',
  layers:'<path d="m12.8 2.2a2 2 0 0 0-1.6 0L2.6 6.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0l8.6-3.9a1 1 0 0 0 0-1.8Z"/><path d="m22 17.7-9.2 4.1a2 2 0 0 1-1.6 0L2 17.7M22 12.7l-9.2 4.1a2 2 0 0 1-1.6 0L2 12.7"/>',
  ruler:'<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
  target:'<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  pulse:'<path d="M22 12h-2.5a2 2 0 0 0-1.9 1.5l-2.4 8.4a.25.25 0 0 1-.5 0L9.2 2.2a.25.25 0 0 0-.5 0L6.4 10.5A2 2 0 0 1 4.5 12H2"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  minus:'<path d="M5 12h14"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  chev:'<path d="m6 9 6 6 6-6"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  file:'<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  key:'<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  lock:'<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  wallet:'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>'
};
const svg=(n,c)=>`<svg class="cfg-svg${c?' '+c:''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON[n]||ICON.info}</svg>`;

/* ───────── Categorías de color de los tooltips ───────── */
const CAT={
  org:{n:'Estructura',a:'#0EA5A4',b:'#2563EB'},   jor:{n:'Jornada y turnos',a:'#6366F1',b:'#0EA5E9'},
  pay:{n:'Salarios y horas extras',a:'#F59E0B',b:'#DC2626'}, aux:{n:'Auxilios de alimentación',a:'#F97316',b:'#DB2777'},
  uni:{n:'Sindicatos',a:'#8B5CF6',b:'#DB2777'},   sys:{n:'Reglas del sistema',a:'#2563EB',b:'#7C3AED'},
  fin:{n:'Finanzas',a:'#10B981',b:'#0891B2'},     sec:{n:'Seguridad y soportes',a:'#475569',b:'#1E293B'}
};
const P=(cat,icon,title,o)=>Object.assign({cat,icon,title},o);

/* ───────── Explicaciones (lenguaje sencillo, sin tecnicismos) ───────── */
const TIPS={
/* Apartados */
'panel.departments':P('org','building','Dependencias',{w:'Es la lista de áreas o dependencias de la empresa, por ejemplo «Atención al Cliente».',u:'Cada funcionario y cada solicitud de horas extras pertenece a una dependencia. También se usa para filtrar reportes y análisis.',c:'Si una dependencia ya no se usa, desactívala en lugar de eliminarla: así conserva todo su historial.'}),
'panel.worktypes':P('jor','sun','Tipos de jornada',{w:'Es la clasificación general del horario en el que se trabajan las horas extras.',u:'Quien crea una solicitud elige uno de los tipos que estén activos.',e:'Si no queda ningún tipo activo, nadie podrá crear solicitudes.',c:'Mantén siempre al menos un tipo de jornada activo.'}),
'panel.activities':P('org','list','Catálogo de actividades',{w:'Son las actividades que el funcionario puede marcar como motivo de sus horas extras.',u:'Se eligen al crear la solicitud y sirven para filtrar los reportes.',e:'Solo las actividades marcadas como «operativas» se pueden seleccionar en las solicitudes. Las nuevas quedan disponibles para todos los funcionarios.'}),
'panel.shifts':P('jor','clock','Turnos laborales',{w:'Cada turno define los días y las horas habituales de trabajo, y si incluye hora de almuerzo.',u:'Con el turno asignado a cada funcionario, el sistema decide si sus horas extras dan derecho a auxilio de desayuno, almuerzo o comida.',e:'Al guardar un cambio se recalculan los auxilios de las solicitudes que todavía están en trámite.',c:'Revisa bien los horarios: un error cambia quién recibe auxilios.'}),
'panel.unions':P('uni','users','Sindicatos y auxilios',{w:'Aquí defines, para cada sindicato, el valor del auxilio de alimentación y, si hace falta, reglas de cálculo propias.',u:'El valor del auxilio rige desde la fecha que indiques; el anterior queda en el historial.',e:'Las reglas específicas son opcionales: si hay una vigente en la fecha de ejecución, reemplazan el divisor y los factores de la regla laboral general.',c:'Si a una regla le falta un parámetro, la solicitud queda pendiente y no se suma al total.'}),
'panel.payroll':P('pay','coin','Salarios y horas extras',{w:'Son las reglas laborales con las que el sistema calcula recargos y el costo de las horas extras: jornada, divisor, horario nocturno y porcentajes.',u:'Es la única fuente de esos cálculos. Cada regla tiene fecha de inicio y de fin (vigencia).',e:'Para cambiar un porcentaje, el divisor o el horario nocturno crea una nueva vigencia: los periodos anteriores y los costos ya registrados no se alteran.',c:'Antes de publicar una vigencia, confírmala con el área responsable.'}),
'panel.jobgrades':P('org','briefcase','Cargos y grados',{w:'Es el catálogo autorizado de combinaciones de cargo y grado.',u:'Solo estas combinaciones se pueden asignar a un funcionario (en Funcionarios → Editar).',e:'Desactivar una combinación la retira de las nuevas asignaciones; quienes ya la tienen la conservan.'}),
'panel.parameters':P('sys','sliders','Reglas y parámetros',{w:'Son los ajustes generales de funcionamiento: jefe inmediato y su firma, límites de las solicitudes, soportes, auxilios y flujo de aprobación.',u:'Definen cómo se comporta el aplicativo para todos los usuarios.',c:'Un cambio aquí se aplica a todas las solicitudes nuevas. Revisa cada parámetro antes de guardar.'}),
'panel.audit':P('sec','history','Auditoría',{w:'Es el registro automático de quién hizo qué cambio y en qué momento.',u:'Sirve para revisar modificaciones, aclarar dudas y rendir cuentas.',c:'Es de solo lectura: no se puede editar ni borrar.'}),

/* Secciones */
'sec.manager':P('sys','userCheck','Jefe inmediato',{w:'Es el nombre del jefe inmediato que se imprime en el formato de horas extras.',u:'Todos los funcionarios generan su formato con este nombre.',c:'Solo los administradores pueden cambiarlo. Escríbelo completo y sin errores: sale tal cual en el documento.'}),
'sec.sig':P('sys','pen','Firma del jefe inmediato',{w:'Cada jefe puede tener su propia firma digital guardada.',u:'Se inserta automáticamente en el formato de horas extras de las solicitudes que ese jefe aprobó.',e:'Reemplazar o quitar una firma no cambia las solicitudes ya aprobadas: conservan la versión que tenían. La nueva solo aplica a aprobaciones posteriores.',c:'Si un jefe no tiene firma, sus aprobaciones no la incluyen y el espacio del formato queda libre.'}),
'sec.limits':P('sec','shield','Límites y controles',{w:'Reglas generales para crear y aprobar solicitudes.',u:'Ponen topes a las horas de cada solicitud y al tamaño de los soportes, y deciden si aprobar exige una observación.',c:'Se validan también en el servidor, así que nadie puede saltárselas.'}),
'sec.aux':P('aux','utensils','Auxilios de alimentación y flujo de aprobación',{w:'Define cuánto vale cada auxilio, cuánto tiempo extra debe trabajarse para ganarlo y si hace falta una validación previa del profesional.',e:'Al guardar, las solicitudes en trámite se recalculan con los nuevos minutos.',c:'Cambia estos valores solo si la política institucional cambió.'}),
'sec.fin':P('fin','trend','Parámetros financieros y de acceso',{w:'Controlan el presupuesto, las alertas del análisis financiero, quién puede consultarlo y otros conceptos económicos.',c:'Estos parámetros no cambian los cálculos de horas extras; solo afectan lo que se muestra en el módulo de Gestión financiera.'}),
'sec.rules':P('pay','history','Reglas laborales por vigencia',{w:'Cada fila es una regla con fecha de inicio y de fin. La que esté vigente en la fecha de ejecución es la que se usa.',u:'«Editar» corrige una vigencia; «Nueva vigencia» crea otra a partir de esos valores sin tocar la anterior.',c:'Para conservar el historial exacto, crea una nueva vigencia en lugar de editar una antigua.'}),
'sec.calc':P('pay','calc','Calculadora de tarifas',{w:'Es una vista de práctica: muestra cuánto vale cada tipo de hora con la regla vigente en la fecha y el salario que escribas.',u:'Te permite comprobar una regla antes de usarla.',c:'No guarda nada ni modifica el salario de nadie.'}),
'sec.lr.pct':P('pay','percent','Porcentajes de recargo',{w:'Son los porcentajes adicionales que se pagan sobre el valor de la hora ordinaria.',e:'Se suman sobre la hora base: nunca se cuentan dos veces.',c:'Escribe el porcentaje (35), no el factor (1,35).'}),
'sec.lr.round':P('pay','calc','Valor de la hora y redondeo',{w:'Elige si el valor de la hora se calcula automáticamente o con valores fijos autorizados, y cómo se redondean las cifras.',c:'El redondeo cambia los centavos de cada cálculo; define uno y mantenlo para que los costos sean comparables.'}),

/* Dependencias */
'dep.name':P('org','building','Nombre de la dependencia',{w:'Es el nombre con el que se identifica el área (por ejemplo «Atención al Cliente»).',u:'Aparece en la ficha del funcionario, en las solicitudes y en los reportes.',ch:'Si lo corriges, el nuevo nombre se verá en todos los registros que usan esa dependencia.',c:'Usa el nombre oficial y evita dos nombres distintos para la misma área: el sistema no permite nombres repetidos.'}),
'dep.code':P('org','building','Código de la dependencia',{w:'Es una clave corta y opcional para reconocer el área.',u:'Sirve para identificarla rápido o cruzarla con otros sistemas.',c:'No cambia ningún cálculo ni permiso. Si lo escribes, no puede repetirse en otra dependencia.'}),
'dep.active':P('org','toggle','Dependencia activa',{w:'Indica si la dependencia está en uso.',on:'Se puede asignar a funcionarios y aparece en las listas.',off:'Deja de ofrecerse para nuevas asignaciones; lo registrado antes se conserva.',c:'Antes de desactivarla, revisa que ningún funcionario necesite seguir en ella.'}),
/* Tipos de jornada */
'wt.name':P('jor','sun','Nombre del tipo de jornada',{w:'Es el nombre de la clase de jornada (por ejemplo «Diurna» o «Nocturna»).',u:'Quien crea una solicitud lo elige de una lista.',ch:'Cambiarlo corrige el nombre en todos los registros que lo usan.',c:'Usa nombres claros y sin repetir.'}),
'wt.desc':P('jor','sun','Descripción',{w:'Una nota opcional que explica cuándo se usa este tipo de jornada.',u:'Ayuda a quien administra a distinguir tipos parecidos.',c:'No afecta ningún cálculo.'}),
'wt.active':P('jor','toggle','Registro activo',{w:'Indica si este tipo de jornada se puede elegir.',on:'Aparece al crear solicitudes.',off:'Deja de ofrecerse; las solicitudes anteriores no cambian.',c:'Debe quedar al menos un tipo activo, o nadie podrá crear solicitudes.'}),
/* Actividades */
'act.name':P('org','list','Nombre de la actividad',{w:'Es el texto que verá el funcionario al elegir el motivo de sus horas extras.',u:'También se usa para filtrar reportes.',c:'Mínimo 3 caracteres y sin repetir un nombre existente.'}),
'act.group':P('org','layers','Grupo',{w:'Es la categoría bajo la cual se agrupa la actividad en la lista.',u:'Ordena las actividades para que sean más fáciles de encontrar. Puedes elegir un grupo existente o escribir uno nuevo.',c:'Cuida la ortografía: «Operación» y «Operacion» serían dos grupos distintos.'}),
'act.op':P('org','target','Actividad operativa',{w:'Marca si la actividad hace parte de la operación del día a día.',on:'Se puede seleccionar en las solicitudes y filtrar en los reportes.',off:'No se ofrece en las solicitudes.',c:'Es la marca que decide si la actividad aparece al crear una solicitud.'}),
'act.active':P('org','toggle','Disponible para seleccionar',{w:'Indica si la actividad está habilitada.',on:'Aparece en la lista de actividades.',off:'Se oculta de la lista; las solicitudes anteriores la conservan.',c:'Desactiva en lugar de borrar para no perder el historial.'}),
/* Turnos */
'sh.code':P('jor','clock','Código del turno',{w:'Es una clave corta (de 1 a 5 letras o números) que identifica el turno, por ejemplo «A».',u:'Se usa para asignar el turno a cada funcionario.',c:'Una vez creado, el código no se puede cambiar. Escríbelo con cuidado.'}),
'sh.desc':P('jor','clock','Descripción del turno',{w:'Un texto que explica el horario del turno.',u:'Aparece al asignar turnos y en los reportes.',c:'Procura que describa los días y las horas para evitar confusiones.'}),
'sh.days':P('jor','calendar','Días de la jornada habitual',{w:'Son los días de la semana en los que este turno trabaja normalmente.',u:'Un día que no esté marcado se considera fuera de la jornada habitual.',e:'En esos días la regla de auxilios no está definida: no se da auxilio y la solicitud queda marcada.',c:'Marca solo los días en los que realmente se trabaja.'}),
'sh.start':P('jor','clock','Hora de inicio',{w:'Es la hora a la que empieza la jornada habitual.',u:'El sistema la compara con las horas extras para saber si dan derecho al auxilio de desayuno.',c:'Debe ser anterior a la hora de fin.'}),
'sh.end':P('jor','clock','Hora de fin',{w:'Es la hora a la que termina la jornada habitual.',u:'El sistema la compara con las horas extras para saber si dan derecho al auxilio de comida.',c:'Debe ser posterior a la hora de inicio.'}),
'sh.ls':P('jor','utensils','Inicio del almuerzo',{w:'Es la hora a la que empieza el descanso para almorzar (opcional).',u:'Si una hora extra cubre todo el almuerzo, da derecho al auxilio de almuerzo.',c:'Si pones el inicio debes poner también el fin; si no hay almuerzo, deja ambos vacíos y ese auxilio no aplicará.'}),
'sh.le':P('jor','utensils','Fin del almuerzo',{w:'Es la hora a la que termina el descanso para almorzar (opcional).',u:'Junto con el inicio, define la franja que debe cubrirse para ganar el auxilio de almuerzo.',c:'Debe quedar dentro de la jornada y después del inicio del almuerzo.'}),
'sh.hol':P('jor','calendar','Los festivos hacen parte de la jornada',{w:'Indica si este turno trabaja normalmente en días festivos.',on:'Los festivos cuentan como jornada habitual: se pueden calcular auxilios.',off:'En festivos la regla de auxilios no está definida: no se da auxilio y la solicitud queda marcada.',c:'Actívalo solo para turnos que laboran festivos de forma habitual (por ejemplo, por rotación).'}),
'sh.active':P('jor','toggle','Turno activo',{w:'Indica si el turno está disponible.',on:'Se puede asignar a funcionarios.',off:'Deja de ofrecerse para nuevas asignaciones.',c:'Los funcionarios que ya lo tienen siguen con él hasta que se les cambie.'}),
/* Sindicatos */
'un.name':P('uni','users','Nombre del sindicato',{w:'Es el nombre del sindicato o grupo al que puede pertenecer un funcionario.',u:'Se asigna a cada funcionario y determina qué auxilio y qué reglas de cálculo le aplican.',c:'No puede repetirse.'}),
'un.code':P('uni','users','Código del sindicato',{w:'Una clave corta y opcional para identificarlo.',u:'Ayuda a reconocerlo rápido en listas y reportes.',c:'No cambia ningún cálculo.'}),
'un.active':P('uni','toggle','Sindicato activo',{w:'Indica si el sindicato está en uso.',on:'Se puede asignar a funcionarios.',off:'Deja de ofrecerse para nuevas asignaciones.',c:'Quienes ya pertenecen a él lo conservan.'}),
'un.amount':P('aux','wallet','Valor del auxilio de alimentación',{w:'Es el valor en pesos del auxilio de alimentación para los funcionarios de este sindicato.',u:'Se usa para valorar los auxilios que se reconocen en las solicitudes.',ch:'Si ya hay un valor vigente, el nuevo rige desde la fecha que indiques y el anterior queda en el historial. Si lo dejas vacío, no se cambia.',c:'La fecha de vigencia debe ser posterior al inicio del valor actual: el historial no se reescribe.'}),
'un.from':P('aux','calendar','Vigente desde',{w:'Es la fecha a partir de la cual empieza a regir el valor del auxilio.',u:'Las solicitudes se valoran con el valor que estaba vigente en su fecha de ejecución.',c:'Elige la fecha correcta: no se puede aplicar hacia atrás sobre un valor anterior.'}),
'un.notes':P('uni','file','Observaciones',{w:'Una nota opcional sobre el valor del auxilio (por ejemplo, «ajuste anual por IPC»).',u:'Queda guardada junto al valor para saber por qué cambió.',c:'No afecta ningún cálculo.'}),
/* Reglas de sindicato */
'ru.union':P('uni','users','Sindicato de la regla',{w:'Es el sindicato al que se aplica esta regla de cálculo.',u:'Solo los funcionarios de ese sindicato se calculan con ella.',c:'Una regla activa no puede cruzarse en fechas con otra regla activa del mismo sindicato.'}),
'ru.from':P('uni','calendar','Vigente desde',{w:'Es la fecha en la que empieza a regir la regla.',u:'Se aplica a las solicitudes cuya fecha de ejecución cae dentro de la vigencia.',c:'Los cambios no alteran solicitudes ya calculadas.'}),
'ru.to':P('uni','calendar','Vigente hasta',{w:'Es la fecha en la que deja de regir la regla (opcional).',u:'Si la dejas vacía, la regla no tiene fin.',c:'No puede ser anterior a la fecha de inicio.'}),
'ru.div':P('uni','calc','Divisor de horas mensuales',{w:'Es el número de horas del mes por el que se divide el salario para obtener el valor de una hora.',u:'Valor de la hora = salario ÷ divisor.',ch:'Un divisor más grande abarata la hora; uno más pequeño la encarece. Si lo dejas vacío queda «pendiente».',c:'Si falta este dato, la solicitud queda pendiente y no se suma al total.'}),
'ru.factor':P('uni','percent','Factor multiplicador',{w:'Es el número por el que se multiplica el valor de la hora ordinaria para esa categoría (por ejemplo, 1,25 equivale a un 25 % más).',u:'Reemplaza el factor de la regla laboral general mientras esta regla esté vigente.',c:'Aquí se escribe el factor, no el porcentaje. Si lo dejas vacío queda «pendiente» y la solicitud no se suma al total.'}),
'ru.notes':P('uni','file','Soporte normativo',{w:'La referencia que respalda la regla (por ejemplo, el artículo de la convención colectiva).',u:'Queda registrada para consultas futuras.',c:'Es opcional, pero muy útil en una auditoría.'}),
'ru.active':P('uni','toggle','Regla activa',{w:'Indica si la regla se puede aplicar.',on:'Se usa en los cálculos cuando está vigente.',off:'Se ignora; se aplica la regla laboral general.',c:'Una regla activa no puede cruzarse con otra activa del mismo sindicato.'}),
/* Regla laboral */
'lr.from':P('pay','calendar','Vigente desde',{w:'Es la fecha en la que empieza a regir esta regla laboral.',u:'Las horas extras se calculan con la regla que estaba vigente en su fecha de ejecución.',c:'Si hay una regla anterior sin fecha de fin, el sistema la cierra el día anterior.'}),
'lr.to':P('pay','calendar','Vigente hasta',{w:'Es la fecha en la que termina la regla (opcional).',u:'Si la dejas vacía, la regla sigue vigente hasta que crees otra.',c:'No puede ser anterior a la fecha de inicio.'}),
'lr.wh':P('pay','clock','Jornada laboral semanal',{w:'Son las horas que dura la jornada ordinaria de una semana (por ejemplo, 42 h).',u:'Junto con el divisor permite calcular cuánto vale una hora ordinaria. El botón «Sugerir» calcula el divisor como jornada semanal × 5.',c:'Debe corresponder a lo que exige la ley en esa fecha.'}),
'lr.div':P('pay','calc','Divisor mensual',{w:'Es el número de horas ordinarias del mes por el que se divide el salario.',u:'Valor de la hora = salario mensual ÷ divisor.',ch:'Un divisor mayor hace más barata la hora; uno menor, más cara. Cambia el costo de todas las horas extras de esa vigencia.',c:'Confírmalo con el área responsable antes de modificarlo.'}),
'lr.ns':P('pay','moon','Inicio del periodo nocturno',{w:'Es la hora desde la cual el trabajo se considera nocturno (por ejemplo, 7:00 p. m.).',u:'Las horas dentro del periodo nocturno se calculan con recargo nocturno.',c:'El periodo suele cruzar la medianoche; revisa también la hora de fin.'}),
'lr.ne':P('pay','sun','Fin del periodo nocturno',{w:'Es la hora en la que termina el trabajo nocturno (por ejemplo, 6:00 a. m.).',u:'Después de esta hora las horas se consideran diurnas.',c:'Debe coincidir con lo que define la normativa vigente.'}),
'lr.night':P('pay','moon','Recargo nocturno ordinario',{w:'Es el porcentaje adicional que se paga por trabajar de noche una hora que no es extra.',u:'Se suma sobre el valor de la hora ordinaria.',c:'Escribe el porcentaje (35), no el factor (1,35).'}),
'lr.xday':P('pay','sun','Hora extra diurna',{w:'Es el porcentaje adicional que se paga por cada hora extra trabajada de día.',u:'Se suma sobre el valor de la hora ordinaria.',c:'Escribe el porcentaje (25), no el factor (1,25).'}),
'lr.xnight':P('pay','moon','Hora extra nocturna',{w:'Es el porcentaje adicional que se paga por cada hora extra trabajada de noche.',u:'Se suma sobre el valor de la hora ordinaria.',c:'Escribe el porcentaje (75), no el factor (1,75).'}),
'lr.hol':P('pay','calendar','Recargo dominical y festivo',{w:'Es el porcentaje adicional que se paga por trabajar en domingo o festivo.',u:'Se suma sobre la hora ordinaria; en las horas extras de esos días se combina con el recargo de la hora extra.',c:'Por ley sube por etapas: 80 % desde el 1/07/2025, 90 % desde el 1/07/2026 y 100 % desde el 1/07/2027. Crea una vigencia por cada etapa.'}),
'lr.mode':P('pay','calc','Cálculo del valor de la hora',{w:'Define cómo se obtiene el valor de cada tipo de hora.',on:'Automático: salario ÷ divisor × factor. Es lo habitual.',off:'Manual: valores fijos en pesos por hora, autorizados por la entidad.',c:'En modo manual debes indicar el origen y soporte del valor; queda visible en cada cálculo.'}),
'lr.ref':P('pay','wallet','Salario mensual de referencia',{w:'Es un salario de ejemplo para esta regla (opcional).',u:'Sirve solo para la vista previa y como sugerencia cuando se registra un salario.',c:'Nunca sobrescribe el salario real de ningún funcionario: eso se administra en Funcionarios.'}),
'lr.manual':P('pay','coin','Valor manual por hora',{w:'Es el valor fijo en pesos de una hora de esta categoría.',u:'Solo se usa si el cálculo del valor de la hora está en modo manual.',c:'Si dejas una categoría vacía, no tendrá tarifa.'}),
'lr.msrc':P('pay','file','Origen y soporte del valor manual',{w:'Es la explicación de dónde salen los valores manuales (por ejemplo, convención colectiva y quién los aprobó).',u:'Queda registrada junto con la vigencia y se muestra en cada cálculo.',c:'Es obligatoria en modo manual.'}),
'lr.rbase':P('pay','calc','Redondeo del valor de la hora',{w:'Define cómo se redondea el valor de la hora ordinaria y con cuántos decimales.',u:'Evita fracciones de peso en los cálculos.',c:'Cambiarlo altera los centavos de todos los cálculos de esta vigencia.'}),
'lr.rrate':P('pay','calc','Redondeo de la tarifa',{w:'Define cómo se redondea la tarifa final de cada categoría de hora.',u:'Aplica al valor por hora de cada recargo y hora extra.',c:'Elige un criterio y mantenlo para comparar costos entre periodos.'}),
'lr.rtotal':P('pay','calc','Redondeo del total',{w:'Define cómo se redondea el total de cada línea de costo (tarifa × horas).',u:'Aplica al valor final que se suma en los reportes.',c:'Cambiarlo puede modificar los totales por unos pocos pesos.'}),
'lr.legal':P('pay','shield','Estado de validación jurídica',{w:'Indica si el área responsable ya confirmó que esta regla es correcta.',u:'Queda visible en la tabla y se registra junto con cada cálculo.',c:'Mientras esté «pendiente», conviene revisar con el área jurídica antes de considerarla definitiva.'}),
'lr.src':P('pay','file','Fuente normativa',{w:'Son las leyes o normas en las que se basa la regla.',u:'Se guarda para poder justificar los valores ante una revisión.',c:'Actualízala si cambias porcentajes o jornada.'}),
'lr.notes':P('pay','file','Observaciones',{w:'Notas internas sobre esta vigencia.',u:'Ayudan a entender por qué se hizo el cambio.',c:'No afectan ningún cálculo.'}),
'lr.active':P('pay','toggle','Regla activa',{w:'Indica si la regla está habilitada.',on:'Se usa en los cálculos cuando esté vigente.',off:'Se ignora aunque su fecha esté vigente.',c:'Desactívala solo si fue un error; para cambios normales crea una nueva vigencia.'}),
/* Calculadora y finanzas */
'rc.date':P('pay','calendar','Fecha de aplicación',{w:'Es la fecha para la que quieres ver las tarifas.',u:'El sistema busca la regla vigente en esa fecha.',c:'Si no hay regla vigente ese día, no se mostrarán tarifas.'}),
'rc.salary':P('pay','wallet','Salario mensual',{w:'Es un salario de práctica para ver cuánto valdría cada hora.',u:'Con él se calculan las tarifas de la tabla.',c:'No se guarda ni modifica el salario de nadie.'}),
'fp.budget':P('fin','wallet','Presupuesto mensual',{w:'Es el monto máximo que la entidad espera gastar cada mes en horas extras y auxilios.',u:'Gestión financiera lo usa para comparar el costo ejecutado contra lo presupuestado.',e:'Si lo dejas vacío, el módulo no hace esa comparación.',c:'Es solo una referencia: no bloquea solicitudes.'}),
'fp.pct':P('fin','trend','Alerta por incremento',{w:'Es el porcentaje de aumento frente al periodo anterior a partir del cual se muestra una alerta.',u:'Ayuda a detectar rápido meses con un gasto fuera de lo normal.',ch:'Un valor bajo genera más alertas; uno alto, menos.',c:'Debe estar entre 1 y 500 %.'}),
'fp.mgr':P('fin','users','Acceso del Jefe al análisis financiero',{w:'Permite que los jefes consulten el análisis financiero de su dependencia.',on:'Los jefes ven el módulo de Gestión financiera.',off:'Los jefes no tienen acceso al análisis financiero.',c:'Hay información de costos: actívalo solo si el jefe debe verla.'}),
'fp.pro':P('fin','users','Acceso del Profesional al análisis financiero',{w:'Permite que el rol Profesional consulte el análisis financiero.',on:'Los profesionales ven el módulo de Gestión financiera.',off:'Los profesionales no tienen acceso.',c:'Hay información de costos: actívalo solo si el profesional debe verla.'}),
'fp.selfu':P('uni','users','Autoservicio de sindicato',{w:'Permite que cada funcionario elija su sindicato la primera vez que lo necesite.',on:'El funcionario puede elegirlo una sola vez; los cambios posteriores los hace el administrador.',off:'Solo el administrador asigna el sindicato.',c:'El sindicato define qué auxilio y qué reglas se le aplican, por eso conviene que elijan con cuidado.'}),
'fp.extra':P('fin','percent','Conceptos económicos adicionales',{w:'Son costos extra que la entidad quiere estimar como un porcentaje del salario base mensual (prestaciones, aportes, etc.).',u:'El módulo financiero los muestra como «estimado».',c:'No se calculan por defecto: la entidad debe definir sus porcentajes y bases. Cada concepto necesita un nombre de al menos 3 caracteres.'}),
/* Parámetros generales */
'pa.maxh':P('sec','clock','Límite máximo por solicitud',{w:'Es el máximo de horas que se puede pedir en una sola solicitud.',u:'Evita solicitudes con duraciones desproporcionadas.',ch:'Si lo dejas vacío, no hay límite definido.',c:'Debe estar entre 0 y 24 horas. Se valida también en el servidor y aplica a las solicitudes nuevas.'}),
'pa.maxmb':P('sec','clip','Tamaño máximo por soporte',{w:'Es el peso máximo, en megabytes, de cada archivo de soporte que se adjunta a una solicitud.',u:'Protege el almacenamiento y evita cargas muy pesadas.',c:'Valor entre 1 y 10 MB. Si lo bajas, los archivos grandes dejarán de aceptarse.'}),
'pa.comment':P('sec','toggle','Exigir observación al aprobar',{w:'Obliga a quien aprueba una solicitud a escribir una observación.',on:'Para aprobar hay que escribir al menos 5 caracteres de observación.',off:'Se puede aprobar sin observación.',e:'Se valida también en el servidor.',c:'Actívalo si la política exige dejar constancia de por qué se aprueba.'}),
'mg.name':P('sys','userCheck','Nombre del jefe inmediato',{w:'Es el texto que sale en el campo «Nombre jefe inmediato» del formato de horas extras.',u:'Todos los funcionarios imprimen su formato con este nombre.',c:'Solo los administradores pueden cambiarlo. Revísalo bien: el cambio aplica a los formatos que se generen después.'}),
'au.d':P('aux','utensils','Valor auxilio desayuno',{w:'Es el valor en pesos que se reconoce por el auxilio de desayuno.',u:'Se aplica cuando una hora extra cubre la franja previa al inicio del turno.',ch:'Si lo dejas vacío queda «sin parametrizar».',c:'Al guardar se recalculan las solicitudes en trámite.'}),
'au.a':P('aux','utensils','Valor auxilio almuerzo',{w:'Es el valor en pesos que se reconoce por el auxilio de almuerzo.',u:'Se aplica cuando una hora extra cubre por completo el horario de almuerzo del turno.',ch:'Si lo dejas vacío queda «sin parametrizar».',c:'Al guardar se recalculan las solicitudes en trámite.'}),
'au.c':P('aux','utensils','Valor auxilio comida',{w:'Es el valor en pesos que se reconoce por el auxilio de comida.',u:'Se aplica cuando una hora extra continúa después del fin del turno.',ch:'Si lo dejas vacío queda «sin parametrizar».',c:'Al guardar se recalculan las solicitudes en trámite.'}),
'au.before':P('aux','clock','Minutos antes de la jornada (desayuno)',{w:'Es el tiempo mínimo que se debe trabajar antes de que empiece la jornada habitual para ganar el auxilio de desayuno.',u:'La regla institucional es una hora (60 minutos).',ch:'Si subes el número, será más difícil ganar el auxilio; si lo bajas, más fácil.',c:'Entero entre 1 y 720. Al guardar se recalculan las solicitudes en trámite.'}),
'au.after':P('aux','clock','Minutos después de la jornada (comida)',{w:'Es el tiempo mínimo que se debe trabajar después de terminar la jornada habitual para ganar el auxilio de comida.',u:'La regla institucional es de dos horas (120 minutos).',ch:'Si subes el número, será más difícil ganar el auxilio; si lo bajas, más fácil.',c:'Entero entre 1 y 720. Al guardar se recalculan las solicitudes en trámite.'}),
'au.pro':P('sys','shield','Exigir validación del profesional',{w:'Decide si el jefe necesita una validación favorable del profesional antes de poder aprobar.',on:'El jefe solo puede aprobar después de la validación favorable del profesional.',off:'El jefe puede aprobar sin validación previa (comportamiento anterior).',c:'Actívalo solo si el proceso institucional define esa secuencia: cambia el flujo de todas las solicitudes nuevas.'}),
'sg.bg':P('sec','pen','Quitar el fondo de la firma',{w:'Limpia la imagen para que solo quede el trazo de la firma, sin fondo.',on:'Se quita el fondo y se recorta alrededor de la firma. Recomendado para fotos y escaneos.',off:'La imagen se guarda tal cual.',c:'Un PNG que ya es transparente se conserva.'}),
'su.url':P('sec','link','URL del proyecto',{w:'Es la dirección del proyecto de base de datos a la que se conecta el aplicativo.',u:'Con ella el aplicativo sabe dónde guardar y leer la información.',c:'Usa solo la URL pública del proyecto.'}),
'su.key':P('sec','key','Clave pública',{w:'Es la clave pública (anon / publishable) que permite conectarse al proyecto.',u:'La seguridad real la aplican las políticas del servidor.',c:'Nunca pegues aquí la clave «service_role»: es secreta y daría acceso total.'})
};

const ID2KEY={actName:'act.name',actGroup:'act.group',actOp:'act.op',actActive:'act.active',shCode:'sh.code',shDesc:'sh.desc',shStart:'sh.start',shEnd:'sh.end',shLs:'sh.ls',shLe:'sh.le',shHol:'sh.hol',shActive:'sh.active',
  unName:'un.name',unCode:'un.code',unActive:'un.active',unAmount:'un.amount',unFrom:'un.from',unNotes:'un.notes',ruUnion:'ru.union',ruFrom:'ru.from',ruTo:'ru.to',ruDiv:'ru.div',ruNotes:'ru.notes',ruActive:'ru.active',
  lr_from:'lr.from',lr_to:'lr.to',lr_wh:'lr.wh',lr_div:'lr.div',lr_ns:'lr.ns',lr_ne:'lr.ne',lr_night_surcharge:'lr.night',lr_extra_day:'lr.xday',lr_extra_night:'lr.xnight',lr_holiday_surcharge:'lr.hol',lr_mode:'lr.mode',lr_ref:'lr.ref',lr_msrc:'lr.msrc',
  lr_r_base:'lr.rbase',lr_r_rate:'lr.rrate',lr_r_total:'lr.rtotal',lr_legal:'lr.legal',lr_src:'lr.src',lr_notes:'lr.notes',rcDate:'rc.date',rcSalary:'rc.salary',fpBudget:'fp.budget',fpPct:'fp.pct',
  pAuxD:'au.d',pAuxA:'au.a',pAuxC:'au.c',pAuxBefore:'au.before',pAuxAfter:'au.after',managerName:'mg.name',msigRemoveBg:'sg.bg',setupUrl:'su.url',setupKey:'su.key'};
const NAME2KEY={max_hours_per_request:'pa.maxh',max_file_size_mb:'pa.maxmb',approval_comment_required:'pa.comment',require_pro:'au.pro',mgr:'fp.mgr',pro:'fp.pro',selfu:'fp.selfu'};
const TXT2KEY=[['días de la jornada habitual','sh.days'],['conceptos económicos adicionales','fp.extra'],['url del proyecto','su.url'],['clave pública anon','su.key']];
const H4KEY=[['firma del jefe','sec.sig'],['jefe inmediato','sec.manager'],['límites y controles','sec.limits'],['auxilios de alimentación y flujo','sec.aux'],['parámetros financieros y de acceso','sec.fin'],
  ['reglas laborales y recargos','sec.rules'],['tarifas resultantes','sec.calc'],['porcentajes de recargo','sec.lr.pct'],['valor de la hora y redondeo','sec.lr.round']];

const $$=(r,s)=>Array.from((r||document).querySelectorAll(s));
const norm=s=>String(s||'').replace(/\s+/g,' ').trim().toLowerCase();
const ctxOf=el=>{const m=el.closest('.modal');if(m){const h=m.querySelector('.modal-head h3,#dlgTitle');return norm(h&&h.textContent)}const p=el.closest('.tab-panel');return p?p.id.replace('tab-',''):''};
function keyFor(ctrl,label,ctx){
  if(ctrl){
    const id=ctrl.id||'',nm=ctrl.getAttribute('name')||'';
    if(/^cat(Name|Extra|Active)$/.test(id)){const dep=/dependencia/.test(ctx);return id==='catName'?(dep?'dep.name':'wt.name'):id==='catExtra'?(dep?'dep.code':'wt.desc'):(dep?'dep.active':'wt.active')}
    if(ID2KEY[id])return ID2KEY[id];
    if(/^ru_/.test(id))return'ru.factor';
    if(/^lr_m_/.test(id)||ctrl.dataset&&ctrl.dataset.m)return'lr.manual';
    if(nm==='active'&&ctrl.closest('#lrForm'))return'lr.active';
    if(NAME2KEY[nm])return NAME2KEY[nm];
  }
  const t=norm(label&&label.textContent);
  for(const [k,v] of TXT2KEY)if(t.startsWith(k))return v;
  return null;
}

/* ───────── Unidades en campos numéricos ───────── */
function unitFor(inp,label){
  const id=inp.id||'',t=norm(label&&label.textContent);
  if(id==='lr_wh')return{s:'h/sem'};if(id==='lr_div'||id==='ruDiv')return{s:'h/mes'};
  if(/^ru_/.test(id))return{s:'×'};if(/^lr_m_/.test(id))return{p:'$',s:'/h'};
  if(id==='pAuxBefore'||id==='pAuxAfter')return{s:'min'};
  if(/\(cop\/h\)/.test(t))return{p:'$',s:'/h'};if(/\(cop\)/.test(t))return{p:'$',s:'COP'};
  if(/\(%\)/.test(t))return{s:'%'};if(/\(mb\)/.test(t))return{s:'MB'};if(/\((horas|h)\)/.test(t))return{s:'h'};
  return null;
}

/* ───────── Mejora progresiva ───────── */
const memo=new Map();let uid=0;
const inCfg=el=>!!(el.closest&&el.closest('.cfg-ui'));
function helpBtn(key,name){
  const b=document.createElement('button');b.type='button';b.className='cfg-help';b.dataset.cfgTip=key;
  b.setAttribute('aria-label','Ayuda');b.setAttribute('aria-expanded','false');b.innerHTML=svg('help');return b;
}
function sections(root){
  $$(root,'.form-section').forEach(sec=>{
    if(sec.dataset.cfgSec||!inCfg(sec))return;
    const h=Array.from(sec.children).find(c=>c.tagName==='H4');if(!h)return;
    sec.dataset.cfgSec='1';sec.classList.add('cfg-sec');
    const body=document.createElement('div'),inner=document.createElement('div');
    body.className='cfg-sec-body';inner.className='cfg-sec-inner';inner.id='cfgsec'+(++uid);
    while(h.nextSibling)inner.appendChild(h.nextSibling);body.appendChild(inner);sec.appendChild(body);
    const chev=document.createElement('span');chev.className='cfg-chev';chev.setAttribute('aria-hidden','true');chev.innerHTML=svg('chev');h.appendChild(chev);
    h.setAttribute('role','button');h.tabIndex=0;h.setAttribute('aria-controls',inner.id);
    const mk=(sec.id||'')+'|'+norm(h.textContent).slice(0,40),page=!sec.closest('.modal');
    const set=(c,anim)=>{sec.classList.toggle('is-collapsed',c);h.setAttribute('aria-expanded',String(!c));if(anim){sec.classList.add('is-anim');clearTimeout(sec._t);sec._t=setTimeout(()=>sec.classList.remove('is-anim'),520)}if(page)memo.set(mk,c)};
    set(page&&memo.get(mk)===true,false);
    h.addEventListener('click',e=>{if(e.target.closest('.cfg-help'))return;set(!sec.classList.contains('is-collapsed'),true)});
    h.addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target===h){e.preventDefault();set(!sec.classList.contains('is-collapsed'),true)}});
    const t=norm(h.textContent),hk=H4KEY.find(([k])=>t.includes(k));
    if(hk&&TIPS[hk[1]]&&!h.querySelector('.cfg-help')){const b=helpBtn(hk[1],TIPS[hk[1]].title),kick=h.querySelector('.section-kicker');h.insertBefore(b,kick||chev)}
  });
}
function switches(root){
  $$(root,'input[type=checkbox]').forEach(i=>{
    if(i.dataset.cfgSw||!inCfg(i)||i.closest('.dropzone'))return;i.dataset.cfgSw='1';
    const lab=i.closest('label');
    if(i.classList.contains('shDay')){i.classList.add('cfg-chipbox');lab&&lab.classList.add('cfg-daychip');return}
    i.classList.add('cfg-sw');i.setAttribute('role','switch');
    if(lab){lab.classList.add('cfg-swrow');
      // el texto de la casilla pasa a un contenedor propio para poder alinear el estado a la derecha
      const wrap=document.createElement('span');wrap.className='cfg-swlabel';
      Array.from(lab.childNodes).forEach(n=>{if(n!==i)wrap.appendChild(n)});lab.appendChild(wrap);
      const st=document.createElement('span');st.className='cfg-swstate';st.setAttribute('aria-hidden','true');lab.appendChild(st);
      const upd=()=>{st.textContent=i.checked?'Activado':'Desactivado';st.classList.toggle('is-on',i.checked)};upd();i._cfgUpd=upd;
    }
  });
}
document.addEventListener('change',e=>{const i=e.target;if(i&&i._cfgUpd)i._cfgUpd()},true);
function helps(root,ctxEl){
  $$(root,'label').forEach(l=>{
    if(l.dataset.cfgHelp||!inCfg(l))return;
    let ctrl=l.control||l.querySelector('input,select,textarea');
    if(ctrl&&ctrl.classList.contains('shDay'))return;
    const key=keyFor(ctrl,l,ctxOf(l));if(!key||!TIPS[key])return;
    l.dataset.cfgHelp='1';
    const host=l.querySelector('.cfg-swlabel')||l;
    host.appendChild(helpBtn(key,TIPS[key].title));
  });
  // paneles y títulos con ayuda ya declarada en el HTML: solo se aseguran atributos
  $$(root,'.cfg-help[data-cfg-tip]').forEach(b=>{if(!b.hasAttribute('aria-expanded'))b.setAttribute('aria-expanded','false')});
}
function units(root){
  $$(root,'input[type=number]').forEach(i=>{
    if(i.dataset.cfgUnit||!inCfg(i))return;const par=i.parentElement;if(!par||!par.matches('.field,.swal-field'))return;
    i.dataset.cfgUnit='1';const u=unitFor(i,i.labels&&i.labels[0]);if(!u)return;
    const w=document.createElement('span');w.className='cfg-inwrap';if(u.p)w.dataset.p=u.p;if(u.s){w.dataset.s=u.s;w.style.setProperty('--sw',(u.s.length*7+22)+'px')}
    par.insertBefore(w,i);w.appendChild(i);
  });
}
function stagger(root){
  $$(root,'.modal.cfg-ui').concat(root.matches&&root.matches('.modal.cfg-ui')?[root]:[]).forEach(m=>{
    $$(m,'.modal-body .form-section').forEach((s,i)=>s.style.setProperty('--r',Math.min(i,8)));
    $$(m,'.modal-body .swal-form-grid>*').forEach((s,i)=>s.style.setProperty('--r',Math.min(i,12)));
    $$(m,'.modal-body>.field').forEach((s,i)=>s.style.setProperty('--r',Math.min(i,8)));
  });
}
function enhance(root){
  if(!root||root.nodeType!==1)return;
  sections(root);switches(root);helps(root);units(root);stagger(root);
}

/* ───────── Tooltips ───────── */
let tip,scrim,openFor=null,pinned=false,showT=0,hideT=0,watch=0,tipDown=false;
function ensureTip(){
  if(tip)return;
  tip=document.createElement('div');tip.id='cfgTip';tip.className='cfg-tip';tip.setAttribute('role','tooltip');tip.hidden=true;
  scrim=document.createElement('div');scrim.className='cfg-tip-scrim';scrim.hidden=true;
  document.body.appendChild(scrim);document.body.appendChild(tip);
  tip.addEventListener('pointerenter',()=>clearTimeout(hideT));
  tip.addEventListener('pointerdown',()=>{tipDown=true;setTimeout(()=>{tipDown=false},400)});
  tip.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!pinned)schedHide(180)});
  scrim.addEventListener('click',()=>hide());
  tip.addEventListener('click',e=>{if(e.target.closest('.cfg-tip-x'))hide(false,true)});
}
function render(t){
  const c=CAT[t.cat]||CAT.sys;let n=0;
  const row=(ic,lb,tx)=>`<div class="cfg-tip-row" style="--n:${n++}"><span class="cfg-tip-ric">${svg(ic)}</span><div><b>${lb}</b><p>${tx}</p></div></div>`;
  let h=`<div class="cfg-tip-head"><span class="cfg-tip-ico">${svg(t.icon)}</span><div class="cfg-tip-ttl"><small>${c.n}</small><b>${t.title}</b></div><button type="button" class="cfg-tip-x" aria-label="Cerrar ayuda">${svg('x')}</button></div><div class="cfg-tip-body">`;
  if(t.w)h+=row('info','Qué significa',t.w);
  if(t.u)h+=row('target','Para qué sirve',t.u);
  if(t.on||t.off)h+=`<div class="cfg-tip-sw" style="--n:${n++}">${t.on?`<div class="is-on"><b>${svg('check')}Si lo activas</b><p>${t.on}</p></div>`:''}${t.off?`<div class="is-off"><b>${svg('minus')}Si lo desactivas</b><p>${t.off}</p></div>`:''}</div>`;
  if(t.ch)h+=row('sliders','Si lo modificas',t.ch);
  if(t.e)h+=row('pulse','Cómo afecta al sistema',t.e);
  if(t.c)h+=`<div class="cfg-tip-care" style="--n:${n++}"><span class="cfg-tip-ric">${svg('alert')}</span><div><b>Antes de modificarlo</b><p>${t.c}</p></div></div>`;
  h+='</div>';return h;
}
function place(){
  if(!openFor||!tip)return;
  const vw=innerWidth,vh=innerHeight,m=12,gap=13,r=openFor.getBoundingClientRect();
  const sheet=vw<560;tip.classList.toggle('is-sheet',sheet);
  if(sheet){tip.style.left='';tip.style.top='';tip.removeAttribute('data-side');scrim.hidden=false;requestAnimationFrame(()=>scrim.classList.add('is-open'));return}
  scrim.hidden=true;scrim.classList.remove('is-open');
  tip.style.maxHeight=(vh-2*m)+'px';tip.style.left='0px';tip.style.top='0px';
  const tw=tip.offsetWidth,th=tip.offsetHeight;
  const sp={bottom:vh-r.bottom-m,top:r.top-m,right:vw-r.right-m,left:r.left-m};
  let side=th+gap<=sp.bottom?'bottom':th+gap<=sp.top?'top':tw+gap<=sp.right?'right':tw+gap<=sp.left?'left':(sp.bottom>=sp.top?'bottom':'top');
  let x,y;
  if(side==='bottom'||side==='top'){x=Math.min(Math.max(m,r.left+r.width/2-tw/2),vw-tw-m);y=side==='bottom'?r.bottom+gap:r.top-gap-th}
  else{y=Math.min(Math.max(m,r.top+r.height/2-th/2),vh-th-m);x=side==='right'?r.right+gap:r.left-gap-tw}
  y=Math.max(m,Math.min(y,vh-th-m));
  tip.style.left=Math.round(x)+'px';tip.style.top=Math.round(y)+'px';tip.dataset.side=side;
  const cx=r.left+r.width/2-x,cy=r.top+r.height/2-y;
  tip.style.setProperty('--ax',Math.max(22,Math.min(tw-22,cx))+'px');tip.style.setProperty('--ay',Math.max(22,Math.min(th-22,cy))+'px');
  tip.style.setProperty('--ox',Math.max(0,Math.min(tw,cx))+'px');
}
function show(btn,pin){
  ensureTip();clearTimeout(hideT);clearTimeout(showT);
  const t=TIPS[btn.dataset.cfgTip];if(!t)return;
  if(openFor===btn){if(pin)pinned=true;return}
  if(openFor){openFor.setAttribute('aria-expanded','false');openFor.removeAttribute('aria-describedby')}
  const c=CAT[t.cat]||CAT.sys;tip.style.setProperty('--tip-a',c.a);tip.style.setProperty('--tip-b',c.b);
  tip.innerHTML=render(t);tip.hidden=false;tip.classList.remove('is-leaving','is-open');
  openFor=btn;pinned=!!pin;btn.setAttribute('aria-expanded','true');btn.setAttribute('aria-describedby','cfgTip');
  place();void tip.offsetWidth;requestAnimationFrame(()=>tip.classList.add('is-open'));
  clearInterval(watch);watch=setInterval(()=>{if(!openFor||!openFor.isConnected||!openFor.offsetParent&&getComputedStyle(openFor).position!=='fixed')hide(true)},350);
}
function hide(imm,focusBack){
  clearTimeout(showT);clearTimeout(hideT);if(!openFor)return;
  const b=openFor;openFor=null;pinned=false;clearInterval(watch);
  b.setAttribute('aria-expanded','false');b.removeAttribute('aria-describedby');
  if(focusBack&&b.isConnected)b.focus({preventScroll:true});
  if(!tip)return;tip.classList.remove('is-open');scrim&&scrim.classList.remove('is-open');
  if(imm){tip.hidden=true;tip.classList.remove('is-leaving');scrim.hidden=true;return}
  tip.classList.add('is-leaving');
  setTimeout(()=>{if(!openFor){tip.hidden=true;tip.classList.remove('is-leaving');scrim.hidden=true}},170);
}
const schedHide=ms=>{clearTimeout(hideT);hideT=setTimeout(()=>{if(!pinned)hide()},ms)};
const btnOf=e=>e.target&&e.target.closest?e.target.closest('.cfg-help[data-cfg-tip]'):null;
document.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse')return;const b=btnOf(e);if(!b)return;clearTimeout(hideT);clearTimeout(showT);showT=setTimeout(()=>show(b,false),130)});
document.addEventListener('pointerout',e=>{if(e.pointerType!=='mouse')return;const b=btnOf(e);if(!b)return;clearTimeout(showT);if(!pinned)schedHide(200)});
document.addEventListener('focusin',e=>{const b=btnOf(e);if(b&&b.matches(':focus-visible'))show(b,true)});
document.addEventListener('focusout',e=>{const b=btnOf(e);if(b&&openFor===b&&!tipDown&&!(e.relatedTarget&&tip&&tip.contains(e.relatedTarget)))hide()});
document.addEventListener('click',e=>{
  const b=btnOf(e);
  if(b){e.preventDefault();e.stopPropagation();if(openFor===b&&pinned)hide(false);else{show(b,true);pinned=true}return}
  if(openFor&&pinned&&tip&&!tip.contains(e.target))hide();
},true);
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&openFor){e.preventDefault();e.stopImmediatePropagation();hide(false,true)}},true);
let rp=0;const repos=()=>{if(!openFor)return;cancelAnimationFrame(rp);rp=requestAnimationFrame(place)};
window.addEventListener('resize',repos);window.addEventListener('scroll',repos,true);

/* ───────── Menú lateral (rail), accesibilidad y entrada de paneles ───────── */
function enterPanel(p){
  if(!p)return;p.classList.add('cfg-enter');
  $$(p,'tbody').forEach(tb=>$$(tb,'tr').forEach((tr,i)=>tr.style.setProperty('--r',Math.min(i,12))));
  $$(p,'.form-section').forEach((s,i)=>s.style.setProperty('--r',Math.min(i,6)));
  clearTimeout(p._ce);p._ce=setTimeout(()=>p.classList.remove('cfg-enter'),1500);
}
function rail(){
  const page=document.querySelector('#page-settings .cfg-page'),rl=page&&page.querySelector('.cfg-rail');if(!rl||rl.dataset.cfgInit)return;rl.dataset.cfgInit='1';
  const ink=document.createElement('span');ink.className='cfg-rail-ink';ink.setAttribute('aria-hidden','true');rl.insertBefore(ink,rl.firstChild);
  const tabs=()=>$$(rl,'.tab');
  rl.setAttribute('role','tablist');
  const place=act=>{
    if(!act||!act.offsetWidth)return;const cs=getComputedStyle(act);
    ink.style.setProperty('--ink-a',cs.getPropertyValue('--cfg-a').trim()||'#2563EB');ink.style.setProperty('--ink-b',cs.getPropertyValue('--cfg-b').trim()||'#7C3AED');
    ink.style.width=act.offsetWidth+'px';ink.style.height=act.offsetHeight+'px';ink.style.transform=`translate(${act.offsetLeft}px,${act.offsetTop}px)`;if(!ink.classList.contains('is-on'))ink.classList.add('is-on');
  };
  let last=null;
  const sync=(scroll)=>{
    const act=rl.querySelector('.tab.active')||tabs()[0];if(!act)return;
    tabs().forEach(t=>{const on=t===act;t.setAttribute('aria-selected',String(on));t.tabIndex=on?0:-1});
    page.dataset.acc=act.dataset.tab;place(act);
    if(last!==act.dataset.tab){last=act.dataset.tab;enterPanel(document.getElementById('tab-'+act.dataset.tab));
      if(scroll){const top=page.querySelector('.cfg-panels').getBoundingClientRect().top;if(top<72||top>innerHeight*.7)window.scrollTo({top:Math.max(0,scrollY+top-84),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})}
      if(scroll&&getComputedStyle(rl).flexDirection==='row')act.scrollIntoView({inline:'center',block:'nearest',behavior:'smooth'})}
  };
  new MutationObserver(ms=>{if(ms.some(m=>m.target.classList&&m.target.classList.contains('tab')))sync(true)}).observe(rl,{subtree:true,attributes:true,attributeFilter:['class']});
  const pg=document.getElementById('page-settings');
  new MutationObserver(()=>{if(pg.classList.contains('active')){last=null;requestAnimationFrame(()=>sync(false))}}).observe(pg,{attributes:true,attributeFilter:['class']});
  if(window.ResizeObserver)new ResizeObserver(()=>place(rl.querySelector('.tab.active'))).observe(rl);
  window.addEventListener('resize',()=>place(rl.querySelector('.tab.active')));
  rl.addEventListener('keydown',e=>{
    const t=e.target.closest&&e.target.closest('.tab');if(!t)return;const list=tabs(),i=list.indexOf(t);let n=-1;
    if(e.key==='ArrowDown'||e.key==='ArrowRight')n=(i+1)%list.length;else if(e.key==='ArrowUp'||e.key==='ArrowLeft')n=(i-1+list.length)%list.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=list.length-1;
    if(n>=0){e.preventDefault();list[n].focus();list[n].click()}
  });
  sync(false);
}

/* ───────── Notificaciones: mismo lenguaje que el resto del módulo ───────── */
function cfgContext(){
  const pg=document.getElementById('page-settings');
  return !!((pg&&pg.classList.contains('active'))||document.querySelector('#modalRoot .cfg-ui,#dialogRoot .cfg-ui'));
}
function toasts(){
  const stack=document.getElementById('toastStack');if(!stack)return;
  new MutationObserver(ms=>ms.forEach(m=>m.addedNodes.forEach(n=>{
    if(!(n instanceof HTMLElement)||!n.classList.contains('app-toast')||!cfgContext())return;
    n.classList.add('cfg-toast');
    if(n.classList.contains('success')){const p=document.querySelector('#page-settings .tab-panel.active');if(p){p.classList.remove('cfg-flash');void p.offsetWidth;p.classList.add('cfg-flash');setTimeout(()=>p.classList.remove('cfg-flash'),1000)}}
  }))).observe(stack,{childList:true});
}

/* ───────── Arranque ───────── */
let queued=false;const pending=new Set();
function flush(){queued=false;pending.forEach(n=>{if(n.isConnected)enhance(n)});pending.clear()}
function queue(n){pending.add(n);if(!queued){queued=true;requestAnimationFrame(flush);}}
function boot(){
  rail();toasts();enhance(document.body);
  new MutationObserver(ms=>{
    for(const m of ms){m.addedNodes.forEach(n=>{
      if(n.nodeType!==1||n.closest&&n.closest('.cfg-tip'))return;
      if(inCfg(n)||(n.querySelector&&n.querySelector('.cfg-ui')))queue(n.parentElement||n);
    })}
  }).observe(document.body,{childList:true,subtree:true});
}
window.CfgUX={icon:svg,tips:TIPS,enhance};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
