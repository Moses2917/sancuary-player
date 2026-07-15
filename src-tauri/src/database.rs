use std::{fs, path::PathBuf, time::Duration};

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

#[derive(Clone)]
pub struct Database {
    path: PathBuf,
}

impl Database {
    pub fn new(app_data_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
        let database = Self {
            path: app_data_dir.join("sanctuary-player.sqlite3"),
        };
        database.initialize()?;
        Ok(database)
    }

    fn connect(&self) -> Result<Connection, String> {
        let connection = Connection::open(&self.path).map_err(|error| error.to_string())?;
        connection
            .busy_timeout(Duration::from_secs(10))
            .map_err(|error| error.to_string())?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;")
            .map_err(|error| error.to_string())?;
        Ok(connection)
    }

    fn initialize(&self) -> Result<(), String> {
        let connection = self.connect()?;
        connection
            .execute_batch(
                "
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS songs (
          id TEXT PRIMARY KEY NOT NULL,
          data TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS services (
          id TEXT PRIMARY KEY NOT NULL,
          data TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
          id TEXT PRIMARY KEY NOT NULL,
          data TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audio_tracks (
          song_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('piano', 'choir')),
          mime TEXT NOT NULL,
          data BLOB NOT NULL,
          PRIMARY KEY (song_id, kind)
        );
        CREATE TABLE IF NOT EXISTS staged_audio_tracks (
          upload_id TEXT NOT NULL,
          kind TEXT NOT NULL CHECK(kind IN ('piano', 'choir')),
          mime TEXT NOT NULL,
          data BLOB NOT NULL,
          PRIMARY KEY (upload_id, kind)
        );
        DELETE FROM staged_audio_tracks;
        CREATE INDEX IF NOT EXISTS songs_created_at ON songs(created_at);
        CREATE INDEX IF NOT EXISTS services_created_at ON services(created_at);
        ",
            )
            .map_err(|error| error.to_string())
    }

    pub fn get_all_songs(&self) -> Result<Vec<Value>, String> {
        self.get_all_records("songs")
    }

    pub fn get_song(&self, id: &str) -> Result<Option<Value>, String> {
        self.get_record("songs", id)
    }

    pub fn put_song(&self, song: Value, upload_id: Option<&str>) -> Result<(), String> {
        let (id, created_at) = record_identity(&song)?;
        let bundled = song
            .get("bundled")
            .and_then(Value::as_bool)
            .ok_or("Song is missing its bundled flag.")?;
        let data = serde_json::to_string(&song).map_err(|error| error.to_string())?;
        let mut connection = self.connect()?;
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;

        if !bundled {
            let stored_track_count: i64 = transaction
                .query_row(
                    "SELECT COUNT(*) FROM audio_tracks WHERE song_id = ?1",
                    params![id],
                    |row| row.get(0),
                )
                .map_err(|error| error.to_string())?;
            let staged_track_count = match upload_id {
                Some(upload_id) => transaction
                    .query_row(
                        "SELECT COUNT(*) FROM staged_audio_tracks WHERE upload_id = ?1",
                        params![upload_id],
                        |row| row.get::<_, i64>(0),
                    )
                    .map_err(|error| error.to_string())?,
                None => 0,
            };
            if stored_track_count + staged_track_count < 2 {
                return Err(
                    "Both piano and choir audio must be imported before saving a song.".into(),
                );
            }
        }

        transaction
            .execute(
                "INSERT INTO songs (id, data, created_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at",
                params![id, data, created_at],
            )
            .map_err(|error| error.to_string())?;

        if let Some(upload_id) = upload_id {
            for kind in ["piano", "choir"] {
                transaction
                    .execute(
                        "INSERT INTO audio_tracks (song_id, kind, mime, data)
             SELECT ?1, kind, mime, data FROM staged_audio_tracks
             WHERE upload_id = ?2 AND kind = ?3
             ON CONFLICT(song_id, kind) DO UPDATE SET mime = excluded.mime, data = excluded.data",
                        params![id, upload_id, kind],
                    )
                    .map_err(|error| error.to_string())?;
            }
            transaction
                .execute(
                    "DELETE FROM staged_audio_tracks WHERE upload_id = ?1",
                    params![upload_id],
                )
                .map_err(|error| error.to_string())?;
        }

        transaction.commit().map_err(|error| error.to_string())
    }

    pub fn delete_song(&self, id: &str) -> Result<(), String> {
        self.delete_song_records(id)
    }

    pub fn get_all_services(&self) -> Result<Vec<Value>, String> {
        self.get_all_records("services")
    }

    pub fn get_service(&self, id: &str) -> Result<Option<Value>, String> {
        self.get_record("services", id)
    }

    pub fn put_service(&self, service: Value) -> Result<(), String> {
        self.put_record("services", service)
    }

    pub fn delete_service(&self, id: &str) -> Result<(), String> {
        validate_id(id)?;
        let connection = self.connect()?;
        connection
            .execute("DELETE FROM services WHERE id = ?1", params![id])
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn get_settings(&self) -> Result<Option<Value>, String> {
        self.get_record("settings", "app")
    }

    pub fn save_settings(&self, settings: Value) -> Result<(), String> {
        let id = settings
            .get("id")
            .and_then(Value::as_str)
            .ok_or("Settings are missing their id.")?;
        if id != "app" {
            return Err("Only the application settings record can be saved.".into());
        }
        let data = serde_json::to_string(&settings).map_err(|error| error.to_string())?;
        let connection = self.connect()?;
        connection
            .execute(
                "INSERT INTO settings (id, data) VALUES (?1, ?2)
         ON CONFLICT(id) DO UPDATE SET data = excluded.data",
                params![id, data],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn clear_all(&self) -> Result<(), String> {
        let connection = self.connect()?;
        connection
            .execute_batch(
                "BEGIN;
         DELETE FROM audio_tracks;
         DELETE FROM staged_audio_tracks;
         DELETE FROM songs;
         DELETE FROM services;
         DELETE FROM settings;
         COMMIT;",
            )
            .map_err(|error| error.to_string())
    }

    pub fn stage_audio(
        &self,
        upload_id: &str,
        kind: &str,
        mime: &str,
        data: &[u8],
    ) -> Result<(), String> {
        validate_id(upload_id)?;
        validate_track_kind(kind)?;
        if data.is_empty() {
            return Err("Imported audio file is empty.".into());
        }
        let connection = self.connect()?;
        connection
      .execute(
        "INSERT INTO staged_audio_tracks (upload_id, kind, mime, data) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(upload_id, kind) DO UPDATE SET mime = excluded.mime, data = excluded.data",
        params![upload_id, kind, normalized_mime(mime), data],
      )
      .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn read_audio(&self, song_id: &str, kind: &str) -> Result<(String, Vec<u8>), String> {
        validate_id(song_id)?;
        validate_track_kind(kind)?;
        let connection = self.connect()?;
        connection
            .query_row(
                "SELECT mime, data FROM audio_tracks WHERE song_id = ?1 AND kind = ?2",
                params![song_id, kind],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "Audio track was not found.".into())
    }

    pub fn read_audio_range(
        &self,
        song_id: &str,
        kind: &str,
        start: i64,
        length: i64,
    ) -> Result<(String, Vec<u8>), String> {
        validate_id(song_id)?;
        validate_track_kind(kind)?;
        let connection = self.connect()?;
        connection
      .query_row(
        "SELECT mime, substr(data, ?3, ?4) FROM audio_tracks WHERE song_id = ?1 AND kind = ?2",
        params![song_id, kind, start + 1, length],
        |row| Ok((row.get(0)?, row.get(1)?)),
      )
      .optional()
      .map_err(|error| error.to_string())?
      .ok_or_else(|| "Audio track was not found.".into())
    }

    pub fn audio_length(&self, song_id: &str, kind: &str) -> Result<(String, i64), String> {
        validate_id(song_id)?;
        validate_track_kind(kind)?;
        let connection = self.connect()?;
        connection
            .query_row(
                "SELECT mime, length(data) FROM audio_tracks WHERE song_id = ?1 AND kind = ?2",
                params![song_id, kind],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()
            .map_err(|error| error.to_string())?
            .ok_or_else(|| "Audio track was not found.".into())
    }

    fn get_all_records(&self, table: &str) -> Result<Vec<Value>, String> {
        let connection = self.connect()?;
        let mut statement = connection
            .prepare(&format!("SELECT data FROM {table} ORDER BY created_at ASC"))
            .map_err(|error| error.to_string())?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|error| error.to_string())?;
        rows.map(|row| {
            let data = row.map_err(|error| error.to_string())?;
            serde_json::from_str(&data).map_err(|error| error.to_string())
        })
        .collect()
    }

    fn get_record(&self, table: &str, id: &str) -> Result<Option<Value>, String> {
        if table != "settings" {
            validate_id(id)?;
        }
        let connection = self.connect()?;
        let data = connection
            .query_row(
                &format!("SELECT data FROM {table} WHERE id = ?1"),
                params![id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        data.map(|data| serde_json::from_str(&data).map_err(|error| error.to_string()))
            .transpose()
    }

    fn put_record(&self, table: &str, record: Value) -> Result<(), String> {
        let (id, created_at) = record_identity(&record)?;
        let data = serde_json::to_string(&record).map_err(|error| error.to_string())?;
        let connection = self.connect()?;
        connection
            .execute(
                &format!(
                    "INSERT INTO {table} (id, data, created_at) VALUES (?1, ?2, ?3)
           ON CONFLICT(id) DO UPDATE SET data = excluded.data, created_at = excluded.created_at"
                ),
                params![id, data, created_at],
            )
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    fn delete_song_records(&self, id: &str) -> Result<(), String> {
        validate_id(id)?;
        let mut connection = self.connect()?;
        let transaction = connection
            .transaction()
            .map_err(|error| error.to_string())?;
        transaction
            .execute("DELETE FROM audio_tracks WHERE song_id = ?1", params![id])
            .map_err(|error| error.to_string())?;
        transaction
            .execute("DELETE FROM songs WHERE id = ?1", params![id])
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())
    }
}

fn record_identity(record: &Value) -> Result<(&str, i64), String> {
    let id = record
        .get("id")
        .and_then(Value::as_str)
        .ok_or("Record is missing its id.")?;
    validate_id(id)?;
    let created_at = record
        .get("createdAt")
        .and_then(Value::as_i64)
        .ok_or("Record is missing its createdAt timestamp.")?;
    Ok((id, created_at))
}

fn validate_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err("Invalid record id.".into());
    }
    Ok(())
}

fn validate_track_kind(kind: &str) -> Result<(), String> {
    if matches!(kind, "piano" | "choir") {
        Ok(())
    } else {
        Err("Invalid audio track kind.".into())
    }
}

fn normalized_mime(mime: &str) -> &str {
    if mime.starts_with("audio/") {
        mime
    } else {
        "application/octet-stream"
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        time::{SystemTime, UNIX_EPOCH},
    };

    use serde_json::json;

    use super::Database;

    #[test]
    fn commits_imported_tracks_as_sqlite_blobs() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("sanctuary-player-test-{unique}"));
        let database = Database::new(root.clone()).unwrap();

        database
            .stage_audio("upload_1", "piano", "audio/wav", &[1, 2, 3])
            .unwrap();
        database
            .stage_audio("upload_1", "choir", "audio/wav", &[4, 5, 6, 7])
            .unwrap();
        database
            .put_song(
                json!({
                  "id": "song_1",
                  "title": "Test Hymn",
                  "piano": { "name": "piano.wav", "type": "audio/wav" },
                  "choir": { "name": "choir.wav", "type": "audio/wav" },
                  "bundled": false,
                  "createdAt": 1
                }),
                Some("upload_1"),
            )
            .unwrap();

        assert_eq!(
            database.read_audio("song_1", "piano").unwrap().1,
            vec![1, 2, 3]
        );
        assert_eq!(
            database.read_audio("song_1", "choir").unwrap().1,
            vec![4, 5, 6, 7]
        );
        assert_eq!(database.audio_length("song_1", "choir").unwrap().1, 4);

        fs::remove_dir_all(root).unwrap();
    }
}
