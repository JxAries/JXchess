mod engine;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(engine::EngineState::default())
    .invoke_handler(tauri::generate_handler![
      engine::engine_start,
      engine::engine_send,
      engine::engine_stop,
      engine::engine_shutdown
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      // 应用退出时杀掉引擎进程，避免任务管理器里残留 stockfish.exe
      if let tauri::RunEvent::Exit = event {
        engine::shutdown_app(app);
      }
    });
}
