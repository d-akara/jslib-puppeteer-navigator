# Puppeteer Navigator
A library to assist some common use cases of Puppeteer.

## Features
- Automate as much as possible waiting on elements and actions
    - Automatically wait for all selectors before performing action
    - Set timed wait defaults that will be applied between all actions
    - Attempt to automatically wait for all network activity to complete
- Use simulated clicks for improved reliability in some use cases
    - Simulated clicks will work for elements that are in motion or covered up
- Some simplified API's for convenience

## API
```typescript
/**
 * Options generally applied to all actions
 */
export interface NavigatorOptions {
    /** wait until element is visible on selection actions.  default true. */
    waitUntilVisible?: boolean;
    /** wait until the selector is found before performing actions. default true*/
    waitOnSelectors?: boolean;
    /** wait milliseconds after all actions. default 0 */
    waitAfterAction?: number;
    /** wait milliseconds after all network activity has stopped. default 0 */
    waitIdleTime?: number;
    /** wait milliseconds after any page load. default 0 */
    waitIdleLoadTime?: number;
    /** send click event directly to element vs using mouse cursor initiated click. default true */
    useSimulatedClicks?: boolean;
}
export interface ElementAny extends Element {
    [key: string]: any;
}

export interface Navigator {
    page(): Page
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
```