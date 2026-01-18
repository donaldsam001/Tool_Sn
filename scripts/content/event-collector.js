// Track timing locally in content script to block events immediately
let lastEventTime = 0;
let secondLastEventTime = 0;
const MIN_EVENT_GAP = 950;

// Debouncing for input and selection events
const INPUT_IDLE_MS = 500;
const SELECTION_IDLE_MS = 200;
const CLICK_IDLE_MS = 100;
let lastInputPayload = null;
let inputDebounceTimer = null;
let lastSelectionPayload = null;
let selectionDebounceTimer = null;

function shouldBlockEvent(eventTimestamp) {
  const gapFromTwoEventsAgo = eventTimestamp - secondLastEventTime;
  return secondLastEventTime > 0 && gapFromTwoEventsAgo < MIN_EVENT_GAP;
}

function updateEventTiming(eventTimestamp) {
  secondLastEventTime = lastEventTime;
  lastEventTime = eventTimestamp;
}

async function processEvent(event, domEvent, takeScreenshot) {
  // Check timing for all events
  if (shouldBlockEvent(event.timestamp) && takeScreenshot) {
    if (domEvent && domEvent.preventDefault) {
      domEvent.preventDefault();
      domEvent.stopPropagation();
    }

    showSpeedWarning(
      "You are performing actions too quickly. Please slow down and try this action again.",
    );
    console.warn(
      `Event blocked: Only ${event.timestamp - secondLastEventTime}ms since two events ago (minimum: ${MIN_EVENT_GAP}ms)`,
    );
    // return;
  }

  // Update timing for successful events
  updateEventTiming(event.timestamp);

  // Send to background script
  const documentAsHtml = null;
  try {
    await chrome.runtime.sendMessage({
      type: "recordInteraction",
      event,
      html: documentAsHtml,
      takeScreenshot: takeScreenshot,
    });
    console.log("Interaction recorded successfully:", event.type);
  } catch (error) {
    console.error("Failed to record interaction:", event.type, error);
  }
}

async function recordInteraction(event, domEvent, takeScreenshot = true) {
  console.log(event.type, event);

  if (event.type === "input") {
    // Debounce input events
    lastInputPayload = { event, domEvent };
    if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
    inputDebounceTimer = setTimeout(() => {
      processEvent(
        lastInputPayload.event,
        lastInputPayload.domEvent,
        takeScreenshot,
      );
      lastInputPayload = null;
      inputDebounceTimer = null;
    }, INPUT_IDLE_MS);
    return Promise.resolve();
  }

  if (event.type === "selection") {
    // Debounce selection events
    lastSelectionPayload = { event, domEvent };
    if (selectionDebounceTimer) clearTimeout(selectionDebounceTimer);
    selectionDebounceTimer = setTimeout(() => {
      processEvent(
        lastSelectionPayload.event,
        lastSelectionPayload.domEvent,
        takeScreenshot,
      );
      lastSelectionPayload = null;
      selectionDebounceTimer = null;
    }, SELECTION_IDLE_MS);
    return Promise.resolve();
  }

  // if (event.type === 'click') {
  //     lastSelectionPayload = { event, domEvent };
  //     if (selectionDebounceTimer) clearTimeout(selectionDebounceTimer);
  //     selectionDebounceTimer = setTimeout(() => {
  //         processEvent(lastSelectionPayload.event, lastSelectionPayload.domEvent);
  //         lastSelectionPayload = null;
  //         selectionDebounceTimer = null;
  //     }, CLICK_IDLE_MS);
  //     return Promise.resolve();
  // }

  // For all other events, process immediately
  await processEvent(event, domEvent, takeScreenshot);
  return Promise.resolve();
}

function addListeners() {
  window.isScrolling = false;
  window.scrollStartPos = { x: window.scrollX, y: window.scrollY };
  window.scrollStartTime = Date.now();
  window.cursorPos = { x: undefined, y: undefined };
  let dragStartCoords = null;

  // variables to track drag and drop using
  // heuristic: mouse down + movement + mouse up
  let mouseDownCoords = null;
  let mouseDownTime = null;
  let mouseDownTarget = null;

  function getBoundingBox(target) {
    if (target instanceof HTMLElement) {
      return target.getBoundingClientRect();
    }
    return undefined;
  }

  function debounce(func, wait) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Record the starting scroll position when scrolling begins
  window.addEventListener(
    "scroll",
    (event) => {
      // avoid auto-scrolls from clicks
      if (pointerdown_captured === true) {
        return;
      }
      if (!isScrolling) {
        isScrolling = true;
        const target = event.target === document ? window : event.target;
        scrollStartPos = {
          x: target === window ? window.scrollX : target.scrollLeft,
          y: target === window ? window.scrollY : target.scrollTop,
        };
        scrollStartTime = Date.now();
      }

      // Cancel drag detection if user starts scrolling
      if (mouseDownCoords) {
        mouseDownCoords = null;
        mouseDownTime = null;
        mouseDownTarget = null;
      }
    },
    { capture: true },
  );

  // Get cursor position
  window.addEventListener("mousemove", (event) => {
    cursorPos = { x: event.clientX, y: event.clientY };
  });

  // window.addEventListener("mouseup", (event) => {
  //   if (event.button !== 0) return; // Only left click

  //   // If we were in custom drag mode, record the drop
  //   if (mouseDownCoords && mouseDownTime && mouseDownTarget) {
  //     // if the distance is significant (e.g., >5px)
  //     const deltaX = event.clientX - mouseDownCoords.x;
  //     const deltaY = event.clientY - mouseDownCoords.y;
  //     const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
  //     const timeElapsed = Date.now() - mouseDownTime;

  //     if (distance > 10 || timeElapsed > 500) {
  //       // TODOs: postprocessing can check the start and end elements
  //       // They should be the same
  //       recordInteraction({
  //         type: "drag-and-drop",
  //         startX: mouseDownCoords.x,
  //         startY: mouseDownCoords.y,
  //         endX: event.clientX,
  //         endY: event.clientY,
  //         duration: timeElapsed,
  //         startElement: mouseDownTarget?.tagName || "unknown",
  //         startId: mouseDownTarget?.id || "unknown",
  //         startClass: mouseDownTarget?.className || "unknown",
  //         endElement: event.target?.tagName || "unknown",
  //         endId: event.target?.id || "unknown",
  //         endClass: event.target?.className || "unknown",
  //         url: window.location.href,
  //         page_title: document.title,
  //         timestamp: Date.now(),
  //         startBbox: getBoundingBox(mouseDownTarget) ?? {},
  //         endBbox: getBoundingBox(event.target) ?? {},
  //         is_heuristic: true,
  //       }).catch(console.error);
  //     }
  //   }

  //   mouseDownCoords = null;
  //   mouseDownTime = null;
  //   mouseDownTarget = null;
  // });

  // Use the scrollend event to detect when scrolling stops
  window.addEventListener(
    "scrollend",
    (event) => {
      const target = event.target === document ? window : event.target;
      scrollEndPos = {
        x: target === window ? window.scrollX : target.scrollLeft,
        y: target === window ? window.scrollY : target.scrollTop,
      };
      const scrollEndTime = Date.now();

      const deltaX = scrollEndPos.x - scrollStartPos.x;
      const deltaY = scrollEndPos.y - scrollStartPos.y;
      const duration = scrollEndTime - scrollStartTime;
      const directionX = deltaX > 0 ? "right" : deltaX < 0 ? "left" : "none";
      const directionY = deltaY > 0 ? "down" : deltaY < 0 ? "up" : "none";
      // If there's no movement in both X and Y directions, skip recording the interaction
      if (deltaX === 0 && deltaY === 0) {
        isScrolling = false;
        return;
      }
      recordInteraction({
        type: "scroll",
        deltaX: deltaX,
        deltaY: deltaY,
        directionX: directionX,
        directionY: directionY,
        cursorX: cursorPos.x,
        cursorY: cursorPos.y,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        duration: duration,
        url: window.location.href,
        page_title: document.title,
        timestamp: scrollEndTime,
        bbox: getBoundingBox(event.target) ?? {},
        isElementScroll: target !== window,
      }).catch(console.error);

      isScrolling = false;
    },
    { capture: true },
  );

  // window.addEventListener(
  //   "click",
  //   (event) => {
  //     if (event.clientX === 0 && event.clientY === 0) {
  //       return;
  //     }
  //     recordInteraction(
  //       {
  //         type: "click",
  //         x: event.clientX,
  //         y: event.clientY,
  //         viewport_width: window.innerWidth,
  //         viewport_height: window.innerHeight,
  //         element: event.target?.tagName || "unknown",
  //         id: event.target?.id || "unknown",
  //         class: event.target?.className || "unknown",
  //         src: event.target?.src || "unknown",
  //         href: event.target?.href || "unknown",
  //         ariaLabel: event.target?.getAttribute("aria-label") || "unknown",
  //         role: event.target?.getAttribute("role") || "unknown",
  //         text: event.target?.innerText || "unknown",
  //         url: window.location.href,
  //         page_title: document.title,
  //         button: event.button,
  //         timestamp: Date.now(),
  //         bbox: getBoundingBox(event.target) ?? {},
  //       },
  //       event,
  //     ).catch(console.error);
  //   },
  //   { capture: true },
  // );

  let pointerdown_captured = false;

  ["pointerdown", "pointerup"].forEach((eventType) => {
    window.addEventListener(
      eventType,
      (event) => {
        // avoid non-left-click pointerdown events and pointerup events at (0,0)
        // only apply to pointerdown events
        if (pointerdown_captured === true) {
          console.log("pointerdown_captured === true in click event listener");
          return;
        }

        if (eventType === "pointerdown") {
          if (event.button !== 0) {
            console.log(`Skipping ${eventType} with button ${event.button}`);
            return;
          } else if (event.clientX === 0 && event.clientY === 0) {
            console.log(`Skipping ${eventType} at (0,0)`);
            return;
          }
          // Check if this element was already recorded recently
          // else if (pointerdown_captured === true) {
          //   console.log(`Skipping duplicate ${eventType} - already recorded`);
          //   return;
          // }

          pointerdown_captured = true;
          setTimeout(() => (pointerdown_captured = false), 300);
        }

        //event.target.setAttribute("data-recorded", "true");
        //setTimeout(() => event.target.removeAttribute("data-recorded"), 300);
        const event_data = {
          type: "click",
          x: event.clientX,
          y: event.clientY,
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
          element: event.target?.tagName || "unknown",
          id: event.target?.id || "unknown",
          class: event.target?.className || "unknown",
          src: event.target?.src || "unknown",
          href: event.target?.href || "unknown",
          ariaLabel: event.target?.getAttribute("aria-label") || "unknown",
          role: event.target?.getAttribute("role") || "unknown",
          text: event.target?.innerText || "unknown",
          url: window.location.href,
          page_title: document.title,
          button: event.button,
          timestamp: Date.now(),
          bbox: getBoundingBox(event.target) ?? {},
          originalEventType: eventType,
        };
        recordInteraction(event_data, event).catch(console.error);
        // setTimeout(
        //   () => recordInteraction(event_data, event).catch(console.error),
        //   500,
        // );
      },
      { capture: true },
    );
  });

  document.addEventListener(
    "mousedown",
    (event) => {
      if (event.clientX === 0 && event.clientY === 0) {
        return;
      }
      // Only handle left-clicks
      if (event.button !== 0) return;

      mouseDownCoords = { x: event.clientX, y: event.clientY };
      mouseDownTime = Date.now();
      mouseDownTarget = event.target;

      let target = event.target;
      // Traverse up to find anchor if needed
      while (target && target.tagName !== "A") {
        target = target.parentElement;
      }
      if (target && target.tagName === "A") {
        const href = target.getAttribute("href");
        const targetAttr = target.getAttribute("target");
        if (targetAttr === "_blank" && href) {
          // Record the click event immediately
          recordInteraction(
            {
              type: "click",
              x: event.clientX,
              y: event.clientY,
              element: target.tagName,
              id: target.id || "unknown",
              class: target.className || "unknown",
              src: target.src || "unknown",
              href: href,
              ariaLabel: target.getAttribute("aria-label") || "unknown",
              role: target.getAttribute("role") || "unknown",
              text: target.innerText || "unknown",
              url: window.location.href,
              page_title: document.title,
              button: event.button,
              timestamp: Date.now(),
              bbox: target.getBoundingClientRect(),
              openedNewTab: true,
            },
            event,
            false,
          ).catch(console.error);
        }
      }
    },
    { capture: true },
  );

  // Trigger finalization on click outside the input field
  // window.addEventListener(
  //   "dblclick",
  //   (event) => {
  //     recordInteraction({
  //       type: "dblclick",
  //       x: event.clientX,
  //       y: event.clientY,
  //       viewport_width: window.innerWidth,
  //       viewport_height: window.innerHeight,
  //       element: event.target?.tagName || "unknown",
  //       id: event.target?.id || "unknown",
  //       class: event.target?.className || "unknown",
  //       src: event.target?.src || "unknown",
  //       href: event.target?.href || "unknown",
  //       ariaLabel: event.target?.getAttribute("aria-label") || "unknown",
  //       role: event.target?.getAttribute("role") || "unknown",
  //       url: window.location.href,
  //       page_title: document.title,
  //       timestamp: Date.now(),
  //       bbox: getBoundingBox(event.target) ?? {},
  //     }).catch(console.error);
  //   },
  //   { capture: true },
  // );

  // Capture non-character-typing keys
  const specialKeys = [
    "Enter",
    "NumpadEnter",
    "Tab",
    "ArrowDown",
    "ArrowUp",
    "ArrowLeft",
    "ArrowRight",
    "Escape",
  ];
  window.addEventListener(
    "keydown",
    (event) => {
      if (!specialKeys.includes(event.key)) return;
      //event.preventDefault(); ?

      const interaction = {
        type: "keypress",
        key: event.key,
        viewport_width: window.innerWidth,
        viewport_height: window.innerHeight,
        element: event.target?.tagName || "unknown",
        id: event.target?.id || "unknown",
        class: event.target?.className || "unknown",
        url: window.location.href,
        page_title: document.title,
        ariaLabel: event.target?.getAttribute("aria-label") || "unknown",
        role: event.target?.getAttribute("role") || "unknown",
        value: event.target?.value || "unknown",
        timestamp: Date.now(),
        bbox: getBoundingBox(event.target) ?? {},
      };
      recordInteraction(interaction, event).catch(console.error);
    },
    { capture: true },
  );

  // TODO: add a listener to command + F

  // NOTE: below is an attempt to capture screenshot only when input changes are finished
  // Listen for blur on every <input> and <textarea> to capture the "final" value
  // document.querySelectorAll('input,textarea').forEach(el => {
  //     el.addEventListener('blur', async (event) => {
  //       // build your interaction object
  //       const interaction = {
  //         type: 'input',
  //         value: el.value,
  //         element: el.tagName,
  //         id: el.id || 'unknown',
  //         class: el.className || 'unknown',
  //         url: window.location.href,
  //         timestamp: Date.now(),
  //         bbox: el.getBoundingClientRect()
  //       };

  //       try {
  //         // now await it so you know it's finished before proceeding
  //         await recordInteraction(interaction);
  //         console.log('Final input recorded:', interaction.value);
  //       } catch (err) {
  //         console.error('Recording failed:', err);
  //       }
  //     }, { capture: true });
  //   });

  document.addEventListener(
    "input",
    async (event) => {
      // Check if the event target is an input or textarea
      if (pointerdown_captured === true) {
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        const interaction = {
          type: "input",
          value: event.target.value,
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
          element: event.target.tagName,
          id: event.target.id || "unknown",
          class: event.target.className || "unknown",
          url: window.location.href,
          page_title: document.title,
          timestamp: Date.now(),
          bbox: event.target.getBoundingClientRect(),
        };

        try {
          await recordInteraction(interaction).catch(console.error);
          console.log("Input change recorded:", interaction.value);
        } catch (error) {
          console.error("Error recording input change:", error);
        }
      }
    },
    { capture: true },
  );

  document.addEventListener("copy", async (event) => {
    const selectedText = document.getSelection().toString();

    await recordInteraction({
      type: "copy",
      text: selectedText,
      url: window.location.href,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      timestamp: Date.now(),
    }).catch(console.error);

    console.log("Copied text:", selectedText);
  });

  document.addEventListener("paste", async (event) => {
    const pastedData = event.clipboardData.getData("text/plain");

    await recordInteraction({
      type: "paste",
      text: pastedData,
      url: window.location.href,
      page_title: document.title,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      timestamp: Date.now(),
    }).catch(console.error);

    console.log("Pasted data:", pastedData);
  });

  document.addEventListener("selectionchange", async () => {
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString() : "";
    const isSelectAll = selectedText === document.body.innerText;

    if (selectedText) {
      console.log("Selection changed:", { selectedText, isSelectAll });

      // Get the range and bounding rect of the selection
      let startCoordinates = null;
      let endCoordinates = null;

      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0); // Get the first range
        const rect = range.getBoundingClientRect(); // Get bounding box of the range

        startCoordinates = { x: rect.left, y: rect.top }; // Top-left of the selection
        endCoordinates = { x: rect.right, y: rect.bottom }; // Bottom-right of the selection
      }

      try {
        await recordInteraction({
          type: "selection",
          text: selectedText,
          isSelectAll: isSelectAll,
          url: window.location.href,
          page_title: document.title,
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
          startCoordinates: startCoordinates,
          endCoordinates: endCoordinates,
          timestamp: Date.now(),
        });
        console.log("Selection recorded:", {
          selectedText,
          startCoordinates,
          endCoordinates,
        });
      } catch (error) {
        console.error("Failed to record selection:", error);
      }
    }
  });

  // window.addEventListener("resize", async (event) => {
  //   await recordInteraction(
  //     {
  //       type: "resizeViewport",
  //       viewport_width: window.innerWidth,
  //       viewport_height: window.innerHeight,
  //       timestamp: Date.now(),
  //     },
  //     null,
  //     false,
  //   ).catch(console.error);
  // });

  // // Drag-and-Drop Monitoring
  // window.addEventListener("dragstart", async (event) => {
  //   dragStartCoords = {
  //     x: event.clientX,
  //     y: event.clientY,
  //   };
  // });

  // window.addEventListener("drop", async (event) => {
  //   event.preventDefault(); // Prevent default browser behavior
  //   const target = event.target;

  //   await recordInteraction({
  //     type: "drag-and-drop",
  //     startX: dragStartCoords?.x || null,
  //     startY: dragStartCoords?.y || null,
  //     endX: event.clientX,
  //     endY: event.clientY,
  //     element: target?.tagName || "unknown",
  //     id: target?.id || "unknown",
  //     class: target?.className || "unknown",
  //     url: window.location.href,
  //     page_title: document.title,
  //     timestamp: Date.now(),
  //     bbox: getBoundingBox(target) ?? {},
  //     is_heuristic: false,
  //   }).catch(console.error);

  //   dragStartCoords = null;
  // });

  const getNavigationMethod = () => {
    // Get navigation entry (modern API)
    const navEntry = performance.getEntriesByType("navigation")[0];
    const navigationType = navEntry ? navEntry.type : "unknown";

    // Get referrer
    const referrer = document.referrer || "";

    // Determine navigation method
    let method = "unknown";

    if (navigationType === "reload") {
      method = "page_refresh";
    } else if (navigationType === "back_forward") {
      method = "browser_back_forward";
    } else if (navigationType === "navigate") {
      if (!referrer) {
        // No referrer = direct navigation
        method = "direct_navigation"; // URL bar, bookmark, external app
      } else {
        // Has referrer = came from another page
        const referrerDomain = new URL(referrer).hostname;
        const currentDomain = window.location.hostname;

        if (referrerDomain === currentDomain) {
          method = "internal_link"; // Link click within same site
        } else {
          method = "external_link"; // Link click from different site
        }
      }
    }

    return {
      method: method,
      type: navigationType,
      referrer: referrer,
    };
  };

  let loadDebounceTimer;
  window.addEventListener(
    "load",
    (event) => {
      const navigationInfo = getNavigationMethod();
      // set timeout to 300ms
      clearTimeout(loadDebounceTimer);
      loadDebounceTimer = setTimeout(() => {
        recordInteraction({
          type: "load",
          url: window.location.href,
          page_title: document.title,
          timestamp: Date.now(),
          bbox: {},
          navigationMethod: navigationInfo.method,
          navigationType: navigationInfo.type,
          referrer: navigationInfo.referrer,
        }).catch(console.error);
      }, 300);
    },
    { capture: true },
  );

  // Trigger finalization on page unload
  window.addEventListener(
    "unload",
    async (event) => {
      await recordInteraction(
        {
          type: "unload",
          url: window.location.href,
          page_title: document.title,
          timestamp: Date.now(),
          bbox: {},
        },
        null,
        false,
      ).catch(console.error);
    },
    { capture: true },
  );
}

// Handle messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "showSpeedWarning") {
    showSpeedWarning(message.message);
  }
});

function showSpeedWarning(warningText) {
  // Remove any existing warning
  const existingWarning = document.getElementById("__webolmoSpeedWarning");
  if (existingWarning) {
    existingWarning.remove();
  }

  // Create warning overlay
  const warning = document.createElement("div");
  warning.id = "__webolmoSpeedWarning";
  warning.textContent = warningText;
  Object.assign(warning.style, {
    position: "fixed",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "2147483647",
    backgroundColor: "#ff4444",
    color: "white",
    padding: "15px 25px",
    borderRadius: "8px",
    fontFamily: "Arial, sans-serif",
    fontSize: "16px",
    fontWeight: "bold",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    pointerEvents: "none",
    animation: "webolmoFadeIn 0.3s ease-in",
  });

  // Add fade in animation
  const style = document.createElement("style");
  style.textContent = `
        @keyframes webolmoFadeIn {
            from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
  document.head.appendChild(style);

  document.documentElement.appendChild(warning);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (warning && warning.parentNode) {
      warning.style.animation = "webolmoFadeIn 0.3s ease-out reverse";
      setTimeout(() => warning.remove(), 300);
    }
  }, 3000);
}

// Initialize listeners if not already done
if (!window.hasEventCollectorInitialized) {
  addListeners();
  window.hasEventCollectorInitialized = true;
}
