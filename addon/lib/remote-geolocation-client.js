/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. 
 */

'use strict';

const { Cc, Ci, Cu, ChromeWorker } = require("chrome");

const { EventTarget } = require("sdk/event/target");
const { emit, off } = require("sdk/event/core");
const { Class } = require("sdk/core/heritage");

const URL = require("url");

// import debuggerSocketConnect and DebuggerClient
const dbgClient = Cu.import("resource://gre/modules/devtools/dbg-client.jsm");

// add an unsolicited notification for geolocation
dbgClient.UnsolicitedNotifications.geolocationRequest = "geolocationRequest";

const RemoteGeolocationClient = Class({
  extends: EventTarget,

  initialize: function initialize(options) {
    EventTarget.prototype.initialize.call(this, options);
    this._hookInternalEvents();
  },

  _hookInternalEvents: function _hookInternalEvents() {
    // on clientConnected, register an handler to close current connection 
    // on kill and send a "listTabs" debug protocol request, finally
    // emit a clientReady event on "listTabs" reply
    this.on("clientConnected", function (data) {
      console.debug("RemoteGeolocationClient.onClientConnected");
      this._clientConnecting = false;
      this._clientConnected = true;
      let client = data.client;
      this.once("kill", function () client.close());
      client.request({to: "root", type: "listTabs"}, (function (reply) {
        emit(this, "clientReady", {
          client: client,
          globals: reply,
          tabs: reply.tabs,
          selected: reply.selected,
          simulator: reply.simulatorActor,
          webapps: reply.simulatorWebappsActor
        });
      }).bind(this));
    });

    // on clientReady, track remote target
    // listeners and emit an high level "ready" event
    this.on("clientReady", function (remote) {
      console.debug("RemoteGeolocationClient.onClientReady");
      this._remote = remote;
      this._sendGeolocationReady(function(packet) {
        console.debug("GEOLOCATION READY REPLY:: "+JSON.stringify(packet, null, 2));
      });

      emit(this, "ready", null);
    });

    // on clientClosed, untrack old remote target and emit 
    // an high level "disconnected" event
    this.on("clientClosed", function () {
      console.debug("RemoteGeolocationClient.onClientClosed");
      this._clientConnected = false;
      this._clientConnecting = false;
      this._remote = null;
      emit(this, "disconnected", null);
    });
  },

  // check if b2g is connected
  get isConnected() this._clientConnected,

  // connect simulator using debugging protocol
  // NOTE: this control channel will be auto-created on every b2g instance run
  connectDebuggerClient: function(port) {
    if (this._clientConnected || this._clientConnecting) {
      console.warn("remote-geolocation-client: already connected.");
      return;
    }

    this._clientConnecting = true;

    let transport = debuggerSocketConnect("127.0.0.1", port);

    let client = new DebuggerClient(transport);

    client.addListener("closed", (function () {
      emit(this, "clientClosed", {client: client});
    }).bind(this));

    client.addListener("geolocationRequest", (function() {
      console.debug("GEOLOCATION REQUEST");
      let remote = this._remote;
      let geolocation = Cc["@mozilla.org/geolocation;1"].
                        getService(Ci.nsIDOMGeoGeolocation);
      geolocation.getCurrentPosition(function success(position) {
      console.debug("GEOLOCATION RESPONSE", remote.simulator);
        remote.client.request({
          to: remote.simulator,
          message: {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          },
          type: "geolocationResponse"
        });
      }, function error() {
        console.error("error getting current position");
      });
    }).bind(this));
 
    client.connect((function () {
      emit(this, "clientConnected", {client: client});
    }).bind(this));
  },

  _sendGeolocationReady: function(onResponse) {
    this._remote.client.request({to: this._remote.simulator, type: "geolocationReady"},
                                onResponse);
  },
});

module.exports = RemoteGeolocationClient;
