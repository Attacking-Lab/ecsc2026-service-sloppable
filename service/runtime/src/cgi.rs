//! Minimal CGI (RFC 3875) adapter over the `http` crate.
//!
//! Replaces the `cgi` crate (AGPL-3.0) with a permissive implementation.
//! Request parsing and response serialisation deliberately match that
//! crate's observable behaviour: the request URI is taken from
//! `SCRIPT_NAME` (+ `?QUERY_STRING`), `HTTP_*` CGI meta-variables become
//! request headers, and the response is written as `Status:`-line, headers
//! sorted by name, blank line, then body, with the header Content-Length
//! emitted verbatim and never recomputed. The verbatim emission is relied
//! on by the service's output path, so it must not be "sanitised" here.

use std::collections::HashMap;
use std::io::{Read, Write};

pub use http;

pub type Request = http::Request<Vec<u8>>;
pub type Response = http::Response<Vec<u8>>;

/// `text/plain` response with the given status; sets Content-Length to the
/// body length and Content-Type to `text/plain; charset=utf-8`.
pub fn text_response<T, S>(status_code: T, body: S) -> Response
where
    http::StatusCode: TryFrom<T>,
    <http::StatusCode as TryFrom<T>>::Error: Into<http::Error>,
    S: Into<String>,
{
    let body: Vec<u8> = body.into().into_bytes();
    http::Response::builder()
        .status(status_code)
        .header(http::header::CONTENT_LENGTH, body.len().to_string())
        .header(http::header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(body)
        .unwrap()
}

/// Read the CGI request from the environment and stdin, run `func`, and
/// write the CGI response to stdout.
pub(crate) fn handle<F>(func: F)
where
    F: FnOnce(Request) -> Response,
{
    let env_vars: HashMap<String, String> = std::env::vars().collect();

    // stdin must be read for exactly CONTENT_LENGTH bytes: read_to_end can
    // block if the server keeps the connection open.
    let content_length: usize = env_vars
        .get("CONTENT_LENGTH")
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(0);
    let mut body = vec![0u8; content_length];
    std::io::stdin().read_exact(&mut body).unwrap();

    let response = func(parse_request(env_vars, body));
    std::io::stdout()
        .write_all(&serialize_response(response))
        .unwrap();
}

fn parse_request(env_vars: HashMap<String, String>, body: Vec<u8>) -> Request {
    let mut req = http::Request::builder()
        .method(env_vars.get("REQUEST_METHOD").map_or("GET", String::as_str));

    let mut uri = env_vars.get("SCRIPT_NAME").cloned().unwrap_or_default();
    if let Some(query) = env_vars.get("QUERY_STRING") {
        uri.push('?');
        uri.push_str(query);
    }
    req = req.uri(uri.as_str());

    req = match env_vars.get("SERVER_PROTOCOL").map(String::as_str) {
        Some("HTTP/0.9") => req.version(http::Version::HTTP_09),
        Some("HTTP/1.0") => req.version(http::Version::HTTP_10),
        Some("HTTP/1.1") => req.version(http::Version::HTTP_11),
        Some("HTTP/2.0") => req.version(http::Version::HTTP_2),
        _ => req,
    };

    for (key, value) in &env_vars {
        if let Some(name) = key.strip_prefix("HTTP_") {
            let name: String = name
                .chars()
                .map(|c| if c == '_' { '-' } else { c })
                .collect();
            req = req.header(name.as_str(), value.trim());
        }
    }

    req.body(body).unwrap()
}

fn serialize_response(response: Response) -> Vec<u8> {
    let mut out = String::new();
    out.push_str("Status: ");
    out.push_str(response.status().as_str());
    if let Some(reason) = response.status().canonical_reason() {
        out.push(' ');
        out.push_str(reason);
    }
    out.push('\n');

    let headers = response.headers();
    let mut names: Vec<&http::header::HeaderName> = headers.keys().collect();
    names.sort_by_key(|name| name.as_str());
    for name in names {
        out.push_str(name.as_str());
        out.push_str(": ");
        out.push_str(headers.get(name).unwrap().to_str().unwrap());
        out.push('\n');
    }
    out.push('\n');

    let mut out = out.into_bytes();
    out.extend(response.into_body());
    out
}

macro_rules! cgi_main {
    ($func:expr) => {
        fn main() {
            $crate::cgi::handle($func);
        }
    };
}
pub(crate) use cgi_main;
