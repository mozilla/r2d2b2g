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
      // hosted and generated apps
      window.postMessage({
        name: "addAppByTab",
        url: input.val().trim(),
        receiptType: Simulator.getReceiptType(),
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
            AppList.update(message.list);
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
    $('body').toggleClass('device-connected', !!Simulator.deviceConnected);
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
    // packaged apps
    window.postMessage({
      name: "addAppByDirectory",
      receiptType: Simulator.getReceiptType()
    }, "*");
  },

  openConnectDevtools: function() {
    window.postMessage({ name: "openConnectDevtools" }, "*");
  },

  // receipt type can be: ok, expired, invalid, refunded, none
  getReceiptType: function() {
    return $('#receipt_type').val();
  },
};

$(window).load(function() {
  Simulator.init();
});
