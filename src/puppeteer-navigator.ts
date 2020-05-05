import { Page, Frame, Response, ClickOptions, PageFnOptions, JSHandle, ElementHandle, FrameBase } from "puppeteer";

export type SelectorType = number|string|((...args:any)=>boolean)
export type ElementMapFn = (element:ElementAny)=>any
export type ElementMatchFn = (element:ElementAny)=>boolean

/**
 * Options generally applied to all actions
 */
export interface NavigatorOptions {
    /** wait until element is visible on selection actions.  default true. */
    waitUntilVisible?: boolean
    /** wait until the selector is found before performing actions. default true*/
    waitOnSelectors?: boolean,
    /** wait milliseconds after all actions. default 0 */
    waitAfterAction?: number
    /** wait milliseconds after all network activity has stopped. default 0 */
    waitIdleTime?:number
    /** wait milliseconds after any page load. default 0 */
    waitIdleLoadTime?:number
    /** send click event directly to element vs using mouse cursor initiated click. default true */
    useSimulatedClicks?:boolean
}

export interface ElementAny extends Element {
    [key:string]: any
}
export interface Navigator {
    page(): Page

    /**
     * Current frame for navigator
     */
    frame(): Frame
    updateOptions(customOptions:NavigatorOptions) : void
    /**
     * Navigate to URL
     * @param url 
     * @param waitCondition 
     */
    goto(url:string, waitCondition?:SelectorType) : Promise<Response>
    
    /**
     * Queries an element using css selector or xpath
     * Assumes xpath expression starts with '//'
     * @param selector css selector or xpath
     */
    queryElementHandle(selector: string | ElementHandle) : Promise<ElementHandle | null>

    /**
     * Queries an element using css selector or xpath
     * Assumes xpath expression starts with '//'
     * @param selector css selector or xpath
     */
    queryElementHandles(selector: string | ElementHandle) : Promise<ElementHandle[]>

    /**
     * Uses the selector function to find a matching element
     * If a context is passed, then the matching element must be a descendant of the context element
     */
    queryElementHandleWithFn(selectorFn: ElementMatchFn, context: ElementHandle) : Promise<Node | null>

    /**
     * Query element using selector and uses the provided function to map a return value
     * @param selector css selector
     * @param valueMapFn function to map element to return value
     */
    queryElement(selector:string, valueMapFn:ElementMapFn) : Promise<any[]> 

    /**
     * Queries elements using selector and uses the provided function to map a list of return values
     * @param selector css selector
     * @param valueMapFn function to map elements to values to be returned
     */
    queryElements(selector:string, valueMapFn:ElementMapFn): Promise<any[]> 
    
    /**
     * Queries chlldren with all descendants for a match using the descendantFn.
     * Retuns all children who matched or had a descendant match.
     * 
     * This API is used to assist identifying rows in tables, lists, grids etc where we 
     * want to find a row containing some criteria we can test for with a function
     * 
     * @param selector css selector
     * @param valueMapFn function to map elements to values to be returned
     */
    queryChildrenAsHandles(parentSelector:string, descendantFn: (element:Element) => boolean ) : Promise<ElementHandle<Element>[]>


    /**
     * Sets the default chrome puppeteer download path
     * See - https://github.com/GoogleChrome/puppeteer/issues/299
     * @param {*} downloadPath 
     */
    setDownloadPath(downloadPath:string) : Promise<void>
    scrollElementToBottom(elementSelector:string, delay:number) : Promise<void>

    /**
     * Waits for element to be visible, function to be true or timeout if number
     * @param condition css selector, xpath or function
     */
    wait(condition:SelectorType) : Promise<JSHandle | void>

    /**
     * Waits for condition to be true
     * @param selector css selector, xpath or function
     * @param condition function that receives element of selector as input.
     * @param options 'waitAfter' additinoal wait time after condition is true
     */
    waitFn(selector:string, condition: (element:ElementAny) => boolean, options?: PageFnOptions & {waitAfter?:number}) : Promise<void>

    /**
     * Wait for any network activity to complete
     */
    waitActivity(idleTime:number|undefined, idleLoadTime:number|undefined) : Promise<unknown>

    /**
     * Performs a click on a HTML field.
     * @param selector css selector or xpath
     * @param clickOptions ClickOptions
     */
    click(selector:string | ElementHandle, clickOptions?:ClickOptions) : Promise<void>

    /**
     * Types text into a HTML field
     * @param selector css selector
     * @param text type text into field
     * @param typeOptions 'delay' sets delay between each key typed
     */
    type(selector:string, text:string, typeOptions?: { delay: number }) : Promise<void>

    /**
     * Selects an option within a HTML list.
     * Filters out any control characters that might be in the list label or value before attempting to match.
     * 
     * @param selector css selector
     * @param selectOption 'value' matches the option value attribute. 'label' matches the option label attribute
     */
    select(selector:string, selectOption: {value?:string, label?:string}) : Promise<void>


    /**
     * Find a frame and return a new navigator for the frame
     * @param selector frame selector
     */
    frameNavigator(selector:string) : Promise<Navigator>
 
}

export function makePageNavigator(page:Page, customOptions:NavigatorOptions = {}):Navigator {
    const requestMonitor = startActivityMonitor(page)
    return _makePageNavigator(page, page.mainFrame(), requestMonitor, customOptions)
}
/**
 * Create instance of PageNavigator
 * @param frame 
 * @param customOptions 
 */
function _makePageNavigator(page:Page, frame:Frame, requestMonitor: ActivityMonitor, customOptions:NavigatorOptions = {}) : Navigator {
    const options:NavigatorOptions = { // default options
        "waitUntilVisible": true,
        "waitOnSelectors": true,
        "waitAfterAction": 0,
        "waitIdleTime": 0,
        "waitIdleLoadTime": 0,
        "useSimulatedClicks": true
    }
    updateOptions(customOptions)

    function updateOptions(customOptions:NavigatorOptions = {}) {
        Object.assign(options, customOptions) // override with any custom options
    }

    async function waitAfter(pageNavigator: Navigator) {
        if (options.waitIdleTime || options.waitIdleLoadTime) await pageNavigator.waitActivity(options.waitIdleTime, options.waitIdleLoadTime)
        if (options.waitAfterAction) {
            await pageNavigator.wait(options.waitAfterAction)
            // ensure there still isn't network activity before we continue
            // this might be the case where a delayed action we are waiting for triggers more activity
            if (options.waitIdleTime || options.waitIdleLoadTime) await pageNavigator.waitActivity(options.waitIdleTime, options.waitIdleLoadTime)
        }
    }

    return {
        updateOptions,

        page: ()=> page,
        frame: ()=> frame,
    
        goto: async function (url:string, waitCondition?:SelectorType) {
            frame.goto(url)
            // wait for the previous navigation to complete
            const pageResponse = await frame.waitForNavigation()
            if (waitCondition)
                await this.wait(waitCondition)
            else await waitAfter(this)
    
            return pageResponse
        },
        
        queryElementHandle: async function (selector: string | ElementHandle) {
            if (typeof selector !== 'string') return selector

            if (selector.startsWith('//'))
                return (await frame.$x(selector))[0]
            return await frame.$(selector)
        },

        queryElementHandles: async function (selector: string) {
            let handles:ElementHandle[] = []
            if (selector.startsWith('//'))
                handles = handles.concat(await frame.$x(selector))
            handles = handles.concat(await frame.$$(selector))
            
            return handles
        },

        queryElementHandleWithFn: async function (selectorFn: ElementMatchFn, context: ElementHandle) {
            const element = await frame.evaluate((context, selectorFnText) => {
                // Functions can not be passed as parameters to the browser page
                // So we pass in the function source text and recreate the function within the browser page
                const selectorFn = new Function(' return (' + selectorFnText + ').apply(null, arguments)');

                // test all descendants of the element
                if (!context) context = document
                const descendants = document.evaluate("descendant::*", context, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                let descendant = descendants.iterateNext()
                while(descendant) {
                    if (selectorFn(descendant)) return descendant
                    descendant = descendants.iterateNext()
                }

                return null
            }, context, selectorFn.toString());
            return element
        },

        queryElement: async function (selector:string, valueMapFn:ElementMapFn) { 
            const elements = await this.queryElements(selector, valueMapFn)
            if (elements.length) return elements[0]
            return null
        },

        queryElements: async function (selector:string, valueMapFn:ElementMapFn): Promise<any[]> {
            const elements = await frame.evaluate((selector, valueMapFnText) => {
                // Functions can not be passed as parameters to the browser page
                // So we pass in the function source text and recreate the function within the browser page
                const valueMapFn = new Function(' return (' + valueMapFnText + ').apply(null, arguments)');
                const isXpath = selector.startsWith('//')

                // create an array of all the found elements and map them using the supplied function
                // we must map them to new objects since the browser elements can not be serialized back to the Node environment
                if (isXpath) {
                    const resultArray:any[] = []
                    const xpathResult = document.evaluate(selector, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null)
                    for (let resultIndex = 0; resultIndex < xpathResult.snapshotLength; resultIndex++) {
                        resultArray.push(xpathResult.snapshotItem(resultIndex))
                    }
                    return resultArray.map(valueMapFn as any);
                } else {
                    return Array.from(document.querySelectorAll(selector)).map(valueMapFn as any);
                }
            }, selector, valueMapFn.toString());
            return elements;
        },
        
        queryChildrenAsHandles: async function (parentSelector:string, descendantFn: (element:Element) => boolean ) {
            const parentElementHandle = await this.queryElementHandle(parentSelector)
            if (!parentElementHandle) return []

            const matchingChildren = []
            const childrenHandles = await parentElementHandle.$x('*')
            for (const childHandle of childrenHandles) {

                const isMatch = await frame.evaluate((childHandle, descendantFnText) => {
                    // Functions can not be passed as parameters to the browser page
                    // So we pass in the function source text and recreate the function within the browser page
                    const descendantFn = new Function(' return (' + descendantFnText + ').apply(null, arguments)');

                    // first test the immediate child
                    if (descendantFn(childHandle)) return true

                    // test all descendants of the child
                    const descendants = document.evaluate("descendant::*", childHandle, null, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
                    let descendant = descendants.iterateNext()
                    while(descendant) {
                        if (descendantFn(descendant)) return true
                        descendant = descendants.iterateNext()
                    }

                    return false
                }, childHandle, descendantFn.toString());

                if (isMatch) matchingChildren.push(childHandle)
            }
            
            return matchingChildren;
        },

        setDownloadPath: async function (downloadPath:string) {
            return await (frame as any)._client.send('Page.setDownloadBehavior', {behavior: 'allow', downloadPath: downloadPath});
        },
        
        scrollElementToBottom: async function (elementSelector:string, delay:number) {
            await frame.evaluate( selector => {
                const element = document.querySelector(selector);
                element.scrollTop = 100000; // use large number to force to bottom.  TODO - determine if there is an exact way to get this value
            }, elementSelector );
        
            await frame.waitFor(delay);
        },

        wait: async function (condition:SelectorType) {
            if (typeof condition === 'string' || typeof condition ==='function') {
                return await frame.waitFor(condition, {visible:options.waitUntilVisible})
            }
            if (typeof condition === 'number') {
                await frame.waitFor(condition)
            }
        },
    
        waitFn: async function (selector:string, condition: (element:ElementAny) => boolean, options?: PageFnOptions & {waitAfter?:number}) {
            const selectElement = await this.wait(selector)
            await frame.waitForFunction(condition, options, selectElement as JSHandle)
            if (options && options.waitAfter)
                await this.wait(options.waitAfter)
        },

        waitActivity: async function (idleTime = options.waitIdleTime, idleLoadTime = options.waitIdleLoadTime) {
            return await requestMonitor.waitForPendingActivity(idleTime, idleLoadTime)
        },
    
        click: async function (selector:string | ElementHandle, clickOptions?:ClickOptions) {
            if (options.waitOnSelectors && typeof selector === 'string')
                await this.wait(selector)
            const targetElement = await this.queryElementHandle(selector)
            if (!targetElement) throw new Error('Element not found ' + selector)
    
            if (options.useSimulatedClicks) {
                await frame.evaluate(element => element.click(), targetElement)
            } else {
                await targetElement.click(clickOptions)
            }
    
            await waitAfter(this)
        },
    
        type: async function (selector:string, text:string, typeOptions?: { delay: number }) {
            if (options.waitOnSelectors)
                await this.wait(selector)
            await frame.type(selector, text, typeOptions)
    
            await waitAfter(this)
        },
    
        select: async function (selector:string, selectOption: {value?:string, label?:string}) {
            if (options.waitOnSelectors)
                await this.wait(selector)
    
            const selectElement = await frame.$(selector)
            await frame.evaluate((selectElement:Element, selectOption) => {
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
    
            await waitAfter(this)
        },

        frameNavigator: async function (selector:string) {
            if (options.waitOnSelectors)
                await this.wait(selector)
    
            const selectElement = await this.queryElementHandle(selector)
            const frame = await selectElement?.contentFrame()
            if (!frame) throw new Error('unable to find ' + selector)
            return _makePageNavigator(page, frame, requestMonitor, options)
        }
    }
}

type ActivityMonitor = ReturnType<typeof startActivityMonitor>

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