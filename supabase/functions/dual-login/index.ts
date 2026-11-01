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
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // =========================================================================
    // FLUJO 1: CAMBIO DE CONTRASEÑA VOLUNTARIO (action === 'change-password')
    // =========================================================================
    if (body?.action === 'change-password') {
      const authHeader = req.headers.get('Authorization') || '';
      const jwt = authHeader.replace(/^Bearer\s+/i, '');

      if (!jwt) {
        return new Response(JSON.stringify({ error: 'No autorizado: falta sesión activa.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: { user: caller }, error: callerErr } = await supabaseAdmin.auth.getUser(jwt);
      if (callerErr || !caller || !caller.email) {
        return new Response(JSON.stringify({ error: 'Sesión no válida o expirada. Inicia sesión de nuevo.' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const currentPw = String(body?.current || '');
      const nextPw = String(body?.next || '');
      const activeRole = String(body?.active_role || '');

      if (!currentPw) {
        return new Response(JSON.stringify({ error: 'Escribe tu contraseña actual.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!nextPw || nextPw.length < 8) {
        return new Response(JSON.stringify({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 1. Verificar si el usuario tiene credencial de rol dual (Jaime Rizo / Laura Báez)
      const { data: dualCred } = await supabaseAdmin
        .from('dual_role_credentials')
        .select('user_id, employee_password_hash, systems_role')
        .eq('user_id', caller.id)
        .maybeSingle();

      if (dualCred) {
        // Verificar si la contraseña actual coincide con el hash de funcionario (bcrypt)
        const isEmployeeCurrent = bcrypt.compareSync(currentPw, dualCred.employee_password_hash);

        // Si el usuario está en modo funcionario o la clave actual coincide con la de funcionario
        if (isEmployeeCurrent || activeRole === 'employee') {
          if (isEmployeeCurrent) {
            // Actualizar la contraseña de funcionario en dual_role_credentials
            const newEmpHash = bcrypt.hashSync(nextPw, 10);
            const { error: updEmpErr } = await supabaseAdmin
              .from('dual_role_credentials')
              .update({
                employee_password_hash: newEmpHash,
                updated_at: new Date().toISOString()
              })
              .eq('user_id', caller.id);

            if (updEmpErr) throw updEmpErr;

            await supabaseAdmin.from('audit_log').insert({
              actor_id: caller.id,
              action: 'dual_employee_password_changed',
              entity_type: 'profiles',
              entity_id: caller.id,
              new_data: { role: 'employee' }
            });

            return new Response(JSON.stringify({
              ok: true,
              target: 'employee',
              message: 'Contraseña de funcionario actualizada correctamente.'
            }), {
              status: 200,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Si estaba en modo funcionario pero la clave actual no coincidió con funcionario, verificar si ingresó la de sistemas
          const clientVerify = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey);
          const { error: sysErr } = await clientVerify.auth.signInWithPassword({
            email: caller.email,
            password: currentPw,
          });

          if (sysErr) {
            return new Response(JSON.stringify({ error: 'La contraseña actual no es correcta.' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Si coincidió con la de sistemas, actualizar la de sistemas
          const { error: updSysErr } = await supabaseAdmin.auth.admin.updateUserById(caller.id, {
            password: nextPw,
            user_metadata: { must_change_password: false }
          });
          if (updSysErr) throw updSysErr;

          await supabaseAdmin.from('audit_log').insert({
            actor_id: caller.id,
            action: 'systems_password_changed',
            entity_type: 'profiles',
            entity_id: caller.id,
            new_data: { role: dualCred.systems_role }
          });

          return new Response(JSON.stringify({
            ok: true,
            target: 'systems',
            message: 'Contraseña de sistemas actualizada correctamente.'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Si está en modo sistemas, probar primero la de sistemas en GoTrue
        const clientVerify = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey);
        const { error: sysErr } = await clientVerify.auth.signInWithPassword({
          email: caller.email,
          password: currentPw,
        });

        if (!sysErr) {
          const { error: updSysErr } = await supabaseAdmin.auth.admin.updateUserById(caller.id, {
            password: nextPw,
            user_metadata: { must_change_password: false }
          });
          if (updSysErr) throw updSysErr;

          await supabaseAdmin.from('audit_log').insert({
            actor_id: caller.id,
            action: 'systems_password_changed',
            entity_type: 'profiles',
            entity_id: caller.id,
            new_data: { role: dualCred.systems_role }
          });

          return new Response(JSON.stringify({
            ok: true,
            target: 'systems',
            message: 'Contraseña de sistemas actualizada correctamente.'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Si no coincidió con sistemas, verificar si coincidió con funcionario
        if (isEmployeeCurrent) {
          const newEmpHash = bcrypt.hashSync(nextPw, 10);
          const { error: updEmpErr } = await supabaseAdmin
            .from('dual_role_credentials')
            .update({
              employee_password_hash: newEmpHash,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', caller.id);

          if (updEmpErr) throw updEmpErr;

          return new Response(JSON.stringify({
            ok: true,
            target: 'employee',
            message: 'Contraseña de funcionario actualizada correctamente.'
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ error: 'La contraseña actual no es correcta.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 2. Para usuarios regulares (no rol dual): verificar contraseña actual con GoTrue
      const clientAuth = createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey);
      const { error: verifyErr } = await clientAuth.auth.signInWithPassword({
        email: caller.email,
        password: currentPw,
      });

      if (verifyErr) {
        return new Response(JSON.stringify({ error: 'La contraseña actual no es correcta.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Actualizar contraseña en Supabase Auth
      const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(caller.id, {
        password: nextPw,
        user_metadata: { must_change_password: false }
      });

      if (updateErr) throw updateErr;

      await supabaseAdmin.from('audit_log').insert({
        actor_id: caller.id,
        action: 'password_changed',
        entity_type: 'profiles',
        entity_id: caller.id,
        new_data: { role: 'standard' }
      });

      return new Response(JSON.stringify({
        ok: true,
        target: 'standard',
        message: 'Contraseña actualizada correctamente.'
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // =========================================================================
    // FLUJO 2: INICIO DE SESIÓN CON DOBLE ROL (LOGIN)
    // =========================================================================
    const cleanEmail = String(body?.email || '').trim().toLowerCase();
    const cleanPassword = String(body?.password || '');

    if (!cleanEmail || !cleanPassword) {
      return new Response(JSON.stringify({ error: 'Ingresa tu correo y contraseña.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
