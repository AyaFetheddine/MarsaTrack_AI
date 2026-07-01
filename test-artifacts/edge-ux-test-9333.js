const fs = require('fs');
const path = require('path');
const mysql = require(path.join(process.cwd(), 'backend', 'node_modules', 'mysql2', 'promise'));

const envPath = path.join(process.cwd(), 'backend', '.env');
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const trimmedLine = line.trim();
  if (!trimmedLine || trimmedLine.startsWith('#')) continue;
  const separatorIndex = trimmedLine.indexOf('=');
  if (separatorIndex === -1) continue;
  const key = trimmedLine.slice(0, separatorIndex).trim();
  const value = trimmedLine.slice(separatorIndex + 1).trim();
  process.env[key] = value;
}

const baseUrl = 'http://localhost:5173';
const cdpBase = 'http://127.0.0.1:9333';
const shotDir = path.join(process.cwd(), 'test-artifacts', 'ux-role-test');
const password = '***REDACTED-TEST-PASSWORD***';
const createdMatricules = [];
const report = [];

fs.mkdirSync(shotDir, { recursive: true });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeText(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function hasText(text, expected) {
  return normalizeText(text).includes(normalizeText(expected));
}

async function cdpJson(pathname, init) {
  const response = await fetch(`${cdpBase}${pathname}`, init);
  if (!response.ok) throw new Error(`${pathname} -> ${response.status}`);
  return response.json();
}

class CdpPage {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });

    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result || {});
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async eval(expression, awaitPromise = false) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Runtime exception');
    }

    return result.result?.value;
  }

  async navigate(url) {
    await this.send('Page.navigate', { url });
    await wait(900);
  }

  async screenshot(name) {
    await this.send('Page.bringToFront');
    await wait(200);
    const result = await this.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
    });
    const file = path.join(shotDir, name);
    fs.writeFileSync(file, Buffer.from(result.data, 'base64'));
    return file;
  }

  close() {
    this.ws.close();
  }
}

async function setValue(page, selector, value) {
  await page.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('Element introuvable: ${selector}');
    const setter = Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

async function click(page, selector) {
  await page.eval(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) throw new Error('Element introuvable: ${selector}');
    el.click();
  })()`);
  await wait(500);
}

async function login(page, matricule) {
  await page.navigate(`${baseUrl}/login`);
  await setValue(page, 'input[name="matricule"]', matricule);
  await setValue(page, 'input[name="password"]', password);
  await click(page, 'button[type="submit"]');
  await wait(1200);
  const data = await page.eval(`({ path: location.pathname, body: document.body.innerText })`);
  if (!data.path.includes('/dashboard')) {
    throw new Error(`Login ${matricule} non redirige vers dashboard`);
  }
}

async function logout(page) {
  await page.eval('localStorage.clear()');
}

async function testRE(page) {
  await login(page, 'RE-001');
  await page.navigate(`${baseUrl}/personnel`);
  await wait(800);
  let text = await page.eval('document.body.innerText');
  if (!text.includes('Ajouter du personnel')) throw new Error('RE: formulaire ajout personnel absent');
  if (!text.includes('Personnel affectable')) throw new Error('RE: table personnel absente');

  const uniqueMatricule = `UX-${Date.now()}`;
  createdMatricules.push(uniqueMatricule);
  await setValue(page, 'input[name="matricule"]', uniqueMatricule);
  await setValue(page, 'input[name="nom_complet"]', 'UX Personnel Test');
  await page.eval(`(() => {
    const select = document.querySelector('select[name="fonction"]');
    select.value = 'Autre';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await click(page, 'button[type="submit"]');
  await wait(700);
  text = await page.eval('document.body.innerText');
  if (!text.includes('Personnel ajoute avec succes')) {
    throw new Error('RE: message succes ajout personnel absent');
  }
  const successShot = await page.screenshot('01-re-personnel-success.png');
  await wait(5200);
  text = await page.eval('document.body.innerText');
  if (hasText(text, 'Personnel ajoute avec succes')) {
    throw new Error('RE: message succes personnel non masque apres 5s');
  }

  await setValue(page, '#personnel-search', uniqueMatricule);
  await wait(400);
  text = await page.eval('document.body.innerText');
  if (!hasText(text, uniqueMatricule) || !hasText(text, '1 resultat')) {
    throw new Error('RE: recherche personnel ne filtre pas correctement');
  }
  const filterShot = await page.screenshot('02-re-personnel-filter.png');

  await page.navigate(`${baseUrl}/operations`);
  await wait(900);
  text = await page.eval('document.body.innerText');
  if (!hasText(text, 'Personnel selectionne') || !hasText(text, 'Recherche')) {
    throw new Error('RE: nouveau selecteur personnel absent');
  }
  await setValue(page, '#operation-personnel-search', 'Portiqueur');
  await wait(300);
  await click(page, 'input[type="checkbox"]');
  text = await page.eval('document.body.innerText');
  if (!hasText(text, 'Portiqueur Test - PQ-001 - Portiqueur')) {
    throw new Error('RE: personnel selectionne non visible');
  }
  await setValue(page, '#operation-personnel-search', 'Conducteur');
  await wait(300);
  text = await page.eval('document.body.innerText');
  if (!hasText(text, 'Portiqueur Test - PQ-001 - Portiqueur')) {
    throw new Error('RE: selection perdue apres recherche');
  }
  const opSelectShot = await page.screenshot('03-re-operations-selection-persist.png');

  await click(page, 'button[title="Retirer"]');
  await wait(300);
  text = await page.eval('document.body.innerText');
  if (!hasText(text, 'Votre selection est vide')) {
    throw new Error('RE: bouton retirer ne vide pas la selection');
  }

  report.push({
    account: 'RE-001',
    status: 'OK',
    checked: [
      'ajout personnel',
      'auto-disparition message succes',
      'recherche Personnel',
      'selection persistante Operations',
      'retrait selection',
    ],
    shots: [successShot, filterShot, opSelectShot],
  });
  await logout(page);
}

async function testRoleSmoke(page, matricule, expectations) {
  await login(page, matricule);
  for (const item of expectations) {
    await page.navigate(`${baseUrl}${item.path}`);
    await wait(700);
    const text = await page.eval('document.body.innerText');
    for (const expected of item.includes || []) {
      if (!hasText(text, expected)) {
        throw new Error(`${matricule}: ${item.path} ne contient pas ${expected}`);
      }
    }
    for (const forbidden of item.excludes || []) {
      if (hasText(text, forbidden)) {
        throw new Error(`${matricule}: ${item.path} contient ${forbidden}`);
      }
    }
  }
  const shot = await page.screenshot(`${matricule.toLowerCase()}-smoke.png`);
  report.push({ account: matricule, status: 'OK', checked: expectations.map((item) => item.path), shots: [shot] });
  await logout(page);
}

async function cleanup() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  for (const matricule of createdMatricules) {
    await db.query('DELETE FROM personnel WHERE matricule = ?', [matricule]);
  }

  await db.end();
}

(async () => {
  const target = await cdpJson('/json/new?about:blank', { method: 'PUT' });
  const page = new CdpPage(target.webSocketDebuggerUrl);
  await page.open();
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 950,
    deviceScaleFactor: 1,
    mobile: false,
  });

  try {
    await testRE(page);
    await testRoleSmoke(page, 'ADM-001', [
      { path: '/personnel', includes: ['Ajouter du personnel', 'Recherche'] },
      { path: '/operations', includes: ['Personnel selectionne', 'Recherche'] },
    ]);
    await testRoleSmoke(page, 'CE-001', [
      { path: '/arrets', includes: ['Declarer un arret', 'Historique des arrets'] },
      { path: '/personnel', includes: ['Consultation uniquement', 'Recherche'], excludes: ['Ajouter du personnel'] },
    ]);
    await testRoleSmoke(page, 'CS-001', [
      { path: '/operations', includes: ['Consultation uniquement', 'Liste des operations'] },
      { path: '/containers', includes: ['Consultation uniquement', 'Historique des conteneurs'] },
    ]);
    await testRoleSmoke(page, 'PQ-001', [
      { path: '/containers', includes: ['Saisir un conteneur', 'Historique des conteneurs'] },
      { path: '/operations', includes: ['Consultation uniquement', 'Liste des operations'] },
    ]);
    console.log(JSON.stringify({ ok: true, report }, null, 2));
  } catch (error) {
    const failureShot = await page.screenshot('failure-state.png').catch(() => null);
    if (failureShot) report.push({ account: 'FAILURE', status: 'KO', shots: [failureShot] });
    throw error;
  } finally {
    await cleanup();
    page.close();
  }
})().catch(async (error) => {
  await cleanup().catch(() => {});
  console.error(JSON.stringify({ ok: false, error: error.message, report }, null, 2));
  process.exit(1);
});
