import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@2.4.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Configuración del servidor incompleta (variables de Supabase ausentes).' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const cleanEmail = String(body?.email || '').trim().toLowerCase();
    const cleanPassword = String(body?.password || '');

    if (!cleanEmail || !cleanPassword) {
      return new Response(JSON.stringify({ error: 'Ingresa tu correo y contraseña.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Verificar si el usuario existe y su estado en el sistema
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, role, active')
      .ilike('email', cleanEmail)
      .maybeSingle();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: 'Correo o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile.active) {
      return new Response(JSON.stringify({ error: 'Tu usuario fue desactivado. Contacta al administrador.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Comprobar si el usuario tiene credencial de rol dual (Jaime Rizo / Laura Báez)
    const { data: dualCred } = await supabaseAdmin
      .from('dual_role_credentials')
      .select('user_id, employee_password_hash, systems_role')
      .eq('user_id', profile.id)
      .maybeSingle();

    // 3. Si tiene credencial dual, comprobar primero si usó la contraseña de funcionario
    if (dualCred) {
      const isEmployeePwd = bcrypt.compareSync(cleanPassword, dualCred.employee_password_hash);
      if (isEmployeePwd) {
        // Conmutar rol a 'employee'
        const { error: roleErr } = await supabaseAdmin.rpc('set_active_role', {
          p_user: profile.id,
          p_role: 'employee',
        });
        if (roleErr) {
          console.error('Error al conmutar rol a funcionario:', roleErr);
        }

        // Generar enlace mágico OTP para iniciar sesión en la misma cuenta sin exponer claves
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: cleanEmail,
        });

        if (linkErr || !linkData?.properties?.email_otp) {
          throw new Error(linkErr?.message || 'No fue posible generar la sesión para el rol de funcionario.');
        }

        // Canjear el OTP en cliente anon para emitir los tokens de sesión estándar de GoTrue
        const clientAnon = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey);
        const { data: sessionData, error: sessionErr } = await clientAnon.auth.verifyOtp({
          email: cleanEmail,
          token: linkData.properties.email_otp,
          type: 'email',
        });

        if (sessionErr || !sessionData?.session) {
          throw new Error(sessionErr?.message || 'Error al canjear tokens de sesión.');
        }

        return new Response(JSON.stringify({
          session: sessionData.session,
          user: sessionData.user,
          role: 'employee',
          mode: 'funcionario'
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 4. Intentar autenticación estándar con Supabase Auth (contraseña principal / Sistemas)
    const clientForAuth = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey);
    const { data: signInData, error: signInErr } = await clientForAuth.auth.signInWithPassword({
      email: cleanEmail,
      password: cleanPassword,
    });

    if (signInErr || !signInData.session) {
      return new Response(JSON.stringify({ error: 'Correo o contraseña incorrectos. Revisa tus datos e inténtalo de nuevo.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Si es usuario dual y la contraseña coincidió con la de Sistemas, asegurar rol de Sistemas
    if (dualCred) {
      await supabaseAdmin.rpc('set_active_role', {
        p_user: profile.id,
        p_role: dualCred.systems_role,
      });
    }

    return new Response(JSON.stringify({
      session: signInData.session,
      user: signInData.user,
      role: dualCred ? dualCred.systems_role : profile.role,
      mode: dualCred ? 'sistemas' : 'standard'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('Error no controlado en dual-login:', err);
    return new Response(JSON.stringify({ error: err?.message || 'Error interno de autenticación.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
