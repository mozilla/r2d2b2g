var Simulator = {
  deviceConnected: null,

  APP_TYPES: {
    "local": "Packaged App",
    "generated": "Generated App",
    "hosted": "Hosted App"
  },

  init: function() {

    this.toggler = $('#command-toggle')[0];
    $(this.toggler).prop('checked', false).on('change', function(evt) {
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

    var currentUrl;
    $('#add-app-url').on('keyup change input', function(evt) {
      var url = $(this).val();
      if (url == currentUrl) {
        return;
      }
      currentUrl = url;
      var valid = this.checkValidity();
      console.log(valid);
      $('#action-add-page, #action-add-manifest').prop('disabled', !valid);
      if (!valid) {
        return;
      }

      window.postMessage({name: "validateUrl", url: url}, "*");
    });

    $('#commands-preference-jsconsole').on('change', function(evt) {
      window.postMessage({
        name: "setPreference",
        key: "jsconsole",
        value: $(this).prop("checked")
      }, "*");
    });

    $('#form-add-app').on('submit', function(evt) {
      evt.preventDefault();

      var input = $('#add-app-url');
      var valid = input[0].checkValidity();
      window.postMessage({
        name: "addAppByTab",
        url: input.val().trim()
      }, "*");
      $("#form-add-app").get(0).reset();
    });

    document.documentElement.addEventListener(
      "addon-message",
      function addonMessageListener(event) {
        var message = event.detail;
        if (!("name" in message)) {
          return;
        }
        console.log('Addon-message: ' + message.name);
        switch (message.name) {
          case "deviceConnected":
            Simulator.deviceConnected = message.value;
            console.log("device " + (message.value ? "" : "dis") + "connected");
            Simulator.updateDeviceView();
            break;
          case "isRunning":
            $(Simulator.toggler).prop('indeterminate', false);
            var remoteDebuggerPortEl = $('#commands-preference-remote-debugger-port');
            if (message.isRunning) {
              $(Simulator.toggler).prop('checked', true);
              remoteDebuggerPortEl.html(message.remoteDebuggerPort);
              remoteDebuggerPortEl.parents('label').show();
              // NOTE: show connect devtools buttons where it's supported
              //       and show allocated debugger port on previous firefox releases
              if (message.hasConnectDevtools) {
                $("#show-debugger-port").hide();
                $("#open-connect-devtools").prop("disabled", false);
                $("#open-connect-devtools").show();
              } else {
                $("#show-debugger-port").show();
                $("#open-connect-devtools").hide();
                $("#open-connect-devtools").prop("disabled", true);
              }
            }
            else {
              $(Simulator.toggler).prop('checked', false);
              $('#commands-preference-remote-debugger-port').html(message.remoteDebuggerPort);
              remoteDebuggerPortEl.parents('label').hide();
            }
            break;
          case "listTabs":
            var container = $('#list-app-tabs'), items = [];
            for (var url in message.list) {
              items.push($('<option>').prop('value', url));
            }
            container.empty().append(items);
            break;
          case "setPreference":
            $("#commands-preference-" + message.key).prop("checked", message.value);
            break;
          case "validateUrl":
            var set = $('#add-app-url').parents('form').removeClass('is-manifest');
            if (!message.err) {
              set.addClass('is-manifest');
            } else {
              $('#add-app-url').prop('title', message.err);
            }
            break;
          case "listApps":
            var defaultApp = message.defaultApp || null;
            var container = $('#apps-list').empty();

            var defaultPref = $("#commands-preference-default-app");
            if (defaultApp) {
              defaultPref.text(message.list[defaultApp].name).parents('label').show();
            } else {
              defaultPref.parents('label').hide();
            }

            var ids = Object.keys(message.list);
            console.log(ids);
            if (!ids.length) {
              container.append('<em>No Apps added yet? Add some …</em>');
            }
            ids.forEach(function(id) {
              // FIXME: forEach workaround as for-in resulted in broken index
              var app = message.list[id];

              var lastUpdate = app.lastUpdate || null;
              if (lastUpdate) {
                lastUpdate = (new Date(app.lastUpdate)).toUTCString();
              } else {
                lastUpdate = "-";
              }

              var options = [];

              var note = Simulator.APP_TYPES[app.type];

              if (app.removed) {
                options.push(
                  $("<a href='#'>")
                    .addClass("button")
                    .text("Undo")
                    .click(function(evt) {
                      evt.preventDefault();
                      window.postMessage({name: "undoRemoveApp", id: id}, "*");
                    })
                  );
                note = "has been removed.";
              } else {
                options.push(
                  $("<button>")
                    .addClass("pushButton")
                    .append("<img src='device.png' height='14'> Push")
                    .css("opacity", Simulator.deviceConnected ? 1 : 0)
                    .click(function(evt) {
                      window.postMessage({ name: "pushAppToDevice", id: id }, "*");
                    })
                    .prop("title", lastUpdate),
                  $("<a href='#'>")
                    .addClass("button")
                    .text("Remove")
                    .click(function(evt) {
                      evt.preventDefault();
                      window.postMessage({name: "removeApp", id: id}, "*");
                    }),
                  $("<button>")
                    .text("Update")
                    .click(function(evt) {
                      window.postMessage({name: "updateApp", id: id}, "*");
                    })
                    .prop("title", lastUpdate),
                  $("<button>")
                    .text("Run")
                    .click(function(evt) {
                      window.postMessage({name: "runApp", id: id}, "*");
                    })
                );
                // $("<label>").append(
                //   $("<span>").text('Run by default:'),
                //   $("<input type='checkbox'>")
                //     .prop('checked', defaultApp == id)
                //     .prop('title', "Launch by default")
                //     .click(function() {
                //       var value = $(this).prop("checked") ? id : null;
                //       window.postMessage({name: "setDefaultApp", id: value}, "*");
                //     })
                //   )
              }

              var entry = $("<div class='app'>").append(
                $("<div class='options'>").append(options),
                $("<h4>").text(app.name).append(
                  $('<small>').text(note)
                )
              );

              if (app.removed) {
                entry.addClass('removed');
              } else {
                entry.append(
                  $("<p>").append(
                    $("<a href='#'>")
                      .text("Open Location")
                      .prop("title", id)
                      .click(function(evt) {
                        evt.preventDefault();
                        window.postMessage({name: "revealApp", id: id}, "*");
                      }),
                    $("<span>")
                      .text(" (" + id + ")")
                  )
                );
              }

              if (!app.removed && app.validation) {
                var validationEl = $("<div class='app-validation'>");

                var errors = app.validation.errors;
                var warnings = app.validation.warnings;

                var validationResultText = app.validation.running ? "RUNNING": "";

                if (errors.length > 0 || warnings.length > 0) {
                  var listContainerEl = $("<ul class='app-validation-list'>");

                  if (errors.length > 0) {
                    entry.addClass("invalid-manifest");
                    var errorsEl = $("<ul class='app-validation-errors'>");
                    errors.forEach(function (msg) {
                      errorsEl.append($("<li>").html(msg));
                    });
                    listContainerEl.append($("<li>").
                                           text("Errors:").
                                           append(errorsEl));
                  }

                  if (warnings.length > 0) {
                    entry.addClass("warning-manifest");
                    var warningsEl = $("<ul class='app-validation-warnings'>");
                    warnings.forEach(function (msg) {
                      warningsEl.append($("<li>").html(msg));
                    });
                    listContainerEl.append($("<li>").
                                           text("Warnings:").
                                           append(warningsEl));
                  }

                  listContainerEl.hide();

                  if (!app.validation.running) {
                    validationResultText = errors.length === 0 ? "WARNINGS" : "INVALID";
                  }

                  validationEl.append(
                    $("<span>")
                      .text("Validation Result: " + validationResultText)
                      .prop("class", "app-validation-result"),
                    $("<a href='#'>")
                      .text(" ("+errors.length+" errors and "+warnings.length+" warnings)")
                      .prop("title", "expand validation messages")
                      .click(function(evt) {
                        listContainerEl.toggle();
                        return false;
                      }),
                    listContainerEl);
                } else {
                  validationResultText = !app.validation.running ? "OK" : validationResultText;
                  validationEl.append(
                    $("<span>")
                      .text("Validation Result: " + validationResultText)
                      .prop("class", "app-validation-result"));
                }

                entry.append(validationEl);
              }

              // FIXME: Make an actual list, add a template engine
              container.append(entry);
            });
            break;
        }
      },
      false
    );

    window.postMessage({ name: "getIsRunning" }, "*");
    window.postMessage({ name: "getDeviceConnected" }, "*");
    // Clears removed apps on reload
    window.postMessage({ name: "listApps", flush: true }, "*");
    window.postMessage({ name: "listTabs" }, "*");
    window.postMessage({ name: "getPreference" }, "*");
  },

  updateDeviceView: function() {
    if (Simulator.deviceConnected) {
      $('#device-status').fadeTo('slow', 1);
      $('.pushButton').removeAttr('disabled');
      $('.pushButton').fadeTo('slow', 1);
    } else {
      $('#device-status').fadeTo('slow', 0);
      $('.pushButton').attr('disabled', 'disabled');
      $('.pushButton').fadeTo('slow', 0);
    }
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

  addAppByDirectory: function() {
    window.postMessage({ name: "addAppByDirectory" }, "*");
  },

  openConnectDevtools: function() {
    window.postMessage({ name: "openConnectDevtools" }, "*");
  }

};

$(window).load(function() {
  Simulator.init();
});
