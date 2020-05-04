import {makePageNavigator, Navigator} from "./puppeteer-navigator"
import puppeteer from "puppeteer"
import http from 'http'
import fs from 'fs'

http.createServer(function (request, response) {
    response.writeHead(200)
    fs.createReadStream('test/test.html').pipe(response)
}).listen(8000)

async function run() {
    puppeteer.launch({headless: false, args:['--disable-web-security']}).then(async browser => {
        const page = (await browser.pages())[0]

        const navigator = makePageNavigator(page)
        await navigator.goto('http://localhost:8000')
        await navigator.select(`#pet-select`, {label:'Spider'})

        const childHandles = await navigator.queryChildrenAsHandles('#divList', e => e.textContent === 'item 1')
        console.log(childHandles.length)
        for (const child of childHandles) {
            const result = await navigator.page().evaluate(e => e.localName, child)
            console.log(result)
        }
    });
}

run().catch(error => console.log(error));