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
function WebappsActor(aConnection) {
  debug("init");

  this._appActorsMap = new WeakMap();
  this._lastAppActorPool = null;
  this._watchActorPool = null;
}

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
      DOMApplicationRegistry.updateAppHandlers(null, manifest, aApp);

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
          appDir.remove(true);
        } catch(e) {}
        return { error: "badParameterType",
                 message: "hosted app file is missing" }
      }

      this.installHostedApp(appDir, appId, appType, appReceipt);
    }

    return { appId: appId, path: appDir.path }
  },

  _createAppActor: function (frame) {
    // Eventually retrieve a previous Actor instance for this app
    let actor = this._appActorsMap.get(frame);
    if (!actor) {
      // Pass the iframe and not the global object,
      // otherwise webconsole code will toggle into global console mode.
      actor = new AppActor(this.conn, frame, this._appActorsMap);
      // this.actorID is set by ActorPool when an actor is put into one.
      actor.parentID = this.actorID;
      this._appActorsMap.set(frame, actor);
    }
    return actor;
  },

  listApps : function () {
    let actorPool = new ActorPool(this.conn);

    // Store a dictionary of app actors indexed by their manifest URL.
    let appActors = {};

    let registerApp = (function registerApp(frame) {
      let actor = this._createAppActor(frame);
      actorPool.addActor(actor);
      let manifestURL = frame.getAttribute("mozapp");
      appActors[manifestURL] = actor.grip();
    }).bind(this);

    // Register the system app
    let chromeWindow = Services.wm.getMostRecentWindow('navigator:browser');
    let systemAppFrame = chromeWindow.shell.contentBrowser;
    registerApp.call(this, systemAppFrame);

    // Register apps hosted in the system app. (i.e. all regular apps)
    let frames = systemAppFrame.contentDocument.querySelectorAll("iframe[mozapp]");
    for (let i = 0; i < frames.length; i++) {
      let frame = frames[i];
      registerApp.call(this, frame);
    }

    // Drop the pool being returned by previous call to listApps
    if (this._lastAppActorPool) {
      this.conn.removeActorPool(this._lastAppActorPool);
    }

    this._lastAppActorPool = actorPool;
    this.conn.addActorPool(this._lastAppActorPool);

    return {
      'apps': appActors
    };
  },

  watchApps: function () {
    let chromeWindow = Services.wm.getMostRecentWindow('navigator:browser');
    let systemAppFrame = chromeWindow.getContentWindow();
    // Eventually drop the pool being used during the last call to watchApps
    if (this._watchActorPool) {
      this.conn.removeActorPool(this._watchActorPool);
    }
    this._watchActorPool = new ActorPool(this.conn);
    this._framesByOrigin = {};
    this.conn.addActorPool(this._watchActorPool);
    systemAppFrame.addEventListener("appwillopen", this);
    systemAppFrame.addEventListener("appterminated", this);

    return {};
  },

  unwatchApps: function () {
    let chromeWindow = Services.wm.getMostRecentWindow('navigator:browser');
    let systemAppFrame = chromeWindow.getContentWindow();
    // Eventually drop the pool being used during the last call to watchApps
    if (this._watchActorPool) {
      this.conn.removeActorPool(this._watchActorPool);
    }
    this._framesByOrigin = null;
    systemAppFrame.removeEventListener("appwillopen", this);
    systemAppFrame.removeEventListener("appterminated", this);

    return {};
  },

  handleEvent: function (event) {
    let frame, actor, origin;
    switch(event.type) {
      case "appwillopen":
        frame = event.target;
        // Ignore the event if we already received an appwillopen for this app
        // (appwillopen is also fired when the app has been moved to background
        // and get back to foreground)
        if (this._appActorsMap.has(frame)) {
          return;
        }

        actor = this._createAppActor(frame);
        this._watchActorPool.addActor(actor);

        // XXX: workaround to be able to get the frame during appterminated evt
        origin = event.detail.origin;
        this._framesByOrigin[origin] = frame;

        this.conn.send({ from: this.actorID,
                         type: "appOpen",
                         manifestURL: frame.getAttribute("mozapp"),
                         actor: actor.grip()
                       });
        break;

      case "appterminated":
        origin = event.detail.origin;
        // Get the related app frame out of this event
        // TODO: eventually fire the event on the frame or at least use
        // manifestURL as key (and propagate manifestURL via event detail)
        frame = this._framesByOrigin[origin];
        if (frame) {
          actor = this._appActorsMap.get(frame);
          if (actor) {
            this._watchActorPool.removeActor(actor);
          }
          let manifestURL = frame.getAttribute("mozapp");
          this.conn.send({ from: this.actorID,
                           type: "appClose",
                           manifestURL: manifestURL
                         });
        }
        break;
    }
  }
};

/**
 * The request types this actor can handle.
 */
WebappsActor.prototype.requestTypes = {
  "install": WebappsActor.prototype.install,
  "listApps": WebappsActor.prototype.listApps,
  "watchApps": WebappsActor.prototype.watchApps,
};

/**
 * Creates an App actor.
 *
 * @param connection DebuggerServerConnection
 *        The connection to the client.
 * @param browser browser
 *        The iframe instance that contains this app.
 */
function AppActor(connection, browser, appActorsMap) {
  BrowserTabActor.call(this, connection, browser);
  this._appActorsMap = appActorsMap;
}

AppActor.prototype = new BrowserTabActor();

AppActor.prototype._attach = function () {
  if (this._attached) {
    return;
  }
  // DOMWindowCreated events don't fire on app frames (may be because of mozbrowser?)
  // Listen to the observer notification instead.
  Services.obs.addObserver(this, "content-document-global-created", false);

  BrowserTabActor.prototype._attach.call(this);

  // Unregister this actor from the map to prevent from reusing it.
  // One actor can only be attached once and then be garbaged on detach.
  this._appActorsMap.delete(this.browser);
}
AppActor.prototype._detach = function () {
  if (!this.attached) {
    return;
  }
  Services.obs.removeObserver(this, "content-document-global-created");

  BrowserTabActor.prototype._detach.call(this);
}

AppActor.prototype.observe = function (subject, topic, data) {
  if (subject.wrappedJSObject == this.browser.contentWindow.wrappedJSObject) {
    let event = {target: subject.document, type: "DOMWindowCreated"};
    this.onWindowCreated(event);
  }
}

AppActor.prototype.grip = function () {
  dbg_assert(!this.exited,
             'grip() should not be called on exited browser actor.');
  dbg_assert(this.actorID,
             'tab should have an actorID.');

  let response = {
    'actor': this.actorID,
    'title': this.browser.contentDocument.title,
    'url': this.browser.contentDocument.documentURI
  };

  // Walk over tab actors added by extensions and add them to a new ActorPool.
  let actorPool = new ActorPool(this.conn);
  this._createExtraActors(DebuggerServer.tabActorFactories, actorPool);
  if (!actorPool.isEmpty()) {
    this._tabActorPool = actorPool;
    this.conn.addActorPool(this._tabActorPool);
  }

  this._appendExtraActors(response);
  return response;
};

/**
 * Creates a thread actor and a pool for context-lifetime actors. It then sets
 * up the content window for debugging.
 */
AppActor.prototype._pushContext = function () {
  dbg_assert(!this._contextPool, "Can't push multiple contexts");

  this._contextPool = new ActorPool(this.conn);
  this.conn.addActorPool(this._contextPool);

  this.threadActor = new ThreadActor(this);
  this._addDebuggees(this.browser.contentWindow.wrappedJSObject);
  this._contextPool.addActor(this.threadActor);
};

// Protocol Request Handlers

/**
 * Prepare to enter a nested event loop by disabling debuggee events.
 */
AppActor.prototype.preNest = function () {
  let windowUtils = this.browser.contentWindow
                        .QueryInterface(Ci.nsIInterfaceRequestor)
                        .getInterface(Ci.nsIDOMWindowUtils);
  windowUtils.suppressEventHandling(true);
  windowUtils.suspendTimeouts();
};

/**
 * Prepare to exit a nested event loop by enabling debuggee events.
 */
AppActor.prototype.postNest = function (aNestData) {
  let windowUtils = this.browser.contentWindow
                        .QueryInterface(Ci.nsIInterfaceRequestor)
                        .getInterface(Ci.nsIDOMWindowUtils);
  windowUtils.resumeTimeouts();
  windowUtils.suppressEventHandling(false);
};


DebuggerServer.addGlobalActor(WebappsActor, "simulatorWebappsActor");
