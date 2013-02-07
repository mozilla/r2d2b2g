/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
Components.utils.import("resource://gre/modules/Services.jsm");

const Ci = Components.interfaces;
const Cc = Components.classes;

const cLocations = [
  { lat: 25.032694444444445, lon: 121.56700000000001 },
  { lat: 25.032722222222223, lon: 121.56730555555555 },
  { lat: 25.032722222222223, lon: 121.56752777777777 },
  { lat: 25.032722222222223, lon: 121.56774999999999 },
  { lat: 25.03275, lon: 121.56797222222222 },
  { lat: 25.032722222222223, lon: 121.56813888888888 },
  { lat: 25.032972222222224, lon: 121.56813888888888 },
  { lat: 25.032972222222224, lon: 121.56794444444445 },
  { lat: 25.032972222222224, lon: 121.56766666666667 },
  { lat: 25.032972222222224, lon: 121.56741666666666 },
  { lat: 25.032972222222224, lon: 121.56716666666667 },
  { lat: 25.033, lon: 121.56688888888888 },
  { lat: 25.033, lon: 121.56663888888887 },
  { lat: 25.033, lon: 121.56638888888888 },
  { lat: 25.033, lon: 121.56613888888889 },
  { lat: 25.033, lon: 121.56594444444444 },
  { lat: 25.03302777777778, lon: 121.56561111111111 },
  { lat: 25.033194444444444, lon: 121.56555555555555 },
  { lat: 25.033416666666668, lon: 121.56558333333332 },
  { lat: 25.03366666666667, lon: 121.56558333333332 },
  { lat: 25.033833333333337, lon: 121.56558333333332 },
  { lat: 25.03397222222222, lon: 121.56558333333332 },
  { lat: 25.03425, lon: 121.56555555555555 },
  { lat: 25.034444444444446, lon: 121.56558333333332 },
  { lat: 25.03461111111111, lon: 121.56558333333332 },
  { lat: 25.03477777777778, lon: 121.56555555555555 },
  { lat: 25.035, lon: 121.56555555555555 },
  { lat: 25.035194444444446, lon: 121.56552777777777 },
  { lat: 25.035416666666666, lon: 121.56552777777777 },
  { lat: 25.035583333333335, lon: 121.56547222222223 },
  { lat: 25.035694444444445, lon: 121.56552777777777 },
  { lat: 25.035861111111114, lon: 121.56552777777777 },
  { lat: 25.036027777777782, lon: 121.56552777777777 },
  { lat: 25.03622222222222, lon: 121.56552777777777 },
  { lat: 25.036444444444445, lon: 121.56552777777777 },
  { lat: 25.03666666666667, lon: 121.56555555555555 },
  { lat: 25.036861111111115, lon: 121.56555555555555 },
  { lat: 25.037138888888894, lon: 121.56555555555555 },
  { lat: 25.037333333333333, lon: 121.56555555555555 },
  { lat: 25.037555555555556, lon: 121.56558333333332 },
  { lat: 25.037722222222225, lon: 121.56558333333332 },
  { lat: 25.037944444444445, lon: 121.56561111111111 },
  { lat: 25.038194444444446, lon: 121.56561111111111 },
  { lat: 25.03836111111111, lon: 121.56561111111111 },
  { lat: 25.038555555555558, lon: 121.56563888888888 },
  { lat: 25.03875, lon: 121.56563888888888 },
  { lat: 25.038944444444446, lon: 121.56563888888888 },
  { lat: 25.039, lon: 121.56547222222223 },
  { lat: 25.039, lon: 121.56519444444444 },
  { lat: 25.039, lon: 121.565 },
  { lat: 25.039, lon: 121.56477777777778 },
  { lat: 25.039, lon: 121.56455555555556 },
  { lat: 25.039, lon: 121.56436111111111 },
  { lat: 25.039, lon: 121.5641111111111 },
  { lat: 25.03902777777778, lon: 121.56388888888888 },
  { lat: 25.039, lon: 121.56369444444445 },
  { lat: 25.03880555555556, lon: 121.56369444444445 },
  { lat: 25.03863888888889, lon: 121.56372222222222 },
  { lat: 25.03847222222222, lon: 121.56372222222222 },
  { lat: 25.03830555555556, lon: 121.56369444444445 },
  { lat: 25.038111111111114, lon: 121.56372222222222 },
  { lat: 25.037916666666668, lon: 121.56369444444445 },
  { lat: 25.037722222222225, lon: 121.56369444444445 },
  { lat: 25.0375, lon: 121.56369444444445 },
  { lat: 25.037333333333333, lon: 121.56369444444445 },
  { lat: 25.037111111111113, lon: 121.56369444444445 },
  { lat: 25.03691666666667, lon: 121.56369444444445 },
  { lat: 25.036722222222224, lon: 121.56369444444445 },
  { lat: 25.036527777777778, lon: 121.56369444444445 },
  { lat: 25.036305555555558, lon: 121.56366666666668 },
  { lat: 25.03611111111111, lon: 121.56366666666668 },
  { lat: 25.03588888888889, lon: 121.56366666666668 },
  { lat: 25.035666666666668, lon: 121.56366666666668 },
  { lat: 25.035472222222225, lon: 121.56363888888889 },
  { lat: 25.03525, lon: 121.56363888888889 },
  { lat: 25.035, lon: 121.56363888888889 },
  { lat: 25.034722222222225, lon: 121.56363888888889 },
  { lat: 25.03452777777778, lon: 121.56363888888889 },
  { lat: 25.034361111111114, lon: 121.56363888888889 },
  { lat: 25.034111111111113, lon: 121.56361111111111 },
  { lat: 25.033916666666666, lon: 121.56361111111111 },
  { lat: 25.03366666666667, lon: 121.56361111111111 },
  { lat: 25.033444444444445, lon: 121.56361111111111 },
  { lat: 25.03322222222222, lon: 121.56361111111111 },
  { lat: 25.033055555555556, lon: 121.56369444444445 },
  { lat: 25.033083333333334, lon: 121.56391666666666 },
  { lat: 25.033055555555556, lon: 121.56416666666667 },
  { lat: 25.033055555555556, lon: 121.56441666666666 },
  { lat: 25.033083333333334, lon: 121.5646388888889 },
  { lat: 25.033055555555556, lon: 121.56491666666666 },
  { lat: 25.033055555555556, lon: 121.56513888888888 },
  { lat: 25.033055555555556, lon: 121.56530555555555 },
  { lat: 25.032888888888888, lon: 121.56530555555555 },
  { lat: 25.032722222222223, lon: 121.56530555555555 },
  { lat: 25.03275, lon: 121.5655 },
  { lat: 25.03275, lon: 121.56566666666666 },
  { lat: 25.03275, lon: 121.5658611111111 },
  { lat: 25.03275, lon: 121.56608333333332 },
  { lat: 25.03275, lon: 121.56630555555556 },
  { lat: 25.03275, lon: 121.56655555555555 },
  { lat: 25.032722222222223, lon: 121.56677777777777 }
];

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
  this.walkTimer = null;
  this.updateTimer = null;
  this.started = false;
  this.count = 0;
  this.last = cLocations.length;
  this.callback = null;
  this.currentLoc = null;
}

FakeGeoPositionProvider.prototype = {
  classID:          Components.ID("{a93105f2-8169-4790-a455-4701ce867aa8}"),
  QueryInterface:   XPCOMUtils.generateQI([Ci.nsIGeolocationProvider,
                                           Ci.nsIFakeListener,
                                           Ci.nsITimerCallback]),
  startup:  function() {
    if (this.started)
      return;
    this.started = true;

    this.walkTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this.walkTimer.initWithCallback(this, 20000, this.walkTimer.TYPE_REPEATING_SLACK);
    this.updateTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this.updateTimer.initWithCallback(this, 1000, this.updateTimer.TYPE_REPEATING_SLACK);
    this.walk();
  },

  watch: function(c) {
    this.callback = c;
  },

  shutdown: function() {
    if (this.walkTimer != null) {
      this.walkTimer.cancel();
      this.walkTimer = null;
    }
    if (this.updateTimer != null) {
      this.updateTimer.cancel();
      this.updateTimer = null;
    }
    this.started = false;
  },

  setHighAccuracy: function(enable) {
  },

  walk: function() {
    this.count++;
    if (this.count >= this.last) {
      this.count = 0;
    }
    let loc = cLocations[this.count];
    this.currentLoc = new FakeGeoPositionObject(loc.lat, loc.lon);
  },

  notify: function (timer) {
    if (timer == this.walkTimer) {
      this.walk();
    }
    this.callback.update(this.currentLoc);
  },

};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([FakeGeoPositionProvider]);
