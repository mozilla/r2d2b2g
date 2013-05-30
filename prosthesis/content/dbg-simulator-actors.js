/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

Components.utils.import("resource://gre/modules/Services.jsm");

/**
  * Creates a SimulatorActor. SimulatorActor provides remote access to the
  * FirefoxOS Simulator module.
  */
let SimulatorActor = function SimulatorActor(aConnection) {
  this.debug("simulator actor created for a new connection");

  this._connection = aConnection;
  this._listeners = {};

  Services.obs.addObserver(this, "r2d2b2g:app-update", false);
  Services.obs.addObserver(this, "r2d2b2g:geolocation-start", false);
  Services.obs.addObserver(this, "r2d2b2g:geolocation-stop", false);
};

SimulatorActor.prototype = {
  actorPrefix: "simulator",

  observe: function(aSubject, aTopic, aData) {
    switch(aTopic) {
      case "r2d2b2g:app-update":
        this.appUpdateObserver(aSubject);
        break;
      case "r2d2b2g:geolocation-start":
        this.geolocationStart();
        break;
      case "r2d2b2g:geolocation-stop":
        this.geolocationStop();
        break;
    }
  },

  appUpdateObserver: function(message) {
    this.debug("send appUpdateRequest unsolicited request");
    this._connection.send({
      from: this.actorID,
      type: "appUpdateRequest",
      origin: message.wrappedJSObject.origin,
      appId: message.wrappedJSObject.appId
    });
  },

  geolocationStart: function() {
    this.debug("Simulator requesting to start watching geolocation");
    this._connection.send({
      from: this.actorID,
      type: "geolocationStart"
    });
  },

  geolocationStop: function() {
    this.debug("Simulator requesting to stop watching geolocation");
    this._connection.send({
      from: this.actorID,
      type: "geolocationStop"
    });
  },

  disconnect: function() {
    this.debug("simulator actor connection closed");
    Services.obs.removeObserver(this, "r2d2b2g:app-update");
  },

  /**
   * Dump a debug message to stdout.  This is defined as a method to avoid
   * polluting the global namespace of the debugger server, and it always dumps
   * because the Add-on SDK automatically determines whether to log the message.
   */
  debug: function debug() {
    dump(Array.slice(arguments).join(" ") + "\n");
  },

  onPing: function(aRequest) {
    this.debug("simulator actor received a 'ping' command");

    return { "msg": "pong" };
  },

  onGetBuildID: function(aRequest) {
    this.debug("simulator actor received a 'getBuildID'");
    var buildID = this.simulatorWindow.navigator.buildID;

    return {
      buildID: buildID
    };
  },

  onRunApp: function(aRequest) {
    this.debug("simulator actor received a 'runApp' command:" + aRequest.appId);
    let window = this.simulatorWindow;
    let homescreen = XPCNativeWrapper.unwrap(this.homescreenWindow);
    let WindowManager = homescreen.WindowManager;
    let DOMApplicationRegistry = window.DOMApplicationRegistry;
    let appId = aRequest.appId;

    if (!DOMApplicationRegistry.webapps[appId]) {
      return { success: false, error: 'app-not-installed', message: 'App not installed.'};
    }

    let appOrigin = DOMApplicationRegistry.webapps[appId].origin;

    let debug = this.debug.bind(this);

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

  onUninstallApp: function(aRequest) {
    this.debug("simulator actor received 'uninstallApp' command: " + aRequest.appId);
    let window = this.simulatorWindow;
    let DOMApplicationRegistry = window.DOMApplicationRegistry;
    let appId = aRequest.appId;

    if (!DOMApplicationRegistry.webapps[appId]) {
      return { success: false, error: 'app-not-installed', message: 'App not installed.'}
    }

    let appOrigin = DOMApplicationRegistry.webapps[appId].origin;

    this.debug("uninstalling app by origin:"+appOrigin);

    let debug = this.debug.bind(this);
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
          Cu.reportError(e);
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
    this.debug("simulator actor received a 'showNotification' command");
    let window = this.simulatorWindow;
    window.AlertsHelper.showNotification(null, "Simulator", aRequest.userMessage);

    return {
      message: "showNotification request received",
      success: true
    };
  },

  onGeolocationUpdate: function (aRequest) {
    this.debug("Simulator received a geolocation response, updating provider");
    Services.obs.notifyObservers({
      wrappedJSObject: {
        lat: aRequest.message.lat,
        lon: aRequest.message.lon,
      }
    }, "r2d2b2g:geolocation-update", null);

    return {
      message: "geolocationUpdate request received",
      success: true
    };
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
  "runApp": SimulatorActor.prototype.onRunApp,
  "uninstallApp": SimulatorActor.prototype.onUninstallApp,
  "showNotification": SimulatorActor.prototype.onShowNotification,
  "geolocationUpdate": SimulatorActor.prototype.onGeolocationUpdate,
};

DebuggerServer.removeGlobalActor(SimulatorActor);
DebuggerServer.addGlobalActor(SimulatorActor,"simulatorActor");
