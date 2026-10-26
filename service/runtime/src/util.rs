use wasmtime::*;

use crate::RuntimeContext;

pub fn wasm_parse_string(caller: &mut Caller<'_, RuntimeContext>, ptr: i32) -> Option<String> {
    let Some(Extern::Memory(memory)) = caller.get_export("strings") else {
        unreachable!()
    };

    let data = memory.data(caller);

    if data.len() <= ptr as usize {
        return None;
    }

    let slice = &data[ptr as usize..];
    let Some(length) = slice.iter().position(|&byte| byte == 0) else {
        return None;
    };

    String::from_utf8(slice[..length].to_owned()).ok()
}

pub fn wasm_parse_string_instance(
    mut store: &mut Store<RuntimeContext>,
    instance: &Instance,
    ptr: i32,
) -> Option<String> {
    let Some(Extern::Memory(memory)) = instance.get_export(&mut store, "strings") else {
        unreachable!()
    };

    let data = memory.data(store);

    if data.len() <= ptr as usize {
        return None;
    }

    let slice = &data[ptr as usize..];
    let Some(length) = slice.iter().position(|&byte| byte == 0) else {
        return None;
    };
    String::from_utf8(slice[..length].to_owned()).ok()
}

pub fn wasm_write_string(caller: &mut Caller<'_, RuntimeContext>, ptr: i32, s: &str) {
    let Some(Extern::Memory(memory)) = caller.get_export("strings") else {
        unreachable!()
    };

    let _ = memory.write(&mut *caller, ptr as usize, s.as_bytes());
    let _ = memory.write(&mut *caller, ptr as usize + s.len(), &[0]);
}

pub fn string_to_wasm(caller: &mut Caller<'_, RuntimeContext>, s: &str) -> i32 {
    let Some(Extern::Global(global)) = caller.get_export("allocated") else {
        unreachable!()
    };
    let Val::I32(ptr) = global.get(&mut *caller) else {
        unreachable!()
    };
    let _ = global.set(&mut *caller, Val::I32(ptr + s.len() as i32 + 1));
    wasm_write_string(&mut *caller, ptr, s);

    ptr
}

pub fn string_to_wasm_instance(
    mut store: &mut Store<RuntimeContext>,
    instance: &Instance,
    s: &str,
) -> i32 {
    let Some(Extern::Memory(memory)) = instance.get_export(&mut store, "strings") else {
        unreachable!()
    };

    let Some(Extern::Global(global)) = instance.get_export(&mut store, "allocated") else {
        unreachable!()
    };
    let Val::I32(ptr) = global.get(&mut store) else {
        unreachable!()
    };
    let _ = global.set(&mut store, Val::I32(ptr + s.len() as i32 + 1));
    let _ = memory.write(&mut store, ptr as usize, s.as_bytes());
    let _ = memory.write(&mut store, ptr as usize + s.len(), &[0]);

    ptr
}

pub fn empty_stringref() -> i32 {
    0
}
