const express = require('express');
const router = express.Router();
const { getDatabase } = require('../models/database');

// Middleware pour vérifier que c'est un admin
router.use((req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/login');
  }
  next();
});

// Dashboard admin
router.get('/dashboard', (req, res) => {
  res.render('admin/dashboard', { user: req.session.user });
});

module.exports = router;