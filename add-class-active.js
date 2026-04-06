const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function addActiveColumn() {
  const db = await open({
    filename: path.join(__dirname, 'database/school.db'),
    driver: sqlite3.Database
  });
  
  console.log('📁 Base de données ouverte');
  
  // Vérifier la structure actuelle
  const tableInfo = await db.all(`PRAGMA table_info(classes)`);
  console.log('Structure actuelle de la table classes:');
  console.table(tableInfo);
  
  // Vérifier si la colonne is_active existe
  const hasIsActive = tableInfo.some(col => col.name === 'is_active');
  
  if (!hasIsActive) {
    console.log('\n❌ La colonne is_active est manquante. Ajout en cours...');
    await db.run(`ALTER TABLE classes ADD COLUMN is_active INTEGER DEFAULT 0`);
    console.log('✅ Colonne is_active ajoutée avec succès');
  } else {
    console.log('\n✅ La colonne is_active existe déjà');
  }
  
  // Vérifier à nouveau
  const newTableInfo = await db.all(`PRAGMA table_info(classes)`);
  console.log('\nNouvelle structure de la table classes:');
  console.table(newTableInfo);
  
  await db.close();
  console.log('\n🎉 Terminé ! Redémarrez le serveur avec "node app.js"');
}

addActiveColumn();