-- =========================================================
-- Aplicativo | Gestión de Horas Extras | Instalación Supabase
-- Ejecutar completo en SQL Editor de un proyecto NUEVO.
-- Después cree usuarios en Authentication > Users y asigne
-- el primer administrador con la instrucción indicada al final.
-- =========================================================
create extension if not exists pgcrypto;

create type public.app_role as enum ('employee','admin');
create type public.request_status as enum ('draft','pending','in_review','returned','approved','rejected','pending_execution','validated','closed','cancelled');

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 120),
  code text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Usuario por completar',
  document_number text,
  email text,
  position_kind text check (position_kind is null or position_kind in ('Técnico','Profesional','Otro')),
  job_title text check (job_title is null or char_length(job_title) between 3 and 80),
  role public.app_role not null default 'employee',
  department_id uuid references public.departments(id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.work_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create table public.app_parameters (
  key text primary key,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create sequence public.overtime_filing_seq start 1;
create or replace function public.format_filing_number(p_n bigint)
returns text language sql immutable as $$
  -- HE-01, HE-02 … HE-99, HE-100 … (lpad se ajusta a la longitud real: nunca recorta números de 3 o más dígitos)
  select 'HE-'||lpad(p_n::text,greatest(2,length(p_n::text)),'0');
$$;

create table public.overtime_requests (
  id uuid primary key default gen_random_uuid(),
  filing_number text not null unique constraint overtime_requests_filing_number_format check (filing_number ~ '^HE-[0-9]{2,}$'),
  employee_id uuid not null references public.profiles(id),
  department_id uuid not null references public.departments(id),
  execution_date date not null,
  start_time time not null,
  end_time time not null,
  hours_requested numeric(7,2) not null check (hours_requested > 0 and hours_requested <= 24),
  work_type_id uuid not null references public.work_types(id),
  reason text not null check (char_length(trim(reason)) between 5 and 500),
  selected_activities jsonb not null default '[]'::jsonb check (jsonb_typeof(selected_activities)='array'),
  justification text not null check (char_length(trim(justification)) between 10 and 3000),
  activities text not null check (char_length(trim(activities)) between 10 and 4000),
  observations text,
  status public.request_status not null default 'draft',
  approved_hours numeric(7,2) check (approved_hours is null or (approved_hours >= 0 and approved_hours <= 24)),
  executed_hours numeric(7,2) check (executed_hours is null or (executed_hours >= 0 and executed_hours <= 24)),
  admin_observations text,
  submitted_at timestamptz,
  approved_at timestamptz,
  validated_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index overtime_employee_idx on public.overtime_requests(employee_id, execution_date desc);
create index overtime_admin_idx on public.overtime_requests(status, execution_date desc);
create index overtime_department_idx on public.overtime_requests(department_id);

create table public.request_history (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.overtime_requests(id) on delete cascade,
  from_status public.request_status,
  to_status public.request_status not null,
  comment text,
  approved_hours numeric(7,2),
  executed_hours numeric(7,2),
  actor_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.overtime_requests(id) on delete cascade,
  owner_id uuid not null references public.profiles(id),
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes <= 10485760),
  created_at timestamptz not null default now()
);

create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid references public.overtime_requests(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications(recipient_id, created_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin' and active=true); $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
  insert into public.profiles(id,full_name,email)
  values(new.id, coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1),'Usuario'),new.email)
  on conflict(id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Sincroniza usuarios creados antes de instalar este esquema.
insert into public.profiles(id,full_name,email)
select id,coalesce(raw_user_meta_data->>'full_name',split_part(email,'@',1),'Usuario'),email
from auth.users on conflict(id) do nothing;

create or replace function public.compute_request_hours()
returns trigger language plpgsql as $$
declare s timestamp; e timestamp; configured_max numeric;
begin
  s := new.execution_date + new.start_time;
  e := new.execution_date + new.end_time;
  if e <= s then e := e + interval '1 day'; end if;
  new.hours_requested := round((extract(epoch from (e-s))/3600.0)::numeric,2);
  if new.hours_requested <= 0 or new.hours_requested > 24 then raise exception 'La duración debe ser mayor a 0 y máximo de 24 horas'; end if;
  select case when value='null'::jsonb then null else (value #>> '{}')::numeric end
    into configured_max from public.app_parameters where key='max_hours_per_request';
  if configured_max is not null and new.hours_requested > configured_max then
    raise exception 'La duración supera el límite institucional configurado de % horas',configured_max;
  end if;
  new.updated_at := now(); return new;
end $$;
create trigger trg_compute_hours before insert or update of execution_date,start_time,end_time on public.overtime_requests for each row execute function public.compute_request_hours();
create or replace function public.block_admin_self_requests()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  -- Defensa en profundidad: ninguna ruta (RPC, SQL directo o futuras funciones) puede insertar una solicitud a nombre de un administrador.
  if exists(select 1 from public.profiles where id=new.employee_id and role='admin') then
    raise exception 'Como administrador, no puedes crear solicitudes de horas extras para ti mismo';
  end if;
  return new;
end $$;
create trigger trg_block_admin_self_requests before insert on public.overtime_requests for each row execute function public.block_admin_self_requests();

create or replace function public.save_overtime_request(p_request_id uuid, p_data jsonb, p_submit boolean default false)
returns public.overtime_requests language plpgsql security definer set search_path=public as $$
declare r public.overtime_requests; v_dept uuid; v_status public.request_status; v_old_status public.request_status; v_start timestamp; v_end timestamp; v_selected jsonb;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Como administrador, no puedes crear solicitudes de horas extras para ti mismo'; end if;
  select department_id into v_dept from public.profiles where id=auth.uid() and active=true;
  if v_dept is null then raise exception 'El perfil no tiene una dependencia activa asignada'; end if;
  if not exists(select 1 from public.work_types where id=(p_data->>'work_type_id')::uuid and active=true) then raise exception 'El tipo de jornada no es válido o está inactivo'; end if;
  v_start := (p_data->>'execution_date')::date + (p_data->>'start_time')::time;
  v_end := (p_data->>'execution_date')::date + (p_data->>'end_time')::time;
  if v_end <= v_start then v_end := v_end + interval '1 day'; end if;
  v_selected := coalesce(p_data->'selected_activities','[]'::jsonb);
  if jsonb_typeof(v_selected)<>'array' or jsonb_array_length(v_selected)=0 then raise exception 'Debe seleccionar al menos una actividad'; end if;
  if p_submit and exists(
    select 1 from public.overtime_requests x where x.employee_id=auth.uid() and x.id<>coalesce(p_request_id,gen_random_uuid())
      and x.status not in ('rejected','cancelled')
      and tsrange(x.execution_date+x.start_time, x.execution_date+x.end_time + case when x.end_time<=x.start_time then interval '1 day' else interval '0' end,'[)')
          && tsrange(v_start,v_end,'[)')
  ) then raise exception 'Existe una solicitud duplicada o que se solapa con este horario'; end if;
  v_status := case when p_submit then 'pending'::public.request_status else 'draft'::public.request_status end;
  if p_request_id is null then
    insert into public.overtime_requests(filing_number,employee_id,department_id,execution_date,start_time,end_time,hours_requested,work_type_id,reason,selected_activities,justification,activities,observations,status,submitted_at)
    values(public.format_filing_number(nextval('public.overtime_filing_seq')),auth.uid(),v_dept,(p_data->>'execution_date')::date,(p_data->>'start_time')::time,(p_data->>'end_time')::time,1,(p_data->>'work_type_id')::uuid,trim(p_data->>'reason'),v_selected,trim(p_data->>'justification'),trim(p_data->>'activities'),null,v_status,case when p_submit then now() end)
    returning * into r;
    insert into public.request_history(request_id,to_status,comment,actor_id) values(r.id,v_status,case when p_submit then 'Solicitud creada y enviada' else 'Borrador guardado' end,auth.uid());
  else
    select * into r from public.overtime_requests where id=p_request_id and employee_id=auth.uid() for update;
    if not found then raise exception 'Solicitud no encontrada'; end if;
    if r.status not in ('draft','returned') then raise exception 'La solicitud ya no admite edición'; end if;
    v_old_status := r.status;
    update public.overtime_requests set execution_date=(p_data->>'execution_date')::date,start_time=(p_data->>'start_time')::time,end_time=(p_data->>'end_time')::time,work_type_id=(p_data->>'work_type_id')::uuid,reason=trim(p_data->>'reason'),selected_activities=v_selected,justification=trim(p_data->>'justification'),activities=trim(p_data->>'activities'),status=v_status,submitted_at=case when p_submit then now() else submitted_at end where id=p_request_id returning * into r;
    insert into public.request_history(request_id,from_status,to_status,comment,actor_id) values(r.id,v_old_status,v_status,case when p_submit then 'Solicitud corregida y enviada' else 'Borrador actualizado' end,auth.uid());
  end if;
  if p_submit then
    insert into public.notifications(recipient_id,request_id,title,message)
      select id,r.id,'Nueva solicitud por revisar','Se recibió la solicitud '||r.filing_number from public.profiles where role='admin' and active=true;
  end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,new_data) values(auth.uid(),case when p_submit then 'submit' else 'save_draft' end,'overtime_request',r.id::text,to_jsonb(r));
  return r;
end $$;

create or replace function public.perform_request_action(p_request_id uuid,p_action text,p_comment text default null,p_hours numeric default null)
returns public.overtime_requests language plpgsql security definer set search_path=public as $$
declare r public.overtime_requests; old_status public.request_status; new_status public.request_status; admin_needed boolean:=true; approval_comment_required boolean:=false; execution_max_approved boolean:=false;
begin
  select * into r from public.overtime_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  old_status:=r.status;
  case p_action
    when 'start_review' then new_status:='in_review';
    when 'return' then new_status:='returned';
    when 'approve' then new_status:='approved';
    when 'reject' then new_status:='rejected';
    when 'mark_pending_execution' then new_status:='pending_execution';
    when 'validate_execution' then new_status:='validated';
    when 'close' then new_status:='closed';
    when 'cancel' then new_status:='cancelled'; admin_needed:=false;
    else raise exception 'Acción no permitida';
  end case;
  if admin_needed and not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  if not admin_needed and auth.uid()<>r.employee_id and not public.is_admin() then raise exception 'Acceso denegado'; end if;
  if (p_action='start_review' and old_status<>'pending') or (p_action in ('return','approve','reject') and old_status not in ('pending','in_review')) or (p_action='mark_pending_execution' and old_status<>'approved') or (p_action='validate_execution' and old_status not in ('approved','pending_execution')) or (p_action='close' and old_status<>'validated') or (p_action='cancel' and old_status not in ('draft','pending','returned')) then raise exception 'Transición de estado no permitida'; end if;
  if p_action in ('return','reject') and char_length(trim(coalesce(p_comment,'')))<5 then raise exception 'Debe registrar una observación de al menos 5 caracteres'; end if;
  select coalesce((value #>> '{}')::boolean,false) into approval_comment_required from public.app_parameters where key='approval_comment_required';
  select coalesce((value #>> '{}')::boolean,false) into execution_max_approved from public.app_parameters where key='execution_max_approved';
  if p_action='approve' and approval_comment_required and char_length(trim(coalesce(p_comment,'')))<5 then raise exception 'La configuración exige una observación para aprobar'; end if;
  if p_action='approve' and (p_hours is null or p_hours<0 or p_hours>r.hours_requested) then raise exception 'Las horas aprobadas deben estar entre 0 y las horas solicitadas'; end if;
  if p_action='validate_execution' and (p_hours is null or p_hours<0 or p_hours>24) then raise exception 'Las horas ejecutadas deben estar entre 0 y 24'; end if;
  if p_action='validate_execution' and execution_max_approved and r.approved_hours is not null and p_hours>r.approved_hours then raise exception 'Las horas ejecutadas superan las horas aprobadas y la configuración no lo permite'; end if;
  update public.overtime_requests set status=new_status,admin_observations=coalesce(nullif(trim(p_comment),''),admin_observations),approved_hours=case when p_action='approve' then p_hours else approved_hours end,executed_hours=case when p_action='validate_execution' then p_hours else executed_hours end,approved_at=case when p_action='approve' then now() else approved_at end,validated_at=case when p_action='validate_execution' then now() else validated_at end,closed_at=case when p_action='close' then now() else closed_at end where id=r.id returning * into r;
  insert into public.request_history(request_id,from_status,to_status,comment,approved_hours,executed_hours,actor_id) values(r.id,old_status,new_status,p_comment,case when p_action='approve' then p_hours end,case when p_action='validate_execution' then p_hours end,auth.uid());
  insert into public.notifications(recipient_id,request_id,title,message) values(r.employee_id,r.id,'Solicitud actualizada','La solicitud '||r.filing_number||' cambió a '||new_status::text);
  insert into public.audit_log(actor_id,action,entity_type,entity_id,old_data,new_data) values(auth.uid(),p_action,'overtime_request',r.id::text,jsonb_build_object('status',old_status),to_jsonb(r));
  return r;
end $$;

create or replace function public.delete_overtime_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r public.overtime_requests;
begin
  if not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  select * into r from public.overtime_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,old_data)
  values(auth.uid(),'delete','overtime_request',r.id::text,to_jsonb(r));
  delete from public.overtime_requests where id=r.id;
  return jsonb_build_object('id',r.id,'filing_number',r.filing_number,'deleted',true);
end $$;

create or replace function public.audit_generic_changes()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_log(actor_id,action,entity_type,entity_id,old_data,new_data)
  values(auth.uid(),lower(tg_op),tg_table_name,
    coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'key',to_jsonb(old)->>'key'),
    case when tg_op<>'INSERT' then to_jsonb(old) end,
    case when tg_op<>'DELETE' then to_jsonb(new) end);
  return coalesce(new,old);
end $$;
create trigger audit_departments after insert or update or delete on public.departments for each row execute function public.audit_generic_changes();
create trigger audit_work_types after insert or update or delete on public.work_types for each row execute function public.audit_generic_changes();
create trigger audit_parameters after insert or update or delete on public.app_parameters for each row execute function public.audit_generic_changes();
-- Validación en el servidor del parámetro «immediate_manager_name» (nombre del jefe inmediato).
-- La escritura en app_parameters ya está limitada a administradores por RLS («admins manage parameters»);
-- este trigger garantiza además que el valor sea un texto de 3 a 120 caracteres con letras, espacios, puntos, apóstrofos y guiones.
create or replace function public.validate_app_parameter()
returns trigger language plpgsql as $$
declare v text;
begin
  if new.key='immediate_manager_name' then
    if jsonb_typeof(new.value)<>'string' then raise exception 'El nombre del jefe inmediato debe ser un texto'; end if;
    v:=btrim(regexp_replace(new.value #>> '{}','\s+',' ','g'));
    if char_length(v)<3 then raise exception 'El nombre del jefe inmediato debe tener al menos 3 caracteres'; end if;
    if char_length(v)>120 then raise exception 'El nombre del jefe inmediato no puede superar los 120 caracteres'; end if;
    if v !~ '^[A-Za-zÀ-ÖØ-öø-ÿ]' or v ~ '[^[:space:].''’A-Za-zÀ-ÖØ-öø-ÿ-]' then
      raise exception 'El nombre del jefe inmediato solo puede contener letras, espacios, puntos, apóstrofos y guiones';
    end if;
    new.value:=to_jsonb(v);
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_app_parameter on public.app_parameters;
create trigger trg_validate_app_parameter before insert or update on public.app_parameters for each row execute function public.validate_app_parameter();
create trigger audit_profiles after update on public.profiles for each row execute function public.audit_generic_changes();
-- Cargo del funcionario: lo actualiza cada persona sobre SU propio perfil (no puede tocar rol, dependencia ni datos de otros).
create or replace function public.update_own_position(p_kind text, p_custom text default null)
returns public.profiles language plpgsql security definer set search_path=public as $$
declare v text; r public.profiles;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if p_kind not in ('Técnico','Profesional','Otro') then raise exception 'Cargo no válido'; end if;
  if p_kind='Otro' then
    v:=btrim(regexp_replace(coalesce(p_custom,''),'\s+',' ','g'));
    if char_length(v)<3 then raise exception 'El cargo debe tener al menos 3 caracteres'; end if;
    if char_length(v)>80 then raise exception 'El cargo no puede superar los 80 caracteres'; end if;
    if v !~ '^[A-Za-zÀ-ÖØ-öø-ÿ]' or v ~ '[^[:space:].,''’()/&A-Za-zÀ-ÖØ-öø-ÿ0-9-]' then raise exception 'El cargo contiene caracteres no permitidos'; end if;
  else v:=p_kind; end if;
  update public.profiles set position_kind=p_kind, job_title=v, updated_at=now() where id=auth.uid() and active=true returning * into r;
  if not found then raise exception 'Perfil no encontrado o inactivo'; end if;
  return r;
end $$;

alter table public.departments enable row level security;
alter table public.profiles enable row level security;
alter table public.work_types enable row level security;
alter table public.app_parameters enable row level security;
alter table public.overtime_requests enable row level security;
alter table public.request_history enable row level security;
alter table public.attachments enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

create policy "authenticated read active departments" on public.departments for select to authenticated using(active or public.is_admin());
create policy "admins manage departments" on public.departments for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "read own profile or admin" on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy "admins update profiles" on public.profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "authenticated read active work types" on public.work_types for select to authenticated using(active or public.is_admin());
create policy "admins manage work types" on public.work_types for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "authenticated read parameters" on public.app_parameters for select to authenticated using(true);
create policy "admins manage parameters" on public.app_parameters for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy "read own requests or admin" on public.overtime_requests for select to authenticated using(employee_id=auth.uid() or public.is_admin());
create policy "read related history" on public.request_history for select to authenticated using(public.is_admin() or exists(select 1 from public.overtime_requests r where r.id=request_id and r.employee_id=auth.uid()));
create policy "read related attachments" on public.attachments for select to authenticated using(owner_id=auth.uid() or public.is_admin());
create policy "insert own attachments" on public.attachments for insert to authenticated with check(owner_id=auth.uid() and exists(select 1 from public.overtime_requests r where r.id=request_id and r.employee_id=auth.uid() and r.status in ('draft','returned')));
create policy "delete own draft attachments" on public.attachments for delete to authenticated using(owner_id=auth.uid() and exists(select 1 from public.overtime_requests r where r.id=request_id and r.status in ('draft','returned')));
create policy "read own notifications" on public.notifications for select to authenticated using(recipient_id=auth.uid());
create policy "update own notifications" on public.notifications for update to authenticated using(recipient_id=auth.uid()) with check(recipient_id=auth.uid());
create policy "delete own notifications" on public.notifications for delete to authenticated using(recipient_id=auth.uid());
create policy "admins read audit" on public.audit_log for select to authenticated using(public.is_admin());

grant select,insert,update,delete on public.departments,public.work_types,public.app_parameters to authenticated;
grant select,update on public.profiles to authenticated;
grant select on public.overtime_requests,public.request_history,public.audit_log to authenticated;
grant select,insert,delete on public.attachments to authenticated;
grant select,update,delete on public.notifications to authenticated;
revoke all on function public.save_overtime_request(uuid,jsonb,boolean) from public,anon;
revoke all on function public.perform_request_action(uuid,text,text,numeric) from public,anon;
revoke all on function public.delete_overtime_request(uuid) from public,anon;
revoke all on function public.format_filing_number(bigint) from public,anon,authenticated;
grant execute on function public.save_overtime_request(uuid,jsonb,boolean) to authenticated;
grant execute on function public.perform_request_action(uuid,text,text,numeric) to authenticated;
grant execute on function public.delete_overtime_request(uuid) to authenticated;
revoke all on function public.update_own_position(text,text) from public,anon;
grant execute on function public.update_own_position(text,text) to authenticated;

insert into public.app_parameters(key,value,description) values
('max_hours_per_request','null','Límite institucional configurable. null significa no definido.'::text),
('allowed_file_types','["application/pdf","image/jpeg","image/png","application/vnd.openxmlformats-officedocument.wordprocessingml.document"]','Tipos MIME permitidos para soportes'),
('max_file_size_mb','10','Tamaño máximo por soporte'),
('approval_comment_required','false','Exigir observación al aprobar'),
('execution_max_approved','false','Impedir que las horas ejecutadas superen las aprobadas'),
('immediate_manager_name','"ZAYDA JOHANNA RODRIGUEZ SANCHEZ"','Nombre del jefe inmediato que se imprime en el formato de horas extras');

insert into public.work_types(name,description) values
('Jornada diurna','Trabajo entre 6:00 a. m. y 7:00 p. m. (art. 160 CST, modificado por la Ley 2466 de 2025). Se asigna automáticamente.'),
('Jornada nocturna','Trabajo entre 7:00 p. m. y 6:00 a. m. Generalmente genera recargo nocturno, de acuerdo con las condiciones legales aplicables. Se asigna automáticamente.')
on conflict(name) do nothing;
-- MIGRACIÓN desde v15 (si ya instaló Mañana/Tarde/Noche/Mixta), ejecutar una sola vez:
-- update public.work_types set active=false where name in ('Mañana','Tarde','Noche','Mixta');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('overtime-supports','overtime-supports',false,10485760,array['application/pdf','image/jpeg','image/png','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false;

create policy "users upload own request supports" on storage.objects for insert to authenticated with check(bucket_id='overtime-supports' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "users read own supports" on storage.objects for select to authenticated using(bucket_id='overtime-supports' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy "users delete own draft supports" on storage.objects for delete to authenticated using(bucket_id='overtime-supports' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "admins delete request supports" on storage.objects for delete to authenticated using(bucket_id='overtime-supports' and public.is_admin());

alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.overtime_requests;

-- MIGRACIÓN DEL RADICADO (HE-AAAA-000001 → HE-01): si ya instaló una versión anterior, ejecute el archivo
-- «migracion_radicado_HE_NN.sql» en lugar de volver a ejecutar este script.
-- MIGRACIÓN DEL JEFE INMEDIATO (parámetro editable): si ya instaló una versión anterior, ejecute el archivo
-- «migracion_jefe_inmediato.sql» en lugar de volver a ejecutar este script.
-- MIGRACIÓN DEL CARGO (Técnico/Profesional/Otro): si ya instaló una versión anterior, ejecute el archivo
-- «migracion_cargo_perfil.sql» en lugar de volver a ejecutar este script.
-- MIGRACIÓN v4 (salario base de referencia para Profesional y Jefe + catálogo de cargos y grados): si ya instaló una versión anterior, ejecute el archivo
-- «migracion_v4_cargos_grados_salario_referencia.sql» (el mismo bloque «MIGRACIÓN v4» que aparece al final de este script).
-- MIGRACIÓN v5 (la aprobación del jefe cierra la solicitud; el administrador sale del flujo de aprobación): si ya instaló una versión anterior, ejecute
-- «migracion_v5_cierre_automatico_jefe.sql» (el mismo bloque «MIGRACIÓN v5» que aparece al final de este script).
-- MIGRACIÓN v6 (firma digital del jefe inmediato: firma por jefe, versionada, congelada en cada aprobación e incorporada al formato): si ya instaló una versión anterior, ejecute
-- «migracion_v6_firma_jefe.sql» (el mismo bloque «MIGRACIÓN v6» que aparece al final de este script).
-- MIGRACIÓN COMPATIBLE DESDE DEMO v10:
alter table public.overtime_requests add column if not exists selected_activities jsonb not null default '[]'::jsonb;
update public.overtime_requests
set selected_activities=jsonb_build_array(jsonb_build_object('name',reason,'custom',true,'legacy',true,'group','Registro anterior'))
where selected_activities='[]'::jsonb and nullif(trim(reason),'') is not null;

-- PASOS MANUALES SEGUROS:
-- 1. Cree el primer usuario en Authentication > Users.
-- 2. Copie su UUID y ejecute, SOLO en SQL Editor:
-- update public.profiles set role='admin', full_name='NOMBRE AUTORIZADO' where id='UUID-AQUI';
-- 3. Ingrese como administrador, cree dependencias y tipos de jornada,
--    y asigne dependencia a cada funcionario.
-- 4. Nunca ponga service_role ni secretos dentro del HTML.
-- 5. Si ya tenía instalada una versión anterior, ejecute SOLO el bloque «MIGRACIÓN v2» (archivo migracion_v2_roles_auxilios_sindicatos.sql).

-- =====================================================================================
-- MIGRACIÓN v2 · Aplicativo de Gestión de Horas Extras  (idempotente: puede ejecutarse más de una vez)
--   1. Roles Jefe (manager) y Profesional (professional) con flujo de validación/aprobación y trazabilidad.
--   2. Turnos laborales y cálculo automático de auxilios de alimentación (desayuno / almuerzo / comida).
--   3. Catálogo de actividades administrable (incluye actividades operativas).
--   4. Tipos de sindicato, reglas de cálculo monetario por vigencia, salario base e instantáneas de costo.
--   5. Vista de horas con aprobación válida para reportes.
-- No se precargan tarifas, porcentajes ni valores de auxilios: quedan como parámetros pendientes.
-- =====================================================================================
alter type public.app_role add value if not exists 'professional';
alter type public.app_role add value if not exists 'manager';

-- ---------- Catálogos ----------
create table if not exists public.work_shifts (
  code text primary key check (code ~ '^[A-Z0-9]{1,5}$'),
  description text not null check (char_length(trim(description)) between 3 and 160),
  weekdays smallint[] not null check (array_length(weekdays,1) between 1 and 7 and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]),
  start_time time not null,
  end_time time not null,
  lunch_start time,
  lunch_end time,
  works_holidays boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint work_shifts_range check (end_time > start_time),
  constraint work_shifts_lunch_pair check ((lunch_start is null) = (lunch_end is null)),
  constraint work_shifts_lunch_inside check (lunch_start is null or (lunch_start >= start_time and lunch_end <= end_time and lunch_end > lunch_start))
);
insert into public.work_shifts(code,description,weekdays,start_time,end_time,lunch_start,lunch_end) values
('A','L-V=7:00a.m. - 6:00p.m. (A=12:00m a 2:00p.m.)','{1,2,3,4,5}','07:00','18:00','12:00','14:00'),
('B','L-V=6:30a.m. - 4:30p.m. (A=11:30m a 12:30p.m.)','{1,2,3,4,5}','06:30','16:30','11:30','12:30'),
('D','L-V=7:00a.m. - 5:00p.m. (A=12:00m a 1:00p.m.)','{1,2,3,4,5}','07:00','17:00','12:00','13:00'),
('E','L-V=7:00a.m. - 4:00p.m. (Sin hora de almuerzo)','{1,2,3,4,5}','07:00','16:00',null,null),
('F','L-V=8:00a.m. - 6:00p.m. (A=12:30m a 1:30p.m.)','{1,2,3,4,5}','08:00','18:00','12:30','13:30'),
('I','L-S=6:00a.m. - 2:00p.m. (Sin hora de almuerzo)','{1,2,3,4,5,6}','06:00','14:00',null,null),
('J','L-D=6:00a.m. - 6:00p.m. (Sin hora de almuerzo)','{1,2,3,4,5,6,7}','06:00','18:00',null,null),
('K','L-V=7:30a.m. - 5:30p.m. (A=12:00m a 1:00p.m.)','{1,2,3,4,5}','07:30','17:30','12:00','13:00')
on conflict(code) do nothing;

create table if not exists public.unions (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 120),
  code text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create table if not exists public.union_cost_rules (
  id uuid primary key default gen_random_uuid(),
  union_id uuid not null references public.unions(id) on delete cascade,
  valid_from date not null,
  valid_to date,
  hourly_divisor numeric(8,2) check (hourly_divisor is null or hourly_divisor > 0),
  factor_hed numeric(8,4) check (factor_hed is null or factor_hed > 0),
  factor_hen numeric(8,4) check (factor_hen is null or factor_hen > 0),
  factor_hedd numeric(8,4) check (factor_hedd is null or factor_hedd > 0),
  factor_hedn numeric(8,4) check (factor_hedn is null or factor_hedn > 0),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint union_cost_rules_range check (valid_to is null or valid_to >= valid_from)
);
create index if not exists union_cost_rules_union_idx on public.union_cost_rules(union_id, valid_from);
create table if not exists public.employee_compensation (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  base_salary numeric(14,2) check (base_salary is null or base_salary > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
create table if not exists public.activity_catalog (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 3 and 120),
  group_name text not null check (char_length(trim(group_name)) between 3 and 80),
  is_operational boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
insert into public.activity_catalog(name,group_name,is_operational,sort_order)
select x.name,x.grp,x.grp='Operación y gestión comercial',x.ord from (values
('Envío de solicitudes','Gestión de PQR y atención al cliente',1),('Gestión de vencimientos','Gestión de PQR y atención al cliente',2),('Seguimiento de PQR','Gestión de PQR y atención al cliente',3),('Elaboración de respuestas a PQR','Gestión de PQR y atención al cliente',4),('Revisión y validación de solicitudes','Gestión de PQR y atención al cliente',5),('Gestión de requerimientos de clientes','Gestión de PQR y atención al cliente',6),('Consulta y seguimiento de radicados','Gestión de PQR y atención al cliente',7),('Actualización de información de solicitudes','Gestión de PQR y atención al cliente',8),('Clasificación y asignación de PQR','Gestión de PQR y atención al cliente',9),('Cierre y documentación de solicitudes','Gestión de PQR y atención al cliente',10),
('Solicitud de insumos','Operación y gestión comercial',11),('Validación de información comercial','Operación y gestión comercial',12),('Revisión de cuentas y consumos','Operación y gestión comercial',13),('Gestión de novedades comerciales','Operación y gestión comercial',14),('Verificación de información de clientes','Operación y gestión comercial',15),('Elaboración de informes operativos','Operación y gestión comercial',16),('Elaboración de informes administrativos','Operación y gestión comercial',16),('Seguimiento de compromisos y pendientes','Operación y gestión comercial',17),('Gestión documental','Operación y gestión comercial',18),('Actualización de registros','Operación y gestión comercial',19),('Coordinación con otras áreas','Operación y gestión comercial',20),
('Desarrollo de soluciones','Desarrollo y mejora de soluciones',21),('Mejora de procesos','Desarrollo y mejora de soluciones',22),('Automatización de actividades','Desarrollo y mejora de soluciones',23),('Pruebas y validación de funcionalidades','Desarrollo y mejora de soluciones',24),('Corrección de errores','Desarrollo y mejora de soluciones',25),('Mantenimiento de aplicaciones','Desarrollo y mejora de soluciones',26),('Análisis de requerimientos','Desarrollo y mejora de soluciones',27),('Diseño de nuevas funcionalidades','Desarrollo y mejora de soluciones',28),('Optimización de herramientas existentes','Desarrollo y mejora de soluciones',29),('Documentación técnica y funcional','Desarrollo y mejora de soluciones',30)
) as x(name,grp,ord) on conflict(name) do nothing;

-- ---------- Columnas nuevas (los datos históricos se conservan; executed_hours se mantiene por trazabilidad) ----------
alter table public.profiles add column if not exists shift_code text references public.work_shifts(code);
alter table public.profiles add column if not exists union_id uuid references public.unions(id);
alter table public.overtime_requests add column if not exists aux_breakfast boolean not null default false;
alter table public.overtime_requests add column if not exists aux_lunch boolean not null default false;
alter table public.overtime_requests add column if not exists aux_dinner boolean not null default false;
alter table public.overtime_requests add column if not exists aux_status text;
alter table public.overtime_requests add column if not exists aux_detail jsonb;
alter table public.overtime_requests add column if not exists aux_values jsonb;
alter table public.overtime_requests add column if not exists professional_result text check (professional_result is null or professional_result in ('favorable','no_favorable'));
alter table public.overtime_requests add column if not exists professional_comment text;
alter table public.overtime_requests add column if not exists professional_by uuid references public.profiles(id);
alter table public.overtime_requests add column if not exists professional_at timestamptz;
alter table public.overtime_requests add column if not exists decided_by uuid references public.profiles(id);
alter table public.overtime_requests add column if not exists decided_at timestamptz;
create table if not exists public.overtime_cost_snapshots (
  request_id uuid primary key references public.overtime_requests(id) on delete cascade,
  snapshot jsonb not null,
  computed_at timestamptz not null default now(),
  computed_by uuid references public.profiles(id)
);

insert into public.app_parameters(key,value,description) values
('food_allowance_values','{"breakfast":null,"lunch":null,"dinner":null}','Valor (COP) de cada auxilio de alimentación. null = sin parametrizar.'),
('aux_breakfast_minutes_before','60','Desayuno: minutos laborados antes del inicio de la jornada habitual (regla: una hora antes).'),
('aux_dinner_minutes_after','120','Comida: minutos laborados después del fin de la jornada habitual (regla: dos horas después).'),
('require_professional_validation','false','Exigir validación favorable del profesional antes de que el jefe apruebe.')
on conflict(key) do nothing;

-- ---------- Roles y alcance ----------
create or replace function public.current_app_role()
returns text language sql stable security definer set search_path=public
as $$ select role::text from public.profiles where id=auth.uid() and active=true $$;
create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce(public.current_app_role() in ('admin','professional','manager'),false) $$;
create or replace function public.can_see_request(p_employee uuid, p_department uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select p_employee=auth.uid() or exists(select 1 from public.profiles me where me.id=auth.uid() and me.active
    and (me.role::text in ('admin','professional') or (me.role::text='manager' and me.department_id is not null and me.department_id=p_department)));
$$;
-- Defensa en profundidad: administradores, jefes y profesionales no registran solicitudes propias.
create or replace function public.block_admin_self_requests()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.profiles where id=new.employee_id and role::text in ('admin','professional','manager')) then
    raise exception 'Los roles Administrador, Jefe y Profesional no pueden crear solicitudes de horas extras para sí mismos';
  end if;
  return new;
end $$;

-- ---------- Festivos de Colombia (mismo algoritmo que el aplicativo) ----------
create or replace function public.easter_sunday(y int) returns date language plpgsql immutable as $$
declare a int; b int; c int; d int; e int; f int; g int; h int; i int; k int; l int; m int;
begin
  a:=y%19; b:=y/100; c:=y%100; d:=b/4; e:=b%4; f:=(b+8)/25; g:=(b-f+1)/3; h:=(19*a+b-d-g+15)%30; i:=c/4; k:=c%4;
  l:=(32+2*e+2*i-h-k)%7; m:=(a+11*h+22*l)/451;
  return make_date(y,(h+l-7*m+114)/31,((h+l-7*m+114)%31)+1);
end $$;
create or replace function public.next_monday(p date) returns date language sql immutable
as $$ select p + ((8 - extract(isodow from p)::int) % 7) $$;
create or replace function public.is_co_holiday(p date) returns boolean language plpgsql immutable as $$
declare y int:=extract(year from p)::int; e date:=public.easter_sunday(extract(year from p)::int); hs date[];
begin
  hs:=array[make_date(y,1,1),public.next_monday(make_date(y,1,6)),public.next_monday(make_date(y,3,19)),make_date(y,5,1),public.next_monday(make_date(y,6,29)),
    make_date(y,7,20),make_date(y,8,7),public.next_monday(make_date(y,8,15)),public.next_monday(make_date(y,10,12)),public.next_monday(make_date(y,11,1)),
    public.next_monday(make_date(y,11,11)),make_date(y,12,8),make_date(y,12,25),e-3,e-2,e+43,e+64,e+71];
  if y>=2026 then hs:=hs||public.next_monday(make_date(y,7,9)); end if;
  return p=any(hs);
end $$;

-- ---------- Auxilios de alimentación ----------
-- Desayuno: la hora extra cubre la hora previa al inicio del turno. Almuerzo (jornada continua): cubre el horario de almuerzo del turno.
-- Comida: cubre las dos horas siguientes al fin del turno. Días sin jornada habitual: regla no definida (sin auxilio, marcado).
create or replace function public.compute_food_allowances(p_employee uuid,p_date date,p_start time,p_end time)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sh public.work_shifts; s int; e int; ss int; se int; ls int; le int; dw int; hol boolean; mb int; ma int;
  d boolean:=false; a boolean:=false; c boolean:=false; notes text[]:='{}'; snap jsonb; rule jsonb;
begin
  mb:=coalesce((select (value #>> '{}')::int from public.app_parameters where key='aux_breakfast_minutes_before'),60);
  ma:=coalesce((select (value #>> '{}')::int from public.app_parameters where key='aux_dinner_minutes_after'),120);
  rule:=jsonb_build_object('breakfast_minutes_before',mb,'dinner_minutes_after',ma);
  if p_date is null or p_start is null or p_end is null then
    return jsonb_build_object('status','incomplete','breakfast',false,'lunch',false,'dinner',false,'rule',rule,'notes',jsonb_build_array('Faltan la fecha o el horario.'));
  end if;
  select w.* into sh from public.profiles p join public.work_shifts w on w.code=p.shift_code where p.id=p_employee;
  if not found then
    return jsonb_build_object('status','no_shift','breakfast',false,'lunch',false,'dinner',false,'rule',rule,'notes',jsonb_build_array('El funcionario no tiene turno laboral asignado; el auxilio no se puede calcular.'));
  end if;
  snap:=jsonb_build_object('code',sh.code,'description',sh.description,'start_time',to_char(sh.start_time,'HH24:MI'),'end_time',to_char(sh.end_time,'HH24:MI'),
    'lunch_start',to_char(sh.lunch_start,'HH24:MI'),'lunch_end',to_char(sh.lunch_end,'HH24:MI'),'weekdays',to_jsonb(sh.weekdays));
  dw:=extract(isodow from p_date)::int; hol:=public.is_co_holiday(p_date);
  if not (dw = any(sh.weekdays)) or (hol and not sh.works_holidays) then
    return jsonb_build_object('status','non_working_day','breakfast',false,'lunch',false,'dinner',false,'rule',rule,'shift',snap,'notes',jsonb_build_array(case when hol
      then 'El día es festivo y el turno no tiene jornada habitual en festivos: la regla de auxilios no está definida para este caso.'
      else 'El día no hace parte de la jornada habitual del turno: la regla de auxilios no está definida para este caso.' end));
  end if;
  s:=(extract(hour from p_start)*60+extract(minute from p_start))::int; e:=(extract(hour from p_end)*60+extract(minute from p_end))::int;
  if e=s then return jsonb_build_object('status','invalid','breakfast',false,'lunch',false,'dinner',false,'rule',rule,'notes',jsonb_build_array('La hora de finalización debe ser distinta a la de inicio.')); end if;
  if e<s then e:=e+1440; end if;
  ss:=(extract(hour from sh.start_time)*60+extract(minute from sh.start_time))::int; se:=(extract(hour from sh.end_time)*60+extract(minute from sh.end_time))::int;
  d:= s<=ss-mb and e>=ss;
  c:= s<=se and e>=se+ma;
  if sh.lunch_start is null then notes:=array_append(notes,'El turno no tiene hora de almuerzo: el auxilio de almuerzo no aplica.');
  else ls:=(extract(hour from sh.lunch_start)*60+extract(minute from sh.lunch_start))::int; le:=(extract(hour from sh.lunch_end)*60+extract(minute from sh.lunch_end))::int; a:= s<=ls and e>=le; end if;
  return jsonb_build_object('status','ok','breakfast',d,'lunch',a,'dinner',c,'rule',rule,'shift',snap,'notes',to_jsonb(notes));
end $$;

create or replace function public.trg_food_allowances()
returns trigger language plpgsql security definer set search_path=public as $$
declare j jsonb;
begin
  j:=public.compute_food_allowances(new.employee_id,new.execution_date,new.start_time,new.end_time);
  new.aux_breakfast:=coalesce((j->>'breakfast')::boolean,false); new.aux_lunch:=coalesce((j->>'lunch')::boolean,false); new.aux_dinner:=coalesce((j->>'dinner')::boolean,false);
  new.aux_status:=j->>'status'; new.aux_detail:=j;
  return new;
end $$;
drop trigger if exists trg_food_allowances on public.overtime_requests;
create trigger trg_food_allowances before insert or update of execution_date,start_time,end_time,employee_id on public.overtime_requests for each row execute function public.trg_food_allowances();

-- Recalcula auxilios de solicitudes en trámite (o que nunca tuvieron turno) de un funcionario o de todos.
create or replace function public.recompute_food_allowances_for(p_employee uuid)
returns int language plpgsql security definer set search_path=public as $$
declare n int;
begin
  update public.overtime_requests r set aux_detail=x.j,aux_status=x.j->>'status',aux_breakfast=coalesce((x.j->>'breakfast')::boolean,false),
    aux_lunch=coalesce((x.j->>'lunch')::boolean,false),aux_dinner=coalesce((x.j->>'dinner')::boolean,false)
  from (select id,public.compute_food_allowances(employee_id,execution_date,start_time,end_time) j from public.overtime_requests
        where (p_employee is null or employee_id=p_employee)
          and (status::text in ('draft','pending','in_review','returned') or coalesce(aux_status,'no_shift')='no_shift')) x
  where r.id=x.id;
  get diagnostics n=row_count; return n;
end $$;
create or replace function public.recompute_open_food_allowances()
returns int language plpgsql security definer set search_path=public as $$
begin
  if not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  return public.recompute_food_allowances_for(null);
end $$;
create or replace function public.trg_profile_shift_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.shift_code is distinct from old.shift_code then perform public.recompute_food_allowances_for(new.id); end if;
  return new;
end $$;
drop trigger if exists trg_profile_shift_change on public.profiles;
create trigger trg_profile_shift_change after update of shift_code on public.profiles for each row execute function public.trg_profile_shift_change();
-- Cálculo inicial de solicitudes existentes (sin turno asignado quedan como 'no_shift' hasta asignarlo).
update public.overtime_requests r set aux_detail=x.j,aux_status=x.j->>'status',aux_breakfast=coalesce((x.j->>'breakfast')::boolean,false),
  aux_lunch=coalesce((x.j->>'lunch')::boolean,false),aux_dinner=coalesce((x.j->>'dinner')::boolean,false)
from (select id,public.compute_food_allowances(employee_id,execution_date,start_time,end_time) j from public.overtime_requests where aux_status is null) x
where r.id=x.id;

-- Valores de auxilios congelados al aprobar (solo si todos los conceptos que aplican tienen valor parametrizado).
create or replace function public.food_values_snapshot(p_b boolean,p_l boolean,p_d boolean)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v jsonb:=coalesce((select value from public.app_parameters where key='food_allowance_values'),'{}'::jsonb);
begin
  if (p_b and jsonb_typeof(v->'breakfast') is distinct from 'number') or (p_l and jsonb_typeof(v->'lunch') is distinct from 'number')
     or (p_d and jsonb_typeof(v->'dinner') is distinct from 'number') then return null; end if;
  return jsonb_build_object('breakfast',v->'breakfast','lunch',v->'lunch','dinner',v->'dinner','captured_at',now());
end $$;

-- ---------- Costo monetario según el tipo de sindicato ----------
create or replace function public.compute_overtime_cost(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r public.overtime_requests; p public.profiles; u public.unions; ru public.union_cost_rules; cnt int:=0; sal numeric;
  s int; e int; m int; mm int; dom0 boolean; dom1 boolean; dom boolean; diurna boolean;
  c1 int:=0; c2 int:=0; c3 int:=0; c4 int:=0; tot int; hrs numeric; f numeric; x1 numeric; x2 numeric; x3 numeric; x4 numeric;
  bh numeric; v1 numeric; v2 numeric; v3 numeric; v4 numeric; reasons text[]:='{}'; ok boolean;
begin
  select * into r from public.overtime_requests where id=p_request_id;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if r.status::text not in ('approved','pending_execution','validated','closed') or r.approved_hours is null then
    return jsonb_build_object('status','not_approved','reasons',jsonb_build_array('La solicitud no tiene aprobación válida'));
  end if;
  hrs:=r.approved_hours;
  select * into p from public.profiles where id=r.employee_id;
  if p.union_id is null then reasons:=array_append(reasons,'Sin tipo de sindicato asignado');
  else
    select * into u from public.unions where id=p.union_id;
    select count(*) into cnt from public.union_cost_rules x where x.union_id=p.union_id and x.active and x.valid_from<=r.execution_date and (x.valid_to is null or x.valid_to>=r.execution_date);
    if cnt=0 then reasons:=array_append(reasons,'Sin regla de cálculo vigente para '||coalesce(u.name,'el sindicato')||' en '||to_char(r.execution_date,'DD/MM/YYYY'));
    elsif cnt>1 then reasons:=array_append(reasons,'Más de una regla vigente (configuración incompatible)');
    else select x.* into ru from public.union_cost_rules x where x.union_id=p.union_id and x.active and x.valid_from<=r.execution_date and (x.valid_to is null or x.valid_to>=r.execution_date);
    end if;
  end if;
  select base_salary into sal from public.employee_compensation where profile_id=r.employee_id;
  if sal is null or sal<=0 then reasons:=array_append(reasons,'Sin salario base registrado'); end if;
  s:=(extract(hour from r.start_time)*60+extract(minute from r.start_time))::int; e:=(extract(hour from r.end_time)*60+extract(minute from r.end_time))::int;
  if e<=s then e:=e+1440; end if;
  dom0:=extract(isodow from r.execution_date)=7 or public.is_co_holiday(r.execution_date);
  dom1:=extract(isodow from r.execution_date+1)=7 or public.is_co_holiday(r.execution_date+1);
  for m in s..e-1 loop
    mm:=m%1440; dom:=case when m>=1440 then dom1 else dom0 end; diurna:=mm>=360 and mm<1140;
    if dom then if diurna then c3:=c3+1; else c4:=c4+1; end if; else if diurna then c1:=c1+1; else c2:=c2+1; end if; end if;
  end loop;
  tot:=c1+c2+c3+c4; f:=case when tot>0 then hrs/(tot/60.0) else 0 end;
  x1:=c1/60.0*f; x2:=c2/60.0*f; x3:=c3/60.0*f; x4:=c4/60.0*f;
  if ru.id is not null then
    if ru.hourly_divisor is null or ru.hourly_divisor<=0 then reasons:=array_append(reasons,'La regla no define el divisor de horas mensuales'); end if;
    if x1>0 and coalesce(ru.factor_hed,0)<=0 then reasons:=array_append(reasons,'La regla no define el factor de hora extra diurna'); end if;
    if x2>0 and coalesce(ru.factor_hen,0)<=0 then reasons:=array_append(reasons,'La regla no define el factor de hora extra nocturna'); end if;
    if x3>0 and coalesce(ru.factor_hedd,0)<=0 then reasons:=array_append(reasons,'La regla no define el factor de hora extra dominical/festiva diurna'); end if;
    if x4>0 and coalesce(ru.factor_hedn,0)<=0 then reasons:=array_append(reasons,'La regla no define el factor de hora extra dominical/festiva nocturna'); end if;
  end if;
  ok:=coalesce(array_length(reasons,1),0)=0;
  if ok then
    bh:=sal/ru.hourly_divisor;
    v1:=round(x1*bh*coalesce(ru.factor_hed,0),2); v2:=round(x2*bh*coalesce(ru.factor_hen,0),2); v3:=round(x3*bh*coalesce(ru.factor_hedd,0),2); v4:=round(x4*bh*coalesce(ru.factor_hedn,0),2);
  end if;
  return jsonb_build_object('status',case when ok then 'ok' else 'pending' end,'reasons',to_jsonb(reasons),'union_id',p.union_id,'union_name',u.name,
    'rule_id',ru.id,'rule_valid_from',ru.valid_from,'hourly_divisor',ru.hourly_divisor,
    'factors',case when ru.id is null then null else jsonb_build_object('hed',ru.factor_hed,'hen',ru.factor_hen,'hedd',ru.factor_hedd,'hedn',ru.factor_hedn) end,
    'base_salary',sal,'approved_hours',hrs,'hours',jsonb_build_object('hed',round(x1,2),'hen',round(x2,2),'hedd',round(x3,2),'hedn',round(x4,2)),
    'base_hour_value',case when ok then round(bh,2) end,'values',case when ok then jsonb_build_object('hed',v1,'hen',v2,'hedd',v3,'hedn',v4) end,
    'total',case when ok then v1+v2+v3+v4 end,'computed_at',now());
end $$;
create or replace function public.check_union_rule_overlap()
returns trigger language plpgsql as $$
begin
  if new.active and exists(select 1 from public.union_cost_rules x where x.union_id=new.union_id and x.id<>new.id and x.active
     and daterange(x.valid_from,coalesce(x.valid_to,'infinity'::date),'[]') && daterange(new.valid_from,coalesce(new.valid_to,'infinity'::date),'[]')) then
    raise exception 'La vigencia se cruza con otra regla activa del mismo sindicato';
  end if;
  return new;
end $$;
drop trigger if exists trg_union_rule_overlap on public.union_cost_rules;
create trigger trg_union_rule_overlap before insert or update on public.union_cost_rules for each row execute function public.check_union_rule_overlap();
-- Registra instantáneas pendientes o faltantes (nunca reemplaza un cálculo completo: protege el histórico).
create or replace function public.recalculate_overtime_costs()
returns jsonb language plpgsql security definer set search_path=public as $$
declare n_cost int:=0; n_aux int:=0; x record;
begin
  if not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  for x in select r.id from public.overtime_requests r left join public.overtime_cost_snapshots c on c.request_id=r.id
           where r.status::text in ('approved','pending_execution','validated','closed') and r.approved_hours is not null
             and (c.request_id is null or c.snapshot->>'status'<>'ok') loop
    insert into public.overtime_cost_snapshots(request_id,snapshot,computed_at,computed_by) values(x.id,public.compute_overtime_cost(x.id),now(),auth.uid())
      on conflict(request_id) do update set snapshot=excluded.snapshot,computed_at=excluded.computed_at,computed_by=excluded.computed_by;
    n_cost:=n_cost+1;
  end loop;
  update public.overtime_requests set aux_values=public.food_values_snapshot(aux_breakfast,aux_lunch,aux_dinner)
   where status::text in ('approved','pending_execution','validated','closed') and aux_values is null and (aux_breakfast or aux_lunch or aux_dinner)
     and public.food_values_snapshot(aux_breakfast,aux_lunch,aux_dinner) is not null;
  get diagnostics n_aux=row_count;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,new_data) values(auth.uid(),'recalculate_costs','overtime_cost_snapshots',null,jsonb_build_object('costs',n_cost,'aux',n_aux));
  return jsonb_build_object('costs',n_cost,'aux',n_aux);
end $$;

-- ---------- Flujo: validación del profesional y aprobación del jefe ----------
create or replace function public.trg_reset_professional()
returns trigger language plpgsql as $$
begin
  if new.status='pending' and old.status in ('draft','returned') then
    new.professional_result:=null; new.professional_comment:=null; new.professional_by:=null; new.professional_at:=null; new.decided_by:=null; new.decided_at:=null;
  end if;
  return new;
end $$;
drop trigger if exists trg_reset_professional on public.overtime_requests;
create trigger trg_reset_professional before update of status on public.overtime_requests for each row execute function public.trg_reset_professional();
create or replace function public.trg_notify_reviewers()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='pending' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.notifications(recipient_id,request_id,title,message)
      select id,new.id,'Solicitud por validar','La solicitud '||new.filing_number||' requiere validación del profesional' from public.profiles where role::text='professional' and active;
    insert into public.notifications(recipient_id,request_id,title,message)
      select id,new.id,'Nueva solicitud de tu dependencia','Se recibió la solicitud '||new.filing_number from public.profiles where role::text='manager' and active and department_id=new.department_id;
  end if;
  return new;
end $$;
drop trigger if exists trg_notify_reviewers on public.overtime_requests;
create trigger trg_notify_reviewers after insert or update of status on public.overtime_requests for each row execute function public.trg_notify_reviewers();

create or replace function public.perform_request_action(p_request_id uuid,p_action text,p_comment text default null,p_hours numeric default null)
returns public.overtime_requests language plpgsql security definer set search_path=public as $$
declare r public.overtime_requests; me public.profiles; old_status public.request_status; new_status public.request_status; my_role text; allowed boolean:=false; mgr boolean:=false;
  approval_comment_required boolean:=false; execution_max_approved boolean:=false; require_pro boolean:=false; v_comment text:=nullif(trim(coalesce(p_comment,'')),'');
begin
  select * into me from public.profiles where id=auth.uid() and active=true;
  if not found then raise exception 'Sesión no válida o usuario inactivo'; end if;
  my_role:=me.role::text;
  select * into r from public.overtime_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  old_status:=r.status;
  case p_action
    when 'start_review' then new_status:='in_review';
    when 'professional_validate' then new_status:='in_review';
    when 'return' then new_status:='returned';
    when 'approve' then new_status:='approved';
    when 'reject' then new_status:='rejected';
    when 'mark_pending_execution' then new_status:='pending_execution';
    when 'validate_execution' then new_status:='validated';
    when 'close' then new_status:='closed';
    when 'cancel' then new_status:='cancelled';
    else raise exception 'Acción no permitida';
  end case;
  mgr:= my_role='manager' and me.department_id is not null and me.department_id=r.department_id;
  allowed:= case
    when p_action='cancel' then auth.uid()=r.employee_id or my_role='admin'
    when p_action in ('start_review','professional_validate','mark_pending_execution','validate_execution','close') then my_role in ('admin','professional')
    when p_action='return' then my_role in ('admin','professional') or mgr
    when p_action in ('approve','reject') then my_role='admin' or mgr
    else false end;
  if not allowed then raise exception 'Tu rol no tiene permiso para realizar esta acción'; end if;
  if p_action<>'cancel' and r.employee_id=auth.uid() then raise exception 'No puedes gestionar tus propias solicitudes'; end if;
  if (p_action='start_review' and old_status<>'pending') or (p_action in ('professional_validate','return','approve','reject') and old_status not in ('pending','in_review'))
     or (p_action='mark_pending_execution' and old_status<>'approved') or (p_action='validate_execution' and old_status not in ('approved','pending_execution'))
     or (p_action='close' and old_status<>'validated') or (p_action='cancel' and old_status not in ('draft','pending','returned')) then
    raise exception 'Transición de estado no permitida';
  end if;
  if p_action='professional_validate' and r.professional_result='favorable' then raise exception 'La solicitud ya tiene validación favorable del profesional'; end if;
  if p_action in ('return','reject') and char_length(coalesce(v_comment,''))<5 then raise exception 'Debe registrar una observación de al menos 5 caracteres'; end if;
  select coalesce((value #>> '{}')::boolean,false) into approval_comment_required from public.app_parameters where key='approval_comment_required';
  select coalesce((value #>> '{}')::boolean,false) into execution_max_approved from public.app_parameters where key='execution_max_approved';
  select coalesce((value #>> '{}')::boolean,false) into require_pro from public.app_parameters where key='require_professional_validation';
  if p_action='approve' and coalesce(require_pro,false) and coalesce(r.professional_result,'')<>'favorable' then raise exception 'La solicitud requiere validación favorable del profesional antes de aprobarse'; end if;
  if p_action='approve' and coalesce(approval_comment_required,false) and char_length(coalesce(v_comment,''))<5 then raise exception 'La configuración exige una observación para aprobar'; end if;
  if p_action='approve' and (p_hours is null or p_hours<0 or p_hours>r.hours_requested) then raise exception 'Las horas aprobadas deben estar entre 0 y las horas solicitadas'; end if;
  -- Horas ejecutadas: ya no se capturan en la interfaz; si se envían, se validan como antes (compatibilidad).
  if p_action='validate_execution' and p_hours is not null and (p_hours<0 or p_hours>24) then raise exception 'Las horas ejecutadas deben estar entre 0 y 24'; end if;
  if p_action='validate_execution' and p_hours is not null and coalesce(execution_max_approved,false) and r.approved_hours is not null and p_hours>r.approved_hours then raise exception 'Las horas ejecutadas superan las horas aprobadas y la configuración no lo permite'; end if;
  update public.overtime_requests set status=new_status,
    admin_observations=coalesce(v_comment,admin_observations),
    approved_hours=case when p_action='approve' then p_hours else approved_hours end,
    executed_hours=case when p_action='validate_execution' and p_hours is not null then p_hours else executed_hours end,
    approved_at=case when p_action='approve' then now() else approved_at end,
    validated_at=case when p_action='validate_execution' then now() else validated_at end,
    closed_at=case when p_action='close' then now() else closed_at end,
    professional_result=case when p_action='professional_validate' then 'favorable' when p_action='return' and my_role='professional' then 'no_favorable' else professional_result end,
    professional_comment=case when p_action='professional_validate' or (p_action='return' and my_role='professional') then v_comment else professional_comment end,
    professional_by=case when p_action='professional_validate' or (p_action='return' and my_role='professional') then auth.uid() else professional_by end,
    professional_at=case when p_action='professional_validate' or (p_action='return' and my_role='professional') then now() else professional_at end,
    decided_by=case when p_action in ('approve','reject') then auth.uid() else decided_by end,
    decided_at=case when p_action in ('approve','reject') then now() else decided_at end,
    aux_values=case when p_action='approve' then public.food_values_snapshot(aux_breakfast,aux_lunch,aux_dinner) else aux_values end
  where id=r.id returning * into r;
  if p_action='approve' then
    insert into public.overtime_cost_snapshots(request_id,snapshot,computed_at,computed_by) values(r.id,public.compute_overtime_cost(r.id),now(),auth.uid())
      on conflict(request_id) do update set snapshot=excluded.snapshot,computed_at=excluded.computed_at,computed_by=excluded.computed_by;
  end if;
  insert into public.request_history(request_id,from_status,to_status,comment,approved_hours,executed_hours,actor_id)
    values(r.id,old_status,new_status,coalesce(v_comment,case p_action when 'professional_validate' then 'Validación profesional: favorable' when 'approve' then 'Solicitud aprobada' when 'reject' then 'Solicitud rechazada' else null end),
           case when p_action='approve' then p_hours end,case when p_action='validate_execution' then p_hours end,auth.uid());
  insert into public.notifications(recipient_id,request_id,title,message) values(r.employee_id,r.id,'Solicitud actualizada','La solicitud '||r.filing_number||' cambió a '||new_status::text);
  if p_action='professional_validate' then
    insert into public.notifications(recipient_id,request_id,title,message)
      select id,r.id,'Solicitud validada por el profesional','La solicitud '||r.filing_number||' está lista para decisión del jefe' from public.profiles where role::text='manager' and active and department_id=r.department_id;
  end if;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,old_data,new_data) values(auth.uid(),p_action,'overtime_request',r.id::text,jsonb_build_object('status',old_status),to_jsonb(r));
  return r;
end $$;

-- ---------- Validación de parámetros nuevos ----------
create or replace function public.validate_app_parameter_v2()
returns trigger language plpgsql as $$
declare k text;
begin
  if new.key='food_allowance_values' then
    if jsonb_typeof(new.value)<>'object' then raise exception 'Los valores de auxilios deben ser un objeto'; end if;
    foreach k in array array['breakfast','lunch','dinner'] loop
      if new.value ? k and jsonb_typeof(new.value->k) not in ('null','number') then raise exception 'Valor de auxilio no válido: %',k; end if;
      if jsonb_typeof(new.value->k)='number' and (new.value->>k)::numeric<0 then raise exception 'Los valores de auxilios no pueden ser negativos'; end if;
    end loop;
  elsif new.key in ('aux_breakfast_minutes_before','aux_dinner_minutes_after') then
    if jsonb_typeof(new.value)<>'number' or (new.value #>> '{}')::numeric<=0 or (new.value #>> '{}')::numeric>720 then raise exception 'Minutos no válidos para %',new.key; end if;
  elsif new.key='require_professional_validation' then
    if jsonb_typeof(new.value)<>'boolean' then raise exception 'El parámetro de validación profesional debe ser verdadero o falso'; end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_app_parameter_v2 on public.app_parameters;
create trigger trg_validate_app_parameter_v2 before insert or update on public.app_parameters for each row execute function public.validate_app_parameter_v2();

-- ---------- Vista para reportes de horas aprobadas (aplica RLS del usuario) ----------
create or replace view public.approved_overtime_v with (security_invoker = true) as
  select r.id,r.filing_number,r.employee_id,r.department_id,r.execution_date,r.start_time,r.end_time,r.work_type_id,r.status,r.approved_hours,
         r.selected_activities,r.aux_breakfast,r.aux_lunch,r.aux_dinner,r.aux_values,r.approved_at,r.decided_by,r.decided_at
  from public.overtime_requests r
  where r.status::text in ('approved','pending_execution','validated','closed') and r.approved_hours is not null;

-- ---------- Seguridad (RLS) ----------
alter table public.work_shifts enable row level security;
alter table public.unions enable row level security;
alter table public.union_cost_rules enable row level security;
alter table public.employee_compensation enable row level security;
alter table public.activity_catalog enable row level security;
alter table public.overtime_cost_snapshots enable row level security;
drop policy if exists "authenticated read shifts" on public.work_shifts;
create policy "authenticated read shifts" on public.work_shifts for select to authenticated using(true);
drop policy if exists "admins manage shifts" on public.work_shifts;
create policy "admins manage shifts" on public.work_shifts for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "authenticated read unions" on public.unions;
create policy "authenticated read unions" on public.unions for select to authenticated using(true);
drop policy if exists "admins manage unions" on public.unions;
create policy "admins manage unions" on public.unions for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "admins manage union rules" on public.union_cost_rules;
create policy "admins manage union rules" on public.union_cost_rules for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "admins manage compensation" on public.employee_compensation;
create policy "admins manage compensation" on public.employee_compensation for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "authenticated read activities" on public.activity_catalog;
create policy "authenticated read activities" on public.activity_catalog for select to authenticated using(active or public.is_admin());
drop policy if exists "admins manage activities" on public.activity_catalog;
create policy "admins manage activities" on public.activity_catalog for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "admins read cost snapshots" on public.overtime_cost_snapshots;
create policy "admins read cost snapshots" on public.overtime_cost_snapshots for select to authenticated using(public.is_admin());
drop policy if exists "read own requests or admin" on public.overtime_requests;
drop policy if exists "read requests by role" on public.overtime_requests;
create policy "read requests by role" on public.overtime_requests for select to authenticated using(public.can_see_request(employee_id,department_id));
drop policy if exists "read related history" on public.request_history;
create policy "read related history" on public.request_history for select to authenticated using(exists(select 1 from public.overtime_requests r where r.id=request_id and public.can_see_request(r.employee_id,r.department_id)));
drop policy if exists "read related attachments" on public.attachments;
create policy "read related attachments" on public.attachments for select to authenticated using(owner_id=auth.uid() or exists(select 1 from public.overtime_requests r where r.id=request_id and public.can_see_request(r.employee_id,r.department_id)));
drop policy if exists "staff read profiles" on public.profiles;
create policy "staff read profiles" on public.profiles for select to authenticated using(public.is_staff());
drop policy if exists "staff read supports in scope" on storage.objects;
create policy "staff read supports in scope" on storage.objects for select to authenticated using(bucket_id='overtime-supports' and exists(select 1 from public.attachments a join public.overtime_requests r on r.id=a.request_id where a.storage_path=name and public.can_see_request(r.employee_id,r.department_id)));

grant select on public.work_shifts,public.unions,public.activity_catalog,public.approved_overtime_v to authenticated;
grant select,insert,update,delete on public.union_cost_rules,public.employee_compensation to authenticated;
grant insert,update,delete on public.work_shifts,public.unions,public.activity_catalog to authenticated;
grant select on public.overtime_cost_snapshots to authenticated;
revoke all on function public.recalculate_overtime_costs() from public,anon;
grant execute on function public.recalculate_overtime_costs() to authenticated;
revoke all on function public.recompute_open_food_allowances() from public,anon;
grant execute on function public.recompute_open_food_allowances() to authenticated;
revoke all on function public.recompute_food_allowances_for(uuid) from public,anon,authenticated;
revoke all on function public.compute_overtime_cost(uuid) from public,anon,authenticated;

-- Auditoría de los catálogos nuevos
drop trigger if exists audit_work_shifts on public.work_shifts;
create trigger audit_work_shifts after insert or update or delete on public.work_shifts for each row execute function public.audit_generic_changes();
drop trigger if exists audit_unions on public.unions;
create trigger audit_unions after insert or update or delete on public.unions for each row execute function public.audit_generic_changes();
drop trigger if exists audit_union_rules on public.union_cost_rules;
create trigger audit_union_rules after insert or update or delete on public.union_cost_rules for each row execute function public.audit_generic_changes();
drop trigger if exists audit_activity_catalog on public.activity_catalog;
create trigger audit_activity_catalog after insert or update or delete on public.activity_catalog for each row execute function public.audit_generic_changes();
drop trigger if exists audit_compensation on public.employee_compensation;
create trigger audit_compensation after insert or update or delete on public.employee_compensation for each row execute function public.audit_generic_changes();
-- Después de ejecutar: asigne en «Funcionarios» el turno, el sindicato, el salario base y el rol (Jefe/Profesional) de cada persona.
  
  -- =====================================================================================
  -- MIGRACIÓN v3 (ver archivo migracion_v3_gestion_financiera.sql)
  -- =====================================================================================
-- =====================================================================================
-- MIGRACIÓN v3 · Gestión financiera, sindicatos con auxilio parametrizable, salarios con historial
--                y reglas laborales con vigencia (idempotente: puede ejecutarse más de una vez).
-- Requiere haber ejecutado antes la instalación base y la migración v2.
-- Seguridad: toda escritura sensible pasa por funciones SECURITY DEFINER que verifican el rol en el servidor.
-- =====================================================================================
-- ---------- Redondeo configurable (valores positivos) ----------
create or replace function public.round_mode(p_x numeric,p_dec int,p_mode text)
returns numeric language plpgsql immutable as $$
declare f numeric:=power(10::numeric,p_dec); y numeric:=p_x*f; fl numeric:=floor(y); fr numeric:=y-fl; r numeric;
begin
  case p_mode
    when 'floor' then r:=fl;
    when 'ceil' then r:=ceil(y);
    when 'half_down' then r:=case when fr>0.5 then fl+1 else fl end;
    when 'half_even' then r:=case when fr>0.5 then fl+1 when fr<0.5 then fl else case when mod(fl,2)=0 then fl else fl+1 end end;
    else r:=case when fr>=0.5 then fl+1 else fl end;
  end case;
  return r/f;
end $$;
-- ---------- Tablas ----------
create table if not exists public.labor_rules (
  id uuid primary key default gen_random_uuid(),
  valid_from date not null,
  valid_to date,
  weekly_hours numeric(6,2) not null check (weekly_hours>0 and weekly_hours<=84),
  monthly_divisor numeric(7,2) not null check (monthly_divisor>0 and monthly_divisor<=744),
  night_start time not null default '19:00',
  night_end time not null default '06:00',
  night_surcharge numeric(7,4) not null check (night_surcharge between 0 and 5),
  extra_day numeric(7,4) not null check (extra_day between 0 and 5),
  extra_night numeric(7,4) not null check (extra_night between 0 and 5),
  holiday_surcharge numeric(7,4) not null check (holiday_surcharge between 0 and 5),
  reference_salary numeric(14,2) check (reference_salary is null or reference_salary>=0),
  rate_mode text not null default 'auto' check (rate_mode in ('auto','manual')),
  manual_rates jsonb,
  manual_source text,
  rounding jsonb not null default '{"base":{"mode":"half_up","decimals":0},"rate":{"mode":"floor","decimals":0},"total":{"mode":"half_up","decimals":0}}',
  legal_status text not null default 'pending' check (legal_status in ('pending','validated')),
  source text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint labor_rules_range check (valid_to is null or valid_to>=valid_from),
  constraint labor_rules_night check (night_start<>night_end),
  constraint labor_rules_manual check (rate_mode<>'manual' or (manual_rates is not null and char_length(trim(coalesce(manual_source,'')))>=5))
);
create table if not exists public.union_food_rules (
  id uuid primary key default gen_random_uuid(),
  union_id uuid not null references public.unions(id) on delete cascade,
  valid_from date not null,
  valid_to date,
  amount numeric(14,2) not null check (amount>0),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint union_food_rules_range check (valid_to is null or valid_to>=valid_from)
);
create index if not exists union_food_rules_idx on public.union_food_rules(union_id,valid_from);
create table if not exists public.salary_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  salary numeric(14,2) not null check (salary>0),
  valid_from date not null,
  valid_to date,
  reason text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint salary_history_range check (valid_to is null or valid_to>=valid_from)
);
create index if not exists salary_history_idx on public.salary_history(employee_id,valid_from desc);
create table if not exists public.union_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles(id) on delete cascade,
  union_id uuid not null references public.unions(id),
  valid_from date not null,
  valid_to date,
  reason text,
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint union_assignments_range check (valid_to is null or valid_to>=valid_from)
);
create index if not exists union_assignments_idx on public.union_assignments(employee_id,valid_from desc);
alter table public.overtime_requests add column if not exists aux_ack jsonb;
create index if not exists overtime_exec_idx on public.overtime_requests(execution_date,status);
-- ---------- Vigencias sin cruce ----------
create or replace function public.check_range_overlap()
returns trigger language plpgsql as $$
declare v_key text; n int;
begin
  if tg_table_name='labor_rules' then
    if new.active then select count(*) into n from public.labor_rules x where x.id<>new.id and x.active and daterange(x.valid_from,coalesce(x.valid_to,'infinity'::date),'[]') && daterange(new.valid_from,coalesce(new.valid_to,'infinity'::date),'[]'); end if;
  elsif tg_table_name='union_food_rules' then
    if new.active then select count(*) into n from public.union_food_rules x where x.id<>new.id and x.union_id=new.union_id and x.active and daterange(x.valid_from,coalesce(x.valid_to,'infinity'::date),'[]') && daterange(new.valid_from,coalesce(new.valid_to,'infinity'::date),'[]'); end if;
  elsif tg_table_name='salary_history' then
    select count(*) into n from public.salary_history x where x.id<>new.id and x.employee_id=new.employee_id and daterange(x.valid_from,coalesce(x.valid_to,'infinity'::date),'[]') && daterange(new.valid_from,coalesce(new.valid_to,'infinity'::date),'[]');
  elsif tg_table_name='union_assignments' then
    select count(*) into n from public.union_assignments x where x.id<>new.id and x.employee_id=new.employee_id and daterange(x.valid_from,coalesce(x.valid_to,'infinity'::date),'[]') && daterange(new.valid_from,coalesce(new.valid_to,'infinity'::date),'[]');
  end if;
  if coalesce(n,0)>0 then raise exception 'La vigencia se cruza con otro registro vigente'; end if;
  return new;
end $$;
drop trigger if exists trg_labor_rules_overlap on public.labor_rules;
create trigger trg_labor_rules_overlap before insert or update on public.labor_rules for each row execute function public.check_range_overlap();
drop trigger if exists trg_union_food_overlap on public.union_food_rules;
create trigger trg_union_food_overlap before insert or update on public.union_food_rules for each row execute function public.check_range_overlap();
drop trigger if exists trg_salary_history_overlap on public.salary_history;
create trigger trg_salary_history_overlap before insert or update on public.salary_history for each row execute function public.check_range_overlap();
drop trigger if exists trg_union_assign_overlap on public.union_assignments;
create trigger trg_union_assign_overlap before insert or update on public.union_assignments for each row execute function public.check_range_overlap();
-- ---------- Seguridad (RLS) ----------
alter table public.labor_rules enable row level security;
alter table public.union_food_rules enable row level security;
alter table public.salary_history enable row level security;
alter table public.union_assignments enable row level security;
drop policy if exists "authenticated read labor rules" on public.labor_rules;
create policy "authenticated read labor rules" on public.labor_rules for select to authenticated using(true);
drop policy if exists "admins manage labor rules" on public.labor_rules;
create policy "admins manage labor rules" on public.labor_rules for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "authenticated read union food rules" on public.union_food_rules;
create policy "authenticated read union food rules" on public.union_food_rules for select to authenticated using(true);
drop policy if exists "admins manage union food rules" on public.union_food_rules;
create policy "admins manage union food rules" on public.union_food_rules for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "admins manage salary history" on public.salary_history;
create policy "admins manage salary history" on public.salary_history for all to authenticated using(public.is_admin()) with check(public.is_admin());
drop policy if exists "read union assignments" on public.union_assignments;
create policy "read union assignments" on public.union_assignments for select to authenticated using(public.is_staff() or employee_id=auth.uid());
drop policy if exists "admins manage union assignments" on public.union_assignments;
create policy "admins manage union assignments" on public.union_assignments for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select on public.labor_rules,public.union_food_rules,public.union_assignments to authenticated;
grant insert,update,delete on public.labor_rules,public.union_food_rules,public.union_assignments to authenticated;
grant select,insert,update,delete on public.salary_history to authenticated;
-- Auditoría automática de las tablas nuevas
drop trigger if exists audit_labor_rules on public.labor_rules;
create trigger audit_labor_rules after insert or update or delete on public.labor_rules for each row execute function public.audit_generic_changes();
drop trigger if exists audit_union_food_rules on public.union_food_rules;
create trigger audit_union_food_rules after insert or update or delete on public.union_food_rules for each row execute function public.audit_generic_changes();
drop trigger if exists audit_salary_history on public.salary_history;
create trigger audit_salary_history after insert or update or delete on public.salary_history for each row execute function public.audit_generic_changes();
-- ---------- Historial de sindicato: se alimenta con cualquier cambio de profiles.union_id ----------
create or replace function public.trg_profile_union_history()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_from date:=coalesce(nullif(current_setting('app.union_valid_from',true),'')::date,current_date); v_reason text:=coalesce(nullif(current_setting('app.union_reason',true),''),'Cambio registrado'); v_action text:=coalesce(nullif(current_setting('app.union_action',true),''),'change_union');
begin
  if new.union_id is distinct from old.union_id then
    if exists(select 1 from public.union_assignments where employee_id=new.id and valid_to is null and valid_from>=v_from) then raise exception 'La fecha del cambio debe ser posterior al inicio de la asignación vigente'; end if;
    update public.union_assignments set valid_to=v_from-1 where employee_id=new.id and valid_to is null;
    if new.union_id is not null then insert into public.union_assignments(employee_id,union_id,valid_from,reason,changed_by) values(new.id,new.union_id,v_from,v_reason,auth.uid()); end if;
    insert into public.audit_log(actor_id,action,entity_type,entity_id,old_data,new_data) values(auth.uid(),v_action,'profiles',new.id::text,jsonb_build_object('union_id',old.union_id),jsonb_build_object('union_id',new.union_id,'valid_from',v_from,'reason',v_reason));
  end if;
  return new;
end $$;
drop trigger if exists trg_profile_union_history on public.profiles;
create trigger trg_profile_union_history after update of union_id on public.profiles for each row execute function public.trg_profile_union_history();
-- ---------- Cambio de sindicato (administrador) y selección inicial (funcionario) ----------
create or replace function public.admin_change_union(p_employee uuid,p_union uuid,p_valid_from date,p_reason text)
returns public.profiles language plpgsql security definer set search_path=public as $$
declare r public.profiles; v_cur date;
begin
  if not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  if p_union is null or not exists(select 1 from public.unions where id=p_union and active) then raise exception 'El sindicato seleccionado no existe o está inactivo'; end if;
  if p_valid_from is null or p_valid_from>current_date then raise exception 'La fecha del cambio no puede ser futura'; end if;
  if char_length(trim(coalesce(p_reason,'')))<5 then raise exception 'Registra el motivo del cambio (mínimo 5 caracteres)'; end if;
  select * into r from public.profiles where id=p_employee for update;
  if not found then raise exception 'Funcionario no encontrado'; end if;
  if r.union_id is not distinct from p_union then raise exception 'El funcionario ya pertenece a ese sindicato'; end if;
  select max(valid_from) into v_cur from public.union_assignments where employee_id=p_employee;
  if v_cur is not null and p_valid_from<=v_cur then raise exception 'La fecha del cambio debe ser posterior al inicio de la asignación actual (%)',v_cur; end if;
  perform set_config('app.union_valid_from',p_valid_from::text,true);
  perform set_config('app.union_reason',trim(p_reason),true);
  perform set_config('app.union_action','change_union',true);
  update public.profiles set union_id=p_union,updated_at=now() where id=p_employee returning * into r;
  return r;
end $$;
create or replace function public.set_own_union(p_union uuid)
returns public.profiles language plpgsql security definer set search_path=public as $$
declare r public.profiles; v_allow boolean:=true;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  select coalesce((value #>> '{}')::boolean,true) into v_allow from public.app_parameters where key='union_self_service';
  if not coalesce(v_allow,true) then raise exception 'La selección de sindicato por parte del funcionario está deshabilitada'; end if;
  select * into r from public.profiles where id=auth.uid() and active for update;
  if not found then raise exception 'Perfil no encontrado o inactivo'; end if;
  if r.union_id is not null then raise exception 'Ya tienes un sindicato asignado; solicita el cambio al administrador'; end if;
  if not exists(select 1 from public.unions where id=p_union and active) then raise exception 'El sindicato seleccionado no está disponible'; end if;
  perform set_config('app.union_valid_from',current_date::text,true);
  perform set_config('app.union_reason','Selección del propio funcionario',true);
  perform set_config('app.union_action','self_set_union',true);
  update public.profiles set union_id=p_union,updated_at=now() where id=auth.uid() returning * into r;
  return r;
end $$;
-- ---------- Salarios con historial (el historial no se reescribe) ----------
create or replace function public.admin_set_salary(p_employee uuid,p_salary numeric,p_valid_from date,p_reason text)
returns public.salary_history language plpgsql security definer set search_path=public as $$
declare cur public.salary_history; r public.salary_history; v_now numeric;
begin
  if not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  if p_salary is null or p_salary<=0 then raise exception 'El salario debe ser mayor que cero'; end if;
  if p_valid_from is null then raise exception 'Indica desde qué fecha rige el salario'; end if;
  if char_length(trim(coalesce(p_reason,'')))<5 then raise exception 'Registra el motivo del cambio (mínimo 5 caracteres)'; end if;
  if not exists(select 1 from public.profiles where id=p_employee) then raise exception 'Funcionario no encontrado'; end if;
  select * into cur from public.salary_history where employee_id=p_employee order by valid_from desc limit 1;
  if cur.id is not null then
    if p_valid_from<=cur.valid_from then raise exception 'La fecha de vigencia debe ser posterior al inicio del salario actual (%)',cur.valid_from; end if;
    if cur.salary=p_salary then raise exception 'El salario nuevo es igual al vigente'; end if;
    update public.salary_history set valid_to=p_valid_from-1 where id=cur.id;
  end if;
  insert into public.salary_history(employee_id,salary,valid_from,reason,changed_by) values(p_employee,p_salary,p_valid_from,trim(p_reason),auth.uid()) returning * into r;
  select salary into v_now from public.salary_history where employee_id=p_employee and valid_from<=current_date and (valid_to is null or valid_to>=current_date) order by valid_from desc limit 1;
  insert into public.employee_compensation(profile_id,base_salary,updated_at,updated_by) values(p_employee,v_now,now(),auth.uid()) on conflict(profile_id) do update set base_salary=excluded.base_salary,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,old_data,new_data) values(auth.uid(),'set_salary','employee_compensation',p_employee::text,case when cur.id is not null then jsonb_build_object('salary',cur.salary,'valid_from',cur.valid_from) end,jsonb_build_object('salary',p_salary,'valid_from',p_valid_from,'reason',trim(p_reason)));
  return r;
end $$;
-- ---------- Auxilio de alimentación por sindicato con vigencia ----------
create or replace function public.admin_set_union_food(p_union uuid,p_amount numeric,p_valid_from date,p_notes text default null)
returns public.union_food_rules language plpgsql security definer set search_path=public as $$
declare cur public.union_food_rules; r public.union_food_rules;
begin
  if not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'El valor del auxilio debe ser mayor que cero'; end if;
  if p_valid_from is null then raise exception 'Indica desde qué fecha rige el valor'; end if;
  if not exists(select 1 from public.unions where id=p_union) then raise exception 'Sindicato no encontrado'; end if;
  select * into cur from public.union_food_rules where union_id=p_union and active order by valid_from desc limit 1;
  if cur.id is not null then
    if p_valid_from<=cur.valid_from then raise exception 'La vigencia debe ser posterior al inicio del valor actual (%)',cur.valid_from; end if;
    update public.union_food_rules set valid_to=p_valid_from-1 where id=cur.id and (valid_to is null or valid_to>=p_valid_from);
  end if;
  insert into public.union_food_rules(union_id,valid_from,amount,notes,created_by) values(p_union,p_valid_from,p_amount,nullif(trim(coalesce(p_notes,'')),''),auth.uid()) returning * into r;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,old_data,new_data) values(auth.uid(),'set_food_rule','union_food_rules',p_union::text,case when cur.id is not null then jsonb_build_object('amount',cur.amount,'valid_from',cur.valid_from) end,jsonb_build_object('union_id',p_union,'amount',p_amount,'valid_from',p_valid_from));
  return r;
end $$;
-- Valor del auxilio congelado al aprobar: regla del sindicato vigente en la fecha de ejecución; si no existe, valores generales por tipo.
create or replace function public.food_values_snapshot_for(p_employee uuid,p_date date,p_b boolean,p_l boolean,p_d boolean)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_union uuid; v_rule public.union_food_rules; g jsonb;
begin
  select a.union_id into v_union from public.union_assignments a where a.employee_id=p_employee and a.valid_from<=p_date and (a.valid_to is null or a.valid_to>=p_date) order by a.valid_from desc limit 1;
  if v_union is null and not exists(select 1 from public.union_assignments where employee_id=p_employee) then select union_id into v_union from public.profiles where id=p_employee; end if;
  if v_union is not null then
    select * into v_rule from public.union_food_rules r where r.union_id=v_union and r.active and r.valid_from<=p_date and (r.valid_to is null or r.valid_to>=p_date) order by r.valid_from desc limit 1;
    if v_rule.id is not null then return jsonb_build_object('breakfast',v_rule.amount,'lunch',v_rule.amount,'dinner',v_rule.amount,'source','union','union_id',v_union,'rule_id',v_rule.id,'captured_at',now()); end if;
  end if;
  g:=public.food_values_snapshot(p_b,p_l,p_d);
  if g is null then return null; end if;
  return g||jsonb_build_object('source','global','union_id',v_union);
end $$;
create or replace function public.trg_aux_values_union()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status::text='approved' and old.status::text<>'approved' then
    new.aux_values:=public.food_values_snapshot_for(new.employee_id,new.execution_date,new.aux_breakfast,new.aux_lunch,new.aux_dinner);
  end if;
  return new;
end $$;
drop trigger if exists trg_aux_values_union on public.overtime_requests;
create trigger trg_aux_values_union before update of status on public.overtime_requests for each row execute function public.trg_aux_values_union();
-- Reconocimiento de auxilios (cantidad efectivamente causada): distingue lo estimado de lo real.
create or replace function public.acknowledge_food_allowance(p_request uuid,p_breakfast boolean,p_lunch boolean,p_dinner boolean,p_note text default null)
returns public.overtime_requests language plpgsql security definer set search_path=public as $$
declare r public.overtime_requests;
begin
  if coalesce(public.current_app_role(),'') not in ('admin','professional') then raise exception 'Tu rol no puede reconocer auxilios'; end if;
  select * into r from public.overtime_requests where id=p_request for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if r.status::text not in ('approved','pending_execution','validated','closed') then raise exception 'Solo se reconocen auxilios de solicitudes aprobadas'; end if;
  if not public.can_see_request(r.employee_id,r.department_id) then raise exception 'Acceso denegado'; end if;
  update public.overtime_requests set aux_ack=jsonb_build_object('breakfast',coalesce(p_breakfast,false),'lunch',coalesce(p_lunch,false),'dinner',coalesce(p_dinner,false),'by',auth.uid(),'at',now(),'note',nullif(trim(coalesce(p_note,'')),'')) where id=p_request returning * into r;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,new_data) values(auth.uid(),'acknowledge_aux','overtime_requests',p_request::text,r.aux_ack);
  return r;
end $$;
-- ---------- Motor de cálculo en el servidor (equivalente al motor PayrollEngine de la aplicación) ----------
-- Regla efectiva = regla laboral general vigente o, si existe, la regla específica del sindicato; salario y sindicato vigentes en la fecha de ejecución.
create or replace function public.compute_overtime_cost(p_request_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare
  r public.overtime_requests; p public.profiles; gen public.labor_rules; urule public.union_cost_rules;
  v_union uuid; v_union_name text; n_gen int; n_urule int; v_src text; v_rule_id uuid; v_vfrom date; v_vto date; v_legal text;
  v_div numeric; v_wh numeric; v_ns time:='19:00'; v_ne time:='06:00'; v_mode text:='auto'; v_manual jsonb; v_msrc text; v_round jsonb;
  f_hed numeric; f_hen numeric; f_hedd numeric; f_hedn numeric; sal numeric; sal_from date; reasons text[]:='{}';
  s int; e int; m int; mm int; ns int; ne int; dom0 boolean; dom1 boolean; dom boolean; night boolean;
  c1 int:=0; c2 int:=0; c3 int:=0; c4 int:=0; tot int; hrs numeric; bh numeric; rt1 numeric; rt2 numeric; rt3 numeric; rt4 numeric; v1 numeric; v2 numeric; v3 numeric; v4 numeric; ok boolean;
  rb_m text; rb_d int; rr_m text; rr_d int; rt_m text; rt_d int;
begin
  select * into r from public.overtime_requests where id=p_request_id;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  if r.status::text not in ('approved','pending_execution','validated','closed') or r.approved_hours is null then
    return jsonb_build_object('status','not_approved','reasons',jsonb_build_array('La solicitud no tiene aprobación válida'));
  end if;
  hrs:=r.approved_hours;
  select * into p from public.profiles where id=r.employee_id;
  select a.union_id into v_union from public.union_assignments a where a.employee_id=r.employee_id and a.valid_from<=r.execution_date and (a.valid_to is null or a.valid_to>=r.execution_date) order by a.valid_from desc limit 1;
  if v_union is null and not exists(select 1 from public.union_assignments where employee_id=r.employee_id) then v_union:=p.union_id; end if;
  if v_union is not null then select name into v_union_name from public.unions where id=v_union; end if;
  select count(*) into n_gen from public.labor_rules x where x.active and x.valid_from<=r.execution_date and (x.valid_to is null or x.valid_to>=r.execution_date);
  if n_gen>1 then reasons:=array_append(reasons,'Más de una regla laboral vigente (configuración incompatible)');
  elsif n_gen=1 then select * into gen from public.labor_rules x where x.active and x.valid_from<=r.execution_date and (x.valid_to is null or x.valid_to>=r.execution_date) limit 1; end if;
  if v_union is not null then
    select count(*) into n_urule from public.union_cost_rules x where x.union_id=v_union and x.active and x.valid_from<=r.execution_date and (x.valid_to is null or x.valid_to>=r.execution_date);
    if n_urule>1 then reasons:=array_append(reasons,'Más de una regla de sindicato vigente (configuración incompatible)');
    elsif n_urule=1 then select * into urule from public.union_cost_rules x where x.union_id=v_union and x.active and x.valid_from<=r.execution_date and (x.valid_to is null or x.valid_to>=r.execution_date) limit 1; end if;
  end if;
  if gen.id is not null then v_wh:=gen.weekly_hours; v_ns:=gen.night_start; v_ne:=gen.night_end; v_round:=gen.rounding; end if;
  if urule.id is not null then
    v_src:='union'; v_rule_id:=urule.id; v_vfrom:=urule.valid_from; v_vto:=urule.valid_to; v_legal:='convention'; v_div:=urule.hourly_divisor;
    f_hed:=urule.factor_hed; f_hen:=urule.factor_hen; f_hedd:=urule.factor_hedd; f_hedn:=urule.factor_hedn; v_mode:='auto';
  elsif gen.id is not null then
    v_src:='general'; v_rule_id:=gen.id; v_vfrom:=gen.valid_from; v_vto:=gen.valid_to; v_legal:=gen.legal_status; v_div:=gen.monthly_divisor;
    f_hed:=1+gen.extra_day; f_hen:=1+gen.extra_night; f_hedd:=1+gen.extra_day+gen.holiday_surcharge; f_hedn:=1+gen.extra_night+gen.holiday_surcharge;
    v_mode:=gen.rate_mode; v_manual:=gen.manual_rates; v_msrc:=gen.manual_source;
  elsif coalesce(array_length(reasons,1),0)=0 then reasons:=array_append(reasons,'Sin regla laboral vigente para '||to_char(r.execution_date,'DD/MM/YYYY')); end if;
  rb_m:=coalesce(v_round->'base'->>'mode','half_up'); rb_d:=coalesce((v_round->'base'->>'decimals')::int,0);
  rr_m:=coalesce(v_round->'rate'->>'mode','floor'); rr_d:=coalesce((v_round->'rate'->>'decimals')::int,0);
  rt_m:=coalesce(v_round->'total'->>'mode','half_up'); rt_d:=coalesce((v_round->'total'->>'decimals')::int,0);
  if v_src is not null and v_mode<>'manual' then
    select h.salary,h.valid_from into sal,sal_from from public.salary_history h where h.employee_id=r.employee_id and h.valid_from<=r.execution_date and (h.valid_to is null or h.valid_to>=r.execution_date) order by h.valid_from desc limit 1;
    if sal is null and not exists(select 1 from public.salary_history where employee_id=r.employee_id) then select base_salary into sal from public.employee_compensation where profile_id=r.employee_id; sal_from:=null; end if;
    if sal is null or sal<=0 then reasons:=array_append(reasons,'Sin salario vigente en la fecha de ejecución'); end if;
    if v_div is null or v_div<=0 then reasons:=array_append(reasons,'La regla no define el divisor de horas mensuales'); end if;
  end if;
  s:=(extract(hour from r.start_time)*60+extract(minute from r.start_time))::int; e:=(extract(hour from r.end_time)*60+extract(minute from r.end_time))::int;
  if e<=s then e:=e+1440; end if;
  ns:=(extract(hour from v_ns)*60+extract(minute from v_ns))::int; ne:=(extract(hour from v_ne)*60+extract(minute from v_ne))::int;
  dom0:=extract(isodow from r.execution_date)=7 or public.is_co_holiday(r.execution_date);
  dom1:=extract(isodow from r.execution_date+1)=7 or public.is_co_holiday(r.execution_date+1);
  for m in s..e-1 loop
    mm:=m%1440; dom:=case when m>=1440 then dom1 else dom0 end;
    night:=case when ns>ne then (mm>=ns or mm<ne) else (mm>=ns and mm<ne) end;
    if dom then if night then c4:=c4+1; else c3:=c3+1; end if; else if night then c2:=c2+1; else c1:=c1+1; end if; end if;
  end loop;
  tot:=c1+c2+c3+c4;
  if v_src is not null then
    if v_mode='manual' then
      if c1>0 and coalesce((v_manual->>'hed')::numeric,0)<=0 then reasons:=array_append(reasons,'Falta el valor manual de hora extra diurna'); end if;
      if c2>0 and coalesce((v_manual->>'hen')::numeric,0)<=0 then reasons:=array_append(reasons,'Falta el valor manual de hora extra nocturna'); end if;
      if c3>0 and coalesce((v_manual->>'hedd')::numeric,0)<=0 then reasons:=array_append(reasons,'Falta el valor manual de hora extra diurna dominical/festiva'); end if;
      if c4>0 and coalesce((v_manual->>'hedn')::numeric,0)<=0 then reasons:=array_append(reasons,'Falta el valor manual de hora extra nocturna dominical/festiva'); end if;
    else
      if c1>0 and coalesce(f_hed,0)<=0 then reasons:=array_append(reasons,'La regla no define el factor de hora extra diurna'); end if;
      if c2>0 and coalesce(f_hen,0)<=0 then reasons:=array_append(reasons,'La regla no define el factor de hora extra nocturna'); end if;
      if c3>0 and coalesce(f_hedd,0)<=0 then reasons:=array_append(reasons,'La regla no define el factor de hora extra diurna dominical/festiva'); end if;
      if c4>0 and coalesce(f_hedn,0)<=0 then reasons:=array_append(reasons,'La regla no define el factor de hora extra nocturna dominical/festiva'); end if;
    end if;
  end if;
  ok:=coalesce(array_length(reasons,1),0)=0 and v_src is not null;
  if ok then
    if v_mode='manual' then rt1:=(v_manual->>'hed')::numeric; rt2:=(v_manual->>'hen')::numeric; rt3:=(v_manual->>'hedd')::numeric; rt4:=(v_manual->>'hedn')::numeric;
    else
      bh:=public.round_mode(sal/v_div,rb_d,rb_m);
      rt1:=public.round_mode(bh*coalesce(f_hed,0),rr_d,rr_m); rt2:=public.round_mode(bh*coalesce(f_hen,0),rr_d,rr_m); rt3:=public.round_mode(bh*coalesce(f_hedd,0),rr_d,rr_m); rt4:=public.round_mode(bh*coalesce(f_hedn,0),rr_d,rr_m);
    end if;
    if tot>0 then
      v1:=public.round_mode(coalesce(rt1,0)*c1*hrs/tot,rt_d,rt_m); v2:=public.round_mode(coalesce(rt2,0)*c2*hrs/tot,rt_d,rt_m); v3:=public.round_mode(coalesce(rt3,0)*c3*hrs/tot,rt_d,rt_m); v4:=public.round_mode(coalesce(rt4,0)*c4*hrs/tot,rt_d,rt_m);
    else v1:=0; v2:=0; v3:=0; v4:=0; end if;
  end if;
  return jsonb_build_object('engine','sql-3.0','status',case when ok then 'ok' else 'pending' end,'reasons',to_jsonb(reasons),'union_id',v_union,'union_name',v_union_name,
    'rule_id',v_rule_id,'rule_source',v_src,'rule_valid_from',v_vfrom,'rule_valid_to',v_vto,'rule_legal_status',v_legal,'rate_mode',v_mode,'manual_source',v_msrc,'weekly_hours',v_wh,'hourly_divisor',v_div,
    'night_window',jsonb_build_object('start',to_char(v_ns,'HH24:MI'),'end',to_char(v_ne,'HH24:MI')),
    'factors',jsonb_build_object('hed',f_hed,'hen',f_hen,'hedd',f_hedd,'hedn',f_hedn),
    'rounding',jsonb_build_object('base',jsonb_build_object('mode',rb_m,'decimals',rb_d),'rate',jsonb_build_object('mode',rr_m,'decimals',rr_d),'total',jsonb_build_object('mode',rt_m,'decimals',rt_d)),
    'base_salary',sal,'salary_valid_from',sal_from,'approved_hours',hrs,
    'minutes',jsonb_build_object('hed',c1,'hen',c2,'hedd',c3,'hedn',c4),
    'hours',jsonb_build_object('hed',case when tot>0 then round(hrs*c1/tot,2) else 0 end,'hen',case when tot>0 then round(hrs*c2/tot,2) else 0 end,'hedd',case when tot>0 then round(hrs*c3/tot,2) else 0 end,'hedn',case when tot>0 then round(hrs*c4/tot,2) else 0 end),
    'base_hour_value',case when ok then bh end,'rates',case when ok then jsonb_build_object('hed',rt1,'hen',rt2,'hedd',rt3,'hedn',rt4) end,
    'values',case when ok then jsonb_build_object('hed',v1,'hen',v2,'hedd',v3,'hedn',v4) end,'total',case when ok then v1+v2+v3+v4 end,'computed_at',now());
end $$;
-- Registra instantáneas pendientes o faltantes (nunca reemplaza un cálculo completo: protege el histórico).
create or replace function public.recalculate_overtime_costs()
returns jsonb language plpgsql security definer set search_path=public as $$
declare n_cost int:=0; n_aux int:=0; x record;
begin
  if not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  for x in select r.id from public.overtime_requests r left join public.overtime_cost_snapshots c on c.request_id=r.id
           where r.status::text in ('approved','pending_execution','validated','closed') and r.approved_hours is not null and (c.request_id is null or c.snapshot->>'status'<>'ok') loop
    insert into public.overtime_cost_snapshots(request_id,snapshot,computed_at,computed_by) values(x.id,public.compute_overtime_cost(x.id),now(),auth.uid())
      on conflict(request_id) do update set snapshot=excluded.snapshot,computed_at=excluded.computed_at,computed_by=excluded.computed_by;
    n_cost:=n_cost+1;
  end loop;
  update public.overtime_requests set aux_values=public.food_values_snapshot_for(employee_id,execution_date,aux_breakfast,aux_lunch,aux_dinner)
   where status::text in ('approved','pending_execution','validated','closed') and aux_values is null and (aux_breakfast or aux_lunch or aux_dinner)
     and public.food_values_snapshot_for(employee_id,execution_date,aux_breakfast,aux_lunch,aux_dinner) is not null;
  get diagnostics n_aux=row_count;
  insert into public.audit_log(actor_id,action,entity_type,entity_id,new_data) values(auth.uid(),'recalculate_costs','overtime_cost_snapshots',null,jsonb_build_object('costs',n_cost,'aux',n_aux));
  return jsonb_build_object('costs',n_cost,'aux',n_aux);
end $$;
-- ---------- Acceso al análisis financiero (servidor) ----------
create or replace function public.can_view_finance()
returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((select case p.role::text
    when 'admin' then true
    when 'manager' then coalesce((select (value #>> '{}')::boolean from public.app_parameters where key='finance_access_manager'),true)
    when 'professional' then coalesce((select (value #>> '{}')::boolean from public.app_parameters where key='finance_access_professional'),true)
    else false end from public.profiles p where p.id=auth.uid() and p.active),false)
$$;
-- Costos dentro del ámbito del rol. Para quienes no son administradores se retiran salario y tarifas por hora (revelarían el salario).
create or replace function public.finance_cost_feed()
returns table(request_id uuid,origin text,cost jsonb) language plpgsql stable security definer set search_path=public as $$
#variable_conflict use_column
declare v_admin boolean:=public.is_admin();
begin
  if not public.can_view_finance() then raise exception 'No tienes acceso al análisis financiero'; end if;
  return query
  select r.id,
         case when s.snapshot->>'status'='ok' then 'registered' when c.j->>'status'='ok' then 'calculated' else 'pending' end,
         case when v_admin then coalesce(case when s.snapshot->>'status'='ok' then s.snapshot end,c.j)
              else coalesce(case when s.snapshot->>'status'='ok' then s.snapshot end,c.j)-'base_salary'-'base_hour_value'-'rates'-'salary_source'-'salary_valid_from' end
    from public.overtime_requests r
    left join public.overtime_cost_snapshots s on s.request_id=r.id
    cross join lateral (select case when s.snapshot->>'status'='ok' then null::jsonb else public.compute_overtime_cost(r.id) end as j) c
   where r.status::text in ('approved','pending_execution','validated','closed') and r.approved_hours is not null and public.can_see_request(r.employee_id,r.department_id);
end $$;
-- ---------- Parámetros nuevos: validación en el servidor ----------
create or replace function public.validate_app_parameter_v3()
returns trigger language plpgsql as $$
declare it jsonb;
begin
  if new.key='finance_monthly_budget' then
    if jsonb_typeof(new.value) not in ('null','number') or (jsonb_typeof(new.value)='number' and (new.value #>> '{}')::numeric<0) then raise exception 'El presupuesto debe ser un valor positivo o vacío'; end if;
  elsif new.key='finance_alert_increase_pct' then
    if jsonb_typeof(new.value)<>'number' or (new.value #>> '{}')::numeric<1 or (new.value #>> '{}')::numeric>500 then raise exception 'El umbral de alerta debe estar entre 1 y 500'; end if;
  elsif new.key in ('finance_access_manager','finance_access_professional','union_self_service') then
    if jsonb_typeof(new.value)<>'boolean' then raise exception 'El parámetro % debe ser verdadero o falso',new.key; end if;
  elsif new.key='finance_extra_concepts' then
    if jsonb_typeof(new.value)<>'array' then raise exception 'Los conceptos adicionales deben ser una lista'; end if;
    for it in select * from jsonb_array_elements(new.value) loop
      if jsonb_typeof(it->'name')<>'string' or char_length(trim(it->>'name'))<3 or jsonb_typeof(it->'percent')<>'number' or (it->>'percent')::numeric<0 or (it->>'percent')::numeric>500 then raise exception 'Concepto adicional no válido'; end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_app_parameter_v3 on public.app_parameters;
create trigger trg_validate_app_parameter_v3 before insert or update on public.app_parameters for each row execute function public.validate_app_parameter_v3();
-- ---------- Permisos de ejecución ----------
revoke all on function public.admin_change_union(uuid,uuid,date,text) from public,anon;
revoke all on function public.set_own_union(uuid) from public,anon;
revoke all on function public.admin_set_salary(uuid,numeric,date,text) from public,anon;
revoke all on function public.admin_set_union_food(uuid,numeric,date,text) from public,anon;
revoke all on function public.acknowledge_food_allowance(uuid,boolean,boolean,boolean,text) from public,anon;
revoke all on function public.finance_cost_feed() from public,anon;
revoke all on function public.can_view_finance() from public,anon;
revoke all on function public.food_values_snapshot_for(uuid,date,boolean,boolean,boolean) from public,anon,authenticated;
revoke all on function public.compute_overtime_cost(uuid) from public,anon,authenticated;
revoke all on function public.recalculate_overtime_costs() from public,anon;
grant execute on function public.admin_change_union(uuid,uuid,date,text) to authenticated;
grant execute on function public.set_own_union(uuid) to authenticated;
grant execute on function public.admin_set_salary(uuid,numeric,date,text) to authenticated;
grant execute on function public.admin_set_union_food(uuid,numeric,date,text) to authenticated;
grant execute on function public.acknowledge_food_allowance(uuid,boolean,boolean,boolean,text) to authenticated;
grant execute on function public.finance_cost_feed() to authenticated;
grant execute on function public.can_view_finance() to authenticated;
grant execute on function public.recalculate_overtime_costs() to authenticated;
-- ---------- Datos iniciales (solo si no existen) ----------
insert into public.app_parameters(key,value,description) values
 ('finance_access_manager','true','Permite al rol Jefe consultar el análisis financiero de su dependencia.'),
 ('finance_access_professional','true','Permite al rol Profesional consultar el análisis financiero.'),
 ('finance_alert_increase_pct','20','Umbral (%) de alerta por incremento del costo frente al periodo anterior.'),
 ('finance_monthly_budget','null','Presupuesto mensual (COP) de horas extras y auxilios. null = sin presupuesto.'),
 ('finance_extra_concepts','[]','Conceptos económicos adicionales como porcentaje del salario base.'),
 ('union_self_service','true','Permite al funcionario elegir su sindicato la primera vez.')
on conflict(key) do nothing;
insert into public.unions(name,code) select 'Sintraelecol','SINTRAELECOL' where not exists(select 1 from public.unions where lower(name)='sintraelecol');
insert into public.unions(name,code) select 'Siproessa','SIPROESSA' where not exists(select 1 from public.unions where lower(name)='siproessa');
insert into public.union_food_rules(union_id,valid_from,amount,notes) select u.id,date '2026-01-01',27000,'Valor inicial de referencia' from public.unions u where lower(u.name)='sintraelecol' and not exists(select 1 from public.union_food_rules f where f.union_id=u.id);
insert into public.union_food_rules(union_id,valid_from,amount,notes) select u.id,date '2026-01-01',23235,'Valor inicial de referencia' from public.unions u where lower(u.name)='siproessa' and not exists(select 1 from public.union_food_rules f where f.union_id=u.id);
-- Reglas laborales de referencia (verificadas con la normativa pública el 23/10/2026; quedan «pendientes de validación jurídica» hasta que un administrador las valide).
insert into public.labor_rules(valid_from,valid_to,weekly_hours,monthly_divisor,night_start,night_end,night_surcharge,extra_day,extra_night,holiday_surcharge,reference_salary,legal_status,source,notes)
select * from (values
 (date '2025-07-01',date '2025-07-14',46,230,time '21:00',time '06:00',0.35,0.25,0.75,0.80,1423500,'pending','Ley 2101 de 2021 · Ley 2466 de 2025 · CST arts. 168 y 179','Jornada de 46 h. Recargo dominical/festivo del 80 % desde el 1/07/2025. Noche desde las 9:00 p. m. hasta el 24/12/2025.'),
 (date '2025-07-15',date '2025-12-24',44,220,time '21:00',time '06:00',0.35,0.25,0.75,0.80,1423500,'pending','Ley 2101 de 2021 · Ley 2466 de 2025 · CST arts. 168 y 179','Jornada de 44 h desde el 15/07/2025.'),
 (date '2025-12-25',date '2026-06-30',44,220,time '19:00',time '06:00',0.35,0.25,0.75,0.80,1750905,'pending','Ley 2101 de 2021 · Ley 2466 de 2025 · CST arts. 168 y 179','Periodo nocturno desde las 7:00 p. m. desde el 25/12/2025. Salario mínimo 2026 de referencia.'),
 (date '2026-07-01',date '2026-07-14',44,220,time '19:00',time '06:00',0.35,0.25,0.75,0.90,1750905,'pending','Ley 2101 de 2021 · Ley 2466 de 2025 · CST arts. 168 y 179','Recargo dominical/festivo del 90 % desde el 1/07/2026.'),
 (date '2026-07-15',null,42,210,time '19:00',time '06:00',0.35,0.25,0.75,0.90,1750905,'pending','Ley 2101 de 2021 · Ley 2466 de 2025 · CST arts. 168 y 179','Jornada de 42 h y divisor de 210 horas desde el 15/07/2026. El recargo dominical/festivo sube al 100 % el 1/07/2027: registrar una nueva vigencia.')
) as v(valid_from,valid_to,weekly_hours,monthly_divisor,night_start,night_end,night_surcharge,extra_day,extra_night,holiday_surcharge,reference_salary,legal_status,source,notes)
where not exists(select 1 from public.labor_rules);
-- Migración del salario y del sindicato actuales al historial (conserva la trazabilidad: el valor vigente pasa a ser el primer registro).
insert into public.salary_history(employee_id,salary,valid_from,reason)
select c.profile_id,c.base_salary,least(p.created_at::date,coalesce((select min(execution_date) from public.overtime_requests q where q.employee_id=c.profile_id),p.created_at::date)),'Salario registrado antes del historial salarial'
  from public.employee_compensation c join public.profiles p on p.id=c.profile_id
 where c.base_salary>0 and not exists(select 1 from public.salary_history h where h.employee_id=c.profile_id);
insert into public.union_assignments(employee_id,union_id,valid_from,reason)
select p.id,p.union_id,least(p.created_at::date,coalesce((select min(execution_date) from public.overtime_requests q where q.employee_id=p.id),p.created_at::date)),'Asignación registrada antes del historial'
  from public.profiles p where p.union_id is not null and not exists(select 1 from public.union_assignments a where a.employee_id=p.id);
-- Después de ejecutar: en «Configuración → Sindicatos y auxilios» y «Salarios y horas extras» revise los valores; en «Funcionarios» asigne sindicato y salario.
-- =====================================================================================
-- MIGRACIÓN v4 · Aplicativo de Gestión de Horas Extras  (idempotente: puede ejecutarse más de una vez)
--   1. Gestión financiera: el campo «Salario base (referencia)» pasa a ser visible también para los roles
--      Profesional y Jefe (el Administrador ya lo tenía). No se modifican valores, cálculos ni otros permisos.
--   2. Funcionarios: catálogo de cargos y grados autorizados (30 combinaciones) y asignación opcional por funcionario.
-- Requiere haber ejecutado antes la instalación base y las migraciones v2 y v3.
-- No modifica ni elimina datos existentes: solo agrega una tabla, una columna opcional (NULL) y funciones.
-- =====================================================================================

-- ---------- 1. Salario base (referencia) ----------
-- salary_history sigue siendo exclusiva del administrador (RLS). Profesional y Jefe la consultan únicamente a través de
-- esta función de SOLO LECTURA, que verifica en el servidor el rol, el acceso al módulo financiero y el ámbito del usuario
-- (misma regla que can_see_request: Profesional = todos los funcionarios; Jefe = los de su dependencia).
-- Las tarifas por hora y la hora base siguen restringidas al administrador (finance_cost_feed no cambia).
create or replace function public.finance_salary_reference()
returns table(employee_id uuid,salary numeric,valid_from date,valid_to date)
language plpgsql stable security definer set search_path=public as $$
#variable_conflict use_column
begin
  if not public.can_view_finance() then raise exception 'No tienes acceso al análisis financiero'; end if;
  if coalesce(public.current_app_role(),'') not in ('admin','professional','manager') then
    raise exception 'Tu rol no puede consultar el salario base de referencia';
  end if;
  return query
  select h.employee_id,h.salary,h.valid_from,h.valid_to
    from public.salary_history h
    join public.profiles p on p.id=h.employee_id
   where public.can_see_request(h.employee_id,p.department_id);
end $$;
revoke all on function public.finance_salary_reference() from public,anon;
grant execute on function public.finance_salary_reference() to authenticated;

-- ---------- 2. Catálogo de cargos y grados ----------
create table if not exists public.job_grades (
  id uuid primary key default gen_random_uuid(),
  position_name text not null check (char_length(trim(position_name)) between 2 and 80),
  grade text not null check (char_length(trim(grade)) between 1 and 10),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint job_grades_position_grade_key unique (position_name,grade)
);
-- Asignación opcional: los funcionarios existentes quedan sin cargo/grado (NULL) y no se modifican.
-- La clave foránea garantiza que solo se pueda guardar una combinación cargo+grado que exista en el catálogo.
alter table public.profiles add column if not exists job_grade_id uuid references public.job_grades(id);
create index if not exists profiles_job_grade_idx on public.profiles(job_grade_id);

-- 30 combinaciones autorizadas. «Técnico» conserva la denominación del sistema (con tilde); la comparación ignora tildes
-- y mayúsculas, de modo que no se duplica una combinación que ya exista escrita como «Tecnico».
insert into public.job_grades(position_name,grade)
select v.p,v.g from (values
  ('Profesional 1','E'),('Profesional 1','1'),('Profesional 1','2'),('Profesional 1','3'),('Profesional 1','4'),
  ('Profesional 2','E'),('Profesional 2','1'),('Profesional 2','2'),('Profesional 2','3'),('Profesional 2','4'),
  ('Profesional 3','E'),('Profesional 3','1'),('Profesional 3','2'),('Profesional 3','3'),('Profesional 3','4'),
  ('Profesional 4','E'),('Profesional 4','1'),('Profesional 4','3'),
  ('Técnico','12'),('Técnico','16'),('Técnico','17'),('Técnico','18'),
  ('Calificado','6'),('Calificado','7'),('Calificado','11'),
  ('Altamente Calificado','13'),('Altamente Calificado','14'),('Altamente Calificado','15'),
  ('No Calificado','2'),('No Calificado','3')
) as v(p,g)
where not exists(select 1 from public.job_grades x
  where translate(lower(x.position_name),'áéíóú','aeiou')=translate(lower(v.p),'áéíóú','aeiou')
    and upper(x.grade)=upper(v.g));

-- El catálogo solo permite activar o desactivar combinaciones: no se renombran ni se agregan desde la aplicación.
create or replace function public.protect_job_grades()
returns trigger language plpgsql as $$
begin
  if new.position_name is distinct from old.position_name or new.grade is distinct from old.grade then
    raise exception 'La descripción del cargo y el grado del catálogo no se modifican; solo se activan o desactivan';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_job_grades on public.job_grades;
create trigger trg_protect_job_grades before update on public.job_grades for each row execute function public.protect_job_grades();

-- Asignación al funcionario: solo el administrador y solo con una combinación activa del catálogo (se valida al cambiarla;
-- un funcionario que ya tiene una combinación luego desactivada la conserva).
create or replace function public.validate_profile_job_grade()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' then
    if new.job_grade_id is not distinct from old.job_grade_id then return new; end if;   -- sin cambio: no se revalida (OLD solo existe en UPDATE)
  end if;
  if auth.uid() is not null and not public.is_admin() then
    raise exception 'Solo un administrador puede asignar el cargo y el grado';
  end if;
  if new.job_grade_id is not null and not exists(select 1 from public.job_grades where id=new.job_grade_id and active) then
    raise exception 'La combinación de cargo y grado no está autorizada o está inactiva';
  end if;
  return new;
end $$;
drop trigger if exists trg_validate_profile_job_grade on public.profiles;
create trigger trg_validate_profile_job_grade before insert or update of job_grade_id on public.profiles for each row execute function public.validate_profile_job_grade();

-- Seguridad (RLS): lectura para usuarios autenticados; el administrador solo puede cambiar el campo «active».
alter table public.job_grades enable row level security;
drop policy if exists "authenticated read job grades" on public.job_grades;
create policy "authenticated read job grades" on public.job_grades for select to authenticated using(true);
drop policy if exists "admins update job grades" on public.job_grades;
create policy "admins update job grades" on public.job_grades for update to authenticated using(public.is_admin()) with check(public.is_admin());
grant select on public.job_grades to authenticated;
grant update (active) on public.job_grades to authenticated;

-- Auditoría de cambios en el catálogo (se crea después de la carga inicial para no auditar la siembra).
drop trigger if exists audit_job_grades on public.job_grades;
create trigger audit_job_grades after insert or update or delete on public.job_grades for each row execute function public.audit_generic_changes();

-- Después de ejecutar: en «Funcionarios → Editar» el administrador asigna el cargo y el grado; en «Configuración → Cargos y grados»
-- puede activar o desactivar combinaciones del catálogo.

-- =====================================================================================
-- MIGRACIÓN v5 · Aprobación del jefe = cierre automático de la solicitud (el administrador sale del flujo operativo)
--   1. perform_request_action: al aprobar el jefe, la solicitud pasa por «Aprobada» y queda «Cerrada» en la misma transacción.
--      El historial y la auditoría registran las dos transiciones (aprobación y cierre automático), con el jefe como responsable.
--   2. Permisos del flujo: aprobar y rechazar = jefe de la dependencia; validar, iniciar revisión y cerrar solicitudes anteriores = profesional;
--      devolver = profesional o jefe. El administrador conserva solo cancelar (soporte) y la administración del sistema (configuración, funcionarios, eliminación).
--   3. Se retiran las acciones «Pendiente de ejecución» y «Validar ejecución» (ya no hay paso de ejecución entre la aprobación y el cierre).
--   4. save_overtime_request: el aviso de «Nueva solicitud por revisar» ya no se envía al administrador (lo reciben el profesional y el jefe por trg_notify_reviewers).
-- Idempotente: puede ejecutarse más de una vez. No modifica datos existentes.
-- Las solicitudes aprobadas ANTES de esta migración (estados approved / pending_execution / validated) no se tocan: un profesional puede cerrarlas con «Cerrar solicitud».
-- =====================================================================================

-- ---------- 1. Cierre automático y permisos del flujo ----------
create or replace function public.perform_request_action(p_request_id uuid,p_action text,p_comment text default null,p_hours numeric default null)
returns public.overtime_requests language plpgsql security definer set search_path=public as $$
declare r public.overtime_requests; me public.profiles; old_status public.request_status; new_status public.request_status; my_role text; allowed boolean:=false; mgr boolean:=false;
  approval_comment_required boolean:=false; require_pro boolean:=false; v_comment text:=nullif(trim(coalesce(p_comment,'')),'');
begin
  select * into me from public.profiles where id=auth.uid() and active=true;
  if not found then raise exception 'Sesión no válida o usuario inactivo'; end if;
  my_role:=me.role::text;
  select * into r from public.overtime_requests where id=p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada'; end if;
  old_status:=r.status;
  case p_action
    when 'start_review' then new_status:='in_review';
    when 'professional_validate' then new_status:='in_review';
    when 'return' then new_status:='returned';
    when 'approve' then new_status:='approved';      -- queda «approved» un instante y se cierra más abajo, en la misma transacción
    when 'reject' then new_status:='rejected';
    when 'close' then new_status:='closed';          -- solo para solicitudes aprobadas antes de la migración v5
    when 'cancel' then new_status:='cancelled';
    else raise exception 'Acción no permitida';
  end case;
  mgr:= my_role='manager' and me.department_id is not null and me.department_id=r.department_id;
  allowed:= case
    when p_action='cancel' then auth.uid()=r.employee_id or my_role='admin'
    when p_action in ('start_review','professional_validate','close') then my_role='professional'
    when p_action='return' then my_role='professional' or mgr
    when p_action in ('approve','reject') then mgr
    else false end;
  if not allowed then
    if my_role='admin' and p_action<>'cancel' then raise exception 'El administrador no interviene en la aprobación ni en el cierre de solicitudes'; end if;
    raise exception 'Tu rol no tiene permiso para realizar esta acción';
  end if;
  if p_action<>'cancel' and r.employee_id=auth.uid() then raise exception 'No puedes gestionar tus propias solicitudes'; end if;
  if (p_action='start_review' and old_status<>'pending') or (p_action in ('professional_validate','return','approve','reject') and old_status not in ('pending','in_review'))
     or (p_action='close' and old_status not in ('approved','pending_execution','validated')) or (p_action='cancel' and old_status not in ('draft','pending','returned')) then
    raise exception 'Transición de estado no permitida';
  end if;
  if p_action='professional_validate' and r.professional_result='favorable' then raise exception 'La solicitud ya tiene validación favorable del profesional'; end if;
  if p_action in ('return','reject') and char_length(coalesce(v_comment,''))<5 then raise exception 'Debe registrar una observación de al menos 5 caracteres'; end if;
  select coalesce((value #>> '{}')::boolean,false) into approval_comment_required from public.app_parameters where key='approval_comment_required';
  select coalesce((value #>> '{}')::boolean,false) into require_pro from public.app_parameters where key='require_professional_validation';
  if p_action='approve' and coalesce(require_pro,false) and coalesce(r.professional_result,'')<>'favorable' then raise exception 'La solicitud requiere validación favorable del profesional antes de aprobarse'; end if;
  if p_action='approve' and coalesce(approval_comment_required,false) and char_length(coalesce(v_comment,''))<5 then raise exception 'La configuración exige una observación para aprobar'; end if;
  if p_action='approve' and (p_hours is null or p_hours<0 or p_hours>r.hours_requested) then raise exception 'Las horas aprobadas deben estar entre 0 y las horas solicitadas'; end if;
  update public.overtime_requests set status=new_status,
    admin_observations=coalesce(v_comment,admin_observations),
    approved_hours=case when p_action='approve' then p_hours else approved_hours end,
    approved_at=case when p_action='approve' then now() else approved_at end,
    closed_at=case when p_action='close' then now() else closed_at end,
    professional_result=case when p_action='professional_validate' then 'favorable' when p_action='return' and my_role='professional' then 'no_favorable' else professional_result end,
    professional_comment=case when p_action='professional_validate' or (p_action='return' and my_role='professional') then v_comment else professional_comment end,
    professional_by=case when p_action='professional_validate' or (p_action='return' and my_role='professional') then auth.uid() else professional_by end,
    professional_at=case when p_action='professional_validate' or (p_action='return' and my_role='professional') then now() else professional_at end,
    decided_by=case when p_action in ('approve','reject') then auth.uid() else decided_by end,
    decided_at=case when p_action in ('approve','reject') then now() else decided_at end,
    aux_values=case when p_action='approve' then public.food_values_snapshot(aux_breakfast,aux_lunch,aux_dinner) else aux_values end
  where id=r.id returning * into r;
  if p_action='approve' then
    insert into public.overtime_cost_snapshots(request_id,snapshot,computed_at,computed_by) values(r.id,public.compute_overtime_cost(r.id),now(),auth.uid())
      on conflict(request_id) do update set snapshot=excluded.snapshot,computed_at=excluded.computed_at,computed_by=excluded.computed_by;
  end if;
  insert into public.request_history(request_id,from_status,to_status,comment,approved_hours,actor_id)
    values(r.id,old_status,new_status,coalesce(v_comment,case p_action when 'professional_validate' then 'Validación profesional: favorable' when 'approve' then 'Solicitud aprobada por el jefe' when 'reject' then 'Solicitud rechazada por el jefe' when 'close' then 'Solicitud cerrada' else null end),
           case when p_action='approve' then p_hours end,auth.uid());
  insert into public.audit_log(actor_id,action,entity_type,entity_id,old_data,new_data) values(auth.uid(),p_action,'overtime_request',r.id::text,jsonb_build_object('status',old_status),to_jsonb(r));
  -- Cierre automático: la aprobación del jefe finaliza el ciclo de vida. Se hace con una segunda actualización (y no cambiando directamente a «closed»)
  -- para que sigan ejecutándose los disparadores que actúan al pasar a «approved» (valores de auxilio por sindicato).
  if p_action='approve' then
    update public.overtime_requests set status='closed',closed_at=now() where id=r.id returning * into r;
    insert into public.request_history(request_id,from_status,to_status,comment,approved_hours,actor_id,created_at)
      values(r.id,'approved','closed','Cierre automático por aprobación del jefe',p_hours,auth.uid(),clock_timestamp());
    insert into public.audit_log(actor_id,action,entity_type,entity_id,old_data,new_data) values(auth.uid(),'auto_close','overtime_request',r.id::text,jsonb_build_object('status','approved'),to_jsonb(r));
  end if;
  insert into public.notifications(recipient_id,request_id,title,message) values(r.employee_id,r.id,'Solicitud actualizada',
    case when p_action='approve' then 'La solicitud '||r.filing_number||' fue aprobada por el jefe y quedó cerrada' else 'La solicitud '||r.filing_number||' cambió a '||new_status::text end);
  if p_action='professional_validate' then
    insert into public.notifications(recipient_id,request_id,title,message)
      select id,r.id,'Solicitud validada por el profesional','La solicitud '||r.filing_number||' está lista para decisión del jefe' from public.profiles where role::text='manager' and active and department_id=r.department_id;
  end if;
  return r;
end $$;
revoke all on function public.perform_request_action(uuid,text,text,numeric) from public,anon;
grant execute on function public.perform_request_action(uuid,text,text,numeric) to authenticated;

-- Opcional (NO se ejecuta): cerrar de una sola vez las solicitudes aprobadas antes de esta migración, dejando constancia en el historial.
-- Descomente solo si desea cerrar todo el histórico pendiente en lugar de cerrarlas una a una con el rol Profesional.
-- with c as (update public.overtime_requests set status='closed',closed_at=coalesce(closed_at,now())
--            where status::text in ('approved','pending_execution','validated') returning id,decided_by,employee_id)
-- insert into public.request_history(request_id,from_status,to_status,comment,actor_id)
--   select id,'approved','closed','Cierre masivo por migración v5 (aprobado antes del cierre automático)',coalesce(decided_by,employee_id) from c;

-- ---------- 2. Aviso de nueva solicitud: ya no se envía al administrador ----------
create or replace function public.save_overtime_request(p_request_id uuid, p_data jsonb, p_submit boolean default false)
returns public.overtime_requests language plpgsql security definer set search_path=public as $$
declare r public.overtime_requests; v_dept uuid; v_status public.request_status; v_old_status public.request_status; v_start timestamp; v_end timestamp; v_selected jsonb;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'Como administrador, no puedes crear solicitudes de horas extras para ti mismo'; end if;
  select department_id into v_dept from public.profiles where id=auth.uid() and active=true;
  if v_dept is null then raise exception 'El perfil no tiene una dependencia activa asignada'; end if;
  if not exists(select 1 from public.work_types where id=(p_data->>'work_type_id')::uuid and active=true) then raise exception 'El tipo de jornada no es válido o está inactivo'; end if;
  v_start := (p_data->>'execution_date')::date + (p_data->>'start_time')::time;
  v_end := (p_data->>'execution_date')::date + (p_data->>'end_time')::time;
  if v_end <= v_start then v_end := v_end + interval '1 day'; end if;
  v_selected := coalesce(p_data->'selected_activities','[]'::jsonb);
  if jsonb_typeof(v_selected)<>'array' or jsonb_array_length(v_selected)=0 then raise exception 'Debe seleccionar al menos una actividad'; end if;
  if p_submit and exists(
    select 1 from public.overtime_requests x where x.employee_id=auth.uid() and x.id<>coalesce(p_request_id,gen_random_uuid())
      and x.status not in ('rejected','cancelled')
      and tsrange(x.execution_date+x.start_time, x.execution_date+x.end_time + case when x.end_time<=x.start_time then interval '1 day' else interval '0' end,'[)')
          && tsrange(v_start,v_end,'[)')
  ) then raise exception 'Existe una solicitud duplicada o que se solapa con este horario'; end if;
  v_status := case when p_submit then 'pending'::public.request_status else 'draft'::public.request_status end;
  if p_request_id is null then
    insert into public.overtime_requests(filing_number,employee_id,department_id,execution_date,start_time,end_time,hours_requested,work_type_id,reason,selected_activities,justification,activities,observations,status,submitted_at)
    values(public.format_filing_number(nextval('public.overtime_filing_seq')),auth.uid(),v_dept,(p_data->>'execution_date')::date,(p_data->>'start_time')::time,(p_data->>'end_time')::time,1,(p_data->>'work_type_id')::uuid,trim(p_data->>'reason'),v_selected,trim(p_data->>'justification'),trim(p_data->>'activities'),null,v_status,case when p_submit then now() end)
    returning * into r;
    insert into public.request_history(request_id,to_status,comment,actor_id) values(r.id,v_status,case when p_submit then 'Solicitud creada y enviada' else 'Borrador guardado' end,auth.uid());
  else
    select * into r from public.overtime_requests where id=p_request_id and employee_id=auth.uid() for update;
    if not found then raise exception 'Solicitud no encontrada'; end if;
    if r.status not in ('draft','returned') then raise exception 'La solicitud ya no admite edición'; end if;
    v_old_status := r.status;
    update public.overtime_requests set execution_date=(p_data->>'execution_date')::date,start_time=(p_data->>'start_time')::time,end_time=(p_data->>'end_time')::time,work_type_id=(p_data->>'work_type_id')::uuid,reason=trim(p_data->>'reason'),selected_activities=v_selected,justification=trim(p_data->>'justification'),activities=trim(p_data->>'activities'),status=v_status,submitted_at=case when p_submit then now() else submitted_at end where id=p_request_id returning * into r;
    insert into public.request_history(request_id,from_status,to_status,comment,actor_id) values(r.id,v_old_status,v_status,case when p_submit then 'Solicitud corregida y enviada' else 'Borrador actualizado' end,auth.uid());
  end if;
  -- v5: el aviso de «Nueva solicitud por revisar» ya no se envía al administrador; lo emite trg_notify_reviewers al profesional y al jefe de la dependencia.
  insert into public.audit_log(actor_id,action,entity_type,entity_id,new_data) values(auth.uid(),case when p_submit then 'submit' else 'save_draft' end,'overtime_request',r.id::text,to_jsonb(r));
  return r;
end $$;
-- =====================================================================================
-- MIGRACIÓN v6 · Firma digital del jefe inmediato  (idempotente: puede ejecutarse más de una vez)
--   1. Tabla manager_signatures: una firma por jefe, versionada e inmutable. Reemplazar o quitar la firma RETIRA la versión
--      (retired_at); nunca se sobrescribe ni se borra, de modo que los documentos históricos conservan su firma.
--   2. Bucket privado «manager-signatures» (solo PNG, máx. 2 MB). Ninguna firma es pública.
--   3. overtime_requests.approval_signature_id: al aprobar, la solicitud CONGELA la firma vigente del jefe que aprobó
--      (trigger trg_approval_signature). Cambiar o quitar la firma después NO altera las solicitudes ya aprobadas.
--   4. Lectura: administrador (todas), jefe (la propia) y quien ya puede ver una solicitud aprobada con esa firma (can_see_request).
--      Escritura: solo el administrador y solo mediante admin_set_manager_signature / admin_remove_manager_signature (auditadas).
-- Requiere haber ejecutado la instalación base y las migraciones v2 a v5. No modifica ni elimina datos existentes.
-- =====================================================================================
-- ---------- 1. Tabla de firmas (versionada) ----------
create table if not exists public.manager_signatures (
  id uuid primary key default gen_random_uuid(),
  manager_id uuid not null references public.profiles(id),
  manager_name text not null check (char_length(trim(manager_name)) between 3 and 120),   -- nombre del jefe al registrar la firma (se imprime en el formato)
  version int not null check (version >= 1),
  storage_path text not null unique,
  mime_type text not null default 'image/png' check (mime_type = 'image/png'),
  width int not null check (width between 20 and 4000),
  height int not null check (height between 10 and 4000),
  size_bytes bigint not null check (size_bytes between 100 and 2097152),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  created_by uuid not null references public.profiles(id),
  retired_at timestamptz,
  retired_by uuid references public.profiles(id),
  retire_reason text check (retire_reason is null or retire_reason in ('replaced','removed')),
  constraint manager_signatures_retired_pair check ((retired_at is null) = (retire_reason is null)),
  constraint manager_signatures_version_key unique (manager_id, version)
);
-- Una sola firma vigente por jefe.
create unique index if not exists manager_signatures_one_current on public.manager_signatures(manager_id) where retired_at is null;
-- Las versiones no se editan ni se eliminan: solo pueden retirarse (una vez).
create or replace function public.protect_manager_signatures()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Las firmas no se eliminan: se retiran para conservar el historial'; end if;
  if new.id is distinct from old.id or new.manager_id is distinct from old.manager_id or new.manager_name is distinct from old.manager_name
     or new.version is distinct from old.version or new.storage_path is distinct from old.storage_path or new.mime_type is distinct from old.mime_type
     or new.width is distinct from old.width or new.height is distinct from old.height or new.size_bytes is distinct from old.size_bytes
     or new.sha256 is distinct from old.sha256 or new.created_at is distinct from old.created_at or new.created_by is distinct from old.created_by then
    raise exception 'Una firma registrada no se puede modificar: carga una nueva versión';
  end if;
  if old.retired_at is not null and (new.retired_at is distinct from old.retired_at or new.retired_by is distinct from old.retired_by or new.retire_reason is distinct from old.retire_reason) then
    raise exception 'La firma ya fue retirada';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_manager_signatures on public.manager_signatures;
create trigger trg_protect_manager_signatures before update or delete on public.manager_signatures for each row execute function public.protect_manager_signatures();
-- ---------- 2. Firma congelada en cada aprobación ----------
alter table public.overtime_requests add column if not exists approval_signature_id uuid references public.manager_signatures(id);
create index if not exists overtime_approval_signature_idx on public.overtime_requests(approval_signature_id) where approval_signature_id is not null;
-- Al pasar a un estado de aprobación válida se registra la firma VIGENTE del jefe que aprobó (decided_by); si no tiene, queda en NULL (no se inventa ni se reutiliza otra).
-- Después queda inmutable. Fuera de los estados de aprobación (pendiente, devuelta, rechazada, cancelada, borrador) siempre es NULL.
create or replace function public.trg_approval_signature()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_sig uuid;
begin
  if new.status::text in ('approved','pending_execution','validated','closed') then
    if tg_op = 'UPDATE' then
      if old.status::text in ('approved','pending_execution','validated','closed') then
        new.approval_signature_id := old.approval_signature_id;
      else
        select id into v_sig from public.manager_signatures where manager_id = coalesce(new.decided_by, auth.uid()) and retired_at is null;
        new.approval_signature_id := v_sig;
      end if;
    end if;
  else
    new.approval_signature_id := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_approval_signature on public.overtime_requests;
create trigger trg_approval_signature before insert or update of status on public.overtime_requests for each row execute function public.trg_approval_signature();
-- ---------- 3. Lectura de firmas (RLS) ----------
create or replace function public.can_read_signature(p_sig uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_admin()
      or exists(select 1 from public.manager_signatures s where s.id = p_sig and s.manager_id = auth.uid())
      or exists(select 1 from public.overtime_requests r
                 where r.approval_signature_id = p_sig and r.status::text in ('approved','pending_execution','validated','closed')
                   and public.can_see_request(r.employee_id, r.department_id));
$$;
alter table public.manager_signatures enable row level security;
drop policy if exists "read manager signatures in scope" on public.manager_signatures;
create policy "read manager signatures in scope" on public.manager_signatures for select to authenticated using (public.can_read_signature(id));
grant select on public.manager_signatures to authenticated;
revoke all on function public.can_read_signature(uuid) from public, anon;
grant execute on function public.can_read_signature(uuid) to authenticated;
-- ---------- 4. Almacenamiento privado ----------
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('manager-signatures', 'manager-signatures', false, 2097152, array['image/png'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/png'];
drop policy if exists "admins upload manager signatures" on storage.objects;
create policy "admins upload manager signatures" on storage.objects for insert to authenticated
  with check (bucket_id = 'manager-signatures' and public.is_admin());
drop policy if exists "read manager signatures in scope" on storage.objects;
create policy "read manager signatures in scope" on storage.objects for select to authenticated
  using (bucket_id = 'manager-signatures' and (public.is_admin() or exists(select 1 from public.manager_signatures s where s.storage_path = name and public.can_read_signature(s.id))));
drop policy if exists "admins delete unreferenced manager signatures" on storage.objects;
create policy "admins delete unreferenced manager signatures" on storage.objects for delete to authenticated
  using (bucket_id = 'manager-signatures' and public.is_admin() and not exists(select 1 from public.manager_signatures s where s.storage_path = name));
-- ---------- 5. Registro y retiro de firmas (solo administrador, con auditoría) ----------
create or replace function public.admin_set_manager_signature(p_manager uuid, p_storage_path text, p_width int, p_height int, p_size bigint, p_sha256 text default null)
returns public.manager_signatures language plpgsql security definer set search_path=public as $$
declare m public.profiles; cur public.manager_signatures; r public.manager_signatures; v int;
begin
  if not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  select * into m from public.profiles where id = p_manager;
  if not found or m.role::text <> 'manager' then raise exception 'El usuario seleccionado no tiene el rol Jefe'; end if;
  if p_storage_path is null or p_storage_path !~ ('^' || p_manager::text || '/[0-9a-f-]{36}\.png$') then raise exception 'La ruta del archivo de la firma no es válida'; end if;
  if not exists(select 1 from storage.objects where bucket_id = 'manager-signatures' and name = p_storage_path) then raise exception 'El archivo de la firma no se encontró en el almacenamiento'; end if;
  if p_width is null or p_height is null or p_width not between 20 and 4000 or p_height not between 10 and 4000 then raise exception 'Las dimensiones de la firma no son válidas'; end if;
  if p_size is null or p_size not between 100 and 2097152 then raise exception 'El tamaño de la firma no es válido (máximo 2 MB)'; end if;
  select * into cur from public.manager_signatures where manager_id = p_manager and retired_at is null for update;
  if found then
    update public.manager_signatures set retired_at = now(), retired_by = auth.uid(), retire_reason = 'replaced' where id = cur.id;
  end if;
  select coalesce(max(version), 0) + 1 into v from public.manager_signatures where manager_id = p_manager;
  insert into public.manager_signatures(manager_id, manager_name, version, storage_path, width, height, size_bytes, sha256, created_by)
  values (p_manager, m.full_name, v, p_storage_path, p_width, p_height, p_size, nullif(lower(coalesce(p_sha256, '')), ''), auth.uid()) returning * into r;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), case when cur.id is null then 'set_signature' else 'replace_signature' end, 'manager_signatures', r.id::text,
          case when cur.id is not null then jsonb_build_object('manager_id', p_manager, 'manager_name', cur.manager_name, 'version', cur.version, 'signature_id', cur.id) end,
          jsonb_build_object('manager_id', p_manager, 'manager_name', m.full_name, 'version', v, 'signature_id', r.id));
  return r;
end $$;
create or replace function public.admin_remove_manager_signature(p_manager uuid)
returns public.manager_signatures language plpgsql security definer set search_path=public as $$
declare cur public.manager_signatures;
begin
  if not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  select * into cur from public.manager_signatures where manager_id = p_manager and retired_at is null for update;
  if not found then raise exception 'El jefe no tiene una firma vigente'; end if;
  update public.manager_signatures set retired_at = now(), retired_by = auth.uid(), retire_reason = 'removed' where id = cur.id returning * into cur;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, old_data, new_data)
  values (auth.uid(), 'remove_signature', 'manager_signatures', cur.id::text,
          jsonb_build_object('manager_id', p_manager, 'manager_name', cur.manager_name, 'version', cur.version, 'signature_id', cur.id), null);
  return cur;
end $$;
revoke all on function public.admin_set_manager_signature(uuid, text, int, int, bigint, text) from public, anon;
revoke all on function public.admin_remove_manager_signature(uuid) from public, anon;
grant execute on function public.admin_set_manager_signature(uuid, text, int, int, bigint, text) to authenticated;
grant execute on function public.admin_remove_manager_signature(uuid) to authenticated;
-- Después de ejecutar: en «Configuración → Reglas y parámetros → Firma del jefe inmediato» el administrador carga la firma de cada jefe.
-- Las solicitudes aprobadas ANTES de esta migración quedan sin firma digital (approval_signature_id = NULL): su formato conserva el espacio libre para firma manual.

    

-- =====================================================================================
-- MIGRACIÓN v7 · Aplicativo de Gestión de Horas Extras  (idempotente: puede ejecutarse más de una vez)
-- Gestión de usuarios con datos reales: directorio de funcionarios, parámetros por usuario y blindaje de perfiles.
--
-- Qué hace (sin borrar ni sobrescribir datos existentes):
--   1. Agrega a «profiles» la fecha de contratación y asegura la unicidad de documento y correo (solo si no hay duplicados).
--   2. Crea «employee_directory»: nómina autorizada (documento, nombre, correo, dependencia, cargo+grado, contratación,
--      salario, horario, sindicato, rol). Es la ÚNICA fuente de los datos laborales iniciales de cada cuenta.
--      Se carga con el archivo «carga_directorio_soporte_clientes.sql» (generado desde el Excel oficial) o con el script de aprovisionamiento.
--   3. Vincula automáticamente cada cuenta de Authentication con su fila del directorio (por correo) cuando el correo
--      queda CONFIRMADO: asigna dependencia, rol, cargo+grado, turno, sindicato y salario (con historial) reutilizando las
--      tablas, triggers y reglas que ya existen (profiles, departments, job_grades, work_shifts, unions, salary_history,
--      union_assignments, employee_compensation). Nunca pisa un dato que ya tenga valor.
--   4. Crea «user_settings» y la función save_my_settings: parámetros de cada usuario (tema, menú compacto, «quien recibe»)
--      persistentes en la base y validados en el servidor (antes solo vivían en el navegador).
--   5. Blindaje de «profiles» en el servidor: nadie cambia su propio rol ni se desactiva; no se puede dejar el sistema sin
--      administrador activo; el jefe exige dependencia; el correo del perfil debe coincidir con el de la cuenta; formato del documento.
--   6. Funciones para el administrador: admin_directory_status() y admin_sync_directory().
-- Requiere la instalación base y las migraciones v2 a v6.
-- =====================================================================================
do $$ begin
  if to_regclass('public.profiles') is null or to_regclass('public.job_grades') is null or to_regclass('public.salary_history') is null
     or to_regclass('public.work_shifts') is null or to_regclass('public.union_assignments') is null or to_regclass('public.unions') is null then
    raise exception 'Falta la instalación base o las migraciones v2 a v6: ejecútalas antes de esta migración.';
  end if;
end $$;

-- ---------- 1. Perfil: fecha de contratación y unicidad ----------
alter table public.profiles add column if not exists hire_date date;
do $$ begin
  if exists(select 1 from public.profiles where document_number is not null group by document_number having count(*)>1) then
    raise warning 'v7: hay documentos duplicados en profiles; no se creó el índice único profiles_document_number_uidx. Depúralos y vuelve a ejecutar.';
  else
    create unique index if not exists profiles_document_number_uidx on public.profiles(document_number) where document_number is not null;
  end if;
  if exists(select 1 from public.profiles where email is not null group by lower(email) having count(*)>1) then
    raise warning 'v7: hay correos duplicados en profiles; no se creó el índice único profiles_email_uidx. Depúralos y vuelve a ejecutar.';
  else
    create unique index if not exists profiles_email_uidx on public.profiles(lower(email)) where email is not null;
  end if;
end $$;

-- ---------- 2. Directorio de funcionarios (nómina autorizada, previa a la creación de la cuenta) ----------
create table if not exists public.employee_directory (
  id uuid primary key default gen_random_uuid(),
  document_number text not null check (document_number ~ '^[0-9A-Za-z][0-9A-Za-z.-]{3,29}$'),
  full_name text not null check (char_length(btrim(full_name)) between 3 and 120),
  email text not null check (email = lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  department_name text not null check (char_length(btrim(department_name)) between 2 and 120),
  position_name text,                       -- se compara contra job_grades.position_name (sin tildes ni mayúsculas)
  grade text,                               -- se compara contra job_grades.grade
  hire_date date,
  base_salary numeric(14,2) check (base_salary is null or base_salary > 0),
  salary_valid_from date,                   -- desde cuándo rige el salario y el sindicato iniciales; si es NULL se asume el 1 de enero del año de la carga (o la contratación, si es posterior)
  schedule_label text,                      -- texto original del horario; se traduce a work_shifts.code por equivalencia de horas
  union_code text,                          -- unions.code (vacío = sin sindicato)
  food_allowance_ref numeric(14,2) check (food_allowance_ref is null or food_allowance_ref > 0),   -- solo referencia de la nómina; el valor vigente lo define union_food_rules
  app_role text not null default 'employee' check (app_role in ('employee','professional','manager','admin')),
  active boolean not null default true,
  source text not null default 'manual',
  profile_id uuid unique references public.profiles(id) on delete set null,
  linked_at timestamptz,
  loaded_at timestamptz not null default now()
);
alter table public.employee_directory add column if not exists salary_valid_from date;
create unique index if not exists employee_directory_document_uidx on public.employee_directory(document_number);
create unique index if not exists employee_directory_email_uidx on public.employee_directory(lower(email));
alter table public.employee_directory enable row level security;
drop policy if exists "admins read employee directory" on public.employee_directory;
create policy "admins read employee directory" on public.employee_directory for select to authenticated using (public.is_admin());
revoke all on public.employee_directory from public, anon, authenticated;
grant select on public.employee_directory to authenticated;      -- RLS: solo administradores. La escritura se hace con SQL Editor / service_role.

-- ---------- 3. Parámetros por usuario (persistentes) ----------
create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "read own settings" on public.user_settings;
create policy "read own settings" on public.user_settings for select to authenticated using (user_id = auth.uid());
revoke all on public.user_settings from public, anon, authenticated;
grant select on public.user_settings to authenticated;           -- la escritura solo pasa por save_my_settings (validada)

create or replace function public.validate_user_settings(p jsonb)
returns jsonb language plpgsql immutable as $$
declare k text; v jsonb; r jsonb := '{}'::jsonb; s text;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Los parámetros deben enviarse como un objeto'; end if;
  for k, v in select key, value from jsonb_each(p) loop
    if k = 'theme' then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') not in ('light','dark') then raise exception 'Tema no válido (light o dark)'; end if;
    elsif k = 'sidebar_compact' then
      if jsonb_typeof(v) <> 'boolean' then raise exception 'El parámetro sidebar_compact debe ser verdadero o falso'; end if;
    elsif k = 'format_receiver' then
      if jsonb_typeof(v) <> 'string' then raise exception 'El nombre de quien recibe debe ser un texto'; end if;
      s := btrim(regexp_replace(v #>> '{}', '\s+', ' ', 'g'));
      if char_length(s) > 120 then raise exception 'El nombre de quien recibe no puede superar los 120 caracteres'; end if;
      if s ~ '[[:cntrl:]<>]' then raise exception 'El nombre de quien recibe contiene caracteres no permitidos'; end if;
      v := to_jsonb(s);
    else
      raise exception 'Parámetro no permitido: %', k;
    end if;
    r := r || jsonb_build_object(k, v);
  end loop;
  return r;
end $$;

create or replace function public.save_my_settings(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; r jsonb;
begin
  if auth.uid() is null then raise exception 'Sesión no válida'; end if;
  if not exists(select 1 from public.profiles where id = auth.uid() and active) then raise exception 'Perfil no encontrado o inactivo'; end if;
  v := public.validate_user_settings(p_settings);
  insert into public.user_settings(user_id, settings, updated_at) values (auth.uid(), v, now())
  on conflict (user_id) do update set settings = public.user_settings.settings || excluded.settings, updated_at = now()
  returning settings into r;
  return r;
end $$;
revoke all on function public.validate_user_settings(jsonb) from public, anon, authenticated;
revoke all on function public.save_my_settings(jsonb) from public, anon;
grant execute on function public.save_my_settings(jsonb) to authenticated;

-- ---------- 4. Horario de la nómina → turno del catálogo (por equivalencia exacta de horas, sin suposiciones) ----------
-- «Jornada Normal Diurna (7-12 1-5)» = entra 07:00, almuerzo 12:00-13:00, sale 17:00 → turno cuyo horario coincide exactamente.
-- Si no hay una única coincidencia devuelve NULL (el turno queda sin asignar y el administrador lo define).
create or replace function public.resolve_shift_code(p_label text)
returns text language plpgsql stable set search_path = public as $$
declare m text[]; t1 time; t2 time; t3 time; t4 time; n int; c text;
  h int;
begin
  if p_label is null then return null; end if;
  m := regexp_match(p_label, '\(\s*(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?\s+(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*\)');
  if m is null then return null; end if;
  h := m[1]::int;  t1 := make_time(h, coalesce(m[2],'0')::int, 0);
  h := m[3]::int;  t2 := make_time(h, coalesce(m[4],'0')::int, 0);
  h := m[5]::int;  if h < 12 then h := h + 12; end if; t3 := make_time(h, coalesce(m[6],'0')::int, 0);
  h := m[7]::int;  if h < 12 then h := h + 12; end if; t4 := make_time(h, coalesce(m[8],'0')::int, 0);
  select count(*), min(code) into n, c from public.work_shifts
   where active and start_time = t1 and lunch_start = t2 and lunch_end = t3 and end_time = t4;
  return case when n = 1 then c else null end;
exception when others then
  return null;
end $$;
revoke all on function public.resolve_shift_code(text) from public, anon, authenticated;

-- ---------- 5. Vinculación cuenta ↔ directorio ----------
-- (v9: ya NO se exige correo confirmado; ver «MIGRACIÓN v9» al final. La protección pasa a ser que solo el administrador crea cuentas.)
-- La asignación de rol y datos laborales proviene del directorio. Nunca pisa datos existentes: completa lo que esté vacío; el rol del directorio solo se aplica en la
-- primera vinculación y solo si el perfil sigue con el rol por defecto (un administrador definido a mano se respeta).
create or replace function public.link_profile_from_directory(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text; v_conf timestamptz; d public.employee_directory; p public.profiles;
  v_dept uuid; v_grade uuid; v_shift text; v_union uuid; v_role text; v_from date; v_first boolean;
  v_notes text[] := '{}'; v_has_hist boolean; v_comp numeric;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  select u.email, u.email_confirmed_at into v_email, v_conf from auth.users u where u.id = p_user;
  if v_email is null then return jsonb_build_object('linked', false, 'reason', 'no_auth_user'); end if;
  if v_conf is null then return jsonb_build_object('linked', false, 'reason', 'email_not_confirmed'); end if;
  select * into d from public.employee_directory where lower(email) = lower(v_email) and active for update;
  if not found then return jsonb_build_object('linked', false, 'reason', 'not_in_directory'); end if;
  if d.profile_id is not null and d.profile_id <> p_user then return jsonb_build_object('linked', false, 'reason', 'directory_row_linked_to_another_account'); end if;
  v_first := d.profile_id is null;

  insert into public.profiles(id, full_name, email) values (p_user, d.full_name, lower(v_email)) on conflict (id) do nothing;
  select * into p from public.profiles where id = p_user for update;
  perform set_config('app.directory_sync', 'on', true);

  select id into v_dept from public.departments where lower(btrim(name)) = lower(btrim(d.department_name)) order by active desc limit 1;
  if v_dept is null then insert into public.departments(name) values (btrim(d.department_name)) returning id into v_dept; end if;

  if d.position_name is not null and d.grade is not null then
    select g.id into v_grade from public.job_grades g
     where translate(lower(btrim(g.position_name)), 'áéíóú', 'aeiou') = translate(lower(btrim(d.position_name)), 'áéíóú', 'aeiou')
       and upper(btrim(g.grade)) = upper(btrim(d.grade)) and g.active limit 1;
    if v_grade is null then v_notes := array_append(v_notes, format('cargo y grado sin equivalente activo en el catálogo: %s %s', d.position_name, d.grade)); end if;
  end if;
  if d.schedule_label is not null then
    v_shift := public.resolve_shift_code(d.schedule_label);
    if v_shift is null then v_notes := array_append(v_notes, format('horario sin turno equivalente en el catálogo: %s', d.schedule_label)); end if;
  end if;
  if nullif(btrim(coalesce(d.union_code, '')), '') is not null then
    select id into v_union from public.unions where upper(btrim(code)) = upper(btrim(d.union_code)) or upper(btrim(name)) = upper(btrim(d.union_code)) limit 1;
    if v_union is null then v_notes := array_append(v_notes, format('sindicato inexistente en el catálogo: %s', d.union_code)); end if;
  end if;

  v_role := case when v_first and p.role::text = 'employee' then d.app_role else p.role::text end;
  if v_first and p.role::text <> 'employee' and p.role::text <> d.app_role then
    v_notes := array_append(v_notes, format('el perfil ya tenía el rol %s: se conservó (el directorio indica %s)', p.role::text, d.app_role));
  end if;
  -- Vigencia inicial de salario y sindicato: la indicada en el directorio; si no hay, el 1 de enero del año actual (o la contratación si es posterior),
  -- y nunca después de la primera solicitud existente. Así el costo de las solicitudes de los últimos meses encuentra salario vigente.
  v_from := least(current_date,
                  coalesce(d.salary_valid_from, greatest(coalesce(d.hire_date, date_trunc('year', current_date)::date), date_trunc('year', current_date)::date)),
                  coalesce((select min(execution_date) from public.overtime_requests where employee_id = p_user), current_date));
  if d.salary_valid_from is null and d.base_salary is not null then
    v_notes := array_append(v_notes, format('vigencia inicial del salario asumida desde %s (el directorio no indica fecha): confirmar', v_from));
  end if;
  perform set_config('app.union_valid_from', v_from::text, true);
  perform set_config('app.union_reason', 'Carga inicial desde el directorio de funcionarios', true);
  perform set_config('app.union_action', 'directory_union', true);

  if p.document_number is null and exists(select 1 from public.profiles x where x.document_number = d.document_number and x.id <> p_user) then
    v_notes := array_append(v_notes, format('el documento %s ya está asignado a otro perfil', d.document_number));
  end if;

  update public.profiles set
    full_name = case when v_first then d.full_name else full_name end,
    email = coalesce(email, lower(v_email)),
    document_number = coalesce(document_number, case when exists(select 1 from public.profiles x where x.document_number = d.document_number and x.id <> p_user) then null else d.document_number end),
    department_id = coalesce(department_id, v_dept),
    role = v_role::public.app_role,
    job_grade_id = coalesce(job_grade_id, v_grade),
    shift_code = coalesce(shift_code, v_shift),
    union_id = coalesce(union_id, v_union),
    hire_date = coalesce(hire_date, d.hire_date),
    updated_at = now()
  where id = p_user;

  if d.base_salary is not null then
    select exists(select 1 from public.salary_history where employee_id = p_user) into v_has_hist;
    select base_salary into v_comp from public.employee_compensation where profile_id = p_user;
    if v_has_hist or v_comp is not null then
      v_notes := array_append(v_notes, 'ya tenía salario registrado: se conservó');
    else
      insert into public.salary_history(employee_id, salary, valid_from, reason) values (p_user, d.base_salary, v_from, 'Carga inicial desde el directorio de funcionarios');
      insert into public.employee_compensation(profile_id, base_salary, updated_at) values (p_user, d.base_salary, now())
      on conflict (profile_id) do update set base_salary = excluded.base_salary, updated_at = now();
    end if;
  end if;

  update public.employee_directory set profile_id = p_user, linked_at = coalesce(linked_at, now()) where id = d.id;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'link_directory', 'profiles', p_user::text, jsonb_build_object('directory_id', d.id, 'first_link', v_first, 'role', v_role, 'notes', to_jsonb(v_notes)));
  perform set_config('app.directory_sync', 'off', true);
  perform set_config('app.union_valid_from', '', true); perform set_config('app.union_reason', '', true); perform set_config('app.union_action', '', true);
  return jsonb_build_object('linked', true, 'first_link', v_first, 'role', v_role, 'notes', to_jsonb(v_notes));
end $$;
revoke all on function public.link_profile_from_directory(uuid) from public, anon, authenticated;

create or replace function public.trg_auth_user_link_directory()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null
     and (tg_op = 'INSERT' or old.email_confirmed_at is null or lower(coalesce(new.email, '')) is distinct from lower(coalesce(old.email, ''))) then
    begin
      perform public.link_profile_from_directory(new.id);
    exception when others then
      -- un fallo de vinculación nunca debe impedir el acceso: el administrador puede reintentar con «Sincronizar directorio».
      raise warning 'v7: no fue posible vincular el directorio para la cuenta %: %', new.id, sqlerrm;
    end;
    perform set_config('app.directory_sync', 'off', true);
  end if;
  return new;
end $$;
drop trigger if exists on_auth_user_link_directory on auth.users;
create trigger on_auth_user_link_directory after insert or update of email_confirmed_at, email on auth.users for each row execute function public.trg_auth_user_link_directory();

-- ---------- 6. Funciones del administrador ----------
create or replace function public.admin_sync_directory()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; res jsonb; n int := 0; l int := 0; detail jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  for r in select u.id as uid, d.full_name as dname from public.employee_directory d join auth.users u on lower(u.email) = lower(d.email)
            where d.active and u.email_confirmed_at is not null order by d.full_name loop
    n := n + 1;
    begin
      res := public.link_profile_from_directory(r.uid);
    exception when others then
      res := jsonb_build_object('linked', false, 'reason', 'error', 'error', sqlerrm);
    end;
    if (res->>'linked')::boolean then l := l + 1; end if;
    if jsonb_array_length(coalesce(res->'notes', '[]'::jsonb)) > 0 or not (res->>'linked')::boolean then
      detail := detail || jsonb_build_array(jsonb_build_object('name', r.dname) || res);
    end if;
  end loop;
  return jsonb_build_object('processed', n, 'linked', l, 'pending_accounts', (select count(*) from public.employee_directory d where d.active and not exists(select 1 from auth.users u where lower(u.email) = lower(d.email) and u.email_confirmed_at is not null)), 'detail', detail);
end $$;
revoke all on function public.admin_sync_directory() from public, anon;
grant execute on function public.admin_sync_directory() to authenticated;

create or replace function public.admin_directory_status()
returns table(directory_id uuid, document_number text, full_name text, email text, app_role text, department_name text, has_account boolean, account_confirmed boolean, profile_id uuid, linked_at timestamptz, active boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  return query
    select d.id, d.document_number, d.full_name, d.email, d.app_role, d.department_name,
           u.id is not null, coalesce(u.email_confirmed_at is not null, false), d.profile_id, d.linked_at, d.active
      from public.employee_directory d left join auth.users u on lower(u.email) = lower(d.email)
     order by d.full_name;
end $$;
revoke all on function public.admin_directory_status() from public, anon;
grant execute on function public.admin_directory_status() to authenticated;

-- Estado de acceso de cada cuenta (solo administradores). NUNCA devuelve contraseñas ni hashes: Supabase solo guarda el hash y nadie puede leerlas.
--   must_change_password = true → la cuenta aún tiene la contraseña temporal (cédula o asignada por un administrador).
create or replace function public.admin_account_status()
returns table(profile_id uuid, email text, email_confirmed boolean, must_change_password boolean, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  return query
    select p.id, u.email::text, (u.email_confirmed_at is not null),
           coalesce((u.raw_user_meta_data->>'must_change_password')::boolean, false), u.last_sign_in_at
      from public.profiles p join auth.users u on u.id = p.id;
end $$;
revoke all on function public.admin_account_status() from public, anon;
grant execute on function public.admin_account_status() to authenticated;

-- ---------- 7. Blindaje del perfil (servidor) ----------
-- El cargo y grado ya solo los asigna un administrador; se permite además la vinculación automática del directorio.
create or replace function public.validate_profile_job_grade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.job_grade_id is not distinct from old.job_grade_id then return new; end if;
  end if;
  if coalesce(current_setting('app.directory_sync', true), '') <> 'on' and auth.uid() is not null and not public.is_admin() then
    raise exception 'Solo un administrador puede asignar el cargo y el grado';
  end if;
  if new.job_grade_id is not null and not exists(select 1 from public.job_grades where id = new.job_grade_id and active) then
    raise exception 'La combinación de cargo y grado no está autorizada o está inactiva';
  end if;
  return new;
end $$;

create or replace function public.trg_protect_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_sync boolean := coalesce(current_setting('app.directory_sync', true), '') = 'on'; v_uid uuid := auth.uid(); v_auth_email text; v_others int;
begin
  -- Formato del documento (solo cuando se inserta o cambia, para no bloquear datos históricos).
  if tg_op = 'INSERT' or new.document_number is distinct from old.document_number then
    if new.document_number is not null then
      new.document_number := btrim(new.document_number);
      if new.document_number !~ '^[0-9A-Za-z][0-9A-Za-z.-]{3,29}$' then
        raise exception 'El documento debe tener de 4 a 30 caracteres (letras, números, punto o guion)';
      end if;
    end if;
  end if;
  if tg_op = 'INSERT' or new.full_name is distinct from old.full_name then
    new.full_name := btrim(regexp_replace(coalesce(new.full_name, ''), '\s+', ' ', 'g'));
    if char_length(new.full_name) < 3 or char_length(new.full_name) > 120 then raise exception 'El nombre debe tener entre 3 y 120 caracteres'; end if;
  end if;

  if tg_op = 'UPDATE' then
    -- Solo sesiones de cliente (la vinculación del directorio y el SQL Editor no tienen sesión de usuario).
    if v_uid is not null and not v_sync then
      if not public.is_admin() then
        if new.role is distinct from old.role or new.active is distinct from old.active or new.department_id is distinct from old.department_id
           or new.email is distinct from old.email or new.document_number is distinct from old.document_number or new.full_name is distinct from old.full_name
           or new.shift_code is distinct from old.shift_code or new.hire_date is distinct from old.hire_date or new.job_grade_id is distinct from old.job_grade_id then
          raise exception 'No tienes permisos para modificar estos datos del perfil';
        end if;
      elsif v_uid = new.id and (new.role is distinct from old.role or new.active is distinct from old.active) then
        raise exception 'No puedes cambiar tu propio rol ni desactivar tu propio usuario';
      end if;
    end if;
    -- El correo del perfil es el de la cuenta de acceso.
    if new.email is distinct from old.email and not v_sync then
      select email into v_auth_email from auth.users where id = new.id;
      if lower(coalesce(new.email, '')) <> lower(coalesce(v_auth_email, '')) then raise exception 'El correo del perfil debe coincidir con el de la cuenta de acceso'; end if;
    end if;
    -- Nunca sin administrador activo.
    if old.role::text = 'admin' and old.active and (new.role::text <> 'admin' or not new.active) then
      select count(*) into v_others from public.profiles where role::text = 'admin' and active and id <> old.id;
      if v_others = 0 then raise exception 'Debe existir al menos un administrador activo'; end if;
    end if;
  end if;

  -- El jefe define su ámbito de aprobación con la dependencia.
  if new.role::text = 'manager' and new.department_id is null
     and (tg_op = 'INSERT' or new.role is distinct from old.role or new.department_id is distinct from old.department_id) then
    raise exception 'El jefe debe tener una dependencia asignada (define su ámbito de aprobación)';
  end if;
  return new;
end $$;
drop trigger if exists trg_protect_profile on public.profiles;
create trigger trg_protect_profile before insert or update on public.profiles for each row execute function public.trg_protect_profile();

-- Un perfil nuevo no acepta nombres arbitrarios largos desde los metadatos del registro.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name, email)
  values (new.id, left(coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1), 'Usuario'), 120), lower(new.email))
  on conflict (id) do nothing;
  return new;
end $$;

-- ---------- 8. Vincular las cuentas que ya existían (solo las confirmadas y presentes en el directorio) ----------
select public.admin_sync_directory();

-- Después de ejecutar:
--  · Carga el directorio con «carga_directorio_soporte_clientes.sql» (si aún no lo hiciste) y vuelve a ejecutar:  select public.admin_sync_directory();
--  · Crea las cuentas en Authentication (o con «aprovisionar_cuentas_auth.mjs»). Al crear su cuenta, cada persona queda vinculada sola.
--  · Authentication → Providers → Email: desactiva «Allow new users to sign up» para que solo existan cuentas creadas por el administrador.

-- =====================================================================================
-- MIGRACIÓN v8 · Aplicativo de Gestión de Horas Extras  (idempotente; no borra ni modifica datos existentes)
-- Restablecimiento y cambio de contraseñas (sin envío de correos): auditoría, límites y revocación de sesiones.
--
-- Las contraseñas las gestiona Supabase Auth (GoTrue): se guardan con bcrypt y los enlaces de restablecimiento son
-- aleatorios, de un solo uso y con vencimiento. Esta migración NO guarda, copia ni expone contraseñas ni tokens: solo
-- añade lo que el proyecto necesita alrededor:
--   1. password_audit()           registra eventos de contraseñas en audit_log (solo service_role; sin secretos; con tope anti-spam).
--   2. password_action_allowed()  límites de acciones administrativas por administrador y por cuenta objetivo (solo service_role).
--   3. revoke_user_sessions()     cierra todas las sesiones de una cuenta (solo service_role).
--   4. log_password_event()       el propio usuario registra «cambió su contraseña» / «completó la recuperación» / «falló la contraseña actual».
--   5. admin_password_events()    el administrador consulta la actividad de contraseñas de una cuenta (sin secretos).
-- Requiere la instalación base y las migraciones v2 a v7.
-- =====================================================================================
do $$ begin
  if to_regclass('public.audit_log') is null or to_regclass('public.profiles') is null then
    raise exception 'Falta la instalación base: ejecútala antes de esta migración.';
  end if;
  if to_regprocedure('public.admin_account_status()') is null then
    raise exception 'Falta la migración v7: ejecútala antes de esta migración.';
  end if;
end $$;

create index if not exists audit_log_action_created_idx on public.audit_log(action, created_at desc);

-- ---------- 1. Auditoría de contraseñas (solo service_role: la usan las Edge Functions) ----------
-- Acciones permitidas (cualquier otra se rechaza). Los datos adjuntos NUNCA incluyen contraseñas, enlaces ni tokens.
create or replace function public.password_audit(p_actor uuid, p_action text, p_target uuid, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_action not in ('password_admin_link_generated','password_admin_temp_assigned','password_admin_denied','password_admin_rate_limited') then
    raise exception 'Acción de auditoría no válida: %', p_action;
  end if;
  -- Tope anti-inundación del registro para los intentos denegados (un usuario sin permisos no puede llenar la auditoría).
  if p_action in ('password_admin_denied','password_admin_rate_limited')
     and (select count(*) from public.audit_log where actor_id = p_actor and action = p_action and created_at > now() - interval '1 hour') >= 10 then
    return;
  end if;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, new_data)
  values (case when exists(select 1 from public.profiles where id = p_actor) then p_actor end,
          p_action, 'profiles', p_target::text,
          coalesce(p_data, '{}'::jsonb) - 'password' - 'temporary_password' - 'link' - 'token' - 'action_link' - 'otp');
end $$;
revoke all on function public.password_audit(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.password_audit(uuid, text, uuid, jsonb) to service_role;

-- ---------- 2. Límites de acciones administrativas ----------
--   · por administrador: 20 acciones cada 10 minutos
--   · por cuenta objetivo: 5 acciones por hora (evita acoso/abuso sobre una misma persona)
create or replace function public.password_action_allowed(p_actor uuid, p_target uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_actor int; v_target int;
begin
  select count(*) into v_actor from public.audit_log
   where actor_id = p_actor and created_at > now() - interval '10 minutes'
     and action in ('password_admin_link_generated','password_admin_temp_assigned');
  if v_actor >= 20 then return 'actor_limit'; end if;
  select count(*) into v_target from public.audit_log
   where entity_type = 'profiles' and entity_id = p_target::text and created_at > now() - interval '1 hour'
     and action in ('password_admin_link_generated','password_admin_temp_assigned');
  if v_target >= 5 then return 'target_limit'; end if;
  return 'ok';
end $$;
revoke all on function public.password_action_allowed(uuid, uuid) from public, anon, authenticated;
grant execute on function public.password_action_allowed(uuid, uuid) to service_role;

-- ---------- 3. Revocar todas las sesiones de una cuenta (solo service_role) ----------
-- Elimina las sesiones (y, en cascada, sus refresh tokens): nadie puede renovar el acceso con la contraseña anterior.
-- El token de acceso ya emitido sigue siendo válido hasta su vencimiento (Auth → Sessions → JWT expiry; por defecto 1 hora).
create or replace function public.revoke_user_sessions(p_user uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer := 0;
begin
  if to_regclass('auth.sessions') is not null then
    delete from auth.sessions where user_id = p_user;
    get diagnostics n = row_count;
  end if;
  return n;
end $$;
revoke all on function public.revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.revoke_user_sessions(uuid) to service_role;

-- ---------- 4. Eventos propios del usuario (sesión autenticada; solo para SU cuenta) ----------
create or replace function public.log_password_event(p_event text)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Sesión no válida'; end if;
  if p_event not in ('password_changed','password_recovery_completed','password_change_reauth_failed') then
    raise exception 'Evento no válido';
  end if;
  -- Tope por usuario: 30 eventos por hora (la auditoría no se puede inundar desde el navegador).
  if (select count(*) from public.audit_log where actor_id = v_uid and action like 'password\_%' and created_at > now() - interval '1 hour') >= 30 then
    return;
  end if;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, new_data)
  values (case when exists(select 1 from public.profiles where id = v_uid) then v_uid end, p_event, 'profiles', v_uid::text, '{}'::jsonb);
end $$;
revoke all on function public.log_password_event(text) from public, anon;
grant execute on function public.log_password_event(text) to authenticated;

-- ---------- 5. Actividad de contraseñas de una cuenta (solo administradores; sin secretos) ----------
create or replace function public.admin_password_events(p_user uuid)
returns table(created_at timestamptz, action text, actor_name text, detail jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  if not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  return query
    select a.created_at, a.action, coalesce(p.full_name, 'Sistema'), coalesce(a.new_data, '{}'::jsonb)
      from public.audit_log a left join public.profiles p on p.id = a.actor_id
     where a.entity_type = 'profiles' and a.entity_id = p_user::text and a.action like 'password\_%'
     order by a.created_at desc limit 10;
end $$;
revoke all on function public.admin_password_events(uuid) from public, anon;
grant execute on function public.admin_password_events(uuid) to authenticated;

-- Después de ejecutar (ver RECUPERACION_CONTRASENAS.md): desplegar la Edge Function admin-set-password.
-- Solo para la opción «Generar enlace»: definir su variable APP_URL y añadir la URL pública en Authentication → URL Configuration → Redirect URLs.
-- Este sistema NO envía correos: no requiere SMTP ni plantillas de correo.

-- =====================================================================================
-- MIGRACIÓN v9 · Aplicativo de Gestión de Horas Extras  (idempotente; no borra datos)
-- Ingreso directo: SIN verificación del correo electrónico.
--
-- Qué hace:
--   1. Toda cuenta nueva de Authentication nace con el correo marcado como confirmado (disparador BEFORE INSERT), de modo que
--      nunca queda bloqueada por «Email not confirmed», sin importar cómo se cree (panel, script de aprovisionamiento o API).
--   2. Habilita las cuentas que hoy están pendientes de confirmación (se informa cuántas con RAISE NOTICE).
--   3. Quita la exigencia de «correo confirmado» de la vinculación con el directorio:
--      link_profile_from_directory(), trg_auth_user_link_directory() y admin_sync_directory().
--
-- NO cambia: contraseñas (hash bcrypt), sesiones y tokens, roles y permisos, RLS, funciones del administrador,
--            recuperación y cambio de contraseñas (v8) ni el cierre de sesión.
--
-- IMPORTANTE (seguridad): antes la vinculación al directorio solo ocurría con el correo confirmado, para que quien se
-- registrara con un correo ajeno no recibiera privilegios. Sin esa verificación, la protección es que SOLO el
-- administrador crea cuentas. Por eso en Authentication → Providers → Email debe estar DESACTIVADO «Allow new users to sign up».
-- Además, en el mismo panel desactiva «Confirm email» (así Supabase tampoco envía correos de confirmación).
-- Requiere la instalación base y las migraciones v2 a v8.
-- =====================================================================================
do $$ begin
  if to_regprocedure('public.link_profile_from_directory(uuid)') is null or to_regprocedure('public.admin_sync_directory()') is null then
    raise exception 'Falta aplicar antes la migración v7 (directorio de funcionarios).';
  end if;
end $$;

-- 1) Las cuentas nuevas nacen confirmadas
create or replace function public.trg_auth_user_autoconfirm()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is null then new.email_confirmed_at := now(); end if;
  return new;
end $$;
revoke all on function public.trg_auth_user_autoconfirm() from public, anon, authenticated;
drop trigger if exists on_auth_user_autoconfirm on auth.users;
create trigger on_auth_user_autoconfirm before insert on auth.users for each row execute function public.trg_auth_user_autoconfirm();

-- 2) Vinculación con el directorio sin compuerta de correo confirmado
create or replace function public.link_profile_from_directory(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_email text; d public.employee_directory; p public.profiles;
  v_dept uuid; v_grade uuid; v_shift text; v_union uuid; v_role text; v_from date; v_first boolean;
  v_notes text[] := '{}'; v_has_hist boolean; v_comp numeric;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  select u.email into v_email from auth.users u where u.id = p_user;
  if v_email is null then return jsonb_build_object('linked', false, 'reason', 'no_auth_user'); end if;
  select * into d from public.employee_directory where lower(email) = lower(v_email) and active for update;
  if not found then return jsonb_build_object('linked', false, 'reason', 'not_in_directory'); end if;
  if d.profile_id is not null and d.profile_id <> p_user then return jsonb_build_object('linked', false, 'reason', 'directory_row_linked_to_another_account'); end if;
  v_first := d.profile_id is null;

  insert into public.profiles(id, full_name, email) values (p_user, d.full_name, lower(v_email)) on conflict (id) do nothing;
  select * into p from public.profiles where id = p_user for update;
  perform set_config('app.directory_sync', 'on', true);

  select id into v_dept from public.departments where lower(btrim(name)) = lower(btrim(d.department_name)) order by active desc limit 1;
  if v_dept is null then insert into public.departments(name) values (btrim(d.department_name)) returning id into v_dept; end if;

  if d.position_name is not null and d.grade is not null then
    select g.id into v_grade from public.job_grades g
     where translate(lower(btrim(g.position_name)), 'áéíóú', 'aeiou') = translate(lower(btrim(d.position_name)), 'áéíóú', 'aeiou')
       and upper(btrim(g.grade)) = upper(btrim(d.grade)) and g.active limit 1;
    if v_grade is null then v_notes := array_append(v_notes, format('cargo y grado sin equivalente activo en el catálogo: %s %s', d.position_name, d.grade)); end if;
  end if;
  if d.schedule_label is not null then
    v_shift := public.resolve_shift_code(d.schedule_label);
    if v_shift is null then v_notes := array_append(v_notes, format('horario sin turno equivalente en el catálogo: %s', d.schedule_label)); end if;
  end if;
  if nullif(btrim(coalesce(d.union_code, '')), '') is not null then
    select id into v_union from public.unions where upper(btrim(code)) = upper(btrim(d.union_code)) or upper(btrim(name)) = upper(btrim(d.union_code)) limit 1;
    if v_union is null then v_notes := array_append(v_notes, format('sindicato inexistente en el catálogo: %s', d.union_code)); end if;
  end if;

  v_role := case when v_first and p.role::text = 'employee' then d.app_role else p.role::text end;
  if v_first and p.role::text <> 'employee' and p.role::text <> d.app_role then
    v_notes := array_append(v_notes, format('el perfil ya tenía el rol %s: se conservó (el directorio indica %s)', p.role::text, d.app_role));
  end if;
  -- Vigencia inicial de salario y sindicato: la indicada en el directorio; si no hay, el 1 de enero del año actual (o la contratación si es posterior),
  -- y nunca después de la primera solicitud existente. Así el costo de las solicitudes de los últimos meses encuentra salario vigente.
  v_from := least(current_date,
                  coalesce(d.salary_valid_from, greatest(coalesce(d.hire_date, date_trunc('year', current_date)::date), date_trunc('year', current_date)::date)),
                  coalesce((select min(execution_date) from public.overtime_requests where employee_id = p_user), current_date));
  if d.salary_valid_from is null and d.base_salary is not null then
    v_notes := array_append(v_notes, format('vigencia inicial del salario asumida desde %s (el directorio no indica fecha): confirmar', v_from));
  end if;
  perform set_config('app.union_valid_from', v_from::text, true);
  perform set_config('app.union_reason', 'Carga inicial desde el directorio de funcionarios', true);
  perform set_config('app.union_action', 'directory_union', true);

  if p.document_number is null and exists(select 1 from public.profiles x where x.document_number = d.document_number and x.id <> p_user) then
    v_notes := array_append(v_notes, format('el documento %s ya está asignado a otro perfil', d.document_number));
  end if;

  update public.profiles set
    full_name = case when v_first then d.full_name else full_name end,
    email = coalesce(email, lower(v_email)),
    document_number = coalesce(document_number, case when exists(select 1 from public.profiles x where x.document_number = d.document_number and x.id <> p_user) then null else d.document_number end),
    department_id = coalesce(department_id, v_dept),
    role = v_role::public.app_role,
    job_grade_id = coalesce(job_grade_id, v_grade),
    shift_code = coalesce(shift_code, v_shift),
    union_id = coalesce(union_id, v_union),
    hire_date = coalesce(hire_date, d.hire_date),
    updated_at = now()
  where id = p_user;

  if d.base_salary is not null then
    select exists(select 1 from public.salary_history where employee_id = p_user) into v_has_hist;
    select base_salary into v_comp from public.employee_compensation where profile_id = p_user;
    if v_has_hist or v_comp is not null then
      v_notes := array_append(v_notes, 'ya tenía salario registrado: se conservó');
    else
      insert into public.salary_history(employee_id, salary, valid_from, reason) values (p_user, d.base_salary, v_from, 'Carga inicial desde el directorio de funcionarios');
      insert into public.employee_compensation(profile_id, base_salary, updated_at) values (p_user, d.base_salary, now())
      on conflict (profile_id) do update set base_salary = excluded.base_salary, updated_at = now();
    end if;
  end if;

  update public.employee_directory set profile_id = p_user, linked_at = coalesce(linked_at, now()) where id = d.id;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, new_data)
  values (auth.uid(), 'link_directory', 'profiles', p_user::text, jsonb_build_object('directory_id', d.id, 'first_link', v_first, 'role', v_role, 'notes', to_jsonb(v_notes)));
  perform set_config('app.directory_sync', 'off', true);
  perform set_config('app.union_valid_from', '', true); perform set_config('app.union_reason', '', true); perform set_config('app.union_action', '', true);
  return jsonb_build_object('linked', true, 'first_link', v_first, 'role', v_role, 'notes', to_jsonb(v_notes));
end $$;
revoke all on function public.link_profile_from_directory(uuid) from public, anon, authenticated;

create or replace function public.trg_auth_user_link_directory()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_run boolean;
begin
  if tg_op = 'INSERT' then
    v_run := true;
  else
    v_run := (old.email_confirmed_at is null and new.email_confirmed_at is not null)
          or lower(coalesce(new.email, '')) is distinct from lower(coalesce(old.email, ''));
  end if;
  if v_run then
    begin
      perform public.link_profile_from_directory(new.id);
    exception when others then
      -- un fallo de vinculación nunca debe impedir el acceso: el administrador puede reintentar con «Sincronizar directorio».
      raise warning 'v9: no fue posible vincular el directorio para la cuenta %: %', new.id, sqlerrm;
    end;
    perform set_config('app.directory_sync', 'off', true);
  end if;
  return new;
end $$;
revoke all on function public.trg_auth_user_link_directory() from public, anon, authenticated;
drop trigger if exists on_auth_user_link_directory on auth.users;
create trigger on_auth_user_link_directory after insert or update of email_confirmed_at, email on auth.users for each row execute function public.trg_auth_user_link_directory();

create or replace function public.admin_sync_directory()
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; res jsonb; n int := 0; l int := 0; detail jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'Se requieren permisos administrativos'; end if;
  for r in select u.id as uid, d.full_name as dname from public.employee_directory d join auth.users u on lower(u.email) = lower(d.email)
            where d.active order by d.full_name loop
    n := n + 1;
    begin
      res := public.link_profile_from_directory(r.uid);
    exception when others then
      res := jsonb_build_object('linked', false, 'reason', 'error', 'error', sqlerrm);
    end;
    if (res->>'linked')::boolean then l := l + 1; end if;
    if jsonb_array_length(coalesce(res->'notes', '[]'::jsonb)) > 0 or not (res->>'linked')::boolean then
      detail := detail || jsonb_build_array(jsonb_build_object('name', r.dname) || res);
    end if;
  end loop;
  return jsonb_build_object('processed', n, 'linked', l, 'pending_accounts', (select count(*) from public.employee_directory d where d.active and not exists(select 1 from auth.users u where lower(u.email) = lower(d.email))), 'detail', detail);
end $$;
revoke all on function public.admin_sync_directory() from public, anon;
grant execute on function public.admin_sync_directory() to authenticated;

-- 3) Habilitar las cuentas que estaban pendientes de confirmación (al actualizarlas se vinculan solas con el directorio)
do $$
declare n int;
begin
  select count(*) into n from auth.users where email_confirmed_at is null and email is not null;
  update auth.users set email_confirmed_at = now() where email_confirmed_at is null and email is not null;
  raise notice 'v9: % cuenta(s) pendientes de confirmación quedaron habilitadas para ingresar.', n;
end $$;

-- Después de ejecutar:
--  · Authentication → Providers → Email: desactiva «Confirm email» y mantén desactivado «Allow new users to sign up».
--  · Ejecuta:  select public.admin_sync_directory();   (vincula las cuentas ya existentes con el directorio)

-- =====================================================================================
-- MIGRACIÓN v10 · Centro de notificaciones  (idempotente; no borra ni modifica datos existentes)
-- Permite que cada usuario elimine SUS PROPIAS notificaciones desde el centro de notificaciones.
-- Marcar como leída / no leída ya estaba permitido (política "update own notifications"): no cambia.
-- Si no se aplica, el aplicativo sigue funcionando; solo avisa que eliminar notificaciones no está habilitado.
-- Requiere la instalación base.
-- =====================================================================================
do $$ begin
  if to_regclass('public.notifications') is null then
    raise exception 'Falta la instalación base (tabla public.notifications).';
  end if;
end $$;
grant delete on public.notifications to authenticated;
drop policy if exists "delete own notifications" on public.notifications;
create policy "delete own notifications" on public.notifications for delete to authenticated using(recipient_id=auth.uid());
