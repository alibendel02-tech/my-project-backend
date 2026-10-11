const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files (e.g., index.html) if located in the root directory
app.use(express.static(__dirname)); 

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MySQL Connection Pool (Configured for Cloud DBs like Aiven, PlanetScale, Render)
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Automatically create the wishes table on startup if it doesn't exist
async function initDB() {
  try {
    const createTableQuery = 
      CREATE TABLE IF NOT EXISTS wishes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        category VARCHAR(100),
        message TEXT NOT NULL,
        image_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    ;
    await pool.query(createTableQuery);
    console.log("Database table 'wishes' is ready!");
  } catch (err) {
    console.error("Error creating database table:", err);
  }
}

// Configure Multer for File Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- API ENDPOINTS ---

// Health Check Route
app.get('/api/health', (req, res) => {
  res.send('Wedding Guestbook API Server is running!');
});

// GET /api/wishes - Fetch all wishes
app.get('/api/wishes', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM wishes ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve wishes' });
  }
});

// POST /api/wishes - Add a new wish with optional photo
app.post('/api/wishes', upload.single('image'), async (req, res) => {
  const { name, email, category, message } = req.body;
  const imageUrl = req.file ? /uploads/${req.file.filename} : null;

  if (!name  !email  !message) {
    return res.status(400).json({ error: 'Name, email, and message are required fields.' });
  }

  try {
    const sql = 'INSERT INTO wishes (name, email, category, message, image_url) VALUES (?, ?, ?, ?, ?)';
    const [result] = await pool.query(sql, [name, email, category, message, imageUrl]);
    
    const [newWish] = await pool.query('SELECT * FROM wishes WHERE id = ?', [result.insertId]);
    res.status(201).json(newWish[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save wish' });
  }
});

// DELETE /api/wishes/:id - Delete a wish
app.delete('/api/wishes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM wishes WHERE id = ?', [id]);
    res.json({ message: 'Wish deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete wish' });
  }
});

// Catch-all route to serve index.html for non-API requests (Express 5 compatible)
app.get('/*splat', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server and Initialize Database
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(Server running on port ${PORT});
  await initDB();
});
