//! daily-secretary desktop widget.
//!
//! A frameless, transparent, always-on-top window that draws a 2.5 cm circle
//! while the plugin records the screen (green) or holds it paused (yellow).
//! Clicking the circle opens a small scrolling card with the day's recap; the
//! window resizes with the drawing so the circle appears to become the card.
//!
//! It owns no capture logic and no storage except its own placement: everything
//! it shows arrives from the DSH Host plugin over `--endpoint` with `--token`.

mod app;
mod client;

#[cfg(windows)]
mod windows_glue;

use std::path::PathBuf;

use eframe::egui;

struct Args {
    endpoint: String,
    token: String,
    state_file: PathBuf,
    position: Option<(f32, f32)>,
}

fn parse_args() -> Args {
    let mut endpoint = None;
    let mut token = None;
    let mut state_file = None;
    let mut position = None;

    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--endpoint" => endpoint = args.next(),
            "--token" => token = args.next(),
            "--state" => state_file = args.next().map(PathBuf::from),
            "--position" => {
                position = args.next().and_then(|value| {
                    let mut parts = value.split(',');
                    let x = parts.next()?.trim().parse().ok()?;
                    let y = parts.next()?.trim().parse().ok()?;
                    Some((x, y))
                });
            }
            "--help" | "-h" => {
                println!("daily-secretary-widget --endpoint http://127.0.0.1:PORT --token TOKEN --state PATH [--position X,Y]");
                std::process::exit(0);
            }
            other => {
                eprintln!("daily-secretary-widget: unknown argument {other}");
                std::process::exit(2);
            }
        }
    }

    let Some(endpoint) = endpoint else {
        eprintln!("daily-secretary-widget: --endpoint is required");
        std::process::exit(2);
    };
    let Some(token) = token else {
        eprintln!("daily-secretary-widget: --token is required");
        std::process::exit(2);
    };
    let state_file = state_file.unwrap_or_else(|| PathBuf::from("daily-secretary-widget.json"));

    Args { endpoint, token, state_file, position }
}

fn main() -> eframe::Result {
    let args = parse_args();
    let size = app::DOT_WINDOW;
    let position = args.position;

    let mut viewport = egui::ViewportBuilder::default()
        .with_title("daily-secretary")
        .with_decorations(false)
        .with_transparent(true)
        .with_resizable(false)
        .with_always_on_top()
        .with_taskbar(false)
        .with_active(false)
        .with_has_shadow(false)
        .with_drag_and_drop(false)
        .with_inner_size(egui::Vec2::splat(size));
    if let Some((x, y)) = position {
        viewport = viewport.with_position(egui::Pos2::new(x, y));
    }

    let options = eframe::NativeOptions {
        viewport,
        renderer: eframe::Renderer::Wgpu,
        ..Default::default()
    };

    eframe::run_native(
        "daily-secretary",
        options,
        Box::new(move |cc| {
            Ok(Box::new(app::Widget::new(
                cc,
                app::Options {
                    endpoint: args.endpoint,
                    token: args.token,
                    state_file: args.state_file,
                    position: args.position,
                },
            )))
        }),
    )
}
