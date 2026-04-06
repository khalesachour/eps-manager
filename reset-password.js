const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const bcrypt = require('bcrypt');

async function resetPassword() {
  const db = await open({
    filename: path.join(__dirname, 'database/school.db'),
    driver: sqlite3.Database
  });
  
  // Réinitialiser le mot de passe pour l'élève "Anir" avec le numéro 2024001
  const hashedPassword = await bcrypt.hash('2024001', 10);
  
  const result = await db.run(`
    UPDATE users 
    SET password = ? 
    WHERE username = '2024001' AND role = 'student'
  `, hashedPassword);
  
  if (result.changes > 0) {
    console.log('✅ Mot de passe réinitialisé pour Anir (username: 2024001, password: 2024001)');
  } else {
    console.log('❌ Élève non trouvé avec username: 2024001');
  }
  
  // Afficher tous les élèves
  const students = await db.all(`
    SELECT u.id, u.username, u.full_name, s.student_number
    FROM users u
    JOIN students s ON u.id = s.user_id
    WHERE u.role = 'student'
  `);
  
  console.log('\n📋 Élèves disponibles:');
  students.forEach(s => {
    console.log(`   ${s.full_name} - username: ${s.username} - mot de passe par défaut: ${s.student_number}`);
  });
  
  await db.close();
}

resetPassword();