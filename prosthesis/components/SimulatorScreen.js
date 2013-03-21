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

debug("loading component definition.");

function SimulatorScreen() {}
SimulatorScreen.prototype = {
  __proto__: DOMRequestIpcHelper.prototype,
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

  _getOrigin: function(aURL) {
    let uri = Services.io.newURI(aURL, null, null);
    return uri.prePath;
  },

  _createEvent: function(name) {
    return new this._aWindow.Event(name);
  },

  _fireMozOrientationChangeEvent: function() {
    try {
      let e = this._createEvent("mozorientationchange");
      if (this._onMozOrientationChange) {
        this._onMozOrientationChange(e);
      }
      this.dispatchEvent(e);
    } catch(e) {
      Cu.reportError(e);
    }
  },

  _eventListenersByType: null,
  dispatchEvent: function(evt) {
    if (!this.initialized) {
      return;
    }

    let type = evt.type;
    var listeners = this._eventListenersByType[type];
    if (listeners) {
      for (let i = 0, len = listeners.length; i < len; i++) {
        let listener = listeners[i].listener;

        try {
          if (typeof listener == "function") {
            listener.call(this, evt);
          } else {
            listener.handleEvent(evt);
          }
        } catch (e) {
          Cu.reportError(e);
        }
      }
    }
  },

  receiveMessage: function (aMessage) {
    // ignore received messages from parent process if not visible
    if (!this._visibility || this._visibility !== "visible") {
      return;
    }

    switch (aMessage.name) {
    case "SimulatorScreen:orientationChange":
      debug("fire orientation change event to:", this.nodePrincipal.origin);
      this._fireMozOrientationChangeEvent();
      break;
    }
  },

  uninit: function () {
    debug("destroy window:", this.nodePrincipal.origin);
    this.nodePrincipal = null;
    this._chromeObject = null;
    this._eventListenersByType = null;
    this._aWindow = null;
    this._onmozOrientationChange = null;
    this.initialized = null
  },

  _updateVisibility: function(evt) {
    try {
      this._visibility = evt.target.visibilityState;
      debug("update visibility:", this.nodePrincipal.origin, this._visibility);
    } catch(e) {
      Cu.reportError(e);
    }
  },

  _initChild: function(aWindow) {
    this._eventListenersByType = {};

    if (this.initialized) {
      return this._chromeObject;
    }

    let messages = ["SimulatorScreen:orientationChange"];

    this.initialized = true;
    this.initHelper(aWindow, messages);

    let globalScreen = GlobalSimulatorScreen;

    let nodePrincipal = this.nodePrincipal = aWindow.document.nodePrincipal;
    let origin = nodePrincipal.origin;

    let els = Cc["@mozilla.org/eventlistenerservice;1"]
      .getService(Ci.nsIEventListenerService);

    els.addSystemEventListener(aWindow, "visibilitychange",
                               this._updateVisibility.bind(this),
                               /* useCapture = */ true);
    this._visibility = aWindow.document.visibilityState;

    aWindow = this._aWindow = XPCNativeWrapper.unwrap(aWindow);

    let self = this;

    this._chromeObject = {
      get top() 0,
      get left() 0,
      get availWidth() 0,
      get availHeight() 0,
      get availTop() 0,
      get availLeft() 0,
      get colorDepth() 24,
      get pixelDepth() 24,

      get width() globalScreen.width,
      get height() globalScreen.height,
      get mozOrientation() globalScreen.mozOrientation,

      get onmozorientationchange() self._onMozOrientationChange,
      set onmozorientationchange(value) {
        return self._onMozOrientationChange = value;
      },
      // These are fake implementations, will be replaced by using
      // nsJSDOMEventTargetHelper, see bug 731746
      addEventListener: function(type, listener, useCapture) {
        if (!listener) {
          return;
        }

        var listeners = self._eventListenersByType[type];
        if (!listeners) {
          listeners = self._eventListenersByType[type] = [];
        }

        useCapture = !!useCapture;
        for (let i = 0, len = listeners.length; i < len; i++) {
          let l = listeners[i];
          if (l && l.listener === listener && l.useCapture === useCapture) {
            return;
          }
        }

        listeners.push({
          listener: listener,
          useCapture: useCapture
        });
      },

      removeEventListener: function(type, listener, useCapture) {
        useCapture = !!useCapture;

        var listeners = self._eventListenersByType[type];
        if (listeners) {
          for (let i = 0, len = listeners.length; i < len; i++) {
            let l = listeners[i];
            if (l && l.listener === listener && l.useCapture === useCapture) {
              listeners.splice(i, 1);
            }
          }
        }
      },

      mozLockOrientation: function(orientation) {
        if (nodePrincipal.appStatus == nodePrincipal.APP_STATUS_NOT_INSTALLED &&
            !aWindow.document.mozFullScreen) {
          // NOTE: refused lock because app is not installed and
          // it's not in fullscreen mode
          Cu.reportError("deny mozLockOrientation:", origin,
                "is not installed or in fullscreen mode.");
          return false;
        }

        debug("mozLockOrientation:", orientation, "from", origin);
        let changed = orientation !== globalScreen.mozOrientation;

        if (orientation.match(/^portrait/)) {
          globalScreen.mozOrientation = orientation;
          globalScreen.lock();

          if (changed) {
            globalScreen.adjustWindowSize();
            self._fireMozOrientationChangeEvent();
          }

          return true;
        }
        if (orientation.match(/^landscape/)) {
          globalScreen.mozOrientation = orientation;
          globalScreen.lock();

          if (changed) {
            globalScreen.adjustWindowSize();
            self._fireMozOrientationChangeEvent();
          }

          return true;
        }
        debug("invalid orientation:", orientation);

        return false;
      },

      mozUnlockOrientation: function() {
        debug("mozOrientationUnlock from", nodePrincipal.origin);
        globalScreen.unlock();
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

    return this._chromeObject;
  },

  init: function (aWindow) {
    let appOrigin = this._getOrigin(aWindow.location.href);
    debug("init called from:", aWindow.document.nodePrincipal.origin);

    let chromeObject = this._initChild(aWindow);

    debug("\tcurrent screen orientation:", chromeObject.mozOrientation);

    return chromeObject;
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([SimulatorScreen]);
