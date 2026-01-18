/**
 *
 * @param {string} sessionId
 * @param {string} startUrl
 * @param {string} instruction
 * @param {string} uploadUrl
 * @returns {Promise<void>}
 */
async function startTrainingSession(
  sessionId,
  startUrl,
  instruction,
  task_steps,
  uploadUrl,
) {
  try {
    await chrome.runtime.sendMessage({
      type: "startSession",
      sessionId,
      startUrl,
      instruction,
      task_steps,
      uploadUrl,
    });
  } catch (error) {
    console.error("Error sending startSession message:", error);
  }
}

// https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#host-page-communication
window.addEventListener("message", async (event) => {
  if (event.source !== window) {
    return;
  }

  if (event.data.type === "startSession") {
    await startTrainingSession(
      event.data.sessionId,
      event.data.startUrl,
      event.data.instruction,
      event.data.task_steps,
      event.data.uploadUrl,
    );
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (["sessionData", "addEvent", "finishSession"].includes(message.type)) {
    window.postMessage(message);
  }
});
