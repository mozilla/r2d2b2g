/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

Cu.import("resource://gre/modules/Services.jsm");

/**
  * Creates a GeolocationActor.
  * Allows a Firefox OS device to accept fake geolocation data for use during
  * debugging.
  */
let GeolocationActor = function GeolocationActor(aConnection) {
  this.debug("Geolocation actor created for a new connection");

  this._connection = aConnection;
  this._listeners = {};
};

GeolocationActor.prototype = {
  actorPrefix: "simulatorGeolocation",

  disconnect: function() {
    this.debug("Geolocation actor connection closed");
  },

  /**
   * Dump a debug message to stdout.  This is defined as a method to avoid
   * polluting the global namespace of the debugger server, and it always dumps
   * because the Add-on SDK automatically determines whether to log the message.
   */
  debug: function debug() {
    dump(Array.slice(arguments).join(" ") + "\n");
  },

  onUpdate: function (aRequest) {
    this.debug("Simulator received a geolocation response, updating provider");
    Services.obs.notifyObservers({
      wrappedJSObject: {
        lat: aRequest.message.lat,
        lon: aRequest.message.lon,
      }
    }, "r2d2b2g:update-geolocation", null);

    return {};
  }
};

/**
 * The request types this actor can handle.
 */
GeolocationActor.prototype.requestTypes = {
  "update": GeolocationActor.prototype.onUpdate
};

DebuggerServer.removeGlobalActor(GeolocationActor);
DebuggerServer.addGlobalActor(GeolocationActor, "simulatorGeolocationActor");
