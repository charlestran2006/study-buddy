let express = require("express");
let { pool } = require("../db");
let { requireAuth, requireProfessor, requireStudent } = require("../middleware/auth");
let { generateJoinCode } = require("../utils/joinCode");

let router = express.Router();

router.post("/classrooms", requireAuth, requireProfessor, (req, res) => {
  let name = req.body.name;

  if (!name) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  let joinCode = generateJoinCode();

  pool.query(
    "INSERT INTO classrooms (professor_id, name, join_code) VALUES ($1, $2, $3) RETURNING id, name, join_code, created_at",
    [req.session.userId, name, joinCode],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(400).json({ error: "could not create classroom" });
        return;
      }

      res.status(200).json(result.rows[0]);
    }
  );
});

router.get("/classrooms", requireAuth, requireProfessor, (req, res) => {
  pool.query(
    `SELECT c.id, c.name, c.join_code, c.created_at,
            COUNT(cs.id)::int AS student_count
     FROM classrooms c
     LEFT JOIN classroom_students cs ON cs.classroom_id = c.id
     WHERE c.professor_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [req.session.userId],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      res.status(200).json(result.rows);
    }
  );
});

router.get("/classrooms/:id", requireAuth, requireProfessor, (req, res) => {
  let classroomId = req.params.id;

  pool.query(
    "SELECT id, name, join_code, created_at FROM classrooms WHERE id = $1 AND professor_id = $2",
    [classroomId, req.session.userId],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (result.rows.length === 0) {
        res.status(404).json({ error: "classroom not found" });
        return;
      }

      let classroom = result.rows[0];

      pool.query(
        `SELECT u.id, u.username, u.email, cs.joined_at
         FROM classroom_students cs
         JOIN users u ON u.id = cs.student_id
         WHERE cs.classroom_id = $1
         ORDER BY cs.joined_at ASC`,
        [classroomId],
        (err, studentsResult) => {
          if (err) {
            console.log(err);
            res.status(500).json({ error: "something went wrong" });
            return;
          }

          pool.query(
            `SELECT s.id, s.title, s.description, a.assigned_at
             FROM assignments a
             JOIN sets s ON s.id = a.set_id
             WHERE a.classroom_id = $1
             ORDER BY a.assigned_at DESC`,
            [classroomId],
            (err, setsResult) => {
              if (err) {
                console.log(err);
                res.status(500).json({ error: "something went wrong" });
                return;
              }

              res.status(200).json({
                ...classroom,
                students: studentsResult.rows,
                assigned_sets: setsResult.rows,
              });
            }
          );
        }
      );
    }
  );
});

router.post("/classrooms/join", requireAuth, requireStudent, (req, res) => {
  let code = req.body.code;

  if (!code) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  pool.query(
    "SELECT id, name FROM classrooms WHERE join_code = $1",
    [code.toUpperCase()],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (result.rows.length === 0) {
        res.status(404).json({ error: "invalid join code" });
        return;
      }

      let classroom = result.rows[0];

      pool.query(
        "INSERT INTO classroom_students (classroom_id, student_id) VALUES ($1, $2) RETURNING id",
        [classroom.id, req.session.userId],
        (err) => {
          if (err) {
            console.log(err);
            res.status(400).json({ error: "already joined this classroom" });
            return;
          }

          res.status(200).json(classroom);
        }
      );
    }
  );
});

router.get("/my-classrooms", requireAuth, requireStudent, (req, res) => {
  pool.query(
    `SELECT c.id, c.name, c.join_code, cs.joined_at, u.username AS professor_username
     FROM classroom_students cs
     JOIN classrooms c ON c.id = cs.classroom_id
     JOIN users u ON u.id = c.professor_id
     WHERE cs.student_id = $1
     ORDER BY cs.joined_at DESC`,
    [req.session.userId],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      res.status(200).json(result.rows);
    }
  );
});

module.exports = router;
