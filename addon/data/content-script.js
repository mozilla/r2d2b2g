// This content script is intended to be a dumb pipe, as the content is trusted,
// and we'd connect it directly to the addon if we could.  Thus we simply
// forward all messages we receive in either direction, and we use postMessage()
// to communicate with the addon, to maintain consistency between
// the content<->content-script and content-script<->addon transmissions.

let contentWindow = document.defaultView;

contentWindow.addEventListener("message", function(event) {
  let message = event.data;
  if (message.destination === "content") {
    return;
  }
  self.postMessage(message);
}, false);

self.on("message", function(message) {
  message.destination = "content";
  contentWindow.postMessage(message, "*");
});
