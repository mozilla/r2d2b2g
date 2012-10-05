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

require("addon-page");

let currentProcess = null;

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

function openHelperTab() {
  let url = Self.data.url("content/index.html");

  for each (var tab in Tabs) {
    if (tab.url == url) {
      tab.activate();
      return;
    }
  }

  Tabs.open({
    url: url,
    onReady: function(tab) {
      let worker = tab.attach({
        contentScriptFile: Self.data.url("content-script.js")
      });
      worker.on("message", function(message) {
        switch(message.name) {
          case "getIsRunning":
            worker.postMessage({ name: "isRunning",
                                 isRunning: !!currentProcess });
            break;
        }
      });
    }
  });
}

if (Self.loadReason == "install") {
  openHelperTab();
}

function run(app) {
  let executables = {
    WINNT: "win32/b2g/b2g.exe",
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

  if (Prefs.get("extensions.r2d2b2g.jsconsole", true)) {
    args.push("-jsconsole");
  }

  if (app != null) {
    args.push("--runapp", app);
  }

  if (currentProcess != null) {
    currentProcess.kill();
  }

  currentProcess = Subprocess.call({
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
      currentProcess = null;
    },

  });

}

Menuitems.Menuitem({
  id: "launchB2G",
  menuid: "menu_ToolsPopup",
  insertbefore: "sanitizeSeparator",
  label: "B2G Desktop",
  onCommand: function() {
    run();
  },
});

/**
 * Installs the web page in the active tab as if it was an app.
 */
function installActiveTab() {
  let url = URL.URL(Tabs.activeTab.url);
  let origin = url.toString().substring(0, url.lastIndexOf(url.path));

  let manifestUrl = URL.URL(origin + "/" + "manifest.webapp");
  let webapp = {
    name: Tabs.activeTab.title.substring(0, 18) || url.host,
    description: Tabs.activeTab.title,
    default_locale: "en",
    launch_path: url.path
  };
  // Possible icon? 'http://www.google.com/s2/favicons?domain=' + url.host
  installManifest(manifestUrl, webapp, origin);
}

function installManifestUrl(manifestUrl) {
  Request({
    url: manifestUrl.toString(),
    onComplete: function (response) {
      if (response.status != 200) {
        Notifications.notify({
          title: "App Install Error",
          text: "Unexpected status code " + response.status
        });
        return
      }
      if (!response.json) {
        Notifications.notify({
          title: "App Install Error",
          text: "Expected JSON response"
        });
        console.error("Expected JSON response, got " + response.text);
        return;
      }
      if (!response.json.name || !response.json.description) {
        Notifications.notify({
          title: "App Install Error",
          text: "Missing mandatory property (name or description)"
        });
        return;
      }
      let contentType = response.headers["Content-Type"];
      if (contentType !== "application/x-web-app-manifest+json") {
        console.warn("Unexpected Content-Type " + contentType + ", but not a biggie");
      }

      installManifest(manifestUrl, response.json);
    }
  }).get();
}

function installManifest(manifestUrl, webapp, installOrigin) {
  let origin = manifestUrl.toString().substring(0, manifestUrl.toString().lastIndexOf(manifestUrl.path));
  if (!installOrigin) {
    installOrigin = origin
  }

  let webappsDir = URL.toFilename(Self.data.url("profile/webapps"));
  let webappsFile = File.join(webappsDir, "webapps.json");
  let webapps = JSON.parse(File.read(webappsFile));

  // Extract numeric local IDs, sort in reverse order, and increment the first
  // (highest) one to generate a new local ID for the app.
  let id = ++[id for each ({ localId: id } in webapps)].sort(function(a, b) b - a)[0];

  // It's unclear what the key should be, but it needs to be a valid directory
  // name.  Gaia uses the names of the directories from which its apps are
  // provisioned, and we could use origins, but that isn't forward-compatible
  // with multiple apps per origin.  And DOMApplicationRegistry uses UUIDs,
  // so we do too.
  //let key = url.scheme + ";" + url.host + (url.port ? ";" + url.port : "");
  let key = UUID.uuid();

  // Write the manifest.webapp file to the key-specific subdirectory.

  let webappDir = File.join(webappsDir, key);
  File.mkpath(webappDir);
  let webappFile = File.join(webappDir, "manifest.webapp");

  File.open(webappFile, "w").writeAsync(JSON.stringify(webapp, null, 2) + "\n",
    function(error) {
      console.log(File.read(webappFile));
    }
  );

  // Update the webapps object and write it to the webapps.json file.

  webapps[key] = {
    origin: origin,
    installOrigin: installOrigin,
    receipt: null,
    installTime: 132333986000,
    manifestURL: manifestUrl.toString(),
    localId: id
  };

  File.open(webappsFile, "w").writeAsync(JSON.stringify(webapps, null, 2) + "\n",
    function(error) {
      console.log(JSON.stringify(webapps[key], null, 2));

      Notifications.notify({
        title: "Installed " + webapp.name
      });

      run(webapp.name);
    }
  );
}

ContextMenu.Item({
  label: "Install Manifest as B2G App",
  context: ContextMenu.SelectorContext("a"),
  contentScript: 'self.on("context", function (node) {' +
                 '  return /\\.webapp$/.test(node.href);' +
                 '});' +
                'self.on("click", function (node, data) {' +
                 '  self.postMessage(node.href)' +
                 '});',
  onMessage: function (manifestUrl) {
    installManifestUrl(URL.URL(manifestUrl));
  }
});

Menuitems.Menuitem({
  id: "hamB2GerHelper",
  menuid: "menu_ToolsPopup",
  insertbefore: "sanitizeSeparator",
  label: "B2G Desktop Helper",
  onCommand: function() {
    openHelperTab();
  },
});

Menuitems.Menuitem({
  id: "appifyPage",
  menuid: "menu_ToolsPopup",
  insertbefore: "sanitizeSeparator",
  label: "Install Page as App",
  onCommand: function() {
    installActiveTab();
  },
});

Menuitems.Menuitem({
  id: "createApp",
  menuid: "menu_ToolsPopup",
  insertbefore: "sanitizeSeparator",
  label: "Create App",
  onCommand: function() {
    create();
  },
});

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
          //run("My App " + id);
        }
      );
    }
  );

}

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

  console.log("archived dir");
}
