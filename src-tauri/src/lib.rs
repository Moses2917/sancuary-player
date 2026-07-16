mod database;

use std::{borrow::Cow, thread};

use database::Database;
use http::{
    header::{CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE},
    Method, Request, Response, StatusCode,
};
use percent_encoding::percent_decode_str;
use serde_json::Value;
use tauri::{
    ipc::{InvokeBody, Request as InvokeRequest, Response as InvokeResponse},
    Manager, State,
};

#[tauri::command]
fn get_all_songs(database: State<'_, Database>) -> Result<Vec<Value>, String> {
    database.get_all_songs()
}

#[tauri::command]
fn get_song(id: String, database: State<'_, Database>) -> Result<Option<Value>, String> {
    database.get_song(&id)
}

#[tauri::command]
fn put_song(
    song: Value,
    upload_id: Option<String>,
    database: State<'_, Database>,
) -> Result<(), String> {
    database.put_song(song, upload_id.as_deref())
}

#[tauri::command]
fn delete_song(id: String, database: State<'_, Database>) -> Result<(), String> {
    database.delete_song(&id)
}

#[tauri::command]
fn get_all_services(database: State<'_, Database>) -> Result<Vec<Value>, String> {
    database.get_all_services()
}

#[tauri::command]
fn get_service(id: String, database: State<'_, Database>) -> Result<Option<Value>, String> {
    database.get_service(&id)
}

#[tauri::command]
fn put_service(service: Value, database: State<'_, Database>) -> Result<(), String> {
    database.put_service(service)
}

#[tauri::command]
fn delete_service(id: String, database: State<'_, Database>) -> Result<(), String> {
    database.delete_service(&id)
}

#[tauri::command]
fn get_settings(database: State<'_, Database>) -> Result<Option<Value>, String> {
    database.get_settings()
}

#[tauri::command]
fn save_settings(settings: Value, database: State<'_, Database>) -> Result<(), String> {
    database.save_settings(settings)
}

#[tauri::command]
fn clear_all(database: State<'_, Database>) -> Result<(), String> {
    database.clear_all()
}

#[tauri::command]
fn stage_audio(request: InvokeRequest, database: State<'_, Database>) -> Result<(), String> {
    let data = audio_bytes(request.body())?;
    let upload_id = request_header(&request, "x-sanctuary-upload-id")?;
    let kind = request_header(&request, "x-sanctuary-track")?;
    let mime = request
        .headers()
        .get("x-sanctuary-mime")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("application/octet-stream");
    database.stage_audio(upload_id, kind, mime, &data)
}

/// Tauri normally sends a Uint8Array as raw IPC bytes. Some WebView transports
/// fall back to a JSON number array, so accept both encodings when staging audio.
fn audio_bytes(body: &InvokeBody) -> Result<Cow<'_, [u8]>, String> {
    match body {
        InvokeBody::Raw(data) => Ok(Cow::Borrowed(data)),
        InvokeBody::Json(Value::Array(values)) => values
            .iter()
            .map(|value| {
                value
                    .as_u64()
                    .filter(|byte| *byte <= u8::MAX.into())
                    .map(|byte| byte as u8)
                    .ok_or_else(|| "Audio upload contains invalid byte data.".to_owned())
            })
            .collect::<Result<Vec<_>, _>>()
            .map(Cow::Owned),
        _ => Err("Audio upload must contain binary data.".into()),
    }
}

#[tauri::command]
fn read_audio_blob(
    song_id: String,
    track: String,
    database: State<'_, Database>,
) -> Result<InvokeResponse, String> {
    let (_, data) = database.read_audio(&song_id, &track)?;
    Ok(InvokeResponse::new(data))
}

fn request_header<'a>(request: &'a InvokeRequest, name: &str) -> Result<&'a str, String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| format!("Audio upload is missing the {name} header."))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let database = Database::new(app_data_dir).map_err(std::io::Error::other)?;
            app.manage(database);
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol(
            "sanctuary-media",
            |context, request, responder| {
                let database = context.app_handle().state::<Database>().inner().clone();
                thread::spawn(move || responder.respond(media_response(&database, request)));
            },
        )
        .invoke_handler(tauri::generate_handler![
            get_all_songs,
            get_song,
            put_song,
            delete_song,
            get_all_services,
            get_service,
            put_service,
            delete_service,
            get_settings,
            save_settings,
            clear_all,
            stage_audio,
            read_audio_blob,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Sanctuary Player");
}

fn media_response(database: &Database, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    if !matches!(request.method(), &Method::GET | &Method::HEAD) {
        return error_response(
            StatusCode::METHOD_NOT_ALLOWED,
            "Only GET and HEAD are supported.",
        );
    }
    let Some((song_id, track)) = media_path(request.uri().path()) else {
        return error_response(StatusCode::BAD_REQUEST, "Invalid media URL.");
    };
    let Ok((mime, total)) = database.audio_length(&song_id, &track) else {
        return error_response(StatusCode::NOT_FOUND, "Audio track was not found.");
    };
    let range = request
        .headers()
        .get(RANGE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| parse_range(value, total));
    if request.headers().contains_key(RANGE) && range.is_none() {
        return Response::builder()
            .status(StatusCode::RANGE_NOT_SATISFIABLE)
            .header("accept-ranges", "bytes")
            .header(CONTENT_RANGE, format!("bytes */{total}"))
            .header("access-control-allow-origin", "*")
            .body(Vec::new())
            .unwrap_or_else(|_| {
                error_response(StatusCode::INTERNAL_SERVER_ERROR, "Could not serve audio.")
            });
    }
    let (start, end, status) = range.unwrap_or((0, total.saturating_sub(1), StatusCode::OK));
    let length = end.saturating_sub(start) + 1;
    let data = if request.method() == Method::HEAD {
        Vec::new()
    } else {
        match database.read_audio_range(&song_id, &track, start, length) {
            Ok((_, data)) => data,
            Err(_) => return error_response(StatusCode::NOT_FOUND, "Audio track was not found."),
        }
    };
    let mut response = Response::builder()
        .status(status)
        .header(CONTENT_TYPE, mime)
        .header(CONTENT_LENGTH, length)
        .header("accept-ranges", "bytes")
        .header("access-control-allow-origin", "*");
    if status == StatusCode::PARTIAL_CONTENT {
        response = response.header(CONTENT_RANGE, format!("bytes {start}-{end}/{total}"));
    }
    response.body(data).unwrap_or_else(|_| {
        error_response(StatusCode::INTERNAL_SERVER_ERROR, "Could not serve audio.")
    })
}

fn media_path(path: &str) -> Option<(String, String)> {
    let decoded_path = percent_decode_str(path.trim_start_matches('/'))
        .decode_utf8()
        .ok()?;
    let mut parts = decoded_path.split('/');
    let song_id = parts.next()?.to_owned();
    let track = parts.next()?;
    if parts.next().is_some() || !matches!(track, "piano" | "choir") {
        return None;
    }
    Some((song_id, track.to_owned()))
}

fn parse_range(value: &str, total: i64) -> Option<(i64, i64, StatusCode)> {
    if total <= 0 || !value.starts_with("bytes=") || value.contains(',') {
        return None;
    }
    let (start, end) = value[6..].split_once('-')?;
    let (start, end) = if start.is_empty() {
        let suffix = end.parse::<i64>().ok()?;
        if suffix <= 0 {
            return None;
        }
        (total.saturating_sub(suffix), total - 1)
    } else {
        let start = start.parse::<i64>().ok()?;
        let end = if end.is_empty() {
            total - 1
        } else {
            end.parse::<i64>().ok()?.min(total - 1)
        };
        (start, end)
    };
    if start < 0 || start >= total || end < start {
        return None;
    }
    Some((start, end, StatusCode::PARTIAL_CONTENT))
}

fn error_response(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .header("access-control-allow-origin", "*")
        .body(message.as_bytes().to_vec())
        .unwrap_or_else(|_| Response::new(Vec::new()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn audio_upload_accepts_raw_and_json_bytes() {
        assert_eq!(
            audio_bytes(&InvokeBody::Raw(vec![0, 128, 255]))
                .unwrap()
                .as_ref(),
            [0, 128, 255]
        );
        assert_eq!(
            audio_bytes(&InvokeBody::Json(serde_json::json!([0, 128, 255])))
                .unwrap()
                .as_ref(),
            [0, 128, 255]
        );
    }

    #[test]
    fn audio_upload_rejects_invalid_json_bytes() {
        let error = audio_bytes(&InvokeBody::Json(serde_json::json!([256]))).unwrap_err();
        assert_eq!(error, "Audio upload contains invalid byte data.");
    }
}
