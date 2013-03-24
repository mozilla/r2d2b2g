// patch startDebugger to add simulator-actors and pingback simulator manager
// on ready.
{
  debug("patch RemoteDebugger.start");

  // add simulator actors
  let presimulator_RemoteDebugger_start = RemoteDebugger.start.bind(RemoteDebugger);
  RemoteDebugger.start = function simulatorRemoteDebuggerStart() {
    presimulator_RemoteDebugger_start(); // call original RemoteDebugger.start
    DebuggerServer.addActors('chrome://prosthesis/content/dbg-simulator-actors.js');
    // NOTE: add temporary simulatorWebAppsActor
    DebuggerServer.addActors('chrome://prosthesis/content/dbg-webapps-actors.js');
    DebuggerServer.addActors('chrome://prosthesis/content/dbg-scratchpad-actors.js');
    pingback();
  }

  // allow remote debugger connection without any user confirmation
  RemoteDebugger.prompt = function() {
    this._promptDone = true;
    this._promptAnswer = true;
    return true;
  };


  let pingback = function pingback() {
    debug("sending pingback");

    let pprefs = Cc['@mozilla.org/preferences-service;1']
      .getService(Ci.nsIPrefService).getBranch("devtools.prosthesis.");
    let pbport = pprefs.getIntPref("pingback-port");
    
    if (pbport) {
      try {
        Cu.import("resource://gre/modules/Services.jsm");
        Cu.import("resource://gre/modules/XPCOMUtils.jsm");
        XPCOMUtils.defineLazyServiceGetter(this, "socketTransportService",
                                           "@mozilla.org/network/socket-transport-service;1",
                                           "nsISocketTransportService");
        let transport = socketTransportService.createTransport(null, 0, "127.0.0.1", 
                                                               pbport, null);
        let input = transport.openInputStream(0,0,0);
        let stream = input.QueryInterface(Ci.nsIAsyncInputStream);
        stream.asyncWait({
          onInputStreamReady: function() { debug("pingback received"); }
        }, 0, 0, Services.tm.currentThread);
        debug("pingback sent");
      } catch(e) {
        debug("EXCEPTION sending pingback:", e.toString());
      }
    }
  }
}
