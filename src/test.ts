import {makePageNavigator, PageNavigator} from "./puppeteer-navigator"
import puppeteer from "puppeteer"

async function run() {
    puppeteer.launch({headless: false, args:['--disable-web-security']}).then(async browser => {
        const page = await browser.newPage();

        const navigator = makePageNavigator(page)
        navigator.gotoUrl('https://developer.mozilla.org/en-US/docs/Web/HTML/Element/select')
        navigator.wait(3000)
        navigator.select(`select[name='select']`, {label:'Third Value'})
        //await browser.close();
    });
}

run().catch(error => console.log(error));