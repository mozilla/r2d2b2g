/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* The FakeGeolocationProvider relies on observing r2d2b2g:update-geolocation
 * notifications from content/shell.js, when the user changes their custom
 * coordinates, AND from content/dbg-geolocation-actors.js, when the user wants
 * to use their current coordinates.  The current coordinates are never fetched
 * until the user has explicitly selected that they want to share them.
 * shell.js will send a r2d2b2g:enable-real-geolocation notification that is
 * observed by dbg-geolocation-actors.js.  dbg-geolocation-actors.js uses
 * "unsolicited" events to addon/lib/remote-simulator-client.js to request the
 * current coordinates from the main Firefox process.  shell.js keeps track of
 * the latest custom coordinates to show the user when they reopen the
 * geolocation window, while FakeGeolocationProvider.js keeps track of the
 * coordinates that will be passed to any DOM calls. */

const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

function FakeGeoPositionCoords(lat, lon, acc, alt, altacc) {
  this.latitude = lat;
  this.longitude = lon;
  this.accuracy = acc;
  this.altitude = alt;
  this.altitudeAccuracy = altacc;
}

FakeGeoPositionCoords.prototype = {
  QueryInterface:  XPCOMUtils.generateQI([Ci.nsIDOMGeoPositionCoords]),

  classInfo: XPCOMUtils.generateCI({interfaces: [Ci.nsIDOMGeoPositionCoords],
                                    flags: Ci.nsIClassInfo.DOM_OBJECT,
                                    classDescription: "FakeGeoPositionCoords"}),
};

function FakeGeoPosition(lat, lon) {
  this.coords = new FakeGeoPositionCoords(lat, lon, 1, 0, 0);
  this.address = null;
  this.timestamp = Date.now();
}

FakeGeoPosition.prototype = {
  QueryInterface:   XPCOMUtils.generateQI([Ci.nsIDOMGeoPosition]),

  // Class Info is required to be able to pass objects back into the DOM.
  classInfo: XPCOMUtils.generateCI({interfaces: [Ci.nsIDOMGeoPosition],
                                    flags: Ci.nsIClassInfo.DOM_OBJECT,
                                    classDescription: "FakeGeoPosition"}),
};

function FakeGeolocationProvider() {
  // Default the initial custom coordinates to Mozilla's SF office.
  this.position = new FakeGeoPosition(37.78937, -122.38912);
  this.watcher = null;

  Services.obs.addObserver((function onUpdateGeolocation(message) {
    let { lat, lon } = message.wrappedJSObject;
    dump("FakeGeolocationProvider received update " + lat + "x" + lon + "\n");
    this.position = new FakeGeoPosition(lat, lon);
    this.update();
  }).bind(this), "r2d2b2g:update-geolocation", false);
}

FakeGeolocationProvider.prototype = {
  classID:          Components.ID("{a93105f2-8169-4790-a455-4701ce867aa8}"),
  QueryInterface:   XPCOMUtils.generateQI([Ci.nsIGeolocationProvider]),

  // startup and setHighAccuracy both need to be defined to implement
  // the nsIGeolocationProvider interface, even though we don't actually
  // implement them.
  startup: function() {},
  setHighAccuracy: function(enable) {},

  watch: function(callback) {
    this.watcher = callback;

    // Update the watcher with the most recent position as soon as possible.
    // We have to do this after a timeout because the nsGeolocationService
    // watcher doesn't expect an update until after this function returns,
    // so it won't receive one until then.
    Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer).initWithCallback(
      (function() this.update()).bind(this), 0, Ci.nsITimer.TYPE_ONE_SHOT
    );
  },

  update: function() {
    if (this.watcher) {
      this.watcher.update(this.position);
    }
  },

  shutdown: function() {
    this.watcher = null;
  },
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([FakeGeolocationProvider]);
