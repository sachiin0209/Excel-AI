const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI not set in env');

const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    ssl: true,
    tls: true,
    tlsAllowInvalidCertificates: false
});

let db;
async function connect() {
  if (!db) {
    await client.connect();
    db = client.db(); // use DB from connection string
  }
  return db;
}

async function getInterviewsCollection() {
  const database = await connect();
  return database.collection('interviews');
}

module.exports = { connect, getInterviewsCollection };
