CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hunts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  hunt_name TEXT,
  content_hash TEXT NOT NULL UNIQUE,
  session_type TEXT NOT NULL CHECK (session_type IN ('player', 'party')),
  status TEXT,
  start_time TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  paused_seconds INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  kills_per_hour INTEGER NOT NULL DEFAULT 0,
  rare_kills INTEGER NOT NULL DEFAULT 0,
  rare_kills_per_hour INTEGER NOT NULL DEFAULT 0,
  experience INTEGER NOT NULL DEFAULT 0,
  experience_per_hour INTEGER NOT NULL DEFAULT 0,
  damage_dealt INTEGER NOT NULL DEFAULT 0,
  damage_dealt_per_second INTEGER NOT NULL DEFAULT 0,
  damage_taken INTEGER NOT NULL DEFAULT 0,
  damage_taken_per_second INTEGER NOT NULL DEFAULT 0,
  supplies_cost INTEGER NOT NULL DEFAULT 0,
  supplies_per_hour INTEGER NOT NULL DEFAULT 0,
  raw_gains INTEGER NOT NULL DEFAULT 0,
  raw_gains_per_hour INTEGER NOT NULL DEFAULT 0,
  profit INTEGER NOT NULL DEFAULT 0,
  profit_per_hour INTEGER NOT NULL DEFAULT 0,
  time_to_next_level_seconds INTEGER,
  jade_totem_count INTEGER NOT NULL DEFAULT 0,
  primary_player_id INTEGER REFERENCES players(id),
  raw_json TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_hunts_start_time ON hunts(start_time);
CREATE INDEX IF NOT EXISTS idx_hunts_profit_per_hour ON hunts(profit_per_hour);

CREATE TABLE IF NOT EXISTS hunt_players (
  hunt_id INTEGER NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (hunt_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_hunt_players_player ON hunt_players(player_id);

CREATE TABLE IF NOT EXISTS hunt_damage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hunt_id INTEGER NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  enemy TEXT NOT NULL,
  element TEXT,
  damage_dealt INTEGER NOT NULL DEFAULT 0,
  damage_taken INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hunt_damage_hunt ON hunt_damage(hunt_id);

CREATE TABLE IF NOT EXISTS hunt_supplies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hunt_id INTEGER NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  item TEXT NOT NULL,
  item_normalized TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total_price INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hunt_supplies_hunt ON hunt_supplies(hunt_id);
CREATE INDEX IF NOT EXISTS idx_hunt_supplies_item ON hunt_supplies(item_normalized);

CREATE TABLE IF NOT EXISTS hunt_drops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hunt_id INTEGER NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  item TEXT NOT NULL,
  item_normalized TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total_price INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER
);

CREATE INDEX IF NOT EXISTS idx_hunt_drops_hunt ON hunt_drops(hunt_id);
CREATE INDEX IF NOT EXISTS idx_hunt_drops_item ON hunt_drops(item_normalized);

CREATE TABLE IF NOT EXISTS hunt_experience (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hunt_id INTEGER NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  experience INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hunt_experience_hunt ON hunt_experience(hunt_id);

CREATE TABLE IF NOT EXISTS hunt_enemies_defeated (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hunt_id INTEGER NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  enemy TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  rare INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER,
  from_nightmare_crystal INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hunt_enemies_hunt ON hunt_enemies_defeated(hunt_id);

CREATE TABLE IF NOT EXISTS terrors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  terror_name TEXT,
  content_hash TEXT NOT NULL UNIQUE,
  session_type TEXT NOT NULL CHECK (session_type IN ('player', 'party')),
  status TEXT,
  start_time TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  paused_seconds INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  kills_per_hour INTEGER NOT NULL DEFAULT 0,
  rare_kills INTEGER NOT NULL DEFAULT 0,
  rare_kills_per_hour INTEGER NOT NULL DEFAULT 0,
  experience INTEGER NOT NULL DEFAULT 0,
  experience_per_hour INTEGER NOT NULL DEFAULT 0,
  damage_dealt INTEGER NOT NULL DEFAULT 0,
  damage_dealt_per_second INTEGER NOT NULL DEFAULT 0,
  damage_taken INTEGER NOT NULL DEFAULT 0,
  damage_taken_per_second INTEGER NOT NULL DEFAULT 0,
  supplies_cost INTEGER NOT NULL DEFAULT 0,
  supplies_per_hour INTEGER NOT NULL DEFAULT 0,
  raw_gains INTEGER NOT NULL DEFAULT 0,
  raw_gains_per_hour INTEGER NOT NULL DEFAULT 0,
  profit INTEGER NOT NULL DEFAULT 0,
  profit_per_hour INTEGER NOT NULL DEFAULT 0,
  time_to_next_level_seconds INTEGER,
  primary_player_id INTEGER REFERENCES players(id),
  raw_json TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_terrors_start_time ON terrors(start_time);
CREATE INDEX IF NOT EXISTS idx_terrors_profit_per_hour ON terrors(profit_per_hour);

CREATE TABLE IF NOT EXISTS terror_players (
  terror_id INTEGER NOT NULL REFERENCES terrors(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (terror_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_terror_players_player ON terror_players(player_id);

CREATE TABLE IF NOT EXISTS terror_damage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  terror_id INTEGER NOT NULL REFERENCES terrors(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  enemy TEXT NOT NULL,
  element TEXT,
  damage_dealt INTEGER NOT NULL DEFAULT 0,
  damage_taken INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_terror_damage_terror ON terror_damage(terror_id);

CREATE TABLE IF NOT EXISTS terror_supplies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  terror_id INTEGER NOT NULL REFERENCES terrors(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  item TEXT NOT NULL,
  item_normalized TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total_price INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER
);

CREATE INDEX IF NOT EXISTS idx_terror_supplies_terror ON terror_supplies(terror_id);
CREATE INDEX IF NOT EXISTS idx_terror_supplies_item ON terror_supplies(item_normalized);

CREATE TABLE IF NOT EXISTS terror_drops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  terror_id INTEGER NOT NULL REFERENCES terrors(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  item TEXT NOT NULL,
  item_normalized TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total_price INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER
);

CREATE INDEX IF NOT EXISTS idx_terror_drops_terror ON terror_drops(terror_id);
CREATE INDEX IF NOT EXISTS idx_terror_drops_item ON terror_drops(item_normalized);

CREATE TABLE IF NOT EXISTS terror_experience (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  terror_id INTEGER NOT NULL REFERENCES terrors(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  experience INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_terror_experience_terror ON terror_experience(terror_id);

CREATE TABLE IF NOT EXISTS terror_enemies_defeated (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  terror_id INTEGER NOT NULL REFERENCES terrors(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  enemy TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  rare INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER
);

CREATE INDEX IF NOT EXISTS idx_terror_enemies_terror ON terror_enemies_defeated(terror_id);

CREATE TABLE IF NOT EXISTS mds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  md_name TEXT,
  difficulty TEXT CHECK (difficulty IN ('Grand Master', 'Master', 'Hyper', 'Ultra', 'Platinum')),
  content_hash TEXT NOT NULL UNIQUE,
  session_type TEXT NOT NULL CHECK (session_type IN ('player', 'party')),
  status TEXT,
  start_time TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  paused_seconds INTEGER NOT NULL DEFAULT 0,
  kills INTEGER NOT NULL DEFAULT 0,
  kills_per_hour INTEGER NOT NULL DEFAULT 0,
  rare_kills INTEGER NOT NULL DEFAULT 0,
  rare_kills_per_hour INTEGER NOT NULL DEFAULT 0,
  experience INTEGER NOT NULL DEFAULT 0,
  experience_per_hour INTEGER NOT NULL DEFAULT 0,
  damage_dealt INTEGER NOT NULL DEFAULT 0,
  damage_dealt_per_second INTEGER NOT NULL DEFAULT 0,
  damage_taken INTEGER NOT NULL DEFAULT 0,
  damage_taken_per_second INTEGER NOT NULL DEFAULT 0,
  supplies_cost INTEGER NOT NULL DEFAULT 0,
  supplies_per_hour INTEGER NOT NULL DEFAULT 0,
  raw_gains INTEGER NOT NULL DEFAULT 0,
  raw_gains_per_hour INTEGER NOT NULL DEFAULT 0,
  profit INTEGER NOT NULL DEFAULT 0,
  profit_per_hour INTEGER NOT NULL DEFAULT 0,
  time_to_next_level_seconds INTEGER,
  primary_player_id INTEGER REFERENCES players(id),
  raw_json TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mds_start_time ON mds(start_time);
CREATE INDEX IF NOT EXISTS idx_mds_profit_per_hour ON mds(profit_per_hour);

CREATE TABLE IF NOT EXISTS md_players (
  md_id INTEGER NOT NULL REFERENCES mds(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (md_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_md_players_player ON md_players(player_id);

CREATE TABLE IF NOT EXISTS md_damage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  md_id INTEGER NOT NULL REFERENCES mds(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  enemy TEXT NOT NULL,
  element TEXT,
  damage_dealt INTEGER NOT NULL DEFAULT 0,
  damage_taken INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_md_damage_md ON md_damage(md_id);

CREATE TABLE IF NOT EXISTS md_supplies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  md_id INTEGER NOT NULL REFERENCES mds(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  item TEXT NOT NULL,
  item_normalized TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total_price INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER
);

CREATE INDEX IF NOT EXISTS idx_md_supplies_md ON md_supplies(md_id);
CREATE INDEX IF NOT EXISTS idx_md_supplies_item ON md_supplies(item_normalized);

CREATE TABLE IF NOT EXISTS md_drops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  md_id INTEGER NOT NULL REFERENCES mds(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  item TEXT NOT NULL,
  item_normalized TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  unit_price INTEGER NOT NULL DEFAULT 0,
  total_price INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER
);

CREATE INDEX IF NOT EXISTS idx_md_drops_md ON md_drops(md_id);
CREATE INDEX IF NOT EXISTS idx_md_drops_item ON md_drops(item_normalized);

CREATE TABLE IF NOT EXISTS md_experience (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  md_id INTEGER NOT NULL REFERENCES mds(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  experience INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_md_experience_md ON md_experience(md_id);

CREATE TABLE IF NOT EXISTS md_enemies_defeated (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  md_id INTEGER NOT NULL REFERENCES mds(id) ON DELETE CASCADE,
  player_id INTEGER REFERENCES players(id),
  enemy TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  rare INTEGER NOT NULL DEFAULT 0,
  ignored INTEGER
);

CREATE INDEX IF NOT EXISTS idx_md_enemies_md ON md_enemies_defeated(md_id);

CREATE TABLE IF NOT EXISTS item_icons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  subcategory TEXT,
  filename TEXT NOT NULL,
  extension TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  icon_url TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_item_icons_name ON item_icons(name_normalized);
