/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. 
 */

'use strict';

const { Cc, Ci, Cr, Cu } = require("chrome");

const { EventTarget } = require("sdk/event/target");
const { emit } = require("sdk/event/core");
const { Class } = require("sdk/core/heritage");
const { setTimeout, clearTimeout } = require('sdk/timers');

const PingbackServer = Class({
  extends: EventTarget,
  initialize: function initialize(options) {
    // `EventTarget.initialize` will set event listeners that are named
    // like `onEvent` in this case `onComplete` listener will be set to
    // `complete` event.
    EventTarget.prototype.initialize.call(this, options);
  },
  start: function () {
    this.srv = Cc['@mozilla.org/network/server-socket;1']
      .createInstance(Ci.nsIServerSocket);
    this.srv.init(-1, true, -1);
    this.srv.asyncListen(this);
    emit(this, "started", null);
  },

  startTimeout: function(time) {
    var self = this;
    this._timeout = setTimeout(function () emit(self,"timeout",null), time);
  },

  stopTimeout: function () {
    if (!!this._timeout)
      clearTimeout(this._timeout);
  },

  onStopListening: function(aSrv, aStatus) {
    console.debug("PingbackServer.onStopListening (port: "+this._port+")");
    emit(this, "exit", null);
  },

  onSocketAccepted: function (aSrv, aTransport) {
    console.debug("PingbackServer.onSocketAccepted (port: "+this.port+")");
    emit(this, "completed", null);
    aTransport.close(Cr.NS_OK);
  },

  stop: function () {
    this.srv.close();
    this.srv = null;
  },

  get port() {
    return !!this.srv ? (this._port = this.srv.port) : null;
  }
});

module.exports = PingbackServer;
