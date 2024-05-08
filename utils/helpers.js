const puppeteer = require('puppeteer');
const { encoding_for_model } = require('tiktoken')

async function getTextFromUrl(url) {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    // Extract visible text content
    const textContent = await page.evaluate(() => {
        return document.body.innerText;
    });

    await browser.close();

    return textContent.trim();
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
};