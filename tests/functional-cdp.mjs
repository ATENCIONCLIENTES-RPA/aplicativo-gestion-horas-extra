import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const chromePath = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1228/chrome-linux64/chrome';
const port = Number(process.env.CDP_PORT || 9223);
const profile = await mkdtemp(join(tmpdir(), 'essa-cdp-'));
const output = new URL('../docs/verification/', import.meta.url);
await mkdir(output, { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--host-resolver-rules=MAP cdn.jsdelivr.net 127.0.0.1, MAP fonts.googleapis.com 127.0.0.1, MAP fonts.gstatic.com 127.0.0.1',
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitForDebugger() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error('Chromium no abrió el puerto de depuración.');
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
  }
  async open() {
    this.ws.binaryType = 'arraybuffer';
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', async ({ data }) => {
      const text = typeof data === 'string' ? data : data instanceof ArrayBuffer ? Buffer.from(data).toString('utf8') : await data.text();
      const message = JSON.parse(text);
      if (message.id) {
        const waiter = this.pending.get(message.id);
        if (!waiter) return;
        this.pending.delete(message.id);
        return message.error ? waiter.reject(new Error(message.error.message)) : waiter.resolve(message.result);
      }
      this.events.push(message);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP sin respuesta: ${method}`)); }, 20000);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      });
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Error al evaluar en la página.');
    return result.result.value;
  }
  close() { this.ws.close(); }
}

async function waitFor(cdp, expression, label, timeout = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await cdp.evaluate(expression)) return;
    await sleep(120);
  }
  throw new Error(`Tiempo agotado: ${label}`);
}

async function navigate(cdp, url) {
  cdp.events.length = 0;
  const navigation = await cdp.send('Page.navigate', { url });
  if (navigation.errorText) throw new Error(`Navegación fallida: ${navigation.errorText}`);
  const expected = JSON.stringify(new URL(url).origin);
  await waitFor(cdp, `location.origin === ${expected}`, `origen de ${url}`, 15000);
  await waitFor(cdp, "document.readyState === 'complete'", `carga de ${url}`, 15000);
  await sleep(1200);
}

async function screenshot(cdp, path) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  await writeFile(path, Buffer.from(data, 'base64'));
}

async function runFlow(cdp, name, url) {
  console.log(`INICIO ${name}: ${url}`);
  await navigate(cdp, url);
  console.log(`CARGADO ${name}`);
  // Cada ejecución usa un perfil temporal de Chromium; los dos orígenes empiezan limpios.
  await waitFor(cdp, "!!document.querySelector('#loginForm')", 'formulario de acceso');
  await sleep(1000);
  console.log(`LOGIN LISTO ${name}`);

  const loginReady = await cdp.evaluate(`(() => ({
    title: document.title,
    authVisible: !document.querySelector('#authView').classList.contains('hidden'),
    appHidden: document.querySelector('#appView').classList.contains('hidden'),
    cssRules: [...document.styleSheets].reduce((n,s)=>{try{return n+s.cssRules.length}catch{return n}},0),
    schemaChars: document.querySelector('#sqlSchema').textContent.length
  }))()`);

  await cdp.evaluate(`(() => {
    const email=document.querySelector('#loginEmail'), password=document.querySelector('#loginPassword');
    email.value='prueba.admin@prueba-essa.local'; password.value='Admin#Prueba2026';
    email.dispatchEvent(new Event('input',{bubbles:true})); password.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#loginForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
    return true;
  })()`);
  await waitFor(cdp, "!document.querySelector('#appView').classList.contains('hidden')", 'inicio de sesión local', 15000);
  await waitFor(cdp, "document.querySelector('#userName').textContent.includes('Prueba Administrador')", 'perfil administrador');
  await sleep(900);
  console.log(`AUTENTICADO ${name}`);

  const pages = ['dashboard','requests','reports','adminQueue','auxilios','finance','employees','settings'];
  const navigation = {};
  for (const page of pages) {
    console.log(`NAVEGA ${name}: ${page}`);
    const found = await cdp.evaluate(`(() => { const b=document.querySelector('[data-page="${page}"]'); if(!b)return false; b.click(); return true; })()`);
    if (!found) navigation[page] = false;
    else {
      try { await waitFor(cdp, `document.querySelector('#page-${page}').classList.contains('active')`, `página ${page}`, 3000); navigation[page] = true; }
      catch { navigation[page] = false; }
    }
    await sleep(80);
  }

  console.log(`SETUP ${name}`);
  const settingsChecks = await cdp.evaluate(`(() => {
    document.querySelector('[data-page="settings"]').click();
    document.querySelector('#openTechnicalSetup').click();
    const modal=document.querySelector('#modalRoot .modal-setup');
    const sql=modal?.querySelector('#setup-sql pre')?.textContent?.length||0;
    window.App.closeModal();
    return { modalOpened: !!modal, embeddedSqlChars: sql };
  })()`);

  await cdp.evaluate("document.querySelector('[data-page=\"dashboard\"]').click(); true");
  console.log(`MODAL SOLICITUD ${name}`);
  const requestModal = await cdp.evaluate(`(() => {
    const b=document.querySelector('[data-action="new-request"]'); if(!b)return false; b.click();
    const opened=!!document.querySelector('#modalRoot .modal'); window.App.closeModal(); return opened;
  })()`);

  await cdp.evaluate("document.querySelector('[data-page=\"dashboard\"]').click(); true");
  await sleep(700);
  await screenshot(cdp, new URL(`dashboard-${name}.png`, output));
  const adminUser = await cdp.evaluate("document.querySelector('#userName').textContent");

  // La vista «Solicitudes» pertenece al flujo de funcionario y se valida con su rol real.
  await cdp.evaluate("document.querySelector('#logoutBtn').click(); true");
  await waitFor(cdp, "!document.querySelector('#authView').classList.contains('hidden')", 'salida de administrador');
  await cdp.evaluate(`(() => {
    const email=document.querySelector('#loginEmail'), password=document.querySelector('#loginPassword');
    email.value='prueba.funcionario@prueba-essa.local'; password.value='Func#Prueba2026';
    email.dispatchEvent(new Event('input',{bubbles:true})); password.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#loginForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); return true;
  })()`);
  await waitFor(cdp, "!document.querySelector('#appView').classList.contains('hidden')", 'inicio de sesión de funcionario', 15000);
  await waitFor(cdp, "document.querySelector('#userName').textContent.includes('Prueba Funcionario')", 'perfil funcionario');
  await sleep(900);
  await cdp.evaluate("document.querySelector('[data-page=\"requests\"]').click(); true");
  await waitFor(cdp, "document.querySelector('#page-requests').classList.contains('active')", 'página de solicitudes del funcionario');
  const employeeState = await cdp.evaluate(`(() => {
    const user=document.querySelector('#userName').textContent;
    const b=document.querySelector('#page-requests [data-action="new-request"]') || document.querySelector('[data-action="new-request"]'); b?.click();
    return { user, requestsPage: document.querySelector('#page-requests').classList.contains('active') };
  })()`);
  let employeeModalOpened = false;
  try { await waitFor(cdp, "!!document.querySelector('#modalRoot .modal')", 'modal de nueva solicitud', 5000); employeeModalOpened = true; }
  catch {}
  if (employeeModalOpened) await cdp.evaluate("window.App.closeModal(); true");
  const employeeFlow = { ...employeeState, modalOpened: employeeModalOpened };

  const runtimeErrors = cdp.events.filter((event) =>
    event.method === 'Runtime.exceptionThrown' ||
    (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error' && !/cdn\.jsdelivr|fonts\.googleapis|fonts\.gstatic|favicon\.ico/.test(event.params.entry.url || ''))
  ).map((event) => event.params);

  const result = {
    name, url, loginReady, navigation, settingsChecks, requestModal, employeeFlow,
    appVisible: await cdp.evaluate("!document.querySelector('#appView').classList.contains('hidden')"),
    user: adminUser,
    runtimeErrors,
  };
  await cdp.evaluate("document.querySelector('#logoutBtn').click(); true");
  await waitFor(cdp, "!document.querySelector('#authView').classList.contains('hidden')", 'cierre de sesión');
  return result;
}

let exitCode = 0;
try {
  const targets = await waitForDebugger();
  const cdp = new Cdp(targets[0].webSocketDebuggerUrl);
  await cdp.open();
  await Promise.all(['Page.enable','Runtime.enable','Log.enable','Network.enable'].map((method) => cdp.send(method)));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const available = {
    original: process.env.ORIGINAL_URL || 'http://127.0.0.1:8080/Aplicativo_Gestion_Horas_Extra.html',
    migrated: process.env.MIGRATED_URL || 'http://127.0.0.1:5173/',
  };
  const requested = process.env.TEST_TARGET || 'migrated';
  if (!(requested in available)) throw new Error(`TEST_TARGET no válido: ${requested}`);
  const results = [await runFlow(cdp, requested, available[requested])];
  await writeFile(new URL(`functional-results-${requested}.json`, output), JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));

  for (const result of results) {
    const adminPagesOk = Object.entries(result.navigation).filter(([page]) => page !== 'requests').every(([, active]) => active);
    const employeeOk = result.employeeFlow.requestsPage && result.employeeFlow.modalOpened;
    const ok = result.appVisible && result.requestModal && result.settingsChecks.modalOpened && result.settingsChecks.embeddedSqlChars > 200000 && adminPagesOk && employeeOk && result.runtimeErrors.length === 0;
    console.log(`${ok ? 'OK' : 'FAIL'} ${result.name}: admin=${result.user}, funcionario=${result.employeeFlow.user}, SQL=${result.settingsChecks.embeddedSqlChars}, páginas admin=${Object.entries(result.navigation).filter(([p,v])=>p!=='requests'&&v).length}/7, solicitudes funcionario=${employeeOk?'OK':'FAIL'}, errores=${result.runtimeErrors.length}`);
    if (!ok) exitCode = 1;
  }
  cdp.close();
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  chrome.kill('SIGTERM');
  await sleep(500);
  try { await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 }); } catch {}
}
process.exitCode = exitCode;
