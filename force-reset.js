const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const bcrypt = require('bcrypt');

async function forceReset() {
  const db = await open({
    filename: path.join(__dirname, 'database/school.db'),
    driver: sqlite3.Database
  });
  
  // Nouveau mot de passe simple
  const newPassword = '123456';
  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  // Réinitialiser pour l'utilisateur '2024001'
  const result = await db.run(`
    UPDATE users 
    SET password = ? 
    WHERE username = '2024001' AND role = 'student'
  `, hashedPassword);
  
  if (result.changes > 0) {
    console.log('✅ Mot de passe réinitialisé pour username: 2024001');
    console.log('   Nouveau mot de passe: 123456');
  } else {
    console.log('❌ Utilisateur non trouvé avec username: 2024001');
    
    // Vérifier tous les élèves
    const students = await db.all(`
      SELECT u.username, u.full_name FROM users u WHERE u.role = 'student'
    `);
    console.log('\n📋 Tous les élèves disponibles:');
    students.forEach(s => {
      console.log(`   - ${s.full_name}: username = ${s.username}`);
    });
  }
  
  await db.close();
}

forceReset();