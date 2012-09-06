document.defaultView.addEventListener("message", function(event) {
  self.port.emit(event.data);
}, false);
