This is a WIP product with no guarantees.

To use this extension, follow the instructions to load an unpacked extension: https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked

Once it's loaded, you can load an allowed page from the Chrome Web Store docs. Here's an example of a page that this works with: https://developer.chrome.com/docs/webstore/publish

To see the logs, open the Chrome dev tools. https://developer.chrome.com/docs/devtools/open

To see logs from the service worker (including the screenshots in base64), see the Chrome docs about debugging the service worker: https://developer.chrome.com/docs/extensions/get-started/tutorial/debug#debug-bg

Currently this script depends on running the webolmo server locally and accessing it through `localhost`. Get into a session (like http://localhost:5001/0) and click the "Launch Browser" button. The `session-starter.js` script will start a session that records user interactions. When any tab with the script loaded is closed, the session will stop.

## Script info

### Content scripts

Scripts under the `scripts/content` folder run on the page. 

* `event-collector` is the script that collects events. It has a `recordInteraction` function in it that sends the events to the worker
* `session-starter` loads a script onto the webolmo page that starts a session when the "launch browser" button is clicked (as long as it has a `data-session-id`)

### Service worker scripts
The `scripts/worker` script handles processing events and session info. It runs as a service worker in Chrome's extension context.

### Side panel
The sidepanel code is in the `sidepanel` folder. This has `side-panel.js` (the JS that handles events in the panel) and `sidepanel.html`, which contains the page markup. `side-panel.js` is loaded in a script tag in `sidepanel.html`.# Tool_Sn
