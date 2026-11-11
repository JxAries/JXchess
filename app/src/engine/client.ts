/**
 * 前端引擎客户端：通过 Tauri 全局 API 调用 Rust 侧的引擎命令，
 * 并监听 `engine://line`（引擎每一行 UCI 输出）。
 * 浏览器里没有 window.__TAURI__，此时所有函数都会给出明确错误，页面其余功能不受影响。
 */
interface TauriEvent<T> {
  payload: T;
}

interface TauriGlobal {
  core: {
    invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
  };
  event: {
    listen<T>(event: string, handler: (event: TauriEvent<T>) => void): Promise<() => void>;
  };
}

declare global {
  interface Window {
    __TAURI__?: TauriGlobal;
  }
}

let listening = false;
let started = false;
const lineHandlers = new Set<(line: string) => void>();

function tauri(): TauriGlobal | null {
  return window.__TAURI__ ?? null;
}

async function ensureListening(): Promise<void> {
  const api = tauri();
  if (!api || listening) return;
  listening = true;
  await api.event.listen<string>('engine://line', (event) => {
    for (const handler of lineHandlers) handler(event.payload);
  });
}

/** 订阅引擎输出；返回取消订阅函数 */
export function onEngineLine(handler: (line: string) => void): () => void {
  lineHandlers.add(handler);
  return () => lineHandlers.delete(handler);
}

function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const api = tauri();
  if (!api) return Promise.reject(new Error('引擎仅在桌面版可用'));
  return api.core.invoke<T>(cmd, args);
}

function waitForLine(predicate: (line: string) => boolean, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      off();
      reject(new Error('引擎无响应'));
    }, timeoutMs);
    const off = onEngineLine((line) => {
      if (!predicate(line)) return;
      window.clearTimeout(timer);
      off();
      resolve(line);
    });
  });
}

/**
 * 启动引擎并等待它回报名字（UCI 的 `id name ...`）。
 * 重复调用是安全的：Rust 侧会复用已有进程，`uci` 每次都会重新输出 id name。
 */
export async function startEngine(timeoutMs = 6000): Promise<string> {
  await ensureListening();
  const namePromise = waitForLine((line) => line.startsWith('id name '), timeoutMs).then((line) =>
    line.slice('id name '.length).trim(),
  );
  await invoke<string>('engine_start');
  started = true;
  await invoke('engine_send', { line: 'uci' });
  const name = await namePromise;
  await invoke('engine_send', { line: 'isready' });
  return name || 'Stockfish';
}

/** 发送一条 UCI 命令（分析命令后续会用到） */
export async function sendCommand(line: string): Promise<void> {
  if (!started) return;
  await invoke('engine_send', { line });
}

/** 中断当前分析 */
export async function stopSearch(): Promise<void> {
  if (!started) return;
  await invoke('engine_stop');
}

/** 退出前关闭引擎 */
export async function shutdownEngine(): Promise<void> {
  if (!started) return;
  started = false;
  try {
    await invoke('engine_shutdown');
  } catch {
    // 应用正在退出时调用失败可忽略
  }
}
