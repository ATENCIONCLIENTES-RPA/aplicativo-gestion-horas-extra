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
-- La asignación de rol y datos laborales SOLO ocurre con el correo confirmado (quien se registra con un correo ajeno no
-- recibe privilegios). Nunca pisa datos existentes: completa lo que esté vacío; el rol del directorio solo se aplica en la
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
--  · Crea las cuentas en Authentication (o con «aprovisionar_cuentas_auth.mjs»). Al confirmar su correo, cada persona queda vinculada sola.
--  · Authentication → Providers → Email: desactiva «Allow new users to sign up» para que solo existan cuentas creadas por el administrador.
