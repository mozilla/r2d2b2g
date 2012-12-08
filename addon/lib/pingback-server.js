const { Cc, Ci, Cr, Cu } = require("chrome");

const { EventTarget } = require("sdk/event/target");
const { emit } = require("sdk/event/core");
const { Class } = require("sdk/core/heritage");
const { setTimeout, clearTimeout } = require('sdk/timers')

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
    console.log("ON STOP LISTENING");
    emit(this, "exit", null);
  },

  onSocketAccepted: function (aSrv, aTransport) {
    console.log("ON SOCKET ACCEPTED");
    emit(this, "completed", null);
    aTransport.close(Cr.NS_OK);
  },

  stop: function () {
    this.srv.close();
    this.srv = null;
  },

  get port() {
    if (!!this.srv)
      return this.srv.port;
  }
});

exports.PingbackServer = PingbackServer;
