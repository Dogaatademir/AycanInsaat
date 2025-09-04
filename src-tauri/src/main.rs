#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, menu::{MenuBuilder, MenuItemBuilder}};

fn main() {
  tauri::Builder::default()
    
    .plugin(tauri_plugin_sql::Builder::new().build())
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
