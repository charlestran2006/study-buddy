let express = require("express");
let app = express();

let port = 3000;
let hostname = "localhost";

app.get("/", (req, res) => {
  res.send("hello world");
});

app.listen(port, hostname, () => {
  console.log(`http://${hostname}:${port}`);
});