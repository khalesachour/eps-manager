const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function findStudentCredentials() {
  const db = await open({
    filename: path.join(__dirname, 'database/school.db'),
    driver: sqlite3.Database
  });
  
  const students = await db.all(`
    SELECT u.id, u.username, u.full_name, s.student_number, s.gender
    FROM users u
    JOIN students s ON u.id = s.user_id
    WHERE u.role = 'student'
  `);
  
  console.log('📋 Élèves inscrits avec leurs identifiants:');
  students.forEach(s => {
    console.log(`\n👤 ${s.full_name}`);
    console.log(`   Nom d'utilisateur (login): ${s.username}`);
    console.log(`   Numéro d'élève: ${s.student_number}`);
    console.log(`   Mot de passe par défaut: ${s.student_number}`);
  });
  
  await db.close();
}

findStudentCredentials();