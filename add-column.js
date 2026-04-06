const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function addColumn() {
  const db = await open({
    filename: path.join(__dirname, 'database/school.db'),
    driver: sqlite3.Database
  });
  
  try {
    await db.run(`ALTER TABLE evaluations ADD COLUMN student_can_input INTEGER DEFAULT 0`);
    console.log('✅ Colonne student_can_input ajoutée avec succès');
  } catch (err) {
    console.log('Erreur:', err.message);
  }
  
  // Vérifier après ajout
  const tableInfo = await db.all(`PRAGMA table_info(evaluations)`);
  console.log('\nColonnes après ajout:');
  console.table(tableInfo);
  
  await db.close();
}

addColumn();