/* This Source Code Form is subject to the terms of the Mozilla Public
  * License, v. 2.0. If a copy of the MPL was not distributed with this
  * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

Cu.import("resource://gre/modules/Services.jsm");

/**
  * Creates a GeolocationUIActor.
  * Allows a Firefox OS device to accept fake geolocation data for use during
  * debugging.
  */
let GeolocationUIActor = function GeolocationUIActor(aConnection) {
  this.debug("Geolocation UI actor created for a new connection");

  this._connection = aConnection;
  this._listeners = {};

  Services.obs.addObserver(this, "r2d2b2g:enable-real-geolocation", false);
  Services.obs.addObserver(this, "r2d2b2g:disable-real-geolocation", false);
};

GeolocationUIActor.prototype = {
  actorPrefix: "simulatorGeolocationUI",

  observe: function(aSubject, aTopic, aData) {
    switch(aTopic) {
      case "r2d2b2g:enable-real-geolocation":
        this.enableRealGeolocation();
        break;
      case "r2d2b2g:disable-real-geolocation":
        this.disableRealGeolocation();
        break;
    }
  },

  enableRealGeolocation: function() {
    this.debug("Simulator requesting to enable watching real geolocation");
    this._connection.send({
      from: this.actorID,
      type: "enableRealGeolocation"
    });
  },

  disableRealGeolocation: function() {
    this.debug("Simulator requesting to disable watching real geolocation");
    this._connection.send({
      from: this.actorID,
      type: "disableRealGeolocation"
    });
  },

  disconnect: function() {
    this.debug("Geolocation UI actor connection closed");
  },

  /**
   * Dump a debug message to stdout.  This is defined as a method to avoid
   * polluting the global namespace of the debugger server, and it always dumps
   * because the Add-on SDK automatically determines whether to log the message.
   */
  debug: function debug() {
    dump(Array.slice(arguments).join(" ") + "\n");
  },

  /**
   * Actors are initialized lazily, so if they have any initialization work to
   * perform (set up listeners / observers, etc.), then some message must be
   * sent to trigger that process. The "attach" message exists solely for this
   * purpose.
   */
  onAttach: function(aRequest) {
    this.debug("Geolocation UI actor received an 'attach' command");

    return {};
  }
};

/**
 * The request types this actor can handle.
 */
GeolocationUIActor.prototype.requestTypes = {
  "attach": GeolocationUIActor.prototype.onAttach
};

DebuggerServer.removeGlobalActor(GeolocationUIActor);
DebuggerServer.addGlobalActor(GeolocationUIActor, "simulatorGeolocationUIActor");
