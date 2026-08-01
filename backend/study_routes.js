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
    
    const query = `
        SELECT t.* 
        FROM terms t
        JOIN sets s ON t.set_id = s.id
        WHERE t.set_id = $1 AND s.user_id = $2
        ORDER BY t.position;
    `;

    pool.query(query, [id, req.session.userId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "database query error" });
        }
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "set not found or access denied" });
        }

        res.status(200).json(result.rows);
    });
});

module.exports = router;