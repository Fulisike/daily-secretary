//! The floating companion.
//!
//! One window, one state machine: a 2.5 cm circle that morphs into a small card.
//! The window itself is resized during the morph (the OS window tracks the drawn
//! shape), which is what makes the transition read as one continuous object
//! instead of two panels swapping.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use eframe::egui;
use eframe::egui::{Color32, CornerRadius, Pos2, Rect, Stroke, Vec2, ViewportCommand};

use crate::client::{Endpoint, State};

/// Visible diameter: 2.5 cm at the 96 dpi a logical point is defined by.
const DOT_DIAMETER: f32 = 95.0;
/// Extra window around the circle so its halo is not clipped.
const DOT_MARGIN: f32 = 24.0;
/// Logical window size in dot mode (the drawn circle is inside it).
pub const DOT_WINDOW: f32 = DOT_DIAMETER + DOT_MARGIN * 2.0;
const PANEL_W: f32 = 344.0;
const PANEL_H: f32 = 436.0;
const MORPH_SECONDS: f32 = 0.34;
/// How long the Host may stay unreachable before the widget gives up.
const HOST_DEAD_FAILURES: u32 = 90;
/// Windows draws an invisible resize border around a frameless window, so the
/// client area — everything this app paints — sits this far inside the rect the
/// OS positions. Clamping without it leaves a sliver of the card off-screen.
const WINDOW_INSET: f32 = 8.0;

const GREEN: Color32 = Color32::from_rgb(0x34, 0xC7, 0x59);
const AMBER: Color32 = Color32::from_rgb(0xF2, 0xBE, 0x22);
const GREY: Color32 = Color32::from_rgb(0x8A, 0x8F, 0x98);
const PANEL_BG: Color32 = Color32::from_rgba_premultiplied(21, 23, 27, 244);
const TEXT: Color32 = Color32::from_rgb(0xE8, 0xEA, 0xED);
const MUTED: Color32 = Color32::from_rgb(0x9A, 0xA0, 0xA6);

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Dot,
    Panel,
}

struct Shared {
    state: State,
    host_ok: bool,
    failures: u32,
}

/// Startup options resolved from the command line.
pub struct Options {
    pub endpoint: String,
    pub token: String,
    pub state_file: PathBuf,
    pub position: Option<(f32, f32)>,
}

pub struct Widget {
    endpoint: Endpoint,
    token: String,
    shared: Arc<Mutex<Shared>>,
    mode: Mode,
    morph: f32,
    anchor: Pos2,
    applied: Vec2,
    seen_open: i64,
    started: Instant,
    state_file: PathBuf,
    save_at: Option<Instant>,
    last_saved: Option<(f32, f32)>,
    first_frame: bool,
    /// Until this instant the window is still being placed: the OS sometimes
    /// ignores the first position command for a not-yet-mapped window, and
    /// adopting its default would overwrite the placement the user chose.
    placement_deadline: Instant,
    /// A single click has to wait out the double-click window before it toggles
    /// capture, otherwise reading the card would also start or stop recording.
    pending_toggle: Option<Instant>,
    cjk_missing: bool,
}

fn ease_in_out(t: f32) -> f32 {
    let t = t.clamp(0.0, 1.0);
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        let f = -2.0 * t + 2.0;
        1.0 - f * f * f / 2.0
    }
}

fn lerp(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

fn mix(a: Color32, b: Color32, t: f32) -> Color32 {
    let t = t.clamp(0.0, 1.0);
    let channel = |x: u8, y: u8| (x as f32 + (y as f32 - x as f32) * t).round() as u8;
    Color32::from_rgba_unmultiplied(
        channel(a.r(), b.r()),
        channel(a.g(), b.g()),
        channel(a.b(), b.b()),
        channel(a.a(), b.a()),
    )
}

fn alpha(color: Color32, alpha: f32) -> Color32 {
    Color32::from_rgba_unmultiplied(color.r(), color.g(), color.b(), (alpha.clamp(0.0, 1.0) * 255.0).round() as u8)
}

fn with_alpha_factor(color: Color32, factor: f32) -> Color32 {
    let value = (color.a() as f32 * factor.clamp(0.0, 1.0)).round() as u8;
    Color32::from_rgba_unmultiplied(color.r(), color.g(), color.b(), value)
}

impl Widget {
    pub fn new(cc: &eframe::CreationContext<'_>, options: Options) -> Self {
        let endpoint = Endpoint::parse(&options.endpoint).unwrap_or_else(|| {
            // A bad endpoint must not leave a windowless process behind.
            eprintln!("daily-secretary-widget: bad endpoint {}", options.endpoint);
            std::process::exit(2);
        });

        let state_file = options.state_file.clone();
        let remembered = read_state_file(&state_file);
        let seen_open = remembered.as_ref().map(|s| s.seen_open_panel_at).unwrap_or(0);
        let position = remembered
            .as_ref()
            .and_then(|s| match (s.x, s.y) {
                (Some(x), Some(y)) => Some((x, y)),
                _ => None,
            })
            .or(options.position)
            .unwrap_or_else(default_position);

        let cjk_missing = !install_fonts(&cc.egui_ctx);
        cc.egui_ctx.set_theme(egui::Theme::Dark);
        cc.egui_ctx.all_styles_mut(|style| {
            style.spacing.item_spacing = Vec2::new(0.0, 8.0);
        });

        let shared = Arc::new(Mutex::new(Shared {
            state: State::default(),
            host_ok: false,
            failures: 0,
        }));

        spawn_poller(cc.egui_ctx.clone(), endpoint.clone(), options.token.clone(), shared.clone());

        let dot = DOT_DIAMETER + DOT_MARGIN * 2.0;
        Self {
            endpoint,
            token: options.token,
            shared,
            mode: Mode::Dot,
            morph: 0.0,
            anchor: Pos2::new(position.0 + dot / 2.0, position.1 + dot / 2.0),
            applied: Vec2::splat(dot),
            seen_open,
            started: Instant::now(),
            state_file,
            save_at: None,
            last_saved: Some((position.0, position.1)),
            first_frame: true,
            placement_deadline: Instant::now() + Duration::from_millis(900),
            pending_toggle: None,
            cjk_missing,
        }
    }

    fn state(&self) -> State {
        self.shared.lock().map(|s| s.state.clone()).unwrap_or_default()
    }

    fn accent(&self, state: &State) -> Color32 {
        if state.unavailable() {
            GREY
        } else if state.recording() {
            GREEN
        } else {
            AMBER
        }
    }

    fn request(&self, action: &'static str) {
        let endpoint = self.endpoint.clone();
        let token = self.token.clone();
        std::thread::spawn(move || {
            let _ = endpoint.action(&token, action);
        });
    }

    fn persist(&mut self) {
        let dot = DOT_DIAMETER + DOT_MARGIN * 2.0;
        let x = self.anchor.x - dot / 2.0;
        let y = self.anchor.y - dot / 2.0;
        let record = PersistedState {
            x: Some(x),
            y: Some(y),
            seen_open_panel_at: self.seen_open,
        };
        if let Err(error) = write_state_file(&self.state_file, &record) {
            eprintln!("daily-secretary-widget: cannot save placement: {error}");
        }
        self.last_saved = Some((x, y));
        self.save_at = None;
    }

    fn dot_window(&self) -> Vec2 {
        Vec2::splat(DOT_WINDOW)
    }

    /// Advance animation, window geometry, and auto-open. No painting here.
    fn advance(&mut self, ctx: &egui::Context) {
        // A transparent window is only transparent if nothing opaque is painted
        // into it: clear every panel fill for both themes, whatever the OS theme.
        clear_window_fills(ctx);
        self.resolve_pending_toggle(ctx);

        // Windows composites its own backdrop until the frame is told not to.
        #[cfg(windows)]
        if self.first_frame {
            crate::windows_glue::prepare_window();
        }
        let target = match self.mode {
            Mode::Dot => 0.0,
            Mode::Panel => 1.0,
        };
        let step = ctx.input(|i| i.stable_dt).max(0.001) / MORPH_SECONDS;
        if (self.morph - target).abs() < 0.002 {
            self.morph = target;
        } else if self.morph < target {
            self.morph = (self.morph + step).min(target);
        } else {
            self.morph = (self.morph - step).max(target);
        }

        let state = self.state();
        if !self.shared.lock().map(|s| s.host_ok).unwrap_or(false) {
            let failures = self.shared.lock().map(|s| s.failures).unwrap_or(0);
            if failures > HOST_DEAD_FAILURES {
                ctx.send_viewport_cmd(ViewportCommand::Close);
                return;
            }
        }

        // A freshly generated piece asks for the card exactly once.
        if state.open_panel_at > self.seen_open && state.open_panel_at > 0 && self.mode == Mode::Dot {
            self.seen_open = state.open_panel_at;
            self.mode = Mode::Panel;
            self.persist();
        }

        let ease = ease_in_out(self.morph);
        let from = self.dot_window();
        let target_size = Vec2::new(lerp(from.x, PANEL_W, ease), lerp(from.y, PANEL_H, ease));
        let settled = self.morph == target;

        // The first frame always sends its size and placement: a frameless window
        // is otherwise left wherever the OS decides, and `with_position` alone is
        // not reliably applied. For a short while afterwards the position is
        // re-asserted, because a window that is not mapped yet can drop the
        // command — adopting the OS default there would forget where the user put
        // the dot. After that window, moving means the user dragged it.
        let placing = Instant::now() < self.placement_deadline;
        let drifted = ctx
            .input(|i| i.viewport().outer_rect)
            .map(|outer| (outer.center() - self.anchor).length() > 1.5)
            .unwrap_or(true);

        if self.first_frame || (target_size - self.applied).length() > 0.4 || (placing && drifted) {
            let mut position = self.anchor - target_size / 2.0;
            if let Some(monitor) = ctx.input(|i| i.viewport().monitor_size) {
                let limit = Vec2::new(
                    (monitor.x - target_size.x - WINDOW_INSET).max(0.0),
                    (monitor.y - target_size.y - WINDOW_INSET).max(0.0),
                );
                position.x = position.x.clamp(0.0, limit.x);
                position.y = position.y.clamp(0.0, limit.y);
                self.anchor = position + target_size / 2.0;
            }
            ctx.send_viewport_cmd(ViewportCommand::InnerSize(target_size));
            ctx.send_viewport_cmd(ViewportCommand::OuterPosition(position));
            self.applied = target_size;
            self.first_frame = false;
            if placing {
                ctx.request_repaint_after(Duration::from_millis(120));
            }
        } else if settled {
            // Follow the window when the user drags it.
            if let Some(outer) = ctx.input(|i| i.viewport().outer_rect) {
                if (outer.center() - self.anchor).length() > 1.5 {
                    self.anchor = outer.center();
                    self.applied = outer.size();
                    self.save_at = Some(Instant::now() + Duration::from_millis(400));
                }
            }
        }

        if let Some(deadline) = self.save_at {
            if Instant::now() >= deadline {
                self.persist();
            } else {
                ctx.request_repaint_after(Duration::from_millis(120));
            }
        }

        if !settled {
            ctx.request_repaint();
        } else {
            let interval = if self.mode == Mode::Dot && state.recording() { 120 } else { 500 };
            ctx.request_repaint_after(Duration::from_millis(interval));
        }
    }

    fn draw(&mut self, ui: &mut egui::Ui) {
        let painter = ui.painter().clone();
        let full = ui.max_rect();
        let ease = ease_in_out(self.morph);
        let state = self.state();
        let accent = self.accent(&state);

        let pad = lerp(DOT_MARGIN, 0.0, ease);
        let shape = full.shrink(pad);
        let corner = lerp(shape.width() / 2.0, 18.0, ease);
        let fill = mix(accent, PANEL_BG, (ease / 0.62).clamp(0.0, 1.0));

        // The window-wide response has to be claimed BEFORE the card's own
        // controls, because egui gives a click to the widget registered last:
        // claiming it afterwards swallowed every click meant for the back and
        // pause buttons and made the card impossible to close. In card mode it
        // does not take clicks at all, so the buttons always win.
        let root_sense = if self.mode == Mode::Dot {
            egui::Sense::click_and_drag()
        } else {
            egui::Sense::hover()
        };
        let root = ui.interact(full, egui::Id::new("ds-root"), root_sense);

        self.draw_halo(&painter, full.center(), shape, ease, &state);
        painter.rect_filled(shape, CornerRadius::same(corner.clamp(0.0, 255.0) as u8), fill);

        let border_alpha = 0.25 + 0.75 * ((ease - 0.25) / 0.55).clamp(0.0, 1.0);
        let border = with_alpha_factor(accent, border_alpha);
        painter.rect_stroke(shape, CornerRadius::same(corner.clamp(0.0, 255.0) as u8), Stroke::new(2.0, border), egui::StrokeKind::Inside);

        let glyph_alpha = 1.0 - (ease / 0.45).clamp(0.0, 1.0);
        if glyph_alpha > 0.01 {
            self.draw_glyph(&painter, full.center(), &state, glyph_alpha);
        }

        if ease > 0.5 {
            self.draw_panel(ui, full, ease, &state, accent);
        }

        // The circle is the drag handle; the card is moved by its title bar.
        if self.mode == Mode::Dot && root.drag_started() {
            ui.ctx().send_viewport_cmd(ViewportCommand::StartDrag);
        }
        // One click is the capture switch; two clicks read the day's card.
        // The switch waits out egui's 300 ms double-click window, so opening the
        // card can never also start or stop recording.
        if self.mode == Mode::Dot && root.clicked() {
            self.pending_toggle = Some(Instant::now() + Duration::from_millis(330));
            ui.ctx().request_repaint_after(Duration::from_millis(340));
        }
        if self.mode == Mode::Dot && root.double_clicked() {
            self.pending_toggle = None;
            self.mode = Mode::Panel;
            ui.ctx().request_repaint();
        }
        // A keyboard way back, for when the pointer is busy elsewhere.
        if self.mode == Mode::Panel && ui.input(|i| i.key_pressed(egui::Key::Escape)) {
            self.mode = Mode::Dot;
            self.persist();
        }
    }

    /// Fire the capture switch once the double-click window has passed.
    fn resolve_pending_toggle(&mut self, ctx: &egui::Context) {
        let Some(deadline) = self.pending_toggle else { return };
        if Instant::now() < deadline {
            ctx.request_repaint_after(Duration::from_millis(40));
            return;
        }
        self.pending_toggle = None;
        if self.state().recording() {
            self.request("pause");
        } else {
            self.request("resume");
        }
        ctx.request_repaint_after(Duration::from_millis(400));
    }

    fn draw_halo(&self, painter: &egui::Painter, center: Pos2, shape: Rect, ease: f32, state: &State) {
        let strength = (1.0 - ease / 0.35).clamp(0.0, 1.0);
        if strength <= 0.01 {
            return;
        }
        let accent = self.accent(state);
        let seconds = self.started.elapsed().as_secs_f32();
        let breathe = if state.recording() {
            0.55 + 0.45 * (seconds * 2.1).sin()
        } else {
            0.4
        };
        let radius = shape.width() / 2.0;
        let rings = 18;
        for index in 0..rings {
            let t = index as f32 / (rings - 1) as f32;
            let r = radius * (1.0 + 0.28 * t);
            let a = (1.0 - t).powi(2) * 0.13 * breathe * strength;
            painter.circle_filled(center, r, alpha(accent, a));
        }
        if state.recording() {
            // A slow outward pulse reads as "still watching" without a label.
            let phase = (seconds / 2.4).fract();
            let r = radius * (1.0 + 0.38 * phase);
            painter.circle_stroke(center, r, Stroke::new(1.5, alpha(accent, 0.28 * (1.0 - phase) * strength)));
        }
    }

    /// The glyph shows what a click will DO, not what the state is: the colour
    /// already carries the state, so a pause symbol means "click to pause" and a
    /// play triangle means "click to start recording".
    fn draw_glyph(&self, painter: &egui::Painter, center: Pos2, state: &State, strength: f32) {
        let color = alpha(Color32::WHITE, 0.92 * strength);
        if state.recording() {
            for offset in [-6.5f32, 6.5] {
                let bar = Rect::from_center_size(center + Vec2::new(offset, 0.0), Vec2::new(5.0, 19.0));
                painter.rect_filled(bar, CornerRadius::same(2), color);
            }
        } else if state.unavailable() {
            painter.line_segment(
                [center + Vec2::new(-9.0, 0.0), center + Vec2::new(9.0, 0.0)],
                Stroke::new(3.0, color),
            );
        } else {
            painter.add(egui::Shape::convex_polygon(
                vec![
                    center + Vec2::new(-5.0, -9.0),
                    center + Vec2::new(10.0, 0.0),
                    center + Vec2::new(-5.0, 9.0),
                ],
                color,
                Stroke::NONE,
            ));
        }
    }

    fn draw_panel(&mut self, ui: &mut egui::Ui, full: Rect, ease: f32, state: &State, accent: Color32) {
        let fade = ((ease - 0.55) / 0.45).clamp(0.0, 1.0);
        if fade <= 0.01 {
            return;
        }
        let inner = full.shrink2(Vec2::new(16.0, 14.0));
        let header = Rect::from_min_size(inner.min, Vec2::new(inner.width(), 34.0));
        let footer_h = 22.0;
        let body = Rect::from_min_max(
            Pos2::new(inner.left(), header.bottom() + 10.0),
            Pos2::new(inner.right(), inner.bottom() - footer_h),
        );

        // ---- header -------------------------------------------------------
        let button = Vec2::splat(28.0);
        let back_rect = Rect::from_min_size(header.min, button);
        let toggle_rect = Rect::from_min_size(
            Pos2::new(header.right() - button.x, header.min.y),
            button,
        );

        let back = ui.interact(back_rect, egui::Id::new("ds-back"), egui::Sense::click());
        if self.paint_icon_button(ui, &back, back_rect, fade, |painter, rect, color| {
            let c = rect.center();
            painter.line_segment([Pos2::new(c.x + 3.0, c.y - 6.0), Pos2::new(c.x - 3.5, c.y)], Stroke::new(1.8, color));
            painter.line_segment([Pos2::new(c.x - 3.5, c.y), Pos2::new(c.x + 3.0, c.y + 6.0)], Stroke::new(1.8, color));
        }) {
            self.mode = Mode::Dot;
            self.persist();
        }

        let toggle = ui.interact(toggle_rect, egui::Id::new("ds-toggle"), egui::Sense::click());
        let recording = state.recording();
        if self.paint_icon_button(ui, &toggle, toggle_rect, fade, |painter, rect, color| {
            let c = rect.center();
            if recording {
                for offset in [-4.0f32, 4.0] {
                    let bar = Rect::from_center_size(Pos2::new(c.x + offset, c.y), Vec2::new(3.6, 13.0));
                    painter.rect_filled(bar, CornerRadius::same(1), color);
                }
            } else {
                painter.add(egui::Shape::convex_polygon(
                    vec![
                        Pos2::new(c.x - 4.0, c.y - 7.0),
                        Pos2::new(c.x + 7.0, c.y),
                        Pos2::new(c.x - 4.0, c.y + 7.0),
                    ],
                    color,
                    Stroke::NONE,
                ));
            }
        }) {
            self.request(if recording { "pause" } else { "resume" });
            ui.ctx().request_repaint_after(Duration::from_millis(400));
        }

        // Title drags the card.
        let title_rect = Rect::from_min_max(
            Pos2::new(header.left() + button.x + 6.0, header.min.y),
            Pos2::new(toggle_rect.left() - 6.0, header.max.y),
        );
        let title = ui.interact(title_rect, egui::Id::new("ds-title"), egui::Sense::click_and_drag());
        if title.drag_started() {
            ui.ctx().send_viewport_cmd(ViewportCommand::StartDrag);
        }

        let title_text = if state.digest_title.is_empty() {
            "每日秘书".to_owned()
        } else {
            state.digest_title.clone()
        };
        let title_text = truncate(&title_text, 16);
        ui.painter().text(
            title_rect.center(),
            egui::Align2::CENTER_CENTER,
            title_text,
            egui::FontId::proportional(14.0),
            alpha(TEXT, fade),
        );

        let line_y = header.bottom() + 2.0;
        ui.painter().line_segment(
            [Pos2::new(inner.left(), line_y), Pos2::new(inner.right(), line_y)],
            Stroke::new(1.0, alpha(mix(accent, MUTED, 0.55), 0.35 * fade)),
        );

        // ---- body ---------------------------------------------------------
        let body_text = if state.digest_text.trim().is_empty() {
            let hint = if self.cjk_missing { "(no CJK font found)" } else { "" };
            format!(
                "今天还没有生成小结。\n\n我会在每天固定时间把这一天的活写成一小段放在这里。\n现在正在记录：今天已经记下 {} 段。{}",
                state.segments, hint
            )
        } else {
            state.digest_text.clone()
        };

        let mut child = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(body)
                .layout(egui::Layout::top_down(egui::Align::LEFT)),
        );
        child.set_clip_rect(body);
        child.spacing_mut().item_spacing = Vec2::new(0.0, 6.0);
        let color = alpha(TEXT, fade * 0.86);
        egui::ScrollArea::vertical()
            .auto_shrink([false, false])
            .id_salt("ds-body")
            .show(&mut child, |ui| {
                ui.add(
                    egui::Label::new(egui::RichText::new(body_text).size(13.5).color(color))
                        .wrap_mode(egui::TextWrapMode::Wrap),
                );
            });

        // ---- footer -------------------------------------------------------
        let status = if state.unavailable() {
            "截屏不可用".to_owned()
        } else if state.recording() {
            "正在记录".to_owned()
        } else {
            "已暂停".to_owned()
        };
        let detail = match state.notice.as_deref() {
            Some(notice) if !notice.is_empty() => truncate(notice, 30),
            _ if state.segments == 0 => "还没有记录".to_owned(),
            _ => format!("今天 {} 段", state.segments),
        };
        let footer = format!("{status} · {detail}");
        ui.painter().text(
            Pos2::new(inner.left(), inner.bottom() - footer_h / 2.0 + 4.0),
            egui::Align2::LEFT_CENTER,
            footer,
            egui::FontId::proportional(11.0),
            alpha(MUTED, fade * 0.9),
        );
    }

    /// One round icon button. Returns true when clicked.
    fn paint_icon_button(
        &self,
        ui: &egui::Ui,
        response: &egui::Response,
        rect: Rect,
        fade: f32,
        paint: impl Fn(&egui::Painter, Rect, Color32),
    ) -> bool {
        let painter = ui.painter();
        if response.hovered() {
            painter.circle_filled(rect.center(), rect.width() / 2.0, alpha(Color32::WHITE, 0.10 * fade));
        }
        let color = alpha(if response.hovered() { TEXT } else { MUTED }, fade);
        paint(painter, rect, color);
        response.clicked()
    }
}

impl eframe::App for Widget {
    fn clear_color(&self, _visuals: &egui::Visuals) -> [f32; 4] {
        [0.0, 0.0, 0.0, 0.0]
    }

    fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        self.advance(ctx);
    }

    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        self.draw(ui);
    }
}

/// Remove every opaque fill the window could paint into its own background.
///
/// A transparent winit window still shows whatever egui paints behind our
/// shapes, and the framework syncs the theme from the OS after startup, which
/// resets both styles. Normalising here — every frame, but only when a value
/// actually differs — keeps the window transparent whatever the theme does.
fn clear_window_fills(ctx: &egui::Context) {
    ctx.all_styles_mut(|style| {
        let visuals = &mut style.visuals;
        if visuals.panel_fill != Color32::TRANSPARENT {
            visuals.panel_fill = Color32::TRANSPARENT;
            visuals.window_fill = Color32::TRANSPARENT;
            visuals.faint_bg_color = Color32::TRANSPARENT;
            visuals.extreme_bg_color = Color32::TRANSPARENT;
            visuals.window_stroke = Stroke::NONE;
        }
    });
}

fn truncate(text: &str, limit: usize) -> String {
    let count = text.chars().count();
    if count <= limit {
        return text.to_owned();
    }
    let mut out: String = text.chars().take(limit.saturating_sub(1)).collect();
    out.push('…');
    out
}

fn default_position() -> (f32, f32) {
    // Bottom right, clear of the Windows taskbar.
    (1420.0, 760.0)
}

#[derive(Clone, Copy, Default)]
struct PersistedState {
    x: Option<f32>,
    y: Option<f32>,
    seen_open_panel_at: i64,
}

fn read_state_file(path: &PathBuf) -> Option<PersistedState> {
    let text = std::fs::read_to_string(path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&text).ok()?;
    Some(PersistedState {
        x: value.get("x").and_then(|v| v.as_f64()).map(|v| v as f32),
        y: value.get("y").and_then(|v| v.as_f64()).map(|v| v as f32),
        seen_open_panel_at: value.get("seenOpenPanelAt").and_then(|v| v.as_i64()).unwrap_or(0),
    })
}

fn write_state_file(path: &PathBuf, state: &PersistedState) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let payload = serde_json::json!({
        "x": state.x,
        "y": state.y,
        "seenOpenPanelAt": state.seen_open_panel_at,
    });
    std::fs::write(path, format!("{payload}\n"))
}

fn spawn_poller(ctx: egui::Context, endpoint: Endpoint, token: String, shared: Arc<Mutex<Shared>>) {
    std::thread::spawn(move || loop {
        match endpoint.state(&token) {
            Ok(state) => {
                if let Ok(mut guard) = shared.lock() {
                    guard.state = state;
                    guard.host_ok = true;
                    guard.failures = 0;
                }
            }
            Err(_) => {
                if let Ok(mut guard) = shared.lock() {
                    guard.host_ok = false;
                    guard.failures = guard.failures.saturating_add(1);
                }
            }
        }
        ctx.request_repaint();
        std::thread::sleep(Duration::from_millis(900));
    });
}

/// Load a system CJK font so Chinese does not render as boxes.
///
/// Returns false when no font could be read, which the panel mentions instead of
/// silently showing tofu.
fn install_fonts(ctx: &egui::Context) -> bool {
    let candidates: &[(&str, u32)] = &[
        ("C:/Windows/Fonts/msyh.ttc", 0),
        ("C:/Windows/Fonts/msyh.ttf", 0),
        ("C:/Windows/Fonts/Deng.ttf", 0),
        ("C:/Windows/Fonts/simhei.ttf", 0),
        ("C:/Windows/Fonts/simsun.ttc", 0),
        ("/System/Library/Fonts/PingFang.ttc", 0),
        ("/System/Library/Fonts/STHeiti Light.ttc", 0),
        ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0),
        ("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc", 0),
        ("/usr/share/fonts/opentype/noto/NotoSansCJKsc-Regular.otf", 0),
        ("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc", 0),
        ("/usr/share/fonts/truetype/arphic/uming.ttc", 0),
    ];

    let mut override_path = std::env::var("DAILY_SECRETARY_FONT").ok().filter(|v| !v.trim().is_empty());

    for (path, index) in candidates {
        if override_path.is_some() {
            break;
        }
        if std::path::Path::new(path).is_file() {
            override_path = Some((*path).to_owned());
            let _ = index;
            let bytes = match std::fs::read(path) {
                Ok(bytes) => bytes,
                Err(_) => continue,
            };
            if apply_font(ctx, bytes, *index) {
                return true;
            }
        }
    }

    if let Some(path) = override_path {
        // An explicit override is tried at index 0 when it is not a known path.
        if let Ok(bytes) = std::fs::read(&path) {
            if apply_font(ctx, bytes, 0) {
                return true;
            }
        }
    }
    false
}

fn apply_font(ctx: &egui::Context, bytes: Vec<u8>, index: u32) -> bool {
    if bytes.is_empty() {
        return false;
    }
    let mut fonts = egui::FontDefinitions::default();
    let mut data = egui::FontData::from_owned(bytes);
    data.index = index;
    fonts.font_data.insert("cjk".to_owned(), Arc::new(data));
    for family in [egui::FontFamily::Proportional, egui::FontFamily::Monospace] {
        fonts.families.entry(family).or_default().insert(0, "cjk".to_owned());
    }
    ctx.set_fonts(fonts);
    true
}
