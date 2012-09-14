const { Cc, Ci, Cr, Cu } = require("chrome");

let Widget = require("widget").Widget;
let Self = require("self");
let URL = require("url");
let Runtime = require("runtime");
let Tabs = require("tabs");
let UUID = require("api-utils/uuid");
let File = require("file");
let Menuitems = require("menuitems");

Widget({
  id: "r2d2b2g",
  label: "r2d2b2g",
  content: "r2d2b2g",
  width: 50,
  onClick: function() {
    let addontab = require("addon-page");
    Tabs.open({
      url: Self.data.url("content/index.html"),
      onReady: function(tab) {
        let worker = tab.attach({
          contentScriptFile: Self.data.url("content-script.js")
        });
        worker.on("message", function(data) {
          switch(data) {
            case "run":
              run();
              worker.postMessage("B2G was started!");
              break;
          }
        });
      }
    });
    return;

  }
});

function run() {
  let executables = {
    WINNT: "win32/b2g/b2g.exe",
    Darwin: "mac64/B2G.app/Contents/MacOS/b2g",
    Linux: "",
  };
  let url = Self.data.url(executables[Runtime.OS]);
  let path = URL.toFilename(url);

  let b2g = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  b2g.initWithPath(path);

  let profile = URL.toFilename(Self.data.url("profile"));
  let args = ["-profile", profile];

  let process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
  process.init(b2g);
  process.run(false, args, args.length);
}

// XXX Also add to appmenu_webDeveloper_popup (appmenu_devToolsEndSeparator).
let menuitem = Menuitems.Menuitem({
  id: "launchB2G",
  menuid: "menuWebDeveloperPopup",
  insertbefore: "devToolsEndSeparator",
  label: "Launch B2G",
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

  let webapp = {
    name: Tabs.activeTab.title.substring(0, 18),
    description: Tabs.activeTab.title,
    default_locale:"en",
    launch_path: url.path
  };

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
    }
  );
}

let menuitem = Menuitems.Menuitem({
  id: "appifyPage",
  menuid: "menuWebDeveloperPopup",
  insertbefore: "devToolsEndSeparator",
  label: "Install Page as App",
  onCommand: function() {
    installActiveTab();
  },
});
