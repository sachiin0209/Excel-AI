const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config();
const morgan = require('morgan');
const cors = require('cors');
const { connect } = require('./db');

const interviewRoutes = require('./routes/interview');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Database connection check
async function initializeServer() {
  try {
    // Test database connection
    await connect();
    console.log('Successfully connected to MongoDB');

    // Serve static files first
    app.use(express.static(path.join(__dirname, 'public')));
    
    // Then handle API routes
    app.use('/', interviewRoutes);

    app.listen(PORT, () => {
      console.log(`AI Excel Mock Interviewer running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

initializeServer();
