/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const { Cc, Ci, Cr, Cu } = require("chrome");
const { Class } = require("sdk/core/heritage");

Cu.import("resource://gre/modules/Services.jsm");

let { TextDecoder } = Cu.import("resource://gre/modules/Services.jsm");

const OLD_SOCKET_API =
  Services.vc.compare(Services.appinfo.platformVersion, "23.0a1") < 0;

Services.prefs.setBoolPref("dom.mozTCPSocket.enabled", true);

let TCPSocket = Cc["@mozilla.org/tcp-socket;1"]
                .createInstance(Ci.nsIDOMTCPSocket);

function debug() {
  console.debug.apply(console, ["ADB: "].concat(Array.prototype.slice.call(arguments, 0)));
}

// Creates a socket connected to the adb instance.
// This instantiation is sync, and returns before we know if opening the
// connection succeeds. Callers must attach handlers to the s field.
let AdbSocket = Class({
  initialize: function initialize() {
    this.s =
      TCPSocket.open("127.0.0.1", 5037, { binaryType: "arraybuffer" });
  },

  /**
   * Dump the first few bytes of the given array to the console.
   *
   * @param {TypedArray} aArray
   *        the array to dump
   */
  _hexdump: function hexdump(aArray) {
    let decoder = new TextDecoder("windows-1252");
    let array = new Uint8Array(aArray.buffer);
    let s = decoder.decode(array);
    let len = array.length;
    let dbg = "len=" + len + " ";
    let l = len > 20 ? 20 : len;

    for (let i = 0; i < l; i++) {
      let c = array[i].toString(16);
      if (c.length == 1)
        c = "0" + c;
      dbg += c;
    }
    dbg += " ";
    for (let i = 0; i < l; i++) {
      let c = array[i];
      if (c < 32 || c > 127) {
        dbg += ".";
      } else {
        dbg += s[i];
      }
    }
    debug(dbg);
  },

  // debugging version of tcpsocket.send()
  send: function send(aArray) {
    this._hexdump(aArray);

    if (OLD_SOCKET_API) {
      // Create a new Uint8Array in case the array we got is of a different type
      // (like Uint32Array), since the old API takes a Uint8Array.
      this.s.send(new Uint8Array(aArray.buffer));
    } else {
      this.s.send(aArray.buffer, aArray.byteOffset, aArray.byteLength);
    }
  },

  close: function close() {
    if (this.s.readyState === "open" ||
        this.s.readyState === "connecting") {
      this.s.close();
    }
  }
});

exports.AdbSocket = AdbSocket;

