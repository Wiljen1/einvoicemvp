#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { mkdir, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const DEBUG_URL = process.env.APEX_CHROME_DEBUG_URL || 'http://127.0.0.1:9222';
const HOST_MATCH = process.env.APEX_HOST_MATCH || 'apex.oraclecorp.com';
const DEFAULT_APP_ID = process.env.APEX_APP_ID || '56594';
const SQL_WAIT_MS = Number(process.env.APEX_SQL_WAIT_MS || 6000);
const DEFAULT_DOWNLOAD_DIR = process.env.APEX_EXPORT_DOWNLOAD_DIR || 'apex/exports/browser';
const DEFAULT_EXTRACT_DIR = process.env.APEX_EXPORT_EXTRACT_DIR || 'apex/apps';

function usage() {
  console.error(`Usage:
  node scripts/apex-chrome-connection.mjs check
  node scripts/apex-chrome-connection.mjs sql <file.sql|->
  node scripts/apex-chrome-connection.mjs open-app [application_id]
  node scripts/apex-chrome-connection.mjs export-app [application_id] [extract_dir]
  node scripts/apex-chrome-connection.mjs open-import

Environment:
  APEX_CHROME_DEBUG_URL  Default: http://127.0.0.1:9222
  APEX_HOST_MATCH        Default: apex.oraclecorp.com
  APEX_APP_ID            Default: 56594
  APEX_SQL_WAIT_MS       Default: 6000
  APEX_EXPORT_DOWNLOAD_DIR Default: apex/exports/browser
  APEX_EXPORT_EXTRACT_DIR  Default: apex/apps`);
}

async function fetchJson(path) {
  const url = `${DEBUG_URL.replace(/\/$/, '')}${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Chrome debug endpoint returned ${response.status} for ${url}`);
  }
  return response.json();
}

async function getBrowserVersion() {
  return fetchJson('/json/version');
}

async function listTargets() {
  return fetchJson('/json/list');
}

function isApexTarget(target) {
  return target.type === 'page' && target.url && target.url.includes(HOST_MATCH);
}

async function findApexTarget() {
  const targets = await listTargets();
  const apexTargets = targets.filter(isApexTarget);
  if (apexTargets.length === 0) {
    throw new Error(`No open APEX tab found for host match "${HOST_MATCH}". Keep the logged-in Chrome tab open.`);
  }

  return (
    apexTargets.find((target) => target.url.includes('/app-builder/')) ||
    apexTargets.find((target) => target.url.includes('/sql-workshop/')) ||
    apexTargets[0]
  );
}

class CdpTab {
  constructor(webSocketDebuggerUrl) {
    this.webSocketDebuggerUrl = webSocketDebuggerUrl;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.webSocketDebuggerUrl);
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !this.pending.has(message.id)) {
        return;
      }

      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
    };

    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    await this.send('Runtime.enable');
    await this.send('Page.enable');
  }

  close() {
    this.ws?.close();
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async bringToFront() {
    await this.send('Page.bringToFront');
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Evaluation failed');
    }

    return result.result?.value;
  }

  async state() {
    const value = await this.evaluate(`JSON.stringify({
      title: document.title,
      href: location.href,
      text: document.body?.innerText?.slice(0, 2000) || '',
      workspaceSchema: document.querySelector('#P1003_SCHEMA')?.value || null
    })`);
    return JSON.parse(value);
  }

  async navigate(url, waitMs = 3000) {
    await this.send('Page.navigate', { url });
    await sleep(waitMs);
  }
}

class CdpBrowser {
  constructor(webSocketDebuggerUrl) {
    this.webSocketDebuggerUrl = webSocketDebuggerUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.downloads = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.webSocketDebuggerUrl);
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          reject(new Error(JSON.stringify(message.error)));
        } else {
          resolve(message.result);
        }
        return;
      }

      if (message.method === 'Browser.downloadWillBegin') {
        this.downloads.set(message.params.guid, {
          guid: message.params.guid,
          suggestedFilename: message.params.suggestedFilename,
          url: message.params.url,
          state: 'inProgress',
        });
      }

      if (message.method === 'Browser.downloadProgress') {
        const prior = this.downloads.get(message.params.guid) || { guid: message.params.guid };
        this.downloads.set(message.params.guid, {
          ...prior,
          state: message.params.state,
          totalBytes: message.params.totalBytes,
          receivedBytes: message.params.receivedBytes,
          filePath: message.params.filePath || prior.filePath,
        });
      }
    };

    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
  }

  close() {
    this.ws?.close();
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async allowDownloads(downloadPath) {
    await this.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath,
      eventsEnabled: true,
    });
  }

  completedDownload() {
    return Array.from(this.downloads.values()).find((download) => download.state === 'completed');
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apexUrlFor(currentHref, route, params = {}) {
  const url = new URL(currentHref);
  const apexPrefix = url.pathname.includes('/r/apex/')
    ? url.pathname.slice(0, url.pathname.indexOf('/r/apex/'))
    : '/pls/apex';
  const session = url.searchParams.get('session');
  const nextUrl = new URL(`${url.origin}${apexPrefix}${route}`);
  if (session) {
    nextUrl.searchParams.set('session', session);
  }
  for (const [key, value] of Object.entries(params)) {
    nextUrl.searchParams.set(key, value);
  }
  return nextUrl.toString();
}

async function ensureSqlCommands(tab) {
  const current = await tab.state();
  if (current.href.includes('/sql-workshop/sqlcommandprocessor')) {
    return current;
  }

  const sqlCommandsHref = await tab.evaluate(`Array.from(document.querySelectorAll('a'))
    .find((anchor) => /sqlcommandprocessor/.test(anchor.href))?.href || ''`);

  const targetUrl = sqlCommandsHref || apexUrlFor(current.href, '/r/apex/sql-workshop/sqlcommandprocessor');
  await tab.navigate(targetUrl, 3500);
  return tab.state();
}

async function runSql(tab, sqlText) {
  await ensureSqlCommands(tab);

  const runResult = await tab.evaluate(`(() => {
    const sql = ${JSON.stringify(sqlText.trim())};
    if (!sql) {
      return JSON.stringify({ ok: false, reason: 'SQL input is empty' });
    }

    if (window.apex?.item) {
      apex.item('P1003_SQL_COMMAND1').setValue(sql);
      apex.item('P1003_SQL_COMMAND2').setValue(sql);
    }

    for (const selector of ['#P1003_SQL_COMMAND1', '#P1003_SQL_COMMAND2']) {
      const field = document.querySelector(selector);
      if (field) {
        field.value = sql;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const runButton = document.querySelector('#B10644629905348428');
    if (!runButton) {
      return JSON.stringify({ ok: false, reason: 'Run button not found on SQL Commands page' });
    }

    runButton.click();
    return JSON.stringify({ ok: true });
  })()`);

  const parsedRunResult = JSON.parse(runResult);
  if (!parsedRunResult.ok) {
    throw new Error(parsedRunResult.reason);
  }

  await sleep(SQL_WAIT_MS);

  const rawResult = await tab.evaluate(`JSON.stringify({
    title: document.title,
    href: location.href,
    bodyText: document.body?.innerText || '',
    resultBlocks: Array.from(document.querySelectorAll('table, .a-IRR-table, .t-Report-report, pre, code'))
      .map((element) => element.innerText.trim())
      .filter(Boolean)
      .slice(0, 20)
  })`);
  const result = JSON.parse(rawResult);
  const hasError = /(ORA-|PLS-|SP2-|Error at line|Query cannot be parsed)/i.test(result.bodyText);

  return {
    ok: !hasError,
    title: result.title,
    href: result.href,
    resultBlocks: result.resultBlocks,
    textPreview: result.bodyText.slice(0, 4000),
  };
}

async function openApp(tab, appId) {
  const current = await tab.state();
  const url = apexUrlFor(current.href, '/r/apex/app-builder/home', {
    fb_flow_id: appId,
    f4000_p1_flow: appId,
    p0_flowpage: appId,
    clear: 'RP',
  });
  await tab.navigate(url, 3500);
  return tab.state();
}

async function openImport(tab) {
  const current = await tab.state();
  const url = apexUrlFor(current.href, '/r/apex/app-builder/import', {
    p460_file_type: 'FLOW_EXPORT',
    clear: '460',
  });
  await tab.navigate(url, 3500);
  return tab.state();
}

async function exportApp(tab, appId, extractDir) {
  const browserVersion = await getBrowserVersion();
  const browser = new CdpBrowser(browserVersion.webSocketDebuggerUrl);
  const downloadDir = path.resolve(DEFAULT_DOWNLOAD_DIR);
  await mkdir(downloadDir, { recursive: true });

  await browser.connect();
  try {
    await browser.allowDownloads(downloadDir);

    const current = await tab.state();
    const exportUrl = apexUrlFor(current.href, '/r/apex/app-builder/exportapp', {
      fb_flow_id: '',
      fb_flow_page_id: '',
      clear: '4900',
    });
    await tab.navigate(exportUrl, 3500);

    const prepareResult = JSON.parse(await tab.evaluate(`(() => {
      const appId = ${JSON.stringify(appId)};
      const setValue = (id, value) => {
        const element = document.getElementById(id);
        if (!element) {
          return false;
        }
        element.value = value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };

      const selected = setValue('FB_FB_EXPORT_FLOW_ID', appId);
      if (window.apex?.item) {
        apex.item('FB_FB_EXPORT_FLOW_ID').setValue(appId);
      }

      const apexLang = document.getElementById('P4900_TYPE_1');
      if (apexLang && !apexLang.checked) {
        apexLang.click();
      }

      const standardExport = document.getElementById('P4900_EXPORT_MODE_0');
      if (standardExport && !standardExport.checked) {
        standardExport.click();
      }

      const split = document.getElementById('P4900_SPLIT');
      if (split && !split.checked) {
        split.click();
      }

      const exportButton = document.getElementById('B6923471041');
      return JSON.stringify({
        ok: selected && Boolean(exportButton),
        selected,
        hasExportButton: Boolean(exportButton)
      });
    })()`));

    if (!prepareResult.ok) {
      throw new Error(`Export page was not ready: ${JSON.stringify(prepareResult)}`);
    }

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      await tab.evaluate(`document.getElementById('B6923471041')?.click()`);
      const download = await waitForDownload(browser, attempt === 1 ? 7000 : 45000);
      if (download?.filePath) {
        const extractedTo = extractDir
          ? await extractZip(download.filePath, path.resolve(extractDir))
          : null;
        return {
          ok: true,
          appId,
          format: 'APEXLANG',
          split: true,
          downloadedTo: download.filePath,
          extractedTo,
        };
      }
    }

    throw new Error('APEX export did not produce a download.');
  } finally {
    browser.close();
  }
}

async function waitForDownload(browser, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const completed = browser.completedDownload();
    if (completed) {
      return completed;
    }
    await sleep(250);
  }
  return null;
}

async function extractZip(zipPath, extractDir) {
  await rm(extractDir, { recursive: true, force: true });
  await mkdir(extractDir, { recursive: true });
  await runCommand('unzip', ['-q', zipPath, '-d', extractDir]);
  return extractDir;
}

async function runCommand(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
  });
}

async function readSqlInput(inputPath) {
  if (!inputPath) {
    throw new Error('Missing SQL input path. Pass a .sql file or - for stdin.');
  }
  if (inputPath === '-') {
    return new Promise((resolve, reject) => {
      let text = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => {
        text += chunk;
      });
      process.stdin.on('end', () => resolve(text));
      process.stdin.on('error', reject);
    });
  }
  return readFile(inputPath, 'utf8');
}

async function withApexTab(callback) {
  const target = await findApexTarget();
  const tab = new CdpTab(target.webSocketDebuggerUrl);
  await tab.connect();
  try {
    await tab.bringToFront();
    return await callback(tab, target);
  } finally {
    tab.close();
  }
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help') {
    usage();
    return;
  }

  if (command === 'check') {
    const browser = await getBrowserVersion();
    const targets = await listTargets();
    const result = await withApexTab(async (tab, target) => ({
      debugUrl: DEBUG_URL,
      browser: browser.Browser,
      apexTarget: {
        id: target.id,
        title: target.title,
        url: target.url,
      },
      pageState: await tab.state(),
      detectedTargets: targets
        .filter((target) => target.type === 'page')
        .map((target) => ({ title: target.title, url: target.url })),
    }));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'sql') {
    const sqlText = await readSqlInput(arg);
    const result = await withApexTab((tab) => runSql(tab, sqlText));
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === 'open-app') {
    const result = await withApexTab((tab) => openApp(tab, arg || DEFAULT_APP_ID));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'export-app') {
    const appId = arg || DEFAULT_APP_ID;
    const extractDir = process.argv[4] || path.join(DEFAULT_EXTRACT_DIR, `f${appId}`);
    const result = await withApexTab((tab) => exportApp(tab, appId, extractDir));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (command === 'open-import') {
    const result = await withApexTab((tab) => openImport(tab));
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
