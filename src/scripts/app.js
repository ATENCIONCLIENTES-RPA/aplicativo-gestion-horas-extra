(()=>{
    'use strict';
    // Valores públicos de despliegue. Reemplácelos una sola vez antes de publicar
    // para que los usuarios finales solo tengan que abrir la URL e iniciar sesión.
    // La clave anon/publishable es pública por diseño; NUNCA use service_role aquí.
    const DEPLOYMENT_CONFIG={url:window.__APP_CONFIG__?.supabaseUrl||'',anonKey:window.__APP_CONFIG__?.supabaseAnonKey||''};
    const STATUS={draft:'Borrador',pending:'Pendiente',in_review:'En revisión',returned:'Devuelta para correcciones',approved:'Aprobada',rejected:'Rechazada',pending_execution:'Pendiente de ejecución',validated:'Validada',closed:'Cerrada',cancelled:'Cancelada'};
    const STATUS_CLASS={draft:'st-draft',pending:'st-pending',in_review:'st-review',returned:'st-returned',approved:'st-approved',rejected:'st-rejected',pending_execution:'st-execution',validated:'st-validated',closed:'st-closed',cancelled:'st-cancelled'};
    const PAGE_TITLES={dashboard:'Dashboard',requests:'Solicitudes',reports:'Reportes',auxilios:'Auxilios de alimentación',adminQueue:'Bandeja de gestión',employees:'Funcionarios',settings:'Configuración',finance:'Gestión financiera'};
    const state={client:null,user:null,profile:null,requests:[],adminRequests:[],departments:[],workTypes:[],profiles:[],notifications:[],reportRows:[],audit:[],parameters:{},charts:{},chartMode:'month',chartDate:new Date().toISOString().slice(0,10),page:{requests:1,admin:1},pageSize:8,realtime:null,userSettings:{},directory:null,v7Ready:false};

    // Antes: tres búsquedas lineales por cada solicitud (O(n·m)). Ahora un índice por colección (se conserva la primera coincidencia, igual que find()).

    const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
    const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
    // Instanciar Intl.DateTimeFormat / toLocaleString en cada llamada era el mayor coste de tablas, reportes y calendario.
    // Cada formateador se crea una sola vez (de forma diferida) y produce exactamente el mismo texto.
    const intlOnce=make=>{let f=null;return()=>f||(f=make())};
    const dfMedium=intlOnce(()=>new Intl.DateTimeFormat('es-CO',{dateStyle:'medium'})),dfMediumTime=intlOnce(()=>new Intl.DateTimeFormat('es-CO',{dateStyle:'medium',timeStyle:'short'})),nfHours=intlOnce(()=>new Intl.NumberFormat('es-CO',{minimumFractionDigits:0,maximumFractionDigits:2}));
    const dfNumeric=intlOnce(()=>new Intl.DateTimeFormat('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})),dfMonthYear=intlOnce(()=>new Intl.DateTimeFormat('es-CO',{month:'long',year:'numeric'})),dfFullDate=intlOnce(()=>new Intl.DateTimeFormat('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'}));
    const dfMonthLong=intlOnce(()=>new Intl.DateTimeFormat('es-CO',{month:'long'})),dfMonthShort=intlOnce(()=>new Intl.DateTimeFormat('es-CO',{month:'short'})),dfWeekdayDay=intlOnce(()=>new Intl.DateTimeFormat('es-CO',{weekday:'short',day:'numeric'}));
    const dateMemo=new Map();   // las fechas se repiten mucho en las tablas: se memoriza el texto ya formateado
    const fmtDate=v=>{if(!v)return '—';let t=dateMemo.get(v);if(t===undefined){t=dfMedium().format(new Date(v+'T12:00:00'));if(dateMemo.size>4000)dateMemo.clear();dateMemo.set(v,t)}return t};
    const fmtDateTime=v=>v?dfMediumTime().format(new Date(v)):'—';
    const num=v=>nfHours().format(Number(v||0));
    // Intl.Collator() con argumentos por defecto es lo que usa String.prototype.localeCompare(); reutilizarlo evita recrearlo en cada comparación.
    const collator=intlOnce(()=>new Intl.Collator()),createdDesc=(a,b)=>collator().compare(String(b.created_at),String(a.created_at));
    const initials=n=>(n||'Usuario').split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
    const statusBadge=s=>`<span class="status ${STATUS_CLASS[s]||''}">${esc(STATUS[s]||s)}</span>`;
    // lucide.createIcons recorre todo el documento; cada render lo pedía varias veces. Se agrupan las peticiones del mismo ciclo
    // en un único barrido que corre como microtarea (antes de cualquier dibujado, por lo que el usuario no percibe diferencia).
    let iconQueued=false;
    const iconRefresh=()=>{if(iconQueued)return;iconQueued=true;queueMicrotask(()=>{iconQueued=false;window.lucide?.createIcons({attrs:{'stroke-width':1.8}})})};
    const vectorIcon=name=>{const paths={add:'<path d="M12 5v14M5 12h14"></path>',edit:'<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path>',detail:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6M8 13h8M8 17h5"></path>',database:'<ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path>',message:'<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"></path><path d="M8 9h8M8 13h5"></path>',close:'<path d="M18 6 6 18M6 6l12 12"></path>',info:'<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>',shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path><path d="m9 12 2 2 4-4"></path>',history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5M12 7v5l3 2"></path>',paperclip:'<path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"></path>',search:'<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path>',trash:'<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v5M14 11v5"></path>',calendar:'<path d="M7 2v3M17 2v3M3 9h18"></path><rect x="3" y="4" width="18" height="17" rx="2"></rect>',check:'<path d="m5 12 4 4L19 6"></path>',undo:'<path d="M9 14 4 9l5-5"></path><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path>',reject:'<circle cx="12" cy="12" r="9"></circle><path d="m15 9-6 6M9 9l6 6"></path>',approve:'<circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.5 2.5 2.5 4.5-5"></path>',verify:'<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"></path><path d="m9 12 2 2 4-4"></path>',hourglass:'<path d="M5 22h14M5 2h14"></path><path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22"></path><path d="M7 2v4.17a2 2 0 0 0 .59 1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2"></path>',lock:'<rect x="4" y="11" width="16" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>',ban:'<circle cx="12" cy="12" r="9"></circle><path d="m5.6 5.6 12.8 12.8"></path>',download:'<path d="M12 3v12"></path><path d="m7 11 5 5 5-5"></path><path d="M5 21h14"></path>',external:'<path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>',upload:'<path d="M12 16V4"></path><path d="m7 9 5-5 5 5"></path><path d="M20 16.5a4.5 4.5 0 0 1-4.5 4.5h-7A4.5 4.5 0 0 1 4 16.5"></path>',userCheck:'<circle cx="9" cy="8" r="4"></circle><path d="M2 21a7 7 0 0 1 14 0"></path><path d="m16 11 2 2 4-4"></path>'};return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.info}</svg>`};
    function toast(title,type='success',description=''){
      const stack=$('#toastStack')||(()=>{const x=document.createElement('div');x.id='toastStack';x.className='toast-stack';x.setAttribute('aria-live','polite');document.body.appendChild(x);return x})(),duration=title.length>95?5200:3400,icons={success:'check',error:'x',warning:'triangle',info:'info'};
      const iconSvg={check:'<path d="m5 12 4 4L19 6"></path>',x:'<path d="M18 6 6 18M6 6l12 12"></path>',triangle:'<path d="M12 3 2 21h20L12 3Z"></path><path d="M12 9v4M12 17h.01"></path>',info:'<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>'}[icons[type]||'info'];
      const item=document.createElement('div');item.className=`app-toast ${['success','error','warning','info'].includes(type)?type:'info'}`;item.style.setProperty('--toast-duration',`${duration}ms`);item.setAttribute('role',type==='error'?'alert':'status');item.innerHTML=`<span class="app-toast-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconSvg}</svg></span><span class="app-toast-content"><span class="app-toast-title">${esc(title)}</span>${description?`<span class="app-toast-description">${esc(description)}</span>`:''}</span><button type="button" class="app-toast-close" aria-label="Cerrar notificación"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg></button><span class="app-toast-progress" aria-hidden="true"><span></span></span>`;
      const remove=()=>{if(item.classList.contains('is-leaving'))return;item.classList.add('is-leaving');setTimeout(()=>item.remove(),190)};item.querySelector('.app-toast-close').onclick=remove;stack.appendChild(item);while(stack.children.length>4)stack.firstElementChild.remove();setTimeout(remove,duration);return item
    }
    const errorMsg=e=>e?.message?.replace(/^.*?message:/,'').trim()||'Ocurrió un error inesperado.';
    function setBusy(btn,on,text='Procesando...'){if(!btn)return;if(on){if(!btn.dataset.old)btn.dataset.old=btn.innerHTML;btn.disabled=true;btn.setAttribute('aria-busy','true');btn.innerHTML=`<span class="btn-spinner" aria-hidden="true"></span><span>${esc(text)}</span>`}else{btn.disabled=false;btn.removeAttribute('aria-busy');btn.innerHTML=btn.dataset.old||btn.innerHTML;delete btn.dataset.old;iconRefresh()}}
    // Elimina de este navegador los restos de la antigua demostración (base local, sesión de prueba y preferencias de cuentas ficticias).
    function purgeLegacyDemoStorage(){
      try{['essa_demo_database','essa_demo_session'].forEach(k=>{localStorage.removeItem(k);sessionStorage.removeItem(k)})}catch(_){}
      try{const t=JSON.parse(localStorage.getItem('essa_theme_users')||'{}');let ch=false;Object.keys(t).forEach(k=>{if(/\.demo@essa\.com$/i.test(k)){delete t[k];ch=true}});if(ch)localStorage.setItem('essa_theme_users',JSON.stringify(t))}catch(_){}
    }
    // =====================================================================================================
    // MODO LOCAL (sin Supabase)
    // Cuando el aplicativo no tiene URL ni clave de Supabase configuradas, funciona con una base de datos local
    // guardada en este navegador (localStorage). Reproduce las tablas, funciones (RPC), permisos por rol y
    // disparadores del esquema SQL embebido, para probar todas las funciones y permisos de cada rol sin servidor.
    // Si hay una URL y una clave de Supabase configuradas, este bloque NO se usa.
    // Para reiniciar los datos locales: localStorage.removeItem('essa_local_db_v1') y recargar.
    // =====================================================================================================
    function createLocalBackend(){
      const DB_KEY='essa_local_db_v1',SES_KEY='essa_local_session_v1',DB_VERSION=1;
      const ACTS=[["Envío de solicitudes", "Gestión de PQR y atención al cliente", 1], ["Gestión de vencimientos", "Gestión de PQR y atención al cliente", 2], ["Seguimiento de PQR", "Gestión de PQR y atención al cliente", 3], ["Elaboración de respuestas a PQR", "Gestión de PQR y atención al cliente", 4], ["Revisión y validación de solicitudes", "Gestión de PQR y atención al cliente", 5], ["Gestión de requerimientos de clientes", "Gestión de PQR y atención al cliente", 6], ["Consulta y seguimiento de radicados", "Gestión de PQR y atención al cliente", 7], ["Actualización de información de solicitudes", "Gestión de PQR y atención al cliente", 8], ["Clasificación y asignación de PQR", "Gestión de PQR y atención al cliente", 9], ["Cierre y documentación de solicitudes", "Gestión de PQR y atención al cliente", 10], ["Solicitud de insumos", "Operación y gestión comercial", 11], ["Validación de información comercial", "Operación y gestión comercial", 12], ["Revisión de cuentas y consumos", "Operación y gestión comercial", 13], ["Gestión de novedades comerciales", "Operación y gestión comercial", 14], ["Verificación de información de clientes", "Operación y gestión comercial", 15], ["Elaboración de informes operativos", "Operación y gestión comercial", 16], ["Elaboración de informes administrativos", "Operación y gestión comercial", 16], ["Seguimiento de compromisos y pendientes", "Operación y gestión comercial", 17], ["Gestión documental", "Operación y gestión comercial", 18], ["Actualización de registros", "Operación y gestión comercial", 19], ["Coordinación con otras áreas", "Operación y gestión comercial", 20], ["Desarrollo de soluciones", "Desarrollo y mejora de soluciones", 21], ["Mejora de procesos", "Desarrollo y mejora de soluciones", 22], ["Automatización de actividades", "Desarrollo y mejora de soluciones", 23], ["Pruebas y validación de funcionalidades", "Desarrollo y mejora de soluciones", 24], ["Corrección de errores", "Desarrollo y mejora de soluciones", 25], ["Mantenimiento de aplicaciones", "Desarrollo y mejora de soluciones", 26], ["Análisis de requerimientos", "Desarrollo y mejora de soluciones", 27], ["Diseño de nuevas funcionalidades", "Desarrollo y mejora de soluciones", 28], ["Optimización de herramientas existentes", "Desarrollo y mejora de soluciones", 29], ["Documentación técnica y funcional", "Desarrollo y mejora de soluciones", 30]];
      const PK={app_parameters:'key',work_shifts:'code',employee_compensation:'profile_id',user_settings:'user_id',overtime_cost_snapshots:'request_id'};
      const SEQ=new Set(['notifications','request_history','audit_log']);
      const UNIQUE={departments:['name','code'],work_types:['name'],unions:['name','code'],activity_catalog:['name'],job_grades:[]};
      const ACTIVE_DEFAULT=new Set(['departments','work_types','unions','activity_catalog','work_shifts','job_grades','labor_rules','union_food_rules','union_cost_rules']);
      const ADMIN_WRITE=new Set(['departments','work_types','app_parameters','work_shifts','unions','union_cost_rules','activity_catalog','labor_rules','union_food_rules','job_grades','profiles','employee_directory','employee_compensation']);
      const TABLES=['departments','profiles','work_types','app_parameters','overtime_requests','request_history','attachments','notifications','audit_log','work_shifts','unions','union_cost_rules','employee_compensation','activity_catalog','overtime_cost_snapshots','labor_rules','union_food_rules','salary_history','union_assignments','job_grades','manager_signatures','employee_directory','user_settings'];
      const REL={overtime_requests:{work_types:['work_type_id','work_types'],departments:['department_id','departments'],profiles:['employee_id','profiles']},profiles:{departments:['department_id','departments']},request_history:{profiles:['actor_id','profiles']},attachments:{profiles:['owner_id','profiles']}};
      const APPROVED=['approved','pending_execution','validated','closed'];
      const uid=()=>(crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16)}));
      const nowISO=()=>new Date().toISOString();
      const clone=x=>x===undefined?undefined:(x===null?null:JSON.parse(JSON.stringify(x)));
      const pkOf=t=>PK[t]||'id';
      const tnorm=t=>{const s=String(t||'');return /^\d{2}:\d{2}$/.test(s)?s+':00':s};
      const todayISO_=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
      const addDay=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
      class DbError extends Error{constructor(m,code){super(m);this.code=code}}
      const fail=(m,code)=>{throw new DbError(m,code)};
      let db=null;

      // ---------- Datos iniciales ----------
      function seed(){
        const t0=nowISO(),d={v:DB_VERSION,seq:{notifications:0,request_history:0,audit_log:0,filing:0},files:{},auth_users:[]};
        TABLES.forEach(t=>d[t]=[]);
        const dep={id:uid(),name:'Pruebas',code:'PRB',active:true,created_at:t0,created_by:null};d.departments.push(dep);
        [['Jornada diurna','Trabajo entre 6:00 a. m. y 7:00 p. m. (art. 160 CST, modificado por la Ley 2466 de 2025). Se asigna automáticamente.'],['Jornada nocturna','Trabajo entre 7:00 p. m. y 6:00 a. m. Generalmente genera recargo nocturno, de acuerdo con las condiciones legales aplicables. Se asigna automáticamente.']]
          .forEach(([name,description])=>d.work_types.push({id:uid(),name,description,active:true,created_at:t0,created_by:null}));
        [['max_hours_per_request',null,'Límite institucional configurable. null significa no definido.'],['allowed_file_types',['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],'Tipos MIME permitidos para soportes'],['max_file_size_mb',10,'Tamaño máximo por soporte'],['approval_comment_required',false,'Exigir observación al aprobar'],['execution_max_approved',false,'Impedir que las horas ejecutadas superen las aprobadas'],['immediate_manager_name','Prueba Jefe','Nombre del jefe inmediato que se imprime en el formato de horas extras'],
          ['food_allowance_values',{breakfast:null,lunch:null,dinner:null},'Valor (COP) de cada auxilio de alimentación. null = sin parametrizar.'],['aux_breakfast_minutes_before',60,'Desayuno: minutos laborados antes del inicio de la jornada habitual.'],['aux_dinner_minutes_after',120,'Comida: minutos laborados después del fin de la jornada habitual.'],['require_professional_validation',false,'Exigir validación favorable del profesional antes de que el jefe apruebe.'],
          ['finance_access_manager',true,'Permite al rol Jefe consultar el análisis financiero de su dependencia.'],['finance_access_professional',true,'Permite al rol Profesional consultar el análisis financiero.'],['finance_alert_increase_pct',20,'Umbral (%) de alerta por incremento del costo frente al periodo anterior.'],['finance_monthly_budget',null,'Presupuesto mensual (COP) de horas extras y auxilios. null = sin presupuesto.'],['finance_extra_concepts',[],'Conceptos económicos adicionales como porcentaje del salario base.'],['union_self_service',true,'Permite al funcionario elegir su sindicato la primera vez.']]
          .forEach(([key,value,description])=>d.app_parameters.push({key,value,description,updated_at:t0,updated_by:null}));
        [['A','L-V=7:00a.m. - 6:00p.m. (A=12:00m a 2:00p.m.)',[1,2,3,4,5],'07:00:00','18:00:00','12:00:00','14:00:00'],['B','L-V=6:30a.m. - 4:30p.m. (A=11:30m a 12:30p.m.)',[1,2,3,4,5],'06:30:00','16:30:00','11:30:00','12:30:00'],['D','L-V=7:00a.m. - 5:00p.m. (A=12:00m a 1:00p.m.)',[1,2,3,4,5],'07:00:00','17:00:00','12:00:00','13:00:00'],['E','L-V=7:00a.m. - 4:00p.m. (Sin hora de almuerzo)',[1,2,3,4,5],'07:00:00','16:00:00',null,null],['F','L-V=8:00a.m. - 6:00p.m. (A=12:30m a 1:30p.m.)',[1,2,3,4,5],'08:00:00','18:00:00','12:30:00','13:30:00'],['I','L-S=6:00a.m. - 2:00p.m. (Sin hora de almuerzo)',[1,2,3,4,5,6],'06:00:00','14:00:00',null,null],['J','L-D=6:00a.m. - 6:00p.m. (Sin hora de almuerzo)',[1,2,3,4,5,6,7],'06:00:00','18:00:00',null,null],['K','L-V=7:30a.m. - 5:30p.m. (A=12:00m a 1:00p.m.)',[1,2,3,4,5],'07:30:00','17:30:00','12:00:00','13:00:00']]
          .forEach(([code,description,weekdays,start_time,end_time,lunch_start,lunch_end])=>d.work_shifts.push({code,description,weekdays,start_time,end_time,lunch_start,lunch_end,works_holidays:false,active:true,created_at:t0}));
        const un1={id:uid(),name:'Sintraelecol',code:'SINTRAELECOL',active:true,created_at:t0,created_by:null},un2={id:uid(),name:'Siproessa',code:'SIPROESSA',active:true,created_at:t0,created_by:null};d.unions.push(un1,un2);
        d.union_food_rules.push({id:uid(),union_id:un1.id,valid_from:'2026-01-01',valid_to:null,amount:27000,notes:'Valor inicial de referencia',active:true,created_at:t0,created_by:null},{id:uid(),union_id:un2.id,valid_from:'2026-01-01',valid_to:null,amount:23235,notes:'Valor inicial de referencia',active:true,created_at:t0,created_by:null});
        ACTS.forEach(([name,group_name,sort_order])=>d.activity_catalog.push({id:uid(),name,group_name,is_operational:group_name==='Operación y gestión comercial',active:true,sort_order,created_at:t0}));
        const rd={base:{mode:'half_up',decimals:0},rate:{mode:'floor',decimals:0},total:{mode:'half_up',decimals:0}};
        [['2025-07-01','2025-07-14',46,230,'21:00:00',0.80,1423500,'Jornada de 46 h. Recargo dominical/festivo del 80 % desde el 1/07/2025. Noche desde las 9:00 p. m. hasta el 24/12/2025.'],['2025-07-15','2025-12-24',44,220,'21:00:00',0.80,1423500,'Jornada de 44 h desde el 15/07/2025.'],['2025-12-25','2026-06-30',44,220,'19:00:00',0.80,1750905,'Periodo nocturno desde las 7:00 p. m. desde el 25/12/2025. Salario mínimo 2026 de referencia.'],['2026-07-01','2026-07-14',44,220,'19:00:00',0.90,1750905,'Recargo dominical/festivo del 90 % desde el 1/07/2026.'],['2026-07-15',null,42,210,'19:00:00',0.90,1750905,'Jornada de 42 h y divisor de 210 horas desde el 15/07/2026. El recargo dominical/festivo sube al 100 % el 1/07/2027: registrar una nueva vigencia.']]
          .forEach(([valid_from,valid_to,weekly_hours,monthly_divisor,night_start,holiday_surcharge,reference_salary,notes])=>d.labor_rules.push({id:uid(),valid_from,valid_to,weekly_hours,monthly_divisor,night_start,night_end:'06:00:00',night_surcharge:0.35,extra_day:0.25,extra_night:0.75,holiday_surcharge,reference_salary,rate_mode:'auto',manual_rates:null,manual_source:null,rounding:rd,legal_status:'pending',source:'Ley 2101 de 2021 · Ley 2466 de 2025 · CST arts. 168 y 179',notes,active:true,created_at:t0,created_by:null}));
        [['Profesional 1',['E','1','2','3','4']],['Profesional 2',['E','1','2','3','4']],['Profesional 3',['E','1','2','3','4']],['Profesional 4',['E','1','3']],['Técnico',['12','16','17','18']],['Calificado',['6','7','11']],['Altamente Calificado',['13','14','15']],['No Calificado',['2','3']]]
          .forEach(([position_name,gs])=>gs.forEach(grade=>d.job_grades.push({id:uid(),position_name,grade,active:true,created_at:t0})));
        // Usuarios de prueba (uno por rol). Contraseñas locales de prueba.
        const jg=d.job_grades.find(x=>x.position_name==='Técnico'&&x.grade==='12');
        [['90000001','Prueba Funcionario','prueba.funcionario@prueba-essa.local','Func#Prueba2026','employee'],['90000002','Prueba Profesional','prueba.profesional@prueba-essa.local','Prof#Prueba2026','professional'],['90000003','Prueba Jefe','prueba.jefe@prueba-essa.local','Jefe#Prueba2026','manager'],['90000004','Prueba Administrador','prueba.admin@prueba-essa.local','Admin#Prueba2026','admin']].forEach(([doc,name,email,pass,role])=>{
          const id=uid();
          d.auth_users.push({id,email,password:pass,email_confirmed_at:t0,must_change_password:false,last_sign_in_at:null,created_at:t0,full_name:name});
          d.profiles.push({id,full_name:name,document_number:doc,email,position_kind:role==='employee'?'Técnico':null,job_title:role==='employee'?'Técnico':null,role,department_id:dep.id,active:true,shift_code:role==='employee'?'A':null,union_id:role==='employee'?un2.id:null,job_grade_id:role==='employee'&&jg?jg.id:null,hire_date:'2024-01-15',created_at:t0,updated_at:t0});
          d.employee_directory.push({id:uid(),document_number:doc,full_name:name,email,department_name:'Pruebas',position_name:null,grade:null,hire_date:'2024-01-15',base_salary:null,salary_valid_from:null,schedule_label:null,union_code:null,food_allowance_ref:null,app_role:role,active:true,source:'prueba',profile_id:id,linked_at:t0,loaded_at:t0});
          if(role==='employee'){
            d.salary_history.push({id:uid(),employee_id:id,salary:2500000,valid_from:'2026-01-01',valid_to:null,reason:'Salario de prueba (modo local)',changed_by:null,created_at:t0});
            d.employee_compensation.push({profile_id:id,base_salary:2500000,updated_at:t0,updated_by:null});
            d.union_assignments.push({id:uid(),employee_id:id,union_id:un2.id,valid_from:'2026-01-01',valid_to:null,reason:'Asignación de prueba (modo local)',changed_by:null,created_at:t0});
          }
        });
        return d;
      }
      function load(){let raw=null;try{raw=JSON.parse(localStorage.getItem(DB_KEY)||'null')}catch(_){raw=null}db=raw&&raw.v===DB_VERSION?raw:seed();TABLES.forEach(t=>{if(!Array.isArray(db[t]))db[t]=[]});if(!db.files)db.files={};if(!db.seq)db.seq={notifications:0,request_history:0,audit_log:0,filing:0};if(!raw||raw.v!==DB_VERSION)persist()}
      function persist(){try{localStorage.setItem(DB_KEY,JSON.stringify(db))}catch(e){console.warn('No se pudo guardar la base local',e)}}

      // ---------- Sesión y permisos ----------
      const sessionUid=()=>{try{return localStorage.getItem(SES_KEY)||null}catch(_){return null}};
      const meProfile=()=>{const id=sessionUid();return id?db.profiles.find(p=>p.id===id&&p.active!==false)||null:null};
      const myRole=()=>meProfile()?.role||null;
      const isAdminR=()=>myRole()==='admin';
      const toUser=u=>u?{id:u.id,aud:'authenticated',role:'authenticated',email:u.email,email_confirmed_at:u.email_confirmed_at,last_sign_in_at:u.last_sign_in_at,app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:u.full_name,must_change_password:!!u.must_change_password},created_at:u.created_at}:null;
      function canSeeRequest(r,me){if(!me||!r)return false;if(me.role==='admin'||me.role==='professional')return true;if(r.employee_id===me.id)return true;return me.role==='manager'&&!!me.department_id&&me.department_id===r.department_id}
      function readRows(table,me){
        let rows=table==='approved_overtime_v'?db.overtime_requests.filter(r=>APPROVED.includes(r.status)&&r.approved_hours!=null):db[table];
        if(!rows)return null;
        if(!me)return [];
        switch(table){
          case 'overtime_requests':case 'approved_overtime_v':return rows.filter(r=>canSeeRequest(r,me));
          case 'request_history':case 'attachments':return rows.filter(x=>canSeeRequest(db.overtime_requests.find(r=>r.id===x.request_id),me));
          case 'notifications':return rows.filter(n=>n.recipient_id===me.id);
          case 'audit_log':case 'employee_directory':case 'salary_history':case 'employee_compensation':case 'union_cost_rules':case 'overtime_cost_snapshots':return me.role==='admin'?rows:[];
          case 'user_settings':return rows.filter(x=>x.user_id===me.id);
          case 'profiles':return me.role==='employee'?rows.filter(p=>p.id===me.id):rows;
          case 'activity_catalog':return me.role==='admin'?rows:rows.filter(a=>a.active!==false);
          default:return rows;
        }
      }

      // ---------- Consulta (compatible con la API de supabase-js usada por el aplicativo) ----------
      const splitTop=s=>{const out=[];let d=0,cur='';for(const ch of s){if(ch==='(')d++;if(ch===')')d--;if(ch===','&&d===0){out.push(cur.trim());cur='';continue}cur+=ch}if(cur.trim())out.push(cur.trim());return out};
      function project(table,row,sel){
        if(!row)return row;
        if(!sel||sel.trim()==='*')return clone(row);
        const out={};
        for(const p of splitTop(sel)){
          if(p==='*'){Object.assign(out,clone(row));continue}
          const m=/^([a-z_]+)(?:!([a-z_]+))?\(([\s\S]*)\)$/.exec(p);
          if(m){const rel=REL[table]?.[m[1]];const target=rel?db[rel[1]].find(x=>x[pkOf(rel[1])]===row[rel[0]]):null;out[m[1]]=target?project(rel[1],target,m[3]):null}
          else out[p]=clone(row[p]);
        }
        return out;
      }
      const cmp=(a,b)=>{if(a==null&&b==null)return 0;if(a==null)return 1;if(b==null)return -1;if(typeof a==='number'&&typeof b==='number')return a-b;return String(a).localeCompare(String(b),'es',{numeric:false})};
      class Query{
        constructor(table){this.t=table;this.op='select';this.sel='*';this.filters=[];this.orders=[];this.lim=null;this.mode=null;this.payload=null;this.ret=false;this.retSel='*';this.conflict=null}
        select(s='*'){if(this.op==='select')this.sel=s;else{this.ret=true;this.retSel=s}return this}
        insert(p){this.op='insert';this.payload=p;return this}
        update(p){this.op='update';this.payload=p;return this}
        upsert(p,o){this.op='upsert';this.payload=p;this.conflict=o?.onConflict||null;return this}
        delete(){this.op='delete';return this}
        eq(c,v){this.filters.push(r=>r[c]===v);return this}
        neq(c,v){this.filters.push(r=>r[c]!==v);return this}
        gt(c,v){this.filters.push(r=>r[c]!=null&&r[c]>v);return this}
        gte(c,v){this.filters.push(r=>r[c]!=null&&r[c]>=v);return this}
        lt(c,v){this.filters.push(r=>r[c]!=null&&r[c]<v);return this}
        lte(c,v){this.filters.push(r=>r[c]!=null&&r[c]<=v);return this}
        in(c,vs){const s=new Set(vs||[]);this.filters.push(r=>s.has(r[c]));return this}
        is(c,v){this.filters.push(r=>v===null?r[c]==null:r[c]===v);return this}
        match(o){Object.entries(o||{}).forEach(([k,v])=>this.filters.push(r=>r[k]===v));return this}
        order(c,o){this.orders.push([c,o&&o.ascending===false?-1:1]);return this}
        limit(n){this.lim=n;return this}
        single(){this.mode='single';return this}
        maybeSingle(){this.mode='maybe';return this}
        then(res,rej){return Promise.resolve().then(()=>this.run()).then(res,rej)}
        run(){
          try{const rows=this.exec();return this.finish(rows)}
          catch(e){return {data:null,error:{message:e.message||String(e),code:e.code||'P0001'},status:400}}
        }
        finish(rows){
          if(this.mode==='single'){if(rows.length!==1)return {data:null,error:{message:'JSON object requested, multiple (or no) rows returned',code:'PGRST116'}};return {data:rows[0],error:null}}
          if(this.mode==='maybe'){if(rows.length>1)return {data:null,error:{message:'JSON object requested, multiple (or no) rows returned',code:'PGRST116'}};return {data:rows[0]||null,error:null}}
          return {data:rows,error:null};
        }
        exec(){
          const me=meProfile(),t=this.t;
          if(!sessionUid())fail('JWT expirado o sesión no válida','PGRST301');
          if(this.op==='select'){
            let rows=readRows(t,me);
            if(rows===null)fail(`relation "public.${t}" does not exist`,'42P01');
            rows=rows.filter(r=>this.filters.every(f=>f(r)));
            if(this.orders.length&&rows.length&&typeof rows[0].id==='number'){const d0=this.orders[0][1];rows=rows.slice().sort((a,b)=>d0*(a.id-b.id))}
            this.orders.slice().reverse().forEach(([c,dir])=>{rows=rows.slice().sort((a,b)=>dir*cmp(a[c],b[c]))});
            if(this.lim!=null)rows=rows.slice(0,this.lim);
            return rows.map(r=>project(t,r,this.sel));
          }
          if(!db[t])fail(`relation "public.${t}" does not exist`,'42P01');
          if(!this.allowed(t,me))fail(`new row violates row-level security policy for table "${t}"`,'42501');
          const out=[];
          if(this.op==='insert'||this.op==='upsert'){
            const list=Array.isArray(this.payload)?this.payload:[this.payload];
            for(const p of list){
              const key=pkOf(t),conf=this.conflict||key;
              const ex=this.op==='upsert'?db[t].find(r=>String(conf).split(',').every(c=>r[c.trim()]===p[c.trim()])):null;
              if(ex){Object.assign(ex,clone(p));if('updated_at' in ex)ex.updated_at=nowISO();out.push(ex)}
              else out.push(this.insertRow(t,p,me));
            }
          }else{
            const rows=db[t].filter(r=>this.filters.every(f=>f(r))&&(t!=='notifications'||r.recipient_id===me.id));
            if(this.op==='update'){for(const r of rows){this.beforeUpdate(t,r,this.payload);Object.assign(r,clone(this.payload));if('updated_at' in r&&!('updated_at' in this.payload))r.updated_at=nowISO();out.push(r)}}
            else{for(const r of rows){db[t].splice(db[t].indexOf(r),1);out.push(r)}}
          }
          persist();
          return this.ret?out.map(r=>project(t,r,this.retSel)):[];
        }
        allowed(t,me){
          if(!me)return false;
          if(t==='notifications'&&(this.op==='update'||this.op==='delete'))return true;
          if(t==='user_settings')return true;
          if(ADMIN_WRITE.has(t))return me.role==='admin';
          return false;
        }
        insertRow(t,p,me){
          const row=clone(p),key=pkOf(t);
          if(row[key]==null){if(SEQ.has(t))row[key]=++db.seq[t];else if(!(key in PK))row[key]=uid()}
          if(!row.created_at&&!['app_parameters','employee_compensation','user_settings','overtime_cost_snapshots'].includes(t))row.created_at=nowISO();
          if(ACTIVE_DEFAULT.has(t)&&row.active==null)row.active=true;
          if((t in PK)&&row[key]!=null&&db[t].some(x=>x[key]===row[key]))fail(`duplicate key value violates unique constraint "${t}_pkey"`,'23505');
          (UNIQUE[t]||[]).forEach(c=>{if(row[c]!=null&&db[t].some(x=>x[c]!=null&&String(x[c]).toLowerCase()===String(row[c]).toLowerCase()))fail(`duplicate key value violates unique constraint "${t}_${c}_key"`,'23505')});
          if(t==='departments'||t==='work_types'){if(String(row.name||'').trim().length<2)fail('El nombre debe tener al menos 2 caracteres','23514')}
          db[t].push(row);return row;
        }
        beforeUpdate(t,r,patch){
          (UNIQUE[t]||[]).forEach(c=>{if(patch[c]!=null&&db[t].some(x=>x!==r&&x[c]!=null&&String(x[c]).toLowerCase()===String(patch[c]).toLowerCase()))fail(`duplicate key value violates unique constraint "${t}_${c}_key"`,'23505')});
          if(t==='profiles'){
            if('union_id' in patch&&patch.union_id!==r.union_id&&patch.union_id){unionHistory(r.id,patch.union_id,todayISO_(),'Cambio de sindicato',sessionUid())}
            if('role' in patch&&patch.role!==r.role&&r.id===sessionUid())fail('No puedes cambiar tu propio rol','42501');
            if('active' in patch&&patch.active===false&&r.id===sessionUid())fail('No puedes desactivar tu propia cuenta','42501');
            if(patch.role==='manager'&&!(patch.department_id??r.department_id))fail('El rol Jefe exige una dependencia asignada','23514');
          }
        }
      }

      // ---------- Utilidades de negocio ----------
      const addAudit=(actor,action,entity_type,entity_id,old_data,new_data)=>db.audit_log.push({id:++db.seq.audit_log,actor_id:actor||null,action,entity_type,entity_id:entity_id==null?null:String(entity_id),old_data:old_data===undefined?null:clone(old_data),new_data:new_data===undefined?null:clone(new_data),created_at:nowISO()});
      const addNotif=(recipient_id,request_id,title,message)=>db.notifications.push({id:++db.seq.notifications,recipient_id,request_id,title,message,read_at:null,created_at:nowISO()});
      const addHistory=(request_id,from_status,to_status,comment,approved_hours,actor_id,extra)=>db.request_history.push({id:++db.seq.request_history,request_id,from_status:from_status||null,to_status,comment:comment||null,approved_hours:approved_hours??null,executed_hours:null,actor_id,created_at:nowISO(),...(extra||{})});
      const param=(k,def)=>{const x=db.app_parameters.find(p=>p.key===k);return x?x.value:def};
      const trimS=s=>String(s??'').trim();
      function unionHistory(empId,unionId,from,reason,by){
        const cur=db.union_assignments.filter(a=>a.employee_id===empId).sort((a,b)=>cmp(b.valid_from,a.valid_from))[0];
        if(cur&&cur.valid_to==null&&cur.valid_from<from)cur.valid_to=addDay(from,-1);
        db.union_assignments.push({id:uid(),employee_id:empId,union_id:unionId,valid_from:from,valid_to:null,reason,changed_by:by||null,created_at:nowISO()});
      }
      function computeAux(r){
        try{
          const emp=db.profiles.find(p=>p.id===r.employee_id),shift=db.work_shifts.find(s=>s.code===emp?.shift_code)||null;
          const params=Object.fromEntries(db.app_parameters.map(p=>[p.key,p.value]));
          const res=computeFoodAllowances({execution_date:r.execution_date,start_time:r.start_time,end_time:r.end_time},shift,auxRuleParams(params));
          applyAuxResult(r,res);
        }catch(e){console.warn('Auxilios:',e)}
      }
      function foodSnapshot(r){
        try{
          const src={profiles:db.profiles,unions:db.unions,unionRules:db.union_cost_rules,laborRules:db.labor_rules,salaryHistory:db.salary_history,unionAssignments:db.union_assignments,unionFoodRules:db.union_food_rules,compensation:{},parameters:Object.fromEntries(db.app_parameters.map(p=>[p.key,p.value])),isHoliday:isColombianHoliday};
          const v=foodValuesSnapshot({breakfast:r.aux_breakfast,lunch:r.aux_lunch,dinner:r.aux_dinner},src.parameters,{r,ctx:src});
          return v||null;
        }catch(e){return null}
      }
      const hoursBetween=(date,s,e)=>{const a=new Date(`${date}T${tnorm(s)}`),b=new Date(`${date}T${tnorm(e)}`);if(b<=a)b.setDate(b.getDate()+1);return Math.round((b-a)/36e5*100)/100};
      const rangeOf=r=>{const a=new Date(`${r.execution_date}T${tnorm(r.start_time)}`),b=new Date(`${r.execution_date}T${tnorm(r.end_time)}`);if(b<=a)b.setDate(b.getDate()+1);return [a.getTime(),b.getTime()]};

      // ---------- Funciones RPC ----------
      const RPC={
        save_overtime_request({p_request_id,p_data,p_submit}){
          const me=meProfile();if(!me)fail('Sesión no válida');
          if(['admin','professional','manager'].includes(me.role))fail('Los roles Administrador, Jefe y Profesional no pueden crear solicitudes de horas extras para sí mismos');
          if(!me.department_id)fail('El perfil no tiene una dependencia activa asignada');
          const d=p_data||{};
          if(!db.work_types.some(w=>w.id===d.work_type_id&&w.active!==false))fail('El tipo de jornada no es válido o está inactivo');
          if(!/^\d{4}-\d{2}-\d{2}$/.test(d.execution_date||''))fail('La fecha de ejecución no es válida');
          const st=tnorm(d.start_time),en=tnorm(d.end_time);
          if(!/^\d{2}:\d{2}:\d{2}$/.test(st)||!/^\d{2}:\d{2}:\d{2}$/.test(en))fail('El horario no es válido');
          const selected=Array.isArray(d.selected_activities)?d.selected_activities:(()=>{try{return JSON.parse(d.selected_activities||'[]')}catch(_){return []}})();
          if(!selected.length)fail('Debe seleccionar al menos una actividad');
          const reason=trimS(d.reason),justification=trimS(d.justification),activities=trimS(d.activities);
          if(reason.length<5||reason.length>500)fail('El motivo debe tener entre 5 y 500 caracteres');
          if(justification.length<10||justification.length>3000)fail('La justificación debe tener entre 10 y 3000 caracteres');
          if(activities.length<10||activities.length>4000)fail('Las actividades deben tener entre 10 y 4000 caracteres');
          const hours=hoursBetween(d.execution_date,st,en);
          if(hours<=0||hours>24)fail('La duración debe ser mayor a 0 y máximo de 24 horas');
          const mx=param('max_hours_per_request',null);if(mx!=null&&hours>Number(mx))fail(`La duración supera el límite institucional configurado de ${mx} horas`);
          const cand={execution_date:d.execution_date,start_time:st,end_time:en},[s1,e1]=rangeOf(cand);
          if(p_submit&&db.overtime_requests.some(x=>x.employee_id===me.id&&x.id!==p_request_id&&!['rejected','cancelled'].includes(x.status)&&(()=>{const [s2,e2]=rangeOf(x);return s2<e1&&s1<e2})()))fail('Existe una solicitud duplicada o que se solapa con este horario');
          const status=p_submit?'pending':'draft',t=nowISO();let r;
          if(!p_request_id){
            db.seq.filing++;const n=db.seq.filing;
            r={id:uid(),filing_number:'HE-'+String(n).padStart(Math.max(2,String(n).length),'0'),employee_id:me.id,department_id:me.department_id,execution_date:d.execution_date,start_time:st,end_time:en,hours_requested:hours,work_type_id:d.work_type_id,reason,selected_activities:selected,justification,activities,observations:null,status,approved_hours:null,executed_hours:null,admin_observations:null,submitted_at:p_submit?t:null,approved_at:null,validated_at:null,closed_at:null,created_at:t,updated_at:t,aux_breakfast:false,aux_lunch:false,aux_dinner:false,aux_status:null,aux_detail:null,aux_values:null,aux_ack:null,professional_result:null,professional_comment:null,professional_by:null,professional_at:null,decided_by:null,decided_at:null,approval_signature_id:null};
            computeAux(r);db.overtime_requests.push(r);
            addHistory(r.id,null,status,p_submit?'Solicitud creada y enviada':'Borrador guardado',null,me.id);
            if(p_submit)notifyReviewers(r);
          }else{
            r=db.overtime_requests.find(x=>x.id===p_request_id&&x.employee_id===me.id);
            if(!r)fail('Solicitud no encontrada');
            if(!['draft','returned'].includes(r.status))fail('La solicitud ya no admite edición');
            const old=r.status;
            Object.assign(r,{execution_date:d.execution_date,start_time:st,end_time:en,hours_requested:hours,work_type_id:d.work_type_id,reason,selected_activities:selected,justification,activities,status,submitted_at:p_submit?t:r.submitted_at,updated_at:t});
            computeAux(r);
            if(status==='pending'&&['draft','returned'].includes(old)){Object.assign(r,{professional_result:null,professional_comment:null,professional_by:null,professional_at:null,decided_by:null,decided_at:null});notifyReviewers(r)}
            addHistory(r.id,old,status,p_submit?'Solicitud corregida y enviada':'Borrador actualizado',null,me.id);
          }
          addAudit(me.id,p_submit?'submit':'save_draft','overtime_request',r.id,undefined,r);
          return clone(r);
        },
        perform_request_action({p_request_id,p_action,p_comment,p_hours}){
          const me=meProfile();if(!me)fail('Sesión no válida o usuario inactivo');
          const r=db.overtime_requests.find(x=>x.id===p_request_id);if(!r)fail('Solicitud no encontrada');
          const old=r.status,role=me.role,comment=trimS(p_comment)||null;
          const map={start_review:'in_review',professional_validate:'in_review',return:'returned',approve:'approved',reject:'rejected',close:'closed',cancel:'cancelled'};
          const ns=map[p_action];if(!ns)fail('Acción no permitida');
          const mgr=role==='manager'&&!!me.department_id&&me.department_id===r.department_id;
          const allowed=p_action==='cancel'?(me.id===r.employee_id||role==='admin'):['start_review','professional_validate','close'].includes(p_action)?role==='professional':p_action==='return'?(role==='professional'||mgr):['approve','reject'].includes(p_action)?mgr:false;
          if(!allowed){if(role==='admin'&&p_action!=='cancel')fail('El administrador no interviene en la aprobación ni en el cierre de solicitudes');fail('Tu rol no tiene permiso para realizar esta acción')}
          if(p_action!=='cancel'&&r.employee_id===me.id)fail('No puedes gestionar tus propias solicitudes');
          if((p_action==='start_review'&&old!=='pending')||(['professional_validate','return','approve','reject'].includes(p_action)&&!['pending','in_review'].includes(old))||(p_action==='close'&&!['approved','pending_execution','validated'].includes(old))||(p_action==='cancel'&&!['draft','pending','returned'].includes(old)))fail('Transición de estado no permitida');
          if(p_action==='professional_validate'&&r.professional_result==='favorable')fail('La solicitud ya tiene validación favorable del profesional');
          if(['return','reject'].includes(p_action)&&(comment||'').length<5)fail('Debe registrar una observación de al menos 5 caracteres');
          if(p_action==='approve'&&param('require_professional_validation',false)&&r.professional_result!=='favorable')fail('La solicitud requiere validación favorable del profesional antes de aprobarse');
          if(p_action==='approve'&&param('approval_comment_required',false)&&(comment||'').length<5)fail('La configuración exige una observación para aprobar');
          const hrs=p_hours==null||p_hours===''?null:Number(p_hours);
          if(p_action==='approve'&&(hrs==null||!Number.isFinite(hrs)||hrs<0||hrs>Number(r.hours_requested)))fail('Las horas aprobadas deben estar entre 0 y las horas solicitadas');
          const t=nowISO(),pro=p_action==='professional_validate'||(p_action==='return'&&role==='professional');
          r.status=ns;r.admin_observations=comment||r.admin_observations;
          if(p_action==='approve'){r.approved_hours=hrs;r.approved_at=t}
          if(p_action==='close')r.closed_at=t;
          if(p_action==='professional_validate'){r.professional_result='favorable'}else if(p_action==='return'&&role==='professional'){r.professional_result='no_favorable'}
          if(pro){r.professional_comment=comment;r.professional_by=me.id;r.professional_at=t}
          if(['approve','reject'].includes(p_action)){r.decided_by=me.id;r.decided_at=t}
          if(p_action==='approve'){
            const sig=db.manager_signatures.find(s=>s.manager_id===me.id&&!s.retired_at);r.approval_signature_id=sig?sig.id:null;
            r.aux_values=foodSnapshot(r);
          }else if(!APPROVED.includes(ns))r.approval_signature_id=null;
          r.updated_at=t;
          addHistory(r.id,old,ns,comment||({professional_validate:'Validación profesional: favorable',approve:'Solicitud aprobada por el jefe',reject:'Solicitud rechazada por el jefe',close:'Solicitud cerrada'})[p_action]||null,p_action==='approve'?hrs:null,me.id);
          addAudit(me.id,p_action,'overtime_request',r.id,{status:old},r);
          if(p_action==='approve'){
            r.status='closed';r.closed_at=nowISO();r.updated_at=r.closed_at;
            addHistory(r.id,'approved','closed','Cierre automático por aprobación del jefe',hrs,me.id);
            addAudit(me.id,'auto_close','overtime_request',r.id,{status:'approved'},r);
          }
          addNotif(r.employee_id,r.id,'Solicitud actualizada',p_action==='approve'?`La solicitud ${r.filing_number} fue aprobada por el jefe y quedó cerrada`:`La solicitud ${r.filing_number} cambió a ${ns}`);
          if(p_action==='professional_validate')db.profiles.filter(p=>p.role==='manager'&&p.active!==false&&p.department_id===r.department_id).forEach(p=>addNotif(p.id,r.id,'Solicitud validada por el profesional',`La solicitud ${r.filing_number} está lista para decisión del jefe`));
          return clone(r);
        },
        delete_overtime_request({p_request_id}){
          if(!isAdminR())fail('Se requieren permisos administrativos');
          const r=db.overtime_requests.find(x=>x.id===p_request_id);if(!r)fail('Solicitud no encontrada');
          addAudit(sessionUid(),'delete','overtime_request',r.id,r);
          db.overtime_requests=db.overtime_requests.filter(x=>x.id!==r.id);
          ['request_history','attachments','notifications','overtime_cost_snapshots'].forEach(t=>{db[t]=db[t].filter(x=>x.request_id!==r.id)});
          return {id:r.id,filing_number:r.filing_number,deleted:true};
        },
        update_own_position({p_kind,p_custom}){
          const me=meProfile();if(!me)fail('Sesión no válida');
          if(!['Técnico','Profesional','Otro'].includes(p_kind))fail('Tipo de cargo no válido');
          const v=p_kind==='Otro'?trimS(p_custom):p_kind;
          if(p_kind==='Otro'&&(v.length<3||v.length>80))fail('El cargo debe tener entre 3 y 80 caracteres');
          me.position_kind=p_kind;me.job_title=v;me.updated_at=nowISO();return clone(me);
        },
        save_my_settings({p_settings}){
          const me=meProfile();if(!me)fail('Sesión no válida');
          const s=p_settings;if(!s||typeof s!=='object'||Array.isArray(s))fail('Los parámetros deben enviarse como un objeto');
          const v={};
          Object.entries(s).forEach(([k,x])=>{
            if(k==='theme'){if(!['light','dark'].includes(x))fail('Tema no válido (light o dark)')}
            else if(k==='sidebar_compact'){if(typeof x!=='boolean')fail('El parámetro sidebar_compact debe ser verdadero o falso')}
            else if(k==='format_receiver'){if(typeof x!=='string')fail('El nombre de quien recibe debe ser un texto');x=x.replace(/\s+/g,' ').trim();if(x.length>120)fail('El nombre de quien recibe no puede superar los 120 caracteres');if(/[<>\u0000-\u001f]/.test(x))fail('El nombre de quien recibe contiene caracteres no permitidos')}
            else fail('Parámetro no permitido: '+k);
            v[k]=x;
          });
          let row=db.user_settings.find(u=>u.user_id===me.id);
          if(!row){row={user_id:me.id,settings:{},updated_at:nowISO()};db.user_settings.push(row)}
          row.settings={...row.settings,...v};row.updated_at=nowISO();return clone(row.settings);
        },
        set_own_union({p_union}){
          const me=meProfile();if(!me)fail('Sesión no válida');
          if(param('union_self_service',true)===false)fail('La selección de sindicato por parte del funcionario está deshabilitada');
          if(me.union_id)fail('Ya tienes un sindicato asignado; solicita el cambio al administrador');
          if(!db.unions.some(u=>u.id===p_union&&u.active!==false))fail('El sindicato seleccionado no está disponible');
          unionHistory(me.id,p_union,todayISO_(),'Selección del propio funcionario',me.id);me.union_id=p_union;me.updated_at=nowISO();return clone(me);
        },
        admin_change_union({p_employee,p_union,p_valid_from,p_reason}){
          if(!isAdminR())fail('Se requieren permisos administrativos');
          if(!p_union||!db.unions.some(u=>u.id===p_union&&u.active!==false))fail('El sindicato seleccionado no existe o está inactivo');
          if(!p_valid_from||p_valid_from>todayISO_())fail('La fecha del cambio no puede ser futura');
          if(trimS(p_reason).length<5)fail('Registra el motivo del cambio (mínimo 5 caracteres)');
          const e=db.profiles.find(p=>p.id===p_employee);if(!e)fail('Funcionario no encontrado');
          if(e.union_id===p_union)fail('El funcionario ya pertenece a ese sindicato');
          const mx=db.union_assignments.filter(a=>a.employee_id===p_employee).map(a=>a.valid_from).sort().pop();
          if(mx&&p_valid_from<=mx)fail(`La fecha del cambio debe ser posterior al inicio de la asignación actual (${mx})`);
          unionHistory(p_employee,p_union,p_valid_from,trimS(p_reason),sessionUid());e.union_id=p_union;e.updated_at=nowISO();return clone(e);
        },
        admin_set_salary({p_employee,p_salary,p_valid_from,p_reason}){
          if(!isAdminR())fail('Se requieren permisos administrativos');
          const sal=Number(p_salary);if(!Number.isFinite(sal)||sal<=0)fail('El salario debe ser mayor que cero');
          if(!p_valid_from)fail('Indica desde qué fecha rige el salario');
          if(trimS(p_reason).length<5)fail('Registra el motivo del cambio (mínimo 5 caracteres)');
          if(!db.profiles.some(p=>p.id===p_employee))fail('Funcionario no encontrado');
          const cur=db.salary_history.filter(s=>s.employee_id===p_employee).sort((a,b)=>cmp(b.valid_from,a.valid_from))[0];
          if(cur){if(p_valid_from<=cur.valid_from)fail(`La fecha de vigencia debe ser posterior al inicio del salario actual (${cur.valid_from})`);if(Number(cur.salary)===sal)fail('El salario nuevo es igual al vigente');cur.valid_to=addDay(p_valid_from,-1)}
          const r={id:uid(),employee_id:p_employee,salary:sal,valid_from:p_valid_from,valid_to:null,reason:trimS(p_reason),changed_by:sessionUid(),created_at:nowISO()};db.salary_history.push(r);
          const today=todayISO_(),now=db.salary_history.filter(s=>s.employee_id===p_employee&&s.valid_from<=today&&(!s.valid_to||s.valid_to>=today)).sort((a,b)=>cmp(b.valid_from,a.valid_from))[0];
          const comp=db.employee_compensation.find(c=>c.profile_id===p_employee);
          if(comp){comp.base_salary=now?now.salary:comp.base_salary;comp.updated_at=nowISO();comp.updated_by=sessionUid()}else db.employee_compensation.push({profile_id:p_employee,base_salary:now?now.salary:null,updated_at:nowISO(),updated_by:sessionUid()});
          addAudit(sessionUid(),'set_salary','employee_compensation',p_employee,cur?{salary:cur.salary,valid_from:cur.valid_from}:null,{salary:sal,valid_from:p_valid_from});
          return clone(r);
        },
        admin_set_union_food({p_union,p_amount,p_valid_from,p_notes}){
          if(!isAdminR())fail('Se requieren permisos administrativos');
          const amt=Number(p_amount);if(!Number.isFinite(amt)||amt<=0)fail('El valor del auxilio debe ser mayor que cero');
          if(!p_valid_from)fail('Indica desde qué fecha rige el valor');
          if(!db.unions.some(u=>u.id===p_union))fail('Sindicato no encontrado');
          const cur=db.union_food_rules.filter(f=>f.union_id===p_union&&f.active!==false).sort((a,b)=>cmp(b.valid_from,a.valid_from))[0];
          if(cur){if(p_valid_from<=cur.valid_from)fail(`La vigencia debe ser posterior al inicio del valor actual (${cur.valid_from})`);if(!cur.valid_to||cur.valid_to>=p_valid_from)cur.valid_to=addDay(p_valid_from,-1)}
          const r={id:uid(),union_id:p_union,valid_from:p_valid_from,valid_to:null,amount:amt,notes:trimS(p_notes)||null,active:true,created_at:nowISO(),created_by:sessionUid()};db.union_food_rules.push(r);
          addAudit(sessionUid(),'set_food_rule','union_food_rules',p_union,cur?{amount:cur.amount,valid_from:cur.valid_from}:null,{amount:amt,valid_from:p_valid_from});
          return clone(r);
        },
        acknowledge_food_allowance({p_request,p_breakfast,p_lunch,p_dinner,p_note}){
          const me=meProfile();if(!me||!['admin','professional'].includes(me.role))fail('Tu rol no puede reconocer auxilios');
          const r=db.overtime_requests.find(x=>x.id===p_request);if(!r)fail('Solicitud no encontrada');
          if(!APPROVED.includes(r.status))fail('Solo se reconocen auxilios de solicitudes aprobadas');
          r.aux_ack={breakfast:!!p_breakfast,lunch:!!p_lunch,dinner:!!p_dinner,by:me.id,at:nowISO(),note:trimS(p_note)||null};
          addAudit(me.id,'acknowledge_aux','overtime_requests',r.id,undefined,r.aux_ack);return clone(r);
        },
        recompute_open_food_allowances(){
          let n=0;db.overtime_requests.filter(r=>['draft','pending','in_review','returned'].includes(r.status)||(!r.aux_status&&!APPROVED.includes(r.status))).forEach(r=>{computeAux(r);n++});return n;
        },
        recalculate_overtime_costs(){
          let aux=0;db.overtime_requests.filter(r=>['draft','pending','in_review','returned'].includes(r.status)||!r.aux_status).forEach(r=>{computeAux(r);aux++});
          return {costs:0,aux};
        },
        finance_cost_feed(){return []},
        finance_salary_reference(){
          const me=meProfile();if(!me||me.role==='employee')return [];
          return db.salary_history.filter(s=>me.role!=='manager'||db.profiles.find(p=>p.id===s.employee_id)?.department_id===me.department_id).map(s=>({employee_id:s.employee_id,salary:s.salary,valid_from:s.valid_from,valid_to:s.valid_to}));
        },
        admin_set_manager_signature({p_manager,p_storage_path,p_width,p_height,p_size,p_sha256}){
          if(!isAdminR())fail('Se requieren permisos administrativos');
          const m=db.profiles.find(p=>p.id===p_manager);if(!m||m.role!=='manager')fail('El usuario seleccionado no tiene el rol Jefe');
          if(!db.files['manager-signatures/'+p_storage_path])fail('El archivo de la firma no se encontró en el almacenamiento');
          const cur=db.manager_signatures.find(s=>s.manager_id===p_manager&&!s.retired_at);
          if(cur){cur.retired_at=nowISO();cur.retired_by=sessionUid();cur.retire_reason='replaced'}
          const v=db.manager_signatures.filter(s=>s.manager_id===p_manager).reduce((a,s)=>Math.max(a,s.version),0)+1;
          const r={id:uid(),manager_id:p_manager,manager_name:m.full_name,version:v,storage_path:p_storage_path,mime_type:'image/png',width:p_width,height:p_height,size_bytes:p_size,sha256:p_sha256||null,created_at:nowISO(),created_by:sessionUid(),retired_at:null,retired_by:null,retire_reason:null};
          db.manager_signatures.push(r);addAudit(sessionUid(),cur?'replace_signature':'set_signature','manager_signatures',r.id,null,{manager_id:p_manager,version:v});return clone(r);
        },
        admin_remove_manager_signature({p_manager}){
          if(!isAdminR())fail('Se requieren permisos administrativos');
          const cur=db.manager_signatures.find(s=>s.manager_id===p_manager&&!s.retired_at);if(!cur)fail('El jefe no tiene una firma vigente');
          cur.retired_at=nowISO();cur.retired_by=sessionUid();cur.retire_reason='removed';addAudit(sessionUid(),'remove_signature','manager_signatures',cur.id,{manager_id:p_manager,version:cur.version},null);return clone(cur);
        },
        admin_directory_status(){
          if(!isAdminR())fail('Se requieren permisos administrativos');
          return db.employee_directory.map(d=>{const u=db.auth_users.find(x=>x.email.toLowerCase()===d.email.toLowerCase());return {directory_id:d.id,document_number:d.document_number,full_name:d.full_name,email:d.email,app_role:d.app_role,department_name:d.department_name,has_account:!!u,account_confirmed:!!u,profile_id:d.profile_id,linked_at:d.linked_at,active:d.active}}).sort((a,b)=>cmp(a.full_name,b.full_name));
        },
        admin_account_status(){
          if(!isAdminR())fail('Se requieren permisos administrativos');
          return db.profiles.map(p=>{const u=db.auth_users.find(x=>x.id===p.id);return u?{profile_id:p.id,email:u.email,email_confirmed:true,must_change_password:!!u.must_change_password,last_sign_in_at:u.last_sign_in_at}:null}).filter(Boolean);
        },
        admin_sync_directory(){
          if(!isAdminR())fail('Se requieren permisos administrativos');
          return {linked:db.employee_directory.filter(d=>d.profile_id).length,pending_accounts:db.employee_directory.filter(d=>!d.profile_id).length,detail:[]};
        },
        admin_password_events({p_user}){
          if(!isAdminR())fail('Se requieren permisos administrativos');
          return db.audit_log.filter(a=>a.entity_type==='profiles'&&a.entity_id===String(p_user)&&String(a.action).startsWith('password_')).sort((a,b)=>cmp(b.created_at,a.created_at)).slice(0,10).map(a=>({created_at:a.created_at,action:a.action,actor_name:db.profiles.find(p=>p.id===a.actor_id)?.full_name||'Sistema',detail:a.new_data||{}}));
        },
        log_password_event({p_event}){
          const me=meProfile();if(!me)fail('Sesión no válida');
          if(!['password_changed','password_recovery_completed','password_change_reauth_failed'].includes(p_event))fail('Evento no válido');
          addAudit(me.id,p_event,'profiles',me.id,undefined,{});return null;
        }
      };
      function notifyReviewers(r){
        db.profiles.filter(p=>p.role==='professional'&&p.active!==false).forEach(p=>addNotif(p.id,r.id,'Solicitud por validar',`La solicitud ${r.filing_number} requiere validación del profesional`));
        db.profiles.filter(p=>p.role==='manager'&&p.active!==false&&p.department_id===r.department_id).forEach(p=>addNotif(p.id,r.id,'Nueva solicitud de tu dependencia',`Se recibió la solicitud ${r.filing_number}`));
      }
      async function rpc(name,args){
        try{
          if(!sessionUid()&&name!=='nothing')fail('JWT expirado o sesión no válida','PGRST301');
          const fn=RPC[name];if(!fn)fail(`Could not find the function public.${name} in the schema cache`,'PGRST202');
          const data=fn(args||{});persist();return {data:data===undefined?null:clone(data),error:null};
        }catch(e){persist();return {data:null,error:{message:e.message||String(e),code:e.code||'P0001'}}}
      }

      // ---------- Autenticación ----------
      const listeners=new Set();
      const emit=(ev,session)=>listeners.forEach(cb=>{try{cb(ev,session)}catch(e){console.error(e)}});
      const sessionObj=()=>{const u=db.auth_users.find(x=>x.id===sessionUid());return u?{access_token:'local',token_type:'bearer',user:toUser(u)}:null};
      const auth={
        async getSession(){return {data:{session:sessionObj()},error:null}},
        async getUser(){const s=sessionObj();return {data:{user:s?s.user:null},error:null}},
        onAuthStateChange(cb){listeners.add(cb);return {data:{subscription:{unsubscribe(){listeners.delete(cb)}}}}},
        async signInWithPassword({email,password}){
          const u=db.auth_users.find(x=>x.email.toLowerCase()===String(email||'').trim().toLowerCase());
          if(!u||u.password!==password)return {data:{user:null,session:null},error:{name:'AuthApiError',status:400,message:'Invalid login credentials'}};
          u.last_sign_in_at=nowISO();persist();
          try{localStorage.setItem(SES_KEY,u.id)}catch(_){}
          const s=sessionObj();setTimeout(()=>emit('SIGNED_IN',s),0);
          return {data:{user:s.user,session:s},error:null};
        },
        async updateUser({password,data}){
          const u=db.auth_users.find(x=>x.id===sessionUid());if(!u)return {data:{user:null},error:{name:'AuthSessionMissingError',message:'Auth session missing!'}};
          if(password!=null){if(String(password).length<8)return {data:{user:null},error:{name:'AuthWeakPasswordError',message:'Password should be at least 8 characters'}};u.password=String(password)}
          if(data&&typeof data==='object'){if('must_change_password' in data)u.must_change_password=!!data.must_change_password;if('full_name' in data)u.full_name=data.full_name}
          persist();return {data:{user:toUser(u)},error:null};
        },
        async signOut(opts){
          if(opts&&opts.scope==='others')return {error:null};
          try{localStorage.removeItem(SES_KEY)}catch(_){}
          setTimeout(()=>emit('SIGNED_OUT',null),0);return {error:null};
        },
        async resetPasswordForEmail(){return {data:{},error:{message:'El envío de correos no está disponible en modo local.'}}}
      };

      // ---------- Almacenamiento (archivos en el navegador) ----------
      const blobToDataURL=b=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>rej(fr.error);fr.readAsDataURL(b)});
      const storage={from(bucket){
        return {
          async upload(path,blob){try{if(db.files[bucket+'/'+path])return {data:null,error:{message:'The resource already exists'}};db.files[bucket+'/'+path]=await blobToDataURL(blob);persist();return {data:{path},error:null}}catch(e){return {data:null,error:{message:e.message}}}},
          async download(path){const u=db.files[bucket+'/'+path];if(!u)return {data:null,error:{message:'Object not found'}};return {data:await (await fetch(u)).blob(),error:null}},
          async remove(paths){(paths||[]).forEach(p=>delete db.files[bucket+'/'+p]);persist();return {data:[],error:null}},
          async createSignedUrl(path){const u=db.files[bucket+'/'+path];if(!u)return {data:null,error:{message:'Object not found'}};return {data:{signedUrl:u},error:null}}
        };
      }};

      // ---------- Funciones de borde (admin-set-password) ----------
      const functions={async invoke(name,{body}={}){
        if(name!=='admin-set-password')return {data:null,error:{message:'Función no disponible en modo local'}};
        const me=meProfile();if(!me||me.role!=='admin')return {data:{error:'Se requieren permisos de administrador.'},error:null};
        const u=db.auth_users.find(x=>x.id===body?.user_id),p=db.profiles.find(x=>x.id===body?.user_id);
        if(!u||!p)return {data:{error:'La cuenta no existe.'},error:null};
        if(u.id===me.id)return {data:{error:'No puedes cambiar tu propia contraseña desde aquí.'},error:null};
        if(body.mode==='generate'){
          const abc='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',num='23456789',pick=s=>s[crypto.getRandomValues(new Uint32Array(1))[0]%s.length];
          let pw='';for(let i=0;i<9;i++)pw+=pick(abc);pw+=pick(num)+pick(num)+pick('#@$%');
          u.password=pw;u.must_change_password=true;addAudit(me.id,'password_admin_temp_assigned','profiles',u.id,undefined,{mode:'generate'});persist();return {data:{temporary_password:pw},error:null};
        }
        if(body.mode==='document'){
          const doc=String(p.document_number||'').trim();if(doc.length<6)return {data:{error:'Este perfil no tiene una cédula válida.'},error:null};
          u.password=doc;u.must_change_password=true;addAudit(me.id,'password_admin_temp_assigned','profiles',u.id,undefined,{mode:'document'});persist();return {data:{ok:true},error:null};
        }
        return {data:{error:'La generación de enlaces no está disponible en modo local. Usa «Generar contraseña temporal».'},error:null};
      }};

      load();
      return {
        createClient(){return {from:t=>new Query(t),rpc,auth,storage,functions,channel(){const ch={on(){return ch},subscribe(){return ch},unsubscribe(){}};return ch},removeChannel(){}}},
        reset(){try{localStorage.removeItem(DB_KEY);localStorage.removeItem(SES_KEY)}catch(_){}location.reload()}
      };
    }
    function config(){return {url:DEPLOYMENT_CONFIG.url||localStorage.getItem('essa_supabase_url')||'',key:DEPLOYMENT_CONFIG.anonKey||localStorage.getItem('essa_supabase_anon')||''}}
    function initClient(){const c=config();
      // Sin URL/clave de Supabase: modo local (base de datos en este navegador, con los 4 usuarios de prueba).
      if(!c.url||!c.key){try{state.client=createLocalBackend().createClient();state.localMode=true;return true}catch(e){console.error(e);return false}}
      try{state.client=window.supabase.createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return true}catch(e){console.error(e);return false}}
    async function boot(){purgeLegacyDemoStorage();ensureFallbackLibraries();iconRefresh();$('#todayText').textContent=new Intl.DateTimeFormat('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date());bindStatic();setupAuthUI();setupTheme();initDB();window.addEventListener('online',networkUI);window.addEventListener('offline',networkUI);networkUI();const hashParams=new URLSearchParams(location.hash.replace(/^#/,'')),urlType=hashParams.get('type'),urlErr=hashParams.get('error_code')||hashParams.get('error');
      const hasClient=initClient();if(!hasClient)return;
      state.client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT')showAuth();if(event==='PASSWORD_RECOVERY')startLinkPasswordFlow()});
      const {data:{session}}=await state.client.auth.getSession();
      if(urlErr&&!session){toast('El enlace no es válido o ya venció. Pide a un administrador que genere uno nuevo.','warning');try{history.replaceState(null,'',location.pathname+location.search)}catch(_){}}
      if(session){
        if(urlType==='recovery'||urlType==='invite')startLinkPasswordFlow();
        if(!state.linkFlow)await enterApp(session.user);
      }}
    function setSidebarCompact(compact){const app=$('#appView'),btn=$('#sidebarCollapseBtn');app.classList.toggle('sidebar-compact',compact);if(btn){btn.setAttribute('aria-pressed',String(compact));btn.setAttribute('aria-label',compact?'Expandir menú':'Compactar menú');btn.title=compact?'Expandir menú':'Compactar menú';btn.innerHTML=`<i data-lucide="${compact?'panel-left-open':'panel-left-close'}"></i>`}localStorage.setItem('essa_sidebar_compact',compact?'1':'0');iconRefresh();setTimeout(()=>{if(!$('#page-dashboard')?.classList.contains('active'))return;state.charts.hours?.resize();state.charts.status?.resize()},280)}
    function toggleSidebarCompact(){const next=!$('#appView').classList.contains('sidebar-compact');setSidebarCompact(next);saveUserSetting('sidebar_compact',next)}
    const HOLIDAY_FILTER_IDS=new Set(['requestDateFrom','requestDateTo','reportFrom','reportTo','auxFrom','auxTo']);
    const nextMonday=date=>{const d=new Date(date.getFullYear(),date.getMonth(),date.getDate(),12),add=(8-d.getDay())%7;d.setDate(d.getDate()+add);return d};
    function easterSunday(year){const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;return new Date(year,month-1,day,12)}
    function colombianHolidays(year){const list=[],add=(date,name)=>list.push({date:toISODate(date),name}),fixed=(m,d,name)=>add(new Date(year,m-1,d,12),name),monday=(m,d,name)=>add(nextMonday(new Date(year,m-1,d,12)),name);fixed(1,1,'Año Nuevo');monday(1,6,'Día de los Reyes Magos');monday(3,19,'Día de San José');fixed(5,1,'Día del Trabajo');monday(6,29,'San Pedro y San Pablo');if(year>=2026)monday(7,9,'Nuestra Señora del Rosario de Chiquinquirá');fixed(7,20,'Día de la Independencia');fixed(8,7,'Batalla de Boyacá');monday(8,15,'Asunción de la Virgen');monday(10,12,'Día de la Raza');monday(11,1,'Todos los Santos');monday(11,11,'Independencia de Cartagena');fixed(12,8,'Inmaculada Concepción');fixed(12,25,'Navidad');const easter=easterSunday(year),relative=(days,name)=>{const d=new Date(easter);d.setDate(d.getDate()+days);add(d,name)};relative(-3,'Jueves Santo');relative(-2,'Viernes Santo');relative(43,'Ascensión del Señor');relative(64,'Corpus Christi');relative(71,'Sagrado Corazón de Jesús');return new Map(list.map(x=>[x.date,x.name]))}
    let activeDateClose=null;
    const parseISODate=value=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value||'');return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12):null};
    const toISODate=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    const formatDisplayDate=value=>{const d=parseISODate(value);return d?dfNumeric().format(d):'dd/mm/aaaa'};
    // Cada selector (fecha, hora, lista, actividades) registraba escuchas en window/document que nunca se retiraban:
    // cada apertura de una ventana acumulaba 12 escuchas más (y retenía los nodos del DOM). Ahora se registran con su control
    // "dueño" y se retiran (a) al cerrar/reemplazar una ventana (sweepGlobals) y (b) como respaldo, la primera vez que se
    // dispara el evento después de que el dueño salió del documento.
    const globalBindings=new Set();
    function onGlobal(target,type,owner,fn,opts){const rec={target,type,opts,owner,h:null};rec.h=e=>{if(!owner.isConnected){target.removeEventListener(type,rec.h,opts);globalBindings.delete(rec);return}fn(e)};globalBindings.add(rec);target.addEventListener(type,rec.h,opts)}
    function sweepGlobals(){globalBindings.forEach(r=>{if(!r.owner.isConnected){r.target.removeEventListener(r.type,r.h,r.opts);globalBindings.delete(r)}})}
    function enhanceTemporalPickers(root=document){
      const dates=[];if(root.matches?.('input.control[type="date"]'))dates.push(root);root.querySelectorAll?.('input.control[type="date"]').forEach(x=>dates.push(x));
      dates.forEach(input=>{if(input.dataset.customDate){input._dateRefresh?.();return}input.dataset.customDate='1';input.classList.add('native-date-hidden');input.tabIndex=-1;const wrapper=document.createElement('div');wrapper.className=`date-field${input.classList.contains('hidden')?' hidden':''}`;input.parentNode.insertBefore(wrapper,input);wrapper.appendChild(input);const trigger=document.createElement('button');trigger.type='button';trigger.className='date-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');trigger.innerHTML=`<span class="date-trigger-value"></span><span class="date-trigger-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 2v3M17 2v3M3 9h18"></path><rect x="3" y="4" width="18" height="17" rx="2"></rect></svg></span>`;wrapper.appendChild(trigger);let view=parseISODate(input.value)||new Date(),focused=parseISODate(input.value)||new Date(),picker=null;const showHolidays=HOLIDAY_FILTER_IDS.has(input.id),holidayCache=new Map(),holidaysFor=year=>{if(!holidayCache.has(year))holidayCache.set(year,colombianHolidays(year));return holidayCache.get(year)};
        const sync=()=>{trigger.querySelector('.date-trigger-value').textContent=formatDisplayDate(input.value);trigger.classList.toggle('is-placeholder',!input.value);trigger.classList.remove('is-invalid');wrapper.classList.toggle('has-value',!!input.value)};
        const position=()=>{if(!picker)return;const r=trigger.getBoundingClientRect(),pr=picker.getBoundingClientRect(),spaceBelow=innerHeight-r.bottom-10,up=spaceBelow<pr.height&&r.top>spaceBelow;picker.style.left=`${Math.max(8,Math.min(r.left,innerWidth-pr.width-8))}px`;picker.style.top=up?`${Math.max(8,r.top-pr.height-5)}px`:`${Math.min(innerHeight-pr.height-8,r.bottom+5)}px`};
        const close=(focus=false)=>{picker?.remove();picker=null;wrapper.classList.remove('is-open');trigger.setAttribute('aria-expanded','false');if(activeDateClose===close)activeDateClose=null;if(focus)trigger.focus()};
        const select=date=>{input.value=toISODate(date);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));view=new Date(date);focused=new Date(date);sync();close(true)};
        const render=()=>{if(!picker)return;const monthStart=new Date(view.getFullYear(),view.getMonth(),1,12),gridStart=new Date(monthStart),offset=(monthStart.getDay()+6)%7;gridStart.setDate(monthStart.getDate()-offset);const selected=parseISODate(input.value),today=parseISODate(toISODate(new Date())),monthName=dfMonthYear().format(view);picker.innerHTML=`<div class="date-picker-head"><button type="button" class="date-picker-nav prev-year" aria-label="Año anterior">«</button><button type="button" class="date-picker-nav prev" aria-label="Mes anterior">‹</button><div class="date-picker-title"><strong>${esc(monthName)}</strong><span>Selecciona una fecha</span></div><button type="button" class="date-picker-nav next" aria-label="Mes siguiente">›</button><button type="button" class="date-picker-nav next-year" aria-label="Año siguiente">»</button></div><div class="date-weekdays">${['Lu','Ma','Mi','Ju','Vi','Sa','Do'].map(x=>`<span>${x}</span>`).join('')}</div><div class="date-grid"></div><div class="holiday-touch-note" aria-live="polite"></div><div class="date-picker-foot ${showHolidays?'has-holidays':''}"><button type="button" class="date-quick clear">Limpiar</button>${showHolidays?'<span class="holiday-legend"><span class="holiday-legend-dot"></span> Festivo Colombia</span>':''}<button type="button" class="date-quick today">Hoy</button></div>`;const grid=picker.querySelector('.date-grid'),touchNote=picker.querySelector('.holiday-touch-note');for(let i=0;i<42;i++){const d=new Date(gridStart);d.setDate(gridStart.getDate()+i);const iso=toISODate(d),holidayName=showHolidays?holidaysFor(d.getFullYear()).get(iso):null,fullDate=holidayName?dfFullDate().format(d):'';const b=document.createElement('button');b.type='button';b.className='date-day';b.dataset.date=iso;b.append(document.createTextNode(String(d.getDate())));b.classList.toggle('other-month',d.getMonth()!==view.getMonth());b.classList.toggle('today',today&&iso===toISODate(today));b.classList.toggle('selected',selected&&iso===toISODate(selected));if(holidayName){b.classList.add('holiday');b.setAttribute('aria-label',`${holidayName}, ${fullDate}`);b.title=`${holidayName} · ${fullDate}`;const tip=document.createElement('span');tip.className='holiday-tooltip';tip.textContent=`${holidayName} · ${fullDate}`;b.appendChild(tip);b.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&b.dataset.touchSeen!=='1'){b.dataset.touchSeen='1';b.dataset.touchPending='1';touchNote.textContent=`${holidayName} · ${fullDate}. Toca nuevamente para seleccionar.`;touchNote.classList.add('visible')}})}b.tabIndex=iso===toISODate(focused)?0:-1;b.onclick=e=>{if(b.dataset.touchPending==='1'){delete b.dataset.touchPending;e.preventDefault();return}select(d)};grid.appendChild(b)}picker.querySelector('.prev').onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1,12);focused=new Date(view);render();position()};picker.querySelector('.next').onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1,12);focused=new Date(view);render();position()};picker.querySelector('.prev-year').onclick=()=>{view=new Date(view.getFullYear()-1,view.getMonth(),1,12);focused=new Date(view);render();position()};picker.querySelector('.next-year').onclick=()=>{view=new Date(view.getFullYear()+1,view.getMonth(),1,12);focused=new Date(view);render();position()};picker.querySelector('.today').onclick=()=>select(new Date());picker.querySelector('.clear').onclick=()=>{input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));sync();close(true)};position()};
        const open=()=>{if(input.disabled||input.readOnly)return;if(activeDateClose&&activeDateClose!==close)activeDateClose();activeSelectClose?.();activeTimeClose?.();activeActivityClose?.();activeDateClose=close;view=parseISODate(input.value)||new Date();focused=parseISODate(input.value)||new Date();picker=document.createElement('div');picker.className='date-picker';picker.setAttribute('role','dialog');picker.setAttribute('aria-label','Selector de fecha');document.body.appendChild(picker);wrapper.classList.add('is-open');trigger.setAttribute('aria-expanded','true');render();picker.onkeydown=handleCalendarKey;setTimeout(()=>picker?.querySelector('.date-day[tabindex="0"]')?.focus(),20)};
        const handleCalendarKey=e=>{if(!picker&&['Enter',' ','ArrowDown'].includes(e.key)){e.preventDefault();open();return}if(!picker)return;if(e.key==='Escape'){e.preventDefault();close(true);return}const moves={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7};if(moves[e.key]){e.preventDefault();focused.setDate(focused.getDate()+moves[e.key]);view=new Date(focused);render();picker.onkeydown=handleCalendarKey;picker.querySelector(`[data-date="${toISODate(focused)}"]`)?.focus()}else if(e.key==='PageUp'||e.key==='PageDown'){e.preventDefault();focused=new Date(focused.getFullYear(),focused.getMonth()+(e.key==='PageDown'?1:-1),Math.min(focused.getDate(),28),12);view=new Date(focused);render();picker.onkeydown=handleCalendarKey;picker.querySelector(`[data-date="${toISODate(focused)}"]`)?.focus()}else if(e.key==='Enter'||e.key===' '){e.preventDefault();select(focused)}};trigger.onclick=()=>picker?close():open();trigger.onkeydown=handleCalendarKey;input.addEventListener('input',sync);input.addEventListener('invalid',e=>{e.preventDefault();trigger.classList.add('is-invalid');trigger.focus()});input._dateRefresh=sync;sync();onGlobal(window,'resize',wrapper,()=>picker&&position());onGlobal(document,'scroll',wrapper,()=>picker&&position(),true);onGlobal(document,'pointerdown',wrapper,e=>{if(picker&&!wrapper.contains(e.target)&&!picker.contains(e.target))close()},true)
      });
      enhanceTimePickers(root)
    }
    // Selector de hora personalizado · interfaz de 12 horas (A. M. / P. M.).
    // El valor interno del formulario y de los registros se conserva en formato normalizado de 24 h (HH:MM).
    let activeTimeClose=null;
    const pad2=n=>String(n).padStart(2,'0');
    const AMPM=['A. M.','P. M.'];
    const parseTimeValue=v=>{const m=/^(\d{1,2}):(\d{2})/.exec(v||'');if(!m)return null;const h=Number(m[1]),mi=Number(m[2]);return h<24&&mi<60?{h,m:mi}:null};
    const to12=h24=>({h12:h24%12||12,p:h24>=12?1:0});
    const fmtTime12=v=>{const t=parseTimeValue(v);if(!t)return '—';const {h12,p}=to12(t.h);return `${pad2(h12)}:${pad2(t.m)} ${AMPM[p]}`};
    const fmtRange12=r=>`${fmtTime12(r.start_time)} – ${fmtTime12(r.end_time)}${r.end_time<=r.start_time?' (+1 día)':''}`;
    const svgIcon=d=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const TIME_ICON=svgIcon('<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>');
    const SUN_ICON=svgIcon('<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>');
    const MOON_ICON=svgIcon('<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"></path>');
    const PERIOD_ICON=[SUN_ICON,MOON_ICON];
    function enhanceTimePickers(root=document){
      const times=[];if(root.matches?.('input.control[type="time"]'))times.push(root);root.querySelectorAll?.('input.control[type="time"]').forEach(x=>times.push(x));
      times.forEach(input=>{
        if(input.dataset.customTime){input._timeRefresh?.();return}
        input.dataset.customTime='1';input.classList.add('native-date-hidden');input.tabIndex=-1;input.setAttribute('aria-hidden','true');
        const field=input.closest('.field'),labelEl=field?.querySelector('label'),labelText=(labelEl?.childNodes[0]?.textContent||'Hora').trim(),uid=(input.name||input.id||'time')+'-'+Math.random().toString(36).slice(2,7);
        const stepRaw=Number(input.step),stepMin=stepRaw>=60?Math.max(1,Math.round(stepRaw/60)):1,reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
        const hours=[...Array(12).keys()].map(i=>i+1),minutes=[...Array(60).keys()].filter(m=>m%stepMin===0);
        const wrapper=document.createElement('div');wrapper.className=`time-field${input.classList.contains('hidden')?' hidden':''}`;input.parentNode.insertBefore(wrapper,input);wrapper.appendChild(input);
        const trigger=document.createElement('button');trigger.type='button';trigger.className='time-trigger';trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
        trigger.innerHTML=`<span class="time-trigger-icon">${TIME_ICON}</span><span class="time-trigger-value"></span><span class="time-trigger-chevron">${svgIcon('<path d="m7 10 5 5 5-5"></path>')}</span>`;
        wrapper.appendChild(trigger);
        if(labelEl){labelEl.id=labelEl.id||`${uid}-label`;labelEl.style.cursor='pointer';labelEl.addEventListener('click',e=>{e.preventDefault();if(!trigger.disabled)trigger.focus()})}
        let picker=null,temp=null,activeCol='h';
        const cur=col=>col==='h'?temp.h%12||12:col==='m'?temp.m:(temp.h>=12?1:0);
        const setVal=(col,v)=>{if(col==='m')temp.m=v;else if(col==='h')temp.h=(v%12)+(temp.h>=12?12:0);else temp.h=(temp.h%12)+(v?12:0)};
        const sync=()=>{const t=parseTimeValue(input.value),valEl=trigger.querySelector('.time-trigger-value');if(t){const {h12,p}=to12(t.h);valEl.innerHTML=`${pad2(h12)}:${pad2(t.m)} <span class="time-ampm" data-p="${p?'pm':'am'}">${AMPM[p]}</span>`}else valEl.textContent='--:-- --';trigger.disabled=input.disabled;trigger.classList.toggle('is-placeholder',!t);trigger.classList.remove('is-invalid');wrapper.classList.toggle('has-value',!!t);trigger.setAttribute('aria-label',`${labelText}: ${t?fmtTime12(input.value):'sin seleccionar'}. Abrir selector de hora`)};
        const center=(list,smooth)=>{if(!list||list.classList.contains('is-period'))return;const sel=list.querySelector('[aria-selected="true"]');if(!sel)return;const max=list.scrollHeight-list.clientHeight,top=Math.max(0,Math.min(max,sel.offsetTop-list.clientHeight/2+sel.offsetHeight/2));list.scrollTo({top,behavior:smooth&&!reduceMotion?'smooth':'auto'})};
        const position=()=>{if(!picker)return;const r=trigger.getBoundingClientRect(),vw=innerWidth,vh=innerHeight,pw=Math.min(328,vw-16),lists=[...picker.querySelectorAll('.time-col-list')];picker.style.width=`${pw}px`;lists.forEach(l=>l.style.height='');let ph=picker.offsetHeight;const below=vh-r.bottom-8,above=r.top-8,room=Math.max(below,above)-6;if(ph>room&&lists.length){const base=lists[0].offsetHeight,h=Math.max(112,base-(ph-room));lists.forEach(l=>l.style.height=`${h}px`);ph=picker.offsetHeight;lists.forEach(l=>center(l,false))}let top;if(ph+6<=below)top=r.bottom+6;else if(ph+6<=above)top=r.top-ph-6;else top=Math.max(8,vh-ph-8);picker.style.left=`${Math.max(8,Math.min(r.left,vw-pw-8))}px`;picker.style.top=`${top}px`;picker.classList.toggle('is-above',top<r.top)};
        const setActiveCol=col=>{activeCol=col;picker?.querySelectorAll('.time-col').forEach(c=>c.classList.toggle('is-active',c.dataset.col===col));picker?.querySelectorAll('.time-display-seg').forEach(s=>s.classList.toggle('is-active',s.dataset.seg===col))};
        const refresh=(scroll=true,smooth=false)=>{if(!picker)return;const {h12,p}=to12(temp.h);picker.querySelector('[data-seg="h"]').textContent=pad2(h12);picker.querySelector('[data-seg="m"]').textContent=pad2(temp.m);const pill=picker.querySelector('.time-display-period');pill.dataset.p=p?'pm':'am';pill.innerHTML=`${PERIOD_ICON[p]}<span>${AMPM[p]}</span>`;picker.querySelector('.time-display').setAttribute('aria-label',`Hora seleccionada ${pad2(h12)}:${pad2(temp.m)} ${AMPM[p]}`);picker.querySelectorAll('.time-option').forEach(o=>{const on=Number(o.dataset.value)===cur(o.dataset.col);o.setAttribute('aria-selected',String(on));o.tabIndex=on?0:-1});picker.querySelectorAll('.time-chip').forEach(c=>c.classList.toggle('is-active',Number(c.dataset.quick)===temp.m));if(scroll)picker.querySelectorAll('.time-col-list').forEach(l=>center(l,smooth))};
        const focusCol=col=>{setActiveCol(col);picker?.querySelector(`.time-option[data-col="${col}"][aria-selected="true"]`)?.focus({preventScroll:true})};
        const close=(focus=false)=>{if(!picker)return;const p=picker;picker=null;p.classList.add('is-closing');setTimeout(()=>p.remove(),130);wrapper.classList.remove('is-open');trigger.setAttribute('aria-expanded','false');if(activeTimeClose===close)activeTimeClose=null;if(focus)trigger.focus({preventScroll:true})};
        const accept=()=>{if(!temp)return;const value=`${pad2(temp.h)}:${pad2(temp.m)}`,changed=input.value!==value;input.value=value;if(changed){input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}field?.classList.remove('is-invalid');sync();close(true);trigger.classList.remove('is-updated');void trigger.offsetWidth;trigger.classList.add('is-updated')};
        const build=()=>{const num2=(col,list)=>list.map(v=>`<button type="button" role="option" class="time-option" data-col="${col}" data-value="${v}" aria-label="${pad2(v)} ${col==='h'?'horas':'minutos'}">${pad2(v)}</button>`).join('');const quick=[0,15,30,45].filter(m=>m%stepMin===0);
          const periodOpts=[0,1].map(p=>`<button type="button" role="option" class="time-option" data-col="p" data-value="${p}" data-p="${p?'pm':'am'}" aria-label="${AMPM[p]}">${PERIOD_ICON[p]}<span>${AMPM[p]}</span></button>`).join('');
          picker.innerHTML=`<div class="time-picker-head"><div class="time-picker-heading"><span class="time-picker-badge">${TIME_ICON}</span><div><strong>${esc(labelText)}</strong><span>${input.value?'Formato de 12 horas · A. M. / P. M.':'Sugerencia según la hora actual · 12 horas'}</span></div></div><div class="time-display" role="group"><button type="button" class="time-display-seg" data-seg="h" aria-label="Editar horas"></button><span class="time-display-colon" aria-hidden="true">:</span><button type="button" class="time-display-seg" data-seg="m" aria-label="Editar minutos"></button><span class="time-display-period" aria-live="polite"></span></div></div><div class="time-columns"><div class="time-col" data-col="h"><span class="time-col-title" id="${uid}-h">Hora</span><div class="time-col-list" role="listbox" aria-labelledby="${uid}-h">${num2('h',hours)}</div></div><div class="time-col" data-col="m"><span class="time-col-title" id="${uid}-m">Minutos</span><div class="time-col-list" role="listbox" aria-labelledby="${uid}-m">${num2('m',minutes)}</div></div><div class="time-col" data-col="p"><span class="time-col-title" id="${uid}-p">Período</span><div class="time-col-list is-period" role="listbox" aria-labelledby="${uid}-p">${periodOpts}</div></div></div>${quick.length>1?`<div class="time-quick" role="group" aria-label="Minutos rápidos"><span class="time-quick-label">Rápido</span>${quick.map(m=>`<button type="button" class="time-chip" data-quick="${m}">:${pad2(m)}</button>`).join('')}</div>`:''}<div class="time-picker-foot"><button type="button" class="time-link time-now">${TIME_ICON}Ahora</button><div class="time-foot-actions"><button type="button" class="btn btn-ghost btn-modal time-cancel">Cancelar</button><button type="button" class="btn btn-primary btn-modal time-accept">${vectorIcon('check')} Aceptar</button></div></div>`;
          picker.querySelectorAll('.time-option').forEach(o=>{o.onclick=()=>{setVal(o.dataset.col,Number(o.dataset.value));setActiveCol(o.dataset.col);refresh(false);center(o.parentElement,true);o.focus({preventScroll:true})};o.ondblclick=accept});
          picker.querySelectorAll('.time-display-seg').forEach(s=>s.onclick=()=>focusCol(s.dataset.seg));
          picker.querySelectorAll('.time-chip').forEach(c=>c.onclick=()=>{temp.m=Number(c.dataset.quick);refresh(true,true);focusCol('m')});
          picker.querySelector('.time-now').onclick=()=>{const d=new Date();temp={h:d.getHours(),m:Math.floor(d.getMinutes()/stepMin)*stepMin};refresh(true,true)};
          picker.querySelector('.time-cancel').onclick=()=>close(true);picker.querySelector('.time-accept').onclick=accept;
          picker.addEventListener('focusin',e=>{const col=e.target.closest('.time-col')?.dataset.col;if(col)setActiveCol(col)});
          picker.addEventListener('keydown',handleKey)};
        const handleKey=e=>{if(!picker)return;if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return}
          if(e.key==='Tab'){const f=[...picker.querySelectorAll('button')].filter(b=>b.tabIndex>=0&&!b.disabled&&b.offsetParent!==null);if(!f.length)return;const first=f[0],last=f[f.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}return}
          const opt=e.target.closest?.('.time-option');if(!opt)return;const col=opt.dataset.col,list=[...picker.querySelectorAll(`.time-option[data-col="${col}"]`)],i=list.indexOf(opt),n=list.length,jump=col==='h'?3:Math.max(1,Math.round(10/stepMin));let next=null;
          if(/^[ap]$/i.test(e.key)&&!e.ctrlKey&&!e.metaKey&&!e.altKey){e.preventDefault();setVal('p',e.key.toLowerCase()==='p'?1:0);refresh(false);picker.querySelector(`.time-option[data-col="p"][aria-selected="true"]`)?.focus({preventScroll:true});return}
          if(e.key==='ArrowDown')next=(i+1)%n;else if(e.key==='ArrowUp')next=(i-1+n)%n;else if(e.key==='PageDown')next=Math.min(n-1,i+jump);else if(e.key==='PageUp')next=Math.max(0,i-jump);else if(e.key==='Home')next=0;else if(e.key==='End')next=n-1;
          else if(e.key==='ArrowRight'&&col!=='p'){e.preventDefault();focusCol(col==='h'?'m':'p');return}else if(e.key==='ArrowLeft'&&col!=='h'){e.preventDefault();focusCol(col==='p'?'m':'h');return}
          else if(e.key==='Enter'){e.preventDefault();accept();return}
          if(next!==null){e.preventDefault();list[next].click()}};
        const open=()=>{if(input.disabled||input.readOnly||picker)return;activeDateClose?.();activeSelectClose?.();activeActivityClose?.();if(activeTimeClose&&activeTimeClose!==close)activeTimeClose();activeTimeClose=close;const tr=trigger.getBoundingClientRect(),need=Math.min(440,innerHeight-16);if(innerHeight-tr.bottom-8<need&&tr.top-8<need)(field||trigger).scrollIntoView({block:'start',behavior:'auto'});const current=parseTimeValue(input.value),d=new Date();temp=current?{...current}:{h:d.getHours(),m:Math.floor(d.getMinutes()/stepMin)*stepMin};picker=document.createElement('div');picker.className='time-picker';picker.setAttribute('role','dialog');picker.setAttribute('aria-label',`Selector de ${labelText.toLowerCase()}`);document.body.appendChild(picker);build();wrapper.classList.add('is-open');trigger.setAttribute('aria-expanded','true');position();refresh(true,false);setActiveCol('h');requestAnimationFrame(()=>{if(picker){picker.querySelectorAll('.time-col-list').forEach(l=>center(l,false));focusCol('h')}})};
        trigger.onclick=()=>picker?close():open();
        trigger.onkeydown=e=>{if(!picker&&['Enter',' ','ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open()}};
        input.addEventListener('input',sync);input.addEventListener('change',sync);
        input.addEventListener('invalid',e=>{e.preventDefault();trigger.classList.add('is-invalid');trigger.focus()});
        input._timeRefresh=sync;sync();
        onGlobal(window,'resize',wrapper,()=>picker&&position());
        onGlobal(document,'scroll',wrapper,e=>{if(picker&&!(e.target instanceof Element&&picker.contains(e.target)))position()},true);
        onGlobal(document,'pointerdown',wrapper,e=>{if(picker&&!wrapper.contains(e.target)&&!picker.contains(e.target))close()},true);
      });
    }
    // ===== Tipo de jornada automático: diurna / nocturna =====
    // Art. 160 CST (modificado por la Ley 2466 de 2025, vigente desde el 25/12/2025):
    // diurno 06:00–19:00 · nocturno 19:00–06:00. Rangos en minutos desde las 00:00, editables en un único lugar.
    const JORNADA_BANDS=[{key:'night',from:0,to:360},{key:'day',from:360,to:1140},{key:'night',from:1140,to:1440}];
    const JORNADA_META={
      day:{label:'Jornada diurna',tone:'day',short:'diurna',range:'06:00 A. M. – 07:00 P. M.',match:/\bdiurn[oa]s?\b/,desc:'Trabajo entre 6:00 a. m. y 7:00 p. m. (art. 160 CST, modificado por la Ley 2466 de 2025). Se asigna automáticamente.',icon:'<circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>'},
      night:{label:'Jornada nocturna',tone:'night',short:'nocturna',range:'07:00 P. M. – 06:00 A. M. (+1 día)',match:/\bnocturn[oa]s?\b/,desc:'Trabajo entre 7:00 p. m. y 6:00 a. m. Generalmente genera recargo nocturno, de acuerdo con las condiciones legales aplicables. Se asigna automáticamente.',icon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"></path>'}
    };
    
    const JORNADA_IDLE_ICON='<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',JORNADA_ERROR_ICON='<path d="M12 3 2 21h20L12 3Z"></path><path d="M12 9v4M12 17h.01"></path>';
    const normText=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    // Clasifica por solape real del intervalo con cada franja (no solo por la hora de inicio).
    // Si el intervalo toca ambas franjas se asigna la de mayor duración; en empate, nocturna.
    // Si fin < inicio se interpreta como actividad que cruza la medianoche (ya permitido por la aplicación y el servidor).
    function classifyJornada(startV,endV){
      const s=parseTimeValue(startV),e=parseTimeValue(endV);if(!s||!e)return {status:'incomplete'};
      const a=s.h*60+s.m;let b=e.h*60+e.m;if(a===b)return {status:'invalid',reason:'equal'};
      const crosses=b<a;if(crosses)b+=1440;const totals={},order=[];
      for(let d=0;d<2;d++)JORNADA_BANDS.forEach(band=>{const overlap=Math.min(b,band.to+d*1440)-Math.max(a,band.from+d*1440);if(overlap>0){if(!(band.key in totals)){totals[band.key]=0;order.push(band.key)}totals[band.key]+=overlap}});
      const parts=order.map(k=>({key:k,minutes:totals[k]})),split=parts.length>1,tie=split&&totals.day===totals.night;
      const key=!split?order[0]:tie?'night':(totals.day>totals.night?'day':'night');
      return {status:'ok',key,parts,split,tie,crosses,minutes:b-a};
    }
    function resolveJornadaType(key){
      // Se respeta el catálogo: si «Jornada diurna/nocturna» existe, se usa solo si está activo.
      // Solo si no existe en el catálogo se reutiliza un tipo activo equivalente ya definido (p. ej. «Hora extra nocturna»).
      const meta=JORNADA_META[key],exact=state.workTypes.find(w=>normText(w.name)===normText(meta.label));
      if(exact)return exact.active?exact:null;
      return state.workTypes.find(w=>w.active&&meta.match.test(normText(w.name)))||null;
    }
    
    
    function updateJornada(form){
      const box=form.querySelector('#jornadaAuto'),hidden=form.querySelector('[name="work_type_id"]'),field=box?.closest('.field');if(!box||!hidden)return;
      const res=classifyJornada(form.start_time.value,form.end_time.value),prev=box.dataset.signature;let tone='idle',name='Se define automáticamente',detail='Selecciona la hora de inicio y de finalización.',icon=JORNADA_IDLE_ICON,id='',problem='';
      if(res.status==='invalid'){tone='error';name='Horario no válido';detail='La hora de finalización debe ser distinta a la de inicio.';icon=JORNADA_ERROR_ICON;problem=detail}
      else if(res.status==='ok'){
        const meta=JORNADA_META[res.key],type=resolveJornadaType(res.key);name=meta.label;icon=meta.icon;tone=meta.tone;
        if(res.split){const t=k=>num((res.parts.find(p=>p.key===k)?.minutes||0)/60),parts=res.parts.map(p=>`${JORNADA_META[p.key].short} ${t(p.key)} h`).join(' · ');detail=res.tie?`Abarca ${parts}. Con igual duración se clasifica como nocturna.`:`Abarca ${parts}. Predomina la ${meta.short}.`}
        else detail=`Franja ${meta.range}`;
        if(type)id=type.id;else{tone='warning';icon=JORNADA_ERROR_ICON;detail=`No existe «${meta.label}» activo en el catálogo. Pide al administrador que lo cree en Configuración → Tipos de jornada.`;problem=detail}
      }
      const signature=[tone,name,detail,id].join('|');box.dataset.tone=tone;box.classList.toggle('is-idle',tone==='idle');box.querySelector('.jornada-name').textContent=name;box.querySelector('.jornada-detail').textContent=detail;box.querySelector('.jornada-icon').innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`;
      box.setAttribute('aria-label',`Tipo de jornada automático: ${name}. ${detail}`);hidden.value=id;hidden.dataset.problem=problem;
      field?.classList.toggle('is-invalid',!!problem);
      if(prev!==undefined&&prev!==signature){box.classList.remove('is-updated');void box.offsetWidth;box.classList.add('is-updated')}box.dataset.signature=signature;
    }
    // ===== Restricción: el administrador no puede crear solicitudes de horas extras para sí mismo =====
    const ADMIN_SELF_REQUEST_MSG='Los roles Administrador, Jefe y Profesional no registran solicitudes de horas extras propias.';
    function currentRoleIsAdmin(){if(STAFF_ROLES.has(state.profile?.role))return true;return false}
    function blockAdminSelfRequest(){if(!currentRoleIsAdmin())return false;toast(ADMIN_SELF_REQUEST_MSG,'warning');return true}
    // ===== Temas visuales (claro por defecto / oscuro) =====
    // · Claro es el tema inicial. La elección se guarda POR USUARIO (clave = correo) para que en un equipo compartido
    //   la preferencia de una persona no cambie la de otra.
    // · «essa_theme_device» recuerda el último tema aplicado en este equipo y se usa solo para pintar la primera trama
    //   (pantalla de acceso o sesión recordada) sin parpadeos; el script del <head> lo aplica antes de mostrar nada.
    // · Una persona sin preferencia guardada entra siempre en claro, salvo que haya elegido tema en la pantalla de acceso.
    const Theme=(()=>{
      const DEVICE_KEY='essa_theme_device',USERS_KEY='essa_theme_users',DEFAULT='light',root=document.documentElement;
      let current=root.getAttribute('data-theme')==='dark'?'dark':'light',pending=null,user=null,loginChoice=null;
      const valid=t=>t==='dark'||t==='light';
      const norm=e=>String(e||'').trim().toLowerCase();
      const readUsers=()=>{try{const m=JSON.parse(localStorage.getItem(USERS_KEY)||'{}');return m&&typeof m==='object'?m:{}}catch(_){return{}}};
      const writeUsers=m=>{try{localStorage.setItem(USERS_KEY,JSON.stringify(m))}catch(_){}};
      const saveDevice=t=>{try{localStorage.setItem(DEVICE_KEY,t)}catch(_){}};
      const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
      function syncUI(shown){
        const dark=(shown||current)==='dark';
        document.querySelectorAll('.theme-switch').forEach(b=>{b.setAttribute('aria-checked',String(dark));b.title=dark?'Cambiar a modo claro':'Cambiar a modo oscuro'});
        const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',dark?'#0A1020':'#1D4ED8');
      }
      function commit(t){
        root.setAttribute('data-theme',t);root.style.colorScheme=t;current=t;pending=null;syncUI();
        try{const app=document.getElementById('appView');if(app&&!app.classList.contains('hidden'))rerenderChartsForTheme()}catch(_){}
        document.dispatchEvent(new CustomEvent('themechange',{detail:{theme:t}}));
      }
      function apply(t,animate){
        if(!valid(t))t=DEFAULT;
        if(t===current&&root.getAttribute('data-theme')===t){pending=null;syncUI();return}
        pending=t;syncUI(t);   // el interruptor responde al instante; el cambio de tema se anima a continuación
        if(animate&&!reduced()&&typeof document.startViewTransition==='function'){try{document.startViewTransition(()=>commit(t));return}catch(_){}}
        if(animate&&!reduced()){root.classList.add('theme-anim');commit(t);setTimeout(()=>root.classList.remove('theme-anim'),380);return}
        commit(t);
      }
      return{
        get:()=>current,
        // Cambio hecho por la persona usuaria con el control visual
        set(t){
          if(!valid(t))return;apply(t,true);saveDevice(t);
          if(user){const m=readUsers();m[user]=t;writeUsers(m);if(typeof this.onUserChange==='function')this.onUserChange(t)}else loginChoice=t;
        },
        onUserChange:null,
        toggle(){const base=pending||current;this.set(base==='dark'?'light':'dark')},
        // Al iniciar sesión (o restaurar una sesión): se aplica la preferencia de ESA persona
        // «remote» = preferencia guardada en la base de datos (user_settings): tiene prioridad sobre la copia local del equipo.
        enterUser(email,remote){
          user=norm(email)||null;if(!user)return;
          const m=readUsers();let t=m[user];
          if(valid(remote)){t=remote;if(m[user]!==remote){m[user]=remote;writeUsers(m)}}
          else if(!valid(t)){t=valid(loginChoice)?loginChoice:DEFAULT;if(valid(loginChoice)){m[user]=t;writeUsers(m)}}
          loginChoice=null;apply(t,false);saveDevice(t);
        },
        leaveUser(){user=null;loginChoice=null},
        init(){
          syncUI();
          window.addEventListener('storage',e=>{
            if(e.key===USERS_KEY&&user){const t=readUsers()[user];if(valid(t)&&t!==current)apply(t,false)}
            else if(e.key===DEVICE_KEY&&!user&&valid(e.newValue)&&e.newValue!==current)apply(e.newValue,false);
          });
        }
      };
    })();
    function setupTheme(){
      Theme.init();Theme.onUserChange=t=>saveUserSetting('theme',t);
      document.querySelectorAll('.theme-switch').forEach(b=>b.addEventListener('click',()=>Theme.toggle()));
    }
    // =====================================================================================================
    // Paleta categórica de los diagramas de barras · ÚNICA fuente: tokens --cp-1 … --cp-12 (claro y oscuro)
    // Criterios: contraste ≥ 3:1 con la superficie, distancia perceptual alta entre vecinos y tonos sin saturar en exceso.
    // Un mismo elemento conserva su color en todas las gráficas (p. ej. cada mes del año tiene siempre el mismo).
    // Escala: los primeros 12 tonos son la identidad (azul, coral, turquesa, ámbar, violeta, verde, rosa, cielo, naranja, lima, marino, cobre);
    // del 13 al 24 hay una segunda serie (tonos profundos en claro, suaves en oscuro) elegida por distancia perceptual. Pasada la 24.ª barra
    // las vueltas siguientes oscurecen y aclaran los mismos tonos, de modo que ninguna barra repite color exacto.
    // =====================================================================================================
    const CP_N=24;
    const cpSlot=i=>((Math.trunc(i)%CP_N)+CP_N)%CP_N,cpLap=i=>Math.floor(Math.max(0,Math.trunc(i))/CP_N)%3;
    // HTML / SVG: expresión CSS lista para usar en fill, background o variables (--bc)
    const cpVar=i=>{const v=`var(--cp-${cpSlot(i)+1})`,r=cpLap(i);return r===1?`color-mix(in srgb,${v} 76%,#000)`:r===2?`color-mix(in srgb,${v} 62%,#fff)`:v};
    // Mes calendario (0-11) a partir de «AAAA-MM»: el color del mes es el mismo en cualquier gráfica y año
    const cpMonthIdx=ym=>{const m=Number(String(ym).slice(5,7));return m>=1&&m<=12?m-1:0};
    // Canvas (Chart.js): lee los mismos tokens y aplica las mismas variantes
    function cpRGB(hex){let h=String(hex||'').trim().replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return Number.isFinite(n)&&h.length===6?[n>>16&255,n>>8&255,n&255]:[47,107,234]}
    const cpMix=(a,b,t)=>{const A=cpRGB(a),B=cpRGB(b);return '#'+A.map((v,i)=>Math.round(v+(B[i]-v)*t).toString(16).padStart(2,'0')).join('')};
    const cpAlpha=(hex,a)=>{const [r,g,b]=cpRGB(hex);return `rgba(${r},${g},${b},${a})`};
    function cpCanvas(i){const hex=getComputedStyle(document.documentElement).getPropertyValue(`--cp-${cpSlot(i)+1}`).trim()||'#2F6BEA',r=cpLap(i);return r===1?cpMix(hex,'#000000',.24):r===2?cpMix(hex,'#ffffff',.38):hex}
    // Colores de los gráficos: se leen de los tokens del tema activo
    function chartTheme(){
      const cs=getComputedStyle(document.documentElement),g=n=>cs.getPropertyValue(n).trim();
      return{grid:g('--chart-grid'),tick:g('--chart-tick'),legend:g('--chart-legend'),tipBg:g('--chart-tip-bg'),tipBd:g('--chart-tip-bd'),tipTitle:g('--chart-tip-title'),tipBody:g('--chart-tip-body'),
        ink:g('--chart-center-ink'),sub:g('--chart-center-sub'),surface:g('--surface'),blue:g('--chart-blue'),red:g('--chart-red'),violet:g('--chart-violet'),
        fillA:g('--chart-fill-a'),fillB:g('--chart-fill-b'),blueBar:g('--chart-blue-bar'),redBar:g('--chart-red-bar'),violetBar:g('--chart-violet-bar'),
        st:Object.fromEntries(['draft','pending','in_review','returned','approved','rejected','pending_execution','validated','closed','cancelled'].map(k=>[k,g('--st-'+k.replace(/_/g,'-'))]))};
    }
    function rerenderChartsForTheme(){if(!window.Chart||!state.profile||!$('#hoursChart'))return;state.themeRedraw=true;try{renderCharts()}finally{state.themeRedraw=false}}
const PDF_W={r:[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500],b:[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556]};const PDF_WIN={"€":128,"‚":130,"ƒ":131,"„":132,"…":133,"†":134,"‡":135,"ˆ":136,"‰":137,"Š":138,"‹":139,"Œ":140,"Ž":142,"‘":145,"’":146,"“":147,"”":148,"•":149,"–":150,"—":151,"˜":152,"™":153,"š":154,"›":155,"œ":156,"ž":158,"Ÿ":159};
    // ===== Formato «SOPORTE HORAS EXTRAS Y AUXILIOS» (generación automática) =====
    // Un único «modelo de página» (lista de primitivas: rectángulos, líneas, texto e imagen) alimenta dos salidas:
    //   · la vista previa (SVG) y · el PDF (texto real con fuentes estándar: seleccionable y legible; no se convierte en imagen).
    // Estructura original conservada: encabezado (logo · título · versión) → datos del funcionario y firma → tabla
    // (DÍA, ACTIVIDAD REALIZADA, AUXILIOS D/A/C, HORAS EXTRA mañana/tarde, TOTAL, OBSERVACIONES) → TOTAL → recibe / jefe inmediato / fecha.
    const FMT_META={title:'FORMATO SOPORTE HORAS EXTRAS Y AUXILIOS - soporte clientes',version:'Versión 2'};
    const FMT_FONT='Helvetica,Arial,"Liberation Sans",sans-serif';
    const FMT_C={ink:'#0F172A',mute:'#475569',lineOut:'#1E293B',lineIn:'#64748B',head:'#E3E9F2',label:'#F2F5F9',total:'#EAEFF6',zebra:'#F9FAFC',accent:'#1D4ED8',white:'#FFFFFF'};
    const FMT_PAGE={w:595.28,h:841.89,m:28.35};
    // Anchos de columna de la tabla (pt). Suman el ancho útil de la hoja A4 con márgenes de 1 cm, como el formato original.
    const FMT_COLS=[34,130,14,14,14,46,46,46,46,34,114.58];
    // — Texto: codificación WinAnsi y métricas Helvetica (los mismos datos para medir en pantalla y escribir en el PDF) —
    function pdfEnc(str){const out=[];for(const ch of String(str??'')){let cp=ch.codePointAt(0);if(cp===9||cp===10||cp===13)cp=32;if((cp>=32&&cp<=126)||(cp>=160&&cp<=255))out.push(cp);else if(PDF_WIN[ch]!==undefined)out.push(PDF_WIN[ch]);else if(cp===0x2010||cp===0x2011||cp===0x2212)out.push(45);else if(cp===0x202F||cp===0x2007)out.push(32);else out.push(63)}return out}
    // La medición de texto es una función pura y se invoca miles de veces por maquetación (pdfWrap/fmtFit); se memoriza por (texto, tamaño, negrita).
    const pdfWidthMemo=new Map();
    function pdfTextW(str,size,bold){const key=(bold?'b':'r')+size+'|'+str;let w=pdfWidthMemo.get(key);if(w===undefined){const t=bold?PDF_W.b:PDF_W.r;w=0;for(const c of pdfEnc(str))w+=t[c-32]||0;w=w*size/1000;if(pdfWidthMemo.size>20000)pdfWidthMemo.clear();pdfWidthMemo.set(key,w)}return w}
    function pdfWrap(str,size,bold,maxW){
      const words=String(str??'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean),lines=[];let cur='';
      for(let w of words){
        while(pdfTextW(w,size,bold)>maxW&&w.length>1){let k=w.length;while(k>1&&pdfTextW(w.slice(0,k),size,bold)>maxW)k--;if(cur){lines.push(cur);cur=''}lines.push(w.slice(0,k));w=w.slice(k)}
        const t=cur?cur+' '+w:w;if(pdfTextW(t,size,bold)<=maxW)cur=t;else{if(cur)lines.push(cur);cur=w}
      }
      if(cur)lines.push(cur);return lines;
    }
    // Ajusta un texto a una celda: prueba tamaños decrecientes en una línea y, si no cabe, parte en líneas (nunca recorta contenido).
    function fmtFit(str,maxW,sizes,bold){
      for(const s of sizes){if(pdfTextW(str,s,bold)<=maxW)return {lines:[String(str)],size:s}}
      const s=sizes[sizes.length-1];return {lines:pdfWrap(str,s,bold,maxW),size:s};
    }
    // — Tiempo: separa un intervalo en franjas «mañana» (antes de 12:00 m.) y «tarde» (desde las 12:00 m.) —
    const fmtToMin=v=>{const m=/^(\d{1,2}):(\d{2})/.exec(v||'');return m?Number(m[1])*60+Number(m[2]):null};
    function fmtMinLabel(m){const mm=((m%1440)+1440)%1440,h=Math.floor(mm/60),mi=mm%60;return `${pad2(h%12||12)}:${pad2(mi)} ${h>=12?'P. M.':'A. M.'}`}
    function splitInterval(start,end){
      const s=fmtToMin(start);let e=fmtToMin(end);if(s===null||e===null)return {morning:null,afternoon:null};if(e<=s)e+=1440;   // igual que el cálculo de horas del aplicativo
      const part=(a,b)=>({from:fmtMinLabel(a),to:fmtMinLabel(b),next:b>=1440});
      return {morning:s<720?part(s,Math.min(e,720)):null,afternoon:e>720?part(Math.max(s,720),e):null};
    }
    // — Modelo de datos del formato a partir de lo diligenciado en el aplicativo —
    function buildFormatModel(inp){
      const rows=(inp.rows||[]).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.start).localeCompare(String(b.start))).map(r=>{
        const sp=splitInterval(r.start,r.end),hours=Number(r.hours)||0;
        return {day:String(r.date||'').slice(8,10),activity:String(r.activity||'').trim(),aux:{d:!!r.aux?.d,a:!!r.aux?.a,c:!!r.aux?.c},morning:sp.morning,afternoon:sp.afternoon,hours,obs:String(r.obs||'').trim()};
      });
      const auxTotal=rows.reduce((a,r)=>a+(r.aux.d?1:0)+(r.aux.a?1:0)+(r.aux.c?1:0),0),hoursTotal=Math.round(rows.reduce((a,r)=>a+r.hours,0)*100)/100;
      return {name:String(inp.name||'').trim(),position:String(inp.position||'').trim(),idNumber:String(inp.idNumber||'').trim(),month:String(inp.month||'').trim(),rows,auxTotal,hoursTotal,receiver:String(inp.receiver||'').trim(),manager:String(inp.manager||'').trim(),date:String(inp.date||''),signature:inp.signature&&inp.signature.w>0&&inp.signature.h>0?{w:inp.signature.w,h:inp.signature.h}:null,managerSignature:inp.managerSignature&&inp.managerSignature.w>0&&inp.managerSignature.h>0?{w:inp.managerSignature.w,h:inp.managerSignature.h}:null};
    }
    // — Maquetación: devuelve las páginas (cada una, una lista de primitivas) —
    function layoutFormat(model){
      const {w:PW,h:PH,m:M}=FMT_PAGE,X0=M,CW=PW-2*M,TOP=M,BOTTOM=PH-M-8,GAP=7,pages=[];let pg,y;
      const op=(o)=>pg.push(o),rect=(x,yy,w,h,o={})=>op({t:'rect',x,y:yy,w,h,fill:o.fill||null,stroke:o.stroke||null,lw:o.lw||0.4}),line=(x1,y1,x2,y2,o={})=>op({t:'line',x1,y1,x2,y2,color:o.color||FMT_C.lineIn,lw:o.lw||0.4});
      const text=(s,x,yy,o={})=>{if(String(s??'')==='')return;op({t:'text',s:String(s),x,y:yy,size:o.size||8,bold:!!o.bold,color:o.color||FMT_C.ink})};
      // texto centrado/izquierda en una celda; las líneas se centran verticalmente en la celda.
      const cellText=(lines,x,yy,w,h,o={})=>{
        const size=o.size||8,lh=o.lh||size*1.22,n=lines.length,pad=o.pad??4,top=o.vtop?yy+pad+size*0.82:yy+h/2-((n-1)*lh)/2+size*0.34;
        lines.forEach((ln,i)=>{const tw=pdfTextW(ln,size,o.bold),tx=o.align==='l'?x+pad:o.align==='r'?x+w-pad-tw:x+(w-tw)/2;text(ln,tx,top+i*lh,{size,bold:o.bold,color:o.color})});
      };
      const box=(x,yy,w,h,o={})=>rect(x,yy,w,h,{fill:o.fill,stroke:o.stroke||FMT_C.lineIn,lw:o.lw||0.4});
      const newPage=()=>{pg=[];pages.push(pg);y=TOP;return pg};
      // Encabezado: logo · título · versión
      const header=()=>{
        const h=54,lw=88,vw=88;box(X0,y,CW,h,{stroke:FMT_C.lineOut,lw:1.1});line(X0+lw,y,X0+lw,y+h,{color:FMT_C.lineOut,lw:0.8});line(X0+CW-vw,y,X0+CW-vw,y+h,{color:FMT_C.lineOut,lw:0.8});
        rect(X0,y,CW,2.4,{fill:FMT_C.accent});
        const lh=38,lwid=lh*105/72;op({t:'img',x:X0+(lw-lwid)/2,y:y+(h-lh)/2+1,w:lwid,h:lh});
        const [t1,t2]=FMT_META.title.split(' - '),mid=X0+lw,mw=CW-lw-vw;
        const f1=fmtFit(t1,mw-16,[12.5,12,11.5,11],true);
        if(t2){cellText(f1.lines,mid,y+2,mw,h/2+1,{size:f1.size,bold:true});cellText([t2],mid,y+h/2-1,mw,h/2+2,{size:9.5,color:FMT_C.mute})}
        else cellText(f1.lines,mid,y,mw,h,{size:f1.size,bold:true});
        cellText([FMT_META.version],X0+CW-vw,y,vw,h,{size:10.5});
        y+=h;
      };
      // Datos del funcionario + firma del funcionario
      const identity=()=>{
        const L1=54,V1=152,L2=46,V2=112,FW=CW-L1-V1-L2-V2,xs=[X0,X0+L1,X0+L1+V1,X0+L1+V1+L2,X0+L1+V1+L2+V2];
        // Los cuatro valores comparten un mismo tamaño de letra (el mayor en que todos caben en una línea); si alguno no cabe, se parte en líneas
        // y la fila crece lo necesario para que el texto nunca toque los bordes ni se recorte.
        const vals=[[model.name,V1],[model.month,V2],[model.position,V1],[model.idNumber,V2]].map(([s,w])=>[String(s||'').toUpperCase(),w-10]);
        const common=[9,8.5,8,7.5].find(sz=>vals.every(([s,w])=>pdfTextW(s,sz,true)<=w))||0,wrapSize=7.2,nl=(u,w)=>common?1:pdfWrap(u,wrapSize,true,w).length;
        const rh1=Math.max(33,Math.max(nl(vals[0][0],vals[0][1]),nl(vals[1][0],vals[1][1]))*8.6+12),rh2=Math.max(33,Math.max(nl(vals[2][0],vals[2][1]),nl(vals[3][0],vals[3][1]))*8.6+12);
        const lab=(s,x,yy,w,h)=>{box(x,yy,w,h,{fill:FMT_C.label});cellText([s],x,yy,w,h,{size:8,bold:true})};
        const val=(s,x,yy,w,h)=>{box(x,yy,w,h);const u=String(s||'').toUpperCase(),lines=common?[u]:pdfWrap(u,wrapSize,true,w-10);cellText(lines,x,yy,w,h,{size:common||wrapSize,bold:true,lh:8.6})};
        lab('Nombre:',xs[0],y,L1,rh1);val(model.name,xs[1],y,V1,rh1);lab('Mes:',xs[2],y,L2,rh1);val(model.month,xs[3],y,V2,rh1);
        lab('Cargo:',xs[0],y+rh1,L1,rh2);val(model.position,xs[1],y+rh1,V1,rh2);lab('Cédula:',xs[2],y+rh1,L2,rh2);val(model.idNumber,xs[3],y+rh1,V2,rh2);
        box(xs[4],y,FW,rh1+rh2);cellText(['FIRMA FUNCIONARIO:'],xs[4],y,FW,rh1+rh2,{size:8,bold:true,align:'l',pad:7,vtop:true});
          // Firma del funcionario (opcional): se ajusta sin deformarse al espacio libre bajo la etiqueta, centrada y con holgura a los bordes.
          if(model.signature){const ax=xs[4]+7,aw=FW-14,avail=rh1+rh2-24,ah=Math.min(60,avail),ay=y+19+(avail-ah)/2,ar=model.signature.w/model.signature.h;let sw=aw,sh=sw/ar;if(sh>ah){sh=ah;sw=sh*ar}op({t:'sig',x:ax+(aw-sw)/2,y:ay+(ah-sh)/2,w:sw,h:sh})}
        box(X0,y,CW,rh1+rh2,{fill:null,stroke:FMT_C.lineOut,lw:1.1});y+=rh1+rh2;
      };
      // Cabecera de la tabla en dos niveles
      const colX=(i)=>X0+FMT_COLS.slice(0,i).reduce((a,b)=>a+b,0),spanW=(a,b)=>FMT_COLS.slice(a,b).reduce((x,z)=>x+z,0);
      const tableHead=()=>{
        const h1=16,h2=24,y0=y,hc=(s,i,j,yy,h,o={})=>{box(colX(i),yy,spanW(i,j),h,{fill:FMT_C.head});const lines=o.lines||[s];cellText(lines,colX(i),yy,spanW(i,j),h,{size:o.size||7.2,bold:true,lh:8})};
        hc('DÍA',0,1,y0,h1+h2);hc('ACTIVIDAD REALIZADA',1,2,y0,h1+h2);hc('AUXILIOS',2,5,y0,h1);hc('HORAS EXTRA',5,10,y0,h1);hc('OBSERVACIONES',10,11,y0,h1+h2);
        ['D','A','C'].forEach((s,k)=>hc(s,2+k,3+k,y0+h1,h2));
        [['MAÑANA','DESDE'],['MAÑANA','HASTA'],['TARDE','DESDE'],['TARDE','HASTA']].forEach((l,k)=>hc(null,5+k,6+k,y0+h1,h2,{lines:l,size:6.8}));
        hc('TOTAL',9,10,y0+h1,h2,{size:6.8});
        y+=h1+h2;
      };
      // Una fila de datos: altura según el contenido (el texto nunca se recorta)
      const rowLayout=(r)=>{
        const act=pdfWrap(r.activity,7.4,false,FMT_COLS[1]-9),obs=pdfWrap(r.obs,7,false,FMT_COLS[10]-9),n=Math.max(act.length,obs.length,1);
        return {act,obs,h:Math.max(21,n*8.9+9)};
      };
      const dataRow=(r,k,L)=>{
        const h=L.h,fill=k%2?FMT_C.zebra:null;
        FMT_COLS.forEach((_,i)=>{box(colX(i),y,FMT_COLS[i],h,{fill})});
        cellText([r.day],colX(0),y,FMT_COLS[0],h,{size:8,bold:true});
        cellText(L.act.length?L.act:[''],colX(1),y,FMT_COLS[1],h,{size:7.4,align:'l',pad:4.5,lh:8.9});
        [r.aux.d,r.aux.a,r.aux.c].forEach((on,i)=>{if(on)cellText(['X'],colX(2+i),y,FMT_COLS[2+i],h,{size:8.5,bold:true})});
        const m=r.morning,t=r.afternoon;
        if(m){cellText([m.from],colX(5),y,FMT_COLS[5],h,{size:7.2});cellText([m.to],colX(6),y,FMT_COLS[6],h,{size:7.2})}
        if(t){cellText([t.from],colX(7),y,FMT_COLS[7],h,{size:7.2});
          if(t.next){cellText([t.to],colX(8),y,FMT_COLS[8],h-8,{size:7.2});cellText(['(+1 día)'],colX(8),y+h/2-0.5,FMT_COLS[8],h/2+1,{size:5.8,color:FMT_C.mute})}
          else cellText([t.to],colX(8),y,FMT_COLS[8],h,{size:7.2})}
        cellText([num(r.hours)],colX(9),y,FMT_COLS[9],h,{size:8,bold:true});
        cellText(L.obs.length?L.obs:[''],colX(10),y,FMT_COLS[10],h,{size:7,align:'l',pad:4.5,lh:8.9});
        y+=h;
      };
      // Pie: las filas de firma crecen si el nombre es largo (nunca se recorta)
      const totalH=24,w1F=238,slotN=(v,w)=>{if(!v)return 0;const u=v.toUpperCase();return [8.6,8,7.5,7].some(s=>pdfTextW(u,s,true)<=w-12)?1:pdfWrap(u,7,true,w-12).length};
      const footNeed=(v)=>{const n=slotN(v,w1F);return n>1?21+n*8.2+6:0},footH=[Math.max(38,footNeed(model.receiver)),Math.max(model.managerSignature?56:42,footNeed(model.manager))];
      const totalRow=()=>{
        const h=totalH;FMT_COLS.forEach((_,i)=>box(colX(i),y,FMT_COLS[i],h,{fill:FMT_C.total}));
        // celdas combinadas como en el original: TOTAL (DÍA+ACTIVIDAD) · auxilios · bloque de horas · total · observaciones
        rect(colX(0),y,spanW(0,2),h,{fill:FMT_C.total,stroke:FMT_C.lineIn,lw:0.4});rect(colX(2),y,spanW(2,5),h,{fill:FMT_C.total,stroke:FMT_C.lineIn,lw:0.4});rect(colX(5),y,spanW(5,9),h,{fill:FMT_C.total,stroke:FMT_C.lineIn,lw:0.4});
        cellText(['TOTAL'],colX(0),y,spanW(0,2),h,{size:8.5,bold:true});cellText([String(model.auxTotal)],colX(2),y,spanW(2,5),h,{size:8.5,bold:true});cellText([num(model.hoursTotal)],colX(9),y,FMT_COLS[9],h,{size:8.5,bold:true});
        y+=h;
      };
      const footer=()=>{
        const w1=w1F,w3=62,w2=CW-w1-w3,xs=[X0,X0+w1,X0+w1+w2],h1=footH[0],h2=footH[1];
        const slot=(label,value,x,yy,w,h)=>{box(x,yy,w,h);text(label,x+6,yy+10.5,{size:6.8,bold:true,color:FMT_C.mute});if(value){const f=fmtFit(value.toUpperCase(),w-12,[8.6,8,7.5,7],true);if(f.lines.length>1){pdfWrap(value.toUpperCase(),7,true,w-12).forEach((ln,i)=>text(ln,x+6,yy+21+i*8.2,{size:7,bold:true}))}else text(f.lines[0],x+6,yy+h-8,{size:f.size,bold:true})}};
        slot('NOMBRE DE QUIEN RECIBE:',model.receiver,xs[0],y,w1,h1);slot('FIRMA DE QUIEN RECIBE:','',xs[1],y,w2,h1);
        slot('NOMBRE JEFE INMEDIATO:',model.manager,xs[0],y+h1,w1,h2);slot('FIRMA JEFE INMEDIATO:','',xs[1],y+h1,w2,h2);
        // Firma digital del jefe que aprobó: debajo de la etiqueta, centrada, sin deformar la imagen y con holgura a los bordes de la celda.
        if(model.managerSignature){const ms=model.managerSignature,ax=xs[1]+8,aw=w2-16,ay=y+h1+14,ah=h2-14-5,ar=ms.w/ms.h;let sw=aw,sh=sw/ar;if(sh>ah){sh=ah;sw=sh*ar}op({t:'msig',x:ax+(aw-sw)/2,y:ay+(ah-sh)/2,w:sw,h:sh})}
        box(xs[2],y,w3,h1+h2);cellText([model.date],xs[2],y,w3,h1+h2,{size:8.5,bold:true});
        box(X0,y,CW,h1+h2,{fill:null,stroke:FMT_C.lineOut,lw:1.1});y+=h1+h2;
      };
      newPage();header();y+=GAP;identity();y+=GAP;tableHead();
      const L=model.rows.map(rowLayout),reserve=totalH+footH[0]+footH[1]+GAP;
      model.rows.forEach((r,i)=>{
        const last=i===model.rows.length-1,need=L[i].h+(last?reserve:0);
        if(y+need>BOTTOM){newPage();header();y+=GAP;tableHead()}
        dataRow(r,i,L[i]);
      });
      if(!model.rows.length){FMT_COLS.forEach((_,i)=>box(colX(i),y,FMT_COLS[i],24));y+=24}
      if(y+reserve>BOTTOM){newPage();header();y+=GAP;tableHead()}
      totalRow();y+=GAP;footer();
      if(pages.length>1)pages.forEach((p,i)=>{pg=p;const s=`Página ${i+1} de ${pages.length}`;text(s,PW/2-pdfTextW(s,7.5,false)/2,PH-14,{size:7.5,color:FMT_C.mute})});
      return pages;
    }
    // — Salida 1: vista previa SVG (mismas coordenadas y métricas que el PDF) —
    function fmtSvg(pageOps,logoSrc,label,sigSrc,msigSrc){
      const e=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),{w,h}=FMT_PAGE;
      const body=pageOps.map(o=>{
        if(o.t==='rect')return `<rect x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" fill="${o.fill||'none'}"${o.stroke?` stroke="${o.stroke}" stroke-width="${o.lw}"`:''}/>`;
        if(o.t==='line')return `<line x1="${o.x1}" y1="${o.y1}" x2="${o.x2}" y2="${o.y2}" stroke="${o.color}" stroke-width="${o.lw}"/>`;
        if(o.t==='img')return `<image x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" href="${logoSrc}" preserveAspectRatio="xMidYMid meet"/>`;
        if(o.t==='msig')return msigSrc?`<image x="${o.x.toFixed(2)}" y="${o.y.toFixed(2)}" width="${o.w.toFixed(2)}" height="${o.h.toFixed(2)}" href="${msigSrc}" preserveAspectRatio="xMidYMid meet"/>`:'';
        if(o.t==='sig')return sigSrc?`<image x="${o.x.toFixed(2)}" y="${o.y.toFixed(2)}" width="${o.w.toFixed(2)}" height="${o.h.toFixed(2)}" href="${sigSrc}" preserveAspectRatio="xMidYMid meet"/>`:'';
        return `<text x="${o.x.toFixed(2)}" y="${o.y.toFixed(2)}" font-size="${o.size}" font-weight="${o.bold?700:400}" fill="${o.color}" xml:space="preserve">${e(o.s)}</text>`;
      }).join('');
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${e(label||'Vista previa del formato')}" font-family='${FMT_FONT}' style="display:block;width:100%;height:auto"><rect width="${w}" height="${h}" fill="#fff"/>${body}</svg>`;
    }
          // Compresión Flate (zlib) de los píxeles de la firma: reduce el PDF sin pérdida de calidad.
      async function fmtDeflate(data){
        if(typeof CompressionStream==='undefined')return {data,flate:false};
        try{const cs=new CompressionStream('deflate'),w=cs.writable.getWriter();w.write(data);w.close();return {data:new Uint8Array(await new Response(cs.readable).arrayBuffer()),flate:true}}catch(_){return {data,flate:false}}
      }
    // — Salida 2: PDF 1.4 con fuentes estándar (Helvetica) y texto real —
    function fmtPdfBytes(pages,opt){
      const {w:PW,h:PH}=FMT_PAGE,enc=new TextEncoder(),objs=[],add=(body)=>{objs.push(body);return objs.length};
      const f2=n=>(Math.round(n*100)/100).toString(),rgb=c=>{const v=parseInt(c.slice(1),16);return `${f2((v>>16&255)/255)} ${f2((v>>8&255)/255)} ${f2((v&255)/255)}`};
      const hex=s=>pdfEnc(s).map(c=>c.toString(16).padStart(2,'0').toUpperCase()).join('');
      const utf16=s=>'FEFF'+[...String(s)].map(ch=>{const cp=ch.codePointAt(0);if(cp>0xFFFF){const c=cp-0x10000;return [0xD800+(c>>10),0xDC00+(c&1023)].map(x=>x.toString(16).padStart(4,'0')).join('')}return cp.toString(16).padStart(4,'0')}).join('').toUpperCase();
      const catalog=add(null),pagesObj=add(null),fR=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'),fB=add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const img=opt.logo?add({stream:opt.logo.rgb,dict:`<< /Type /XObject /Subtype /Image /Width ${opt.logo.w} /Height ${opt.logo.h} /ColorSpace /DeviceRGB /BitsPerComponent 8`}):null;
      const sigImg=opt.sig?add({stream:opt.sig.data,dict:`<< /Type /XObject /Subtype /Image /Width ${opt.sig.w} /Height ${opt.sig.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate true${opt.sig.flate?' /Filter /FlateDecode':''}`}):null;
      const msigImg=opt.msig?add({stream:opt.msig.data,dict:`<< /Type /XObject /Subtype /Image /Width ${opt.msig.w} /Height ${opt.msig.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Interpolate true${opt.msig.flate?' /Filter /FlateDecode':''}`}):null;
      const info=add(`<< /Title <${utf16(opt.title||'')}> /Author <${utf16(opt.author||'')}> /Subject <${utf16(opt.subject||'')}> /Creator <${utf16('Aplicativo · Gestión de horas extras')}> /Producer <${utf16('Aplicativo')}> /CreationDate (${opt.pdfDate}) /ModDate (${opt.pdfDate}) >>`);
      const kids=[];
      pages.forEach(ops=>{
        const out=[];
        ops.forEach(o=>{
          if(o.t==='rect'){const y=PH-o.y-o.h;if(o.fill&&o.stroke)out.push(`${rgb(o.fill)} rg ${rgb(o.stroke)} RG ${f2(o.lw)} w ${f2(o.x)} ${f2(y)} ${f2(o.w)} ${f2(o.h)} re B`);else if(o.fill)out.push(`${rgb(o.fill)} rg ${f2(o.x)} ${f2(y)} ${f2(o.w)} ${f2(o.h)} re f`);else if(o.stroke)out.push(`${rgb(o.stroke)} RG ${f2(o.lw)} w ${f2(o.x)} ${f2(y)} ${f2(o.w)} ${f2(o.h)} re S`)}
          else if(o.t==='line')out.push(`${rgb(o.color)} RG ${f2(o.lw)} w ${f2(o.x1)} ${f2(PH-o.y1)} m ${f2(o.x2)} ${f2(PH-o.y2)} l S`);
          else if(o.t==='img'&&img)out.push(`q ${f2(o.w)} 0 0 ${f2(o.h)} ${f2(o.x)} ${f2(PH-o.y-o.h)} cm /Im1 Do Q`);
          else if(o.t==='msig'&&msigImg)out.push(`q ${f2(o.w)} 0 0 ${f2(o.h)} ${f2(o.x)} ${f2(PH-o.y-o.h)} cm /Im3 Do Q`);
          else if(o.t==='sig'&&sigImg)out.push(`q ${f2(o.w)} 0 0 ${f2(o.h)} ${f2(o.x)} ${f2(PH-o.y-o.h)} cm /Im2 Do Q`);
          else if(o.t==='text')out.push(`BT /${o.bold?'F2':'F1'} ${f2(o.size)} Tf ${rgb(o.color)} rg ${f2(o.x)} ${f2(PH-o.y)} Td <${hex(o.s)}> Tj ET`);
        });
        const content=add({stream:enc.encode(out.join('\n')),dict:'<<'});
        const page=add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${fR} 0 R /F2 ${fB} 0 R >>${img||sigImg||msigImg?` /XObject << ${img?`/Im1 ${img} 0 R `:''}${sigImg?`/Im2 ${sigImg} 0 R `:''}${msigImg?`/Im3 ${msigImg} 0 R `:''}>>`:''} /ProcSet [/PDF /Text /ImageC] >> /Contents ${content} 0 R >>`);
        kids.push(page);
      });
      objs[catalog-1]=`<< /Type /Catalog /Pages ${pagesObj} 0 R /Lang (es-CO) /ViewerPreferences << /DisplayDocTitle true >> >>`;
      objs[pagesObj-1]=`<< /Type /Pages /Count ${kids.length} /Kids [${kids.map(k=>`${k} 0 R`).join(' ')}] >>`;
      const chunks=[],offsets=[];let pos=0;const push=u=>{chunks.push(u);pos+=u.length};
      push(enc.encode('%PDF-1.4\n'));push(new Uint8Array([0x25,0xE2,0xE3,0xCF,0xD3,0x0A]));   // marcador binario recomendado por la especificación
      objs.forEach((o,i)=>{offsets.push(pos);push(enc.encode(`${i+1} 0 obj\n`));
        if(o&&o.stream){push(enc.encode(`${o.dict==='<<'?'<<':o.dict} /Length ${o.stream.length} >>\nstream\n`));push(o.stream);push(enc.encode('\nendstream\n'))}else push(enc.encode(o+'\n'));
        push(enc.encode('endobj\n'))});
      const xref=pos;push(enc.encode(`xref\n0 ${objs.length+1}\n0000000000 65535 f \n${offsets.map(x=>String(x).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objs.length+1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
      const out=new Uint8Array(pos);let p=0;chunks.forEach(c=>{out.set(c,p);p+=c.length});return out;
    }

    // ===== Jefe inmediato: parámetro único y editable (solo administradores) =====
    // Se guarda como parámetro del sistema «immediate_manager_name» (misma tabla app_parameters y mismo mecanismo que los demás
    // parámetros). Lo editan únicamente los administradores en Configuración → Reglas y parámetros; los funcionarios solo lo leen
    // (formato de horas extras). No está escrito en ningún otro lugar del código: el valor inicial es solo la semilla de una instalación nueva.
    
    const MANAGER_PARAM='immediate_manager_name';
    // La regla es la misma del servidor (ver función validate_app_parameter en el SQL): letras (con tildes y ñ), espacios, punto, apóstrofo y guion.
    const MANAGER_BAD_CHARS=/[^\s.'’A-Za-zÀ-ÖØ-öø-ÿ-]/,MANAGER_START=/^[A-Za-zÀ-ÖØ-öø-ÿ]/;
    function normalizeManagerName(raw){
      const value=String(raw??'').replace(/\s+/g,' ').trim();
      if(!value)return {ok:false,error:'Ingresa el nombre del jefe inmediato.'};
      if(value.length<3)return {ok:false,error:'El nombre debe tener al menos 3 caracteres.'};
      if(value.length>120)return {ok:false,error:'El nombre no puede superar los 120 caracteres.'};
      if(!MANAGER_START.test(value)||MANAGER_BAD_CHARS.test(value))return {ok:false,error:'Usa solo letras, espacios, puntos, apóstrofos y guiones (sin números ni símbolos).'};
      return {ok:true,value};
    }
    const immediateManagerName=()=>{const v=state.parameters?.[MANAGER_PARAM];return typeof v==='string'&&v.trim()?v.trim():''};
    
    // Autorización: el servidor la valida además de la interfaz (RLS + trigger).
    function canEditManager(){return state.profile?.role==='admin'}
    function managerCardHTML(){
      return `<form id="managerForm" class="form-section section-identity manager-card" novalidate autocomplete="off" style="margin-bottom:14px">
        <h4>${vectorIcon('userCheck')} Jefe inmediato <span class="section-kicker">Formato de horas extras</span></h4>
        <div class="field" id="managerField"><label for="managerName">Nombre del jefe inmediato <span class="required">*</span></label>
          <input id="managerName" class="control" name="${MANAGER_PARAM}" value="${esc(immediateManagerName())}" maxlength="120" required autocomplete="off" spellcheck="false" aria-describedby="managerHelp managerMsg">
          <p class="field-msg" id="managerMsg" role="alert" hidden></p>
          <span class="small muted" id="managerHelp">Se imprime en «Nombre jefe inmediato» del formato de horas extras que genera cada funcionario. Solo los administradores pueden modificarlo.</span></div>
        <div class="actions"><button class="btn btn-primary btn-modal" type="submit" id="managerSave">${vectorIcon('check')} Guardar nombre</button><button class="btn btn-ghost btn-modal" type="button" id="managerUndo">Deshacer cambios</button></div></form>`;
    }
    function showManagerMsg(msg){const m=$('#managerMsg'),field=$('#managerField'),input=$('#managerName');if(!m)return;m.hidden=!msg;m.textContent=msg||'';field?.classList.toggle('is-invalid',!!msg);input?.setAttribute('aria-invalid',msg?'true':'false')}
    function bindManagerForm(){
      const f=$('#managerForm');if(!f)return;const input=$('#managerName'),undo=$('#managerUndo'),sync=()=>{undo.disabled=input.value===immediateManagerName()};
      input.addEventListener('input',()=>{showManagerMsg('');sync()});undo.onclick=()=>{input.value=immediateManagerName();showManagerMsg('');sync();input.focus()};f.onsubmit=saveManagerName;sync();
    }
    async function saveManagerName(e){
      e.preventDefault();
      if(!canEditManager())return toast('Solo un administrador puede modificar el nombre del jefe inmediato.','error');
      const input=$('#managerName'),res=normalizeManagerName(input.value);showManagerMsg(res.ok?'':res.error);
      if(!res.ok){input.focus();return}
      input.value=res.value;
      if(res.value===immediateManagerName())return toast('El nombre del jefe inmediato no tiene cambios.','info');
      const btn=$('#managerSave');setBusy(btn,true,'Guardando');
      try{
        {const {error}=await state.client.from('app_parameters').upsert({key:MANAGER_PARAM,value:res.value,description:'Nombre del jefe inmediato que se imprime en el formato de horas extras',updated_by:state.user.id,updated_at:new Date().toISOString()});if(error)throw error}
        toast('Nombre del jefe inmediato actualizado','success',res.value);await loadAll();
      }catch(err){showManagerMsg(errorMsg(err));toast(errorMsg(err),'error')}
      finally{setBusy(btn,false)}
    }

    // ===== Cargo del funcionario: Técnico · Profesional · Otro (texto libre) =====
    // Se guarda en el perfil del usuario (profiles.position_kind + profiles.job_title). En Supabase lo actualiza la función update_own_position,
    // que solo modifica el cargo de quien está autenticado y aplica la misma validación.
    const POSITION_KINDS=['Técnico','Profesional','Otro'];
    const POSITION_BAD=/[^\s.,'’()\/&A-Za-zÀ-ÖØ-öø-ÿ0-9-]/,POSITION_START=/^[A-Za-zÀ-ÖØ-öø-ÿ]/;
    function validatePositionCustom(raw){
      const v=String(raw??'').replace(/\s+/g,' ').trim();
      if(!v)return {ok:false,error:'Escribe tu cargo.'};
      if(v.length<3)return {ok:false,error:'El cargo debe tener al menos 3 caracteres.'};
      if(v.length>80)return {ok:false,error:'El cargo no puede superar los 80 caracteres.'};
      if(!POSITION_START.test(v)||POSITION_BAD.test(v))return {ok:false,error:'Usa letras, números, espacios y . , - / ( ) solamente; debe empezar con una letra.'};
      return {ok:true,value:v};
    }
    // Cargo vigente del perfil → {kind, custom}. Compatible con datos anteriores (texto libre en job_title o recordado en el navegador).
    // Cargo y grado oficiales del directorio (catálogo job_grades): los asigna el administrador y no se editan desde el perfil.
    const officialPosition=p=>{const g=p?.job_grade_id?(state.jobGrades||[]).find(x=>x.id===p.job_grade_id):null;return g?{name:g.position_name,grade:g.grade}:null};
    function positionFromProfile(p,legacy){
      const off=officialPosition(p);if(off)return {kind:'Oficial',custom:off.name,official:true,grade:off.grade};
      const kind=p?.position_kind,title=String(p?.job_title||'').trim();
      if(POSITION_KINDS.includes(kind))return {kind,custom:kind==='Otro'?title:''};
      const src=title||String(legacy||'').trim();if(!src)return {kind:'',custom:''};
      const hit=POSITION_KINDS.slice(0,2).find(k=>normText(k)===normText(src));
      return hit?{kind:hit,custom:''}:{kind:'Otro',custom:src};
    }
    const positionLabel=(kind,custom)=>(kind==='Otro'||kind==='Oficial')?String(custom||'').replace(/\s+/g,' ').trim():(kind||'');
    function positionFieldsHTML(){
      const p=fmtState.position;
      if(p.official)return `<div class="field" id="fmtPositionField"><label for="fmtPositionKind">Cargo</label><input id="fmtPositionKind" class="control" value="${esc(p.custom)}" readonly aria-readonly="true" aria-describedby="fmtPositionStatus"><span class="small muted" id="fmtPositionStatus">Asignado por el administrador</span></div>`;
      return `<div class="field" id="fmtPositionField"><label for="fmtPositionKind">Cargo</label><select id="fmtPositionKind" class="control" aria-describedby="fmtPositionStatus"><option value="" ${p.kind?'':'selected'}>Selecciona tu cargo</option>${POSITION_KINDS.map(k=>`<option value="${k}" ${p.kind===k?'selected':''}>${k}</option>`).join('')}</select><span class="small muted" id="fmtPositionStatus" aria-live="polite"></span></div>`;
    }
    function positionOtherHTML(){
      const p=fmtState.position;if(p.official)return '';
      return `<div class="field span-2 ${p.kind==='Otro'?'':'hidden'}" id="fmtPositionOtherField"><label for="fmtPositionOther">Escribe tu cargo <span class="required">*</span></label><input id="fmtPositionOther" class="control" maxlength="80" value="${esc(p.custom)}" placeholder="Ej.: Analista de soporte" autocomplete="organization-title" aria-describedby="fmtPositionMsg"><p class="field-msg" id="fmtPositionMsg" role="alert" hidden></p></div>`;
    }
    function positionShowError(msg){const m=$('#fmtPositionMsg'),f=$('#fmtPositionOtherField'),i=$('#fmtPositionOther');if(!m)return;m.hidden=!msg;m.textContent=msg||'';f?.classList.toggle('is-invalid',!!msg);i?.setAttribute('aria-invalid',msg?'true':'false')}
    // Estado del cargo para el formato: valor imprimible y si es válido (con «Otro» el texto es obligatorio).
    function positionState(){const p=fmtState.position;if(p.official)return {ok:true,value:p.custom};if(p.kind!=='Otro')return {ok:true,value:p.kind};const r=validatePositionCustom(p.custom);return {ok:r.ok,value:r.ok?r.value:'',error:r.error}}
    let positionTimer=null;
    function positionSchedule(){clearTimeout(positionTimer);positionTimer=setTimeout(savePosition,600)}
    async function savePosition(){
      if(fmtState.position.official)return true;
      const p=fmtState.position,st=positionState();if(!p.kind||!st.ok)return false;
      const title=st.value,cur=positionFromProfile(state.profile);if(cur.kind===p.kind&&positionLabel(cur.kind,cur.custom)===title)return true;
      const status=$('#fmtPositionStatus');if(status)status.textContent='Guardando…';
      try{
        {const {error}=await state.client.rpc('update_own_position',{p_kind:p.kind,p_custom:p.kind==='Otro'?title:null});if(error)throw error}
        state.profile.position_kind=p.kind;state.profile.job_title=title;const sp=state.profiles.find(x=>x.id===state.user.id);if(sp){sp.position_kind=p.kind;sp.job_title=title}
        if(status)status.textContent='Guardado en tu perfil';return true;
      }catch(err){if(status)status.textContent='';toast(`No fue posible guardar el cargo: ${errorMsg(err)}`,'error');return false}
    }
    function positionBind(){
      if(fmtState.position.official)return;
      const sel=$('#fmtPositionKind'),other=$('#fmtPositionOther'),otherField=$('#fmtPositionOtherField');
      sel.addEventListener('change',()=>{
        fmtState.position.kind=sel.value;const isOther=sel.value==='Otro';otherField.classList.toggle('hidden',!isOther);positionShowError('');
        if(isOther){setTimeout(()=>other.focus(),30);if(other.value.trim())positionSchedule()}else positionSchedule();
        fmtSchedule();
      });
      other.addEventListener('input',()=>{fmtState.position.custom=other.value;positionShowError('');fmtSchedule();if(validatePositionCustom(other.value).ok)positionSchedule()});
      other.addEventListener('blur',()=>{const r=validatePositionCustom(other.value);if(fmtState.position.kind==='Otro'&&!r.ok&&other.value.trim())positionShowError(r.error);else if(r.ok){other.value=r.value;fmtState.position.custom=r.value}});
    }
    // ===== Firma del funcionario: imagen subida =====
    // La imagen se procesa solo en el navegador (no se envía a ningún servidor): se valida, se limpia el fondo, se recorta y se incrusta en el PDF.
    const SIG_MAX_BYTES=5*1024*1024,SIG_MAX_PIXELS=50e6,SIG_MIN_SIDE=40,SIG_WORK_MAX=1600,SIG_OUT_W=900,SIG_OUT_H=300,SIG_STORE_KEY='essa_signature';
    const sigSession=new Map();   // firma en memoria por persona mientras la aplicación esté abierta (se borra al cerrar sesión)
    const sigUser=()=>String(state.user?.email||'').toLowerCase();
    const sigErr=msg=>Object.assign(new Error(msg),{userMessage:msg});
    function sigStoreRead(){try{const a=JSON.parse(localStorage.getItem(SIG_STORE_KEY)||'{}')||{};return typeof a[sigUser()]==='string'?a[sigUser()]:null}catch(_){return null}}
    function sigStoreWrite(url){try{const a=JSON.parse(localStorage.getItem(SIG_STORE_KEY)||'{}')||{};if(url)a[sigUser()]=url;else delete a[sigUser()];localStorage.setItem(SIG_STORE_KEY,JSON.stringify(a));return true}catch(_){return false}}
    function fmtClearSession(){sigSession.clear();fmtState.sig=null;fmtState.sigSrc=null;fmtState.msigImg=null;fmtState.msigLoading=null;fmtState.msigError=null;fmtState.msigRes=null}
    // Tipo real del archivo por sus primeros bytes (no solo por la extensión): PNG, JPEG o WebP. SVG y otros formatos se rechazan.
    async function sigSniff(file){
      const b=new Uint8Array(await file.slice(0,12).arrayBuffer());
      return (b[0]===0x89&&b[1]===0x50&&b[2]===0x4E&&b[3]===0x47)||(b[0]===0xFF&&b[1]===0xD8&&b[2]===0xFF)||(b[0]===0x52&&b[1]===0x49&&b[2]===0x46&&b[3]===0x46&&b[8]===0x57&&b[9]===0x45&&b[10]===0x42&&b[11]===0x50);
    }
    async function sigDecode(blobOrUrl){
      if(typeof blobOrUrl!=='string'&&window.createImageBitmap){try{return await createImageBitmap(blobOrUrl)}catch(_){}}
      const url=typeof blobOrUrl==='string'?blobOrUrl:URL.createObjectURL(blobOrUrl);
      try{const img=new Image();img.src=url;await img.decode();return img}finally{if(typeof blobOrUrl!=='string')setTimeout(()=>URL.revokeObjectURL(url),1500)}
    }
    const sigDims=s=>({w:s.naturalWidth||s.width,h:s.naturalHeight||s.height});
    // Corrige fondos de fotos y escaneos: estima el «papel» por bloques (tolera sombras y luz desigual) y lo vuelve blanco; la tinta conserva su color.
    function sigNormalize(d,w,h){
      const lumAt=i=>.299*d[i]+.587*d[i+1]+.114*d[i+2],B=Math.max(24,Math.min(80,Math.round(Math.max(w,h)/20))),gw=Math.ceil(w/B),gh=Math.ceil(h/B),bg=new Float32Array(gw*gh),hist=new Uint32Array(256);
      for(let by=0;by<gh;by++)for(let bx=0;bx<gw;bx++){
        hist.fill(0);let n=0;const xe=Math.min(w,(bx+1)*B),ye=Math.min(h,(by+1)*B);
        for(let y=by*B;y<ye;y+=2)for(let x=bx*B;x<xe;x+=2){hist[Math.round(lumAt((y*w+x)*4))]++;n++}
        let acc=0,v=255;for(let k=0;k<256;k++){acc+=hist[k];if(acc>=n*.9){v=k;break}}bg[by*gw+bx]=v;
      }
      if([...bg].sort((a,b)=>a-b)[bg.length>>1]<110)return false;   // fondo oscuro: no se intenta corregir
      // Los índices y pesos de interpolación horizontales solo dependen de x: se calculan una vez por columna (mismas operaciones, mismo resultado).
      const X0=new Int32Array(w),X1=new Int32Array(w),FX=new Float64Array(w),OMFX=new Float64Array(w);
      for(let x=0;x<w;x++){const gx=Math.min(gw-1,Math.max(0,(x+.5)/B-.5)),x0=Math.floor(gx),fx=gx-x0;X0[x]=x0;X1[x]=Math.min(gw-1,x0+1);FX[x]=fx;OMFX[x]=1-fx}
      for(let y=0;y<h;y++){const gy=Math.min(gh-1,Math.max(0,(y+.5)/B-.5)),y0=Math.floor(gy),y1=Math.min(gh-1,y0+1),fy=gy-y0,omfy=1-fy,r0=y0*gw,r1=y1*gw;
        for(let x=0,i=y*w*4;x<w;x++,i+=4){const x0=X0[x],x1=X1[x],fx=FX[x],omfx=OMFX[x],
            b=Math.max(60,(bg[r0+x0]*omfx+bg[r0+x1]*fx)*omfy+(bg[r1+x0]*omfx+bg[r1+x1]*fx)*fy),r=d[i],g=d[i+1],bl=d[i+2],a=Math.min(1,Math.max(0,(.92-(.299*r+.587*g+.114*bl)/b)/.42)),k=255/b,ia=255*(1-a);
          d[i]=Math.round(ia+Math.min(255,r*k)*a);d[i+1]=Math.round(ia+Math.min(255,g*k)*a);d[i+2]=Math.round(ia+Math.min(255,bl*k)*a);
        }}
      return true;
    }
    // Recorta al trazo (con un margen pequeño), limita el tamaño y devuelve píxeles RGB sobre fondo blanco. null = no hay firma visible.
    function sigTrim(c){
      const w=c.width,h=c.height,d=c.getContext('2d',{willReadFrequently:true}).getImageData(0,0,w,h).data;let x0=w,y0=h,x1=-1,y1=-1,ink=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(.299*d[i]+.587*d[i+1]+.114*d[i+2]<235){ink++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
      if(ink<Math.max(25,w*h*.0002))return null;
      const m=Math.round(Math.max(x1-x0+1,y1-y0+1)*.04)+2,sx=Math.max(0,x0-m),sy=Math.max(0,y0-m),sw=Math.min(w,x1+m+1)-sx,sh=Math.min(h,y1+m+1)-sy,k=Math.min(1,SIG_OUT_W/sw,SIG_OUT_H/sh),ow=Math.max(1,Math.round(sw*k)),oh=Math.max(1,Math.round(sh*k));
      const o=document.createElement('canvas');o.width=ow;o.height=oh;const ox=o.getContext('2d',{willReadFrequently:true});ox.fillStyle='#fff';ox.fillRect(0,0,ow,oh);ox.imageSmoothingQuality='high';ox.drawImage(c,sx,sy,sw,sh,0,0,ow,oh);
      const od=ox.getImageData(0,0,ow,oh).data,rgb=new Uint8Array(ow*oh*3);for(let i=0,j=0;i<od.length;i+=4){rgb[j++]=od[i];rgb[j++]=od[i+1];rgb[j++]=od[i+2]}
      return {w:ow,h:oh,rgb,url:o.toDataURL('image/png')};
    }
    function sigFromSource(src,removeBg){
      const {w:sw,h:sh}=sigDims(src),k=Math.min(1,SIG_WORK_MAX/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*k)),h=Math.max(1,Math.round(sh*k)),c=document.createElement('canvas');c.width=w;c.height=h;
      const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,w,h);x.imageSmoothingQuality='high';x.drawImage(src,0,0,w,h);   // lo transparente queda blanco
      if(removeBg){const img=x.getImageData(0,0,w,h);if(sigNormalize(img.data,w,h))x.putImageData(img,0,0)}
      return sigTrim(c);
    }
    async function sigFromDataUrl(url){const bmp=await sigDecode(url),r=sigFromSource(bmp,false);if(!r)throw sigErr('La firma guardada no es válida.');return r}
    function sigMsg(msg){const m=$('#sigMsg');if(!m)return;m.hidden=!msg;m.textContent=msg||''}
    function sigRenderResult(){
      const box=$('#sigResult');if(!box)return;const s=fmtState.sig;box.hidden=!s;if(!s)return;
      $('#sigThumb').src=s.url;$('#sigMeta').textContent=`${s.w} × ${s.h} px · ${fmtState.sigSource==='stored'?'guardada en este equipo':'imagen subida'}`;
    }
    function fmtSetSignature(sig,source){
      fmtState.sig=sig;fmtState.sigSource=source;
      if(sig)sigSession.set(sigUser(),sig);else sigSession.delete(sigUser());
      if(fmtState.sigRemember){if(sig&&!sigStoreWrite(sig.url)){fmtState.sigRemember=false;$('#sigRemember').checked=false;sigMsg('No se pudo guardar la firma en este equipo (almacenamiento lleno o bloqueado). Se usará solo en esta sesión.')}else if(!sig)sigStoreWrite(null)}
      sigRenderResult();fmtSchedule();
    }
    async function sigHandleFile(file){
      sigMsg('');if(!file)return;
      try{
        if(!file.size)throw sigErr('El archivo está vacío.');
        if(file.size>SIG_MAX_BYTES)throw sigErr('La imagen pesa más de 5 MB. Reduce su tamaño e inténtalo de nuevo.');
        if(!(await sigSniff(file)))throw sigErr('Formato no permitido. Usa una imagen PNG, JPG o WebP.');
        let bmp;try{bmp=await sigDecode(file)}catch(_){throw sigErr('No se pudo leer la imagen. Puede estar dañada; prueba con otra.')}
        const {w,h}=sigDims(bmp);
        if(Math.max(w,h)<SIG_MIN_SIDE)throw sigErr(`La imagen es demasiado pequeña (mínimo ${SIG_MIN_SIDE} píxeles por lado).`);
        if(w*h>SIG_MAX_PIXELS)throw sigErr('La imagen es demasiado grande (máximo 50 megapíxeles).');
        fmtState.sigSrc?.close?.();fmtState.sigSrc=bmp;
        const sig=sigFromSource(bmp,$('#sigRemoveBg').checked);
        if(!sig)throw sigErr('No se detectó ninguna firma en la imagen. Verifica que el trazo se vea sobre un fondo claro.');
        fmtSetSignature(sig,'upload');toast('Firma agregada al formato','success');
      }catch(e){sigMsg(e.userMessage||'No fue posible procesar la imagen. Prueba con otra.')}
    }
    function sigBind(){
      const drop=$('#sigDrop'),file=$('#sigFile');
      const pick=()=>file.click();drop.addEventListener('click',e=>{if(e.target!==file)pick()});drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick()}});
      file.addEventListener('change',async()=>{const f=file.files[0];file.value='';await sigHandleFile(f)});
      let depth=0;drop.addEventListener('dragenter',e=>{e.preventDefault();depth++;drop.classList.add('is-dragging')});drop.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'});
      drop.addEventListener('dragleave',e=>{e.preventDefault();depth=Math.max(0,depth-1);if(!depth)drop.classList.remove('is-dragging')});
      drop.addEventListener('drop',async e=>{e.preventDefault();depth=0;drop.classList.remove('is-dragging');const fs=[...e.dataTransfer.files];await sigHandleFile(fs[0]);if(fs.length>1)toast('Se usó solo la primera imagen.','info')});
      $('#sigRemoveBg').addEventListener('change',()=>{if(fmtState.sigSource==='upload'&&fmtState.sigSrc){const s=sigFromSource(fmtState.sigSrc,$('#sigRemoveBg').checked);if(s){sigMsg('');fmtSetSignature(s,'upload')}else sigMsg('Con esta opción no se detecta la firma. Vuelve a activarla o usa otra imagen.')}});
      $('#sigRemove').onclick=()=>{fmtState.sigSrc?.close?.();fmtState.sigSrc=null;fmtSetSignature(null,'');sigStoreWrite(null);sigMsg('');toast('Firma eliminada del formato','info')};
      const rem=$('#sigRemember');rem.checked=fmtState.sigRemember;
      rem.addEventListener('change',()=>{fmtState.sigRemember=rem.checked;if(rem.checked){if(fmtState.sig&&!sigStoreWrite(fmtState.sig.url)){rem.checked=false;fmtState.sigRemember=false;sigMsg('No se pudo guardar la firma en este equipo (almacenamiento lleno o bloqueado).')}else if(!fmtState.sig)toast('Tu firma se guardará en este equipo cuando la agregues','info')}else{sigStoreWrite(null)}});
      sigRenderResult();
    }
    // Al abrir el diálogo: recupera la firma de la sesión o la guardada en este equipo (si la persona decidió recordarla)
    async function sigRestore(){
      fmtState.sigSrc=null;fmtState.sigSource='';
      const mem=sigSession.get(sigUser()),stored=sigStoreRead();fmtState.sigRemember=!!stored;
      if(mem){fmtState.sig=mem;fmtState.sigSource=stored?'stored':'upload'}
      else if(stored){try{fmtState.sig=await sigFromDataUrl(stored);fmtState.sigSource='stored';sigSession.set(sigUser(),fmtState.sig)}catch(_){sigStoreWrite(null);fmtState.sig=null;fmtState.sigRemember=false}}
      else fmtState.sig=null;
    }
    // ===== Formato de horas extras: diálogo, vinculación de datos y descarga =====
    const FMT_LOGO_SRC=window.__APP_ASSETS__?.essaLogo||'';
    // Estados que se incluyen por defecto (solicitudes ya enviadas); el funcionario puede marcar o desmarcar cada una.
    const FMT_DEFAULT_STATUSES=new Set(['approved','pending_execution','validated','closed']);   // solo horas con aprobación válida
        const fmtState={month:'',rows:new Map(),prefs:{},position:{kind:'',custom:''},logo:null,timer:null,busy:false,sig:null,sigSrc:null,sigSource:'',sigRemember:false};
    const fmtMonthKey=d=>String(d||'').slice(0,7);
    const fmtMonthName=key=>{const [y,m]=String(key).split('-').map(Number);return dfMonthLong().format(new Date(y,(m||1)-1,1)).toUpperCase()};
    const fmtMonthLabel=key=>{const n=fmtMonthName(key).toLowerCase();return `${n.charAt(0).toUpperCase()}${n.slice(1)} ${String(key).slice(0,4)}`};
    const fmtActivities=r=>{const list=getStructuredActivities(r).map(x=>x.name).filter(Boolean);return list.length?list.join('; '):String(r.reason||'')};
    // Preferencias por persona y equipo: solo Cargo, Cédula y «quien recibe». El jefe inmediato NO se recuerda aquí: lo define el administrador (Configuración).
    function fmtReadPrefs(){return {receiver:String(state.userSettings?.format_receiver||'')}}
    function fmtSavePrefs(){const v=String(fmtState.prefs.receiver||'').replace(/[<>\u0000-\u001f]/g,'').replace(/\s+/g,' ').trim().slice(0,120);if(v!==String(state.userSettings?.format_receiver||''))saveUserSetting('format_receiver',v)}
    // Convierte el logo original del formato en píxeles RGB para incrustarlo en el PDF.
    async function fmtLoadLogo(){
      if(fmtState.logo)return fmtState.logo;
      const img=new Image();img.src=FMT_LOGO_SRC;await img.decode();
      const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.drawImage(img,0,0);
      const d=x.getImageData(0,0,c.width,c.height).data,rgb=new Uint8Array(c.width*c.height*3);for(let i=0,j=0;i<d.length;i+=4){rgb[j++]=d[i];rgb[j++]=d[i+1];rgb[j++]=d[i+2]}
      return fmtState.logo={w:c.width,h:c.height,rgb};
    }
    // Vinculación: cada campo del formato ← dato del aplicativo
    //   Nombre ← perfil.full_name · Cédula ← perfil.document_number · Cargo / Quien recibe ← diálogo (el aplicativo no los almacena)
    //   Jefe inmediato ← parámetro del sistema «immediate_manager_name» (Configuración, solo administradores)
    //   Mes ← mes elegido · DÍA ← execution_date · ACTIVIDAD REALIZADA ← selected_activities · MAÑANA/TARDE ← start_time/end_time
    //   TOTAL ← hours_requested · OBSERVACIONES ← radicado (editable) · AUXILIOS D/A/C ← marcas del diálogo · Fecha ← hoy
    function fmtCollect(){
      const rows=state.requests.filter(r=>fmtMonthKey(r.execution_date)===fmtState.month&&approvedHoursOf(r)!=null&&fmtState.rows.get(r.id)?.include).map(r=>{const s=fmtState.rows.get(r.id),a=auxOf(r);return {date:r.execution_date,start:r.start_time,end:r.end_time,hours:approvedHoursOf(r),activity:fmtActivities(r),aux:{d:a.breakfast,a:a.lunch,c:a.dinner},obs:s.obs}});
      const p=fmtState.prefs,sg=fmtSigRefresh(),useSig=sg.status==='ok'&&!!sg.img;return {name:state.profile.full_name,position:positionState().value,idNumber:p.idNumber,month:fmtMonthName(fmtState.month),rows,receiver:p.receiver,manager:useSig?(sg.managerName||immediateManagerName()):immediateManagerName(),date:toISODate(new Date()),signature:fmtState.sig?{w:fmtState.sig.w,h:fmtState.sig.h}:null,managerSignature:useSig?{w:sg.img.w,h:sg.img.h}:null};
    }
    function fmtMonths(){
      const keys=new Set(state.requests.map(r=>fmtMonthKey(r.execution_date)).filter(Boolean));keys.add(toISODate(new Date()).slice(0,7));
      return [...keys].sort().reverse();
    }
    function fmtDefaultMonth(){
      const nowKey=toISODate(new Date()).slice(0,7),withSent=k=>state.requests.some(r=>fmtMonthKey(r.execution_date)===k&&FMT_DEFAULT_STATUSES.has(r.status));
      if(withSent(nowKey))return nowKey;const latest=state.requests.filter(r=>FMT_DEFAULT_STATUSES.has(r.status)).map(r=>fmtMonthKey(r.execution_date)).sort().pop();return latest||nowKey;
    }
    function fmtFileName(){
      const slug=String(state.profile.full_name||'Funcionario').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
      return `Formato_Horas_Extras_${fmtMonthName(fmtState.month)}_${fmtState.month.slice(0,4)}_${slug}.pdf`;
    }
    const fmtPdfDate=d=>`D:${d.toISOString().replace(/[-:T]/g,'').slice(0,14)}Z`;
    function fmtUpdatePreview(){
      const box=$('#fmtPreview');if(!box)return;const model=buildFormatModel(fmtCollect()),pages=layoutFormat(model),src=FMT_LOGO_SRC;
      // Solo se reemplazan las páginas cuyo contenido cambió (antes se volvía a analizar el SVG completo, con firma y logo en base64, en cada tecla).
      const figs=pages.map((p,i)=>`<figure class="fmt-page">${fmtSvg(p,src,`Vista previa del formato, página ${i+1} de ${pages.length}`,fmtState.sig?.url,fmtState.msigRes?.img?.url)}${pages.length>1?`<figcaption>Página ${i+1} de ${pages.length}</figcaption>`:''}</figure>`),prev=box._figs;
      if(prev&&prev.length===figs.length&&box.children.length===figs.length){const tpl=document.createElement('template');figs.forEach((h,i)=>{if(h!==prev[i]){tpl.innerHTML=h;box.replaceChild(tpl.content.firstElementChild,box.children[i])}})}else box.innerHTML=figs.join('');
      box._figs=figs;
      const mg=$('#fmtManager');if(mg)mg.value=model.manager||immediateManagerName();fmtRenderMsigBox(fmtState.msigRes);   // refleja un cambio hecho por el administrador mientras el diálogo está abierto
      const included=model.rows.length;
      $('#fmtSummary').textContent=included?`${included} solicitud${included===1?'':'es'} · ${num(model.hoursTotal)} h en total`:'Selecciona al menos una solicitud para generar el formato.';
      const ps=positionState();$('#fmtMissing').textContent=!ps.ok?'Escribe tu cargo para generar el formato.':!fmtState.position.kind?'Sin completar: Cargo. Se imprimirá en blanco para diligenciarlo a mano.':fmtReadyText();fmSync(included,model.hoursTotal,ps);fmMore();
      $$('.fmt-go').forEach(b=>{b.disabled=!included||fmtState.busy;b.setAttribute('aria-disabled',String(!included||fmtState.busy))});
    }
    const fmtSchedule=()=>{clearTimeout(fmtState.timer);fmtState.timer=setTimeout(fmtUpdatePreview,50)};
    function fmtSyncMonth(){
      fmtState.rows=new Map([...fmtState.rows]);   // se conservan las marcas ya hechas al cambiar de mes
      state.requests.forEach(r=>{if(!fmtState.rows.has(r.id))fmtState.rows.set(r.id,{include:FMT_DEFAULT_STATUSES.has(r.status),aux:{d:false,a:false,c:false},obs:r.filing_number||''})});
      $('#fmtRows').innerHTML=fmtRowsHTML();fmtUpdatePreview();
    }
    async function fmtGenerate(open){
      const btn=document.getElementById(open?'fmtOpen':'fmtDownload');if(!btn||btn.disabled||fmtState.busy)return;   // evita descargas duplicadas por doble clic
        const ps=positionState();if(!ps.ok){positionShowError(ps.error);$('#fmtPositionOther')?.focus();return}
      const popup=open?window.open('','_blank'):null;   // se abre de inmediato para conservar el permiso del navegador
      fmtState.busy=true;fmtUpdatePreview();setBusy(btn,true,'Generando');fmFlash('busy');let fmRes=null;
      try{
        const sres=await fmtEnsureSignature();if(sres.status==='ok'&&!sres.img){fmRes={k:'err',msg:'No se pudo cargar la firma del jefe inmediato. El formato no se generó para no entregar un documento sin la firma esperada.'};popup?.close();toast('No fue posible cargar la firma del jefe inmediato. Inténtalo de nuevo: el formato no se generó para no entregar un documento sin la firma esperada.','error',sres.error||'');fmtRenderMsigBox(fmtState.msigRes);return}
        fmStage(1);await fmWait();
        const model=buildFormatModel(fmtCollect()),pages=layoutFormat(model),logo=await fmtLoadLogo().catch(()=>null);
        fmStage(2);
        let sig=null;if(fmtState.sig){const z=await fmtDeflate(fmtState.sig.rgb);sig={w:fmtState.sig.w,h:fmtState.sig.h,data:z.data,flate:z.flate}}   // la firma viaja dentro del PDF (comprimida sin pérdida)
        let msig=null;if(model.managerSignature&&sres.img){const z=await fmtDeflate(sres.img.rgb);msig={w:sres.img.w,h:sres.img.h,data:z.data,flate:z.flate}}   // la firma del jefe viaja dentro del PDF (comprimida sin pérdida)
        fmStage(3);await fmWait();
        const bytes=fmtPdfBytes(pages,{logo,sig,msig,title:`Formato soporte horas extras y auxilios - ${model.month}`,author:model.name,subject:`Soporte de horas extras y auxilios · ${fmtMonthLabel(fmtState.month)}`,pdfDate:fmtPdfDate(new Date())});
        const blob=new Blob([bytes],{type:'application/pdf'}),url=URL.createObjectURL(blob),name=fmtFileName();
        if(open){if(popup){popup.location.href=url}else toast('El navegador bloqueó la nueva pestaña. Usa «Descargar PDF».','warning');setTimeout(()=>URL.revokeObjectURL(url),120000)}
        else{const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('PDF generado correctamente','success',name)}
        fmRes={k:'ok',open,name};fmtSavePrefs();savePosition();
      }catch(e){popup?.close();console.error(e);fmRes={k:'err',msg:'No fue posible generar el PDF. Inténtalo de nuevo.'};toast('No fue posible generar el PDF. Inténtalo de nuevo.','error')}
      finally{await new Promise(r=>setTimeout(r,700));fmtState.busy=false;setBusy(btn,false);fmtUpdatePreview();fmDone(btn,fmRes)}   // breve pausa: confirma visualmente la generación y evita un segundo clic accidental
    }
    // =====================================================================================================
    // Diálogo «Soporte de horas extras y auxilios · Generar formato» (prefijo fm-)
    // Solo cambia la presentación. Se conservan los IDs, eventos y funciones que usa la lógica existente:
    // #fmtMonth, #fmtId, #fmtReceiver, #fmtManager, cargo (positionFieldsHTML/positionOtherHTML), firma (sigBind), #fmtRows,
    // #fmtPreview, #fmtSummary, #fmtMissing, #fmtMsigBox, #fmtOpen y #fmtDownload (.fmt-go). La generación y descarga siguen en fmtGenerate.
    // Concepto: el formato es un documento. Un encabezado «de expediente» resume lo que llevará el PDF y la vista previa vive sobre una mesa oscura.
    // =====================================================================================================
    const FM_P={
      docCheck:'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path><path d="m9 15 2 2 4-4"></path>',
      cal:'<path d="M7 2v3M17 2v3M3 9h18"></path><rect x="3" y="4" width="18" height="17" rx="2"></rect>',
      user:'<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle>',
      pen:'<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path>',
      seal:'<circle cx="12" cy="9" r="6"></circle><path d="m8.5 14-1.5 8 5-3 5 3-1.5-8"></path>',
      stamp:'<path d="M5 22h14"></path><path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z"></path><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13"></path>',
      download:'<path d="M12 3v12m0 0-4-4m4 4 4-4"></path><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path>',
      external:'<path d="M14 3h7v7"></path><path d="M21 3 10 14"></path><path d="M19 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"></path>',
      list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"></path>',
      briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"></rect><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"></path>',
      upload:'<path d="M12 15V3m0 0L8 7m4-4 4 4"></path><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path>',
      check:'<path d="m5 12.5 4.5 4.5L19 7"></path>',
      x:'<path d="M18 6 6 18M6 6l12 12"></path>',
      warn:'<circle cx="12" cy="12" r="9"></circle><path d="M12 7.5v5M12 16.5h.01"></path>',
      dot:'<path d="M7 12h10"></path>',
      info:'<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 7.9h.01"></path>',
      trash:'<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>',
      down:'<path d="M12 5v14m0 0-6-6m6 6 6-6"></path>',
      inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"></path><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1Z"></path>'
    };
    const fmI=k=>svgIcon(FM_P[k]||FM_P.info);
    const FM_CHECKS=[['rows','Registros','list'],['pos','Cargo','briefcase'],['sig','Tu firma','pen'],['msig','Firma del jefe','seal']];
    const FM_STAGES=['Verificando las firmas','Armando las páginas','Incrustando las firmas','Construyendo el PDF'];
    const fmCard=(n,icon,title,sub,tag,inner,extra='')=>`<section class="fm-card" data-s="${n}" style="--i:${n-1}"${extra}><header class="fm-card-h"><span class="fm-num" aria-hidden="true"><b>${n}</b></span><div class="fm-card-t"><h4>${title}</h4><p>${sub}</p></div>${tag||''}</header><div class="fm-card-b">${inner}</div></section>`;
    // ---------- Firma del funcionario (mismos IDs que usa sigBind / sigRenderResult / sigMsg) ----------
    function sigSectionHTML(){
      return fmCard(3,'pen','Firma del funcionario','Se imprime en el espacio «FIRMA FUNCIONARIO». Si no la agregas, queda libre para firmar a mano.','<span class="fm-tag">Opcional</span>',`
        <div id="sigDrop" class="fm-drop" role="button" tabindex="0" aria-label="Subir imagen de la firma. Arrastra un archivo aquí o presiona Intro para seleccionarlo">
          <span class="fm-drop-ico" aria-hidden="true">${fmI('upload')}</span>
          <span class="fm-drop-copy"><b>Arrastra la imagen de tu firma aquí</b><span>También puedes seleccionarla desde tu dispositivo o tomarle una foto.</span><span class="fm-chips"><i>PNG, JPG o WebP</i><i>Máximo 5 MB</i></span></span>
          <span class="fm-drop-btn">Seleccionar imagen</span>
          <input id="sigFile" type="file" accept="image/png,image/jpeg,image/webp" aria-hidden="true" tabindex="-1">
        </div>
        <p class="fm-msg" id="sigMsg" role="alert" hidden></p>
        <div class="fm-sigres" id="sigResult" hidden><figure class="fm-sigpad"><img id="sigThumb" alt="Vista previa de la firma agregada"></figure><div class="fm-sigres-t"><strong>Firma lista para el formato</strong><span id="sigMeta" class="small muted"></span></div>
          <button type="button" class="fm-btn fm-btn--danger" id="sigRemove">${fmI('trash')}<span>Quitar firma</span></button></div>
        <div class="fm-opts">
          <label class="fm-opt"><input type="checkbox" id="sigRemoveBg" checked><span class="fm-sw" aria-hidden="true"></span><span class="fm-opt-t">Quitar el fondo y recortar alrededor de la firma <em>Recomendado para fotos y escaneos</em></span></label>
          <label class="fm-opt"><input type="checkbox" id="sigRemember"><span class="fm-sw" aria-hidden="true"></span><span class="fm-opt-t">Recordar mi firma en este equipo <em>No lo uses en equipos compartidos</em></span></label>
        </div>
        <p class="fm-note">${fmI('shield')}<span>La firma solo se usa en tu navegador para armar el PDF; no se envía a ningún servidor. Si no la recuerdas, se conserva únicamente mientras la aplicación esté abierta.</span></p>`,' id="sigSection"');
    }
    // ---------- Registros del mes: cada solicitud es un «tiquete» con interruptor de inclusión ----------
    function fmtRowsHTML(){
      const list=state.requests.filter(r=>fmtMonthKey(r.execution_date)===fmtState.month&&approvedHoursOf(r)!=null).sort((a,b)=>String(a.execution_date).localeCompare(String(b.execution_date))||String(a.start_time).localeCompare(String(b.start_time)));
      if(!list.length)return `<div class="fm-empty"><span aria-hidden="true">${fmI('inbox')}</span><p>No tienes solicitudes aprobadas con fecha de ejecución en ${esc(fmtMonthLabel(fmtState.month))}.</p><small>El formato solo incluye horas con aprobación válida.</small></div>`;
      return list.map((r,i)=>{
        const s=fmtState.rows.get(r.id),id=esc(r.id),no=esc(r.filing_number),a=auxOf(r),day=String(r.execution_date).slice(8,10),wd=mdWeekday(r.execution_date).slice(0,3).toUpperCase();
        const chips=[['breakfast','D','Desayuno'],['lunch','A','Almuerzo'],['dinner','C','Comida']].map(([k,l,n])=>`<span class="fm-chip${a[k]?' is-on':''}" role="img" aria-label="${n}: ${a[k]?'aplica':'no aplica'} (calculado según el turno)" title="${n}: ${a[k]?'aplica':'no aplica'} · calculado automáticamente según tu turno">${l}</span>`).join('');
        return `<div class="fm-row${s.include?'':' is-off'}" data-row="${id}" style="--i:${i}">
          <label class="fm-row-head"><input type="checkbox" class="fm-check" data-fmt="include" ${s.include?'checked':''} aria-label="Incluir la solicitud ${no} en el formato"><span class="fm-sw" aria-hidden="true"></span>
            <span class="fm-date" aria-hidden="true"><b>${esc(day)}</b><i>${esc(wd)}</i></span>
            <span class="fm-row-main"><span class="fm-row-title"><strong>${no}</strong><span>${esc(fmtTime12(r.start_time))} – ${esc(fmtTime12(r.end_time))}${r.end_time<=r.start_time?' <em>+1 día</em>':''}</span></span><span class="fm-row-act">${esc(fmtActivities(r))}</span></span>
            <span class="fm-row-side"><span class="fm-hrs" title="Horas aprobadas"><b>${num(approvedHoursOf(r))}</b> h</span>${statusBadge(r.status)}</span></label>
          <div class="fm-row-ctl"><span class="fm-aux" role="group" aria-label="Auxilios de la solicitud ${no}"><span class="fm-aux-l">Auxilios</span>${chips}<span class="fm-aux-s">${esc(auxStatusLabel(r))}</span></span>${msigRowChip(r)}
            <label class="fm-obs"><span>Observaciones</span><input class="control" data-fmt="obs" value="${esc(s.obs)}" maxlength="200" placeholder="Opcional" ${s.include?'':'disabled'}></label></div>
        </div>`}).join('');
    }
    // ---------- Cifras, lista de comprobación y texto de estado (se llama desde fmtUpdatePreview) ----------
    function fmSync(included,hours,ps){
      const root=document.querySelector('#modalRoot .modal.fm');if(!root)return;
      const all=state.requests.filter(r=>fmtMonthKey(r.execution_date)===fmtState.month&&approvedHoursOf(r)!=null).length,ml=fmtMonthLabel(fmtState.month),$$id=id=>document.getElementById(id);
      const mo=$$id('fmStatMonth');if(mo&&mo.textContent!==ml)mo.textContent=ml;
      const c=$$id('fmStatCount'),h=$$id('fmStatHours');if(c)rqTween(c,included,v=>String(Math.round(v)));if(h)rqTween(h,hours||0,v=>num(v));
      const tag=$$id('fmRowsTag');if(tag){const t=all?`${included} de ${all} incluida${all===1?'':'s'}`:'Sin registros';if(tag.textContent!==t)tag.textContent=t;tag.dataset.state=!all?'idle':included?'ok':'bad'}
      const sub=$$id('fmGoSub');if(sub)sub.textContent=included?`${ml} · ${included} solicitud${included===1?'':'es'}`:'Sin solicitudes';
      const r=fmtState.msigRes,pv=!ps.ok?['bad','Falta escribirlo']:!fmtState.position.kind?['warn','Quedará en blanco']:['ok',ps.value||'Definido'];
      const mv=r?.status==='ok'&&r.img?['ok','Incluida']:r?.status==='ok'?(r.error?['warn','No se pudo cargar']:['idle','Cargando…']):r?.status==='mixed'?['warn','Jefes distintos']:['idle','No incluida'];
      const st={rows:included?['ok',`${included} incluida${included===1?'':'s'}`]:['bad','Sin selección'],pos:pv,sig:fmtState.sig?['ok','Incluida']:['idle','A mano'],msig:mv};
      FM_CHECKS.forEach(([k])=>{const li=root.querySelector(`.fm-ck[data-k="${k}"]`);if(!li)return;const [state_,txt]=st[k],key=state_+'|'+txt;if(li._k===key)return;const first=li._k===undefined;li._k=key;li.dataset.state=state_;li.querySelector('em').textContent=txt;if(!first){li.classList.remove('is-bump');void li.offsetWidth;li.classList.add('is-bump')}});
      const miss=$$id('fmtMissing');if(miss){if(!included)miss.textContent='Selecciona al menos una solicitud para generar el formato.';miss.closest('.fm-foot-note')?.setAttribute('data-tone',!included||!ps.ok?'bad':!fmtState.position.kind?'warn':'ok')}
    }
    // Aviso «desplázate»: visible solo mientras la vista previa tiene contenido por debajo del área visible
    function fmMore(){const box=document.getElementById('fmtPreview'),desk=box?.closest('.fm-desk');if(!box||!desk)return;const more=box.scrollHeight-box.clientHeight-box.scrollTop>14;if(desk.dataset.more!==(more?'1':'0'))desk.dataset.more=more?'1':'0'}
    // ---------- Estado de la generación: progreso real por etapas, confirmación o error ----------
    const fmWait=()=>new Promise(r=>setTimeout(r,24));   // cede el hilo para que el navegador pinte la etapa antes del trabajo pesado
    function fmFlash(kind,o={}){
      const box=document.getElementById('fmFlash'),foot=document.getElementById('fmFoot');if(!box||!foot)return;clearTimeout(box._t);
      foot.dataset.flash=kind==='idle'?'':kind;if(kind==='idle')return;box.dataset.k=kind;
      if(kind==='busy')box.innerHTML=`<span class="fm-fl-ico"><i class="fm-orbit"></i></span><div class="fm-fl-t"><strong>Generando el formato</strong><span id="fmStageT">${FM_STAGES[0]}</span></div><ol class="fm-fl-steps" aria-hidden="true">${FM_STAGES.map(()=>'<li></li>').join('')}</ol>`;
      else if(kind==='ok'){box.innerHTML=`<span class="fm-fl-ico">${svgIcon('<path class="fm-draw" pathLength="1" d="m5 12.5 4.5 4.5L19 7"></path>')}</span><div class="fm-fl-t"><strong>${o.open?'PDF abierto en una pestaña nueva':'PDF generado y descargado'}</strong><span class="fm-fl-file">${esc(o.name||'')}</span></div><span class="fm-fl-next">${o.open?'Si no lo ves, usa «Descargar PDF»':'Revísalo con «Abrir PDF»'}</span>`;box._t=setTimeout(()=>fmFlash('idle'),7000)}
      else{box.innerHTML=`<span class="fm-fl-ico">${fmI('x')}</span><div class="fm-fl-t"><strong>No se generó el formato</strong><span>${esc(o.msg||'Inténtalo de nuevo.')}</span></div>`;box._t=setTimeout(()=>fmFlash('idle'),9000)}
    }
    function fmStage(i){const box=document.getElementById('fmFlash');if(!box||box.dataset.k!=='busy')return;box.querySelectorAll('.fm-fl-steps li').forEach((li,j)=>li.classList.toggle('is-on',j<=i));const t=document.getElementById('fmStageT');if(t)t.textContent=FM_STAGES[i]||''}
    function fmDone(btn,res){
      if(!res)return;fmFlash(res.k,res);if(!btn||!btn.isConnected)return;const cls=res.k==='ok'?'is-ok':'is-err';btn.classList.remove('is-ok','is-err');void btn.offsetWidth;btn.classList.add(cls);clearTimeout(btn._ft);btn._ft=setTimeout(()=>btn.classList.remove(cls),res.k==='ok'?2600:900);
    }
    async function openFormatDialog(){
      if(isStaff())return toast('Esta opción es para funcionarios: los roles de gestión no registran horas extras.','warning');
      const p=fmtReadPrefs();fmtState.prefs={idNumber:state.profile.document_number||'',receiver:p.receiver||''};fmtState.position=positionFromProfile(state.profile);
      fmtState.rows=new Map();fmtState.month=fmtDefaultMonth();fmtState.msigImg=null;fmtState.msigLoading=null;fmtState.msigError=null;fmtState.msigRes=null;await sigRestore();
      const months=fmtMonths(),field=(id,label,key,ph)=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" class="control" data-fmt-pref="${key}" value="${esc(fmtState.prefs[key]||'')}" maxlength="120" placeholder="${ph}" autocomplete="off"></div>`,fieldRO=(id,label,value,ph)=>`<div class="field"><label for="${id}">${label}</label><input id="${id}" class="control" value="${esc(value||'')}" placeholder="${ph}" readonly aria-readonly="true"></div>`;
      const stIcons=`<span class="fm-ck-s" aria-hidden="true">${['check','warn','x','dot'].map(k=>fmI(k)).join('')}</span>`;
      modal(`<div class="modal fm" aria-labelledby="fmTitle">
        <header class="fm-head"><div class="fm-head-top">
          <span class="fm-mark" aria-hidden="true">${fmI('docCheck')}<i></i></span>
          <div class="fm-titles"><span class="fm-eyebrow">Soporte de horas extras y auxilios</span><h3 id="fmTitle">Generar formato</h3><p class="fm-sub">Se completa con las solicitudes que ya registraste · ${esc(FMT_META.version)}</p></div>
          <div class="fm-stats" role="group" aria-label="Resumen del formato"><div class="fm-stat"><span>Periodo</span><b id="fmStatMonth">—</b></div><div class="fm-stat"><span>Solicitudes</span><b id="fmStatCount">0</b></div><div class="fm-stat"><span>Horas</span><b id="fmStatHours">0</b></div></div>
          <button type="button" class="close-modal fm-close" onclick="App.closeModal()" aria-label="Cerrar ventana">${fmI('x')}</button></div>
          <ul class="fm-checks" aria-label="Qué incluirá el PDF">${FM_CHECKS.map(([k,l,ic],i)=>`<li class="fm-ck" data-k="${k}" data-state="idle" style="--i:${i}"><span class="fm-ck-i" aria-hidden="true">${fmI(ic)}</span><span class="fm-ck-t"><b>${l}</b><em>—</em></span>${stIcons}</li>`).join('')}</ul></header>
        <div class="fm-body"><div class="fm-layout"><div class="fm-form">
          ${fmCard(1,'cal','Periodo y registros','Elige el mes y marca qué solicitudes aprobadas entran al formato.','<span class="fm-tag" id="fmRowsTag" data-state="idle">—</span>',`<div class="field fm-month"><label for="fmtMonth">Mes del formato</label><select id="fmtMonth" class="control">${months.map(k=>`<option value="${k}" ${k===fmtState.month?'selected':''}>${esc(fmtMonthLabel(k))}</option>`).join('')}</select></div><div id="fmtRows" class="fm-rows" aria-live="polite"></div>`)}
          ${fmCard(2,'user','Datos del funcionario','Información del encabezado del formato.','<span class="fm-tag">Encabezado</span>',`<div class="fm-grid"><div class="field span-2"><label for="fmtName">Nombre</label><input id="fmtName" class="control" value="${esc(state.profile.full_name)}" readonly aria-readonly="true"></div>${positionFieldsHTML()}${fieldRO('fmtId','Cédula',fmtState.prefs.idNumber,'Sin documento en tu perfil: pídelo al administrador')}${positionOtherHTML()}</div>`)}
          ${sigSectionHTML()}
          ${fmCard(4,'stamp','Cierre del formato','Quién aprueba y quién recibe el soporte.','<span class="fm-tag">Firmas</span>',`<div class="fm-grid"><div class="field span-2"><label for="fmtManager">Jefe inmediato</label><input id="fmtManager" class="control" value="${esc(immediateManagerName())}" placeholder="Sin definir: pide al administrador que lo configure" readonly aria-readonly="true" aria-describedby="fmtManagerHelp"><span id="fmtManagerHelp" class="fm-help">Lo define el administrador en Configuración.</span></div><div class="span-2">${field('fmtReceiver','Nombre de quien recibe','receiver','Opcional')}</div></div><div id="fmtMsigBox" class="msig-box" role="status" aria-live="polite"></div><p class="fm-note">${fmI('info')}<span>La firma de quien recibe se diligencia a mano; la del jefe inmediato se inserta sola cuando él aprobó tus solicitudes y tiene su firma registrada. El cargo se guarda en tu perfil; la cédula y quien recibe se recuerdan en este equipo.</span></p>`)}
        </div>
        <aside class="fm-desk" aria-label="Vista previa"><div class="fm-desk-head"><strong>${fmI('docCheck')}Vista previa</strong><span id="fmtSummary" class="fm-sum" role="status"></span></div><div id="fmtPreview" class="fmt-pages" tabindex="0" role="region" aria-label="Vista previa del documento. Usa las flechas o la rueda para desplazarte"></div><span class="fm-more" aria-hidden="true">${fmI('down')}<b>Desplázate para ver todo el documento</b></span></aside></div></div>
        <footer class="fm-foot" id="fmFoot" data-flash=""><div class="fm-foot-info"><div class="fm-foot-note" data-tone="ok">${fmI('info')}<span id="fmtMissing">El PDF se genera con texto seleccionable.</span></div><div id="fmFlash" class="fm-flash" role="status" aria-live="polite"></div></div>
          <div class="fm-actions" role="group" aria-label="Acciones del formato">
            <button type="button" class="fm-btn fm-btn--cancel" onclick="App.closeModal()" aria-label="Cerrar sin generar">${fmI('x')}<span>Cerrar</span></button>
            <button type="button" id="fmtOpen" class="fm-btn fm-btn--alt fmt-go" aria-label="Abrir el PDF en una pestaña nueva">${fmI('external')}<span>Abrir PDF</span></button>
            <button type="button" id="fmtDownload" class="fm-btn fm-btn--go fmt-go" aria-label="Generar y descargar el PDF"><span class="fm-go-ico" aria-hidden="true">${fmI('download')}</span><span class="fm-go-t"><b>Descargar PDF</b><small id="fmGoSub">—</small></span><span class="fm-go-ok" aria-hidden="true">${svgIcon('<path class="fm-draw" pathLength="1" d="m5 12.5 4.5 4.5L19 7"></path>')}<b>PDF generado</b></span></button></div></footer></div>`);
      const root=$('#modalRoot'),dlg=root.querySelector('.modal.fm');enhanceSelectControls(root);
      $('#fmtMonth').addEventListener('change',e=>{fmtState.month=e.target.value;$('#fmtRows').innerHTML='';fmtSyncMonth()});
      dlg.addEventListener('input',e=>{const t=e.target;if(t.dataset.fmtPref){fmtState.prefs[t.dataset.fmtPref]=t.value;fmtSchedule()}else if(t.dataset.fmt==='obs'){const s=fmtState.rows.get(t.closest('[data-row]').dataset.row);if(s){s.obs=t.value;fmtSchedule()}}});
      dlg.addEventListener('change',e=>{const t=e.target;if(t.dataset.fmt==='include'){const row=t.closest('[data-row]'),s=fmtState.rows.get(row.dataset.row);s.include=t.checked;row.classList.toggle('is-off',!t.checked);row.querySelectorAll('[data-fmt="aux"],[data-fmt="obs"]').forEach(x=>x.disabled=!t.checked);fmtUpdatePreview()}});
      dlg.addEventListener('click',e=>{const b=e.target.closest('[data-fmt="aux"]');if(b){const s=fmtState.rows.get(b.closest('[data-row]').dataset.row);s.aux[b.dataset.k]=!s.aux[b.dataset.k];b.setAttribute('aria-pressed',String(s.aux[b.dataset.k]));fmtUpdatePreview()}});
      $('#fmtDownload').onclick=()=>fmtGenerate(false);$('#fmtOpen').onclick=()=>fmtGenerate(true);
      {const pv=$('#fmtPreview');pv.addEventListener('scroll',fmMore,{passive:true});pv.addEventListener('animationend',fmMore);if(window.ResizeObserver)new ResizeObserver(fmMore).observe(pv)}
      positionBind();sigBind();
      fmtSyncMonth();iconRefresh();
    }
    let activeSelectClose=null;
    function enhanceSelectControls(root=document){
      const selects=[];if(root.matches?.('select.control'))selects.push(root);root.querySelectorAll?.('select.control').forEach(s=>selects.push(s));
      selects.forEach(select=>{if(select.dataset.customized){select._customRefresh?.();return}select.dataset.customized='1';select.classList.add('native-select-hidden');const wrapper=document.createElement('div');wrapper.className=`custom-select${select.classList.contains('admin-only')?' admin-only':''}${select.classList.contains('staff-only')?' staff-only':''}${select.classList.contains('hidden')?' hidden':''}`;select.parentNode.insertBefore(wrapper,select);wrapper.appendChild(select);const trigger=document.createElement('button');trigger.type='button';trigger.className='custom-select-trigger';trigger.setAttribute('role','combobox');trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');const valueEl=document.createElement('span');valueEl.className='custom-select-value';const chevron=document.createElement('span');chevron.className='custom-select-chevron';chevron.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="m7 10 5 5 5-5"></path></svg>';trigger.append(valueEl,chevron);wrapper.appendChild(trigger);const menu=document.createElement('div');menu.className='custom-select-menu';menu.setAttribute('role','listbox');menu.id=`custom-${select.id||('select-'+Math.random().toString(36).slice(2,8))}`;trigger.setAttribute('aria-controls',menu.id);document.body.appendChild(menu);let optionButtons=[],activeIndex=0;
        if(select.closest('#modalRoot'))menu.dataset.modalSelect='1';const sync=()=>{const option=select.options[select.selectedIndex]||select.options[0];valueEl.textContent=option?.textContent||'Selecciona una opción';trigger.classList.toggle('is-placeholder',!select.value);trigger.classList.remove('is-invalid');optionButtons.forEach((b,i)=>{const selected=select.options[i]?.selected;b.setAttribute('aria-selected',String(!!selected));if(selected)activeIndex=i})};
        const position=()=>{const r=trigger.getBoundingClientRect(),spaceBelow=innerHeight-r.bottom-12,menuHeight=Math.min(240,Math.max(80,menu.scrollHeight)),up=spaceBelow<menuHeight&&r.top>spaceBelow;menu.style.left=`${Math.max(8,Math.min(r.left,innerWidth-r.width-8))}px`;menu.style.width=`${r.width}px`;menu.style.top=up?`${Math.max(8,r.top-menuHeight-5)}px`:`${Math.min(innerHeight-menuHeight-8,r.bottom+5)}px`;menu.style.maxHeight=`${Math.max(90,up?r.top-16:innerHeight-r.bottom-16)}px`};
        const close=(focus=false)=>{wrapper.classList.remove('is-open');menu.classList.remove('is-open');trigger.setAttribute('aria-expanded','false');if(activeSelectClose===close)activeSelectClose=null;if(focus)trigger.focus()};
        const choose=i=>{const opt=select.options[i];if(!opt||opt.disabled)return;select.selectedIndex=i;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));sync();close(true)};
        const build=()=>{menu.innerHTML='';optionButtons=[...select.options].map((opt,i)=>{const b=document.createElement('button');b.type='button';b.className='custom-select-option';b.setAttribute('role','option');b.disabled=opt.disabled;b.innerHTML=`<span>${esc(opt.textContent)}</span><span class="custom-select-check">✓</span>`;b.onclick=()=>choose(i);b.onmousemove=()=>{activeIndex=i;optionButtons.forEach((x,j)=>x.classList.toggle('is-active',j===i))};menu.appendChild(b);return b});sync()};
        const open=()=>{if(select.disabled)return;if(activeSelectClose&&activeSelectClose!==close)activeSelectClose();activeDateClose?.();activeActivityClose?.();activeTimeClose?.();activeSelectClose=close;wrapper.classList.add('is-open');menu.classList.add('is-open');trigger.setAttribute('aria-expanded','true');position();optionButtons[activeIndex]?.scrollIntoView({block:'nearest'})};
        trigger.onclick=()=>wrapper.classList.contains('is-open')?close():open();trigger.onkeydown=e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();if(!wrapper.classList.contains('is-open'))open();if(e.key==='Home')activeIndex=0;else if(e.key==='End')activeIndex=optionButtons.length-1;else activeIndex=Math.max(0,Math.min(optionButtons.length-1,activeIndex+(e.key==='ArrowDown'?1:-1)));optionButtons.forEach((x,j)=>x.classList.toggle('is-active',j===activeIndex));optionButtons[activeIndex]?.scrollIntoView({block:'nearest'})}else if(e.key==='Enter'||e.key===' '){e.preventDefault();wrapper.classList.contains('is-open')?choose(activeIndex):open()}else if(e.key==='Escape'){e.preventDefault();close(true)}};
        select.addEventListener('invalid',e=>{e.preventDefault();trigger.classList.add('is-invalid');trigger.focus()});select.addEventListener('change',sync);select._customRefresh=()=>{build()};build();onGlobal(window,'resize',wrapper,()=>wrapper.classList.contains('is-open')&&position());onGlobal(document,'scroll',wrapper,()=>wrapper.classList.contains('is-open')&&position(),true);onGlobal(document,'pointerdown',wrapper,e=>{if(wrapper.classList.contains('is-open')&&!wrapper.contains(e.target)&&!menu.contains(e.target))close()})
      })
    }
    function bindStatic(){
      $('#loginForm').addEventListener('submit',login);$('#forgotBtn').onclick=forgotPassword;const setupBtn=$('#openSetupBtn');if(setupBtn)setupBtn.onclick=openSetup;$('#openTechnicalSetup').onclick=openSetup;bindV2Static();bindFinance();$('#logoutBtn').onclick=logout;$('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');$('#sidebarCollapseBtn').onclick=toggleSidebarCompact;bindNotificationCenter();$('#profileBtn').onclick=openProfile;$('#profileChip').onclick=openProfile;$('#profileChip').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openProfile()}};setSidebarCompact(localStorage.getItem('essa_sidebar_compact')==='1');
      $$('.nav-item[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));$$('[data-page-link]').forEach(b=>b.onclick=()=>navigate(b.dataset.pageLink));
      document.addEventListener('click',e=>{const a=e.target.closest('[data-action]');if(!a)return;const fn={
        'new-request':()=>openRequestForm(),'gen-format':openFormatDialog, 'export-requests':()=>exportCSV(filteredOwnRequests(),'mis_solicitudes_horas_extras.csv'), 'export-report':()=>exportCSV(state.reportRows,'reporte_horas_extras.csv'), 'invite-info':inviteInfo,
        'add-department':()=>catalogModal('department'),'add-worktype':()=>catalogModal('worktype')
      }[a.dataset.action];fn?.()});
      ['requestSearch','requestStatusFilter','requestDateFrom','requestDateTo'].forEach(id=>$('#'+id).addEventListener('input',()=>{state.page.requests=1;renderOwnTable()}));
      ['adminSearch','adminStatusFilter','adminDepartmentFilter'].forEach(id=>$('#'+id).addEventListener('input',()=>{state.page.admin=1;renderAdminTable()}));
      $$('.search-box input').forEach(input=>{input.addEventListener('focus',()=>input.parentElement.classList.add('is-focused'));input.addEventListener('blur',()=>input.parentElement.classList.remove('is-focused'))});
      $('#applyReportFilters').onclick=renderReports;$('#chartYear').onchange=renderCharts;$$('.chart-mode').forEach(b=>b.onclick=()=>{state.chartMode=b.dataset.chartMode;renderCharts();enhanceTemporalPickers($('#chartDayControls'))});$('#chartWeekPrev').onclick=()=>{state.chartDate=addDaysISO(state.chartDate,-7);renderCharts()};$('#chartWeekNext').onclick=()=>{state.chartDate=addDaysISO(state.chartDate,7);renderCharts()};$('#chartDay').addEventListener('input',e=>{if(e.target.value){state.chartDate=e.target.value;renderCharts()}});
      $$('.settings-tabs .tab').forEach(t=>t.onclick=()=>{$$('.settings-tabs .tab,.tab-panel').forEach(x=>x.classList.remove('active'));t.classList.add('active');$('#tab-'+t.dataset.tab).classList.add('active')});
      document.addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))closeModal()});document.addEventListener('keydown',e=>{if(e.defaultPrevented||e.key!=='Escape')return;if(document.querySelector('.date-picker')){e.preventDefault();activeDateClose?.(true);return}if(document.querySelector('.time-picker:not(.is-closing)')){e.preventDefault();activeTimeClose?.(true);return}if(document.querySelector('.activity-menu.is-open')){e.preventDefault();activeActivityClose?.(true);return}if(document.querySelector('.custom-select-menu.is-open'))return;if($('#modalRoot .modal'))closeModal()});
    }
    function networkUI(){const on=navigator.onLine;$('.env-pill').classList.remove('hidden');$('#offlineToast').classList.toggle('hidden',on);$('#syncStatus').textContent=on?'Conectado y sincronizado':'Sin conexión';$('.env-dot').style.background=on?'#2563EB':'#DC2626'}
    function initDB(){const r=indexedDB.open('essa_overtime_local',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('drafts'))r.result.createObjectStore('drafts',{keyPath:'userId'})};state.localDB=r}
    const idb={put:data=>new Promise((res,rej)=>{const r=state.localDB.result.transaction('drafts','readwrite').objectStore('drafts').put(data);r.onsuccess=res;r.onerror=()=>rej(r.error)}),get:key=>new Promise((res,rej)=>{const r=state.localDB.result.transaction('drafts').objectStore('drafts').get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}),del:key=>new Promise((res,rej)=>{const r=state.localDB.result.transaction('drafts','readwrite').objectStore('drafts').delete(key);r.onsuccess=res;r.onerror=()=>rej(r.error)})};
    
    // ===== Acceso: estados visuales del inicio de sesión =====
    // La autenticación (credenciales, roles, sesiones y redirecciones) no cambia: esta capa solo valida el formulario,
    // comunica los estados (cargando, éxito, error) y reemplaza los avisos genéricos por mensajes integrados.
    const AUTH_MIN_MS=520,AUTH_SUCCESS_MS=300,authState={busy:false};
    const authSleep=ms=>new Promise(r=>setTimeout(r,ms));
    const authIcon=d=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const AUTH_ALERT_ICON='<path d="M12 3 2 21h20L12 3Z"></path><path d="M12 9.5v4.5M12 17.5h.01"></path>';
    function authField(name){return document.querySelector(`.lg-field[data-field="${name}"]`)}
    function authSetFieldError(name,msg){
      const f=authField(name);if(!f)return;const input=f.querySelector('input'),m=f.querySelector('.lg-msg');
      f.classList.toggle('is-invalid',!!msg);input.setAttribute('aria-invalid',msg?'true':'false');
      if(msg){m.querySelector('span').textContent=msg;m.hidden=false}else m.hidden=true;
    }
    function authSetAlert(msg,action){
      const box=$('#loginAlert'),btn=$('#loginAlertAction');
      $('#lgCard').classList.toggle('has-alert',!!msg);
      if(!msg){box.hidden=true;btn.hidden=true;btn.onclick=null;return}
      $('#loginAlertText').textContent=msg;box.hidden=false;
      if(action){btn.textContent=action.label;btn.hidden=false;btn.onclick=action.run}else{btn.hidden=true;btn.onclick=null}
      box.style.animation='none';void box.offsetWidth;box.style.animation='';
    }
    function authClearErrors(){authSetFieldError('email','');authSetFieldError('password','');authSetAlert('')}
    // Indicación breve de error: resalta el borde y hace una sacudida corta (Web Animations; no se aplica con «reducir movimiento»).
    function authCardError(){const c=$('#lgCard');c.classList.add('is-error');clearTimeout(authCardError.t);authCardError.t=setTimeout(()=>c.classList.remove('is-error'),900);
      if(c.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches)c.animate([{transform:'translateX(0)'},{transform:'translateX(-5px)'},{transform:'translateX(4px)'},{transform:'translateX(-3px)'},{transform:'translateX(2px)'},{transform:'translateX(0)'}],{duration:420,easing:'cubic-bezier(.36,.07,.19,.97)'})}
    function authFail(msg,field,opts={}){
      authClearErrors();authSetAlert(msg,opts.action);authCardError();
      if(field){authField(field)?.classList.add('is-invalid');const inp=authField(field)?.querySelector('input');inp?.setAttribute('aria-invalid','true');inp?.focus()}
      $('#loginStatus').textContent=msg;
    }
    function authValidate(){
      authClearErrors();const email=$('#loginEmail').value.trim(),password=$('#loginPassword').value;let first=null;
      if(!email){authSetFieldError('email','Ingresa tu correo electrónico.');first='email'}
      else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){authSetFieldError('email','Ingresa un correo válido, por ejemplo nombre@empresa.com.');first='email'}
      if(!password){authSetFieldError('password','Ingresa tu contraseña.');first=first||'password'}
      else if(password.length<8){authSetFieldError('password','La contraseña debe tener al menos 8 caracteres.');first=first||'password'}
      if(first){authCardError();authField(first).querySelector('input').focus();return false}
      return true;
    }
    function authBegin(source){
      authState.busy=true;$('#authView').classList.add('is-busy');$('#loginForm').setAttribute('aria-busy','true');
      $('#loginEmail').readOnly=true;$('#loginPassword').readOnly=true;
      const submit=$('#loginSubmit');submit.dataset.state='loading';
      $('#loginStatus').textContent='Verificando acceso…';
    }
    function authEnd(){
      authState.busy=false;$('#authView').classList.remove('is-busy');$('#loginForm').removeAttribute('aria-busy');
      $('#loginEmail').readOnly=false;$('#loginPassword').readOnly=false;$('#loginSubmit').dataset.state='idle';
    }
    // Estado de éxito breve (si el acceso fue concedido) y después se ejecuta la entrada real a la aplicación.
    async function authFinish(task){
      const submit=$('#loginSubmit');if(submit.dataset.state==='loading')submit.dataset.state='success';$('#loginStatus').textContent='Acceso concedido';
      await authSleep(AUTH_SUCCESS_MS);
      try{await task()}finally{
        const app=$('#appView');if(app&&!app.classList.contains('hidden')){app.classList.add('app-enter');setTimeout(()=>app.classList.remove('app-enter'),600)}
        authEnd();
      }
    }
    async function authRun(task,source,minMs=0){
      if(authState.busy)return;authBegin(source);
      try{if(minMs)await authSleep(minMs);await authFinish(task)}catch(err){console.error(err);authEnd();authFail('No fue posible iniciar sesión en este momento. Inténtalo de nuevo.')}
    }
    function authErrorText(error){
      const m=String(error?.message||'');
      if(/invalid login credentials/i.test(m))return 'Correo o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.';
      if(/email not confirmed/i.test(m))return 'No fue posible iniciar sesión con esta cuenta. Contacta al administrador del aplicativo.';
      if(/failed to fetch|network/i.test(m))return 'No fue posible conectar con el servidor. Revisa tu conexión.';
      return errorMsg(error);
    }
    function authReset(){authEnd();authClearErrors();$('#loginPassword').value='';const eye=$('#loginEyeBtn');if(eye&&eye.getAttribute('aria-pressed')==='true')eye.click();$('#loginCaps').hidden=true;$('#loginStatus').textContent=''}
    function setupAuthUI(){
      const eye=$('#loginEyeBtn'),pwd=$('#loginPassword'),caps=$('#loginCaps');
      eye.addEventListener('mousedown',e=>e.preventDefault());eye.onclick=()=>{const show=pwd.type==='password';const a=pwd.selectionStart,z=pwd.selectionEnd;pwd.type=show?'text':'password';try{pwd.setSelectionRange(a,z)}catch(_){}eye.setAttribute('aria-pressed',String(show));eye.setAttribute('aria-label',show?'Ocultar contraseña':'Mostrar contraseña')};
      const checkCaps=e=>{caps.hidden=!(e.getModifierState&&e.getModifierState('CapsLock'))};pwd.addEventListener('keydown',checkCaps);pwd.addEventListener('keyup',checkCaps);pwd.addEventListener('blur',()=>{caps.hidden=true});
      $('#loginEmail').addEventListener('input',()=>{authSetFieldError('email','');authSetAlert('')});pwd.addEventListener('input',()=>{authSetFieldError('password','');authSetAlert('')});
      startAuthClock();
    }
    // Esfera de 24 horas: la aguja indica la hora actual y el texto central la franja (diurna 6:00–19:00 / nocturna 19:00–6:00).
    function startAuthClock(){
      const dial=$('.lg-dial'),clock=$('#lgClock'),tag=$('#lgDialTag'),hand=$('#lgHand');if(!dial||!clock||!hand)return;
      const render=(moveHand)=>{
        if($('#authView').classList.contains('hidden'))return;const d=new Date(),h=d.getHours(),m=d.getMinutes(),night=h<6||h>=19;
        clock.innerHTML=`${pad2(h%12||12)}:${pad2(m)} <em>${h>=12?'P. M.':'A. M.'}</em>`;tag.textContent=night?'Jornada nocturna':'Jornada diurna';dial.dataset.phase=night?'night':'day';
        if(moveHand)hand.style.setProperty('--a',`${((h+m/60)/24*360).toFixed(2)}deg`);
      };
      render(false);setTimeout(()=>render(true),520);setInterval(()=>render(true),15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)render(true)});
    }
    // Freno de intentos fallidos (solo comodidad del navegador; el límite real lo aplica Supabase Auth): cada 5 fallos, bloqueo de 30 s que se duplica (máx. 15 min).
    const LOGIN_GATE_KEY='essa_login_gate';
    const loginGateRead=()=>{try{return JSON.parse(sessionStorage.getItem(LOGIN_GATE_KEY)||'{}')||{}}catch(_){return {}}};
    const loginGateWait=()=>Math.max(0,Math.ceil(((loginGateRead().until||0)-Date.now())/1000));
    function loginGateFail(){const g=loginGateRead(),n=(g.n||0)+1,lock=n%5===0?Math.min(900,30*2**(n/5-1)):0;try{sessionStorage.setItem(LOGIN_GATE_KEY,JSON.stringify({n,until:lock?Date.now()+lock*1000:0}))}catch(_){}}
    const loginGateReset=()=>{try{sessionStorage.removeItem(LOGIN_GATE_KEY)}catch(_){}};
    async function login(e){
      e.preventDefault();if(authState.busy)return;if(!authValidate())return;
      const email=$('#loginEmail').value.trim().toLowerCase(),password=$('#loginPassword').value;
      if(!state.client)return authFail('El aplicativo aún no está conectado a Supabase. Un administrador debe completar la configuración para que puedas ingresar.',null,{action:{label:'Ver configuración',run:openSetup}});
      const lockWait=loginGateWait();
      if(lockWait)return authFail(`Demasiados intentos fallidos. Espera ${lockWait} s o recupera tu contraseña con «¿Olvidaste tu contraseña?».`,'password');
      authBegin(e.submitter);let result;
      try{result=await state.client.auth.signInWithPassword({email,password})}catch(err){result={error:err}}
      if(result.error){authEnd();if(!isNetworkError(result.error))loginGateFail();return authFail(authErrorText(result.error),'password')}
      loginGateReset();
      await authFinish(()=>enterApp(result.data.user));
    }
    // ---------- v8 · Restablecimiento y cambio de contraseñas (sin envío de correos) ----------
    // Las contraseñas las gestiona Supabase Auth (hash bcrypt en el servidor): el aplicativo no las guarda, no las registra y no las
    // muestra. Excepción: la contraseña temporal que un administrador genera se le muestra UNA sola vez (nunca se almacena).
    // Quien olvida su contraseña la recupera con un administrador (el aplicativo NO envía correos): recibe una temporal y debe cambiarla al ingresar.
    const PWD_RULE_MSG='Usa de 8 a 72 caracteres, con al menos una letra y un número.';
    const PWD_COMMON=new Set(['12345678','123456789','1234567890','password1','password12','password123','contrasena1','contrasena123','qwerty123','qwertyuiop1','abc12345','abcd1234','essa1234','essa2026','essa2025','admin123','admin1234','welcome1','bienvenido1','colombia1','colombia123','cambiame1','temporal1']);
    const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // Política de contraseñas (una sola fuente para recuperación, cambio, primer ingreso y restablecimiento por enlace).
    // El servidor aplica además la política configurada en Supabase (Authentication → Password strength).
    function pwdPolicyError(pwd,ctx={}){
      const p=String(pwd??'');
      if(p.length<8)return 'La contraseña debe tener al menos 8 caracteres.';
      if(new TextEncoder().encode(p).length>72)return 'La contraseña no puede superar los 72 caracteres.';
      if(!/[A-Za-z]/.test(p)||!/\d/.test(p))return 'Incluye al menos una letra y un número.';
      if(/^(.)\1+$/.test(p))return 'La contraseña no puede repetir un mismo carácter.';
      const low=p.toLowerCase();
      if(PWD_COMMON.has(low))return 'Esa contraseña es demasiado común. Elige otra.';
      const doc=String(ctx.doc||'').trim().toLowerCase();if(doc&&low===doc)return 'La contraseña no puede ser igual a tu cédula.';
      const mail=String(ctx.email||'').trim().toLowerCase();if(mail&&(low===mail||low===mail.split('@')[0]))return 'La contraseña no puede ser igual a tu correo.';
      if(ctx.current&&p===ctx.current)return 'La nueva contraseña debe ser distinta de la actual.';
      return '';
    }
    const pwdWeak=(pwd,doc)=>pwdPolicyError(pwd,{doc});
    const isNetworkError=e=>!!e&&(e.name==='AuthRetryableFetchError'||/failed to fetch|network|load failed/i.test(e.message||''));
    function pwdErrorText(err){
      const m=String(err?.message||'');
      if(isNetworkError(err))return 'No fue posible conectar con el servidor. Revisa tu conexión.';
      if(/different from the old|same_password/i.test(m)||err?.code==='same_password')return 'La nueva contraseña debe ser distinta a la actual.';
      if(err?.code==='weak_password'||/weak|pwned|compromised|should contain|password should be/i.test(m))return 'La contraseña no cumple la política de seguridad del servidor (más larga o más variada). Elige otra.';
      if(/rate limit|too many|over_/i.test(m))return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
      if(/jwt|not authenticated|session/i.test(m))return 'Tu sesión venció. Inicia el proceso de nuevo.';
      return errorMsg(err);
    }
    // Diálogo común para definir una contraseña nueva (política + confirmación). onSave(pwd) debe lanzar el error si falla.
    async function setNewPasswordDialog(o){
      const r=await Swal.fire({title:o.title,icon:o.icon||'info',confirmButtonText:o.confirmText||'Guardar contraseña',showCancelButton:true,cancelButtonText:o.cancelText||'Cancelar',
        html:`${o.intro?`<p class="dlg-text">${esc(o.intro)}</p>`:''}<div class="field dlg-field"><label for="pwNew">Nueva contraseña</label><input id="pwNew" class="control" type="password" autocomplete="new-password" maxlength="72"></div><div class="field dlg-field"><label for="pwNew2">Confirma la contraseña</label><input id="pwNew2" class="control" type="password" autocomplete="new-password" maxlength="72"></div><p class="small muted">${PWD_RULE_MSG} No puede ser igual a tu cédula ni a tu correo.</p>`,
        preConfirm:async()=>{
          const a=document.getElementById('pwNew')?.value||'',b=document.getElementById('pwNew2')?.value||'';
          const weak=pwdPolicyError(a,{doc:o.doc,email:o.email});if(weak){Swal.showValidationMessage(weak);return false}
          if(a!==b){Swal.showValidationMessage('Las contraseñas no coinciden.');return false}
          try{await o.onSave(a)}catch(err){Swal.showValidationMessage(pwdErrorText(err));return false}
          return true;
        }});
      return !!r.isConfirmed;
    }
    const logPasswordEvent=async ev=>{try{await state.client.rpc('log_password_event',{p_event:ev})}catch(_){}};
    // Aplica la nueva contraseña en una sesión de recuperación verificada y deja constancia en la auditoría.
    async function applyRecoveredPassword(pwd){
      const {error}=await state.client.auth.updateUser({password:pwd,data:{must_change_password:false}});
      if(error)throw error;
      await logPasswordEvent('password_recovery_completed');
    }
    // La verificación (código o enlace) abre una sesión: se marca «cambio pendiente» para que, si la persona recarga la página
    // sin terminar, el aplicativo le exija crear la contraseña antes de entrar.
    const markPasswordPending=async()=>{try{await state.client.auth.updateUser({data:{must_change_password:true}})}catch(_){}};

    // «¿Olvidaste tu contraseña?»: el aplicativo no envía correos. Se explica el procedimiento con el administrador.
    async function forgotPassword(){
      if(state.linkFlow)return;
      await Swal.fire({title:'¿Olvidaste tu contraseña?',icon:'info',confirmButtonText:'Entendido',
        html:'<div class="info-list"><div class="callout"><strong>1.</strong> Comunícate con un administrador del aplicativo y confirma tu identidad con él.</div><div class="callout"><strong>2.</strong> El administrador te entregará una <strong>contraseña temporal</strong> por un canal seguro.</div><div class="callout"><strong>3.</strong> Ingresa con tu correo institucional y esa contraseña: el aplicativo te pedirá crear una contraseña personal antes de continuar.</div><p class="small muted">Tu contraseña actual no se puede consultar: ni el administrador ni el sistema la conocen.</p></div>'});
    }
    // Enlace de restablecimiento generado por un administrador (se entrega a mano, no se envía por correo) o invitación: la sesión ya viene verificada.
    async function runLinkPasswordFlow(){
      const {data}=await state.client.auth.getSession();
      const email=data?.session?.user?.email||'';
      await markPasswordPending();
      const ok=await setNewPasswordDialog({title:'Crea tu nueva contraseña',intro:'Tu identidad se verificó con el enlace que te entregó el administrador. Define tu nueva contraseña para continuar.',email,confirmText:'Guardar contraseña',cancelText:'Cancelar',onSave:applyRecoveredPassword});
      if(ok){await state.client.auth.signOut({scope:'global'});toast('Contraseña actualizada. Inicia sesión con tu nueva contraseña.','success','Se cerraron todas las sesiones abiertas de tu cuenta.')}
      else await state.client.auth.signOut();
    }
    function startLinkPasswordFlow(){
      if(state.linkFlow)return;state.linkFlow=true;
      runLinkPasswordFlow().catch(err=>{console.error(err);toast(pwdErrorText(err),'error')}).finally(()=>{state.linkFlow=false;try{history.replaceState(null,'',location.pathname+location.search)}catch(_){}});
    }
    // Primer ingreso con contraseña temporal (inicial, restablecida o generada por un administrador): cambio obligatorio.
    // Marca en la cuenta: user_metadata.must_change_password. No se puede omitir: o se cambia o se cierra la sesión.
    async function forcePasswordChange(profile){
      const ok=await setNewPasswordDialog({title:'Crea tu contraseña personal',intro:'Tu contraseña actual es temporal. Antes de continuar, crea una contraseña personal que solo tú conozcas.',email:state.user?.email,doc:profile?.document_number,confirmText:'Guardar contraseña',cancelText:'Cerrar sesión',
        onSave:async pwd=>{
          const {data,error}=await state.client.auth.updateUser({password:pwd,data:{must_change_password:false}});
          if(error)throw error;
          if(data?.user)state.user=data.user;
          await logPasswordEvent('password_changed');
          try{await state.client.auth.signOut({scope:'others'})}catch(_){}
        }});
      if(ok)return true;
      await logout();return false;
    }
    // Cambio voluntario desde el perfil: exige la contraseña actual (se verifica iniciando sesión de nuevo), aplica la política y cierra las demás sesiones.
    function pwChangeGate(){let g;try{g=JSON.parse(sessionStorage.getItem('essa_pw_change_gate')||'{}')}catch(_){g={}}return {g,wait:Math.max(0,Math.ceil(((g.until||0)-Date.now())/1000))}}
    async function changeOwnPassword(current,next){
      const email=state.user?.email||state.profile?.email,gate=pwChangeGate();
      if(gate.wait)throw new Error(`Demasiados intentos con la contraseña actual. Espera ${gate.wait} s.`);
      const re=await state.client.auth.signInWithPassword({email,password:current});
      if(re.error){
        const n=(gate.g.n||0)+1;try{sessionStorage.setItem('essa_pw_change_gate',JSON.stringify({n,until:n%5===0?Date.now()+60000:0}))}catch(_){}
        await logPasswordEvent('password_change_reauth_failed');
        throw new Error(/invalid login/i.test(re.error.message||'')?'La contraseña actual no es correcta.':pwdErrorText(re.error));
      }
      try{sessionStorage.removeItem('essa_pw_change_gate')}catch(_){}
      const up=await state.client.auth.updateUser({password:next,data:{must_change_password:false}});
      if(up.error)throw up.error;
      await logPasswordEvent('password_changed');
      try{await state.client.auth.signOut({scope:'others'})}catch(_){}
    }
    async function logout(){try{await flushUserSettings()}catch(_){}await state.client?.auth.signOut();showAuth()}
    function showAuth(){clearTimeout(reloadTimer);reloadAgain=false;state.user=null;state.profile=null;state.userSettings={};state.directory=null;state.accountStatus=null;state.v7Ready=false;$('#appView').classList.add('hidden');$('#authView').classList.remove('hidden');ncReset();state.realtime?.unsubscribe();networkUI();authReset();Theme.leaveUser();fmtClearSession();finReset();msigReset()}
    
    async function enterApp(user){state.user=user;const {data,error}=await state.client.from('profiles').select('*,departments(name)').eq('id',user.id).single();if(error){toast('No fue posible cargar el perfil. Verifica que el SQL esté instalado.','error');return}if(!data.active){await state.client.auth.signOut();return Swal.fire('Acceso inactivo','Tu usuario fue desactivado. Contacta al administrador.','warning')}if(user.user_metadata?.must_change_password&&!(await forcePasswordChange(data)))return;state.profile=data;await loadUserSettings();applyUserSettings();$('#authView').classList.add('hidden');$('#appView').classList.remove('hidden');$('#userName').textContent=data.full_name;$('#userAvatar').textContent=initials(data.full_name);$('#userRole').textContent=roleLabel(data.role);$('#dashboardGreeting').textContent=`Hola, ${data.full_name.split(' ')[0]}`;applyRoleUI(data.role);await loadAll();subscribeRealtime();navigate('dashboard');if(data.role==='employee'&&!data.department_id)toast('Tu perfil aún no tiene dependencia asignada. Contacta al administrador.','warning')}
    async function loadAll(){showLoading();const common=[state.client.from('departments').select('*').order('name'),state.client.from('work_types').select('*').order('name'),state.client.from('overtime_requests').select('*,work_types(name),departments(name),profiles!overtime_requests_employee_id_fkey(full_name,email)').order('created_at',{ascending:false}),state.client.from('notifications').select('*').order('created_at',{ascending:false}).limit(50),state.client.from('app_parameters').select('*')];if(isStaff())common.push(state.client.from('profiles').select('*,departments(name)').order('full_name'),isAdmin()?state.client.from('audit_log').select('*').order('created_at',{ascending:false}).limit(100):Promise.resolve({data:[]}));const results=await Promise.all(common);const err=results.find(x=>x.error)?.error;if(err)toast(errorMsg(err),'error');state.departments=results[0].data||[];state.workTypes=results[1].data||[];state.requests=(results[2].data||[]).filter(x=>x.employee_id===state.user.id);state.adminRequests=isStaff()?(results[2].data||[]):[];state.notifications=results[3].data||[];ncFetched(results[3]);state.parameters=Object.fromEntries((results[4].data||[]).map(x=>[x.key,x.value]));state.profiles=results[5]?.data||[];state.audit=results[6]?.data||[];await loadV2Remote();await loadV3Remote();await loadV4Remote();await loadV6Remote();await loadV7Remote();populateFilters();renderAll()}
    function showLoading(){$('#dashboardKpis').innerHTML=Array(4).fill('<div class="kpi skeleton" style="height:145px"></div>').join('');if($('#page-finance')?.classList.contains('active')&&$('#finBody'))$('#finBody').innerHTML=finSkeleton()}
    function populateFilters(){const opts=Object.entries(STATUS).map(([v,l])=>`<option value="${v}">${l}</option>`).join('');['requestStatusFilter','adminStatusFilter'].forEach(id=>{const e=$('#'+id),v=e.value;e.innerHTML='<option value="">Todos los estados</option>'+opts;e.value=v});const deps=state.departments.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('');['adminDepartmentFilter','reportDepartment'].forEach(id=>{const e=$('#'+id),v=e.value;e.innerHTML=`<option value="">Todas las dependencias</option>${deps}`;e.value=v});$('#reportWorkType').innerHTML='<option value="">Todos los tipos</option>'+state.workTypes.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('');$('#reportEmployee').innerHTML='<option value="">Todos los funcionarios</option>'+state.profiles.filter(p=>p.role==='employee').map(p=>`<option value="${p.id}">${esc(p.full_name)}</option>`).join('');const year=new Date().getFullYear();$('#chartYear').innerHTML=[year,year-1,year-2].map(y=>`<option>${y}</option>`).join('');$('#chartDay').value=state.chartDate;populateV2Filters()}
    // Reportes, Funcionarios y Configuración contienen tablas sin paginar. Antes se reconstruían completas en CADA recarga de datos
    // aunque el usuario estuviera en otra página. Ahora solo se dibujan cuando su página está activa; si estaba oculta se marca como
    // pendiente y navigate() la dibuja (con los datos vigentes) al abrirla. Lo que el usuario ve en cada página no cambia.
    const LAZY_PAGES={reports:()=>renderReports(),employees:()=>renderEmployees(),settings:()=>renderCatalogs(),auxilios:()=>renderAuxPage(),finance:()=>renderFinance()},lazyDirty=new Set();
    function renderLazy(page){if($('#page-'+page)?.classList.contains('active')){lazyDirty.delete(page);LAZY_PAGES[page]()}else lazyDirty.add(page)}
    function renderAll(){state.finCache=null;applyFinanceNav();renderDashboard();renderOwnTable();renderAdmin();renderLazy('auxilios');renderLazy('employees');renderLazy('settings');renderLazy('finance');renderNotifications();renderLazy('reports');iconRefresh();enhanceTemporalPickers();enhanceSelectControls()}
    const KPI_TONES={'#DBEAFE':'var(--blue-100)','#EDE9FE':'var(--violet-100)','#FEE2E2':'var(--red-100)','#E0F2FE':'var(--sky-100)'},KPI_ACCENTS={'#1D4ED8':'var(--tx-blue-700)','#2563EB':'var(--tx-blue-600)','#7C3AED':'var(--tx-violet-600)','#B91C1C':'var(--tx-red-700)'};
    function kpi(label,value,icon,accent='#1D4ED8',tone='#DBEAFE',sub='Datos actualizados'){accent=KPI_ACCENTS[accent]||accent;tone=KPI_TONES[tone]||tone;return `<div class="kpi" style="--accent:${accent};--tone:${tone};--glow:${tone}"><div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-icon"><i data-lucide="${icon}"></i></span></div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`}
    function sum(rows,key){return rows.reduce((a,r)=>a+Number(r[key]||0),0)}
    const addDaysISO=(iso,days)=>{const d=parseISODate(iso)||new Date();d.setDate(d.getDate()+days);return toISODate(d)};
    const weekStartISO=iso=>{const d=parseISODate(iso)||new Date(),offset=(d.getDay()+6)%7;d.setDate(d.getDate()-offset);return toISODate(d)};
    function renderCharts(){
      const rows=isStaff()?state.adminRequests:state.requests,mode=state.chartMode||'month',year=Number($('#chartYear').value||new Date().getFullYear()),dayInput=$('#chartDay');if(dayInput&&!dayInput.value)dayInput.value=state.chartDate;$$('.chart-mode').forEach(b=>b.classList.toggle('active',b.dataset.chartMode===mode));$('#chartMonthControls').classList.toggle('hidden',mode!=='month');$('#chartWeekControls').classList.toggle('hidden',mode!=='week');$('#chartDayControls').classList.toggle('hidden',mode!=='day');
      let labels=[],requested=[],approved=[],periodRows=[],periodLabel='',title='Comportamiento de horas';
      if(mode==='month'){labels=Array.from({length:12},(_,i)=>dfMonthShort().format(new Date(2020,i,1)));const buckets=labels.map(()=>[]);rows.forEach(r=>{const d=parseISODate(r.execution_date);if(d&&d.getFullYear()===year)buckets[d.getMonth()].push(r)});requested=buckets.map(x=>sum(x,'hours_requested'));approved=buckets.map(x=>sumApproved(x));periodRows=buckets.flat();periodLabel=`Distribución mensual · ${year}`;title='Comportamiento mensual de horas'}
      else if(mode==='week'){const start=weekStartISO(state.chartDate),end=addDaysISO(start,6);state.chartDate=start;const dates=Array.from({length:7},(_,i)=>addDaysISO(start,i));labels=dates.map(x=>dfWeekdayDay().format(parseISODate(x)));const buckets=dates.map(()=>[]),dayIndex=new Map(dates.map((x,i)=>[x,i]));rows.forEach(r=>{const i=dayIndex.get(r.execution_date);if(i!==undefined)buckets[i].push(r)});requested=buckets.map(x=>sum(x,'hours_requested'));approved=buckets.map(x=>sumApproved(x));periodRows=buckets.flat();periodLabel=`${fmtDate(start)} – ${fmtDate(end)}`;title='Comportamiento semanal de horas';$('#chartWeekLabel').textContent=periodLabel}
      else{const selected=dayInput?.value||state.chartDate;state.chartDate=selected;periodRows=rows.filter(r=>r.execution_date===selected).sort((a,b)=>String(a.start_time).localeCompare(String(b.start_time)));labels=periodRows.map(r=>fmtRange12(r));requested=periodRows.map(r=>Number(r.hours_requested||0));approved=periodRows.map(r=>approvedHoursOf(r)||0);periodLabel=fmtDate(selected);title='Comportamiento diario de horas'}
      if(!$('#hoursChartEmpty'))return;$('#hoursChartTitle').textContent=title;$('#chartPeriodLabel').textContent=periodLabel;const noData=!periodRows.length;$('#hoursChartEmpty').classList.toggle('hidden',!noData);$('#hoursChart').style.opacity=noData?'0':'1';
      if(!window.Chart){$('.chart-wrap').innerHTML='<div class="empty"><i data-lucide="chart-no-axes-combined"></i><div>Los gráficos no pudieron cargarse, pero los indicadores y las tablas continúan disponibles.</div></div>';$('.status-ring').innerHTML='<div class="empty"><i data-lucide="chart-pie"></i><div>Resumen gráfico no disponible.</div></div>';iconRefresh();return}
      const CT=chartTheme(),noAnim=state.themeRedraw?{animation:false}:{},canvas=$('#hoursChart'),ctx=canvas.getContext('2d'),blueFill=ctx.createLinearGradient(0,0,0,235);blueFill.addColorStop(0,CT.fillA);blueFill.addColorStop(1,CT.fillB);const commonLine={borderWidth:2.2,tension:.34,pointRadius:mode==='day'?4:2,pointHoverRadius:5,pointBorderWidth:2,pointBackgroundColor:CT.surface};
      // Barras (modo «Día»): cada solicitud/franja tiene su color; solicitadas = tono suave con contorno, aprobadas = tono pleno
      const isBar=mode==='day',barCols=isBar?labels.map((_,i)=>cpCanvas(i)):[],
        barReq=isBar?{backgroundColor:barCols.map(c=>cpAlpha(c,.3)),borderColor:barCols,borderWidth:1.5,hoverBackgroundColor:barCols.map(c=>cpAlpha(c,.52)),hoverBorderWidth:2}:{},
        barApr=isBar?{backgroundColor:barCols,borderColor:barCols,borderWidth:1.5,hoverBackgroundColor:barCols.map(c=>cpMix(c,'#ffffff',.14)),hoverBorderWidth:2}:{},
        barCommon=isBar?{barPercentage:.86,categoryPercentage:.76,maxBarThickness:46}:{},
        barOpts=isBar?{animation:state.themeRedraw||matchMedia('(prefers-reduced-motion: reduce)').matches?false:{duration:760,easing:'easeOutQuart',delay:c=>c.type==='data'&&c.mode==='default'?c.dataIndex*55+c.datasetIndex*40:0},transitions:{active:{animation:{duration:160}}}}:{},
        legendGen=isBar?{generateLabels:chart=>Chart.defaults.plugins.legend.labels.generateLabels(chart).map(it=>{const req=it.datasetIndex===0;return {...it,text:req?'Horas solicitadas · tono suave':'Horas aprobadas · tono pleno',fillStyle:req?cpAlpha(CT.tick,.28):CT.tick,strokeStyle:CT.tick,lineWidth:req?1.5:0}})}:{},
        tipColor=isBar?{labelColor:c=>({borderColor:barCols[c.dataIndex],backgroundColor:c.datasetIndex===0?cpAlpha(barCols[c.dataIndex],.38):barCols[c.dataIndex],borderWidth:2,borderRadius:3})}:{};
      state.charts.hours?.destroy();state.charts.hours=new Chart(canvas,{type:mode==='day'?'bar':'line',data:{labels,datasets:[{...commonLine,label:'Horas solicitadas',data:requested,borderColor:CT.blue,pointBorderColor:CT.blue,backgroundColor:mode==='day'?CT.blueBar:blueFill,fill:mode!=='day',borderRadius:mode==='day'?7:0,...barCommon,...barReq},{...commonLine,label:'Horas aprobadas',data:approved,borderColor:CT.red,pointBorderColor:CT.red,backgroundColor:mode==='day'?CT.redBar:'transparent',borderRadius:mode==='day'?7:0,...barCommon,...barApr}]},options:{...noAnim,...barOpts,responsive:true,maintainAspectRatio:false,resizeDelay:120,interaction:{mode:'index',intersect:false},layout:{padding:{top:2,right:4,bottom:0,left:0}},plugins:{legend:{position:'bottom',align:'start',labels:{usePointStyle:true,pointStyle:'circle',boxWidth:7,boxHeight:7,padding:14,color:CT.legend,font:{family:'Inter',size:10,weight:'600'},...legendGen}},tooltip:{backgroundColor:CT.tipBg,titleColor:CT.tipTitle,bodyColor:CT.tipBody,borderColor:CT.tipBd,borderWidth:1,padding:10,cornerRadius:9,displayColors:true,boxPadding:4,callbacks:{label:c=>`${c.dataset.label}: ${num(c.parsed.y)} h`,...tipColor}}},scales:{y:{beginAtZero:true,border:{display:false},grid:{color:CT.grid,...(isBar?{borderDash:[3,4]}:{})},ticks:{color:CT.tick,font:{size:10},padding:6,callback:v=>`${v} h`}},x:{border:{display:false},grid:{display:false},ticks:{color:CT.tick,font:{size:10,weight:'600'},maxRotation:mode==='day'?25:0,minRotation:0,autoSkip:true,maxTicksLimit:mode==='month'?12:10}}}}});
      const byStatus=new Map();rows.forEach(r=>byStatus.set(r.status,(byStatus.get(r.status)||0)+1));const counts=Object.keys(STATUS).map(s=>byStatus.get(s)||0),active=counts.map((x,i)=>x?Object.keys(STATUS)[i]:null).filter(Boolean),palette=CT.st,total=active.reduce((a,s)=>a+byStatus.get(s),0);const centerText={id:'centerText',afterDraw(chart){const {ctx,chartArea}=chart;if(!chartArea)return;const x=(chartArea.left+chartArea.right)/2,y=(chartArea.top+chartArea.bottom)/2-7;ctx.save();ctx.textAlign='center';ctx.fillStyle=CT.ink;ctx.font='800 23px Inter';ctx.fillText(String(total),x,y);ctx.fillStyle=CT.sub;ctx.font='600 9px Inter';ctx.fillText('SOLICITUDES',x,y+17);ctx.restore()}};
      state.charts.status?.destroy();state.charts.status=new Chart($('#statusChart'),{type:'doughnut',plugins:[centerText],data:{labels:active.map(s=>STATUS[s]),datasets:[{data:active.map(s=>byStatus.get(s)),backgroundColor:active.map(s=>palette[s]),borderColor:CT.surface,borderWidth:3,hoverOffset:5,borderRadius:4,spacing:1}]},options:{...noAnim,responsive:true,maintainAspectRatio:false,resizeDelay:120,cutout:'70%',layout:{padding:{top:2}},plugins:{legend:{position:'bottom',labels:{usePointStyle:true,pointStyle:'circle',boxWidth:7,boxHeight:7,padding:10,color:CT.legend,font:{family:'Inter',size:9,weight:'600'}}},tooltip:{backgroundColor:CT.tipBg,titleColor:CT.tipTitle,bodyColor:CT.tipBody,borderColor:CT.tipBd,borderWidth:1,padding:10,cornerRadius:9,callbacks:{label:c=>`${c.label}: ${c.parsed}`}}}}})
    }
    function filteredOwnRequests(){const q=$('#requestSearch').value.toLowerCase(),s=$('#requestStatusFilter').value,from=$('#requestDateFrom').value,to=$('#requestDateTo').value;return state.requests.filter(r=>(!q||r.filing_number.toLowerCase().includes(q)||r.reason.toLowerCase().includes(q))&&(!s||r.status===s)&&(!from||r.execution_date>=from)&&(!to||r.execution_date<=to))}
    function requestTable(rows,actions=true){if(!rows.length)return `<div class="empty"><i data-lucide="file-search"></i><div>No hay solicitudes para mostrar.</div></div>`;return `<div class="table-wrap"><table><thead><tr><th>Radicado</th><th>Fecha</th>${isStaff()?'<th>Funcionario</th><th>Dependencia</th>':''}<th>Jornada</th><th>Solicitadas</th><th>Aprobadas</th><th>Auxilios</th><th>Estado</th>${actions?'<th>Acciones</th>':''}</tr></thead><tbody>${rows.map(r=>`<tr><td><strong>${esc(r.filing_number)}</strong></td><td>${fmtDate(r.execution_date)}<div class="small muted"><span style="white-space:nowrap">${esc(fmtTime12(r.start_time))} – ${esc(fmtTime12(r.end_time))}</span>${r.end_time<=r.start_time?' <span style="white-space:nowrap">(+1 día)</span>':''}</div></td>${isStaff()?`<td>${esc(r.profiles?.full_name||'—')}</td><td>${esc(r.departments?.name||'—')}</td>`:''}<td>${esc(r.work_types?.name||'—')}</td><td>${num(r.hours_requested)} h</td><td>${approvedCell(r)}</td><td>${auxChips(r,{link:isStaff()})}</td><td>${statusBadge(r.status)}</td>${actions?`<td><div class="table-actions"><button class="btn btn-ghost btn-row" title="Ver solicitud" onclick="App.viewRequest('${r.id}')"><i data-lucide="eye"></i> Ver</button>${isAdmin()?`<button class="btn btn-delete-request" title="Eliminar solicitud" aria-label="Eliminar solicitud ${esc(r.filing_number)}" onclick="App.deleteRequest('${r.id}')">${vectorIcon('trash')}</button>`:''}</div></td>`:''}</tr>`).join('')}</tbody></table></div>`}
    function renderOwnTable(){const rows=filteredOwnRequests(),start=(state.page.requests-1)*state.pageSize;$('#requestsTable').innerHTML=requestTable(rows.slice(start,start+state.pageSize));renderPager('requestsPagination',rows.length,'requests',renderOwnTable);iconRefresh()}
    function renderPager(id,total,key,fn){const pages=Math.max(1,Math.ceil(total/state.pageSize)),p=state.page[key];$('#'+id).innerHTML=`<span>${total} registros</span><button ${p<=1?'disabled':''} aria-label="Anterior">‹</button><strong>${p} / ${pages}</strong><button ${p>=pages?'disabled':''} aria-label="Siguiente">›</button>`;const bs=$('#'+id).querySelectorAll('button');bs[0].onclick=()=>{state.page[key]--;fn()};bs[1].onclick=()=>{state.page[key]++;fn()}}
    function renderAdminTable(){if(!isStaff())return;const q=$('#adminSearch').value.toLowerCase(),s=$('#adminStatusFilter').value,d=$('#adminDepartmentFilter').value,rows=state.adminRequests.filter(r=>(!q||r.filing_number.toLowerCase().includes(q)||r.profiles?.full_name?.toLowerCase().includes(q)||r.departments?.name?.toLowerCase().includes(q))&&(!s||r.status===s)&&(!d||r.department_id===d)),start=(state.page.admin-1)*state.pageSize;$('#adminTable').innerHTML=requestTable(rows.slice(start,start+state.pageSize));renderPager('adminPagination',rows.length,'admin',renderAdminTable);iconRefresh()}
    function renderCatalogs(){if(state.profile.role!=='admin')return;$('#departmentsTable').innerHTML=catalogTable(state.departments,'department');$('#workTypesTable').innerHTML=catalogTable(state.workTypes,'worktype');$('#parametersForm').innerHTML=`${managerCardHTML()}${msigSectionHTML()}<form id="paramsForm" class="form-section"><h4>${vectorIcon('shield')} Límites y controles <span class="section-kicker">Solicitudes y soportes</span></h4><div class="section-grid"><div class="field"><label for="pMaxHours">Límite máximo por solicitud (horas)</label><input id="pMaxHours" class="control" name="max_hours_per_request" type="number" min="0" max="24" step="0.25" value="${state.parameters.max_hours_per_request??''}" placeholder="Sin definir"><span class="small muted">Vacío = sin límite definido.</span></div><div class="field"><label for="pMaxMb">Tamaño máximo por soporte (MB)</label><input id="pMaxMb" class="control" name="max_file_size_mb" type="number" min="1" max="10" value="${state.parameters.max_file_size_mb??10}"><span class="small muted">Entre 1 y 10 MB por archivo adjunto.</span></div><div class="field span-2"><label><input name="approval_comment_required" type="checkbox" ${state.parameters.approval_comment_required?'checked':''}> Exigir observación al aprobar</label><span class="small muted">Se validará también en el servidor.</span></div></div><div class="actions"><button class="btn btn-primary">${vectorIcon('check')} Guardar parámetros</button></div></form>`;$('#paramsForm').onsubmit=saveParameters;bindManagerForm();msigHydrate($('#msigCard'));renderV2Settings();renderV3Settings();renderJobGradesPanel();$('#auditTable').innerHTML=state.audit.length?`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Acción</th><th>Entidad</th><th>Detalle</th><th>Responsable</th></tr></thead><tbody>${state.audit.map(a=>`<tr><td>${fmtDateTime(a.created_at)}</td><td>${esc(a.action)}</td><td>${esc(a.entity_type)}<div class="small muted">${esc(a.entity_id||'')}</div></td><td class="small">${auditDetail(a)}</td><td>${esc(state.profiles.find(p=>p.id===a.actor_id)?.full_name||'Sistema')}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No hay eventos de auditoría.</div>';iconRefresh()}
    const cfgStat=(n,l,soft)=>`<div class="cfg-stat${soft?' is-soft':''}"><b>${n}</b><span>${l}</span></div>`;
    const cfgStats=(...a)=>`<div class="cfg-stats">${a.join('')}</div>`;
    const cfgInit=s=>{const w=String(s||'').trim().split(/\s+/).filter(Boolean);return esc((w.length>1?w[0][0]+w[1][0]:(w[0]||'?').slice(0,2)).toUpperCase())};
    function catalogTable(rows,type){const nAct=rows.filter(x=>x.active).length;return rows.length?`${cfgStats(cfgStat(rows.length,'registros'),cfgStat(nAct,'activos'),cfgStat(rows.length-nAct,'inactivos',1))}<div class="table-wrap"><table><thead><tr><th>Nombre</th><th>Código/Descripción</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rows.map(x=>`<tr><td><div class="cfg-ident"><span class="cfg-av" aria-hidden="true">${cfgInit(x.name)}</span><strong>${esc(x.name)}</strong></div></td><td>${esc(x.code||x.description||'—')}</td><td>${x.active?'<span class="status st-approved">Activo</span>':'<span class="status st-cancelled">Inactivo</span>'}</td><td><button class="btn btn-ghost btn-row" title="Editar registro" onclick="App.catalogModal('${type}','${x.id}')"><i data-lucide="pencil"></i> Editar</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Aún no hay registros. Agrega el primero para habilitar el flujo.</div>'}
    // =====================================================================================================
    // Centro de notificaciones
    // Origen de los datos: tabla public.notifications (RLS: cada usuario solo ve y modifica las suyas). loadAll() la carga
    // (50 más recientes) y Realtime la mantiene al día. Las filas las generan los disparadores / funciones del servidor
    // (cambios de estado de una solicitud, solicitudes por validar o revisar) y llevan: título, mensaje, request_id y read_at.
    // Aquí solo se muestran y se gestionan: leer / no leer, leer todas y eliminar (política "delete own notifications", migración v10).
    // Las acciones son optimistas: la pantalla responde al instante y se revierte si el servidor las rechaza.
    // =====================================================================================================
    const NC={open:false,filter:'all',loaded:false,error:false,loading:null,canDelete:true,fetchedAt:0,sig:'',prevUnread:null,animate:true,busyAll:false,pendingClear:false,confirmClear:false,confirmTimer:0,timer:0,day:'',bound:false,pendingRead:new Map(),pendingDel:new Set()};
    const NC_LIMIT=50;
    const NC_LOOK={draft:['slate','pencil'],pending:['blue','clock'],in_review:['violet','eye'],returned:['orange','undo-2'],approved:['cyan','circle-check'],rejected:['red','circle-x'],pending_execution:['violet','hourglass'],validated:['cyan','badge-check'],closed:['slate','lock'],cancelled:['slate','ban']};
    const dfNcTime=intlOnce(()=>new Intl.DateTimeFormat('es-CO',{hour:'numeric',minute:'2-digit'})),dfNcShort=intlOnce(()=>new Intl.DateTimeFormat('es-CO',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}));
    const ncReduced=()=>!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const ncFind=id=>state.notifications.find(n=>String(n.id)===String(id));
    const ncUnread=()=>state.notifications.filter(n=>!n.read_at);
    const ncSort=()=>state.notifications.sort((a,b)=>(new Date(b.created_at)-new Date(a.created_at))||(Number(b.id)-Number(a.id)));
    const ncQ=id=>`#notificationList .nc-item[data-id="${(window.CSS&&CSS.escape)?CSS.escape(String(id)):String(id).replace(/["\\]/g,'')}"]`;

    // Las notificaciones no tienen "tipo" en la base de datos: se deduce del título y del mensaje que ya genera el servidor.
    function ncKind(n){
      const t=String(n.title||''),m=String(n.message||''),sm=/cambió a ([a-z_]+)\s*$/i.exec(m);
      if(/aprobada por el jefe/i.test(m))return {tone:'cyan',icon:'circle-check'};
      if(sm&&NC_LOOK[sm[1]])return {tone:NC_LOOK[sm[1]][0],icon:NC_LOOK[sm[1]][1]};
      if(/validada por el profesional/i.test(t))return {tone:'violet',icon:'badge-check'};
      if(/por validar/i.test(t))return {tone:'blue',icon:'clipboard-check'};
      if(/nueva solicitud/i.test(t))return {tone:'blue',icon:'inbox'};
      return {tone:'blue',icon:'bell'};
    }
    // El servidor escribe el estado como código ("in_review"); aquí se muestra con su nombre ("En revisión") y se resalta el radicado.
    function ncMessage(n){
      const m=String(n.message||'').replace(/(cambió a )([a-z_]+)\s*$/i,(x,a,s)=>STATUS[s]?a+'\u0000'+STATUS[s]+'\u0001':x);
      return esc(m).replace(/\bHE-[\w-]+/g,'<b>$&</b>').replace(/\u0000/g,'<b>').replace(/\u0001/g,'</b>');
    }
    const ncDays=d=>{const n=new Date();return Math.round((new Date(n.getFullYear(),n.getMonth(),n.getDate())-new Date(d.getFullYear(),d.getMonth(),d.getDate()))/864e5)};
    function ncRel(iso){
      const d=new Date(iso);if(isNaN(d))return '—';
      const s=(Date.now()-d)/1000,dd=ncDays(d);
      if(dd<=0){if(s<45)return 'Ahora';if(s<3600)return `Hace ${Math.max(1,Math.floor(s/60))} min`;return `Hace ${Math.floor(s/3600)} h`}
      if(dd===1)return `Ayer, ${dfNcTime().format(d)}`;
      return d.getFullYear()===new Date().getFullYear()?dfNcShort().format(d):fmtDateTime(iso);
    }
    function ncGroup(iso){const dd=ncDays(new Date(iso));return dd<=0?['today','Hoy']:dd===1?['yesterday','Ayer']:dd<7?['week','Esta semana']:['older','Anteriores']}

    const ncState=(tone,icon,title,text,btn='')=>`<div class="nc-state is-${tone}"><span class="nc-state-ico" aria-hidden="true"><i data-lucide="${icon}"></i></span><strong>${title}</strong><p>${text}</p>${btn}</div>`;
    const ncSkeleton=()=>Array(3).fill('<div class="nc-sk" aria-hidden="true"><i class="a"></i><div><i class="b"></i><i class="c"></i><i class="d"></i></div></div>').join('');
    function ncItemHTML(n,i){
      const k=ncKind(n),unread=!n.read_at,has=!!n.request_id,ts=esc(n.created_at);
      return `<li class="nc-item${unread?' is-unread':''}" data-id="${esc(n.id)}" data-tone="${k.tone}" style="--i:${Math.min(i,8)}">`
        +`<button type="button" class="nc-main" data-nc="open" aria-label="${esc(n.title)}${unread?' (sin leer)':''}. ${has?'Abrir la solicitud':'Marcar como leída'}"></button>`
        +`<span class="nc-ico" aria-hidden="true"><i data-lucide="${k.icon}"></i></span>`
        +`<div class="nc-body"><div class="nc-top"><span class="nc-t">${esc(n.title)}</span><time class="nc-time" datetime="${ts}" data-ts="${ts}" title="${esc(fmtDateTime(n.created_at))}">${esc(ncRel(n.created_at))}</time></div>`
        +`<p class="nc-m">${ncMessage(n)}</p>`
        +`<div class="nc-meta">${has?'<span class="nc-cta">Ver solicitud <i data-lucide="arrow-right"></i></span>':'<span></span>'}`
        +`<span class="nc-actions"><button type="button" class="nc-act" data-nc="toggle" title="${unread?'Marcar como leída':'Marcar como no leída'}" aria-label="${unread?'Marcar como leída':'Marcar como no leída'}"><i data-lucide="${unread?'check':'mail'}"></i></button>`
        +(NC.canDelete?`<button type="button" class="nc-act is-danger" data-nc="delete" title="Eliminar" aria-label="Eliminar notificación"><i data-lucide="trash-2"></i></button>`:'')
        +`</span></div></div></li>`;
    }
    function ncListHTML(unreadCount){
      const all=state.notifications;
      if(!NC.loaded)return ncSkeleton();
      if(NC.error&&!all.length)return ncState('error','triangle-alert','No pudimos cargar tus notificaciones','Revisa tu conexión e inténtalo de nuevo.','<button type="button" class="nc-btn" data-nc="retry"><i data-lucide="refresh-cw"></i><span>Reintentar</span></button>');
      if(!all.length)return ncState('empty','bell-off','Aún no tienes notificaciones','Te avisaremos aquí cuando una solicitud cambie de estado o necesite tu revisión.');
      const shown=NC.filter==='unread'?all.filter(n=>!n.read_at):all;
      if(!shown.length)return ncState('ok','circle-check','Estás al día','No tienes notificaciones sin leer.');
      const groups=[];let i=0;
      shown.forEach(n=>{const [key,label]=ncGroup(n.created_at);let g=groups[groups.length-1];if(!g||g.key!==key){g={key,label,html:''};groups.push(g)}g.html+=ncItemHTML(n,i++)});
      return groups.map(g=>`<section class="nc-sec"><h4 class="nc-group">${g.label}</h4><ul class="nc-ul">${g.html}</ul></section>`).join('');
    }
    function ncFootHTML(total,read){
      if(NC.confirmClear)return `<div class="nc-confirm" role="alert"><span>¿Eliminar ${read} ${read===1?'notificación leída':'notificaciones leídas'}?</span><div><button type="button" class="nc-btn" data-nc="clear-no">Cancelar</button><button type="button" class="nc-btn is-danger" data-nc="clear-yes">Eliminar</button></div></div>`;
      const note=`<span class="nc-foot-note">${total>=NC_LIMIT?`Se muestran las ${NC_LIMIT} más recientes`:`${total} ${total===1?'notificación':'notificaciones'}`}</span>`;
      const clear=NC.canDelete&&read>0?`<button type="button" class="nc-link" data-nc="clear-ask"><i data-lucide="trash-2"></i>Eliminar leídas (${read})</button>`:'';
      return clear+note;
    }

    function renderNotifications(){
      // Operaciones en curso: una recarga que llegue a mitad de camino no debe "resucitar" lo borrado ni "desleer" lo leído.
      if(NC.pendingDel.size)state.notifications=state.notifications.filter(n=>!NC.pendingDel.has(n.id));
      if(NC.pendingRead.size)state.notifications.forEach(n=>{if(NC.pendingRead.has(n.id))n.read_at=NC.pendingRead.get(n.id)});
      const all=state.notifications,total=all.length,unread=ncUnread().length,read=total-unread;
      // Contador (campana) y accesibilidad: siempre al día, también con el panel cerrado.
      const badge=$('#notificationCount');if(badge){badge.textContent=unread>99?'99+':String(unread);badge.classList.toggle('hidden',!unread)}
      const bell=$('#notificationBtn');
      if(bell){bell.setAttribute('aria-label',unread?`Notificaciones: ${unread} sin leer`:'Notificaciones');
        if(NC.prevUnread!==null&&unread>NC.prevUnread&&!ncReduced()){bell.classList.remove('nc-ring');void bell.offsetWidth;bell.classList.add('nc-ring')}}
      NC.prevUnread=unread;
      // Con el panel cerrado no se toca el DOM de la lista: se dibuja al abrirlo.
      if(!NC.open){NC.sig='';return}
      const panel=$('#notificationPanel'),list=$('#notificationList'),foot=$('#ncFoot');if(!panel||!list)return;
      const sig=[NC.filter,NC.loaded,NC.error,NC.canDelete,NC.busyAll,!!NC.loading,NC.confirmClear,NC.day,all.map(n=>n.id+(n.read_at?'r':'u')).join(',')].join('|');
      if(sig===NC.sig)return;NC.sig=sig;
      // Foco: si el elemento enfocado se reemplaza, el foco pasa al siguiente en lugar de perderse.
      const act=document.activeElement,wasIn=!!act&&act!==panel&&panel.contains(act);
      const fid=wasIn?act.closest('.nc-item')?.dataset.id:null,fnc=wasIn?act.dataset&&act.dataset.nc:null,fFoot=wasIn&&!!act.closest('#ncFoot');
      const order=fid?$$('#notificationList .nc-item').map(x=>x.dataset.id):[];
      // Cabecera y filtros (nodos fijos: solo cambian textos y estados).
      $('#ncSub').textContent=!NC.loaded?'Cargando…':(NC.error&&!total)?'No se pudieron cargar':unread?`${unread} sin leer`:total?'Estás al día':'Sin novedades';
      $('#ncCountAll').textContent=total;const cu=$('#ncCountUnread');cu.textContent=unread;cu.classList.toggle('is-alert',unread>0);
      $$('#notificationPanel [data-nc-filter]').forEach(b=>{const on=b.dataset.ncFilter===NC.filter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on))});
      const mk=$('#markAllRead');mk.disabled=!unread||NC.busyAll;mk.classList.toggle('is-busy',NC.busyAll);
      $('#ncRefresh').classList.toggle('is-spin',!!NC.loading);
      // Lista
      const st=list.scrollTop;
      list.classList.toggle('is-static',!NC.animate);NC.animate=false;
      list.innerHTML=ncListHTML(unread);list.scrollTop=st;list.setAttribute('aria-busy',String(!NC.loaded));
      foot.innerHTML=total?ncFootHTML(total,read):'';foot.classList.toggle('hidden',!total);
      iconRefresh();
      if(wasIn){
        let t=null;
        if(fid){const pos=order.indexOf(fid),cands=order.slice(pos).concat(order.slice(0,pos).reverse());
          for(const id of cands){const el=document.querySelector(ncQ(id));if(el){t=(id===fid&&fnc&&el.querySelector(`[data-nc="${fnc}"]`))||el.querySelector('.nc-main');break}}}
        else if(fFoot)t=foot.querySelector('[data-nc="clear-no"]')||foot.querySelector('[data-nc]');
        if(!t&&(!panel.contains(document.activeElement)||document.activeElement===mk&&mk.disabled))t=list.querySelector('.nc-main')||panel;
        if(t&&t!==document.activeElement)t.focus({preventScroll:true});
      }
    }
    // Se llama desde loadAll() con la respuesta de la tabla: marca "cargado" y si hubo error.
    function ncFetched(res){NC.loaded=true;NC.error=!!(res&&res.error);NC.fetchedAt=Date.now()}

    // Recarga SOLO las notificaciones (no toda la aplicación). Una única petición a la vez; sin datos viejos (<30 s) no repite.
    function ncRefresh(force){
      if(NC.loading)return NC.loading;
      if(!state.client||!state.user)return Promise.resolve();
      if(!force&&NC.loaded&&Date.now()-NC.fetchedAt<30000)return Promise.resolve();
      const p=(async()=>{
        const res=await state.client.from('notifications').select('*').order('created_at',{ascending:false}).limit(NC_LIMIT);
        NC.loaded=true;
        if(res.error){NC.error=!state.notifications.length;if(force)toast(errorMsg(res.error),'error','No se pudieron actualizar las notificaciones.');return}
        state.notifications=res.data||[];NC.error=false;NC.fetchedAt=Date.now();
      })().catch(()=>{NC.loaded=true;NC.error=!state.notifications.length}).finally(()=>{NC.loading=null;renderNotifications()});
      NC.loading=p;renderNotifications();return p;
    }

    // Leer / no leer (una o varias). Optimista, con reversión si el servidor falla.
    async function ncSetRead(ids,read){
      const stamp=read?new Date().toISOString():null;
      const targets=state.notifications.filter(n=>ids.includes(n.id)&&!NC.pendingRead.has(n.id)&&!!n.read_at===!read);
      if(!targets.length)return true;
      const prev=new Map(targets.map(n=>[n.id,n.read_at]));
      targets.forEach(n=>{n.read_at=stamp;NC.pendingRead.set(n.id,stamp)});
      renderNotifications();
      const res=await state.client.from('notifications').update({read_at:stamp}).in('id',targets.map(n=>n.id)).eq('recipient_id',state.user.id);
      targets.forEach(n=>NC.pendingRead.delete(n.id));
      if(res.error){targets.forEach(n=>{const cur=ncFind(n.id);if(cur)cur.read_at=prev.get(n.id)});toast(errorMsg(res.error),'error','No se pudo actualizar la notificación.');renderNotifications();return false}
      return true;
    }
    async function markNotificationsRead(){
      if(NC.busyAll)return;
      const ids=ncUnread().filter(n=>!NC.pendingRead.has(n.id)).map(n=>n.id);if(!ids.length)return;
      NC.busyAll=true;renderNotifications();
      try{await ncSetRead(ids,true)}finally{NC.busyAll=false;renderNotifications()}
    }
    const ncToggle=id=>{const n=ncFind(id);return n?ncSetRead([n.id],!n.read_at):undefined};
    function ncAnimateOut(ids){
      if(!NC.open||ncReduced())return Promise.resolve();
      const els=ids.map(id=>document.querySelector(ncQ(id))).filter(Boolean);if(!els.length)return Promise.resolve();
      els.forEach(el=>{el.style.height=el.offsetHeight+'px'});void els[0].offsetWidth;
      els.forEach(el=>el.classList.add('is-removing'));
      return new Promise(r=>setTimeout(r,210));
    }
    const ncDeniedToast=()=>toast('Aún no está habilitado eliminar notificaciones','warning','Pide al administrador aplicar la migración v10 del SQL (Instalación y despliegue).');
    async function ncDelete(id){
      const n=ncFind(id);if(!n||!NC.canDelete||NC.pendingDel.has(n.id))return;
      NC.pendingDel.add(n.id);
      await ncAnimateOut([n.id]);renderNotifications();
      const res=await state.client.from('notifications').delete().eq('id',n.id).eq('recipient_id',state.user.id).select('id');
      let failed=!!res.error,denied=false;
      // Sin error y sin filas puede ser "ya no existía" o "la política no lo permite": se comprueba si la fila sigue en el servidor.
      if(!failed&&!(res.data||[]).length){const chk=await state.client.from('notifications').select('id').eq('id',n.id).eq('recipient_id',state.user.id);if(chk.error||(chk.data||[]).length){failed=true;denied=!chk.error}}
      NC.pendingDel.delete(n.id);
      if(!failed)return;
      if(!state.notifications.some(x=>x.id===n.id)){state.notifications.push(n);ncSort()}
      NC.sig='';NC.animate=false;
      if(denied){NC.canDelete=false;ncDeniedToast()}else toast(errorMsg(res.error),'error','No se pudo eliminar la notificación.');
      renderNotifications();
    }
    async function ncClearRead(){
      clearTimeout(NC.confirmTimer);NC.confirmClear=false;
      const ids=state.notifications.filter(n=>n.read_at&&!NC.pendingRead.has(n.id)).map(n=>n.id);
      if(!ids.length||!NC.canDelete||NC.pendingClear){renderNotifications();return}
      NC.pendingClear=true;ids.forEach(i=>NC.pendingDel.add(i));
      await ncAnimateOut(ids);renderNotifications();
      const res=await state.client.from('notifications').delete().in('id',ids).eq('recipient_id',state.user.id).select('id');
      ids.forEach(i=>NC.pendingDel.delete(i));NC.pendingClear=false;
      const done=res.error?0:(res.data||[]).length;
      if(res.error)toast(errorMsg(res.error),'error','No se pudieron eliminar las notificaciones.');
      else if(done<ids.length){
        const chk=await state.client.from('notifications').select('id').in('id',ids).eq('recipient_id',state.user.id);
        if(!chk.error&&(chk.data||[]).length===ids.length){NC.canDelete=false;ncDeniedToast()}
      }
      if(done<ids.length){await ncRefresh(true)}else{NC.sig='';NC.animate=false;renderNotifications()}
    }
    async function ncOpen(id){
      const n=ncFind(id);if(!n)return;
      if(!n.read_at)ncSetRead([n.id],true);
      if(!n.request_id)return;
      const known=(isStaff()?state.adminRequests:state.requests).some(r=>r.id===n.request_id);
      if(!known){toast('La solicitud asociada ya no está disponible.','info');return}
      ncClosePanel(true);viewRequest(n.request_id);
    }

    // Realtime: los cambios de la tabla se aplican en el sitio (antes cada cambio, incluso marcar como leída, recargaba toda la aplicación).
    function ncOnRealtime(p){
      const ev=p&&p.eventType,row=p&&p.new,old=p&&p.old;
      if(!ev||!state.user){scheduleReload();return}
      const mine=r=>r&&r.recipient_id===state.user.id;
      if(ev==='DELETE'){if(old&&old.id!=null)state.notifications=state.notifications.filter(n=>n.id!==old.id)}
      else if(mine(row)){
        const cur=ncFind(row.id);
        if(cur)Object.assign(cur,row);
        else{state.notifications.push(row);ncSort();state.notifications=state.notifications.slice(0,NC_LIMIT)}
      }
      NC.fetchedAt=Date.now();renderNotifications();
    }

    // Panel: abrir / cerrar, foco, clic fuera, Esc y teclado.
    function ncOpenPanel(){
      const p=$('#notificationPanel');if(!p||NC.open)return;
      NC.open=true;NC.day=new Date().toDateString();NC.sig='';NC.animate=true;
      p.classList.remove('hidden','is-closing');void p.offsetWidth;p.classList.add('is-open');
      $('#ncScrim')?.classList.add('is-on');$('#notificationBtn')?.setAttribute('aria-expanded','true');
      renderNotifications();ncRefresh(false);
      clearInterval(NC.timer);NC.timer=setInterval(ncTick,60000);
      p.focus({preventScroll:true});$('#notificationList').scrollTop=0;
    }
    function ncClosePanel(restoreFocus){
      const p=$('#notificationPanel');if(!p||!NC.open)return;
      NC.open=false;clearInterval(NC.timer);clearTimeout(NC.confirmTimer);NC.confirmClear=false;NC.sig='';
      p.classList.remove('is-open');p.classList.add('is-closing');$('#ncScrim')?.classList.remove('is-on');
      $('#notificationBtn')?.setAttribute('aria-expanded','false');
      setTimeout(()=>{if(!NC.open){p.classList.add('hidden');p.classList.remove('is-closing')}},ncReduced()?0:140);
      if(restoreFocus)$('#notificationBtn')?.focus({preventScroll:true});
    }
    function ncTick(){
      if(!NC.open)return;
      if(NC.day!==new Date().toDateString()){NC.day=new Date().toDateString();NC.sig='';renderNotifications();return}
      $$('#notificationList [data-ts]').forEach(t=>{const v=ncRel(t.dataset.ts);if(t.textContent!==v)t.textContent=v});
    }
    // Cierre de sesión: el siguiente usuario no debe ver nada del anterior.
    function ncReset(){
      NC.open=false;clearInterval(NC.timer);clearTimeout(NC.confirmTimer);
      const p=$('#notificationPanel');if(p){p.classList.remove('is-open','is-closing');p.classList.add('hidden')}
      $('#ncScrim')?.classList.remove('is-on');$('#notificationBtn')?.setAttribute('aria-expanded','false');
      Object.assign(NC,{filter:'all',loaded:false,error:false,loading:null,fetchedAt:0,sig:'',prevUnread:null,animate:true,busyAll:false,pendingClear:false,confirmClear:false});
      NC.pendingRead.clear();NC.pendingDel.clear();state.notifications=[];
      const l=$('#notificationList');if(l)l.innerHTML='';const b=$('#notificationCount');if(b){b.textContent='0';b.classList.add('hidden')}
    }
    function ncClick(e){
      const f=e.target.closest('[data-nc-filter]');
      if(f){NC.filter=f.dataset.ncFilter;NC.animate=true;NC.sig='';renderNotifications();$('#notificationList').scrollTop=0;return}
      const a=e.target.closest('[data-nc]');if(!a)return;
      const id=a.closest('.nc-item')?.dataset.id;
      switch(a.dataset.nc){
        case 'open':return ncOpen(id);
        case 'toggle':return ncToggle(id);
        case 'delete':return ncDelete(id);
        case 'retry':case 'refresh':return ncRefresh(true);
        case 'close':return ncClosePanel(true);
        case 'clear-ask':clearTimeout(NC.confirmTimer);NC.confirmClear=true;NC.confirmTimer=setTimeout(()=>{NC.confirmClear=false;renderNotifications()},6000);return renderNotifications();
        case 'clear-no':clearTimeout(NC.confirmTimer);NC.confirmClear=false;return renderNotifications();
        case 'clear-yes':return ncClearRead();
      }
    }
    function ncKey(e){
      const main=e.target.closest&&e.target.closest('.nc-main');if(!main)return;
      if(e.key==='Delete'&&NC.canDelete){e.preventDefault();ncDelete(main.closest('.nc-item').dataset.id);return}
      if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
      const items=$$('#notificationList .nc-main'),i=items.indexOf(main);if(!items.length)return;
      e.preventDefault();
      const n=e.key==='Home'?0:e.key==='End'?items.length-1:e.key==='ArrowDown'?Math.min(items.length-1,i+1):Math.max(0,i-1);
      items[n].focus();items[n].scrollIntoView({block:'nearest'});
    }
    function bindNotificationCenter(){
      if(NC.bound)return;NC.bound=true;
      const p=$('#notificationPanel'),btn=$('#notificationBtn');if(!p||!btn)return;
      btn.setAttribute('aria-haspopup','dialog');btn.setAttribute('aria-controls','notificationPanel');btn.setAttribute('aria-expanded','false');
      btn.onclick=()=>NC.open?ncClosePanel(false):ncOpenPanel();
      $('#markAllRead').onclick=markNotificationsRead;
      p.addEventListener('click',ncClick);p.addEventListener('keydown',ncKey);
      document.addEventListener('pointerdown',e=>{if(NC.open&&!e.target.closest('#notificationPanel,#notificationBtn'))ncClosePanel(false)},true);
      document.addEventListener('keydown',e=>{
        if(e.key!=='Escape'||!NC.open||e.defaultPrevented)return;
        if($('#modalRoot .modal')||document.querySelector('#dialogRoot .dlg-backdrop'))return;
        e.preventDefault();ncClosePanel(true);
      });
    }

    function navigate(page){if(page==='requests'&&isStaff())page='adminQueue';if(['adminQueue','auxilios'].includes(page)&&!isStaff())page='dashboard';if(['employees','settings'].includes(page)&&!isAdmin())page='dashboard';if(page==='finance'&&!canViewFinance())page='dashboard';$$('.page,.nav-item').forEach(x=>x.classList.remove('active'));$('#page-'+page)?.classList.add('active');$(`.nav-item[data-page="${page}"]`)?.classList.add('active');$('#topTitle').textContent=PAGE_TITLES[page]||page;$('#sidebar').classList.remove('open');if(page==='reports'||page==='auxilios'||page==='finance'||lazyDirty.has(page))renderLazy(page);window.scrollTo({top:0})}
    function calculateHours(date,start,end){if(!date||!start||!end)return 0;let s=new Date(`${date}T${start}:00`),e=new Date(`${date}T${end}:00`);if(e<=s)e.setDate(e.getDate()+1);return Math.round((e-s)/36e5*100)/100}
    function formatFileSize(bytes){if(bytes<1024)return `${bytes} B`;if(bytes<1048576)return `${num(bytes/1024)} KB`;return `${num(bytes/1048576)} MB`}
    let activeActivityClose=null;
    function getStructuredActivities(source){
      if(Array.isArray(source?.selected_activities)&&source.selected_activities.length)return source.selected_activities.map(x=>typeof x==='string'?{name:x,custom:true,group:'Actividad personalizada'}:x);
      const raw=source?.data?.selected_activities;if(raw){try{const parsed=typeof raw==='string'?JSON.parse(raw):raw;if(Array.isArray(parsed)&&parsed.length)return parsed}catch(_){}}
      const legacy=source?.reason||source?.data?.reason;return legacy?[{name:legacy,custom:true,legacy:true,group:'Registro anterior'}]:[]
    }
    function setupActivityMultiSelect(initial=[]){
      const root=$('#activityMulti'),hidden=$('[name="selected_activities"]'),reason=$('[name="reason"]');if(!root||!hidden)return;let selected=getStructuredActivities({selected_activities:initial}),menu=null,search='',activeIndex=0,customDraft='',editorOpen=false;const allOptions=()=>activityGroups().flatMap(g=>g.items.map(name=>({name,group:g.name,custom:false,operational:isOperationalActivity(name)})));
      const key=x=>String(x.name||x).trim().toLocaleLowerCase('es');const sync=()=>{hidden.value=JSON.stringify(selected);reason.value=selected.map(x=>x.name).join(' · ').slice(0,500);hidden.dispatchEvent(new Event('input',{bubbles:true}));root.classList.toggle('is-invalid',selected.length===0)};
      const renderTrigger=()=>{const trigger=root.querySelector('.multi-activity-trigger');trigger.innerHTML=selected.length?selected.map((x,i)=>`<span class="activity-chip ${x.custom?'custom':''}"><span title="${esc(x.name)}">${esc(x.name)}</span><button type="button" data-remove-activity="${i}" aria-label="Quitar ${esc(x.name)}">${vectorIcon('close')}</button></span>`).join(''):'<span class="activity-placeholder">Selecciona una o varias actividades</span>';trigger.insertAdjacentHTML('beforeend','<span class="multi-activity-chevron"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 10 5 5 5-5"></path></svg></span>');trigger.querySelectorAll('[data-remove-activity]').forEach(b=>b.onclick=e=>{e.stopPropagation();selected.splice(Number(b.dataset.removeActivity),1);sync();renderTrigger();renderMenu()})};
      const position=()=>{if(!menu)return;const r=root.querySelector('.multi-activity-trigger').getBoundingClientRect(),mr=menu.getBoundingClientRect(),spaceBelow=innerHeight-r.bottom-10,up=spaceBelow<mr.height&&r.top>spaceBelow;menu.style.left=`${Math.max(8,Math.min(r.left,innerWidth-mr.width-8))}px`;menu.style.top=up?`${Math.max(8,r.top-mr.height-5)}px`:`${Math.min(innerHeight-mr.height-8,r.bottom+5)}px`};
      const close=(focus=false)=>{menu?.remove();menu=null;root.classList.remove('is-open');root.querySelector('.multi-activity-trigger').setAttribute('aria-expanded','false');if(activeActivityClose===close)activeActivityClose=null;if(focus)root.querySelector('.multi-activity-trigger').focus()};
      const toggle=option=>{const i=selected.findIndex(x=>key(x)===key(option));if(i>=0)selected.splice(i,1);else selected.push({...option});sync();renderTrigger();renderMenu();menu?.querySelector('.activity-search')?.focus()};
      const renderMenu=()=>{if(!menu)return;const q=search.trim().toLocaleLowerCase('es'),groups=activityGroups().map(g=>({name:g.name,items:g.items.filter(x=>x.toLocaleLowerCase('es').includes(q)).map(name=>({name,group:g.name,custom:false,operational:isOperationalActivity(name)}))})).filter(g=>g.items.length);const customSelected=selected.filter(x=>x.custom&&x.name.toLocaleLowerCase('es').includes(q));menu.innerHTML=`<div class="activity-search-wrap">${vectorIcon('search')}<input class="activity-search" value="${esc(search)}" placeholder="Buscar actividad" aria-label="Buscar actividad"></div><div class="activity-options">${groups.map(g=>`<div class="activity-group">${esc(g.name)}</div>${g.items.map(o=>activityOptionHTML(o)).join('')}`).join('')}${customSelected.length?`<div class="activity-group">Personalizadas en esta solicitud</div>${customSelected.map(o=>activityOptionHTML(o)).join('')}`:''}${!groups.length&&!customSelected.length?'<div class="activity-empty">No se encontraron actividades.</div>':''}</div><div class="activity-custom-editor ${editorOpen?'open':''}"><input value="${esc(customDraft)}" maxlength="120" placeholder="Nombre de la actividad personalizada"><button type="button">Agregar</button></div><div class="activity-menu-foot"><button type="button" class="activity-add-custom">Agregar actividad personalizada</button><button type="button" class="activity-clear">Limpiar selección</button></div>`;const searchInput=menu.querySelector('.activity-search');searchInput.oninput=e=>{search=e.target.value;renderMenu();menu.querySelector('.activity-search').focus();menu.querySelector('.activity-search').setSelectionRange(search.length,search.length)};menu.querySelectorAll('.activity-option').forEach((b,i)=>{b.onclick=()=>toggle(JSON.parse(decodeURIComponent(b.dataset.option)));b.onmousemove=()=>{activeIndex=i;menu.querySelectorAll('.activity-option').forEach((x,j)=>x.classList.toggle('is-active',j===i))}});menu.querySelector('.activity-add-custom').onclick=()=>{editorOpen=true;customDraft=search&&!allOptions().some(x=>key(x)===search.toLocaleLowerCase('es'))?search:'';renderMenu();const e=menu.querySelector('.activity-custom-editor input');e.focus();e.select()};menu.querySelector('.activity-clear').onclick=()=>{selected=[];sync();renderTrigger();renderMenu()};const editor=menu.querySelector('.activity-custom-editor');if(editor){const input=editor.querySelector('input'),add=()=>{const name=input.value.trim();if(!name)return toast('Escribe el nombre de la actividad.','warning');if([...allOptions(),...selected].some(x=>key(x)===name.toLocaleLowerCase('es')))return toast('Esta actividad ya existe o ya fue seleccionada.','warning');selected.push({name,group:'Actividad personalizada',custom:true});customDraft='';editorOpen=false;search='';sync();renderTrigger();renderMenu();menu.querySelector('.activity-search').focus()};input.oninput=e=>customDraft=e.target.value;input.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();add()}else if(e.key==='Escape'){customDraft='';editorOpen=false;renderMenu()}};editor.querySelector('button').onclick=add}position()};
      function activityOptionHTML(o){const selectedNow=selected.some(x=>key(x)===key(o));return `<button type="button" class="activity-option" role="option" aria-selected="${selectedNow}" data-option="${encodeURIComponent(JSON.stringify(o))}"><span class="activity-check">${selectedNow?'✓':''}</span><span>${esc(o.name)}</span>${o.custom?'<span class="activity-custom-mark">Personalizada</span>':'<span></span>'}</button>`}
      const open=()=>{if(activeActivityClose&&activeActivityClose!==close)activeActivityClose();activeSelectClose?.();activeDateClose?.();activeTimeClose?.();activeActivityClose=close;menu=document.createElement('div');menu.className='activity-menu is-open';menu.dataset.modalActivity='1';document.body.appendChild(menu);root.classList.add('is-open');root.querySelector('.multi-activity-trigger').setAttribute('aria-expanded','true');renderMenu();setTimeout(()=>menu?.querySelector('.activity-search')?.focus(),20)};
      root.innerHTML='<button type="button" class="multi-activity-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false"></button>';const trigger=root.querySelector('.multi-activity-trigger');trigger.onclick=()=>menu?close():open();trigger.onkeydown=e=>{if(['Enter',' ','ArrowDown'].includes(e.key)&&!menu){e.preventDefault();open();return}if(!menu)return;const options=[...menu.querySelectorAll('.activity-option')];if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();activeIndex=Math.max(0,Math.min(options.length-1,activeIndex+(e.key==='ArrowDown'?1:-1)));options.forEach((x,j)=>x.classList.toggle('is-active',j===activeIndex));options[activeIndex]?.scrollIntoView({block:'nearest'})}else if(e.key==='Enter'&&options[activeIndex]){e.preventDefault();options[activeIndex].click()}else if(e.key==='Escape'){e.preventDefault();close(true)}};hidden.addEventListener('invalid',e=>{e.preventDefault();root.classList.add('is-invalid');trigger.focus()});sync();renderTrigger();onGlobal(window,'resize',root,()=>menu&&position());onGlobal(document,'scroll',root,()=>menu&&position(),true);onGlobal(document,'pointerdown',root,e=>{if(menu&&!root.contains(e.target)&&!menu.contains(e.target))close()},true)
    }
          // =====================================================================================================
      // Solicitud de horas extras · formulario rediseñado (prefijo rq-)
      // Solo cambia la presentación: mismos campos (execution_date, start_time, end_time, work_type_id, selected_activities, reason, justification),
      // mismos controles personalizados, misma validación nativa, mismo guardado (saveRequest / saveLocalDraft) y mismos permisos.
      // Añade: cinta de 24 h en vivo, pasos con avance automático, resumen animado y mensajes de validación en línea.
      // =====================================================================================================
      const RQ_P={
        bolt:'<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"></path>',
        cal:'<path d="M7 2v3M17 2v3M3 9h18"></path><rect x="3" y="4" width="18" height="17" rx="2"></rect>',
        play:'<circle cx="12" cy="12" r="9"></circle><path d="m10 8.5 5 3.5-5 3.5Z"></path>',
        flag:'<path d="M5 21V4"></path><path d="M5 4h11l-2 4 2 4H5"></path>',
        timer:'<path d="M10 2h4"></path><path d="m12 14 3-3"></path><circle cx="12" cy="14" r="8"></circle>',
        tasks:'<path d="m9 11 3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>',
        pen:'<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path>',
        send:'<path d="m22 2-7 20-4-9-9-4 20-7Z"></path><path d="M22 2 11 13"></path>',
        disk:'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"></path><path d="M17 21v-8H7v8M7 3v5h8"></path>',
        db:'<ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path>',
        cloud:'<path d="M17.5 19a4.5 4.5 0 1 0-1.4-8.8A6 6 0 0 0 4.5 12 3.5 3.5 0 0 0 6 19Z"></path><path d="M12 12v6m0-6-2.5 2.5M12 12l2.5 2.5"></path>',
        warn:'<circle cx="12" cy="12" r="9"></circle><path d="M12 7.5v5M12 16.5h.01"></path>',
        arrow:'<path d="M5 12h14M13 6l6 6-6 6"></path>',
        shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path><path d="m9 12 2 2 4-4"></path>',
        close:'<path d="M18 6 6 18M6 6l12 12"></path>',
        list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"></path>',
        text:'<path d="M4 6h16M4 12h16M4 18h10"></path>'
      };
      const rqI=(k,cls)=>svgIcon(RQ_P[k]||RQ_P.warn).replace('<svg ',cls?`<svg class="${cls}" `:'<svg ');
      const RQ_CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path pathLength="1" d="m5 12.5 4.5 4.5L19 7"></path></svg>';
      const RQ_RING=2*Math.PI*15,RQ_MIN_JUST=10;
      const RQ_MSG={execution_date:'Selecciona la fecha de ejecución.',start_time:'Selecciona la hora de inicio.',end_time:'Selecciona la hora de finalización.',work_type_id:'Define el horario para asignar la jornada automáticamente.',selected_activities:'Selecciona al menos una actividad.',justification:'Describe la justificación de la solicitud.'};
      const rqReduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
      function rqTemplate(r,draft){
        const isEdit=!!r,name=state.profile.full_name,dept=state.profile.departments?.name||state.departments.find(d=>d.id===state.profile.department_id)?.name||'Sin asignar',
          dv=esc(r?.execution_date||draft?.data?.execution_date||''),sv=esc(r?.start_time?.slice(0,5)||draft?.data?.start_time||''),ev=esc(r?.end_time?.slice(0,5)||draft?.data?.end_time||''),jv=esc(r?.justification||draft?.data?.justification||'');
        const ticks=Array.from({length:25},(_,i)=>`<i class="rq-tk${i%6===0?' m':''}" style="left:calc(${(i/24*100).toFixed(3)}% - ${i===24?1:0}px);--t:${i}"></i>`).join('');
        const head=(icon,label,extra)=>`<div class="rq-fhead"><span class="rq-fi" aria-hidden="true">${rqI(icon)}</span>${label}${extra||''}<span class="rq-ok" aria-hidden="true">${RQ_CHECK}</span></div>`;
        const step=(n,title,sub,inner)=>`<section class="rq-step" data-s="${n}" style="--i:${n-1}"><div class="rq-rail"><span class="rq-badge" aria-hidden="true"><b>${n}</b>${RQ_CHECK}</span></div><div class="rq-card"><header class="rq-card-h"><div><h4>${title}</h4><p>${sub}</p></div><span class="rq-st" data-st aria-live="polite">Pendiente</span></header>${inner}</div></section>`;
        const fact=(icon,label,id,val)=>`<div class="rq-fact"><span aria-hidden="true">${rqI(icon)}</span><div><span class="rq-k">${label}</span><span class="rq-v" id="${id}">${val}</span></div></div>`;
        return `<div class="modal rq" aria-labelledby="rqTitle">
          <header class="rq-head"><span class="rq-sheen" aria-hidden="true"></span>
            <div class="rq-head-top">
              <span class="rq-mark" aria-hidden="true">${rqI('bolt')}<i class="rq-mark-ring"></i></span>
              <div class="rq-titles"><span class="rq-eyebrow">${isEdit?'Edición de solicitud':'Registro de horas extras'}</span><h3 id="rqTitle">${isEdit?'Editar solicitud':'Nueva solicitud'}</h3><p class="rq-sub">${esc(r?.filing_number||'El radicado se generará al guardar')}</p></div>
              <div class="rq-prog" id="rqProg" role="img" aria-label="Secciones completas: 0 de 3"><span class="rq-ring"><svg viewBox="0 0 40 40" aria-hidden="true"><circle class="bg" cx="20" cy="20" r="15"></circle><circle class="fg" id="rqProgFg" cx="20" cy="20" r="15"></circle></svg><b id="rqProgN">0/3</b></span><span class="rq-prog-t"><b>Progreso</b><small id="rqProgT">0 de 3 secciones</small></span></div>
              <button type="button" class="close-modal rq-close" onclick="App.closeModal()" aria-label="Cerrar ventana">${rqI('close')}</button>
            </div>
            <div class="rq-ribbon" id="rqRibbon" aria-hidden="true"><div class="rq-track">
              <span class="rq-zone night" style="left:0;width:25%"><em>Nocturna</em></span><span class="rq-zone day" style="left:25%;width:54.1667%"><em>Diurna</em></span><span class="rq-zone night" style="left:79.1667%;width:20.8333%"><em>Nocturna</em></span>
              ${ticks}<span class="rq-run"></span><span class="rq-run"></span></div>
              <div class="rq-scale"><span style="left:0">12 a. m.</span><span style="left:25%">6 a. m.</span><span style="left:50%">12 m.</span><span style="left:75%">6 p. m.</span><span>12 a. m.</span></div></div>
          </header>
          <form id="requestForm"><div class="rq-body"><div class="rq-layout"><div class="rq-main">
            <div class="rq-who"><span class="rq-av" aria-hidden="true">${esc(initials(name))}</span><div class="rq-who-t"><strong>${esc(name)}</strong><span>${esc(dept)}</span></div>${statusBadge(r?.status||'draft')}</div>
            <div class="rq-steps">
              ${step(1,'Fecha y horario','¿Cuándo se realizará el trabajo?',`<div class="rq-grid">
                <div class="field rq-field" style="--d:0">${head('cal','<label>Fecha de ejecución <span class="required">*</span></label>')}<input class="control" name="execution_date" type="date" required value="${dv}"><p class="rq-hint" id="rqDow">Elige el día en que se realizará el trabajo.</p><p class="rq-msg" role="alert" hidden></p></div>
                <div class="field jornada-field rq-field" style="--d:1">${head('timer','<label id="jornadaLabel">Tipo de jornada <span class="required">*</span><span class="auto-chip">Automático</span></label>')}<div id="jornadaAuto" class="jornada-auto is-idle" data-tone="idle" role="status" aria-live="polite" aria-labelledby="jornadaLabel" tabindex="0"><span class="jornada-icon"></span><span class="jornada-text"><span class="jornada-name"></span><span class="jornada-detail"></span></span><span class="jornada-lock" title="Se calcula con el horario y no se edita" aria-hidden="true"></span></div><input id="workTypeValue" class="native-date-hidden" name="work_type_id" required tabindex="-1" aria-hidden="true" autocomplete="off"><p class="rq-msg" role="alert" hidden></p></div>
                <div class="rq-pair" id="rqPair">
                  <div class="field rq-field" style="--d:2">${head('play','<label>Hora de inicio <span class="required">*</span></label>')}<input class="control" name="start_time" type="time" required value="${sv}"><p class="rq-msg" role="alert" hidden></p></div>
                  <span class="rq-link" aria-hidden="true">${rqI('arrow')}</span>
                  <div class="field rq-field" style="--d:3">${head('flag','<label>Hora de finalización <span class="required">*</span></label>')}<input class="control" name="end_time" type="time" required value="${ev}"><p class="rq-msg" role="alert" hidden></p></div>
                </div>
                <p id="midnightNote" class="rq-note" aria-live="polite"></p></div>`)}
              ${step(2,'Motivos y actividades','¿Qué trabajo se realizará?',`<div class="field rq-plain" style="--d:0"><label class="rq-lab">Motivos y actividades <span class="required">*</span></label><div id="activityMulti" class="multi-activity"></div><input type="hidden" name="selected_activities" required><input type="hidden" name="reason"><p class="rq-hint">Elige una o varias del catálogo, o agrega una personalizada.</p><p class="rq-msg" role="alert" hidden></p></div>`)}
              ${step(3,'Justificación','¿Por qué es necesario trabajar horas extras?',`<div class="field rq-field" style="--d:0">${head('pen','<label>Justificación <span class="required">*</span></label>')}<textarea class="control" name="justification" required minlength="10" maxlength="3000" placeholder="Explica la necesidad operativa y el resultado esperado…">${jv}</textarea><div class="rq-count" id="rqCountBox"><span class="rq-bar" aria-hidden="true"><i></i></span><span id="rqCount">0 caracteres · mínimo ${RQ_MIN_JUST}</span></div><p class="rq-msg" role="alert" hidden></p></div>`)}
              ${('<div class="rq-callout">Los borradores pueden guardarse localmente. Una solicitud solo se confirma cuando Supabase responde que fue almacenada correctamente.</div>')}
            </div></div>
            <aside class="rq-sum" aria-label="Resumen de la solicitud">
              <div class="rq-sum-h"><span>Resumen</span><span>${rqI('bolt')}</span></div>
              <div class="rq-total"><small>Duración calculada</small><strong class="rq-big is-empty" id="hoursPreview">0 h</strong><p class="rq-range" id="rqRange" aria-live="polite">Define la hora de inicio y de finalización</p></div>
              <div class="rq-facts">${fact('cal','Fecha','rqFDate','—')}${fact('timer','Jornada','rqFType','—')}${fact('tasks','Actividades','rqFActs','Ninguna seleccionada')}</div>
              <div id="auxPreview" class="aux-preview rq-aux" aria-live="polite"></div>
            </aside></div></div>
            <div class="rq-foot" id="rqFoot"><div class="rq-foot-note">${rqI('shield')}<span>La solicitud se confirma únicamente después de guardarse correctamente.</span><b class="rq-foot-hours" id="rqFootHours">0 h</b></div>
              <div class="rq-actions"><button type="button" class="rq-btn rq-btn--cancel" onclick="App.closeModal()">${rqI('close')} Cancelar</button>
                <button type="button" id="serverDraftBtn" class="rq-btn rq-btn--tint">${rqI(('cloud'))} Guardar borrador</button>
                <button type="submit" class="rq-btn rq-btn--primary">${rqI('send')} Enviar solicitud</button></div></div>
          </form></div>`;
      }
      // Cuenta hasta el nuevo valor (se omite con «reducir movimiento»)
      function rqTween(el,to,fmt){
        const from=el._v??0;el._v=to;cancelAnimationFrame(el._raf);
        if(from===to){el.textContent=fmt(to);return}
        if(rqReduced()){el.textContent=fmt(to);return}
        const t0=performance.now(),dur=480,step=now=>{const p=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-p,3);el.textContent=fmt(from+(to-from)*e);if(p<1&&el.isConnected)el._raf=requestAnimationFrame(step);else el.textContent=fmt(to)};
        el._raf=requestAnimationFrame(step);el.classList.remove('is-bump');void el.offsetWidth;el.classList.add('is-bump');
      }
      function rqShowMsg(field,text){const m=field?.querySelector('.rq-msg');if(!m)return;m.innerHTML=`${rqI('warn')}<span>${esc(text)}</span>`;m.hidden=false}
      function rqHideMsg(field){const m=field?.querySelector('.rq-msg');if(m)m.hidden=true}
      // Sincroniza todo lo derivado: cinta, duración, resumen, avance de los pasos y contador
      function rqSync(f){
        if(!f.isConnected)return;
        const date=f.execution_date.value,st=f.start_time.value,en=f.end_time.value,hasT=!!(st&&en),equal=hasT&&st===en,crosses=hasT&&!equal&&en<st,
          hours=hasT&&!equal?calculateHours(date||'2000-01-01',st,en):0,jb=$('#jornadaAuto'),tone=jb?.dataset.tone||'idle',jname=jb?.querySelector('.jornada-name')?.textContent||'';
        let acts=[];try{acts=JSON.parse(f.selected_activities.value||'[]')}catch(_){}
        const jt=f.justification.value,jl=jt.trim().length;
        // Evita enviar una justificación formada solo por espacios (el servidor la rechazaría)
        f.justification.setCustomValidity(jt.length>=RQ_MIN_JUST&&jl<RQ_MIN_JUST?`Escribe al menos ${RQ_MIN_JUST} caracteres (sin contar espacios).`:'');
        // Cinta de 24 h
        const segs=hasT&&!equal?(()=>{const s=hmMin(st),e0=hmMin(en),e=e0<=s?e0+1440:e0;return e>1440?[[s,1440],[0,e-1440]]:[[s,e]]})():[];
        $$('#rqRibbon .rq-run').forEach((run,i)=>{const sg=segs[i];if(sg){run.style.setProperty('--a',`${(sg[0]/14.4).toFixed(3)}%`);run.style.setProperty('--w',`${((sg[1]-sg[0])/14.4).toFixed(3)}%`);run.classList.add('on')}else run.classList.remove('on')});
        $('#rqPair')?.classList.toggle('is-ready',hasT&&!equal);
        // Duración
        const h=$('#hoursPreview');h.classList.toggle('is-empty',!hasT||equal);
        if(equal){cancelAnimationFrame(h._raf);h._v=0;h.textContent='—'}else rqTween(h,hours,v=>`${num(v)} h`);
        $('#midnightNote').textContent=crosses?'La jornada finaliza al día siguiente.':'';
        $('#rqRange').textContent=hasT?(equal?'La hora de finalización debe ser distinta a la de inicio':`${fmtTime12(st)} → ${fmtTime12(en)}${crosses?' · +1 día':''}`):'Define la hora de inicio y de finalización';
        $('#rqFootHours').textContent=hasT&&!equal?`${num(hours)} h`:'0 h';
        // Fecha: día de la semana y marca de domingo / festivo
        const dow=$('#rqDow');
        if(date){const hol=isColombianHoliday(date)?holidayCacheV2.get(Number(date.slice(0,4)))?.get(date):null,sun=isoWeekday(date)===7;
          dow.innerHTML=`<span>${esc(mdWeekday(date))}</span>${hol?`<span class="rq-flag">Festivo · ${esc(hol)}</span>`:sun?'<span class="rq-flag">Domingo</span>':''}`;
          $('#rqFDate').textContent=`${mdWeekday(date)}, ${fmtDate(date)}${hol||sun?` · ${hol?'festivo':'domingo'}`:''}`}
        else{dow.textContent='Elige el día en que se realizará el trabajo.';$('#rqFDate').textContent='—'}
        const ft=$('#rqFType');ft.textContent=tone==='idle'?'—':jname;ft.dataset.tone=tone;
        $('#rqFActs').textContent=acts.length?`${acts.length} ${acts.length===1?'actividad':'actividades'}`:'Ninguna seleccionada';$('#rqFActs').title=acts.map(a=>a.name).join(' · ');
        
        const cb=$('#rqCountBox');cb.classList.toggle('is-ok',jl>=RQ_MIN_JUST);cb.querySelector('.rq-bar i').style.setProperty('--p',Math.min(1,jl/RQ_MIN_JUST).toFixed(3));
        $('#rqCount').textContent=jl>=RQ_MIN_JUST?`${jt.length} caracteres · suficiente`:`${jt.length} caracteres · mínimo ${RQ_MIN_JUST}`;
        // Pasos
        const okType=(tone==='day'||tone==='night')&&!!f.work_type_id.value&&!f.work_type_id.dataset.problem,done=[!!(date&&hasT&&!equal&&okType),acts.length>0,jl>=RQ_MIN_JUST];
        f.querySelectorAll('.rq-step').forEach((s,i)=>{s.classList.toggle('is-done',done[i]);const t=s.querySelector('[data-st]');t.textContent=done[i]?'Completo':i===1&&acts.length?`${acts.length} seleccionada${acts.length===1?'':'s'}`:'Pendiente'});
        f.querySelectorAll('.rq-field').forEach(x=>{const c=x.querySelector('textarea');if(c)x.classList.toggle('is-filled',jl>=RQ_MIN_JUST);else if(x.classList.contains('jornada-field'))x.classList.toggle('is-filled',okType)});
        const n=done.filter(Boolean).length,prog=$('#rqProg');
        $('#rqProgFg').style.strokeDashoffset=(RQ_RING*(1-n/3)).toFixed(2);$('#rqProgN').textContent=`${n}/3`;$('#rqProgT').textContent=`${n} de 3 secciones`;prog.classList.toggle('is-full',n===3);prog.setAttribute('aria-label',`Secciones completas: ${n} de 3`);
        $('#rqFoot').style.setProperty('--p',`${(n/3*100).toFixed(1)}%`);
        f.querySelectorAll('.rq-field,.rq-plain').forEach(x=>{if(!x.classList.contains('is-invalid'))rqHideMsg(x)});
      }
      // El campo oculto de actividades no participa en la validación nativa: se verifica aquí y se muestra en línea (mismo criterio que saveRequest)
      const rqNoActivities=f=>{let a=[];try{a=JSON.parse(f.selected_activities.value||'[]')}catch(_){}return !a.length};
      function rqFlagActivities(f){if(!rqNoActivities(f))return false;const fld=f.selected_activities.closest('.field');fld.classList.add('is-invalid');f.querySelector('#activityMulti')?.classList.add('is-invalid');rqShowMsg(fld,RQ_MSG.selected_activities);return true}
      function rqFocusInvalid(f){const first=f.querySelector('.field.is-invalid');if(!first)return;first.scrollIntoView({block:'center',behavior:rqReduced()?'auto':'smooth'});first.querySelector('.date-trigger,.time-trigger,.multi-activity-trigger,textarea')?.focus({preventScroll:true})}
      // Mensajes de validación integrados: reemplazan los globos nativos y llevan el foco al primer campo con problema
      function rqBindValidation(f){
        let t=null;
        f.addEventListener('invalid',e=>{
          const c=e.target,field=c.closest('.field');if(!field)return;e.preventDefault();
          let text=RQ_MSG[c.name]||'Revisa este campo.';
          if(c.name==='work_type_id'&&c.dataset.problem)text=c.dataset.problem;
          else if(c.name==='justification'&&c.value.trim().length)text=`Escribe al menos ${RQ_MIN_JUST} caracteres (llevas ${c.value.trim().length}).`;
          rqShowMsg(field,text);rqFlagActivities(f);
          if(!t)t=setTimeout(()=>{t=null;rqFocusInvalid(f)},40);
        },true);
        f.querySelectorAll('[required]').forEach(c=>{const hide=()=>rqHideMsg(c.closest('.field'));c.addEventListener('input',hide);c.addEventListener('change',hide)});
      }
      async function openRequestForm(id=null){if(blockAdminSelfRequest())return;if((!navigator.onLine)&&(!id))return openOfflineDraft();const r=id?state.requests.find(x=>x.id===id)||state.adminRequests.find(x=>x.id===id):null;if(!id&&!state.profile.department_id)return Swal.fire('Perfil incompleto','Un administrador debe asignarte una dependencia antes de crear solicitudes.','warning');if(!state.workTypes.filter(w=>w.active).length)return Swal.fire('Configuración pendiente','Un administrador debe crear al menos un tipo de jornada activo.','warning');const draft=!id?await idb.get(state.user.id).catch(()=>null):null,initialActivities=getStructuredActivities(r||draft||{});
        modal(rqTemplate(r,draft));
        const f=$('#requestForm'),update=()=>{updateJornada(f);updateAuxPreview(f);rqSync(f)};['execution_date','start_time','end_time'].forEach(n=>f[n].addEventListener('input',update));update();
        f.work_type_id.addEventListener('invalid',e=>{e.preventDefault();const msg=f.work_type_id.dataset.problem;if(msg){toast(msg,'warning');if(f.start_time.value&&f.end_time.value)f.end_time.closest('.time-field')?.querySelector('.time-trigger')?.focus()}else $('#jornadaAuto')?.closest('.field')?.classList.add('is-invalid')});
        setupActivityMultiSelect(initialActivities);enhanceTemporalPickers(f);enhanceSelectControls(f);
        f.querySelectorAll('[required]').forEach(control=>{control.addEventListener('invalid',()=>control.closest('.field')?.classList.add('is-invalid'));control.addEventListener('input',()=>control.closest('.field')?.classList.remove('is-invalid'))});
        rqBindValidation(f);f.addEventListener('input',()=>rqSync(f));f.addEventListener('change',()=>rqSync(f));
        $('#serverDraftBtn').onclick=()=>{const bad=!f.reportValidity(),none=rqFlagActivities(f);if(none&&!bad)rqFocusInvalid(f);if(bad||none)return;saveRequest(f,r?.id,false)};f.onsubmit=e=>{e.preventDefault();if(rqFlagActivities(f)){rqFocusInvalid(f);return}saveRequest(f,r?.id,true,e.submitter)};
        rqSync(f);setTimeout(()=>f.querySelector('.date-trigger')?.focus({preventScroll:true}),90);iconRefresh()}

      function formData(form){return Object.fromEntries(new FormData(form).entries())}
    function requestActivitiesFromData(data){try{const items=typeof data.selected_activities==='string'?JSON.parse(data.selected_activities):data.selected_activities;return Array.isArray(items)?items:[]}catch(_){return[]}}
    async function saveLocalDraft(form){if(blockAdminSelfRequest()){closeModal();return}const data=formData(form);await idb.put({userId:state.user.id,data,savedAt:new Date().toISOString()});toast('Borrador guardado en este dispositivo')}
    async function openOfflineDraft(){const d=await idb.get(state.user?.id).catch(()=>null);Swal.fire('Sin conexión',d?'Tienes un borrador local guardado. Reconecta para editarlo y enviarlo.':'Puedes reconectar para crear y enviar la solicitud.','info')}
    
    
    async function saveRequest(form,id,submit,btn){if(blockAdminSelfRequest()){closeModal();return}if(submit&&!navigator.onLine)return toast('No puedes enviar sin conexión. Guarda un borrador local.','warning');if(!form.reportValidity())return;const data=formData(form),selected=requestActivitiesFromData(data),hours=calculateHours(data.execution_date,data.start_time,data.end_time);if(!selected.length){$('#activityMulti').classList.add('is-invalid');return toast('Selecciona al menos una actividad.','warning')}data.selected_activities=selected;data.reason=selected.map(x=>x.name).join(' · ').slice(0,500);data.activities=selected.map(x=>x.name).join('; ').slice(0,4000);if(hours<=0||hours>24)return toast('La duración debe estar entre 0 y 24 horas.','error');setBusy(btn||$('#serverDraftBtn'),true,submit?'Enviando':'Guardando');let currentId=id;const first=await state.client.rpc('save_overtime_request',{p_request_id:currentId,p_data:data,p_submit:false});if(first.error){setBusy(btn||$('#serverDraftBtn'),false);return toast(errorMsg(first.error),'error')}currentId=first.data.id;if(submit){const final=await state.client.rpc('save_overtime_request',{p_request_id:currentId,p_data:data,p_submit:true});if(final.error){setBusy(btn,false);return toast(errorMsg(final.error),'error')}}await idb.del(state.user.id).catch(()=>{});setBusy(btn||$('#serverDraftBtn'),false);closeModal();toast(submit?'Solicitud enviada y guardada en el servidor':'Borrador guardado en el servidor');await loadAll()}
    async function deleteRequest(id){
      if(state.profile?.role!=='admin')return toast('No tienes permisos para eliminar solicitudes.','error');const r=state.adminRequests.find(x=>x.id===id);if(!r)return toast('Solicitud no encontrada.','error');
      modal(`<div class="modal modal-sm modal-dialog" data-tone="error"><div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${vectorIcon('trash')}</span><div class="modal-title-group"><span class="modal-eyebrow">Acción irreversible</span><h3>Eliminar solicitud</h3></div></div><button class="close-modal" onclick="App.closeModal()" aria-label="Cerrar confirmación">${vectorIcon('close')}</button></div><div class="modal-body"><p class="delete-note"><strong>Se eliminará la solicitud ${esc(r.filing_number)}.</strong> También se retirarán su historial, notificaciones y metadatos de soportes relacionados. Esta acción quedará registrada en la auditoría.</p></div><div class="modal-foot"><div class="modal-actions"><button type="button" class="btn btn-ghost btn-modal" onclick="App.closeModal()">Cancelar</button><button id="confirmDeleteRequest" type="button" class="btn btn-danger btn-modal">${vectorIcon('trash')} Eliminar solicitud</button></div></div></div>`);
      $('#confirmDeleteRequest').onclick=async e=>{const btn=e.currentTarget;setBusy(btn,true,'Eliminando');try{{const {data:files,error:fileError}=await state.client.from('attachments').select('storage_path').eq('request_id',id);if(fileError)throw fileError;const {error}=await state.client.rpc('delete_overtime_request',{p_request_id:id});if(error)throw error;const paths=(files||[]).map(x=>x.storage_path);if(paths.length){const removed=await state.client.storage.from('overtime-supports').remove(paths);if(removed.error)toast('La solicitud fue eliminada, pero algunos archivos requieren limpieza administrativa.','warning')}}closeModal();await new Promise(res=>setTimeout(res,170));toast(`Solicitud ${r.filing_number} eliminada correctamente`);await loadAll()}catch(error){setBusy(btn,false);toast(errorMsg(error),'error')}}
    }
    async function requestAction(id,action){
      const r=state.adminRequests.find(x=>x.id===id)||state.requests.find(x=>x.id===id);if(!r)return toast('Solicitud no encontrada.','error');const needsComment=['return','reject'].includes(action),needsHours=action==='approve',title={professional_validate:'Validación profesional favorable',start_review:'Iniciar revisión',return:'Devolver para correcciones',reject:'Rechazar solicitud',approve:'Aprobar solicitud',close:'Cerrar solicitud',cancel:'Cancelar solicitud'}[action];
      const cfg={title,html:`<div class="swal-form-grid">${needsHours?`<div class="swal-field"><label for="swalHours">Horas autorizadas</label><input id="swalHours" class="swal2-input" type="number" min="0" max="${action==='approve'?r.hours_requested:24}" step="0.25" value="${action==='approve'?r.hours_requested:r.approved_hours||''}"></div>`:''}<div class="swal-field ${needsHours?'':'span-2'}"><label for="swalComment">Observación ${needsComment?'obligatoria':'opcional'}</label><textarea id="swalComment" class="swal2-textarea" placeholder="Registra una observación clara"></textarea></div>${action==='approve'?'<p class="small muted span-2">Al aprobar, la solicitud se cierra automáticamente. No requiere intervención del administrador.</p>':''}</div>`,showCancelButton:true,confirmButtonText:'Confirmar',cancelButtonText:'Cancelar',preConfirm:()=>{const comment=$('#swalComment').value.trim(),hours=needsHours?Number($('#swalHours').value):null;if(needsComment&&comment.length<5)return Swal.showValidationMessage('La observación debe tener al menos 5 caracteres');if(needsHours&&(Number.isNaN(hours)||hours<0))return Swal.showValidationMessage('Ingresa las horas');return{comment,hours}}};
      const {value}=await Swal.fire(cfg);if(!value)return;const {error}=await state.client.rpc('perform_request_action',{p_request_id:id,p_action:action,p_comment:value.comment||null,p_hours:value.hours});if(error)return toast(errorMsg(error),'error');closeModal();toast('Solicitud actualizada correctamente');await loadAll()
    }
    async function downloadAttachment(path,name){const {data,error}=await state.client.storage.from('overtime-supports').createSignedUrl(path,60);if(error)return toast(errorMsg(error),'error');const a=document.createElement('a');a.href=data.signedUrl;a.target='_blank';a.download=name;a.click()}
    function catalogModal(type,id){
      const rows=type==='department'?state.departments:state.workTypes,x=rows.find(a=>a.id===id),isDep=type==='department';
      Swal.fire({cls:'cfg-ui '+(isDep?'cfg-acc-org':'cfg-acc-jor'),cfgIcon:isDep?'building':'sun',eyebrow:'Configuración · '+(isDep?'Dependencias':'Tipos de jornada'),title:`${x?'Editar':'Agregar'} ${isDep?'dependencia':'tipo de jornada'}`,html:`<div class="swal-form-grid"><div class="swal-field span-2"><label for="catName">Nombre</label><input id="catName" class="swal2-input" value="${esc(x?.name||'')}" placeholder="Nombre completo"></div><div class="swal-field span-2"><label for="catExtra">${isDep?'Código':'Descripción'} ${isDep?'(opcional)':'(opcional)'}</label><input id="catExtra" class="swal2-input" value="${esc(isDep?x?.code||'':x?.description||'')}" placeholder="${isDep?'Código de la dependencia':'Descripción del tipo de jornada'}"></div><label class="swal-check-row span-2"><input id="catActive" type="checkbox" ${x?.active===false?'':'checked'}> Registro activo</label></div>`,showCancelButton:true,confirmButtonText:'Guardar',cancelButtonText:'Cancelar',preConfirm:()=>{const name=$('#catName').value.trim();if(name.length<2)return Swal.showValidationMessage('Ingresa un nombre válido');return{name,extra:$('#catExtra').value.trim(),active:$('#catActive').checked}}}).then(async({value})=>{if(!value)return;const table=isDep?'departments':'work_types',payload={name:value.name,active:value.active};if(isDep)payload.code=value.extra||null;else payload.description=value.extra||null;const q=id?state.client.from(table).update(payload).eq('id',id):state.client.from(table).insert({...payload,created_by:state.user.id});const {error}=await q;if(error)return toast(errorMsg(error),'error');toast('Configuración guardada');await loadAll()})
    }
    async function saveParameters(e){e.preventDefault();const d=formData(e.target),values={max_hours_per_request:d.max_hours_per_request?Number(d.max_hours_per_request):null,max_file_size_mb:Number(d.max_file_size_mb),approval_comment_required:d.approval_comment_required==='on',execution_max_approved:!!state.parameters.execution_max_approved};const rows=[{key:'max_hours_per_request',value:values.max_hours_per_request,description:'Límite institucional configurable'},{key:'max_file_size_mb',value:values.max_file_size_mb,description:'Tamaño máximo por soporte'},{key:'approval_comment_required',value:values.approval_comment_required,description:'Exigir observación al aprobar'},{key:'execution_max_approved',value:values.execution_max_approved,description:'Impedir ejecución superior a lo aprobado'}].map(x=>({...x,updated_by:state.user.id,updated_at:new Date().toISOString()}));const {error}=await state.client.from('app_parameters').upsert(rows);error?toast(errorMsg(error),'error'):toast('Parámetros guardados')}
    // =====================================================================================================
    // «Mi perfil» · ventana rediseñada. Reutiliza modal(), setBusy(), Theme, savePosition() y validatePositionCustom().
    // Estados: cargando (lectura del perfil en el servidor) · error (con reintento y datos en caché) · vacío · edición/guardado.
    // =====================================================================================================
    const PF_I={
      mail:'<rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="m3.5 7.5 8.5 6 8.5-6"></path>',
      id:'<rect x="3" y="5" width="18" height="14" rx="2.5"></rect><circle cx="9" cy="11" r="2.2"></circle><path d="M5.8 16a3.4 3.4 0 0 1 6.4 0M14.5 10h4M14.5 13.5h3"></path>',
      building:'<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"></path><path d="M16 9h2a2 2 0 0 1 2 2v10M3 21h18M8 7h4M8 11h4M8 15h4"></path>',
      brief:'<rect x="3" y="7" width="18" height="13" rx="2.5"></rect><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"></path>',
      clock:'<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
      users:'<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"></path>',
      shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path><path d="m9 12 2 2 4-4"></path>',
      key:'<circle cx="8" cy="15" r="4"></circle><path d="m10.8 12.2 8.7-8.7M16 7l3 3M14 9l2 2"></path>',
      logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="m16 17 5-5-5-5M21 12H9"></path>',
      edit:'<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"></path>',
      check:'<path d="m5 12 4 4L19 6"></path>',
      alert:'<path d="M12 3 2 21h20L12 3Z"></path><path d="M12 9.5v4.5M12 17.5h.01"></path>',
      refresh:'<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"></path><path d="M21 3v5h-5"></path>',
      calendar:'<path d="M7 2v3M17 2v3M3 9h18"></path><rect x="3" y="4" width="18" height="17" rx="2"></rect>',
      eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle>',
      copy:'<rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"></path>'
    };
    const pfIco=k=>svgIcon(PF_I[k]||PF_I.alert);
    const pfState={data:null,status:'idle',error:'',editing:false,pwOpen:false};
    const PF_ROLE_TONE={employee:'blue',professional:'cyan',manager:'amber',admin:'violet'};
    const PF_ROLE_DESC={employee:'Registra sus horas extras y consulta sus auxilios.',professional:'Valida y analiza las solicitudes antes de su aprobación.',manager:'Aprueba o rechaza las solicitudes de su dependencia.',admin:'Administra usuarios, catálogos, reglas y parámetros.'};
    function pfMemberSince(v){if(!v)return '';try{const t=dfMonthYear().format(new Date(v));return t.charAt(0).toUpperCase()+t.slice(1)}catch(_){return ''}}
    // Fila de dato: etiqueta + valor; si falta el valor muestra un estado vacío explícito (no un guion suelto).
    function pfRow(icon,label,value,opts={}){
      const empty=value==null||String(value).trim()==='';
      return `<div class="pf-row${opts.wide?' pf-row--wide':''}"><span class="pf-row-ico" aria-hidden="true">${pfIco(icon)}</span><div class="pf-row-main"><span class="pf-row-label">${esc(label)}</span>${empty?`<span class="pf-empty">${esc(opts.emptyText||'Sin registrar')}</span>${opts.emptyHint?`<span class="pf-row-hint">${esc(opts.emptyHint)}</span>`:''}`:`<span class="pf-row-value">${opts.html?value:esc(value)}</span>${opts.hint?`<span class="pf-row-hint">${esc(opts.hint)}</span>`:''}`}</div>${opts.action||''}</div>`;
    }
    // Franja de 24 h: jornada del turno y almuerzo, con marcas de 6 / 12 / 18 h.
    function pfShiftBar(sh){
      if(!sh)return '';const pct=v=>((hmMin(v)||0)/1440*100).toFixed(2),s=pct(sh.start_time),e=pct(sh.end_time),days=(sh.weekdays||[]).map(Number);
      const lunch=sh.lunch_start?`<span class="pf-bar-lunch" style="left:${pct(sh.lunch_start)}%;width:${(pct(sh.lunch_end)-pct(sh.lunch_start)).toFixed(2)}%" title="Almuerzo ${esc(fmtTime12(sh.lunch_start))} – ${esc(fmtTime12(sh.lunch_end))}"></span>`:'';
      return `<div class="pf-shift"><div class="pf-shift-top"><span class="pf-shift-code">${esc(sh.code)}</span><div><strong>${esc(fmtTime12(sh.start_time))} – ${esc(fmtTime12(sh.end_time))}</strong><span>${sh.lunch_start?`Almuerzo ${esc(fmtTime12(sh.lunch_start))} – ${esc(fmtTime12(sh.lunch_end))}`:'Sin hora de almuerzo'}</span></div></div>
        <div class="pf-bar" role="img" aria-label="Jornada de ${esc(fmtTime12(sh.start_time))} a ${esc(fmtTime12(sh.end_time))}"><span class="pf-bar-work" style="left:${s}%;width:${(e-s).toFixed(2)}%"></span>${lunch}<i style="left:25%"></i><i style="left:50%"></i><i style="left:75%"></i></div>
        <div class="pf-bar-scale" aria-hidden="true"><span>12 a. m.</span><span>6 a. m.</span><span>12 m.</span><span>6 p. m.</span><span>12 a. m.</span></div>
        <div class="pf-days" aria-label="Días de la jornada habitual">${WEEKDAY_SHORT.map((d,i)=>`<span class="${days.includes(i+1)?'on':''}" title="${['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][i]}">${d}</span>`).join('')}${sh.works_holidays?'<em>+ festivos</em>':''}</div></div>`;
    }
    // Indicadores según el rol (calculados con los datos ya cargados en la aplicación).
    function pfStats(p){
      if(STAFF_ROLES.has(p.role)){const rows=state.adminRequests||[];return [['Por revisar',rows.filter(r=>['pending','in_review'].includes(r.status)).length,''],['Por validar',rows.filter(r=>['pending','in_review'].includes(r.status)&&r.professional_result!=='favorable').length,''],['Aprobadas',rows.filter(r=>isApprovedStatus(r.status)).length,''],['Horas aprobadas',num(sumApproved(rows)),'h']]}
      const rows=state.requests||[],ap=approvedOnly(rows);
      return [['Solicitudes',rows.length,''],['En trámite',rows.filter(r=>['pending','in_review','returned'].includes(r.status)).length,''],['Horas aprobadas',num(sumApproved(rows)),'h'],['Auxilios',auxSummary(ap).count,'']];
    }
    function pfPositionEditor(p){
      const cur=positionFromProfile(p);
      return `<form class="pf-editor" id="pfPosForm" novalidate><div class="pf-seg" role="radiogroup" aria-label="Tipo de cargo">${POSITION_KINDS.map(k=>`<label><input type="radio" name="pfKind" value="${k}" ${cur.kind===k?'checked':''}><span>${k}</span></label>`).join('')}</div>
        <div class="pf-field ${cur.kind==='Otro'?'':'hidden'}" id="pfOtherWrap"><label for="pfOther">Escribe tu cargo</label><input id="pfOther" class="control" maxlength="80" value="${esc(cur.custom)}" placeholder="Ej.: Analista de soporte" autocomplete="organization-title"><p class="pf-err" id="pfPosErr" role="alert" hidden></p></div>
        <div class="pf-editor-actions"><button type="button" class="btn btn-ghost btn-toolbar" id="pfPosCancel">Cancelar</button><button type="submit" class="btn btn-primary btn-toolbar" id="pfPosSave">${pfIco('check')} Guardar cargo</button></div></form>`;
    }
    function pfSkeleton(){
      return `<div class="pf-shell is-loading" aria-busy="true"><aside class="pf-id"><span class="pf-sk pf-sk-avatar"></span><span class="pf-sk pf-sk-l"></span><span class="pf-sk pf-sk-s"></span><span class="pf-sk pf-sk-s"></span></aside><div class="pf-body">${[1,2,3].map(()=>`<section class="pf-sec"><span class="pf-sk pf-sk-h"></span><div class="pf-grid"><span class="pf-sk pf-sk-row"></span><span class="pf-sk pf-sk-row"></span><span class="pf-sk pf-sk-row"></span><span class="pf-sk pf-sk-row"></span></div></section>`).join('')}</div><span class="lg-sr" role="status">Cargando tu perfil…</span></div>`;
    }
    function pfErrorView(msg,hasCache){
      return `<div class="pf-state"><span class="pf-state-ico is-error">${pfIco('alert')}</span><strong>No pudimos cargar tu perfil</strong><p>${esc(msg||'Revisa tu conexión e inténtalo de nuevo.')}</p><div class="pf-state-actions"><button class="btn btn-primary btn-toolbar" id="pfRetry">${pfIco('refresh')} Reintentar</button>${hasCache?'<button class="btn btn-ghost btn-toolbar" id="pfUseCache">Ver datos guardados</button>':''}</div></div>`;
    }
    function pfView(){
      const p=pfState.data,role=p.role||'employee',tone=PF_ROLE_TONE[role]||'blue',dept=p.departments?.name||(state.departments||[]).find(d=>d.id===p.department_id)?.name||'',sh=shiftByCode(p.shift_code),union=(state.unions||[]).find(u=>u.id===p.union_id)?.name||'',email=p.email||state.user?.email||'',since=pfMemberSince(p.created_at),cargo=(()=>{const c=positionFromProfile(p);return c.official?`${c.custom} · grado ${c.grade}`:(positionLabel(c.kind,c.custom)||p.job_title||'')})(),officialPos=!!officialPosition(p),stats=pfStats(p),stale=pfState.status==='stale';
      const isEmp=role==='employee',dark=Theme.get()==='dark';
      return `<div class="pf-shell" data-tone="${tone}">
        <aside class="pf-id" aria-label="Identidad">
          <div class="pf-avatar" aria-hidden="true"><span>${esc(initials(p.full_name))}</span><i class="pf-avatar-dot ${p.active===false?'off':''}"></i></div>
          <h2 class="pf-name" id="pfTitle">${esc(p.full_name||'Usuario')}</h2>
          <p class="pf-cargo">${cargo?esc(cargo):'<span class="pf-muted">Cargo sin registrar</span>'}</p>
          <span class="pf-role pf-role--${tone}">${esc(roleLabel(role))}${('')}</span>
          <p class="pf-role-desc">${esc(PF_ROLE_DESC[role]||'')}</p>
          <div class="pf-id-meta">
            ${email?`<button type="button" class="pf-copy" id="pfCopyMail" title="Copiar correo">${pfIco('mail')}<span>${esc(email)}</span><em>${pfIco('copy')}</em></button>`:''}
            <span>${pfIco('building')}${dept?esc(dept):'<em class="pf-muted">Dependencia sin asignar</em>'}</span>
            ${since?`<span>${pfIco('calendar')}Desde ${esc(since)}</span>`:''}
          </div>
          <div class="pf-id-foot"><span class="pf-status ${p.active===false?'off':''}">${p.active===false?'Cuenta inactiva':'Cuenta activa'}</span></div>
        </aside>
        <div class="pf-body">
          ${stale?`<div class="pf-banner">${pfIco('alert')}<span>Mostrando datos guardados en esta sesión: no se pudo confirmar con el servidor.</span><button class="link-btn" id="pfRetry2">Reintentar</button></div>`:''}
          <section class="pf-sec" aria-labelledby="pfSecAct"><header class="pf-sec-head"><h3 id="pfSecAct">${STAFF_ROLES.has(role)?'Tu gestión':'Tu actividad'}</h3><span>${STAFF_ROLES.has(role)?'Solicitudes en tu ámbito':'Horas con aprobación válida'}</span></header>
            <div class="pf-stats">${stats.map(([l,v,u])=>`<div class="pf-stat"><strong>${v}${u?`<small>${u}</small>`:''}</strong><span>${esc(l)}</span></div>`).join('')}</div></section>
          <section class="pf-sec" aria-labelledby="pfSecWork"><header class="pf-sec-head"><h3 id="pfSecWork">Información laboral</h3><span>Asignada por el administrador</span></header>
            <div class="pf-grid">
              <div class="pf-row pf-row--wide${pfState.editing?' is-editing':''}" id="pfCargoRow"><span class="pf-row-ico" aria-hidden="true">${pfIco('brief')}</span><div class="pf-row-main"><span class="pf-row-label">Cargo</span>${pfState.editing?pfPositionEditor(p):(cargo?`<span class="pf-row-value">${esc(cargo)}</span>${isEmp?'<span class="pf-row-hint">Se imprime en el formato de horas extras</span>':''}`:`<span class="pf-empty">Sin registrar</span><span class="pf-row-hint">${isEmp?'Regístralo para que aparezca en tu formato de horas extras':'Ayuda a identificar tu función en la aplicación'}</span>`)}</div>${(pfState.editing||officialPos)?'':`<button type="button" class="pf-edit" id="pfEditCargo" aria-label="Editar cargo">${pfIco('edit')}<span>${cargo?'Editar':'Agregar'}</span></button>`}</div>
              ${pfRow('id','Documento',p.document_number,{emptyHint:'Solicítalo al administrador'})}
              ${pfRow('users','Tipo de sindicato',union,{emptyText:'Sin sindicato asignado',emptyHint:isEmp?(param('union_self_service')!==false?'Elígelo una vez; luego solo el administrador puede cambiarlo':'Solicítalo al administrador'):'',action:(isEmp&&!p.union_id&&param('union_self_service')!==false)?`<button type="button" class="pf-edit" id="pfPickUnion" aria-label="Elegir mi sindicato">${pfIco('edit')}<span>Elegir</span></button>`:''})}
            </div></section>
          <section class="pf-sec" aria-labelledby="pfSecShift"><header class="pf-sec-head"><h3 id="pfSecShift">Turno laboral</h3><span>Base para calcular tus auxilios de alimentación</span></header>
            ${sh?pfShiftBar(sh):`<div class="pf-empty-card">${pfIco('clock')}<div><strong>Sin turno asignado</strong><span>${isEmp?'Mientras no tengas turno, los auxilios de alimentación no se pueden calcular. Pide al administrador que lo asigne.':'Los roles de gestión no requieren turno para operar.'}</span></div></div>`}</section>
          <section class="pf-sec" aria-labelledby="pfSecPref"><header class="pf-sec-head"><h3 id="pfSecPref">Preferencias y seguridad</h3><span>Solo afectan a tu cuenta</span></header>
            <div class="pf-list">
              <div class="pf-item"><span class="pf-row-ico">${MOON_ICON}</span><div><strong>Modo oscuro</strong><span>Se guarda para tu usuario en este equipo</span></div><button id="pfTheme" class="theme-switch" type="button" role="switch" aria-checked="${dark}" aria-label="Modo oscuro"><span class="ts-ico ts-sun" aria-hidden="true">${SUN_ICON}</span><span class="ts-ico ts-moon" aria-hidden="true">${MOON_ICON}</span><span class="ts-thumb" aria-hidden="true">${SUN_ICON.replace('<svg ','<svg class="ts-t-sun" ')}${MOON_ICON.replace('<svg ','<svg class="ts-t-moon" ')}</span></button></div>
              <div class="pf-item pf-item--stack${pfState.pwOpen?' is-open':''}"><div class="pf-item-line"><span class="pf-row-ico">${pfIco('key')}</span><div><strong>Contraseña</strong><span>Para cambiarla necesitas tu contraseña actual</span></div><button type="button" class="btn btn-ghost btn-toolbar" id="pfPwToggle" ${('')} aria-expanded="${pfState.pwOpen}">${pfState.pwOpen?'Cancelar':'Cambiar'}</button></div>
                ${pfState.pwOpen?`<form class="pf-pw" id="pfPwForm" novalidate><div class="pf-field"><label for="pfPw0">Contraseña actual</label><input id="pfPw0" class="control" type="password" autocomplete="current-password" maxlength="72"></div><div class="pf-field"><label for="pfPw1">Nueva contraseña</label><input id="pfPw1" class="control" type="password" autocomplete="new-password" minlength="8"></div><div class="pf-field"><label for="pfPw2">Confirmar contraseña</label><input id="pfPw2" class="control" type="password" autocomplete="new-password"></div><div class="pf-meter" aria-hidden="true"><i></i></div><p class="pf-err" id="pfPwErr" role="alert" hidden></p><div class="pf-editor-actions"><button type="submit" class="btn btn-primary btn-toolbar" id="pfPwSave">${pfIco('shield')} Actualizar contraseña</button></div></form>`:''}</div>
              <div class="pf-item"><span class="pf-row-ico is-danger">${pfIco('logout')}</span><div><strong>Cerrar sesión</strong><span>Sal de la aplicación en este equipo</span></div><button type="button" class="btn btn-danger btn-toolbar" id="pfLogout">Cerrar sesión</button></div>
            </div></section>
        </div></div>`;
    }
    function pfFrame(inner){
      return `<div class="modal modal-profile" aria-labelledby="pfTitle"><div class="pf-close-wrap"><span class="pf-eyebrow">Mi perfil</span><button class="close-modal" onclick="App.closeModal()" aria-label="Cerrar perfil">${vectorIcon('close')}</button></div><div class="modal-body pf-scroll" id="pfRoot">${inner}</div></div>`;
    }
    function pfRender(){const root=$('#pfRoot');if(!root)return;const keep=root.scrollTop;root.innerHTML=pfState.status==='loading'?pfSkeleton():pfState.status==='error'?pfErrorView(pfState.error,!!state.profile):pfView();root.scrollTop=keep;pfBind()}
    function pfBind(){
      $('#pfRetry')?.addEventListener('click',pfLoad);$('#pfRetry2')?.addEventListener('click',pfLoad);
      $('#pfUseCache')?.addEventListener('click',()=>{pfState.data={...state.profile};pfState.status='stale';pfRender()});
      $('#pfEditCargo')?.addEventListener('click',()=>{pfState.editing=true;pfRender();setTimeout(()=>($('#pfPosForm input[name=pfKind]:checked')||$('#pfPosForm input[name=pfKind]'))?.focus(),30)});
      const pos=$('#pfPosForm');
      if(pos){
        const wrap=$('#pfOtherWrap'),other=$('#pfOther'),err=$('#pfPosErr'),show=m=>{err.hidden=!m;err.textContent=m||'';other.classList.toggle('is-bad',!!m)};
        pos.querySelectorAll('input[name=pfKind]').forEach(r=>r.addEventListener('change',()=>{wrap.classList.toggle('hidden',r.value!=='Otro');show('');if(r.value==='Otro')setTimeout(()=>other.focus(),20)}));
        other.addEventListener('input',()=>show(''));
        $('#pfPosCancel').onclick=()=>{pfState.editing=false;pfRender()};
        pos.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();pfState.editing=false;pfRender()}});
        pos.onsubmit=async e=>{e.preventDefault();const kind=pos.querySelector('input[name=pfKind]:checked')?.value;if(!kind)return toast('Selecciona el tipo de cargo.','warning');let custom='';
          if(kind==='Otro'){const r=validatePositionCustom(other.value);if(!r.ok){show(r.error);other.focus();return}custom=r.value}
          const btn=$('#pfPosSave');setBusy(btn,true,'Guardando');fmtState.position={kind,custom};const ok=await savePosition();
          if(ok){pfState.data={...pfState.data,position_kind:kind,job_title:kind==='Otro'?custom:kind};pfState.editing=false;pfRender();const row=$('#pfCargoRow');row?.classList.add('is-saved');toast('Cargo actualizado','success',kind==='Otro'?custom:kind)}else setBusy(btn,false)};
      }
      $('#pfTheme')?.addEventListener('click',()=>Theme.toggle());
      $('#pfCopyMail')?.addEventListener('click',async e=>{const b=e.currentTarget;try{await navigator.clipboard.writeText(pfState.data.email||state.user.email);b.classList.add('is-copied');setTimeout(()=>b.classList.remove('is-copied'),1400);toast('Correo copiado','info')}catch(_){toast('No fue posible copiar el correo.','warning')}});
      $('#pfPwToggle')?.addEventListener('click',()=>{pfState.pwOpen=!pfState.pwOpen;pfRender();if(pfState.pwOpen)setTimeout(()=>$('#pfPw0')?.focus(),30)});
      const pw=$('#pfPwForm');
      if(pw){
        const p1=$('#pfPw1'),p2=$('#pfPw2'),err=$('#pfPwErr'),meter=pw.querySelector('.pf-meter'),show=m=>{err.hidden=!m;err.textContent=m||''};
        p1.addEventListener('input',()=>{const v=p1.value;let s=0;if(v.length>=8)s++;if(v.length>=12)s++;if(/[A-Z]/.test(v)&&/[a-z]/.test(v))s++;if(/\d/.test(v))s++;if(/[^A-Za-z0-9]/.test(v))s++;meter.dataset.level=v?Math.min(4,Math.max(1,s)):0;show('')});p2.addEventListener('input',()=>show(''));
        pw.onsubmit=async e=>{e.preventDefault();const p0=$('#pfPw0');
          if(!p0.value){show('Escribe tu contraseña actual.');p0.focus();return}
          const weak=pwdPolicyError(p1.value,{doc:pfState.data?.document_number||state.profile?.document_number,email:state.user?.email,current:p0.value});if(weak){show(weak);p1.focus();return}
          if(p1.value!==p2.value){show('Las contraseñas no coinciden.');p2.focus();return}
          const btn=$('#pfPwSave');setBusy(btn,true,'Actualizando');
          try{await changeOwnPassword(p0.value,p1.value)}catch(err){setBusy(btn,false);show(pwdErrorText(err));return}
          pfState.pwOpen=false;pfRender();toast('Contraseña actualizada','success','Se cerraron las demás sesiones abiertas de tu cuenta.')};
      }
      $('#pfLogout')?.addEventListener('click',async e=>{const r=await Swal.fire({title:'¿Cerrar sesión?',text:'Tendrás que ingresar de nuevo con tus credenciales.',icon:'question',showCancelButton:true,confirmButtonText:'Cerrar sesión',cancelButtonText:'Cancelar'});if(r.isConfirmed){closeModal();logout()}});
    }
    // Lectura del perfil: se confirma en el servidor.
    async function pfLoad(){
      pfState.status='loading';pfState.error='';pfRender();
      try{
        let data;
        {const res=await Promise.race([state.client.from('profiles').select('*,departments(name)').eq('id',state.user.id).single(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('El servidor tardó demasiado en responder.')),12000))]);if(res.error)throw res.error;data=res.data}
        Object.assign(state.profile,data);pfState.data={...state.profile};pfState.status='ready';
      }catch(err){pfState.status='error';pfState.error=errorMsg(err)}
      pfRender();
    }
    function openProfile(){
      if(!state.profile)return toast('Inicia sesión para ver tu perfil.','warning');
      pfState.editing=false;pfState.pwOpen=false;pfState.data={...state.profile};
      modal(pfFrame(pfSkeleton()));pfLoad();
    }
    document.addEventListener('themechange',()=>{const t=$('#pfTheme');if(t)t.setAttribute('aria-checked',String(Theme.get()==='dark'))});
    function inviteInfo(){Swal.fire({title:'Cómo se crean los usuarios',html:'<div class="info-list"><div class="callout">1. Verifica que la persona esté en el <strong>directorio de funcionarios</strong> (panel superior de esta pantalla).</div><div class="callout">2. Crea o invita su cuenta con su <strong>correo institucional</strong> en <strong>Supabase → Authentication → Users</strong> (o con el script de aprovisionamiento).</div><div class="callout">3. Al <strong>crear la cuenta</strong>, el perfil se vincula solo: dependencia, rol, cargo y grado, turno, sindicato y salario vienen del directorio. Si la cuenta ya existía, usa «Sincronizar directorio».</div><div class="callout warning">Una cuenta cuyo correo no está en el directorio queda sin dependencia ni privilegios hasta que un administrador la complete. El frontend nunca utiliza la clave secreta <code>service_role</code>.</div></div>',icon:'info'})}
    function openSetup(){const c=config();modal(`<div class="modal modal-xl modal-setup cfg-ui cfg-acc-sys"><div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${vectorIcon('database')}</span><div class="modal-title-group"><span class="modal-eyebrow">Administración técnica</span><h3>Instalación y despliegue</h3><div class="small muted">Configuración segura de Supabase y publicación web</div></div></div><button class="close-modal" onclick="App.closeModal()" aria-label="Cerrar configuración">${vectorIcon('close')}</button></div><div class="modal-body"><div class="settings-tabs"><button class="tab active" data-setup="connection">Conexión</button><button class="tab" data-setup="sql">SQL + RLS</button><button class="tab" data-setup="deploy">Despliegue</button><button class="tab" data-setup="security">Seguridad</button></div><div id="setup-connection" class="tab-panel active setup-panel-card"><div class="callout">Usa únicamente la URL del proyecto y la clave pública <strong>anon/publishable</strong>. La seguridad real la aplican las políticas RLS incluidas. Nunca pegues la clave <strong>service_role</strong>.</div><div class="field" style="margin-top:18px"><label>URL del proyecto Supabase</label><input id="setupUrl" class="control" type="url" value="${esc(c.url)}" placeholder="https://xxxx.supabase.co"></div><div class="field"><label>Clave pública anon / publishable</label><textarea id="setupKey" class="control" placeholder="eyJ...">${esc(c.key)}</textarea></div><div class="setup-actions"><button id="saveConnection" class="btn btn-primary btn-modal"><i data-lucide="save"></i> Guardar conexión en este navegador</button></div></div><div id="setup-sql" class="tab-panel setup-panel-card"><div class="callout warning">Ejecuta este bloque completo una sola vez en SQL Editor. Revisa primero el entorno y realiza una copia de seguridad si no es un proyecto nuevo.</div><div class="code-box" style="margin-top:14px"><button id="copySql" class="btn btn-secondary btn-toolbar">Copiar SQL</button><pre>${esc($('#sqlSchema').textContent)}</pre></div></div><div id="setup-deploy" class="tab-panel setup-panel-card"><h4>Publicación sin instalaciones</h4><ol class="small" style="line-height:1.9"><li>Crea un proyecto Supabase y ejecuta el SQL de la pestaña anterior.</li><li>Carga el directorio de funcionarios (archivo <code>carga_directorio_soporte_clientes.sql</code>, generado desde el Excel oficial) y crea las cuentas con los correos institucionales del directorio. Al crear la cuenta, cada perfil queda vinculado con su dependencia, rol, cargo y grado, turno, sindicato y salario. En Authentication → Providers → Email desactiva «Allow new users to sign up» (obligatorio: solo el administrador crea cuentas) y «Confirm email» (el ingreso no requiere verificar el correo).</li><li>Configura en Supabase Authentication → URL Configuration la URL pública y sus redirects autorizados.</li><li>En el despliegue, configura <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> en el archivo <code>.env</code> o en las variables del proveedor de hosting. Así cada usuario solo tendrá que abrir el enlace e iniciar sesión.</li><li>Publica este único HTML en SharePoint (hosting estático habilitado), Azure Static Web Apps, Netlify, Vercel o GitHub Pages.</li><li>Abre la URL publicada e inicia sesión.</li><li>Crea los tipos de jornada. En «Funcionarios» revisa el panel del directorio y usa «Sincronizar directorio» si alguna cuenta ya existía.</li></ol><div class="callout">Para producción configura las variables <code>VITE_*</code> durante el despliegue. La pantalla de conexión local queda disponible para pruebas técnicas. No se requiere instalar software en los equipos de los usuarios.</div></div><div id="setup-security" class="tab-panel setup-panel-card"><h4>Controles incluidos</h4><ul class="small" style="line-height:1.9"><li>RLS por usuario y rol; las solicitudes de otros funcionarios no son visibles para un usuario normal.</li><li>Operaciones críticas mediante funciones PostgreSQL con validación del usuario autenticado.</li><li>Transiciones de estado, solapamientos y horas validadas en el servidor.</li><li>Bucket privado, enlaces temporales y límite de 10 MB por soporte.</li><li>Auditoría de decisiones y cambios administrativos.</li><li>Perfiles blindados en el servidor: nadie cambia su propio rol, no se deja el sistema sin administrador activo y el rol del directorio solo se asigna a cuentas creadas por el administrador (el registro público debe permanecer desactivado).</li><li>Sin claves secretas en el frontend.</li></ul><h4 style="margin-top:14px">Restablecimiento y cambio de contraseñas</h4><ul class="small" style="line-height:1.9"><li>Las contraseñas las guarda Supabase Auth como hash (bcrypt): nadie puede consultarlas, ni siquiera un administrador.</li><li>El aplicativo no envía correos. Quien olvida su contraseña la recupera con un administrador, que le genera una temporal aleatoria (se muestra una sola vez) y la persona debe cambiarla al ingresar.</li><li>Límites por administrador y por cuenta, sesiones revocadas al restablecer y auditoría sin secretos.</li></ul><div class="callout warning"><strong>Configuración en Supabase:</strong> 1) Edge Function <code>admin-set-password</code> desplegada. 2) Solo para «Generar enlace»: variable <code>APP_URL</code> de la función y la URL pública en Authentication → URL Configuration → Redirect URLs. 3) Authentication → Policies: longitud mínima 8 y letras y números (la política del servidor no se puede saltar).</div><div class="callout warning"><strong>Pendiente del propietario del sistema:</strong> definir reglas laborales oficiales, retención documental, responsables de tratamiento, MFA, política de contraseñas, dominio autorizado, copias de seguridad y revisión jurídica/seguridad antes de producción.</div></div></div></div>`);$$('[data-setup]').forEach(t=>t.onclick=()=>{$$('[data-setup],#setup-connection,#setup-sql,#setup-deploy,#setup-security').forEach(x=>x.classList.remove('active'));t.classList.add('active');$('#setup-'+t.dataset.setup).classList.add('active')});$('#copySql').onclick=async()=>{await navigator.clipboard.writeText($('#sqlSchema').textContent);toast('SQL copiado')};$('#saveConnection').onclick=()=>{const url=$('#setupUrl').value.trim().replace(/\/$/,''),key=$('#setupKey').value.trim();if(!/^https:\/\/.+\.supabase\.co$/.test(url)||key.length<20)return toast('Revisa la URL y la clave pública.','error');localStorage.setItem('essa_supabase_url',url);localStorage.setItem('essa_supabase_anon',key);Swal.fire({title:'Conexión guardada',text:'La página se recargará para aplicar la configuración.',icon:'success'}).then(()=>location.reload())};iconRefresh()}
    function exportCSV(rows,name){if(!rows.length)return toast('No hay datos para exportar.','warning');const cols=[['Radicado','filing_number'],['Funcionario',r=>r.profiles?.full_name||state.profile.full_name],['Dependencia',r=>r.departments?.name||state.profile.departments?.name||''],['Fecha','execution_date'],['Inicio',r=>fmtTime12(r.start_time)],['Fin',r=>fmtTime12(r.end_time)],['Jornada',r=>r.work_types?.name||''],['Motivos y actividades',r=>getStructuredActivities(r).map(x=>x.name).join(' | ')||r.reason],['Detalle de actividades','activities'],['Estado',r=>STATUS[r.status]],['Horas solicitadas','hours_requested'],['Horas aprobadas',r=>approvedHoursOf(r)??''],['Desayuno',r=>r.aux_breakfast?'Sí':'No'],['Almuerzo',r=>r.aux_lunch?'Sí':'No'],['Comida',r=>r.aux_dinner?'Sí':'No'],['Cálculo del auxilio',r=>auxStatusLabel(r)],['Validación profesional',r=>r.professional_result==='favorable'?'Favorable':r.professional_result==='no_favorable'?'No favorable':'Pendiente']];const q=v=>`"${String(v??'').replace(/"/g,'""')}"`,csv='\ufeff'+[cols.map(c=>q(c[0])).join(';'),...rows.map(r=>cols.map(c=>q(typeof c[1]==='function'?c[1](r):r[c[1]])).join(';'))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download=name;a.click();URL.revokeObjectURL(a.href)}
    function subscribeRealtime(){if(!state.client)return;state.realtime?.unsubscribe();state.realtime=state.client.channel('essa-live').on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`recipient_id=eq.${state.user.id}`},ncOnRealtime).on('postgres_changes',{event:'*',schema:'public',table:'overtime_requests'},scheduleReload).subscribe()}
    // Una sola acción (p. ej. aprobar) genera varios eventos (solicitud + notificación) y cada uno disparaba una recarga completa.
    // Se reúnen los eventos próximos en una única recarga; si llega otro durante una recarga en curso, se hace una más al terminar.
    let reloadTimer=null,reloading=false,reloadAgain=false;
    function scheduleReload(){clearTimeout(reloadTimer);reloadTimer=setTimeout(runReload,250)}
    async function runReload(){if(!state.user)return;if(reloading){reloadAgain=true;return}reloading=true;try{await loadAll()}finally{reloading=false;if(reloadAgain){reloadAgain=false;scheduleReload()}}}
        // =====================================================================================================
    // v2 · Roles (Jefe / Profesional), auxilios de alimentación por turno, catálogo de actividades,
    //      sindicatos y reglas de costo, y reportes limitados a horas con aprobación válida.
    // Todas las funciones son declaraciones (se elevan): pueden usarse desde el código anterior.
    // =====================================================================================================
    const ROLE_LABEL={employee:'Funcionario',professional:'Profesional',manager:'Jefe',admin:'Administrador'};
    const STAFF_ROLES=new Set(['admin','professional','manager']);
    const APPROVED_STATUSES=new Set(['approved','pending_execution','validated','closed']);
    const IN_PROCESS_STATUSES=new Set(['draft','pending','in_review','returned']);
    const NOT_APPROVED_STATUSES=new Set(['rejected','cancelled']);
    function roleLabel(role){return ROLE_LABEL[role]||'Funcionario'}
    function isAdmin(){return state.profile?.role==='admin'}
    function isStaff(){return STAFF_ROLES.has(state.profile?.role)}
    // v5: el administrador ya no interviene en el flujo operativo (validar, aprobar, cerrar): eso corresponde al profesional y al jefe.
    function canProfessional(){return state.profile?.role==='professional'}
    // Ámbito del jefe: solicitudes de su misma dependencia (regla documentada como pendiente de confirmación).
    function canDecide(r){const p=state.profile;if(!p||!r)return false;return p.role==='manager'&&!!p.department_id&&p.department_id===r.department_id}
    function scopeStaffRows(all){const p=state.profile;if(!p)return [];if(p.role==='admin'||p.role==='professional')return all;if(p.role==='manager')return p.department_id?all.filter(r=>r.department_id===p.department_id):[];return []}
    function applyRoleUI(role){const staff=STAFF_ROLES.has(role),admin=role==='admin';$$('.admin-nav,.staff-only').forEach(x=>x.classList.toggle('hidden',!staff));$$('.admin-only').forEach(x=>x.classList.toggle('hidden',!admin));$$('.employee-only').forEach(x=>x.classList.toggle('hidden',staff))}
    function isApprovedStatus(s){return APPROVED_STATUSES.has(s)}
    // Horas aprobadas válidas: solo cuentan si la solicitud está en un estado de aprobación válida.
    function approvedHoursOf(r){return r&&isApprovedStatus(r.status)&&r.approved_hours!=null?Number(r.approved_hours):null}
    function approvedOnly(rows){return (rows||[]).filter(r=>approvedHoursOf(r)!=null)}
    function sumApproved(rows){return (rows||[]).reduce((a,r)=>a+(approvedHoursOf(r)||0),0)}
    function approvedCell(r){const h=approvedHoursOf(r);return h==null?'—':num(h)+' h'}
    const nfMoney=intlOnce(()=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}));
    function fmtMoney(v){return v==null||Number.isNaN(Number(v))?'—':nfMoney().format(Number(v))}

    // ---------- Turnos laborales (catálogo real tomado de «Actualizar Turno Laboral») ----------
    
    const WEEKDAY_SHORT=['L','M','X','J','V','S','D'];
    const FOOD_KEYS=[['breakfast','D','Desayuno'],['lunch','A','Almuerzo'],['dinner','C','Comida']];
    const AUX_STATUS_TEXT={ok:'Calculado según el turno',no_shift:'Sin turno asignado',non_working_day:'Día sin jornada habitual (regla no definida)',incomplete:'Horario incompleto',invalid:'Horario no válido'};
    function hmMin(v){const t=parseTimeValue(v);return t?t.h*60+t.m:null}
    const holidayCacheV2=new Map();
    function isColombianHoliday(iso){const y=Number(String(iso||'').slice(0,4));if(!y)return false;if(!holidayCacheV2.has(y))holidayCacheV2.set(y,colombianHolidays(y));return holidayCacheV2.get(y).has(iso)}
    function isoWeekday(iso){const d=parseISODate(iso);return d?((d.getDay()+6)%7)+1:null}
    function shiftByCode(code,list){return (list||state.workShifts||[]).find(s=>s.code===code)||null}
    function auxRuleParams(params){const p=params||state.parameters||{},n=(v,d)=>{const x=Number(v);return v==null||v===''||!Number.isFinite(x)?d:x};return {beforeMin:n(p.aux_breakfast_minutes_before,60),afterMin:n(p.aux_dinner_minutes_after,120)}}
    // Reglas (imagen «Condiciones»):
    //   Desayuno: labora una hora antes de la jornada habitual  → la hora extra cubre completa la hora previa al inicio del turno.
    //   Almuerzo: labora jornada continua                       → la hora extra cubre completo el horario de almuerzo del turno.
    //   Comida:   labora dos horas después de la jornada habitual → la hora extra cubre completas las dos horas siguientes al fin del turno.
    // Los minutos (60/120) son parámetros editables. Días sin jornada habitual (fuera del turno o festivos): regla no definida → sin auxilio y marcado.
    function computeFoodAllowances(req,shift,opts){
      const o=opts||{},before=o.beforeMin??60,after=o.afterMin??120;
      const res=(status,extra)=>({status,breakfast:false,lunch:false,dinner:false,notes:[],rule:{breakfast_minutes_before:before,dinner_minutes_after:after},...extra});
      const s0=hmMin(req?.start_time),e0=hmMin(req?.end_time);
      if(!req?.execution_date||s0==null||e0==null)return res('incomplete',{notes:['Faltan la fecha o el horario.']});
      if(s0===e0)return res('invalid',{notes:['La hora de finalización debe ser distinta a la de inicio.']});
      if(!shift)return res('no_shift',{notes:['El funcionario no tiene turno laboral asignado; el auxilio no se puede calcular.']});
      const snap={code:shift.code,description:shift.description,start_time:String(shift.start_time).slice(0,5),end_time:String(shift.end_time).slice(0,5),lunch_start:shift.lunch_start?String(shift.lunch_start).slice(0,5):null,lunch_end:shift.lunch_end?String(shift.lunch_end).slice(0,5):null,weekdays:shift.weekdays};
      const dow=isoWeekday(req.execution_date),hol=isColombianHoliday(req.execution_date);
      if(!(shift.weekdays||[]).map(Number).includes(dow)||(hol&&!shift.works_holidays))return res('non_working_day',{shift:snap,notes:[hol?'El día es festivo y el turno no tiene jornada habitual en festivos: la regla de auxilios no está definida para este caso.':'El día no hace parte de la jornada habitual del turno: la regla de auxilios no está definida para este caso.']});
      const s=s0,e=e0<=s0?e0+1440:e0,ss=hmMin(shift.start_time),se=hmMin(shift.end_time),ls=hmMin(shift.lunch_start),le=hmMin(shift.lunch_end),out=res('ok',{shift:snap});
      out.breakfast=s<=ss-before&&e>=ss;
      out.dinner=s<=se&&e>=se+after;
      if(ls==null||le==null)out.notes.push('El turno no tiene hora de almuerzo: el auxilio de almuerzo no aplica.');
      else out.lunch=s<=ls&&e>=le;
      return out;
    }
    function applyAuxResult(target,res){target.aux_breakfast=!!res.breakfast;target.aux_lunch=!!res.lunch;target.aux_dinner=!!res.dinner;target.aux_status=res.status;target.aux_detail=res;return target}
    function auxOf(r){return {breakfast:!!r?.aux_breakfast,lunch:!!r?.aux_lunch,dinner:!!r?.aux_dinner,status:r?.aux_status||null,detail:r?.aux_detail||null}}
    function foodValues(params){const v=(params||state.parameters||{}).food_allowance_values;return v&&typeof v==='object'?v:{breakfast:null,lunch:null,dinner:null}}
    const validMoney=v=>v!=null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0;
    // Instantánea de valores al aprobar: solo se congela si todos los conceptos que aplican tienen valor parametrizado.
    function auxSummary(rows){const s={count:0,breakfast:0,lunch:0,dinner:0,total:0,pending:0,requests:0};(rows||[]).forEach(r=>{const a=auxOf(r),v=auxValueOf(r);if(v.count)s.requests++;FOOD_KEYS.forEach(([k])=>{if(a[k]){s[k]++;s.count++}});s.total+=v.total;if(v.pending)s.pending++});s.subtitle=`${s.breakfast} D · ${s.lunch} A · ${s.dinner} C`;return s}
    function auxChips(r,opts){const a=auxOf(r),st=a.status,warn=st&&st!=='ok'?`<span class="aux-warn" title="${esc(AUX_STATUS_TEXT[st]||st)}">!</span>`:'';const chips=`<span class="aux-chips" aria-label="Auxilios: ${FOOD_KEYS.map(([k,,n])=>`${n} ${a[k]?'sí':'no'}`).join(', ')}">${FOOD_KEYS.map(([k,l,n])=>`<span class="aux-chip${a[k]?' on':''}" title="${n}: ${a[k]?'aplica':'no aplica'}">${l}</span>`).join('')}${warn}</span>`;if(opts?.link&&r.employee_id)return `<button type="button" class="aux-link" onclick="App.openAuxForEmployee('${esc(r.employee_id)}')" title="Ver la tarjeta de auxilios de ${esc(r.profiles?.full_name||'este funcionario')}">${chips}</button>`;return chips}
    function auxStatusLabel(r){const st=auxOf(r).status;return st?(AUX_STATUS_TEXT[st]||st):'Sin calcular'}
    function employeeShift(empId){const p=empId===state.profile?.id?state.profile:(state.profiles||[]).find(x=>x.id===empId);return shiftByCode(p?.shift_code)}

    // ---------- Catálogo de actividades (incluye actividades operativas) ----------
    
    function activityCatalog(){return Array.isArray(state.activityCatalog)?state.activityCatalog:[]}
    function activityGroups(){const map=new Map();activityCatalog().filter(a=>a.active!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)||collator().compare(a.name,b.name)).forEach(a=>{if(!map.has(a.group_name))map.set(a.group_name,[]);map.get(a.group_name).push(a.name)});return [...map].map(([name,items])=>({name,items}))}
    function catalogActivity(name){const k=normText(name);return activityCatalog().find(a=>normText(a.name)===k)||null}
    function isOperationalActivity(name){return !!catalogActivity(name)?.is_operational}
    function activityIsOperational(a){return a?.operational===true||isOperationalActivity(a?.name)}

    // ---------- Costos por tipo de sindicato ----------
    const COST_CATS=['hed','hen','hedd','hedn'];
    const COST_LABEL={hed:'hora extra diurna',hen:'hora extra nocturna',hedd:'hora extra dominical/festiva diurna',hedn:'hora extra dominical/festiva nocturna'};
    const COST_SHORT={hed:'HED',hen:'HEN',hedd:'HEDD',hedn:'HEDN'};
    // Clasifica los minutos del intervalo registrado: diurna 06:00–19:00 / nocturna 19:00–06:00; dominical si es domingo o festivo (Colombia).
    // Costo de una fila del informe: instantánea guardada al aprobar (histórico) o, si no existe, estimación con la parametrización vigente.
    
    
    // Recalcula auxilios cuando cambia el turno: solicitudes en trámite o que nunca tuvieron turno (mismo criterio que el servidor).
    
    
    async function loadV2Remote(){
      const c=state.client,admin=isAdmin(),q=[c.from('work_shifts').select('*').order('code'),c.from('unions').select('*').order('name'),c.from('activity_catalog').select('*').order('sort_order'),c.from('approved_overtime_v').select('id')];
      if(admin)q.push(c.from('union_cost_rules').select('*').order('valid_from',{ascending:false}),c.from('employee_compensation').select('*'),c.from('overtime_cost_snapshots').select('*'));
      const res=await Promise.all(q),err=res.find(x=>x.error)?.error;
      if(err){state.v2Ready=false;if(!state.v2Warned){state.v2Warned=true;toast('Falta aplicar la migración v2 en Supabase (turnos, auxilios, sindicatos y roles).','warning',errorMsg(err))}}else state.v2Ready=true;
      state.workShifts=res[0].data||[];state.unions=res[1].data||[];state.activityCatalog=res[2].data||[];state.approvedIds=res[3].error?null:new Set((res[3].data||[]).map(x=>x.id));
      state.unionRules=admin?(res[4]?.data||[]):[];state.compensation=admin?Object.fromEntries((res[5]?.data||[]).map(x=>[x.profile_id,x])):{};state.costSnapshots=admin?Object.fromEntries((res[6]?.data||[]).map(x=>[x.request_id,x.snapshot])):{};
    }
    // Filas para reportes de horas aprobadas: filtro en el servidor (vista approved_overtime_v) y, además, en el cliente.
    function approvedReportBase(rows){const base=approvedOnly(rows);return state.approvedIds?base.filter(r=>state.approvedIds.has(r.id)):base}

    // ---------- Vista previa del auxilio en el formulario de solicitud ----------
    function updateAuxPreview(form){
      const box=form.querySelector('#auxPreview');if(!box)return;
      const res=computeFoodAllowances({execution_date:form.execution_date.value,start_time:form.start_time.value,end_time:form.end_time.value},employeeShift(state.profile?.id),auxRuleParams());
      const sh=res.shift||shiftByCode(state.profile?.shift_code);
      const notes=res.notes.map(esc);
      const html=`<div class="rq-aux-h"><strong>Auxilio de alimentación</strong><span class="auto-chip">Automático</span></div>
        <p class="rq-aux-sh">${sh?`Turno ${esc(sh.code)} · ${esc(sh.description)}`:'Sin turno asignado'}</p>
        <div class="rq-meals">${FOOD_KEYS.map(([k,l,n])=>`<span class="rq-meal${res[k]?' on':''}"><b>${l}</b><i>${n}</i><em>${res[k]?'Aplica':'No aplica'}</em></span>`).join('')}</div>
        ${notes.length?`<p class="rq-aux-notes">${notes.join(' ')}</p>`:''}`;
      box.dataset.status=res.status;
      if(box._html===html)return;   // solo se redibuja (y se anima) cuando algo cambia de verdad
      box._html=html;box.innerHTML=html;
    }

    // ---------- Detalle de la solicitud: auxilios y validación profesional ----------
    function personName(id,fallback){if(!id)return '';if(id===state.user?.id)return state.profile?.full_name||fallback;return (state.profiles||[]).find(p=>p.id===id)?.full_name||fallback}
    // ---------- Acciones del detalle según el rol ----------
    function requestActions(r){
      const id=r.id,no=esc(r.filing_number||''),admin=isAdmin(),own=r.employee_id===state.user.id;
      const btn=(variant,icon,label,onclick,aria,key)=>`<button type="button" class="btn btn-modal btn-act btn-act--${variant}" data-act="${key||variant}" onclick="${onclick}" aria-label="${aria}" title="${aria}"><span class="act-ico" aria-hidden="true">${vectorIcon(icon)}</span><span class="act-label">${label}</span></button>`;
      const act=(a)=>`App.requestAction('${id}','${a}')`;
      const flow=[btn('quiet','close','Cerrar','App.closeModal()',`Cerrar el detalle de la solicitud ${no}`)],danger=[];
      if(!isStaff()&&own&&['draft','returned'].includes(r.status))flow.push(btn('primary','edit','Editar',`App.closeModal();App.openRequestForm('${id}')`,`Editar la solicitud ${no}`,'edit'));
      if(own&&['draft','pending','returned'].includes(r.status))danger.push(btn('ghost-danger','ban','Cancelar solicitud',act('cancel'),`Cancelar la solicitud ${no}`));
      if(!own&&isStaff()){
        const pro=canProfessional(),dec=canDecide(r),open=['pending','in_review'].includes(r.status),proOk=r.professional_result==='favorable',needPro=!!state.parameters.require_professional_validation;
        if(pro&&open&&!proOk)flow.push(btn('secondary','verify','Validar (profesional)',act('professional_validate'),`Registrar validación favorable del profesional para la solicitud ${no}`,'validate'));
        if((pro||dec)&&open)flow.push(btn('warn','undo','Devolver',act('return'),`Devolver la solicitud ${no} para correcciones`,'return'));
        if(dec&&open)flow.push(btn('reject','reject','Rechazar',act('reject'),`Rechazar la solicitud ${no}`,'reject'));
        if(dec&&open&&(!needPro||proOk))flow.push(btn('primary','approve','Aprobar',act('approve'),`Aprobar la solicitud ${no}; se cierra automáticamente`,'approve'));
        // Solo para solicitudes aprobadas antes del cierre automático (v5): un profesional puede cerrarlas.
        if(pro&&LEGACY_OPEN_STATUSES.includes(r.status))flow.push(btn('seal','lock','Cerrar solicitud',act('close'),`Cerrar la solicitud ${no}, aprobada antes del cierre automático`,'close'));
      }
      if(admin)danger.push(btn('ghost-danger','trash','Eliminar solicitud',`App.deleteRequest('${id}')`,`Eliminar la solicitud ${no}`));
      return (danger.length?`<div class="act-group act-group--danger" role="group" aria-label="Acciones de baja">${danger.join('')}</div>`:'')+`<div class="act-group act-group--flow" role="group" aria-label="Acciones de la solicitud">${flow.join('')}</div>`;
    }
    // Permisos y transiciones (idénticos a perform_request_action en el servidor).
    const LEGACY_OPEN_STATUSES=['approved','pending_execution','validated'];   // aprobadas antes del cierre automático
    const ACTION_FROM={start_review:['pending'],professional_validate:['pending','in_review'],return:['pending','in_review'],approve:['pending','in_review'],reject:['pending','in_review'],close:LEGACY_OPEN_STATUSES,cancel:['draft','pending','returned']};
    const ACTION_TO={start_review:'in_review',professional_validate:'in_review',return:'returned',approve:'approved',reject:'rejected',close:'closed',cancel:'cancelled'};   // approve: queda «approved» y se cierra de inmediato (ver perform_request_action en el servidor)
    function actionAllowed(me,r,action){const role=me?.role,own=r.employee_id===me?.id,mgr=role==='manager'&&!!me.department_id&&me.department_id===r.department_id,pro=role==='professional';const map={cancel:own||role==='admin',start_review:pro,professional_validate:pro,return:pro||mgr,approve:mgr,reject:mgr,close:pro};if(!map[action]){if(role==='admin'&&action!=='cancel')return 'El administrador no interviene en la aprobación ni en el cierre de solicitudes.';return 'Tu rol no tiene permiso para realizar esta acción.'}if(action!=='cancel'&&own)return 'No puedes gestionar tus propias solicitudes.';return null}
    

    // ---------- Dashboard, bandeja y reportes (solo horas con aprobación válida) ----------
    function renderDashboard(){
      const staff=isStaff(),rows=staff?state.adminRequests:state.requests,pending=rows.filter(r=>['pending','in_review','returned'].includes(r.status)).length,aux=auxSummary(approvedOnly(rows));
      $('#dashboardKpis').innerHTML=(staff?[kpi('Solicitudes',rows.length,'files'),kpi('Funcionarios',new Set(rows.map(r=>r.employee_id)).size,'users','#2563EB','#DBEAFE'),kpi('Horas aprobadas',num(sumApproved(rows)),'badge-check','#1D4ED8','#DBEAFE','Solo con aprobación válida'),kpi('Auxilios aprobados',aux.count,'utensils','#7C3AED','#EDE9FE',aux.subtitle)]:[kpi('Solicitudes',rows.length,'files'),kpi('Pendientes',pending,'clock-3','#B91C1C','#FEE2E2'),kpi('Horas aprobadas',num(sumApproved(rows)),'badge-check','#1D4ED8','#DBEAFE','Solo con aprobación válida'),kpi('Auxilios de alimentación',aux.count,'utensils','#2563EB','#E0F2FE',aux.subtitle)]).join('');
      renderCharts();$('#recentRequests').innerHTML=requestTable(rows.slice(0,5),false);iconRefresh();
    }
    function renderAdmin(){
      if(!isStaff())return;const rows=state.adminRequests,aux=auxSummary(approvedOnly(rows));
      $('#adminKpis').innerHTML=[kpi('Por revisar',rows.filter(r=>['pending','in_review'].includes(r.status)).length,'inbox','#B91C1C','#FEE2E2'),kpi('Por validar (profesional)',rows.filter(r=>['pending','in_review'].includes(r.status)&&r.professional_result!=='favorable').length,'clipboard-check','#7C3AED','#EDE9FE'),kpi('Aprobadas',rows.filter(r=>isApprovedStatus(r.status)).length,'badge-check'),kpi('Auxilios aprobados',aux.count,'utensils','#2563EB','#E0F2FE',`${aux.subtitle} · ${aux.pending?'valor sin parametrizar':fmtMoney(aux.total)}`)].join('');
      renderAdminTable();iconRefresh();
    }
    function reportFilteredRows(){
      const base=approvedReportBase(isStaff()?state.adminRequests:state.requests),from=$('#reportFrom').value,to=$('#reportTo').value,s=$('#reportStatus').value,d=$('#reportDepartment').value,e=$('#reportEmployee').value,w=$('#reportWorkType').value,kind=$('#reportActivityKind')?.value||'',act=$('#reportActivity')?.value||'',un=$('#reportUnion')?.value||'';
      return base.filter(r=>{const acts=getStructuredActivities(r),op=acts.some(activityIsOperational),emp=(state.profiles||[]).find(p=>p.id===r.employee_id),uid=PE.unionAt(state.unionAssignments,emp,r.execution_date).union_id;return (!from||r.execution_date>=from)&&(!to||r.execution_date<=to)&&(!s||r.status===s)&&(!d||r.department_id===d)&&(!e||r.employee_id===e)&&(!w||r.work_type_id===w)&&(!kind||(kind==='operational'?op:!op))&&(!act||acts.some(a=>normText(a.name)===normText(act)))&&(!un||(un==='none'?!uid:uid===un))});
    }
    function renderReports(){
      const rows=reportFilteredRows(),aux=auxSummary(rows);state.reportRows=rows;
      $('#reportKpis').innerHTML=[kpi('Registros aprobados',rows.length,'files'),kpi('Horas aprobadas',num(sumApproved(rows)),'badge-check','#1D4ED8','#DBEAFE','Excluye pendientes, rechazadas y canceladas'),kpi('Funcionarios',new Set(rows.map(r=>r.employee_id)).size,'users','#2563EB','#DBEAFE'),kpi('Auxilios de alimentación',aux.count,'utensils','#7C3AED','#EDE9FE',aux.subtitle)].join('');
      $('#reportCount').textContent=`${rows.length} registros con aprobación válida`;$('#reportTable').innerHTML=requestTable(rows,false);
      renderActivityBreakdown(rows);if(isAdmin())renderCostReport(rows);iconRefresh();
    }
    function renderActivityBreakdown(rows){
      const box=$('#reportActivityTable');if(!box)return;const map=new Map();
      rows.forEach(r=>{const seen=new Set();getStructuredActivities(r).forEach(a=>{const k=normText(a.name);if(seen.has(k))return;seen.add(k);const cat=catalogActivity(a.name);if(!map.has(k))map.set(k,{name:a.name,group:cat?.group_name||a.group||'Actividad personalizada',op:activityIsOperational(a),req:0,hours:0,emps:new Set()});const x=map.get(k);x.req++;x.hours+=approvedHoursOf(r)||0;x.emps.add(r.employee_id)})});
      const list=[...map.values()].sort((a,b)=>b.hours-a.hours||collator().compare(a.name,b.name));
      box.innerHTML=list.length?`<div class="table-wrap"><table><thead><tr><th>Actividad</th><th>Grupo</th><th>Tipo</th><th>Solicitudes</th><th>Funcionarios</th><th>Horas aprobadas*</th></tr></thead><tbody>${list.map(x=>`<tr><td><strong>${esc(x.name)}</strong></td><td>${esc(x.group)}</td><td>${x.op?'<span class="status st-validated">Operativa</span>':'<span class="status st-draft">No operativa</span>'}</td><td>${x.req}</td><td>${x.emps.size}</td><td>${num(x.hours)} h</td></tr>`).join('')}</tbody></table></div><p class="small muted fmt-note">* Una solicitud con varias actividades suma sus horas aprobadas en cada actividad; por eso esta columna no se totaliza.</p>`:'<div class="empty">No hay actividades para los filtros seleccionados.</div>';
    }
    // ---------- Informe de costos (administrador) ----------
    function costRows(rows){return rows.map(r=>{const c=costOf(r),emp=(state.profiles||[]).find(p=>p.id===r.employee_id);return {r,c,emp,union:c.union_name||(state.unions||[]).find(u=>u.id===emp?.union_id)?.name||'Sin sindicato'}})}
    function renderCostReport(rows){
      const box=$('#costReportTable');if(!box)return;const list=costRows(rows),ok=list.filter(x=>x.c.status==='ok'),pend=list.filter(x=>x.c.status!=='ok'),total=ok.reduce((a,x)=>a+(x.c.total||0),0),group=$('#costGroup')?.value||'detail';state.costRowsCache=list;
      $('#costReportKpis').innerHTML=[kpi('Valor calculado',fmtMoney(total),'circle-dollar-sign','#1D4ED8','#DBEAFE','Suma de solicitudes con cálculo completo'),kpi('Solicitudes calculadas',ok.length,'badge-check','#2563EB','#E0F2FE'),kpi('Pendientes de parametrización',pend.length,'triangle-alert','#B91C1C','#FEE2E2','No se suman al total'),kpi('Horas aprobadas incluidas',num(ok.reduce((a,x)=>a+x.c.approved_hours,0)),'clock','#7C3AED','#EDE9FE')].join('');
      const st=c=>c.status==='ok'?`<span class="status st-validated" title="${c.source==='snapshot'?'Registrado al aprobar con la regla vigente en ese momento':'Estimado con la parametrización vigente (sin instantánea)'}">${c.source==='snapshot'?'Calculado':'Estimado'}</span>`:`<span class="status st-returned" title="${esc((c.reasons||[]).join(' · '))}">Pendiente</span><div class="small muted">${esc((c.reasons||[]).join(' · '))}</div>`;
      if(!list.length){box.innerHTML='<div class="empty">No hay solicitudes aprobadas para los filtros seleccionados.</div>';return}
      if(group==='detail'){box.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Radicado</th><th>Funcionario</th><th>Sindicato</th><th>Fecha</th><th>Horas aprobadas</th>${COST_CATS.map(k=>`<th title="${COST_LABEL[k]}">${COST_SHORT[k]}</th>`).join('')}<th>Valor</th><th>Estado</th></tr></thead><tbody>${list.map(({r,c,union})=>`<tr><td><strong>${esc(r.filing_number)}</strong></td><td>${esc(r.profiles?.full_name||'—')}</td><td>${esc(union)}</td><td>${fmtDate(r.execution_date)}</td><td>${num(c.approved_hours)} h</td>${COST_CATS.map(k=>`<td>${c.hours?.[k]?num(c.hours[k]):'—'}</td>`).join('')}<td><strong>${c.status==='ok'?fmtMoney(c.total):'—'}</strong></td><td>${st(c)}</td></tr>`).join('')}<tr class="total-row"><td colspan="4"><strong>Total (solo solicitudes calculadas)</strong></td><td><strong>${num(ok.reduce((a,x)=>a+x.c.approved_hours,0))} h</strong></td>${COST_CATS.map(k=>`<td>${num(ok.reduce((a,x)=>a+(x.c.hours?.[k]||0),0))}</td>`).join('')}<td><strong>${fmtMoney(total)}</strong></td><td></td></tr></tbody></table></div>`;return}
      const key=group==='union'?(x=>x.union):(x=>x.emp?.full_name||x.r.profiles?.full_name||'—'),agg=new Map();
      list.forEach(x=>{const k=key(x);if(!agg.has(k))agg.set(k,{name:k,union:x.union,req:0,hours:0,value:0,pending:0,cats:{hed:0,hen:0,hedd:0,hedn:0}});const a=agg.get(k);a.req++;if(x.c.status==='ok'){a.hours+=x.c.approved_hours;a.value+=x.c.total||0;COST_CATS.forEach(c=>a.cats[c]+=x.c.hours?.[c]||0)}else a.pending++});
      const arr=[...agg.values()].sort((a,b)=>b.value-a.value);
      box.innerHTML=`<div class="table-wrap"><table><thead><tr><th>${group==='union'?'Tipo de sindicato':'Funcionario'}</th>${group==='union'?'':'<th>Sindicato</th>'}<th>Solicitudes</th><th>Horas calculadas</th>${COST_CATS.map(k=>`<th title="${COST_LABEL[k]}">${COST_SHORT[k]}</th>`).join('')}<th>Valor</th><th>Pendientes</th></tr></thead><tbody>${arr.map(a=>`<tr><td><strong>${esc(a.name)}</strong></td>${group==='union'?'':`<td>${esc(a.union)}</td>`}<td>${a.req}</td><td>${num(a.hours)} h</td>${COST_CATS.map(k=>`<td>${num(a.cats[k])}</td>`).join('')}<td><strong>${fmtMoney(a.value)}</strong></td><td>${a.pending?`<span class="status st-returned">${a.pending}</span>`:'0'}</td></tr>`).join('')}<tr class="total-row"><td colspan="${group==='union'?1:2}"><strong>Total</strong></td><td>${list.length}</td><td><strong>${num(arr.reduce((a,x)=>a+x.hours,0))} h</strong></td>${COST_CATS.map(k=>`<td>${num(arr.reduce((a,x)=>a+x.cats[k],0))}</td>`).join('')}<td><strong>${fmtMoney(total)}</strong></td><td>${pend.length}</td></tr></tbody></table></div>`;
    }
    function exportCostCSV(){const list=state.costRowsCache||[];if(!list.length)return toast('No hay datos para exportar.','warning');const q=v=>`"${String(v??'').replace(/"/g,'""')}"`,head=['Radicado','Funcionario','Sindicato','Fecha','Horas aprobadas',...COST_CATS.map(k=>COST_SHORT[k]),'Salario base','Divisor','Valor hora','Valor','Estado','Observaciones'];const csv='\ufeff'+[head.map(q).join(';'),...list.map(({r,c,union})=>[r.filing_number,r.profiles?.full_name||'',union,r.execution_date,c.approved_hours,...COST_CATS.map(k=>c.hours?.[k]??0),c.base_salary??'',c.hourly_divisor??'',c.base_hour_value??'',c.status==='ok'?c.total:'',c.status==='ok'?(c.source==='snapshot'?'Calculado':'Estimado'):'Pendiente',(c.reasons||[]).join(' | ')].map(q).join(';'))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='informe_costos_horas_extras.csv';a.click();URL.revokeObjectURL(a.href)}
    async function recalcCosts(){
      if(!isAdmin())return toast('Solo un administrador puede registrar los cálculos.','error');
      
      const {data,error}=await state.client.rpc('recalculate_overtime_costs');if(error)return toast(errorMsg(error),'error');toast(`Cálculos registrados: ${data?.costs??0} costos · ${data?.aux??0} auxilios`,'success','Las solicitudes ya calculadas no se modifican (se conserva el histórico).');await loadAll();
    }

    // ---------- Tarjetas de auxilios de alimentación (consolidado / individual) ----------
    state.auxMode='consolidated';
    function auxStatusMatch(r,f){return !f||(f==='approved'?APPROVED_STATUSES.has(r.status):f==='in_process'?IN_PROCESS_STATUSES.has(r.status):NOT_APPROVED_STATUSES.has(r.status))}
    function auxFilteredRows(){const e=$('#auxEmployee')?.value||'',from=$('#auxFrom')?.value||'',to=$('#auxTo')?.value||'',st=$('#auxStatus')?.value??'approved';return (state.adminRequests||[]).filter(r=>(!e||r.employee_id===e)&&(!from||r.execution_date>=from)&&(!to||r.execution_date<=to)&&auxStatusMatch(r,st))}
    function renderAuxPage(){
      if(!isStaff())return;const box=$('#auxContent');if(!box)return;$$('.aux-mode').forEach(b=>b.classList.toggle('active',b.dataset.auxMode===state.auxMode));
      const rows=auxFilteredRows(),s=auxSummary(rows),emp=$('#auxEmployee').value;state.auxRows=rows;
      $('#auxKpis').innerHTML=[kpi('Desayunos',s.breakfast,'coffee','#B91C1C','#FEE2E2'),kpi('Almuerzos',s.lunch,'utensils','#1D4ED8','#DBEAFE'),kpi('Comidas',s.dinner,'moon','#7C3AED','#EDE9FE'),kpi('Valor acumulado',s.pending&&!s.total?'Sin parametrizar':fmtMoney(s.total),'wallet','#2563EB','#E0F2FE',s.pending?`${s.pending} solicitud(es) con valor sin parametrizar`:'Según valores registrados o vigentes')].join('');
      if(state.auxMode==='individual'&&!emp){box.innerHTML='<div class="empty">Selecciona un funcionario para ver el detalle individual de sus auxilios.</div>';iconRefresh();return}
      if(state.auxMode==='individual'){
        const p=(state.profiles||[]).find(x=>x.id===emp),sh=shiftByCode(p?.shift_code),list=[...rows].sort((a,b)=>String(b.execution_date).localeCompare(String(a.execution_date)));
        box.innerHTML=`<div class="aux-card-head"><div><strong>${esc(p?.full_name||'Funcionario')}</strong><div class="small muted">${sh?`Turno ${esc(sh.code)} · ${esc(sh.description)}`:'Sin turno asignado: los auxilios no se pueden calcular'} · ${esc(p?.departments?.name||'')}</div></div><button class="btn btn-ghost btn-toolbar" onclick="App.setAuxMode('consolidated')">Volver al consolidado</button></div>
        ${list.length?`<div class="table-wrap"><table><thead><tr><th>Radicado</th><th>Fecha</th><th>Horario</th><th>Auxilios</th><th>Cálculo</th><th>Valor</th><th>Estado</th><th></th></tr></thead><tbody>${list.map(r=>{const v=auxValueOf(r);return `<tr><td><strong>${esc(r.filing_number)}</strong></td><td>${fmtDate(r.execution_date)}</td><td>${esc(fmtRange12(r))}</td><td>${auxChips(r)}</td><td class="small">${esc(auxStatusLabel(r))}</td><td>${v.count?(v.pending?'<span class="muted">Sin parametrizar</span>':fmtMoney(v.total)+(v.live?' <span class="small muted">(vigente)</span>':'')):'—'}</td><td>${statusBadge(r.status)}</td><td><button class="btn btn-ghost btn-row" onclick="App.viewRequest('${r.id}')"><i data-lucide="eye"></i> Ver</button></td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">No hay movimientos para los filtros seleccionados.</div>'}`;
        iconRefresh();return;
      }
      const agg=new Map();rows.forEach(r=>{if(!agg.has(r.employee_id))agg.set(r.employee_id,[]);agg.get(r.employee_id).push(r)});
      const items=[...agg].map(([id,list])=>{const p=(state.profiles||[]).find(x=>x.id===id),sm=auxSummary(list);return {id,name:p?.full_name||list[0]?.profiles?.full_name||'—',shift:p?.shift_code||'',sm,req:list.length}}).sort((a,b)=>b.sm.count-a.sm.count||collator().compare(a.name,b.name));
      box.innerHTML=items.length?`<div class="table-wrap"><table><thead><tr><th>Funcionario</th><th>Turno</th><th>Solicitudes</th><th>Desayunos</th><th>Almuerzos</th><th>Comidas</th><th>Total auxilios</th><th>Valor acumulado</th><th></th></tr></thead><tbody>${items.map(x=>`<tr><td><strong>${esc(x.name)}</strong></td><td>${x.shift?esc(x.shift):'<span class="status st-returned">Sin turno</span>'}</td><td>${x.req}</td><td>${x.sm.breakfast}</td><td>${x.sm.lunch}</td><td>${x.sm.dinner}</td><td><strong>${x.sm.count}</strong></td><td>${x.sm.pending&&!x.sm.total?'<span class="muted">Sin parametrizar</span>':fmtMoney(x.sm.total)+(x.sm.pending?' <span class="small muted">+ pendientes</span>':'')}</td><td><button class="btn btn-ghost btn-row" onclick="App.openAuxForEmployee('${x.id}')">Ver detalle</button></td></tr>`).join('')}<tr class="total-row"><td colspan="2"><strong>Total</strong></td><td>${rows.length}</td><td>${s.breakfast}</td><td>${s.lunch}</td><td>${s.dinner}</td><td><strong>${s.count}</strong></td><td><strong>${s.pending&&!s.total?'Sin parametrizar':fmtMoney(s.total)}</strong></td><td></td></tr></tbody></table></div>`:'<div class="empty">No hay registros para los filtros seleccionados.</div>';
      iconRefresh();
    }
    function setAuxMode(mode){state.auxMode=mode==='individual'?'individual':'consolidated';renderAuxPage()}
    function openAuxForEmployee(id){if(!isStaff())return;closeModal();navigate('auxilios');const sel=$('#auxEmployee');if(sel){sel.value=id;sel._customRefresh?.()}state.auxMode='individual';renderAuxPage()}
    function exportAuxCSV(){const rows=state.auxRows||[];if(!rows.length)return toast('No hay datos para exportar.','warning');const q=v=>`"${String(v??'').replace(/"/g,'""')}"`,head=['Radicado','Funcionario','Fecha','Inicio','Fin','Turno','Desayuno','Almuerzo','Comida','Cálculo','Valor','Origen del valor','Estado'];const csv='\ufeff'+[head.map(q).join(';'),...rows.map(r=>{const a=auxOf(r),v=auxValueOf(r);return [r.filing_number,r.profiles?.full_name||'',r.execution_date,fmtTime12(r.start_time),fmtTime12(r.end_time),a.detail?.shift?.code||'',a.breakfast?'Sí':'No',a.lunch?'Sí':'No',a.dinner?'Sí':'No',auxStatusLabel(r),v.count&&!v.pending?v.total:'',v.count?(v.pending?'Sin parametrizar':v.live?'Vigente':'Registrado al aprobar'):'',STATUS[r.status]].map(q).join(';')})].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='auxilios_alimentacion.csv';a.click();URL.revokeObjectURL(a.href)}
    function bindV2Static(){
      $$('.aux-mode').forEach(b=>b.onclick=()=>setAuxMode(b.dataset.auxMode));
      ['auxEmployee','auxFrom','auxTo','auxStatus'].forEach(id=>$('#'+id)?.addEventListener('input',renderAuxPage));
      ['auxEmployee','auxStatus'].forEach(id=>$('#'+id)?.addEventListener('change',renderAuxPage));
      $('#costGroup')?.addEventListener('change',()=>renderCostReport(state.reportRows||[]));
      document.addEventListener('click',e=>{const a=e.target.closest('[data-v2]');if(!a)return;({'export-aux':exportAuxCSV,'export-cost':exportCostCSV,'recalc-cost':recalcCosts,'go-aux':()=>navigate('auxilios'),'add-activity':()=>activityModal(),'add-shift':()=>shiftModal(),'add-union':()=>unionModal(),'add-rule':()=>ruleModal()})[a.dataset.v2]?.()});
    }
    function populateV2Filters(){
      const keep=(id,html)=>{const e=$('#'+id);if(!e)return;const v=e.value;e.innerHTML=html;e.value=v;if(e.value!==v)e.value=e.options[0]?.value??'';e._customRefresh?.()};
      keep('reportStatus','<option value="">Todos los estados aprobados</option>'+[...APPROVED_STATUSES].map(s=>`<option value="${s}">${STATUS[s]}</option>`).join(''));
      const emps=(state.profiles||[]).filter(p=>p.role==='employee');
      keep('auxEmployee','<option value="">Todos los funcionarios</option>'+emps.map(p=>`<option value="${p.id}">${esc(p.full_name)}</option>`).join(''));
      keep('reportActivity','<option value="">Cualquier actividad</option>'+activityCatalog().map(a=>`<option value="${esc(a.name)}">${esc(a.name)}${a.is_operational?' · operativa':''}</option>`).join(''));
      keep('reportUnion','<option value="">Todos los sindicatos</option><option value="none">Sin sindicato</option>'+(state.unions||[]).map(u=>`<option value="${u.id}">${esc(u.name)}</option>`).join(''));
    }
    // ---------- Configuración v2: actividades, turnos, sindicatos/reglas y parámetros de auxilios ----------
    const yesNo=v=>v?'<span class="status st-approved">Activo</span>':'<span class="status st-cancelled">Inactivo</span>';
    function renderV2Settings(){
      if(!isAdmin())return;
      const acts=activityCatalog();
      $('#activitiesTable').innerHTML=`${cfgStats(cfgStat(acts.length,'actividades'),cfgStat(acts.filter(a=>a.is_operational).length,'operativas'),cfgStat(acts.filter(a=>a.active===false).length,'inactivas',1))}<div class="callout">Las actividades marcadas como <strong>operativas</strong> se pueden seleccionar en las solicitudes y filtrar en los reportes. Las actividades nuevas quedan disponibles para todos los funcionarios.</div><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Actividad</th><th>Grupo</th><th>Tipo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${acts.map(a=>`<tr><td><strong>${esc(a.name)}</strong></td><td>${esc(a.group_name)}</td><td>${a.is_operational?'<span class="status st-validated">Operativa</span>':'<span class="status st-draft">No operativa</span>'}</td><td>${yesNo(a.active!==false)}</td><td><button class="btn btn-ghost btn-row" onclick="App.activityModal('${esc(a.id)}')"><i data-lucide="pencil"></i> Editar</button></td></tr>`).join('')}</tbody></table></div>`;
      const sh=state.workShifts||[];
      $('#shiftsTable').innerHTML=`${cfgStats(cfgStat(sh.length,'turnos'),cfgStat(sh.filter(s=>s.active!==false).length,'activos'),cfgStat(sh.filter(s=>s.works_holidays).length,'con festivos',1))}<div class="callout">Turnos tomados del sistema de nómina («Actualizar Turno Laboral»). El auxilio de alimentación se calcula con el turno asignado a cada funcionario en <strong>Funcionarios</strong>.</div><div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Turno</th><th>Días y jornada</th><th>Almuerzo</th><th>Festivos</th><th>Funcionarios</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${sh.map(s=>`<tr><td><div class="cfg-ident"><span class="cfg-av" aria-hidden="true">${esc(s.code)}</span><div><strong>Turno ${esc(s.code)}</strong><div class="small muted">${esc(s.description)}</div></div></div></td><td><div class="cfg-days" aria-label="Días: ${esc((s.weekdays||[]).map(d=>WEEKDAY_SHORT[d-1]).join(' '))}">${WEEKDAY_SHORT.map((d,i)=>`<i class="${(s.weekdays||[]).map(Number).includes(i+1)?'on':''}">${d}</i>`).join('')}</div><div class="small" style="margin-top:5px;white-space:nowrap"><strong>${esc(fmtTime12(s.start_time))} – ${esc(fmtTime12(s.end_time))}</strong></div></td><td>${s.lunch_start?`${esc(fmtTime12(s.lunch_start))} – ${esc(fmtTime12(s.lunch_end))}`:'<span class="muted">Sin almuerzo</span>'}</td><td>${s.works_holidays?'<span class="status st-validated">Sí</span>':'<span class="muted">No</span>'}</td><td>${(state.profiles||[]).filter(p=>p.shift_code===s.code).length}</td><td>${yesNo(s.active!==false)}</td><td><button class="btn btn-ghost btn-row" onclick="App.shiftModal('${esc(s.code)}')"><i data-lucide="pencil"></i> Editar</button></td></tr>`).join('')}</tbody></table></div>`;
      const un=state.unions||[],rules=state.unionRules||[];
      $('#unionsTable').innerHTML=`<div class="callout">El valor del auxilio de alimentación se configura por sindicato con fecha de vigencia. Las <strong>reglas específicas</strong> de abajo son opcionales: si existe una vigente en la fecha de ejecución, sobrescriben el divisor y los factores de la regla laboral general (pestaña «Salarios y horas extras»). Si a una regla le falta un parámetro, la solicitud queda <strong>pendiente</strong> y no se suma al total.</div>
        <h4 class="v2-subtitle">Parámetros sindicales</h4>${un.length?`<div class="table-wrap"><table><thead><tr><th>Sindicato</th><th>Código</th><th>Funcionarios</th><th>Auxilio de alimentación</th><th>Vigente desde</th><th>Reglas</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${un.map(u=>`<tr><td><strong>${esc(u.name)}</strong></td><td>${esc(u.code||'—')}</td><td>${(state.profiles||[]).filter(p=>p.union_id===u.id).length}</td>${unionFoodCells(u)}<td>${rules.filter(r=>r.union_id===u.id).length}</td><td>${yesNo(u.active!==false)}</td><td><button class="btn btn-ghost btn-row" onclick="App.unionModal('${u.id}')"><i data-lucide="pencil"></i> Editar</button></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Aún no hay tipos de sindicato. Agrega el primero.</div>'}
        <div class="toolbar" style="margin-top:14px"><h4 class="v2-subtitle" style="margin:0">Reglas específicas del sindicato (sobrescriben la regla laboral general)</h4><button class="btn btn-primary btn-create btn-toolbar" data-v2="add-rule" ${un.length?'':'disabled'}><i data-lucide="plus"></i> Agregar regla</button></div>
        ${rules.length?`<div class="table-wrap"><table><thead><tr><th>Sindicato</th><th>Vigencia</th><th>Divisor horas/mes</th>${COST_CATS.map(k=>`<th title="Factor multiplicador de la ${COST_LABEL[k]}">${COST_SHORT[k]}</th>`).join('')}<th>Estado</th><th>Acción</th></tr></thead><tbody>${rules.map(r=>`<tr><td><strong>${esc(un.find(u=>u.id===r.union_id)?.name||'—')}</strong></td><td>${fmtDate(r.valid_from)} – ${r.valid_to?fmtDate(r.valid_to):'Indefinida'}</td><td>${r.hourly_divisor??'<span class="status st-returned">Pendiente</span>'}</td>${COST_CATS.map(k=>`<td>${r['factor_'+k]??'<span class="muted">—</span>'}</td>`).join('')}<td>${yesNo(r.active!==false)}</td><td><button class="btn btn-ghost btn-row" onclick="App.ruleModal('${r.id}')"><i data-lucide="pencil"></i> Editar</button></td></tr>`).join('')}</tbody></table></div><p class="small muted fmt-note">Valor = horas aprobadas de cada categoría × (salario base ÷ divisor) × factor. Las horas se clasifican en diurnas (6:00 a. m. – 7:00 p. m.) y nocturnas, y en dominicales/festivas según el día. Los cambios de regla no alteran las solicitudes ya calculadas.</p>`:'<div class="empty">No hay reglas registradas.</div>'}`;
      const p=state.parameters,fv=foodValues(),rp=auxRuleParams();
      $('#v2ParamsForm').innerHTML=`<form id="auxParamsForm" class="form-section section-details" novalidate><h4>${vectorIcon('check')} Auxilios de alimentación y flujo de aprobación <span class="section-kicker">Parámetros</span></h4>
        <div class="section-grid"><div class="field"><label for="pAuxD">Valor auxilio desayuno (COP)</label><input id="pAuxD" class="control" name="breakfast" type="number" min="0" step="1" value="${fv.breakfast??''}" placeholder="Sin parametrizar"></div>
        <div class="field"><label for="pAuxA">Valor auxilio almuerzo (COP)</label><input id="pAuxA" class="control" name="lunch" type="number" min="0" step="1" value="${fv.lunch??''}" placeholder="Sin parametrizar"></div>
        <div class="field"><label for="pAuxC">Valor auxilio comida (COP)</label><input id="pAuxC" class="control" name="dinner" type="number" min="0" step="1" value="${fv.dinner??''}" placeholder="Sin parametrizar"></div><div></div>
        <div class="field"><label for="pAuxBefore">Desayuno: minutos laborados antes de la jornada</label><input id="pAuxBefore" class="control" name="before" type="number" min="1" max="720" step="1" value="${rp.beforeMin}" required><span class="small muted">Regla institucional: una hora (60) antes de la jornada habitual.</span></div>
        <div class="field"><label for="pAuxAfter">Comida: minutos laborados después de la jornada</label><input id="pAuxAfter" class="control" name="after" type="number" min="1" max="720" step="1" value="${rp.afterMin}" required><span class="small muted">Regla institucional: dos horas (120) después de la jornada habitual.</span></div>
        <div class="field span-2"><label><input name="require_pro" type="checkbox" ${p.require_professional_validation?'checked':''}> Exigir validación favorable del profesional antes de que el jefe apruebe</label><span class="small muted">Desactivado: el jefe puede aprobar sin validación previa (comportamiento anterior). Actívalo solo si el proceso institucional define esa secuencia.</span></div></div>
        <div class="actions"><button class="btn btn-primary btn-modal" type="submit">${vectorIcon('check')} Guardar parámetros de auxilios y flujo</button></div></form>`;
      $('#auxParamsForm').onsubmit=saveV2Parameters;iconRefresh();
    }
    async function saveV2Parameters(e){
      e.preventDefault();if(!isAdmin())return toast('Solo un administrador puede modificar estos parámetros.','error');
      const f=e.target,money=v=>v===''?null:Number(v),vals={breakfast:money(f.breakfast.value),lunch:money(f.lunch.value),dinner:money(f.dinner.value)},before=Number(f.before.value),after=Number(f.after.value);
      if(Object.values(vals).some(v=>v!=null&&(!Number.isFinite(v)||v<0)))return toast('Los valores de auxilios deben ser números positivos o quedar vacíos.','error');
      if(![before,after].every(v=>Number.isInteger(v)&&v>0&&v<=720))return toast('Los minutos deben ser enteros entre 1 y 720.','error');
      const values={food_allowance_values:vals,aux_breakfast_minutes_before:before,aux_dinner_minutes_after:after,require_professional_validation:f.require_pro.checked};
      try{
        {const rows=Object.entries(values).map(([key,value])=>({key,value,updated_by:state.user.id,updated_at:new Date().toISOString()}));const {error}=await state.client.from('app_parameters').upsert(rows);if(error)throw error;const r2=await state.client.rpc('recompute_open_food_allowances');if(r2.error)throw r2.error}
        toast('Parámetros de auxilios y flujo guardados','success','Las solicitudes en trámite se recalcularon con los nuevos minutos.');await loadAll();
      }catch(err){toast(errorMsg(err),'error')}
    }
    async function v2Save(table,payload,match){
      if(!isAdmin())throw new Error('Se requieren permisos administrativos');
      const {error}=match?await state.client.from(table).update(payload).match(match):await state.client.from(table).insert(payload);if(error)throw error;
    }
    
    async function activityModal(id){
      const x=id?activityCatalog().find(a=>a.id===id):null,groups=[...new Set(activityCatalog().map(a=>a.group_name))];
      const {value}=await Swal.fire({cls:'cfg-ui cfg-acc-org',cfgIcon:'list',eyebrow:'Configuración · Actividades',title:`${x?'Editar':'Agregar'} actividad`,html:`<div class="swal-form-grid"><div class="swal-field span-2"><label for="actName">Nombre</label><input id="actName" class="swal2-input" maxlength="120" value="${esc(x?.name||'')}"></div><div class="swal-field span-2"><label for="actGroup">Grupo</label><input id="actGroup" class="swal2-input" list="actGroups" maxlength="80" value="${esc(x?.group_name||'Operación y gestión comercial')}"><datalist id="actGroups">${groups.map(g=>`<option value="${esc(g)}"></option>`).join('')}</datalist></div><label class="swal-check-row span-2"><input id="actOp" type="checkbox" ${x?.is_operational||!x?'checked':''}> Actividad operativa</label><label class="swal-check-row span-2"><input id="actActive" type="checkbox" ${x?.active===false?'':'checked'}> Disponible para seleccionar</label></div>`,showCancelButton:true,confirmButtonText:'Guardar',cancelButtonText:'Cancelar',preConfirm:()=>{const name=$('#actName').value.replace(/\s+/g,' ').trim(),group=$('#actGroup').value.replace(/\s+/g,' ').trim();if(name.length<3)return Swal.showValidationMessage('Ingresa un nombre de al menos 3 caracteres');if(group.length<3)return Swal.showValidationMessage('Ingresa el grupo');if(activityCatalog().some(a=>a.id!==id&&normText(a.name)===normText(name)))return Swal.showValidationMessage('Ya existe una actividad con ese nombre');return {name,group_name:group,is_operational:$('#actOp').checked,active:$('#actActive').checked}}});
      if(!value)return;
      try{await v2Save('activity_catalog',id?value:{...value,sort_order:activityCatalog().length+1},id?{id}:null);toast('Actividad guardada');await loadAll()}catch(err){toast(errorMsg(err),'error')}
    }
    async function shiftModal(code){
      const x=code?shiftByCode(code):null,t=v=>v?String(v).slice(0,5):'';
      const {value}=await Swal.fire({cls:'cfg-ui cfg-acc-jor',cfgIcon:'clock',eyebrow:'Configuración · Turnos laborales',title:`${x?'Editar':'Agregar'} turno`,html:`<div class="swal-form-grid"><div class="swal-field"><label for="shCode">Turno</label><input id="shCode" class="swal2-input" maxlength="5" value="${esc(x?.code||'')}" ${x?'readonly':''}></div><div class="swal-field"><label for="shDesc">Descripción</label><input id="shDesc" class="swal2-input" maxlength="160" value="${esc(x?.description||'')}"></div><div class="swal-field span-2"><label>Días de la jornada habitual</label><div class="v2-days">${WEEKDAY_SHORT.map((d,i)=>`<label class="swal-check-row"><input type="checkbox" class="shDay" value="${i+1}" ${(x?.weekdays||[1,2,3,4,5]).map(Number).includes(i+1)?'checked':''}> ${d}</label>`).join('')}</div></div><div class="swal-field"><label for="shStart">Inicio</label><input id="shStart" class="swal2-input" type="time" value="${t(x?.start_time)}"></div><div class="swal-field"><label for="shEnd">Fin</label><input id="shEnd" class="swal2-input" type="time" value="${t(x?.end_time)}"></div><div class="swal-field"><label for="shLs">Inicio almuerzo (opcional)</label><input id="shLs" class="swal2-input" type="time" value="${t(x?.lunch_start)}"></div><div class="swal-field"><label for="shLe">Fin almuerzo (opcional)</label><input id="shLe" class="swal2-input" type="time" value="${t(x?.lunch_end)}"></div><label class="swal-check-row span-2"><input id="shHol" type="checkbox" ${x?.works_holidays?'checked':''}> Los festivos hacen parte de la jornada habitual</label><label class="swal-check-row span-2"><input id="shActive" type="checkbox" ${x?.active===false?'':'checked'}> Turno activo</label></div>`,showCancelButton:true,confirmButtonText:'Guardar',cancelButtonText:'Cancelar',preConfirm:()=>{
        const c=$('#shCode').value.trim().toUpperCase(),days=[...document.querySelectorAll('.shDay:checked')].map(i=>Number(i.value)),s=$('#shStart').value,e=$('#shEnd').value,ls=$('#shLs').value||null,le=$('#shLe').value||null;
        if(!/^[A-Z0-9]{1,5}$/.test(c))return Swal.showValidationMessage('El código del turno debe tener de 1 a 5 letras o números');if(!x&&shiftByCode(c))return Swal.showValidationMessage('Ya existe un turno con ese código');
        if($('#shDesc').value.trim().length<3)return Swal.showValidationMessage('Ingresa la descripción');if(!days.length)return Swal.showValidationMessage('Selecciona al menos un día');
        if(!s||!e||hmMin(e)<=hmMin(s))return Swal.showValidationMessage('La hora de fin debe ser posterior a la de inicio');
        if(!!ls!==!!le)return Swal.showValidationMessage('Indica el inicio y el fin del almuerzo, o deja ambos vacíos');
        if(ls&&(hmMin(ls)<hmMin(s)||hmMin(le)>hmMin(e)||hmMin(le)<=hmMin(ls)))return Swal.showValidationMessage('El almuerzo debe estar dentro de la jornada y terminar después de iniciar');
        return {code:c,description:$('#shDesc').value.trim(),weekdays:days,start_time:s,end_time:e,lunch_start:ls,lunch_end:le,works_holidays:$('#shHol').checked,active:$('#shActive').checked}}});
      if(!value)return;
      try{{await v2Save('work_shifts',value,x?{code:value.code}:null);const r2=await state.client.rpc('recompute_open_food_allowances');if(r2.error)throw r2.error}toast('Turno guardado','success','Las solicitudes en trámite de este turno se recalcularon.');await loadAll()}catch(err){toast(errorMsg(err),'error')}
    }
    function rulesOverlap(a,b){const end=v=>v||'9999-12-31';return a.valid_from<=end(b.valid_to)&&b.valid_from<=end(a.valid_to)}
    async function ruleModal(id){
      const x=id?(state.unionRules||[]).find(r=>r.id===id):null,un=(state.unions||[]).filter(u=>u.active!==false||u.id===x?.union_id);if(!un.length)return toast('Primero registra un tipo de sindicato.','warning');
      const {value}=await Swal.fire({cls:'cfg-ui cfg-acc-uni',cfgIcon:'calc',eyebrow:'Configuración · Sindicatos y auxilios',title:`${x?'Editar':'Agregar'} regla de cálculo`,html:`<div class="swal-form-grid"><div class="swal-field span-2"><label for="ruUnion">Sindicato</label><select id="ruUnion" class="swal2-select">${un.map(u=>`<option value="${u.id}" ${u.id===x?.union_id?'selected':''}>${esc(u.name)}</option>`).join('')}</select></div><div class="swal-field"><label for="ruFrom">Vigente desde</label><input id="ruFrom" class="swal2-input" type="date" value="${esc(x?.valid_from||'')}"></div><div class="swal-field"><label for="ruTo">Vigente hasta (opcional)</label><input id="ruTo" class="swal2-input" type="date" value="${esc(x?.valid_to||'')}"></div><div class="swal-field span-2"><label for="ruDiv">Divisor de horas mensuales (salario ÷ divisor = valor hora)</label><input id="ruDiv" class="swal2-input" type="number" min="0" step="0.01" value="${x?.hourly_divisor??''}" placeholder="Pendiente de definición"></div>${COST_CATS.map(k=>`<div class="swal-field"><label for="ru_${k}">Factor ${COST_SHORT[k]} · ${COST_LABEL[k]}</label><input id="ru_${k}" class="swal2-input" type="number" min="0" step="0.0001" value="${x?.['factor_'+k]??''}" placeholder="Pendiente"></div>`).join('')}<div class="swal-field span-2"><label for="ruNotes">Soporte normativo / observaciones</label><input id="ruNotes" class="swal2-input" maxlength="300" value="${esc(x?.notes||'')}" placeholder="Ej.: artículo de la convención colectiva"></div><label class="swal-check-row span-2"><input id="ruActive" type="checkbox" ${x?.active===false?'':'checked'}> Regla activa</label></div>`,showCancelButton:true,confirmButtonText:'Guardar',cancelButtonText:'Cancelar',preConfirm:()=>{
        const nv=v=>v===''?null:Number(v),val={union_id:$('#ruUnion').value,valid_from:$('#ruFrom').value,valid_to:$('#ruTo').value||null,hourly_divisor:nv($('#ruDiv').value),notes:$('#ruNotes').value.trim()||null,active:$('#ruActive').checked};COST_CATS.forEach(k=>val['factor_'+k]=nv($('#ru_'+k).value));
        if(!val.valid_from)return Swal.showValidationMessage('Indica la fecha de inicio de vigencia');if(val.valid_to&&val.valid_to<val.valid_from)return Swal.showValidationMessage('La vigencia final no puede ser anterior a la inicial');
        if(['hourly_divisor',...COST_CATS.map(k=>'factor_'+k)].some(k=>val[k]!=null&&!(val[k]>0)))return Swal.showValidationMessage('El divisor y los factores deben ser mayores que cero o quedar vacíos (pendientes)');
        if(val.active&&(state.unionRules||[]).some(r=>r.id!==id&&r.union_id===val.union_id&&r.active!==false&&rulesOverlap(r,val)))return Swal.showValidationMessage('La vigencia se cruza con otra regla activa del mismo sindicato');
        return val}});
      if(!value)return;
      try{await v2Save('union_cost_rules',id?value:{...value,created_by:state.user.id},id?{id}:null);toast('Regla de cálculo guardada','success','Las solicitudes ya calculadas conservan la regla con la que se registraron.');await loadAll()}catch(err){toast(errorMsg(err),'error')}
    }

    // ---------- Funcionarios: rol, turno, sindicato y salario base ----------
    // =====================================================================================================
    // v3 · Sindicatos con auxilio parametrizable, salarios con historial, reglas laborales con vigencia y motor de cálculo único.
    // Las fórmulas viven EXCLUSIVAMENTE en PayrollEngine (script «payroll-engine»); aquí solo se conectan los datos de la aplicación.
    // Estrategia histórica: lo ya aprobado conserva su instantánea (sindicato, salario, regla y tarifas usados); lo no registrado se calcula
    // con el sindicato, el salario y la regla que estaban vigentes en la fecha de ejecución, nunca con los valores actuales.
    // =====================================================================================================
    const PE=window.PayrollEngine;
    const V3_PARAM_DEFAULTS={finance_access_manager:true,finance_access_professional:true,finance_alert_increase_pct:20,finance_monthly_budget:null,finance_extra_concepts:[],union_self_service:true};
    const param=k=>{const v=state.parameters?.[k];return v===undefined?V3_PARAM_DEFAULTS[k]:v};
    const LABOR_SOURCE='Ley 2101 de 2021 (jornada y divisor) · Ley 2466 de 2025 (recargo dominical/festivo y horario nocturno) · CST arts. 168 y 179';
    // Referencia normativa verificada el 23/10/2026 con fuentes públicas; queda «pendiente de validación jurídica» hasta que el administrador la marque como validada.
    
    const profileOf=id=>(state.profiles||[]).find(p=>p.id===id)||(state.profile?.id===id?state.profile:null);
    const unionById=id=>(state.unions||[]).find(u=>u.id===id)||null;
    const todayISO=()=>toISODate(new Date());

    // Emula la función del servidor «finance_cost_feed»: costos dentro del ámbito del rol, SIN salarios ni tarifas (que revelarían el salario).
    
    
    async function loadV3Remote(){
      const c=state.client,admin=isAdmin(),q=[c.from('labor_rules').select('*').order('valid_from',{ascending:false}),c.from('union_food_rules').select('*').order('valid_from',{ascending:false}),c.from('union_assignments').select('*').order('valid_from',{ascending:false})];
      if(admin)q.push(c.from('salary_history').select('*').order('valid_from',{ascending:false}));
      const res=await Promise.all(q),err=res.find(x=>x.error)?.error;
      if(err){state.v3Ready=false;if(!state.v3Warned){state.v3Warned=true;toast('Falta aplicar la migración v3 en Supabase (gestión financiera, sindicatos y salarios).','warning',errorMsg(err))}}else state.v3Ready=true;
      state.laborRules=res[0].data||[];state.unionFoodRules=res[1].data||[];state.unionAssignments=res[2].data||[];state.salaryHistory=admin?(res[3]?.data||[]):[];state.finFeed=null;state.finCache=null;
      if(!admin&&canViewFinance()&&state.v3Ready){const r=await c.rpc('finance_cost_feed');if(!r.error)state.finFeed=Object.fromEntries((r.data||[]).map(x=>[x.request_id,{origin:x.origin,cost:x.cost}]));else toast(errorMsg(r.error),'error')}
    }
    // ---------- Conexión del motor con los datos de la aplicación ----------
    function costContext(src){const s=src||state;return {profiles:s.profiles||[],unions:s.unions||[],unionRules:s.unionRules||[],laborRules:s.laborRules||[],salaryHistory:s.salaryHistory||[],unionAssignments:s.unionAssignments||[],unionFoodRules:s.unionFoodRules||[],compensation:s.compensation||{},parameters:s.parameters||{},isHoliday:isColombianHoliday}}
    function computeOvertimeCost(r,ctx,hours){return PE.computeForRequest(r,ctx||costContext(),{hours:hours!==undefined?hours:approvedHoursOf(r)})}
    function classifyOvertimeMinutes(r,rule){return PE.classifyMinutes(r,rule||null,isColombianHoliday)}
    // Valor unitario del auxilio: regla del sindicato vigente en la fecha de ejecución; si no existe, los valores generales por tipo (comportamiento anterior).
    function foodUnitValues(r,ctx){
      const c=ctx||costContext(),emp=(c.profiles||[]).find(p=>p.id===r?.employee_id)||(state.profile?.id===r?.employee_id?state.profile:null),ua=PE.unionAt(c.unionAssignments,emp,r?.execution_date||todayISO()),fr=PE.foodUnitAt(c.unionFoodRules,ua.union_id,r?.execution_date||todayISO());
      if(fr.status==='ok'&&validMoney(fr.rule.amount)){const v=Number(fr.rule.amount);return {breakfast:v,lunch:v,dinner:v,source:'union',union_id:ua.union_id,rule_id:fr.rule.id||null}}
      return {...foodValues(c.parameters||state.parameters),source:'global',union_id:ua.union_id||null,rule_id:null};
    }
    function foodValuesSnapshot(a,params,ctxReq){
      const v=ctxReq?foodUnitValues(ctxReq.r,ctxReq.ctx):{...foodValues(params),source:'global'};
      if(FOOD_KEYS.some(([k])=>a[k]&&!validMoney(v[k])))return null;
      return {breakfast:validMoney(v.breakfast)?Number(v.breakfast):null,lunch:validMoney(v.lunch)?Number(v.lunch):null,dinner:validMoney(v.dinner)?Number(v.dinner):null,source:v.source||'global',union_id:v.union_id||null,rule_id:v.rule_id||null,captured_at:new Date().toISOString()};
    }
    function auxValueOf(r){
      const a=auxOf(r),snap=r?.aux_values&&typeof r.aux_values==='object'?r.aux_values:null,src=snap||foodUnitValues(r);let total=0,pending=false,count=0;const items={};
      FOOD_KEYS.forEach(([k])=>{if(!a[k])return;count++;const v=src[k];if(!validMoney(v)){pending=true;items[k]=null}else{items[k]=Number(v);total+=Number(v)}});
      return {total,pending,live:!snap,items,count,source:src.source||'global',union_id:src.union_id||null};
    }
    // Costo de una fila del informe: instantánea guardada al aprobar (histórico) o, si no existe, cálculo con las reglas vigentes en la fecha de ejecución.
    function costOf(r){const saved=(state.costSnapshots||{})[r.id];if(saved&&saved.status==='ok')return {...saved,source:'snapshot'};const live=computeOvertimeCost(r);return {...live,source:saved?'snapshot_pending':'live'}}

    // ---------- Auditoría con detalle legible (funcionario, valor anterior, valor nuevo, responsable y fecha) ----------
    function auditDetail(a){
      const o=a.old_data||{},n=a.new_data||{};if(!a.old_data&&!a.new_data)return '';
      const un=id=>esc(unionById(id)?.name||'Sin sindicato'),pn=esc(profileOf(a.entity_id)?.full_name||'Funcionario'),d=v=>v?fmtDate(String(v).slice(0,10)):'—';
      switch(a.action){
        case 'password_admin_link_generated':return `${pn}: enlace de restablecimiento generado`;
        case 'password_admin_temp_assigned':return `${pn}: contraseña temporal asignada (${n.mode==='document'?'cédula':'generada'}) · cambio obligatorio · sesiones cerradas: ${Number(n.sessions_revoked||0)}`;
        case 'password_admin_denied':return 'Intento de gestionar contraseñas sin permisos';
        case 'password_admin_rate_limited':return `${pn}: acción bloqueada por límite de seguridad`;
        case 'password_changed':return `${pn} cambió su contraseña`;
        case 'password_recovery_completed':return `${pn} recuperó su contraseña`;
        case 'password_change_reauth_failed':return `${pn}: intento de cambio con contraseña actual incorrecta`;
        case 'change_union':case 'self_set_union':return `${pn}: ${un(o.union_id)} → ${un(n.union_id)} · desde ${d(n.valid_from)}${n.reason?` · ${esc(n.reason)}`:''}`;
        case 'set_salary':return `${pn}: ${o.salary!=null?fmtMoney(o.salary):'sin salario'} → ${fmtMoney(n.salary)} · desde ${d(n.valid_from)}${n.reason?` · ${esc(n.reason)}`:''}`;
        case 'set_food_rule':return `${un(n.union_id)}: ${o.amount!=null?fmtMoney(o.amount):'sin valor'} → ${fmtMoney(n.amount)} · desde ${d(n.valid_from)}`;
        case 'set_signature':case 'replace_signature':return `${esc(n.manager_name||'Jefe')}: firma versión ${n.version}${a.action==='replace_signature'?` (reemplaza la versión ${o.version})`:''}`;
        case 'remove_signature':return `${esc(o.manager_name||'Jefe')}: firma versión ${o.version} retirada`;
        case 'acknowledge_aux':return `Auxilios reconocidos (D ${n.breakfast?'sí':'no'} · A ${n.lunch?'sí':'no'} · C ${n.dinner?'sí':'no'})${n.note?` · ${esc(n.note)}`:''}`;
        default:return '';
      }
    }
    const currentFoodRule=unionId=>PE.foodUnitAt(state.unionFoodRules,unionId,todayISO()).rule;
    const currentAssignment=empId=>(state.unionAssignments||[]).filter(a=>a.employee_id===empId&&a.valid_from<=todayISO()&&(!a.valid_to||a.valid_to>=todayISO())).sort((a,b)=>b.valid_from.localeCompare(a.valid_from))[0]||null;
    const salaryNow=empId=>PE.salaryAt(state.salaryHistory,empId,todayISO(),state.compensation?.[empId]?.base_salary);
    const ruleLine=(label,html)=>`<div class="v3-kv"><span>${label}</span><strong>${html}</strong></div>`;
    // ---------- Operaciones de cambio de sindicato y de salario (validación común + servidor) ----------
    
    
    async function changeEmployeeUnion(empId,unionId,validFrom,reason){
      if(!isAdmin())throw new Error('Se requieren permisos administrativos');
      const p=profileOf(empId);if(!p)throw new Error('Funcionario no encontrado');
      if(validFrom>todayISO())throw new Error('La fecha del cambio no puede ser futura.');
      const chk=PE.validateUnionChange(state.unionAssignments,p,unionId,validFrom,state.unions,{reason});if(!chk.ok)throw new Error(chk.errors[0]);
      {const {error}=await state.client.rpc('admin_change_union',{p_employee:empId,p_union:unionId,p_valid_from:validFrom,p_reason:reason.trim()});if(error)throw error}
      await loadAll();
    }
    async function setEmployeeSalary(empId,amount,validFrom,reason){
      if(!isAdmin())throw new Error('Se requieren permisos administrativos');
      const chk=PE.validateSalaryChange(state.salaryHistory,empId,amount,validFrom,{reason});if(!chk.ok)throw new Error(chk.errors[0]);
      {const {error}=await state.client.rpc('admin_set_salary',{p_employee:empId,p_salary:Number(amount),p_valid_from:validFrom,p_reason:reason.trim()});if(error)throw error}
      await loadAll();
    }
    // El funcionario elige su sindicato SOLO cuando aún no tiene uno (el cambio posterior pasa por el administrador).
    async function setOwnUnion(unionId){
      const me=profileOf(state.user.id),un=unionById(unionId);
      if(me?.union_id)throw new Error('Ya tienes un sindicato asignado; solicita el cambio al administrador.');
      if(param('union_self_service')===false)throw new Error('La selección de sindicato por parte del funcionario está deshabilitada.');
      if(!un||un.active===false)throw new Error('El sindicato seleccionado no está disponible.');
      {const {error}=await state.client.rpc('set_own_union',{p_union:unionId});if(error)throw error}
      await loadAll();if(state.profile)state.profile.union_id=unionId;
    }
    const swalDate=(id,val)=>`<input id="${id}" class="swal2-input" type="date" value="${esc(val||'')}" max="${esc(todayISO())}">`;
    async function changeUnionDialog(empId){
      const p=profileOf(empId);if(!p)return;const cur=unionById(p.union_id),opts=(state.unions||[]).filter(u=>u.active!==false&&u.id!==p.union_id);
      if(!opts.length)return toast('No hay otros sindicatos activos disponibles. Agrégalos en Configuración → Sindicatos.','warning');
      const {value}=await Swal.fire({title:p.union_id?'Cambiar sindicato':'Asignar sindicato',html:`<div class="swal-form-grid"><div class="swal-field span-2"><p class="small muted" style="margin:0">${esc(p.full_name)} · actualmente: <strong>${esc(cur?.name||'Sin sindicato')}</strong></p></div>
        <div class="swal-field span-2"><label for="cuUnion">Nuevo sindicato</label><select id="cuUnion" class="swal2-select"><option value="">Selecciona…</option>${opts.map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}</select></div>
        <div class="swal-field"><label for="cuFrom">Rige desde</label>${swalDate('cuFrom',todayISO())}</div>
        <div class="swal-field span-2"><label for="cuReason">Motivo del cambio</label><textarea id="cuReason" class="swal2-textarea" maxlength="300" placeholder="Ej.: afiliación certificada por el sindicato"></textarea></div></div>`,
        showCancelButton:true,confirmButtonText:'Continuar',cancelButtonText:'Cancelar',preConfirm:()=>{const v={unionId:$('#cuUnion').value,validFrom:$('#cuFrom').value,reason:$('#cuReason').value.trim()};if(v.validFrom>todayISO())return Swal.showValidationMessage('La fecha del cambio no puede ser futura.');const chk=PE.validateUnionChange(state.unionAssignments,p,v.unionId,v.validFrom,state.unions,{reason:v.reason});if(!chk.ok)return Swal.showValidationMessage(chk.errors[0]);return v}});
      if(!value)return;const next=unionById(value.unionId);
      const ok=await Swal.fire({title:'Confirma el cambio de sindicato',icon:'warning',html:`<div class="info-list"><div class="info-row"><span>Funcionario</span><span>${esc(p.full_name)}</span></div><div class="info-row"><span>Sindicato anterior</span><span>${esc(cur?.name||'Sin sindicato')}</span></div><div class="info-row"><span>Sindicato nuevo</span><span>${esc(next.name)}</span></div><div class="info-row"><span>Rige desde</span><span>${esc(fmtDate(value.validFrom))}</span></div></div><div class="callout" style="margin-top:10px">Se registra en la auditoría (responsable y fecha). Las solicitudes ya aprobadas conservan el sindicato con el que se calcularon; las demás usan el sindicato vigente en su fecha de ejecución.</div>`,showCancelButton:true,confirmButtonText:'Confirmar cambio',cancelButtonText:'Volver'});
      if(!ok.isConfirmed)return;
      try{await changeEmployeeUnion(empId,value.unionId,value.validFrom,value.reason);toast('Sindicato actualizado','success',`${p.full_name}: ${cur?.name||'Sin sindicato'} → ${next.name}`);if($('#modalRoot .v3-modal'))openEmployeeEditor(empId)}catch(err){toast(errorMsg(err),'error')}
    }
    async function salaryDialog(empId){
      const p=profileOf(empId);if(!p)return;const cur=salaryNow(empId),ref=(PE.rulesAt(state.laborRules,todayISO())[0]||{}).reference_salary;
      const {value}=await Swal.fire({title:cur?'Registrar nuevo salario':'Registrar salario',html:`<div class="swal-form-grid"><div class="swal-field span-2"><p class="small muted" style="margin:0">${esc(p.full_name)} · salario vigente: <strong>${cur?fmtMoney(cur.amount):'sin registrar'}</strong>${cur?.valid_from?` desde ${esc(fmtDate(cur.valid_from))}`:''}</p></div>
        <div class="swal-field"><label for="slAmount">Salario mensual (COP)</label><input id="slAmount" class="swal2-input" type="number" min="1" step="1" inputmode="numeric" placeholder="${ref?`Ej.: ${ref} (salario de referencia)`:'Valor mensual'}"></div>
        <div class="swal-field"><label for="slFrom">Rige desde</label><input id="slFrom" class="swal2-input" type="date" value="${esc(cur?todayISO():(profileOf(empId)?.created_at||todayISO()).slice(0,10))}"></div>
        <div class="swal-field span-2"><label for="slReason">Motivo</label><textarea id="slReason" class="swal2-textarea" maxlength="300" placeholder="${cur?'Ej.: incremento salarial 2026':'Salario inicial'}"></textarea></div></div>`,
        showCancelButton:true,confirmButtonText:'Continuar',cancelButtonText:'Cancelar',preConfirm:()=>{const v={amount:$('#slAmount').value,validFrom:$('#slFrom').value,reason:$('#slReason').value.trim()};const chk=PE.validateSalaryChange(state.salaryHistory,empId,v.amount,v.validFrom,{reason:v.reason});if(!chk.ok)return Swal.showValidationMessage(chk.errors[0]);return v}});
      if(!value)return;
      const ok=await Swal.fire({title:'Confirma el nuevo salario',icon:'warning',html:`<div class="info-list"><div class="info-row"><span>Funcionario</span><span>${esc(p.full_name)}</span></div><div class="info-row"><span>Salario anterior</span><span>${cur?fmtMoney(cur.amount):'—'}</span></div><div class="info-row"><span>Salario nuevo</span><span>${fmtMoney(Number(value.amount))}</span></div><div class="info-row"><span>Rige desde</span><span>${esc(fmtDate(value.validFrom))}</span></div></div><div class="callout" style="margin-top:10px">El historial no se reescribe: el salario anterior queda vigente hasta el día previo. Los costos ya registrados no cambian; los pendientes de registro usan el salario vigente en su fecha de ejecución.</div>`,showCancelButton:true,confirmButtonText:'Confirmar',cancelButtonText:'Volver'});
      if(!ok.isConfirmed)return;
      try{await setEmployeeSalary(empId,Number(value.amount),value.validFrom,value.reason);toast('Salario registrado','success',`${p.full_name}: ${fmtMoney(Number(value.amount))} desde ${fmtDate(value.validFrom)}`);if($('#modalRoot .v3-modal'))openEmployeeEditor(empId)}catch(err){toast(errorMsg(err),'error')}
    }
    async function pickOwnUnion(){
      const opts=(state.unions||[]).filter(u=>u.active!==false);if(!opts.length)return toast('No hay sindicatos disponibles. Consulta con el administrador.','warning');
      const {value}=await Swal.fire({title:'Selecciona tu sindicato',html:`<div class="swal-field"><label for="ownUnion">Sindicato</label><select id="ownUnion" class="swal2-select"><option value="">Selecciona…</option>${opts.map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}</select></div><div class="callout">Solo puedes elegirlo una vez; si necesitas cambiarlo después, solicítalo al administrador.</div>`,showCancelButton:true,confirmButtonText:'Guardar',cancelButtonText:'Cancelar',preConfirm:()=>{const v=$('#ownUnion').value;if(!v)return Swal.showValidationMessage('Selecciona un sindicato');return v}});
      if(!value)return;try{await setOwnUnion(value);toast('Sindicato registrado','success',unionById(value)?.name);if($('#modalRoot .modal-profile'))pfLoad()}catch(err){toast(errorMsg(err),'error')}
    }
    document.addEventListener('click',e=>{const b=e.target.closest('#pfPickUnion');if(b){e.preventDefault();pickOwnUnion()}});
    // ---------- Funcionarios: tabla y ficha ----------
    function renderEmployees(){
      if(!isAdmin())return;const q=$('#employeeSearch').value.toLowerCase(),rows=state.profiles.filter(p=>!q||p.full_name.toLowerCase().includes(q)||p.email?.toLowerCase().includes(q));
      renderDirectoryPanel();
      $('#employeesTable').innerHTML=`<div class="table-wrap"><table><thead><tr><th>Funcionario</th><th>Correo</th><th>Dependencia</th><th>Rol</th><th>Cargo y grado</th><th>Turno</th><th>Sindicato</th><th>Salario vigente</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows.map(p=>{const un=unionById(p.union_id),asg=currentAssignment(p.id),sal=salaryNow(p.id);return `<tr><td><strong>${esc(p.full_name)}</strong></td><td>${esc(p.email||'—')}</td><td>${esc(p.departments?.name||'Sin asignar')}</td><td>${esc(roleLabel(p.role))}</td><td>${jobGradeCell(p)}</td><td>${p.shift_code?esc(p.shift_code):(p.role==='employee'?'<span class="status st-returned">Sin turno</span>':'—')}</td><td>${un?`<strong>${esc(un.name)}</strong>${asg?`<div class="small muted">desde ${esc(fmtDate(asg.valid_from))}</div>`:''}`:(p.role==='employee'?'<span class="status st-returned">Sin sindicato</span>':'—')}</td><td>${sal?`${fmtMoney(sal.amount)}<div class="small muted">${sal.valid_from?`desde ${esc(fmtDate(sal.valid_from))}`:'sin historial'}</div>`:(p.role==='employee'?'<span class="status st-returned">Sin salario</span>':'—')}</td><td>${p.active?'<span class="status st-approved">Activo</span>':'<span class="status st-cancelled">Inactivo</span>'}</td><td><div class="table-actions"><button class="btn btn-ghost btn-row" title="Editar funcionario" onclick="App.editEmployee('${p.id}')"><i data-lucide="pencil"></i> Editar</button><button class="btn btn-ghost btn-row" title="${p.union_id?'Cambiar':'Asignar'} sindicato" onclick="App.changeUnion('${p.id}')">Sindicato</button><button class="btn btn-ghost btn-row" title="Registrar salario" onclick="App.setSalary('${p.id}')">Salario</button></div></td></tr>`}).join('')}</tbody></table></div>`;
      $('#employeeSearch').oninput=renderEmployees;iconRefresh();
    }
    function editEmployee(id){openEmployeeEditor(id)}
    function openEmployeeEditor(id){
      if(!isAdmin()||!id)return;const p=profileOf(id);if(!p)return;const isNew=false,rawDeps=state.departments||[];
      const un=p?unionById(p.union_id):null,asg=p?currentAssignment(p.id):null,sal=p?salaryNow(p.id):null;
      const sh=(state.workShifts||[]).filter(s=>s.active!==false||s.code===p?.shift_code),hist=p?(state.salaryHistory||[]).filter(h=>h.employee_id===p.id).sort((a,b)=>b.valid_from.localeCompare(a.valid_from)):[],uh=p?(state.unionAssignments||[]).filter(a=>a.employee_id===p.id).sort((a,b)=>b.valid_from.localeCompare(a.valid_from)):[];
      modal(`<div class="modal modal-xl modal-request v3-modal"><div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${vectorIcon('userCheck')}</span><div class="modal-title-group"><span class="modal-eyebrow">Ficha del funcionario</span><h3>${isNew?'Registrar funcionario':esc(p.full_name)}</h3><div class="small muted">${isNew?'En producción los usuarios se crean en Supabase Authentication.':esc(p.email||'')}</div></div></div><button class="close-modal" onclick="App.closeModal()" aria-label="Cerrar ventana">${vectorIcon('close')}</button></div>
        <form id="empForm" novalidate><div class="modal-body">
          <div class="form-section section-identity"><h4>${vectorIcon('userCheck')} Datos y rol <span class="section-kicker">Perfil</span></h4><div class="section-grid">
            <div class="field"><label for="efName">Nombre completo <span class="required">*</span></label><input id="efName" class="control" name="full_name" maxlength="120" required value="${esc(p?.full_name||'')}"></div>
            <div class="field"><label for="efEmail">Correo electrónico${isNew?' <span class="required">*</span>':''}</label><input id="efEmail" class="control" name="email" type="email" ${isNew?'required':'readonly aria-readonly="true"'} value="${esc(p?.email||'')}"></div>
            <div class="field"><label for="efDoc">Documento</label><input id="efDoc" class="control" name="document_number" maxlength="30" value="${esc(p?.document_number||'')}"></div>
            <div class="field"><label for="efDept">Dependencia</label><select id="efDept" class="control" name="department"><option value="">Sin dependencia</option>${rawDeps.map(d=>`<option value="${esc(d.id)}" ${d.id===p?.department_id?'selected':''}>${esc(d.name)}</option>`).join('')}</select></div>
            <div class="field"><label for="efRole">Rol</label><select id="efRole" class="control" name="role">${Object.entries(ROLE_LABEL).map(([k,l])=>`<option value="${k}" ${(p?.role||'employee')===k?'selected':''}>${l}</option>`).join('')}</select><span class="small muted">Jefe: aprueba o rechaza las solicitudes de su dependencia. Profesional: valida y analiza.</span></div>
            <div class="field"><label for="efShift">Turno laboral</label><select id="efShift" class="control" name="shift"><option value="">Sin turno</option>${sh.map(s=>`<option value="${esc(s.code)}" ${s.code===p?.shift_code?'selected':''}>${esc(s.code)} · ${esc(s.description)}</option>`).join('')}</select></div>
            ${jobGradeFieldsHTML(p)}
            <label class="swal-check-row span-2"><input name="active" type="checkbox" ${p?.active===false?'':'checked'}> Usuario activo</label></div></div>
          <div class="form-section section-schedule"><h4>${vectorIcon('shield')} Sindicato <span class="section-kicker">Vigente y trazabilidad</span></h4>
            ${isNew?`<div class="section-grid"><div class="field"><label for="efUnion">Sindicato</label><select id="efUnion" class="control" name="union"><option value="">Sin sindicato</option>${(state.unions||[]).filter(u=>u.active!==false).map(u=>`<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}</select></div><div class="field"><label for="efSalary">Salario mensual (COP, opcional)</label><input id="efSalary" class="control" name="salary" type="number" min="1" step="1" placeholder="Se registra con vigencia desde hoy"></div></div>`
            :`<div class="v3-kvs">${ruleLine('Sindicato vigente',un?esc(un.name):'<span class="status st-returned">Sin sindicato</span>')}${ruleLine('Desde',asg?esc(fmtDate(asg.valid_from)):'—')}${ruleLine('Auxilio de alimentación',(()=>{const fr=un?currentFoodRule(un.id):null;return fr?`${fmtMoney(fr.amount)} <span class="small muted">desde ${esc(fmtDate(fr.valid_from))}</span>`:'Sin valor parametrizado'})())}</div><div class="actions" style="margin-top:8px"><button type="button" class="btn btn-secondary btn-toolbar" data-v3="change-union" data-id="${esc(p.id)}">${p.union_id?'Cambiar sindicato…':'Asignar sindicato…'}</button></div>
            ${uh.length?`<details class="v3-details"><summary>Historial de sindicato (${uh.length})</summary><div class="table-wrap"><table><thead><tr><th>Sindicato</th><th>Desde</th><th>Hasta</th><th>Motivo</th><th>Registrado</th></tr></thead><tbody>${uh.map(a=>`<tr><td>${esc(unionById(a.union_id)?.name||'—')}</td><td>${esc(fmtDate(a.valid_from))}</td><td>${a.valid_to?esc(fmtDate(a.valid_to)):'Vigente'}</td><td>${esc(a.reason||'—')}</td><td>${esc(who(a.changed_by))} · ${esc(fmtDateTime(a.created_at))}</td></tr>`).join('')}</tbody></table></div></details>`:''}`}</div>
          ${isNew?'':`<div class="form-section section-details"><h4>${vectorIcon('check')} Salario individual <span class="section-kicker">Solo administradores</span></h4><div class="v3-kvs">${ruleLine('Salario vigente',sal?fmtMoney(sal.amount):'<span class="status st-returned">Sin registrar</span>')}${ruleLine('Desde',sal?.valid_from?esc(fmtDate(sal.valid_from)):'—')}${ruleLine('Origen',sal?(sal.source==='history'?'Historial salarial':'Valor sin historial (migración pendiente)'):'—')}</div>
            <div class="actions" style="margin-top:8px"><button type="button" class="btn btn-secondary btn-toolbar" data-v3="set-salary" data-id="${esc(p.id)}">${sal?'Registrar nuevo salario…':'Registrar salario…'}</button></div>
            ${hist.length?`<details class="v3-details"><summary>Historial salarial (${hist.length})</summary><div class="table-wrap"><table><thead><tr><th>Salario</th><th>Desde</th><th>Hasta</th><th>Motivo</th><th>Responsable</th></tr></thead><tbody>${hist.map(h=>`<tr><td class="num">${fmtMoney(h.salary)}</td><td>${esc(fmtDate(h.valid_from))}</td><td>${h.valid_to?esc(fmtDate(h.valid_to)):'Vigente'}</td><td>${esc(h.reason||'—')}</td><td>${esc(who(h.changed_by))} · ${esc(fmtDateTime(h.created_at))}</td></tr>`).join('')}</tbody></table></div></details>`:''}<p class="small muted fmt-note">El salario de referencia general (Parámetros) nunca sobrescribe el salario individual.</p></div>`}
          ${accessSectionHTML(p)}
          <p class="field-msg" id="efMsg" role="alert" hidden></p></div>
          <div class="modal-foot"><div class="modal-foot-note">${vectorIcon('shield')}<span>Los cambios de sindicato y de salario quedan en la auditoría con responsable y fecha.</span></div><div class="modal-actions"><button type="button" class="btn btn-ghost btn-modal" onclick="App.closeModal()">Cancelar</button><button type="submit" id="efSave" class="btn btn-primary btn-modal">${vectorIcon('check')} ${isNew?'Registrar funcionario':'Guardar cambios'}</button></div></div></form></div>`);
      const f=$('#empForm');enhanceSelectControls(f);bindJobGradeFields(f,p);f.onsubmit=e=>saveEmployeeEditor(e,id);loadPasswordEvents(id);
    }
    async function saveEmployeeEditor(e,id){
      e.preventDefault();const f=e.target,msg=m=>{const x=$('#efMsg');x.hidden=!m;x.textContent=m||'';if(m)x.scrollIntoView({block:'nearest'})};msg('');
      const prof={full_name:f.full_name.value.replace(/\s+/g,' ').trim(),department_id:f.department.value||null,role:f.role.value,active:f.active.checked,shift_code:f.shift.value||null,document_number:f.document_number.value.trim()||null};
      if(prof.full_name.length<3)return msg('Ingresa el nombre completo (mínimo 3 caracteres).');
      if(prof.role==='manager'&&!prof.department_id)return msg('Asigna una dependencia al jefe: define su ámbito de aprobación.');
      if(id&&id===state.user.id&&prof.role!=='admin')return msg('No puedes retirar tu propio rol administrativo desde esta pantalla.');
      if(state.v4Ready&&f.job_position){const jr=validateJobCombo(f.job_position.value,f.job_grade.value,state.jobGrades,id?profileOf(id)?.job_grade_id:null);if(!jr.ok)return msg(jr.error);prof.job_grade_id=jr.row?.id||null}   // v4: solo combinaciones del catálogo
      const btn=$('#efSave');setBusy(btn,true,'Guardando');
      try{
        if(!id)throw new Error('Los usuarios se crean en Supabase Authentication y se vinculan solos con el directorio.');
        {const {error}=await state.client.from('profiles').update(prof).eq('id',id);if(error)throw error;toast('Perfil actualizado')}
        closeModal();await loadAll();
      }catch(err){msg(errorMsg(err));setBusy(btn,false)}
    }
    document.addEventListener('click',e=>{const a=e.target.closest('[data-v3]');if(!a)return;const k=a.dataset.v3,id=a.dataset.id;
      ({'change-union':()=>changeUnionDialog(id),'set-salary':()=>salaryDialog(id),'add-labor-rule':()=>laborRuleModal()})[k]?.()});
    // ---------- Sindicatos: nombre, estado, auxilio de alimentación con vigencia y observaciones ----------
    const unionFoodCells=u=>{const fr=currentFoodRule(u.id);return `<td>${fr?`<strong>${fmtMoney(fr.amount)}</strong>`:'<span class="status st-returned">Sin valor</span>'}</td><td>${fr?esc(fmtDate(fr.valid_from)):'—'}${fr?.notes?`<div class="small muted">${esc(fr.notes)}</div>`:''}</td>`};
    async function unionModal(id){
      const x=id?unionById(id):null,cur=x?currentFoodRule(x.id):null,hist=x?(state.unionFoodRules||[]).filter(r=>r.union_id===x.id).sort((a,b)=>b.valid_from.localeCompare(a.valid_from)):[];
      const {value}=await Swal.fire({cls:'cfg-ui cfg-acc-uni',cfgIcon:'users',eyebrow:'Configuración · Sindicatos y auxilios',title:`${x?'Editar':'Agregar'} sindicato`,html:`<div class="swal-form-grid"><div class="swal-field span-2"><label for="unName">Nombre</label><input id="unName" class="swal2-input" maxlength="120" value="${esc(x?.name||'')}"></div><div class="swal-field"><label for="unCode">Código (opcional)</label><input id="unCode" class="swal2-input" maxlength="30" value="${esc(x?.code||'')}"></div><label class="swal-check-row" style="align-self:end"><input id="unActive" type="checkbox" ${x?.active===false?'':'checked'}> Activo</label>
        <div class="swal-field span-2" style="margin-top:6px"><strong style="font-size:.74rem">Auxilio de alimentación</strong><div class="small muted">${cur?`Vigente: ${fmtMoney(cur.amount)} desde ${esc(fmtDate(cur.valid_from))}. Para cambiarlo registra un nuevo valor con su fecha de vigencia; el anterior queda en el historial.`:'Aún no tiene un valor parametrizado.'}</div></div>
        <div class="swal-field"><label for="unAmount">${cur?'Nuevo valor (COP)':'Valor (COP)'}</label><input id="unAmount" class="swal2-input" type="number" min="1" step="1" placeholder="${cur?'Dejar vacío para no cambiarlo':'Ej.: 27000'}"></div><div class="swal-field"><label for="unFrom">Vigente desde</label><input id="unFrom" class="swal2-input" type="date" value="${esc(todayISO())}"></div>
        <div class="swal-field span-2"><label for="unNotes">Observaciones (opcional)</label><input id="unNotes" class="swal2-input" maxlength="300" value="${esc(cur?.notes||'')}" placeholder="Ej.: ajuste anual por IPC"></div>
        ${hist.length>1?`<div class="span-2 small muted">Historial: ${hist.map(r=>`${fmtMoney(r.amount)} desde ${esc(fmtDate(r.valid_from))}`).join(' · ')}</div>`:''}</div>`,
        showCancelButton:true,confirmButtonText:'Guardar',cancelButtonText:'Cancelar',preConfirm:()=>{
          const name=$('#unName').value.replace(/\s+/g,' ').trim(),amount=$('#unAmount').value,from=$('#unFrom').value;
          if(name.length<2)return Swal.showValidationMessage('Ingresa un nombre válido');if((state.unions||[]).some(u=>u.id!==id&&normText(u.name)===normText(name)))return Swal.showValidationMessage('Ya existe un sindicato con ese nombre');
          if(amount!==''){if(!(Number(amount)>0))return Swal.showValidationMessage('El valor del auxilio debe ser mayor que cero');if(!from)return Swal.showValidationMessage('Indica desde qué fecha rige el valor');if(cur&&Number(amount)!==Number(cur.amount)&&from<=cur.valid_from)return Swal.showValidationMessage(`La vigencia debe ser posterior al inicio del valor actual (${cur.valid_from}); el historial no se reescribe`)}
          return {name,code:$('#unCode').value.trim()||null,active:$('#unActive').checked,amount:amount===''?null:Number(amount),from,notes:$('#unNotes').value.trim()||null}}});
      if(!value)return;
      try{
        const {amount,from,notes,...u}=value,changed=amount!=null&&(!cur||Number(amount)!==Number(cur.amount));
        {
          let uid=id;if(id){const {error}=await state.client.from('unions').update(u).eq('id',id);if(error)throw error}else{const {data,error}=await state.client.from('unions').insert({...u,created_by:state.user.id}).select().single();if(error)throw error;uid=data.id}
          if(changed){const {error}=await state.client.rpc('admin_set_union_food',{p_union:uid,p_amount:amount,p_valid_from:from,p_notes:notes});if(error)throw error}
          else if(cur&&notes!==(cur.notes||null)){const {error}=await state.client.from('union_food_rules').update({notes}).eq('id',cur.id);if(error)throw error}
        }
        toast('Sindicato guardado','success',changed?`Auxilio de ${fmtMoney(amount)} vigente desde ${fmtDate(from)}`:'');await loadAll();
      }catch(err){toast(errorMsg(err),'error')}
    }

    // =====================================================================================================
    // Parámetros · «Configuración salarial y de horas extras» y parámetros financieros
    // =====================================================================================================
    const who=id=>personName(id,'Usuario')||'Sistema';
    const MODE_SHORT={half_up:'redondeo',half_down:'redondeo (0,5 baja)',half_even:'al par',floor:'truncar',ceil:'hacia arriba'};
    const nfFactor=intlOnce(()=>new Intl.NumberFormat('es-CO',{minimumFractionDigits:2,maximumFractionDigits:4}));
    const pct=f=>f==null||f===''?'':PE.toStr(PE.mulDec(PE.dec(f),PE.dec(100))).replace(/\.?0+$/,'')||'0';
    const frac=v=>v===''||v==null||!Number.isFinite(Number(v))?null:PE.toNumber(PE.ratio(String(v).trim(),100,6,'half_up'));
    const ruleStatusBadge=r=>r.legal_status==='validated'?'<span class="status st-validated">Validada</span>':'<span class="status st-returned" title="Revisar con el área jurídica antes de considerarla definitiva">Pendiente de validación jurídica</span>';
    const rulePeriod=r=>`${esc(fmtDate(r.valid_from))} – ${r.valid_to?esc(fmtDate(r.valid_to)):'Indefinida'}`;
    function renderV3Settings(){if(!isAdmin())return;renderPayrollPanel()}
    function renderPayrollPanel(){
      const box=$('#payrollPanel');if(!box)return;const rules=[...(state.laborRules||[])].sort((a,b)=>b.valid_from.localeCompare(a.valid_from)),fp=param('finance_extra_concepts')||[];
      box.innerHTML=`<div class="callout">Estas reglas son la <strong>única fuente</strong> de los cálculos de horas extras, recargos y costos. Cada regla tiene fecha de inicio y de fin: para cambiar un porcentaje, el divisor o el horario nocturno crea una <strong>nueva vigencia</strong>; los periodos anteriores y los costos ya registrados no se alteran.</div>
        <section class="form-section"><h4>${vectorIcon('history')} Reglas laborales y recargos por vigencia <span class="section-kicker">Fuente única de cálculo</span></h4><div class="toolbar"><div><span class="small muted">Los valores de referencia suministrados (salario mínimo $1.750.905, 42 h, divisor 210) se contrastaron con la normativa vigente: ver «Estado de validación».</span></div><button class="btn btn-primary btn-create btn-toolbar" data-v3="add-labor-rule"><i data-lucide="plus"></i> Agregar vigencia</button></div>
        ${rules.length?`<div class="table-wrap"><table><thead><tr><th>Vigencia</th><th>Jornada y horario</th><th>Recargos</th><th>Cálculo y redondeo</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${rules.map(r=>{const rd=PE.normRounding(r.rounding),cur=PE.rulesAt([r],todayISO()).length>0;return `<tr><td><strong>${rulePeriod(r)}</strong>${cur?'<div class="cfg-live">Vigente hoy</div>':''}</td><td><strong>${num(r.weekly_hours)} h/sem</strong> · ${num(r.monthly_divisor)} h/mes<div class="small muted">Nocturno ${esc(fmtTime12(String(r.night_start).slice(0,5)))} – ${esc(fmtTime12(String(r.night_end).slice(0,5)))}</div></td><td><div class="cfg-chips"><span class="cfg-cv"><i>Nocturno</i>${pct(r.night_surcharge)} %</span><span class="cfg-cv"><i>E. diurna</i>${pct(r.extra_day)} %</span><span class="cfg-cv"><i>E. nocturna</i>${pct(r.extra_night)} %</span><span class="cfg-cv"><i>Dom./festivo</i>${pct(r.holiday_surcharge)} %</span></div></td><td>${r.rate_mode==='manual'?`<span class="status st-review" title="${esc(r.manual_source||'')}">Manual</span>`:'<strong>Automático</strong>'}<div class="small muted" title="Hora base: ${esc(PE.MODE_LABEL[rd.base.mode])} · Tarifa: ${esc(PE.MODE_LABEL[rd.rate.mode])} · Total: ${esc(PE.MODE_LABEL[rd.total.mode])}">${['base','rate','total'].map(k=>`${{base:'Hora',rate:'Tarifa',total:'Total'}[k]}: ${MODE_SHORT[rd[k].mode]}${rd[k].decimals?` (${rd[k].decimals} dec.)`:''}`).join(' · ')}</div></td><td><div class="cfg-stack">${ruleStatusBadge(r)}${r.active!==false?'<span class="status st-approved">Activa</span>':'<span class="status st-cancelled">Inactiva</span>'}</div></td><td><div class="table-actions"><button class="btn btn-ghost btn-row" onclick="App.laborRuleModal('${esc(r.id)}')"><i data-lucide="pencil"></i> Editar</button><button class="btn btn-ghost btn-row" title="Crea una vigencia nueva con estos valores" onclick="App.laborRuleModal(null,'${esc(r.id)}')"><i data-lucide="copy-plus"></i> Nueva vigencia</button></div></td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">No hay reglas laborales. Agrega la primera vigencia.</div>'}</section>
        <section class="form-section"><h4>${vectorIcon('detail')} Tarifas resultantes (calculadora) <span class="section-kicker">Vista de práctica</span></h4>
        <div class="section-grid v3-calc"><div class="field"><label for="rcDate">Fecha de aplicación</label><input id="rcDate" class="control" type="date" value="${esc(todayISO())}"></div><div class="field"><label for="rcSalary">Salario mensual (COP)</label><input id="rcSalary" class="control" type="number" min="1" step="1" inputmode="numeric"></div></div>
        <div id="rcOut" aria-live="polite"></div>
        <p class="small muted fmt-note">El <strong>salario de referencia</strong> de la regla solo sirve para esta vista y como sugerencia al registrar un salario; <strong>nunca</strong> sobrescribe el salario individual de ningún funcionario (se administra en Funcionarios).</p></section>
        <form id="finParamsForm" class="form-section" novalidate><h4>${vectorIcon('check')} Parámetros financieros y de acceso <span class="section-kicker">Gestión financiera</span></h4><div class="section-grid"><div class="cfg-sub span-2">Presupuesto y alertas</div>
          <div class="field"><label for="fpBudget">Presupuesto mensual de horas extras y auxilios (COP)</label><input id="fpBudget" class="control" name="budget" type="number" min="0" step="1" value="${param('finance_monthly_budget')??''}" placeholder="Sin presupuesto configurado"><span class="small muted">Si queda vacío, el módulo no compara contra presupuesto.</span></div>
          <div class="field"><label for="fpPct">Alerta por incremento frente al periodo anterior (%)</label><input id="fpPct" class="control" name="pct" type="number" min="1" max="500" step="1" value="${param('finance_alert_increase_pct')}"></div>
          <div class="cfg-sub span-2">Quién puede ver el análisis</div><label class="swal-check-row"><input name="mgr" type="checkbox" ${param('finance_access_manager')!==false?'checked':''}> Jefe: consulta el análisis financiero de su dependencia</label>
          <label class="swal-check-row"><input name="pro" type="checkbox" ${param('finance_access_professional')!==false?'checked':''}> Profesional: consulta el análisis financiero</label>
          <div class="cfg-sub span-2">Sindicatos</div><label class="swal-check-row span-2"><input name="selfu" type="checkbox" ${param('union_self_service')!==false?'checked':''}> El funcionario puede elegir su sindicato la primera vez (los cambios posteriores los hace el administrador)</label>
          <div class="cfg-sub span-2">Otros costos</div><div class="span-2"><label class="small" style="font-weight:700">Conceptos económicos adicionales (porcentaje sobre el salario base mensual)</label><div id="fpExtra" class="v3-extra">${fp.map((c,i)=>extraRow(c,i)).join('')}</div><button type="button" class="btn btn-ghost btn-toolbar" id="fpAddExtra">${vectorIcon('add')} Agregar concepto</button><div class="small muted">Prestaciones, aportes o impuestos no se calculan por defecto: la entidad debe definir sus porcentajes y bases. Aquí puedes configurarlos; el módulo los mostrará como «estimado».</div></div></div>
          <p class="field-msg" id="fpMsg" role="alert" hidden></p><div class="actions"><button class="btn btn-primary btn-modal" type="submit">${vectorIcon('check')} Guardar parámetros financieros</button></div></form>`;
      enhanceTemporalPickers(box);
      const out=()=>{const d=$('#rcDate').value||todayISO(),rule=PE.effectiveRule(PE.rulesAt(state.laborRules,d)[0]||null,null),inp=$('#rcSalary');if(!inp.dataset.touched)inp.value=rule?.reference_salary||'';const t=PE.rateTable(inp.value,rule);$('#rcOut').innerHTML=rule?rateTableHTML(t,rule):'<div class="empty">No hay una regla laboral vigente en esa fecha.</div>'};
      $('#rcDate').addEventListener('input',()=>{$('#rcSalary').dataset.touched='';out()});$('#rcSalary').addEventListener('input',e=>{e.target.dataset.touched='1';out()});out();
      $('#fpAddExtra').onclick=()=>{const c=$('#fpExtra');c.insertAdjacentHTML('beforeend',extraRow({},c.children.length));$('#fpExtra').lastElementChild.querySelector('input')?.focus()};
      $('#fpExtra').addEventListener('click',e=>{const b=e.target.closest('[data-rm-extra]');if(b)b.closest('.v3-extra-row').remove()});
      $('#finParamsForm').onsubmit=saveFinanceParams;iconRefresh();
    }
    const extraRow=(c,i)=>`<div class="v3-extra-row"><input class="control" data-x="name" maxlength="60" placeholder="Nombre del concepto" aria-label="Nombre del concepto" value="${esc(c.name||'')}"><input class="control" data-x="pct" type="number" min="0" max="500" step="0.01" placeholder="% sobre salario" aria-label="Porcentaje sobre el salario" value="${esc(c.percent??'')}"><button type="button" class="btn btn-ghost btn-row" data-rm-extra aria-label="Quitar concepto">${vectorIcon('close')}</button></div>`;
    function rateTableHTML(t,rule){
      if(t.reasons?.length&&!t.base&&rule.rate_mode!=='manual')return `<div class="callout warning">${esc(t.reasons[0])}. Ingresa un salario para ver las tarifas.</div>`;
      return `<div class="table-wrap"><table class="v3-rates"><thead><tr><th>Categoría</th><th>Factor total</th><th>Recargo</th><th>Valor por hora</th></tr></thead><tbody>${t.rows.map(r=>`<tr><td>${esc(r.label)}</td><td class="num">${r.factor!=null?nfFactor().format(r.factor):'—'}</td><td class="num">${r.factor!=null?`${pct(PE.toNumber(PE.addDec(PE.dec(r.factor),PE.dec(-1))))} %`:'—'}</td><td class="num"><strong>${r.rate!=null?fmtMoney(r.rate):'—'}</strong>${r.note?`<div class="small muted">${esc(r.note)}</div>`:''}</td></tr>`).join('')}</tbody></table></div><p class="small muted fmt-note">Divisor ${num(rule.monthly_divisor)} h · regla ${rule.source==='general'?'general':'del sindicato'} vigente desde ${esc(fmtDate(rule.valid_from))}${t.base!=null?` · hora ordinaria ${fmtMoney(t.base)}`:''}. Los recargos se suman sobre la hora base (nunca se cuentan dos veces).</p>`;
    }
    async function saveFinanceParams(e){
      e.preventDefault();if(!isAdmin())return toast('Solo un administrador puede modificar estos parámetros.','error');
      const f=e.target,msg=m=>{const x=$('#fpMsg');x.hidden=!m;x.textContent=m||''};msg('');
      const budget=f.budget.value===''?null:Number(f.budget.value),pctv=Number(f.pct.value);
      if(budget!=null&&!(budget>=0))return msg('El presupuesto debe ser un valor positivo o quedar vacío.');if(!(pctv>=1&&pctv<=500))return msg('El umbral de alerta debe estar entre 1 y 500 %.');
      const extra=[];for(const row of $$('#fpExtra .v3-extra-row')){const name=row.querySelector('[data-x=name]').value.trim(),p=row.querySelector('[data-x=pct]').value;if(!name&&p==='')continue;if(name.length<3||!(Number(p)>=0&&p!==''))return msg('Cada concepto adicional requiere un nombre (mínimo 3 caracteres) y un porcentaje válido.');extra.push({name,percent:Number(p)})}
      const values={finance_monthly_budget:budget,finance_alert_increase_pct:pctv,finance_access_manager:f.mgr.checked,finance_access_professional:f.pro.checked,union_self_service:f.selfu.checked,finance_extra_concepts:extra};
      try{
        {const rows=Object.entries(values).map(([key,value])=>({key,value,updated_by:state.user.id,updated_at:new Date().toISOString()}));const {error}=await state.client.from('app_parameters').upsert(rows);if(error)throw error}
        toast('Parámetros financieros guardados');await loadAll();
      }catch(err){msg(errorMsg(err))}
    }
    // ---------- Modal de regla laboral (crear / editar / nueva vigencia a partir de otra) ----------
    const LR_ROUNDS=[['base','Valor de la hora ordinaria'],['rate','Tarifa de cada categoría'],['total','Total de cada línea de costo']];
    function laborRuleModal(id,fromId){
      if(!isAdmin())return;const src=id?(state.laborRules||[]).find(r=>r.id===id):(fromId?(state.laborRules||[]).find(r=>r.id===fromId):null);if(id&&!src)return;
      const latest=[...(state.laborRules||[])].sort((a,b)=>b.valid_from.localeCompare(a.valid_from))[0],base=src||latest||{},isNew=!id,startSuggest=isNew?(fromId&&src?.valid_to?PE.addDays(src.valid_to,1):(fromId?todayISO():(latest?.valid_to?PE.addDays(latest.valid_to,1):todayISO()))):src.valid_from;
      const r0={weekly_hours:42,monthly_divisor:210,night_start:'19:00',night_end:'06:00',night_surcharge:0.35,extra_day:0.25,extra_night:0.75,holiday_surcharge:0.90,reference_salary:'',rate_mode:'auto',manual_rates:{},manual_source:'',legal_status:'pending',source:LABOR_SOURCE,notes:'',active:true,...base},rd=PE.normRounding(r0.rounding),mr=r0.manual_rates||{};
      const pctField=(k,l,h)=>`<div class="field"><label for="lr_${k}">${l} (%)</label><input id="lr_${k}" class="control" name="${k}" type="number" min="0" max="500" step="0.01" required value="${pct(r0[k])}">${h?`<span class="small muted">${h}</span>`:''}</div>`;
      modal(`<div class="modal modal-xl modal-request v3-modal cfg-ui cfg-acc-pay"><div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${vectorIcon('history')}</span><div class="modal-title-group"><span class="modal-eyebrow">Configuración salarial y de horas extras</span><h3>${isNew?(fromId?'Nueva vigencia':'Agregar vigencia'):'Editar vigencia'}</h3><div class="small muted">Las reglas anteriores y los costos ya registrados no se modifican.</div></div></div><button class="close-modal" onclick="App.closeModal()" aria-label="Cerrar ventana">${vectorIcon('close')}</button></div>
        <form id="lrForm" novalidate><div class="modal-body"><div class="v3-split"><div>
          <div class="form-section section-identity"><h4>${vectorIcon('calendar')} Vigencia <span class="section-kicker">Obligatoria</span></h4><div class="section-grid"><div class="field"><label for="lr_from">Vigente desde <span class="required">*</span></label><input id="lr_from" class="control" name="valid_from" type="date" required value="${esc(startSuggest)}"></div><div class="field"><label for="lr_to">Vigente hasta (opcional)</label><input id="lr_to" class="control" name="valid_to" type="date" value="${esc(isNew&&fromId?'':(src?.valid_to||''))}"></div></div></div>
          <div class="form-section section-schedule"><h4>${vectorIcon('clock')||''} Jornada y periodo nocturno</h4><div class="section-grid"><div class="field"><label for="lr_wh">Jornada laboral semanal (h)</label><input id="lr_wh" class="control" name="weekly_hours" type="number" min="1" max="84" step="0.5" required value="${esc(r0.weekly_hours)}"></div><div class="field"><label for="lr_div">Divisor mensual (h)</label><input id="lr_div" class="control" name="monthly_divisor" type="number" min="1" max="744" step="0.5" required value="${esc(r0.monthly_divisor)}"><button type="button" class="link-btn" id="lrSuggest">Sugerir: jornada semanal × 5</button></div><div class="field"><label for="lr_ns">Inicio del periodo nocturno</label><input id="lr_ns" class="control" name="night_start" type="time" required value="${esc(String(r0.night_start).slice(0,5))}"></div><div class="field"><label for="lr_ne">Fin del periodo nocturno</label><input id="lr_ne" class="control" name="night_end" type="time" required value="${esc(String(r0.night_end).slice(0,5))}"></div></div></div>
          <div class="form-section section-details"><h4>${vectorIcon('check')} Porcentajes de recargo <span class="section-kicker">Se suman sobre la hora base</span></h4><div class="section-grid">${pctField('night_surcharge','Recargo nocturno ordinario')}${pctField('extra_day','Hora extra diurna')}${pctField('extra_night','Hora extra nocturna')}${pctField('holiday_surcharge','Recargo dominical y festivo','Ley 2466/2025: 80 % desde 1/07/2025 · 90 % desde 1/07/2026 · 100 % desde 1/07/2027')}</div></div>
          <div class="form-section section-support"><h4>${vectorIcon('edit')} Valor de la hora y redondeo</h4><div class="section-grid"><div class="field"><label for="lr_mode">Cálculo del valor de la hora</label><select id="lr_mode" class="control" name="rate_mode"><option value="auto" ${r0.rate_mode!=='manual'?'selected':''}>Automático (salario ÷ divisor × factor)</option><option value="manual" ${r0.rate_mode==='manual'?'selected':''}>Manual (valores fijos autorizados)</option></select></div><div class="field"><label for="lr_ref">Salario mensual de referencia (COP)</label><input id="lr_ref" class="control" name="reference_salary" type="number" min="0" step="1" value="${esc(r0.reference_salary??'')}" placeholder="Opcional · no altera salarios individuales"></div>
            <div class="span-2 ${r0.rate_mode==='manual'?'':'hidden'}" id="lrManual"><div class="section-grid">${PE.CATS.map(c=>`<div class="field"><label for="lr_m_${c}">${esc(PE.CAT_LABEL[c])} (COP/h)</label><input id="lr_m_${c}" class="control" data-m="${c}" type="number" min="0" step="1" value="${esc(mr[c]??'')}"></div>`).join('')}<div class="field span-2"><label for="lr_msrc">Origen y soporte del valor manual <span class="required">*</span></label><input id="lr_msrc" class="control" name="manual_source" maxlength="300" value="${esc(r0.manual_source||'')}" placeholder="Ej.: convención colectiva 2026, art. X, aprobado por…"><span class="small muted">Queda registrado junto con su vigencia y se muestra en cada cálculo.</span></div></div></div>
            ${LR_ROUNDS.map(([k,l])=>`<div class="field"><label for="lr_r_${k}">Redondeo · ${l}</label><div class="v3-round"><select id="lr_r_${k}" class="control" data-r="${k}" data-f="mode">${PE.MODES.map(m=>`<option value="${m}" ${rd[k].mode===m?'selected':''}>${esc(PE.MODE_LABEL[m])}</option>`).join('')}</select><input class="control" data-r="${k}" data-f="decimals" type="number" min="0" max="6" step="1" value="${rd[k].decimals}" aria-label="Decimales · ${l}"></div></div>`).join('')}</div></div>
          <div class="form-section section-identity"><h4>${vectorIcon('shield')} Validación y observaciones</h4><div class="section-grid"><div class="field"><label for="lr_legal">Estado de validación jurídica</label><select id="lr_legal" class="control" name="legal_status"><option value="pending" ${r0.legal_status!=='validated'?'selected':''}>Pendiente de validación</option><option value="validated" ${r0.legal_status==='validated'?'selected':''}>Validada por el área responsable</option></select></div><label class="swal-check-row" style="align-self:end"><input name="active" type="checkbox" ${r0.active===false?'':'checked'}> Regla activa</label><div class="field span-2"><label for="lr_src">Fuente normativa</label><input id="lr_src" class="control" name="source" maxlength="300" value="${esc(r0.source||'')}"></div><div class="field span-2"><label for="lr_notes">Observaciones</label><textarea id="lr_notes" class="control" name="notes" maxlength="600">${esc(r0.notes||'')}</textarea></div></div></div></div>
          <aside class="v3-preview" aria-label="Vista previa"><strong>Vista previa de tarifas</strong><div class="small muted" id="lrPrevHint"></div><div id="lrPrev"></div><div id="lrErrors" class="v3-errors" role="alert" aria-live="polite"></div></aside></div></div>
        <div class="modal-foot"><div class="modal-foot-note">${vectorIcon('shield')}<span>Todo cambio queda en la auditoría.</span></div><div class="modal-actions"><button type="button" class="btn btn-ghost btn-modal" onclick="App.closeModal()">Cancelar</button><button type="submit" id="lrSave" class="btn btn-primary btn-modal">${vectorIcon('check')} Guardar vigencia</button></div></div></form></div>`);
      const f=$('#lrForm');enhanceTemporalPickers(f);enhanceSelectControls(f);
      const collect=()=>{const rounding={};LR_ROUNDS.forEach(([k])=>{rounding[k]={mode:f.querySelector(`[data-r=${k}][data-f=mode]`).value,decimals:Number(f.querySelector(`[data-r=${k}][data-f=decimals]`).value)}});
        const manual={};f.querySelectorAll('[data-m]').forEach(i=>{if(i.value!=='')manual[i.dataset.m]=Number(i.value)});
        return {id:id||null,valid_from:f.valid_from.value,valid_to:f.valid_to.value||null,weekly_hours:f.weekly_hours.value===''?null:Number(f.weekly_hours.value),monthly_divisor:f.monthly_divisor.value===''?null:Number(f.monthly_divisor.value),night_start:f.night_start.value,night_end:f.night_end.value,night_surcharge:frac(f.night_surcharge.value),extra_day:frac(f.extra_day.value),extra_night:frac(f.extra_night.value),holiday_surcharge:frac(f.holiday_surcharge.value),reference_salary:f.reference_salary.value===''?null:Number(f.reference_salary.value),rate_mode:f.rate_mode.value,manual_rates:f.rate_mode.value==='manual'?manual:null,manual_source:f.rate_mode.value==='manual'?f.manual_source.value.trim():null,rounding,legal_status:f.legal_status.value,source:f.source.value.trim()||null,notes:f.notes.value.trim()||null,active:f.active.checked}};
      const autoClose=r=>{const closes=[],others=(state.laborRules||[]).map(o=>{if(o.id!==r.id&&o.active!==false&&r.active!==false&&!o.valid_to&&r.valid_from&&o.valid_from<r.valid_from){const vt=PE.addDays(r.valid_from,-1);closes.push({id:o.id,valid_to:vt,from:o.valid_from});return {...o,valid_to:vt}}return o});return {closes,others}};
      const preview=()=>{const r=collect(),plan=autoClose(r),errs=PE.validateRule(r,plan.others);$('#lrManual').classList.toggle('hidden',r.rate_mode!=='manual');$('#lrErrors').innerHTML=errs.map(x=>`<div>${vectorIcon('info')} ${esc(x)}</div>`).join('')+plan.closes.map(c=>`<div class="muted" style="color:var(--muted)">${vectorIcon('info')} Se cerrará la vigencia anterior (desde ${esc(fmtDate(c.from))}) el ${esc(fmtDate(c.valid_to))}.</div>`).join('');
        let t;try{t=PE.rateTable(r.reference_salary||1750905,PE.effectiveRule({...r,night_surcharge:r.night_surcharge??0,extra_day:r.extra_day??0,extra_night:r.extra_night??0,holiday_surcharge:r.holiday_surcharge??0},null))}catch(_){t=null}
        $('#lrPrevHint').textContent=`Con salario de ${fmtMoney(r.reference_salary||1750905)}${r.reference_salary?'':' (salario mínimo 2026, referencia)'}`;$('#lrPrev').innerHTML=t&&t.rows.length?`<table class="v3-rates v3-rates-sm"><tbody>${t.rows.map(x=>`<tr><td>${esc(x.label)}</td><td class="num"><strong>${x.rate!=null?fmtMoney(x.rate):'—'}</strong></td></tr>`).join('')}</tbody></table><div class="small muted">Hora ordinaria: ${t.base!=null?fmtMoney(t.base):'—'}</div>`:'<div class="small muted">Completa los campos para ver las tarifas.</div>'};
      f.addEventListener('input',preview);f.addEventListener('change',preview);$('#lrSuggest').onclick=()=>{f.monthly_divisor.value=PE.round(Number(f.weekly_hours.value||0)*5,2);preview()};preview();
      f.onsubmit=async e=>{e.preventDefault();const r=collect(),plan=autoClose(r),errs=PE.validateRule(r,plan.others);if(errs.length){$('#lrErrors').scrollIntoView({block:'nearest'});return toast(errs[0],'warning')}
        const btn=$('#lrSave');setBusy(btn,true,'Guardando');
        try{
          const payload={valid_from:r.valid_from,valid_to:r.valid_to,weekly_hours:r.weekly_hours,monthly_divisor:r.monthly_divisor,night_start:r.night_start,night_end:r.night_end,night_surcharge:r.night_surcharge,extra_day:r.extra_day,extra_night:r.extra_night,holiday_surcharge:r.holiday_surcharge,reference_salary:r.reference_salary,rate_mode:r.rate_mode,manual_rates:r.manual_rates,manual_source:r.manual_source,rounding:r.rounding,legal_status:r.legal_status,source:r.source,notes:r.notes,active:r.active};
          {for(const c of plan.closes){const {error:e2}=await state.client.from('labor_rules').update({valid_to:c.valid_to}).eq('id',c.id);if(e2)throw e2}const q=id?state.client.from('labor_rules').update(payload).eq('id',id):state.client.from('labor_rules').insert({...payload,created_by:state.user.id});const {error}=await q;if(error)throw error}
          closeModal();toast('Vigencia guardada','success','Los costos ya registrados no cambian; los pendientes de registro usarán la regla vigente en su fecha.');await loadAll();
        }catch(err){setBusy(btn,false);toast(errorMsg(err),'error')}};
    }

    // =====================================================================================================
    // Gestión financiera · análisis real del costo de horas extras y auxilios de alimentación
    // Cálculos: SOLO a través de PayrollEngine. Registrado = instantánea guardada al aprobar · Calculado = reglas vigentes en la fecha de ejecución ·
    // Proyectado = solicitudes en trámite o proyección del mes. Nunca se mezclan sin etiqueta.
    // =====================================================================================================
    function canViewFinance(){const p=state.profile;if(!p)return false;if(p.role==='admin')return true;if(p.role==='manager')return param('finance_access_manager')!==false;if(p.role==='professional')return param('finance_access_professional')!==false;return false}
    const canSeeSalary=()=>isAdmin();   // tarifas por hora y hora base: siguen siendo exclusivas del administrador
    // v4 · «Salario base (referencia)»: Administrador, Profesional y Jefe (siempre que el rol tenga acceso al módulo financiero).
    const BASE_SALARY_ROLES=new Set(['admin','professional','manager']);
    const canSeeBaseSalary=()=>BASE_SALARY_ROLES.has(state.profile?.role)&&canViewFinance();
    const canAckAux=()=>['admin','professional'].includes(state.profile?.role);
    function applyFinanceNav(){$$('.finance-nav').forEach(x=>x.classList.toggle('hidden',!canViewFinance()))}
    const FIN_CONCEPTS=[['hed','Extra diurna'],['hen','Extra nocturna'],['hedd','Extra diurna dominical/festiva'],['hedn','Extra nocturna dominical/festiva'],['aux','Auxilios de alimentación']];
    const ORIGIN_LABEL={registered:'Registrado',calculated:'Calculado',projected:'Proyectado',pending:'Pendiente'};
    const AUX_ORIGIN_LABEL={recognized:'Reconocido',estimated:'Estimado',projected:'Proyectado'};
    const fx=v=>fmtMoney(v),fpct=v=>v==null?'—':`${v>=0?'+':'−'}${Math.abs(v*100).toFixed(1).replace('.',',')} %`,share=(v,t)=>t>0?`${(v/t*100).toFixed(1).replace('.',',')} %`:'—';
    const shortMoney=v=>{const a=Math.abs(v);return a>=1e6?`$${(v/1e6).toFixed(1).replace('.',',')} M`:a>=1e3?`$${Math.round(v/1e3)} mil`:`$${Math.round(v)}`};
    state.fin={tab:'summary',f:null,tables:{},hint:''};
    const FIN_DEFAULT=()=>({mode:'month',month:'',quarter:'',year:'',day:'',from:'',to:'',union:'',employee:'',dept:'',hourType:'',concept:'',status:'approved'});
    // ---------- Registros financieros (una fila por solicitud) ----------
    function finRecords(){
      if(state.finCache)return state.finCache;const ctx=costContext(),out=[];
      (state.adminRequests||[]).forEach(r=>{const approved=APPROVED_STATUSES.has(r.status)&&r.approved_hours!=null,pipeline=!approved&&['pending','in_review'].includes(r.status);if(approved||pipeline)out.push(finBuild(r,approved?'approved':'pipeline',approved?Number(r.approved_hours):Number(r.hours_requested),ctx))});
      return state.finCache=out;
    }
    function finBuild(r,grp,hours,ctx){
      const emp=profileOf(r.employee_id),ua=PE.unionAt(ctx.unionAssignments,emp,r.execution_date),un=ua.union_id?unionById(ua.union_id):null;let cost,origin;
      if(state.finFeed){const f=state.finFeed[r.id];if(grp==='approved'&&f){cost=f.cost;origin=f.origin}else{cost={status:'pending',reasons:[grp==='pipeline'?'La proyección de solicitudes en trámite está disponible solo para administración':'Sin cálculo disponible para su rol'],values:null,total:null,hours:{},minutes:{}};origin='pending'}}
      else if(grp==='approved'){const snap=(state.costSnapshots||{})[r.id];if(snap&&snap.status==='ok'){cost=snap;origin='registered'}else{cost=computeOvertimeCost(r,ctx,hours);origin=cost.status==='ok'?'calculated':'pending'}}
      else{cost=computeOvertimeCost(r,ctx,hours);origin=cost.status==='ok'?'projected':'pending'}
      const ack=r.aux_ack&&typeof r.aux_ack==='object'?r.aux_ack:null,base=auxOf(r),flags=ack?{breakfast:!!ack.breakfast,lunch:!!ack.lunch,dinner:!!ack.dinner}:{breakfast:base.breakfast,lunch:base.lunch,dinner:base.dinner};
      const val=auxValueOf({...r,aux_breakfast:flags.breakfast,aux_lunch:flags.lunch,aux_dinner:flags.dinner}),aux={count:val.count,flags,total:val.pending?0:val.total,pending:val.pending,origin:grp==='approved'?(ack?'recognized':'estimated'):'projected',valueSource:val.source,live:val.live,status:r.aux_status||null,items:val.items,ack};
      return {id:r.id,req:r,filing:r.filing_number,empId:r.employee_id,empName:r.profiles?.full_name||emp?.full_name||'—',deptId:r.department_id,deptName:r.departments?.name||'—',date:r.execution_date,ym:r.execution_date.slice(0,7),status:r.status,grp,hours,union:un?{id:un.id,name:un.name}:null,unionName:un?.name||'Sin sindicato',cost,origin,aux,total:(cost.status==='ok'?cost.total:0)+aux.total};
    }
    function finComp(rec,f){
      const ot={hed:0,hen:0,hedd:0,hedn:0},hrs={hed:0,hen:0,hedd:0,hedn:0},cats=f.hourType?[f.hourType]:PE.OT_CATS,useOt=!f.concept||f.concept==='ot',useAux=(!f.concept||f.concept==='aux')&&!f.hourType;
      if(useOt&&rec.cost.status==='ok')cats.forEach(k=>{ot[k]=rec.cost.values?.[k]||0;hrs[k]=rec.cost.hours?.[k]||0});
      const aux=useAux?rec.aux.total:0,otTotal=PE.OT_CATS.reduce((a,k)=>a+ot[k],0),hours=PE.OT_CATS.reduce((a,k)=>a+hrs[k],0);
      return {ot,hrs,otTotal,aux,hours,total:otTotal+aux};
    }
    function finMatch(rec,f){
      if(f.union&&(f.union==='none'?rec.union:rec.union?.id!==f.union))return false;if(f.employee&&rec.empId!==f.employee)return false;if(f.dept&&rec.deptId!==f.dept)return false;
      if(f.status==='approved'&&rec.grp!=='approved')return false;if(f.status==='pipeline'&&rec.grp!=='pipeline')return false;
      if(f.hourType){const c=finComp(rec,f);if(!(c.hrs[f.hourType]>0))return false}
      return true;
    }
    const finBounds=f=>PE.fin.periodBounds(f.mode,f.mode==='day'?f.day:f.mode==='quarter'?f.quarter:f.mode==='year'?f.year:f.month,{from:f.from,to:f.to});
    function finTotals(list,f){
      const t={total:0,ot:0,aux:0,hours:0,cat:{hed:0,hen:0,hedd:0,hedn:0},hrs:{hed:0,hen:0,hedd:0,hedn:0},otReg:0,otCalc:0,auxRec:0,auxEst:0,proj:0,projN:0,pendingN:0,records:0,emps:new Set(),auxCount:{breakfast:0,lunch:0,dinner:0,all:0}};
      list.forEach(rec=>{const c=finComp(rec,f);
        if(rec.grp==='pipeline'){t.proj+=c.total;t.projN++;return}
        t.records++;t.emps.add(rec.empId);if(rec.cost.status!=='ok'&&(!f.concept||f.concept==='ot'))t.pendingN++;
        t.total+=c.total;t.ot+=c.otTotal;t.aux+=c.aux;t.hours+=c.hours;PE.OT_CATS.forEach(k=>{t.cat[k]+=c.ot[k];t.hrs[k]+=c.hrs[k]});
        if(rec.origin==='registered')t.otReg+=c.otTotal;else if(rec.origin==='calculated')t.otCalc+=c.otTotal;
        if(c.aux){if(rec.aux.origin==='recognized')t.auxRec+=c.aux;else t.auxEst+=c.aux}
        if(!f.hourType&&(!f.concept||f.concept==='aux')){FOOD_KEYS.forEach(([k])=>{if(rec.aux.flags[k]){t.auxCount[k]++;t.auxCount.all++}})}
      });
      t.nEmps=t.emps.size;t.avgHour=t.hours>0?t.ot/t.hours:null;return t;
    }
    function finGroup(list,f,keyFn,nameFn,extraFn){
      const m=new Map();list.filter(r=>r.grp==='approved').forEach(rec=>{const c=finComp(rec,f),k=keyFn(rec);if(!m.has(k))m.set(k,{key:k,name:nameFn(rec),total:0,ot:0,aux:0,hours:0,n:0,emps:new Set(),cat:{hed:0,hen:0,hedd:0,hedn:0},hrs:{hed:0,hen:0,hedd:0,hedn:0},...(extraFn?extraFn(rec):{})});const g=m.get(k);g.total+=c.total;g.ot+=c.otTotal;g.aux+=c.aux;g.hours+=c.hours;g.n++;g.emps.add(rec.empId);PE.OT_CATS.forEach(x=>{g.cat[x]+=c.ot[x];g.hrs[x]+=c.hrs[x]})});
      return [...m.values()].sort((a,b)=>b.total-a.total);
    }
    function finTimeline(f,b){
      const months=b.mode==='year'?Array.from({length:12},(_,i)=>`${b.key}-${String(i+1).padStart(2,'0')}`):Array.from({length:6},(_,i)=>PE.fin.addMonths(b.to.slice(0,7),i-5));
      const base=finRecords().filter(r=>finMatch(r,f)&&r.grp==='approved');
      return months.map(ym=>{const t=finTotals(base.filter(r=>r.ym===ym),f);return {ym,label:PE.fin.monthLabel(ym),...t}});
    }
    function finModel(f){
      const b=finBounds(f);if(!b)return {error:'Define el periodo a consultar.'};const prevB=PE.fin.previousBounds(b),all=finRecords().filter(r=>finMatch(r,f)),inB=(r,x)=>x&&r.date>=x.from&&r.date<=x.to,cur=all.filter(r=>inB(r,b)),pre=all.filter(r=>inB(r,prevB));
      const T=finTotals(cur,f),P=finTotals(pre,f),today=todayISO(),inclToday=today>=b.from&&today<=b.to,ym=today.slice(0,7);
      const projBase=all.filter(r=>r.grp==='approved').map(r=>({date:r.date,total:finComp(r,f).total}));
      const projection=inclToday?PE.fin.projectMonth(projBase,ym,today,{minDays:7,minRecords:3}):{status:'not_current'};
      const budget=param('finance_monthly_budget'),monthsN=(()=>{let n=0,k=b.from.slice(0,7);while(k<=b.to.slice(0,7)){n++;k=PE.fin.addMonths(k,1)}return n})();
      const m={f,b,prevB,cur,T,P,delta:{total:PE.fin.pctChange(T.total,P.total),ot:PE.fin.pctChange(T.ot,P.ot),aux:PE.fin.pctChange(T.aux,P.aux),hours:PE.fin.pctChange(T.hours,P.hours),avg:T.avgHour!=null&&P.avgHour?PE.fin.pctChange(T.avgHour,P.avgHour):null,emps:PE.fin.pctChange(T.nEmps,P.nEmps)},
        byUnion:finGroup(cur,f,r=>r.union?.id||'none',r=>r.unionName),byEmp:finGroup(cur,f,r=>r.empId,r=>r.empName,r=>({union:r.unionName})),byDept:finGroup(cur,f,r=>r.deptId,r=>r.deptName),timeline:finTimeline(f,b),projection,budget:budget==null?null:Number(budget)*monthsN,budgetMonthly:budget,monthsN,today};
      m.alerts=finAlerts(m,all);return m;
    }
    // ---------- Alertas e inteligencia (reglas verificables; señales que requieren revisión, no irregularidades confirmadas) ----------
    function finAlerts(m,all){
      const A=[],f=m.f,thr=Number(param('finance_alert_increase_pct')||20)/100,link=r=>({rid:r.id,label:`${r.filing} · ${r.empName} · ${fmtDate(r.date)}`});
      if(m.P.total>0&&m.delta.total!=null&&m.delta.total>=thr){
        const contrib=[...PE.OT_CATS.map(k=>[PE.OT_LABEL[k],m.T.cat[k]-m.P.cat[k]]),['Auxilios de alimentación',m.T.aux-m.P.aux]].filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);
        const prevEmp=new Map(finGroup(all.filter(r=>r.date>=m.prevB.from&&r.date<=m.prevB.to),f,r=>r.empId,r=>r.empName).map(g=>[g.key,g.total])),empInc=m.byEmp.map(g=>({name:g.name,d:g.total-(prevEmp.get(g.key)||0)})).filter(x=>x.d>0).sort((a,b)=>b.d-a.d).slice(0,3);
        A.push({id:'inc',kind:'increase',severity:'review',title:`El costo aumentó ${fpct(m.delta.total)} frente a ${m.prevB.label}`,why:`El total del periodo (${fx(m.T.total)}) supera al anterior (${fx(m.P.total)}) en un porcentaje mayor o igual al umbral configurado (${Math.round(thr*100)} %).`,facts:[contrib.length?`Factores observables con mayor aumento: ${contrib.slice(0,3).map(x=>`${x[0]} (+${fx(x[1])})`).join(', ')}.`:'',empInc.length?`Mayor variación por funcionario: ${empInc.map(x=>`${x.name} (+${fx(x.d)})`).join(', ')}.`:''].filter(Boolean),evidence:m.cur.filter(r=>r.grp==='approved').sort((a,b)=>b.total-a.total).slice(0,5).map(link),action:'Revisa los registros de mayor valor y confirma que corresponden a actividades planeadas. Es una señal de variación, no una causa confirmada.'});
      }
      const dupRecs=finRecords().filter(r=>finMatch(r,{...f,status:'all'})&&r.date>=m.b.from&&r.date<=m.b.to),dups=PE.fin.findDuplicates(dupRecs.map(r=>r.req)),byId=new Map(dupRecs.map(r=>[r.id,r]));
      if(dups.length)A.push({id:'dup',kind:'duplicate',severity:'review',title:`${dups.length} posible${dups.length===1?'':'s'} solicitud${dups.length===1?'':'es'} duplicada${dups.length===1?'':'s'} o solapada${dups.length===1?'':'s'}`,why:'Dos solicitudes activas del mismo funcionario coinciden total o parcialmente en fecha y horario.',facts:dups.slice(0,5).map(d=>`${byId.get(d.a)?.filing} y ${byId.get(d.b)?.filing}${d.identical?' (idénticas)':' (se solapan)'}`),evidence:dups.flatMap(d=>[byId.get(d.a),byId.get(d.b)]).filter(Boolean).slice(0,6).map(link),action:'Verifica si una de las solicitudes debe cancelarse o ajustarse para no contabilizar dos veces las mismas horas.'});
      const emMap=finRecords().filter(r=>finMatch(r,{...f,status:'approved'})&&r.grp==='approved'&&r.date>=PE.fin.monthRange(PE.fin.addMonths(m.b.to.slice(0,7),-11)).from&&r.date<=m.b.to).reduce((mm,r)=>{const k=r.empId+'|'+r.ym,e=mm.get(k)||{key:k,empName:r.empName,ym:r.ym,value:0,ids:[]};e.value+=finComp(r,f).total;e.ids.push(r);mm.set(k,e);return mm},new Map()),emEntries=[...emMap.values()];
      const outl=PE.fin.outliers(emEntries.filter(e=>e.value>0)).filter(e=>e.ym>=m.b.from.slice(0,7)&&e.ym<=m.b.to.slice(0,7));
      if(outl.length)A.push({id:'out',kind:'outlier',severity:'review',title:`${outl.length} costo${outl.length===1?'':'s'} mensual${outl.length===1?'':'es'} por funcionario se aparta${outl.length===1?'':'n'} del patrón histórico`,why:'El costo mensual del funcionario supera ampliamente la mediana del conjunto de los últimos 12 meses (desviación absoluta mediana).',facts:outl.slice(0,4).map(e=>`${e.empName} · ${PE.fin.monthLabel(e.ym)}: ${fx(e.value)} (mediana ${fx(e.median)})`),evidence:outl.flatMap(e=>e.ids).slice(0,6).map(link),action:'Es una señal estadística: revisa si hubo una necesidad operativa puntual antes de sacar conclusiones.'});
      const pend=m.cur.filter(r=>r.grp==='approved'&&r.cost.status!=='ok');
      if(pend.length){const reasons=[...new Set(pend.flatMap(r=>r.cost.reasons||[]))];A.push({id:'pend',kind:'quality',severity:'review',title:`${pend.length} solicitud${pend.length===1?'':'es'} aprobada${pend.length===1?'':'s'} sin costo calculable`,why:'Faltan datos para calcular el costo; estas solicitudes NO están incluidas en los totales.',facts:reasons.slice(0,5),evidence:pend.slice(0,6).map(link),action:'Completa el dato faltante (salario, sindicato o regla vigente) en Funcionarios o Parámetros y luego usa «Registrar cálculos pendientes» en Reportes.'})}
      const noUnion=m.cur.filter(r=>r.grp==='approved'&&!r.union&&r.aux.count>0);
      if(noUnion.length)A.push({id:'nounion',kind:'quality',severity:'review',title:`${noUnion.length} solicitud${noUnion.length===1?'':'es'} con auxilio de funcionarios sin sindicato`,why:'El valor del auxilio depende del sindicato; sin sindicato se usan los valores generales (si existen).',facts:[...new Set(noUnion.map(r=>r.empName))].slice(0,5),evidence:noUnion.slice(0,6).map(link),action:'Asigna el sindicato en la ficha del funcionario.'});
      const auxBad=m.cur.filter(r=>r.grp==='approved'&&(r.aux.pending||['no_shift','non_working_day'].includes(r.aux.status)));
      if(auxBad.length)A.push({id:'auxbad',kind:'quality',severity:'review',title:`${auxBad.length} registro${auxBad.length===1?'':'s'} de auxilio pendiente${auxBad.length===1?'':'s'}, incompleto${auxBad.length===1?'':'s'} o inconsistente${auxBad.length===1?'':'s'}`,why:'El auxilio no tiene valor parametrizado, el funcionario no tiene turno o la fecha no hace parte de su jornada habitual (regla no definida).',facts:[...new Set(auxBad.map(r=>r.aux.pending?'Valor del auxilio sin parametrizar':AUX_STATUS_TEXT[r.aux.status]||r.aux.status))],evidence:auxBad.slice(0,6).map(link),action:'Parametriza el valor del sindicato, asigna el turno o define con el área responsable la regla para fines de semana y festivos.'});
      const est=m.cur.filter(r=>r.grp==='approved'&&r.aux.count>0&&r.aux.origin==='estimated');
      if(est.length)A.push({id:'est',kind:'info',severity:'info',title:`${est.length} solicitud${est.length===1?'':'es'} con auxilios estimados sin reconocer`,why:'Los auxilios se calculan según el turno (estimados). Los efectivamente causados se confirman con el reconocimiento.',facts:[],evidence:est.slice(0,6).map(link),action:'Reconoce los auxilios en la pestaña «Auxilios» para distinguirlos de los estimados.'});
      if(m.budgetMonthly!=null&&m.budget>0){const pctUsed=m.T.total/m.budget;if(pctUsed>=1)A.push({id:'bud',kind:'budget',severity:'review',title:`El costo ejecutado supera el presupuesto (${(pctUsed*100).toFixed(0)} %)`,why:`Ejecutado ${fx(m.T.total)} frente a un presupuesto de ${fx(m.budget)} para ${m.monthsN} mes(es).`,facts:[],evidence:[],action:'Revisa la programación de horas extras o actualiza el presupuesto en Parámetros.'});else if(m.projection.status==='ok'&&m.monthsN===1&&m.projection.linear>m.budget)A.push({id:'budp',kind:'budget',severity:'review',title:'La proyección del mes supera el presupuesto',why:`Proyección lineal ${fx(m.projection.linear)} frente al presupuesto de ${fx(m.budget)}.`,facts:[],evidence:[],action:'Es una proyección (no un costo registrado): revisa las solicitudes en trámite.'})}
      const pendLegal=m.cur.filter(r=>r.grp==='approved'&&r.cost.rule_legal_status==='pending');
      if(pendLegal.length)A.push({id:'legal',kind:'info',severity:'info',title:'Costos calculados con reglas pendientes de validación jurídica',why:`${pendLegal.length} registro(s) usan reglas laborales marcadas como «pendiente de validación».`,facts:[],evidence:[],action:'Solicita la validación del área responsable y márcala en Parámetros → Salarios y horas extras.'});
      return A;
    }
    // ---------- Componentes visuales reutilizables ----------
    const origBadge=rec=>{const c={registered:'st-validated',calculated:'st-review',projected:'st-pending',pending:'st-returned'}[rec.origin];return `<span class="status ${c}" title="${esc(rec.origin==='registered'?'Instantánea registrada al aprobar':rec.origin==='calculated'?'Calculado con las reglas vigentes en la fecha de ejecución (sin instantánea)':rec.origin==='projected'?'Solicitud en trámite: estimación, no es un costo registrado':(rec.cost.reasons||[]).join(' · '))}">${ORIGIN_LABEL[rec.origin]}</span>`};
    const deltaHTML=(d,prevLabel,prevVal,invert)=>d==null?'<span class="fin-delta is-flat">Sin base de comparación</span>':Math.abs(d)<0.0005?`<span class="fin-delta is-flat">■ Sin variación <span class="muted">vs ${esc(prevLabel)}</span></span>`:`<span class="fin-delta ${d>0?(invert?'is-down':'is-up'):d<0?(invert?'is-up':'is-down'):'is-flat'}" title="Periodo anterior (${esc(prevLabel)}): ${esc(prevVal)}">${d>0?'▲':d<0?'▼':'■'} ${fpct(d)} <span class="muted">vs ${esc(prevLabel)}</span></span>`;
    const finLegend=items=>`<ul class="fin-legend">${items.map(i=>`<li><span class="fin-sw fc-${i.key}"></span><span class="fin-lg-name">${esc(i.label)}</span>${i.value!=null?`<strong>${esc(i.value)}</strong>`:''}${i.share?`<span class="muted">${esc(i.share)}</span>`:''}</li>`).join('')}</ul>`;
    function shareRows(items,total){return `<div class="fin-shares">${items.map(i=>`<div class="fin-share"><div class="fin-share-top"><span><span class="fin-sw fc-${i.key}"></span>${esc(i.label)}</span><span><strong>${fx(i.value)}</strong> <span class="muted">${share(i.value,total)}</span></span></div><div class="fin-bar"><span class="fc-${i.key}" style="width:${total>0?Math.max(0.6,i.value/total*100):0}%"></span></div></div>`).join('')}</div>`}
    // =====================================================================================================
    // Gestión financiera · rediseño visual (prefijo fx-)
    // Lenguaje: azul profundo = identidad y horas extras · turquesa = disminución de costo · cálido (bermellón) = aumento de costo ·
    // violeta/dorado = categorías. El color nunca va solo: cada variación lleva además un glifo (▲ ▼ ■) y su porcentaje.
    // Los cálculos NO cambian: todo se construye con finModel(), finTimeline() y PayrollEngine; aquí solo se presenta.
    // Las gráficas son SVG propio (sin librerías nuevas) con un único motor para «Evolución de costos» y «Evolución mensual».
    // =====================================================================================================
    const FXR=()=>!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
    const fxEase=t=>1-Math.pow(1-t,3),fxClamp=(v,a,b)=>Math.min(b,Math.max(a,v)),fxR2=v=>Math.round(v*100)/100;
    const FX_ICON={
      coin:'<circle cx="12" cy="12" r="9"></circle><path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2 0 2.8 5.8 1.4 5.8 4.2 0 1.2-1.2 2.2-3 2.2-1.3 0-2.4-.5-3-1.5M12 6.5v1.3M12 16.2v1.3"></path>',
      clock:'<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
      utensils:'<path d="M4 3v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3M6 3v18M18 3c-2.6 1.6-3.6 4.2-3.6 7.2V14H18v7"></path>',
      users:'<circle cx="9" cy="8" r="3.5"></circle><path d="M2.5 20a6.5 6.5 0 0 1 13 0"></path><path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6"></path>',
      holiday:'<path d="M7 2v3M17 2v3M3 9h18"></path><rect x="3" y="4" width="18" height="17" rx="2"></rect><path d="m12 12.2.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2L9.1 14.3l2-.3z"></path>',
      gauge:'<path d="M4 17a8 8 0 1 1 16 0"></path><path d="m12 17 4-5"></path><circle cx="12" cy="17" r="1"></circle>',
      target:'<circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="5"></circle><circle cx="12" cy="12" r="1"></circle>',
      trend:'<path d="M3 17l6-6 4 4 8-8"></path><path d="M15 7h6v6"></path>',
      bars:'<path d="M5 20v-7M12 20V5M19 20v-10M3 20h18"></path>',
      layers:'<path d="m12 3 9 5-9 5-9-5 9-5Z"></path><path d="m3 13 9 5 9-5"></path>',
      alert:'<path d="M12 3 2 21h20L12 3Z"></path><path d="M12 9.5v4.5M12 17.5h.01"></path>',
      shield:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"></path><path d="m9 12 2 2 4-4"></path>',
      calc:'<rect x="5" y="3" width="14" height="18" rx="2"></rect><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01"></path>',
      check:'<circle cx="12" cy="12" r="9"></circle><path d="m8.5 12.5 2.5 2.5 4.5-5"></path>',
      hourglass:'<path d="M5 22h14M5 2h14"></path><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4A2 2 0 0 0 7 17.8V22"></path><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4A2 2 0 0 0 17 6.2V2"></path>',
      forward:'<path d="M5 12h14M13 6l6 6-6 6"></path>',
      info:'<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5M12 8h.01"></path>',
      up:'<path d="M12 19V5M5 12l7-7 7 7"></path>',
      down:'<path d="M12 5v14M19 12l-7 7-7-7"></path>',
      star:'<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"></path>',
      refresh:'<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"></path><path d="M21 3v5h-5"></path>',
      inbox:'<path d="M3 13h5l1.5 3h5L16 13h5"></path><path d="M5 4h14l2 9v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"></path>'
    };
    const fxI=(n,c)=>`<svg class="fx-i${c?' '+c:''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${FX_ICON[n]||FX_ICON.info}</svg>`;
    // Variación: «estable» = |Δ| < 0,5 %. Un aumento de COSTO es cálido (nunca verde); una disminución es turquesa.
    const FX_FLAT=0.005,FX_GLYPH={up:'▲',down:'▼',flat:'■',na:'·'};
    function fxVar(cur,prev){if(prev==null||!(prev>0))return {dir:'na',pct:null,abs:prev==null?null:cur-prev};const pct=(cur-prev)/prev;return {dir:Math.abs(pct)<FX_FLAT?'flat':pct>0?'up':'down',pct,abs:cur-prev}}
    const fxSigned=v=>`${v>=0?'+':'−'}${fx(Math.abs(Math.round(v)))}`;
    const fxPctShort=p=>{const a=Math.abs(p)*100,s=p>=0?'+':'−';return a>=10?`${s}${Math.round(a)}%`:`${s}${a.toFixed(1).replace('.',',')}%`};
    function fxDelta(d,prevLabel,prevVal,o={}){
      const dir=d==null?'na':Math.abs(d)<FX_FLAT?'flat':d>0?'up':'down',cls=o.neutral&&(dir==='up'||dir==='down')?'is-neu':'is-'+dir,txt=d==null?(o.short?'Sin base':'Sin base de comparación'):dir==='flat'?'Sin variación':fpct(d);
      return `<span class="fx-dl ${cls}"${prevVal!=null?` title="${esc(prevLabel)}: ${esc(prevVal)}"`:''}><i aria-hidden="true">${FX_GLYPH[dir]}</i><b>${txt}</b>${prevLabel&&d!=null?`<small>vs ${esc(prevLabel)}</small>`:''}</span>`;
    }
    // Escala «bonita»: pasos 1 · 2 · 2,5 · 5 × 10ⁿ, con 3 a 5 divisiones
    function fxScale(maxV){const raw=Math.max(1,maxV)/4,p=Math.pow(10,Math.floor(Math.log10(raw))),u=raw/p,s=(u<=1?1:u<=2?2:u<=2.5?2.5:u<=5?5:10)*p,n=Math.max(2,Math.ceil(Math.max(1,maxV)/s));return {step:s,max:s*n,ticks:Array.from({length:n+1},(_,i)=>i*s)}}
    // Curva monótona (Fritsch–Carlson): suaviza sin inventar picos ni valles que no existen en los datos
    function fxCurve(pts){
      const n=pts.length,r=v=>Math.round(v*10)/10;if(n<2)return {segs:[],full:n?`M${r(pts[0].x)},${r(pts[0].y)}`:''};
      const dx=[],m=[];for(let i=0;i<n-1;i++){dx[i]=pts[i+1].x-pts[i].x;m[i]=(pts[i+1].y-pts[i].y)/dx[i]}
      const t=[m[0]];for(let i=1;i<n-1;i++)t[i]=m[i-1]*m[i]<=0?0:(m[i-1]+m[i])/2;t[n-1]=m[n-2];
      for(let i=0;i<n-1;i++){if(m[i]===0){t[i]=t[i+1]=0}else{const a=t[i]/m[i],b=t[i+1]/m[i],s=a*a+b*b;if(s>9){const k=3/Math.sqrt(s);t[i]=k*a*m[i];t[i+1]=k*b*m[i]}}}
      const segs=[];let full=`M${r(pts[0].x)},${r(pts[0].y)}`;
      for(let i=0;i<n-1;i++){const c=`C${r(pts[i].x+dx[i]/3)},${r(pts[i].y+t[i]*dx[i]/3)} ${r(pts[i+1].x-dx[i]/3)},${r(pts[i+1].y-t[i+1]*dx[i]/3)} ${r(pts[i+1].x)},${r(pts[i+1].y)}`;segs.push(`M${r(pts[i].x)},${r(pts[i].y)}${c}`);full+=c}
      return {segs,full};
    }
    const fxRBar=(x,y,w,h,r)=>{r=Math.min(r,w/2,h);return `M${x},${y+h}V${y+r}Q${x},${y} ${x+r},${y}H${x+w-r}Q${x+w},${y} ${x+w},${y+r}V${y+h}Z`};
    // Mes anterior al primero de la ventana (dato real, solo para poder calcular la variación del primer mes)
    function fxPrevTotals(m){const first=m.timeline[0].ym,pym=PE.fin.addMonths(first,-1),base=finRecords().filter(r=>finMatch(r,m.f)&&r.grp==='approved'&&r.ym===pym);return {ym:pym,label:PE.fin.monthLong(pym),...finTotals(base,m.f)}}
    // ---------- Números que cuentan hacia su valor (coordinados con la transición de las gráficas) ----------
    const fxMem={},fxNumMem=new Map(),fxObs=new Set(),fxQueue=[];
    const FX_FMT={m:v=>fx(Math.round(v)),h:v=>`${num(v)} h`,n:v=>String(Math.round(v))};
    const fxNum=(v,k,key)=>`<span data-fxn="${fxR2(v)}" data-k="${k}" data-key="${esc(key)}">${FX_FMT[k](v)}</span>`;
    function fxAnimateNumbers(root){
      root.querySelectorAll('[data-fxn]').forEach(el=>{
        const to=Number(el.dataset.fxn),key=el.dataset.key,had=fxNumMem.has(key),from=had?fxNumMem.get(key):0,f=FX_FMT[el.dataset.k];fxNumMem.set(key,to);
        if(FXR()||from===to){el.textContent=f(to);return}
        const t0=performance.now(),dur=560,step=now=>{const p=Math.min(1,(now-t0)/dur);el.textContent=f(from+(to-from)*fxEase(p));if(p<1&&el.isConnected)requestAnimationFrame(step);else el.textContent=f(to)};requestAnimationFrame(step);
      });
    }
    function fxDispose(){fxObs.forEach(o=>o.disconnect());fxObs.clear();fxQueue.length=0}
    // ---------- Motor de gráficas ----------
    // kind 'evo'  · modo 'trend' (área + línea con tramos coloreados según variación) o 'stack' (columnas apiladas por concepto)
    // kind 'bars' · columnas estilizadas de una sola serie, con fila secundaria
    // Ambas comparten: ejes, promedio, presupuesto, periodo seleccionado, tira de variación mensual, máximos/mínimos, tooltip y teclado.
    function fxChart(host,cfg){
      const id=cfg.id,kind=cfg.kind,mode=cfg.mode||'trend',n=cfg.months.length,parts=cfg.parts||[],np=parts.length,stack=kind==='evo'&&mode==='stack',trend=kind==='evo'&&mode==='trend';
      const target=cfg.months.map((_,i)=>[cfg.values[i],...parts.map(p=>p.values[i])]);
      const mem=fxMem[id],same=!!mem&&mem.n===n&&mem.np===np&&mem.mode===mode;
      const last=cfg.last==null?n-1:cfg.last;   // los meses posteriores a «last» aún no ocurren: no se dibujan ni se comparan
      const vr=target.map((r,i)=>i>last?{dir:'none',pct:null,abs:null}:fxVar(r[0],i?target[i-1][0]:cfg.prevTotal));
      const data=target.map((r,i)=>i<=last&&r[0]>0?i:-1).filter(i=>i>=0),hasData=new Set(data);
      const avg=data.length?data.reduce((a,i)=>a+target[i][0],0)/data.length:0;
      let imax=-1,imin=-1;if(data.length){imax=data.reduce((b,i)=>target[i][0]>target[b][0]?i:b,data[0]);imin=data.reduce((b,i)=>target[i][0]<target[b][0]?i:b,data[0])}
      if(data.length<3||target[imax][0]===target[imin][0])imin=-1;
      const selIdx=cfg.months.map((x,i)=>x.ym>=cfg.sel.a&&x.ym<=cfg.sel.b?i:-1).filter(i=>i>=0),selSet=new Set(selIdx),selAll=selIdx.length===n;
      const sc=fxScale(Math.max(...target.map(r=>r[0]),cfg.budget||0,1));
      const S={vec:(same?mem.vec:target).map(r=>r.slice()),max:same?mem.max:sc.max,hot:-1,g:null,raf:0,anim:false};
      host._fx=S;fxMem[id]={vec:target.map(r=>r.slice()),max:sc.max,n,np,mode};
      host.innerHTML='<svg class="fx-svg" focusable="false" aria-hidden="true"></svg><div class="fx-tip" hidden></div><span class="lg-sr" aria-live="polite"></span>';
      const svg=host.children[0],tip=host.children[1],live=host.children[2];
      host.tabIndex=0;host.setAttribute('role','group');host.setAttribute('aria-label',`${cfg.aria}. Usa las flechas izquierda y derecha para recorrer los meses${cfg.pickable?' y Intro para ver solo uno':''}.`);
      const geom=()=>{const W=Math.max(280,Math.round(host.clientWidth||host.parentElement?.clientWidth||640)),compact=W<560,padL=compact?46:58,padR=compact?10:76,padT=kind==='bars'?40:42,plotH=compact?196:244,axisH=22,varH=compact?28:32,secH=cfg.extra&&!compact?22:0,H=padT+plotH+axisH+varH+secH+4,iw=W-padL-padR;return {W,H,compact,padL,padR,padT,plotH,axisH,varH,secH,iw,step:iw/n}};
      const mc=i=>cpVar(cpMonthIdx(cfg.months[i].ym));   // color del mes (el mismo en todas las gráficas)
      const prevLabelOf=i=>i?cfg.months[i-1].long:cfg.prevLabel;
      const paint=(vec,o={})=>{
        const g=S.g,{W,H,padL,padR,padT,plotH,step,iw,compact,axisH}=g,reveal=o.reveal==null?1:o.reveal,grow=o.grow||(()=>1),labels=o.labels!==false,max=S.max;
        const X=i=>padL+step*(i+.5),Y=v=>padT+plotH-(v/max)*plotH,base=Y(0),bw=Math.min(kind==='bars'?60:52,step*(kind==='bars'?.64:.58)),rr=v=>Math.round(v*10)/10;
        let s=`<defs><linearGradient id="${id}-ar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--fx-blue);stop-opacity:.34"/><stop offset="1" style="stop-color:var(--fx-blue);stop-opacity:0"/></linearGradient>`
          +`<linearGradient id="${id}-sh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>`
          +`<clipPath id="${id}-cl"><rect x="0" y="0" width="${reveal>=1?W:padL+iw*reveal}" height="${H}"/></clipPath></defs>`;
        if(selIdx.length&&!selAll){const a=selIdx[0],b=selIdx[selIdx.length-1];s+=`<rect class="fx-band" x="${rr(padL+step*a)}" y="${padT-10}" width="${rr(step*(b-a+1))}" height="${plotH+10}" rx="12"/>`}
        sc.ticks.forEach(t=>{const y=Y(t);if(y<padT-1)return;s+=`<line class="fx-grid${t===0?' is-base':''}" x1="${padL}" x2="${W-padR}" y1="${rr(y)}" y2="${rr(y)}"/><text class="fx-ax" x="${padL-8}" y="${rr(y+3.5)}" text-anchor="end">${t===0?'$0':shortMoney(t)}</text>`});
        const refs=[];if(avg>0&&data.length>1)refs.push({c:'fx-avg',v:avg,t:'Promedio',left:true});if(cfg.budget>0)refs.push({c:'fx-bud',v:cfg.budget,t:'Presupuesto',left:false});
        refs.sort((a,b)=>b.v-a.v);let lastY=-1e9;
        refs.forEach(l=>{const y=Y(l.v);let ly=y;if(ly-lastY<26)ly=lastY+26;lastY=ly;s+=`<line class="${l.c}" x1="${padL}" x2="${W-padR}" y1="${rr(y)}" y2="${rr(y)}"/>`;if(!compact)s+=`<text class="fx-rt ${l.c}-t" x="${W-padR+8}" y="${rr(ly-1)}" text-anchor="start">${l.t}</text><text class="fx-rt fx-rt2 ${l.c}-t" x="${W-padR+8}" y="${rr(ly+11)}" text-anchor="start">${shortMoney(l.v)}</text>`});
        s+=`<g clip-path="url(#${id}-cl)">`;
        if(trend){
          const pts=vec.slice(0,last+1).map((r,i)=>({x:X(i),y:Y(r[0])})),cv=fxCurve(pts),pe=pts[pts.length-1];
          s+=`<path class="fx-area" d="${cv.full}L${rr(pe.x)},${rr(base)}L${rr(pts[0].x)},${rr(base)}Z" style="fill:url(#${id}-ar)"/>`;
          cv.segs.forEach((d,i)=>{s+=`<path class="fx-seg fx-c-${hasData.has(i+1)||hasData.has(i)?vr[i+1].dir:'na'}" d="${d}"/>`});
          pts.forEach((p,i)=>{const v=vr[i],rel=hasData.has(i)&&v.pct!=null&&Math.abs(v.pct)>=cfg.thr;if(rel)s+=`<circle class="fx-halo fx-c-${v.dir}" cx="${rr(p.x)}" cy="${rr(p.y)}" r="10"/>`;s+=`<circle class="fx-pt fx-c-${hasData.has(i)?v.dir:'na'}${selSet.has(i)?' is-sel':''}" cx="${rr(p.x)}" cy="${rr(p.y)}" r="${selSet.has(i)?5.6:4.2}"/>`});
        }else if(stack){
          vec.forEach((r,i)=>{if(i>last)return;let acc=0;parts.forEach((p,k)=>{const v=r[k+1]*grow(i);if(v<=0)return;const y1=Y(acc+v),y0=Y(acc);s+=`<rect class="fx-p fx-k fx-k-${p.key}" style="fill:var(--fin-${p.key})" x="${rr(X(i)-bw/2)}" y="${rr(y1)}" width="${rr(bw)}" height="${rr(Math.max(.6,y0-y1))}" rx="1.5"/>`;acc+=v});if(r[0]>0)s+=`<rect class="fx-cap fx-c-${vr[i].dir}" x="${rr(X(i)-bw/2)}" y="${rr(Y(acc)-4)}" width="${rr(bw)}" height="3.5" rx="1.75"/>`});
        }else{
          vec.forEach((r,i)=>{if(i>last)return;const v=r[0]*grow(i),h=Math.max(0,base-Y(v));if(!(target[i][0]>0)){s+=`<rect class="fx-zero" x="${rr(X(i)-bw/2)}" y="${rr(base-2)}" width="${rr(bw)}" height="2" rx="1"/>`;return}const bd=fxRBar(rr(X(i)-bw/2),rr(Y(v)),rr(bw),rr(h),Math.min(8,bw/3));s+=`<g class="fx-barg${selSet.has(i)||selAll?' is-sel':''}${S.hot===i?' is-hot':S.hot>=0?' is-dim':''}" style="--bc:${mc(i)}"><path class="fx-bar" d="${bd}"/><path class="fx-sheen" d="${bd}" fill="url(#${id}-sh)"/></g>`});
        }
        s+='</g>';
        if(S.hot>=0){const i=S.hot,x=X(i);s+=`<line class="fx-guide" x1="${rr(x)}" x2="${rr(x)}" y1="${padT-6}" y2="${rr(base)}"/>`;
          if(trend&&hasData.has(i)){const y=Y(vec[i][0]);s+=`<circle class="fx-ping fx-c-${vr[i].dir}" cx="${rr(x)}" cy="${rr(y)}" r="9"/><circle class="fx-hotpt fx-c-${vr[i].dir}" cx="${rr(x)}" cy="${rr(y)}" r="7"/>`}
          else if(hasData.has(i)){const y=Y(vec[i][0]);s+=`<rect class="fx-hotbar fx-c-${vr[i].dir}"${kind==='bars'?` style="--dc:${mc(i)}"`:''} x="${rr(x-bw/2-3)}" y="${rr(y-3)}" width="${rr(bw+6)}" height="${rr(base-y+3)}" rx="8"/>`}}
        if(labels){
          const want=new Map(),add=(i,k)=>{if(hasData.has(i))want.set(i,[...(want.get(i)||[]),k])};if(selIdx.length&&selIdx.length<=3&&!selAll)selIdx.forEach(i=>add(i,'sel'));if(imax>=0)add(imax,'max');if(imin>=0)add(imin,'min');
          const items=[...want.entries()].sort((a,b)=>a[0]-b[0]).map(([i,k])=>{const txt=`${k.includes('max')?'Máx. ':k.includes('min')?'Mín. ':''}${shortMoney(target[i][0])}`,w=pdfTextW(txt,10.5,true)*1.14+18;return {i,k,txt,w,x:X(i),y:Math.max(6,Y(vec[i][0])-(trend||stack?32:30))}});
          let lastR=-1e9;items.forEach(it=>{const left=fxClamp(it.x-it.w/2,padL-8,W-padR-it.w+8);if(left<lastR+4)return;lastR=left+it.w;s+=`<g class="fx-lab ${it.k.includes('sel')?'is-sel':''} ${it.k.includes('min')?'is-min':''}" transform="translate(${rr(left)},${rr(it.y)})"><rect width="${rr(it.w)}" height="20" rx="10"/><text x="${rr(it.w/2)}" y="14" text-anchor="middle">${esc(it.txt)}</text></g><path class="fx-stem"${kind==='bars'?` style="stroke:${mc(it.i)};opacity:1"`:''} d="M${rr(it.x)},${rr(it.y+20)}V${rr(it.y+25)}"/>`});
        }
        const yAx=padT+plotH+16,skip=compact&&n>8?2:1;
        cfg.months.forEach((mo,i)=>{if(i%skip&&!selSet.has(i)&&i!==S.hot)return;const sel=selSet.has(i)&&!selAll,lbl=(compact||step<54)&&!(i===0||mo.ym.endsWith('-01'))?mo.label.split(' ')[0]:mo.label;s+=`<text class="fx-xl${sel?' is-sel':''}${i===S.hot?' is-hot':''}${i>last?' is-future':''}" x="${rr(X(i))}" y="${yAx}" text-anchor="middle">${esc(lbl)}</text>`;if(sel)s+=`<rect class="fx-xu"${kind==='bars'?` style="fill:${mc(i)}"`:''} x="${rr(X(i)-9)}" y="${yAx+5}" width="18" height="3" rx="1.5"/>`});
        const yv=padT+plotH+axisH+4,ph=g.varH-10;
        cfg.months.forEach((mo,i)=>{if(i>last)return;const v=vr[i],dir=(hasData.has(i)||v.dir==='down')?v.dir:'na',w=Math.min(56,step-4),wide=w>=40,pw=wide?w:18,x=X(i)-pw/2;
          s+=`<g class="fx-vp fx-c-${dir}${i===S.hot?' is-hot':''}"><rect x="${rr(x)}" y="${yv}" width="${rr(pw)}" height="${ph}" rx="${ph/2}"/><text x="${rr(X(i))}" y="${yv+ph/2+3.6}" text-anchor="middle">${FX_GLYPH[dir]}${wide&&v.pct!=null&&dir!=='na'&&dir!=='flat'?' '+fxPctShort(v.pct):''}</text></g>`});
        if(g.secH){const ys=yv+ph+17;s+=`<text class="fx-ax fx-sec-l" x="${padL-8}" y="${ys}" text-anchor="end">${esc(cfg.extraLabel||'')}</text>`;cfg.months.forEach((mo,i)=>{if(i>last)return;s+=`<text class="fx-ax fx-sec${i===S.hot?' is-hot':''}" x="${rr(X(i))}" y="${ys}" text-anchor="middle">${esc(cfg.extra[i].short)}</text>`})}
        svg.innerHTML=s;
      };
      const tipHTML=i=>{
        const mo=cfg.months[i],v=vr[i],r=target[i],pl=prevLabelOf(i),isSel=selSet.has(i)&&!selAll,tot=r[0],dir=v.dir;
        const vs=fxVar(tot,avg),line=dir==='na'?`<div class="fx-tip-var is-na">${FX_GLYPH.na} Sin base de comparación (${esc(pl)} sin costo)</div>`:dir==='flat'?`<div class="fx-tip-var is-flat">${FX_GLYPH.flat} Sin variación <small>vs ${esc(pl)} (±0,5 %)</small></div>`:`<div class="fx-tip-var is-${dir}">${FX_GLYPH[dir]} ${fxSigned(v.abs)} · ${fpct(v.pct)} <small>vs ${esc(pl)}</small></div>`;
        const rows=parts.map((p,k)=>({p,v:r[k+1]})).filter(x=>x.v>0).map(x=>`<li><span class="fin-sw fc-${x.p.key}"></span><span>${esc(x.p.label)}</span><b>${fx(Math.round(x.v))}</b><small>${share(x.v,tot)}</small></li>`).join('');
        const ex=(cfg.extra&&cfg.extra[i].rows||[]).map(([k,val])=>`<li class="is-x"><span></span><span>${esc(k)}</span><b>${esc(val)}</b></li>`).join('');
        return `<div class="fx-tip-h"><b>${kind==='bars'?`<span class="fx-dot fx-dot--ring" style="--bc:${mc(i)}"></span>`:''}${esc(mo.long)}</b>${isSel?'<em>Periodo seleccionado</em>':''}</div>${tot>0?`<div class="fx-tip-big">${fx(Math.round(tot))}</div>`:'<div class="fx-tip-none">Sin costo aprobado en este mes</div>'}${line}${tot>0&&avg>0&&data.length>1&&vs.pct!=null?`<div class="fx-tip-vs">vs promedio del rango (${fx(Math.round(avg))}): <b class="is-${vs.dir}">${vs.dir==='flat'?'sin variación':fpct(vs.pct)}</b></div>`:''}${rows||ex?`<ul class="fx-tip-rows">${rows}${ex}</ul>`:''}${cfg.pickable&&cfg.pickable(mo.ym)&&!(selIdx.length===1&&selIdx[0]===i)?'<div class="fx-tip-hint">Clic o Intro para ver solo este mes</div>':''}`;
      };
      const placeTip=()=>{
        if(S.hot<0){tip.classList.remove('is-in');setTimeout(()=>{if(S.hot<0)tip.hidden=true},120);return}
        const first=tip.hidden;tip.hidden=false;tip.innerHTML=tipHTML(S.hot);const {W,padL,step,padT,plotH}=S.g,x=padL+step*(S.hot+.5),w=tip.offsetWidth,h=tip.offsetHeight,y0=padT+plotH-(S.vec[S.hot][0]/S.max)*plotH;
        let left=x+18;if(left+w>W-4)left=x-18-w;left=fxClamp(left,4,Math.max(4,W-w-4));const top=fxClamp(y0-h/2,4,Math.max(4,S.g.H-h-8));
        if(first){tip.style.transition='none';tip.style.transform=`translate(${left}px,${top+8}px)`;void tip.offsetWidth;tip.style.transition=''}
        tip.style.transform=`translate(${left}px,${top}px)`;tip.classList.add('is-in');
        const v=vr[S.hot];live.textContent=`${cfg.months[S.hot].long}: ${fx(Math.round(target[S.hot][0]))}${v.pct!=null?`, ${v.dir==='up'?'aumento':v.dir==='down'?'disminución':'sin variación'} ${fpct(v.pct)} frente a ${prevLabelOf(S.hot)}`:''}`;
      };
      const redraw=()=>{if(!S.anim)paint(S.vec,{})};
      const setHot=i=>{if(i===S.hot)return;S.hot=i;redraw();placeTip()};
      const pick=i=>{const mo=cfg.months[i];if(!cfg.pickable||!cfg.pickable(mo.ym)||(selIdx.length===1&&selIdx[0]===i))return;cfg.onPick(mo.ym)};
      const idxAt=ev=>{const r=svg.getBoundingClientRect(),i=Math.floor((ev.clientX-r.left-S.g.padL)/S.g.step);return i>=0&&i<=last?i:-1};
      host.addEventListener('pointermove',ev=>{if(ev.pointerType==='touch')return;setHot(idxAt(ev))});
      host.addEventListener('pointerleave',()=>{if(document.activeElement!==host)setHot(-1)});
      host.addEventListener('click',ev=>{const i=idxAt(ev);if(i<0)return;if(ev.pointerType==='touch'&&S.hot!==i){setHot(i);return}pick(i)});
      host.addEventListener('pointerup',ev=>{if(ev.pointerType==='touch'){const i=idxAt(ev);if(i>=0&&S.hot!==i){ev.preventDefault();setHot(i)}}});
      host.addEventListener('focus',()=>{if(S.hot<0)setHot(Math.min(last,selIdx.length?selIdx[selIdx.length-1]:last))});
      host.addEventListener('blur',()=>setHot(-1));
      host.addEventListener('keydown',ev=>{let i=S.hot<0?Math.min(last,selIdx.length?selIdx[selIdx.length-1]:last):S.hot;
        if(ev.key==='ArrowRight')i=Math.min(last,i+1);else if(ev.key==='ArrowLeft')i=Math.max(0,i-1);else if(ev.key==='Home')i=0;else if(ev.key==='End')i=last;
        else if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();pick(i);return}else if(ev.key==='Escape'){setHot(-1);return}else return;
        ev.preventDefault();setHot(i)});
      const dims=()=>{svg.setAttribute('viewBox',`0 0 ${S.g.W} ${S.g.H}`);svg.setAttribute('width',S.g.W);svg.setAttribute('height',S.g.H);host.style.minHeight=S.g.H+'px'};
      S.g=geom();dims();
      const ro=new ResizeObserver(()=>{const w=Math.round(host.clientWidth);if(!host.isConnected||!w||(S.g&&Math.abs(w-S.g.W)<=6))return;cancelAnimationFrame(S.raf);S.anim=false;S.g=geom();dims();S.vec=target.map(r=>r.slice());S.max=sc.max;paint(S.vec,{});if(S.hot>=0)placeTip()});ro.observe(host);fxObs.add(ro);
      if(FXR()){S.vec=target.map(r=>r.slice());S.max=sc.max;paint(S.vec,{});return S}
      const dur=same?400:(trend?1050:780),from=S.vec.map(r=>r.slice()),fmax=S.max,t0=performance.now();S.anim=true;
      const step=now=>{if(!host.isConnected)return;const p=Math.min(1,(now-t0)/dur),e=fxEase(p);
        if(same){S.vec=target.map((r,i)=>r.map((v,j)=>from[i][j]+(v-from[i][j])*e));S.max=fmax+(sc.max-fmax)*e;paint(S.vec,{labels:p>=.8})}
        else{S.vec=target.map(r=>r.slice());S.max=sc.max;paint(S.vec,{reveal:trend?e:1,grow:trend?null:(i=>fxEase(fxClamp(p*1.45-i/n*.45,0,1))),labels:p>=1})}
        if(p<1)S.raf=requestAnimationFrame(step);else{S.anim=false;S.vec=target.map(r=>r.slice());S.max=sc.max;paint(S.vec,{})}};
      S.raf=requestAnimationFrame(step);return S;
    }
    // ---------- Piezas visuales ----------
    function fxDonut(segs,total){
      let acc=0;const arcs=segs.map(s=>{const p=total>0?s.value/total*100:0,len=Math.max(0,p-(segs.length>1?.9:0)),el=`<circle class="fx-arc fx-k fx-k-${s.key}" cx="60" cy="60" r="44" pathLength="100" stroke-dasharray="${len} ${100-len}" stroke-dashoffset="${-acc}" transform="rotate(-90 60 60)" style="stroke:var(--fin-${s.key})" data-emph="${s.key}"><title>${esc(s.label)}: ${esc(fx(s.value))} (${share(s.value,total)})</title></circle>`;acc+=p;return el}).join('');
      return `<svg class="fx-donut" viewBox="0 0 120 120" role="img" aria-label="Distribución del costo por concepto"><circle class="fx-donut-bg" cx="60" cy="60" r="44"/>${arcs}<text class="fx-donut-v" x="60" y="58" text-anchor="middle">${shortMoney(total)}</text><text class="fx-donut-l" x="60" y="74" text-anchor="middle">total</text></svg>`;
    }
    function fxRing(pctv,key){const p=fxClamp(pctv*100,0,100);return `<svg class="fx-ring" viewBox="0 0 64 64" role="img" aria-label="${p.toFixed(1).replace('.',',')} %"><circle class="fx-ring-bg" cx="32" cy="32" r="25"/><circle class="fx-ring-fg" cx="32" cy="32" r="25" pathLength="100" stroke-dasharray="${p} ${100-p}" transform="rotate(-90 32 32)" style="stroke:var(--fin-${key})"/><text x="32" y="36" text-anchor="middle">${Math.round(p)}%</text></svg>`}
    const fxEmphAttr=k=>`data-emph="${k}" tabindex="0"`;
    function fxLegendConcepts(items,withVal){return `<ul class="fx-lg">${items.map(i=>`<li class="fx-k fx-k-${i.key}" ${fxEmphAttr(i.key)}><span class="fin-sw fc-${i.key}"></span><span class="fx-lg-n">${esc(i.label)}</span>${withVal&&i.value!=null?`<b>${esc(i.value)}</b>`:''}${withVal&&i.share?`<small>${esc(i.share)}</small>`:''}</li>`).join('')}</ul>`}
    function fxFacts(months,values,prevTotal,prevLabel){
      const vr=values.map((v,i)=>({...fxVar(v,i?values[i-1]:prevTotal),i,v})),data=values.map((v,i)=>v>0?i:-1).filter(i=>i>=0);
      if(!data.length)return '';
      const mx=data.reduce((b,i)=>values[i]>values[b]?i:b,data[0]),mn=data.reduce((b,i)=>values[i]<values[b]?i:b,data[0]),ups=vr.filter(x=>x.dir==='up'),downs=vr.filter(x=>x.dir==='down'),flats=vr.filter(x=>x.dir==='flat'),avg=data.reduce((a,i)=>a+values[i],0)/data.length;
      const bu=ups.sort((a,b)=>b.abs-a.abs)[0],bd=downs.sort((a,b)=>a.abs-b.abs)[0],F=(cls,ico,k,main,sub)=>`<li class="fx-fact ${cls}"><span class="fx-fi">${fxI(ico)}</span><div><small>${k}</small><b>${main}</b>${sub?`<span>${sub}</span>`:''}</div></li>`;
      return `<ul class="fx-facts" aria-label="Lectura rápida del rango">${data.length>1?F('is-hi','up','Mes más alto',esc(months[mx].long),fx(Math.round(values[mx]))):''}${data.length>2&&values[mn]!==values[mx]?F('is-lo','down','Mes más bajo',esc(months[mn].long),fx(Math.round(values[mn]))):''}`
        +F('is-up','star','Mayor aumento',bu?esc(months[bu.i].long):'Ninguno',bu?`${fxSigned(bu.abs)} · ${fpct(bu.pct)}`:'Sin aumentos en el rango')+F('is-down','down','Mayor disminución',bd?esc(months[bd.i].long):'Ninguna',bd?`${fxSigned(bd.abs)} · ${fpct(bd.pct)}`:'Sin disminuciones en el rango')
        +`<li class="fx-fact is-bal"><span class="fx-fi">${fxI('layers')}</span><div><small>Balance de variaciones</small><b class="fx-bal"><span class="is-up">▲ ${ups.length}</span><span class="is-down">▼ ${downs.length}</span><span class="is-flat">■ ${flats.length}</span></b><span>Promedio mensual ${fx(Math.round(avg))}</span></div></li></ul>`;
    }
    const fxLast=tl=>{const t=todayISO().slice(0,7);let l=-1;tl.forEach((x,i)=>{if(x.ym<=t)l=i});return Math.max(0,l)};
    function fxPick(ym){const f=state.fin.f;f.mode='month';f.month=ym;state.fin.tables={};renderFinance()}
    const fxSel=m=>({a:m.b.from.slice(0,7),b:m.b.to.slice(0,7)});
    function fxMonthsOf(tl){return tl.map(x=>({ym:x.ym,label:x.label,long:PE.fin.monthLong(x.ym)}))}
    const fxHead=(ico,title,sub,right)=>`<header class="fx-ph"><span class="fx-pi">${fxI(ico)}</span><div class="fx-pt"><h3>${title}</h3>${sub?`<span class="fx-ps">${sub}</span>`:''}</div>${right||''}</header>`;
    const fxDirLegend=(m,showSel)=>`<ul class="fx-lg fx-lg--dir" aria-label="Cómo leer la gráfica"><li><span class="fx-sym is-up">▲</span>Aumento del costo</li><li><span class="fx-sym is-down">▼</span>Disminución</li><li><span class="fx-sym is-flat">■</span>Estable (±0,5 %)</li><li><span class="fx-line-s"></span>Promedio</li>${m.budgetMonthly>0?'<li><span class="fx-line-s is-bud"></span>Presupuesto</li>':''}${showSel?'<li><span class="fx-band-s"></span>Periodo seleccionado</li>':''}</ul>`;
    // ---------- Panel «Evolución de costos» ----------
    function fxEvoPanel(m){
      const tl=m.timeline,last=fxLast(tl),mode=state.fin.evoMode==='stack'?'stack':'trend',months=fxMonthsOf(tl),prev=fxPrevTotals(m),sel=fxSel(m),okMonths=new Set(finOptions().months),selAll=months.every(x=>x.ym>=sel.a&&x.ym<=sel.b);
      fxQueue.push(()=>{const h=document.getElementById('fxEvo');if(h)fxChart(h,{id:'fxEvo',kind:'evo',mode,months,values:tl.map(x=>x.total),parts:FIN_CONCEPTS.map(([k,l])=>({key:k,label:l,values:tl.map(x=>k==='aux'?x.aux:x.cat[k])})),prevTotal:prev.total,prevLabel:prev.label,last,sel,budget:m.budgetMonthly>0?Number(m.budgetMonthly):0,thr:Number(param('finance_alert_increase_pct')||20)/100,aria:`Evolución del costo total por mes, ${months[0].long} a ${months[months.length-1].long}`,pickable:ym=>okMonths.has(ym),onPick:fxPick})});
      const seg=`<div class="fx-seg2" role="radiogroup" aria-label="Vista de la gráfica"><button type="button" role="radio" aria-checked="${mode==='trend'}" data-fxmode="trend">${fxI('trend')}Tendencia</button><button type="button" role="radio" aria-checked="${mode==='stack'}" data-fxmode="stack">${fxI('layers')}Composición</button></div>`;
      return `<section class="fin-panel fx-panel fx-panel--evo" aria-labelledby="fxEvoT" data-r>${fxHead('trend','<span id="fxEvoT">Evolución de costos</span>',`${m.f.mode==='year'?'Los 12 meses del año':'Los 6 meses hasta el fin del periodo'} · COP · clic en un mes para verlo solo`,seg)}
        ${mode==='trend'?fxDirLegend(m,!selAll):fxLegendConcepts(FIN_CONCEPTS.map(([k,l])=>({key:k,label:l})))+`<ul class="fx-lg fx-lg--dir"><li><span class="fx-sym is-up">▲</span>Aumento</li><li><span class="fx-sym is-down">▼</span>Disminución</li><li><span class="fx-sym is-flat">■</span>Estable</li><li><span class="fx-line-s"></span>Promedio</li>${m.budgetMonthly>0?'<li><span class="fx-line-s is-bud"></span>Presupuesto</li>':''}</ul>`}
        <div class="fx-host" id="fxEvo" data-kind="evo"></div><p class="fx-note">La franja inferior muestra la variación de cada mes frente al mes anterior${last<months.length-1?'; los meses que aún no ocurren no se dibujan ni se comparan':''}. ${mode==='trend'?'La línea cambia de color según el tramo: cálido si el costo subió, turquesa si bajó.':'Cada columna suma el costo de los cinco conceptos.'}</p>
        ${fxFacts(months.slice(0,last+1),tl.slice(0,last+1).map(x=>x.total),prev.total,prev.label)}
        <details class="fin-data"><summary>Ver datos del gráfico</summary><div class="table-wrap"><table><thead><tr><th>Mes</th>${FIN_CONCEPTS.map(([,l])=>`<th class="num">${esc(l)}</th>`).join('')}<th class="num">Total</th><th class="num">Variación</th></tr></thead><tbody>${tl.map((x,i)=>{const v=i>last?{pct:null,dir:'none'}:fxVar(x.total,i?tl[i-1].total:prev.total);return `<tr><td>${esc(x.label)}${i>last?' <small class="muted">(aún sin datos)</small>':''}</td>${FIN_CONCEPTS.map(([k])=>`<td class="num">${fx(k==='aux'?x.aux:x.cat[k])}</td>`).join('')}<td class="num"><strong>${fx(x.total)}</strong></td><td class="num">${v.pct==null?'—':`${FX_GLYPH[v.dir]} ${fpct(v.pct)}`}</td></tr>`}).join('')}</tbody></table></div></details></section>`;
    }
    // ---------- Panel «Evolución mensual» (columnas) ----------
    function fxMonthlyPanel(m,o){
      const tl=m.timeline,last=fxLast(tl),months=fxMonthsOf(tl),sel=fxSel(m),okMonths=new Set(finOptions().months),values=tl.map(x=>x[o.field]),prevT=fxPrevTotals(m),prevV=prevT[o.field];
      fxQueue.push(()=>{const h=document.getElementById(o.id);if(h)fxChart(h,{id:o.id,kind:'bars',mode:'bars',barKey:o.barKey,months,values,prevTotal:prevV,prevLabel:prevT.label,last,sel,budget:0,thr:Number(param('finance_alert_increase_pct')||20)/100,extraLabel:o.secLabel,extra:tl.map((x,i)=>({short:o.sec(x).short,rows:o.sec(x).rows})),aria:o.aria,pickable:ym=>okMonths.has(ym),onPick:fxPick})});
      const selAll=months.every(x=>x.ym>=sel.a&&x.ym<=sel.b);
      return `<section class="fin-panel fx-panel fx-panel--bars fx-wide" aria-labelledby="${o.id}T" data-r>${fxHead(o.icon,`<span id="${o.id}T">Evolución mensual</span>`,`${o.sub} · ${m.f.mode==='year'?'12 meses del año':'6 meses hasta el fin del periodo'} · clic en un mes para verlo solo`)}
        <ul class="fx-lg fx-lg--dir" aria-label="Cómo leer la gráfica"><li><span class="fx-sym is-up">▲</span>Aumento del costo</li><li><span class="fx-sym is-down">▼</span>Disminución</li><li><span class="fx-sym is-flat">■</span>Estable (±0,5 %)</li><li><span class="fx-line-s"></span>Promedio</li>${selAll?'':'<li><span class="fx-band-s"></span>Periodo seleccionado (columna intensa)</li>'}<li><span class="fx-mdots" aria-hidden="true"><i style="--bc:var(--cp-1)"></i><i style="--bc:var(--cp-5)"></i><i style="--bc:var(--cp-9)"></i></span>Cada mes conserva su color</li></ul>
        <div class="fx-host" id="${o.id}" data-kind="bars"></div><p class="fx-note">La franja inferior muestra la variación frente al mes anterior; debajo, ${esc(o.secNote)}.</p>
        ${fxFacts(months.slice(0,last+1),values.slice(0,last+1),prevV,prevT.label)}
        <details class="fin-data"><summary>Ver datos del gráfico</summary><div class="table-wrap"><table><thead><tr><th>Mes</th><th class="num">${esc(o.secHead)}</th><th class="num">Costo</th><th class="num">Variación</th></tr></thead><tbody>${tl.map((x,i)=>{const v=i>last?{pct:null,dir:'none'}:fxVar(values[i],i?values[i-1]:prevV);return `<tr><td><span class="fx-dot" style="--bc:${cpVar(cpMonthIdx(x.ym))}"></span>${esc(PE.fin.monthLong(x.ym))}${i>last?' <small class="muted">(aún sin datos)</small>':''}</td><td class="num">${esc(o.sec(x).cell)}</td><td class="num"><strong>${fx(values[i])}</strong></td><td class="num">${v.pct==null?'—':`${FX_GLYPH[v.dir]} ${fpct(v.pct)}`}</td></tr>`}).join('')}</tbody></table></div></details></section>`;
    }
    // ---------- Pestaña: Resumen ejecutivo ----------
    function fxCard(cls,ico,label,body,o={}){return `<article class="fx-card ${cls}" data-r style="--d:${o.d||0}"${o.emph?` ${fxEmphAttr(o.emph)}`:''}><header><span class="fx-ci">${fxI(ico)}</span><h4>${label}</h4>${o.tag?`<span class="fx-tag">${o.tag}</span>`:''}</header>${body}</article>`}
    function finSummary(m){
      const T=m.T,P=m.P,f=m.f;
      if(!T.records&&!T.projN)return fxEmpty('Sin registros para el periodo y los filtros seleccionados','Cambia el periodo o limpia los filtros. El módulo solo muestra solicitudes aprobadas (y, si lo eliges, en trámite).');
      const segs=FIN_CONCEPTS.map(([k,l])=>({key:k,label:l,value:k==='aux'?T.aux:T.cat[k]})).filter(s=>s.value>0),dom=T.cat.hedd+T.cat.hedn,proj=m.projection,tl=m.timeline,pl=m.prevB.label;
      const otHrs=PE.OT_CATS.filter(k=>T.hrs[k]>0);
      const projCard=proj.status==='ok'?`<div class="fx-val">${fxNum(proj.linear,'m','proj')}</div><div class="fx-track" role="img" aria-label="Transcurrieron ${proj.elapsed} de ${proj.days} días del mes"><i style="--w:${(proj.elapsed/proj.days*100).toFixed(1)}%"></i></div><p class="fx-sub">Proyección lineal con ${proj.elapsed} de ${proj.days} días${proj.trailing?` · promedio de 3 meses ${fx(proj.trailing)}`:''}</p>`
        :`<div class="fx-val is-na">${proj.status==='insufficient'?'Datos insuficientes':'No aplica'}</div><p class="fx-sub">${esc(proj.reason||'El periodo no incluye el mes en curso')}</p>`;
      const used=m.budgetMonthly!=null&&m.budget>0?T.total/m.budget:null;
      const budCard=m.budgetMonthly==null?`<div class="fx-val is-na">Sin presupuesto</div><p class="fx-sub">Configúralo en Parámetros para comparar el costo ejecutado.</p>`:`<div class="fx-val">${share(T.total,m.budget)}<small> ejecutado</small></div><div class="fx-track fx-track--bud${used>=1?' is-over':''}" role="img" aria-label="${(used*100).toFixed(0)} % del presupuesto"><i style="--w:${Math.min(100,used*100).toFixed(1)}%"></i><b style="left:100%"></b></div><p class="fx-sub">${fx(T.total)} de ${fx(m.budget)} · mensual ${fx(m.budgetMonthly)}</p>`;
      const meals=FOOD_KEYS.map(([k,l,n])=>`<span class="fx-meal${T.auxCount[k]?' on':''}" title="${n}: ${T.auxCount[k]}"><b>${l}</b><i>${T.auxCount[k]}</i></span>`).join('');
      const orig=[['registered','shield','Horas extras · registrado','Instantánea guardada al aprobar',T.otReg,'hed'],['calculated','calc','Horas extras · calculado','Con las reglas vigentes en la fecha',T.otCalc,'hedd'],['recognized','check','Auxilios · reconocidos','Cantidad confirmada',T.auxRec,'aux'],['estimated','hourglass','Auxilios · estimados','Calculados según el turno',T.auxEst,'hen']];
      return `<section class="fx-pulse" aria-label="Resumen del periodo">
        <article class="fx-hero" data-r aria-labelledby="finHeroT"><div class="fx-hero-top"><span class="fx-eyebrow">${fxI('coin')}Costo total · ${esc(m.b.label)} · COP</span></div>
          <div class="fx-big" id="finHeroT">${fxNum(T.total,'m','total')}</div>
          <div class="fx-hero-row">${fxDelta(m.delta.total,pl,fx(P.total))}<span class="fx-hero-cmp">${esc(pl)}: <b>${fx(P.total)}</b></span></div>
          <div class="fx-ribbon" role="img" aria-label="Composición del costo por concepto">${segs.map(s=>`<span class="fx-rs fx-k fx-k-${s.key}" style="flex:${T.total>0?s.value/T.total*100:0} 1 0;background:var(--fin-${s.key})" title="${esc(s.label)}: ${esc(fx(s.value))}"></span>`).join('')}</div>
          ${fxLegendConcepts(segs.map(s=>({...s,value:fx(s.value),share:share(s.value,T.total)})),true)}</article>
        <div class="fx-cards">
          ${fxCard('fx-card--ot','clock','Horas extras',`<div class="fx-val">${fxNum(T.ot,'m','ot')}</div>${fxDelta(m.delta.ot,pl,fx(P.ot),{short:true})}<dl class="fx-mini"><div><dt>Horas registradas</dt><dd>${fxNum(T.hours,'h','hrs')}</dd>${fxDelta(m.delta.hours,pl,`${num(P.hours)} h`,{short:true})}</div><div><dt>Costo promedio por hora</dt><dd>${T.avgHour!=null?fx(Math.round(T.avgHour)):'—'}</dd>${fxDelta(m.delta.avg,pl,P.avgHour!=null?fx(Math.round(P.avgHour)):'—',{short:true})}</div></dl><div class="fx-hbar" role="img" aria-label="Horas por clasificación">${otHrs.map(k=>`<span class="fx-k fx-k-${k}" style="flex:${T.hrs[k]} 1 0;background:var(--fin-${k})" title="${esc(PE.OT_LABEL[k])}: ${num(T.hrs[k])} h"></span>`).join('')}</div>`,{emph:'ot',d:1})}
          ${fxCard('fx-card--aux','utensils','Auxilios de alimentación',`<div class="fx-val">${fxNum(T.aux,'m','aux')}</div>${fxDelta(m.delta.aux,pl,fx(P.aux),{short:true})}<div class="fx-meals" role="group" aria-label="Auxilios por tipo">${meals}</div><p class="fx-sub">${T.auxCount.all} auxilio${T.auxCount.all===1?'':'s'} · D desayuno · A almuerzo · C comida</p>`,{emph:'aux',d:2})}
          ${fxCard('fx-card--emp','users','Funcionarios incluidos',`<div class="fx-val">${fxNum(T.nEmps,'n','emps')}</div>${fxDelta(m.delta.emps,pl,String(P.nEmps),{neutral:true,short:true})}<p class="fx-sub">${T.records} registro${T.records===1?'':'s'} aprobado${T.records===1?'':'s'} en el periodo</p>`,{d:3})}
          ${fxCard('fx-card--dom','holiday','Dominicales y festivos',`<div class="fx-dom">${fxRing(T.ot>0?dom/T.ot:0,'hedd')}<div><div class="fx-val">${fxNum(dom,'m','dom')}</div><p class="fx-sub">${share(dom,T.ot)} de las horas extras</p></div></div>`,{d:4})}
          ${fxCard('fx-card--proj','gauge','Proyección del mes',projCard,{tag:'Proyectado',d:5})}
          ${fxCard('fx-card--bud','target','Presupuesto',budCard,{d:6})}
          <p class="fx-cards-note">Las variaciones comparan con ${esc(pl)}; el detalle aparece al pasar el cursor sobre cada pastilla.</p>
        </div></section>
        <section class="fx-quality" aria-label="Origen del costo" data-r style="--d:7"><header class="fx-qh"><h3>${fxI('shield')}Origen del costo</h3><span>Qué parte del total está registrada, calculada, reconocida o estimada</span></header>
          <div class="fx-qbar" role="img" aria-label="Origen del costo total">${orig.filter(o=>o[4]>0).map(o=>`<span style="flex:${o[4]} 1 0;--c:var(--fin-${o[5]})" title="${esc(o[2])}: ${esc(fx(o[4]))}"></span>`).join('')}</div>
          <ul class="fx-qlist">${orig.map(o=>`<li><span class="fx-qi" style="--c:var(--fin-${o[5]})">${fxI(o[1])}</span><div><small>${o[2]}</small><b>${fx(o[4])}</b><span>${o[3]}</span></div></li>`).join('')}<li class="is-proj"><span class="fx-qi">${fxI('forward')}</span><div><small>En trámite · proyectado</small><b>${fx(T.proj)}</b><span>${T.projN} solicitud${T.projN===1?'':'es'} · no incluido en el total</span></div></li></ul></section>
        <div class="fin-grid2 fx-row">${fxEvoPanel(m)}<div class="fx-col">
          <section class="fin-panel fx-panel" data-r style="--d:2">${fxHead('layers','Distribución por concepto','Participación en el costo total')}<div class="fx-dist">${fxDonut(segs,T.total)}<ul class="fx-dlist">${segs.map(s=>`<li class="fx-k fx-k-${s.key}" ${fxEmphAttr(s.key)}><span class="fin-sw fc-${s.key}"></span><span class="fx-dn">${esc(s.label)}</span><b>${fx(s.value)}</b><small>${share(s.value,T.total)}</small><span class="fx-db"><i style="--w:${T.total>0?Math.max(.6,s.value/T.total*100):0}%;background:var(--fin-${s.key})"></i></span></li>`).join('')}</ul></div></section>
          <section class="fin-panel fx-panel" data-r style="--d:3">${fxHead('star','Mayores costos por funcionario','Top 5 del periodo')}${m.byEmp.length?`<ol class="fin-rank fx-rank">${m.byEmp.slice(0,5).map((g,i)=>`<li style="--bc:${cpVar(i)}"><span class="fin-rank-n">${i+1}</span><span class="fin-rank-name">${esc(g.name)}<span class="small muted">${esc(g.union)} · ${num(g.hours)} h</span></span><strong>${fx(g.total)}</strong><span class="muted">${share(g.total,T.total)}</span><span class="fx-rb"><i style="--w:${T.total>0?Math.max(1,g.total/T.total*100):0}%"></i></span></li>`).join('')}</ol>`:'<div class="fin-empty"><span>Sin datos.</span></div>'}</section></div></div>
        <section class="fin-panel fx-panel" data-r>${fxHead('users','Comparativo por sindicato',esc(m.b.label))}${finUnionTable(m)}</section>
        <section class="fin-panel fx-panel" data-r>${fxHead('calc','Detalle de registros','Ordena, busca y abre el cálculo de cada registro')}${finDetailTable(m)}</section>`;
    }
    function fxEmpty(title,msg){return `<div class="fx-empty" role="status"><span class="fx-ei">${fxI('inbox')}</span><strong>${esc(title)}</strong><span>${esc(msg)}</span></div>`}
    function finUnionTable(m){
      if(!m.byUnion.length)return '<div class="fin-empty"><span>Sin datos.</span></div>';
      return `<div class="table-wrap"><table class="fin-tbl"><thead><tr><th>Sindicato</th><th class="num">Funcionarios</th><th class="num">Horas</th><th class="num">Horas extras</th><th class="num">Auxilios</th><th class="num">Total</th><th class="num">% del total</th></tr></thead><tbody>${m.byUnion.map((g,gi)=>`<tr style="--bc:${cpVar(gi)}"><td><span class="fx-dot"></span><strong>${esc(g.name)}</strong></td><td class="num">${g.emps.size}</td><td class="num">${num(g.hours)}</td><td class="num">${fx(g.ot)}</td><td class="num">${fx(g.aux)}</td><td class="num"><strong>${fx(g.total)}</strong></td><td class="num"><span class="fx-sh"><span class="fx-sh-b"><i style="--w:${m.T.total>0?Math.max(1,g.total/m.T.total*100):0}%"></i></span>${share(g.total,m.T.total)}</span></td></tr>`).join('')}</tbody></table></div>`;
    }
    function finSkeleton(){return `<div class="fx-skel" aria-busy="true" aria-label="Cargando gestión financiera"><div class="fx-sk-row"><span class="fx-sk big"></span><div class="fx-sk-grid">${'<span class="fx-sk"></span>'.repeat(6)}</div></div><span class="fx-sk wide"></span><div class="fx-sk-row two"><span class="fx-sk tall"></span><span class="fx-sk tall"></span></div></div>`}
    function fxErrorView(err){return `<div class="fx-empty is-error" role="alert"><span class="fx-ei">${fxI('alert')}</span><strong>No fue posible mostrar el análisis</strong><span>${esc(err?.message||'Ocurrió un error inesperado.')}</span><button type="button" class="btn btn-secondary btn-toolbar" data-fin="retry">${fxI('refresh')} Reintentar</button></div>`}

    // ---------- Tabla profesional: ordenable, con búsqueda, paginación, subtotal de página y total ----------
    const finTbl={};
    function finTableHTML(id,def){
      finTbl[id]=def;const st=state.fin.tables[id]||(state.fin.tables[id]={sort:def.sort||null,dir:def.dir||'desc',page:1,q:''});
      return `<div class="fin-table" data-tbl="${id}"><div class="fin-table-tools">${def.search?`<div class="search-box"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg><input class="control fin-q" data-tbl="${id}" placeholder="Buscar en la tabla" aria-label="Buscar en la tabla" value="${esc(st.q)}"></div>`:'<span></span>'}<span class="small muted fin-count"></span></div><div class="fin-table-body"></div></div>`;
    }
    function finTableRender(id){
      const def=finTbl[id],box=$(`.fin-table[data-tbl="${id}"] .fin-table-body`);if(!def||!box)return;const st=state.fin.tables[id];let rows=def.rows;
      if(st.q){const q=normText(st.q);rows=rows.filter(r=>normText(def.searchText(r)).includes(q))}
      if(st.sort){const c=def.cols.find(c=>c.key===st.sort);if(c?.val)rows=[...rows].sort((a,b)=>{const x=c.val(a),y=c.val(b),cmp=typeof x==='number'&&typeof y==='number'?x-y:collator().compare(String(x),String(y));return st.dir==='asc'?cmp:-cmp})}
      const per=def.pageSize||10,pages=Math.max(1,Math.ceil(rows.length/per));st.page=Math.min(st.page,pages);const slice=rows.slice((st.page-1)*per,st.page*per);
      $(`.fin-table[data-tbl="${id}"] .fin-count`).textContent=`${rows.length} registro${rows.length===1?'':'s'}`;
      if(!rows.length){box.innerHTML=`<div class="fin-empty"><strong>${st.q?'Sin resultados para la búsqueda':esc(def.emptyTitle||'Sin registros')}</strong><span>${st.q?'Prueba con otro texto o limpia la búsqueda.':esc(def.empty||'No hay datos para los filtros seleccionados.')}</span></div>`;return}
      const sums=def.cols.map(c=>c.sum?{page:slice.reduce((a,r)=>a+c.sum(r),0),all:rows.reduce((a,r)=>a+c.sum(r),0)}:null),foot=sums.some(Boolean);
      box.innerHTML=`<div class="table-wrap"><table class="fin-tbl"><thead><tr>${def.cols.map(c=>`<th class="${c.num?'num':''}" ${c.val?`aria-sort="${st.sort===c.key?(st.dir==='asc'?'ascending':'descending'):'none'}"`:''}>${c.val?`<button type="button" class="fin-sort" data-tbl="${id}" data-k="${c.key}">${esc(c.label)}<span aria-hidden="true">${st.sort===c.key?(st.dir==='asc'?'▲':'▼'):'↕'}</span></button>`:esc(c.label)}</th>`).join('')}</tr></thead><tbody>${slice.map(r=>`<tr>${def.cols.map(c=>`<td class="${c.num?'num':''}">${c.html(r)}</td>`).join('')}</tr>`).join('')}</tbody>${foot?`<tfoot><tr class="fin-sub"><td colspan="1">Subtotal de la página</td>${def.cols.slice(1).map((c,i)=>`<td class="${c.num?'num':''}">${sums[i+1]?c.fmt(sums[i+1].page):''}</td>`).join('')}</tr><tr class="fin-tot"><td>Total (${rows.length})</td>${def.cols.slice(1).map((c,i)=>`<td class="${c.num?'num':''}">${sums[i+1]?c.fmt(sums[i+1].all):''}</td>`).join('')}</tr></tfoot>`:''}</table></div>${pages>1?`<div class="pagination"><span>Página ${st.page} de ${pages}</span><button class="fin-page" data-tbl="${id}" data-d="-1" ${st.page<=1?'disabled':''} aria-label="Anterior">‹</button><button class="fin-page" data-tbl="${id}" data-d="1" ${st.page>=pages?'disabled':''} aria-label="Siguiente">›</button></div>`:''}`;
    }
    const finTablesRenderAll=()=>$$('.fin-table[data-tbl]').forEach(el=>finTableRender(el.dataset.tbl));
    // ---------- Página: filtros ----------
    function finInit(){
      if(state.fin.f)return;const f=FIN_DEFAULT(),recs=finRecords(),apr=recs.filter(r=>r.grp==='approved').map(r=>r.ym).sort(),last=apr[apr.length-1]||todayISO().slice(0,7);
      f.month=last;f.quarter=`${last.slice(0,4)}-Q${Math.floor((+last.slice(5,7)-1)/3)+1}`;f.year=last.slice(0,4);f.day=(recs.filter(r=>r.ym===last).map(r=>r.date).sort().pop())||todayISO();f.from=last+'-01';f.to=PE.fin.monthRange(last).to;state.fin.f=f;
    }
    function finOptions(){
      const recs=finRecords(),months=[...new Set([...recs.map(r=>r.ym),todayISO().slice(0,7)])].sort().reverse(),years=[...new Set(months.map(m=>m.slice(0,4)))],quarters=[...new Set(months.map(m=>`${m.slice(0,4)}-Q${Math.floor((+m.slice(5,7)-1)/3)+1}`))];
      const emps=[...new Map(recs.map(r=>[r.empId,r.empName])).entries()].sort((a,b)=>collator().compare(a[1],b[1])),depts=[...new Map(recs.map(r=>[r.deptId,r.deptName])).entries()].sort((a,b)=>collator().compare(a[1],b[1]));
      return {months,years,quarters,emps,depts};
    }
    function finFiltersHTML(){
      const f=state.fin.f,o=finOptions(),opt=(v,l,sel)=>`<option value="${esc(v)}" ${String(sel)===String(v)?'selected':''}>${esc(l)}</option>`,modes=[['day','Día'],['month','Mes'],['quarter','Trimestre'],['year','Año'],['custom','Rango']];
      return `<div class="fx-fbar"><div class="fx-fgroup fx-fgroup--period"><span class="fx-flabel">${fxI('holiday')}Periodo</span>
          <div class="fx-seg" role="radiogroup" aria-label="Tipo de periodo">${modes.map(([v,l])=>`<button type="button" role="radio" aria-checked="${f.mode===v}" data-ffmode="${v}" tabindex="${f.mode===v?0:-1}">${l}</button>`).join('')}</div><input type="hidden" id="ffMode" value="${esc(f.mode)}">
          <div class="fx-pfields"><div class="field" data-per="day"><label for="ffDay">Día</label><input id="ffDay" class="control" type="date" value="${esc(f.day)}"></div>
            <div class="field" data-per="month"><label for="ffMonth">Mes</label><select id="ffMonth" class="control">${o.months.map(m=>opt(m,PE.fin.monthLong(m),f.month)).join('')}</select></div>
            <div class="field" data-per="quarter"><label for="ffQuarter">Trimestre</label><select id="ffQuarter" class="control">${o.quarters.map(q=>opt(q,`T${q.slice(-1)} ${q.slice(0,4)}`,f.quarter)).join('')}</select></div>
            <div class="field" data-per="year"><label for="ffYear">Año</label><select id="ffYear" class="control">${o.years.map(y=>opt(y,y,f.year)).join('')}</select></div>
            <div class="field" data-per="custom"><label for="ffFrom">Desde</label><input id="ffFrom" class="control" type="date" value="${esc(f.from)}"></div><div class="field" data-per="custom"><label for="ffTo">Hasta</label><input id="ffTo" class="control" type="date" value="${esc(f.to)}"></div></div></div>
        <div class="fx-fgroup fx-fgroup--scope"><span class="fx-flabel">${fxI('users')}Segmentar</span><div class="fin-filter-grid">
          <div class="field"><label for="ffUnion">Sindicato</label><select id="ffUnion" class="control">${opt('','Todos',f.union)}${(state.unions||[]).map(u=>opt(u.id,u.name,f.union)).join('')}${opt('none','Sin sindicato',f.union)}</select></div>
          <div class="field"><label for="ffEmp">Funcionario</label><select id="ffEmp" class="control">${opt('','Todos',f.employee)}${o.emps.map(([id,n])=>opt(id,n,f.employee)).join('')}</select></div>
          <div class="field"><label for="ffDept">Dependencia</label><select id="ffDept" class="control">${opt('','Todas',f.dept)}${o.depts.map(([id,n])=>opt(id,n,f.dept)).join('')}</select></div>
          <div class="field"><label for="ffHour">Tipo de hora extra</label><select id="ffHour" class="control">${opt('','Todas',f.hourType)}${PE.OT_CATS.map(k=>opt(k,PE.OT_LABEL[k],f.hourType)).join('')}</select></div>
          <div class="field"><label for="ffConcept">Concepto económico</label><select id="ffConcept" class="control">${opt('','Todos',f.concept)}${opt('ot','Horas extras',f.concept)}${opt('aux','Auxilios de alimentación',f.concept)}</select></div>
          <div class="field"><label for="ffStatus">Estado del registro</label><select id="ffStatus" class="control">${opt('approved','Aprobados (costo registrado o calculado)',f.status)}${opt('pipeline','En trámite (proyección)',f.status)}${opt('all','Todos',f.status)}</select></div>
          <div class="field fin-clear"><button type="button" class="btn btn-ghost btn-toolbar" id="ffClear">${vectorIcon('close')} Limpiar filtros</button></div></div></div></div>`;
    }
    function finShowPeriodControls(){const m=state.fin.f.mode;$$('#finFilters [data-per]').forEach(x=>x.classList.toggle('hidden',x.dataset.per!==m&&!(m==='custom'&&x.dataset.per==='custom')))}
    function finReadFilters(){
      const f=state.fin.f,v=id=>$('#'+id)?.value??'';f.mode=v('ffMode')||'month';f.day=v('ffDay')||f.day;f.month=v('ffMonth')||f.month;f.quarter=v('ffQuarter')||f.quarter;f.year=v('ffYear')||f.year;f.from=v('ffFrom')||f.from;f.to=v('ffTo')||f.to;
      f.union=v('ffUnion');f.employee=v('ffEmp');f.dept=v('ffDept');f.hourType=v('ffHour');f.concept=v('ffConcept');f.status=v('ffStatus')||'approved';
    }
    function finChips(m){
      const f=state.fin.f,ch=[],lab=(id)=>$(`#${id} option:checked`)?.textContent||'',def=FIN_DEFAULT();
      ch.push(`<span class="fin-chip is-fixed">Periodo: <strong>${esc(m.b?.label||'—')}</strong></span>`);
      [['union','Sindicato','ffUnion'],['employee','Funcionario','ffEmp'],['dept','Dependencia','ffDept'],['hourType','Tipo de hora','ffHour'],['concept','Concepto','ffConcept']].forEach(([k,l,id])=>{if(f[k])ch.push(`<button type="button" class="fin-chip" data-clear="${k}" aria-label="Quitar filtro ${l}">${l}: <strong>${esc(lab(id))}</strong> ×</button>`)});
      if(f.status!==def.status)ch.push(`<button type="button" class="fin-chip" data-clear="status" aria-label="Quitar filtro de estado">Estado: <strong>${esc(lab('ffStatus'))}</strong> ×</button>`);
      $('#finActive').innerHTML=`<span class="small muted">Criterios activos:</span> ${ch.join('')}`;
    }
    function renderFinance(){
      if(!canViewFinance()){$('#finBody').innerHTML='<div class="empty">No tienes acceso al módulo de gestión financiera.</div>';return}
      finInit();$('#finScope').textContent=isAdmin()?'Costo de horas extras y auxilios de alimentación · todas las dependencias.':state.profile.role==='manager'?'Costo de horas extras y auxilios de alimentación · limitado a tu dependencia. El salario base de referencia se muestra solo en «Análisis integral»; las tarifas por hora no.':'Costo de horas extras y auxilios de alimentación · alcance de tu rol. El salario base de referencia se muestra solo en «Análisis integral»; las tarifas por hora no.';
      $('#finFilters').innerHTML=finFiltersHTML();enhanceTemporalPickers($('#finFilters'));enhanceSelectControls($('#finFilters'));finShowPeriodControls();finRenderBody();iconRefresh();
    }
    function finRenderBody(){
      const f=state.fin.f,root=$('#finBody');fxDispose();let m;
      try{m=finModel(f)}catch(err){console.error(err);root.innerHTML=fxErrorView(err);$('#finTabs').innerHTML='';$('#finActive').innerHTML='';return}
      state.fin.m=m;
      if(m.error){root.innerHTML=fxEmpty(m.error,'Selecciona un periodo válido para ver el análisis.');$('#finActive').innerHTML='';return}
      finChips(m);const nAl=m.alerts.length,tabs=[['summary','Resumen ejecutivo','layers'],['ot','Horas extras','clock'],['aux','Auxilios de alimentación','utensils'],['integral','Análisis integral','trend'],['alerts','Alertas','alert']];
      $('#finTabs').innerHTML=tabs.map(([k,l,ic])=>`<button type="button" role="tab" class="fin-tab${state.fin.tab===k?' active':''}" data-fintab="${k}" aria-selected="${state.fin.tab===k}" tabindex="${state.fin.tab===k?0:-1}">${fxI(ic)}<span>${esc(l)}</span>${k==='alerts'&&nAl?`<em class="fx-badge" aria-label="${nAl} alerta${nAl===1?'':'s'}">${nAl}</em>`:''}</button>`).join('');
      let html;try{html=finWarn(m)+({summary:finSummary,ot:finOT,aux:finAux,integral:finIntegral,alerts:finAlertsView}[state.fin.tab])(m)}catch(err){console.error(err);fxQueue.length=0;root.innerHTML=fxErrorView(err);return}
      const entering=state.fin.shown!==state.fin.tab;state.fin.shown=state.fin.tab;
      root.dataset.emph='';root.classList.toggle('fx-enter',entering);root.innerHTML=html;finTablesRenderAll();
      fxQueue.splice(0).forEach(fn=>{try{fn()}catch(err){console.error(err)}});
      fxAnimateNumbers(root);iconRefresh();
    }
    function finWarn(m){
      const bits=[];if(m.T.pendingN)bits.push(`${m.T.pendingN} solicitud${m.T.pendingN===1?'':'es'} aprobada${m.T.pendingN===1?'':'s'} sin costo calculable (no incluida${m.T.pendingN===1?'':'s'} en los totales)`);
      if(!m.T.records&&!m.T.projN)return '';if(m.T.records<3)bits.push('pocos registros en el periodo: los indicadores pueden no ser representativos');
      return bits.length?`<div class="fin-note" role="note">${vectorIcon('info')}<span><strong>Datos incompletos:</strong> ${esc(bits.join(' · '))}. ${m.T.pendingN?'<button type="button" class="link-btn" data-fintab="alerts">Ver detalle</button>':''}</span></div>`:'';
    }
    function finDetailTable(m){
      const salary=canSeeSalary(),rows=m.cur.filter(r=>finComp(r,m.f).total>0||r.cost.status!=='ok'||r.aux.pending).map(r=>({rec:r,c:finComp(r,m.f)}));
      return finTableHTML('detail',{rows,sort:'date',dir:'desc',pageSize:10,search:true,searchText:x=>`${x.rec.filing} ${x.rec.empName} ${x.rec.unionName} ${x.rec.deptName} ${ORIGIN_LABEL[x.rec.origin]}`,emptyTitle:'Sin registros',empty:'No hay registros para los filtros seleccionados.',
        cols:[{key:'filing',label:'Radicado',val:x=>x.rec.filing,html:x=>`<strong>${esc(x.rec.filing)}</strong>`},{key:'date',label:'Fecha',val:x=>x.rec.date,html:x=>esc(fmtDate(x.rec.date))},{key:'emp',label:'Funcionario',val:x=>x.rec.empName,html:x=>esc(x.rec.empName)},{key:'union',label:'Sindicato',val:x=>x.rec.unionName,html:x=>esc(x.rec.unionName)},
          {key:'hours',label:'Horas',num:true,val:x=>x.c.hours,html:x=>num(x.c.hours),sum:x=>x.c.hours,fmt:v=>num(v)},
          {key:'rate',label:'Hora base',num:true,val:x=>x.rec.cost.base_hour_value||0,html:x=>salary&&x.rec.cost.base_hour_value!=null?fx(x.rec.cost.base_hour_value):'<span class="muted" title="Visible solo para administración">—</span>'},
          {key:'ot',label:'Horas extras',num:true,val:x=>x.c.otTotal,html:x=>x.rec.cost.status==='ok'?fx(x.c.otTotal):'<span class="muted">—</span>',sum:x=>x.c.otTotal,fmt:fx},{key:'aux',label:'Auxilios',num:true,val:x=>x.c.aux,html:x=>x.rec.aux.pending?'<span class="status st-returned" title="Valor sin parametrizar">Sin valor</span>':fx(x.c.aux),sum:x=>x.c.aux,fmt:fx},
          {key:'total',label:'Total',num:true,val:x=>x.c.total,html:x=>`<strong>${fx(x.c.total)}</strong>`,sum:x=>x.c.total,fmt:fx},{key:'origin',label:'Origen',val:x=>x.rec.origin,html:x=>`${origBadge(x.rec)}${x.rec.aux.count?`<div class="small muted">Aux.: ${AUX_ORIGIN_LABEL[x.rec.aux.origin]}</div>`:''}`},
          {key:'calc',label:'',html:x=>`<button type="button" class="btn btn-ghost btn-row" data-fincalc="${esc(x.rec.id)}" aria-label="Ver cálculo de ${esc(x.rec.filing)}">Cálculo</button>`}]});
    }
    // ---------- Pestaña: Horas extras ----------
    function finOT(m){
      const T=m.T;if(!T.records)return fxEmpty('Sin horas extras aprobadas en el periodo','Cambia el periodo o limpia los filtros.');
      const rows=PE.OT_CATS.map(k=>({key:k,label:PE.OT_LABEL[k],hours:T.hrs[k],cost:T.cat[k]})),tl=m.timeline;
      const empRows=m.byEmp.map(g=>({...g,hShare:T.hours>0?g.hours/T.hours:0,cShare:T.ot>0?g.ot/T.ot:0}));
      return `${fxMonthlyPanel(m,{id:'fxOtBars',field:'ot',barKey:'hed',icon:'clock',sub:'Costo de horas extras',aria:'Costo mensual de horas extras',secLabel:'Horas',secHead:'Horas',secNote:'las horas extras registradas ese mes',sec:x=>({short:`${num(x.hours)} h`,cell:`${num(x.hours)} h`,rows:[['Horas extras',`${num(x.hours)} h`],['Registros',String(x.records)]]})})}
        <section class="fin-panel fx-panel" data-r>${fxHead('layers','Desglose por clasificación','Horas, tarifa promedio y costo')}<div class="table-wrap"><table class="fin-tbl"><thead><tr><th>Clasificación</th><th class="num">Horas</th><th class="num">Tarifa promedio/h</th><th class="num">Costo</th><th class="num">Participación</th></tr></thead><tbody>${rows.map(r=>`<tr class="fx-k fx-k-${r.key}"><td><span class="fin-sw fc-${r.key}"></span>${esc(r.label)}</td><td class="num">${num(r.hours)}</td><td class="num">${r.hours>0?fx(r.cost/r.hours):'—'}</td><td class="num"><strong>${fx(r.cost)}</strong></td><td class="num"><span class="fx-sh"><span class="fx-sh-b"><i style="--w:${T.ot>0?Math.max(.6,r.cost/T.ot*100):0}%;background:var(--fin-${r.key})"></i></span>${share(r.cost,T.ot)}</span></td></tr>`).join('')}<tr class="fin-tot"><td>Total horas extras</td><td class="num">${num(T.hours)}</td><td class="num">${T.avgHour!=null?fx(T.avgHour):'—'}</td><td class="num">${fx(T.ot)}</td><td class="num">100 %</td></tr></tbody></table></div></section>
        <section class="fin-panel"><header><h3>Comparación de sindicatos</h3><span class="small muted">Costo por clasificación</span></header>${m.byUnion.length?`<div class="table-wrap"><table class="fin-tbl"><thead><tr><th>Sindicato</th>${PE.OT_CATS.map(k=>`<th class="num">${PE.OT_SHORT[k]}</th>`).join('')}<th class="num">Horas</th><th class="num">Costo/h</th><th class="num">Total horas extras</th></tr></thead><tbody>${m.byUnion.map(g=>`<tr><td><strong>${esc(g.name)}</strong></td>${PE.OT_CATS.map(k=>`<td class="num">${fx(g.cat[k])}</td>`).join('')}<td class="num">${num(g.hours)}</td><td class="num">${g.hours>0?fx(g.ot/g.hours):'—'}</td><td class="num"><strong>${fx(g.ot)}</strong></td></tr>`).join('')}</tbody></table></div>`:'<div class="fin-empty"><span>Sin datos.</span></div>'}</section>
        <section class="fin-panel"><header><h3>Funcionarios · horas frente a costo</h3><span class="small muted">Identifica quién concentra más costo y si su tarifa por hora difiere</span></header>${finTableHTML('emp',{rows:empRows,sort:'ot',dir:'desc',pageSize:8,search:true,searchText:g=>`${g.name} ${g.union}`,empty:'Sin funcionarios para los filtros seleccionados.',
          cols:[{key:'name',label:'Funcionario',val:g=>g.name,html:g=>`<strong>${esc(g.name)}</strong><div class="small muted">${esc(g.union)}</div>`},{key:'n',label:'Registros',num:true,val:g=>g.n,html:g=>g.n,sum:g=>g.n,fmt:v=>v},{key:'hours',label:'Horas',num:true,val:g=>g.hours,html:g=>num(g.hours),sum:g=>g.hours,fmt:v=>num(v)},
            {key:'ot',label:'Costo horas extras',num:true,val:g=>g.ot,html:g=>`<strong>${fx(g.ot)}</strong>`,sum:g=>g.ot,fmt:fx},{key:'avg',label:'Costo/h',num:true,val:g=>g.hours>0?g.ot/g.hours:0,html:g=>g.hours>0?fx(g.ot/g.hours):'—'},
            {key:'cmp',label:'% horas vs % costo',val:g=>g.cShare-g.hShare,html:g=>`<div class="fin-dual" title="Horas ${share(g.hours,T.hours)} · Costo ${share(g.ot,T.ot)}"><span class="fin-bar"><span class="fc-hed" style="width:${g.hShare*100}%"></span></span><span class="fin-bar"><span class="fc-hen" style="width:${g.cShare*100}%"></span></span></div><div class="small muted">${share(g.hours,T.hours)} · ${share(g.ot,T.ot)}</div>`},
            {key:'f',label:'',html:g=>`<button type="button" class="btn btn-ghost btn-row" data-finemp="${esc(g.key)}">Filtrar</button>`}]})}</section>
        ${m.alerts.filter(a=>['increase','outlier'].includes(a.kind)).length?`<section class="fin-panel"><header><h3>Aumentos atípicos y variaciones relevantes</h3><button type="button" class="link-btn" data-fintab="alerts">Ver todas las alertas</button></header>${m.alerts.filter(a=>['increase','outlier'].includes(a.kind)).map(finAlertHTML).join('')}</section>`:''}`;
    }
    // ---------- Pestaña: Auxilios de alimentación ----------
    function finAux(m){
      const T=m.T,f=m.f,aux=m.cur.filter(r=>r.aux.count>0||r.aux.pending||['no_shift','non_working_day'].includes(r.aux.status)),unitByUnion=(state.unions||[]).map(u=>({u,rule:currentFoodRule(u.id)}));
      const unionAux=m.byUnion.map(g=>({...g,count:aux.filter(r=>r.grp==='approved'&&(r.union?.id||'none')===g.key).reduce((a,r)=>a+r.aux.count,0)})),tl=m.timeline;
      const status=r=>r.aux.pending?['Sin valor parametrizado','st-returned']:r.aux.status==='no_shift'?['Sin turno asignado','st-returned']:r.aux.status==='non_working_day'?['Día sin jornada habitual (regla no definida)','st-returned']:r.aux.origin==='recognized'?['Reconocido','st-validated']:r.aux.origin==='projected'?['Proyectado (en trámite)','st-pending']:['Estimado según turno','st-review'];
      const rows=aux.map(r=>({rec:r,st:status(r)}));
      const pl=m.prevB.label,pend=aux.filter(r=>r.aux.pending||['no_shift','non_working_day'].includes(r.aux.status)).length,considered=new Set(aux.filter(r=>r.grp==='approved'&&r.aux.count>0).map(r=>r.empId)).size,
        meals2=FOOD_KEYS.map(([k,l,n])=>`<span class="fx-meal${T.auxCount[k]?' on':''}" title="${n}: ${T.auxCount[k]}"><b>${l}</b><span>${n}</span><i>${T.auxCount[k]}</i></span>`).join(''),
        qc=(ico,c,k,v,sub)=>`<article class="fx-qcard" data-r style="--c:${c}"><span class="fx-qi" style="--c:${c}">${fxI(ico)}</span><div><small>${k}</small><b>${v}</b><span>${sub}</span></div></article>`;
      return `<section class="fx-pulse fx-pulse--aux" aria-label="Resumen de auxilios"><article class="fx-hero fx-hero--aux" data-r><div class="fx-hero-top"><span class="fx-eyebrow">${fxI('utensils')}Costo de auxilios de alimentación · ${esc(m.b.label)} · COP</span></div>
          <div class="fx-big">${fxNum(T.aux,'m','auxT')}</div><div class="fx-hero-row">${fxDelta(m.delta.aux,pl,fx(m.P.aux))}<span class="fx-hero-cmp">${esc(pl)}: <b>${fx(m.P.aux)}</b></span></div>
          <div class="fx-meals fx-meals--lg" role="group" aria-label="Auxilios por tipo">${meals2}</div>
          <p class="fx-sub">${T.auxCount.all} auxilio${T.auxCount.all===1?'':'s'}: ${T.auxCount.breakfast} desayuno · ${T.auxCount.lunch} almuerzo · ${T.auxCount.dinner} comida. Valor promedio por auxilio: ${T.auxCount.all?fx(T.aux/T.auxCount.all):'—'}.</p></article>
        <div><h3 class="fx-qtitle">Calidad del dato</h3><div class="fx-qgrid">${qc('users','var(--fin-hen)','Funcionarios considerados',fxNum(considered,'n','auxEmps'),'Con auxilio en el periodo')}${qc('check','var(--fin-hed)','Reconocidos',fx(T.auxRec),'Cantidad confirmada por administración')}${qc('hourglass','var(--fin-aux)','Estimados',fx(T.auxEst),'Calculados según el turno; aún sin reconocer')}${qc('alert',pend?'var(--fx-up)':'var(--fx-flat)','Pendientes o inconsistentes',fxNum(pend,'n','auxPend'),'Sin valor, sin turno o fuera de jornada')}</div></div></section>
        ${fxMonthlyPanel(m,{id:'fxAuxBars',field:'aux',barKey:'aux',icon:'utensils',sub:'Costo de auxilios de alimentación',aria:'Costo mensual de auxilios de alimentación',secLabel:'Auxilios',secHead:'Auxilios',secNote:'la cantidad de auxilios reconocidos o estimados',sec:x=>({short:String(x.auxCount.all),cell:String(x.auxCount.all),rows:[['Auxilios',`${x.auxCount.all} (${x.auxCount.breakfast} D · ${x.auxCount.lunch} A · ${x.auxCount.dinner} C)`]]})})}
        <div class="fin-grid2 fx-solo">
          <section class="fin-panel"><header><h3>Comparación entre periodos</h3><span class="small muted">${esc(m.b.label)} frente a ${esc(m.prevB.label)}</span></header><div class="table-wrap"><table class="fin-tbl"><thead><tr><th>Concepto</th><th class="num">${esc(m.b.label)}</th><th class="num">${esc(m.prevB.label)}</th><th class="num">Variación</th></tr></thead><tbody><tr><td>Auxilios</td><td class="num">${T.auxCount.all}</td><td class="num">${m.P.auxCount.all}</td><td class="num">${fpct(PE.fin.pctChange(T.auxCount.all,m.P.auxCount.all))}</td></tr><tr><td>Costo</td><td class="num"><strong>${fx(T.aux)}</strong></td><td class="num">${fx(m.P.aux)}</td><td class="num">${fpct(m.delta.aux)}</td></tr></tbody></table></div></section></div>
        <div class="fin-grid2"><section class="fin-panel"><header><h3>Costo por sindicato</h3><span class="small muted">${esc(m.b.label)}</span></header>${unionAux.length?`<div class="table-wrap"><table class="fin-tbl"><thead><tr><th>Sindicato</th><th class="num">Funcionarios</th><th class="num">Auxilios</th><th class="num">Costo</th><th class="num">%</th></tr></thead><tbody>${unionAux.map(g=>`<tr><td><strong>${esc(g.name)}</strong></td><td class="num">${g.emps.size}</td><td class="num">${g.count}</td><td class="num"><strong>${fx(g.aux)}</strong></td><td class="num">${share(g.aux,T.aux)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="fin-empty"><span>Sin datos.</span></div>'}</section>
          <section class="fin-panel"><header><h3>Valores unitarios aplicados</h3><span class="small muted">Vigentes hoy · por sindicato</span></header><div class="table-wrap"><table class="fin-tbl"><thead><tr><th>Sindicato</th><th class="num">Valor por auxilio</th><th>Vigente desde</th></tr></thead><tbody>${unitByUnion.map(x=>`<tr><td>${esc(x.u.name)}</td><td class="num">${x.rule?`<strong>${fx(x.rule.amount)}</strong>`:'<span class="status st-returned">Sin valor</span>'}</td><td>${x.rule?esc(fmtDate(x.rule.valid_from)):'—'}</td></tr>`).join('')||'<tr><td colspan="3" class="muted">Sin sindicatos.</td></tr>'}</tbody></table></div><p class="small muted">Cada registro usa el valor del sindicato vigente en su fecha de ejecución; al aprobar se congela. Sin valor de sindicato se usan los valores generales por tipo, si existen.</p></section></div>
        <section class="fin-panel"><header><h3>Registro de auxilios</h3><span class="small muted">Estimado = calculado según turno · Reconocido = confirmado${canAckAux()?'':' (solo administración o profesional puede reconocer)'}</span>${canAckAux()&&aux.some(r=>r.grp==='approved'&&r.aux.origin==='estimated'&&r.aux.count>0&&!r.aux.pending)?`<button type="button" class="btn btn-secondary btn-toolbar" data-finack-all>Reconocer todos los estimados del periodo</button>`:''}</header>
          ${finTableHTML('aux',{rows,sort:'date',dir:'desc',pageSize:10,search:true,searchText:x=>`${x.rec.filing} ${x.rec.empName} ${x.rec.unionName} ${x.st[0]}`,empty:'No hay auxilios para los filtros seleccionados.',
            cols:[{key:'filing',label:'Radicado',val:x=>x.rec.filing,html:x=>`<strong>${esc(x.rec.filing)}</strong>`},{key:'date',label:'Fecha',val:x=>x.rec.date,html:x=>esc(fmtDate(x.rec.date))},{key:'emp',label:'Funcionario',val:x=>x.rec.empName,html:x=>`${esc(x.rec.empName)}<div class="small muted">${esc(x.rec.unionName)}</div>`},
              {key:'chips',label:'Auxilios',html:x=>`<span class="aux-chips">${FOOD_KEYS.map(([k,l,n])=>`<span class="aux-chip${x.rec.aux.flags[k]?' on':''}" title="${n}">${l}</span>`).join('')}</span>`},{key:'unit',label:'Valor por auxilio',num:true,val:x=>x.rec.aux.count?(x.rec.aux.total/x.rec.aux.count):0,html:x=>x.rec.aux.count&&!x.rec.aux.pending?`${fx(x.rec.aux.total/x.rec.aux.count)}<div class="small muted">${x.rec.aux.valueSource==='union'?'Sindicato':'General'}${x.rec.aux.live?'':' · congelado'}</div>`:'—'},
              {key:'total',label:'Costo',num:true,val:x=>x.rec.aux.total,html:x=>`<strong>${fx(x.rec.aux.total)}</strong>`,sum:x=>x.rec.aux.total,fmt:fx},{key:'st',label:'Estado',val:x=>x.st[0],html:x=>`<span class="status ${x.st[1]}">${esc(x.st[0])}</span>`},
              {key:'act',label:'',html:x=>canAckAux()&&x.rec.grp==='approved'?`<button type="button" class="btn btn-ghost btn-row" data-finack="${esc(x.rec.id)}">${x.rec.aux.origin==='recognized'?'Ajustar':'Reconocer'}</button>`:''}]})}</section>`;
    }
    // ---------- Pestaña: Análisis integral ----------
    function finIntegral(m){
      const T=m.T,salaryVisible=canSeeBaseSalary(),salHist=salaryVisible?finSalaryHistory():null,extra=param('finance_extra_concepts')||[],months=m.timeline;
      const salByMonth=ym=>{if(!salaryVisible||!salHist)return null;const end=PE.fin.monthRange(ym).to,ids=new Set(finRecords().filter(r=>finMatch(r,m.f)&&r.grp==='approved'&&r.ym===ym).map(r=>r.empId));let tot=0,missing=0;ids.forEach(id=>{const s=PE.salaryAt(salHist,id,end,state.compensation?.[id]?.base_salary);if(s)tot+=s.amount;else missing++});return {tot,n:ids.size,missing}};
      const rows=months.map(x=>{const s=salByMonth(x.ym),ex=s?extra.reduce((a,c)=>a+Math.round(s.tot*(Number(c.percent)||0)/100),0):null;return {...x,sal:s,extra:ex,all:x.ot+x.aux+(s?s.tot:0)+(ex||0)}});
      const proj=m.projection,avg3=(()=>{const h=months.filter(x=>x.ym<m.today.slice(0,7)&&x.ot>0).slice(-3);return h.length>=3?h.reduce((a,x)=>a+x.ot,0)/h.length:null})();
      return `<div class="fin-note" role="note">${vectorIcon('info')}<span><strong>Cómo leer esta vista:</strong> los valores de horas extras y auxilios son <em>costos registrados o calculados</em>; las proyecciones y escenarios están separados y marcados. ${salaryVisible?'El salario base es una referencia mensual (salario vigente al cierre de cada mes) y <strong>no incluye prestaciones, aportes ni impuestos</strong>.':'El salario base no se muestra por tu rol.'}</span></div>
        <section class="fin-panel"><header><h3>Costo económico por mes</h3><span class="small muted">COP · desglosado por concepto</span></header><div class="table-wrap"><table class="fin-tbl"><thead><tr><th>Mes</th><th class="num">Salario base (referencia)</th><th class="num">Horas extras</th><th class="num">Auxilios</th>${extra.map(c=>`<th class="num">${esc(c.name)} (estimado)</th>`).join('')}<th class="num">Total</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(PE.fin.monthLong(x.ym))}</td><td class="num">${salaryVisible?(salHist?(x.sal&&x.sal.n?fx(x.sal.tot)+(x.sal.missing?` <span class="status st-returned" title="${x.sal.missing} funcionario(s) sin salario vigente">!</span>`:''):'—'):'<span class="muted" title="No fue posible cargar el salario de referencia. Verifica que la migración v4 esté aplicada.">No disponible</span>'):'<span class="muted" title="Restringido por rol">Restringido</span>'}</td><td class="num">${fx(x.ot)}</td><td class="num">${fx(x.aux)}</td>${extra.map(c=>`<td class="num">${salaryVisible&&x.sal?fx(Math.round(x.sal.tot*(Number(c.percent)||0)/100)):'—'}</td>`).join('')}<td class="num"><strong>${fx(x.all)}</strong></td></tr>`).join('')}</tbody></table></div>
          ${extra.length?'':`<div class="fin-missing"><strong>Datos faltantes para completar el costo laboral:</strong> prestaciones sociales, aportes de seguridad social, parafiscales y otros impuestos no se calculan porque la entidad aún no ha definido sus porcentajes y bases. Configúralos en <em>Parámetros → Salarios y horas extras → Conceptos económicos adicionales</em>.</div>`}</section>
        <div class="fin-grid2"><section class="fin-panel"><header><h3>Distribución por sindicato</h3><span class="small muted">${esc(m.b.label)}</span></header>${m.byUnion.length?shareRows(m.byUnion.map((g,i)=>({key:['hed','hen','hedd','hedn','aux'][i%5],label:g.name,value:g.total})),T.total):'<div class="fin-empty"><span>Sin datos.</span></div>'}</section>
          <section class="fin-panel"><header><h3>Distribución por dependencia</h3><span class="small muted">${esc(m.b.label)}</span></header>${m.byDept.length?shareRows(m.byDept.map((g,i)=>({key:['hed','hen','hedd','hedn','aux'][i%5],label:g.name,value:g.total})),T.total):'<div class="fin-empty"><span>Sin datos.</span></div>'}</section></div>
        <section class="fin-panel"><header><h3>Proyecciones y escenario de presupuesto</h3><span class="small muted">Estimaciones — no son costos registrados</span></header>
          <div class="fin-grid2"><div><h4 class="v2-subtitle">Proyección del mes en curso</h4>${proj.status==='ok'?`<p><strong>${fx(proj.linear)}</strong> <span class="status st-pending">Proyectado</span></p><p class="small muted">Método lineal: ${fx(proj.toDate)} acumulado en ${proj.elapsed} de ${proj.days} días.${proj.trailing?` Promedio de los 3 meses anteriores: ${fx(proj.trailing)}.`:''}</p>`:`<p class="muted">${esc(proj.status==='insufficient'?proj.reason:'El periodo consultado no incluye el mes en curso o no hay datos suficientes para proyectar.')}</p>`}</div>
            <div><h4 class="v2-subtitle">Escenario: variación de horas extras</h4><div class="field"><label for="scPct">Variación (%)</label><input id="scPct" class="control" type="number" min="-100" max="500" step="5" value="0" inputmode="numeric"></div><div id="scOut" class="small" aria-live="polite">${avg3!=null?`Base: promedio mensual de horas extras de los últimos 3 meses (${fx(avg3)}).`:'Se requieren al menos 3 meses con datos para construir un escenario.'}</div></div></div></section>`;
    }
    document.addEventListener('input',e=>{if(e.target.id!=='scPct')return;const m=state.fin.m,months=m?.timeline||[],h=months.filter(x=>x.ym<todayISO().slice(0,7)&&x.ot>0).slice(-3);if(h.length<3){$('#scOut').textContent='Se requieren al menos 3 meses con datos para construir un escenario.';return}
      const base=h.reduce((a,x)=>a+x.ot,0)/h.length,p=Number(e.target.value)||0,sc=base*(1+p/100),aux=h.reduce((a,x)=>a+x.aux,0)/h.length,bud=m.budgetMonthly;
      $('#scOut').innerHTML=`Costo mensual de horas extras con ${p>=0?'+':''}${p} %: <strong>${fx(sc)}</strong> <span class="status st-pending">Escenario</span> (base ${fx(base)}).${bud!=null?` Frente al presupuesto mensual de ${fx(bud)} (horas extras + auxilios promedio ${fx(aux)}): <strong>${fx(bud-(sc+aux))}</strong> ${bud-(sc+aux)>=0?'disponibles':'por encima'}.`:' Sin presupuesto configurado.'}`});
    // ---------- Pestaña: Alertas ----------
    function finAlertHTML(a){
      return `<article class="fin-alert is-${a.severity}"><header><span class="fin-alert-tag">${a.severity==='review'?'Requiere revisión':'Información'}</span><h4>${esc(a.title)}</h4></header><dl><dt>Por qué se genera</dt><dd>${esc(a.why)}</dd>${a.facts.length?`<dt>Datos observados</dt><dd><ul>${a.facts.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></dd>`:''}${a.evidence.length?`<dt>Registros que lo sustentan</dt><dd class="fin-evidence">${a.evidence.map(e=>`<button type="button" class="fin-chip" data-fincalc="${esc(e.rid)}">${esc(e.label)}</button>`).join('')}</dd>`:''}<dt>Acción sugerida</dt><dd>${esc(a.action)}</dd></dl></article>`;
    }
    function finAlertsView(m){return m.alerts.length?`<div class="fin-note" role="note">${vectorIcon('info')}<span>Las alertas son <strong>señales que requieren revisión</strong>: se generan con reglas verificables sobre datos observados y no atribuyen causas ni confirman irregularidades.</span></div>${m.alerts.map(finAlertHTML).join('')}`:`<div class="fin-empty"><strong>Sin alertas para el periodo y los filtros seleccionados</strong><span>No se detectaron incrementos relevantes, duplicados, valores atípicos ni problemas de calidad de datos.</span></div>`}
    // ---------- Detalle del cálculo de un registro ----------
    function finExplain(id){
      const rec=finRecords().find(r=>r.id===id);if(!rec)return toast('Registro no disponible con los filtros actuales.','warning');const c=rec.cost,r=rec.req,sal=canSeeSalary();
      const lines=PE.explain(c,fx).map(l=>l.replace(/(\d{4})-(\d{2})-(\d{2})/g,'$3/$2/$1')),catRows=PE.OT_CATS.filter(k=>c.minutes?.[k]).map(k=>`<tr><td>${esc(PE.OT_LABEL[k])}</td><td class="num">${num(c.hours?.[k]||0)} h</td><td class="num">${c.factors?.[k]!=null?nfFactor().format(c.factors[k]):'—'}</td><td class="num">${sal&&c.rates?.[k]!=null?fx(c.rates[k]):'—'}</td><td class="num"><strong>${c.values?.[k]!=null?fx(c.values[k]):'—'}</strong></td></tr>`).join('');
      const a=rec.aux,pair=(k,v)=>`<div class="md-pair"><dt class="md-label">${k}</dt><dd>${v||'<span class="md-none">—</span>'}</dd></div>`;
      modal(`<div class="modal modal-xl modal-detail md md-calc"><div class="modal-head md-head"><div class="md-head-top"><div class="modal-title-group"><span class="modal-eyebrow">Cálculo del costo</span><div class="md-title-row"><h3>${esc(rec.filing)}</h3>${origBadge(rec)}</div><div class="small muted">${esc(rec.empName)} · ${esc(rec.unionName)}</div></div><button class="close-modal" onclick="App.closeModal()" aria-label="Cerrar">${vectorIcon('close')}</button></div></div>
        <div class="modal-body md-body">
          <section class="md-sec" aria-label="Datos de la solicitud"><dl class="md-pairs md-pairs-4">${pair('Fecha y horario',`${esc(fmtDate(r.execution_date))} · ${esc(fmtRange12(r))}`)}${pair(rec.grp==='approved'?'Horas aprobadas':'Horas solicitadas',`${num(rec.hours)} h`)}${pair('Estado',statusBadge(r.status))}${pair('Origen del costo',`${esc(ORIGIN_LABEL[rec.origin])}${rec.origin==='registered'?` · ${esc(fmtDateTime(c.computed_at))}`:''}`)}</dl></section>
          <section class="md-sec" aria-labelledby="mcH1"><h4 class="md-h" id="mcH1">Horas extras</h4>${c.status==='ok'?`<div class="table-wrap"><table class="fin-tbl"><thead><tr><th>Clasificación</th><th class="num">Horas</th><th class="num">Factor</th><th class="num">Tarifa/h</th><th class="num">Valor</th></tr></thead><tbody>${catRows}<tr class="fin-tot"><td colspan="4">Total horas extras</td><td class="num">${fx(c.total)}</td></tr></tbody></table></div><ol class="fin-steps">${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ol>${!sal?'<p class="md-meta">El salario y las tarifas por hora no se muestran por tu rol.</p>':''}`:`<div class="callout warning"><strong>Costo pendiente.</strong> ${esc((c.reasons||[]).join(' · ')||'Sin información')}</div>`}</section>
          <section class="md-sec" aria-labelledby="mcH2"><h4 class="md-h" id="mcH2">Auxilios de alimentación</h4><ul class="md-aux">${FOOD_KEYS.map(([k,l,n])=>`<li class="md-aux-i${a.flags[k]?' is-on':''}"><b aria-hidden="true">${l}</b><span class="md-aux-n">${esc(n)}</span><span class="md-aux-s">${a.flags[k]?'Aplica':'No aplica'}</span></li>`).join('')}</ul><p class="md-meta">${AUX_ORIGIN_LABEL[a.origin]}${a.ack?` · reconocido por ${esc(personName(a.ack.by,'Usuario'))} el ${esc(fmtDateTime(a.ack.at))}`:' · calculado según el turno'}. ${a.count?(a.pending?'Valor sin parametrizar.':`Valor total <strong>${fx(a.total)}</strong> (${a.valueSource==='union'?'valor del sindicato':'valor general'}${a.live?', vigente':', congelado al aprobar'}).`):'No genera auxilio.'}${a.status&&a.status!=='ok'?` ${esc(AUX_STATUS_TEXT[a.status]||a.status)}`:''}</p></section></div>
        <div class="modal-foot md-foot"><div class="modal-actions"><button type="button" class="btn btn-ghost btn-modal" onclick="App.closeModal()">Cerrar</button>${r.id?`<button type="button" class="btn btn-secondary btn-modal" onclick="App.closeModal();App.viewRequest('${esc(r.id)}')">Ver solicitud</button>`:''}</div></div></div>`);
    }
    // ---------- Reconocimiento de auxilios (cantidad efectivamente causada) ----------
    async function ackAux(ids,flagsFn,note){
      if(!canAckAux())throw new Error('Tu rol no puede reconocer auxilios.');
      {for(const id of ids){const r=(state.adminRequests||[]).find(x=>x.id===id);const fl=flagsFn(r);const {error}=await state.client.rpc('acknowledge_food_allowance',{p_request:id,p_breakfast:!!fl.breakfast,p_lunch:!!fl.lunch,p_dinner:!!fl.dinner,p_note:note||null});if(error)throw error}}
      await loadAll();
    }
    async function ackDialog(id){
      const rec=finRecords().find(r=>r.id===id);if(!rec)return;const fl=rec.aux.flags;
      const {value}=await Swal.fire({title:'Reconocer auxilios',html:`<div class="swal-form-grid"><div class="swal-field span-2"><p class="small muted" style="margin:0">${esc(rec.filing)} · ${esc(rec.empName)} · ${esc(fmtDate(rec.date))}. Marca los auxilios efectivamente causados.</p></div>${FOOD_KEYS.map(([k,l,n])=>`<label class="swal-check-row"><input type="checkbox" id="ack_${k}" ${fl[k]?'checked':''}> ${n}</label>`).join('')}<div class="swal-field span-2"><label for="ackNote">Nota (opcional)</label><input id="ackNote" class="swal2-input" maxlength="200"></div></div>`,showCancelButton:true,confirmButtonText:'Reconocer',cancelButtonText:'Cancelar',preConfirm:()=>({breakfast:$('#ack_breakfast').checked,lunch:$('#ack_lunch').checked,dinner:$('#ack_dinner').checked,note:$('#ackNote').value.trim()})});
      if(!value)return;try{await ackAux([id],()=>value,value.note);toast('Auxilios reconocidos','success')}catch(err){toast(errorMsg(err),'error')}
    }
    async function ackAllDialog(){
      const m=state.fin.m,list=m.cur.filter(r=>r.grp==='approved'&&r.aux.origin==='estimated'&&r.aux.count>0&&!r.aux.pending);if(!list.length)return;
      const ok=await Swal.fire({title:`Reconocer ${list.length} registro${list.length===1?'':'s'}`,icon:'question',html:`<div class="small">Se reconocerán los auxilios <strong>tal como fueron calculados según el turno</strong> (${fx(list.reduce((a,r)=>a+r.aux.total,0))}) para el periodo y los filtros actuales. Quedará registrado en la auditoría.</div>`,showCancelButton:true,confirmButtonText:'Reconocer',cancelButtonText:'Cancelar'});if(!ok.isConfirmed)return;
      try{await ackAux(list.map(r=>r.id),r=>{const a=auxOf(r);return a},'Reconocimiento masivo según cálculo');toast('Auxilios reconocidos','success')}catch(err){toast(errorMsg(err),'error')}
    }
    // ---------- Exportaciones (Excel .xlsx real y PDF) respetando permisos y filtros ----------
    const finFilterLines=m=>{const f=m.f,l=[],lab=id=>$(`#${id} option:checked`)?.textContent||'';if(f.union)l.push('Sindicato: '+lab('ffUnion'));if(f.employee)l.push('Funcionario: '+lab('ffEmp'));if(f.dept)l.push('Dependencia: '+lab('ffDept'));if(f.hourType)l.push('Tipo de hora extra: '+lab('ffHour'));if(f.concept)l.push('Concepto: '+lab('ffConcept'));l.push('Estado: '+lab('ffStatus'));return l};
    function finExportRows(m){return m.cur.map(r=>{const c=finComp(r,m.f);return {rec:r,c}}).filter(x=>x.c.total>0||x.rec.cost.status!=='ok'||x.rec.aux.pending).sort((a,b)=>a.rec.date.localeCompare(b.rec.date))}
    const crcT=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0}return t})(),crc32=b=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=crcT[(c^b[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0};
    function zipStore(files){
      const enc=new TextEncoder(),parts=[],cen=[];let off=0;const u16=(v)=>[v&255,(v>>8)&255],u32=(v)=>[v&255,(v>>8)&255,(v>>16)&255,(v>>24)&255];
      files.forEach(f=>{const name=enc.encode(f.name),data=typeof f.data==='string'?enc.encode(f.data):f.data,crc=crc32(data),hdr=new Uint8Array([0x50,0x4b,3,4,...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0)]);
        parts.push(hdr,name,data);cen.push({name,crc,size:data.length,off});off+=hdr.length+name.length+data.length});
      let cs=0;const cparts=cen.map(c=>{const h=new Uint8Array([0x50,0x4b,1,2,...u16(20),...u16(20),...u16(0x0800),...u16(0),...u16(0),...u16(0x21),...u32(c.crc),...u32(c.size),...u32(c.size),...u16(c.name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(c.off)]);cs+=h.length+c.name.length;return [h,c.name]}).flat();
      const end=new Uint8Array([0x50,0x4b,5,6,...u16(0),...u16(0),...u16(cen.length),...u16(cen.length),...u32(cs),...u32(off),...u16(0)]),all=[...parts,...cparts,end],out=new Uint8Array(all.reduce((a,p)=>a+p.length,0));let p=0;all.forEach(x=>{out.set(x,p);p+=x.length});return out;
    }
    const xmlEsc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),colL=i=>{let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26)}return s};
    // Estilos: 0 normal · 1 negrita · 2 moneda COP · 3 porcentaje · 4 encabezado · 5 moneda en negrita · 6 título
    function sheetXML(rows,widths){
      const body=rows.map((row,ri)=>`<row r="${ri+1}">${row.map((c,ci)=>{if(c==null||c==='')return '';const ref=colL(ci)+(ri+1),v=typeof c==='object'&&!Array.isArray(c)?c:{v:c};if(v.v===''||v.v==null)return '';if(v.f)return `<c r="${ref}" s="${v.s||0}"><f>${xmlEsc(v.f)}</f><v>${v.v}</v></c>`;return typeof v.v==='number'?`<c r="${ref}" s="${v.s||0}"><v>${v.v}</v></c>`:`<c r="${ref}" s="${v.s||0}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v.v)}</t></is></c>`}).join('')}</row>`).join('');
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"${''}/></sheetViews><cols>${widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData></worksheet>`;
    }
    function buildXlsx(sheets){
      const files=[{name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`},
        {name:'_rels/.rels',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
        {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xmlEsc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`},
        {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
        {name:'xl/styles.xml',data:'<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts><fonts count="3"><font><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3E9F2"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'},
        ...sheets.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,data:sheetXML(s.rows,s.widths)}))];
      return zipStore(files);
    }
    function downloadBytes(bytes,name,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([bytes],{type}));a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000)}
    const finStamp=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`};
    function finReportModel(){
      if(!canViewFinance()){toast('No tienes permiso para exportar informes financieros.','error');return null}
      const m=finModel(state.fin.f);if(m.error){toast(m.error,'warning');return null}if(!m.T.records&&!m.T.projN){toast('No hay datos para exportar con los filtros actuales.','warning');return null}return m;
    }
    function finExportXlsx(){
      const m=finReportModel();if(!m)return;const T=m.T,salary=canSeeSalary(),M=(v)=>({v:Math.round(v),s:2}),H=a=>a.map(x=>({v:x,s:4})),det=finExportRows(m);
      const res=[[{v:'Informe de gestión financiera · horas extras y auxilios de alimentación',s:6}],[{v:'Fecha de generación',s:1},finStamp()],[{v:'Periodo consultado',s:1},m.b.label],[{v:'Generado por',s:1},`${state.profile.full_name} (${roleLabel(state.profile.role)})`],[{v:'Filtros aplicados',s:1},finFilterLines(m).join(' · ')],[],
        H(['Indicador','Valor','Periodo anterior ('+m.prevB.label+')','Variación']),
        ['Costo total (aprobado)',M(T.total),M(m.P.total),{v:m.delta.total??'',s:3}],['Horas extras',M(T.ot),M(m.P.ot),{v:m.delta.ot??'',s:3}],['Auxilios de alimentación',M(T.aux),M(m.P.aux),{v:m.delta.aux??'',s:3}],['Horas extras registradas (h)',{v:Math.round(T.hours*100)/100},{v:Math.round(m.P.hours*100)/100},{v:m.delta.hours??'',s:3}],['Costo promedio por hora extra',T.avgHour!=null?M(T.avgHour):'',m.P.avgHour!=null?M(m.P.avgHour):'',''],['Funcionarios incluidos',{v:T.nEmps},{v:m.P.nEmps},''],
        ['Proyectado: solicitudes en trámite (no incluido en el total)',M(T.proj),'',''],[],H(['Concepto','Valor','% del total','Origen']),
        ...FIN_CONCEPTS.map(([k,l])=>[l,M(k==='aux'?T.aux:T.cat[k]),{v:T.total>0?(k==='aux'?T.aux:T.cat[k])/T.total:0,s:3},k==='aux'?'Reconocido / estimado':'Registrado / calculado']),[{v:'Total',s:1},{v:Math.round(T.total),s:5},{v:T.total>0?1:0,s:3},''],[],
        H(['Sindicato','Funcionarios','Horas','Horas extras','Auxilios','Total']),...m.byUnion.map(g=>[g.name,{v:g.emps.size},{v:Math.round(g.hours*100)/100},M(g.ot),M(g.aux),M(g.total)]),[],
        ['Registrado = instantánea guardada al aprobar · Calculado = reglas vigentes en la fecha de ejecución · Proyectado = solicitudes en trámite (estimación).']];
      const dh=['Radicado','Fecha','Funcionario','Sindicato','Dependencia','Horas',...(salary?['Hora base']:[]),'Horas extras','Auxilios','Total','Origen horas extras','Origen auxilios'];
      const drows=det.map(({rec,c})=>[rec.filing,rec.date,rec.empName,rec.unionName,rec.deptName,{v:Math.round(c.hours*100)/100},...(salary?[rec.cost.base_hour_value!=null?M(rec.cost.base_hour_value):'']:[]),M(c.otTotal),M(c.aux),M(c.total),ORIGIN_LABEL[rec.origin],rec.aux.count?AUX_ORIGIN_LABEL[rec.aux.origin]:'—']);
      const n=drows.length,col=i=>colL(i),first=2,last=n+1,iHE=dh.indexOf('Horas extras'),iAux=dh.indexOf('Auxilios'),iTot=dh.indexOf('Total'),iH=dh.indexOf('Horas'),sum=(i,v)=>({f:`SUM(${col(i)}${first}:${col(i)}${last})`,v:Math.round(v*100)/100,s:5});
      const dsheet=[H(dh),...drows,[{v:`Total (${n} registros)`,s:1},'','','','',{...sum(iH,det.reduce((a,x)=>a+x.c.hours,0)),s:1},...(salary?['']:[]),sum(iHE,det.reduce((a,x)=>a+x.c.otTotal,0)),sum(iAux,det.reduce((a,x)=>a+x.c.aux,0)),sum(iTot,det.reduce((a,x)=>a+x.c.total,0))]];
      const bytes=buildXlsx([{name:'Resumen',rows:res,widths:[46,22,26,16,16,16]},{name:'Detalle',rows:dsheet,widths:[12,12,28,18,22,9,...(salary?[12]:[]),14,14,14,16,16]}]);
      downloadBytes(bytes,`Gestion_financiera_${m.b.key.replace(/[^0-9A-Za-z_-]/g,'_')}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');toast('Informe Excel generado','success');
    }
    function finLayoutPdf(m){
      const {w:PW,h:PH,m:M0}=FMT_PAGE,X0=M0,CW=PW-2*M0,pages=[];let pg,y;const op=o=>pg.push(o),rect=(x,yy,w,h,o={})=>op({t:'rect',x,y:yy,w,h,fill:o.fill||null,stroke:o.stroke||null,lw:o.lw||0.4}),text=(s,x,yy,o={})=>{if(String(s??'')!=='')op({t:'text',s:String(s),x,y:yy,size:o.size||8,bold:!!o.bold,color:o.color||FMT_C.ink})},right=(s,xr,yy,o={})=>text(s,xr-pdfTextW(String(s),o.size||8,o.bold),yy,o);
      const newPage=()=>{pg=[];pages.push(pg);y=M0;rect(X0,y,CW,3,{fill:FMT_C.accent});y+=14};
      const trunc=(s,w,size,bold)=>{s=String(s);if(pdfTextW(s,size,bold)<=w)return s;while(s.length>1&&pdfTextW(s+'…',size,bold)>w)s=s.slice(0,-1);return s+'…'};
      newPage();text('Informe de gestión financiera',X0,y+10,{size:15,bold:true});y+=26;text('Horas extras y auxilios de alimentación',X0,y,{size:9.5,color:FMT_C.mute});y+=16;
      [['Fecha de generación',finStamp()],['Periodo consultado',m.b.label],['Generado por',`${state.profile.full_name} (${roleLabel(state.profile.role)})`]].forEach(([k,v])=>{text(k+':',X0,y,{size:8,bold:true});text(v,X0+110,y,{size:8});y+=12});
      const fl=pdfWrap('Filtros aplicados: '+finFilterLines(m).join(' · '),8,false,CW);fl.forEach(l=>{text(l,X0,y,{size:8,color:FMT_C.mute});y+=11});y+=6;
      const row=(cells,xs,o={})=>{cells.forEach((c,i)=>{const t=trunc(c,xs[i+1]-xs[i]-6,o.size||8,o.bold);if(o.right?.includes(i))right(t,xs[i+1]-4,y,{size:o.size||8,bold:o.bold});else text(t,xs[i]+3,y,{size:o.size||8,bold:o.bold})})};
      const section=(title)=>{if(y>PH-120)newPage();rect(X0,y-9,CW,15,{fill:FMT_C.head});text(title,X0+4,y+2,{size:8.5,bold:true});y+=18};
      section('Totales por concepto');const T=m.T,xs1=[X0,X0+250,X0+370,X0+CW];FIN_CONCEPTS.forEach(([k,l])=>{const v=k==='aux'?T.aux:T.cat[k];row([l,fx(v),share(v,T.total)],xs1,{right:[1,2]});y+=12});
      line0(X0,y-8,X0+CW);row(['Total aprobado',fx(T.total),'100 %'],xs1,{bold:true,right:[1,2]});y+=12;row(['Horas extras registradas',`${num(T.hours)} h`,m.delta.hours!=null?fpct(m.delta.hours):''],xs1,{right:[1,2]});y+=12;row([`Variación del costo vs ${m.prevB.label}`,fpct(m.delta.total),''],xs1,{right:[1,2]});y+=12;
      if(T.projN){row(['Proyectado (solicitudes en trámite, no incluido)',fx(T.proj),''],xs1,{right:[1,2]});y+=12}y+=6;
      function line0(a,yy,b){op({t:'line',x1:a,y1:yy,x2:b,y2:yy,color:FMT_C.lineIn,lw:0.4})}
      if(m.byUnion.length){section('Costo por sindicato');const xs=[X0,X0+170,X0+240,X0+330,X0+420,X0+CW];row(['Sindicato','Horas','Horas extras','Auxilios','Total'],xs,{bold:true,right:[1,2,3,4]});y+=12;m.byUnion.forEach(g=>{row([g.name,num(g.hours),fx(g.ot),fx(g.aux),fx(g.total)],xs,{right:[1,2,3,4]});y+=12});y+=6}
      const salary=canSeeSalary(),cols=[44,44,112,62,32,62,52,66,64],xs=cols.reduce((a,w)=>(a.push(a[a.length-1]+w),a),[X0]),det=finExportRows(m),head=()=>{rect(X0,y-9,CW,15,{fill:FMT_C.head});row(['Radicado','Fecha','Funcionario','Sindicato','Horas','Horas extras','Auxilios','Total','Origen'],xs,{bold:true,size:7,right:[4,5,6,7]});y+=14};
      if(y>PH-100)newPage();section('Detalle de registros');head();let tH=0,tO=0,tA=0,tT=0;
      det.forEach(({rec,c})=>{if(y>PH-60){newPage();head()}row([rec.filing,fmtDate(rec.date),rec.empName,rec.unionName,num(c.hours),fx(c.otTotal),fx(c.aux),fx(c.total),ORIGIN_LABEL[rec.origin]],xs,{size:7,right:[4,5,6,7]});tH+=c.hours;tO+=c.otTotal;tA+=c.aux;tT+=c.total;y+=11;line0(X0,y-8,X0+CW)});
      if(y>PH-60)newPage();rect(X0,y-9,CW,15,{fill:FMT_C.total});row([`Total (${det.length} registros)`,'','','',num(tH),fx(tO),fx(tA),fx(tT),''],xs,{bold:true,size:7,right:[4,5,6,7]});y+=18;
      pdfWrap('Registrado = instantánea guardada al aprobar. Calculado = reglas vigentes en la fecha de ejecución. Proyectado = estimación de solicitudes en trámite (no es un costo registrado). Auxilios: reconocido = cantidad confirmada; estimado = calculado según el turno.',7,false,CW).forEach(l=>{if(y>PH-40)newPage();text(l,X0,y,{size:7,color:FMT_C.mute});y+=9});
      pages.forEach((p,i)=>{pg=p;const s=`Página ${i+1} de ${pages.length}`;text(s,PW/2-pdfTextW(s,7.5,false)/2,PH-14,{size:7.5,color:FMT_C.mute})});
      return pages;
    }
    function finExportPdf(){
      const m=finReportModel();if(!m)return;
      try{const pages=finLayoutPdf(m),bytes=fmtPdfBytes(pages,{logo:null,sig:null,title:`Informe de gestión financiera - ${m.b.label}`,author:state.profile.full_name,subject:'Horas extras y auxilios de alimentación',pdfDate:fmtPdfDate(new Date())});downloadBytes(bytes,`Gestion_financiera_${m.b.key.replace(/[^0-9A-Za-z_-]/g,'_')}.pdf`,'application/pdf');toast('Informe PDF generado','success')}catch(err){console.error(err);toast('No fue posible generar el PDF.','error')}
    }
    // ---------- Eventos de la página ----------
    function bindFinance(){
      const root=document.getElementById('page-finance');if(!root)return;
      const setEmph=k=>{const b=document.getElementById('finBody');if(b)b.dataset.emph=k||''};
      root.addEventListener('pointerover',e=>{const el=e.target.closest('[data-emph]');if(el&&root.contains(el))setEmph(el.dataset.emph)});
      root.addEventListener('pointerout',e=>{const el=e.target.closest('[data-emph]');if(el&&!(e.relatedTarget&&el.contains(e.relatedTarget)))setEmph('')});
      root.addEventListener('focusin',e=>{const el=e.target.closest('[data-emph]');if(el)setEmph(el.dataset.emph)});
      root.addEventListener('focusout',e=>{if(e.target.closest('[data-emph]'))setEmph('')});
      root.addEventListener('click',e=>{
        let el;
        if(el=e.target.closest('[data-ffmode]')){const inp=$('#ffMode');if(!inp)return;const changed=inp.value!==el.dataset.ffmode;inp.value=el.dataset.ffmode;root.querySelectorAll('[data-ffmode]').forEach(b=>{const on=b===el;b.setAttribute('aria-checked',String(on));b.tabIndex=on?0:-1});if(changed)inp.dispatchEvent(new Event('change',{bubbles:true}));return}
        if(el=e.target.closest('[data-fxmode]')){const k=el.dataset.fxmode;if((state.fin.evoMode||'trend')===k)return;state.fin.evoMode=k;finRenderBody();root.querySelector(`[data-fxmode="${k}"]`)?.focus();return}
        if(e.target.closest('[data-fin="retry"]')){renderFinance();return}
      });
      root.addEventListener('keydown',e=>{const b=e.target.closest('.fx-seg button,.fx-seg2 button');if(!b||!['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'].includes(e.key))return;e.preventDefault();const list=[...b.parentElement.querySelectorAll('button')],i=list.indexOf(b),n=list[(i+(e.key==='ArrowRight'||e.key==='ArrowDown'?1:-1)+list.length)%list.length];n.focus();n.click();n.focus()});
      root.addEventListener('change',e=>{if(!e.target.closest('#finFilters'))return;finReadFilters();if(e.target.id==='ffMode')finShowPeriodControls();state.fin.tables={};finRenderBody()});
      root.addEventListener('input',e=>{if(e.target.classList?.contains('fin-q')){const st=state.fin.tables[e.target.dataset.tbl];st.q=e.target.value;st.page=1;clearTimeout(finQ.t);finQ.t=setTimeout(()=>finTableRender(e.target.dataset.tbl),120)}});
      root.addEventListener('keydown',e=>{
        if(!e.target.classList?.contains('fin-tab'))return;const tabs=[...root.querySelectorAll('.fin-tab')],i=tabs.indexOf(e.target);let n=null;
        if(e.key==='ArrowRight')n=(i+1)%tabs.length;else if(e.key==='ArrowLeft')n=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')n=0;else if(e.key==='End')n=tabs.length-1;
        if(n!=null){e.preventDefault();state.fin.tab=tabs[n].dataset.fintab;finRenderBody();root.querySelector(`.fin-tab[data-fintab="${state.fin.tab}"]`)?.focus()}});
      root.addEventListener('click',e=>{
        const t=e.target;let el;
        if(t.closest('#ffClear')){const keep=state.fin.f,d=FIN_DEFAULT();Object.assign(keep,{union:'',employee:'',dept:'',hourType:'',concept:'',status:d.status});state.fin.tables={};renderFinance();return}
        if(el=t.closest('[data-clear]')){const k=el.dataset.clear,f=state.fin.f;f[k]=k==='status'?'approved':'';state.fin.tables={};renderFinance();return}
        if(el=t.closest('[data-fintab]')){state.fin.tab=el.dataset.fintab;finRenderBody();return}
        if(el=t.closest('.fin-sort')){const st=state.fin.tables[el.dataset.tbl];if(st.sort===el.dataset.k)st.dir=st.dir==='asc'?'desc':'asc';else{st.sort=el.dataset.k;st.dir='asc'}finTableRender(el.dataset.tbl);return}
        if(el=t.closest('.fin-page')){const st=state.fin.tables[el.dataset.tbl];st.page+=Number(el.dataset.d);finTableRender(el.dataset.tbl);return}
        if(el=t.closest('[data-fincalc]')){finExplain(el.dataset.fincalc);return}
        if(el=t.closest('[data-finemp]')){state.fin.f.employee=el.dataset.finemp;state.fin.tables={};renderFinance();return}
        if(el=t.closest('[data-finack]')){ackDialog(el.dataset.finack);return}
        if(t.closest('[data-finack-all]')){ackAllDialog();return}
        if(t.closest('[data-fin="export-xlsx"]')){finExportXlsx();return}if(t.closest('[data-fin="export-pdf"]')){finExportPdf();return}
        if(t.closest('[data-fin="settings"]')){navigate('settings');$('.settings-tabs .tab[data-tab="payroll"]')?.click();return}
      });
    }
    const finQ={t:null};

    // =====================================================================================================
    // Detalle de solicitud · rediseño
    // Estructura: encabezado (radicado, estado y avance del trámite) · columna principal (cifras, solicitante, motivos, historial)
    // · columna lateral (validación y aprobación, auxilios, soportes, costo) · pie con jerarquía de acciones.
    // La lógica de negocio no cambia: mismos datos, mismas acciones (requestActions) y mismos permisos.
    // =====================================================================================================
    const MD_TONE={draft:'idle',pending:'info',in_review:'info',returned:'warn',approved:'ok',pending_execution:'ok',validated:'ok',closed:'ok',rejected:'bad',cancelled:'bad'};
    const mdDash='<span class="md-none">—</span>';
    function mdWeekday(iso){const [y,m,d]=String(iso||'').split('-').map(Number);if(!y)return '';const t=new Date(y,m-1,d,12).toLocaleDateString('es-CO',{weekday:'long'});return t.charAt(0).toUpperCase()+t.slice(1)}
    // Avance del trámite: los pasos dependen de si hubo validación del profesional; un estado detenido (devuelta, rechazada, cancelada) se marca en el paso donde quedó.
    function mdRail(r){
      const s=r.status,hasPro=!!state.parameters.require_professional_validation||!!r.professional_result,names=['Radicada',...(hasPro?['Validación']:[]),'Decisión','Cierre'],after=hasPro?'Validación':'Decisión';
      let cur=null,halt=null;
      switch(s){
        case 'draft':cur='Radicada';halt={label:'Borrador',tone:'idle'};break;
        case 'pending':cur=after;break;
        case 'in_review':cur=hasPro&&r.professional_result!=='favorable'?'Validación':'Decisión';break;
        case 'returned':cur=after;halt={label:'Devuelta',tone:'warn'};break;
        case 'rejected':cur='Decisión';halt={label:'Rechazada',tone:'bad'};break;
        case 'cancelled':cur=after;halt={label:'Cancelada',tone:'bad'};break;
        case 'approved':case 'pending_execution':case 'validated':cur='Cierre';break;   // aprobadas antes del cierre automático: falta cerrarlas
        case 'closed':cur=null;break;                                                  // la aprobación del jefe cierra la solicitud
        default:cur=after;
      }
      const ci=cur==null?names.length:names.indexOf(cur);
      return `<ol class="md-rail" aria-label="Avance del trámite">${names.map((n,i)=>{
        const st=i<ci?'done':i===ci?(halt?'halt':'current'):'todo',tone=st==='halt'?halt.tone:'',sr=st==='done'?'completado':st==='current'?'en curso':st==='halt'?halt.label.toLowerCase():'pendiente';
        return `<li class="md-rail-i is-${st}"${tone?` data-tone="${tone}"`:''}${st==='current'||st==='halt'?' aria-current="step"':''}><span class="md-rail-dot" aria-hidden="true"></span><span class="md-rail-name">${esc(n)}</span>${st==='halt'?`<span class="md-rail-halt">${esc(halt.label)}</span>`:''}<span class="md-sr">, ${esc(sr)}</span></li>`}).join('')}</ol>`;
    }
    // ---------- Rediseño visual (prefijo dr-): misma información y mismas acciones, nueva presentación ----------
    const DR_ICONS={
      utensils:'<path d="M4 3v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3M6 3v18M18 3c-2.6 1.6-3.6 4.2-3.6 7.2V14H18v7"></path>',
      coin:'<circle cx="12" cy="12" r="9"></circle><path d="M14.8 9.2c-.5-.9-1.6-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2 0 2.8 5.8 1.4 5.8 4.2 0 1.2-1.2 2.2-3 2.2-1.3 0-2.4-.5-3-1.5M12 6.5v1.3M12 16.2v1.3"></path>',
      arrow:'<path d="M5 12h14M13 6l6 6-6 6"></path>',
      user:'<circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path>',
      route:'<circle cx="6" cy="6" r="2.5"></circle><circle cx="18" cy="18" r="2.5"></circle><path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5"></path>'
    };
    const drI=n=>svgIcon(DR_ICONS[n]||DR_ICONS.arrow);
    const DR_CHECK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path class="dr-tick" pathLength="1" d="m5 12.5 4.5 4.5L19 7"></path></svg>';
    // Tono visual del estado (el color del encabezado y de la ruta): azul en trámite, verde completada, ámbar devuelta, rojo rechazada, gris borrador o cancelada.
    const DR_TONE={draft:'idle',pending:'info',in_review:'info',returned:'warn',approved:'info',pending_execution:'info',validated:'info',closed:'ok',rejected:'bad',cancelled:'idle'};
    // Comentarios automáticos del sistema: en el detalle de cada etapa se omiten porque repetirían el estado que ya se muestra.
    const DR_GENERIC=new Set(['Solicitud creada y enviada','Solicitud creada o corregida y enviada','Solicitud corregida y enviada','Borrador guardado','Borrador actualizado','Solicitud aprobada por el jefe','Solicitud rechazada por el jefe','Validación profesional: favorable','Solicitud cerrada']);
    const drNote=t=>{const v=String(t||'').trim();return v&&!DR_GENERIC.has(v)?v:''};
    const drSx=(c)=>`style="--sx:var(--dr-${c});--sx-ink:var(--dr-${c}-ink)"`;
    const drHead2=(c,icon,title,count)=>`<h4 class="dr-h" ${drSx(c)}><span class="dr-hi" aria-hidden="true">${icon}</span>${title}${count!=null?` <span class="dr-count">${count}</span>`:''}</h4>`;
    const drStageHint={filed:{current:'La solicitud aún no se ha enviado.'},validation:{current:'Esperando la validación del profesional.'},decision:{current:'Esperando la decisión del jefe de la dependencia.'},closed:{current:'Aprobada antes del cierre automático: un profesional debe cerrarla.'}};

    // Modelo de la ruta: etapas, estado de cada una (completada · en curso · detenida · pendiente) y los datos reales de quién y cuándo.
    function drModel(r,history){
      const s=r.status,hasPro=!!state.parameters.require_professional_validation||!!r.professional_result,hist=history||[];
      const defs=[{k:'filed',name:'Radicada',icon:'detail'},...(hasPro?[{k:'validation',name:'Validación',icon:'verify'}]:[]),{k:'decision',name:'Decisión',icon:'approve'},{k:'closed',name:'Cierre',icon:'lock'}],after=hasPro?'validation':'decision';
      let cur=after,halt=null;
      switch(s){
        case 'draft':cur='filed';halt={label:'Borrador',icon:'edit'};break;
        case 'pending':cur=after;break;
        case 'in_review':cur=hasPro&&r.professional_result!=='favorable'?'validation':'decision';break;
        case 'returned':cur=after;halt={label:'Devuelta',icon:'undo'};break;
        case 'rejected':cur='decision';halt={label:'Rechazada',icon:'reject'};break;
        case 'cancelled':cur=after;halt={label:'Cancelada',icon:'ban'};break;
        case 'approved':case 'pending_execution':case 'validated':cur='closed';break;   // aprobadas antes del cierre automático: falta cerrarlas
        case 'closed':cur=null;break;                                                  // la aprobación del jefe cierra la solicitud
      }
      const n=defs.length,ci=cur==null?n:defs.findIndex(d=>d.k===cur),last=st=>hist.find(h=>h.to_status===st)||null,   // el historial llega del más reciente al más antiguo
        fromHist=h=>h?{who:h.profiles?.full_name||personName(h.actor_id,'Usuario'),when:h.created_at,note:drNote(h.comment)}:null;
      const ev={
        filed:{who:r.profiles?.full_name||state.profile.full_name,when:r.submitted_at||r.created_at,tag:s==='draft'?'Borrador guardado':'Solicitud radicada'},
        validation:r.professional_result?{who:personName(r.professional_by,'Profesional'),when:r.professional_at,note:drNote(r.professional_comment),tag:r.professional_result==='favorable'?'Validación favorable':'Validación no favorable'}:{},
        decision:r.decided_by?{who:personName(r.decided_by,'Jefe'),when:r.decided_at,note:drNote((last(s==='rejected'?'rejected':'approved')||{}).comment),tag:s==='rejected'?'Rechazada por el jefe':'Aprobada por el jefe'}
          :(last(s==='rejected'?'rejected':'approved')?{...fromHist(last(s==='rejected'?'rejected':'approved')),tag:s==='rejected'?'Rechazada por el jefe':'Aprobada por el jefe'}:{}),
        closed:s==='closed'?{...(fromHist(last('closed'))||{}),when:r.closed_at||last('closed')?.created_at,tag:'Solicitud cerrada'}:{}
      };
      if(halt&&cur){const h=fromHist(last(s));if(h)ev[cur]={...ev[cur],...h,tag:s==='returned'?'Devuelta para correcciones':s==='cancelled'?'Solicitud cancelada':s==='rejected'?'Rechazada por el jefe':ev[cur]?.tag}}
      const stages=defs.map((d,i)=>{
        const st=i<ci?'done':i===ci?(halt?'halt':'current'):'todo',e=ev[d.k]||{};
        return {...d,i,st,label:st==='done'?'Completada':st==='current'?'En curso':st==='halt'?halt.label:'Pendiente',who:e.who||'',when:e.when||'',note:e.note||'',tag:e.tag||'',icon:st==='halt'?halt.icon:d.icon};
      });
      const headline={draft:'Borrador: aún no se envía',returned:'Devuelta para correcciones',rejected:'Solicitud rechazada',cancelled:'Solicitud cancelada',closed:r.approved_hours!=null?'Aprobada y cerrada':'Solicitud cerrada',approved:'Aprobada · pendiente de cerrar',pending_execution:'Aprobada · pendiente de cerrar',validated:'Aprobada · pendiente de cerrar'}[s]||(cur==='validation'?'Esperando validación del profesional':'Esperando decisión del jefe');
      return {stages,n,ci,tone:DR_TONE[s]||'info',headline,step:s==='closed'?'Trámite completo':`Paso ${Math.min(ci+1,n)} de ${n}`,sel:Math.min(ci,n-1)};
    }
    function drPane(s,m){
      const color=s.st==='done'?'var(--dr-g)':s.st==='todo'?'rgba(255,255,255,.3)':'var(--st)',meta=[s.who,s.when?fmtDateTime(s.when):''].filter(Boolean).map(esc).join(' · ');
      const hint=s.st==='todo'?'Esta etapa aún no se alcanza.':(drStageHint[s.k]?.current)||'Sin registros en esta etapa.';
      return `<div class="dr-pn" id="drPn${s.i}" data-i="${s.i}" style="--sc:${color}"${s.i===m.sel?'':' hidden'}><div class="dr-pn-top"><strong>${esc(s.name)}</strong><span class="dr-pn-tag">${esc(s.tag||s.label)}</span></div>${meta?`<p class="dr-pn-meta">${meta}</p>`:''}${s.note?`<p class="dr-pn-note dr-clamp">“${esc(s.note)}”</p><button type="button" class="dr-more" aria-expanded="false" hidden>Ver más</button>`:''}${!meta&&!s.note?`<p class="dr-pn-meta is-hint">${esc(hint)}</p>`:''}</div>`;
    }
    function drTrack(m){
      const items=m.stages.map(s=>`<li class="dr-st is-${s.st}" style="--i:${s.i}"><span class="dr-seg" aria-hidden="true"></span><button type="button" class="dr-btn" data-i="${s.i}" aria-pressed="${s.i===m.sel}" aria-controls="drPn${s.i}"${s.st==='current'||s.st==='halt'?' aria-current="step"':''}><span class="dr-node" aria-hidden="true">${s.st==='done'?DR_CHECK:vectorIcon(s.icon)}${s.st==='current'?'<i class="dr-ring"></i>':''}</span><span class="dr-txt"><span class="dr-name">${esc(s.name)}</span><span class="dr-state">${esc(s.label)}</span>${s.when?`<time class="dr-when" datetime="${esc(s.when)}">${esc(fmtDateTime(s.when))}</time>`:''}</span></button></li>`).join('');
      return `<ol class="dr-stages" style="--n:${m.n}" aria-label="Avance del trámite">${items}</ol><div class="dr-info" aria-live="polite">${m.stages.map(s=>drPane(s,m)).join('')}</div>`;
    }
    function drHead(r,m){
      const who=r.profiles?.full_name||state.profile.full_name,dep=r.departments?.name||state.profile.departments?.name||'';
      return `<header class="dr-head"><div class="dr-top"><div class="dr-id"><span class="dr-eyebrow">Detalle de solicitud</span><div class="dr-title"><h3 id="drTitle">${esc(r.filing_number)}</h3><span class="dr-chip">${esc(STATUS[r.status]||r.status)}</span></div><p class="dr-sub">${esc(who)}${dep?` · ${esc(dep)}`:''}</p></div><button type="button" class="close-modal dr-close" onclick="App.closeModal()" aria-label="Cerrar detalle">${vectorIcon('close')}</button></div><div class="dr-now"><strong>${esc(m.headline)}</strong><span>${esc(m.step)}</span></div>${drTrack(m)}</header>`;
    }
    function drJornada(r){
      const name=r.work_types?.name||(state.workTypes||[]).find(w=>w.id===r.work_type_id)?.name||'',key=Object.keys(JORNADA_META).find(k=>JORNADA_META[k].match.test(normText(name)))||null;
      return {name,key,tone:key==='night'?'violet':key==='day'?'amber':'blue',icon:key==='night'?MOON_ICON:key==='day'?SUN_ICON:TIME_ICON};
    }
    function drFigures(r){
      const ap=approvedHoursOf(r),req=Number(r.hours_requested),dow=isoWeekday(r.execution_date),flag=isColombianHoliday(r.execution_date)?'Festivo':dow===7?'Domingo':'',
        crosses=r.end_time&&r.start_time&&String(r.end_time).slice(0,5)<=String(r.start_time).slice(0,5),delta=ap!=null?Math.round((ap-req)*100)/100:null,share=ap!=null&&req>0?Math.max(0,Math.min(100,ap/req*100)):0;
      const fig=(tone,icon,label,val,cap,extra,cls,d)=>`<div class="dr-fig ${cls||''}" style="--fx:var(--dr-${tone});--fx-ink:var(--dr-${tone}-ink);--d:${d}" data-r><span class="dr-fig-i" aria-hidden="true">${icon}</span><dt class="dr-lab">${label}</dt><dd class="dr-val">${val}</dd>${cap?`<dd class="dr-cap">${cap}</dd>`:''}${extra||''}</div>`;
      return `<dl class="dr-figs" aria-label="Datos principales">
        ${fig('blue',vectorIcon('calendar'),'Fecha',esc(fmtDate(r.execution_date)),`${esc(mdWeekday(r.execution_date))}${flag?` · <span class="dr-flag">${flag}</span>`:''}`,'','',0)}
        ${fig('violet',TIME_ICON,'Horario',`<span class="dr-nw">${esc(fmtTime12(r.start_time))}</span> – <span class="dr-nw">${esc(fmtTime12(r.end_time))}</span>`,crosses?'Termina al día siguiente':'','','',1)}
        ${fig('cyan',vectorIcon('hourglass'),'Solicitadas',`${num(req)}<span class="dr-unit"> h</span>`,'','','',2)}
        ${ap==null?fig('slate',vectorIcon('check'),'Aprobadas','—','Sin aprobar','','is-empty',3):fig('green',vectorIcon('check'),'Aprobadas',`${num(ap)}<span class="dr-unit"> h</span>`,delta?`${delta>0?'+':'−'}${num(Math.abs(delta))} h vs. solicitado`:'Igual a lo solicitado',`<div class="dr-meter" aria-hidden="true"><i style="--w:${share.toFixed(1)}%"></i></div>`,'',3)}
      </dl>`;
    }
    // Franja de 24 h: muestra en qué parte del día cae el horario (diurno 6:00–19:00, nocturno el resto) con los mismos límites que usa el aplicativo.
    function drDay(r){
      const s=hmMin(r.start_time),e0=hmMin(r.end_time);if(s==null||e0==null)return '';
      const e=e0<=s?e0+1440:e0,at=m=>(m/1440*100).toFixed(2),segs=e>1440?[[s,1440],[0,e-1440]]:[[s,e]],j=drJornada(r);
      return `<section class="dr-day" style="--rc:var(--dr-${j.tone});--d:4" data-r aria-label="Franja del día"><div class="dr-day-top"><span class="dr-lab">Franja del día</span><span class="dr-leg"><span><i class="d"></i>Diurna 6:00 a. m. – 7:00 p. m.</span><span><i class="n"></i>Nocturna</span></span></div>
        <div class="dr-bar" role="img" aria-label="Horario de ${esc(fmtTime12(r.start_time))} a ${esc(fmtTime12(r.end_time))}">${JORNADA_BANDS.map(b=>`<span class="dr-band dr-band--${b.key}" style="left:${at(b.from)}%;width:${at(b.to-b.from)}%"></span>`).join('')}${segs.map(([a,b])=>`<span class="dr-run" style="left:${at(a)}%;width:${at(b-a)}%"></span>`).join('')}</div>
        <div class="dr-scale" aria-hidden="true"><span>12 a. m.</span><span>6 a. m.</span><span>12 m.</span><span>6 p. m.</span><span>12 a. m.</span></div></section>`;
    }
    function drWho(r){
      const name=r.profiles?.full_name||state.profile.full_name,dep=r.departments?.name||state.profile.departments?.name||'',filed=r.submitted_at||r.created_at,j=drJornada(r);
      return `<section class="dr-sec dr-who" aria-label="Solicitante" style="--d:5" data-r><span class="dr-av" aria-hidden="true">${esc(initials(name))}</span><div class="dr-who-t"><strong>${esc(name)}</strong><span>${dep?esc(dep):'Sin dependencia'}</span></div>
        <div class="dr-chips">${j.name?`<span class="dr-tag" title="Tipo de jornada" style="--tg:var(--dr-${j.tone});--tg-ink:var(--dr-${j.tone}-ink)">${j.icon}${esc(j.name)}</span>`:''}${filed?`<span class="dr-tag" title="Fecha de radicación" style="--tg:var(--dr-slate);--tg-ink:var(--dr-slate-ink)">${vectorIcon('calendar')}Radicada ${esc(fmtDateTime(filed))}</span>`:''}</div></section>`;
    }
    function drReasons(r){
      const acts=getStructuredActivities(r),summary=acts.map(x=>x.name).join('; '),extra=r.activities&&r.activities!==summary?r.activities:'';
      return `<section class="dr-sec" aria-labelledby="drH2" style="--d:6" data-r>${drHead2('violet',vectorIcon('message'),'Motivos y actividades').replace('<h4 ','<h4 id="drH2" ')}
        ${acts.length?`<ul class="dr-acts">${acts.map(x=>`<li class="dr-tag${x.custom?' is-custom':''}"${x.custom?' title="Actividad escrita por el solicitante"':''}>${esc(x.name)}</li>`).join('')}</ul>`:''}
        <div class="dr-quote"><span class="dr-lab">Justificación</span><p>${esc(r.justification)||mdDash}</p></div>
        ${extra?`<div class="dr-quote"><span class="dr-lab">Detalle histórico</span><p>${esc(extra)}</p></div>`:''}
        ${r.admin_observations?`<div class="dr-obs" role="note"><span class="dr-lab">Observación administrativa</span><p>${esc(r.admin_observations)}</p></div>`:''}</section>`;
    }
    function drHistory(history){
      const list=history||[];
      return `<section class="dr-sec" aria-labelledby="drH3" style="--d:7" data-r>${drHead2('slate',vectorIcon('history'),'Historial',list.length).replace('<h4 ','<h4 id="drH3" ')}
        ${list.length?`<ol class="dr-tl">${list.map((h,i)=>`<li class="dr-tl-i" style="--i:${i}" data-tone="${MD_TONE[h.to_status]||'info'}"><span class="dr-tl-dot" aria-hidden="true"></span><div class="dr-tl-top"><span class="dr-tl-st">${esc(STATUS[h.to_status]||h.to_status)}</span><time datetime="${esc(h.created_at||'')}">${esc(fmtDateTime(h.created_at))}</time></div>${h.comment?`<p class="dr-clamp">${esc(h.comment)}</p><button type="button" class="dr-more" aria-expanded="false" hidden>Ver más</button>`:''}<span class="dr-meta">${esc(h.profiles?.full_name||'Usuario')}</span></li>`).join('')}</ol>`:'<p class="dr-empty">Sin movimientos registrados.</p>'}</section>`;
    }
    function drSeats(r,history){
      const res=r.professional_result,approvedSet=['approved','pending_execution','validated','closed'],hd=(history||[]).find(h=>h.to_status===(r.status==='rejected'?'rejected':'approved')),decided=!!r.decided_by||(!!hd&&(r.status==='rejected'||approvedSet.includes(r.status))),who=(id,fb,at)=>[id?esc(personName(id,fb)):'',at?esc(fmtDateTime(at)):''].filter(Boolean).join(' · ');
      const seat=(role,rx,tone,value,meta,note,icon)=>`<li class="dr-seat is-${tone}" style="--rx-ink:var(--dr-${rx}-ink)"><span class="dr-seat-i" aria-hidden="true">${icon}</span><div><div class="dr-seat-top"><span class="dr-role">${role}</span><span class="dr-res">${value}</span></div>${meta?`<span class="dr-meta">${meta}</span>`:''}${note?`<p class="dr-note">${note}</p>`:''}</div></li>`;
      const ic={ok:vectorIcon('check'),bad:vectorIcon('reject'),wait:vectorIcon('hourglass')};
      const pro=res==='favorable'?seat('Profesional','violet','ok','Favorable',who(r.professional_by,'Profesional',r.professional_at),r.professional_comment?esc(r.professional_comment):'',ic.ok)
        :res==='no_favorable'?seat('Profesional','violet','bad','No favorable · devuelta',who(r.professional_by,'Profesional',r.professional_at),r.professional_comment?esc(r.professional_comment):'',ic.bad)
        :seat('Profesional','violet','wait','Pendiente','','',ic.wait);
      const outcome=r.status==='rejected'?'Rechazada':approvedSet.includes(r.status)?'Aprobada':'Decidió',boss=decided?seat('Jefe','blue',r.status==='rejected'?'bad':'ok',outcome,(r.decided_by?who(r.decided_by,'Jefe',r.decided_at):who(hd?.actor_id,'Jefe',hd?.created_at))+msigApprovalNote(r,approvedSet),'',r.status==='rejected'?ic.bad:ic.ok):seat('Jefe','blue','wait','Pendiente','','',ic.wait);
      return `<section class="dr-sec" aria-labelledby="drH4" style="--d:3" data-r>${drHead2('violet',vectorIcon('shield'),'Validación y aprobación').replace('<h4 ','<h4 id="drH4" ')}<ol class="dr-seats">${pro}${boss}</ol></section>`;
    }
    function drMeals(r){
      const a=auxOf(r),v=auxValueOf(r),d=a.detail||{},sh=d.shift,tones=[['amber','#2B1500'],['orange','#2B1100'],['violet','#fff']];
      return `<section class="dr-sec" aria-labelledby="drH5" style="--d:4" data-r>${drHead2('amber',drI('utensils'),'Auxilios de alimentación').replace('<h4 ','<h4 id="drH5" ')}
        <ul class="dr-meals">${FOOD_KEYS.map(([k,l,n],i)=>`<li class="dr-meal${a[k]?' is-on':''}" style="--i:${i};--mx:var(--dr-${tones[i][0]});--mx-ink:var(--dr-${tones[i][0]}-ink);--mx-on:${tones[i][1]}"><b aria-hidden="true">${l}</b><span class="dr-meal-n">${esc(n)}</span><span class="dr-meal-s">${a[k]?'Aplica':'No aplica'}</span></li>`).join('')}</ul>
        <p class="dr-meta">${esc(auxStatusLabel(r))}${sh?` · Turno ${esc(sh.code)} (${esc(sh.description)})`:''}</p>${(d.notes||[]).length?`<p class="dr-meta">${d.notes.map(esc).join(' ')}</p>`:''}
        ${v.count&&isStaff()&&r.employee_id!==state.user?.id?`<div class="dr-value${v.pending?' is-pending':''}"><span class="dr-lab">Valor</span><strong>${v.pending?'Sin parametrizar':fmtMoney(v.total)}</strong>${!v.pending?`<span class="dr-meta">${v.live?'Valores vigentes':'Valores registrados al aprobar'}</span>`:''}</div>`:''}</section>`;
    }
    function drFiles(attachments){
        if(!attachments?.length)return '';
      return `<section class="dr-sec" aria-labelledby="drH6" style="--d:5" data-r>${drHead2('cyan',vectorIcon('paperclip'),'Soportes',attachments?.length||0).replace('<h4 ','<h4 id="drH6" ')}${attachments?.length?`<ul class="dr-files">${attachments.map(a=>`<li><button type="button" class="dr-file" onclick="App.downloadAttachment('${a.storage_path}','${esc(a.file_name)}')" aria-label="Abrir soporte ${esc(a.file_name)}"><span class="dr-file-i" aria-hidden="true">${vectorIcon('paperclip')}</span><span class="dr-file-n">${esc(a.file_name)}</span><span class="dr-file-a">Abrir ${drI('arrow')}</span></button></li>`).join('')}</ul>`:'<p class="dr-empty">Sin soportes adjuntos.</p>'}</section>`;
    }
    // Acceso al cálculo del costo (solo quienes pueden consultar finanzas; nunca sobre las solicitudes propias).
    function drCost(r){
      if(!canViewFinance()||approvedHoursOf(r)==null||r.employee_id===state.user?.id)return '';
      return `<section class="dr-sec" aria-labelledby="drH7" style="--d:6" data-r>${drHead2('green',drI('coin'),'Costo económico').replace('<h4 ','<h4 id="drH7" ')}<button type="button" class="btn dr-cost" onclick="App.finExplain('${esc(r.id)}')">${vectorIcon('detail')} Ver cálculo del costo</button></section>`;
    }
    // Interacción: elegir una etapa muestra su detalle (teclado: flechas, Inicio y Fin); los comentarios largos del historial se expanden.
    function drBind(){
      const root=document.querySelector('#modalRoot .dr');if(!root)return;
      const btns=[...root.querySelectorAll('.dr-btn')],panes=[...root.querySelectorAll('.dr-pn')];
      const pick=(i,focus)=>{btns.forEach((b,j)=>b.setAttribute('aria-pressed',String(j===i)));panes.forEach((p,j)=>{p.hidden=j!==i});if(focus)btns[i].focus({preventScroll:true})};
      btns.forEach((b,i)=>{
        b.addEventListener('click',()=>pick(i));
        b.addEventListener('keydown',e=>{const k=e.key,n=btns.length;let to=null;if(k==='ArrowRight'||k==='ArrowDown')to=(i+1)%n;else if(k==='ArrowLeft'||k==='ArrowUp')to=(i-1+n)%n;else if(k==='Home')to=0;else if(k==='End')to=n-1;if(to!=null){e.preventDefault();pick(to,true)}});
      });
      root.addEventListener('click',e=>{const t=e.target.closest('.dr-more');if(!t)return;const p=t.previousElementSibling,open=p.classList.toggle('is-open');t.setAttribute('aria-expanded',String(open));t.textContent=open?'Ver menos':'Ver más'});
      requestAnimationFrame(()=>root.querySelectorAll('.dr-clamp').forEach(p=>{if(p.scrollHeight>p.clientHeight+1)p.nextElementSibling?.removeAttribute('hidden')}));
    }
    async function viewRequest(id){
      const r=(isStaff()?state.adminRequests:state.requests).find(x=>x.id===id);if(!r)return;
      let history,attachments;
      {const results=await Promise.all([state.client.from('request_history').select('*,profiles(full_name)').eq('request_id',id).order('created_at',{ascending:false}),state.client.from('attachments').select('*').eq('request_id',id).order('created_at')]);history=results[0].data||[];attachments=results[1].data||[]}
      const m=drModel(r,history);
      modal(`<div class="modal modal-detail dr" data-tone="${m.tone}" aria-labelledby="drTitle">${drHead(r,m)}
        <div class="modal-body dr-body"><div class="dr-main">${drFigures(r)}${drDay(r)}${drWho(r)}${drReasons(r)}${drHistory(history)}</div>
          <aside class="dr-side" aria-label="Seguimiento">${drSeats(r,history)}${drMeals(r)}${drFiles(attachments)}${drCost(r)}</aside></div>
        <div class="modal-foot dr-foot"><div class="modal-actions act-bar">${requestActions(r)}</div></div></div>`);
      drBind();iconRefresh();
    }

    // =====================================================================================================
    // Ventanas modales y diálogos · comportamiento compartido
    // - modal(): una ventana a la vez; foco inicial, retorno del foco al cerrar, trampa de tabulación y aria-labelledby.
    // - Diálogos (confirmaciones y formularios cortos): sustituyen a SweetAlert2 con el MISMO lenguaje visual de las ventanas modales.
    //   Se dibujan en una capa propia (#dialogRoot) por encima de la ventana abierta, como antes, sin cerrarla.
    //   API compatible con la usada en la aplicación: Swal.fire(...), Swal.showValidationMessage(...), preConfirm, input, icon.
    // =====================================================================================================
    let modalOpener=null;
    const FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]):not([tabindex="-1"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const isShown=el=>!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length);
    function modal(html){
      const root=$('#modalRoot');if(!root.firstElementChild)modalOpener=document.activeElement;
      root.innerHTML=`<div class="modal-backdrop">${html}</div>`;sweepGlobals();
      const dialog=root.querySelector('.modal');
      if(dialog){dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');const h=dialog.querySelector('.modal-head h3');if(h&&!dialog.hasAttribute('aria-labelledby')){h.id=h.id||'modalTitle';dialog.setAttribute('aria-labelledby',h.id)}}
      iconRefresh();setTimeout(()=>root.querySelector('.close-modal,.modal input,.modal button')?.focus({preventScroll:true}),25);
    }
    function closeModal(){
      activeSelectClose?.();activeSelectClose=null;activeDateClose?.();activeDateClose=null;activeTimeClose?.();activeTimeClose=null;activeActivityClose?.();activeActivityClose=null;
      document.querySelectorAll('.custom-select-menu[data-modal-select="1"],.activity-menu[data-modal-activity="1"],.date-picker,.time-picker').forEach(x=>x.remove());
      const root=$('#modalRoot'),backdrop=root.firstElementChild,dialog=backdrop?.querySelector('.modal');
      if(!backdrop){root.innerHTML='';sweepGlobals();return}
      backdrop.classList.add('is-closing');dialog?.classList.add('is-closing');
      setTimeout(()=>{if(root.firstElementChild===backdrop){root.innerHTML='';sweepGlobals();const o=modalOpener;modalOpener=null;if(o&&o.isConnected&&!document.querySelector('#dialogRoot .dlg-backdrop'))o.focus?.({preventScroll:true})}},155);
    }
    // Trampa de tabulación: el foco permanece dentro de la capa superior (diálogo o ventana modal). Los selectores desplegables de la propia página la respetan.
    document.addEventListener('keydown',e=>{
      if(e.key!=='Tab'||e.defaultPrevented)return;
      if(document.querySelector('.date-picker,.time-picker:not(.is-closing),.activity-menu.is-open,.custom-select-menu.is-open'))return;
      const box=document.querySelector('#dialogRoot .dlg-backdrop:not(.is-closing) .modal')||document.querySelector('#modalRoot .modal:not(.modal-profile):not(.is-closing)');if(!box)return;
      const items=[...box.querySelectorAll(FOCUSABLE)].filter(isShown);if(!items.length){e.preventDefault();box.focus?.();return}
      const first=items[0],last=items[items.length-1],active=document.activeElement;
      if(!box.contains(active)){e.preventDefault();first.focus();return}
      if(e.shiftKey&&active===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&active===last){e.preventDefault();first.focus()}
    });
    // ---------- Diálogos ----------
    const DLG_ICON={
      question:'<circle cx="12" cy="12" r="9"></circle><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.6-2.4 2-2.4 3.7"></path><path d="M12 17.2h.01"></path>',
      info:'<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 7.9h.01"></path>',
      warning:'<path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"></path><path d="M12 9.5v4"></path><path d="M12 16.8h.01"></path>',
      success:'<circle cx="12" cy="12" r="9"></circle><path d="m8.3 12.4 2.5 2.5 5-5.4"></path>',
      error:'<circle cx="12" cy="12" r="9"></circle><path d="m9.3 9.3 5.4 5.4M14.7 9.3l-5.4 5.4"></path>'};
    const DLG_EYEBROW={question:'Confirmación',info:'Información',warning:'Atención',success:'Listo',error:'Error'};
    const dlgSvg=n=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${DLG_ICON[n]}</svg>`;
    function installDialogs(){
      let current=null;
      const layer=()=>document.getElementById('dialogRoot')||(()=>{const d=document.createElement('div');d.id='dialogRoot';document.body.appendChild(d);return d})();
      const api={
        showValidationMessage(message){current?.error(message)},
        close(){current?.dismiss()},
        fire(arg1,arg2,arg3){
          const cfg=typeof arg1==='object'&&arg1?arg1:{title:arg1,text:arg2,icon:arg3};
          if(cfg.toast){const n=document.createElement('div');n.className='toast-offline';n.style.cssText='left:auto;right:18px;transform:none;bottom:18px';n.textContent=cfg.title||cfg.text||'';document.body.appendChild(n);setTimeout(()=>n.remove(),cfg.timer||3200);return Promise.resolve({isConfirmed:true,value:true})}
          return new Promise(resolve=>{
            current?.dismiss();
            const tone=DLG_ICON[cfg.icon]?cfg.icon:'',form=!!(cfg.input||cfg.preConfirm),eyebrow=tone?DLG_EYEBROW[tone]:form?'':cfg.showCancelButton?'Confirmación':'Información',
              wide=/swal-form-grid|info-list|v2-days/.test(cfg.html||''),opener=document.activeElement,el=document.createElement('div');
            const input=cfg.input?`<div class="field dlg-field">${cfg.inputLabel?`<label for="fallbackSwalInput">${esc(cfg.inputLabel)}</label>`:''}<input id="fallbackSwalInput" class="control" type="${esc(cfg.input)}" value="${esc(cfg.inputValue||'')}" ${cfg.inputPlaceholder?`placeholder="${esc(cfg.inputPlaceholder)}"`:''} ${cfg.inputAttributes?Object.entries(cfg.inputAttributes).map(([k,v])=>`${esc(k)}="${esc(v)}"`).join(' '):''}></div>`:'';
            el.className='dlg-backdrop';
            el.innerHTML=`<div class="modal modal-dialog ${wide?'modal-md':'modal-sm'}${cfg.cls?' '+esc(cfg.cls):''}" data-tone="${tone||'neutral'}" role="${cfg.showCancelButton?'dialog':'alertdialog'}" aria-modal="true" aria-labelledby="dlgTitle" aria-describedby="dlgBody" tabindex="-1">
              <div class="modal-head"><div class="modal-head-main">${tone?`<span class="modal-head-icon">${dlgSvg(tone)}</span>`:(cfg.cfgIcon&&window.CfgUX?`<span class="modal-head-icon">${CfgUX.icon(cfg.cfgIcon)}</span>`:'')}<div class="modal-title-group">${(cfg.eyebrow||eyebrow)?`<span class="modal-eyebrow">${esc(cfg.eyebrow||eyebrow)}</span>`:''}<h3 id="dlgTitle">${esc(cfg.title||'Información')}</h3></div></div></div>
              <div class="modal-body" id="dlgBody">${cfg.html||(cfg.text?`<p class="dlg-text">${esc(cfg.text)}</p>`:'')}${input}<div id="fallbackSwalValidation" class="dlg-error hidden" role="alert"></div></div>
              <div class="modal-foot"><div class="modal-actions">${cfg.showCancelButton?`<button type="button" id="fallbackSwalCancel" class="btn btn-ghost btn-modal">${esc(cfg.cancelButtonText||'Cancelar')}</button>`:''}<button type="button" id="fallbackSwalConfirm" class="btn btn-primary btn-modal">${esc(cfg.confirmButtonText||'Aceptar')}</button></div></div></div>`;
            layer().appendChild(el);
            const box=el.querySelector('.modal'),err=el.querySelector('#fallbackSwalValidation'),confirmBtn=el.querySelector('#fallbackSwalConfirm'),cancelBtn=el.querySelector('#fallbackSwalCancel');
            let done=false,busy=false;
            const finish=result=>{if(done)return;done=true;if(current===ctl)current=null;el.classList.add('is-closing');box.classList.add('is-closing');setTimeout(()=>{el.remove();if(opener&&opener.isConnected&&!layer().querySelector('.dlg-backdrop'))opener.focus?.({preventScroll:true})},140);resolve(result)};
            const dismiss=()=>finish({isConfirmed:false,isDismissed:true,value:undefined});
            const showError=m=>{err.textContent='';const t=document.createElement('span');t.textContent=m;err.insertAdjacentHTML('afterbegin',dlgSvg('error'));err.appendChild(t);err.classList.remove('hidden')};
            const ctl={dismiss,error:showError};current=ctl;
            const confirm=async()=>{
              if(busy||done)return;err.classList.add('hidden');err.textContent='';
              let value=cfg.input?el.querySelector('#fallbackSwalInput').value:true;
              if(cfg.preConfirm){busy=true;confirmBtn.disabled=true;if(cancelBtn)cancelBtn.disabled=true;try{value=await cfg.preConfirm(value)}finally{busy=false;confirmBtn.disabled=false;if(cancelBtn)cancelBtn.disabled=false;if(!done&&!el.contains(document.activeElement))confirmBtn.focus({preventScroll:true})}
                if(!err.classList.contains('hidden')||value===false)return}
              finish({isConfirmed:true,isDismissed:false,value})};
            confirmBtn.addEventListener('click',confirm);cancelBtn?.addEventListener('click',dismiss);
            el.addEventListener('mousedown',e=>{if(e.target===el)e.preventDefault()});
            el.addEventListener('input',()=>{if(!err.classList.contains('hidden'))err.classList.add('hidden')});
            // Teclado a nivel de documento (fase de captura): Esc cierra el diálogo aunque el foco haya quedado fuera de él, y nunca llega a la ventana que está debajo.
            ctl.key=e=>{
              if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(form||cfg.showCancelButton)dismiss();else finish({isConfirmed:true,isDismissed:false,value:true});return}
              if(e.key==='Enter'&&el.contains(e.target)&&e.target.matches('input:not([type="checkbox"]):not([type="radio"])')&&!e.isComposing){e.preventDefault();confirm()}
            };
            iconRefresh();
            const firstField=el.querySelector('#dlgBody input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([readonly]):not([disabled]),#dlgBody select:not([disabled]),#dlgBody textarea:not([disabled])');
            setTimeout(()=>(firstField||confirmBtn).focus({preventScroll:true}),30);
          });
        }
      };
      document.addEventListener('keydown',e=>{if(current&&current.key)current.key(e)},true);
      window.Swal=api;
    }
    function ensureFallbackLibraries(){installDialogs()}

    // Al cerrar sesión se descartan filtros, pestañas y datos económicos en memoria (otro usuario del mismo equipo no los hereda).
    function finReset(){fxDispose();fxNumMem.clear();Object.keys(fxMem).forEach(k=>delete fxMem[k]);state.fin={tab:'summary',f:null,tables:{},hint:'',m:null};state.finCache=null;state.finFeed=null;state.salaryHistory=[];state.finSalaryRef=null;state.compensation={};state.costSnapshots={};state.unionRules=[];state.unionAssignments=[]}

    // =====================================================================================================
    // v4 · (1) «Salario base (referencia)» visible para Profesional y Jefe en Gestión financiera.
    //      (2) Catálogo de cargos y grados de funcionarios (solo el administrador lo gestiona y lo asigna).
    // (1) Los datos llegan por la función del servidor «finance_salary_reference» (solo lectura, con verificación de rol y ámbito):
    //     el historial salarial completo (salary_history) sigue siendo exclusivo del administrador. Tarifas por hora y hora base no cambian.
    // (2) Las combinaciones viven en la tabla job_grades; el funcionario guarda solo la referencia (profiles.job_grade_id), de modo que
    //     una combinación inválida no puede almacenarse. La interfaz lee siempre del catálogo cargado (state.jobGrades).
    // =====================================================================================================
    const jobCollator=intlOnce(()=>new Intl.Collator('es',{numeric:true,sensitivity:'base'}));
    // Los grados con letra (E) van primero; los numéricos, en orden ascendente.
    function gradeCmp(a,b){const na=Number(a),nb=Number(b),fa=Number.isFinite(na)&&String(a).trim()!=='',fb=Number.isFinite(nb)&&String(b).trim()!=='';if(fa&&fb)return na-nb;if(fa!==fb)return fa?1:-1;return jobCollator().compare(String(a),String(b))}
    function jobGradeSort(a,b){return jobCollator().compare(a.position_name,b.position_name)||gradeCmp(a.grade,b.grade)}
    const jobGradeById=id=>id?(state.jobGrades||[]).find(g=>g.id===id)||null:null;
    // Cargos con al menos un grado seleccionable (activo, o el que el funcionario ya tiene asignado).
    function jobPositions(list,keepId){return [...new Set((list||[]).filter(g=>g.active!==false||g.id===keepId).map(g=>g.position_name))].sort((a,b)=>jobCollator().compare(a,b))}
    function jobGradesFor(position,list,keepId){return (list||[]).filter(g=>g.position_name===position&&(g.active!==false||g.id===keepId)).sort(jobGradeSort)}
    // Validación única (formulario y simulación del servidor): vacío = sin asignar; si se elige uno, deben elegirse ambos y formar una combinación del catálogo.
    function validateJobCombo(position,grade,list,keepId){
      position=String(position??'').trim();grade=String(grade??'').trim();
      if(!position&&!grade)return {ok:true,row:null};
      if(!position)return {ok:false,error:'Selecciona el cargo.'};
      if(!grade)return {ok:false,error:'Selecciona el grado del cargo.'};
      const row=(list||[]).find(g=>g.position_name===position&&String(g.grade)===grade);
      if(!row)return {ok:false,error:'La combinación de cargo y grado no está autorizada.'};
      if(row.active===false&&row.id!==keepId)return {ok:false,error:'La combinación de cargo y grado está inactiva.'};
      return {ok:true,row};
    }
    const jobGradeLabel=g=>g?`${g.position_name} · ${g.grade}`:'';
    function jobGradeCell(p){const g=jobGradeById(p.job_grade_id);return g?`<strong>${esc(g.position_name)}</strong><div class="small muted">Grado ${esc(g.grade)}${g.active===false?' · combinación inactiva':''}</div>`:'<span class="muted">Sin asignar</span>'}
    function jobGradeOptionsHTML(position,selectedGrade,keepId){
      const opts=position?jobGradesFor(position,state.jobGrades,keepId):[];
      return `<option value="">${position?'Selecciona el grado':'Selecciona primero el cargo'}</option>`+opts.map(g=>`<option value="${esc(g.grade)}" ${g.grade===selectedGrade?'selected':''}>${esc(g.grade)}${g.active===false?' (inactivo)':''}</option>`).join('');
    }
    function jobGradeFieldsHTML(p){
      if(!state.v4Ready)return `<div class="field span-2"><label>Cargo y grado</label><div class="callout warning">El catálogo de cargos y grados no está disponible: falta aplicar la migración v4 en Supabase.</div></div>`;
      const cur=jobGradeById(p?.job_grade_id),pos=cur?.position_name||'';
      return `<div class="field"><label for="efJobPos">Cargo (descripción)</label><select id="efJobPos" class="control" name="job_position"><option value="">Sin asignar</option>${jobPositions(state.jobGrades,p?.job_grade_id).map(n=>`<option value="${esc(n)}" ${n===pos?'selected':''}>${esc(n)}</option>`).join('')}</select></div>
            <div class="field"><label for="efJobGrade">Grado</label><select id="efJobGrade" class="control" name="job_grade" ${pos?'':'disabled'}>${jobGradeOptionsHTML(pos,cur?.grade||'',p?.job_grade_id)}</select><span class="small muted">Solo se ofrecen las combinaciones autorizadas del catálogo.</span></div>`;
    }
    // Listas dependientes: al cambiar el cargo se recalculan los grados y se limpia la selección anterior.
    function bindJobGradeFields(f,p){
      const pos=f.job_position,grade=f.job_grade;if(!pos||!grade)return;
      const lock=()=>{const tr=grade.parentElement?.querySelector('.custom-select-trigger');if(tr)tr.disabled=grade.disabled};
      pos.addEventListener('change',()=>{grade.innerHTML=jobGradeOptionsHTML(pos.value,'',p?.job_grade_id);grade.disabled=!pos.value;grade.value='';grade._customRefresh?.();lock()});
      lock();
    }
    
    
    // Emula finance_salary_reference: Profesional = todos; Jefe = su dependencia.
    
    
    async function loadV4Remote(){
      const c=state.client,g=await c.from('job_grades').select('*').order('position_name').order('grade');
      if(g.error){state.v4Ready=false;state.jobGrades=[];if(!state.v4Warned&&isAdmin()){state.v4Warned=true;toast('Falta aplicar la migración v4 en Supabase (cargos y grados, salario base de referencia).','warning',errorMsg(g.error))}}
      else{state.v4Ready=true;state.jobGrades=g.data||[]}
      state.finSalaryRef=null;
      if(!isAdmin()&&isStaff()&&canViewFinance()){const r=await c.rpc('finance_salary_reference');if(!r.error){state.finSalaryRef=r.data||[]}else if(!state.v4Warned){state.v4Warned=true;toast('No fue posible cargar el salario base de referencia. Falta aplicar la migración v4.','warning',errorMsg(r.error))}}
      state.finCache=null;
    }
    // Historial salarial para la referencia mensual: el administrador usa el suyo; Profesional y Jefe, el de su ámbito (null = no cargado).
    function finSalaryHistory(){return isAdmin()?(state.salaryHistory||[]):(Array.isArray(state.finSalaryRef)?state.finSalaryRef:null)}
    function renderJobGradesPanel(){
      const box=$('#jobGradesPanel');if(!box||!isAdmin())return;
      if(!state.v4Ready){box.innerHTML='<div class="callout warning">El catálogo de cargos y grados no está disponible: falta aplicar la migración v4 en Supabase (archivo «migracion_v4_cargos_grados_salario_referencia.sql»).</div>';return}
      const list=[...(state.jobGrades||[])].sort(jobGradeSort),active=list.filter(g=>g.active!==false).length,count=id=>(state.profiles||[]).filter(p=>p.job_grade_id===id).length,assigned=(state.profiles||[]).filter(p=>p.job_grade_id).length;let last='';
      box.innerHTML=`<div class="callout">Catálogo autorizado de cargos y grados. Solo estas combinaciones se pueden asignar a un funcionario (en <strong>Funcionarios → Editar</strong>). Desactivar una combinación la retira de las nuevas asignaciones; los funcionarios que ya la tienen la conservan.</div>
        <div class="jg-meta"><span>Combinaciones: <strong>${list.length}</strong></span><span>Activas: <strong>${active}</strong></span><span>Funcionarios con cargo asignado: <strong>${assigned}</strong></span></div>
        ${list.length?`<div class="table-wrap"><table><thead><tr><th>Cargo (descripción)</th><th>Grado</th><th>Funcionarios</th><th>Estado</th><th>Acción</th></tr></thead><tbody>${list.map(g=>{const first=g.position_name!==last;last=g.position_name;return `<tr><td>${first?`<strong>${esc(g.position_name)}</strong>`:`<span class="muted">${esc(g.position_name)}</span>`}</td><td>${esc(g.grade)}</td><td>${count(g.id)}</td><td>${yesNo(g.active!==false)}</td><td><button class="btn btn-ghost btn-row" onclick="App.toggleJobGrade('${esc(g.id)}')">${g.active===false?'Activar':'Desactivar'}</button></td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">El catálogo está vacío. Ejecuta la migración v4.</div>'}`;
    }
    async function toggleJobGrade(id){
      if(!isAdmin())return toast('Solo un administrador puede modificar el catálogo de cargos y grados.','error');
      const g=jobGradeById(id);if(!g)return;const next=g.active===false,n=(state.profiles||[]).filter(p=>p.job_grade_id===id).length;
      if(!next&&n){const ok=await Swal.fire({cls:'cfg-ui cfg-acc-org',eyebrow:'Configuración · Cargos y grados',title:'Desactivar combinación',icon:'warning',text:`${n} funcionario${n===1?'':'s'} tiene${n===1?'':'n'} «${jobGradeLabel(g)}». Seguirá${n===1?'':'n'} conservándola; solo dejará de ofrecerse para nuevas asignaciones.`,showCancelButton:true,confirmButtonText:'Desactivar',cancelButtonText:'Cancelar'});if(!ok.isConfirmed)return}
      try{
        {const {data,error}=await state.client.from('job_grades').update({active:next}).eq('id',id).select('id');if(error)throw error;if(!data?.length)throw new Error('No tienes permisos para modificar el catálogo de cargos y grados.')}
        toast(next?'Combinación activada':'Combinación desactivada','success',jobGradeLabel(g));await loadAll();
      }catch(err){toast(errorMsg(err),'error')}
    }
    // =====================================================================================================
    // v6 · Firma digital del jefe inmediato
    //   · Administración (Configuración → Reglas y parámetros → Jefe inmediato): cargar, previsualizar, reemplazar y quitar la firma de cada jefe.
    //     Cada firma pertenece a UN jefe (manager_id) y es una versión inmutable: reemplazar o quitar la RETIRA, nunca la sobrescribe ni la borra.
    //   · Aprobación: al aprobar, la solicitud congela la firma vigente del jefe que aprobó (approval_signature_id). En Supabase lo hace el
    //     trigger trg_approval_signature. Cambiar la firma después NO altera lo ya aprobado.
    //   · Formato del funcionario: la firma se incorpora al PDF solo si TODAS las solicitudes incluidas tienen una aprobación válida del mismo jefe
    //     y su firma congelada. En cualquier otro caso se conserva el comportamiento anterior (espacio libre) y se explica el motivo.
    //   · Persistencia: Supabase → tabla manager_signatures + bucket privado «manager-signatures».
    // =====================================================================================================
    const MSIG_BUCKET='manager-signatures',MSIG_MAX_BYTES=2*1024*1024,MSIG_MIN_OUT_W=24,MSIG_MIN_OUT_H=12;
    state.managerSignatures=[];state.v6Ready=false;
    const msigImgCache=new Map();   // id de versión → Promise<{id,url,w,h,rgb}> (las versiones son inmutables, por eso se pueden conservar en memoria mientras dure la sesión)
    const msigManagers=()=>[...(state.profiles||[])].filter(p=>p.role==='manager').sort((a,b)=>collator().compare(a.full_name||'',b.full_name||''));
    const msigVersions=id=>(state.managerSignatures||[]).filter(s=>s.manager_id===id).sort((a,b)=>b.version-a.version);
    const msigCurrent=id=>msigVersions(id).find(s=>!s.retired_at)||null;
    const msigUsage=sigId=>(state.adminRequests||[]).filter(r=>r.approval_signature_id===sigId).length;
    const msigBlobToDataURL=blob=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=()=>rej(fr.error||new Error('No fue posible leer la imagen de la firma.'));fr.readAsDataURL(blob)});
    async function msigHash(blob){try{if(!window.crypto?.subtle)return null;const b=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}catch(_){return null}}
    function msigReset(){msigImgCache.clear();state.managerSignatures=[];state.v6Ready=false;fmtState.msigImg=null;fmtState.msigLoading=null;fmtState.msigError=null;fmtState.msigRes=null}
    // ---------- Carga de la imagen (Supabase Storage) ----------
    function msigLoadImage(sig){
      if(!sig)return Promise.reject(new Error('La firma no está disponible.'));
      let p=msigImgCache.get(sig.id);
      if(!p){
        p=(async()=>{
          let url;
          if(sig.data_url)url=sig.data_url;
          else{if(!state.client)throw new Error('La imagen de la firma no está disponible.');const {data,error}=await state.client.storage.from(MSIG_BUCKET).download(sig.storage_path);if(error)throw error;url=await msigBlobToDataURL(data)}
          const img=new Image();img.src=url;await img.decode();
          const w=img.naturalWidth,h=img.naturalHeight,c=document.createElement('canvas');c.width=w;c.height=h;
          const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#fff';x.fillRect(0,0,w,h);x.drawImage(img,0,0);   // la transparencia se funde sobre el blanco de la hoja
          const d=x.getImageData(0,0,w,h).data,rgb=new Uint8Array(w*h*3);for(let i=0,j=0;i<d.length;i+=4){rgb[j++]=d[i];rgb[j++]=d[i+1];rgb[j++]=d[i+2]}
          return {id:sig.id,url,w,h,rgb};
        })();
        msigImgCache.set(sig.id,p);p.catch(()=>msigImgCache.delete(sig.id));
      }
      return p;
    }
    // ---------- Procesamiento de la imagen subida: valida, quita el fondo (opcional), recorta y devuelve un PNG con transparencia ----------
    function msigRender(src,removeBg){
      const {w:sw,h:sh}=sigDims(src),k=Math.min(1,SIG_WORK_MAX/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*k)),h=Math.max(1,Math.round(sh*k));
      const c=document.createElement('canvas');c.width=w;c.height=h;
      const cx=c.getContext('2d',{willReadFrequently:true});cx.imageSmoothingQuality='high';cx.drawImage(src,0,0,w,h);   // conserva la transparencia original
      const img=cx.getImageData(0,0,w,h),d=img.data;
      let transparent=false;for(let i=3;i<d.length;i+=4){if(d[i]<250){transparent=true;break}}
      if(!transparent&&removeBg){
        sigNormalize(d,w,h);   // iguala el «papel» de fotos y escaneos (sombras, luz desigual)
        for(let i=0;i<d.length;i+=4){   // luminosidad → opacidad; el color de la tinta se recupera sin el halo del fondo
          const lum=.299*d[i]+.587*d[i+1]+.114*d[i+2],a=Math.min(1,Math.max(0,(246-lum)/(246-120)));
          if(a<=0){d[i]=d[i+1]=d[i+2]=0;d[i+3]=0;continue}
          const bg=255*(1-a);d[i]=Math.max(0,Math.min(255,Math.round((d[i]-bg)/a)));d[i+1]=Math.max(0,Math.min(255,Math.round((d[i+1]-bg)/a)));d[i+2]=Math.max(0,Math.min(255,Math.round((d[i+2]-bg)/a)));d[i+3]=Math.round(a*255);
        }
        cx.putImageData(img,0,0);
      }
      let x0=w,y0=h,x1=-1,y1=-1,ink=0;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(d[i+3]>24&&(.299*d[i]+.587*d[i+1]+.114*d[i+2])<235){ink++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}
      if(ink<Math.max(25,w*h*.0002))return null;
      const m=Math.round(Math.max(x1-x0+1,y1-y0+1)*.04)+2,sx=Math.max(0,x0-m),sy=Math.max(0,y0-m),cw=Math.min(w,x1+m+1)-sx,ch=Math.min(h,y1+m+1)-sy,kk=Math.min(1,SIG_OUT_W/cw,SIG_OUT_H/ch),ow=Math.max(1,Math.round(cw*kk)),oh=Math.max(1,Math.round(ch*kk));
      const o=document.createElement('canvas');o.width=ow;o.height=oh;const ox=o.getContext('2d',{willReadFrequently:true});ox.imageSmoothingQuality='high';ox.drawImage(c,sx,sy,cw,ch,0,0,ow,oh);
      let hasAlpha=false;const od=ox.getImageData(0,0,ow,oh).data;for(let i=3;i<od.length;i+=4){if(od[i]<250){hasAlpha=true;break}}
      return {canvas:o,w:ow,h:oh,transparent:hasAlpha};
    }
    async function msigProcessFile(file,removeBg){
      if(!file||!file.size)throw sigErr('El archivo está vacío.');
      if(file.size>MSIG_MAX_BYTES)throw sigErr('La imagen pesa más de 2 MB. Reduce su tamaño e inténtalo de nuevo.');
      if(!(await sigSniff(file)))throw sigErr('Formato no permitido. Usa una imagen PNG (recomendado, con fondo transparente), JPG o WebP.');
      let bmp;try{bmp=await sigDecode(file)}catch(_){throw sigErr('No se pudo leer la imagen. Puede estar dañada; prueba con otra.')}
      try{
        const {w,h}=sigDims(bmp);
        if(Math.max(w,h)<SIG_MIN_SIDE)throw sigErr(`La imagen es demasiado pequeña (mínimo ${SIG_MIN_SIDE} píxeles por lado).`);
        if(w*h>SIG_MAX_PIXELS)throw sigErr('La imagen es demasiado grande (máximo 50 megapíxeles).');
        const r=msigRender(bmp,removeBg);
        if(!r)throw sigErr('No se detectó ninguna firma en la imagen. Verifica que el trazo se vea sobre un fondo claro o transparente.');
        if(r.w<MSIG_MIN_OUT_W||r.h<MSIG_MIN_OUT_H)throw sigErr('La firma detectada es demasiado pequeña. Usa una imagen donde la firma ocupe más espacio.');
        const blob=await new Promise(res=>r.canvas.toBlob(res,'image/png'));
        if(!blob)throw sigErr('No fue posible preparar la imagen de la firma.');
        if(blob.size>MSIG_MAX_BYTES)throw sigErr('La firma procesada pesa más de 2 MB. Usa una imagen más sencilla.');
        return {blob,url:r.canvas.toDataURL('image/png'),w:r.w,h:r.h,bytes:blob.size,transparent:r.transparent,hash:await msigHash(blob)};
      }finally{bmp.close?.()}
    }
    // ---------- Persistencia (solo administradores). bucket privado + funciones auditadas ----------
    async function msigSave(managerId,res){
      if(!canEditManager())throw new Error('Solo un administrador puede gestionar las firmas de los jefes.');
      const p=profileOf(managerId);if(!p||p.role!=='manager')throw new Error('El usuario seleccionado no tiene el rol Jefe.');
      {
        const path=`${managerId}/${crypto.randomUUID()}.png`,up=await state.client.storage.from(MSIG_BUCKET).upload(path,res.blob,{contentType:'image/png',upsert:false});
        if(up.error)throw up.error;
        const {error}=await state.client.rpc('admin_set_manager_signature',{p_manager:managerId,p_storage_path:path,p_width:res.w,p_height:res.h,p_size:res.bytes,p_sha256:res.hash||null});
        if(error){try{await state.client.storage.from(MSIG_BUCKET).remove([path])}catch(_){}throw error}
      }
      await loadAll();
    }
    async function msigRemove(managerId){
      if(!canEditManager())throw new Error('Solo un administrador puede gestionar las firmas de los jefes.');
      {const {error}=await state.client.rpc('admin_remove_manager_signature',{p_manager:managerId});if(error)throw error}
      await loadAll();
    }
    // ---------- Administración: sección dentro de «Jefe inmediato» ----------
    const msigStatusOf=s=>!s.retired_at?['Vigente','st-approved']:s.retire_reason==='removed'?['Retirada','st-cancelled']:['Reemplazada','st-cancelled'];
    function msigSectionHTML(){
      const mgrs=msigManagers();
      const rows=mgrs.map(p=>{
        const cur=msigCurrent(p.id),n=msigVersions(p.id).length;
        return `<tr><td><strong>${esc(p.full_name)}</strong>${p.active===false?' <span class="status st-cancelled">Inactivo</span>':''}<div class="small muted">${esc(p.email||'')}</div></td>
          <td>${esc(p.departments?.name||'Sin dependencia')}</td>
          <td>${cur?`<figure class="msig-thumb" data-msig-thumb="${esc(cur.id)}" aria-label="Firma vigente de ${esc(p.full_name)}"><span class="msig-loading">Cargando…</span></figure>`:'<span class="status st-returned">Sin firma</span>'}</td>
          <td>${cur?`<strong>Versión ${cur.version}</strong><div class="small muted">Desde ${esc(fmtDateTime(cur.created_at))}<br>por ${esc(who(cur.created_by))}</div>`:'<span class="muted">—</span>'}</td>
          <td><div class="table-actions"><button type="button" class="btn btn-ghost btn-row" data-msig="edit" data-id="${esc(p.id)}" aria-label="${cur?'Reemplazar':'Cargar'} la firma de ${esc(p.full_name)}">${cur?'Reemplazar':'Cargar firma'}</button>${n?`<button type="button" class="btn btn-ghost btn-row" data-msig="history" data-id="${esc(p.id)}">Historial (${n})</button>`:''}${cur?`<button type="button" class="btn btn-ghost btn-row" data-msig="remove" data-id="${esc(p.id)}">Quitar</button>`:''}</div></td></tr>`;
      }).join('');
      const warn=!state.v6Ready?'<div class="callout warning" style="margin-bottom:10px">Falta aplicar la migración v6 en Supabase (firma digital del jefe inmediato): archivo «migracion_v6_firma_jefe.sql».</div>':'';
      return `<section id="msigCard" class="form-section section-schedule manager-card msig-card" style="margin-bottom:14px" aria-labelledby="msigH">
        <h4 id="msigH">${vectorIcon('edit')} Firma del jefe inmediato <span class="section-kicker">Formato de horas extras</span></h4>
        <p class="small muted msig-lead">Cada jefe tiene su propia firma. Se inserta automáticamente en el formato de horas extras de las solicitudes que ese jefe aprobó, sin que el funcionario tenga que agregarla. ${('Se guarda de forma privada en el servidor, no en el navegador.')}</p>
        ${warn}${mgrs.length?`<div class="table-wrap"><table><thead><tr><th>Jefe</th><th>Dependencia</th><th>Firma vigente</th><th>Versión</th><th>Acciones</th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="callout warning">No hay usuarios con rol Jefe. Asigna ese rol en <strong>Funcionarios → Editar</strong> para poder registrar su firma.</div>'}
        <p class="small muted fmt-note">Al aprobar una solicitud queda registrada la versión de la firma vigente de quien aprobó. Si luego reemplazas o quitas la firma, las solicitudes ya aprobadas conservan la que tenían; la nueva solo aplica a aprobaciones posteriores. Si un jefe no tiene firma, sus aprobaciones no incluyen firma y el espacio del formato queda libre.</p></section>`;
    }
    function msigHydrate(root){
      (root||document).querySelectorAll('[data-msig-thumb]').forEach(async el=>{
        const sig=(state.managerSignatures||[]).find(s=>s.id===el.dataset.msigThumb);
        try{const img=await msigLoadImage(sig);if(!el.isConnected)return;el.textContent='';const i=new Image();i.src=img.url;i.alt=el.getAttribute('aria-label')||'Firma del jefe';el.appendChild(i)}
        catch(err){if(el.isConnected){el.textContent='';const s=document.createElement('span');s.className='msig-loading';s.textContent='No disponible';s.title=errorMsg(err);el.appendChild(s)}}
      });
    }
    function msigOpenEditor(managerId){
      if(!canEditManager())return toast('Solo un administrador puede gestionar las firmas de los jefes.','error');
      const p=profileOf(managerId);if(!p||p.role!=='manager')return toast('El usuario seleccionado no tiene el rol Jefe.','error');
      const cur=msigCurrent(managerId),used=cur?msigUsage(cur.id):0,st={file:null,res:null,busy:false};
      modal(`<div class="modal modal-request msig-modal cfg-ui cfg-acc-sys" aria-labelledby="msigTitle"><div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${vectorIcon('edit')}</span><div class="modal-title-group"><span class="modal-eyebrow">Firma del jefe inmediato</span><h3 id="msigTitle">${esc(p.full_name)}</h3><div class="small muted">${esc(p.departments?.name||'Sin dependencia')}${p.email?` · ${esc(p.email)}`:''}</div></div></div><button class="close-modal" onclick="App.closeModal()" aria-label="Cerrar ventana">${vectorIcon('close')}</button></div>
        <div class="modal-body">
          ${cur?`<div class="msig-current"><figure class="msig-thumb" data-msig-thumb="${esc(cur.id)}" aria-label="Firma vigente"><span class="msig-loading">Cargando…</span></figure><div class="msig-current-txt"><strong>Firma vigente · versión ${cur.version}</strong><span class="small muted">Cargada el ${esc(fmtDateTime(cur.created_at))} por ${esc(who(cur.created_by))}. ${used?`${used} solicitud${used===1?'':'es'} aprobada${used===1?'':'s'} con esta versión la conserva${used===1?'':'n'}.`:'Aún no hay solicitudes aprobadas con esta versión.'}</span></div></div>`:'<div class="callout">Este jefe todavía no tiene firma configurada. Mientras no la tenga, sus aprobaciones no incluirán firma en el formato.</div>'}
          <div class="form-section section-support msig-new"><h4>${vectorIcon('upload')} ${cur?'Nueva firma (reemplaza la vigente)':'Cargar firma'} <span class="section-kicker">PNG con fondo transparente</span></h4>
            <div id="msigDrop" class="dropzone" role="button" tabindex="0" aria-label="Subir la imagen de la firma. Arrastra un archivo aquí o presiona Intro para seleccionarlo">
              <div class="upload-icon-wrap">${vectorIcon('upload')}</div>
              <div class="upload-copy"><span class="upload-title">Arrastra la imagen de la firma aquí</span><span class="upload-instruction">También puedes seleccionarla desde tu dispositivo.</span><div class="upload-meta"><span class="upload-chip">PNG (recomendado), JPG o WebP</span><span class="upload-chip">Máximo 2 MB</span></div></div>
              <span class="upload-select-btn">Seleccionar imagen</span>
              <input id="msigFile" type="file" accept="image/png,image/jpeg,image/webp" aria-hidden="true" tabindex="-1">
            </div>
            <label class="sig-check"><input type="checkbox" id="msigRemoveBg" checked><span>Quitar el fondo y recortar alrededor de la firma <em>(recomendado para fotos y escaneos; un PNG que ya es transparente se conserva)</em></span></label>
            <p class="sig-msg" id="msigMsg" role="alert" hidden></p>
            <div class="msig-preview" id="msigPrev" hidden><figure class="msig-thumb msig-thumb--lg"><img id="msigPrevImg" alt="Vista previa de la nueva firma"></figure><div class="msig-current-txt"><strong>Vista previa</strong><span class="small muted" id="msigPrevMeta"></span></div></div>
          </div>
          <div class="callout">Las solicitudes ya aprobadas conservan la firma vigente al momento de su aprobación${cur?' (la versión actual se guarda en el historial)':''}; la nueva firma se usará solo en aprobaciones posteriores.</div>
        </div>
        <div class="modal-foot"><div class="modal-foot-note">${vectorIcon('shield')}<span>${('La firma se guarda de forma privada en el servidor y queda en la auditoría.')}</span></div><div class="modal-actions"><button type="button" class="btn btn-ghost btn-modal" onclick="App.closeModal()">Cancelar</button><button type="button" id="msigSave" class="btn btn-primary btn-modal" disabled>${vectorIcon('check')} ${cur?'Reemplazar firma':'Guardar firma'}</button></div></div></div>`);
      const root=$('#modalRoot'),drop=$('#msigDrop'),file=$('#msigFile'),save=$('#msigSave'),msg=m=>{const x=$('#msigMsg');x.hidden=!m;x.textContent=m||''};
      msigHydrate(root);
      const render=()=>{const r=st.res;$('#msigPrev').hidden=!r;save.disabled=!r||st.busy;if(r){$('#msigPrevImg').src=r.url;$('#msigPrevMeta').textContent=`${r.w} × ${r.h} px · ${formatFileSize(r.bytes)} · ${r.transparent?'PNG con fondo transparente':'PNG con fondo blanco'}`}};
      const run=async()=>{
        msg('');if(!st.file){st.res=null;render();return}
        drop.classList.remove('is-error','is-complete');drop.classList.add('is-processing');
        try{st.res=await msigProcessFile(st.file,$('#msigRemoveBg').checked);drop.classList.add('is-complete')}
        catch(e){st.res=null;drop.classList.add('is-error');msg(e.userMessage||'No fue posible procesar la imagen. Prueba con otra.')}
        drop.classList.remove('is-processing');render();
      };
      const pick=()=>file.click();
      drop.addEventListener('click',e=>{if(e.target!==file)pick()});drop.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick()}});
      file.addEventListener('change',async()=>{const f=file.files[0];file.value='';if(!f)return;st.file=f;await run()});
      let depth=0;drop.addEventListener('dragenter',e=>{e.preventDefault();depth++;drop.classList.add('is-dragging')});drop.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'});
      drop.addEventListener('dragleave',e=>{e.preventDefault();depth=Math.max(0,depth-1);if(!depth)drop.classList.remove('is-dragging')});
      drop.addEventListener('drop',async e=>{e.preventDefault();depth=0;drop.classList.remove('is-dragging');const fs=[...e.dataTransfer.files];if(!fs.length)return;st.file=fs[0];await run();if(fs.length>1)toast('Se usó solo la primera imagen.','info')});
      $('#msigRemoveBg').addEventListener('change',run);
      save.onclick=async()=>{
        if(!st.res||st.busy)return;
        if(cur){const ok=await Swal.fire({cls:'cfg-ui cfg-acc-sys',eyebrow:'Firma del jefe inmediato',title:'Reemplazar la firma',icon:'warning',html:`<div class="small">La firma vigente de <strong>${esc(p.full_name)}</strong> (versión ${cur.version}) pasará al historial. Las ${used} solicitud${used===1?'':'es'} ya aprobada${used===1?'':'s'} con ella la conserva${used===1?'':'n'}; la nueva se usará solo en aprobaciones posteriores.</div>`,showCancelButton:true,confirmButtonText:'Reemplazar',cancelButtonText:'Volver'});if(!ok.isConfirmed)return}
        st.busy=true;setBusy(save,true,'Guardando');
        try{await msigSave(managerId,st.res);closeModal();toast(cur?'Firma reemplazada':'Firma registrada','success',p.full_name)}
        catch(err){msg(errorMsg(err));toast(errorMsg(err),'error')}
        finally{st.busy=false;if(save.isConnected){setBusy(save,false);render()}}
      };
    }
    async function msigRemoveDialog(managerId){
      if(!canEditManager())return toast('Solo un administrador puede gestionar las firmas de los jefes.','error');
      const p=profileOf(managerId),cur=msigCurrent(managerId);if(!p||!cur)return;const used=msigUsage(cur.id);
      const ok=await Swal.fire({cls:'cfg-ui cfg-acc-sys',eyebrow:'Firma del jefe inmediato',title:'Quitar la firma',icon:'warning',html:`<div class="small">Se retirará la firma vigente (versión ${cur.version}) de <strong>${esc(p.full_name)}</strong>. Queda en el historial y las ${used} solicitud${used===1?'':'es'} ya aprobada${used===1?'':'s'} con ella la conserva${used===1?'':'n'}. Las aprobaciones nuevas no incluirán firma hasta que cargues otra.</div>`,showCancelButton:true,confirmButtonText:'Quitar firma',cancelButtonText:'Cancelar'});
      if(!ok.isConfirmed)return;
      try{await msigRemove(managerId);toast('Firma retirada','success',p.full_name)}catch(err){toast(errorMsg(err),'error')}
    }
    function msigOpenHistory(managerId){
      const p=profileOf(managerId);if(!p)return;const list=msigVersions(managerId);
      modal(`<div class="modal modal-request msig-modal msig-modal--wide cfg-ui cfg-acc-sys" aria-labelledby="msigHTitle"><div class="modal-head"><div class="modal-head-main"><span class="modal-head-icon">${vectorIcon('history')}</span><div class="modal-title-group"><span class="modal-eyebrow">Historial de firmas</span><h3 id="msigHTitle">${esc(p.full_name)}</h3><div class="small muted">Las versiones no se borran: se retiran.</div></div></div><button class="close-modal" onclick="App.closeModal()" aria-label="Cerrar ventana">${vectorIcon('close')}</button></div>
        <div class="modal-body">${list.length?`<div class="table-wrap"><table><thead><tr><th>Versión</th><th>Firma</th><th>Vigencia</th><th>Estado</th><th>Registrada por</th><th>Solicitudes</th></tr></thead><tbody>${list.map(s=>{const [lbl,cls]=msigStatusOf(s);return `<tr><td><strong>${s.version}</strong></td><td><figure class="msig-thumb" data-msig-thumb="${esc(s.id)}" aria-label="Firma versión ${s.version}"><span class="msig-loading">Cargando…</span></figure></td><td class="small">Desde ${esc(fmtDateTime(s.created_at))}<br>${s.retired_at?`hasta ${esc(fmtDateTime(s.retired_at))}`:'Vigente'}</td><td><span class="status ${cls}">${lbl}</span></td><td class="small">${esc(who(s.created_by))}${s.retired_by?`<div class="muted">Retirada por ${esc(who(s.retired_by))}</div>`:''}</td><td>${msigUsage(s.id)}</td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">Este jefe no tiene firmas registradas.</div>'}</div>
        <div class="modal-foot"><div class="modal-actions"><button type="button" class="btn btn-ghost btn-modal" onclick="App.closeModal()">Cerrar</button></div></div></div>`);
      msigHydrate($('#modalRoot'));
    }
    document.addEventListener('click',e=>{const a=e.target.closest('[data-msig]');if(!a)return;const id=a.dataset.id;({edit:()=>msigOpenEditor(id),history:()=>msigOpenHistory(id),remove:()=>msigRemoveDialog(id),retry:()=>{fmtState.msigError=null;fmtSchedule()}})[a.dataset.msig]?.()});
    // ---------- Carga de datos ----------
    
    
    async function loadV6Remote(){
      const r=await state.client.from('manager_signatures').select('*').order('manager_id').order('version',{ascending:false});
      if(r.error){state.v6Ready=false;state.managerSignatures=[];if(!state.v6Warned&&isAdmin()){state.v6Warned=true;toast('Falta aplicar la migración v6 en Supabase (firma digital del jefe inmediato).','warning',errorMsg(r.error))}return}
      state.v6Ready=true;state.managerSignatures=r.data||[];
    }
    // ---------- Aprobación → firma → documento ----------
    // Firma de UNA solicitud: solo existe si la aprobación es real y válida y la firma congelada pertenece al jefe que aprobó.
    function msigResolveRequest(r){
      if(!r||approvedHoursOf(r)==null)return {ok:false,code:'not_approved'};
      if(!r.decided_by)return {ok:false,code:'no_approver'};
      if(!r.approval_signature_id)return {ok:false,code:'no_signature'};
      const sig=(state.managerSignatures||[]).find(s=>s.id===r.approval_signature_id);
      if(!sig)return {ok:false,code:'sig_hidden'};
      if(sig.manager_id!==r.decided_by)return {ok:false,code:'mismatch'};
      return {ok:true,sig};
    }
    // Firma del FORMATO (agrupa varias solicitudes): se imprime únicamente si todas las incluidas fueron aprobadas por el mismo jefe con firma válida.
    function fmtResolveSignature(reqs){
      if(!reqs.length)return {status:'empty'};
      const per=reqs.map(r=>({r,res:msigResolveRequest(r)}));
      if(new Set(reqs.map(r=>r.decided_by).filter(Boolean)).size>1)return {status:'mixed',total:reqs.length};   // dos o más jefes distintos
      const bad=per.filter(x=>!x.res.ok);
      if(bad.length)return {status:'none',code:bad[0].res.code,missing:bad.length,total:reqs.length};
      const sig=per.map(x=>x.res.sig).reduce((a,b)=>b.version>a.version?b:a);   // mismo jefe: se usa su versión más reciente entre las congeladas en las aprobaciones incluidas
      return {status:'ok',sig,managerName:sig.manager_name||'',total:reqs.length,versions:new Set(per.map(x=>x.res.sig.id)).size};
    }
    function fmtSigRefresh(){
      const reqs=state.requests.filter(r=>fmtMonthKey(r.execution_date)===fmtState.month&&approvedHoursOf(r)!=null&&fmtState.rows.get(r.id)?.include),res=fmtResolveSignature(reqs);
      if(res.status==='ok'){
        if(fmtState.msigImg&&fmtState.msigImg.id===res.sig.id)res.img=fmtState.msigImg;
        else if(fmtState.msigError&&fmtState.msigError.id===res.sig.id)res.error=fmtState.msigError.msg;
        else if(fmtState.msigLoading!==res.sig.id){
          const id=res.sig.id;fmtState.msigLoading=id;
          msigLoadImage(res.sig).then(img=>{fmtState.msigImg=img;fmtState.msigLoading=null;if($('#fmtPreview'))fmtSchedule()}).catch(err=>{fmtState.msigLoading=null;fmtState.msigError={id,msg:errorMsg(err)};if($('#fmtPreview'))fmtSchedule()});
        }
      }
      fmtState.msigRes=res;return res;
    }
    async function fmtEnsureSignature(){
      const res=fmtSigRefresh();if(res.status!=='ok'||res.img)return res;
      try{const img=await msigLoadImage(res.sig);fmtState.msigImg=img;fmtState.msigError=null;res.img=img}catch(err){fmtState.msigError={id:res.sig.id,msg:errorMsg(err)};res.error=errorMsg(err)}
      return res;
    }
    function msigRowChip(r){
      const x=msigResolveRequest(r);if(x.ok)return '<span class="msig-flag is-ok" title="La aprobación de esta solicitud tiene firma digital del jefe">Firma del jefe ✓</span>';
      const why={no_signature:'El jefe no tenía firma configurada cuando aprobó esta solicitud.',no_approver:'No se registró qué jefe aprobó esta solicitud.',sig_hidden:'No fue posible verificar la firma de esta aprobación.',mismatch:'La firma registrada no corresponde al jefe que aprobó.'}[x.code]||'Sin firma del jefe.';
      return `<span class="msig-flag is-none" title="${esc(why)}">Sin firma del jefe</span>`;
    }
    function fmtReadyText(){const r=fmtState.msigRes,parts=[];if(fmtState.sig)parts.push('tu firma');if(r?.status==='ok'&&r.img)parts.push('la firma del jefe inmediato');return parts.length?`Listo para descargar. Incluye ${parts.join(' y ')} y el texto es seleccionable.`:'Listo para descargar. El PDF se genera con texto seleccionable.'}
    function fmtRenderMsigBox(res){
      const box=$('#fmtMsigBox');if(!box)return;res=res||{status:'empty'};
      const item=(tone,title,txt,extra)=>`<div class="msig-box-i is-${tone}">${extra||`<span class="msig-box-ico" aria-hidden="true">${vectorIcon(tone==='ok'?'check':'info')}</span>`}<div><strong>${title}</strong><span class="small muted">${txt}</span></div></div>`;
      let html='';
      if(res.status==='ok'){
        if(res.img)html=item('ok',`Firma de ${esc(res.managerName||'el jefe inmediato')} incluida`,`Aprobó ${res.total} solicitud${res.total===1?'':'es'} del formato. Se incorpora al PDF en el espacio «Firma jefe inmediato».${res.versions>1?` Las solicitudes se aprobaron con ${res.versions} versiones de su firma; se usa la más reciente.`:''}`,`<figure class="msig-thumb"><img src="${esc(res.img.url)}" alt="Firma del jefe inmediato"></figure>`);
        else if(res.error)html=item('warn','No se pudo cargar la firma del jefe',`${esc(res.error)} <button type="button" class="link-btn" data-msig="retry">Reintentar</button>`);
        else html=item('ok','Cargando la firma del jefe…','Se incorporará al formato automáticamente.');
      }else if(res.status==='mixed')html=item('warn','Solicitudes aprobadas por jefes distintos','La firma solo se incluye cuando todas las solicitudes del formato las aprobó el mismo jefe. Desmarca las que correspondan a otro jefe y genera un formato por cada uno.');
      else if(res.status==='none'){
        const part=res.missing<res.total;
        const txt={
          no_signature:part?`${res.missing} de ${res.total} solicitudes incluidas no tienen firma digital del jefe (no estaba configurada cuando las aprobó). Deja solo las que sí la tienen para incluirla; en este formato el espacio queda libre para firmar a mano.`:'El jefe inmediato no tenía firma digital configurada cuando aprobó estas solicitudes, así que el espacio queda libre para firmar a mano. Pide al administrador que la registre: se usará en sus próximas aprobaciones.',
          no_approver:'No se registró qué jefe aprobó alguna de las solicitudes; por seguridad no se inserta firma.',
          sig_hidden:'No fue posible verificar la firma registrada en la aprobación; por seguridad no se inserta firma.',
          mismatch:'La firma registrada no corresponde al jefe que aprobó; por seguridad no se inserta firma.'
        }[res.code]||'Sin firma digital del jefe para estas solicitudes.';
        html=item('warn','Sin firma digital del jefe inmediato',txt);
      }
      box.innerHTML=html;
    }
    // Nota de trazabilidad en el detalle de la solicitud (quién firmó la aprobación).
    function msigApprovalNote(r,approvedSet){return r&&approvedSet.includes(r.status)&&r.decided_by?(r.approval_signature_id?' · Firma digital registrada al aprobar':' · Sin firma digital al aprobar'):''}

    // ---------- v7: parámetros por usuario (persistentes en la base) y directorio de funcionarios ----------
    // Los parámetros (tema, menú compacto, «quien recibe» del formato) se guardan en la tabla user_settings mediante save_my_settings
    // (validada en el servidor). El navegador conserva solo una copia del tema para pintar sin parpadeo antes de iniciar sesión.
    let userSettingsTimer=null,userSettingsPending={};
    async function loadUserSettings(){
      state.userSettings={};state.v7Ready=false;
      try{
        const r=await state.client.from('user_settings').select('settings').eq('user_id',state.user.id).maybeSingle();
        if(r.error)throw r.error;
        state.v7Ready=true;state.userSettings=r.data&&r.data.settings&&typeof r.data.settings==='object'?r.data.settings:{};
      }catch(err){
        if(!state.v7Warned&&isAdmin()){state.v7Warned=true;toast('Falta aplicar la migración v7 en Supabase (directorio de funcionarios y parámetros por usuario).','warning',errorMsg(err))}
      }
    }
    function applyUserSettings(){
      const st=state.userSettings||{},email=state.user?.email||state.profile?.email;
      Theme.enterUser(email,st.theme);
      if(typeof st.sidebar_compact==='boolean')setSidebarCompact(st.sidebar_compact);
      if(!state.v7Ready)return;
      // Migración única: lo que antes solo vivía en este navegador pasa a la base de datos.
      if(st.theme!=='light'&&st.theme!=='dark')saveUserSetting('theme',Theme.get());
      if(typeof st.format_receiver!=='string'){
        try{const all=JSON.parse(localStorage.getItem('essa_format_prefs')||'{}')||{},k=String(email||'').toLowerCase(),old=all[k];
          if(old&&typeof old.receiver==='string'&&old.receiver.trim())saveUserSetting('format_receiver',old.receiver.replace(/[<>\u0000-\u001f]/g,'').replace(/\s+/g,' ').trim().slice(0,120));
          if(k in all){delete all[k];localStorage.setItem('essa_format_prefs',JSON.stringify(all))}}catch(_){}
      }
    }
    function saveUserSetting(key,value){
      if(!state.client||!state.user||!state.v7Ready)return;
      state.userSettings={...state.userSettings,[key]:value};userSettingsPending[key]=value;
      clearTimeout(userSettingsTimer);userSettingsTimer=setTimeout(flushUserSettings,600);
    }
    async function flushUserSettings(){
      clearTimeout(userSettingsTimer);
      const p=userSettingsPending;userSettingsPending={};
      if(!Object.keys(p).length||!state.client||!state.user||!state.v7Ready)return;
      const {data,error}=await state.client.rpc('save_my_settings',{p_settings:p});
      if(error){toast(`No fue posible guardar tus preferencias: ${errorMsg(error)}`,'warning');return}
      if(data&&typeof data==='object')state.userSettings={...state.userSettings,...data};
    }
    async function loadV7Remote(){
      state.directory=null;
      if(!isAdmin()||!state.v7Ready)return;
      const r=await state.client.rpc('admin_directory_status');
      if(r.error){toast('No fue posible consultar el directorio de funcionarios.','warning',errorMsg(r.error));return}
      state.directory=r.data||[];
      const a=await state.client.rpc('admin_account_status');
      state.accountStatus=a.error?{}:Object.fromEntries((a.data||[]).map(x=>[x.profile_id,x]));
    }
    function renderDirectoryPanel(){
      const box=$('#directoryPanel');if(!box)return;
      if(!isAdmin()){box.innerHTML='';return}
      if(!state.v7Ready){box.innerHTML='<div class="callout warning" style="margin-bottom:12px">Falta aplicar la migración v7 en Supabase (directorio de funcionarios y parámetros por usuario): archivo «migracion_v7_usuarios_directorio.sql».</div>';return}
      const d=state.directory||[];
      if(!d.length){box.innerHTML='<div class="callout" style="margin-bottom:12px">El directorio de funcionarios está vacío. Carga «carga_directorio_soporte_clientes.sql» en SQL Editor: cada persona se vincula sola al crear su cuenta.</div>';return}
      const linked=d.filter(x=>x.profile_id).length,noAcc=d.filter(x=>!x.has_account),toSync=d.filter(x=>x.has_account&&!x.profile_id);
      const chip=(n,l,tone)=>`<span class="status ${tone}" style="margin-right:6px"><strong>${n}</strong>&nbsp;${esc(l)}</span>`;
      const pending=[...toSync.map(x=>[x,'Por sincronizar']),...noAcc.map(x=>[x,'Sin cuenta'])];
      box.innerHTML=`<div class="callout" style="margin-bottom:12px"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between"><div><strong>Directorio de funcionarios</strong> <span class="small muted">· ${d.length} registrados</span><div style="margin-top:6px">${chip(linked,'vinculados','st-approved')}${chip(toSync.length,'por sincronizar',toSync.length?'st-returned':'st-draft')}${chip(noAcc.length,'sin cuenta',noAcc.length?'st-pending':'st-draft')}</div></div><button type="button" class="btn btn-secondary btn-toolbar" data-v7="sync-directory"><i data-lucide="refresh-cw"></i> Sincronizar directorio</button></div>
        ${pending.length?`<details class="v3-details" style="margin-top:10px"><summary>Pendientes de ingreso (${pending.length})</summary><div class="table-wrap"><table><thead><tr><th>Funcionario</th><th>Correo</th><th>Rol previsto</th><th>Estado</th></tr></thead><tbody>${pending.map(([x,s])=>`<tr><td>${esc(x.full_name)}</td><td>${esc(x.email)}</td><td>${esc(roleLabel(x.app_role))}</td><td>${esc(s)}</td></tr>`).join('')}</tbody></table></div></details>`:''}</div>`;
      iconRefresh();
    }
    async function syncDirectory(btn){
      if(!isAdmin())return;
      setBusy(btn,true,'Sincronizando');
      try{
        const {data,error}=await state.client.rpc('admin_sync_directory');
        if(error)throw error;
        toast(`Directorio sincronizado: ${data?.linked||0} cuentas vinculadas${data?.pending_accounts?` · ${data.pending_accounts} aún sin cuenta`:''}`,'success');
        const notes=(data?.detail||[]).filter(x=>(Array.isArray(x.notes)&&x.notes.length)||x.reason==='error');
        await loadAll();
        if(notes.length)Swal.fire({title:'Datos por revisar',html:`<div class="info-list">${notes.slice(0,25).map(x=>`<div class="info-row"><span>${esc(x.name)}</span><span class="small">${esc(x.reason==='error'?x.error:(x.notes||[]).join(' · '))}</span></div>`).join('')}</div>`,icon:'info'});
      }catch(err){toast(errorMsg(err),'error')}
      finally{setBusy(btn,false)}
    }
    document.addEventListener('click',e=>{const a=e.target.closest('[data-v7]');if(!a)return;if(a.dataset.v7==='sync-directory')syncDirectory(a)});

    // ---------- Acceso y contraseña (solo administradores) ----------
    // Las contraseñas NO se pueden ver (Supabase solo guarda el hash). El administrador ve el ESTADO de la cuenta y puede:
    //  · generar una contraseña temporal segura (se muestra una sola vez), · generar un enlace de restablecimiento de un solo uso
    //    (se entrega a mano; el aplicativo no envía correos), · restablecer a la cédula. En los dos últimos casos la persona debe crear una contraseña personal al ingresar.
    // Todo lo ejecuta la Edge Function «admin-set-password»: verifica en el servidor que quien llama es administrador activo,
    // aplica límites, revoca sesiones y registra la acción (sin secretos) en la auditoría.
    const PW_EVENT_LABEL={password_admin_link_generated:'Enlace de restablecimiento generado',password_admin_temp_assigned:'Contraseña temporal asignada',password_admin_denied:'Intento sin permisos',password_admin_rate_limited:'Acción bloqueada por límite',password_changed:'La persona cambió su contraseña',password_recovery_completed:'La persona recuperó su contraseña',password_change_reauth_failed:'Cambio fallido: contraseña actual incorrecta'};
    function accessSectionHTML(p){
      if(!isAdmin()||!p)return '';
      const st=state.accountStatus?.[p.id],self=p.id===state.user?.id,inactive=p.active===false;
      let badge,detail;
      if(!state.v7Ready||!state.accountStatus)badge='<span class="status st-draft">Sin información</span>',detail='Aplica la migración v7 para ver el estado de acceso.';
      else if(!st)badge='<span class="status st-pending">Sin cuenta</span>',detail='Esta persona aún no tiene cuenta de acceso. Créala en Authentication o con el script de aprovisionamiento.';
      else if(st.must_change_password)badge='<span class="status st-returned">Contraseña temporal</span>',detail='Aún no la ha cambiado: debe crear una contraseña personal al ingresar.';
      else badge='<span class="status st-approved">Contraseña personal</span>',detail='Ya definió su propia contraseña.';
      const last=st?.last_sign_in_at?esc(fmtDateTime(st.last_sign_in_at)):'Nunca';
      const can=!!st&&!self&&!inactive,dis=can?'':'disabled';
      const btn=(mode,label)=>`<button type="button" class="btn btn-secondary btn-toolbar" data-v7pw="${mode}" data-id="${esc(p.id)}" ${dis}>${label}</button>`;
      return `<div class="form-section section-details"><h4>${vectorIcon('shield')} Acceso y contraseña <span class="section-kicker">Solo administradores</span></h4>
        <div class="v3-kvs">${ruleLine('Estado',badge)}${ruleLine('Último ingreso',last)}</div>
        <p class="small muted" style="margin:6px 0 0">${esc(detail)}</p>
        <div class="actions" style="margin-top:8px;flex-wrap:wrap">${btn('generate','Generar contraseña temporal…')}${btn('link','Generar enlace…')}${btn('document','Restablecer a la cédula…')}</div>
        <p class="small muted fmt-note">${self?'Para cambiar tu propia contraseña usa tu perfil o «¿Olvidaste tu contraseña?».':inactive?'El perfil está inactivo: actívalo antes de gestionar su contraseña.':'Las contraseñas no se pueden consultar (solo existe su hash). Entrega la temporal por un canal seguro y solo a su titular: deberá cambiarla al ingresar. Cada acción queda en la auditoría.'}</p>
        <details class="v3-details"><summary>Actividad de contraseñas</summary><div id="pwEvents" class="small muted">Cargando…</div></details></div>`;
    }
    async function loadPasswordEvents(id){
      const box=$('#pwEvents');if(!box||!isAdmin()||!state.v7Ready)return;
      const r=await state.client.rpc('admin_password_events',{p_user:id});
      const b=$('#pwEvents');if(!b)return;
      if(r.error){b.textContent='Aplica la migración v8 para ver la actividad de contraseñas.';return}
      const rows=r.data||[];
      b.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Evento</th><th>Responsable</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${esc(fmtDateTime(x.created_at))}</td><td>${esc(PW_EVENT_LABEL[x.action]||x.action)}${x.detail?.mode?` <span class="small muted">(${esc(x.detail.mode)})</span>`:''}</td><td>${esc(x.actor_name||'Sistema')}</td></tr>`).join('')}</tbody></table></div>`:'Sin actividad registrada.';
    }
    // Muestra un dato sensible UNA sola vez (contraseña temporal o enlace). Al cerrar el diálogo el valor desaparece del DOM; no se guarda.
    async function showSecretOnce(o){
      const p=Swal.fire({title:o.title,icon:'success',confirmButtonText:'Listo, ya lo copié',
        html:`<p class="dlg-text">${esc(o.intro)}</p><div class="field dlg-field"><label for="secOut">${esc(o.label)}</label><input id="secOut" class="control" readonly value="${esc(o.value)}" spellcheck="false" autocomplete="off" style="font-family:ui-monospace,Consolas,monospace"></div><p class="small"><button type="button" class="btn btn-secondary btn-toolbar" id="secCopy">Copiar</button></p><div class="callout warning">${esc(o.warning)}</div>`});
      document.getElementById('secOut')?.addEventListener('focus',e=>e.target.select());
      document.getElementById('secCopy')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(o.value);toast('Copiado','success')}catch(_){toast('No fue posible copiar. Selecciónalo y cópialo manualmente.','warning')}});
      await p;
    }
    async function adminPasswordAction(mode,id,btn){
      if(!isAdmin())return;const p=profileOf(id);if(!p)return;
      const name=p.full_name;
      const cfg={
        link:{title:'Generar enlace de restablecimiento',icon:'warning',ok:'Generar enlace',text:`Se generará un enlace de un solo uso y con vencimiento. Quien lo tenga podrá definir la contraseña de ${name}: entrégaselo solo a ella por un canal seguro.`},
        generate:{title:'Generar contraseña temporal',icon:'warning',ok:'Generar',text:`Se generará una contraseña aleatoria para ${name}, se cerrarán sus sesiones abiertas y deberá cambiarla al ingresar. Se te mostrará una sola vez.`},
        document:{title:'Restablecer a la cédula',icon:'warning',ok:'Restablecer',text:`La contraseña de ${name} pasará a ser su número de cédula y deberá cambiarla al ingresar. Quien conozca su cédula podría entrar hasta entonces. Se cerrarán sus sesiones abiertas.`}
      }[mode];
      if(!cfg)return;
      if(mode==='document'&&String(p.document_number||'').trim().length<6)return Swal.fire('Sin cédula válida','Este perfil no tiene una cédula registrada (mínimo 6 caracteres). Regístrala antes de restablecer.','warning');
      const c=await Swal.fire({title:cfg.title,icon:cfg.icon,text:cfg.text,showCancelButton:true,confirmButtonText:cfg.ok,cancelButtonText:'Cancelar'});
      if(!c.isConfirmed)return;
      setBusy(btn,true,'Aplicando');
      try{
        const {data,error}=await state.client.functions.invoke('admin-set-password',{body:{user_id:id,mode}});
        if(error){
          let m='',srv=false;
          try{const b=await error.context?.json?.();if(b?.error){m=b.error;srv=true}}catch(_){}
          if(!srv)m='No se pudo contactar la función «admin-set-password». Verifica que esté desplegada en Supabase.';
          throw new Error(m);
        }
        if(data?.error)throw new Error(data.error);
        if(mode==='link')await showSecretOnce({title:'Enlace generado',intro:`Entrega este enlace solo a ${name}. Es de un solo uso y vence según la configuración de Supabase.`,label:'Enlace de restablecimiento',value:String(data?.link||''),warning:'Quien tenga este enlace puede cambiar la contraseña de la cuenta. No se guarda: si lo pierdes, genera otro.'});
        else if(mode==='generate')await showSecretOnce({title:'Contraseña temporal generada',intro:`Entrégasela a ${name} por un canal seguro. Deberá cambiarla al ingresar.`,label:'Contraseña temporal',value:String(data?.temporary_password||''),warning:'Se muestra una sola vez y no se almacena en ningún sitio. Si la pierdes, genera otra.'});
        else toast('Contraseña restablecida a la cédula','success','Debe cambiarla al ingresar.');
        await loadV7Remote();if($('#empForm'))openEmployeeEditor(id);
      }catch(err){toast(errorMsg(err),'error')}
      finally{setBusy(btn,false)}
    }
    document.addEventListener('click',e=>{const a=e.target.closest('[data-v7pw]');if(!a||a.disabled)return;e.preventDefault();adminPasswordAction(a.dataset.v7pw,a.dataset.id,a)});
    window.App={viewRequest,openRequestForm,requestAction,deleteRequest,downloadAttachment,editEmployee,catalogModal,closeModal,openAuxForEmployee,setAuxMode,activityModal,shiftModal,unionModal,ruleModal,laborRuleModal,changeUnion:changeUnionDialog,setSalary:salaryDialog,finExplain,toggleJobGrade,_msig:{msigResolveRequest,fmtResolveSignature,msigProcessFile,msigCurrent,msigVersions,msigSave,msigRemove,fmtSigRefresh,state},
      _calc:{computeFoodAllowances,computeOvertimeCost,classifyOvertimeMinutes,approvedOnly,approvedHoursOf,actionAllowed,isColombianHoliday},
      _v4:{validateJobCombo,jobPositions,jobGradesFor,jobGradeSort,gradeCmp,canSeeBaseSalary,finSalaryHistory},
      _v3:{fxChart,fxScale,fxVar,state,PE,mdRail,finModel,finRecords,finComp,finBounds,finAlerts,buildXlsx,finLayoutPdf,finReportModel,changeEmployeeUnion,setEmployeeSalary,setOwnUnion,ackAux,canViewFinance,todayISO,foodUnitValues,auxValueOf,costOf,renderFinance,loadAll,navigate,param}};
    // Las librerías con defer ya están ejecutadas cuando se dispara DOMContentLoaded (o fallaron y se usan los respaldos internos).
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  })();
