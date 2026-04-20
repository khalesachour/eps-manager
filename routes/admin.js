const express = require('express');
const router = express.Router();
const { getDatabase } = require('../models/database');
const bcrypt = require('bcrypt');

// Middleware pour vérifier que l'utilisateur est un administrateur
function isAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.redirect('/login');
  }
  next();
}

// Dashboard de l'administrateur
router.get('/dashboard', isAdmin, async (req, res) => {
  const db = getDatabase();
  try {
    const teachersCount = await db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'teacher'`);
    const studentsCount = await db.get(`SELECT COUNT(*) as count FROM users WHERE role = 'student'`);
    const classesCount = await db.get(`SELECT COUNT(*) as count FROM classes`);
    const apsCount = await db.get(`SELECT COUNT(*) as count FROM aps`);

    res.render('admin/dashboard', {
      user: req.session.user,
      title: 'Tableau de bord Administrateur',
      stats: {
        teachers: teachersCount.count || 0,
        students: studentsCount.count || 0,
        classes: classesCount.count || 0,
        aps: apsCount.count || 0
      }
    });
  } catch (error) {
    console.error('Erreur dashboard admin:', error);
    res.render('admin/dashboard', {
      user: req.session.user,
      title: 'Tableau de bord Administrateur',
      stats: { teachers: 0, students: 0, classes: 0, aps: 0 }
    });
  }
});

// ========== GESTION DES ENSEIGNANTS ==========

router.get('/teachers', isAdmin, async (req, res) => {
  const db = getDatabase();
  try {
    const teachers = await db.all(`
      SELECT id, username, full_name, created_at 
      FROM users 
      WHERE role = 'teacher' 
      ORDER BY created_at DESC
    `);
    res.render('admin/teachers', {
      user: req.session.user,
      teachers: teachers,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error(error);
    res.render('admin/teachers', {
      user: req.session.user,
      teachers: [],
      error: 'Erreur lors du chargement des enseignants',
      success: null
    });
  }
});

router.post('/teachers/create', isAdmin, async (req, res) => {
  const { full_name, username, password } = req.body;
  const db = getDatabase();

  if (!full_name || !username || !password) {
    return res.redirect('/admin/teachers?error=Tous les champs sont requis');
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.run(`
      INSERT INTO users (username, password, full_name, role)
      VALUES (?, ?, ?, 'teacher')
    `, username, hashedPassword, full_name);
    res.redirect('/admin/teachers?success=Enseignant créé avec succès');
  } catch (error) {
    console.error(error);
    if (error.code === 'SQLITE_CONSTRAINT') {
      res.redirect('/admin/teachers?error=Nom d\'utilisateur déjà existant');
    } else {
      res.redirect('/admin/teachers?error=Erreur lors de la création');
    }
  }
});

router.post('/teachers/delete/:id', isAdmin, async (req, res) => {
  const teacherId = req.params.id;
  const db = getDatabase();
  try {
    await db.run('DELETE FROM users WHERE id = ? AND role = "teacher"', teacherId);
    res.redirect('/admin/teachers?success=Enseignant supprimé avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/admin/teachers?error=Erreur lors de la suppression');
  }
});

// ========== GESTION DES COMPTES UTILISATEURS ==========

router.get('/users', isAdmin, async (req, res) => {
  const db = getDatabase();
  try {
    const users = await db.all(`
      SELECT u.id, u.username, u.full_name, u.role, u.is_active, u.created_at,
             s.student_number, s.gender,
             c.name as class_name
      FROM users u
      LEFT JOIN students s ON u.id = s.user_id
      LEFT JOIN classes c ON u.class_id = c.id
      ORDER BY u.role, u.full_name
    `);
    res.render('admin/users', {
      user: req.session.user,
      users: users,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error('Erreur /admin/users:', error);
    res.render('admin/users', {
      user: req.session.user,
      users: [],
      error: 'Erreur lors du chargement des utilisateurs',
      success: null
    });
  }
});

router.post('/users/toggle/:id', isAdmin, async (req, res) => {
  const userId = req.params.id;
  const db = getDatabase();
  try {
    const u = await db.get('SELECT is_active, role FROM users WHERE id = ?', userId);
    if (!u) return res.redirect('/admin/users?error=Utilisateur introuvable');
    if (u.role === 'admin') return res.redirect('/admin/users?error=Impossible de désactiver un administrateur');
    const newState = u.is_active ? 0 : 1;
    await db.run('UPDATE users SET is_active = ? WHERE id = ?', newState, userId);
    const msg = newState ? 'Compte activé avec succès' : 'Compte désactivé avec succès';
    res.redirect('/admin/users?success=' + encodeURIComponent(msg));
  } catch (error) {
    console.error(error);
    res.redirect('/admin/users?error=Erreur lors de la mise à jour');
  }
});

router.post('/users/reset-password/:id', isAdmin, async (req, res) => {
  const userId = req.params.id;
  const { new_password } = req.body;
  const db = getDatabase();
  if (!new_password || new_password.length < 4) {
    return res.redirect('/admin/users?error=Mot de passe trop court (minimum 4 caractères)');
  }
  try {
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await db.run('UPDATE users SET password = ? WHERE id = ?', hashedPassword, userId);
    res.redirect('/admin/users?success=Mot de passe réinitialisé avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/admin/users?error=Erreur lors de la réinitialisation');
  }
});

router.post('/users/delete/:id', isAdmin, async (req, res) => {
  const userId = req.params.id;
  const db = getDatabase();
  try {
    const u = await db.get('SELECT role FROM users WHERE id = ?', userId);
    if (!u) return res.redirect('/admin/users?error=Utilisateur introuvable');
    if (u.role === 'admin') return res.redirect('/admin/users?error=Impossible de supprimer un administrateur');
    if (u.role === 'student') {
      await db.run('DELETE FROM grades WHERE student_id = ?', userId);
      await db.run('DELETE FROM students WHERE user_id = ?', userId);
    }
    await db.run('DELETE FROM users WHERE id = ?', userId);
    res.redirect('/admin/users?success=Compte supprimé avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/admin/users?error=Erreur lors de la suppression');
  }
});

// ========== GESTION DES CLASSES ==========

router.get('/classes', isAdmin, async (req, res) => {
  const db = getDatabase();
  try {
    const classes = await db.all(`
      SELECT c.*, u.full_name as teacher_name,
             (SELECT COUNT(*) FROM users WHERE class_id = c.id AND role = 'student') as student_count
      FROM classes c
      LEFT JOIN users u ON c.teacher_id = u.id
      ORDER BY c.academic_year DESC, c.name
    `);
    const teachers = await db.all(`SELECT id, full_name FROM users WHERE role = 'teacher' ORDER BY full_name`);
    res.render('admin/classes', {
      user: req.session.user,
      classes: classes,
      teachers: teachers,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error('Erreur /admin/classes:', error);
    res.render('admin/classes', {
      user: req.session.user,
      classes: [],
      teachers: [],
      error: 'Erreur lors du chargement des classes',
      success: null
    });
  }
});

router.post('/classes/create', isAdmin, async (req, res) => {
  const { name, academic_year, teacher_id } = req.body;
  const db = getDatabase();
  if (!name) return res.redirect('/admin/classes?error=Nom de classe requis');
  try {
    await db.run(`
      INSERT INTO classes (name, academic_year, teacher_id, is_active)
      VALUES (?, ?, ?, 0)
    `, name, academic_year || new Date().getFullYear().toString(), teacher_id || null);
    res.redirect('/admin/classes?success=Classe créée avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/admin/classes?error=Erreur lors de la création');
  }
});

router.post('/classes/edit/:id', isAdmin, async (req, res) => {
  const classId = req.params.id;
  const { name, academic_year, teacher_id } = req.body;
  const db = getDatabase();
  if (!name) return res.redirect('/admin/classes?error=Nom de classe requis');
  try {
    await db.run(`
      UPDATE classes SET name = ?, academic_year = ?, teacher_id = ? WHERE id = ?
    `, name, academic_year || new Date().getFullYear().toString(), teacher_id || null, classId);
    res.redirect('/admin/classes?success=Classe modifiée avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/admin/classes?error=Erreur lors de la modification');
  }
});

router.post('/classes/delete/:id', isAdmin, async (req, res) => {
  const classId = req.params.id;
  const db = getDatabase();
  try {
    const studentsCount = await db.get(`SELECT COUNT(*) as count FROM users WHERE class_id = ? AND role = 'student'`, classId);
    if (studentsCount.count > 0) {
      return res.redirect('/admin/classes?error=Impossible de supprimer une classe qui contient des élèves');
    }
    await db.run('DELETE FROM classes WHERE id = ?', classId);
    res.redirect('/admin/classes?success=Classe supprimée avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/admin/classes?error=Erreur lors de la suppression');
  }
});

// ========== GESTION DES ACTIVITÉS SPORTIVES (APS) ==========

router.get('/aps', isAdmin, async (req, res) => {
  const db = getDatabase();
  try {
    const apsList = await db.all(`
      SELECT a.*,
             (SELECT COUNT(*) FROM evaluations WHERE aps_id = a.id) as eval_count
      FROM aps a
      ORDER BY a.name
    `);
    res.render('admin/aps', {
      user: req.session.user,
      apsList: apsList,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error('Erreur /admin/aps:', error);
    res.render('admin/aps', {
      user: req.session.user,
      apsList: [],
      error: 'Erreur lors du chargement des activités',
      success: null
    });
  }
});

router.post('/aps/create', isAdmin, async (req, res) => {
  const { name, type, default_config } = req.body;
  const db = getDatabase();
  if (!name || !type) return res.redirect('/admin/aps?error=Nom et type requis');
  try {
    let configJson = '{}';
    if (default_config && default_config.trim() !== '') {
      try { JSON.parse(default_config); configJson = default_config.trim(); }
      catch (e) { return res.redirect('/admin/aps?error=Configuration JSON invalide'); }
    }
    await db.run(`INSERT INTO aps (name, type, default_config) VALUES (?, ?, ?)`, name, type, configJson);
    res.redirect('/admin/aps?success=Activité sportive créée avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/admin/aps?error=Erreur lors de la création');
  }
});

router.post('/aps/edit/:id', isAdmin, async (req, res) => {
  const apsId = req.params.id;
  const { name, type, default_config } = req.body;
  const db = getDatabase();
  if (!name || !type) return res.redirect('/admin/aps?error=Nom et type requis');
  try {
    let configJson = '{}';
    if (default_config && default_config.trim() !== '') {
      try { JSON.parse(default_config); configJson = default_config.trim(); }
      catch (e) { return res.redirect('/admin/aps?error=Configuration JSON invalide'); }
    }
    await db.run(`UPDATE aps SET name = ?, type = ?, default_config = ? WHERE id = ?`, name, type, configJson, apsId);
    res.redirect('/admin/aps?success=Activité sportive modifiée avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/admin/aps?error=Erreur lors de la modification');
  }
});

router.post('/aps/delete/:id', isAdmin, async (req, res) => {
  const apsId = req.params.id;
  const db = getDatabase();
  try {
    const evalCount = await db.get(`SELECT COUNT(*) as count FROM evaluations WHERE aps_id = ?`, apsId);
    if (evalCount.count > 0) {
      return res.redirect('/admin/aps?error=Impossible de supprimer une activité qui a des évaluations associées');
    }
    await db.run('DELETE FROM evaluation_criteria WHERE aps_id = ?', apsId);
    await db.run('DELETE FROM aps WHERE id = ?', apsId);
    res.redirect('/admin/aps?success=Activité sportive supprimée avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/admin/aps?error=Erreur lors de la suppression');
  }
});

module.exports = router;