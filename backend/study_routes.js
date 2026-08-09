const express = require('express');
const router = express.Router();
const { pool } = require('./db');


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


router.get('/classrooms/:classroomId/assignment', requireAuth, (req, res) => {
    const { classroomId } = req.params;

    const query = `
        SELECT t.id, t.term, t.definition, t.position, s.title, s.description
        FROM assignments a
        JOIN sets s ON a.set_id = s.id
        JOIN terms t ON t.set_id = s.id
        JOIN classroom_students cs ON cs.classroom_id = a.classroom_id
        WHERE a.classroom_id = $1 AND cs.student_id = $2
        ORDER BY t.position ASC;
    `;

    pool.query(query, [classroomId, req.session.userId], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "database query error" });
        }

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "assignment not found or unauthorized" });
        }

        const firstRow = result.rows[0];
        const studySet = {
            title: firstRow.title,
            description: firstRow.description,
            terms: result.rows.map(row => ({
                id: row.id,
                term: row.term,
                definition: row.definition,
                position: row.position
            }))
        };

        res.status(200).json(studySet);
    });
});


router.post('/sessions/start', requireAuth, (req, res) => {
    const { classroom_id, set_id } = req.body;

    const query = `
        INSERT INTO live_sessions (classroom_id, set_id, current_term_index, is_active)
        VALUES ($1, $2, 0, TRUE)
        RETURNING id, classroom_id, set_id, current_term_index, is_active, started_at;
    `;

    pool.query(query, [classroom_id, set_id], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: "database query error" });
        }

        res.status(201).json(result.rows[0]);
    });
});

module.exports = router;