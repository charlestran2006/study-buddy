let express = require("express");
let bcrypt = require("bcrypt");
let { pool } = require("../db");
let { requireAuth } = require("../middleware/auth");

let router = express.Router();

router.post("/signup", (req, res) => {
  let username = req.body.username;
  let email = req.body.email;
  let password = req.body.password;
  let role = req.body.role;

  if (!username || !email || !password) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  if (role !== "student" && role !== "professor") {
    res.status(400).json({ error: "role must be 'student' or 'professor'" });
    return;
  }

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "something went wrong" });
      return;
    }

    pool.query(
      "INSERT INTO users (username, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, username, email, role",
      [username, email, hash, role],
      (err, result) => {
        if (err) {
          console.log(err);
          res.status(400).json({ error: "could not create user" });
          return;
        }

        res.status(200).json(result.rows[0]);
      }
    );
  });
});

router.post("/login", (req, res) => {
  let username = req.body.username;
  let password = req.body.password;

  if (!username || !password) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  pool.query(
    "SELECT id, username, email, password_hash, role FROM users WHERE username = $1",
    [username],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (result.rows.length === 0) {
        res.status(401).json({ error: "invalid username or password" });
        return;
      }

      let user = result.rows[0];

      bcrypt.compare(password, user.password_hash, (err, match) => {
        if (err) {
          console.log(err);
          res.status(500).json({ error: "something went wrong" });
          return;
        }

        if (!match) {
          res.status(401).json({ error: "invalid username or password" });
          return;
        }

        req.session.userId = user.id;
        req.session.role = user.role;
        res.status(200).json({
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        });
      });
    }
  );
});

router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "something went wrong" });
      return;
    }
    res.clearCookie("connect.sid");
    res.status(200).json({ ok: true });
  });
});

router.get("/me", (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "not logged in" });
    return;
  }

  pool.query(
    "SELECT id, username, email, role FROM users WHERE id = $1",
    [req.session.userId],
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "something went wrong" });
        return;
      }

      if (result.rows.length === 0) {
        res.status(401).json({ error: "not logged in" });
        return;
      }

      res.status(200).json(result.rows[0]);
    }
  );
});

router.delete("/me", requireAuth, async (req, res) => {
  let userId = req.session.userId;

  try {
    let ownedSets = await pool.query("SELECT id FROM sets WHERE user_id = $1", [userId]);
    if (ownedSets.rows.length > 0) {
      res.status(409).json({ error: "delete your study sets before deleting your account" });
      return;
    }

    let ownedClassrooms = await pool.query("SELECT id FROM classrooms WHERE professor_id = $1", [userId]);
    if (ownedClassrooms.rows.length > 0) {
      res.status(409).json({ error: "delete your classrooms before deleting your account" });
      return;
    }

    let client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "DELETE FROM game_answers WHERE game_player_id IN (SELECT id FROM game_players WHERE student_id = $1)",
        [userId]
      );
      await client.query("DELETE FROM game_players WHERE student_id = $1", [userId]);
      await client.query("DELETE FROM progress WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM favorites WHERE user_id = $1", [userId]);
      await client.query("DELETE FROM classroom_students WHERE student_id = $1", [userId]);
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    req.session.destroy((err) => {
      if (err) {
        console.log(err);
      }
      res.clearCookie("connect.sid");
      res.status(200).json({ ok: true });
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "something went wrong" });
  }
});

module.exports = router;
