CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE terms (
  id SERIAL PRIMARY KEY,
  set_id INTEGER REFERENCES sets(id),
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  image_url TEXT,
  position INTEGER
);

CREATE TABLE progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  term_id INTEGER REFERENCES terms(id),
  correct_count INTEGER DEFAULT 0,
  incorrect_count INTEGER DEFAULT 0,
  mastered BOOLEAN DEFAULT FALSE,
  last_reviewed TIMESTAMP
);

CREATE TABLE favorites (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  set_id INTEGER REFERENCES sets(id),
  created_at TIMESTAMP DEFAULT NOW()
);