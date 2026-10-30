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
