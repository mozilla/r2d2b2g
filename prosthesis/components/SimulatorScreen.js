/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let Ci = Components.interfaces;
let Cc = Components.classes;
let Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

Cu.import("resource://prosthesis/modules/GlobalSimulatorScreen.jsm");

dump("SIMULATOR SCREEN COMPONENT LOADING\n");

function SimulatorScreen() {}
SimulatorScreen.prototype = {
  classID:         Components.ID("{c83c02c0-5d43-4e3e-987f-9173b313e880}"),
  QueryInterface:  XPCOMUtils.generateQI([Ci.nsIDOMGlobalPropertyInitializer,
                                          Ci.nsISupportsWeakReference]),
  classInfo: XPCOMUtils.generateCI({
    classID: Components.ID("{c83c02c0-5d43-4e3e-987f-9173b313e880}"),
    contractID: "@mozilla.org/simulator-screen;1",
    classDescription: "mozSimulatorScreen",
    interfaces: [Ci.nsIDOMGlobalPropertyInitializer,
                 Ci.nsISupportsWeakReference],
    flags: Ci.nsIClassInfo.DOM_OBJECT
  }),

  init: function (aWindow) {
    dump("SIMULATOR SCREEN INIT CALLED\n");

    let aWindow = XPCNativeWrapper.unwrap(aWindow);
    let globalScreen = GlobalSimulatorScreen;

    dump("SCREEN: " + globalScreen.mozOrientation + "\n");

    let chromeObject = {
      get top() {
        return 0;
      },
      get left() {
        return 0;
      },
      get width() {
        return globalScreen.width;
      },
      get height() {
        return globalScreen.height;
      },
      get colorDepth() {
        return 24;
      },
      get pixelDepth() {
        return 24;
      },
      get availWidth() {
        return 0;
      },
      get availHeight() {
        return 0;
      },
      get availTop() {
        return 0;
      },
      get availLeft() {
        return 0;
      },
      get mozOrientation() {
        return globalScreen.mozOrientation;
      },
      addEventListener: aWindow.addEventListener,
      removeEventListener: aWindow.removeEventListener,
      _onmozorientationchange: null,
      get onmozorientationchange() {
        return this._onmozorientationchange;
      },
      set onmozorientationchange(value) {
        if (this._onmozorientationchange) {
          aWindow.removeEventListener(this._onmozorientationchange);
        }
        this._onmozorientationchange = value;
        aWindow.addEventListener("mozorientationchange", value, true);

        return value;
      },
      mozLockOrientation: function(orientation) {
        dump("REQUEST ORIENTATION LOCK: " + orientation + "\n");
        let changed = orientation !== globalScreen.mozOrientation;

        if (orientation.match(/^portrait/)) {
          globalScreen.mozOrientation = orientation;
          globalScreen.locked();

          if (changed) {
            globalScreen.adjustWindowSize();
            let evt = aWindow.document.createEvent('CustomEvent');
            evt.initCustomEvent('mozorientationchange', true, false, {
              orientation: orientation
            });
            aWindow.dispatchEvent(evt);
          }

          return true;
        }
        if (orientation.match(/^landscape/)) {
          globalScreen.mozOrientation = orientation;
          globalScreen.locked();

          if (changed) {
            globalScreen.adjustWindowSize();
            let evt = aWindow.document.createEvent('CustomEvent');
            evt.initCustomEvent('mozorientationchange', true, false, {
              orientation: orientation
            });
            aWindow.dispatchEvent(evt);
          }

          return true;
        }
        dump("orientation not found: '" + orientation + "'\n");

        return true;
      },
      mozUnlockOrientation: function() {
        dump("REQUEST ORIENTATION UNLOCK\n");
        globalScreen.unlocked();
        return true;
      },
      __exposedProps__: {
        top: "r",
        left: "r",
        width: "r",
        height: "r",
        colorDepth: "r",
        pixelDepth: "r",
        availWidth: "r",
        availHeight: "r",
        availLeft: "r",
        availTop: "r",
        mozOrientation: "r",
        onmozorientationchange: "rw",
        mozLockOrientation: "r",
        mozUnlockOrientation: "r",
        addEventListener: "r",
        removeEventListener: "r",
      }
    };

    return chromeObject;
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([SimulatorScreen]);
