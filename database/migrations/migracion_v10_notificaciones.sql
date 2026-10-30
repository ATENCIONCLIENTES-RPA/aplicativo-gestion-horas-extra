-- =====================================================================================
-- MIGRACIÓN v10 · Centro de notificaciones  (idempotente; no borra ni modifica datos existentes)
-- Permite que cada usuario elimine SUS PROPIAS notificaciones desde el centro de notificaciones.
-- Marcar como leída / no leída ya estaba permitido (política "update own notifications").
-- Si no se aplica, el aplicativo sigue funcionando; solo avisa que eliminar no está habilitado.
-- =====================================================================================
do $$ begin
  if to_regclass('public.notifications') is null then
    raise exception 'Falta la instalación base (tabla public.notifications).';
  end if;
end $$;
grant delete on public.notifications to authenticated;
drop policy if exists "delete own notifications" on public.notifications;
create policy "delete own notifications" on public.notifications for delete to authenticated using(recipient_id=auth.uid());
