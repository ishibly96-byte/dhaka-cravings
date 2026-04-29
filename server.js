const app = require('./api/index.js');
const path = require('path');
const express = require('express');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '.')));

app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log('=========================================');
    console.log(`Local Dev Server: http://localhost:${PORT}/`);
    console.log('=========================================');
    console.log('Press Ctrl+C to stop.');
});
