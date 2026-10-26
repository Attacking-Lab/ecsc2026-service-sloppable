use cgi::{
    Request, Response, cgi_main,
    http::header::{HeaderName, HeaderValue},
    text_response,
};
use std::collections::HashMap;
use std::str::FromStr;
use wasmtime::*;

use ureq::Agent;

mod cgi;
mod artifacts;
mod functions;
mod util;

use util::{string_to_wasm_instance, wasm_parse_string_instance};

cgi_main! { run }

const INITIAL_FUEL: u64 = 1_000_000_000;
pub(crate) const FUEL_HEADER: &str = "x-slop-fuel";
pub(crate) const FUEL_REMAINING_HEADER: &str = "x-slop-fuel-remaining";
pub(crate) const SPC_FUEL_COST: u64 = 50_000;

pub struct RuntimeContext {
    client: Agent,
    caller: String,
}

impl RuntimeContext {
    pub fn new(caller: String) -> Self {
        Self {
            client: ureq::agent(),
            caller,
        }
    }
}

fn run(request: Request) -> Response {
    let Some((namespace, filename)) = request.uri().path()[1..].split_once("/") else {
        return text_response(400, "No namespace given");
    };

    if filename.contains("/") || namespace == ".." || filename == ".." {
        return text_response(400, "Invalid filename");
    }

    let mut params = HashMap::new();
    if let Some(query) = request.uri().query() {
        let kv_pairs = url::form_urlencoded::parse(query.as_bytes()).collect::<Vec<_>>();
        for (key, value) in kv_pairs.into_iter().rev() {
            params.insert(key.to_string(), value.to_string());
        }
    }

    let Some(caller) = request.headers().get("X-Caller") else {
        return text_response(400, "No caller given");
    };

    let fuel = match request.headers().get(FUEL_HEADER) {
        None => INITIAL_FUEL,
        Some(value) => value
            .to_str()
            .ok()
            .and_then(|value| value.parse::<u64>().ok())
            .unwrap_or(0)
            .min(INITIAL_FUEL),
    };

    match process(namespace, filename, caller.to_str().unwrap(), params, fuel) {
        Ok(response) => response,
        Err(e) => text_response(500, format!("Lamba execution failed: {e}")),
    }
}

fn process(
    namespace: &str,
    filename: &str,
    caller: &str,
    params: HashMap<String, String>,
    fuel: u64,
) -> Result<Response, Box<dyn std::error::Error>> {
    let mut config = Config::new();
    config.wasm_gc(true);
    config.consume_fuel(true);
    let engine = Engine::new(&config).unwrap();

    let module = Module::from_file(&engine, &format!("/compiled/{namespace}/{filename}"))?;

    let mut store: Store<_> = Store::new(&engine, RuntimeContext::new(caller.to_string()));
    store.set_fuel(fuel)?;
    let mut linker = Linker::new(&engine);
    functions::bind(&mut linker)?;

    let instance = linker.instantiate(&mut store, &module)?;
    string_to_wasm_instance(&mut store, &instance, namespace);

    for (key, value) in &params {
        string_to_wasm_instance(&mut store, &instance, key);
        string_to_wasm_instance(&mut store, &instance, value);
    }

    let entrypoint =
        instance.get_typed_func::<i32, (i32, Rooted<ArrayRef>)>(&mut store, "entry")?;

    let (response, headers) = entrypoint.call(&mut store, params.len() as i32)?;

    process_output(&mut store, &instance, response, headers)
}

fn process_output(
    mut store: &mut Store<RuntimeContext>,
    instance: &Instance,
    response: i32,
    headers: Rooted<ArrayRef>,
) -> Result<Response, Box<dyn std::error::Error>> {
    let response = wasm_parse_string_instance(&mut store, instance, response).unwrap_or_default();
    let mut response = text_response(200, &response);

    let iter = headers.elems(&mut store)?;
    let elems = iter.collect::<Vec<_>>();

    for entry in elems {
        match entry {
            Val::AnyRef(Some(entry)) => {
                let Ok(Some(entry)) = entry.as_struct(&mut store) else {
                    continue;
                };

                let Ok(name) = entry.field(&mut store, 0) else {
                    continue;
                };
                let Ok(value) = entry.field(&mut store, 1) else {
                    continue;
                };

                let name = name.clone();
                let value = value.clone();

                // parse header name
                let Val::I32(name) = name else {
                    continue;
                };

                let Some(name) = wasm_parse_string_instance(&mut store, instance, name) else {
                    continue;
                };

                let Ok(name) = HeaderName::from_str(&name) else {
                    continue;
                };

                // parse value
                let Val::I32(value) = value else {
                    continue;
                };

                let Some(value) = wasm_parse_string_instance(&mut store, instance, value) else {
                    continue;
                };

                let Ok(value) = HeaderValue::from_str(&value) else {
                    continue;
                };
                if name == FUEL_REMAINING_HEADER {
                    continue;
                }

                response.headers_mut().insert(name, value);
            }
            _ => (),
        }
    }

    response.headers_mut().insert(
        HeaderName::from_static(FUEL_REMAINING_HEADER),
        HeaderValue::from_str(&store.get_fuel()?.to_string())?,
    );

    Ok(response)
}
