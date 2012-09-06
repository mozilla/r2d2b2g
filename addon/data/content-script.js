document.defaultView.addEventListener("message", function(event) {
  self.postMessage(event.data);
}, false);
