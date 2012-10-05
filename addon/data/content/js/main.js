$(document).ready(function() {

  document.documentElement.addEventListener(
    "addon-message",
    function isRunningListener(event) {
      var message = event.detail;
      if ("name" in message && message.name == "isRunning") {
        if (message.isRunning) {
          $("#simulatorStatus").text("running");
          $("#toggleButton").text("Stop");
        }
        else {
          $("#simulatorStatus").text("stopped");
          $("#toggleButton").text("Start");
        }
      }
    },
    false
  );
  window.postMessage({ name: "getIsRunning" }, "*");

});

var simulator = {
  toggle: function() {
    window.postMessage({ name: "toggle" }, "*");
  },
  create: function() {
    window.postMessage({ name: "create" }, "*");
  },
};
