/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

window.addEventListener("DOMContentLoaded", function() {
  let $ = document.getElementById.bind(document),
      current = $("current"),
      custom = $("custom"),
      latitudeEle = $("latitude"),
      longitudeEle = $("longitude"),
      inputOutput = window.arguments[0].wrappedJSObject,
      input = inputOutput.input,
      output = inputOutput.output,
      latitude = input.lat,
      longitude = input.lon,
      tempUseCurrent = input.useCurrent,
      setTextBoxes = function(disabled) {
        latitudeEle.disabled = disabled;
        longitudeEle.disabled = disabled;
        tempUseCurrent = disabled;
      },
      accept = function () {
        output.lat = latitudeEle.value;
        output.lon = longitudeEle.value;
        output.useCurrent = tempUseCurrent;
        window.close();
      };

  setTextBoxes(input.useCurrent);
  custom.parentElement.selectedItem = input.useCurrent ? current : custom;
  latitudeEle.value = latitude;
  longitudeEle.value = longitude;

  current.addEventListener("command", setTextBoxes.bind(this, true));
  custom.addEventListener("command", setTextBoxes.bind(this, false));
  window.addEventListener("dialogaccept", accept);
});
