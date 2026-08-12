function requireAuth(req, res, next) {
  if (!req.session.userId) {
    res.status(401).json({ error: "not logged in" });
    return;
  }
  next();
}

function requireProfessor(req, res, next) {
  if (req.session.role !== "professor") {
    res.status(403).json({ error: "professors only" });
    return;
  }
  next();
}

function requireStudent(req, res, next) {
  if (req.session.role !== "student") {
    res.status(403).json({ error: "students only" });
    return;
  }
  next();
}

module.exports = { requireAuth, requireProfessor, requireStudent };
