const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const bcrypt = require('bcrypt');

let db;

// Déterminer le chemin de la base de données
const isRailway = process.env.RAILWAY_ENVIRONMENT === 'true' || process.env.RAILWAY_SERVICE_ID;
const dbPath = isRailway ? '/tmp/school.db' : path.join(__dirname, '../database/school.db');

console.log(`📁 Base de données: ${dbPath}`);

async function initDatabase() {
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  console.log('📁 Base de données connectée');

  // Création des tables (le même code que vous avez déjà)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'teacher', 'student')) NOT NULL,
      class_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      teacher_id INTEGER,
      is_active INTEGER DEFAULT 0,
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      student_number TEXT NOT NULL,
      gender TEXT CHECK(gender IN ('M', 'F')) NOT NULL,
      birth_date TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS aps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      default_config TEXT
    );

    CREATE TABLE IF NOT EXISTS evaluation_criteria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aps_id INTEGER NOT NULL,
      teacher_id INTEGER,
      name TEXT NOT NULL,
      max_score REAL NOT NULL,
      formula_type TEXT,
      formula_params TEXT,
      is_active INTEGER DEFAULT 1,
      is_preset INTEGER DEFAULT 0,
      FOREIGN KEY (aps_id) REFERENCES aps(id),
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      aps_id INTEGER NOT NULL,
      control_number INTEGER NOT NULL,
      evaluation_date DATE NOT NULL,
      teacher_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      student_can_input INTEGER DEFAULT 0,
      FOREIGN KEY (class_id) REFERENCES classes(id),
      FOREIGN KEY (aps_id) REFERENCES aps(id),
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS grades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evaluation_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      criteria_scores TEXT NOT NULL,
      total_score REAL NOT NULL,
      FOREIGN KEY (evaluation_id) REFERENCES evaluations(id),
      FOREIGN KEY (student_id) REFERENCES students(user_id)
    );
  `);

  // Insertion des APS par défaut si nécessaire
  const countAPS = await db.get('SELECT COUNT(*) as total FROM aps');
  if (countAPS.total === 0) {
    console.log('📝 Insertion des activités sportives...');
    const apsList = [
      ['Gymnastique', 'gymnastics', '{"difficultyValues":{"A":0.75,"B":1.25,"C":1.75}}'],
      ['Course de vitesse', 'sprint', '{"formula_girls":"-1*perf + 14.9", "formula_boys":"-0.7*perf + 13.4", "max_performance_score":6}'],
      ['Course de duree', 'courselongue', '{"formula_girls":"-0.0416*perf + 11.7", "formula_boys":"-0.0375*perf + 14.25", "max_performance_score":6}'],
      ['Sports collectifs de renvoi', 'team_sport', '{}'],
      ['Sports collectifs de marquage', 'team_sport', '{}'],
      ['Autre activite', 'custom', '{}']
    ];
    for (const aps of apsList) {
      await db.run('INSERT INTO aps (name, type, default_config) VALUES (?, ?, ?)', aps[0], aps[1], aps[2]);
    }
    console.log('✅ Activités sportives ajoutées');
  }

  // Insertion des critères prédéfinis (is_preset=1) pour chaque APS
  // On vérifie pour chaque type s'il manque des critères prédéfinis
  const apsAll = await db.all('SELECT id, type FROM aps');
  for (const aps of apsAll) {
    const existingPreset = await db.get(
      'SELECT COUNT(*) as count FROM evaluation_criteria WHERE aps_id = ? AND is_preset = 1',
      aps.id
    );
    if (existingPreset.count === 0) {
      if (aps.type === 'gymnastics') {
        await db.run(
          `INSERT INTO evaluation_criteria (aps_id, teacher_id, name, max_score, formula_type, is_active, is_preset)
           VALUES (?, NULL, 'Difficulté', 7, 'difficulty', 1, 1)`,
          aps.id
        );
        await db.run(
          `INSERT INTO evaluation_criteria (aps_id, teacher_id, name, max_score, formula_type, is_active, is_preset)
           VALUES (?, NULL, 'Exécution', 13, 'manual', 1, 1)`,
          aps.id
        );
        console.log(`✅ Critères prédéfinis ajoutés pour Gymnastique (id=${aps.id})`);
      } else if (aps.type === 'sprint') {
        await db.run(
          `INSERT INTO evaluation_criteria (aps_id, teacher_id, name, max_score, formula_type, is_active, is_preset)
           VALUES (?, NULL, 'Performance (temps)', 6, 'time', 1, 1)`,
          aps.id
        );
        console.log(`✅ Critères prédéfinis ajoutés pour Course de vitesse (id=${aps.id})`);
      } else if (aps.type === 'courselongue') {
        await db.run(
          `INSERT INTO evaluation_criteria (aps_id, teacher_id, name, max_score, formula_type, is_active, is_preset)
           VALUES (?, NULL, 'Performance (temps)', 6, 'time', 1, 1)`,
          aps.id
        );
        console.log(`✅ Critères prédéfinis ajoutés pour Course de durée (id=${aps.id})`);
      }
    }
  }
  console.log('✅ Vérification des critères prédéfinis terminée');

  // Création d'un admin par défaut
  const adminExists = await db.get('SELECT id FROM users WHERE role = "admin" LIMIT 1');
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await db.run('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)', 
      'admin', hashedPassword, 'Administrateur', 'admin');
    console.log('👨‍💼 Admin créé : admin / admin123');
  }

  const teacherExists = await db.get('SELECT id FROM users WHERE role = "teacher" LIMIT 1');
  if (!teacherExists) {
    const hashedPassword = await bcrypt.hash('teacher123', 10);
    await db.run('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)', 
      'professeur', hashedPassword, 'Professeur Test', 'teacher');
    console.log('👨‍🏫 Enseignant test créé : professeur / teacher123');
  }

  return db;
}

function getDatabase() {
  return db;
}

module.exports = { initDatabase, getDatabase };