const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const bcrypt = require('bcrypt');

let db;

async function initDatabase() {
  db = await open({
    filename: path.join(__dirname, '../database/school.db'),
    driver: sqlite3.Database
  });

  console.log('📁 Base de données connectée');

  // Création des tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT CHECK(role IN ('admin', 'teacher', 'student')) NOT NULL,
      class_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      teacher_id INTEGER,
      FOREIGN KEY (teacher_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      student_number TEXT NOT NULL,
      gender TEXT CHECK(gender IN ('M', 'F')) NOT NULL,
      birth_date DATE,
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
      teacher_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      max_score REAL NOT NULL,
      formula_type TEXT,
      formula_params TEXT,
      is_active INTEGER DEFAULT 1,
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
      FOREIGN KEY (student_id) REFERENCES students(id)
    );
  `);

  // Vérifier si les APS existent déjà
  const countAPS = await db.get('SELECT COUNT(*) as total FROM aps');
  
  if (countAPS.total === 0) {
    console.log('📝 Insertion des activités sportives...');
    
    // Insertion une par une avec des requêtes préparées
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
    
    console.log('✅ Activités sportives ajoutées avec les bonnes valeurs pour la gymnastique');
  }

  // Création d'un admin par défaut
  const adminExists = await db.get('SELECT id FROM users WHERE role = "admin" LIMIT 1');
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 10);
    await db.run('INSERT INTO users (username, password, full_name, role) VALUES (?, ?, ?, ?)', 
      'admin', hashedPassword, 'Administrateur', 'admin');
    console.log('👨‍💼 Admin créé : admin / admin123');
  }

  // Création d'un enseignant test
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
