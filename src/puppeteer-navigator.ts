import { Page, ClickOptions } from "puppeteer";

type SelectorType = number|string|((...args:any)=>boolean)
type ElementMapFn = (element:ElementAny)=>any

interface NavigatorOptions {
    waitUntilVisile?: boolean
    autoWait?: boolean,
    waitAfterAction?: number
    useSimulatedClicks?:boolean
}

export interface ElementAny extends Element {
    [key:string]: any
}
export type PageNavigator = ReturnType<typeof makePageNavigator>
export function makePageNavigator(page:Page, customOptions:NavigatorOptions = {}) {
    const options = { // default options
        "waitUntilVisible": true,
        "autoWait": true,
        "waitAfterAction": 0,
        "useSimulatedClicks": true
    }
    Object.assign(options, customOptions) // override with any custom options

    async function gotoUrl(url:string, waitCondition?:SelectorType) {
        page.goto(url)
        // wait for the previous navigation to complete
        const pageResponse = await page.waitForNavigation()
        if (waitCondition)
            await wait(waitCondition)
        else if (options.waitAfterAction) await wait(options.waitAfterAction)

        return pageResponse
    }
    
    async function queryElementHandle(selector: string) {
        if (selector.startsWith('//'))
            return (await page.$x(selector))[0]
        return await page.$(selector)
    }

    async function queryElement(selector:string, valueMapFn:ElementMapFn) { return (await queryElements(selector, valueMapFn))[0]}
    async function queryElements(selector:string, valueMapFn:ElementMapFn) {
        const elements = await page.evaluate((selector, valueMapFnText) => {
            // Functions can not be passed as parameters to the browser page
            // So we pass in the function source text and recreate the function within the browser page
            const valueMapFn = new Function(' return (' + valueMapFnText + ').apply(null, arguments)');
    
            // create an array of all the found elements and map them using the supplied function
            // we must map them to new objects since the browser elements can not be serialized back to the Node environment
            return Array.from(document.querySelectorAll(selector)).map(valueMapFn as any);
        }, selector, valueMapFn.toString());
        return elements;
    }
    
    /**
     * Sets the default chrome puppeteer download path
     * See - https://github.com/GoogleChrome/puppeteer/issues/299
     * @param {*} downloadPath 
     */
    async function setDownloadPath(downloadPath:string) {
        return await (page as any)._client.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: downloadPath});
    }
    
    async function scrollElementToBottom(elementSelector:string, delay:number) {
        await page.evaluate( selector => {
            const element = document.querySelector(selector);
            element.scrollTop = 100000; // use large number to force to bottom.  TODO - determine if there is an exact way to get this value
        }, elementSelector );
    
        await page.waitFor(delay);
    }

    // TODO add wait that accepts a function that receives the selector element
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
        const targetElement = await queryElementHandle(selector)
        if (!targetElement) throw new Error('Element not found ' + selector)

        if (options.useSimulatedClicks) {
            await page.evaluate(element => element.click(), targetElement)
        } else {
            await targetElement.click(clickOptions)
        }

        if (options.waitAfterAction) await wait(options.waitAfterAction)
    }

    async function type(selector:string, text:string, typeOptions?: { delay: number }) {
        if (options.autoWait)
            await wait(selector)
        await page.type(selector, text, typeOptions)

        if (options.waitAfterAction) await wait(options.waitAfterAction)
    }

    async function select(selector:string, selectOption: {value?:string, label?:string}) {
        if (options.autoWait)
            await wait(selector)

        const selectElement = await page.$(selector)
        await page.evaluate((selectElement:Element, selectOption) => {
            let optionElement:HTMLOptionElement

            // find matching option.  Remove any control characters from option values or labels
            if (selectOption.label)
                optionElement = Array.from(selectElement.children).find(optionElement => (optionElement as HTMLOptionElement).label.replace(/[^\x00-\x7F]/g, '') === selectOption.label) as HTMLOptionElement
            else
                optionElement = Array.from(selectElement.children).find(optionElement => (optionElement as HTMLOptionElement).value.replace(/[^\x00-\x7F]/g, "") === selectOption.value) as HTMLOptionElement

            optionElement.selected = true;
            const event = new Event('change', {bubbles: true});
            selectElement.dispatchEvent(event);
        }, selectElement, selectOption as any);

        if (options.waitAfterAction) await wait(options.waitAfterAction)
    }

    return {
        gotoUrl,
        queryElement,
        queryElements,
        setDownloadPath,
        scrollElementToBottom,
        wait,
        click,
        type,
        select
    }
}