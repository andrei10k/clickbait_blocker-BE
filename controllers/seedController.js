var clickbaitModel = require('../models/clickbaitModel')

module.exports = function (app) {
  app.get('/api/seed', function (req, res) {
    var linksArr = [
      {
        pageUrl: 'www.test.ro',
        pageDomain: 'www.test.ro',
        clickBaitLink: 'www.test.ro',
        upVotes: 1,
        downVotes: 0,
        ip: '123',
        country: 'Romania',
        updated_at: '10.01.2016'
      },
      {
        pageUrl: 'www.test1.ro',
        pageDomain: 'www.test1.ro',
        clickBaitLink: 'www.test1.ro',
        upVotes: 1,
        downVotes: 0,
        ip: '1234',
        country: 'Romania',
        updated_at: '10.02.2016'
      }
    ]

    clickbaitModel.create(linksArr, function (err, results) {
      res.send(results)
    })
  })
}
