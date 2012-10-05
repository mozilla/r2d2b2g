// This content script is intended to be a dumb pipe, as the content is trusted,
// and we'd connect it directly to the addon if we could.  Thus we simply
// forward all messages we receive in either direction, and we use postMessage()
// to communicate with the addon, to maintain consistency between
// the content<->content-script and content-script<->addon transmissions.

let contentWindow = document.defaultView;

contentWindow.addEventListener("message", function(event) {
  self.postMessage(event.data);
}, false);

self.on("message", function(message) {
  // For some reason, an object message posted to the content window gets cloned
  // to the string "[object Object]" on the other side.  Perhaps this is
  // something to do with wrappers.  In any case, we want to pass the actual
  // object, so we stringify it here and then make the content parse it.
  contentWindow.postMessage(JSON.stringify(message), "*");
});
