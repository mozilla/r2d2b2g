/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. 
 */

const { Cc, Ci, Cr, Cu } = require("chrome");

const Widget = require("widget").Widget;
const Self = require("self");
const URL = require("url");
const Runtime = require("runtime");
const Tabs = require("tabs");
const PageMod = require("page-mod").PageMod;
const UUID = require("sdk/util/uuid");
const File = require("file");
const Menuitems = require("menuitems");
const Prefs = require("preferences-service");
const Subprocess = require("subprocess");
const ContextMenu = require("context-menu");
const Request = require('request').Request;
const Notifications = require("notifications");
const SStorage = require("simple-storage");
const WindowUtils = require("window/utils");
const Gcli = require('gcli');

const { rootURI } = require('@loader/options');
const profileURL = rootURI + "profile/";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

require("addon-page");

const RemoteSimulatorClient = require("remote-simulator-client");

let simulator = {
  _worker: null,

  get apps() {
    return SStorage.storage.apps || (SStorage.storage.apps = {});
  },

  get permissions() {
    return SStorage.storage.permissions || (SStorage.storage.permissions = {});
  },

  get defaultApp() {
    return SStorage.storage.defaultApp || null;
  },

  set defaultApp(id) {
    SStorage.storage.defaultApp = id;
  },

  get jsConsoleEnabled() {
    return Prefs.get("extensions.r2d2b2g.jsconsole", false);
  },

  get worker() this._worker,

  set worker(newVal) {
    this._worker = newVal;

    if (this._worker) {
      this._worker.on("message", this.onMessage.bind(this));
      this._worker.on("detach",
                     (function(message) this._worker = null).bind(this));
    }
  },

  get contentPage() Self.data.url("content/index.html"),

  get contentScript() Self.data.url("content-script.js"),

  addAppByDirectory: function() {
    console.log("Simulator.addAppByDirectory");

    Cu.import("resource://gre/modules/Services.jsm");
    let win = Services.wm.getMostRecentWindow("navigator:browser");

    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(win, "Select a Web Application Manifest", Ci.nsIFilePicker.modeOpen);
    fp.appendFilter("Webapp Manifest", "*.webapp");
    fp.appendFilters(Ci.nsIFilePicker.filterAll);

    let ret = fp.show();
    if (ret == Ci.nsIFilePicker.returnOK || ret == Ci.nsIFilePicker.returnReplace) {
      let webappFile = fp.file.path;
      console.log("Selected " + webappFile);
      let webapp;
      try {
        webapp = JSON.parse(File.read(webappFile));
      } catch (e) {
        console.error("Error loading " + webappFile, e);
        simulator.error("Could not load " + webappFile + " (" + e.name + ")");
        return;
      }

      console.log("Loaded " + webapp.name);

      let icon = null;
      let size = Object.keys(webapp.icons).sort(function(a, b) b - a)[0] || null;
      if (size) {
        icon = webapp.icons[size];
      }

      apps = simulator.apps;
      apps[webappFile] = {
        type: "local",
        xid: null,
        xkey: null,
        name: webapp.name,
        icon: icon,
        manifest: webapp,
      }
      console.log("Stored " + JSON.stringify(apps[webappFile]));

      this.updateApp(webappFile, true);
    }
  },

  updateAll: function() {
    apps = simulator.apps;
    for (var id in apps) {
      simulator.updateApp(id);
    }
  },

  updateApp: function(id, manual) {
    console.log("Simulator.updateApp " + id);

    let webappsDir = URL.toFilename(profileURL + "webapps");
    let webappsFile = File.join(webappsDir, "webapps.json");
    let webapps = JSON.parse(File.read(webappsFile));

    let apps = simulator.apps;
    let config = apps[id];

    if (!config) {
      simulator.sendListApps();
      return;
    }

    if (!config.xid) {
      config.xid = ++[id for each ({ localId: id } in webapps)].sort(function(a, b) b - a)[0];
      config.xkey = "myapp" + config.xid + ".gaiamobile.org";

      if (!config.origin) {
        config.origin = "app://" + config.xkey;
      }
    }

    config.lastUpdate = Date.now();
    simulator.apps[id] = config;

    let webappEntry = {
      origin: config.origin,
      installOrigin: config.origin,
      receipt: null,
      installTime: Date.now(),
      appStatus: (config.type == 'local') ? 2 : 1, // 2 = PRV & INSTALLED
      localId: config.xid,
    };

    switch (config.type) {
      case 'local':
        webappEntry.manifestURL = config.origin + "/manifest.webapp";
        break;
      default:
        webappEntry.manifestURL = id;
    }
    console.log("Creating webapp entry: " + JSON.stringify(webappEntry, null, 2));

    // Create the webapp record and write it to the registry.
    webapps[config.xkey] = webappEntry;
    File.open(webappsFile, "w").writeAsync(
      JSON.stringify(webapps, null, 2) + "\n",
      function(error) {
        if (error) {
          console.error("error writing webapp record to registry: " + error);
          return
        }

        // Create target folder
        let webappDir = File.join(webappsDir, config.xkey);
        // if (File.exists(webappDir)) {
        //   File.rmdir(webappDir);
        // }
        File.mkpath(webappDir);
        console.log("Created " + webappDir);

        if (config.type == "local") {
          // Copy manifest
          let manifestFile = Cc['@mozilla.org/file/local;1'].
                          createInstance(Ci.nsIFile);
          manifestFile.initWithPath(id);
          let webappDir_nsIFile = Cc['@mozilla.org/file/local;1'].
                                   createInstance(Ci.nsIFile);
          webappDir_nsIFile.initWithPath(webappDir);
          manifestFile.copyTo(webappDir_nsIFile, "manifest.webapp");

          // Archive source folder to target folder
          let sourceDir = id.replace(/[\/\\][^\/\\]*$/, "");
          let archiveFile = File.join(webappDir, "application.zip");

          console.log("Zipping " + sourceDir + " to " + archiveFile);
          archiveDir(archiveFile, sourceDir);

          simulator.info(config.name + " (packaged app) installed in Firefox OS");

          if (manual) {
            simulator.defaultApp = id;
            simulator.run();
          }
        } else {
          // Hosted App

          let PermissionsInstaller;
          try {
            PermissionsInstaller =
              Cu.import("resource://gre/modules/PermissionsInstaller.jsm").
              PermissionsInstaller;
          } catch(e) {
            // PermissionsInstaller doesn't exist on Firefox 17 (and 18/19?),
            // so catch and ignore an exception importing it.
          }

          if (PermissionsInstaller) {
            PermissionsInstaller.installPermissions(
              {
                manifest: config.manifest,
                manifestURL: id,
                origin: config.origin
              },
              false, // isReinstall, installation failed for true
              function(e) {
                console.error("PermissionInstaller FAILED for " + config.origin);
              }
            );
          }

          let webappFile = File.join(webappDir, "manifest.webapp");
          File.open(webappFile, "w").writeAsync(JSON.stringify(config.manifest, null, 2), function(err) {
            if (err) {
              console.error("Error while writing manifest.webapp " + err);
            }
            console.log("Written manifest.webapp");
            simulator.info(config.name + " (hosted app) installed in Firefox OS");

            if (manual) {
              simulator.defaultApp = id;
              simulator.run();
            }
          });
        }

        simulator.sendListApps();
      }
    );
  },

  removeApp: function(id) {
    let apps = simulator.apps;
    let config = apps[id];

    if (!config) {
      return;
    }

    let needsDeletion = !config.removed;
    config.removed = true;
    apps[id] = config;

    simulator.sendListApps();
  },

  undoRemoveApp: function(id) {
    let apps = simulator.apps;
    let config = apps[id];

    if (!config || !config.removed) {
      return;
    }

    config.removed = false;
    apps[id] = config;

    simulator.sendListApps();
  },

  removeAppFinal: function(id) {
    let apps = simulator.apps;
    let config = apps[id];

    if (!config.removed) {
      return;
    }

    delete apps[id];

    let webappsDir = URL.toFilename(profileURL + "webapps");
    let webappsFile = File.join(webappsDir, "webapps.json");
    let webapps = JSON.parse(File.read(webappsFile));

    let permissions = simulator.permissions;
    if (permissions[config.origin]) {
      let host = config.host;
      permissions[config.origin].forEach(function(type) {
        permissionManager.remove(host, type);
      });
      delete permissions[config.origin];
    }


    // Delete the webapp record from the registry.
    delete webapps[config.xkey];
    File.open(webappsFile, "w").writeAsync(
      JSON.stringify(webapps, null, 2) + "\n",
      function(error) {
        if (error) {
          console.error("Error writing webapp record to registry: " + error);
          return;
        }

        // Delete target folder if it exists
        let webappDir = File.join(webappsDir, config.xkey);
        let webappDir_nsIFile = Cc['@mozilla.org/file/local;1'].
                                 createInstance(Ci.nsIFile);
        webappDir_nsIFile.initWithPath(webappDir);
        if (webappDir_nsIFile.exists() && webappDir_nsIFile.isDirectory()) {
          webappDir_nsIFile.remove(true);
        }
      }
    );
  },

  flushRemovedApps: function() {
    apps = simulator.apps;
    for (var id in apps) {
      if (apps[id].removed) {
        this.removeAppFinal(id);
      }
    }
  },

  /**
   * Installs the web page in the active tab as if it was an app.
   */
  addActiveTab: function() {
    console.log("Simulator.addActiveTab");
    this.addAppByTabUrl(Tabs.activeTab.url);
  },

  /**
   * Installs the web page in the active tab as if it was an app.
   */
  addAppByTabUrl: function(tabUrl, force) {
    console.log("Simulator.addAppByTabUrl " + tabUrl);
    let url = URL.URL(tabUrl);
    let found = false;
    let tab = null;
    let title = null;
    for each (tab in Tabs) {
      if (tab.url == tabUrl) {
        found = true;
        break;
      }
    }
    if (!found) {
      console.error("Could not find tab");
      title = url.host;
      if (!force) {
        this.validateUrl(tabUrl, function(err) {
          if (err) {
            simulator.addAppByTabUrl(tabUrl, true);
          } else {
            simulator.addManifestUrl(tabUrl);
          }
        });
        return;
      }
    } else {
      title = tab.title || url.host;
    }
    let origin = url.toString().substring(0, url.lastIndexOf(url.path));

    let manifestUrl = URL.URL(origin + "/" + "manifest.webapp");
    let webapp = {
      name: title.substring(0, 18),
      description: title,
      default_locale: "en",
      launch_path: url.path || '/',
    };
    console.log("Generated manifest " + JSON.stringify(webapp, null, 2));
    // Possible icon? 'http://www.google.com/s2/favicons?domain=' + url.host
    this.addManifest(manifestUrl, webapp, origin, true);
  },

  addManifestUrl: function(manifestUrl) {
    console.log("Simulator.addManifestUrl " + manifestUrl);

    Request({
      url: manifestUrl.toString(),
      onComplete: function (response) {
        if (response.status != 200) {
          simulator.error("Unexpected status code " + response.status);
          return
        }
        if (!response.json) {
          simulator.error("Expected JSON response.");
          return;
        }
        if (!response.json.name || !response.json.description) {
          simulator.error("Missing mandatory property (name or description)");
          return;
        }

        let contentType = response.headers["Content-Type"];
        if (contentType !== "application/x-web-app-manifest+json") {
          console.warn("Unexpected Content-Type: " + contentType + ".");
        }

        console.log("Fetched manifest " + JSON.stringify(response.json, null, 2));

        simulator.addManifest(manifestUrl, response.json);
      }
    }).get();
  },

  validateUrl: function(url, cb) {
    console.log("Simulator.validateUrl " + url);

    Request({
      url: url,
      onComplete: function (response) {
        var err = null;
        if (response.status != 200) {
          err = "Unexpected status code " + response.status;
        } else if (!response.json) {
          err = "Expected JSON response";
        } else {
          let contentType = response.headers["Content-Type"];
          if (contentType !== "application/x-web-app-manifest+json") {
            console.warn("Unexpected Content-Type " + contentType);
          }
        }

        if (err) {
          console.error(err);
        }
        if (cb) {
          cb(err);
        } else {
          simulator.worker.postMessage({
            name: "validateUrl",
            err: err,
          });
        }
      }
    }).get();
  },

  addManifest: function(manifestUrl, webapp, installOrigin, generated) {
    console.log("Simulator.addManifest " + manifestUrl);
    manifestUrl = URL.URL(manifestUrl.toString());
    let origin = manifestUrl.toString().substring(0, manifestUrl.toString().lastIndexOf(manifestUrl.path));
    if (!installOrigin) {
      installOrigin = origin;
    }

    let icon = null;
    // if (webapp.icons)
    //   let size = Object.keys(webapp.icons).sort(function(a, b) b - a)[0] || null;
    //   if (size) {
    //     icon = webapp.icons[size];
    //   }
    // }

    let id = generated ? (origin + webapp.launch_path) : manifestUrl.toString();

    apps = simulator.apps;
    apps[id] = {
      type: (generated) ? "generated" : "hosted",
      xid: null,
      xkey: null,
      name: webapp.name,
      icon: icon,
      manifest: webapp,
      origin: origin,
      host: manifestUrl.host,
      installOrigin: installOrigin,
    }
    console.log("Stored " + JSON.stringify(apps[id], null, 2));

    this.updateApp(id, true);
  },

  sendListApps: function() {
    console.log("Simulator.sendListApps");
    this.worker.postMessage({
      name: "listApps",
      list: simulator.apps,
      defaultApp: simulator.defaultApp
    });
  },

  sendListTabs: function() {
    var tabs = {};
    for each (var tab in Tabs) {
      if (!tab.url || !(/^https?:/).test(tab.url)) {
        continue;
      }
      tabs[tab.url] = tab.title;
    }
    this.worker.postMessage({
      name: "listTabs",
      list: tabs
    });
  },

  openTab: function(url, lax) {
    for each (var tab in Tabs) {
      if (tab.url === url || (lax && tab.url.indexOf(url) === 0)) {
        tab.activate();
        return;
      }
    }

    Tabs.open({
      url: url
    });
  },

  openHelperTab: function() {
    this.openTab(simulator.contentPage, true);
  },

  kill: function(onKilled) {
    // WORKAROUND: currently add and update an app will be executed
    // as a simulator.kill callback
    if (this.remoteSimulator.isRunning) {
      this.remoteSimulator.kill(onKilled);
    } else if (typeof onKilled === "function") {
      onKilled();
    }
  },

  revealApp: function(id) {
    let config = this.apps[id];
    if (!config) {
      return;
    }
    switch (config.type) {
      case "local":
        let manifestFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        manifestFile.initWithPath(id);
        try {
          manifestFile.reveal();
        } catch (e) {
          this.error("Could not open " + id);
        }
        break;
      case "generated":
        this.openTab(id);
        break;
      case "hosted":
        this.openTab(id);
        break;
    }
  },

  getPreference: function() {
    this.worker.postMessage({
      name: "setPreference",
      key: "jsconsole",
      value: simulator.jsConsoleEnabled
    });
  },

  run: function () {
    let appName = null;
    if (this.defaultApp) {
      appName = this.apps[this.defaultApp].name
      this.defaultApp = null;
    }

    this.remoteSimulator.run({
      defaultApp: appName
    });
  },

  get isRunning() {
    return this.remoteSimulator.isRunning;
  },
  
  get remoteSimulator() {
    if (this._remoteSimulator)
      return this._remoteSimulator;

    let simulator = this;
    let remoteSimulator = new RemoteSimulatorClient({
      onStdout: function (data) dump(data),
      onStderr: function (data) dump(data),
      onReady: function () {
        if (simulator.worker) {
          simulator.worker.postMessage({
            name: "isRunning",
            isRunning: true
          });
        }

        if (Runtime.OS == "Darwin") {
          // Escape double quotes and escape characters for use in AppleScript.
          let path = remoteSimulator.b2gExecutable.path
            .replace(/\\/g, "\\\\").replace(/\"/g, '\\"');

          Subprocess.call({
            command: "/usr/bin/osascript",
            arguments: ["-e", 'tell application "' + path + '" to activate'],
          });
        }
      },
      onExit: function () {
        if (simulator.worker) {
          simulator.worker.postMessage({
            name: "isRunning",
            isRunning: false
          });
        }
      }
    });
    
    this._remoteSimulator = remoteSimulator;
    return remoteSimulator;
  },

  onMessage: function onMessage(message) {
    console.log("Simulator.onMessage " + message.name);
    switch (message.name) {
      case "getIsRunning":
        this.worker.postMessage({ name: "isRunning",
                                  isRunning: this.isRunning });
        break;
      case "addAppByDirectory":
        this.kill(function() {
          simulator.addAppByDirectory();
        });
        break;
      case "addAppByTab":
        this.kill(function() {
          simulator.addAppByTabUrl(message.url);
        });
        break;
      case "listApps":
        if (message.flush) {
          this.flushRemovedApps();
        }
        this.sendListApps();
        break;
      case "updateApp":
        this.kill(function() {
          simulator.updateApp(message.id, true);
        });
        break;
      case "runApp":
        let appName = this.apps[message.id].name;

        let cmd = function () {
          this.remoteSimulator.runApp(appName, function (response) {
            console.log("RUNAPP RESPONSE: "+JSON.stringify(response));
            // TODO: send feedback to manager tab
          });
        };
        cmd = cmd.bind(this);

        // NOTE: if a b2g instance is already running send request
        //       or start a new instance and send request on ready
        if (this.isRunning) {
          cmd();
        } else {
          this.remoteSimulator.once("ready", function() cmd());
          this.run();
        }
        break;
      case "removeApp":
        this.removeApp(message.id);
        break;
      case "revealApp":
        this.revealApp(message.id);
        break;
      case "undoRemoveApp":
        this.undoRemoveApp(message.id);
        break;
      case "setDefaultApp":
        if (!message.id || message.id in apps) {
          simulator.defaultApp = message.id;
          this.sendListApps();
        }
        break;
      case "setPreference":
        console.log(message.key + ": " + message.value);
        Prefs.set("extensions.r2d2b2g." + message.key, message.value);
      case "getPreference":
        simulator.getPreference();
        break;
      case "toggle":
        if (this.isRunning) {
          this.kill();
        } else {
          simulator.run();
        }
        break;
      case "listTabs":
        simulator.sendListTabs();
        break;
      case "validateUrl":
        simulator.validateUrl(message.url);
        break;
      /*
      case "create":
        create();
        break;
      */
    }
  },

  info: function(msg) {
    // let window = WindowUtils.getMostRecentBrowserWindow();
    // let nb = window.gBrowser.getNotificationBox();
    // nb.appendNotification(
    //   msg,
    //   "simulator-info",
    //   null,
    //   nb.PRIORITY_INFO_MEDIUM,
    //   null
    // );
  },

  error: function(msg) {
    let window = WindowUtils.getMostRecentBrowserWindow();
    let nb = window.gBrowser.getNotificationBox();
    nb.appendNotification(
      msg,
      "simulator-error",
      null,
      nb.PRIORITY_WARNING_MEDIUM,
      null
    );
  }

};

PageMod({
  include: simulator.contentPage,
  contentScriptFile: simulator.contentScript,
  contentScriptWhen: 'start',
  onAttach: function(worker) {
    // TODO: Only allow 1 manager page
    simulator.worker = worker;
  },
});

//Widget({
//  id: "r2d2b2g",
//  label: "r2d2b2g",
//  content: "r2d2b2g",
//  width: 50,
//  onClick: function() {
//    Tabs.open({
//      url: Self.data.url("content/index.html"),
//      onReady: function(tab) {
//        let worker = tab.attach({
//          contentScriptFile: Self.data.url("content-script.js")
//        });
//        worker.on("message", function(data) {
//          switch(data) {
//            case "run":
//              simulator.run();
//              worker.postMessage("B2G was started!");
//              break;
//          }
//        });
//      }
//    });
//    return;
//
//  }
//});

switch (Self.loadReason) {
  case "install":
    simulator.openHelperTab();
    break;
  case "downgrade":
  case "upgrade":
    simulator.updateAll();
    break;
}

exports.onUnload = function(reason) {
  simulator.kill();
};

Tabs.on('ready', function() {
  if (simulator.worker) {
    simulator.sendListTabs();
  }
});
Tabs.on('close', function() {
  // Kill process when the last tab is gone
  if (!Tabs.length) {
    simulator.kill();
  }
  if (simulator.worker) {
    simulator.sendListTabs();
  }
});

ContextMenu.Item({
  label: "Install Manifest as Firefox OS App",
  context: ContextMenu.SelectorContext("a"),
  contentScript: 'self.on("context", function (node) {' +
                 '  return /\\.webapp$/.test(node.href);' +
                 '});' +
                'self.on("click", function (node, data) {' +
                 '  self.postMessage(node.href)' +
                 '});',
  onMessage: function (manifestUrl) {
    simulator.addManifestUrl(URL.URL(manifestUrl));
  },
});

Menuitems.Menuitem({
  id: "webdevFxOSSimulatorHelper",
  menuid: "menuWebDeveloperPopup",
  insertbefore: "devToolsEndSeparator",
  label: "Firefox OS Simulator",
  onCommand: function() {
    simulator.openHelperTab();
  },
});

Menuitems.Menuitem({
  id: "appmenu_fxossimulator",
  menuid: "appmenu_webDeveloper_popup",
  insertbefore: "appmenu_devToolsEndSeparator",
  label: "Firefox OS Simulator",
  onCommand: function() {
    simulator.openHelperTab();
  },
});

Gcli.addCommand({
  name: 'firefoxos',
  description: 'Commands to control Firefox OS Simulator',
});

Gcli.addCommand({
  name: "firefoxos manager",
  description: "Open the Firefox OS Simulator Manager",
  params: [],
  exec: function(args, context) {
    simulator.openHelperTab();
  },
});

Gcli.addCommand({
  name: "firefoxos start",
  description: "Start Firefox OS Simulator (restarts if running)",
  params: [],
  exec: function(args, context) {
    simulator.run();
  },
});

Gcli.addCommand({
  name: "firefoxos stop",
  description: "Stop Firefox OS Simulator",
  params: [],
  exec: function(args, context) {
    if (simulator.isRunning) {
      simulator.kill();
    }
  },
});

// Menuitems.Menuitem({
//   id: "launchB2G",
//   menuid: "menu_ToolsPopup",
//   insertbefore: "sanitizeSeparator",
//   label: "Launch B2G Desktop",
//   onCommand: function() {
//     simulator.run();
//   },
// });

// Menuitems.Menuitem({
//   id: "appifyPage",
//   menuid: "menu_ToolsPopup",
//   insertbefore: "sanitizeSeparator",
//   label: "Install Page in FxOS Simulator",
//   onCommand: function() {
//     simulator.addActiveTab();
//   },
// });

/*
function create() {
  let webappsDir = URL.toFilename(profileURL + "webapps");
  let webappsFile = File.join(webappsDir, "webapps.json");
  let webapps = JSON.parse(File.read(webappsFile));

  // The "local ID" of the app, which is required by the webapp registry.
  // Extract numeric local IDs, sort in reverse order, and increment the first
  // (highest) one to generate a new local ID for the app.
  let id =
    ++[id for each ({ localId: id } in webapps)].sort(function(a, b) b - a)[0];

  // The key by which the app is indexed in the webapp registry.
  // It's unclear what the key should be, but it needs to be a valid directory
  // name.  Gaia uses the names of the directories from which its apps are
  // provisioned, and we could use origins, but that isn't forward-compatible
  // with multiple apps per origin.  And DOMApplicationRegistry uses UUIDs,
  // so we do too.
  //let key = url.scheme + ";" + url.host + (url.port ? ";" + url.port : "");
  //let key = UUID.uuid();
  let key = "myapp" + id + ".gaiamobile.org";

  let origin = "app://myapp" + id + ".gaiamobile.org";

  // Create the webapp record and write it to the registry.
  webapps[key] = {
    origin: origin,
    installOrigin: origin,
    receipt: null,
    installTime: 132333986000,
    manifestURL: origin + "/manifest.webapp",
    appStatus: 2,
    localId: id,
  };
  File.open(webappsFile, "w").writeAsync(
    JSON.stringify(webapps, null, 2) + "\n",
    function(error) {
      if (error) {
        console.error("error writing webapp record to registry: " + error);
      }

      let templateDir = Cc['@mozilla.org/file/local;1'].
                        createInstance(Ci.nsIFile);
      templateDir.initWithPath(URL.toFilename(Self.data.url("template")));

      // We have to get an nsIFile reference to the webapps dir because the File
      // reference doesn't have a copy function.
      let webappsDir_nsIFile = Cc['@mozilla.org/file/local;1'].
                               createInstance(Ci.nsIFile);
      webappsDir_nsIFile.initWithPath(webappsDir);

      templateDir.copyTo(webappsDir_nsIFile, key);

      let webappDir = File.join(webappsDir, key);
      let manifestFile = File.join(webappDir, "manifest.webapp");
      let manifest = {
        name: "My App " + id,
        description: "my app",
        launch_path: "/index.html",
        developer: {
          name: "App Developer",
          url: "http://example.com/"
        },
        permissions: [
        ],
        locales: {
          "en-US": {
            name: "My App " + id,
            description: "my app"
          },
        },
        default_locale: "en-US",
        icons: {
          "128": "/style/icons/Blank.png"
        }
      };

      File.open(manifestFile, "w").writeAsync(
        JSON.stringify(manifest, null, 2) + "\n",
        function(error) {
          if (error) {
            console.error("error writing manifest: " + error);
          }
          archiveDir(File.join(webappDir, "application.zip"), webappDir);
          console.log("app created");
          //run("My App " + id);
        }
      );
    }
  );

}
*/

const PR_RDWR = 0x04;
const PR_CREATE_FILE = 0x08;
const PR_TRUNCATE = 0x20;
const PR_USEC_PER_MSEC = 1000;

function addDirToArchive(writer, dir, basePath) {
  let files = dir.directoryEntries;

  while (files.hasMoreElements()) {
    let file = files.getNext().QueryInterface(Ci.nsIFile);

    if (file.isHidden() ||
        file.isSymlink() ||
        file.isSpecial() ||
        file.equals(writer.file))
    {
      continue;
    }

    if (file.isDirectory()) {
      writer.addEntryDirectory(basePath + file.leafName + "/",
                               file.lastModifiedTime * PR_USEC_PER_MSEC,
                               false);
      addDirToArchive(writer, file, basePath + file.leafName + "/");
    } else {
      writer.addEntryFile(basePath + file.leafName,
                          Ci.nsIZipWriter.COMPRESSION_DEFAULT,
                          file,
                          false);
    }
  }
};

function archiveDir(zipFile, dirToArchive) {
  let writer = Cc["@mozilla.org/zipwriter;1"].createInstance(Ci.nsIZipWriter);
  let file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
  file.initWithPath(zipFile);
  writer.open(file, PR_RDWR | PR_CREATE_FILE | PR_TRUNCATE);

  let dir = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
  dir.initWithPath(dirToArchive);

  addDirToArchive(writer, dir, "");

  writer.close();

  console.log("archived dir " + dirToArchive);
}

let PermissionSettings;
try {
  PermissionSettings =
    Cu.import("resource://gre/modules/PermissionSettings.jsm").
    PermissionSettingsModule;
} catch(e) {
  // PermissionSettings doesn't exist on Firefox 17 (and 18/19?),
  // so catch and ignore an exception importing it.
}

if (PermissionSettings) {
  PermissionSettings.addPermissionOld = PermissionSettings.addPermission;
  PermissionSettings.getPermissionOld = PermissionSettings.getPermission;

  XPCOMUtils.defineLazyServiceGetter(this,
                                     "permissionManager",
                                     "@mozilla.org/permissionmanager;1",
                                     "nsIPermissionManager");
  XPCOMUtils.defineLazyServiceGetter(this,
                                     "secMan",
                                     "@mozilla.org/scriptsecuritymanager;1",
                                     "nsIScriptSecurityManager");
  XPCOMUtils.defineLazyServiceGetter(this,
                                     "appsService",
                                     "@mozilla.org/AppsService;1",
                                     "nsIAppsService");

  PermissionSettings.addPermission = function CustomAddPermission(aData, aCallbacks) {
    console.log("PermissionSettings.addPermission " + aData.origin);

    let uri = Services.io.newURI(aData.origin, null, null);

    let action;
    switch (aData.value)
    {
      case "unknown":
        action = Ci.nsIPermissionManager.UNKNOWN_ACTION;
        break;
      case "allow":
        action = Ci.nsIPermissionManager.ALLOW_ACTION;
        break;
      case "deny":
        action = Ci.nsIPermissionManager.DENY_ACTION;
        break;
      case "prompt":
        action = Ci.nsIPermissionManager.PROMPT_ACTION;
        break;
      default:
        dump("Unsupported PermisionSettings Action: " + aData.value +"\n");
        action = Ci.nsIPermissionManager.UNKNOWN_ACTION;
    }
    console.log("PermissionSettings.addPermission add: " + aData.origin + " " + action);

    permissionManager.add(uri, aData.type, action);

    let permissions = simulator.permissions;
    if (!permissions[aData.origin]) {
      permissions[aData.origin] = [];
    }
    permissions[aData.origin].push(aData.type);
    simulator.permissions = permissions;
  };

  PermissionSettings.getPermission = function CustomGetPermission(aPermission, aManifestURL, aOrigin, aBrowserFlag) {
    console.log("getPermission: " + aPermName + ", " + aManifestURL + ", " + aOrigin);

    let uri = Services.io.newURI(aOrigin, null, null);
    let result = permissionManager.testExactPermission(uri, aPermName);

    switch (result) {
      case Ci.nsIPermissionManager.UNKNOWN_ACTION:
        return "unknown";
      case Ci.nsIPermissionManager.ALLOW_ACTION:
        return "allow";
      case Ci.nsIPermissionManager.DENY_ACTION:
        return "deny";
      case Ci.nsIPermissionManager.PROMPT_ACTION:
        return "prompt";
      default:
        dump("Unsupported PermissionSettings Action!\n");
        return "unknown";
    }
  };
}
