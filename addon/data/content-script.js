// This content script is intended to be a dump pipe, as the content is trusted,
// and we'd connect it directly to the addon if we could.  Thus we simply
// forward all messages we receive in either direction, and we use postMessage()
// to communicate with the addon, to maintain consistency between
// the content<->content-script and content-script<->addon transmissions.

document.defaultView.addEventListener("message", function(event) {
  self.postMessage(event.data);
}, false);

self.on("message", function(data) {
  document.defaultView.postMessage(data, "*");
});
