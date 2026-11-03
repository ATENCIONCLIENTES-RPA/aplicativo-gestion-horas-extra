import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-migration-key',
};

const MIGRATION_KEY = Deno.env.get('MIGRATION_SECRET') ?? 'migration_key_horas_extras_2026';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Verificar clave de migración
    const migrationKey = req.headers.get('x-migration-key') ?? '';
    if (migrationKey !== MIGRATION_KEY) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const sql = body?.sql as string;

    if (!sql || typeof sql !== 'string') {
      return new Response(JSON.stringify({ error: 'Se requiere el campo sql' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Obtener la connection string desde las variables de entorno de Supabase
    // SUPABASE_DB_URL está disponible en Edge Functions como variable interna
    const dbUrl = Deno.env.get('SUPABASE_DB_URL');
    if (!dbUrl) {
      return new Response(JSON.stringify({ error: 'SUPABASE_DB_URL no disponible en este entorno' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Conectar directamente a postgres y ejecutar el SQL
    const sql_client = postgres(dbUrl, { max: 1, idle_timeout: 20 });
    try {
      const result = await sql_client.unsafe(sql);
      await sql_client.end();
      return new Response(JSON.stringify({ ok: true, result }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (sqlErr: any) {
      await sql_client.end().catch(() => {});
      return new Response(JSON.stringify({ ok: false, error: sqlErr?.message || String(sqlErr) }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

  } catch (err: any) {
    console.error('Error en apply-migrations:', err);
    return new Response(JSON.stringify({ error: err?.message || 'Error interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
