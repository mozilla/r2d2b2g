var Simulator = {
  deviceConnected: null,

  APP_TYPES: {
    "local": "Packaged App",
    "generated": "Generated App",
    "hosted": "Hosted App"
  },

  init: function() {

    this.toggler = $('#command-toggle')[0];
    var currentUrl;
    $('#add-app-url, #new-from-manifest').on('keyup change input', function(evt) {
      var url = $(this).val();
      if (url == currentUrl) {
        return;
      }
      currentUrl = url;
      var valid = this.checkValidity();
      $('#add-app-url, #new-from-manifest').attr('data-valid', 'pending');
      $('#action-add-page, #action-add-manifest').prop('disabled', !valid);
      if (!valid) {
        return;
      }
      console.log('submitting url for validation...');
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
            var datalist = $('#list-app-tabs').empty();
            var tablist = $('#new-from-tab').empty();
            tablist.append('<option selected>Select an open tab</option>');
            for (var url in message.list) {
              var el = $('<option>').prop('value', url).text(message.list[url]);
              datalist.append(el);
              tablist.append(el);
            }
            break;
          case "setPreference":
            $("#commands-preference-" + message.key).prop("checked", message.value);
            break;
          case "validateUrl":
            var set = $('#add-app-url').parents('form').removeClass('is-manifest');
            $("#add-hosted-app").prop("disabled", !!message.err);
            if (message.err) {
              $('#new-from-manifest, #add-app-url').attr('data-valid', 'no');
              $('#add-app-url').prop('title', message.err);
            } else {
              set.addClass('is-manifest');
              $('#new-from-manifest, #add-app-url').attr('data-valid', 'yes');
            }
            break;
          case "listApps":
            var defaultApp = message.defaultApp || null;

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

  toggle: function() {
    $(this.toggler).prop('indeterminate', true);
    window.postMessage({ name: "toggle" }, "*");
  },

  addAppByDirectory: function() {
    // packaged apps
    window.postMessage({ name: "addAppByDirectory" }, "*");
  },

  openConnectDevtools: function() {
    window.postMessage({ name: "openConnectDevtools" }, "*");
  }

};

var $addProjectDialog = $('#add-project-dialog');
var $addProjectButton = $('#add-project');
$addProjectButton.on('click', function() {
  $addProjectDialog.toggleClass('open');
  var isOpen = $addProjectDialog.hasClass('open');
  $addProjectButton.toggleClass('open', isOpen);
  var height = isOpen ? $addProjectDialog[0].scrollHeight : 0;
  $addProjectDialog.css('height', height + 'px');
});

Simulator.init();

$(window).load(function () {
  $(Simulator.toggler).prop('checked', false).on('change', Simulator.toggle);
});
