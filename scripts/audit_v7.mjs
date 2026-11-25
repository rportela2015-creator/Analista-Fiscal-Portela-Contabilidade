import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCREENSHOT_DIR = 'F:\\Workspace\\Apps\\Analista-Fiscal-Portela-Contabilidade\\docs\\ux-audit\\screenshots\\v7';
const OUTPUT_DATA_FILE = 'F:\\Workspace\\Apps\\Analista-Fiscal-Portela-Contabilidade\\docs\\ux-audit\\v7-audit-results.json';

if (!existsSync(SCREENSHOT_DIR)) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const TABS = [
  { id: 'empresas', name: '01_clientes_perfis', title: '0 · Clientes & Perfis', tabIndex: 0 },
  { id: 'auditoria-entrada', name: '02_auditoria_entrada', title: '5 · Auditoria (Entrada)', tabIndex: 5 },
  { id: 'precificar', name: '03_precificacao', title: '6 · Precificação & Margens', tabIndex: 6 },
  { id: 'classificar', name: '04_classificar', title: '1 · Classificar produto', tabIndex: 1 },
  { id: 'lote', name: '05_lote', title: '2 · Lote (CSV)', tabIndex: 2 },
  { id: 'reforma', name: '06_reforma', title: '7 · Reforma (IBS/CBS/IS)', tabIndex: 7 }
];

const RESOLUTIONS = [
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '1366x768', width: 1366, height: 768 }
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
  const isRunning = await checkServerReady();
  if (!isRunning) {
    console.log('Starting Next.js production server on port 3000...');
    nextProc = spawn('node', ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3000'], {
      cwd: 'F:\\Workspace\\Apps\\Analista-Fiscal-Portela-Contabilidade',
      stdio: 'pipe'
    });
    // Wait for server to respond
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      if (await checkServerReady()) {
        console.log('Next.js server is ready!');
        break;
      }
    }
  } else {
    console.log('Next.js server is already running on port 3000.');
  }

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const userDataDir = mkdtempSync(join(tmpdir(), 'chrome-v7-audit-'));
  const port = 9345;

  console.log(`Starting Chrome Headless on port ${port}...`);
  const chromeProc = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check'
  ]);

  let browserWsUrl = null;
  await new Promise((resolve, reject) => {
    chromeProc.stderr.on('data', (d) => {
      const msg = d.toString();
      const match = msg.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-f0-9-]+)/);
      if (match) {
        browserWsUrl = match[1];
        resolve();
      }
    });
    setTimeout(() => reject(new Error('Timeout waiting for Chrome DevTools listening')), 12000);
  });

  console.log('Connected to Chrome DevTools at', browserWsUrl);
  const browserWs = new WebSocket(browserWsUrl);
  await new Promise(r => browserWs.addEventListener('open', r));

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
  await pageSend('Performance.enable');

  // Wait for initial load
  await new Promise(r => setTimeout(r, 2000));

  const results = {
    timestamp: new Date().toISOString(),
    resolutions: {}
  };

  for (const res of RESOLUTIONS) {
    console.log(`\n======================================================`);
    console.log(`AUDITING RESOLUTION: ${res.name} (${res.width}x${res.height})`);
    console.log(`======================================================`);

    results.resolutions[res.name] = {
      width: res.width,
      height: res.height,
      tabs: {}
    };

    await pageSend('Emulation.setDeviceMetricsOverride', {
      width: res.width,
      height: res.height,
      deviceScaleFactor: 1,
      mobile: false
    });

    for (const tabInfo of TABS) {
      console.log(`\n--- Tab: ${tabInfo.title} (${tabInfo.id}) ---`);

      // Switch tab
      await pageSend('Runtime.evaluate', {
        expression: `(() => {
          const btns = Array.from(document.querySelectorAll('nav.tabs button'));
          const btn = btns[${tabInfo.tabIndex}];
          if (btn) btn.click();
        })()`,
        returnByValue: true
      });
      await new Promise(r => setTimeout(r, 1200));

      const tabMetrics = {};

      for (const nivel of NIVEIS) {
        // Set nivel operacional via radio button click
        await pageSend('Runtime.evaluate', {
          expression: `(() => {
            const radio = document.querySelector('[role="radio"][data-nivel="${nivel}"]') ||
                          Array.from(document.querySelectorAll('[role="radio"]')).find(el => el.textContent.toLowerCase().includes('${nivel}'));
            if (radio) radio.click();
          })()`,
          returnByValue: true
        });
        await new Promise(r => setTimeout(r, 800));

        // Capture screenshot
        const ssViewport = await pageSend('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: false
        });
        const vpFilename = `${res.name}_${tabInfo.name}_${nivel}.png`;
        const vpPath = join(SCREENSHOT_DIR, vpFilename);
        writeFileSync(vpPath, Buffer.from(ssViewport.data, 'base64'));
        console.log(`Saved screenshot: ${vpFilename}`);

        // If 'operacional', collect deep DOM metrics
        if (nivel === 'operacional') {
          const domAudit = await pageSend('Runtime.evaluate', {
            expression: `(() => {
              const header = document.querySelector('header');
              const headerRect = header ? header.getBoundingClientRect() : { height: 0, top: 0, bottom: 0 };
              
              const switcher = document.querySelector('[role="radiogroup"]');
              const switcherRect = switcher ? switcher.getBoundingClientRect() : null;

              // Check CTA primary
              const ctas = Array.from(document.querySelectorAll('button')).filter(b => {
                const text = (b.textContent || '').trim();
                const cls = b.className || '';
                return cls.includes('bg-accent') || cls.includes('primary') || b.getAttribute('data-primary-cta') === 'true' ||
                       /salvar|auditar|executar|classificar|processar|calcular|exportar/i.test(text);
              });

              const primaryCta = ctas[0];
              const ctaRect = primaryCta ? primaryCta.getBoundingClientRect() : null;

              // Check aria-live elements
              const ariaLiveElements = Array.from(document.querySelectorAll('[aria-live]')).map(el => ({
                tag: el.tagName.toLowerCase(),
                ariaLive: el.getAttribute('aria-live'),
                id: el.id || null,
                role: el.getAttribute('role') || null,
                className: el.className
              }));

              // Check radiogroup & radios
              const radiogroups = Array.from(document.querySelectorAll('[role="radiogroup"]')).map(rg => ({
                label: rg.getAttribute('aria-label'),
                radios: Array.from(rg.querySelectorAll('[role="radio"]')).map(r => ({
                  text: r.textContent.trim(),
                  checked: r.getAttribute('aria-checked'),
                  height: r.getBoundingClientRect().height,
                  width: r.getBoundingClientRect().width
                }))
              }));

              // Check interactive target sizes
              const interactiveElements = Array.from(document.querySelectorAll('button, [role="button"], [role="radio"], select, input, a'));
              const targetsBelow44px = interactiveElements.filter(el => {
                const rect = el.getBoundingClientRect();
                return (rect.width > 0 && rect.height > 0) && (rect.height < 36 || rect.width < 36);
              }).length;

              // Check tabular-nums
              const tabularNumsCount = Array.from(document.querySelectorAll('*')).filter(el => {
                const cs = window.getComputedStyle(el);
                return cs.fontVariantNumeric.includes('tabular-nums') || el.className.includes('tabular-nums') || el.className.includes('num');
              }).length;

              // Check horizontal overflow
              const docWidth = document.documentElement.scrollWidth;
              const winWidth = window.innerWidth;
              const hasHorizontalOverflow = docWidth > winWidth + 2;

              // Check DOM node count
              const domNodeCount = document.getElementsByTagName('*').length;

              // Sticky action bar
              const stickyBar = document.querySelector('[data-testid="sticky-action-bar"]') || document.querySelector('.sticky.bottom-0');
              const stickyRect = stickyBar ? stickyBar.getBoundingClientRect() : null;

              return {
                headerHeight: Math.round(headerRect.height),
                headerBottom: Math.round(headerRect.bottom),
                hasSwitcher: !!switcher,
                primaryCta: primaryCta ? {
                  text: primaryCta.textContent.trim().slice(0, 40),
                  top: Math.round(ctaRect.top),
                  visibleInFirstFold: ctaRect.top < window.innerHeight && ctaRect.bottom > 0,
                  height: Math.round(ctaRect.height),
                  width: Math.round(ctaRect.width)
                } : null,
                stickyBarPresent: !!stickyBar,
                stickyBarTop: stickyRect ? Math.round(stickyRect.top) : null,
                ariaLiveCount: ariaLiveElements.length,
                ariaLiveElements,
                radiogroups,
                totalInteractives: interactiveElements.length,
                targetsBelow44px,
                tabularNumsCount,
                domNodeCount,
                docWidth,
                winWidth,
                hasHorizontalOverflow
              };
            })()`,
            returnByValue: true
          });

          tabMetrics[nivel] = domAudit.result.value;
          console.log(`Tab ${tabInfo.id} [${nivel}]: Header height: ${domAudit.result.value?.headerHeight}px, CTA visible fold: ${domAudit.result.value?.primaryCta?.visibleInFirstFold}, CTA top: ${domAudit.result.value?.primaryCta?.top}px, Nodes: ${domAudit.result.value?.domNodeCount}`);
        }
      }

      results.resolutions[res.name].tabs[tabInfo.id] = tabMetrics;
    }
  }

  // Performance metrics (LCP, CLS, FID)
  const perfEval = await pageSend('Runtime.evaluate', {
    expression: `(() => {
      const perfEntries = performance.getEntriesByType('navigation');
      const navTiming = perfEntries[0] || {};
      const paintEntries = performance.getEntriesByType('paint');
      const fcp = paintEntries.find(p => p.name === 'first-contentful-paint')?.startTime || null;

      return {
        loadTime: Math.round(navTiming.loadEventEnd - navTiming.startTime),
        domInteractive: Math.round(navTiming.domInteractive - navTiming.startTime),
        fcp: fcp ? Math.round(fcp) : null
      };
    })()`,
    returnByValue: true
  });
  results.performance = perfEval.result.value;

  writeFileSync(OUTPUT_DATA_FILE, JSON.stringify(results, null, 2), 'utf-8');
  console.log(`\nAudit results successfully saved to ${OUTPUT_DATA_FILE}`);

  // Cleanup
  console.log('Cleaning up processes...');
  browserWs.close();
  chromeProc.kill('SIGTERM');
  if (nextProc) {
    nextProc.kill('SIGTERM');
  }
  console.log('Done!');
}

main().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
