var ClickbaitModel = require('../models/clickbaitModel');

module.exports = function(app) {

  //clickbait links
  app.post('/yourapi/post', function(req, res) {

    ClickbaitModel.findOne({
      pageDomain: req.body.pageDomain,
      clickBaitLink: req.body.clickBaitLink
    }, function(err, doc) {
      if (err) throw err;
      if (doc) {
        if (Number(req.body.upVotes)) {
          doc.upVotes =  doc.upVotes + 1;
        } else {
          doc.downVotes =  doc.downVotes + 1;
        }
        doc.relevance = doc.upVotes - doc.downVotes;
        doc.updated_at = new Date(Date.now()).toLocaleString();
        doc.save(function(err){
          if (err) throw err;
          res.send('Success');
        })
      } else {
        var newClickbait = ClickbaitModel({
          pageUrl: req.body.pageUrl,
          pageDomain: req.body.pageDomain,
          clickBaitLink: req.body.clickBaitLink,
          upVotes: req.body.upVotes || 0,
          downVotes: req.body.downVotes || 0,
          relevance: req.body.upVotes - req.body.downVotes,
          updated_at: new Date(Date.now()).toLocaleString()
        });
        newClickbait.save(function(err){
          if (err) throw err;
          res.send('Success');
        })
      }
    });

  });

  app.get('/yourapi/get/all', function(req, res) {
    ClickbaitModel.find({}, function(err, result){
      if (err) throw err;
      res.render('clickbaits_grid', { results: result });
    })
  });

  app.get('/yourapi/get', function(req, res) {
    if (req.query.pageDomain && req.query.relevance) {
      ClickbaitModel.find({
        pageDomain: req.query.pageDomain
      }).where('relevance').gt(req.query.relevance).
      exec(function(err, result) {
        res.send(result);
      });
    } else {
      res.status(500);
      res.send('bad request');
    }
  });
};