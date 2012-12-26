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
    log("simulator actor received a 'runApp' command");
    let window = this.simulatorWindow;
    let appName = aRequest.appname;

    window.runAppObj = new window.AppRunner(appName);

    let setReq = window.navigator.mozSettings
      .createLock().set({'lockscreen.enabled': false});
    setReq.onsuccess = function() {
      window.runAppObj.doRunApp();
    }
    return {
      message: "runApp request received"
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
  "subscribeWindowManagerEvents": SimulatorActor.prototype.onSubscribeWindowManagerEvents,
  "unsubscribeWindowManagerEvents": SimulatorActor.prototype.onUnsubscribeWindowManagerEvents,
};

DebuggerServer.removeGlobalActor(SimulatorActor);
DebuggerServer.addGlobalActor(SimulatorActor,"simulatorActor");
