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
    //this._aWindow = Cu.getWeakReference(aWindow);
    this._aWindow = XPCNativeWrapper.unwrap(aWindow);
    this._winUtils = this._aWindow.
      QueryInterface(Components.interfaces.nsIInterfaceRequestor)
      .getInterface(Components.interfaces.nsIDOMWindowUtils);

    let self = this;
    self._globalScreen = GlobalSimulatorScreen;
    dump("SCREEN: "+self._globalScreen.mozOrientation+"\n");
    self._onmozorientationchange = null;

    let chromeObject = {
      get top() {
        return 0;
      },
      get left() {
        return 0;
      },
      get width() {
        return self._globalScreen.width;
      },
      get height() {
        return self._globalScreen.height;
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
        return self._globalScreen.mozOrientation;
      },
      addEventListener: self._aWindow.addEventListener,
      removeEventListener: self._aWindow.removeEventListener,
      set onmozorientationchange(value) {
        if(self._onmozorientationchange) {
          self._aWindow.removeEventListener(self._onmozorientationchange);
        }
        self._onmozorientationchange = value;
        self._aWindow.addEventListener("mozorientationchange", value, true);
      },
      mozLockOrientation: function(orientation) {
        dump("REQUEST ORIENTATION LOCK: "+orientation+"\n");
        let changed = orientation !== self._globalScreen.mozOrientation;

        if (orientation.match(/^portrait/)) {
          self._globalScreen.mozOrientation = orientation;
          self._globalScreen.locked();

          if (changed) {
            self._globalScreen.adjustWindowSize();
            let evt = self._aWindow.document.createEvent('CustomEvent');
            evt.initCustomEvent('mozorientationchange', true, false, {
              orientation: orientation
            });
            //self._winUtils.dispatchDOMEventViaPresShell(window, evt, true);
            self._aWindow.dispatchEvent(evt);
          }

          return true;
        }
        if (orientation.match(/^landscape/)) {
          self._globalScreen.mozOrientation = orientation;
          self._globalScreen.locked();

          if (changed) {
            self._globalScreen.adjustWindowSize();
            let evt = self._aWindow.document.createEvent('CustomEvent');
            evt.initCustomEvent('mozorientationchange', true, false, {
              orientation: orientation
            });
            //self._winUtils.dispatchDOMEventViaPresShell(window, evt, true);
            self._aWindow.dispatchEvent(evt);
          }

          return true;
        }
        dump("orientation not found: '"+orientation+"'\n");

        return true;
      },
      mozUnlockOrientation: function() {
        dump("REQUEST ORIENTATION UNLOCK\n");
        self._globalScreen.unlocked();
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

    let contentObj = Cu.createObjectIn(this._aWindow);
    function genPropDesc(fun) {
      dump("GEN PROP DESC: "+fun+"\n");
      let value = chromeObject[fun];
      if (typeof value == "function") {
        value = value.bind(chromeObject);
      }
      return { enumerable: true, configurable: true, writable: true,
               value: value };
    }
    const properties = {
      top: genPropDesc('top'),
      left: genPropDesc('left'),
      width: genPropDesc('width'),
      height: genPropDesc('height'),
    };
    Object.defineProperties(contentObj, properties);
    Cu.makeObjectPropsNormal(contentObj);

    return contentObj;
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([SimulatorScreen]);
