require("dotenv").config();
let express = require("express");
let bcrypt = require("bcrypt");
let { Pool } = require("pg");

let app = express();
let port = process.env.PORT || 3000;
let hostname = "0.0.0.0";

let pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

app.use(express.json());

app.get("/", (req, res) => {
  res.send("hello world");
});

app.post("/signup", (req, res) => {
  let username = req.body.username;
  let email = req.body.email;
  let password = req.body.password;

  if (!username || !email || !password) {
    res.status(400).json({ error: "missing fields" });
    return;
  }

  bcrypt.hash(password, 10, (err, hash) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "something went wrong" });
      return;
    }

    pool.query(
      "INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email",
      [username, email, hash],
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

app.listen(port, hostname, () => {
  console.log(`http://${hostname}:${port}`);
});