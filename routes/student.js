const express = require('express');
const router = express.Router();
const { getDatabase } = require('../models/database');
const bcrypt = require('bcrypt');

// Middleware pour vérifier que l'utilisateur est un élève
function isStudent(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'student') {
    return res.redirect('/login');
  }
  next();
}

// Page d'inscription élève
router.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('student/register', { error: null, success: null });
});

// Traitement de l'inscription
router.post('/register', async (req, res) => {
  const { full_name, student_number, gender, password, confirm_password } = req.body;
  const db = getDatabase();
  
  if (!full_name || !student_number || !gender || !password) {
    return res.render('student/register', { error: 'Tous les champs sont requis', success: null });
  }
  
  if (password !== confirm_password) {
    return res.render('student/register', { error: 'Les mots de passe ne correspondent pas', success: null });
  }
  
  try {
    // Vérifier si le numéro d'élève existe déjà
    const existingStudent = await db.get(`
      SELECT u.id FROM users u
      JOIN students s ON u.id = s.user_id
      WHERE s.student_number = ?
    `, student_number);
    
    if (existingStudent) {
      return res.render('student/register', { error: 'Ce numéro d\'élève est déjà utilisé', success: null });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Créer l'utilisateur
    const result = await db.run(`
      INSERT INTO users (username, password, full_name, role, is_active)
      VALUES (?, ?, ?, 'student', 1)
    `, student_number, hashedPassword, full_name);
    
    // Créer les détails de l'élève
    await db.run(`
      INSERT INTO students (user_id, student_number, gender)
      VALUES (?, ?, ?)
    `, result.lastID, student_number, gender);
    
    res.render('student/register', { 
      error: null, 
      success: 'Inscription réussie ! Vous pouvez maintenant vous connecter.' 
    });
  } catch (error) {
    console.error('Erreur inscription:', error);
    res.render('student/register', { error: 'Erreur lors de l\'inscription', success: null });
  }
});

// Tableau de bord élève
router.get('/dashboard', isStudent, async (req, res) => {
  const db = getDatabase();
  
  try {
    // Récupérer les informations de l'élève
    const student = await db.get(`
      SELECT u.*, s.student_number, s.gender, c.name as class_name, c.id as class_id
      FROM users u
      JOIN students s ON u.id = s.user_id
      LEFT JOIN classes c ON u.class_id = c.id
      WHERE u.id = ?
    `, req.session.user.id);
    
    // Récupérer les évaluations avec notes déjà saisies
    const evaluations = await db.all(`
      SELECT e.id, e.control_number, e.evaluation_date, e.student_can_input,
             a.name as aps_name, g.total_score, c.name as class_name
      FROM grades g
      JOIN evaluations e ON g.evaluation_id = e.id
      JOIN aps a ON e.aps_id = a.id
      JOIN classes c ON e.class_id = c.id
      WHERE g.student_id = ?
      ORDER BY e.evaluation_date DESC
    `, req.session.user.id);
    
    // Récupérer les évaluations où la saisie est autorisée (même si déjà une note à 0)
const pendingEvaluations = await db.all(`
  SELECT e.id, e.control_number, e.evaluation_date, e.student_can_input,
         a.name as aps_name, c.name as class_name
  FROM evaluations e
  JOIN aps a ON e.aps_id = a.id
  JOIN classes c ON e.class_id = c.id
  WHERE e.class_id = ? AND e.student_can_input = 1
  ORDER BY e.evaluation_date DESC
`, student.class_id);
    
    // Calculer la moyenne générale
    let moyenne = 0;
    if (evaluations.length > 0) {
      const sum = evaluations.reduce((acc, eval) => acc + eval.total_score, 0);
      moyenne = (sum / evaluations.length).toFixed(2);
    }
    
    res.render('student/dashboard', { 
      user: req.session.user,
      student: student,
      evaluations: evaluations,
      pendingEvaluations: pendingEvaluations,
      moyenne: moyenne,
      error: null
    });
  } catch (error) {
    console.error('Erreur dashboard élève:', error);
    res.render('student/dashboard', { 
      user: req.session.user,
      student: null,
      evaluations: [],
      pendingEvaluations: [],
      moyenne: 0,
      error: 'Erreur lors du chargement des données'
    });
  }
});

// Détail d'une évaluation
router.get('/evaluation/:id', isStudent, async (req, res) => {
  const evaluationId = req.params.id;
  const db = getDatabase();
  
  try {
    // Récupérer les détails de l'évaluation
    const evaluation = await db.get(`
      SELECT e.*, a.name as aps_name, a.type as aps_type, c.name as class_name
      FROM evaluations e
      JOIN aps a ON e.aps_id = a.id
      JOIN classes c ON e.class_id = c.id
      WHERE e.id = ?
    `, evaluationId);
    
    if (!evaluation) {
      return res.redirect('/student/dashboard?error=Évaluation non trouvée');
    }
    
    // Récupérer la note de l'élève
    const grade = await db.get(`
      SELECT g.*, u.full_name, s.student_number
      FROM grades g
      JOIN students s ON g.student_id = s.user_id
      JOIN users u ON s.user_id = u.id
      WHERE g.evaluation_id = ? AND g.student_id = ?
    `, evaluationId, req.session.user.id);
    
    // Récupérer les critères de notation
    const criteria = await db.all(`
      SELECT * FROM evaluation_criteria 
      WHERE aps_id = ? AND (teacher_id = ? OR (teacher_id IS NULL AND is_preset = 1))
      ORDER BY is_preset DESC, id
    `, evaluation.aps_id, evaluation.teacher_id);
    
    // Analyser les scores des critères
    let criteriaScores = {};
    if (grade && grade.criteria_scores) {
      criteriaScores = JSON.parse(grade.criteria_scores);
    }
    
    res.render('student/evaluation-detail', { 
      user: req.session.user,
      evaluation: evaluation,
      grade: grade,
      criteria: criteria,
      criteriaScores: criteriaScores,
      error: null
    });
  } catch (error) {
    console.error('Erreur détail évaluation:', error);
    res.redirect('/student/dashboard?error=Erreur lors du chargement des détails');
  }
});
// Page de saisie pour une évaluation (élève)
router.get('/input-evaluation/:id', isStudent, async (req, res) => {
  const evaluationId = req.params.id;
  const db = getDatabase();
  
  try {
    // Vérifier que l'évaluation permet la saisie par les élèves
const evaluation = await db.get(`
  SELECT e.*, a.name as aps_name, a.type as aps_type, a.default_config, c.name as class_name
  FROM evaluations e
  JOIN aps a ON e.aps_id = a.id
  JOIN classes c ON e.class_id = c.id
  WHERE e.id = ? AND e.student_can_input = 1
`, evaluationId);
    
    // Vérifier que l'élève fait partie de la classe
    const student = await db.get(`
      SELECT u.id, u.full_name, s.student_number, s.gender
      FROM users u
      JOIN students s ON u.id = s.user_id
      WHERE u.id = ? AND u.class_id = ?
    `, req.session.user.id, evaluation.class_id);
    
    if (!student) {
      return res.redirect('/student/dashboard?error=Vous ne faites pas partie de cette classe');
    }
    
    // Récupérer les critères de notation
    const allCriteria = await db.all(`
      SELECT * FROM evaluation_criteria 
      WHERE aps_id = ? AND (teacher_id = ? OR (teacher_id IS NULL AND is_preset = 1))
      ORDER BY is_preset DESC, id
    `, evaluation.aps_id, evaluation.teacher_id);
    
    // Vérifier si l'élève a déjà saisi des données
    const existingGrade = await db.get(`
      SELECT * FROM grades WHERE evaluation_id = ? AND student_id = ?
    `, evaluationId, req.session.user.id);
    
    let existingScores = {};
    if (existingGrade && existingGrade.criteria_scores) {
      existingScores = JSON.parse(existingGrade.criteria_scores);
    }
    
    res.render('student/input-evaluation', { 
      user: req.session.user,
      evaluation: evaluation,
      student: student,
      allCriteria: allCriteria,
      existingScores: existingScores,
      existingTotal: existingGrade ? existingGrade.total_score : null,
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Erreur saisie élève:', error);
    res.redirect('/student/dashboard?error=Erreur lors du chargement');
  }
});

// Sauvegarde des données saisies par l'élève
router.post('/input-evaluation/:id', isStudent, async (req, res) => {
  const evaluationId = req.params.id;
  const db = getDatabase();
  
  console.log('=== SAUVEGARDE ÉLÈVE ===');
  console.log('Body reçu:', req.body);
  
  try {
    const evaluation = await db.get(`
      SELECT e.*, a.type as aps_type, a.id as aps_id
      FROM evaluations e
      JOIN aps a ON e.aps_id = a.id
      WHERE e.id = ? AND e.student_can_input = 1
    `, evaluationId);
    
    if (!evaluation) {
      return res.redirect('/student/dashboard?error=Évaluation non trouvée');
    }
    
    // Vérifier que l'élève fait partie de la classe
    const student = await db.get(`
      SELECT u.id, s.gender
      FROM users u
      JOIN students s ON u.id = s.user_id
      WHERE u.id = ? AND u.class_id = ?
    `, req.session.user.id, evaluation.class_id);
    
    if (!student) {
      return res.redirect('/student/dashboard?error=Vous ne faites pas partie de cette classe');
    }
    
    // Récupérer les critères
    const allCriteria = await db.all(`
      SELECT * FROM evaluation_criteria 
      WHERE aps_id = ? AND (teacher_id = ? OR (teacher_id IS NULL AND is_preset = 1))
    `, evaluation.aps_id, evaluation.teacher_id);
    
    let totalScore = 0;
    const criteriaScores = {};
    
    for (const crit of allCriteria) {
      let score = 0;
      
      if (crit.is_preset === 1) {
        if (crit.formula_type === 'difficulty') {
          // Récupérer les valeurs A, B, C depuis req.body
          const a = parseInt(req.body[`${crit.id}_A`]) || 0;
          const b = parseInt(req.body[`${crit.id}_B`]) || 0;
          const c = parseInt(req.body[`${crit.id}_C`]) || 0;
          score = (a * 0.75) + (b * 1.25) + (c * 1.75);
          score = Math.min(score, crit.max_score);
          criteriaScores[`${crit.id}_A`] = a;
          criteriaScores[`${crit.id}_B`] = b;
          criteriaScores[`${crit.id}_C`] = c;
          console.log(`  Difficulté: A=${a}, B=${b}, C=${c} -> score=${score}`);
        } else if (crit.formula_type === 'time') {
          const temps = parseFloat(req.body.time) || 0;
          if (evaluation.aps_type === 'sprint') {
            score = (student.gender === 'F') ? (-1 * temps) + 14.9 : (-0.7 * temps) + 13.4;
          } else if (evaluation.aps_type === 'courselongue') {
            score = (student.gender === 'F') ? (-0.0416 * temps) + 11.7 : (-0.0375 * temps) + 14.25;
          }
          score = Math.min(Math.max(score, 0), crit.max_score);
          criteriaScores.time = temps;
          console.log(`  Performance: temps=${temps}s -> score=${score}`);
        }
        criteriaScores[crit.id] = score;
      } else {
        // Critère personnalisé - récupérer la valeur depuis req.body
        const customScore = parseFloat(req.body[`criteria_${crit.id}`]) || 0;
        score = Math.min(customScore, crit.max_score);
        criteriaScores[crit.id] = score;
        console.log(`  ${crit.name}: valeur=${customScore} -> score=${score}`);
      }
      
      totalScore += score;
    }
    
    totalScore = Math.min(totalScore, 20);
    console.log(`TOTAL: ${totalScore}`);
    
    // Supprimer l'ancienne note si elle existe
    await db.run(`
      DELETE FROM grades WHERE evaluation_id = ? AND student_id = ?
    `, evaluationId, req.session.user.id);
    
    // Insérer la nouvelle note
    await db.run(`
      INSERT INTO grades (evaluation_id, student_id, criteria_scores, total_score)
      VALUES (?, ?, ?, ?)
    `, evaluationId, req.session.user.id, JSON.stringify(criteriaScores), totalScore);
    
    res.redirect(`/student/input-evaluation/${evaluationId}?success=Données sauvegardées avec succès`);
  } catch (error) {
    console.error('Erreur sauvegarde élève:', error);
    res.redirect(`/student/input-evaluation/${evaluationId}?error=Erreur lors de la sauvegarde: ${error.message}`);
  }
});

module.exports = router;