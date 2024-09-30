const ClickbaitModel = require('../models/clickbaitModel')
const UserModel = require('../models/userModel')
const axios = require('axios')
const { getTextFromUrl, tokenizer } = require('../utils/helpers')

module.exports = function (app) {
  //clickbait links
  app.post('/api/clickbait', function (req, res) {
    ClickbaitModel.findOne({
      pageDomain: req.body.pageDomain,
      clickBaitLink: req.body.clickBaitLink
    })
      .then(function (doc) {
        if (doc) {
          if (Number(req.body.upVotes)) {
            doc.upVotes = doc.upVotes + 1
          } else {
            doc.downVotes = doc.downVotes + 1
          }
          doc.relevance = doc.upVotes - doc.downVotes
          doc.updated_at = new Date(Date.now()).toLocaleString()
          return doc.save()
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
          })
          return newClickbait.save()
        }
      })
      .then(function () {
        res.send('Success')
      })
      .catch(function (err) {
        throw err
      })
  })

  app.get('/api/clickbait/get/all', function (req, res) {
    ClickbaitModel.find({})
      .then(function (result) {
        res.render('clickbaits_grid', { results: result })
      })
      .catch(function (err) {
        throw err
      })
  })

  app.get('/api/clickbait', function (req, res) {
    if (req.query.pageDomain && req.query.relevance) {
      ClickbaitModel.find({
        pageDomain: req.query.pageDomain
      })
        .where('relevance')
        .gt(req.query.relevance)
        .then(function (result) {
          res.send(result)
        })
        .catch(function (err) {
          throw err
        })
    } else {
      res.status(500)
      res.send('bad request')
    }
  })

  app.get('/api/summarize', async function (req, res) {
    const url = req.query.url
    const title = req.query.title

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.CHATGPT_API_KEY}`
    }

    let content = ''
    try {
      content = await getTextFromUrl(url)
    } catch (error) {
      console.error('Error fetching content from URL:', error)
      res.status(500)
      res.send('Error fetching content from URL')
      return
    }

    const chatGptEncoderDecoder = tokenizer()

    const contentTokens = chatGptEncoderDecoder.encode(content)
    const truncatedContentTokens = contentTokens.slice(0, 1000)
    const truncatedContent = chatGptEncoderDecoder.decode(truncatedContentTokens)

    if (!truncatedContent) {
      res.send({ content: 'There is nothing to summarize, please try another url' })
      return
    }

    const prompt = [
      {
        role: 'user',
        content: 'In only 2 sentences, summarize the following content:'
      },
      {
        role: 'user',
        content: truncatedContent
      }
    ]

    const data = {
      messages: prompt,
      model: 'gpt-4o-mini'
    }

    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', data, {
        headers
      })

      const content = response.data.choices[0].message.content.trim()

      const followUpResponse = await axios.post('https://api.openai.com/v1/chat/completions', {
        messages: [
          {
            role: 'user',
            content: 'I will give you next a summary of the article and the article title. respond with how confident are you that the title is clickbait based on the content. please respond with only a percentage, not extra words. i want you to respond based on only what you know. the title and the content. do not consider other context or missing informations. The summary is ' + content + '. The article title is: ' + title
          }
        ],
        model: 'gpt-4o-mini'
      }, {
        headers
      })

      res.send({ content, clickbait_confidence: followUpResponse.data.choices[0].message.content })
    } catch (error) {
      console.error('Error fetching ChatGPT response:', error)
      res.status(500)
      res.send('Error fetching ChatGPT response')
    }
  })

  app.post('/api/user', async function (req, res) {
    try {
      const user = await UserModel.findOneAndUpdate(
        { email: req.body.email },
        { $set: { last_login_date: Date.now() } },
        { new: true, upsert: true }
      )

      res.send(user)
    } catch (error) {
      res.status(400)
      res.send(error)
    }
  })
}
