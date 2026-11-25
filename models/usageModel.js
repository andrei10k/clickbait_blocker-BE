const mongoose = require('mongoose')

// Daily AI usage counters, one row per account per day. TTL cleans up after
// two days so the collection stays small.
const usageSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  email: String,
  summarize: { type: Number, default: 0 },
  rank: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 172800 }
})

module.exports = mongoose.model('Usage', usageSchema)
