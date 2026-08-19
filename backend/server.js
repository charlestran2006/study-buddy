require("dotenv").config();
let http = require("http");
let { WebSocketServer } = require("ws");
let app = require("./app");
let { pool } = require("./db");
let createGameManager = require("./game");

let port = process.env.PORT || 3000;
let hostname = "0.0.0.0";

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
  console.log(`http://${hostname}:${port}`);
});
