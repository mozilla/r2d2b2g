const { PageMod } = require("sdk/page-mod");
const Self = require("self");
const File = require("file");
const Request = require('./request').Request;
const simulator = require("./simulator");

const { CC, Cu, Cc, Ci } = require("chrome");
// use addon manager internal helper to extract a zip to a folder
const { extractFiles } = Cu.import("resource://gre/modules/XPIProvider.jsm");
Cu.import("resource://gre/modules/Services.jsm");
const WebBrowserPersist = CC("@mozilla.org/embedding/browser/nsWebBrowserPersist;1",
                               "nsIWebBrowserPersist");

function downloadFile(url, path, onDone) {  
  let persist = WebBrowserPersist();
  persist.persistFlags = persist.PERSIST_FLAGS_REPLACE_EXISTING_FILES;
  let uri = Services.io.newURI(url, null, null);
  let file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(path);
  persist.progressListener = {
    onStateChange: function(aProgress, aRequest, aStateFlag, aStatus) {
      if (aStateFlag & Ci.nsIWebProgressListener.STATE_STOP) {
        onDone();
      }
    }
  };
  persist.saveURI(uri, null, null, null, null, file, null);
}

PageMod({
  include: [
    "https://marketplace-dev.allizom.org/reviewers/apps/review/*",
    "https://marketplace-altdev.allizom.org/reviewers/apps/review/*",
    "https://marketplace.allizom.org/reviewers/apps/review/*",
    "https://marketplace.firefox.com/reviewers/apps/review/*"
  ],
  contentScriptFile: Self.data.url("marketplace-script.js"),
  onAttach: function (worker) {
    worker.on("message", function (data) {
      console.log("message: "+JSON.stringify(data));

      simulator.run(function(error) {
        if (error) {
          simulator.error(error);
          return;
        }
        if (data.type == "packaged") {
          // For packaged app, first download marketplace "mini" manifest
          // that contains few regular manifest properties and a `package_path`
          // attribute refering to the absolute URL for the zip package.
          Request({
            url: data.miniManifestURL,
            onComplete: function (response) {
              let miniManifest = response.json;

              let packageURL = miniManifest.package_path;

              // Now, download the zip
              let tmpDir = Services.dirsvc.get("TmpD", Ci.nsIFile).path;
              let id = Math.round(Math.random()*10000);

              let archiveFile = File.join(tmpDir,
                                          "marketplace-app-" + id + ".zip");
              downloadFile(packageURL, archiveFile, function () {
                // Then, extract the zip to a temporary folder
                let tempWebappDir = File.join(tmpDir, "marketplace-app-" + id);
                File.mkpath(tempWebappDir);

                let zipFile = Cc["@mozilla.org/file/local;1"]
                                .createInstance(Ci.nsIFile);
                zipFile.initWithPath(archiveFile);
                let targetDir = Cc["@mozilla.org/file/local;1"]
                                  .createInstance(Ci.nsIFile);
                targetDir.initWithPath(tempWebappDir);

                extractFiles(zipFile, targetDir);

                // Finally, register this temporary folder to the simulator
                let manifestPath = File.join(tempWebappDir, "manifest.webapp");
                simulator.addManifestFile(manifestPath);
              });
            }
          }).get();
        } else {
          simulator.addManifestUrl(data.manifestURL);
        }
      });
    });
  }
});
