const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

router.get('/test', requireAuth, (req, res) => {
    res.json({ message: "You are logged in and this route is secure!" });
});

// Get all study sets available to the logged-in student/user
router.get('/my-study-sets', requireAuth, async (req, res) => {
    const userId = req.session.userId;

    const query = `
        SELECT s.id, s.title, s.description, u.username AS author,
               COUNT(t.id)::int AS term_count,
               (s.user_id = $1) AS is_owner,
               EXISTS (SELECT 1 FROM favorites f WHERE f.set_id = s.id AND f.user_id = $1) AS is_favorited,
               CASE 
                   WHEN s.user_id = $1 THEN 'My Saved Sets'
                   WHEN EXISTS (
                       SELECT 1 FROM assignments a 
                       JOIN classroom_students cs ON cs.classroom_id = a.classroom_id 
                       WHERE a.set_id = s.id AND cs.student_id = $1
                   ) THEN 'Classroom Assignment'
                   WHEN EXISTS (SELECT 1 FROM favorites f WHERE f.set_id = s.id AND f.user_id = $1) THEN 'Favorite'
                   ELSE 'Public Set'
               END AS source_type,
               (
                   SELECT string_agg(c.name, ', ')
                   FROM classrooms c
                   JOIN assignments a ON a.classroom_id = c.id
                   JOIN classroom_students cs ON cs.classroom_id = c.id
                   WHERE a.set_id = s.id AND cs.student_id = $1
               ) AS classroom_names
        FROM sets s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN terms t ON t.set_id = s.id
        WHERE s.user_id = $1
           OR EXISTS (SELECT 1 FROM favorites f WHERE f.set_id = s.id AND f.user_id = $1)
           OR EXISTS (
               SELECT 1 FROM assignments a
               JOIN classroom_students cs ON cs.classroom_id = a.classroom_id
               WHERE a.set_id = s.id AND cs.student_id = $1
           )
        GROUP BY s.id, s.title, s.description, u.username, s.user_id
        ORDER BY 
            CASE 
                WHEN s.user_id = $1 THEN 1
                WHEN EXISTS (SELECT 1 FROM assignments a JOIN classroom_students cs ON cs.classroom_id = a.classroom_id WHERE a.set_id = s.id AND cs.student_id = $1) THEN 2
                WHEN EXISTS (SELECT 1 FROM favorites f WHERE f.set_id = s.id AND f.user_id = $1) THEN 3
                ELSE 4
            END,
            s.title ASC;
    `;

    try {
        const result = await pool.query(query, [userId]);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "database query error" });
    }
});

// Get terms for a study set by ID (accessible if public, favorited, assigned in student's class, or owned)
router.get('/sets/:id/study', requireAuth, async (req, res) => {
    const { id } = req.params;
    const userId = req.session.userId;

    const query = `
        SELECT s.id AS set_id, s.title, s.description, t.id, t.term, t.definition, t.position
        FROM sets s
        JOIN terms t ON t.set_id = s.id
        WHERE s.id = $1
          AND (
            s.user_id = $2
            OR s.is_public = TRUE
            OR EXISTS (SELECT 1 FROM favorites f WHERE f.set_id = s.id AND f.user_id = $2)
            OR EXISTS (
                SELECT 1 FROM assignments a
                JOIN classroom_students cs ON cs.classroom_id = a.classroom_id
                WHERE a.set_id = s.id AND cs.student_id = $2
            )
          )
        ORDER BY t.position ASC;
    `;

    try {
        const result = await pool.query(query, [id, userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "set not found or access denied" });
        }

        const firstRow = result.rows[0];
        const studySet = {
            id: firstRow.set_id,
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
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "database query error" });
    }
});

router.get('/classrooms/:classroomId/assignment', requireAuth, (req, res) => {
    const { classroomId } = req.params;

    const query = `
        SELECT t.id, t.term, t.definition, t.position, s.id AS set_id, s.title, s.description
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
            id: firstRow.set_id,
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

module.exports = router;

