const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function addBirthDateColumn() {
  const db = await open({
    filename: path.join(__dirname, 'database/school.db'),
    driver: sqlite3.Database
  });
  
  console.log('📁 Base de données ouverte');
  
  // Vérifier la structure actuelle
  const tableInfo = await db.all(`PRAGMA table_info(students)`);
  console.log('Structure actuelle de la table students:');
  console.table(tableInfo);
  
  // Vérifier si la colonne birth_date existe
  const hasBirthDate = tableInfo.some(col => col.name === 'birth_date');
  
  if (!hasBirthDate) {
    console.log('\n❌ La colonne birth_date est manquante. Ajout en cours...');
    await db.run(`ALTER TABLE students ADD COLUMN birth_date TEXT`);
    console.log('✅ Colonne birth_date ajoutée avec succès');
  } else {
    console.log('\n✅ La colonne birth_date existe déjà');
  }
  
  // Vérifier à nouveau
  const newTableInfo = await db.all(`PRAGMA table_info(students)`);
  console.log('\nNouvelle structure de la table students:');
  console.table(newTableInfo);
  
  await db.close();
  console.log('\n🎉 Terminé ! Redémarrez le serveur avec "node app.js"');
}

addBirthDateColumn();