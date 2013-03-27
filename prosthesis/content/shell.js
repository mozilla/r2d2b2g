/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const DISABLE_DEBUG = false;

let debug = DISABLE_DEBUG ? function () {} : function debugSimulator() {
  let tag = Components.stack.caller ? 
    (Components.stack.caller.filename + " L" + Components.stack.caller.lineNumber) : 
    "";
  dump(" -*- " + tag + ": " + Array.slice(arguments).join(" ") + "\n");
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
  let initialLatitude = 0,
      initialLongitude = 0,
      latitude = 0,
      longitude = 0,
      useCurrent = true,
      openWin = function openWin() {
        let params = {
          input: { lat: latitude, lon: longitude, useCurrent: useCurrent },
          output: { lat: null, lon: null, useCurrent: useCurrent }
        };

        Services.ww.openWindow(null,
          "chrome://prosthesis/content/geolocation.xul",
          "geolocationWindow",
          "chrome,dialog,menubar,centerscreen,modal",
          { wrappedJSObject: params });

        useCurrent = params.output.useCurrent;
        if (useCurrent) {
          latitude = initialLatitude;
          longitude = initialLongitude;
        } else {
          latitude = params.output.lat || latitude;
          longitude = params.output.lon || longitude;
        }
      },
      gotCoords = function gotCoords(message) {
        latitude = initialLatitude = message.wrappedJSObject.lat;
        longitude = initialLongitude = message.wrappedJSObject.lon;
        document.getElementById("geolocationButton")
                .addEventListener("click", openWin);
      },
      sendCoords = function sendCoords() {
        Services.obs.notifyObservers({
          wrappedJSObject: {
            lat: latitude,
            lon: longitude,
          }
        }, "r2d2b2g-geolocation-response", null);
      };

  Services.obs.addObserver(gotCoords, "r2d2b2g-geolocation-setup", false);
  Services.obs.addObserver(sendCoords, "r2d2b2g-geolocation-request", false);
}

