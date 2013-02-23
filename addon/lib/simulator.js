/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const { Cc, Ci, Cr, Cu } = require("chrome");

const Self = require("self");
const URL = require("url");
const Tabs = require("tabs");
const UUID = require("sdk/util/uuid");
const File = require("file");
const Prefs = require("preferences-service");
const Request = require('request').Request;
const SStorage = require("simple-storage");
const WindowUtils = require("window/utils");
const Timer = require("timer");
const RemoteSimulatorClient = require("remote-simulator-client");
const xulapp = require("sdk/system/xul-app");
const ADB = require("adb");
const Promise = require("sdk/core/promise");

// The b2gremote debugger module that installs apps to devices.
const Debugger = require("debugger");

// The b2gremote debugger port.
const DEBUGGER_PORT = 6000;

const { rootURI: ROOT_URI } = require('@loader/options');
const PROFILE_URL = ROOT_URI + "profile/";

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyServiceGetter(this,
                                   "permissionManager",
                                   "@mozilla.org/permissionmanager;1",
                                   "nsIPermissionManager");

// NOTE: detect if developer toolbox feature can be enabled
const HAS_CONNECT_DEVTOOLS = xulapp.is("Firefox") &&
  xulapp.versionInRange(xulapp.platformVersion, "20.0a1", "*");

console.debug("XULAPP: ", xulapp.name,xulapp.version, xulapp.platformVersion);
console.debug("HAS_CONNECT_DEVTOOLS: ", HAS_CONNECT_DEVTOOLS);

const PR_RDWR = 0x04;
const PR_CREATE_FILE = 0x08;
const PR_TRUNCATE = 0x20;
const PR_USEC_PER_MSEC = 1000;

let worker, remoteSimulator;
let adbReady, debuggerReady;

let simulator = module.exports = {
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

  get worker() worker,

  set worker(newVal) {
    worker = newVal;

    if (worker) {
      worker.on("message", this.onMessage.bind(this));
      worker.on("detach", (function(message) worker = null).bind(this));
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

      let apps = simulator.apps;
      apps[webappFile] = {
        type: "local",
        xid: null,
        xkey: null,
        name: webapp.name,
        icon: icon,
        manifest: webapp,
      }
      console.log("Stored " + JSON.stringify(apps[webappFile]));

      this.updateApp(webappFile, function next(error, app) {
        // app reinstall completed
        // success/error detection and report to the user
        if (error) {
          simulator.error(error);
        } else {
          simulator.sendListApps();
          simulator.runApp(app);
        }
      });
    }
  },

  updateAll: function(oncompleted) {
    simulator.showRemoteNotification("Reinstalling registered apps...");
    this.run(function () {
      function next(error, app) {
        // Call iterator.next() in a timeout to ensure updateApp() has returned;
        // otherwise we might raise "TypeError: already executing generator".
        if (error) {
          simulator.error(error);
        }
        Timer.setTimeout(function() {
          try {
            iterator.next();
          } catch (err if err instanceof StopIteration) {
            simulator.showRemoteNotification("Reinstalling completed.");
            if (typeof oncompleted === "function") {
              oncompleted();
            }
          }
        }, 0);
      }
      // only active apps needs to be reinstalled
      let activeAppIds = Object.keys(simulator.apps)
        .filter(function (appId) !simulator.apps[appId].deleted);
      let iterator = (simulator.updateApp(activeAppIds[i], next) for (i in activeAppIds));
      next();
    });
  },

  showRemoteNotification: function(userMessage) {
    this.run(function () {
      simulator.remoteSimulator.showNotification(userMessage);
    });
  },

  get tempDir() {
    let basePath = Services.dirsvc.get("TmpD", Ci.nsIFile).path;
    return File.join(basePath, "b2g");
  },

  updateApp: function(id, next) {
    console.log("Simulator.updateApp " + id);

    let webappsDir = URL.toFilename(PROFILE_URL + "webapps");
    let tempDir = this.tempDir;
    let webappsFile = File.join(webappsDir, "webapps.json");
    let webapps = JSON.parse(File.read(webappsFile));

    let apps = simulator.apps;
    let config = apps[id];

    if (!config) {
      if (this.worker) {
        this.sendListApps();
      }
      if (next) {
        next();
      }
      return;
    }

    if (!config.xid) {
      config.xid = ++[id for each ({ localId: id } in webapps)].sort(function(a, b) b - a)[0];

      // NOTE: we can't currently use localId as code because webappsActor
      // if the emulator doesn't exit clean DOMApplicationRegistry._nextLocalId
      // will not be able to serialize "dom.mozApps.maxLocalId" and will be the
      // same for new app installed
      config.xkey = UUID.uuid().toString(); //"myapp" + config.xid + ".gaiamobile.org";

      if (!config.origin) {
        config.origin = "app://" + config.xkey;
      }
    }

    config.lastUpdate = Date.now();
    simulator.apps[id] = config;

    switch (config.type) {
      case 'local':
        config.manifestURL = config.origin + "/manifest.webapp";
        break;
      default:
        config.manifestURL = id;
    }
    console.log("Updating webapp entry: " + JSON.stringify(config, null, 2));

    // Create the webapp record and write it to the registry.
    // NOTE: we don't need this anymore
    webapps[config.xkey] = config;

    // Create target folder
    let tempWebappDir = File.join(tempDir, config.xkey);
    // if (File.exists(webappDir)) {
    //   File.rmdir(webappDir);
    // }
    File.mkpath(tempWebappDir);
    console.log("Created " + tempWebappDir);

    if (config.type == "local") {
      // Copy manifest
      let manifestFile = Cc['@mozilla.org/file/local;1'].
        createInstance(Ci.nsIFile);
      manifestFile.initWithPath(id);
      let tempWebappDir_nsIFile = Cc['@mozilla.org/file/local;1'].
        createInstance(Ci.nsIFile);
      tempWebappDir_nsIFile.initWithPath(tempWebappDir);
      manifestFile.copyTo(tempWebappDir_nsIFile, "manifest.webapp");

      // Archive source folder to target folder
      let sourceDir = id.replace(/[\/\\][^\/\\]*$/, "");
      let archiveFile = File.join(tempWebappDir, "application.zip");

      console.log("Zipping " + sourceDir + " to " + archiveFile);
      archiveDir(archiveFile, sourceDir, function(error) {
        if (error) {
          if (next) {
            next(error);
          }
        } else {
          simulator.info(config.name +
                         " (packaged app) installed in Firefox OS");
          // Complete install (Packaged)

          // NOTE: remote simulator.defaultApp because on the first run the app
          //       will be not already installed
          simulator.defaultApp = null;
          console.log("Requesting webappsActor to install packaged app: ",
                      config.xkey);
          simulator.run(function() {
            simulator.remoteSimulator.install(config.xkey, null, function(res) {
              console.debug("webappsActor install packaged app reply: ",
                            JSON.stringify(res));
              if (next) {
                // detect success/error and report to the "next" callback
                if (res.error) {
                  next(res.error + ": " + res.message, config);
                } else {
                  next(null, config);
                }
              }
            });
          });
        }
      });
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

      let webappFile = File.join(tempWebappDir, "manifest.webapp");
      File.open(webappFile, "w").
        writeAsync(JSON.stringify(config.manifest, null, 2), function(err) {
          if (err) {
            console.error("Error while writing manifest.webapp " + err);
          }
          console.log("Written manifest.webapp");

          let metadataFile = File.join(tempWebappDir, "metadata.json");
          let metadata = {
            origin: config.origin,
            manifestURL: id,
          };

          console.log("metadata.json", JSON.stringify(metadata));

          File.open(metadataFile, "w").
            writeAsync(JSON.stringify(metadata, null, 2), function(err) {
              simulator.info(config.name + " (hosted app) installed in Firefox OS");

              // Complete install (Hosted)
              // DISABLED: because on the first run the app will be not already installed
              simulator.defaultApp = null;
              simulator.run(function() {
                console.log("Requesting webappsActor to install hosted app: ",config.xkey);
                simulator.remoteSimulator.install(config.xkey, null, function(res) {
                  console.debug("webappsActor install hosted app reply: ",
                                JSON.stringify(res));
                  if (next) {
                    // detect success/error and report to the "next" callback
                    if (res.error) {
                      next(res.error + ": "+res.message, config);
                    } else {
                      next(null, config);
                    }
                  }
                });
              });
            }); // END writeAsync metadataFile
        }); // END writeAsync manifest.webapp
    }

    if (this.worker) {
      this.sendListApps();
    }
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

    simulator.run(function() {
      simulator.remoteSimulator.uninstall(config.xkey, function() {
        // app uninstall completed
        // TODO: add success/error detection and report to the user
        simulator.sendListApps();
      });
    });
  },

  undoRemoveApp: function(id) {
    let apps = simulator.apps;
    let config = apps[id];

    if (!config || !config.removed) {
      return;
    }

    config.removed = false;
    apps[id] = config;

    simulator.updateApp(id, function next(error, app) {
      // app reinstall completed
      // success/error detection and report to the user
      if (error) {
        simulator.error(error);
      } else {
        simulator.sendListApps();
        simulator.runApp(app);
      }
    });
  },

  removeAppFinal: function(id) {
    let apps = simulator.apps;
    let config = apps[id];

    if (!config.removed) {
      return;
    }

    // remove from the registered app list
    delete apps[id];

    // cleanup registered permissions
    let permissions = simulator.permissions;
    if (permissions[config.origin]) {
      let host = config.host;
      permissions[config.origin].forEach(function(type) {
        permissionManager.remove(host, type);
      });
      delete permissions[config.origin];
    }
  },

  flushRemovedApps: function() {
    let apps = simulator.apps;
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

    let apps = simulator.apps;
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

    this.updateApp(id, function next(error, app) {
      // success/error detection and report to the user
      if (error) {
        simulator.error(error);
      } else {
        simulator.sendListApps();
        simulator.runApp(app);
      }
    });
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

  openConnectDevtools: function() {
    let port = this.remoteSimulator.remoteDebuggerPort;
    Tabs.open({
      url: "chrome://browser/content/devtools/connect.xhtml",
      onReady: function(tab) {
        // NOTE: inject the allocated remoteDebuggerPort on the opened tab
        tab.attach({
          contentScript: "window.addEventListener('load', function() { document.getElementById('port').value = '"+port+"'; }, true);"
        });
      }
    });
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

  run: function (cb) {
    let appName = null;
    if (this.defaultApp) {
      appName = this.apps[this.defaultApp].name
      this.defaultApp = null;
    }

    let next = null;
    // if needsUpdateAll try to reinstall all active registered app
    if (SStorage.storage.needsUpdateAll) {
      SStorage.storage.needsUpdateAll = false;
      next = (typeof cb === "function") ? 
        (function() simulator.updateAll(cb)) : 
        (function() simulator.updateAll());
    } else {
      next = (typeof cb === "function") ? cb : (function() {});
    }

    // NOTE: if a b2g instance is already running send request
    //       or start a new instance and send request on ready
    if (this.isRunning) {
      next();
    } else {
      this.remoteSimulator.once("ready", next);

      this.remoteSimulator.run({
        defaultApp: appName
      });
    }
  },

  runApp: function(app, next) {
    this.run(function () {
      simulator.remoteSimulator.runApp(app.xkey, next);
    });
  },

  get isRunning() {
    return this.remoteSimulator.isRunning;
  },

  postIsRunning: function() {
    if (simulator.worker) {
      let port = simulator.isRunning ?
        simulator.remoteSimulator.remoteDebuggerPort :
        null;

      simulator.worker.postMessage({
        name: "isRunning",
        isRunning: simulator.isRunning,
        remoteDebuggerPort: port,
        hasConnectDevtools: HAS_CONNECT_DEVTOOLS,
      });
    }
  },

  get remoteSimulator() {
    if (remoteSimulator)
      return remoteSimulator;

    let simulator = this;
    remoteSimulator = new RemoteSimulatorClient({
      onStdout: function (data) dump(data),
      onStderr: function (data) dump(data),
      onReady: function () {
        simulator.postIsRunning();
      },
      onExit: function () {
        simulator.postIsRunning();
      }
    });

    return remoteSimulator;
  },

  observe: function(subject, topic, data) {
    console.log("simulator.observe: " + topic);
    switch (topic) {
      case "adb-ready":
        ADB.trackDevices();
        break;
      case "adb-device-connected":
        if (this.worker) {
          this.worker.postMessage({ name: topic });
        }
        break;
      case "adb-device-disconnected":
        adbReady = false;
        debuggerReady = false;
        if (this.worker) {
          this.worker.postMessage({ name: topic });
        }
        break;
    }
  },

  onMessage: function onMessage(message) {
    console.log("Simulator.onMessage " + message.name);
    switch (message.name) {
      case "openConnectDevtools":
        simulator.openConnectDevtools();
        break;
      case "getIsRunning":
        simulator.postIsRunning();
        break;
      case "addAppByDirectory":
        simulator.addAppByDirectory();
        break;
      case "addAppByTab":
        simulator.addAppByTabUrl(message.url);
        break;
      case "listApps":
        if (message.flush) {
          this.flushRemovedApps();
        }
        this.sendListApps();
        break;
      case "updateApp":
        simulator.updateApp(message.id, function next(error, app) {
          // success/error detection and report to the user
          if (error) {
            simulator.error(error);
          } else {
            simulator.sendListApps();
            simulator.runApp(app);
          }
        });
        break;
      case "runApp":
        let app = this.apps[message.id];
        simulator.runApp(app, function (res) {
          if (res.success === false) {
            if (res.error === 'app-not-installed') {
              // install and run if not installed
              simulator.onMessage({
                name: "updateApp",
                id: message.id
              });
            } else {
              // print error message
              simulator.error("Run app failed: "+res.message);
            }
          }
        });
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
      case "pushAppToDevice":
        simulator.pushAppToDevice(message.id);
        break;
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
  },

  pushAppToDevice: function pushAppToDevice(id) {
    console.log("Simulator.pushAppToDevice: " + id);

    this.connectToDevice().then(
      function success() {
        let app = simulator.apps[id];

        if (app.type == "local") {
          simulator.pushPackagedAppToDevice(id, app);
        } else {
          simulator.pushHostedAppToDevice(id, app);
        }
      },
      function failure(error) {
        console.error("pushAppToDevice error: " + error);
      }
    );

  },

  connectToDevice: function() {
    let deferred = Promise.defer();

    this.connectADBToDevice().
    then(this.connectDebuggerToDevice.bind(this)).
    then(
        function success(data) {
          console.log("connectToDevice success: " + data);
          deferred.resolve();
        },
        function failure(error) {
          console.error("connectToDevice error: " + error);
          deferred.reject();
        }
    );

    return deferred.promise;
  },

  connectADBToDevice: function() {
    let deferred = Promise.defer();

    if (adbReady) {
      Timer.setTimeout(function() deferred.resolve(), 0);
    } else {
      ADB.forwardPort(DEBUGGER_PORT).then(
        function success(data) {
          console.log("ADB.forwardPort success: " + data);
          adbReady = true;
          deferred.resolve();
        }
      );
    }

    return deferred.promise;
  },

  connectDebuggerToDevice: function connectDebuggerToDevice() {
    let deferred = Promise.defer();

    if (debuggerReady) {
      Timer.setTimeout(function() deferred.resolve(), 0);
    } else {
      Debugger.init(DEBUGGER_PORT).then(
        function success(data) {
          console.log("Debugger.init success: " + data);
          debuggerReady = true;

          Debugger.setWebappsListener(function listener(state, type, packet) {
            if (type.error) {
              console.error("Debugger install error: " + type.message);
            } else {
              console.log("Debugger install success");
            }
          });

          deferred.resolve();
        }
      );
    }

    return deferred.promise;
  },

  pushHostedAppToDevice: function pushHostedAppToDevice(id, app) {
    this.buildHostedAppFiles(id, function(error, manifestFile, metadataFile) {
      if (error) {
        console.error("buildHostedAppFiles error: " + error);
        return;
      }

      let destDir = "/data/local/tmp/b2g/" + app.xkey + "/";

      ADB.push(manifestFile, destDir + "manifest.webapp").then(
        function success(data) {
          console.log("ADB.push manifest file success: " + data);

          ADB.push(metadataFile, destDir + "metadata.json").then(
            function success(data) {
              console.log("ADB.push metadata file success: " + data);

              Debugger.webappsRequest({
                type: "install",
                appId: app.xkey,
                appType: Ci.nsIPrincipal.APP_STATUS_INSTALLED,
              }).then(
                function success(data) {
                  console.log("Debugger.webappsRequest success: " + data);
                },
                function failure(error) console.error("Debugger.webappsRequest error: " + error)
              );

            },
            function failure(error) console.error("ADB.push metadata file error: " + error)
          );

        },
        function failure(error) console.error("ADB.push manifest file error: " + error)
      );
    });
  },

  buildHostedAppFiles: function buildHostedAppFiles(id, next) {
    let app = this.apps[id];
    let tempDir = File.join(this.tempDir, app.xkey);
    File.mkpath(tempDir);

    let manifest = JSON.stringify(app.manifest, null, 2);
    let manifestFile = File.join(tempDir, "manifest.webapp");

    console.log("manifest: " + manifest);

    File.open(manifestFile, "w").writeAsync(manifest, function(error) {
      if (error) {
        console.error("erroring writing manifest.webapp: " + error);
        next(error);
        return;
      }

      console.log("wrote " + manifestFile);

      let metadata = JSON.stringify({
        origin: app.origin,
        manifestURL: id,
      }, null, 2);
      let metadataFile = File.join(tempDir, "metadata.json");

      console.log("metadata: " + metadata);

      File.open(metadataFile, "w").writeAsync(metadata, function(error) {
        if (error) {
          console.error("erroring writing metadata.json: " + error);
          next(error);
          return;
        }

        console.log("wrote " + metadataFile);
        next(null, manifestFile, metadataFile);

      }); // END writeAsync metadataFile
    }); // END writeAsync manifest.webapp
  },

  pushPackagedAppToDevice: function pushPackagedAppToDevice(id, app) {
    this.buildPackage(id, function(error, pkg) {
      if (error) {
        console.error("buildPackage error: " + error);
        return;
      }

      let destDir = "/data/local/tmp/b2g/" + app.xkey + "/";
      ADB.push(pkg, destDir + "application.zip").then(
        function success(data) {
          console.log("ADB.push success: " + data);
          Debugger.webappsRequest({
            type: "install",
            appId: app.xkey,
            appType: Ci.nsIPrincipal.APP_STATUS_INSTALLED,
          }).then(
            function success(data) {
              console.log("Debugger.webappsRequest success: " + data);
            },
            function failure(error) console.error("Debugger.webappsRequest error: " + error)
          );
        },
        function failure(error) console.error("ADB.push error: " + error)
      );
    });
  },

  buildPackage: function(id, next) {
    console.log("buildPackage");

    let app = this.apps[id];
    let tempDir = File.join(this.tempDir, app.xkey);
    File.mkpath(tempDir);

    let sourceDir = id.replace(/[\/\\][^\/\\]*$/, "");
    let archiveFile = File.join(tempDir, "application.zip");

    console.log("archiving " + sourceDir + " to " + archiveFile);
    archiveDir(archiveFile, sourceDir, function onArchiveDir(error) {
        if (error) {
          if (next) {
            next(error);
          }
        } else {
          next(null, archiveFile);
        }
    });
  },

};

Services.obs.addObserver(simulator, "adb-device-connected", false);
Services.obs.addObserver(simulator, "adb-device-disconnected", false);
Services.obs.addObserver(simulator, "adb-ready", false);

/**
 * Convert an XPConnect result code to its name and message.
 * We have to extract them from an exception per bug 637307 comment 5.
 */
function getResultText(code) {
  let regexp =
    /^\[Exception... "(.*)"  nsresult: "0x[0-9a-fA-F]* \((.*)\)"  location: ".*"  data: .*\]$/;
  let ex = Cc["@mozilla.org/js/xpc/Exception;1"].
           createInstance(Ci.nsIXPCException);
  ex.initialize(null, code, null, null, null, null);
  let [, message, name] = regexp.exec(ex.toString());
  return { name: name, message: message };
}

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
                               true);
      addDirToArchive(writer, file, basePath + file.leafName + "/");
    } else {
      writer.addEntryFile(basePath + file.leafName,
                          Ci.nsIZipWriter.COMPRESSION_DEFAULT,
                          file,
                          true);
    }
  }
};

function archiveDir(zipFile, dirToArchive, callback) {
  let writer = Cc["@mozilla.org/zipwriter;1"].createInstance(Ci.nsIZipWriter);
  let file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
  file.initWithPath(zipFile);
  writer.open(file, PR_RDWR | PR_CREATE_FILE | PR_TRUNCATE);

  let dir = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
  dir.initWithPath(dirToArchive);

  addDirToArchive(writer, dir, "");

  writer.processQueue({
    onStartRequest: function onStartRequest(request, context) {},
    onStopRequest: function onStopRequest(request, context, status) {
      if (status == Cr.NS_OK) {
        writer.close();
        console.log("archived dir " + dirToArchive);
        callback();
      }
      else {
        let { name, message } = getResultText(status);
        callback(name + ": " + message);
      }
    }
  }, null);
}
