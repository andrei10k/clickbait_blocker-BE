var mongoose = require('mongoose')

var Schema = mongoose.Schema

var userSchema = new Schema({
  email: {
    type: String,
    required: true,
    unique: true
  },
  joined_date: {
    type: Date,
    default: Date.now
  },
  last_login_date: {
    type: Date,
    default: Date.now
  }
})

var User = mongoose.model('User', userSchema)

module.exports = User
