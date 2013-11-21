/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let Ci = Components.interfaces;
let Cc = Components.classes;
let Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/DOMRequestHelper.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "GlobalSimulatorScreen",
                                  "resource://prosthesis/modules/GlobalSimulatorScreen.jsm");

let DEBUG = false;
let DEBUG_PREFIX = "prosthesis: SimulatorScreen.js - ";
let debug = DEBUG ?
  function debug() dump(DEBUG_PREFIX + Array.slice(arguments) + "\n") :
  function() {};

function fireOrientationEvent(window) {
  let e = window.Event("mozorientationchange");
  window.screen.dispatchEvent(e);
}

function hookScreen(window) {
  let nodePrincipal = window.document.nodePrincipal;
  let origin = nodePrincipal.origin;
  if (nodePrincipal.appStatus == nodePrincipal.APP_STATUS_NOT_INSTALLED) {
    Cu.reportError("deny mozLockOrientation:", origin,
            "is not installed");
    return;
  }
  window.wrappedJSObject.screen.mozLockOrientation = function (orientation) {
    if (window.document.mozFullScreen) {
      // NOTE: refused lock because app is not installed and
      // it's not in fullscreen mode
      Cu.reportError("deny mozLockOrientation:", origin,
            "in fullscreen mode.");
      return false;
    }

    debug("mozLockOrientation:", orientation, "from", origin);
    let changed = orientation !== GlobalSimulatorScreen.mozOrientation;

    if (orientation.match(/^portrait/)) {
      GlobalSimulatorScreen.mozOrientation = orientation;
      GlobalSimulatorScreen.lock();

      if (changed) {
        GlobalSimulatorScreen.adjustWindowSize();
        fireOrientationEvent(window);
      }

      return true;
    }
    if (orientation.match(/^landscape/)) {
      GlobalSimulatorScreen.mozOrientation = orientation;
      GlobalSimulatorScreen.lock();

      if (changed) {
        GlobalSimulatorScreen.adjustWindowSize();
        fireOrientationEvent(window);
      }

      return true;
    }
    debug("invalid orientation:", orientation);

    return false;
  };

  window.wrappedJSObject.screen.mozUnlockOrientation = function() {
    debug("mozOrientationUnlock from", origin);
    GlobalSimulatorScreen.unlock();
    return true;
  };

  Object.defineProperty(window.wrappedJSObject.screen, "width", {
    get: function () GlobalSimulatorScreen.width
  });
  Object.defineProperty(window.wrappedJSObject.screen, "height", {
    get: function () GlobalSimulatorScreen.height
  });
  Object.defineProperty(window.wrappedJSObject.screen, "mozOrientation", {
    get: function () GlobalSimulatorScreen.mozOrientation
  });
}

function SimulatorScreen() {}
SimulatorScreen.prototype = {
  classID:         Components.ID("{c83c02c0-5d43-4e3e-987f-9173b313e880}"),
  QueryInterface:  XPCOMUtils.generateQI([Ci.nsIObserver,
                                          Ci.nsISupportsWeakReference]),
  _windows: new Set(),

  observe: function (subject, topic, data) {
    switch (topic) {
      case 'profile-after-change': {
        Services.obs.addObserver(this, 'document-element-inserted', false);
        Services.obs.addObserver(this, 'simulator-orientation-change', false);
        break;
      }
      case 'document-element-inserted': {
        let window = subject.defaultView;
        if (!window)
          return;
        hookScreen(window);
        let self = this;
        window.addEventListener("unload", function unload() {
          window.removeEventListener("unload", unload);
          self._windows.delete(window);
        });
        break;
      }
      case 'simulator-orientation-change': {
        this._windows.forEach(fireOrientationEvent);
        break;
      }
    }
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([SimulatorScreen]);
