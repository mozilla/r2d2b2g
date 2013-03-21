/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

{

let DEBUG = false;
let DEBUG_PREFIX = "prosthesis: dbg-simulator-actors.js - ";
let debug = DEBUG ? function debug(msg) dump(DEBUG_PREFIX+msg+"\n") : function() {};

debug("loading simulator actor definition");

Components.utils.import("resource://gre/modules/Services.jsm");

this.EXPORTED_SYMBOLS = ["SimulatorActor"];


/**
  * Creates a SimulatorActor. SimulatorActor provides remote access to the
  * FirefoxOS Simulator module.
  */
let SimulatorActor = function SimulatorActor(aConnection) {
  debug("simulator actor created for a new connection");
  this._connection = aConnection;
  this._listeners = {};
  this.clientReady = false;
}

SimulatorActor.prototype = {
  actorPrefix: "simulator",

  disconnect: function() {
    debug("simulator actor connection closed");
  },

  onPing: function(aRequest) {
    debug("simulator actor received a 'ping' command");

    return { "msg": "pong" };
  },

  onGeolocationReady: function(aRequest) {
    debug("simulator actor received a 'geolocationReady' command");
    this.clientReady = true;

    // After ping we know we can request geolocation coordinates from client
    this._connection.send({
      from: this.actorID,
      type: "geolocationRequest"
    });
    return { "msg": "geolocationReady received" };
  },

  onGetBuildID: function(aRequest) {
    debug("simulator actor received a 'getBuildID'");
    var buildID = this.simulatorWindow.navigator.buildID;

    return {
      buildID: buildID
    };
  },

  onLogStdout: function(aRequest) {
    debug("simulator actor received a 'logStdout' command");
    // HACK: window.dump should dump on stdout
    // https://developer.mozilla.org/en/docs/DOM/window.dump#Notes
    let dumpStdout = this.simulatorWindow.dump;
    dumpStdout(aRequest.message);

    return {
      success: true
    };
  },

  onRunApp: function(aRequest) {
    debug("simulator actor received a 'runApp' command:" + aRequest.appId);
    let window = this.simulatorWindow;
    let homescreen = XPCNativeWrapper.unwrap(this.homescreenWindow);
    let WindowManager = homescreen.WindowManager;
    let DOMApplicationRegistry = window.DOMApplicationRegistry;
    let appId = aRequest.appId;

    if (!DOMApplicationRegistry.webapps[appId]) {
      return { success: false, error: 'app-not-installed', message: 'App not installed.'}
    }
    
    let appOrigin = DOMApplicationRegistry.webapps[appId].origin;

    let runnable = {
      run: function() {
        try {
          runnable.waitHomescreenReady(function () {
            runnable.tryAppReloadByOrigin(appOrigin, function () {
              runnable.findAppByOrigin(appOrigin, function (e, app) {
                if (e) {
                  debug("RUNAPP ERROR: " + e);
                  return;
                }
                
                try {
                  debug("RUNAPP LAUNCHING:" + app.origin);
                  app.launch();
                  debug("RUNAPP SUCCESS:" + appOrigin);
                } catch(e) {
                  debug(["EXCEPTION:", e, e.fileName, e.lineNumber].join(' '));
                }
              });
            });
          });
        } catch(e) {
          debug(["EXCEPTION:", e, e.fileName, e.lineNumber].join(' '));
        }
      },
      waitHomescreenReady: function(cb) {
        debug("RUNAPP - wait homescreen ready...");
        let res = homescreen.navigator.mozSettings.createLock().get('homescreen.ready');
        res.onsuccess = function() {
          if (res.result["homescreen.ready"]) {
            debug("RUNAPP - homescreen ready");
            cb();
          } else {
            debug("RUNAPP - wait for homescreen ready");
            let wait = function (notify) {
              debug("RUNAPP - homescreen ready: "+notify.settingValue);
              if(notify.settingValue) {
                homescreen.navigator.mozSettings.removeObserver("homescreen.ready", wait);
                cb();
              }
            };
            homescreen.navigator.mozSettings.
              addObserver("homescreen.ready", wait);
          }
        }
        res.onerror = function() {
          debug("RUNAPP ERROR - waitHomescreenReady: "+res.error.name);
        }
      },
      tryAppReloadByOrigin: function(origin, cb) {
        debug("RUNAPP: tryAppReloadByOrigin - " + origin);
        try {
          if (WindowManager.getRunningApps()[origin] &&
              !WindowManager.getRunningApps()[origin].killed) {
            let app = WindowManager.getRunningApps()[origin];
            WindowManager.setDisplayedApp(origin);
            app.reload();
            debug("RUNAPP: RELOADED:" + app.origin);
          } else {
            // app not running
            runnable._fixSetDisplayedApp(appOrigin);
            debug("RUNAPP: killAppByOrigin - app is not running");
            cb();
          }
        } catch(e) {
          // go on and launch by mozApps API on exception 
          // (e.g. window manager is not ready)
          debug(["EXCEPTION:", e, e.fileName, e.lineNumber].join(' '));
          runnable._fixSetDisplayedApp(appOrigin);
          cb();
        }
      },
      _fixSetDisplayedApp: function(appOrigin) {
        Services.obs.notifyObservers(
          {
            wrappedJSObject: {
              appOrigin: appOrigin
            }
          }, 
          "simulator-set-displayed-app", 
          null);
      },
      findAppByOrigin: function(origin, cb) {
        let mgmt = window.navigator.mozApps.mgmt;
        let req = mgmt.getAll();
        req.onsuccess = function() {
          let found = req.result.filter(function (app) {
            if (app.origin === origin) {
              return true;
            }
          });

          if (found.length == 0) {
            cb("app not found");
          } else {
            cb(null, found[0]);
          }
        };
        req.onerror = function() {
          cb(req.error.name);
        };
      }
    };

    Services.tm.currentThread.dispatch(runnable,
                                       Ci.nsIThread.DISPATCH_NORMAL);
    return {
      message: "runApp request received: " + appOrigin,
      success: true
    };
  },

  onValidateManifest: function(aRequest) {
    debug("simulator actor received 'validateManifest' command: " + JSON.stringify(aRequest));
    let manifest = aRequest.manifest;
    let appType = manifest.type || "web";

    let errors = [];

    if (["web", "privileged", "certified"].indexOf(appType) === -1) {
      errors.push("Unknown app type: '" + appType + "'.");
    }

    let utils = {};
    Cu.import("resource://gre/modules/AppsUtils.jsm", utils);
    let valid = utils.AppsUtils.checkManifest(manifest, {});

    if (!valid) {
      errors.push("This app can't be installed on a production device "+
                  "(AppsUtils.checkManifest return false).");
    }

    if (manifest.permissions) {
      this._validateManifestPermissions(appType, manifest.permissions, errors);
    }

    if (errors.length > 0) {
      return {
        success: false,
        errors: errors
      };
    }

    return {
      success: true
    };
  },

  _validateManifestPermissions: function(appType, permissions, errors) {
    let utils = {};
    Cu.import("resource://gre/modules/PermissionsTable.jsm", utils);

    let permissionsNames = Object.keys(permissions);

    let appStatus;
    // NOTE: If it isn't certified or privileged, it's appStatus "app"
    // https://hg.mozilla.org/releases/mozilla-b2g18/file/d9278721eea1/dom/apps/src/PermissionsTable.jsm#l413
    if (["privileged", "certified"].indexOf(appType) === -1) {
      appStatus = "app";
    } else {
      appStatus = appType;
    }

    permissionsNames.forEach(function(pname) {
      let permission = utils.PermissionsTable[pname];

      if (permission) {
        let permissionAction = permission[appStatus];
        if (!permissionAction) {
          errors.push("Ignored permission '" + pname + "' (invalid type '" + appType + "').");
        } else if (permissionAction === Ci.nsIPermissionManager.DENY_ACTION) {
          errors.push("Denied permission '" + pname + "' for type '" + appType + "'.");
        } else {
          let access = permissions[pname].access;
          try {
            if (access && utils.expandPermissions(pname, access).length === 0) {
              errors.push("Invalid access '" + access + "' in permission '" + pname + "'.");
            }
          } catch(e) {
            debug(["EXCEPTION:", e, e.fileName, e.lineNumber].join(' '));
            errors.push("Invalid access '" + paccess + "' in permission '" + pname + "'.");
          }
        }
      } else {
        errors.push("Unknown permission '" + pname + "'.");
      }
    });
  },

  onUninstallApp: function(aRequest) {
    debug("simulator actor received 'uninstallApp' command: " + aRequest.appId);
    let window = this.simulatorWindow;
    let DOMApplicationRegistry = window.DOMApplicationRegistry;
    let appId = aRequest.appId;

    if (!DOMApplicationRegistry.webapps[appId]) {
      return { success: false, error: 'app-not-installed', message: 'App not installed.'}
    }

    let appOrigin = DOMApplicationRegistry.webapps[appId].origin;

    debug("uninstalling app by origin:"+appOrigin);

    let runnable = {
      run: function() {
        try {
          let mgmt = window.navigator.mozApps.mgmt;
          let req = mgmt.uninstall({origin: appOrigin});
          req.onsuccess = function () {
            debug("uninstallApp success: " + req.result);
          }
          req.onerror = function () {
            debug("uninstallApp error: " + req.error.name);
          }
        } catch(e) {
          debug(["EXCEPTION:", e, e.fileName, e.lineNumber].join(' '));
        }
      }
    };

    Services.tm.currentThread.dispatch(runnable,
                                       Ci.nsIThread.DISPATCH_NORMAL);
    return {
      message: "uninstallApp request received",
      success: true
    };
  },

  onShowNotification: function (aRequest) {
    debug("simulator actor received a 'showNotification' command");
    let window = this.simulatorWindow;
    window.AlertsHelper.showNotification(null, "Simulator", aRequest.userMessage);

    return {
      message: "showNotification request received",
      success: true
    };
  },

  onGeolocationResponse: function (aRequest) {
    Services.obs.notifyObservers({
      wrappedJSObject: {
        lat: aRequest.message.lat,
        lon: aRequest.message.lon,
      }
    }, "r2d2b2g-geolocation-setup", null);
  },

  get homescreenWindow() {
    var shellw = this.simulatorWindow.document.getElementById("homescreen").contentWindow;
    return shellw;
  },

  get simulatorWindow() {
    var window = Cc['@mozilla.org/appshell/window-mediator;1']
      .getService(Ci.nsIWindowMediator)
      .getMostRecentWindow("navigator:browser");
    return window;
  },
};

/**
 * The request types this actor can handle.
 */
SimulatorActor.prototype.requestTypes = {
  "ping": SimulatorActor.prototype.onPing,
  "getBuildID": SimulatorActor.prototype.onGetBuildID,
  "logStdout": SimulatorActor.prototype.onLogStdout,
  "runApp": SimulatorActor.prototype.onRunApp,
  "uninstallApp": SimulatorActor.prototype.onUninstallApp,
  "validateManifest": SimulatorActor.prototype.onValidateManifest,
  "showNotification": SimulatorActor.prototype.onShowNotification,
  "geolocationReady": SimulatorActor.prototype.onGeolocationReady,
  "geolocationResponse": SimulatorActor.prototype.onGeolocationResponse,
};

DebuggerServer.removeGlobalActor(SimulatorActor);
DebuggerServer.addGlobalActor(SimulatorActor,"simulatorActor");

}
