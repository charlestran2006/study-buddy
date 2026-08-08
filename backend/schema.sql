CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'professor')),
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

CREATE TABLE classrooms (
  id SERIAL PRIMARY KEY,
  professor_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  join_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE classroom_students (
  id SERIAL PRIMARY KEY,
  classroom_id INTEGER REFERENCES classrooms(id),
  student_id INTEGER REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (classroom_id, student_id)
);

CREATE TABLE assignments (
  id SERIAL PRIMARY KEY,
  set_id INTEGER REFERENCES sets(id),
  classroom_id INTEGER REFERENCES classrooms(id),
  assigned_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (set_id, classroom_id)
);