// src-tauri/src/lib.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // Log (isteğe bağlı)
    .plugin(tauri_plugin_log::Builder::default().build())
    // SQL (kullanıyorsun)
    .plugin(tauri_plugin_sql::Builder::default().build())
    // HTTP — ÖNEMLİ: plugin burada init edilmeli
    .plugin(tauri_plugin_http::init())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
