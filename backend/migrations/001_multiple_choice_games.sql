ALTER TABLE games
  ADD COLUMN current_term_id INTEGER REFERENCES terms(id),
  ADD COLUMN current_choices JSONB,
  DROP COLUMN current_term_started_at;

ALTER TABLE game_players
  ADD COLUMN streak INTEGER NOT NULL DEFAULT 0,
  DROP COLUMN last_answered_term_index;

CREATE TABLE game_answers (
  id SERIAL PRIMARY KEY,
  game_player_id INTEGER NOT NULL REFERENCES game_players(id),
  term_id INTEGER NOT NULL REFERENCES terms(id),
  selected_term_id INTEGER REFERENCES terms(id),
  is_correct BOOLEAN NOT NULL,
  points_awarded INTEGER NOT NULL DEFAULT 0,
  answered_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (game_player_id, term_id)
);
