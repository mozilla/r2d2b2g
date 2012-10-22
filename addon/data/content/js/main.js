var Simulator = {

  init: function() {

    this.toggler = $('#command-toggle')[0];
    $(this.toggler).on('change', function(evt) {
      // FIXME: Change to actual checkbox state
      Simulator.toggle();
    });

    var current = document.location.hash.substr(1) || 'index';
    Simulator.show('#' + current);

    $(document).on('click', 'a[href^="#"]', function(evt) {
      var target = $(this).attr('href');
      if ($(target)[0].tagName.toLowerCase() == 'section') {
        Simulator.show(target);
      }
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
            $(Simulator.toggler).prop('indeterminate', false);
            if (message.isRunning) {
              $(Simulator.toggler).prop('checked', true);
            }
            else {
              $(Simulator.toggler).prop('checked', false);
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
  },

  show: function(target) {
    var to = $(target)[0];
    if (this.section) {
      if (to == this.section) {
        return;
      }
      $(this.section).hide();
      $('a[href="#' + $(this.section).attr('id') + '"]').removeClass('active');
    }
    this.section = to;
    $(this.section).show();
    $('a[href="#' + $(this.section).attr('id') + '"]').addClass('active');
  },

  toggle: function() {
    $(this.toggler).prop('indeterminate', true);
    window.postMessage({ name: "toggle" }, "*");
  },

  create: function() {
    window.postMessage({ name: "create" }, "*");
  }

};

$(document).ready(function() {
  Simulator.init();
});

