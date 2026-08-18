require("dotenv").config();
<<<<<<< HEAD
let app = require("./app");
=======
let http = require("http");
let { WebSocketServer } = require("ws");
let app = require("./app");
let { pool } = require("./db");
let createGameManager = require("./game");
>>>>>>> a500411f4be48ceb6c4b0f6d96aeb512920ef576

let port = process.env.PORT || 3000;
let hostname = "0.0.0.0";

<<<<<<< HEAD
app.listen(port, hostname, () => {
=======
let httpServer = http.createServer(app);
let wss = new WebSocketServer({ noServer: true });
let gameManager = createGameManager(pool);

httpServer.on("upgrade", (req, socket, head) => {
  app.sessionMiddleware(req, {}, () => {
    if (!req.session || !req.session.userId) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });
});

wss.on("connection", (ws, req) => {
  gameManager.handleConnection(ws, req);
});

httpServer.listen(port, hostname, () => {
>>>>>>> a500411f4be48ceb6c4b0f6d96aeb512920ef576
  console.log(`http://${hostname}:${port}`);
});
