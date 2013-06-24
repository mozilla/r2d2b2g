/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. 
 */

'use strict';

const { Cc, Ci, Cu, ChromeWorker } = require("chrome");

Cu.import("resource://gre/modules/Services.jsm");

const { EventTarget } = require("sdk/event/target");
const { emit, off } = require("sdk/event/core");
const { Class } = require("sdk/core/heritage");
const Environment = require("sdk/system/environment").env;
const Runtime = require("runtime");
const Self = require("self");
const URL = require("url");
const Subprocess = require("subprocess");
const Prefs = require("preferences-service");
const { setTimeout, clearTimeout } = require("sdk/timers");

const { rootURI: ROOT_URI } = require('@loader/options');
const PROFILE_URL = ROOT_URI + "profile/";

// import debuggerSocketConnect and DebuggerClient
const dbgClient = Cu.import("resource://gre/modules/devtools/dbg-client.jsm");

const Geolocation = Cc["@mozilla.org/geolocation;1"].getService(Ci.nsISupports);

// add unsolicited notifications
dbgClient.UnsolicitedNotifications.geolocationStart = "geolocationStart";
dbgClient.UnsolicitedNotifications.geolocationStop = "geolocationStop";
dbgClient.UnsolicitedNotifications.appUpdateRequest = "appUpdateRequest";
dbgClient.UnsolicitedNotifications.appOpen = "appOpen";
dbgClient.UnsolicitedNotifications.appClose = "appClose";

// Log subprocess error and debug messages to the console.  This logs messages
// for all consumers of the API.  We trim the messages because they sometimes
// have trailing newlines.  And note that registerLogHandler actually registers
// an error handler, despite its name.
Subprocess.registerLogHandler(
  function(s) console.error("subprocess: " + s.trim())
);
Subprocess.registerDebugHandler(
  function(s) console.debug("subprocess: " + s.trim())
);

const RemoteSimulatorClient = Class({
  extends: EventTarget,
  initialize: function initialize(options) {
    this._appUpdateHandler = options.appUpdateHandler;
    EventTarget.prototype.initialize.call(this, options);
    this._hookInternalEvents();
  },

  // Flags for connection state
  // TODO: remove them when bug 800447 is fixed.
  _clientConnecting: false,
  _clientConnected: false,

  // check if b2g is running and connected
  get isConnected() this._clientConnected,
  // check if b2g is running
  get isRunning() !!this.process,
  // check if the remote is connected and fully initialized
  // (means that we can start using the client!)
  get isReady() !!this._remote,

  get client() this._remote.client,

  getActorForApp: function (manifestURL, callback) {
    this.client.request({to: this._remote.webapps, type: "listApps"},
      function (reply) {
        let actor = reply.apps[manifestURL];
        callback(actor);
      });
  },

  _hookInternalEvents: function () {
    // on clientConnected, register an handler to close current connection 
    // on kill and send a "listTabs" debug protocol request, finally
    // emit a clientReady event on "listTabs" reply
    this.on("clientConnected", function (data) {
      console.debug("rsc.onClientConnected");
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
      console.debug("rsc.onClientReady");
      this._remote = remote;
      // Start watching app open/close
      this.client.request({to: this._remote.webapps, type: "watchApps"},
        (function () {
          emit(this, "ready", null);
        }).bind(this));
    });

    // on clientClosed, untrack old remote target and emit 
    // an high level "disconnected" event
    this.on("clientClosed", function () {
      console.debug("rsc.onClientClosed");
      this._clientConnecting = false;
      if (!this._clientConnected && this.process) {
        // If the connection was closed before connection succeed,
        // and the process is still alive, the attempt was rejected or timed out.
        // We should keep trying to connect until we reach our own timeout.
        let timeout = this._timeout || 30000;
        if (Date.now() - this._startConnectingTime < timeout) {
          setTimeout(this.connectDebuggerClient.bind(this), 250);
        }
        else {
          emit(this, "timeout", null);
          this.kill();
        }
      }
      else {
        this._remote = null;
        if (this._clientConnected) {
          this._clientConnected = false;
          emit(this, "disconnected", null);
        }
      }
    });

    this.on("stdout", function onStdout(data) console.log(data.trim()));
    this.on("stderr", function onStderr(data) console.error(data.trim()));
  },

  // run({defaultApp: "Appname", timeout: 15000})
  // will spawn a b2g instance, optionally run an application
  // and change pingback timeout interval
  run: function (options) {
    if (options) {
      this._defaultApp = options.defaultApp;
      this._timeout = options.timeout;
      delete options.defaultApp;
      delete options.pingbackTimeout;
    } else {
      this._defaultApp = null;
      this._timeout = null;
    }

    // resolve b2g binaries path (raise exception if not found)
    let b2gExecutable = this.b2gExecutable;

    // kill before start if already running
    if (this.process != null) {
      this.process.kill();
    }

    this.once("stdout", function () {
      if (Runtime.OS == "Darwin") {
          console.debug("WORKAROUND run osascript to show b2g-desktop window"+
                        " on Runtime.OS=='Darwin'");
        // Escape double quotes and escape characters for use in AppleScript.
        let path = b2gExecutable.path
          .replace(/\\/g, "\\\\").replace(/\"/g, '\\"');

        Subprocess.call({
          command: "/usr/bin/osascript",
          arguments: ["-e", 'tell application "' + path + '" to activate'],
        });
      }
    });  

    let environment;
    if (Runtime.OS == "Linux") {
      environment = ["TMPDIR=" + Services.dirsvc.get("TmpD",Ci.nsIFile).path];
      if ("DISPLAY" in Environment) {
        environment.push("DISPLAY=" + Environment.DISPLAY);
      }
    }

    // spawn a b2g instance
    this.process = Subprocess.call({
      command: b2gExecutable,
      arguments: this.b2gArguments,
      environment: environment,

      // emit stdout event
      stdout: (function(data) {
        emit(this, "stdout", data);
      }).bind(this),

      // emit stderr event
      stderr: (function(data) {
        emit(this, "stderr", data);
      }).bind(this),

      // on b2g instance exit, reset tracked process, remoteDebuggerPort and
      // shuttingDown flag, then finally emit an exit event
      done: (function(result) {
        console.log(this.b2gFilename + " terminated with " + result.exitCode);
        this.process = null;
        // NOTE: reset old allocated remoteDebuggerPort
        this.remoteDebuggerPort = null;
        this._clientConnecting = false;
        this.shuttingDown = false;
        emit(this, "exit", result.exitCode);
      }).bind(this)
    });

    this._startConnectingTime = Date.now();
    this.connectDebuggerClient();
  },

  // request a b2g instance kill and optionally execute a callback on exit
  kill: function(onKilled) {
    if (this.process && !this.shuttingDown) {
      emit(this, "kill", null);
      this.shuttingDown = true;
      if (typeof onKilled === "function")
        this.once("exit", onKilled);
      this.process.kill();
    }
  },  

  // connect simulator using debugging protocol
  // NOTE: this control channel will be auto-created on every b2g instance run
  connectDebuggerClient: function() {
    if (this._clientConnected || this._clientConnecting) {
      console.warn("remote-simulator-client: already connected.");
      return;
    }

    this._clientConnecting = true;

    let transport = debuggerSocketConnect("127.0.0.1", this.remoteDebuggerPort);
    // Unbrick some rare connection attempts that ends up facing a race.
    // In such scenario, the connection isn't refused but input-stream-pump
    // component used in DebuggerTransport never gets its onStartRequest/onStopRequest
    // methods called.
    // We cancel attempts taking more than 3seconds to achieve.
    let timeout = setTimeout(function () {
      console.log("Killing stuck connection");
      client.close();
    }, 1000);

    let client = new DebuggerClient(transport);

    client.addListener("closed", (function () {
      clearTimeout(timeout);
      emit(this, "clientClosed", {client: client});
      this._stopGeolocation();
    }).bind(this));

    client.addListener("geolocationStart", this.onGeolocationStart.bind(this));
    client.addListener("geolocationStop", this.onGeolocationStop.bind(this));
    client.addListener("appOpen", this.onAppOpen.bind(this));
    client.addListener("appClose", this.onAppClose.bind(this));

    this._registerAppUpdateRequest(client);

    client.connect((function () {
      clearTimeout(timeout);
      emit(this, "clientConnected", {client: client});
    }).bind(this));
  },

  _registerAppUpdateRequest: function(client) {
    client.addListener("appUpdateRequest", (function(type, pkt) {
      console.log("APP UPDATE REQUEST RECEIVED", JSON.stringify(arguments, null, 2));
      this._appUpdateHandler(pkt.appId);
    }).bind(this));
  },

  _geolocationID: null,

  onGeolocationStart: function onGeolocationStart() {
    console.log("Firefox received geolocation start request");

    let onSuccess = (function onSuccess(position) {
      console.log("Firefox sending geolocation response");

      this._remote.client.request({
        to: this._remote.simulator,
        message: {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        },
        type: "geolocationUpdate"
      });
    }).bind(this);

    let onError = function onError(error) {
      console.error("geolocation error " + error.code + ": " + error.message);
    };

    this._geolocationID = Geolocation.watchPosition(onSuccess, onError);
  },

  onGeolocationStop: function onGeolocationStop() {
    console.log("Firefox received geolocation stop request");
    this._stopGeolocation();
  },

  _stopGeolocation: function _stopGeolocation() {
    if (this._geolocationID) {
      Geolocation.clearWatch(this._geolocationID);
      this._geolocationID = null;
    }
  },

  onAppOpen: function onAppOpen(type, packet) {
    emit(this, "appOpen", {
      manifestURL: packet.manifestURL
    });
  },

  onAppClose: function onAppClose(type, packet) {
    emit(this, "appClose", {
      manifestURL: packet.manifestURL
    });
  },

  // send a getBuildID request to the remote simulator actor
  getBuildID: function(onResponse) {
    let remote = this._remote;
    remote.client.request({to: remote.simulator, type: "getBuildID"}, onResponse);
  },

  // send a runApp request to the remote simulator actor
  runApp: function(appId, onResponse) {
    let remote = this._remote;

    remote.client.request({to: remote.simulator, type: "runApp", appId: appId},
                          onResponse);
  },

  // send an install request to the remote webappsActor
  install: function(appInfo, onResponse) {
    this._remote.client.request({ to: this._remote.webapps,
                                  type: "install",
                                  appId: appInfo.appId,
                                  appReceipt: appInfo.appReceipt,
                                  appType: appInfo.appType},
                                onResponse);
  },

  uninstall: function(appId, onResponse) {
    this._remote.client.request({ to: this._remote.simulator,
                                  type: "uninstallApp",
                                  appId: appId,
                                },
                                onResponse);
  },

  validateManifest: function(manifest, onResponse) {
    this._remote.client.request({ to: this._remote.simulator,
                                  type: "validateManifest",
                                  manifest: manifest,
                                },
                                onResponse);
  },

  showNotification: function(userMessage, onResponse) {
    this._remote.client.request({ to: this._remote.simulator,
                                  type: "showNotification",
                                  userMessage: userMessage,
                                },
                                onResponse);
  },

  appNotFound: function(appId, onResponse) {
    this._remote.client.request({ to: this._remote.simulator,
                                  type: "appNotFound",
                                  appId: appId
                                },
                                onResponse);
  },

  // send a ping request to the remote simulator actor
  ping: function(onResponse) {
    let remote = this._remote;
    remote.client.request({to: remote.simulator, type: "ping"}, onResponse);
  },

  /* REMOTE PACKET LISTENERS MANAGEMENT */

  // add unsolicited remote packet type listener
  _onRemotePacket: function(type, aListener) {
    let remote = this._remote;
    remote.client.addListener(type, aListener);
  },

  // remove unsolicited remote packet type listener
  _offRemotePacket: function(type, aListener) {
    let remote = this._remote;
    remote.client.removeListener(type, aListener);
  },

  // clear unsolicited remote packet type listener
  _unsubscribeRemotePacket: function(type) {
    let remote = this._remote;
    let listeners = remote.client._getListeners(type);
    listeners.forEach(function (l) remote.client.removeListener(type, l));
  },

  // add remote packet type listener (run only once)
  _onceRemotePacket: function(type, aListener) {
    let remote = this._remote;
    remote.client.addOneTimeListener(type, aListener);
  },

  // compute current b2g filename
  get b2gFilename() {
    return this._executable ? this._executableFilename : "B2G";
  },

  // compute current b2g file handle
  get b2gExecutable() {
    if (this._executable) return this._executable;

    let executables = {
      WINNT: "win32/b2g/b2g-bin.exe",
      Darwin: "mac64/B2G.app/Contents/MacOS/b2g-bin",
      Linux: (Runtime.XPCOMABI.indexOf("x86_64") == 0 ? "linux64" : "linux") +
        "/b2g/b2g-bin",
    };

    let url = Self.data.url(executables[Runtime.OS]);
    let path = URL.toFilename(url);

    let executable = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);    
    executable.initWithPath(path);
    let executableFilename = executables[Runtime.OS];

    // Support B2G binaries built without GAIADIR.
    if (!executable.exists()) {
      let executables = {
        WINNT: "win32/b2g/b2g.exe",
        Darwin: "mac64/B2G.app/Contents/MacOS/b2g",
        Linux: (Runtime.XPCOMABI.indexOf("x86_64") == 0 ? "linux64" : "linux") +
          "/b2g/b2g",
      };
      let url = Self.data.url(executables[Runtime.OS]);
      let path = URL.toFilename(url);
      executable.initWithPath(path);
      executableFilename = executables[Runtime.OS];
    }

    if (!executable.exists()) {
      // B2G binaries not found
      throw Error("b2g-desktop Executable not found.");
    }

    this._executable = executable;
    this._executableFilename = executableFilename;

    return executable;
  },

  // compute b2g CLI arguments
  get b2gArguments() {
    let args = [];

    let profile = URL.toFilename(PROFILE_URL);
    args.push("-profile", profile);

    // NOTE: push dbgport option on the b2g-desktop commandline
    args.push("-dbgport", ""+this.remoteDebuggerPort);
    
    if (this.jsConsoleEnabled) {
      args.push("-jsconsole");
    }

    if (this._defaultApp != null) {
      args.push("--runapp", this._defaultApp);
    }

    // Ignore eventual zombie instances of b2g that are left over
    args.push("-no-remote");

    return args;
  },

  // NOTE: find a port for remoteDebuggerPort if it's null or undefined
  get remoteDebuggerPort() {
    var port = this._foundRemoteDebuggerPort;

    if (port) {
      return port;
    }
     
    var serv = Cc['@mozilla.org/network/server-socket;1']
      .createInstance(Ci.nsIServerSocket);
    serv.init(-1, true, -1);
    var found = serv.port;
    console.log("rsc.remoteDebuggerPort: found free port ", found);
    this.remoteDebuggerPort = found;
    serv.close();
    return found;
  },

  // NOTE: manual set and reset allocated remoteDebuggingPort 
  //       (used by process done handler)
  set remoteDebuggerPort(port) {
    this._foundRemoteDebuggerPort = port;
  },

  get jsConsoleEnabled() {
    return Prefs.get("extensions.r2d2b2g.jsconsole", false);    
  }
});

module.exports = RemoteSimulatorClient;
