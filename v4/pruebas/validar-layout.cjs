// Sin dependencias: servidor local + Edge o Chrome headless mediante Chrome DevTools Protocol (Node 22+).
// Ejecutar desde la raíz: node v4/pruebas/validar-layout.cjs
// Otro navegador: NAVEGADOR="/ruta/al/ejecutable" node v4/pruebas/validar-layout.cjs
// Tras la R3, los botones de región van sobre el mapa: se compara la geometría de mapa, eje, panel y vista,
// pero ya no la de .acercar (se movió a propósito).
const fs = require('fs'), os = require('os'), path = require('path');
const http = require('http'), { spawn } = require('child_process');
const root = process.cwd();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'infovis-layout-'));
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
let browser, ws;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const navegador = process.env.NAVEGADOR || ({
    win32: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  })[process.platform] || 'google-chrome';
  browser = spawn(navegador, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--user-data-dir=' + profile,
  ], { windowsHide: true, stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = fs.readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]; break; } catch {}
    await sleep(100);
  }
  if (!port) throw Error('Edge no expuso el endpoint de depuración.');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const pending = new Map(), errors = [];
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.id) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      if (!p) return;
      msg.error ? p.reject(msg.error) : p.resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async expression => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const wait = async predicate => {
    for (let i = 0; i < 100; i++) { if (await evaluate(predicate)) return; await sleep(150); }
    throw Error('Tiempo agotado: ' + predicate);
  };
  const geometry = () => evaluate(`Object.fromEntries(['.mapa','.tiempo','.panel','.principal'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return [s,{x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height}]}))`);
  const compare = (a, b, label) => {
    for (const [selector, rect] of Object.entries(a)) for (const key of ['x', 'y', 'w', 'h']) {
      if (Math.abs(rect[key] - b[selector][key]) > 1.5) throw Error(`${label}: ${selector}.${key}: ${rect[key]} -> ${b[selector][key]}`);
    }
  };
  const evidence = path.join(root, 'v4/evidencia/contexto-layout');
  fs.mkdirSync(evidence, { recursive: true });
  const shot = async name => {
    const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(evidence, name + '.png'), Buffer.from(r.data, 'base64'));
  };
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720]]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    let baseline;
    for (const version of ['v3', 'v4']) {
      await call('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/${version}/index.html` });
      await wait(`typeof Estado !== 'undefined' && document.querySelector('#r-titular').textContent.length>0 && !!document.querySelector('#mapa')._fullLayout`);
      await sleep(500);
      const initial = await geometry();
      if (version === 'v3') baseline = initial;
      else compare(baseline, initial, `${width} V3/V4`);
      await shot(`${width}x${height}-${version}-inicial`);
      await evaluate(`document.querySelector('[data-region="africa"]').click()`); await sleep(600);
      await shot(`${width}x${height}-${version}-africa`);
      if (version === 'v4') {
        await evaluate(`document.getElementById('contexto-abrir').click()`); await sleep(150);
        compare(initial, await geometry(), `${width} ficha abierta`);
        await shot(`${width}x${height}-v4-ficha`);
        for (const type of ['keyDown', 'keyUp']) await call('Input.dispatchKeyEvent', { type, key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
        if (!await evaluate(`document.getElementById('contexto-ficha').hidden && document.activeElement.id === 'contexto-abrir'`)) throw Error('Falló Escape o el retorno del foco.');
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
        await wait(`!document.getElementById('contexto-ficha').hidden`);
        await evaluate(`document.getElementById('contexto-cerrar').click()`);
        console.log(`PASS ${width}x${height}: geometría V3/V4 y ficha abierta, África, Enter, Escape y foco.`);
      }
    }
  }
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Sin excepciones JavaScript. Evidencia: v4/evidencia/contexto-layout (15 capturas).');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 999999, method: 'Browser.close' }));
  ws?.close(); browser?.kill(); server.closeAllConnections(); server.close();
});
