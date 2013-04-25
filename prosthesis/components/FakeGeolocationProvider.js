/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The FakeGeolocationProvider relies on observing r2d2b2g:geolocation-update
 * notifications from content/shell.js, when the user changes their custom
 * coordinates, AND from content/dbg-simulator-actors.js, when the user wants
 * to use their current coordinates.  The current coordinates are never fetched
 * until the user has explicitly selected that they want to share them.
 * shell.js will send a r2d2b2g:geolocation-start notification that is observed
 * by dbg-simulator-actors.js.  dbg-simulator-actors.js uses "unsolicited"
 * events to addon/lib/remote-simulator-client.js to request the current
 * coordinates from the main Firefox process.  shell.js keeps track of the
 * latest custom coordinates to show the user when they reopen the geolocation
 * window, while FakeGeolocationProvider.js keeps track of the coordinates that
 * will be passed to any DOM calls. */

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

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
  // Default the initial custom coordinates to Mozilla's SF office.
  this.position = new FakeGeoPositionObject(37.78937, -122.38912);
  this.updateTimer = null;
  this.started = false;
  this.callback = null;

  Services.obs.addObserver((function (message) {
    this.position = new FakeGeoPositionObject(
      message.wrappedJSObject.lat,
      message.wrappedJSObject.lon
    );
  }).bind(this), "r2d2b2g:geolocation-update", false);
}

FakeGeoPositionProvider.prototype = {
  classID:          Components.ID("{a93105f2-8169-4790-a455-4701ce867aa8}"),
  QueryInterface:   XPCOMUtils.generateQI([Ci.nsIGeolocationProvider,
                                           Ci.nsIFakeListener,
                                           Ci.nsITimerCallback]),
  startup:  function() {
    if (this.started) {
      return;
    }

    this.started = true;
    this.walk();
    this.updateTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this.updateTimer.initWithCallback(this, 1000, this.updateTimer.TYPE_REPEATING_SLACK);
  },

  watch: function(c) {
    this.callback = c;
  },

  shutdown: function() {
    if (this.updateTimer) {
      this.updateTimer.cancel();
      this.updateTimer = null;
    }
    this.callback = null;
    this.started = false;
  },

  // Needed to implement the nsIGeolocationProvider interface
  setHighAccuracy: function(enable) {},

  walk: function() {
    if (this.callback) {
      this.callback.update(this.position);
    }
  },

  notify: function(timer) {
    this.walk();
  },

};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([FakeGeoPositionProvider]);
