var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var clickbaitSchema = new Schema({
  pageUrl: String,
  pageDomain: String,
  clickBaitLink: String,
  upVotes: Number,
  downVotes: Number,
  relevance: Number,
  updated_at: String
});

var Clickbait = mongoose.model('Clickbait', clickbaitSchema);

module.exports = Clickbait;