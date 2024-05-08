module.exports = {
  getDBConnectionString: function() {
    return `mongodb+srv://${process.env.USERNAME}:${process.env.PASSWORD}@cluster0.dgik4gh.mongodb.net/?retryWrites=true&w=majority`
  }
};