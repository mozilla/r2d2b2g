/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

debug("loading window_manager tweaks.");

Cu.import("resource://prosthesis/modules/GlobalSimulatorScreen.jsm");

navigator.mozSettings
  .createLock().set({'homescreen.ready': false});

let SimulatorWindowManager = {
  init: function() {
    this._initObservers();
    this._adjustWindowSize(GlobalSimulatorScreen.width,
                           GlobalSimulatorScreen.height);
  },
  get _documentElement() document.documentElement,
  get _containerElement() document.getElementById("container"),
  get _rotateButtonElement() document.getElementById("rotateButton"),
  _fixSizeInStyle: function(width, height) {
    return ["width: ", width, "px;",
            "min-width: ", width, "px;",
            "max-width: ", width, "px;",
            "height: ", height, "px;",
            "min-height: ", height, "px;",
            "max-height: ", height, "px;"].join("");
  },
  _adjustWindowSize: function(width, height) {
    debug("adjustWindowSize:", width, height);

    // For some reason, we also have to resize the system app iframe
    // even if its original style is width:100%, height: 100%
    this._containerElement.setAttribute("style", "overflow: hidden;" +
      "border: none;" + this._fixSizeInStyle(width, height));

    // If the current app doesn't supports landscape mode,
    // still resize the window, but rotate its frame so that
    // it is displayed rotated on the side
    let shouldRotate =
      GlobalSimulatorScreen.mozOrientationLocked &&
      GlobalSimulatorScreen.mozOrientation.match(/^landscape/);

    if (shouldRotate) {
      let w = width;
      width = height;
      height = w;
    }

    // resize the xul:box that contain the system app iframe
    shell.contentBrowser.setAttribute("style", "overflow: hidden;" +
      "border: none;" + this._fixSizeInStyle(width, height));

    if (shouldRotate) {
      let shift = Math.floor(Math.abs(width-height)/2);
      shell.contentBrowser.style.transform = "rotate(0.25turn) translate(-" + shift + "px, -" + shift + "px)";
    } else {
      shell.contentBrowser.style.transform = "";
    }

    // The xul window doesn't correctly resize by itself...
    window.sizeToContent();
  },
  _initObservers: function() {

    Services.obs.addObserver((function (message){
      debug("received 'simulator-adjust-window-size'.");
      this._adjustWindowSize(GlobalSimulatorScreen.width,
                             GlobalSimulatorScreen.height);
    }).bind(this), "simulator-adjust-window-size", false);

    // handling rotate button enabling/disabling
    Services.obs.addObserver((function (message){
      debug("received 'simulator-orientation-lock-change'.");
      if (GlobalSimulatorScreen.mozOrientationLocked) {
        this._rotateButtonElement.classList.remove("active");
      } else {
        this._rotateButtonElement.classList.add("active");
      }
    }).bind(this), "simulator-orientation-lock-change", false);
  },
};

debug("init window_manager tweaks.");
try {
  SimulatorWindowManager.init();
} catch(e) {
  Cu.reportError(e);
}
