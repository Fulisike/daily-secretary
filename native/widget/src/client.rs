//! Loopback client for the daily-secretary Host plugin.
//!
//! The widget is a separate process, so the only coupling to DSH is this tiny
//! HTTP API on 127.0.0.1. A hand-rolled client keeps the dependency list to
//! `serde`/`serde_json` and keeps the binary small.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::time::Duration;

/// Everything the widget renders comes from one Host snapshot.
#[derive(Debug, Clone, Default)]
pub struct State {
    pub capture: String,
    pub notice: Option<String>,
    pub segments: u32,
    pub digest_title: String,
    pub digest_text: String,
    pub open_panel_at: i64,
}

impl State {
    fn from_json(value: &serde_json::Value) -> Self {
        let digest = value.get("digest");
        let text_of = |key: &str| -> String {
            digest
                .and_then(|d| d.get(key))
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_owned()
        };
        Self {
            capture: value
                .get("capture")
                .and_then(|v| v.as_str())
                .unwrap_or("unavailable")
                .to_owned(),
            notice: value.get("notice").and_then(|v| v.as_str()).map(str::to_owned),
            segments: value.get("segments").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
            digest_title: if digest.is_some() {
                text_of("title")
            } else {
                String::new()
            },
            digest_text: text_of("text"),
            open_panel_at: value.get("openPanelAt").and_then(|v| v.as_i64()).unwrap_or(0),
        }
    }

    pub fn recording(&self) -> bool {
        self.capture == "recording"
    }

    pub fn unavailable(&self) -> bool {
        self.capture == "unavailable"
    }
}

/// One parsed `http://host:port` endpoint.
#[derive(Clone)]
pub struct Endpoint {
    authority: String,
    address: SocketAddr,
}

impl Endpoint {
    pub fn parse(url: &str) -> Option<Self> {
        let rest = url.strip_prefix("http://")?;
        let authority = rest.trim_end_matches('/').split('/').next()?.to_owned();
        let mut parts = authority.rsplitn(2, ':');
        let port: u16 = parts.next()?.parse().ok()?;
        let host = parts.next()?;
        let octets: Vec<u8> = host.split('.').filter_map(|p| p.parse().ok()).collect();
        if octets.len() != 4 {
            return None;
        }
        let address = SocketAddr::from(([octets[0], octets[1], octets[2], octets[3]], port));
        Some(Self { authority, address })
    }

    fn request(&self, method: &str, path: &str, body: Option<&str>, token: &str) -> Result<String, String> {
        let mut stream = TcpStream::connect_timeout(&self.address, Duration::from_millis(1_500))
            .map_err(|e| format!("connect: {e}"))?;
        stream
            .set_read_timeout(Some(Duration::from_millis(2_500)))
            .map_err(|e| format!("timeout: {e}"))?;
        stream
            .set_write_timeout(Some(Duration::from_millis(2_500)))
            .map_err(|e| format!("timeout: {e}"))?;

        let payload = body.unwrap_or("");
        let mut request = format!(
            "{method} {path} HTTP/1.1\r\nHost: {}\r\nx-daily-secretary-token: {token}\r\nConnection: close\r\n",
            self.authority
        );
        if body.is_some() {
            request.push_str("Content-Type: application/json\r\n");
            request.push_str(&format!("Content-Length: {}\r\n", payload.len()));
        }
        request.push_str("\r\n");
        request.push_str(payload);
        stream
            .write_all(request.as_bytes())
            .map_err(|e| format!("write: {e}"))?;

        let mut raw = Vec::new();
        let mut buffer = [0u8; 4096];
        loop {
            match stream.read(&mut buffer) {
                Ok(0) => break,
                Ok(n) => {
                    raw.extend_from_slice(&buffer[..n]);
                    if raw.len() > 4_000_000 {
                        return Err("response too large".to_owned());
                    }
                }
                Err(error) => {
                    // A close-delimited body ends with a read error on some stacks.
                    if raw.is_empty() {
                        return Err(format!("read: {error}"));
                    }
                    break;
                }
            }
        }

        let text = String::from_utf8_lossy(&raw);
        let split = text.find("\r\n\r\n").ok_or("malformed response")?;
        let head = &text[..split];
        let body = &text[split + 4..];
        let status = head.lines().next().and_then(|line| line.split_whitespace().nth(1)).unwrap_or("0");
        if status != "200" {
            return Err(format!("HTTP {status}"));
        }
        Ok(body.to_owned())
    }

    /// Current snapshot.
    pub fn state(&self, token: &str) -> Result<State, String> {
        let body = self.request("GET", "/api/state", None, token)?;
        let value: serde_json::Value = serde_json::from_str(&body).map_err(|e| format!("json: {e}"))?;
        Ok(State::from_json(&value))
    }

    /// Fire one user action; the reply carries the new snapshot.
    pub fn action(&self, token: &str, action: &str) -> Result<State, String> {
        let body = format!("{{\"action\":\"{action}\"}}");
        let reply = self.request("POST", "/api/action", Some(&body), token)?;
        let value: serde_json::Value = serde_json::from_str(&reply).map_err(|e| format!("json: {e}"))?;
        match value.get("state") {
            Some(state) => Ok(State::from_json(state)),
            None => Err("no state in reply".to_owned()),
        }
    }
}
