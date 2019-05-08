import {makePageNavigator, PageNavigator} from "./puppeteer-navigator"
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
        await navigator.gotoUrl('http://localhost:8000')
        await navigator.select(`#pet-select`, {label:'Spider'})
        //await browser.close();
    });
}

run().catch(error => console.log(error));