var config = require('./config');

if (process.env.USERNAME) {
  config = {
    username: process.env.USERNAME,
    password: process.env.PASSWORD
  }
}

module.exports = {
  getDBConnectionString: function() {
    return `mongodb+srv://${config.username}:${config.password}@cluster0.dgik4gh.mongodb.net/?retryWrites=true&w=majority`
  }
};