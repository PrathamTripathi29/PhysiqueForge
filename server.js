const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const path = require('path');
const fs = require('fs');


const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());
app.use(express.json());
const caPath = path.join(__dirname, 'ca.pem');
if (!fs.existsSync(caPath)) {
  console.error('❌ CA certificate not found at:', caPath);
} else {
  console.log('✅ CA certificate loaded');
}

// Create MySQL connection
const db = mysql.createConnection({
  host: 'mysql-2cdbeb27-physiqueforge.k.aivencloud.com',
  user: 'avnadmin',
  password: 'AVNS_bsXkOMAO0fa4BnbGN06',
  database: 'defaultdb',
  port: 25557,
  ssl: {
    ca: fs.readFileSync(path.join(__dirname, 'ca.pem')),
  },

});

console.log('Connecting to MySQL database...', );

db.connect(err => {
  if (err) {
    console.error('Error connecting to MySQL:', err);
    process.exit(1);
  }
  console.log('Connected to MySQL database');
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});



// POST endpoint to save user profile
app.post('/user-profile', (req, res) => {
  const { age, gender, goals } = req.body;
  const goalsString = JSON.stringify(goals);
  const query = 'INSERT INTO users (age, gender, goals) VALUES (?, ?, ?)';
  
  db.query(query, [age, gender, goalsString], (err, results) => {
    if (err) {
      console.error('Error saving user profile:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    // Return the generated user id
    res.json({ userId: results.insertId });
  });
});

// GET endpoint to retrieve user profile and generate schedule
app.get('/user-profile/:id', (req, res) => {
  const { id } = req.params;
  const query = 'SELECT * FROM users WHERE id = ?';
  
  db.query(query, [id], async (err, results) => {
    if (err) {
      console.error('Error retrieving user profile:', err);
      return res.status(500).json({ error: 'Database error' });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    // Retrieve and parse user data
    const user = results[0];
    console.log('User data:', user);
    try {
      user.goals = JSON.parse(user.goals);
    } catch (parseErr) {
      console.error('Error parsing goals:', parseErr);
      user.goals = [];
    }
    
    // Prepare the Gemini API call prompt by inserting the user's data
    const ai = new GoogleGenAI({ apiKey: "AIzaSyA3xR-O5u43SWES-F0Divc4cF3aaedWNhk" });
    const prompt = `You are a fitness planning assistant. Generate a personalized weekly workout schedule based on the user's age, gender, and fitness goals. User age: ${user.age}, gender: ${user.gender}, goals: ${JSON.stringify(user.goals)}. Your response must strictly follow this JSON structure: use this url for image in all exercises https://img.freepik.com/free-vector/couple-practicing-trail-run-training_74855-5474.jpg {\"userProfile\":{\"age\":number,\"gender\":\"string\",\"goals\":[\"string\"]},\"notes\":[\"string\"],\"totalWeeks\":number,\"workoutSchedule\":{\"days\":[{\"day\":\"string\",\"focus\":\"string\",\"exercises\":[{\"id\":\"string\",\"name\":\"string\",\"primaryTarget\":\"string\",\"secondaryTargets\":[\"string\"],\"sets\":number,\"reps\":\"string\",\"rest\":\"string\",\"gifUrl\":\"string\"}]}]}}. Tailor the workouts to the user’s profile and goals. Include relevant exercises with realistic values for sets, reps, and rest. Provide helpful notes on form, consistency, and safety. Ensure totalWeeks is between 4 and 12 based on goal intensity. Use actual or placeholder gifUrl values. Return only valid JSON following this structure.`;
    console.log('Prompt for Gemini API:', prompt);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: prompt
      });
      
      console.log('Raw Gemini API response:', response.text);
      // Clean the response by removing the triple backticks and "json" marker
      const rawText = response.text;
      const cleanText = rawText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      console.log('Cleaned Gemini API response:', cleanText);
      
      // Parse the cleaned text into JSON
      let parsedSchedule;
      try {
        parsedSchedule = JSON.parse(cleanText);
      } catch (parseError) {
        console.error('Error parsing cleaned schedule JSON:', parseError);
        return res.status(500).json({ error: 'Error parsing AI response' });
      }
      
      // Return the user data along with the generated schedule from Gemini API
      res.json({
        user,
        schedule: parsedSchedule
      });
    } catch (aiErr) {
      console.error('Error generating schedule with Gemini API:', aiErr);
      res.status(500).json({ error: 'AI generation error' });
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
