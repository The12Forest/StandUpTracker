require('dotenv').config();

// Only MONGO_URI is read from environment variables.
// All other configuration is stored in the database Settings collection
// and managed via the Admin Console UI.
module.exports = {
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/standuptracker',
};
