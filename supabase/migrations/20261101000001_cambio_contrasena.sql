-- =====================================================================================
-- MIGRACIÓN v12 · Aplicativo de Gestión de Horas Extras (idempotente)
-- Corrección del cambio de contraseña para usuarios con rol dual y cuentas estándar.
-- =====================================================================================

create extension if not exists pgcrypto with schema extensions;

create or replace function public.change_own_password(p_current text, p_next text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_dual record;
  v_profile_role text;
  v_auth_hash text;
begin
  if v_uid is null then
    raise exception 'No autorizado: debes iniciar sesión para cambiar tu contraseña.';
  end if;

  if p_current is null or btrim(p_current) = '' then
    raise exception 'Escribe tu contraseña actual.';
  end if;

  if p_next is null or char_length(btrim(p_next)) < 8 then
    raise exception 'La nueva contraseña debe tener al menos 8 caracteres.';
  end if;

  if p_current = p_next then
    raise exception 'La nueva contraseña debe ser distinta a la actual.';
  end if;

  select role::text into v_profile_role from public.profiles where id = v_uid;
  select * into v_dual from public.dual_role_credentials where user_id = v_uid;

  -- =========================================================================
  -- CASO A: Usuario configurado con rol dual (Jaime Rizo o Laura Báez)
  -- =========================================================================
  if found then
    -- Si el usuario está operando con rol de funcionario
    if v_profile_role = 'employee' then
      -- Validar que la contraseña actual coincida con el hash de funcionario (bcrypt)
      if extensions.crypt(p_current, v_dual.employee_password_hash) <> v_dual.employee_password_hash then
        -- Si no coincide con funcionario, comprobar si por error ingresó la de sistemas
        select encrypted_password into v_auth_hash from auth.users where id = v_uid;
        if extensions.crypt(p_current, v_auth_hash) = v_auth_hash then
          update auth.users
          set encrypted_password = extensions.crypt(p_next, extensions.gen_salt('bf', 10)),
              updated_at = now()
          where id = v_uid;

          insert into public.audit_log (actor_id, action, entity_type, entity_id, new_data)
          values (v_uid, 'systems_password_changed', 'profiles', v_uid::text, jsonb_build_object('role', v_dual.systems_role::text));

          return jsonb_build_object('ok', true, 'target', 'systems', 'message', 'Contraseña de sistemas actualizada correctamente.');
        end if;

        raise exception 'La contraseña actual no es correcta.';
      end if;

      -- Actualizar contraseña de funcionario en dual_role_credentials
      update public.dual_role_credentials
      set employee_password_hash = extensions.crypt(p_next, extensions.gen_salt('bf', 10)),
          updated_at = now()
      where user_id = v_uid;

      insert into public.audit_log (actor_id, action, entity_type, entity_id, new_data)
      values (v_uid, 'dual_employee_password_changed', 'profiles', v_uid::text, jsonb_build_object('role', 'employee'));

      return jsonb_build_object('ok', true, 'target', 'employee', 'message', 'Contraseña de funcionario actualizada correctamente.');
    end if;

    -- Si el usuario está operando con rol de sistemas (admin o professional)
    select encrypted_password into v_auth_hash from auth.users where id = v_uid;
    if extensions.crypt(p_current, v_auth_hash) = v_auth_hash then
      update auth.users
      set encrypted_password = extensions.crypt(p_next, extensions.gen_salt('bf', 10)),
          updated_at = now()
      where id = v_uid;

      insert into public.audit_log (actor_id, action, entity_type, entity_id, new_data)
      values (v_uid, 'systems_password_changed', 'profiles', v_uid::text, jsonb_build_object('role', v_dual.systems_role::text));

      return jsonb_build_object('ok', true, 'target', 'systems', 'message', 'Contraseña de sistemas actualizada correctamente.');
    end if;

    if extensions.crypt(p_current, v_dual.employee_password_hash) = v_dual.employee_password_hash then
      update public.dual_role_credentials
      set employee_password_hash = extensions.crypt(p_next, extensions.gen_salt('bf', 10)),
          updated_at = now()
      where user_id = v_uid;

      insert into public.audit_log (actor_id, action, entity_type, entity_id, new_data)
      values (v_uid, 'dual_employee_password_changed', 'profiles', v_uid::text, jsonb_build_object('role', 'employee'));

      return jsonb_build_object('ok', true, 'target', 'employee', 'message', 'Contraseña de funcionario actualizada correctamente.');
    end if;

    raise exception 'La contraseña actual no es correcta.';
  end if;

  -- =========================================================================
  -- CASO B: Funcionario estándar (no rol dual)
  -- =========================================================================
  select encrypted_password, email into v_auth_hash, v_email from auth.users where id = v_uid;
  if extensions.crypt(p_current, v_auth_hash) <> v_auth_hash then
    raise exception 'La contraseña actual no es correcta.';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_next, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = v_uid;

  insert into public.audit_log (actor_id, action, entity_type, entity_id, new_data)
  values (v_uid, 'password_changed', 'profiles', v_uid::text, jsonb_build_object('role', v_profile_role));

  return jsonb_build_object('ok', true, 'target', 'standard', 'message', 'Contraseña actualizada correctamente.');
end;
$$;

revoke all on function public.change_own_password(text, text) from public, anon;
grant execute on function public.change_own_password(text, text) to authenticated;
