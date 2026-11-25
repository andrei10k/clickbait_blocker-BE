const mongoose = require('mongoose')

// Cached AI result per article url. The TTL index removes entries after a week.
const summarySchema = new mongoose.Schema({
  urlHash: { type: String, required: true, unique: true },
  url: String,
  content: String,
  score: Number,
  reason: String,
  tags: [String],
  createdAt: { type: Date, default: Date.now, expires: 604800 }
})

module.exports = mongoose.model('Summary', summarySchema)
