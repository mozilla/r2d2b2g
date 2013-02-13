/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["SimulatorActor"];

function log(msg) {
  var DEBUG_LOG = true;
  
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
}

SimulatorActor.prototype = {
  actorPrefix: "simulator",

  disconnect: function() {
    log("simulator actor connection closed");
    this._unsubscribeWindowManagerEvents();
  },

  onPing: function(aRequest) {
    log("simulator actor received a 'ping' command");
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
    log("simulator actor received a 'runApp' command:" + aRequest.origin);
    let window = this.simulatorWindow;
    let WindowManager = XPCNativeWrapper.unwrap(this.homescreenWindow).WindowManager;
    let appOrigin = aRequest.origin;

    let runnable = {
      run: function() {
        try {
          runnable.killAppByOrigin(appOrigin, function () {
            runnable.findAppByOrigin(appOrigin, function (e, app) {
              if (e) {
                log("RUNAPP ERROR: " + e);
                return;
              }
              runnable.unlockScreen(function(e) {
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
      unlockScreen: function(cb) {
        // WORKAROUND: currently we're not able to detect when the firefoxos is fully loaded
        // and ready to handle this unlock screen request.
        window.setTimeout(function () {
          let setReq = window.navigator.mozSettings
            .createLock().set({'lockscreen.enabled': false});
          setReq.onsuccess = function() {
            cb();
          };
          setReq.onerror = function() {
            cb("unlock error");
          };
        }, 500);
      },
      killAppByOrigin: function(origin, cb) {
        try {
          WindowManager.kill(origin);
          // WORKAROUND: currently WindowManager.kill doesn't always call
          // the optional callback (e.g. the application is not running).
          window.setTimeout(cb, 500);
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
      message: "runApp request received: " + appOrigin
    };
  },

  onUninstallApp: function(aRequest) {
    log("simulator actor received 'uninstallApp' command: " + aRequest.origin);
    let window = this.simulatorWindow;

    let runnable = {
      run: function() {
        try {
          let mgmt = window.navigator.mozApps.mgmt;
          let req = mgmt.uninstall({origin: aRequest.origin});
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
      message: "uninstallApp request received"
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
  "subscribeWindowManagerEvents": SimulatorActor.prototype.onSubscribeWindowManagerEvents,
  "unsubscribeWindowManagerEvents": SimulatorActor.prototype.onUnsubscribeWindowManagerEvents,
};

DebuggerServer.removeGlobalActor(SimulatorActor);
DebuggerServer.addGlobalActor(SimulatorActor,"simulatorActor");
