/* ==========================================================================================
   Motor de cálculo laboral y financiero · ÚNICA fuente de verdad de las fórmulas
   - Funciones puras (sin DOM, sin estado de la aplicación): se reutilizan en toda la interfaz y se prueban de forma automática.
   - Aritmética decimal exacta con BigInt: los importes en dinero nunca pasan por números de punto flotante.
   - Reglas con fecha de inicio y fin de vigencia: cambiar un porcentaje no altera los periodos anteriores.
   ========================================================================================== */
(function(root){
'use strict';
const E={version:'3.0'};

/* ---------- Decimales exactos ---------- */
const P10=n=>10n**BigInt(n);
function numStr(x){if(Number.isInteger(x))return String(x);let s=String(x);if(/e/i.test(s))s=x.toFixed(12).replace(/0+$/,'').replace(/\.$/,'');return s}
function dec(x){
  if(x&&typeof x==='object'&&typeof x.n==='bigint')return x;
  if(typeof x==='bigint')return {n:x,s:0};
  if(x===null||x===undefined||x===''||(typeof x==='number'&&!Number.isFinite(x)))throw new Error('Valor numérico no válido');
  const t=(typeof x==='number'?numStr(x):String(x).trim());
  const m=/^([+-]?)(\d*)(?:\.(\d*))?$/.exec(t);
  if(!m||(m[2]===''&&!m[3]))throw new Error('Valor numérico no válido: '+x);
  const f=m[3]||'';return {n:BigInt((m[1]==='-'?'-':'')+(m[2]||'0')+f),s:f.length};
}
const al=(a,b)=>{const s=Math.max(a.s,b.s);return [a.n*P10(s-a.s),b.n*P10(s-b.s),s]};
const add=(a,b)=>{const [x,y,s]=al(a,b);return {n:x+y,s}};
const mul=(a,b)=>({n:a.n*b.n,s:a.s+b.s});
const cmp=(a,b)=>{const [x,y]=al(a,b);return x<y?-1:x>y?1:0};
E.MODES=['half_up','half_down','half_even','floor','ceil'];
E.MODE_LABEL={half_up:'Al más cercano (0,5 sube)',half_down:'Al más cercano (0,5 baja)',half_even:'Al par más cercano',floor:'Hacia abajo (truncar)',ceil:'Hacia arriba'};
function divInt(n,d,mode){
  const neg=(n<0n)!==(d<0n),N=n<0n?-n:n,D=d<0n?-d:d;let q=N/D;const r=N%D,t=r*2n;let up=false;
  switch(mode){case 'floor':up=neg&&r>0n;break;case 'ceil':up=!neg&&r>0n;break;case 'half_down':up=t>D;break;case 'half_even':up=t>D||(t===D&&q%2n===1n);break;default:up=t>=D}
  if(up)q+=1n;return neg?-q:q;
}
function roundDec(a,decimals,mode){a=dec(a);if(a.s<=decimals)return a;return {n:divInt(a.n,P10(a.s-decimals),mode||'half_up'),s:decimals}}
function ratio(num,den,decimals,mode){num=dec(num);den=dec(den);if(den.n===0n)throw new Error('División por cero');return {n:divInt(num.n*P10(decimals+den.s),den.n*P10(num.s),mode||'half_up'),s:decimals}}
function toStr(a){a=dec(a);const neg=a.n<0n,s=(neg?-a.n:a.n).toString().padStart(a.s+1,'0');return (neg?'-':'')+(a.s?s.slice(0,-a.s)+'.'+s.slice(-a.s):s)}
const toNum=a=>parseFloat(toStr(a));
E.dec=dec;E.roundDec=roundDec;E.ratio=ratio;E.toNumber=toNum;E.toStr=toStr;E.mulDec=mul;E.addDec=add;E.cmpDec=cmp;
/** Redondea un número a «decimals» con el modo indicado (sin errores binarios). */
E.round=(x,decimals=0,mode='half_up')=>toNum(roundDec(dec(x),decimals,mode));

/* ---------- Categorías de hora ---------- */
E.CATS=['ord','rn','hed','hen','dd','dn','hedd','hedn'];
E.OT_CATS=['hed','hen','hedd','hedn'];
E.CAT_LABEL={ord:'Hora ordinaria diurna',rn:'Hora ordinaria nocturna (recargo nocturno)',hed:'Hora extra diurna',hen:'Hora extra nocturna',dd:'Trabajo dominical/festivo diurno',dn:'Trabajo dominical/festivo nocturno',hedd:'Hora extra diurna dominical/festiva',hedn:'Hora extra nocturna dominical/festiva'};
E.OT_LABEL={hed:'Extra diurna',hen:'Extra nocturna',hedd:'Extra diurna dominical/festiva',hedn:'Extra nocturna dominical/festiva'};
E.OT_SHORT={hed:'HED',hen:'HEN',hedd:'HEDD',hedn:'HEDN'};
E.DEFAULT_ROUNDING={base:{mode:'half_up',decimals:0},rate:{mode:'floor',decimals:0},total:{mode:'half_up',decimals:0}};
E.DEFAULT_NIGHT={start:'19:00',end:'06:00'};

/* ---------- Fechas y horas (cadenas ISO, sin zona horaria) ---------- */
const pd=iso=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(iso||'');return m?new Date(Date.UTC(+m[1],+m[2]-1,+m[3])):null};
const iso=d=>d.toISOString().slice(0,10);
const addDays=(s,n)=>{const d=pd(s);d.setUTCDate(d.getUTCDate()+n);return iso(d)};
const weekday=s=>{const d=pd(s);return ((d.getUTCDay()+6)%7)+1};   // 1 = lunes … 7 = domingo
const hm=v=>{const m=/^(\d{1,2}):(\d{2})/.exec(v||'');return m?(+m[1])*60+(+m[2]):null};
const lastDay=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
E.addDays=addDays;E.weekday=weekday;E.hm=hm;
const inRange=(r,d)=>r.active!==false&&r.valid_from<=d&&(!r.valid_to||r.valid_to>=d);
E.rulesAt=(list,d,pred)=>(list||[]).filter(r=>inRange(r,d)&&(!pred||pred(r)));
E.rangesOverlap=(a,b)=>{const e=v=>v||'9999-12-31';return a.valid_from<=e(b.valid_to)&&b.valid_from<=e(a.valid_to)};

/* ---------- Reglas laborales generales ---------- */
const FACT_FIELDS=['night_surcharge','extra_day','extra_night','holiday_surcharge'];
E.normRounding=r=>{const x=r||{},pick=(k)=>({mode:E.MODES.includes(x[k]?.mode)?x[k].mode:E.DEFAULT_ROUNDING[k].mode,decimals:Number.isInteger(x[k]?.decimals)&&x[k].decimals>=0&&x[k].decimals<=6?x[k].decimals:E.DEFAULT_ROUNDING[k].decimals});return {base:pick('base'),rate:pick('rate'),total:pick('total')}};
/** Factores totales por categoría. Los recargos se SUMAN sobre la hora base (nunca se multiplican ni se cuenta dos veces la base):
 *  extra nocturna = 1 + 0,75 (ya incluye el efecto nocturno); dominical nocturna ordinaria = 1 + recargo nocturno + recargo dominical;
 *  extra dominical diurna = 1 + extra diurna + dominical; extra dominical nocturna = 1 + extra nocturna + dominical. */
function factorsOf(rule){
  const one=dec(1),n=dec(rule.night_surcharge),xd=dec(rule.extra_day),xn=dec(rule.extra_night),h=dec(rule.holiday_surcharge);
  return {ord:one,rn:add(one,n),hed:add(one,xd),hen:add(one,xn),dd:add(one,h),dn:add(add(one,n),h),hedd:add(add(one,xd),h),hedn:add(add(one,xn),h)};
}
E.factorsOf=factorsOf;
/** Regla efectiva = regla general vigente, o (si existe) la regla específica del sindicato como sobreescritura de divisor y factores. */
E.effectiveRule=function(general,unionRule){
  const base=general?{...general}:null;
  const horizon=base?{night_start:base.night_start,night_end:base.night_end,weekly_hours:base.weekly_hours,rounding:E.normRounding(base.rounding),rate_mode:base.rate_mode||'auto',manual_rates:base.manual_rates||null,manual_source:base.manual_source||null}:{night_start:E.DEFAULT_NIGHT.start,night_end:E.DEFAULT_NIGHT.end,weekly_hours:null,rounding:E.normRounding(null),rate_mode:'auto',manual_rates:null,manual_source:null};
  if(unionRule){
    const f=base?factorsOf(base):{};const set=(k,v)=>{f[k]=v!=null&&Number(v)>0?dec(v):null};
    set('hed',unionRule.factor_hed);set('hen',unionRule.factor_hen);set('hedd',unionRule.factor_hedd);set('hedn',unionRule.factor_hedn);
    return {...horizon,source:'union',id:unionRule.id||null,valid_from:unionRule.valid_from,valid_to:unionRule.valid_to||null,monthly_divisor:Number(unionRule.hourly_divisor)>0?Number(unionRule.hourly_divisor):null,factors:f,rate_mode:'auto',manual_rates:null,manual_source:null,notes:unionRule.notes||null,legal_status:'convention'};
  }
  if(!base)return null;
  return {...horizon,source:'general',id:base.id||null,valid_from:base.valid_from,valid_to:base.valid_to||null,monthly_divisor:Number(base.monthly_divisor)>0?Number(base.monthly_divisor):null,factors:factorsOf(base),notes:base.notes||null,legal_status:base.legal_status||'pending',reference_salary:base.reference_salary??null};
};
/** Validaciones de una regla general (formulario y servidor aplican el mismo criterio). */
E.validateRule=function(r,others){
  const err=[],num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  if(!/^\d{4}-\d{2}-\d{2}$/.test(r.valid_from||''))err.push('Indica la fecha de inicio de vigencia.');
  if(r.valid_to&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.valid_to)||r.valid_to<r.valid_from))err.push('La vigencia final no puede ser anterior a la inicial.');
  if(!(num(r.weekly_hours)&&Number(r.weekly_hours)>0&&Number(r.weekly_hours)<=84))err.push('La jornada semanal debe ser mayor que 0 y de máximo 84 horas.');
  if(!(num(r.monthly_divisor)&&Number(r.monthly_divisor)>0&&Number(r.monthly_divisor)<=744))err.push('El divisor mensual debe ser mayor que 0 y de máximo 744 horas.');
  FACT_FIELDS.forEach(k=>{if(!(num(r[k])&&Number(r[k])>=0&&Number(r[k])<=5))err.push('Los recargos deben ser porcentajes entre 0 % y 500 %.')});
  if(hm(r.night_start)==null||hm(r.night_end)==null||hm(r.night_start)===hm(r.night_end))err.push('Define el inicio y el fin del periodo nocturno (deben ser distintos).');
  const rd=r.rounding||{};['base','rate','total'].forEach(k=>{if(rd[k]&&(!E.MODES.includes(rd[k].mode)||!Number.isInteger(rd[k].decimals)||rd[k].decimals<0||rd[k].decimals>6))err.push('La regla de redondeo no es válida.')});
  if(r.rate_mode==='manual'){
    const m=r.manual_rates||{};if(!E.CATS.some(c=>num(m[c])&&Number(m[c])>0))err.push('En modo manual registra al menos un valor de hora.');
    if(E.CATS.some(c=>m[c]!==undefined&&m[c]!==null&&m[c]!==''&&!(Number(m[c])>0)))err.push('Los valores manuales deben ser mayores que cero.');
    if(String(r.manual_source||'').trim().length<5)err.push('En modo manual debes registrar el origen o soporte del valor (mínimo 5 caracteres).');
  }
  if(r.active!==false&&(others||[]).some(o=>o.id!==r.id&&o.active!==false&&E.rangesOverlap(o,r)))err.push('La vigencia se cruza con otra regla activa.');
  return [...new Set(err)];
};

/* ---------- Tarifas por categoría ---------- */
E.baseHour=function(salary,rule){
  const rd=rule.rounding||E.normRounding(null);return roundDec(ratio(salary,rule.monthly_divisor,rd.base.decimals+0,rd.base.mode),rd.base.decimals,rd.base.mode);
};
/** Tabla de tarifas: valor de la hora ordinaria y de cada categoría para un salario dado. Un solo cálculo para toda la aplicación. */
E.rateTable=function(salary,rule){
  const reasons=[],rows=[],rd=rule?.rounding||E.normRounding(null);
  if(!rule)return {base:null,rows,reasons:['Sin regla vigente']};
  const manual=rule.rate_mode==='manual';let base=null;
  if(!manual){
    if(!(Number(salary)>0))reasons.push('Sin salario');
    else if(!(Number(rule.monthly_divisor)>0))reasons.push('La regla no define el divisor de horas mensuales');
    else base=E.baseHour(salary,rule);
  }
  E.CATS.forEach(c=>{
    const f=rule.factors?.[c];let rate=null,note='';
    if(manual){const v=rule.manual_rates?.[c];if(Number(v)>0){rate=dec(v);note='Valor manual'}else reasons.push(`Falta el valor manual de «${E.CAT_LABEL[c]}»`)}
    else if(!f)reasons.push(`La regla no define el factor de «${E.CAT_LABEL[c]}»`);
    else if(base)rate=roundDec(mul(base,f),rd.rate.decimals,rd.rate.mode);
    const row={cat:c,label:E.CAT_LABEL[c],factor:f?toNum(f):null,rate:rate?toNum(rate):null,note};Object.defineProperty(row,'rate_dec',{value:rate,enumerable:false});rows.push(row);
  });
  const out={base:base?toNum(base):null,rows,reasons:[...new Set(reasons)],mode:manual?'manual':'auto',rounding:rd};Object.defineProperty(out,'base_dec',{value:base,enumerable:false});return out;
};

/* ---------- Clasificación del tiempo ---------- */
const isNight=(mm,ns,ne)=>ns>ne?(mm>=ns||mm<ne):(mm>=ns&&mm<ne);
/** Minutos del intervalo por categoría de hora extra, según el periodo nocturno de la regla y el día (domingo o festivo por cada minuto). */
E.classifyMinutes=function(req,rule,isHoliday){
  const s0=hm(req?.start_time),e0=hm(req?.end_time);if(!req?.execution_date||s0==null||e0==null)return null;
  const ns=hm(rule?.night_start||E.DEFAULT_NIGHT.start),ne=hm(rule?.night_end||E.DEFAULT_NIGHT.end),s=s0,e=e0<=s0?e0+1440:e0,d0=req.execution_date,d1=addDays(d0,1),h=isHoliday||(()=>false);
  const dom=[weekday(d0)===7||h(d0),weekday(d1)===7||h(d1)],out={hed:0,hen:0,hedd:0,hedn:0};
  for(let m=s;m<e;m++){const day=m>=1440?1:0,night=isNight(m%1440,ns,ne);out[dom[day]?(night?'hedn':'hedd'):(night?'hen':'hed')]++}
  return out;
};

/* ---------- Salario y sindicato vigentes en una fecha ---------- */
E.salaryAt=function(history,empId,d,fallback){
  const mine=(history||[]).filter(h=>h.employee_id===empId);
  const vig=mine.filter(h=>h.valid_from<=d&&(!h.valid_to||h.valid_to>=d)).sort((a,b)=>b.valid_from.localeCompare(a.valid_from));
  if(vig.length)return {amount:Number(vig[0].salary),source:'history',valid_from:vig[0].valid_from,id:vig[0].id||null};
  if(!mine.length&&Number(fallback)>0)return {amount:Number(fallback),source:'unversioned',valid_from:null,id:null};
  return null;
};
E.unionAt=function(assign,profile,d){
  const mine=(assign||[]).filter(a=>a.employee_id===profile?.id);
  if(!mine.length)return {union_id:profile?.union_id||null,source:profile?.union_id?'profile':'none'};
  const vig=mine.filter(a=>a.valid_from<=d&&(!a.valid_to||a.valid_to>=d)).sort((a,b)=>b.valid_from.localeCompare(a.valid_from));
  return vig.length?{union_id:vig[0].union_id,source:'history',valid_from:vig[0].valid_from}:{union_id:null,source:'none'};
};
E.foodUnitAt=function(rules,unionId,d){
  if(!unionId)return {status:'no_union',rule:null};
  const v=E.rulesAt(rules,d,r=>r.union_id===unionId);
  return v.length===1?{status:'ok',rule:v[0]}:{status:v.length?'conflict':'none',rule:null};
};
E.validateSalaryChange=function(history,empId,amount,validFrom,opts){
  const err=[],mine=(history||[]).filter(h=>h.employee_id===empId).sort((a,b)=>b.valid_from.localeCompare(a.valid_from)),cur=mine[0]||null;
  if(!(Number(amount)>0)||!Number.isFinite(Number(amount)))err.push('El salario debe ser un valor mayor que cero.');
  else if(Number(amount)>1e10)err.push('El salario indicado no es razonable.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(validFrom||''))err.push('Indica desde qué fecha rige el nuevo salario.');
  else if(cur&&validFrom<=cur.valid_from)err.push('La fecha de vigencia debe ser posterior al inicio del salario actual ('+cur.valid_from+'); el historial no se reescribe.');
  if(cur&&Number(cur.salary)===Number(amount))err.push('El salario nuevo es igual al vigente.');
  if(String(opts?.reason||'').trim().length<5)err.push('Registra el motivo del cambio (mínimo 5 caracteres).');
  return {ok:!err.length,errors:err,close:cur&&!err.length?{id:cur.id||null,valid_to:addDays(validFrom,-1)}:null};
};
E.validateUnionChange=function(assign,profile,newUnionId,validFrom,unions,opts){
  const err=[],un=(unions||[]).find(u=>u.id===newUnionId),cur=(assign||[]).filter(a=>a.employee_id===profile?.id).sort((a,b)=>b.valid_from.localeCompare(a.valid_from))[0]||null;
  if(!newUnionId)err.push('Selecciona el nuevo sindicato.');
  else if(!un)err.push('El sindicato seleccionado no existe.');
  else if(un.active===false)err.push('El sindicato seleccionado está inactivo.');
  if(newUnionId&&profile?.union_id===newUnionId)err.push('El funcionario ya pertenece a ese sindicato.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(validFrom||''))err.push('Indica la fecha desde la cual rige el cambio.');
  else if(cur&&validFrom<=cur.valid_from)err.push('La fecha del cambio debe ser posterior al inicio de la asignación actual ('+cur.valid_from+').');
  if(opts?.requireReason!==false&&String(opts?.reason||'').trim().length<5)err.push('Registra el motivo del cambio (mínimo 5 caracteres).');
  return {ok:!err.length,errors:err,close:cur&&!err.length?{id:cur.id||null,valid_to:addDays(validFrom,-1)}:null};
};

/* ---------- Costo de una solicitud ---------- */
/** ctx: {profiles, unions, laborRules, unionRules, salaryHistory, unionAssignments, compensation, isHoliday}. opts: {hours, now}.
 *  Devuelve la instantánea completa y verificable: salario usado, divisor, tarifas, recargos, horas, regla vigente, redondeo y total. */
E.computeForRequest=function(req,ctx,opts){
  const hrs=opts?.hours;
  if(hrs==null)return {status:'not_approved',reasons:['La solicitud no tiene aprobación válida']};
  const reasons=[],d=req.execution_date,emp=(ctx.profiles||[]).find(p=>p.id===req.employee_id)||null;
  const ua=E.unionAt(ctx.unionAssignments,emp,d),union=ua.union_id?(ctx.unions||[]).find(u=>u.id===ua.union_id)||null:null;
  if(ua.union_id&&!union)reasons.push('El sindicato asignado no existe');
  const gen=E.rulesAt(ctx.laborRules,d);let general=null;
  if(gen.length>1)reasons.push('Más de una regla laboral vigente (configuración incompatible)');else general=gen[0]||null;
  let urule=null;
  if(union){const v=E.rulesAt(ctx.unionRules,d,x=>x.union_id===union.id);if(v.length>1)reasons.push('Más de una regla de sindicato vigente (configuración incompatible)');else urule=v[0]||null}
  const rule=E.effectiveRule(general,urule);
  if(!rule&&!reasons.length)reasons.push(`Sin regla laboral vigente para ${d}`);
  let sal=null;
  if(rule&&rule.rate_mode!=='manual'){
    sal=E.salaryAt(ctx.salaryHistory,req.employee_id,d,ctx.compensation?.[req.employee_id]?.base_salary);
    if(!sal)reasons.push('Sin salario vigente en la fecha de ejecución');
  }
  if(rule&&rule.rate_mode!=='manual'&&!(rule.monthly_divisor>0))reasons.push('La regla no define el divisor de horas mensuales');
  const mins=(rule&&E.classifyMinutes(req,rule,ctx.isHoliday))||{hed:0,hen:0,hedd:0,hedn:0},tot=E.OT_CATS.reduce((a,k)=>a+mins[k],0);
  const hoursDec=dec(hrs),hours={};
  E.OT_CATS.forEach(k=>{hours[k]=tot>0?toNum(roundDec(ratio(mul(hoursDec,dec(mins[k])),dec(tot),4,'half_up'),2,'half_up')):0});
  let table=null;
  if(rule&&!reasons.length){
    table=E.rateTable(sal?.amount,rule);
    E.OT_CATS.forEach(k=>{if(mins[k]>0){const row=table.rows.find(r=>r.cat===k);if(!row?.rate_dec&&!table.reasons.some(x=>x.includes('«'+E.CAT_LABEL[k]+'»')))table.reasons.push(`No hay tarifa para «${E.CAT_LABEL[k]}»`)}});
    table.reasons.filter(x=>E.OT_CATS.some(k=>mins[k]>0&&x.includes('«'+E.CAT_LABEL[k]+'»'))||/divisor|Sin salario/.test(x)).forEach(x=>reasons.push(x));
  }
  const rd=rule?.rounding||E.normRounding(null),ok=!reasons.length;
  const snap={engine:'3.0',status:ok?'ok':'pending',reasons:[...new Set(reasons)],union_id:union?.id||null,union_name:union?.name||null,union_source:ua.source,
    rule_id:rule?.id||null,rule_source:rule?.source||null,rule_valid_from:rule?.valid_from||null,rule_valid_to:rule?.valid_to||null,rule_legal_status:rule?.legal_status||null,rate_mode:rule?.rate_mode||null,manual_source:rule?.manual_source||null,
    weekly_hours:rule?.weekly_hours??null,hourly_divisor:rule?.monthly_divisor||null,night_window:rule?{start:rule.night_start,end:rule.night_end}:null,
    factors:rule?Object.fromEntries(E.OT_CATS.map(k=>[k,rule.factors?.[k]?toNum(rule.factors[k]):null])):null,
    rounding:rd,base_salary:sal?.amount??null,salary_source:sal?.source||null,salary_valid_from:sal?.valid_from||null,
    approved_hours:Number(hrs),minutes:mins,hours,base_hour_value:null,rates:null,values:null,total:null,computed_at:opts?.now||new Date().toISOString()};
  if(ok&&table){
    snap.base_hour_value=table.base;snap.rates=Object.fromEntries(E.OT_CATS.map(k=>[k,table.rows.find(r=>r.cat===k)?.rate??null]));
    snap.values={};let t=dec(0);
    E.OT_CATS.forEach(k=>{
      if(!mins[k]||!tot){snap.values[k]=0;return}
      const rate=table.rows.find(r=>r.cat===k).rate_dec,exact=ratio(mul(mul(rate,dec(mins[k])),hoursDec),dec(tot),8,'half_up'),v=roundDec(exact,rd.total.decimals,rd.total.mode);   // tarifa × horas de la categoría (exactas), un solo redondeo
      snap.values[k]=toNum(v);t=add(t,v);
    });
    snap.total=toNum(t);
  }
  return snap;
};
/** Texto de la trazabilidad de un cálculo: cada cifra con su origen. */
E.explain=function(c,fmt){
  const m=fmt||(v=>String(v)),L=[];
  if(!c||c.status==='not_approved'){return ['La solicitud no tiene aprobación válida.']}
  L.push(c.rule_source?`Regla aplicada: ${c.rule_source==='union'?'regla específica del sindicato':'regla laboral general'} vigente desde ${c.rule_valid_from}${c.rule_valid_to?' hasta '+c.rule_valid_to:''}${c.rule_legal_status==='pending'?' (pendiente de validación jurídica)':''}.`:'No hay regla vigente.');
  if(c.rate_mode==='manual')L.push(`Tarifas en modo manual. Origen: ${c.manual_source||'sin registrar'}.`);
  else{
    L.push(`Salario utilizado: ${c.base_salary!=null?m(c.base_salary):'sin definir'}${c.salary_valid_from?` (vigente desde ${c.salary_valid_from})`:''}.`);
    L.push(`Divisor mensual: ${c.hourly_divisor??'sin definir'} h${c.weekly_hours?` (jornada de ${c.weekly_hours} h semanales)`:''}. Valor de la hora ordinaria: ${c.base_hour_value!=null?m(c.base_hour_value):'—'}.`);
  }
  E.OT_CATS.forEach(k=>{const mm=c.minutes?.[k]||0;if(mm)L.push(`${E.OT_LABEL[k]}: ${c.hours[k]} h · factor ${c.factors?.[k]??'—'} · tarifa ${c.rates?.[k]!=null?m(c.rates[k]):'—'} → ${c.values?.[k]!=null?m(c.values[k]):'—'}`)});
  const r=c.rounding;if(r)L.push(`Redondeo: hora base ${E.MODE_LABEL[r.base.mode].toLowerCase()} a ${r.base.decimals} decimales; tarifa ${E.MODE_LABEL[r.rate.mode].toLowerCase()} a ${r.rate.decimals}; total ${E.MODE_LABEL[r.total.mode].toLowerCase()} a ${r.total.decimals}.`);
  if(c.status==='ok')L.push(`Total: ${m(c.total)}.`);else (c.reasons||[]).forEach(x=>L.push('Pendiente: '+x));
  return L;
};

/* ==========================================================================================
   Analítica financiera (funciones puras)
   ========================================================================================== */
const F=E.fin={};
const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
F.MONTHS=MONTHS;
F.monthKey=s=>String(s).slice(0,7);
F.monthLabel=k=>{const [y,m]=k.split('-').map(Number);return MONTHS[m-1].slice(0,3)+' '+String(y).slice(2)};
F.monthLong=k=>{const [y,m]=k.split('-').map(Number);const n=MONTHS[m-1];return n.charAt(0).toUpperCase()+n.slice(1)+' '+y};
F.addMonths=(k,n)=>{let [y,m]=k.split('-').map(Number);const t=y*12+(m-1)+n;y=Math.floor(t/12);m=t%12+1;return y+'-'+String(m).padStart(2,'0')};
F.monthRange=k=>{const [y,m]=k.split('-').map(Number);return {from:k+'-01',to:k+'-'+String(lastDay(y,m)).padStart(2,'0')}};
const fmtD=s=>{const [y,m,d]=s.split('-');return d+'/'+m+'/'+y};
/** Límites del periodo: día, mes, trimestre, año o rango personalizado. */
F.periodBounds=function(mode,val,custom){
  if(mode==='day'){const v=val||'';return {mode,from:v,to:v,label:fmtD(v),key:v}}
  if(mode==='quarter'){const m=/^(\d{4})-Q([1-4])$/.exec(val||'');if(!m)return null;const y=+m[1],q=+m[2],a=(q-1)*3+1,b=a+2;return {mode,from:`${y}-${String(a).padStart(2,'0')}-01`,to:`${y}-${String(b).padStart(2,'0')}-${String(lastDay(y,b)).padStart(2,'0')}`,label:`T${q} ${y}`,key:val}}
  if(mode==='year'){const y=+val;if(!y)return null;return {mode,from:y+'-01-01',to:y+'-12-31',label:String(y),key:String(y)}}
  if(mode==='custom'){const a=custom?.from,b=custom?.to;if(!a||!b||b<a)return null;return {mode,from:a,to:b,label:fmtD(a)+' – '+fmtD(b),key:a+'_'+b}}
  const k=val||'';if(!/^\d{4}-\d{2}$/.test(k))return null;const r=F.monthRange(k);return {mode:'month',...r,label:F.monthLong(k),key:k};
};
F.previousBounds=function(b){
  if(!b)return null;
  if(b.mode==='day'){const p=addDays(b.from,-1);return F.periodBounds('day',p)}
  if(b.mode==='month')return F.periodBounds('month',F.addMonths(b.key,-1));
  if(b.mode==='quarter'){let [y,q]=b.key.split('-Q').map(Number);q--;if(q<1){q=4;y--}return F.periodBounds('quarter',`${y}-Q${q}`)}
  if(b.mode==='year')return F.periodBounds('year',String(+b.key-1));
  const n=Math.round((pd(b.to)-pd(b.from))/864e5)+1;return F.periodBounds('custom',null,{from:addDays(b.from,-n),to:addDays(b.from,-1)});
};
F.pctChange=(cur,prev)=>prev>0?(cur-prev)/prev:null;
F.sumBy=(rows,keyFn,valFn)=>{const m=new Map();rows.forEach(r=>{const k=keyFn(r);m.set(k,(m.get(k)||0)+(valFn?valFn(r):1))});return m};
/** Proyección del mes en curso. Solo se emite con datos suficientes; en otro caso devuelve el motivo. */
F.projectMonth=function(records,ym,todayIso,opts){
  const o={minDays:7,minRecords:3,...opts},[y,m]=ym.split('-').map(Number),days=lastDay(y,m);
  if(F.monthKey(todayIso)!==ym)return {status:'not_current'};
  const day=+todayIso.slice(8,10),mine=records.filter(r=>F.monthKey(r.date)===ym&&r.date<=todayIso),toDate=mine.reduce((a,r)=>a+r.total,0);
  if(day<o.minDays||mine.length<o.minRecords)return {status:'insufficient',reason:`Se requieren al menos ${o.minDays} días transcurridos y ${o.minRecords} registros (hay ${day} día(s) y ${mine.length} registro(s)).`,toDate};
  const linear=Math.round(toDate/day*days);
  const prev=[1,2,3].map(i=>F.addMonths(ym,-i)),hist=prev.map(k=>records.filter(r=>F.monthKey(r.date)===k).reduce((a,r)=>a+r.total,0)).filter(v=>v>0);
  return {status:'ok',toDate,linear,trailing:hist.length>=3?Math.round(hist.reduce((a,b)=>a+b,0)/hist.length):null,elapsed:day,days,records:mine.length};
};
/** Solapes y duplicados entre solicitudes del mismo funcionario (solo solicitudes activas). */
F.findDuplicates=function(reqs){
  const out=[],by=new Map();
  reqs.filter(r=>!['rejected','cancelled','draft'].includes(r.status)).forEach(r=>{const k=r.employee_id+'|'+r.execution_date;if(!by.has(k))by.set(k,[]);by.get(k).push(r)});
  by.forEach(list=>{for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
    const a=list[i],b=list[j],as=hm(a.start_time),ae0=hm(a.end_time),bs=hm(b.start_time),be0=hm(b.end_time);if([as,ae0,bs,be0].some(v=>v==null))continue;
    const ae=ae0<=as?ae0+1440:ae0,be=be0<=bs?be0+1440:be0;
    if(as<be&&bs<ae)out.push({a:a.id,b:b.id,identical:as===bs&&ae===be});
  }});
  return out;
};
/** Valores atípicos con desviación absoluta mediana (robusta): señal que requiere revisión, no una irregularidad. */
F.outliers=function(entries,opts){
  const o={minPop:5,z:3.5,...opts};if(entries.length<o.minPop)return [];
  const v=entries.map(e=>e.value).sort((a,b)=>a-b),med=x=>{const s=[...x].sort((a,b)=>a-b),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2},m=med(v),mad=med(v.map(x=>Math.abs(x-m)));
  if(mad===0)return entries.filter(e=>e.value>m*2&&e.value>0).map(e=>({...e,median:m,z:null}));
  return entries.map(e=>({...e,median:m,z:0.6745*(e.value-m)/mad})).filter(e=>e.z>o.z);
};

root.PayrollEngine=E;
if(typeof module!=='undefined'&&module.exports)module.exports=E;
})(typeof window!=='undefined'?window:globalThis);
