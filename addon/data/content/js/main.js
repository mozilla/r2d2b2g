$(document).ready(function() {

  document.documentElement.addEventListener(
    "addon-message",
    function isRunningListener(event) {
      var message = event.detail;
      if ("name" in message && message.name == "isRunning") {
        if (message.isRunning) {
          $("#simulatorStatus").text("running");
        }
        else {
          $("#simulatorStatus").text("stopped");
        }
      }
    },
    false
  );
  window.postMessage({ name: "getIsRunning" }, "*");

});
