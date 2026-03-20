#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use anyhow::Result;
use gitpulse_runtime::{BootstrapOptions, GitPulseRuntime};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
async fn pick_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let selected =
            folder.and_then(|handle| handle.as_path().map(|path| path.display().to_string()));
        let _ = sender.send(selected);
    });
    receiver.await.map_err(|error| error.to_string())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![pick_folder])
        .setup(|app| {
            let runtime =
                tauri::async_runtime::block_on(GitPulseRuntime::bootstrap(BootstrapOptions {
                    port_override: Some(0),
                    start_background_tasks: true,
                }))
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;

            let listener =
                tauri::async_runtime::block_on(tokio::net::TcpListener::bind(("127.0.0.1", 0)))
                    .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;
            let addr = listener
                .local_addr()
                .map_err(|error| -> Box<dyn std::error::Error> { Box::new(error) })?;

            let server_runtime = runtime.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(error) = gitpulse_web::run(server_runtime, listener).await {
                    eprintln!("GitPulse desktop server failed: {error}");
                }
            });

            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(
                    format!("http://{}", addr).parse().expect("valid localhost url"),
                ),
            )
            .title("GitPulse")
            .inner_size(1440.0, 960.0)
            .build()?;

            app.manage(runtime);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
