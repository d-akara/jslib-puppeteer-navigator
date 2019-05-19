import { Page, ClickOptions, PageFnOptions, JSHandle } from "puppeteer";

type SelectorType = number|string|((...args:any)=>boolean)
type ElementMapFn = (element:ElementAny)=>any

interface NavigatorOptions {
    waitUntilVisible?: boolean
    waitOnSelectors?: boolean,
    waitAfterAction?: number
    waitIdleTime?:number
    waitIdleLoadTime?:number
    useSimulatedClicks?:boolean
}

export interface ElementAny extends Element {
    [key:string]: any
}
export type PageNavigator = ReturnType<typeof _makePageNavigator>
export function makePageNavigator(page:Page, customOptions:NavigatorOptions = {}):PageNavigator {return _makePageNavigator(page, customOptions)}
/**
 * Create instance of PageNavigator
 * @param currentPage 
 * @param customOptions 
 */
function _makePageNavigator(currentPage:Page, customOptions:NavigatorOptions = {}) {
    const options:NavigatorOptions = { // default options
        "waitUntilVisible": true,
        "waitOnSelectors": true,
        "waitAfterAction": 0,
        "waitIdleTime": 0,
        "waitIdleLoadTime": 0,
        "useSimulatedClicks": true
    }
    updateOptions(customOptions)
    const requestMonitor = startActivityMonitor(currentPage)

    function updateOptions(customOptions:NavigatorOptions = {}) {
        Object.assign(options, customOptions) // override with any custom options
    }

    /**
     * get the current puppeteer page object
     */
    function page() {return currentPage}

    async function waitAfter() {
        if (options.waitIdleTime || options.waitIdleLoadTime) await waitActivity(options.waitIdleTime, options.waitIdleLoadTime)
        if (options.waitAfterAction) await wait(options.waitAfterAction)
    }

    /**
     * Navigate to URL
     * @param url 
     * @param waitCondition 
     */
    async function goto(url:string, waitCondition?:SelectorType) {
        currentPage.goto(url)
        // wait for the previous navigation to complete
        const pageResponse = await currentPage.waitForNavigation()
        if (waitCondition)
            await wait(waitCondition)
        else await waitAfter()

        return pageResponse
    }
    
    /**
     * Queries an element using css selector or xpath
     * Assumes xpath expression starts with '//'
     * @param selector css selector or xpath
     */
    async function queryElementHandle(selector: string) {
        if (selector.startsWith('//'))
            return (await currentPage.$x(selector))[0]
        return await currentPage.$(selector)
    }

    /**
     * Query element using selector and uses the provided function to map a return value
     * @param selector css selector
     * @param valueMapFn function to map element to return value
     */
    async function queryElement(selector:string, valueMapFn:ElementMapFn) { return (await queryElements(selector, valueMapFn))[0]}
    /**
     * Queries elements using selector and uses the provided function to map a list of return values
     * @param selector css selector
     * @param valueMapFn function to map elements to values to be returned
     */
    async function queryElements(selector:string, valueMapFn:ElementMapFn) {
        const elements = await currentPage.evaluate((selector, valueMapFnText) => {
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
        return await (currentPage as any)._client.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: downloadPath});
    }
    
    async function scrollElementToBottom(elementSelector:string, delay:number) {
        await currentPage.evaluate( selector => {
            const element = document.querySelector(selector);
            element.scrollTop = 100000; // use large number to force to bottom.  TODO - determine if there is an exact way to get this value
        }, elementSelector );
    
        await currentPage.waitFor(delay);
    }

    /**
     * Waits for element to be visible, function to be true or timeout if number
     * @param condition css selector, xpath or function
     */
    async function wait(condition:SelectorType) {
        if (typeof condition === 'string' || typeof condition ==='function') {
            return await currentPage.waitFor(condition, {visible:options.waitUntilVisible})
        }
        if (typeof condition === 'number') {
            await currentPage.waitFor(condition)
        }
    }

    /**
     * Waits for condition to be true
     * @param selector css selector, xpath or function
     * @param condition function that receives element of selector as input.
     * @param options 'waitAfter' additinoal wait time after condition is true
     */
    async function waitFn(selector:string, condition: (element:ElementAny) => boolean, options?: PageFnOptions & {waitAfter?:number}) {
        const selectElement = await wait(selector)
        await currentPage.waitForFunction(condition, options, selectElement as JSHandle)
        if (options && options.waitAfter)
            await wait(options.waitAfter)
    }

    /**
     * Wait for any network activity to complete
     */
    async function waitActivity(idleTime = options.waitIdleTime, idleLoadTime = options.waitIdleLoadTime) {
        return await requestMonitor.waitForPendingActivity(idleTime, idleLoadTime)
    }

    /**
     * Performs a click on a HTML field.
     * @param selector css selector or xpath
     * @param clickOptions ClickOptions
     */
    async function click(selector:string, clickOptions?:ClickOptions) {
        if (options.waitOnSelectors)
            await wait(selector)
        const targetElement = await queryElementHandle(selector)
        if (!targetElement) throw new Error('Element not found ' + selector)

        if (options.useSimulatedClicks) {
            await currentPage.evaluate(element => element.click(), targetElement)
        } else {
            await targetElement.click(clickOptions)
        }

        await waitAfter()
    }

    /**
     * Types text into a HTML field
     * @param selector css selector
     * @param text type text into field
     * @param typeOptions 'delay' sets delay between each key typed
     */
    async function type(selector:string, text:string, typeOptions?: { delay: number }) {
        if (options.waitOnSelectors)
            await wait(selector)
        await currentPage.type(selector, text, typeOptions)

        await waitAfter()
    }

    /**
     * Selects an option within a HTML list.
     * Filters out any control characters that might be in the list label or value before attempting to match.
     * 
     * @param selector css selector
     * @param selectOption 'value' matches the option value attribute. 'label' matches the option label attribute
     */
    async function select(selector:string, selectOption: {value?:string, label?:string}) {
        if (options.waitOnSelectors)
            await wait(selector)

        const selectElement = await currentPage.$(selector)
        await currentPage.evaluate((selectElement:Element, selectOption) => {
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

        await waitAfter()
    }

    return {
        updateOptions,
        page,
        goto,
        queryElement,
        queryElements,
        setDownloadPath,
        scrollElementToBottom,
        wait,
        waitFn,
        waitActivity,
        click,
        type,
        select
    }
}

function startActivityMonitor(page:Page) {
    let pendingRequests = 0
    let lastRequestActivityTime = 0
    let lastDomLoadedTime = 0

    page.on('request', onRequestStarted)
    page.on('requestfinished', onRequestFinished)
    page.on('requestfailed', onRequestFinished)
    page.on('domcontentloaded', onDomContentLoaded)
    page.on('close', stopMonitoring)
  
    function onRequestStarted()  {
        ++pendingRequests
    }
    function onRequestFinished() {
        --pendingRequests
        lastRequestActivityTime = Date.now()
    }
    function onDomContentLoaded() {
        lastDomLoadedTime = Date.now()
    }
  
    function stopMonitoring() {
      page.removeListener('request', onRequestStarted)
      page.removeListener('requestfinished', onRequestFinished)
      page.removeListener('requestfailed', onRequestFinished)
      page.removeListener('domcontentloaded', onDomContentLoaded)
      page.removeListener('close', stopMonitoring)
    }
  
    function pendingRequestCount() {return pendingRequests}
    // possible further improvements using: https://github.com/GoogleChromeLabs/puppeteer-examples/blob/master/hash_navigation.js
    async function waitForPendingActivity(idleTime:number = 0, idleLoadTime:number = 0) {
        return new Promise(async resolve => {
            await pollUntilTrueOrTimeout(50, 30000, elapsedTime => {
                if (pendingRequestCount() > 0) return false

                // if we have an idleLoadTime and the DOM was just loaded, use that as the idleTime
                if (lastDomLoadedTime) idleTime = idleLoadTime || idleTime

                const now = Date.now()
                const currentIdleTime = now - lastRequestActivityTime
                const timeSincePageLoaded = now - lastDomLoadedTime

                if (currentIdleTime > idleTime) return true
                return false
            })
            lastDomLoadedTime = 0 // so we know if DOM has been loaded since last time we wait
            resolve()
        })
    }
    return {pendingRequestCount, stopMonitoring, waitForPendingActivity}
}

async function pollUntilTrueOrTimeout(interval:number, timeout:number, pollFn:(elapsedTime:number) => boolean) {
    let lastTime = Date.now()
    return new Promise(resolve => {
        const timer = setInterval(() => {
            const elapsedTime = Date.now() - lastTime

            if (pollFn(elapsedTime)) {
                clearInterval(timer)
                resolve()
            }
    
            if (elapsedTime > timeout) {
                clearInterval(timer)
                resolve()
            }
        }, interval)
    })
}