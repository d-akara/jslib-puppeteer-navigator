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