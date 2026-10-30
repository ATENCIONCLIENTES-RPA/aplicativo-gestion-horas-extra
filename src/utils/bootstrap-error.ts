export function showBootstrapError(error: unknown): void {
  console.error('No fue posible iniciar la aplicación.', error);
  const host = document.querySelector<HTMLElement>('#authView');
  if (!host) return;

  const message = document.createElement('div');
  message.setAttribute('role', 'alert');
  message.style.cssText = 'position:fixed;inset:auto 16px 16px;z-index:99999;padding:12px 14px;border:1px solid #fecaca;border-radius:10px;background:#fff1f2;color:#991b1b;font:600 14px/1.4 Inter,system-ui,sans-serif;box-shadow:0 12px 30px rgba(15,23,42,.16)';
  message.textContent = 'No fue posible iniciar el aplicativo. Revisa la consola y la configuración del despliegue.';
  host.appendChild(message);
}
