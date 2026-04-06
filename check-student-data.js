const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function checkStudentData() {
  const db = await open({
    filename: path.join(__dirname, 'database/school.db'),
    driver: sqlite3.Database
  });
  
  // Vérifier l'élève Anir
  const student = await db.get(`
    SELECT u.id, u.full_name, u.class_id, s.student_number
    FROM users u
    JOIN students s ON u.id = s.user_id
    WHERE u.username = '2024001'
  `);
  
  if (student) {
    console.log('👤 Élève trouvé:');
    console.log(`   ID: ${student.id}`);
    console.log(`   Nom: ${student.full_name}`);
    console.log(`   Classe ID: ${student.class_id || 'Aucune classe'}`);
    console.log(`   Numéro: ${student.student_number}`);
    
    // Vérifier les notes
    const grades = await db.all(`
      SELECT g.*, e.aps_id, a.name as aps_name
      FROM grades g
      JOIN evaluations e ON g.evaluation_id = e.id
      JOIN aps a ON e.aps_id = a.id
      WHERE g.student_id = ?
    `, student.id);
    
    console.log(`\n📊 Notes trouvées: ${grades.length}`);
    if (grades.length > 0) {
      grades.forEach(g => {
        console.log(`   - ${g.aps_name}: ${g.total_score}/20`);
      });
    } else {
      console.log('   Aucune note trouvée pour cet élève');
    }
  } else {
    console.log('❌ Élève non trouvé avec username 2024001');
  }
  
  await db.close();
}

checkStudentData();