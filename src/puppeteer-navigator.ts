import { Page, ClickOptions, PageFnOptions, JSHandle } from "puppeteer";

type SelectorType = number|string|((...args:any)=>boolean)
type ElementMapFn = (element:ElementAny)=>any

interface NavigatorOptions {
    waitUntilVisible?: boolean
    autoWait?: boolean,
    waitAfterAction?: number
    useSimulatedClicks?:boolean
}

export interface ElementAny extends Element {
    [key:string]: any
}
export type PageNavigator = ReturnType<typeof _makePageNavigator>
export function makePageNavigator(page:Page, customOptions:NavigatorOptions = {}):PageNavigator {return _makePageNavigator(page, customOptions)}
function _makePageNavigator(currentPage:Page, customOptions:NavigatorOptions = {}) {
    const options:NavigatorOptions = { // default options
        "waitUntilVisible": true,
        "autoWait": true,
        "waitAfterAction": 0,
        "useSimulatedClicks": true
    }
    updateOptions(customOptions)
    
    function updateOptions(customOptions:NavigatorOptions = {}) {
        Object.assign(options, customOptions) // override with any custom options
    }

    /**
     * get the current puppeteer page object
     */
    function page() {return currentPage}

    /**
     * Navigate to URL
     * @param url 
     * @param waitCondition 
     */
    async function gotoUrl(url:string, waitCondition?:SelectorType) {
        currentPage.goto(url)
        // wait for the previous navigation to complete
        const pageResponse = await currentPage.waitForNavigation()
        if (waitCondition)
            await wait(waitCondition)
        else if (options.waitAfterAction) await wait(options.waitAfterAction)

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
     * Performs a click on a HTML field.
     * @param selector css selector or xpath
     * @param clickOptions ClickOptions
     */
    async function click(selector:string, clickOptions?:ClickOptions) {
        if (options.autoWait)
            await wait(selector)
        const targetElement = await queryElementHandle(selector)
        if (!targetElement) throw new Error('Element not found ' + selector)

        if (options.useSimulatedClicks) {
            await currentPage.evaluate(element => element.click(), targetElement)
        } else {
            await targetElement.click(clickOptions)
        }

        if (options.waitAfterAction) await wait(options.waitAfterAction)
    }

    /**
     * Types text into a HTML field
     * @param selector css selector
     * @param text type text into field
     * @param typeOptions 'delay' sets delay between each key typed
     */
    async function type(selector:string, text:string, typeOptions?: { delay: number }) {
        if (options.autoWait)
            await wait(selector)
        await currentPage.type(selector, text, typeOptions)

        if (options.waitAfterAction) await wait(options.waitAfterAction)
    }

    /**
     * Selects an option within a HTML list.
     * Filters out any control characters that might be in the list label or value before attempting to match.
     * 
     * @param selector css selector
     * @param selectOption 'value' matches the option value attribute. 'label' matches the option label attribute
     */
    async function select(selector:string, selectOption: {value?:string, label?:string}) {
        if (options.autoWait)
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

        if (options.waitAfterAction) await wait(options.waitAfterAction)
    }

    return {
        updateOptions,
        page,
        gotoUrl,
        queryElement,
        queryElements,
        setDownloadPath,
        scrollElementToBottom,
        wait,
        waitFn,
        click,
        type,
        select
    }
}