const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

async function fixDatabase() {
  const db = await open({
    filename: path.join(__dirname, 'database/school.db'),
    driver: sqlite3.Database
  });
  
  console.log('📁 Base de données ouverte');
  
  // Vérifier la structure actuelle
  const tableInfo = await db.all(`PRAGMA table_info(users)`);
  console.log('Structure actuelle de la table users:');
  console.table(tableInfo);
  
  // Vérifier si la colonne is_active existe
  const hasIsActive = tableInfo.some(col => col.name === 'is_active');
  
  if (!hasIsActive) {
    console.log('\n❌ La colonne is_active est manquante. Ajout en cours...');
    
    try {
      await db.run(`ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1`);
      console.log('✅ Colonne is_active ajoutée avec succès');
    } catch (err) {
      console.log('Erreur lors de l\'ajout:', err.message);
      
      // Si ALTER TABLE ne fonctionne pas, on recrée la table
      console.log('\n🔄 Tentative de recréation de la table...');
      
      // Sauvegarder les données
      const usersData = await db.all(`SELECT * FROM users`);
      console.log(`📋 ${usersData.length} utilisateurs sauvegardés`);
      
      // Supprimer l'ancienne table
      await db.run(`DROP TABLE users`);
      
      // Recréer la table avec la bonne structure
      await db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          full_name TEXT NOT NULL,
          role TEXT CHECK(role IN ('admin', 'teacher', 'student')) NOT NULL,
          class_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_active INTEGER DEFAULT 1
        )
      `);
      
      // Réinsérer les données
      for (const user of usersData) {
        await db.run(`
          INSERT INTO users (id, username, password, full_name, role, class_id, created_at, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, user.id, user.username, user.password, user.full_name, user.role, user.class_id, user.created_at, user.is_active || 1);
      }
      
      console.log(`✅ ${usersData.length} utilisateurs réinsérés`);
    }
  } else {
    console.log('\n✅ La colonne is_active existe déjà');
  }
  
  // Vérification finale
  const newTableInfo = await db.all(`PRAGMA table_info(users)`);
  console.log('\n✅ Structure finale de la table users:');
  console.table(newTableInfo);
  
  await db.close();
  console.log('\n🎉 Correction terminée ! Redémarrez le serveur avec "node app.js"');
}

fixDatabase();