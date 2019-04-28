import { Page, ClickOptions } from "puppeteer";

type SelectorType = number|string|((...args:any)=>boolean)
type ElementMapFn = (element:ElementAny)=>any
const defaultOptions = {
    "waitUntilVisible": true,
    "autoWait": true
}

export interface ElementAny extends Element {
    [key:string]: any
}

export function makePageNavigator(page:Page, options = defaultOptions) {

    async function gotoUrl(url:string, waitCondition?:SelectorType) {
        console.log('navigating to url: ' + url)
        page.goto(url)
        // wait for the previous navigation to complete
        const pageResponse = await page.waitForNavigation()
        if (waitCondition)
            await wait(waitCondition)

        return pageResponse
    }
    
    async function findElement(selector:string, valueMapFn:ElementMapFn) { return (await findElements(selector, valueMapFn))[0]}
    
    async function findElements(selector:string, valueMapFn:ElementMapFn) {
        const elements = await page.evaluate((selector, valueMapFnText) => {
            // Functions can not be passed as parameters to the browser page
            // So we pass in the function source text and recreate the function within the browser page
            const valueMapFn = new Function(' return (' + valueMapFnText + ').apply(null, arguments)');
    
            // create an array of all the found elements and map them using the supplied function
            // we must map them to new objects since the browser elements can not be serialized back to the Node environment
            return Array.from(document.querySelectorAll(selector)).map(valueMapFn as any);
        }, selector, valueMapFn.toString());
        console.log('found ' + elements.length + ' elements using selector: ' + selector)
        return elements;
    }
    
    /**
     * Sets the default chrome puppeteer download path
     * See - https://github.com/GoogleChrome/puppeteer/issues/299
     * @param {*} downloadPath 
     */
    async function setDownloadPath(downloadPath:string) {
        console.log('setting download path: ' + downloadPath)
        return await (page as any)._client.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: downloadPath});
    }
    
    async function scrollElementToBottom(elementSelector:string, delay:number) {
        await page.evaluate( selector => {
            const element = document.querySelector(selector);
            element.scrollTop = 100000; // use large number to force to bottom.  TODO - determine if there is an exact way to get this value
        }, elementSelector );
    
        await page.waitFor(delay);
    }

    async function wait(condition:SelectorType) {
        if (typeof condition === 'string' || typeof condition ==='function') {
            await page.waitFor(condition, {visible:options.waitUntilVisible})
        }
        if (typeof condition === 'number') {
            await page.waitFor(condition)
        }
    }

    async function click(selector:string, clickOptions?:ClickOptions) {
        if (options.autoWait)
            await wait(selector)
        await page.click(selector, clickOptions)
    }

    return {
        gotoUrl,
        findElement,
        findElements,
        setDownloadPath,
        scrollElementToBottom,
        wait
    }
}