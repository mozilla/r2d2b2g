/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

try {
  let DEBUG = true;
  let DEBUG_PREFIX = "prosthesis: window_manager.js - ";
  let debug = DEBUG ? function debug(msg) dump(DEBUG_PREFIX+msg+"\n") : function() {};

  debug("loading window_manager tweaks.");

  Cu.import("resource://prosthesis/modules/GlobalSimulatorScreen.jsm");

  let homescreen = shell.contentBrowser.contentWindow.wrappedJSObject;

  let shellElement = document.getElementById("shell");
  let homescreenElement = document.getElementById("homescreen");

  // adjust window size
  let fixSizeInStyle = function(width, height) {
    return ["width: ", width, "px;",
            "min-width: ", width, "px;",
            "max-width: ", width, "px;",
            "height: ", height, "px;",
            "min-height: ", height, "px;",
            "max-height: ", height, "px;"].join("");
  };

  let adjustWindowSize = function(width, height) {
    debug("adjustWindowSize: " + width + " " + height + "\n");
    let fixedSizeStyle = fixSizeInStyle(width, height);
    shellElement.setAttribute("style", "overflow: hidden; border: none;" +
                              fixedSizeStyle);
    homescreenElement.setAttribute("style", "-moz-box-flex: 1; overflow: hidden;" +
                                   "border: none;"+fixedSizeStyle);
  };

  Services.obs.addObserver(function (message){
    try {
      debug("received 'simulator-adjust-window-size'.");
      adjustWindowSize(GlobalSimulatorScreen.width,
                       GlobalSimulatorScreen.height);
    } catch(e) {
      debug(["EXCEPTION:", e, e.fileName, e.lineNumber].join(' '));
    }
  }, "simulator-adjust-window-size", false);

  // handling rotate button enabling/disabling
  let rotateButtonElement = document.getElementById("rotateButton");
  Services.obs.addObserver(function (message){
    try {
      debug("received 'simulator-orientation-lock-change'.");
      if (GlobalSimulatorScreen.mozOrientationLocked) {
        rotateButtonElement.classList.remove("active");
      } else {
        rotateButtonElement.classList.add("active");
      }
    } catch(e) {
      debug(["EXCEPTION:", e, e.fileName, e.lineNumber].join(' '));
    }
  }, "simulator-orientation-lock-change", false);

  // WORKAROUND: keep the simulator window size
  let TOOLBOX_H = document.querySelector("toolbox").clientHeight;
  homescreen.addEventListener("resize", function() {
    debug("homescreen resize event received, resize window to fit.");
    let height = window.fullScreen ?
      GlobalSimulatorScreen.height : GlobalSimulatorScreen.height+TOOLBOX_H;
    window.resizeTo(GlobalSimulatorScreen.width, height);
  }, true);

  // WORKAROUND: force setDisplayedApp
  let getAppOrientation = function(appOrigin) {
    let appId = DOMApplicationRegistry._appId(appOrigin);
    let manifest = DOMApplicationRegistry._manifestCache[appId];

    if (manifest && manifest.orientation &&
        isValidOrientation(manifest.orientation)) {
      return manifest.orientation;
    }
  };

  let isValidOrientation = function (orientation) {
    return ["portrait", "portrait-primary", "portrait-secondary",
            "landscape", "landscape-primary", "landscape-secondary"].
            indexOf(orientation) > -1;
  };

  let fixAppOrientation = function(appOrigin) {
    let orientation = getAppOrientation(appOrigin);
    if (orientation) {
      GlobalSimulatorScreen.mozOrientation = orientation;
      GlobalSimulatorScreen.adjustWindowSize();
    }

    // adjust simulator window size orientation
    // on app without manifests (website)
    adjustWindowSize(GlobalSimulatorScreen.width,
                     GlobalSimulatorScreen.height);
  };

  Services.scriptloader.loadSubScript("chrome://prosthesis/content/mutation_summary.js");
  let FIXDisplayedApp = {
    appOrigin: null
  };
  var appWindowObserver = new MutationSummary({
    rootNode: shell.contentBrowser.contentDocument,
    queries: [{ element: 'iframe[data-frame-origin]' }],
    callback: function(summaries) {
      try {
        let appOrigin = FIXDisplayedApp.appOrigin;
        debug("PRE: " + FIXDisplayedApp.appOrigin);
        if(appOrigin) {
          FIXDisplayedApp.appOrigin = null;
          let appIframe = homescreen.document.
            querySelector("iframe[data-frame-origin='" + appOrigin + "']");
        debug("POST: " + FIXDisplayedApp.appOrigin);
          if (appIframe) {
            debug("detected iframe for app: " + appOrigin);
            debug("\tfixAppOrientation");
            fixAppOrientation(appOrigin);
            debug("\tsetDisplayedApp");
            try {
              homescreen.WindowManager.setDisplayedApp(appOrigin);
            } catch(e) {
              debug(["EXCEPTION:", e, e.fileName, e.lineNumber].join(' '));
              // retry once
              debug("retry...");
              homescreen.WindowManager.setDisplayedApp(appOrigin);
            }
          }
        }
      } catch(e) {
        debug(["EXCEPTION:", e, e.fileName, e.lineNumber].join(' '));
      }
    }
  });

  Services.obs.addObserver(function (message){
    try {
      let appOrigin = message.wrappedJSObject.appOrigin;
      debug("received 'simulator-set-displayed-app': " + appOrigin);

      FIXDisplayedApp.appOrigin = appOrigin;
    } catch(e) {
      debug(["EXCEPTION:", e, e.fileName, e.lineNumber].join(' '));
    }
  }, "simulator-set-displayed-app", false);

} catch(e) {
  dump(["EXCEPTION:", e, e.fileName, e.lineNumber].join(' ')+"\n");
}
