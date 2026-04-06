const express = require('express');
const session = require('express-session');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration du moteur de templates
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Fichiers statiques (CSS, JS)
app.use(express.static(path.join(__dirname, 'public')));

// Pour lire les données des formulaires
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Gestion des sessions (connexion)
app.use(session({
  secret: 'secret-recherche-pedagogique-eps',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Variable disponible dans toutes les pages
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Initialisation de la base de données
const { initDatabase } = require('./models/database');

// Fonction pour démarrer le serveur
async function startServer() {
  await initDatabase();
  
  // Import des routes
  const authRoutes = require('./routes/auth');
  const adminRoutes = require('./routes/admin');
  const teacherRoutes = require('./routes/teacher');
  const studentRoutes = require('./routes/student');
  
  // Utilisation des routes
  app.use('/', authRoutes);
  app.use('/admin', adminRoutes);
  app.use('/teacher', teacherRoutes);
  app.use('/student', studentRoutes);
  
  // Route d'accueil
  app.get('/', (req, res) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    
    switch(req.session.user.role) {
      case 'admin':
        res.redirect('/admin/dashboard');
        break;
      case 'teacher':
        res.redirect('/teacher/dashboard');
        break;
      case 'student':
        res.redirect('/student/dashboard');
        break;
      default:
        res.redirect('/login');
    }
  });

  app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
  });
}

// Lancer l'application
startServer().catch(console.error);