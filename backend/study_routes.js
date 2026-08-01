const express = require('express');
const router = express.Router();
const { pool } = require('./server'); 


function requireAuth(req, res, next) {
    if (!req.session.userId) {
        return res.status(401).json({ error: "not logged in" });
    }
    next();
}


router.get('/test', requireAuth, (req, res) => {
    res.json({ message: "You are logged in and this route is secure!" });
});


router.get('/sets/:id/study', requireAuth, (req, res) => {
    const { id } = req.params;
    res.json({ message: `Fetching flashcards for set ${id}...` });
});

module.exports = router;