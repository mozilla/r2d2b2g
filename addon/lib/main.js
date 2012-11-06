const { Cc, Ci, Cr, Cu } = require("chrome");

const Widget = require("widget").Widget;
const Self = require("self");
const URL = require("url");
const Runtime = require("runtime");
const Tabs = require("tabs");
const UUID = require("api-utils/uuid");
const File = require("file");
const Menuitems = require("menuitems");
const Prefs = require("preferences-service");
const Subprocess = require("subprocess");
const ContextMenu = require("context-menu");
const Request = require('request').Request;
const Notifications = require("notifications");
const SStorage = require("simple-storage");
const WindowUtils = require("api-utils/window-utils");
const Gcli = require('gcli');

require("addon-page");

let simulator = {
  _process: null,

  get process() this._process,

  set process(newVal) {
    this._process = newVal;

    if (this.worker) {
      this.worker.postMessage({
        name: "isRunning",
        isRunning: !!this.process,
      });
    }
  },

  _worker: null,

  get apps() {
    return SStorage.storage.apps || {};
  },

  set apps(list) {
    SStorage.storage.apps = list;
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

    if (this.worker) {
      this.worker.on("message", this.onMessage.bind(this));
      this.worker.on("detach",
                     (function(message) this._worker = null).bind(this));
    }
  },

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
        manifest: webapp
      }
      console.log("Stored " + JSON.stringify(apps[webappFile]));

      simulator.apps = apps;

      this.updateApp(webappFile);
    }
  },

  updateAll: function() {
    apps = simulator.apps;
    for (var id in apps) {
      simulator.updateApp(id);
    }
  },

  updateApp: function(id) {
    console.log("Simulator.updateApp " + id);

    let webappsDir = URL.toFilename(Self.data.url("profile/webapps"));
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
      appStatus: (config.type == 'local') ? 3 : 1, // 3 = PRV & INSTALLED
      localId: config.xid
    };

    switch (config.type) {
      case 'local':
        webappEntry.manifestURL = config.origin + "/manifest.webapp";
        break;
      default:
        webappEntry.manifestURL = id;
    }
    console.log("Creating webapp entry: " + JSON.stringify(webappEntry, null, 2))

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
        } else {
          let webappFile = File.join(webappDir, "manifest.webapp");
          File.open(webappFile, "w").writeAsync(JSON.stringify(config.manifest, null, 2), function(err) {
            if (err) {
              console.error("Error while writing manifest.webapp " + err);
            }
            console.log("Written manifest.webapp");
            simulator.info(config.name + " (hosted app) installed in Firefox OS");
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
    simulator.apps = apps;

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
    simulator.apps = apps;

    simulator.sendListApps();
  },

  removeAppFinal: function(id) {
    let apps = simulator.apps;
    let config = apps[id];

    if (!config.removed) {
      return;
    }

    delete apps[id];
    simulator.apps = apps;

    let webappsDir = URL.toFilename(Self.data.url("profile/webapps"));
    let webappsFile = File.join(webappsDir, "webapps.json");
    let webapps = JSON.parse(File.read(webappsFile));

    // Delete the webapp record from the the registry.
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
    simulator.apps = apps;
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
      launch_path: url.path || '/'
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
          simulator.error("Unexpected Content-Type: " + contentType + ".");
          return;
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
            err = "Unexpected Content-Type " + contentType;
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
            err: err
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
      installOrigin: installOrigin
    }
    console.log("Stored " + JSON.stringify(apps[id], null, 2));

    simulator.apps = apps;

    this.updateApp(id);
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

  openTab: function(url, onReady, lax, append) {
    for each (var tab in Tabs) {
      if (tab.url == url || (lax && tab.url.indexOf(url) == 0)) {
        tab.activate();
        return;
      }
    }

    Tabs.open({
      url: url + (append || ''),
      onReady: function(tab) {
        if (onReady) {
          onReady(tab);
        }
      }
    });
  },

  openHelperTab: function() {
    let url = Self.data.url("content/index.html");
    this.openTab(url, function(tab) {
      simulator.worker = tab.attach({
        contentScriptFile: Self.data.url("content-script.js"),
      });
    }, true, "#welcome");
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

  onMessage: function onMessage(message) {
    console.log("Simulator.onMessage " + message.name);
    switch (message.name) {
      case "getIsRunning":
        this.worker.postMessage({ name: "isRunning",
                                  isRunning: !!this.process });
        break;
      case "addAppByDirectory":
        this.addAppByDirectory();
        break;
      case "addAppByTab":
        this.addAppByTabUrl(message.url);
        break;
      case "listApps":
        if (message.flush) {
          this.flushRemovedApps();
        }
        this.sendListApps();
        break;
      case "updateApp":
        this.updateApp(message.id);
        break;
      case "removeApp":
        this.removeApp(message.id);
        break;
      case "revealApp":
        this.revealApp(message.id);
        break;
      case "removeApp":
        this.removeApp(message.id);
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
        if (this.process) {
          this.process.kill();
        }
        else {
          run();
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
    // let window = WindowUtils.activeBrowserWindow;
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
    let window = WindowUtils.activeBrowserWindow;
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

//Widget({
//  id: "r2d2b2g",
//  label: "r2d2b2g",
//  content: "r2d2b2g",
//  width: 50,
//  onClick: function() {
//    let addontab = require("addon-page");
//    Tabs.open({
//      url: Self.data.url("content/index.html"),
//      onReady: function(tab) {
//        let worker = tab.attach({
//          contentScriptFile: Self.data.url("content-script.js")
//        });
//        worker.on("message", function(data) {
//          switch(data) {
//            case "run":
//              run();
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
  case "startup":
    simulator.openHelperTab();
    break;
  case "downgrade":
  case "upgrade":
    simulator.updateAll();
    break;
}

Tabs.on('ready', function() {
  if (simulator.worker) {
    simulator.sendListTabs();
  }
});
Tabs.on('close', function() {
  if (simulator.worker) {
    simulator.sendListTabs();
  }
});

function run() {
  let executables = {
    WINNT: "win32/b2g/b2g-bin.exe",
    Darwin: "mac64/B2G.app/Contents/MacOS/b2g-bin",
    Linux: "linux/b2g/b2g-bin",
  };
  let url = Self.data.url(executables[Runtime.OS]);
  let path = URL.toFilename(url);

  let executable = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  executable.initWithPath(path);

  let args = [];

  let profile = URL.toFilename(Self.data.url("profile"));
  args.push("-profile", profile);

  if (simulator.jsConsoleEnabled) {
    args.push("-jsconsole");
  }

  if (simulator.defaultApp != null) {
    args.push("--runapp", simulator.apps[simulator.defaultApp].name);
  }

  if (simulator.process != null) {
    simulator.process.kill();
  }

  simulator.process = Subprocess.call({
    command: executable,
    arguments: args,

    // Whether or not the app has been activated.  Mac-specific, and custom
    // to our implementation (not used by subprocess).  See below for usage.
    activated: false,

    stdout: function(data) {
      dump(data);

      // On Mac, tell the application to activate, as it opens in the background
      // by default.  This can race process instantiation, in which case
      // osascript will instantiate a duplicate process (but without supplying
      // necessary args, so the process will be hung).  Thus we wait until
      // the first output to do it.
      if (Runtime.OS == "Darwin" && !this.activated) {
        // Escape double quotes and escape characters for use in AppleScript.
        let path = executable.path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

        Subprocess.call({
          command: "/usr/bin/osascript",
          arguments: ["-e", 'tell application "' + path + '" to activate'],
        });

        this.activated = true;

      }

    },

    stderr: function(data) {
      dump(data);
    },

    done: function(result) {
      console.log(executables[Runtime.OS] + " terminated with " + result.exitCode);
      simulator.process = null;
    },

  });

}

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
  }
});

Menuitems.Menuitem({
  id: "webdevFxOSSimulatorHelper",
  menuid: "menuWebDeveloperPopup",
  insertbefore: "devToolsEndSeparator",
  label: "Firefox OS Simulator",
  onCommand: function() {
    simulator.openHelperTab();
  }
});

Menuitems.Menuitem({
  id: "appmenu_fxossimulator",
  menuid: "appmenu_webDeveloper_popup",
  insertbefore: "appmenu_devToolsEndSeparator",
  label: "Firefox OS Simulator",
  onCommand: function() {
    simulator.openHelperTab();
  }
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
  }
});

Gcli.addCommand({
  name: "firefoxos start",
  description: "Start Firefox OS Simulator (restarts if running)",
  params: [],
  exec: function(args, context) {
    run();
  }
});

Gcli.addCommand({
  name: "firefoxos stop",
  description: "Stop Firefox OS Simulator",
  params: [],
  exec: function(args, context) {
    if (simulator.process) {
      simulator.process.kill();
    }
  }
});

// Menuitems.Menuitem({
//   id: "launchB2G",
//   menuid: "menu_ToolsPopup",
//   insertbefore: "sanitizeSeparator",
//   label: "Launch B2G Desktop",
//   onCommand: function() {
//     run();
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
  let webappsDir = URL.toFilename(Self.data.url("profile/webapps"));
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
    appStatus: 3,
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
