-- =============================================================================
-- MIGRACIÓN v13 · Corrección de firma de save_overtime_request
-- Problema: p_request_id no tenía DEFAULT NULL, por lo que cuando el frontend
-- enviaba p_request_id=null (nueva solicitud), PostgREST omitía el parámetro
-- y buscaba la firma (p_data, p_submit) que no existe, causando el error:
-- "Could not find the function public.save_overtime_request(p_data, p_submit)"
-- Solución: re-crear la función con p_request_id uuid DEFAULT NULL
-- Idempotente: puede ejecutarse más de una vez sin efectos secundarios.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.save_overtime_request(
  p_request_id uuid    DEFAULT NULL,
  p_data       jsonb   DEFAULT NULL,
  p_submit     boolean DEFAULT false
)
RETURNS public.overtime_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r           public.overtime_requests;
  v_dept      uuid;
  v_status    public.request_status;
  v_old_status public.request_status;
  v_start     timestamp;
  v_end       timestamp;
  v_selected  jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida';
  END IF;
  IF EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Como administrador, no puedes crear solicitudes de horas extras para ti mismo';
  END IF;
  SELECT department_id INTO v_dept FROM public.profiles WHERE id = auth.uid() AND active = true;
  IF v_dept IS NULL THEN
    RAISE EXCEPTION 'El perfil no tiene una dependencia activa asignada';
  END IF;
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Los datos de la solicitud son requeridos';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.work_types WHERE id = (p_data->>'work_type_id')::uuid AND active = true) THEN
    RAISE EXCEPTION 'El tipo de jornada no es válido o está inactivo';
  END IF;
  v_start := (p_data->>'execution_date')::date + (p_data->>'start_time')::time;
  v_end   := (p_data->>'execution_date')::date + (p_data->>'end_time')::time;
  IF v_end <= v_start THEN
    v_end := v_end + INTERVAL '1 day';
  END IF;
  v_selected := COALESCE(p_data->'selected_activities', '[]'::jsonb);
  IF jsonb_typeof(v_selected) <> 'array' OR jsonb_array_length(v_selected) = 0 THEN
    RAISE EXCEPTION 'Debe seleccionar al menos una actividad';
  END IF;
  IF p_submit AND EXISTS(
    SELECT 1 FROM public.overtime_requests x
    WHERE x.employee_id = auth.uid()
      AND x.id <> COALESCE(p_request_id, gen_random_uuid())
      AND x.status NOT IN ('rejected', 'cancelled')
      AND tsrange(
            x.execution_date + x.start_time,
            x.execution_date + x.end_time + CASE WHEN x.end_time <= x.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0' END,
            '[)'
          ) && tsrange(v_start, v_end, '[)')
  ) THEN
    RAISE EXCEPTION 'Existe una solicitud duplicada o que se solapa con este horario';
  END IF;
  v_status := CASE WHEN p_submit THEN 'pending'::public.request_status ELSE 'draft'::public.request_status END;
  IF p_request_id IS NULL THEN
    INSERT INTO public.overtime_requests(
      filing_number, employee_id, department_id,
      execution_date, start_time, end_time, hours_requested,
      work_type_id, reason, selected_activities, justification,
      activities, observations, status, submitted_at
    ) VALUES(
      public.format_filing_number(nextval('public.overtime_filing_seq')),
      auth.uid(), v_dept,
      (p_data->>'execution_date')::date,
      (p_data->>'start_time')::time,
      (p_data->>'end_time')::time,
      1,
      (p_data->>'work_type_id')::uuid,
      trim(p_data->>'reason'),
      v_selected,
      trim(p_data->>'justification'),
      trim(p_data->>'activities'),
      null,
      v_status,
      CASE WHEN p_submit THEN now() END
    ) RETURNING * INTO r;
    INSERT INTO public.request_history(request_id, to_status, comment, actor_id)
      VALUES(r.id, v_status, CASE WHEN p_submit THEN 'Solicitud creada y enviada' ELSE 'Borrador guardado' END, auth.uid());
  ELSE
    SELECT * INTO r FROM public.overtime_requests WHERE id = p_request_id AND employee_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Solicitud no encontrada';
    END IF;
    IF r.status NOT IN ('draft', 'returned') THEN
      RAISE EXCEPTION 'La solicitud ya no admite edición';
    END IF;
    v_old_status := r.status;
    UPDATE public.overtime_requests SET
      execution_date    = (p_data->>'execution_date')::date,
      start_time        = (p_data->>'start_time')::time,
      end_time          = (p_data->>'end_time')::time,
      work_type_id      = (p_data->>'work_type_id')::uuid,
      reason            = trim(p_data->>'reason'),
      selected_activities = v_selected,
      justification     = trim(p_data->>'justification'),
      activities        = trim(p_data->>'activities'),
      status            = v_status,
      submitted_at      = CASE WHEN p_submit THEN now() ELSE submitted_at END
    WHERE id = p_request_id
    RETURNING * INTO r;
    INSERT INTO public.request_history(request_id, from_status, to_status, comment, actor_id)
      VALUES(r.id, v_old_status, v_status,
             CASE WHEN p_submit THEN 'Solicitud corregida y enviada' ELSE 'Borrador actualizado' END,
             auth.uid());
  END IF;
  -- v5: el aviso de «Nueva solicitud por revisar» lo emite trg_notify_reviewers al profesional y al jefe.
  INSERT INTO public.audit_log(actor_id, action, entity_type, entity_id, new_data)
    VALUES(auth.uid(),
           CASE WHEN p_submit THEN 'submit' ELSE 'save_draft' END,
           'overtime_request', r.id::text, to_jsonb(r));
  RETURN r;
END $$;

-- Permisos: solo usuarios autenticados (empleados, jefe como empleado, etc.)
REVOKE ALL ON FUNCTION public.save_overtime_request(uuid, jsonb, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_overtime_request(uuid, jsonb, boolean) TO authenticated;

-- Forzar recarga del schema cache de PostgREST
NOTIFY pgrst, 'reload schema';
