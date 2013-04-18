/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

window.addEventListener("DOMContentLoaded", function() {
  let $ = document.getElementById.bind(document),
      current = $("current"),
      custom = $("custom"),
      latitudeEle = $("latitude"),
      longitudeEle = $("longitude"),
      windowParams = window.arguments[0].wrappedJSObject,
      latitude = windowParams.lat,
      longitude = windowParams.lon,
      tempUseCurrent = windowParams.useCurrent,
      setTextBoxes = function(disabled) {
        latitudeEle.disabled = disabled;
        longitudeEle.disabled = disabled;
        tempUseCurrent = disabled;
      },
      accept = function () {
        windowParams.lat = latitudeEle.value;
        windowParams.lon = longitudeEle.value;
        windowParams.useCurrent = tempUseCurrent;
        window.close();
      };

  setTextBoxes(windowParams.useCurrent);
  custom.parentElement.selectedItem =
    windowParams.useCurrent ? current : custom;
  latitudeEle.value = latitude;
  longitudeEle.value = longitude;

  current.addEventListener("command", setTextBoxes.bind(this, true));
  custom.addEventListener("command", setTextBoxes.bind(this, false));
  window.addEventListener("dialogaccept", accept);
});
