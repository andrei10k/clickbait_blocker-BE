const crypto = require('crypto')
const ClickbaitModel = require('../models/clickbaitModel')
const UserModel = require('../models/userModel')
const SessionModel = require('../models/sessionModel')
const SummaryModel = require('../models/summaryModel')
const PageRankModel = require('../models/pageRankModel')
const UsageModel = require('../models/usageModel')
const mongoose = require('mongoose')
const axios = require('axios')
const { getTextFromUrl, hashString, parseJsonLoose } = require('../utils/helpers')

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const SUMMARIZE_DAILY_LIMIT = 25
const RANK_DAILY_LIMIT = 20

function askOpenAi(messages) {
  return axios
    .post(
      OPENAI_URL,
      { messages, model: 'gpt-4o-mini', response_format: { type: 'json_object' } },
      {
        timeout: 45000,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.CHATGPT_API_KEY}`
        }
      }
    )
    .then((response) => response.data.choices[0].message.content)
}

function clampScore(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return null
  }
  return Math.max(0, Math.min(100, Math.round(number)))
}

async function summarizeWithModel(url, title, text) {
  const messages = [
    {
      role: 'system',
      content:
        'You rate news articles for clickbait. Reply with JSON only, no prose: ' +
        '{"summary":"two sentences","score":0-100,"reason":"max 12 words","tags":["short","labels"]}'
    },
    {
      role: 'user',
      content: 'Title: ' + title + '\n\nText: ' + text
    }
  ]

  const parsed = parseJsonLoose(await askOpenAi(messages))
  const score = clampScore(parsed && parsed.score)

  if (!parsed || !parsed.summary || score === null) {
    return null
  }

  return {
    content: String(parsed.summary).trim(),
    score,
    clickbait_confidence: score + '%',
    reason: String(parsed.reason || '').trim(),
    tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 4).map(String) : []
  }
}

async function readSummaryCache(url) {
  if (mongoose.connection.readyState !== 1) {
    return null
  }

  const doc = await SummaryModel.findOne({ urlHash: hashString(url) }).lean()
  if (!doc) {
    return null
  }

  return {
    content: doc.content,
    score: doc.score,
    clickbait_confidence: doc.score + '%',
    reason: doc.reason,
    tags: doc.tags || []
  }
}

async function writeSummaryCache(url, result) {
  if (mongoose.connection.readyState !== 1) {
    return
  }

  await SummaryModel.updateOne(
    { urlHash: hashString(url) },
    { $set: Object.assign({ url }, result, { createdAt: new Date() }) },
    { upsert: true }
  ).catch((error) => {
    console.error('Summary cache write failed:', error.message)
  })
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

async function sessionEmail(req) {
  const token = (req.query && req.query.session) || (req.body && req.body.session)
  if (!token || mongoose.connection.readyState !== 1) {
    return ''
  }

  const session = await SessionModel.findOne({ token }).lean()
  return session ? session.email : ''
}

async function usageCounters(email) {
  if (!email || mongoose.connection.readyState !== 1) {
    return { summarize: 0, rank: 0 }
  }

  const doc = await UsageModel.findOne({ key: email + '|' + todayKey() }).lean()
  return { summarize: (doc && doc.summarize) || 0, rank: (doc && doc.rank) || 0 }
}

async function consumeQuota(req, kind) {
  const limits = { summarize: SUMMARIZE_DAILY_LIMIT, rank: RANK_DAILY_LIMIT }
  const email = await sessionEmail(req)

  // Anonymous use stays allowed, it is simply not counted per account.
  if (!email) {
    return { allowed: true, email: '', usage: null }
  }

  const key = email + '|' + todayKey()
  const increment = {}
  increment[kind] = 1

  const doc = await UsageModel.findOneAndUpdate(
    { key },
    { $inc: increment, $setOnInsert: { email } },
    { upsert: true, new: true }
  )

  const used = (doc && doc[kind]) || 0
  if (used > limits[kind]) {
    const rollback = {}
    rollback[kind] = -1
    await UsageModel.updateOne({ key }, { $inc: rollback })
    return {
      allowed: false,
      email,
      usage: {
        summarizeRemaining: Math.max(0, limits.summarize - ((doc && doc.summarize) || 0)),
        rankRemaining: Math.max(0, limits.rank - ((doc && doc.rank) || 0))
      }
    }
  }

  return {
    allowed: true,
    email,
    usage: {
      summarizeRemaining: Math.max(0, limits.summarize - ((doc && doc.summarize) || 0)),
      rankRemaining: Math.max(0, limits.rank - ((doc && doc.rank) || 0))
    }
  }
}

async function rankWithModel(pageUrl, links) {
  const messages = [
    {
      role: 'system',
      content:
        'You rate headlines for clickbait. Reply with JSON only: ' +
        '{"results":[{"url":"...","score":0-100,"reason":"max 10 words"}]}. ' +
        'Return exactly one entry per input url, using the url as given.'
    },
    { role: 'user', content: JSON.stringify({ pageUrl, links }) }
  ]

  const parsed = parseJsonLoose(await askOpenAi(messages))
  if (!parsed || !Array.isArray(parsed.results)) {
    return null
  }

  return parsed.results
    .filter((item) => item && item.url)
    .map((item) => ({
      url: String(item.url),
      score: clampScore(item.score) || 0,
      reason: String(item.reason || '').trim()
    }))
}

async function googleProfile(accessToken) {
  try {
    const response = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      timeout: 8000,
      headers: { Authorization: 'Bearer ' + accessToken }
    })
    return response.data
  } catch (error) {
    console.error('Google token verification failed:', error.message)
    return null
  }
}

module.exports = function (app) {
  // A rejected query used to be rethrown, which left the request open until
  // nginx timed out with a 504 that carried no CORS header.
  function databaseDown(res) {
    if (mongoose.connection.readyState === 1) {
      return false
    }
    res.status(503)
    res.send('Database unavailable')
    return true
  }

  //clickbait links
  app.post('/api/clickbait', function (req, res) {
    if (databaseDown(res)) {
      return
    }
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
        console.error('POST /api/clickbait failed:', err.message)
        res.status(500)
        res.send('Database error')
      })
  })

  app.get('/api/clickbait/get/all', function (req, res) {
    if (databaseDown(res)) {
      return
    }

    ClickbaitModel.find({})
      .then(function (result) {
        res.render('clickbaits_grid', { results: result })
      })
      .catch(function (err) {
        console.error('GET /api/clickbait/get/all failed:', err.message)
        res.status(500)
        res.send('Database error')
      })
  })

  app.get('/api/clickbait', function (req, res) {
    if (databaseDown(res)) {
      return
    }
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
          console.error('GET /api/clickbait failed:', err.message)
          res.status(500)
          res.send('Database error')
        })
    } else {
      res.status(500)
      res.send('bad request')
    }
  })

  // Chromium costs hundreds of MB per instance. Runs are serialised and the
  // queue is capped so a burst of AI previews cannot exhaust the machine.
  let summarizeQueue = Promise.resolve()
  let summarizePending = 0

  app.get('/api/summarize', function (req, res) {
    if (summarizePending >= 3) {
      res.status(429)
      res.send('The AI is busy, try again in a moment')
      return
    }

    summarizePending += 1
    summarizeQueue = summarizeQueue
      .then(() => summarizeArticle(req, res))
      .catch((error) => {
        console.error('Summarize failed:', error)
        if (!res.headersSent) {
          res.status(500)
          res.send('Error fetching ChatGPT response')
        }
      })
      .finally(() => {
        summarizePending -= 1
      })
      .catch(() => {})
  })

  async function summarizeArticle(req, res) {
    const url = req.query.url
    const title = req.query.title

    if (!url || !/^https?:\/\//i.test(url)) {
      res.status(400)
      res.send('An absolute http(s) url is required')
      return
    }

    const cached = await readSummaryCache(url)
    if (cached) {
      res.send(Object.assign({ cached: true }, cached))
      return
    }

    const quota = await consumeQuota(req, 'summarize')
    if (!quota.allowed) {
      res.set('Retry-After', '3600')
      res.status(429)
      res.send('Daily AI limit reached, try again tomorrow')
      return
    }

    let text = ''
    try {
      text = await getTextFromUrl(url)
    } catch (error) {
      console.error('Error fetching content from URL:', error.message)
      res.status(500)
      res.send('Error fetching content from URL')
      return
    }

    if (!text || text.length < 40) {
      res.send({ content: 'There is nothing to summarize, please try another url', score: null })
      return
    }

    const result = await summarizeWithModel(url, title, text)
    if (!result) {
      res.status(502)
      res.send('The AI could not summarise this article')
      return
    }

    await writeSummaryCache(url, result)
    res.send(Object.assign({ cached: false, usage: quota.usage }, result))
  }

  // Scores every link on a page in one model call, then caches the page for an
  // hour so a second scan costs nothing.
  app.post('/api/rank-page', async function (req, res) {
    const pageUrl = req.body.pageUrl || ''
    const links = Array.isArray(req.body.links) ? req.body.links.slice(0, 30) : []

    if (!pageUrl || links.length === 0) {
      res.status(400)
      res.send('pageUrl and links are required')
      return
    }

    const pageHash = hashString(pageUrl)

    if (mongoose.connection.readyState === 1) {
      const cached = await PageRankModel.findOne({ pageHash }).lean()
      if (cached) {
        res.send({ results: cached.results, cached: true })
        return
      }
    }

    const quota = await consumeQuota(req, 'rank')
    if (!quota.allowed) {
      res.set('Retry-After', '3600')
      res.status(429)
      res.send('Daily AI limit reached, try again tomorrow')
      return
    }

    let results = null
    try {
      results = await rankWithModel(pageUrl, links)
    } catch (error) {
      console.error('Rank page failed:', error.message)
    }

    if (!results) {
      res.status(502)
      res.send('The AI could not rank this page')
      return
    }

    if (mongoose.connection.readyState === 1) {
      await PageRankModel.updateOne(
        { pageHash },
        { $set: { pageUrl, results, createdAt: new Date() } },
        { upsert: true }
      ).catch((error) => {
        console.error('Page rank cache write failed:', error.message)
      })
    }

    res.send({ results, cached: false, usage: quota.usage })
  })

  app.get('/api/usage', async function (req, res) {
    const email = await sessionEmail(req)

    if (!email) {
      res.status(401)
      res.send('A session token is required')
      return
    }

    const counters = await usageCounters(email)
    res.send({
      summarizeRemaining: Math.max(0, SUMMARIZE_DAILY_LIMIT - counters.summarize),
      rankRemaining: Math.max(0, RANK_DAILY_LIMIT - counters.rank)
    })
  })

  app.post('/api/user', async function (req, res) {
    try {
      let email = String(req.body.email || '').trim().toLowerCase()
      let verified = false

      if (req.body.accessToken) {
        const profile = await googleProfile(req.body.accessToken)
        if (!profile || !profile.email) {
          res.status(401)
          res.send('Google token could not be verified')
          return
        }
        email = String(profile.email).trim().toLowerCase()
        verified = true
      }

      if (!email) {
        res.status(400)
        res.send('email or accessToken is required')
        return
      }

      const user = await UserModel.findOneAndUpdate(
        { email },
        { $set: { last_login_date: Date.now(), verified } },
        { new: true, upsert: true }
      )

      const session = await SessionModel.create({
        token: crypto.randomBytes(24).toString('hex'),
        email
      })

      const counters = await usageCounters(email)

      res.send({
        _id: user._id,
        email: user.email,
        verified,
        token: session.token,
        usage: {
          summarizeRemaining: Math.max(0, SUMMARIZE_DAILY_LIMIT - counters.summarize),
          rankRemaining: Math.max(0, RANK_DAILY_LIMIT - counters.rank)
        }
      })
    } catch (error) {
      console.error('POST /api/user failed:', error.message)
      res.status(400)
      res.send('Could not create the account')
    }
  })
}
