'use strict';

const { EventTarget } = require("sdk/event/target");
const { emit, off } = require("sdk/event/core");
const { Class } = require("sdk/core/heritage");

const Runtime = require("runtime");
const Self = require("self");
const URL = require("url");
const Subprocess = require("subprocess");
const Prefs = require("preferences-service");

const { Cc, Ci, Cu, ChromeWorker } = require("chrome");

const { rootURI } = require('@loader/options');
const profileURL = rootURI + "profile/";

const PingbackServer = require("pingback-server");

// import debuggerSocketConnect and DebuggerClient
Cu.import("resource://gre/modules/devtools/dbg-client.jsm");

const RemoteSimulatorClient = Class({
  extends: EventTarget,
  initialize: function initialize(options) {
    EventTarget.prototype.initialize.call(this, options);
    this._hookInternalEvents();
  },
  // check if b2g is running
  get isRunning() {
    return !!this.process;
  },
  // check if b2g exited without reach a ready state
  get isExitedWithoutReady() {
    return !this.process && !this._pingbackCompleted;
  },
  _hookInternalEvents: function () {
    // NOTE: remote all listeners (currently disabled cause this function
    //       will be called only once)
    //off(this);

    // on pinbackTimeout, emit an high level "timeout" event
    // and kill the stalled instance
    this.once("pingbackTimeout", (function() {
      emit(this, "timeout", null);
      this.kill();
    }).bind(this));

    // on pingbackCompleted, track a completed pingback and start
    // debugger protocol connection
    this.on("pingbackCompleted", (function() {
      console.log("DEBUG rsc.onPingbackCompleted");
      this._pingbackCompleted = true;
      this.connectDebuggerClient();
    }).bind(this));

    // on clientConnected, register an handler to close current connection 
    // on kill and send a "listTabs" debug protocol request, finally
    // emit a clientReady event on "listTabs" reply
    this.on("clientConnected", (function (data) {
      console.log("DEBUG rsc.onClientConnected");
      let client = data.client;
      this.once("kill", function () client.close());
      client.request({to: "root", type: "listTabs"}, (function (reply) {
        emit(this, "clientReady", {
          client: client,
          globals: reply,
          tabs: reply.tabs,
          selected: reply.selected,
          simulator: reply.simulatorActor
        });
      }).bind(this));
    }).bind(this));

    // on clientReady, track remote target, resubscribe old window manager
    // listeners and emit an high level "ready" event
    this.on("clientReady", (function (remote) {
      console.log("DEBUG rsc.onClientReady");
      this._remote = remote;
      this._unsubscribeWindowManagerEvents();
      this._subscribeWindowManagerEvents(function(packet) {
        console.log("REMOTE WindowManager EVENT: "+JSON.stringify(packet));
      });
      emit(this, "ready", null);
    }).bind(this));

    // on clientClosed, untrack old remote target and emit 
    // an high level "disconnected" event
    this.on("clientClosed", (function () {
      console.log("DEBUG rsc.onClientClosed");
      this._remote = null;
      emit(this, "disconnected", null);
    }).bind(this));
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
      if (onKilled)
        this.once("exit", onKilled);
      this.process.kill();
    }
  },  

  // create a new remote debugger connection and open remote Developer Toolbox
  // NOTE: currently this will work only on nightly
  connectDeveloperTools: function () {
    if (!this.process) {
      emit(this, "error", "ERROR: Simulator not running.\n");
      return false;
    }

    let transport = debuggerSocketConnect("127.0.0.1", this.remoteDebuggerPort);
    let devtoolsClient = new DebuggerClient(transport);
    devtoolsClient.addListener("closed", function () { 
      console.log("DEBUGGER CLIENT: connection closed"); 
    });
    devtoolsClient.connect((function () {
      devtoolsClient.request({to: "root", type: "listTabs"}, (function (reply) {
        this._openDeveloperToolbox(devtoolsClient, reply, "webconsole", true);
      }).bind(this));
    }).bind(this));
  },

  // open a remote Developer Toolbox helper
  _openDeveloperToolbox: function(client, form, toolname, chrome) {
    Cu.import("resource:///modules/devtools/Target.jsm");
    Cu.import("resource:///modules/devtools/Toolbox.jsm");
    Cu.import("resource:///modules/devtools/gDevTools.jsm");

    let target = TargetFactory.forRemote(form, client, chrome);
    gDevTools.showToolbox(target, toolname, Toolbox.HostType.WINDOW);
  },

  // connect simulator using debugging protocol
  // NOTE: this control channel will be auto-created on every b2g instance run
  connectDebuggerClient: function() {
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
                          onEvent.bind(this));
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
    if (this._executable) return this._executableFilename;
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

    this._executable = executable
    this._executableFilename = executableFilename;

    return executable;
  },

  // compute b2g CLI arguments
  get b2gArguments() {
    let args = [];

    let profile = URL.toFilename(profileURL);
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
          console.log("PINGBACK COMPLETED");
          this._stopPingbackTimeout();
          emit(this, "pingbackCompleted", null);
        }).bind(this),
        onTimeout: (function() {
          console.log("PINGBACK TIMEOUT");
          emit(this, "pingbackTimeout", null);
        }).bind(this),
        onExit: (function() {
          console.log("PINGBACK EXIT");
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
      return port
    }
     
    var serv = Cc['@mozilla.org/network/server-socket;1']
      .createInstance(Ci.nsIServerSocket);
    serv.init(-1, true, -1);
    var found = serv.port;
    console.log("FOUND FREE PORT:", found);
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