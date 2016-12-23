var config = require('./config');

if (process.env.USERNAME) {
  config = {
    username: process.env.USERNAME,
    password: process.env.PASSWORD
  }
}

module.exports = {
  getDBConnectionString: function() {
    return 'mongodb://' + config.username + ':' + config.password + '@yourMlabId';
  }
};