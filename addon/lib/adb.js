/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Wrapper around the ADB utility.

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

let subprocess;
if (COMMONJS) {
  subprocess = require("subprocess");
} else {
  Cu.import("chrome://b2g-remote/content/subprocess.jsm");
}

// Get the TextEncoder and TextDecoder interfaces from the hidden window,
// since they aren't defined in a CommonJS module by default.
let hiddenWindow = Cc['@mozilla.org/appshell/appShellService;1']
                     .getService(Ci.nsIAppShellService).hiddenDOMWindow;
let TextEncoder = COMMONJS ? hiddenWindow.TextEncoder : TextEncoder;
let TextDecoder = COMMONJS ? hiddenWindow.TextDecoder : TextDecoder;

try {
  Cu.import("resource://gre/modules/commonjs/promise/core.js");
} catch (e) {
  Cu.import("resource://gre/modules/commonjs/sdk/core/promise.js");
}
Cu.import("resource://gre/modules/osfile.jsm");

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

this.ADB = {
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
    let self = this;

    subprocess.call({
      command: this._adb.path,

      arguments: ["start-server"],

      stdout: function adb_start_stdout(data) {
        debug("stdout: " + data);
      },

      stderr: function adb_start_stderr(data) {
        debug("stderr: " + data);
      },

      done: function adb_start_done(result) {
        debug("start-server exit code: " + result.exitCode);
        if (result.exitCode == 0) {
          Services.prefs.setBoolPref("dom.mozTCPSocket.enabled", true);
          Services.obs.notifyObservers(null, "adb-ready", null);
          self.ready = true;
        } else {
          self.ready = false;
        }
      }
    });
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
    let process = subprocess.call({
      command: this._adb.path,

      arguments: ["kill-server"],

      stdout: function adb_start_stdout(data) {
        debug("kill-server stdout: " + data);
      },

      stderr: function adb_start_stderr(data) {
        debug("kill-server stderr: " + data);
      },

      done: function adb_start_done(result) {
        debug("kill-server exit code: " + result.exitCode);
        if (result.exitCode == 0) {
          Services.obs.notifyObservers(null, "adb-killed", null);
          self.ready = false;
        } else if (result.exitCode == 1) {
          // This is a known problem.  For some reason, adb kill-server
          // frequently writes "* server not running *" and exits with code 1
          // even though the server process was running, and it killed it.
          Services.obs.notifyObservers(null, "adb-killed", null);
          self.ready = false;
        } else {
          // It's hard to say whether or not ADB is ready at this point,
          // but it seems safer to assume that it isn't, so code that wants
          // to use it later will try to restart it.
          Services.obs.notifyObservers(null, "adb-killed", null);
          self.ready = false;
        }
      }
    });
    if (aSync) {
      process.wait();
    }
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
    let view = new Uint32Array(aPacket.buffer, 0 , 1);
    if (view[0] == FAIL) {
      debug("Response: FAIL");
    }
    return view[0] == OKAY;
  },

  // @param aPacket         The packet to get the length from.
  // @param aIgnoreResponse True if this packet has no OKAY/FAIL.
  // @return                A js object { length:...; data:... }
  _unpackPacket: function adb_unpackPacket(aPacket, aIgnoreResponse) {
    let lengthView = new Uint8Array(aPacket.buffer, aIgnoreResponse ? 0 : 4, 4);
    let decoder = new TextDecoder();
    let length = parseInt(decoder.decode(lengthView), 16);
    let text = new Uint8Array(aPacket.buffer, aIgnoreResponse ? 4 : 8, length);
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
      socket.send(req);

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
      debug("length=" + data.length);
      let dec = new TextDecoder();
      debug(dec.decode(data).trim());

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

  // debugging version of tcpsocket.send()
  sockSend: function adb_sockSend(aSocket, aArray) {
    let decoder = new TextDecoder();
    let s = decoder.decode(aArray);
    let len = aArray.length;
    let dbg = "len=" + len + " ";
    let l = len > 20 ? 20 : len;

    for (let i = 0; i < l; i++) {
      let c = aArray[i].toString(16);
      if (c.length == 1)
        c = "0" + c;
      dbg += c;
    }
    dbg += " ";
    for (let i = 0; i < l; i++) {
      let c = aArray[i];
      if (c < 32 || c > 127) {
        dbg += ".";
      } else {
        dbg += s[i];
      }
    }
    debug(dbg);
    aSocket.send(aArray);
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
          socket.send(req);
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
          socket.send(req);
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
          let uint32Packet = new Uint32Array(1);
          let uint8Packet = new Uint8Array(uint32Packet.buffer, 0, 4);
          ADB.sockSend(socket, encoder.encode("SEND"));
          let info = aDest + ",33204";
          uint32Packet[0] = info.length;
          ADB.sockSend(socket, uint8Packet);
          ADB.sockSend(socket, encoder.encode(info));

          // now sending file data.
          while (remaining > 0) {
            let toSend = remaining > 65536 ? 65536 : remaining;
            debug("Sending " + toSend + " bytes");
            ADB.sockSend(socket, encoder.encode("DATA"));
            uint32Packet[0] = toSend;
            ADB.sockSend(socket, uint8Packet);
            ADB.sockSend(socket, new Uint8Array(fileData.buffer, currentPos, toSend));
            currentPos += toSend;
            remaining -= toSend;
          }

          // Ending up with DONE + mtime (wtf???)
          socket.send(encoder.encode("DONE"));
          uint32Packet[0] = fileTime;
          socket.send(uint8Packet);
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
      socket.send(req);

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
