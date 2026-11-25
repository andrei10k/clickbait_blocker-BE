const crypto = require('crypto')
const puppeteer = require('puppeteer')

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'

const MAX_EXCERPT_CHARS = 6000
const BROWSER_IDLE_MS = 5 * 60 * 1000

let browserPromise = null
let browserTimer = null

function hashString(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// Plain fetch first. Most articles are server rendered, and this avoids
// spawning Chromium for the common case.
async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
      signal: controller.signal,
      redirect: 'follow'
    })

    if (!response.ok) {
      throw new Error('status ' + response.status)
    }

    return stripHtml(await response.text())
  } finally {
    clearTimeout(timer)
  }
}

function scheduleBrowserClose() {
  clearTimeout(browserTimer)
  browserTimer = setTimeout(async () => {
    const pending = browserPromise
    browserPromise = null
    if (pending) {
      const browser = await pending.catch(() => null)
      if (browser) {
        await browser.close().catch(() => {})
      }
    }
  }, BROWSER_IDLE_MS)
}

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    })
  }
  return browserPromise
}

async function browserText(url) {
  const browser = await getBrowser()
  const page = await browser.newPage()

  try {
    await page.setUserAgent(USER_AGENT)
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
    return await page.evaluate(() => document.body.innerText)
  } finally {
    await page.close().catch(() => {})
    scheduleBrowserClose()
  }
}

async function getTextFromUrl(url) {
  let text = ''
  try {
    text = await fetchText(url)
  } catch (error) {
    text = ''
  }

  if (text.length < 400) {
    text = await browserText(url)
  }

  return text.slice(0, MAX_EXCERPT_CHARS).trim()
}

function parseJsonLoose(value) {
  if (!value) {
    return null
  }

  const cleaned = String(value)
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim()

  try {
    return JSON.parse(cleaned)
  } catch (error) {
    const start = cleaned.indexOf('{')
    const end = cleaned.lastIndexOf('}')
    if (start === -1 || end <= start) {
      return null
    }
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch (inner) {
      return null
    }
  }
}

module.exports = {
  getTextFromUrl,
  hashString,
  parseJsonLoose,
  USER_AGENT
}
