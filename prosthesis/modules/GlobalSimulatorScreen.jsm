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

this.GlobalSimulatorScreen = {
  width: 320,
  height: 480,
  mozOrientationLocked: false,
  mozOrientation: "portrait-primary",

  get window() {
    if (this._window) {
      return this._window;
    }

    this._window = XPCNativeWrapper.unwrap(
      Cc['@mozilla.org/appshell/window-mediator;1'].
        getService(Ci.nsIWindowMediator).
        getMostRecentWindow("navigator:browser")
    );

    return this._window;
  },  

  get rotateButton() {
    if (this._rotateButtonEl) {
      return this._rotateButtonEl;
    }

    let window = GlobalSimulatorScreen.window;
    this._rotateButtonEl = window.document.getElementById("rotateButton");

    return this._rotateButtonEl;
  },

  lock: function() {
    GlobalSimulatorScreen.mozOrientationLocked = true;
    GlobalSimulatorScreen.rotateButton.classList.remove("active");
  },

  unlock: function() {
    GlobalSimulatorScreen.mozOrientationLocked = false;
    GlobalSimulatorScreen.rotateButton.classList.add("active");
  },

  broadcastOrientationChange: function() {
    dump("BROADCAST ORIENTATION\n");
    try {
      ppmm.broadcastAsyncMessage("SimulatorScreen:orientationChange", { });
    } catch(e) {
      dump("\n\nEXCEPTION: "+e+"\n\n");
    }
  },

  fixAppOrientation: function(appOrigin) {
    let reg = this.window.DOMApplicationRegistry;

    // DOMApplicationRegistry is not ready
    if (!reg) {
      return;
    }
    
    let appId = reg._appId(appOrigin);
    let manifest = reg._manifestCache[appId];

    if (manifest && manifest.orientation && 
        this._isValidOrientation(manifest.orientation)) {
      this.mozOrientation = manifest.orientation;
      this.lock();
    }

    // adjust simulator window size
    this.adjustWindowSize();
  },

  _isValidOrientation: function (orientation) {
    return ["portrait", "portrait-primary", "portrait-secondary",
            "landscape", "landscape-primary", "landscape-secondary"].
            indexOf(orientation) > -1;
  },

  flipScreen: function() {
    if (GlobalSimulatorScreen.mozOrientationLocked) {
      // disabled
      return false;
    }

    let window = GlobalSimulatorScreen.window
    let homescreen = XPCNativeWrapper.unwrap(
      window.document.getElementById("homescreen").contentWindow
    );
    let iframe = homescreen.WindowManager.getCurrentDisplayedApp().iframe;

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
    let window = GlobalSimulatorScreen.window
    let document = window.document;

    if (GlobalSimulatorScreen.mozOrientation.match(/^portrait/)) {
      GlobalSimulatorScreen.width = 320;
      GlobalSimulatorScreen.height = 480;
    } else if (GlobalSimulatorScreen.mozOrientation.match(/^landscape/)) {
      GlobalSimulatorScreen.width = 480;
      GlobalSimulatorScreen.height = 320;
    }

    let width = GlobalSimulatorScreen.width+"px";
    let height = GlobalSimulatorScreen.height+"px";
    let fixedSizeStyle = GlobalSimulatorScreen._fixSizeInStyle(width, height);

    dump("ROTATE: " + width + " " + height + "\n");

    let shell = document.getElementById("shell");
    shell.setAttribute("style", "overflow: hidden; border: none;" + 
                                "width: auto; height: auto;");
    let homescreen = document.getElementById("homescreen");
    homescreen.setAttribute("style", "-moz-box-flex: 1; overflow: hidden;" + 
                                     "border: none;"+fixedSizeStyle);
  },

  _fixSizeInStyle: function(width, height) {
    return ["width: ", width, ";", 
            "min-width: ", width, ";",
            "max-width: ", width, ";",
            "height: ", height, ";", 
            "min-height: ", height, ";",
            "max-height: ", height, ";"].join("");
  }
}
