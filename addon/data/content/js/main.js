var Simulator = {

  init: function() {

    this.toggler = $('#command-toggle')[0];
    $(this.toggler).on('change', function(evt) {
      // FIXME: Change to actual checkbox state
      Simulator.toggle();
    });

    var current = document.location.hash.substr(1) || 'dashboard';
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
            console.log("listApps " + message.list.length);
            var container = $('#apps-list').empty();
            Object.keys(message.list).forEach(function(id) {
              // FIXME: forEach workaround as for-in resulted in broken index
              var app = message.list[id];

              var lastUpdate = app.lastUpdate || null;
              if (lastUpdate) {
                lastUpdate = (new Date(app.lastUpdate)).toUTCString();
              } else {
                lastUpdate = "-";
              }

              // FIXME: Make an actual list, add a template engine
              container.append(
                $("<div class='app'>").append(
                  // $("<input type='checkbox'>").prop("title", "Default Launch").on("change", function(evt) {
                  //   console.log($(this).prop("checked"));
                  //   window.postMessage({
                  //     name: "setDefaultApp",
                  //     id: id,
                  //     checked: $(this).prop("checked")
                  //   }, "*");
                  // }).prop("checked", app.isDefault),
                  $("<label>").append(
                    $("<span>").text("Last Updated: " + lastUpdate),
                    $("<button>").text("Update").click(function(evt) {
                      console.log("CLICKED updateApp " + id);
                      window.postMessage({name: "updateApp", id: id}, "*");
                    })
                  ),
                  $("<h4>").text(app.name),
                  $("<code>").text(id)
                )
              )
            });
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
  },

  addAppByDirectory: function() {
    window.postMessage({ name: "addAppByDirectory" }, "*");
  }

};

$(document).ready(function() {
  Simulator.init();
});

