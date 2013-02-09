/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. 
 */

'use strict';

const { Cc, Ci, Cu, ChromeWorker } = require("chrome");

const { EventTarget } = require("sdk/event/target");
const { emit, off } = require("sdk/event/core");
const { Class } = require("sdk/core/heritage");

const Runtime = require("runtime");
const Self = require("self");
const URL = require("url");
const Subprocess = require("subprocess");
const Prefs = require("preferences-service");

const { rootURI: ROOT_URI } = require('@loader/options');
const PROFILE_URL = ROOT_URI + "profile/";

const PingbackServer = require("pingback-server");

// import debuggerSocketConnect and DebuggerClient
Cu.import("resource://gre/modules/devtools/dbg-client.jsm");

const RemoteSimulatorClient = Class({
  extends: EventTarget,
  initialize: function initialize(options) {
    EventTarget.prototype.initialize.call(this, options);
    this._hookInternalEvents();
  },
  // check if b2g is running and connected
  get isConnected() this._clientConnected,
  // check if b2g is running
  get isRunning() !!this.process, 
  // check if b2g exited without reach a ready state
  get isExitedWithoutReady() { return !this.process && !this._pingbackCompleted; },
  
  _hookInternalEvents: function () {
    // NOTE: remote all listeners (currently disabled cause this function
    //       will be called only once)
    //off(this);

    // on pinbackTimeout, emit an high level "timeout" event
    // and kill the stalled instance
    this.once("pingbackTimeout", function() {
      this._pingbackCompleted = false;
      this._clientConnecting = false;
      emit(this, "timeout", null);
      this.kill();
    });

    // on pingbackCompleted, track a completed pingback and start
    // debugger protocol connection
    this.on("pingbackCompleted", function() {
      console.debug("rsc.onPingbackCompleted");
      this._pingbackCompleted = true;
      this.connectDebuggerClient();
    });

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
          webapps: reply.webappsActor
        });
      }).bind(this));
    });

    // on clientReady, track remote target, resubscribe old window manager
    // listeners and emit an high level "ready" event
    this.on("clientReady", function (remote) {
      console.debug("rsc.onClientReady");
      this._remote = remote;
      this._unsubscribeWindowManagerEvents();
      this._subscribeWindowManagerEvents(function(packet) {
        console.debug("received a gaia WindowManager event: "+JSON.stringify(packet));
      });
      emit(this, "ready", null);
    });

    // on clientClosed, untrack old remote target and emit 
    // an high level "disconnected" event
    this.on("clientClosed", function () {
      console.debug("rsc.onClientClosed");
      this._clientConnected = false;
      this._clientConnecting = false;
      this._remote = null;
      emit(this, "disconnected", null);
    });
  },
  // run({defaultApp: "Appname", pingbackTimeout: 15000})
  // will spawn a b2g instance, optionally run an application
  // and change pingback timeout interval
  run: function (options) {
    if (options) {
      this._defaultApp = options.defaultApp;
      this._pingbackTimeout = options.pingbackTimeout;
      delete options.defaultApp;
      delete options.pingbackTimeout;
    } else {
      this._defaultApp = null;
      this._pingbackTimeout = null;
    }

    // kill before start if already running
    if (this.process != null) {
      this.process.kill();
    }

    // reset _pingbackCompleted flag
    this._pingbackCompleted = false;
    // start pingback timeout handler
    this._startPingbackTimeout();

    this.once("stdout", function () {
      if (Runtime.OS == "Darwin") {
          console.debug("WORKAROUND run osascript to show b2g-desktop window"+
                        " on Runtime.OS=='Darwin'");
        // Escape double quotes and escape characters for use in AppleScript.
        let path = this.b2gExecutable.path
          .replace(/\\/g, "\\\\").replace(/\"/g, '\\"');

        Subprocess.call({
          command: "/usr/bin/osascript",
          arguments: ["-e", 'tell application "' + path + '" to activate'],
        });
      }
    });    

    // spawn a b2g instance
    this.process = Subprocess.call({
      command: this.b2gExecutable,
      arguments: this.b2gArguments,

      // emit stdout messages
      stdout: (function(data) {
        emit(this, "stdout", data);
      }).bind(this),
      
      // emit stdout messages
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
        this.shuttingDown = false;
        emit(this, "exit", result.exitCode);
      }).bind(this)
    });    
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

    let client = new DebuggerClient(transport);

    client.addListener("closed", (function () {
      emit(this, "clientClosed", {client: client});
    }).bind(this));

    client.connect((function () {
      emit(this, "clientConnected", {client: client});
    }).bind(this));
  },

  // send a getBuildID request to the remote simulator actor
  getBuildID: function(onResponse) {
    let remote = this._remote;
    remote.client.request({to: remote.simulator, type: "getBuildID"}, onResponse);
  },

  // send a logStdout request to the remote simulator actor
  logStdout: function(message, onResponse) {
    let remote = this._remote;
    remote.client.request({to: remote.simulator, 
                           message: message,
                           type: "logStdout"}, onResponse);
  },

  // send a runApp request to the remote simulator actor
  runApp: function(appname, onResponse) {
    let remote = this._remote;

    remote.client.request({to: remote.simulator, type: "runApp", appname: appname}, 
                          onResponse);
  },

  // send an install request to the remote webappsActor
  install: function(appId, appType, onResponse) {
    this._remote.client.request({ to: this._remote.webapps,
                                  type: "install",
                                  appId: appId,
                                  appType: appType},
                                onResponse);
  },

  uninstall: function(appOrigin, onResponse) {
    this._remote.client.request({ to: this._remote.simulator,
                                  type: "uninstallApp",
                                  origin: appOrigin,
                                },
                                onResponse);
  },

  // send a ping request to the remote simulator actor
  ping: function(onResponse) {
    let remote = this._remote;
    remote.client.request({to: remote.simulator, type: "ping"}, onResponse);
  },

  // send a subscribeWindowManagerEvents request to the remote simulator actor
  // NOTE: this events will be automatically sent on clientReady
  _subscribeWindowManagerEvents: function(onEvent) {
    let remote = this._remote;

    let handler = (function(type, packet) {
      let unregister = onEvent(packet);
      if (unregister) {
        this._offRemotePacket("windowManagerEvent", handler);
      }
    }).bind(this);

    this._onRemotePacket("windowManagerEvent", handler);

    let remote = this._remote;
    remote.client.request({to: remote.simulator, type: "subscribeWindowManagerEvents"}, 
                          onEvent);
  },

  // send a unsubscribeWindowManagerEvents request to the remote simulator actor
  _unsubscribeWindowManagerEvents: function() {
    let remote = this._remote;
    this._unsubscribeRemotePacket("windowManagerEvent");
    remote.client.request({to: remote.simulator, type: "unsubscribeWindowManagerEvents"}, 
                          function() {});
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
    args.push("-pbport", ""+this.pingbackServerPort);
    
    if (this.jsConsoleEnabled) {
      args.push("-jsconsole");
    }

    if (this._defaultApp != null) {
      args.push("--runapp", this._defaultApp);
    }

    return args;
  },

  /* pingback helpers */
  _startPingbackTimeout: function () {
    if(!!this._pingbackServer) {
      // NOTE: max wait time e.g. 15s
      this._pingbackServer.startTimeout(this._pingbackTimeout || 15000);
    }
  },

  _stopPingbackTimeout: function () {
    if(!!this._pingbackServer) {
      this._pingbackServer.stopTimeout();
    }
  },
  get pingbackServerPort() {
    if (!this._pingbackServer) {
      this._pingbackServer = new PingbackServer({
        onCompleted: (function() {
          this._stopPingbackTimeout();
          emit(this, "pingbackCompleted", null);
        }).bind(this),
        onTimeout: (function() {
          emit(this, "pingbackTimeout", null);
        }).bind(this),
        onExit: (function() {
          emit(this, "pingbackExit", null);
        }).bind(this)
      });
      this._pingbackServer.start();
    }
    return this._pingbackServer.port;
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
