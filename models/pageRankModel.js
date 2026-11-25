const mongoose = require('mongoose')

// One row per scanned page, kept for an hour so repeated scans are free.
const pageRankSchema = new mongoose.Schema({
  pageHash: { type: String, required: true, unique: true },
  pageUrl: String,
  results: [
    {
      url: String,
      score: Number,
      reason: String
    }
  ],
  createdAt: { type: Date, default: Date.now, expires: 3600 }
})

module.exports = mongoose.model('PageRank', pageRankSchema)
