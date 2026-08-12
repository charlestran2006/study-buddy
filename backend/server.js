require("dotenv").config();
let app = require("./app");

let port = process.env.PORT || 3000;
let hostname = "0.0.0.0";

app.listen(port, hostname, () => {
  console.log(`http://${hostname}:${port}`);
});
