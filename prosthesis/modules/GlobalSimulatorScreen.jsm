/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = [ "GlobalSimulatorScreen" ];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyServiceGetter(this, "ppmm",
    "@mozilla.org/parentprocessmessagemanager;1",
    "nsIMessageBroadcaster");

let DEBUG = false;
let DEBUG_PREFIX = "prosthesis: GlobalSimulatorScreen.jsm - ";
let debug = DEBUG ? function debug(msg) dump(DEBUG_PREFIX+msg+"\n") : function() {};

this.GlobalSimulatorScreen = {
  width: 320,
  height: 480,
  mozOrientationLocked: false,
  mozOrientation: "portrait-primary",
  lock: function() {
    GlobalSimulatorScreen.mozOrientationLocked = true;
    Services.obs.notifyObservers(null, "simulator-orientation-lock-change", null);
  },

  unlock: function() {
    GlobalSimulatorScreen.mozOrientationLocked = false;
    Services.obs.notifyObservers(null, "simulator-orientation-lock-change", null);
  },

  broadcastOrientationChange: function() {
    debug("broadcast 'SimulatorScreen:orientationChange'.");
    ppmm.broadcastAsyncMessage("SimulatorScreen:orientationChange", { });
  },

  isSameOrientation: function(appOrigin) {
    let orientation = this.getAppOrientation(appOrigin);
    if (!orientation)
      return true;
    return this.mozOrientation.split("-")[0] === orientation.split("-")[0];
  },

  flipScreen: function() {
    if (GlobalSimulatorScreen.mozOrientationLocked) {
      // disabled
      return false;
    }

    if (GlobalSimulatorScreen.mozOrientation.match(/^portrait/)) {
      GlobalSimulatorScreen.mozOrientation = "landscape-primary";
      GlobalSimulatorScreen.adjustWindowSize();
      GlobalSimulatorScreen.broadcastOrientationChange();
      return true;
    } else if (GlobalSimulatorScreen.mozOrientation.match(/^landscape/)) {
      GlobalSimulatorScreen.mozOrientation = "portrait-primary";
      GlobalSimulatorScreen.adjustWindowSize();
      GlobalSimulatorScreen.broadcastOrientationChange();
      return true;
    }

    return false;
  },

  // adjust shell, homescreen and optional app div container (if appOrigin != null)
  adjustWindowSize: function() {
    if (GlobalSimulatorScreen.mozOrientation.match(/^portrait/)) {
      GlobalSimulatorScreen.width = 320;
      GlobalSimulatorScreen.height = 480;
    } else if (GlobalSimulatorScreen.mozOrientation.match(/^landscape/)) {
      GlobalSimulatorScreen.width = 480;
      GlobalSimulatorScreen.height = 320;
    }

    debug("notify 'simulator-adjust-window-size'.");
    Services.obs.notifyObservers(null, "simulator-adjust-window-size", null);
  }
}
