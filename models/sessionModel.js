const mongoose = require('mongoose')

// Session token issued after a verified Google sign in. Expires after 30 days.
const sessionSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 2592000 }
})

module.exports = mongoose.model('Session', sessionSchema)
