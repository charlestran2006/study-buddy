let express = require("express");
let session = require("express-session");
let path = require("path");

let authRoutes = require("./routes/auth.routes");
let classroomsRoutes = require("./routes/classrooms.routes");
let setsRoutes = require("./routes/sets.routes");
let assignmentsRoutes = require("./routes/assignments.routes");
let gamesRoutes = require("./routes/games.routes");
let studyRoutes = require("./routes/study.routes");
let favoritesRoutes = require("./routes/favorites.routes");

let app = express();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

let sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
});

app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.send("hello world");
});

app.use("/api", studyRoutes);
app.use(authRoutes);
app.use(classroomsRoutes);
app.use(setsRoutes);
app.use(assignmentsRoutes);
app.use(gamesRoutes);
app.use(favoritesRoutes);

app.sessionMiddleware = sessionMiddleware;
module.exports = app;
