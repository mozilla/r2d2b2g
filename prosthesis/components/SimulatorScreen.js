/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let Ci = Components.interfaces;
let Cc = Components.classes;
let Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/DOMRequestHelper.jsm");

Cu.import("resource://prosthesis/modules/GlobalSimulatorScreen.jsm");

dump("SIMULATOR SCREEN COMPONENT LOADING\n");

XPCOMUtils.defineLazyServiceGetter(this, "cpmm",
                                   "@mozilla.org/childprocessmessagemanager;1",
                                   "nsIMessageListenerManager");

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

  _fixAppIframe: function(appOrigin) {
    Services.obs.notifyObservers(
      {
        wrappedJSObject: {
          appOrigin: appOrigin
        }
      }, 
      "simulator-fix-app-iframe", 
      null);
  },

  _createEvent: function(name) {
    return new this._aWindow.Event(name);
  },
 _fireMozOrientationChangeEvent: function() {
   try {
    let e = this._createEvent("mozorientationchange");
    if (this._onMozOrientationChange) {
      dump("ONMOZ\n");
      this._onMozOrientationChange(e);
    }
     dump("DISPATCH\n");
    this.dispatchEvent(e);
   } catch(e) {
     dump("\n\nEXCEPTION: "+e+" "+e.fileName+" "+e.lineNumber+"\n\n");
   }
  },


  dispatchEvent: function(evt) {
    if (!this._eventListenersByType) {
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
          } else if (listener && listener.handleEvent &&
                     typeof listener.handleEvent == "function") {
            listener.handleEvent(evt);
          }
        } catch (e) {
          debug("Exception is caught: " + e);
        }
      }
    }
  },

  receiveMessage: function (aMessage) {
    if (!this._visibility) {
      dump("INVISIBLE RECEIVED ORIENTATION 2: " + this.nodePrincipal.origin + "\n");
      return;
    }
    dump("RECEIVED ORIENTATION 2: " + this.nodePrincipal.origin + "\n");
    switch (aMessage.name) {
    case "SimulatorScreen:orientationChange":
      this._fireMozOrientationChangeEvent();
      break;
    }
  },

  uninit: function () {
    dump("SIMULATOR SCREEN DESTROY CALLED: " + this.nodePrincipal.origin + "\n");    
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
    } catch(e) {
      dump("UV EXC: "+ [e,e.fileName,e.lineNumber].join(" ") + "\n");
    }
  },

  _initChild: function(aWindow) {
    if (this.initialized) {
      return this._chromeObject;
    }
    let messages = ["SimulatorScreen:orientationChange"];
    
    this.initialized = true;    
    this.initHelper(aWindow, messages);

    let globalScreen = GlobalSimulatorScreen;
    let nodePrincipal = this.nodePrincipal = aWindow.document.nodePrincipal;

    dump("SIMULATOR SCREEN INIT CALLED: " + nodePrincipal.origin + "\n");

    let els = Cc["@mozilla.org/eventlistenerservice;1"]
      .getService(Ci.nsIEventListenerService);
    
    els.addSystemEventListener(aWindow, "visibilitychange",
                               this._updateVisibility.bind(this),
                               /* useCapture = */ true);
    this._visibility = aWindow.document.visibilityState;

    // fix orientation based on app manifest and
    // purge old app iframes (because a rapid kill-run sequence 
    // leave old iframes)
    let appOrigin = this._getOrigin(aWindow.location.href);
    this._fixAppIframe(appOrigin);

    aWindow = this._aWindow = XPCNativeWrapper.unwrap(aWindow);

    dump("SCREEN ORIENTATION: " + globalScreen.mozOrientation + "\n");

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
        if (!self._eventListenersByType) {
          self._eventListenersByType = {};
        }

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
        if (!self._eventListenersByType) {
          return;
        }

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
          dump("DENY LOCK ORIENTATION FROM NOT INSTALLED: " + nodePrincipal.origin + "\n");
          return false;
        }

        dump("REQUEST ORIENTATION LOCK: " + orientation + " from " + 
             appOrigin + "\n");
        let changed = orientation !== globalScreen.mozOrientation;

        if (orientation.match(/^portrait/)) {
          globalScreen.mozOrientation = orientation;
          globalScreen.lock();

          if (changed) {
            globalScreen.adjustWindowSize();
            this._fireMozOrientationChangeEvent();
          }

          return true;
        }
        if (orientation.match(/^landscape/)) {
          globalScreen.mozOrientation = orientation;
          globalScreen.lock();

          if (changed) {
            globalScreen.adjustWindowSize();
            this._fireMozOrientationChangeEvent();
          }

          return true;
        }
        dump("orientation not found: '" + orientation + "'\n");

        return true;
      },

      mozUnlockOrientation: function() {
        dump("REQUEST ORIENTATION UNLOCK: " + appOrigin + "\n");
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
    return this._initChild(aWindow);
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([SimulatorScreen]);
