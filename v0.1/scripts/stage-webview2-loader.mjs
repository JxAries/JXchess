/**
 * 打包前置步骤：把 WebView2Loader.dll 放进 Cargo 的输出目录。
 *
 * 背景（重要，勿删）：
 * Tauri 通过 webview2-com-sys 链接 WebView2。它的 src/lib.rs 里写死了两种链接方式：
 *
 *   #[cfg_attr(target_env = "msvc",     link(name = "WebView2LoaderStatic", kind = "static"))]
 *   #[cfg_attr(not(target_env = "msvc"), link(name = "WebView2Loader.dll"))]
 *
 * 也就是：MSVC 目标把加载器静态链接进 exe，不需要额外 DLL；
 * 而 GNU（MinGW）目标会动态导入 WebView2Loader.dll，exe 启动时必须能在同目录找到它，
 * 否则 Windows 加载器直接弹出「由于找不到 WebView2Loader.dll，无法继续执行代码」并终止进程
 * （退出码 0xC0000135 STATUS_DLL_NOT_FOUND），此时任何应用代码都还没机会运行。
 *
 * Tauri 的 bundler 会把放在 src-tauri/target/release/ 里的 DLL 一并打进 NSIS 安装包，
 * 所以这里只负责把它从 cargo registry 复制过去。
 *
 * 用法：node scripts/stage-webview2-loader.mjs [--target x86_64-pc-windows-msvc|x86_64-pc-windows-gnu]
 * 未指定 target 时按“正在使用的宿主工具链”推断，并做成对两种目标都安全：
 *   - MSVC 目标下不做任何事（静态链接，不需要 DLL），直接成功退出。
 *   - GNU 目标下必须找到并复制 DLL，否则以非零码退出，避免打出必然报错的包。
 */
import { existsSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(here, '..');              // v0.1/
const srcTauri = join(projectRoot, 'src-tauri');
const targetDir = join(srcTauri, 'target', 'release');

/** 解析 --target 参数 */
function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** 目标三元组 → WebView2Loader.dll 所在的架构子目录 */
const ARCH_BY_TARGET = {
  'x86_64-pc-windows-msvc': 'x64',
  'x86_64-pc-windows-gnu': 'x64',
  'i686-pc-windows-msvc': 'x86',
  'i686-pc-windows-gnu': 'x86',
  'aarch64-pc-windows-msvc': 'arm64',
};

/**
 * 找到 cargo registry 里的 webview2-com-sys crate 目录。
 * 优先用 CARGO_HOME；否则尝试几个常见位置（含本项目内置的便携工具链）。
 */
function findWebview2Crate() {
  const cargoHomes = [
    process.env.CARGO_HOME,
    join(projectRoot, '..', 'ignore', 'JXchessToolchain', 'rust', 'cargo'),
    join(process.env.USERPROFILE ?? '', '.cargo'),
  ].filter(Boolean);

  const found = [];
  for (const home of cargoHomes) {
    const regSrc = join(home, 'registry', 'src');
    if (!existsSync(regSrc)) continue;
    for (const index of readdirSync(regSrc)) {
      const indexDir = join(regSrc, index);
      if (!statSync(indexDir).isDirectory()) continue;
      for (const name of readdirSync(indexDir)) {
        if (!name.startsWith('webview2-com-sys-')) continue;
        const crateDir = join(indexDir, name);
        if (existsSync(join(crateDir, 'Cargo.toml'))) found.push(crateDir);
      }
    }
  }
  // 版本号大的优先（0.38.2 用 > 0.30.0 的简单比较）
  found.sort((a, b) => {
    const va = basename(a).match(/(\d+)\.(\d+)\.(\d+)/);
    const vb = basename(b).match(/(\d+)\.(\d+)\.(\d+)/);
    if (!va || !vb) return 0;
    return (+vb[1] - +va[1]) || (+vb[2] - +va[2]) || (+vb[3] - +va[3]);
  });
  return found[0] ?? null;
}

const explicitTarget = argValue('--target');
// 没有显式指定时，看宿主工具链：rustup 默认是 gnu 就按 gnu 处理
const isMsvc = explicitTarget
  ? explicitTarget.includes('msvc')
  : false;

if (isMsvc) {
  console.log('[stage-webview2] 目标为 MSVC：webview2-com-sys 会静态链接 WebView2Loader，无需额外 DLL。');
  process.exit(0);
}

console.log(`[stage-webview2] 复制 WebView2Loader.dll 到 ${targetDir}`);

const crateDir = findWebview2Crate();
if (!crateDir) {
  console.error('[stage-webview2] 找不到 webview2-com-sys crate 目录。');
  console.error('                  请确认已执行 npm install / cargo fetch，或设置 CARGO_HOME。');
  process.exit(1);
}
console.log(`[stage-webview2] crate: ${crateDir}`);

const arch = ARCH_BY_TARGET[explicitTarget ?? 'x86_64-pc-windows-gnu'] ?? 'x64';
const dllSrc = join(crateDir, arch, 'WebView2Loader.dll');
if (!existsSync(dllSrc)) {
  console.error(`[stage-webview2] 缺少 ${arch} 架构的 WebView2Loader.dll：${dllSrc}`);
  process.exit(1);
}

mkdirSync(targetDir, { recursive: true });
const dllDst = join(targetDir, 'WebView2Loader.dll');
copyFileSync(dllSrc, dllDst);

const size = statSync(dllDst).size;
const srcSize = statSync(dllSrc).size;
if (size !== srcSize) {
  console.error(`[stage-webview2] 复制不完整：${size} != ${srcSize}`);
  process.exit(1);
}

console.log(`[stage-webview2] 完成：${dllDst} (${size} 字节)`);
console.log('[stage-webview2] Tauri bundler 会把它一并打入 NSIS 安装包；portable 版请连它一起分发。');
