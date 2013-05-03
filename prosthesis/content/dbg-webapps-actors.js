/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let Cu = Components.utils;
let Cc = Components.classes;
let Ci = Components.interfaces;

function debug(aMsg) {
/*
  Cc["@mozilla.org/consoleservice;1"]
    .getService(Ci.nsIConsoleService)
    .logStringMessage("--*-- WebappsActor : " + aMsg);
*/
}

//@line 22 "/home/myk/Mozilla/central/b2g/chrome/content/dbg-webapps-actors.js"
//  const DIRECTORY_NAME = "ProfD";
//@line 24 "/home/myk/Mozilla/central/b2g/chrome/content/dbg-webapps-actors.js"

/**
 * Creates a WebappsActor. WebappsActor provides remote access to
 * install apps.
 */
function WebappsActor(aConnection) { debug("init"); }

WebappsActor.prototype = {
  actorPrefix: "simulatorWebapps",

  _registerApp: function wa_actorRegisterApp(aApp, aId, aDir) {
    let reg = DOMApplicationRegistry;
    let self = this;

    if (aId in reg._manifestCache) {
      // remove cached manifest (e.g. reinstall app)
      delete reg._manifestCache[aId];
    }

    aApp.installTime = Date.now();
    aApp.installState = "installed";
    aApp.removable = true;
    aApp.id = aId;
    aApp.basePath = FileUtils.getDir(DIRECTORY_NAME, ["webapps"], true).path;
    aApp.localId = (aId in reg.webapps) ? reg.webapps[aId].localId
                                        : reg._nextLocalId();

    reg.webapps[aId] = aApp;
    reg.updatePermissionsForApp(aId);

    reg._readManifests([{ id: aId }], function(aResult) {
      let manifest = aResult[0].manifest;
      aApp.name = manifest.name;
      reg._registerSystemMessages(manifest, aApp);
      reg._registerActivities(manifest, aApp, true);
      reg._saveApps(function() {
        aApp.manifest = manifest;

        // NOTE: needed to evict manifest cache: 
        // - http://hg.mozilla.org/mozilla-central/annotate/31e89328fe12/dom/apps/src/Webapps.js#l319
        // - http://hg.mozilla.org/mozilla-central/annotate/31e89328fe12/dom/apps/src/Webapps.js#l598
        let app = DOMApplicationRegistry.webapps[aId];
        reg.broadcastMessage("Webapps:PackageEvent",
                             { app: app,
                               manifest: manifest,
                               manifestURL: app.manifestURL,
                               type: "applied",
                               oid: "foo",
                               requestID: "bar"
                             });

        reg.broadcastMessage("Webapps:Install:Return:OK",
                             { app: aApp,
                               oid: "foo",
                               requestID: "bar"
                             });
        delete aApp.manifest;
        reg.broadcastMessage("Webapps:AddApp", { id: aId, app: aApp });
        self.conn.send({ from: self.actorID,
                         type: "webappsEvent",
                         appId: aId
                       });

        // We can't have appcache for packaged apps.
        if (!aApp.origin.startsWith("app://")) {
          reg.startOfflineCacheDownload(new ManifestHelper(manifest, aApp.origin));
        }
      });
      // Cleanup by removing the temporary directory.
      aDir.remove(true);
    });
  },

  _sendError: function wa_actorSendError(aMsg, aId) {
    debug("Sending error: " + aMsg);
    this.conn.send(
      { from: this.actorID,
        type: "webappsEvent",
        appId: aId,
        error: "installationFailed",
        message: aMsg
      });
  },

  installHostedApp: function wa_actorInstallHosted(aDir, aId, aType, aReceipt) {
    debug("installHostedApp");
    let self = this;

    let runnable = {
      run: function run() {
        try {
          // The destination directory for this app.
          let installDir = FileUtils.getDir(DIRECTORY_NAME,
                                            ["webapps", aId], true);

          // Move manifest.webapp to the destination directory.
          let manFile = aDir.clone();
          manFile.append("manifest.webapp");
          manFile.moveTo(installDir, "manifest.webapp");

          // Read the origin and manifest url from metadata.json
          let metaFile = aDir.clone();
          metaFile.append("metadata.json");
          DOMApplicationRegistry._loadJSONAsync(metaFile, function(aMetadata) {
            if (!aMetadata) {
              self._sendError("Error Parsing metadata.json", aId);
              return;
            }

            if (!aMetadata.origin) {
              self._sendError("Missing 'origin' propery in metadata.json", aId);
              return;
            }

            let origin = aMetadata.origin;
            let manifestURL = aMetadata.manifestURL ||
                              origin + "/manifest.webapp";
            // Create a fake app object with the minimum set of properties we need.
            let app = {
              origin: origin,
              installOrigin: aMetadata.installOrigin || origin,
              manifestURL: manifestURL,
              receipts: aReceipt ? [aReceipt] : [],
              appStatus: aType
            }

            self._registerApp(app, aId, aDir);
          });
        } catch(e) {
          // If anything goes wrong, just send it back.
          self._sendError(e.toString(), aId);
        }
      }
    }

    Services.tm.currentThread.dispatch(runnable,
                                       Ci.nsIThread.DISPATCH_NORMAL);
  },

  installPackagedApp: function wa_actorInstallPackaged(aDir, aId, aType, aReceipt) {
    debug("installPackagedApp");
    let self = this;

    let runnable = {
      run: function run() {
        try {
          // The destination directory for this app.
          let installDir = FileUtils.getDir(DIRECTORY_NAME,
                                            ["webapps", aId], true);

          // Move application.zip to the destination directory.
          let zipFile = aDir.clone();
          zipFile.append("application.zip");
          zipFile.moveTo(installDir, "application.zip");



          // Extract the manifest.webapp file from the zip.
          zipFile = installDir.clone();
          zipFile.append("application.zip");

          // Refresh application.zip content (e.g. reinstall app)
          Services.obs.notifyObservers(zipFile, "flush-cache-entry", null);

          let zipReader = Cc["@mozilla.org/libjar/zip-reader;1"]
                            .createInstance(Ci.nsIZipReader);
          zipReader.open(zipFile);

          let manFile = installDir.clone();
          manFile.append("manifest.webapp");
          zipReader.extract("manifest.webapp", manFile);
          zipReader.close();

          let origin = "app://" + aId;

          // Create a fake app object with the minimum set of properties we need.
          let app = {
            origin: origin,
            installOrigin: origin,
            manifestURL: origin + "/manifest.webapp",
            receipts: aReceipt ? [aReceipt] : [],
            appStatus: aType
          }

          self._registerApp(app, aId, aDir);
        } catch(e) {
          // If anything goes wrong, just send it back.
          self._sendError(e.toString(), aId);
        }
      }
    }

    Services.tm.currentThread.dispatch(runnable,
                                       Ci.nsIThread.DISPATCH_NORMAL);
  },

  /**
    * @param appId   : The id of the app we want to install. We will look for
    *                  the files for the app in $TMP/b2g/$appId :
    *                  For packaged apps: application.zip
    *                  For hosted apps:   metadata.json and manifest.webapp
    * @param appType : The privilege status of the app, as defined in
    *                   nsIPrincipal. It's optional and default to
    *                   APP_STATUS_INSTALLED
    */
  install: function wa_actorInstall(aRequest) {
    debug("install");

    Cu.import("resource://gre/modules/Webapps.jsm");
    Cu.import("resource://gre/modules/AppsUtils.jsm");
    Cu.import("resource://gre/modules/FileUtils.jsm");

    let appId = aRequest.appId;
    if (!appId) {
      return { error: "missingParameter",
               message: "missing parameter appId" }
    }

    let appType = aRequest.appType || Ci.nsIPrincipal.APP_STATUS_INSTALLED;
    let appReceipt = aRequest.appReceipt;

    // Check that we are not overriding a preinstalled application.
    let reg = DOMApplicationRegistry;
    if (appId in reg.webapps && reg.webapps[appId].removable === false) {
      return { error: "badParameterType",
               message: "The application " + appId + " can't be overriden."
             }
    }

    // In production builds, don't allow installation of certified apps.
//@line 233 "/home/myk/Mozilla/central/b2g/chrome/content/dbg-webapps-actors.js"

    let appDir = FileUtils.getDir("TmpD", ["b2g", appId], false, false);

    if (!appDir || !appDir.exists()) {
      return { error: "badParameterType",
               message: "missing directory " + appDir.path
             }
    }

    let testFile = appDir.clone();
    testFile.append("application.zip");

    if (testFile.exists()) {
      this.installPackagedApp(appDir, appId, appType, appReceipt);
    } else {
      let missing =
        ["manifest.webapp", "metadata.json"]
        .some(function(aName) {
          testFile = appDir.clone();
          testFile.append(aName);
          return !testFile.exists();
        });

      if (missing) {
        try {
          aDir.remove(true);
        } catch(e) {}
        return { error: "badParameterType",
                 message: "hosted app file is missing" }
      }

      this.installHostedApp(appDir, appId, appType, appReceipt);
    }

    return { appId: appId, path: appDir.path }
  }
};

/**
 * The request types this actor can handle.
 */
WebappsActor.prototype.requestTypes = {
  "install": WebappsActor.prototype.install
};

DebuggerServer.addGlobalActor(WebappsActor, "simulatorWebappsActor");
