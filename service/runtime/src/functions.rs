use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use http::uri::Uri;
use wasmtime::{Caller, Linker};

use crate::util::{empty_stringref, string_to_wasm, wasm_parse_string, wasm_write_string};
use crate::{FUEL_HEADER, FUEL_REMAINING_HEADER, RuntimeContext, SPC_FUEL_COST, artifacts};

pub fn spc(mut caller: Caller<'_, RuntimeContext>, fun: i32, namespace: i32) -> i32 {
    let Some(fun) = wasm_parse_string(&mut caller, fun) else {
        return empty_stringref();
    };
    let Some(namespace) = wasm_parse_string(&mut caller, namespace) else {
        return empty_stringref();
    };

    if fun.contains("/") {
        return empty_stringref();
    }

    let Ok(remaining_fuel) = caller.get_fuel() else {
        return empty_stringref();
    };
    if remaining_fuel <= SPC_FUEL_COST {
        let _ = caller.set_fuel(0);
        return empty_stringref();
    }
    let child_fuel = remaining_fuel - SPC_FUEL_COST;
    if caller.set_fuel(child_fuel).is_err() {
        return empty_stringref();
    }

    let url = format!("http://runtime/{namespace}/{fun}")
        .parse::<Uri>()
        .unwrap();

    let response = {
        let context = caller.data();
        context
            .client
            .get(url)
            .header("X-Caller", &context.caller)
            .header(FUEL_HEADER, child_fuel.to_string())
            .call()
    };
    let Ok(mut response) = response else {
        return empty_stringref();
    };

    let returned_fuel = response
        .headers()
        .get(FUEL_REMAINING_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(0)
        .min(child_fuel);
    if caller.set_fuel(returned_fuel).is_err() {
        return empty_stringref();
    }

    let Ok(body) = response.body_mut().read_to_string() else {
        return empty_stringref();
    };

    string_to_wasm(&mut caller, &body)
}

pub fn read_artifact(mut caller: Caller<'_, RuntimeContext>, filename: i32) -> i32 {
    let Some(filename) = wasm_parse_string(&mut caller, filename) else {
        return empty_stringref();
    };

    let Some((artifact, filename)) = filename.split_once(":") else {
        return empty_stringref();
    };

    let context = caller.data();
    let url = format!("http://runtime/core/check-access")
        .parse::<Uri>()
        .unwrap();

    let Ok(mut response) = context
        .client
        .get(url)
        .header("X-Caller", &context.caller)
        .query("f", &artifact)
        .call()
    else {
        return string_to_wasm(&mut caller, "Failed to Send");
    };
    let Ok(body) = response.body_mut().read_to_string() else {
        return string_to_wasm(&mut caller, "No Text");
    };

    if body.as_str() != "OK" {
        return string_to_wasm(&mut caller, &body);
    }

    let manifest = artifacts::load_manifest(artifact).unwrap();

    match manifest.files.iter().find(|file| file.path == filename) {
        Some(file) => string_to_wasm(&mut caller, &file.content),
        None => empty_stringref(),
    }
}

fn atob(string: &str) -> Option<String> {
    let bytes = BASE64.decode(string).ok()?;
    String::from_utf8(bytes).ok()
}

pub fn slop_atob(mut caller: Caller<'_, RuntimeContext>, ptr: i32) -> i32 {
    let decoded = wasm_parse_string(&mut caller, ptr)
        .and_then(|string| atob(&string))
        .unwrap_or_default();
    string_to_wasm(&mut caller, &decoded)
}

fn btoa(string: &str) -> String {
    BASE64.encode(string.as_bytes())
}

pub fn slop_btoa(mut caller: Caller<'_, RuntimeContext>, ptr: i32) -> i32 {
    let encoded = wasm_parse_string(&mut caller, ptr)
        .map(|string| btoa(&string))
        .unwrap_or_default();
    string_to_wasm(&mut caller, &encoded)
}

fn hex(string: &str) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";

    let mut encoded = String::with_capacity(string.len() * 2);
    for byte in string.bytes() {
        encoded.push(DIGITS[(byte >> 4) as usize] as char);
        encoded.push(DIGITS[(byte & 0x0f) as usize] as char);
    }
    encoded
}

pub fn slop_hex(mut caller: Caller<'_, RuntimeContext>, ptr: i32) -> i32 {
    let encoded = wasm_parse_string(&mut caller, ptr)
        .map(|string| hex(&string))
        .unwrap_or_default();
    string_to_wasm(&mut caller, &encoded)
}

fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn unhex(string: &str) -> Option<String> {
    let chunks = string.as_bytes().chunks_exact(2);
    if !chunks.remainder().is_empty() {
        return None;
    }

    let bytes = chunks
        .map(|pair| Some((hex_digit(pair[0])? << 4) | hex_digit(pair[1])?))
        .collect::<Option<Vec<_>>>()?;
    String::from_utf8(bytes).ok()
}

pub fn slop_unhex(mut caller: Caller<'_, RuntimeContext>, ptr: i32) -> i32 {
    let decoded = wasm_parse_string(&mut caller, ptr)
        .and_then(|string| unhex(&string))
        .unwrap_or_default();
    string_to_wasm(&mut caller, &decoded)
}

pub fn slop_uppercase(mut caller: Caller<'_, RuntimeContext>, ptr: i32) {
    let Some(string) = wasm_parse_string(&mut caller, ptr) else {
        return;
    };

    wasm_write_string(&mut caller, ptr, &string.to_uppercase());
}

pub fn slop_lowercase(mut caller: Caller<'_, RuntimeContext>, ptr: i32) {
    let Some(string) = wasm_parse_string(&mut caller, ptr) else {
        return;
    };

    wasm_write_string(&mut caller, ptr, &string.to_lowercase());
}

pub fn slop_trim(mut caller: Caller<'_, RuntimeContext>, ptr: i32) {
    let Some(string) = wasm_parse_string(&mut caller, ptr) else {
        return;
    };

    wasm_write_string(&mut caller, ptr, string.trim());
}

pub fn slop_reverse(mut caller: Caller<'_, RuntimeContext>, ptr: i32) {
    let Some(string) = wasm_parse_string(&mut caller, ptr) else {
        return;
    };

    let reversed = string.chars().rev().collect::<String>();
    wasm_write_string(&mut caller, ptr, &reversed);
}

fn substring(string: &str, start: i32, length: i32) -> String {
    if start < 0 || length <= 0 {
        return String::new();
    }

    string
        .chars()
        .skip(start as usize)
        .take(length as usize)
        .collect()
}

pub fn slop_substring(
    mut caller: Caller<'_, RuntimeContext>,
    ptr: i32,
    start: i32,
    length: i32,
) -> i32 {
    let value = wasm_parse_string(&mut caller, ptr)
        .map(|string| substring(&string, start, length))
        .unwrap_or_default();
    string_to_wasm(&mut caller, &value)
}

fn capitalize(string: &str) -> String {
    let mut chars = string.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };

    first.to_uppercase().chain(chars).collect()
}

pub fn slop_capitalize(mut caller: Caller<'_, RuntimeContext>, ptr: i32) {
    let Some(string) = wasm_parse_string(&mut caller, ptr) else {
        return;
    };

    wasm_write_string(&mut caller, ptr, &capitalize(&string));
}

pub fn bind(linker: &mut Linker<RuntimeContext>) -> wasmtime::Result<()> {
    linker.func_wrap("host", "atob", slop_atob)?;
    linker.func_wrap("host", "btoa", slop_btoa)?;
    linker.func_wrap("host", "capitalize", slop_capitalize)?;
    linker.func_wrap("host", "hex", slop_hex)?;
    linker.func_wrap("host", "lowercase", slop_lowercase)?;
    linker.func_wrap("host", "read_artifact", read_artifact)?;
    linker.func_wrap("host", "reverse", slop_reverse)?;
    linker.func_wrap("host", "spc", spc)?;
    linker.func_wrap("host", "substring", slop_substring)?;
    linker.func_wrap("host", "trim", slop_trim)?;
    linker.func_wrap("host", "unhex", slop_unhex)?;
    linker.func_wrap("host", "uppercase", slop_uppercase)?;

    Ok(())
}

