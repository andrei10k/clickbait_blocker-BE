var ClickbaitModel = require('../models/clickbaitModel');

module.exports = function(app) {

  //clickbait links
  app.post('/api/clickbait', function(req, res) {
    ClickbaitModel.findOne({
      pageDomain: req.body.pageDomain,
      clickBaitLink: req.body.clickBaitLink
    }).then(function(doc) {
      if (doc) {
        if (Number(req.body.upVotes)) {
          doc.upVotes =  doc.upVotes + 1;
        } else {
          doc.downVotes =  doc.downVotes + 1;
        }
        doc.relevance = doc.upVotes - doc.downVotes;
        doc.updated_at = new Date(Date.now()).toLocaleString();
        return doc.save();
      } else {
        var newClickbait = ClickbaitModel({
          pageUrl: req.body.pageUrl,
          pageDomain: req.body.pageDomain,
          clickBaitLink: req.body.clickBaitLink,
          upVotes: Number(req.body.upVotes),
          downVotes: Number(req.body.downVotes),
          relevance: Number(req.body.upVotes) - Number(req.body.downVotes),
          created_at: new Date(Date.now()).toLocaleString(),
          updated_at: new Date(Date.now()).toLocaleString()
        });
        return newClickbait.save();
      }
    }).then(function() {
      res.send('Success');
    }).catch(function(err) {
      throw err;
    });
  });

  app.get('/api/clickbait/get/all', function(req, res) {
    ClickbaitModel.find({})
      .then(function(result) {
        res.render('clickbaits_grid', { results: result });
      })
      .catch(function(err) {
        throw err;
      });
  });

  app.get('/api/clickbait', function(req, res) {
    if (req.query.pageDomain && req.query.relevance) {
      ClickbaitModel.find({
        pageDomain: req.query.pageDomain
      }).where('relevance').gt(req.query.relevance)
        .then(function(result) {
          res.send(result);
        })
        .catch(function(err) {
          throw err;
        });
    } else {
      res.status(500);
      res.send('bad request');
    }
  });
};