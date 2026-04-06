const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function checkTable() {
  const db = await open({
    filename: path.join(__dirname, 'database/school.db'),
    driver: sqlite3.Database
  });
  
  const tableInfo = await db.all(`PRAGMA table_info(evaluations)`);
  console.log('Colonnes de la table evaluations:');
  console.table(tableInfo);
  
  // Vérifier spécifiquement la colonne student_can_input
  const hasColumn = tableInfo.some(col => col.name === 'student_can_input');
  if (hasColumn) {
    console.log('\n✅ La colonne "student_can_input" existe !');
  } else {
    console.log('\n❌ La colonne "student_can_input" est manquante !');
  }
  
  await db.close();
}

checkTable();