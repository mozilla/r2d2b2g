/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

{
  let DEBUG = false;
  let DEBUG_PREFIX = "prosthesis: window-manager.js - ";
  let debug = DEBUG ?
    function debug() dump(DEBUG_PREFIX + Array.slice(arguments).join(" ") + "\n") :
    function() {};

  debug("loading window_manager tweaks.");

  navigator.mozSettings
    .createLock().set({'homescreen.ready': false});

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
    debug("adjustWindowSize:", width, height);
    let fixedSizeStyle = fixSizeInStyle(width, height);
    shellElement.setAttribute("style", "overflow: hidden; border: none;" +
                              fixedSizeStyle);
    homescreenElement.setAttribute("style", "-moz-box-flex: 1; overflow: hidden;" +
                                   "border: none;"+fixedSizeStyle);
  };

  Services.obs.addObserver(function (message){
    debug("received 'simulator-adjust-window-size'.");
    adjustWindowSize(GlobalSimulatorScreen.width,
                     GlobalSimulatorScreen.height);
  }, "simulator-adjust-window-size", false);

  // handling rotate button enabling/disabling
  let rotateButtonElement = document.getElementById("rotateButton");
  Services.obs.addObserver(function (message){
    debug("received 'simulator-orientation-lock-change'.");
    if (GlobalSimulatorScreen.mozOrientationLocked) {
      rotateButtonElement.classList.remove("active");
    } else {
      rotateButtonElement.classList.add("active");
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

  let FIXDisplayedApp = {
    appOrigin: null,
    homescreenLoaded: false,
    appLoaded: false
  };

  let detectHomescreen = function detectHomescreen(iframe) {
    if (iframe.appManifestURL === "app://homescreen.gaiamobile.org/manifest.webapp") {
        navigator.mozSettings
          .createLock().set({'homescreen.ready': true});
        debug("HOMESCREEN READY");
      return true;
    }

    return false;
  };

  let detectApp = function detectApp(iframe, appOrigin) {
    debug("TRY TO DETECT APP:", appOrigin);
    if (iframe.appManifestURL === appOrigin+"/manifest.webapp") {
      return true;
    }

    return false;
  };

  var appWindowObserver = new MutationSummary({
    rootNode: shell.contentBrowser.contentDocument,
    queries: [{ element: 'iframe[data-frame-origin]' }],
    callback: function(summaries) {
      debug("appWindowObserver", JSON.stringify(summaries, null, 2));
      let appOrigin = FIXDisplayedApp.appOrigin;
      summaries[0].added.forEach(function(iframe) {
        try {
          if (detectHomescreen(iframe)) {
            FIXDisplayedApp.homescreenLoaded = true;
          }
          if (detectApp(iframe, FIXDisplayedApp.appOrigin)) {
            FIXDisplayedApp.appLoaded = true;
          }
          if(FIXDisplayedApp.homescreenLoaded &&
             FIXDisplayedApp.appLoaded) {
            FIXDisplayedApp.appOrigin = null;
            fixAppOrientation(appOrigin);
            homescreen.WindowManager.setDisplayedApp(appOrigin);
          }
        } catch(e) {
          Cu.reportError(e);
        }
      });
    }
  });

  Services.obs.addObserver(function (message){
    let appOrigin = message.wrappedJSObject.appOrigin;
    debug("received 'simulator-set-displayed-app':", appOrigin);
    FIXDisplayedApp.appOrigin = appOrigin;
  }, "simulator-set-displayed-app", false);

}
