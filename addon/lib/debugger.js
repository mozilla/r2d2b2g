/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

// Whether or not this script is being loaded as a CommonJS module
// (from an addon built using the Add-on SDK).  If it isn't a CommonJS Module,
// then it's a JavaScript Module.
const COMMONJS = ("require" in this);

let components;
if (COMMONJS) {
  components = require("chrome").components;
} else {
  components = Components;
}
let Cc = components.classes;
let Ci = components.interfaces;
let Cu = components.utils;

Cu.import("resource://gre/modules/Services.jsm");
let { Promise: promise } = Cu.import("resource://gre/modules/Promise.jsm", {});
Cu.import("resource://gre/modules/devtools/dbg-client.jsm");

const { devtools } =
  Cu.import("resource://gre/modules/devtools/Loader.jsm", {});
const { require: devtoolsRequire } = devtools;
const { ConnectionManager, Connection } =
  devtoolsRequire("devtools/client/connection-manager");

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

    let deferred = promise.defer();
    let connection =
      ConnectionManager.createConnection("localhost", aPort);
    connection.keepConnecting = true;
    connection.once(Connection.Events.CONNECTED, () => {
      client = connection.client;
      client.listTabs(function(aResponse) {
        if (aResponse.webappsActor) {
          webappsActor = aResponse.webappsActor;
          deferred.resolve();
        } else {
          deferred.reject();
        }
      });
    });
    connection.connect();
    return deferred.promise;
  },

  webappsRequest: function dbg_webappsRequest(aData) {
    dump("webappsRequest " + webappsActor + "\n");
    aData.to = webappsActor;
    dump("about to send " + JSON.stringify(aData, null, 2) + "\n");
    let deferred = promise.defer();
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
