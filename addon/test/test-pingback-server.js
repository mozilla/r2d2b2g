/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const PingbackServer = require("pingback-server");
const { setTimeout, clearTimeout } = require('sdk/timers')

var { Cu, Cc, Ci } = require("chrome");

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
XPCOMUtils.defineLazyServiceGetter(this, "socketTransportService",
                                   "@mozilla.org/network/socket-transport-service;1",
                                   "nsISocketTransportService");

Cu.import("resource://gre/modules/Services.jsm");

function pingback(port, onReady) {
  let transport = socketTransportService.createTransport(null, 0, "127.0.0.1", port, null);
  let input = transport.openInputStream(0,0,0);
  let stream = input.QueryInterface(Ci.nsIAsyncInputStream);
  stream.asyncWait({
    onInputStreamReady: function() onReady(transport,stream)
  }, 0, 0, Services.tm.currentThread);
}

exports["test:PingbackServer start/stop"] = function(test, done) {
  var pbs = new PingbackServer({
    onStarted: function () {
      test.pass("onStarted callback");
      test.ok(!!pbs.srv, "srv should be defined");
      test.ok(!!pbs.port, "port should be defined");
      pbs.stop();
    },
    onExit: function () {
      test.pass("onExit callback");
      test.ok(!pbs.srv, "srv should be undefined");
      test.ok(!pbs.port, "port should be undefined");
      done();
    }
  });

  pbs.start();
};

exports["test:PingbackServer onCompleted"] = function(test, done) {
  var pingback_completed = false;

  var pbs = new PingbackServer({
    onCompleted: function () {
      test.pass("onCompleted callback");
      pingback_completed = true;
    }
  });

  pbs.start();

  pingback(pbs.port,
           function onReady(transport, stream) {
             test.pass("client connection closed");
             test.ok(!transport.isAlive(), "client socket should not be alive");
             test.ok(pingback_completed, "onCompleted running correctly");
             pbs.stop();
             done();
           });
};

exports["test:PingbackServer startTimeout/onTimeout"] = function(test, done) {
  var pbs = new PingbackServer({
    onTimeout: function () {
      test.pass("onTimeout callback");
      done();
    }
  });

  pbs.start();
  pbs.startTimeout(1000);
};

exports["test:PingbackServer stopTimeout"] = function(test, done) {
  var pbs = new PingbackServer({
    onTimeout: function () {
      test.fail("onTimeout callback should not be called");
      pingback_timeout = true;
    }
  });

  pbs.start();
  pbs.startTimeout(500);
  pbs.stopTimeout();

  setTimeout(function () {
    done();
  }, 800);
};


require('sdk/test').run(exports);
