// patch startDebugger to add actors and pingback simulator manager on ready.
{
  debug("patch RemoteDebugger.start");

  // add simulator actors
  let presimulator_RemoteDebugger_start = RemoteDebugger.start.bind(RemoteDebugger);
  RemoteDebugger.start = function simulatorRemoteDebuggerStart() {
    presimulator_RemoteDebugger_start(); // call original RemoteDebugger.start
    DebuggerServer.addActors('chrome://prosthesis/content/dbg-simulator-actors.js');
    DebuggerServer.addActors('chrome://prosthesis/content/dbg-geolocation-actors.js');
    DebuggerServer.addActors('chrome://prosthesis/content/dbg-geolocation-ui-actors.js');
    // NOTE: add temporary simulatorWebAppsActor
    DebuggerServer.addActors('chrome://prosthesis/content/dbg-webapps-actors.js');
    // Register our copy of styleeditor until it gets uplifted to b2g18
    DebuggerServer.addActors('chrome://prosthesis/content/dbg-styleeditor-actors.js');
    DebuggerServer.addTabActor(DebuggerServer.StyleEditorActor, "styleEditorActor");
  };

  // NOTE: used by the startSecondaryListener simulator actor command
  DebuggerServer.openSecondaryListener = function SimulatorOpenSecondaryListener(aPort) {
    this._checkInit();

    if (this._secondaryListener) {
      return true;
    }

    try {
      const CC = Components.Constructor;
      const ServerSocket = CC(
        '@mozilla.org/network/server-socket;1', 'nsIServerSocket', 'init');
      let flags = Ci.nsIServerSocket.KeepWhenOffline | Ci.nsIServerSocket.LoopbackOnly;
      let socket = new ServerSocket(aPort, flags, 4);
      socket.asyncListen(this);
      this._secondaryListener = socket;
    } catch (e) {
      debug("Could not start debugging listener on port " + aPort + ": " + e);
      throw Cr.NS_ERROR_NOT_AVAILABLE;
    }
    this._socketConnections++;

    return true;
  };

  // allow remote debugger connection without any user confirmation
  RemoteDebugger.prompt = function() {
    this._promptDone = true;
    this._promptAnswer = true;
    return true;
  };
}
