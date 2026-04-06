const express = require('express');
const router = express.Router();
const { getDatabase } = require('../models/database');
const bcrypt = require('bcrypt');

// Middleware pour vérifier que l'utilisateur est un enseignant
function isTeacher(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'teacher') {
    return res.redirect('/login');
  }
  next();
}

// Dashboard enseignant avec statistiques
router.get('/dashboard', isTeacher, async (req, res) => {
  const db = getDatabase();
  
  try {
    const classesCount = await db.get(`
      SELECT COUNT(*) as count FROM classes WHERE teacher_id = ?
    `, req.session.user.id);
    
    const studentsCount = await db.get(`
      SELECT COUNT(*) as count FROM users WHERE role = 'student'
    `);
    
    const evaluationsCount = await db.get(`
      SELECT COUNT(*) as count FROM evaluations WHERE teacher_id = ?
    `, req.session.user.id);
    
    console.log('Stats:', {
      classes: classesCount.count,
      students: studentsCount.count,
      evaluations: evaluationsCount.count
    });
    
    res.render('teacher/dashboard', { 
      user: req.session.user,
      stats: {
        classes: classesCount.count || 0,
        students: studentsCount.count || 0,
        evaluations: evaluationsCount.count || 0
      }
    });
  } catch (error) {
    console.error('Erreur dashboard:', error);
    res.render('teacher/dashboard', { 
      user: req.session.user,
      stats: {
        classes: 0,
        students: 0,
        evaluations: 0
      }
    });
  }
});

// ========== GESTION DES CLASSES ET ÉLÈVES ==========

router.get('/students', isTeacher, async (req, res) => {
  const db = getDatabase();
  
  try {
    // Récupérer les classes de l'enseignant
    const classes = await db.all(`
      SELECT * FROM classes WHERE teacher_id = ? ORDER BY name
    `, req.session.user.id);
    
    // Récupérer la classe active
    const activeClass = await db.get(`
      SELECT * FROM classes WHERE teacher_id = ? AND is_active = 1
    `, req.session.user.id);
    
    let students = [];
    if (activeClass) {
      students = await db.all(`
        SELECT u.id, u.username, u.full_name, s.student_number, s.gender, s.birth_date, c.name as class_name, c.id as class_id
        FROM users u
        JOIN students s ON u.id = s.user_id
        LEFT JOIN classes c ON u.class_id = c.id
        WHERE u.role = 'student' AND u.class_id = ?
        ORDER BY u.full_name
      `, activeClass.id);
    }
    
    // LOGS DE DÉBOGAGE
    console.log('=== DÉBOGAGE PAGE ÉLÈVES ===');
    console.log('Classes trouvées:', classes.length);
    if (classes.length > 0) {
      console.log('Liste des classes:', classes.map(c => ({ id: c.id, name: c.name, is_active: c.is_active })));
    }
    console.log('Classe active:', activeClass ? `${activeClass.name} (ID: ${activeClass.id})` : 'Aucune classe active');
    console.log('Nombre d\'élèves trouvés:', students.length);
    if (students.length > 0) {
      console.log('Exemple d\'élève:', { nom: students[0].full_name, classe: students[0].class_name });
    }
    
    res.render('teacher/students', { 
      user: req.session.user,
      classes: classes,
      activeClass: activeClass,
      students: students,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error('Erreur dans /students:', error);
    res.render('teacher/students', { 
      user: req.session.user,
      classes: [],
      activeClass: null,
      students: [],
      error: 'Erreur lors du chargement des données: ' + error.message,
      success: null
    });
  }
});

router.post('/create-class', isTeacher, async (req, res) => {
  const { class_name, academic_year } = req.body;
  const db = getDatabase();
  
  if (!class_name) {
    return res.redirect('/teacher/students?error=Nom de classe requis');
  }
  
  try {
    // Si c'est la première classe, l'activer automatiquement
    const classCount = await db.get(`SELECT COUNT(*) as count FROM classes WHERE teacher_id = ?`, req.session.user.id);
    
    const isActive = (classCount.count === 0) ? 1 : 0;
    
    await db.run(`
      INSERT INTO classes (name, academic_year, teacher_id, is_active)
      VALUES (?, ?, ?, ?)
    `, class_name, academic_year || new Date().getFullYear().toString(), req.session.user.id, isActive);
    
    res.redirect('/teacher/students?success=Classe créée avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/teacher/students?error=Erreur lors de la création');
  }
});

router.post('/add-student', isTeacher, async (req, res) => {
  const { full_name, student_number, gender, birth_date, class_id, username, password } = req.body;
  const db = getDatabase();
  
  if (!full_name || !student_number || !gender) {
    return res.redirect('/teacher/students?error=Tous les champs sont requis');
  }
  
  try {
    const finalUsername = username || student_number;
    const finalPassword = password || student_number;
    const hashedPassword = await bcrypt.hash(finalPassword, 10);
    
    const result = await db.run(`
      INSERT INTO users (username, password, full_name, role, class_id)
      VALUES (?, ?, ?, 'student', ?)
    `, finalUsername, hashedPassword, full_name, class_id || null);
    
    await db.run(`
      INSERT INTO students (user_id, student_number, gender, birth_date)
      VALUES (?, ?, ?, ?)
    `, result.lastID, student_number, gender, birth_date || null);
    
    res.redirect('/teacher/students?success=Élève ajouté avec succès');
  } catch (error) {
    console.error(error);
    if (error.code === 'SQLITE_CONSTRAINT') {
      res.redirect('/teacher/students?error=Numéro d\'élève ou nom d\'utilisateur déjà existant');
    } else {
      res.redirect('/teacher/students?error=Erreur lors de l\'ajout');
    }
  }
});

router.post('/delete-student/:id', isTeacher, async (req, res) => {
  const studentId = req.params.id;
  const db = getDatabase();
  
  try {
    await db.run('DELETE FROM students WHERE user_id = ?', studentId);
    await db.run('DELETE FROM users WHERE id = ? AND role = "student"', studentId);
    
    res.redirect('/teacher/students?success=Élève supprimé avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/teacher/students?error=Erreur lors de la suppression');
  }
});

// Page de modification d'un élève
router.get('/edit-student/:id', isTeacher, async (req, res) => {
  const studentId = req.params.id;
  const db = getDatabase();
  
  try {
    const student = await db.get(`
  SELECT u.id, u.username, u.full_name, u.class_id, s.student_number, s.gender, s.birth_date
  FROM users u
  JOIN students s ON u.id = s.user_id
  WHERE u.id = ? AND u.role = 'student'
`, studentId);
    
    if (!student) {
      return res.redirect('/teacher/students?error=Élève non trouvé');
    }
    
    const classes = await db.all(`
      SELECT * FROM classes WHERE teacher_id = ? OR teacher_id IS NULL
    `, req.session.user.id);
    
    res.render('teacher/edit-student', { 
      user: req.session.user,
      student: student,
      classes: classes,
      error: null
    });
  } catch (error) {
    console.error(error);
    res.redirect('/teacher/students?error=Erreur lors du chargement');
  }
});

// Traitement de la modification d'un élève
router.post('/edit-student/:id', isTeacher, async (req, res) => {
  const studentId = req.params.id;
  const { full_name, student_number, gender, birth_date, class_id, username } = req.body;
  const db = getDatabase();
  
  try {
    await db.run(`
      UPDATE users 
      SET full_name = ?, username = ?, class_id = ?
      WHERE id = ? AND role = 'student'
    `, full_name, username || student_number, class_id || null, studentId);
    
    await db.run(`
      UPDATE students 
      SET student_number = ?, gender = ?, birth_date = ?
      WHERE user_id = ?
    `, student_number, gender, birth_date || null, studentId);
    
    res.redirect('/teacher/students?success=Élève modifié avec succès');
  } catch (error) {
    console.error(error);
    res.redirect(`/teacher/edit-student/${studentId}?error=Erreur lors de la modification`);
  }
});

// ========== GESTION AVANCÉE DES CLASSES ==========

// Activer une classe (pour afficher ses élèves)
router.post('/activate-class/:id', isTeacher, async (req, res) => {
  const classId = req.params.id;
  const db = getDatabase();
  
  try {
    // Désactiver toutes les classes de l'enseignant
    await db.run(`
      UPDATE classes SET is_active = 0 WHERE teacher_id = ?
    `, req.session.user.id);
    
    // Activer la classe sélectionnée
    await db.run(`
      UPDATE classes SET is_active = 1 WHERE id = ? AND teacher_id = ?
    `, classId, req.session.user.id);
    
    res.redirect('/teacher/students?success=Classe activée');
  } catch (error) {
    console.error(error);
    res.redirect('/teacher/students?error=Erreur lors de l\'activation');
  }
});

// Renommer une classe
router.post('/rename-class/:id', isTeacher, async (req, res) => {
  const classId = req.params.id;
  const { new_name } = req.body;
  const db = getDatabase();
  
  if (!new_name || new_name.trim() === '') {
    return res.redirect('/teacher/students?error=Nom de classe requis');
  }
  
  try {
    await db.run(`
      UPDATE classes SET name = ? WHERE id = ? AND teacher_id = ?
    `, new_name.trim(), classId, req.session.user.id);
    
    res.redirect('/teacher/students?success=Classe renommée avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/teacher/students?error=Erreur lors du renommage');
  }
});

// Supprimer une classe (uniquement si elle n'a pas d'élèves)
router.post('/delete-class/:id', isTeacher, async (req, res) => {
  const classId = req.params.id;
  const db = getDatabase();
  
  try {
    // Vérifier si la classe contient des élèves
    const studentsCount = await db.get(`
      SELECT COUNT(*) as count FROM users WHERE class_id = ? AND role = 'student'
    `, classId);
    
    if (studentsCount.count > 0) {
      return res.redirect('/teacher/students?error=Impossible de supprimer une classe qui contient des élèves. Déplacez ou supprimez d\'abord les élèves.');
    }
    
    await db.run(`
      DELETE FROM classes WHERE id = ? AND teacher_id = ?
    `, classId, req.session.user.id);
    
    res.redirect('/teacher/students?success=Classe supprimée avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/teacher/students?error=Erreur lors de la suppression');
  }
});

// ========== GESTION DES ÉVALUATIONS ==========

router.get('/evaluations', isTeacher, async (req, res) => {
  const db = getDatabase();
  
  try {
    const evaluations = await db.all(`
      SELECT e.*, c.name as class_name, a.name as aps_name 
      FROM evaluations e
      JOIN classes c ON e.class_id = c.id
      JOIN aps a ON e.aps_id = a.id
      WHERE e.teacher_id = ?
      ORDER BY e.evaluation_date DESC
    `, req.session.user.id);
    
    res.render('teacher/evaluations', { 
      user: req.session.user,
      evaluations: evaluations,
      error: null,
      success: req.query.success || null
    });
  } catch (error) {
    console.error('Erreur /evaluations:', error);
    res.render('teacher/evaluations', { 
      user: req.session.user,
      evaluations: [],
      error: 'Erreur lors du chargement des évaluations',
      success: null
    });
  }
});

router.get('/evaluations/create', isTeacher, async (req, res) => {
  const db = getDatabase();
  
  try {
    const classes = await db.all(`
      SELECT * FROM classes WHERE teacher_id = ?
    `, req.session.user.id);
    
    const apsList = await db.all('SELECT * FROM aps');
    
    res.render('teacher/create-evaluation', { 
      user: req.session.user,
      classes: classes,
      apsList: apsList,
      error: null
    });
  } catch (error) {
    console.error('Erreur /evaluations/create:', error);
    res.redirect('/teacher/evaluations?error=Erreur lors du chargement du formulaire');
  }
});

router.post('/evaluations/create', isTeacher, async (req, res) => {
  const { class_id, aps_id, control_number, evaluation_date, student_can_input } = req.body;
  const db = getDatabase();
  
  console.log('=== CRÉATION ÉVALUATION ===');
  console.log('Données reçues:', { class_id, aps_id, control_number, evaluation_date, student_can_input });
  
  if (!class_id || !aps_id || !control_number) {
    return res.redirect('/teacher/evaluations/create?error=Tous les champs sont requis');
  }
  
  try {
    const result = await db.run(`
      INSERT INTO evaluations (class_id, aps_id, control_number, evaluation_date, teacher_id, student_can_input)
      VALUES (?, ?, ?, ?, ?, ?)
    `, class_id, aps_id, control_number, evaluation_date || new Date().toISOString().split('T')[0], req.session.user.id, student_can_input ? 1 : 0);
    
    console.log('Évaluation créée avec ID:', result.lastID);
    res.redirect(`/teacher/evaluations/${result.lastID}/grade`);
  } catch (error) {
    console.error('Erreur détaillée:', error);
    res.redirect('/teacher/evaluations/create?error=Erreur lors de la création: ' + error.message);
  }
});

router.get('/evaluations/:id/grade', isTeacher, async (req, res) => {
  const evaluationId = req.params.id;
  const db = getDatabase();
  
  try {
    const evaluation = await db.get(`
      SELECT e.*, c.name as class_name, a.name as aps_name, a.type as aps_type, a.default_config, a.id as aps_id
      FROM evaluations e
      JOIN classes c ON e.class_id = c.id
      JOIN aps a ON e.aps_id = a.id
      WHERE e.id = ? AND e.teacher_id = ?
    `, evaluationId, req.session.user.id);
    
    if (!evaluation) {
      return res.redirect('/teacher/evaluations?error=Évaluation non trouvée');
    }
    
    const students = await db.all(`
      SELECT u.id, u.full_name, s.student_number, s.gender
      FROM users u
      JOIN students s ON u.id = s.user_id
      WHERE u.class_id = ? AND u.role = 'student'
      ORDER BY u.full_name
    `, evaluation.class_id);
    
    const allCriteria = await db.all(`
      SELECT * FROM evaluation_criteria 
      WHERE aps_id = ? AND (teacher_id = ? OR (teacher_id IS NULL AND is_preset = 1))
      ORDER BY is_preset DESC, id
    `, evaluation.aps_id, req.session.user.id);
    
    const existingGrades = await db.all(`
      SELECT student_id, criteria_scores, total_score
      FROM grades
      WHERE evaluation_id = ?
    `, evaluationId);
    
    const gradesMap = {};
    existingGrades.forEach(g => {
      const criteria = JSON.parse(g.criteria_scores);
      gradesMap[g.student_id] = {
        total_score: g.total_score,
        criteria_scores: criteria
      };
    });
    
    res.render('teacher/grade-evaluation', { 
      user: req.session.user,
      evaluation: evaluation,
      students: students,
      allCriteria: allCriteria,
      gradesMap: gradesMap,
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Erreur /grade:', error);
    res.redirect('/teacher/evaluations?error=Erreur lors du chargement des notes');
  }
});

router.post('/evaluations/:id/grade', isTeacher, async (req, res) => {
  const evaluationId = req.params.id;
  const { grades } = req.body;
  const db = getDatabase();
  
  console.log('=== SAUVEGARDE ===');
  console.log('Evaluation ID:', evaluationId);
  
  try {
    const evaluation = await db.get(`
      SELECT e.*, a.type as aps_type, a.id as aps_id
      FROM evaluations e
      JOIN aps a ON e.aps_id = a.id
      WHERE e.id = ? AND e.teacher_id = ?
    `, evaluationId, req.session.user.id);
    
    if (!evaluation) {
      return res.redirect('/teacher/evaluations?error=Évaluation non trouvée');
    }
    
    const allCriteria = await db.all(`
      SELECT * FROM evaluation_criteria 
      WHERE aps_id = ? AND (teacher_id = ? OR (teacher_id IS NULL AND is_preset = 1))
    `, evaluation.aps_id, req.session.user.id);
    
    await db.run('DELETE FROM grades WHERE evaluation_id = ?', evaluationId);
    
    let savedCount = 0;
    
    if (grades && typeof grades === 'object') {
      for (const [key, gradeData] of Object.entries(grades)) {
        const studentId = parseInt(key.replace('student_', ''));
        let totalScore = 0;
        const criteriaScores = {};
        
        const student = await db.get(`SELECT s.gender FROM students s WHERE s.user_id = ?`, studentId);
        
        for (const crit of allCriteria) {
          let score = 0;
          
          if (crit.is_preset === 1) {
            if (crit.formula_type === 'difficulty') {
              // Récupérer les valeurs directement depuis gradeData (pas depuis gradeData.criteria)
              const a = parseInt(gradeData[`${crit.id}_A`]) || 0;
              const b = parseInt(gradeData[`${crit.id}_B`]) || 0;
              const c = parseInt(gradeData[`${crit.id}_C`]) || 0;
              score = (a * 0.75) + (b * 1.25) + (c * 1.75);
              score = Math.min(score, crit.max_score);
              criteriaScores[`${crit.id}_A`] = a;
              criteriaScores[`${crit.id}_B`] = b;
              criteriaScores[`${crit.id}_C`] = c;
              console.log(`  ${crit.name}: A=${a}, B=${b}, C=${c} -> score=${score.toFixed(2)}`);
            } else if (crit.formula_type === 'time') {
              const temps = parseFloat(gradeData.time) || 0;
              if (evaluation.aps_type === 'sprint') {
                score = (student && student.gender === 'F') ? (-1 * temps) + 14.9 : (-0.7 * temps) + 13.4;
              } else {
                score = (student && student.gender === 'F') ? (-0.0416 * temps) + 11.7 : (-0.0375 * temps) + 14.25;
              }
              score = Math.min(Math.max(score, 0), crit.max_score);
              criteriaScores.time = temps;
            }
            criteriaScores[crit.id] = score;
          } else {
            // Critères personnalisés - format: criteria_ID
const customKey = `criteria_${crit.id}`;
let customScore = 0;
if (gradeData[customKey] !== undefined) {
    customScore = parseFloat(gradeData[customKey]) || 0;
}
score = Math.min(customScore, crit.max_score);
criteriaScores[crit.id] = score;
          }
          totalScore += score;
        }
        
        totalScore = Math.min(totalScore, 20);
        
        await db.run(`
          INSERT INTO grades (evaluation_id, student_id, criteria_scores, total_score)
          VALUES (?, ?, ?, ?)
        `, evaluationId, studentId, JSON.stringify(criteriaScores), totalScore);
        
        savedCount++;
      }
    }
    
    console.log(`${savedCount} notes sauvegardées`);
    res.redirect(`/teacher/evaluations/${evaluationId}/view?success=Notes sauvegardées avec succès (${savedCount} élèves)`);
  } catch (error) {
    console.error('Erreur sauvegarde:', error);
    res.redirect(`/teacher/evaluations/${evaluationId}/grade?error=Erreur: ${error.message}`);
  }
});

// Voir les résultats d'une évaluation
router.get('/evaluations/:id/view', isTeacher, async (req, res) => {
  const evaluationId = req.params.id;
  const db = getDatabase();
  
  try {
    const evaluation = await db.get(`
      SELECT e.*, c.name as class_name, a.name as aps_name, a.type as aps_type
      FROM evaluations e
      JOIN classes c ON e.class_id = c.id
      JOIN aps a ON e.aps_id = a.id
      WHERE e.id = ? AND e.teacher_id = ?
    `, evaluationId, req.session.user.id);
    
    if (!evaluation) {
      return res.redirect('/teacher/evaluations?error=Évaluation non trouvée');
    }
    
    // Récupérer les critères pour cette APS
    const criteria = await db.all(`
      SELECT * FROM evaluation_criteria 
      WHERE aps_id = ? AND (teacher_id = ? OR (teacher_id IS NULL AND is_preset = 1))
      ORDER BY is_preset DESC, id
    `, evaluation.aps_id, req.session.user.id);
    
    const grades = await db.all(`
      SELECT g.*, u.full_name, s.student_number, s.gender
      FROM grades g
      JOIN students s ON g.student_id = s.user_id
      JOIN users u ON s.user_id = u.id
      WHERE g.evaluation_id = ?
      ORDER BY u.full_name
    `, evaluationId);
    
    res.render('teacher/view-evaluation', { 
      user: req.session.user,
      evaluation: evaluation,
      criteria: criteria,
      grades: grades,
      success: req.query.success || null
    });
  } catch (error) {
    console.error('Erreur dans /view:', error);
    res.redirect('/teacher/evaluations?error=' + encodeURIComponent(error.message));
  }
});
// Supprimer une évaluation
router.post('/delete-evaluation/:id', isTeacher, async (req, res) => {
  const evaluationId = req.params.id;
  const db = getDatabase();
  
  try {
    // Supprimer d'abord les notes associées
    await db.run('DELETE FROM grades WHERE evaluation_id = ?', evaluationId);
    // Puis supprimer l'évaluation
    await db.run('DELETE FROM evaluations WHERE id = ? AND teacher_id = ?', evaluationId, req.session.user.id);
    
    res.redirect('/teacher/evaluations?success=Évaluation supprimée avec succès');
  } catch (error) {
    console.error(error);
    res.redirect('/teacher/evaluations?error=Erreur lors de la suppression');
  }
});
// Activer/désactiver la saisie par les élèves
router.post('/toggle-student-input/:id', isTeacher, async (req, res) => {
  const evaluationId = req.params.id;
  const db = getDatabase();
  
  try {
    // Récupérer l'état actuel
    const evaluation = await db.get(`
      SELECT student_can_input FROM evaluations WHERE id = ? AND teacher_id = ?
    `, evaluationId, req.session.user.id);
    
    if (!evaluation) {
      return res.redirect('/teacher/evaluations?error=Évaluation non trouvée');
    }
    
    // Inverser l'état
    const newState = evaluation.student_can_input ? 0 : 1;
    await db.run(`
      UPDATE evaluations SET student_can_input = ? WHERE id = ?
    `, newState, evaluationId);
    
    const message = newState ? 'Saisie par les élèves activée' : 'Saisie par les élèves désactivée';
    res.redirect(`/teacher/evaluations?success=${message}`);
  } catch (error) {
    console.error(error);
    res.redirect('/teacher/evaluations?error=Erreur lors du changement');
  }
});
// Télécharger le template Excel pour l'import
router.get('/download-template', isTeacher, (req, res) => {
  const XLSX = require('xlsx');
  
  const templateData = [
    ['Nom complet', 'Numéro étudiant', 'Sexe (M/F)', 'Date de naissance (YYYY-MM-DD)'],
    ['Jean Dupont', '2024001', 'M', '2010-05-15'],
    ['Marie Martin', '2024002', 'F', '2010-08-22'],
    ['', '', '', '']
  ];
  
  const worksheet = XLSX.utils.aoa_to_sheet(templateData);
  worksheet['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 15 }, { wch: 20 }];
  
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Template_eleves');
  
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="template_import_eleves.xlsx"');
  res.send(excelBuffer);
});

// ========== CONFIGURATION DES CRITÈRES ==========

router.get('/criteria', isTeacher, async (req, res) => {
  const db = getDatabase();
  
  try {
    const apsList = await db.all(`
      SELECT a.*, ec.id as criteria_id, ec.name as criteria_name, ec.max_score, ec.formula_type, ec.is_preset
      FROM aps a
      LEFT JOIN evaluation_criteria ec ON a.id = ec.aps_id AND (ec.teacher_id = ? OR ec.is_preset = 1)
      ORDER BY a.name
    `, req.session.user.id);
    
    const apsWithCriteria = {};
    apsList.forEach(aps => {
      if (!apsWithCriteria[aps.id]) {
        apsWithCriteria[aps.id] = {
          id: aps.id,
          name: aps.name,
          type: aps.type,
          criteria: []
        };
      }
      if (aps.criteria_id) {
        apsWithCriteria[aps.id].criteria.push({
          id: aps.criteria_id,
          name: aps.criteria_name,
          max_score: aps.max_score,
          formula_type: aps.formula_type,
          is_preset: aps.is_preset
        });
      }
    });
    
    res.render('teacher/criteria', { 
      user: req.session.user,
      apsList: Object.values(apsWithCriteria),
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Erreur /criteria:', error);
    res.render('teacher/criteria', { 
      user: req.session.user,
      apsList: [],
      error: 'Erreur lors du chargement des critères',
      success: null
    });
  }
});

router.get('/criteria/:apsId', isTeacher, async (req, res) => {
  const apsId = req.params.apsId;
  const db = getDatabase();
  
  try {
    const aps = await db.get(`SELECT * FROM aps WHERE id = ?`, apsId);
    if (!aps) {
      return res.redirect('/teacher/criteria?error=Activité non trouvée');
    }
    
    const existingCriteria = await db.all(`
      SELECT * FROM evaluation_criteria 
      WHERE aps_id = ? AND teacher_id = ? AND is_preset = 0
    `, apsId, req.session.user.id);
    
    res.render('teacher/edit-criteria', { 
      user: req.session.user,
      aps: aps,
      criteria: existingCriteria,
      error: null,
      success: null
    });
  } catch (error) {
    console.error('Erreur /criteria/:apsId:', error);
    res.redirect('/teacher/criteria?error=Erreur lors du chargement');
  }
});

router.post('/criteria/:apsId', isTeacher, async (req, res) => {
  const apsId = req.params.apsId;
  const db = getDatabase();
  
  try {
    await db.run(`DELETE FROM evaluation_criteria WHERE aps_id = ? AND teacher_id = ? AND is_preset = 0`, apsId, req.session.user.id);
    
    let savedCount = 0;
    const criteriaMap = new Map();
    
    for (const [key, value] of Object.entries(req.body)) {
      if (key.startsWith('criteria_')) {
        const parts = key.split('_');
        const index = parts[1];
        const field = parts[2];
        if (!criteriaMap.has(index)) criteriaMap.set(index, {});
        criteriaMap.get(index)[field] = value;
      }
    }
    
    for (const [index, criteria] of criteriaMap.entries()) {
      const name = criteria.name;
      const maxScore = criteria.max_score;
      const formulaType = criteria.formula_type || 'manual';
      
      if (name && name.trim() !== '') {
        const maxScoreNum = parseFloat(maxScore) || 20;
        await db.run(`
          INSERT INTO evaluation_criteria (aps_id, teacher_id, name, max_score, formula_type, is_active, is_preset)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, apsId, req.session.user.id, name.trim(), maxScoreNum, formulaType, 1, 0);
        savedCount++;
      }
    }
    
    res.redirect(`/teacher/criteria?success=${savedCount} critères sauvegardés`);
  } catch (error) {
    console.error('Erreur sauvegarde critères:', error);
    res.redirect(`/teacher/criteria/${apsId}?error=${error.message}`);
  }
});
// Export Excel des résultats d'une évaluation
router.get('/evaluations/:id/export', isTeacher, async (req, res) => {
  const evaluationId = req.params.id;
  const XLSX = require('xlsx');
  const db = getDatabase();
  
  try {
    // Récupérer les informations de l'évaluation
    const evaluation = await db.get(`
      SELECT e.*, c.name as class_name, a.name as aps_name, u.full_name as teacher_name
      FROM evaluations e
      JOIN classes c ON e.class_id = c.id
      JOIN aps a ON e.aps_id = a.id
      JOIN users u ON e.teacher_id = u.id
      WHERE e.id = ? AND e.teacher_id = ?
    `, evaluationId, req.session.user.id);
    
    if (!evaluation) {
      return res.redirect('/teacher/evaluations?error=Évaluation non trouvée');
    }
    
    // Récupérer les notes avec les élèves
    const grades = await db.all(`
      SELECT g.*, u.full_name, s.student_number, s.gender
      FROM grades g
      JOIN students s ON g.student_id = s.user_id
      JOIN users u ON s.user_id = u.id
      WHERE g.evaluation_id = ?
      ORDER BY u.full_name
    `, evaluationId);
    
    // Préparer les données pour Excel
    const worksheetData = [
      ['NOM DE L\'ÉTABLISSEMENT', '', '', '', ''],
      ['Professeur :', evaluation.teacher_name, '', '', ''],
      ['Année scolaire :', '2024-2025', '', '', ''],
      ['Classe :', evaluation.class_name, '', '', ''],
      ['APS évalué :', evaluation.aps_name, '', '', ''],
      ['Contrôle n° :', evaluation.control_number, '', '', ''],
      ['Date :', new Date(evaluation.evaluation_date).toLocaleDateString('fr-FR'), '', '', ''],
      ['', '', '', '', ''],
      ['N°', 'Nom', 'Prénom', 'Sexe', 'Note /20'],
    ];
    
    // Ajouter les données des élèves
    grades.forEach((grade, index) => {
      const nameParts = grade.full_name.split(' ');
      const lastName = nameParts[0] || '';
      const firstName = nameParts.slice(1).join(' ') || '';
      
      worksheetData.push([
        index + 1,
        lastName,
        firstName,
        grade.gender === 'M' ? 'Garçon' : 'Fille',
        grade.total_score.toFixed(2)
      ]);
    });
    
    // Ajouter une ligne de statistiques
    if (grades.length > 0) {
      const notes = grades.map(g => g.total_score);
      const moyenne = (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(2);
      const maxNote = Math.max(...notes).toFixed(2);
      const minNote = Math.min(...notes).toFixed(2);
      
      worksheetData.push(['', '', '', '', '']);
      worksheetData.push(['STATISTIQUES', '', '', '', '']);
      worksheetData.push(['Moyenne de la classe :', moyenne, '', '', '']);
      worksheetData.push(['Note maximale :', maxNote, '', '', '']);
      worksheetData.push(['Note minimale :', minNote, '', '', '']);
      worksheetData.push(['Nombre d\'élèves :', grades.length, '', '', '']);
    }
    
    // Créer le classeur Excel
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet['!cols'] = [{ wch: 8 }, { wch: 25 }, { wch: 25 }, { wch: 12 }, { wch: 12 }];
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultats');
    
    // Générer le fichier
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
    const fileName = `resultats_${evaluation.class_name}_${evaluation.aps_name}_ctrl${evaluation.control_number}.xlsx`;
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.send(excelBuffer);
    
  } catch (error) {
    console.error('Erreur export Excel:', error);
    res.redirect(`/teacher/evaluations/${evaluationId}/view?error=Erreur lors de l'export Excel: ${error.message}`);
  }
});
// Importer des élèves depuis un fichier Excel
router.post('/import-students', isTeacher, async (req, res) => {
  const XLSX = require('xlsx');
  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage() });
  const db = getDatabase(); // AJOUTER CETTE LIGNE POUR RÉCUPÉRER db
  
  // Utiliser multer pour traiter le fichier
  upload.single('excelFile')(req, res, async (err) => {
    if (err) {
      return res.redirect('/teacher/students?error=Erreur lors du téléchargement du fichier');
    }
    
    const { class_id } = req.body;
    const file = req.file;
    
    if (!file || !class_id) {
      return res.redirect('/teacher/students?error=Veuillez sélectionner un fichier et une classe');
    }
    
    try {
      // Lire le fichier Excel
      const workbook = XLSX.read(file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      
      // Vérifier que la classe existe
      const classExists = await db.get(`SELECT id FROM classes WHERE id = ? AND teacher_id = ?`, class_id, req.session.user.id);
      if (!classExists) {
        return res.redirect('/teacher/students?error=Classe non trouvée');
      }
      
      let importedCount = 0;
      let errorCount = 0;
      const errors = [];
      
      // Parcourir les lignes (ignorer l'en-tête à la ligne 0)
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        const fullName = row[0] ? row[0].toString().trim() : '';
        const studentNumber = row[1] ? row[1].toString().trim() : '';
        const gender = row[2] ? row[2].toString().trim().toUpperCase() : '';
        const birthDate = row[3] ? row[3].toString().trim() : null;
        
        // Vérifier les champs obligatoires
        if (!fullName || !studentNumber || !gender) {
          errorCount++;
          errors.push(`Ligne ${i + 1}: Champs manquants (Nom, Numéro, Sexe requis)`);
          continue;
        }
        
        // Vérifier le sexe
        if (gender !== 'M' && gender !== 'F') {
          errorCount++;
          errors.push(`Ligne ${i + 1}: Sexe invalide (doit être M ou F)`);
          continue;
        }
        
        try {
          // Vérifier si l'élève existe déjà
          const existingStudent = await db.get(`
            SELECT u.id FROM users u
            JOIN students s ON u.id = s.user_id
            WHERE s.student_number = ?
          `, studentNumber);
          
          if (existingStudent) {
            errorCount++;
            errors.push(`Ligne ${i + 1}: Numéro ${studentNumber} déjà existant`);
            continue;
          }
          
          // Créer l'utilisateur
          const hashedPassword = await bcrypt.hash(studentNumber, 10);
          const result = await db.run(`
            INSERT INTO users (username, password, full_name, role, class_id)
            VALUES (?, ?, ?, 'student', ?)
          `, studentNumber, hashedPassword, fullName, class_id);
          
          // Créer les détails de l'élève
          await db.run(`
            INSERT INTO students (user_id, student_number, gender, birth_date)
            VALUES (?, ?, ?, ?)
          `, result.lastID, studentNumber, gender, birthDate);
          
          importedCount++;
        } catch (err) {
          errorCount++;
          errors.push(`Ligne ${i + 1}: ${err.message}`);
        }
      }
      
      let message = `${importedCount} élèves importés avec succès.`;
      if (errorCount > 0) {
        message += ` ${errorCount} erreurs.`;
        console.log('Erreurs d\'import:', errors);
      }
      
      res.redirect(`/teacher/students?success=${encodeURIComponent(message)}`);
      
    } catch (error) {
      console.error('Erreur import Excel:', error);
      res.redirect('/teacher/students?error=Erreur lors de l\'import du fichier: ' + error.message);
    }
  });
});

module.exports = router;