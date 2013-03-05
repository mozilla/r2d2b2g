/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = [ "GlobalSimulatorScreen" ];

const Cc = Components.classes;
const Ci = Components.interfaces;

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

      let evt = window.document.createEvent('CustomEvent');
      evt.initCustomEvent('mozorientationchange', true, false, {
        orientation: GlobalSimulatorScreen.mozOrientation
      });
      iframe.contentWindow.dispatchEvent(evt);

      return true;
    } else if (GlobalSimulatorScreen.mozOrientation.match(/^landscape/)) {
      GlobalSimulatorScreen.mozOrientation = "portrait-primary";
      GlobalSimulatorScreen.adjustWindowSize();

      let evt = window.document.createEvent('CustomEvent');
      evt.initCustomEvent('mozorientationchange', true, false, {
        orientation: GlobalSimulatorScreen.mozOrientation
      });
      iframe.contentWindow.dispatchEvent(evt);

      return true;
    }

    return false;
  },

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
    dump("ROTATE: " + width + " " + height + "\n");

    let homescreen = document.getElementById("homescreen");
    let shell = document.getElementById("shell");
    shell.setAttribute("style", "overflow: hidden;");
    homescreen.setAttribute("style", "-moz-box-flex: 1; overflow: hidden;");

    homescreen.contentWindow.onresize = function () {
      // WORKAROUND: keep the simulator window size
      window.resizeTo(parseInt(width), parseInt(height));
    };

    dump("RESIZE TO: " + width + " "+height + "\n");
    GlobalSimulatorScreen._fixSizeInStyle(homescreen.style, width, height);
    GlobalSimulatorScreen._fixSizeInStyle(shell.style, width, height);
  },

  _fixSizeInStyle: function(style, width, height) {
    style["width"] = style["min-width"] = style["max-width"] = width;
    style["height"] = style["min-height"] = style["max-height"] = height;
  }
}
