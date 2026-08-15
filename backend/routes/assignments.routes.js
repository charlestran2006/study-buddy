let express = require("express");
let { pool } = require("../db");
let { requireAuth, requireProfessor } = require("../middleware/auth");

let router = express.Router();

router.post("/assignments", requireAuth, requireProfessor, (req, res) => {
  let setId = req.body.set_id;
  let classroomId = req.body.classroom_id;

  if (!setId || !classroomId) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  pool.query(
    "SELECT id FROM sets WHERE id = $1 AND user_id = $2",
    [setId, req.session.userId],
    (err, setResult) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (setResult.rows.length === 0) {
        res.status(404).json({ error: "study set not found" });
        return;
      }

      pool.query(
        "SELECT id FROM classrooms WHERE id = $1 AND professor_id = $2",
        [classroomId, req.session.userId],
        (err, classroomResult) => {
          if (err) {
            console.log(err);
            res.status(500).json({ error: "something went wrong" });
            return;
          }

          if (classroomResult.rows.length === 0) {
            res.status(404).json({ error: "classroom not found" });
            return;
          }

          pool.query(
            "INSERT INTO assignments (set_id, classroom_id) VALUES ($1, $2) RETURNING id, set_id, classroom_id, assigned_at",
            [setId, classroomId],
            (err, result) => {
              if (err) {
                console.log(err);
                res.status(400).json({ error: "already assigned to this classroom" });
                return;
              }

              res.status(200).json(result.rows[0]);
            }
          );
        }
      );
    }
  );
});

module.exports = router;
