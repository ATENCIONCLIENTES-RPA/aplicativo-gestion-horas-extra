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
