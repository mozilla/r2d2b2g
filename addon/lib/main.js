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
      worker.on("message", function(data) {
        switch(data) {
          case "run":
            run();
            //worker.postMessage("B2G was started!");
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
    Darwin: "mac64/B2G.app/Contents/MacOS/b2g",
    Linux: "linux/b2g/b2g",
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

    stdout: function(data) {
      dump(data);
    },

    stderr: function(data) {
      dump(data);
    },

    done: function(result) {
      console.log(executables[Runtime.OS] + " terminated with " + result.exitCode);
      currentProcess = null;
    },

  });

  // On Mac, tell the application to activate, as it opens in the background
  // by default.  This can race process instantiation, in which case osascript
  // instantiates the process itself (but without supplying necessary args),
  // so we do it in a timeout, which looks like it can be zero (i.e. simply
  // spinning the event loop resolves the race condition).  However, if we start
  // to see reports of B2G Desktop opening on Mac to an unusable state, or two
  // copies of B2G Desktop opening, then we may need to increase the timeout.
  if (Runtime.OS == "Darwin") {
    // Escape double quotes and escape characters for use in AppleScript.
    let path = executable.path.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    require("timer").setTimeout(
      function() {
        Subprocess.call({
          command: "/usr/bin/osascript",
          arguments: ["-e", 'tell application "' + path + '" to activate'],
        });
      },
      0
    );
  }

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
  let name = Tabs.activeTab.title.substring(0, 18) || url.host;

  let webapp = {
    name: name,
    description: Tabs.activeTab.title,
    default_locale:"en",
    launch_path: url.path
  };
  // Possible icon? 'http://www.google.com/s2/favicons?domain=' + url.host

  File.open(webappFile, "w").writeAsync(JSON.stringify(webapp, null, 2) + "\n",
    function(error) {
      console.log(File.read(webappFile));
    }
  );

  // Update the webapps object and write it to the webapps.json file.

  let origin = url.toString().substring(0, url.lastIndexOf(url.path));

  webapps[key] = {
    origin: origin,
    installOrigin: origin,
    receipt: null,
    installTime: 132333986000,
    manifestURL: origin + "/" + "manifest.webapp",
    localId: id
  };

  File.open(webappsFile, "w").writeAsync(JSON.stringify(webapps, null, 2) + "\n",
    function(error) {
      console.log(JSON.stringify(webapps[key], null, 2));
      run(name);
    }
  );
}

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
