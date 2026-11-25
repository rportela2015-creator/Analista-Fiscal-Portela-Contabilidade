import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT_DIR = 'F:\\Workspace\\Apps\\Analista-Fiscal-Portela-Contabilidade';
const SCREENSHOT_DIR = join(ROOT_DIR, 'docs', 'ux-audit', 'screenshots', 'stitch-sync');
const OUTPUT_DATA_FILE = join(ROOT_DIR, 'docs', 'ux-audit', 'stitch-sync', 'stitch-sync-audit-results.json');

if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const TABS = [
  { id: 'empresas', name: '01_clientes_perfis', tabIndex: 0 },
  { id: 'classificar', name: '02_classificar', tabIndex: 1 },
  { id: 'lote', name: '03_lote', tabIndex: 2 },
  { id: 'auditoria-entrada', name: '04_auditoria_entrada', tabIndex: 5 },
  { id: 'precificar', name: '05_precificacao', tabIndex: 6 },
  { id: 'reforma', name: '06_reforma', tabIndex: 7 },
];

const RESOLUTIONS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 },
];

const NIVEIS = ['gerencial', 'operacional', 'senior'];

async function checkServerReady() {
  try {
    const res = await fetch('http://127.0.0.1:3000', { signal: AbortSignal.timeout(1500) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function main() {
  let nextProc = null;
  let chromeProc = null;
  let browserWs = null;
  const userDataDir = mkdtempSync(join(tmpdir(), 'chrome-stitch-sync-'));

  try {
    const isRunning = await checkServerReady();
    if (!isRunning) {
      console.log('Iniciando servidor Next.js em http://127.0.0.1:3000...');
      nextProc = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3000'], {
        cwd: ROOT_DIR,
        stdio: 'pipe',
      });
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 800));
        if (await checkServerReady()) {
          console.log('Servidor Next.js pronto.');
          break;
        }
      }
      if (!(await checkServerReady())) {
        throw new Error('Servidor Next.js não respondeu em http://127.0.0.1:3000');
      }
    } else {
      console.log('Servidor Next.js já estava ativo em http://127.0.0.1:3000.');
    }

    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const port = 9357;

    chromeProc = spawn(chromePath, [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
    ]);

    const browserWsUrl = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout aguardando Chrome DevTools')), 12000);
      chromeProc.stderr.on('data', (d) => {
        const msg = d.toString();
        const match = msg.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-f0-9-]+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]);
        }
      });
    });

    browserWs = new WebSocket(browserWsUrl);
    await new Promise((r) => browserWs.addEventListener('open', r));

    let reqId = 1;
    function browserSend(method, params = {}) {
      return new Promise((resolve, reject) => {
        const curId = reqId++;
        const handler = (evt) => {
          const data = JSON.parse(evt.data);
          if (data.id === curId) {
            browserWs.removeEventListener('message', handler);
            if (data.error) reject(data.error);
            else resolve(data.result);
          }
        };
        browserWs.addEventListener('message', handler);
        browserWs.send(JSON.stringify({ id: curId, method, params }));
      });
    }

    const { targetId } = await browserSend('Target.createTarget', { url: 'http://127.0.0.1:3000' });
    const { sessionId } = await browserSend('Target.attachToTarget', { targetId, flatten: true });

    const consoleErrors = [];
    const pageErrors = [];

    browserWs.addEventListener('message', (evt) => {
      const msg = JSON.parse(evt.data);
      if (msg.sessionId === sessionId && msg.method === 'Runtime.exceptionThrown') {
        pageErrors.push(msg.params?.exceptionDetails?.text || 'Runtime exception');
      }
      if (msg.sessionId === sessionId && msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
        consoleErrors.push(msg.params.args?.map((a) => a.value ?? a.description).join(' ') || 'console.error');
      }
    });

    function pageSend(method, params = {}) {
      return new Promise((resolve, reject) => {
        const curId = reqId++;
        const handler = (evt) => {
          const data = JSON.parse(evt.data);
          if (data.id === curId) {
            browserWs.removeEventListener('message', handler);
            if (data.error) reject(data.error);
            else resolve(data.result);
          }
        };
        browserWs.addEventListener('message', handler);
        browserWs.send(JSON.stringify({ id: curId, sessionId, method, params }));
      });
    }

    await pageSend('Page.enable');
    await pageSend('Runtime.enable');
    await new Promise((r) => setTimeout(r, 2200));

    const results = {
      timestamp: new Date().toISOString(),
      consoleErrors,
      pageErrors,
      sidebarTest: null,
      themeTest: null,
      resolutions: {},
    };

    // 1. Testar Sidebar recolhida vs expandida em 1920x1080
    await pageSend('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await new Promise((r) => setTimeout(r, 600));

    const sidebarTestEval = await pageSend('Runtime.evaluate', {
      expression: `(() => {
        const aside = document.getElementById('appSidebar');
        const toggle = document.getElementById('headerSidebarToggleBtn');
        const wAntes = aside ? Math.round(aside.getBoundingClientRect().width) : 0;
        if (toggle) toggle.click();
        return { wAntes, clicked: !!toggle };
      })()`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 400));

    const ssSidebarExp = await pageSend('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(SCREENSHOT_DIR, '1920x1080_sidebar_expandida.png'), Buffer.from(ssSidebarExp.data, 'base64'));

    const sidebarDepoisEval = await pageSend('Runtime.evaluate', {
      expression: `(() => {
        const aside = document.getElementById('appSidebar');
        const toggle = document.getElementById('headerSidebarToggleBtn');
        const wDepois = aside ? Math.round(aside.getBoundingClientRect().width) : 0;
        if (toggle) toggle.click(); // restaura recolhida
        return { wDepois };
      })()`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 400));

    results.sidebarTest = {
      recolhidaWidth: sidebarTestEval.result.value?.wAntes,
      expandidaWidth: sidebarDepoisEval.result.value?.wDepois,
    };

    // 2. Auditar resoluções, abas e níveis
    for (const res of RESOLUTIONS) {
      await pageSend('Emulation.setDeviceMetricsOverride', {
        width: res.width,
        height: res.height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await new Promise((r) => setTimeout(r, 400));

      results.resolutions[res.name] = { width: res.width, height: res.height, tabs: {} };

      for (const tabInfo of TABS) {
        await pageSend('Runtime.evaluate', {
          expression: `(() => {
            const btns = Array.from(document.querySelectorAll('nav.st-tabbar button[role="tab"]'));
            const btn = btns[${tabInfo.tabIndex}];
            if (btn) btn.click();
          })()`,
          returnByValue: true,
        });
        await new Promise((r) => setTimeout(r, 900));

        const tabMetrics = {};
        for (const nivel of NIVEIS) {
          await pageSend('Runtime.evaluate', {
            expression: `(() => {
              const radio = document.querySelector('[role="radio"][data-nivel="${nivel}"]');
              if (radio) radio.click();
            })()`,
            returnByValue: true,
          });
          await new Promise((r) => setTimeout(r, 500));

          if (nivel === 'operacional' || (res.name === '1920x1080' && (tabInfo.id === 'precificar' || tabInfo.id === 'auditoria-entrada'))) {
            const ss = await pageSend('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            const fname = `${res.name}_${tabInfo.name}_${nivel}.png`;
            writeFileSync(join(SCREENSHOT_DIR, fname), Buffer.from(ss.data, 'base64'));
          }

          if (nivel === 'operacional') {
            const domEval = await pageSend('Runtime.evaluate', {
              expression: `(() => {
                const header = document.querySelector('header.st-topbar');
                const headerRect = header ? header.getBoundingClientRect() : { height: 0 };
                const aside = document.getElementById('appSidebar');
                const asideRect = aside ? aside.getBoundingClientRect() : { width: 0 };
                const kpiCards = Array.from(document.querySelectorAll('.st-kpi-card'));
                const kpiTops = kpiCards.map(c => Math.round(c.getBoundingClientRect().top));
                const kpiSameRow = kpiTops.length === 4 ? new Set(kpiTops).size === 1 : null;
                const stickyBar = document.querySelector('[data-testid="sticky-action-bar"]');
                const stickyRect = stickyBar ? stickyBar.getBoundingClientRect() : null;
                const interactives = Array.from(document.querySelectorAll('button, [role="radio"], [role="tab"]'));
                const below36 = interactives.filter(el => {
                  const r = el.getBoundingClientRect();
                  return r.width > 0 && r.height > 0 && r.height < 36;
                }).length;
                const tabularCount = document.querySelectorAll('.tabular-nums').length;
                const ariaLiveCount = document.querySelectorAll('[aria-live="polite"]').length;
                const docWidth = document.documentElement.scrollWidth;
                const winWidth = window.innerWidth;
                const theme = document.documentElement.getAttribute('data-theme');
                return {
                  theme,
                  headerHeight: Math.round(headerRect.height),
                  sidebarWidth: Math.round(asideRect.width),
                  kpiCount: kpiCards.length,
                  kpiSameRow4Cols: kpiSameRow,
                  stickyBarPresent: !!stickyBar,
                  stickyBarTop: stickyRect ? Math.round(stickyRect.top) : null,
                  below36pxTargets: below36,
                  tabularNumsCount: tabularCount,
                  ariaLiveCount,
                  docWidth,
                  winWidth,
                  hasHorizontalOverflow: docWidth > winWidth + 2,
                };
              })()`,
              returnByValue: true,
            });
            tabMetrics[nivel] = domEval.result.value;
          }
        }
        results.resolutions[res.name].tabs[tabInfo.id] = tabMetrics;
      }
    }

    // 3. Testar alternância Heritage Light em Precificação 1920x1080
    await pageSend('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await pageSend('Runtime.evaluate', {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('nav.st-tabbar button[role="tab"]'));
        if (btns[6]) btns[6].click();
        const themeBtn = document.querySelector('button.st-theme-btn');
        if (themeBtn) themeBtn.click();
      })()`,
      returnByValue: true,
    });
    await new Promise((r) => setTimeout(r, 800));
    const ssLight = await pageSend('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(join(SCREENSHOT_DIR, '1920x1080_05_precificacao_heritage_light.png'), Buffer.from(ssLight.data, 'base64'));
    const themeCheck = await pageSend('Runtime.evaluate', {
      expression: `document.documentElement.getAttribute('data-theme')`,
      returnByValue: true,
    });
    results.themeTest = { toggledTo: themeCheck.result.value };

    writeFileSync(OUTPUT_DATA_FILE, JSON.stringify(results, null, 2), 'utf8');
    console.log('Auditoria Stitch Sync concluída! Resultados salvos em:', OUTPUT_DATA_FILE);
  } finally {
    if (browserWs) browserWs.close();
    if (chromeProc) chromeProc.kill('SIGTERM');
    if (nextProc) nextProc.kill('SIGTERM');
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
}

main().catch((err) => {
  console.error('Erro na auditoria Stitch Sync:', err);
  process.exit(1);
});
