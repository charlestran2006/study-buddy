const express = require('express');
const router = express.Router();

const { pool } = require('./server'); 


router.get('/test', (req, res) => {
    res.json({ message: "Study routes are active and connected!" });
});

module.exports = router;