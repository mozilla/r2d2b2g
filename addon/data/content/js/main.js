var Simulator = {
  deviceConnected: null,

  APP_TYPES: {
    "local": "Packaged App",
    "generated": "Generated App",
    "hosted": "Hosted App"
  },

  init: function() {

    this.toggler = $('#command-toggle')[0];
    $(this.toggler).on('change', this.toggle.bind(this));
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
            $(Simulator.toggler).prop('checked', message.isRunning);
            if (message.isRunning) {
              $("#open-connect-devtools").show().prop("disabled", false);
            } else {
              $("#open-connect-devtools").hide().prop("disabled", true);
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
            AppList.updateAll(message.list);
            break;
          case "updateReceiptStart":
            AppList.update(message.id, { updateReceipt: true });
            break;
          case "updateReceiptStop":
            AppList.update(message.id, { updateReceipt: false });
            break;
          case "updateSingleApp":
            AppList.update(message.id, message.app);
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
  },

  updateDeviceView: function() {
    $('body').toggleClass('device-connected', !!Simulator.deviceConnected);
  },

  toggle: function() {
    var toggler = this.toggler;
    $(toggler).prop('indeterminate', true);
    window.postMessage({
      name: "toggle",
      start: toggler.checked,
    }, "*");
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
