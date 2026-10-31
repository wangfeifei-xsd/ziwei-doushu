CREATE TABLE birth_profiles (id TEXT PRIMARY KEY NOT NULL, form_json TEXT NOT NULL, saved_at INTEGER NOT NULL);
CREATE INDEX birth_profiles_saved_at ON birth_profiles(saved_at DESC, id);
CREATE TABLE app_settings (key TEXT PRIMARY KEY NOT NULL, value_json TEXT NOT NULL);
CREATE TABLE recent_history (id TEXT PRIMARY KEY NOT NULL, form_json TEXT NOT NULL, saved_at INTEGER NOT NULL);
