$(document).ready(function() {

  window.addEventListener("message", function isRunningListener(event) {
    var message = JSON.parse(event.data);
    if ("name" in message && message.name == "isRunning") {
      if (message.isRunning) {
        $("#simulatorStatus").text("running");
      }
      else {
        $("#simulatorStatus").text("stopped");
      }
    }
  }, false);
  window.postMessage({ name: "getIsRunning" }, "*");

});
