var simulator = {
  isRunning: function(callback) {
    window.postMessage({ name: "getIsRunning" }, "*");
    window.addEventListener("message", function isRunningListener(event) {
      var message = JSON.parse(event.data);
      if ("name" in message && message.name == "isRunning") {
        window.removeEventListener("message", isRunningListener, false);
        callback(message.isRunning);
      }
    }, false);
  },
};

$(document).ready(function() {
  simulator.isRunning(function(isRunning) {
    if (isRunning) {
      $("#simulatorStatus").text("running");
    }
    else {
      $("#simulatorStatus").text("stopped");
    }
  });
});
