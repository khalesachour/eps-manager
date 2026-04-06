const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { getDatabase } = require('../models/database');

// Page de connexion
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('login', { error: null });
});

// Traitement du formulaire de connexion
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const db = getDatabase();
  
  try {
    const user = await db.get(
      'SELECT * FROM users WHERE username = ?',
      username
    );
    
    if (!user) {
      return res.render('login', { error: '❌ Utilisateur non trouvé' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.render('login', { error: '❌ Mot de passe incorrect' });
    }
    
    // Stocker les infos de l'utilisateur dans la session
    req.session.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      class_id: user.class_id
    };
    
    res.redirect('/');
  } catch (error) {
    console.error(error);
    res.render('login', { error: 'Erreur lors de la connexion' });
  }
});

// Déconnexion
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;
