const puppeteer = require('puppeteer')
const { encoding_for_model } = require('tiktoken')

async function getTextFromUrl(url) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })

  try {
    const page = await browser.newPage()
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    )
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })

    // Extract visible text content
    const textContent = await page.evaluate(() => {
      return document.body.innerText
    })

    return textContent.trim()
  } finally {
    // Chromium is hundreds of MB. Without this a failed goto left one behind
    // per request until the instance ran out of memory.
    await browser.close().catch(() => {})
  }
}

const tokenizer = () => {
  const enc = encoding_for_model('gpt-3.5-turbo')

  const encode = string => {
    const tokens = enc.encode(string)
    return tokens
  }

  const decode = encoded => {
    const words = enc.decode(encoded)
    return new TextDecoder().decode(words)
  }

  const free = () => {
    enc.free()
  }

  return {
    decode,
    encode,
    free
  }
}

module.exports = {
  getTextFromUrl,
  tokenizer
}
