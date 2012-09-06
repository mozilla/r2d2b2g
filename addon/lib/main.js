const { Cc, Ci, Cr, Cu } = require("chrome");

// Pre-declare modules we plan to use so the module loader lets us use them
// even when we nest require calls, which it doesn't detect.
require("widget");
require("self");
require("url");
require("runtime");

require("widget").Widget({
  id: "r2d2b2g",
  label: "r2d2b2g",
  content: "r2d2b2g",
  width: 50,
  onClick: function() {
    let addontab = require("addon-page");
    require("tabs").open({
      url: require("self").data.url("content/index.html"),
      onReady: function(tab) {
        let worker = tab.attach({
          contentScriptFile: require("self").data.url("content-script.js")
        });
        worker.on("message", function(data) {
          switch(data) {
            case "run":
              run();
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
    WINNT: "b2g/b2g.exe",
    Darwin: "mac64/B2G.app/Contents/MacOS/b2g",
    Linux: "",
  };
  let url = require("self").data.url(executables[require("runtime").OS]);
  let path = require("url").toFilename(url);

  let b2g = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  b2g.initWithPath(path);

  let profile = require("url").toFilename(require("self").data.url("profile"));
  let args = ["-profile", profile];

  let process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
  process.init(b2g);
  process.run(false, args, args.length);
}
