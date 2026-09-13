/**
 * Electron 主进程：把 Vite 的构建产物通过自定义 app:// 协议提供给窗口。
 * 不用 file:// 是因为浏览器内核禁止从本地文件加载 ES 模块，会被安全策略直接拦下。
 */
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/** 把 app://jxchess/xxx 映射到 dist/xxx，并阻止越权访问 */
function registerProtocol() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^[/\\]+/, '');
    const filePath = path.join(DIST, rel === '' ? 'index.html' : rel);
    if (!filePath.startsWith(DIST)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 880,
    minWidth: 980,
    minHeight: 660,
    backgroundColor: '#faf8f4',
    title: 'JXchess',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  void win.loadURL('app://jxchess/index.html');
}

app.whenReady().then(() => {
  registerProtocol();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
