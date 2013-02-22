/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

const Ci = Components.interfaces;
const Cc = Components.classes;

function FakeGeoCoordsObject(lat, lon, acc, alt, altacc) {
  this.latitude = lat;
  this.longitude = lon;
  this.accuracy = acc;
  this.altitude = alt;
  this.altitudeAccuracy = altacc;
}

FakeGeoCoordsObject.prototype = {
  QueryInterface:  XPCOMUtils.generateQI([Ci.nsIDOMGeoPositionCoords]),

  classInfo: XPCOMUtils.generateCI({interfaces: [Ci.nsIDOMGeoPositionCoords],
                                    flags: Ci.nsIClassInfo.DOM_OBJECT,
                                    classDescription: "wifi geo position coords object"}),
};

function FakeGeoPositionObject(lat, lng) {
  this.coords = new FakeGeoCoordsObject(lat, lng, 1, 0, 0);
  this.address = null;
  this.timestamp = Date.now();
}

FakeGeoPositionObject.prototype = {
  QueryInterface:   XPCOMUtils.generateQI([Ci.nsIDOMGeoPosition]),

  // Class Info is required to be able to pass objects back into the DOM.
  classInfo: XPCOMUtils.generateCI({interfaces: [Ci.nsIDOMGeoPosition],
                                    flags: Ci.nsIClassInfo.DOM_OBJECT,
                                    classDescription: "fake geo location position object"}),
};

function FakeGeoPositionProvider() {
  this.callback = null;
  this.currentLoc = null;
}

FakeGeoPositionProvider.prototype = {
  classID:          Components.ID("{a93105f2-8169-4790-a455-4701ce867aa8}"),
  QueryInterface:   XPCOMUtils.generateQI([Ci.nsIGeolocationProvider,
                                           Ci.nsIFakeListener,
                                           Ci.nsITimerCallback]),
  startup:  function() {
    Services.obs.notifyObservers(null, "r2d2b2g-geolocation-request", null);
    Services.obs.addObserver((function (message) {
      this.currentLoc = new FakeGeoPositionObject(message.wrappedJSObject.lat,
                                                  message.wrappedJSObject.lon);
      this.callback.update(this.currentLoc);
    }).bind(this), "r2d2b2g-geolocation-response", false);
  },

  watch: function(c) {
    this.callback = c;
  },

  notify: function () {
    this.callback.update(this.currentLoc);
  },

};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([FakeGeoPositionProvider]);
