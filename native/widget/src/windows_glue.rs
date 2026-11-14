//! Windows compositing fix-ups for a per-pixel-alpha window.
//!
//! `winit` makes a transparent window work by asking DWM for blur-behind with an
//! empty region; DWM then honours the renderer's alpha. Windows 11 also paints
//! its own system backdrop (Mica/Acrylic) into such a window, which shows up as a
//! milky sheet wherever the renderer left alpha at zero. `DWMWA_SYSTEMBACKDROP_TYPE`
//! is the supported way to switch that backdrop off while keeping the alpha path,
//! so the window behaves like a normal layered surface.
//!
//! The frame is also told not to round or outline itself: the window has no
//! visible border, and the drawn shape owns every corner.

use std::sync::atomic::{AtomicIsize, Ordering};

use windows_sys::Win32::Foundation::{FALSE, HWND, LPARAM, TRUE};
use windows_sys::Win32::Graphics::Dwm::{
    DwmSetWindowAttribute, DWMWA_BORDER_COLOR, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_DONOTROUND,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowThreadProcessId};

/// `DWMWA_SYSTEMBACKDROP_TYPE`; absent from windows-sys before 0.62.
const DWMWA_SYSTEMBACKDROP_TYPE: u32 = 38;
/// `DWMSBT_NONE`: no Mica, no Acrylic, plain alpha compositing.
const DWMSBT_NONE: i32 = 1;
/// `DWMWA_COLOR_NONE`: no border at all.
const DWMWA_COLOR_NONE: u32 = 0xFFFF_FFFE;

static OURS: AtomicIsize = AtomicIsize::new(0);

unsafe extern "system" fn find_own_window(hwnd: HWND, _lparam: LPARAM) -> i32 {
    let mut pid: u32 = 0;
    unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
    if pid == std::process::id() {
        OURS.store(hwnd as isize, Ordering::SeqCst);
        return FALSE;
    }
    TRUE
}

/// Apply the compositing fix-ups once, after the window exists.
pub fn prepare_window() {
    unsafe {
        EnumWindows(Some(find_own_window), 0);
        let hwnd = OURS.load(Ordering::SeqCst) as HWND;
        if hwnd.is_null() {
            return;
        }

        let backdrop = DWMSBT_NONE;
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_SYSTEMBACKDROP_TYPE,
            (&backdrop as *const i32).cast(),
            std::mem::size_of::<i32>() as u32,
        );

        let corner = DWMWCP_DONOTROUND;
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            (&corner as *const i32).cast(),
            std::mem::size_of::<i32>() as u32,
        );

        let no_border = DWMWA_COLOR_NONE;
        DwmSetWindowAttribute(
            hwnd,
            DWMWA_BORDER_COLOR as u32,
            (&no_border as *const u32).cast(),
            std::mem::size_of::<u32>() as u32,
        );
    }
}
