const mongoose = require('mongoose')

async function connectDatabase() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is required. Set it in backend/.env.')
  try {
    await mongoose.connect(uri)
    console.log('MongoDB Connected Successfully')
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`)
    process.exit(1)
  }
}

module.exports = connectDatabase
