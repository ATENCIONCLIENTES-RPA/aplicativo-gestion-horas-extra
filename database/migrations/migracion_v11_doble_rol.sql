-- =====================================================================================
-- MIGRACIÓN v11 · Aplicativo de Gestión de Horas Extras (idempotente)
-- Doble rol según contraseña para usuarios de Sistemas (Jaime Rizo y Laura Báez).
--
-- Permite que determinados usuarios conserven una única cuenta de acceso institucional
-- pero ingresen con roles diferenciados según la contraseña suministrada:
--   - Contraseña de Sistemas: rol elevado (admin / professional) con módulos de gestión.
--   - Contraseña de Funcionario: rol de Funcionario (employee) para radicar horas extras propias.
--
-- Seguridad:
--   1. Tabla public.dual_role_credentials protegida con RLS estricta (solo service_role).
--   2. Modificación de trg_protect_profile() para permitir conmutación autorizada sin violar blindaje.
--   3. Función public.set_active_role() con SECURITY DEFINER invocable exclusivamente por service_role.
--   4. Registro automático en auditoría sin almacenar contraseñas en claro.
-- =====================================================================================

do $$ begin
  if to_regclass('public.profiles') is null or to_regclass('public.audit_log') is null then
    raise exception 'Falta la instalación base: ejecútala antes de esta migración.';
  end if;
end $$;

-- Asegurar extensión para hashing seguro si no está habilitada
create extension if not exists pgcrypto with schema extensions;

-- ---------- 1. Tabla de credenciales de rol dual ----------
create table if not exists public.dual_role_credentials (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  employee_password_hash text not null,
  systems_role public.app_role not null check (systems_role in ('admin', 'professional', 'manager')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Protección estricta: ningún cliente anónimo ni autenticado puede leer ni escribir hashes
alter table public.dual_role_credentials enable row level security;
revoke all on public.dual_role_credentials from public, anon, authenticated;
grant all on public.dual_role_credentials to service_role;

-- ---------- 2. Actualización de trigger de blindaje (trg_protect_profile) ----------
-- Permite la alternancia de rol autorizada vía variable de transacción local app.dual_role = 'on'
create or replace function public.trg_protect_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_sync boolean := coalesce(current_setting('app.directory_sync', true), '') = 'on';
  v_dual boolean := coalesce(current_setting('app.dual_role', true), '') = 'on';
  v_uid uuid := auth.uid();
  v_auth_email text;
  v_others int;
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
    if char_length(new.full_name) < 3 or char_length(new.full_name) > 120 then
      raise exception 'El nombre debe tener entre 3 y 120 caracteres';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- Solo sesiones de cliente (la vinculación del directorio y la conmutación de rol dual no tienen sesión de usuario).
    if v_uid is not null and not v_sync and not v_dual then
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
    if new.email is distinct from old.email and not v_sync and not v_dual then
      select email into v_auth_email from auth.users where id = new.id;
      if lower(coalesce(new.email, '')) <> lower(coalesce(v_auth_email, '')) then
        raise exception 'El correo del perfil debe coincidir con el de la cuenta de acceso';
      end if;
    end if;
    -- Nunca sin administrador activo (excepto durante conmutación de rol dual autorizada).
    if old.role::text = 'admin' and old.active and (new.role::text <> 'admin' or not new.active) and not v_dual then
      select count(*) into v_others from public.profiles where role::text = 'admin' and active and id <> old.id;
      if v_others = 0 then
        raise exception 'Debe existir al menos un administrador activo';
      end if;
    end if;
  end if;

  -- El jefe define su ámbito de aprobación con la dependencia.
  if new.role::text = 'manager' and new.department_id is null
     and (tg_op = 'INSERT' or new.role is distinct from old.role or new.department_id is distinct from old.department_id) then
    raise exception 'El jefe debe tener una dependencia asignada (define su ámbito de aprobación)';
  end if;
  return new;
end $$;

-- ---------- 3. Función de conmutación de rol seguro (set_active_role) ----------
create or replace function public.set_active_role(p_user uuid, p_role text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_rec record;
  v_target_role public.app_role;
begin
  -- 1. Validar que el usuario tenga configuración de rol dual registrada
  select * into v_rec from public.dual_role_credentials where user_id = p_user;
  if not found then
    raise exception 'El usuario % no está configurado para acceso con doble rol', p_user;
  end if;

  -- 2. Validar que el rol solicitado sea únicamente 'employee' o su rol de sistemas asignado
  if p_role <> 'employee' and p_role <> v_rec.systems_role::text then
    raise exception 'Rol solicitado («%») no permitido para el usuario con rol de sistemas «%»', p_role, v_rec.systems_role;
  end if;

  v_target_role := p_role::public.app_role;

  -- 3. Activar flags de sesión para permitir el cambio seguro
  perform set_config('app.dual_role', 'on', true);
  perform set_config('app.directory_sync', 'on', true);

  update public.profiles
  set role = v_target_role,
      updated_at = now()
  where id = p_user;

  -- 4. Registrar en auditoría la conmutación de rol
  insert into public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  values (
    p_user,
    'dual_role_switched',
    'profiles',
    p_user::text,
    jsonb_build_object('active_role', p_role, 'systems_role', v_rec.systems_role::text)
  );

  -- 5. Restablecer flags
  perform set_config('app.dual_role', 'off', true);
  perform set_config('app.directory_sync', 'off', true);

  return jsonb_build_object(
    'ok', true,
    'user_id', p_user,
    'active_role', p_role,
    'systems_role', v_rec.systems_role
  );
end $$;

revoke all on function public.set_active_role(uuid, text) from public, anon, authenticated;
grant execute on function public.set_active_role(uuid, text) to service_role;

-- ---------- 4. Carga inicial de credenciales de rol dual para Jaime Rizo y Laura Báez ----------
-- Las contraseñas se gestionan mediante el panel administrativo o el flujo de restablecimiento seguro.
-- No se almacenan contraseñas en texto plano ni predecibles en los archivos de migración.
do $$
declare
  v_jaime_id uuid;
  v_laura_id uuid;
  v_default_emp_hash text;
begin
  -- Generar hash bcrypt temporal seguro (aleatorio criptográfico)
  v_default_emp_hash := extensions.crypt(encode(extensions.gen_random_bytes(24), 'hex'), extensions.gen_salt('bf', 10));

  -- Buscar IDs de Jaime Rizo y Laura Báez
  select id into v_jaime_id from public.profiles where lower(email) = 'jaime.rizo@essa.com.co';
  select id into v_laura_id from public.profiles where lower(email) = 'laura.baez@essa.com.co';

  if v_jaime_id is not null then
    insert into public.dual_role_credentials (user_id, employee_password_hash, systems_role, updated_at)
    values (v_jaime_id, v_default_emp_hash, 'admin'::public.app_role, now())
    on conflict (user_id) do nothing;
  end if;

  if v_laura_id is not null then
    insert into public.dual_role_credentials (user_id, employee_password_hash, systems_role, updated_at)
    values (v_laura_id, v_default_emp_hash, 'professional'::public.app_role, now())
    on conflict (user_id) do nothing;
  end if;
end $$;
