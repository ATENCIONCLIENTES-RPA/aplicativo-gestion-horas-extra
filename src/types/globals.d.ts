export {};

declare global {
  interface Window {
    Chart?: any;
    supabase?: { createClient: (...args: any[]) => any };
    lucide?: { createIcons: (options?: { attrs?: Record<string, string> }) => void };
    __APP_CONFIG__: { supabaseUrl: string; supabaseAnonKey: string };
    __APP_ASSETS__: { essaLogo: string };
    PayrollEngine?: Record<string, any>;
    CfgUX?: Record<string, any>;
    App?: Record<string, any>;
  }
}
