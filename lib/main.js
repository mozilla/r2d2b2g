const { Cc, Ci, Cr, Cu } = require("chrome");

// Pre-declare modules we plan to use so the module loader lets us use them
// even when we nest require calls, which it doesn't detect.
require("widget");
require("self");
require("url");

require("widget").Widget({
  id: "r2d2b2g",
  label: "r2d2b2g",
  content: "r2d2b2g",
  width: 50,
  onClick: function() {
    let b2g = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    b2g.initWithPath(require("url").toFilename(require("self").data.url("b2g/b2g.exe")));

    let profile = require("url").toFilename(require("self").data.url("profile"));
    let args = ["-profile", profile];

    let process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
    process.init(b2g);
    process.run(false, args, args.length);
  }
});
