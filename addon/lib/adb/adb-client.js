/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * A module to track device changes
 * Mostly from original `adb.js`
 */

'use strict';

const { Cu, Cc, Ci } = require("chrome");
const { AdbSocket } = require("adb/adb-socket");

Cu.import("resource://gre/modules/Services.jsm");

let { TextEncoder, TextDecoder } = Cu.import("resource://gre/modules/Services.jsm");

function debug() {
  console.debug.apply(console, ["ADB: "].concat(Array.prototype.slice.call(arguments, 0)));
}

const OLD_SOCKET_API =
  Services.vc.compare(Services.appinfo.platformVersion, "23.0a1") < 0;

let _sockets = [ ];

// @param aPacket         The packet to get the length from.
// @param aIgnoreResponse True if this packet has no OKAY/FAIL.
// @return                A js object { length:...; data:... }
function unpackPacket(aPacket, aIgnoreResponse) {
  let buffer = OLD_SOCKET_API ? aPacket.buffer : aPacket;
  debug("Len buffer: " + buffer.byteLength);
  if (buffer.byteLength === 4 && !aIgnoreResponse) {
    debug("Packet empty");
    return { length: 0, data: "" };
  }
  let lengthView = new Uint8Array(buffer, aIgnoreResponse ? 0 : 4, 4);
  let decoder = new TextDecoder();
  let length = parseInt(decoder.decode(lengthView), 16);
  let text = new Uint8Array(buffer, aIgnoreResponse ? 4 : 8, length);
  return { length: length, data: decoder.decode(text) };
}

// Checks if the response is OKAY or FAIL.
// @return true for OKAY, false for FAIL.
function checkResponse(aPacket) {
  const OKAY = 0x59414b4f; // OKAY
  const FAIL = 0x4c494146; // FAIL
  let buffer = OLD_SOCKET_API ? aPacket.buffer : aPacket;
  let view = new Uint32Array(buffer, 0 , 1);
  if (view[0] == FAIL) {
    debug("Response: FAIL");
  }
  debug("view[0] = " + view[0]);
  return view[0] == OKAY;
}

// @param aCommand A protocol-level command as described in
//  http://androidxref.com/4.0.4/xref/system/core/adb/OVERVIEW.TXT and
//  http://androidxref.com/4.0.4/xref/system/core/adb/SERVICES.TXT
// @return A 8 bit typed array.
function createRequest(aCommand) {
  let length = aCommand.length.toString(16).toUpperCase();
  while(length.length < 4) {
    length = "0" + length;
  }

  let encoder = new TextEncoder();
  debug("Created request: " + length + aCommand);
  return encoder.encode(length + aCommand);
}

function close() {
  _sockets.forEach(function(s) s.close());
}

function connect() {
  let tmp = new AdbSocket();
  _sockets.push(tmp);
  return tmp;
}

let client = {
  unpackPacket: unpackPacket,
  checkResponse: checkResponse,
  createRequest: createRequest,
  connect: connect,
  close: close
};

module.exports = client;

