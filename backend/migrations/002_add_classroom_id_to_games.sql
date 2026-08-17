ALTER TABLE games
  ADD COLUMN classroom_id INTEGER REFERENCES classrooms(id);
