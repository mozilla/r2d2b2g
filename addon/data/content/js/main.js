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

    var currentUrl;
    $('#add-app-url').on('keyup change', function(evt) {
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
        url: input.val()
      }, "*");
    });

    document.documentElement.addEventListener(
      "addon-message",
      function isRunningListener(event) {
        var message = event.detail;
        if (!("name" in message)) {
          return;
        }
        console.log('Addon-message: ' + message.name);
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
          case "listTabs":
            var container = $('#list-app-tabs'), items = [];
            for (var url in message.list) {
              console.log(url);
              items.push($('<option>').prop('value', url));
            }
            container.append(items);
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
            console.log(defaultApp, defaultPref.text());

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
                  $("<div class='options'>").append(
                    $("<button>")
                      .text("Update")
                      .click(function(evt) {
                        window.postMessage({name: "updateApp", id: id}, "*");
                      })
                      .prop("title,", lastUpdate),
                    $("<label>").append(
                      $("<span>").text('Run by default:'),
                      $("<input type='checkbox'>")
                        .prop('checked', defaultApp == id)
                        .prop('title', "Launch by default")
                        .click(function() {
                          var value = $(this).prop("checked") ? id : null;
                          window.postMessage({name: "setDefaultApp", id: value}, "*");
                        })
                      )
                    ),
                  $("<h4>").text(app.name),
                  $("<code>").text(id)
                )
              );
            });
            break;
        }
      },
      false
    );
    window.postMessage({ name: "getIsRunning" }, "*");
    window.postMessage({ name: "listApps" }, "*");
    window.postMessage({ name: "listTabs" }, "*");
    window.postMessage({ name: "getPreference" }, "*");
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

