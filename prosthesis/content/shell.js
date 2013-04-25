/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Override the B2G shell's debug function with a version that concatenates
// arguments (to simplify outputting certain kinds of messages) and always dumps
// messages (which the Add-on SDK automatically determines whether to log).
let debug = function debugSimulator() {
  dump(Array.slice(arguments).join(" ") + "\n");
};

document.getElementById("homeButton").addEventListener("mousedown", function() {
  let event = document.createEvent("KeyboardEvent");
  event.initKeyEvent("keydown", true, true, null, false, false, false, false,
                     event.DOM_VK_HOME, 0);
  window.dispatchEvent(event);
}, false);

document.getElementById("homeButton").addEventListener("mouseup", function() {
  let event = document.createEvent("KeyboardEvent");
  event.initKeyEvent("keyup", true, true, null, false, false, false, false,
                     event.DOM_VK_HOME, 0);
  window.dispatchEvent(event);
}, false);

document.getElementById("rotateButton").addEventListener("click", function() {
  Cu.import("resource://prosthesis/modules/GlobalSimulatorScreen.jsm");
  GlobalSimulatorScreen.flipScreen();
}, false);

{
  // Default to Mozilla's SF office.
  let latitude = 37.78937,
      longitude = -122.38912,
      useCurrent = false,
      sendCoords = function sendCoords() {
        debug("Custom coordinates specified in shell, updating provider");
        Services.obs.notifyObservers({
          wrappedJSObject: {
            lat: latitude,
            lon: longitude,
          }
        }, "r2d2b2g:geolocation-update", null);
      },
      openWin = function openWin() {
        let params = {
          lat: latitude,
          lon: longitude,
          useCurrent: useCurrent
        };

        Services.ww.openWindow(null,
          "chrome://prosthesis/content/geolocation.xul",
          "geolocationWindow",
          "chrome,dialog,menubar,centerscreen,modal",
          { wrappedJSObject: params });

        useCurrent = params.useCurrent;
        if (useCurrent) {
          debug("Current coordinates requested in shell, notifying Simulator");
          Services.obs.notifyObservers(null, "r2d2b2g:geolocation-start", null);
        } else {
          latitude = params.lat;
          longitude = params.lon;
          // Send custom coordinates to FakeGeolocation
          sendCoords();
        }
      };

  document.getElementById("geolocationButton")
          .addEventListener("click", openWin);
}

function simulatorAppUpdate() {
  let wm = shell.contentBrowser.contentWindow.wrappedJSObject.
           WindowManager;

  let origin = wm.getCurrentDisplayedApp().origin;

  Services.obs.notifyObservers({
    wrappedJSObject: {
      origin: origin,
      appId: DOMApplicationRegistry._appId(origin)
    }
  }, "r2d2b2g:app-update", null);
}
