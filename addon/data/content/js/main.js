$(document).ready(function() {

  var section = $('#index')[0];
  $(document).delegate('nav a', 'click', function(evt) {
    var target = $(this).attr('href');
    var to = $(target)[0];
    if (to == section) {
      return;
    }
    $(section).hide();
    $('a[href="#' + $(section).attr('id') + '"]').removeClass('active');
    section = to;
    $(section).show();
    $('a[href="#' + $(section).attr('id') + '"]').addClass('active');
  });

  document.documentElement.addEventListener(
    "addon-message",
    function isRunningListener(event) {
      var message = event.detail;
      if (!("name" in message)) {
        return;
      }
      switch (message.name) {
        case "isRunning":
          if (message.isRunning) {
            $("#simulatorStatus").text("Running");
            $("#toggleButton").addClass("started");
          }
          else {
            $("#simulatorStatus").text("Stopped");
            $("#toggleButton").removeClass("started");
          }
          break;
        case "listApps":
          $('#apps-dir').val(message.dir);
          $('#apps-list').text(JSON.stringify(message.list));
          break;
      }
    },
    false
  );
  window.postMessage({ name: "getIsRunning" }, "*");
  window.postMessage({ name: "listApps" }, "*");

});

var simulator = {
  toggle: function() {
    window.postMessage({ name: "toggle" }, "*");
  },
  create: function() {
    window.postMessage({ name: "create" }, "*");
  },
};
