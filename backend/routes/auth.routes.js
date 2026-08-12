let express = require("express");
let bcrypt = require("bcrypt");
let { pool } = require("../db");

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

module.exports = router;
