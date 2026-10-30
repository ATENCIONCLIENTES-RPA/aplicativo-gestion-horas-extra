import essaLogo from './assets/essa-logo.png';
import { runtimeConfig } from './config/runtime';
import { showBootstrapError } from './utils/bootstrap-error';

async function bootstrap(): Promise<void> {
  window.__APP_CONFIG__ = runtimeConfig;
  window.__APP_ASSETS__ = { essaLogo };
  const schemaNode = document.querySelector<HTMLScriptElement>('#sqlSchema');
  if (!schemaNode) throw new Error('No se encontró el contenedor del esquema SQL.');
  const schemaUrl = new URL('database/schema_completo.sql', document.baseURI);
  const schemaResponse = await fetch(schemaUrl);
  if (!schemaResponse.ok) throw new Error(`No se pudo cargar el esquema SQL (${schemaResponse.status}).`);
  schemaNode.textContent = await schemaResponse.text();

  // Orden intencional: motor puro → aplicación → mejora progresiva de configuración.
  await import('./modules/payroll-engine.js');
  await import('./scripts/app.js');

  // La capa de ayuda/configuración es progresiva: cargarla cuando el arranque crítico ya cedió el hilo.
  const loadConfigUx = () => void import('./modules/config-ux.js').catch(showBootstrapError);
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(loadConfigUx, { timeout: 1000 });
  } else {
    globalThis.setTimeout(loadConfigUx, 0);
  }
}

void bootstrap().catch(showBootstrapError);
