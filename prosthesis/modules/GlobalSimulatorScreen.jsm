/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = [ "GlobalSimulatorScreen" ];

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

let DEBUG = true;
let DEBUG_PREFIX = "prosthesis: GlobalSimulatorScreen.jsm - ";
let debug = DEBUG ? function debug(msg) dump(DEBUG_PREFIX+msg+"\n") : function() {};

this.GlobalSimulatorScreen = {
  width: 320,
  height: 480,
  // Orientation data for the current app,
  // what it supports
  mozOrientationLocked: false,
  mozOrientation: "portrait-primary",
  // The faked screen orientation
  screenOrientation: "portrait-primary",
  lock: function() {
    GlobalSimulatorScreen.mozOrientationLocked = true;
    Services.obs.notifyObservers(null, "simulator-orientation-lock-change", null);
    GlobalSimulatorScreen.adjustWindowSize();
  },

  unlock: function() {
    GlobalSimulatorScreen.mozOrientationLocked = false;
    Services.obs.notifyObservers(null, "simulator-orientation-lock-change", null);
    GlobalSimulatorScreen.adjustWindowSize();
  },

  broadcastOrientationChange: function() {
    Services.obs.notifyObservers(null, "simulator-orientation-change", null);
  },

  flipScreen: function() {
    if (GlobalSimulatorScreen.screenOrientation.match(/^portrait/)) {
      GlobalSimulatorScreen.screenOrientation = "landscape-primary";
      GlobalSimulatorScreen.adjustWindowSize();
      GlobalSimulatorScreen.broadcastOrientationChange();
      return true;
    } else if (GlobalSimulatorScreen.screenOrientation.match(/^landscape/)) {
      GlobalSimulatorScreen.screenOrientation = "portrait-primary";
      GlobalSimulatorScreen.adjustWindowSize();
      GlobalSimulatorScreen.broadcastOrientationChange();
      return true;
    }

    return false;
  },

  // adjust shell, homescreen and optional app div container (if appOrigin != null)
  adjustWindowSize: function() {
    if (GlobalSimulatorScreen.screenOrientation.match(/^portrait/)) {
      GlobalSimulatorScreen.width = 320;
      GlobalSimulatorScreen.height = 480;
    } else if (GlobalSimulatorScreen.screenOrientation.match(/^landscape/)) {
      GlobalSimulatorScreen.width = 480;
      GlobalSimulatorScreen.height = 320;
    }

    debug("notify 'simulator-adjust-window-size': " +
          GlobalSimulatorScreen.width + "x" +
          GlobalSimulatorScreen.height);
    Services.obs.notifyObservers(null, "simulator-adjust-window-size", null);
  }
}
