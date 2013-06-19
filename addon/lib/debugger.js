/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

// Whether or not this script is being loaded as a CommonJS module
// (from an addon built using the Add-on SDK).  If it isn't a CommonJS Module,
// then it's a JavaScript Module.
const COMMONJS = ("require" in this);
const TIMEOUT_DURATION = 15000; // ms

let setTimeout, clearTimeout;
let components;
if (COMMONJS) {
  components = require("chrome").components;
  ({ setTimeout, clearTimeout }) = require("sdk/timers");
} else {
  components = Components;
  let { Loader, Require } =
    Cu.import('resource://gre/modules/commonjs/toolkit/loader.js').Loader;

  let loader = Loader({
    paths: {
      '': 'resource://gre/modules/commonjs/sdk/'
    },
    globals: { },
    modules: { }
  });

  // This variable needs to be named something other than require or else
  // the addon-sdk loader gets confused. The addon-sdk throws a
  // ModuleNotFoundError at addon build time. For example:
  //
  // ModuleNotFoundError: unable to satisfy: require(io/file) from...
  let require_ = Require(loader);
  ({ setTimeout, clearTimeout }) = require_("sdk/timers");
}
let Cc = components.classes;
let Ci = components.interfaces;
let Cu = components.utils;

Cu.import("resource://gre/modules/Services.jsm");
try {
  Cu.import("resource://gre/modules/commonjs/promise/core.js");
} catch (e) {
  Cu.import("resource://gre/modules/commonjs/sdk/core/promise.js");
}
Cu.import("resource://gre/modules/devtools/dbg-client.jsm");

if (!COMMONJS) {
  this.EXPORTED_SYMBOLS = ["Debugger"];
}

let client = null, webappsActor = null;

this.Debugger = {
  init: function dbg_init(aPort) {
    dump("Debugger init(" + aPort + ")\n");
    let enabled = Services.prefs.getBoolPref("devtools.debugger.remote-enabled");
    if (!enabled) {
      Services.prefs.setBoolPref("devtools.debugger.remote-enabled", true);
    }

    let transport = debuggerSocketConnect("localhost", aPort);
    client = new DebuggerClient(transport);

    let deferred = Promise.defer();

    let connectionTimer = setTimeout(function () {
      let errorMsg = "Failed to connect to device: timeout";
      dump(errorMsg + "\n");
      deferred.reject(errorMsg);
    }, TIMEOUT_DURATION);

    // Not guaranteed to connect, Bug 883931
    client.connect(function onConnected(aType, aTraits) {
      clearTimeout(connectionTimer);
      client.listTabs(function(aResponse) {
        if (aResponse.webappsActor) {
          webappsActor = aResponse.webappsActor;
          deferred.resolve();
        } else {
          deferred.reject();
        }
      });
    });
    return deferred.promise;
  },

  webappsRequest: function dbg_webappsRequest(aData) {
    dump("webappsRequest " + webappsActor + "\n");
    aData.to = webappsActor;
    dump("about to send " + JSON.stringify(aData, null, 2) + "\n");
    let deferred = Promise.defer();
    client.request(aData,
      function onResponse(aResponse) {
      dump("response=" + JSON.stringify(aResponse, null, 2) + "\n");
      if (aResponse.error) {
        deferred.reject(aResponse.message);
      } else {
        deferred.resolve();
      }
    });
    return deferred.promise;
  },

  setWebappsListener: function dbg_setWebappsListener(aListener) {
    client.addListener("webappsEvent", aListener);
  }
}

if (COMMONJS) {
  module.exports = this.Debugger;
}
