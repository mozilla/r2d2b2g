/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

Components.utils.import("resource://gre/modules/Services.jsm");

this.EXPORTED_SYMBOLS = ["SimulatorActor"];

function log(msg) {
  var DEBUG_LOG = false;

  if (DEBUG_LOG)
    dump("prosthesis:"+msg+"\n");
}

log("loading simulator actor definition");

/**
  * Creates a SimulatorActor. SimulatorActor provides remote access to the
  * FirefoxOS Simulator module.
  */
function SimulatorActor(aConnection)
{
  log("simulator actor created for a new connection");
  this._connection = aConnection;
  this._listeners = {};
  this.clientReady = false;
}

SimulatorActor.prototype = {
  actorPrefix: "simulator",

  disconnect: function() {
    log("simulator actor connection closed");
    this._unsubscribeWindowManagerEvents();
  },

  onPing: function(aRequest) {
    log("simulator actor received a 'ping' command");
    this.clientReady = true;

    // After ping we know we can request geolocation coordinates from client
    this._connection.send({
      from: this.actorID,
      type: "geolocationRequest"
    });

    return { "msg": "pong" };
  },

  onGetBuildID: function(aRequest) {
    log("simulator actor received a 'getBuildID'");
    var buildID = this.simulatorWindow.navigator.buildID;

    return {
      buildID: buildID
    };
  },

  onLogStdout: function(aRequest) {
    log("simulator actor received a 'logStdout' command");
    // HACK: window.dump should dump on stdout
    // https://developer.mozilla.org/en/docs/DOM/window.dump#Notes
    let dumpStdout = this.simulatorWindow.dump;
    dumpStdout(aRequest.message);

    return {
      success: true
    };
  },

  onRunApp: function(aRequest) {
    log("simulator actor received a 'runApp' command:" + aRequest.appId);
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
            runnable.killAppByOrigin(appOrigin, function () {
              runnable.findAppByOrigin(appOrigin, function (e, app) {
                if (e) {
                  log("RUNAPP ERROR: " + e);
                  return;
                }

                try {
                  log("RUNAPP LAUNCHING:" + app.origin);
                  app.launch();
                  log("RUNAPP SUCCESS:" + appOrigin);
                } catch(e) {
                  log("RUNAPP EXCEPTION: " + e);
                }
              });
            });
          });
        } catch(e) {
          log("RUNAPP EXCEPTION: " + e);
        }
      },
      waitHomescreenReady: function(cb) {
        log("RUNAPP - wait homescreen ready...");
        let res = homescreen.navigator.mozSettings.createLock().get('homescreen.ready');
        res.onsuccess = function() {
          if (res.result["homescreen.ready"]) {
            log("RUNAPP - homescreen ready");
            cb();
          } else {
            log("RUNAPP - wait for homescreen ready");
            let wait = function (notify) {
              log("RUNAPP - homescreen ready: "+notify.settingValue);
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
          log("RUNAPP ERROR - waitHomescreenReady: "+res.error.name);
        }
      },
      killAppByOrigin: function(origin, cb) {
        log("RUNAPP: killAppByOrigin - " + origin);
        try {
          if (WindowManager.getRunningApps()[origin] &&
              !WindowManager.getRunningApps()[origin].killed) {
            // app running: kill and wait for appterminated
            let app = WindowManager.getRunningApps()[origin];
            log("RUNAPP: killAppByOrigin - wait for appterminated");
            let once = function (evt) {
              // filtering out other appterminated with different origin
              if (evt.detail.origin !== origin) {
                return;
              }
              log("RUNAPP: killAppByOrigin - appterminated received");
              homescreen.removeEventListener("appterminated", once);
              // WORKAROUND: bug (probably related to disabled oop) restarted
              // app keep to be flagged as killed and never restarted
              delete WindowManager.getRunningApps()[origin];

              cb();
            }
            homescreen.addEventListener("appterminated", once, false);
            WindowManager.kill(origin);
          } else {
            // app not running
            log("RUNAPP: killAppByOrigin - app is not running");
            cb();
          }
        } catch(e) {
          log("RUNAPP EXCEPTION: killAppByOrigin - " + e);
          cb();
        }
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
    log("simulator actor received 'validateManifest' command: " + JSON.stringify(aRequest));
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
            log("VALIDATE MANIFEST EXCEPTION: " + e);
            errors.push("Invalid access '" + paccess + "' in permission '" + pname + "'.");
          }
        }
      } else {
        errors.push("Unknown permission '" + pname + "'.");
      }
    });
  },

  onUninstallApp: function(aRequest) {
    log("simulator actor received 'uninstallApp' command: " + aRequest.appId);
    let window = this.simulatorWindow;
    let DOMApplicationRegistry = window.DOMApplicationRegistry;
    let appId = aRequest.appId;

    if (!DOMApplicationRegistry.webapps[appId]) {
      return { success: false, error: 'app-not-installed', message: 'App not installed.'}
    }

    let appOrigin = DOMApplicationRegistry.webapps[appId].origin;

    log("uninstalling app by origin:"+appOrigin);

    let runnable = {
      run: function() {
        try {
          let mgmt = window.navigator.mozApps.mgmt;
          let req = mgmt.uninstall({origin: appOrigin});
          req.onsuccess = function () {
            log("uninstallApp success: " + req.result);
          }
          req.onerror = function () {
            log("uninstallApp error: " + req.error.name);
          }
        } catch(e) {
          log(e);
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
    log("simulator actor received a 'showNotification' command");
    let window = this.simulatorWindow;
    window.AlertsHelper.showNotification(null, "Simulator", aRequest.userMessage);

    return {
      message: "showNotification request received",
      success: true
    };
  },

  onSubscribeWindowManagerEvents: function (aRequest) {
    log("simulator actor received a 'subscribeWindowManagerEvents' command");
    let ok = this._subscribeWindowManagerEvents();

    if (ok) {
      return {
        success: true,
        message: "WindowManager events subscribed"
      }
    }

    return {
      success: false,
      message: "WindowManager events already subscribed"
    }
  },

  onUnsubscribeWindowManagerEvents: function (aRequest) {
    log("simulator actor received a 'unsubscribeWindowManagerEvents' command");
    this._unsubscribeWindowManagerEvents();

    return {
      success: true,
      message: "WindowManager events unsubscribed"
    }
  },

  onGeolocationResponse: function (aRequest) {
    Services.obs.notifyObservers({
      wrappedJSObject: {
        lat: aRequest.message.lat,
        lon: aRequest.message.lon,
      }
    }, "r2d2b2g-geolocation-setup", null);
  },

  _unsubscribeWindowManagerEvents: function() {
    let homescreenWindow = this.homescreenWindow.wrappedJSObject;

    homescreenWindow.removeEventListener("appopen", this._listeners["appopen"]);
    homescreenWindow.removeEventListener("appterminated", this._listeners["appterminated"]);
  },

  _subscribeWindowManagerEvents: function() {
    let homescreenWindow = this.homescreenWindow.wrappedJSObject;
    let WindowManager = homescreenWindow.WindowManager;
    let _notify = this._notify.bind(this);

    if (!!this._listeners["appopen"] ||
        !!this._listeners["appterminated"]) {
      // NOTE: already subscribed
      return false;
    }

    homescreenWindow.addEventListener("appopen", onAppOpen);
    this._listeners["appopen"] = onAppOpen;

    homescreenWindow.addEventListener("appterminated", onAppTerminated);
    this._listeners["appterminated"] = onAppTerminated;

    return true;

    function onAppOpen(e) {
      let origin = e.detail.origin;
      let app = WindowManager.getRunningApps()[origin];

      _notify("windowManagerEvent",{
        event: "appopen",
        origin: origin,
        name: app.name,
        manifest: app.manifest
      });
    }

    // NOTE: exception into this closures seems to be silently ignored :-(
    function onAppTerminated(e) {
      let origin = e.detail.origin;
      _notify("windowManagerEvent",{
        event: "appterminated",
        origin: origin
      });
    }
  },

  _notify: function(type,data) {
    data.type = type;
    data.from = this.actorID;
    this.conn.send(data);
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
  "subscribeWindowManagerEvents": SimulatorActor.prototype.onSubscribeWindowManagerEvents,
  "unsubscribeWindowManagerEvents": SimulatorActor.prototype.onUnsubscribeWindowManagerEvents,
  "geolocationResponse": SimulatorActor.prototype.onGeolocationResponse,
};

DebuggerServer.removeGlobalActor(SimulatorActor);
DebuggerServer.addGlobalActor(SimulatorActor,"simulatorActor");
