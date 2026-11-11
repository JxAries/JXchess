//! 本地 Stockfish 引擎桥：启动子进程，把 UCI 输出逐行通过事件发给前端。
//!
//! 不依赖 tauri-plugin-shell：直接用 std::process 起进程，避免额外的 crate 下载与权限配置。
//! 前端通过 `engine_start` / `engine_send` / `engine_stop` 三条命令驱动 UCI，
//! 并监听 `engine://line` 事件解析 `info` / `bestmove`。
//!
//! 引擎文件由 `bundle.externalBin` 随安装包下发，运行时位于主程序同目录；
//! 开发时回退到 `src-tauri/binaries/`。

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// 一个已启动的引擎进程：stdin 用于写 UCI 命令，child 用于退出时 kill
pub struct EngineHandle {
  stdin: Mutex<ChildStdin>,
  child: Mutex<Child>,
}

/// 全局引擎状态；Option 为 None 表示尚未启动
#[derive(Default)]
pub struct EngineState {
  inner: Mutex<Option<EngineHandle>>,
}

/// 按优先级找引擎 exe：主程序同目录 → 同目录 stockfish*.exe → 开发期 binaries 目录
fn resolve_engine_path() -> Option<PathBuf> {
  let mut candidates: Vec<PathBuf> = Vec::new();

  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      candidates.push(dir.join("stockfish.exe"));
      candidates.push(dir.join("stockfish-x86_64-pc-windows-msvc.exe"));
      if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
          let path = entry.path();
          let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
          if name.starts_with("stockfish") && name.ends_with(".exe") {
            candidates.push(path);
          }
        }
      }
    }
  }

  candidates.push(
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .join("binaries")
      .join("stockfish-x86_64-pc-windows-msvc.exe"),
  );

  candidates.into_iter().find(|p| p.is_file())
}

/// 启动引擎并起一个读取线程；重复调用直接返回成功
pub fn start(app: &AppHandle, state: &EngineState) -> Result<String, String> {
  let mut slot = state.inner.lock().map_err(|_| "引擎状态锁失败".to_string())?;
  if slot.is_some() {
    return Ok("引擎已在运行".to_string());
  }

  let path = resolve_engine_path().ok_or_else(|| "未找到本地 Stockfish 引擎文件".to_string())?;

  let mut cmd = Command::new(&path);
  cmd
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::null());
  // Windows 下不要弹出控制台窗口
  #[cfg(windows)]
  cmd.creation_flags(0x0800_0000);

  let mut child = cmd.spawn().map_err(|e| format!("启动引擎失败：{e}"))?;
  let stdin = child.stdin.take().ok_or_else(|| "无法写入引擎进程".to_string())?;
  let stdout = child.stdout.take().ok_or_else(|| "无法读取引擎进程".to_string())?;

  let app_for_reader = app.clone();
  std::thread::spawn(move || {
    let reader = BufReader::new(stdout);
    for line in reader.lines().map_while(Result::ok) {
      let _ = app_for_reader.emit("engine://line", line);
    }
  });

  *slot = Some(EngineHandle {
    stdin: Mutex::new(stdin),
    child: Mutex::new(child),
  });

  Ok(path.to_string_lossy().to_string())
}

fn write_line(handle: &EngineHandle, line: &str) -> Result<(), String> {
  let mut stdin = handle.stdin.lock().map_err(|_| "引擎输入锁失败".to_string())?;
  stdin
    .write_all(line.as_bytes())
    .map_err(|e| format!("写入引擎失败：{e}"))?;
  if !line.ends_with('\n') {
    stdin.write_all(b"\n").map_err(|e| format!("写入引擎失败：{e}"))?;
  }
  stdin.flush().map_err(|e| format!("写入引擎失败：{e}"))?;
  Ok(())
}

/// 退出时调用：先发 quit，再 kill，确保不留下 stockfish.exe
pub fn shutdown(state: &EngineState) {
  let Ok(mut slot) = state.inner.lock() else {
    return;
  };
  if let Some(handle) = slot.take() {
    let _ = write_line(&handle, "quit");
    if let Ok(mut child) = handle.child.lock() {
      let _ = child.kill();
      let _ = child.wait();
    }
  }
}

/// 应用退出时由 lib.rs 调用
pub fn shutdown_app(app: &AppHandle) {
  if let Some(state) = app.try_state::<EngineState>() {
    shutdown(&state);
  }
}

#[tauri::command]
pub fn engine_start(app: AppHandle, state: State<'_, EngineState>) -> Result<String, String> {
  start(&app, &state)
}

#[tauri::command]
pub fn engine_send(state: State<'_, EngineState>, line: String) -> Result<(), String> {
  let slot = state.inner.lock().map_err(|_| "引擎状态锁失败".to_string())?;
  let handle = slot.as_ref().ok_or_else(|| "引擎尚未启动".to_string())?;
  write_line(handle, &line)
}

#[tauri::command]
pub fn engine_stop(state: State<'_, EngineState>) -> Result<(), String> {
  let slot = state.inner.lock().map_err(|_| "引擎状态锁失败".to_string())?;
  match slot.as_ref() {
    Some(handle) => write_line(handle, "stop"),
    None => Ok(()),
  }
}

#[tauri::command]
pub fn engine_shutdown(state: State<'_, EngineState>) -> Result<(), String> {
  shutdown(&state);
  Ok(())
}
