import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  // Manejo de preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado: falta cabecera Authorization.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Error de configuración del servidor (variables de Supabase ausentes).' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Validar identidad del usuario que invoca la función
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(jwt);

    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Sesión no válida o expirada.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Validar que el invocador sea administrador activo
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, active')
      .eq('id', caller.id)
      .maybeSingle();

    if (profileError || !callerProfile || callerProfile.role !== 'admin' || !callerProfile.active) {
      return new Response(JSON.stringify({ error: 'Se requieren permisos de administrador activo.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Procesar cuerpo de la petición
    const body = await req.json().catch(() => ({}));
    const { user_id, mode } = body;

    if (!user_id || !['generate', 'document', 'link'].includes(mode)) {
      return new Response(
        JSON.stringify({ error: 'Parámetros no válidos. Se requiere "user_id" y "mode" (generate | document | link).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (user_id === caller.id) {
      return new Response(
        JSON.stringify({ error: 'No puedes cambiar tu propia contraseña desde este módulo.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Validar perfil objetivo
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, email, document_number, active')
      .eq('id', user_id)
      .maybeSingle();

    if (targetError || !targetProfile) {
      return new Response(JSON.stringify({ error: 'La cuenta o perfil objetivo no existe.' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Aplicar límites de seguridad (Rate Limiting en base de datos)
    const { data: limitCheck } = await supabaseAdmin.rpc('password_action_allowed', {
      p_actor: caller.id,
      p_target: user_id,
    });

    if (limitCheck === 'actor_limit') {
      await supabaseAdmin.rpc('password_audit', {
        p_actor: caller.id,
        p_action: 'password_admin_rate_limited',
        p_target: user_id,
        p_data: { reason: 'actor_limit' },
      });
      return new Response(
        JSON.stringify({ error: 'Límite administrativo alcanzado (máximo 20 acciones cada 10 min). Intenta más tarde.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (limitCheck === 'target_limit') {
      await supabaseAdmin.rpc('password_audit', {
        p_actor: caller.id,
        p_action: 'password_admin_rate_limited',
        p_target: user_id,
        p_data: { reason: 'target_limit' },
      });
      return new Response(
        JSON.stringify({ error: 'Límite alcanzado para esta cuenta (máximo 5 acciones por hora). Intenta más tarde.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Ejecutar acción según el modo solicitado
    if (mode === 'generate') {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
      const nums = '23456789';
      const syms = '#@$%!';
      const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];

      let tempPw = '';
      for (let i = 0; i < 9; i++) tempPw += pick(chars);
      tempPw += pick(nums) + pick(nums) + pick(syms);

      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        password: tempPw,
        user_metadata: { must_change_password: true },
      });
      if (updateErr) throw updateErr;

      await supabaseAdmin.rpc('revoke_user_sessions', { p_user: user_id });
      await supabaseAdmin.rpc('password_audit', {
        p_actor: caller.id,
        p_action: 'password_admin_temp_assigned',
        p_target: user_id,
        p_data: { mode: 'generate' },
      });

      return new Response(JSON.stringify({ temporary_password: tempPw }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'document') {
      const doc = String(targetProfile.document_number || '').trim();
      if (doc.length < 6) {
        return new Response(
          JSON.stringify({ error: 'Este perfil no tiene una cédula registrada válida (mínimo 6 caracteres).' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        password: doc,
        user_metadata: { must_change_password: true },
      });
      if (updateErr) throw updateErr;

      await supabaseAdmin.rpc('revoke_user_sessions', { p_user: user_id });
      await supabaseAdmin.rpc('password_audit', {
        p_actor: caller.id,
        p_action: 'password_admin_temp_assigned',
        p_target: user_id,
        p_data: { mode: 'document' },
      });

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mode === 'link') {
      const { data: targetAuthUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(user_id);
      if (authErr || !targetAuthUser?.user?.email) {
        return new Response(JSON.stringify({ error: 'No se encontró correo electrónico para esta cuenta.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const appUrl = Deno.env.get('APP_URL') || Deno.env.get('SITE_URL') || '';
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: targetAuthUser.user.email,
        options: appUrl ? { redirectTo: appUrl } : undefined,
      });
      if (linkErr) throw linkErr;

      const link = linkData?.properties?.action_link || (linkData as any)?.action_link || '';

      await supabaseAdmin.rpc('password_audit', {
        p_actor: caller.id,
        p_action: 'password_admin_link_generated',
        p_target: user_id,
        p_data: { mode: 'link' },
      });

      return new Response(JSON.stringify({ link }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Modo no soportado.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Error interno del servidor.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
