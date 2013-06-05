/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Wrapper around the ADB utility.

'use strict';

// Whether or not this script is being loaded as a CommonJS module
// (from an addon built using the Add-on SDK).  If it isn't a CommonJS Module,
// then it's a JavaScript Module.
const COMMONJS = ("require" in this);

let components, subprocess, file, env;
if (COMMONJS) {
  components = require("chrome").components;
} else {
  components = Components;
}
let Cc = components.classes;
let Ci = components.interfaces;
let Cu = components.utils;

if (COMMONJS) {
  subprocess = require("subprocess");
  file = require("file");
  env = require("api-utils/environment").env;
} else {
  Cu.import("chrome://b2g-remote/content/subprocess.jsm");
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

  file = require_("io/file");
  env = require_("system/environment").env;
}
Cu.import("resource://gre/modules/Services.jsm");

// When loaded as a CommonJS module, get the TextEncoder and TextDecoder
// interfaces from the Services JavaScript Module, since they aren't defined
// in a CommonJS module by default.
let { TextEncoder, TextDecoder } =
  COMMONJS ? Cu.import("resource://gre/modules/Services.jsm", {})
           : { TextEncoder: TextEncoder, TextDecoder: TextDecoder };

try {
  Cu.import("resource://gre/modules/commonjs/promise/core.js");
} catch (e) {
  Cu.import("resource://gre/modules/commonjs/sdk/core/promise.js");
}
Cu.import("resource://gre/modules/osfile.jsm");

const OLD_SOCKET_API =
  Services.vc.compare(Services.appinfo.platformVersion, "23.0a1") < 0;

if (!COMMONJS) {
  this.EXPORTED_SYMBOLS = ["ADB"];
}

function debug(aStr) {
  if (COMMONJS) {
    console.log("adb: " + aStr);
  } else {
    dump("--*-- ADB.jsm: " + aStr + "\n");
  }
}

let ready = false;
let didRunInitially = false;
const psRegexNix = /.*? \d+ .*? .*? \d+\s+\d+ .*? .*? .*? .*? adb .*fork\-server/;
const psRegexWin = /adb.exe.*/;

this.ADB = {
  get didRunInitially() didRunInitially,
  set didRunInitially(newVal) { didRunInitially = newVal },
  get ready() ready,
  set ready(newVal) { ready = newVal },

  init: function adb_init() {
    debug("init");
    let platform = Services.appinfo.OS;

    let uri;
    if (COMMONJS) {
      uri = require("self").data.url("");
    } else {
      uri = "chrome://b2g-remote/content/binaries/";
    }

    let bin;
    switch(platform) {
      case "Linux":
        if (COMMONJS) {
          bin = uri + (require("runtime").XPCOMABI.indexOf("x86_64") == 0 ? "linux64" : "linux") + "/adb/adb";
        } else {
          bin = uri + "linux/adb";
        }
        break;
      case "Darwin":
        if (COMMONJS) {
          bin = uri + "mac64/adb/adb";
        } else {
          bin = uri + "darwin/adb";
        }
        break;
      case "WINNT":
        if (COMMONJS) {
          bin = uri + "win32/adb/adb.exe";
        } else {
          bin = uri + "win32/adb.exe";
        }
        break;
      default:
        debug("Unsupported platform : " + platform);
        return;
    }

    if (COMMONJS) {
      let url = Services.io.newURI(bin, null, null)
                        .QueryInterface(Ci.nsIFileURL);
      this._adb = url.file;
    } else {
      let chromeReg = Cc["@mozilla.org/chrome/chrome-registry;1"]
                        .getService(Ci.nsIChromeRegistry);
      let url = chromeReg.convertChromeURL(Services.io.newURI(bin, null, null))
                         .QueryInterface(Ci.nsIFileURL);
      this._adb = url.file;
    }
  },

  // We startup by launching adb in server mode, and setting
  // the tcp socket preference to |true|
  start: function adb_start() {
    let onSuccessfulStart = (function onSuccessfulStart() {
      Services.prefs.setBoolPref("dom.mozTCPSocket.enabled", true);
      Services.obs.notifyObservers(null, "adb-ready", null);
      this.ready = true;
    }).bind(this);

    this._isAdbRunning().then(
      (function onSuccess(isAdbRunning) {
        if (isAdbRunning) {
          this.didRunInitially = false;
          debug("Found ADB process running, not restarting");
          onSuccessfulStart();
          return;
        }
        debug("Didn't find ADB process running, restarting");

        this.didRunInitially = true;
        let process = Cc["@mozilla.org/process/util;1"]
                        .createInstance(Ci.nsIProcess);
        process.init(this._adb);
        let params = ["start-server"];
        let self = this;
        process.runAsync(params, params.length, {
          observe: function(aSubject, aTopic, aData) {
            switch(aTopic) {
              case "process-finished":
                onSuccessfulStart();
                break;
              case "process-failed":
                self.ready = false;
                break;
             }
           }
        }, false);
      }).bind(this));
  },

  /**
   * Kill the ADB server.  We do this by running ADB again, passing it
   * the "kill-server" argument.
   *
   * @param {Boolean} aSync
   *        Whether or not to kill the server synchronously.  In general,
   *        this should be false.  But on Windows, an addon may fail to update
   *        if its copy of ADB is running when Firefox tries to update it.
   *        So addons who observe their own updates and kill the ADB server
   *        beforehand should do so synchronously on Windows to make sure
   *        the update doesn't race the killing.
   */
  kill: function adb_kill(aSync) {
    let process = Cc["@mozilla.org/process/util;1"]
                    .createInstance(Ci.nsIProcess);
    process.init(this._adb);
    let params = ["kill-server"];

    if (aSync) {
      process.run(true, params, params.length);
      debug("adb kill-server: " + process.exitValue);
      this.ready = false;
      this.didRunInitially = false;
    }
    else {
      let self = this;
      process.runAsync(params, params.length, {
        observe: function(aSubject, aTopic, aData) {
          switch(aTopic) {
            case "process-finished":
              debug("adb kill-server: " + process.exitValue);
              Services.obs.notifyObservers(null, "adb-killed", null);
              self.ready = false;
              self.didRunInitially = false;
              break;
            case "process-failed":
              debug("adb kill-server failure: " + process.exitValue);
              // It's hard to say whether or not ADB is ready at this point,
              // but it seems safer to assume that it isn't, so code that wants
              // to use it later will try to restart it.
              Services.obs.notifyObservers(null, "adb-killed", null);
              self.ready = false;
              self.didRunInitially = false;
              break;
          }
        }
      }, false);
    }
  },

  _isAdbRunning: function() {
    let deferred = Promise.defer();

    let ps, args;
    let platform = Services.appinfo.OS;
    if (platform === "WINNT") {
      ps = "C:\\windows\\system32\\tasklist.exe";
      args = [];
    } else {
      args = ["aux"];
      let psCommand = "ps";

      let paths = env.PATH.split(':');
      let len = paths.length;
      for (let i = 0; i < len; i++) {
        let fullyQualified = file.join(paths[i], psCommand);
        if (file.exists(fullyQualified)) {
          ps = fullyQualified;
          break;
        }
      }
      if (!ps) {
        debug("Error: a task list executable not found on filesystem");
        deferred.resolve(false); // default to restart adb
        return deferred.promise;
      }
    }

    let buffer = [];

    subprocess.call({
      command: ps,
      arguments: args,
      stdout: function(data) {
        buffer.push(data);
      },
      done: function() {
        let lines = buffer.join('').split('\n');
        let regex = (platform === "WINNT") ? psRegexWin : psRegexNix;
        let isAdbRunning = lines.some(function(line) {
          return regex.test(line);
        });
        deferred.resolve(isAdbRunning);
      }
    });

    return deferred.promise;
  },

  // Creates a socket connected to the adb instance.
  // This function is sync, and returns before we know if opening the
  // connection succeeds. Callers must attach handlers to the socket.
  _connect: function adb_connect() {
    let TCPSocket = Cc["@mozilla.org/tcp-socket;1"]
                      .createInstance(Ci.nsIDOMTCPSocket);
    let socket = TCPSocket.open(
     "127.0.0.1", 5037,
     { binaryType: "arraybuffer" });
    return socket;
  },

  // @param aCommand A protocol-level command as described in
  //  http://androidxref.com/4.0.4/xref/system/core/adb/OVERVIEW.TXT and
  //  http://androidxref.com/4.0.4/xref/system/core/adb/SERVICES.TXT
  // @return A 8 bit typed array.
  _createRequest: function adb_createRequest(aCommand) {
    let length = aCommand.length.toString(16).toUpperCase();
    while(length.length < 4) {
      length = "0" + length;
    }

    let encoder = new TextEncoder();
    return encoder.encode(length + aCommand);
  },

  // Checks if the response is OKAY or FAIL.
  // @return true for OKAY, false for FAIL.
  _checkResponse: function adb_checkResponse(aPacket) {
    const OKAY = 0x59414b4f; // OKAY
    const FAIL = 0x4c494146; // FAIL
    let buffer = OLD_SOCKET_API ? aPacket.buffer : aPacket;
    let view = new Uint32Array(buffer, 0 , 1);
    if (view[0] == FAIL) {
      debug("Response: FAIL");
    }
    return view[0] == OKAY;
  },

  // @param aPacket         The packet to get the length from.
  // @param aIgnoreResponse True if this packet has no OKAY/FAIL.
  // @return                A js object { length:...; data:... }
  _unpackPacket: function adb_unpackPacket(aPacket, aIgnoreResponse) {
    let buffer = OLD_SOCKET_API ? aPacket.buffer : aPacket;
    let lengthView = new Uint8Array(buffer, aIgnoreResponse ? 0 : 4, 4);
    let decoder = new TextDecoder();
    let length = parseInt(decoder.decode(lengthView), 16);
    let text = new Uint8Array(buffer, aIgnoreResponse ? 4 : 8, length);
    return { length: length, data: decoder.decode(text) }
  },

  // Start tracking devices connecting and disconnecting from the host.
  // We can't reuse runCommand here because we keep the socket alive.
  // @return The socket used.
  trackDevices: function adb_trackDevices() {
    debug("trackDevices");
    let socket = this._connect();
    let waitForFirst = true;
    let devices = {};

    socket.onopen = function() {
      debug("trackDevices onopen");
      Services.obs.notifyObservers(null, "adb-track-devices-start", null);
      let req = this._createRequest("host:track-devices");
      ADB.sockSend(socket, req);

    }.bind(this);

    socket.onerror = function(event) {
      debug("trackDevices onerror: " + event.data);
      Services.obs.notifyObservers(null, "adb-track-devices-stop", null);
    }

    socket.onclose = function() {
      debug("trackDevices onclose");
      Services.obs.notifyObservers(null, "adb-track-devices-stop", null);
    }

    socket.ondata = function(aEvent) {
      debug("trackDevices ondata");
      let data = aEvent.data;
      debug("length=" + data.byteLength);
      let dec = new TextDecoder();
      debug(dec.decode(new Uint8Array(data)).trim());

      // check the OKAY or FAIL on first packet.
      if (waitForFirst) {
        if (!this._checkResponse(data)) {
          socket.close();
          return;
        }
      }

      let packet = this._unpackPacket(data, !waitForFirst);
      waitForFirst = false;

      if (packet.data == "") {
        // All devices got disconnected.
        for (let dev in devices) {
          devices[dev] = false;
          Services.obs.notifyObservers(null, "adb-device-disconnected", dev);
        }
      } else {
        // One line per device, each line being $DEVICE\t(offline|device)
        let lines = packet.data.split("\n");
        let newDev = {};
        lines.forEach(function(aLine) {
          if (aLine.length == 0) {
            return;
          }

          let [dev, status] = aLine.split("\t");
          newDev[dev] = status !== "offline";
        });
        // Check which device changed state.
        for (let dev in newDev) {
          if (devices[dev] != newDev[dev]) {
            if (dev in devices || newDev[dev]) {
              let topic = newDev[dev] ? "adb-device-connected"
                                      : "adb-device-disconnected";
              Services.obs.notifyObservers(null, topic, dev);
            }
            devices[dev] = newDev[dev];
          }
        }
      }
    }.bind(this);

    return socket;
  },

  // Sends back an array of device names.
  listDevices: function adb_listDevices() {
    debug("listDevices");
    let deferred = Promise.defer();

    let promise = this.runCommand("host:devices");

    return promise.then(
      function onSuccess(data) {
        let lines = data.split("\n");
        let res = [];
        lines.forEach(function(aLine) {
          if (aLine.length == 0) {
            return;
          }
          let [device, status] = aLine.split("\t");
          res.push(device);
        });
        return res;
      }
    );
  },

  // sends adb forward tcp:aPort tcp:6000
  forwardPort: function adb_forwardPort(aPort) {
    debug("forwardPort " + aPort);
    // <host-prefix>:forward:<local>;<remote>

    let promise = this.runCommand("host:forward:tcp:" + aPort + ";tcp:6000");

    return promise.then(
      function onSuccess(data) {
        return data;
      }
    );
  },

  // Checks a file mode.
  // aWhat is one the strings "S_ISDIR" "S_ISCHR" "S_ISBLK"
  // "S_ISREG" "S_ISFIFO" "S_ISLNK" "S_ISSOCK"
  checkFileMode: function adb_checkFileMode(aMode, aWhat) {
    /* Encoding of the file mode.  See bits/stat.h */
    const S_IFMT = parseInt("170000", 8); /* These bits determine file type.  */

    /* File types.  */
    const S_IFDIR  = parseInt("040000", 8); /* Directory.  */
    const S_IFCHR  = parseInt("020000", 8); /* Character device.  */
    const S_IFBLK  = parseInt("060000", 8); /* Block device.  */
    const S_IFREG  = parseInt("100000", 8); /* Regular file.  */
    const S_IFIFO  = parseInt("010000", 8); /* FIFO.  */
    const S_IFLNK  = parseInt("120000", 8); /* Symbolic link.  */
    const S_IFSOCK = parseInt("140000", 8); /* Socket.  */

    let masks = {
      "S_ISDIR": S_IFDIR,
      "S_ISCHR": S_IFCHR,
      "S_ISBLK": S_IFBLK,
      "S_ISREG": S_IFREG,
      "S_ISFIFO": S_IFIFO,
      "S_ISLNK": S_ISLNK,
      "S_ISSOCK": S_IFSOCK
    }

    if (!(aWhat in masks)) {
      return false;
    }

    return ((aMode & S_IFMT) == masks[aWhat]);
  },

  // pulls a file from the device.
  // send "host:transport-any" why??
  // if !OKAY, return
  // send "sync:"
  // if !OKAY, return
  // send STAT + hex4(path.length) + path
  // recv STAT + 12 bytes (3 x 32 bits: mode, size, time)
  // send RECV + hex4(path.length) + path
  // while(needs data):
  //   recv DATA + hex4 + data
  // recv DONE + hex4(0)
  // send QUIT + hex4(0)
  pull: function adb_pull(aFrom, aDest) {
    throw "NOT_IMPLEMENTED";
    let deferred = Promise.defer();

    return deferred.promise;
  },

  /**
   * Dump the first few bytes of the given array to the console.
   *
   * @param {TypedArray} aArray
   *        the array to dump
   */
  hexdump: function adb_hexdump(aArray) {
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
  sockSend: function adb_sockSend(aSocket, aArray) {
    this.hexdump(aArray);

    if (OLD_SOCKET_API) {
      // Create a new Uint8Array in case the array we got is of a different type
      // (like Uint32Array), since the old API takes a Uint8Array.
      aSocket.send(new Uint8Array(aArray.buffer));
    } else {
      aSocket.send(aArray.buffer, aArray.byteOffset, aArray.byteLength);
    }
  },

  // pushes a file to the device.
  // aFrom and aDest are full paths.
  // XXX we should STAT the remote path before sending.
  push: function adb_pull(aFrom, aDest) {
    let deferred = Promise.defer();
    let socket;
    let state;
    let fileSize;
    let fileData;
    let remaining;
    let currentPos = 0;
    let fileTime;

    debug("pushing " + aFrom + " -> " + aDest);

    let shutdown = function() {
      debug("push shutdown");
      socket.close();
      deferred.reject("BAD_RESPONSE");
    }

    let runFSM = function runFSM(aData) {
      debug("runFSM " + state);
      let req;
      switch(state) {
        case "start":
          state = "send-transport";
          runFSM();
          break;
        case "send-transport":
          req = ADB._createRequest("host:transport-any");
          ADB.sockSend(socket, req);
          state = "wait-transport";
          break
        case "wait-transport":
          if (!ADB._checkResponse(aData)) {
            shutdown();
            return;
          }
          debug("transport: OK");
          state = "send-sync";
          runFSM();
          break
        case "send-sync":
          req = ADB._createRequest("sync:");
          ADB.sockSend(socket, req);
          state = "wait-sync";
          break
        case "wait-sync":
          if (!ADB._checkResponse(aData)) {
            shutdown();
            return;
          }
          debug("sync: OK");
          state = "send-send";
          runFSM();
          break
        case "send-send":
          // need to send SEND + length($aDest,$fileMode)
          // $fileMode is not the octal one there.
          let encoder = new TextEncoder();

          let (infoLengthPacket = new Uint32Array(1), info = aDest + ",33204") {
            infoLengthPacket[0] = info.length;
            ADB.sockSend(socket, encoder.encode("SEND"));
            ADB.sockSend(socket, infoLengthPacket);
            ADB.sockSend(socket, encoder.encode(info));
          }

          // now sending file data.
          while (remaining > 0) {
            let toSend = remaining > 65536 ? 65536 : remaining;
            debug("Sending " + toSend + " bytes");

            let dataLengthPacket = new Uint32Array(1);
            // We have to create a new ArrayBuffer for the fileData slice
            // because nsIDOMTCPSocket (or ArrayBufferInputStream) chokes on
            // reused buffers, even when we don't modify their contents.
            let dataPacket = new Uint8Array(new ArrayBuffer(toSend));
            dataPacket.set(new Uint8Array(fileData.buffer, currentPos, toSend));
            dataLengthPacket[0] = toSend;
            ADB.sockSend(socket, encoder.encode("DATA"));
            ADB.sockSend(socket, dataLengthPacket);
            ADB.sockSend(socket, dataPacket);

            currentPos += toSend;
            remaining -= toSend;
          }

          // Ending up with DONE + mtime (wtf???)
          let (fileTimePacket = new Uint32Array(1)) {
            fileTimePacket[0] = fileTime;
            ADB.sockSend(socket, encoder.encode("DONE"));
            ADB.sockSend(socket, fileTimePacket);
          }

          state = "wait-done";
          break;
        case "wait-done":
          if (!ADB._checkResponse(aData)) {
            shutdown();
            return;
          }
          debug("DONE: OK");
          state = "end";
          runFSM();
          break;
        case "end":
          socket.close();
          deferred.resolve("SUCCESS");
          break;
        default:
          debug("push Unexpected State: " + state);
          deferred.reject("UNEXPECTED_STATE");
      }
    }

    let setupSocket = function() {
      socket.onerror = function(aEvent) {
        debug("push onerror");
        deferred.reject("SOCKET_ERROR");
      }

      socket.onopen = function(aEvent) {
        debug("push onopen");
        state = "start";
        runFSM();
      }

      socket.onclose = function(aEvent) {
        debug("push onclose");
      }

      socket.ondata = function(aEvent) {
        debug("push ondata");
        runFSM(aEvent.data);
      }
    }
    // Stat the file, get its size.
    let promise = OS.File.stat(aFrom);
    promise = promise.then(
      function onSuccess(stat) {
        if (stat.isDir) {
          // The path represents a directory
          deferred.reject("CANT_PUSH_DIR");
        } else {
          // The path represents a file, not a directory
          fileSize = stat.size;
          // We want seconds since epoch
          fileTime = stat.lastModificationDate.getTime() / 1000;
          remaining = fileSize;
          debug(aFrom + " size is " + fileSize);
          let readPromise = OS.File.read(aFrom);
          readPromise.then(
            function readSuccess(aData) {
              fileData = aData;
              socket = ADB._connect();
              setupSocket();
            },
            function readError() {
              deferred.reject("READ_FAILED");
            }
          );
        }
      },
      function onFailure(reason) {
        debug(reason);
        deferred.reject("CANT_ACCESS_FILE");
      }
    );

    return deferred.promise;
  },

  // Asynchronously runs an adb command.
  // @param aCommand The command as documented in
  // http://androidxref.com/4.0.4/xref/system/core/adb/SERVICES.TXT
  runCommand: function adb_runCommand(aCommand) {
    debug("runCommand " + aCommand);
    let deferred = Promise.defer();
    if (!this.ready) {
      let window = Services.wm.getMostRecentWindow("navigator:browser");
      window.setTimeout(function() { deferred.reject("ADB_NOT_READY"); });
      return deferred.promise;
    }

    let socket = this._connect();
    let waitForFirst = true;
    let devices = {};

    socket.onopen = function() {
      debug("runCommand onopen");
      let req = this._createRequest(aCommand);
      ADB.sockSend(socket, req);

    }.bind(this);

    socket.onerror = function() {
      debug("runCommand onerror");
      deferred.reject("NETWORK_ERROR");
    }

    socket.onclose = function() {
      debug("runCommand onclose");
    }

    socket.ondata = function(aEvent) {
      debug("runCommand ondata");
      let data = aEvent.data;

      if (!this._checkResponse(data)) {
        socket.close();
        let packet = this._unpackPacket(data, false);
        debug("Error: " + packet.data);
        deferred.reject("PROTOCOL_ERROR");
        return;
      }

      let packet = this._unpackPacket(data, false);
      deferred.resolve(packet.data);
    }.bind(this);


    return deferred.promise;
  }
}

this.ADB.init();

if (COMMONJS) {
  module.exports = this.ADB;
}
