export interface PublicRuntimeConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const normalizedUrl = (value: string | undefined): string =>
  (value ?? '').trim().replace(/\/$/, '');

export const runtimeConfig: PublicRuntimeConfig = Object.freeze({
  supabaseUrl: normalizedUrl(import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim(),
});

if (!runtimeConfig.supabaseUrl || !runtimeConfig.supabaseAnonKey) {
  console.info(
    '[Configuración] Variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY no detectadas. ' +
    'El aplicativo funcionará en modo local de demostración o con la configuración de localStorage. ' +
    'Para producción, configura estas variables en tu archivo .env o en los secretos de GitHub Actions.'
  );
}
