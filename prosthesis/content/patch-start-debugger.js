// patch startDebugger to add simulator-actors and pingback simulator manager
// on ready.
{
  let log = function log(msg) {
    var DEBUG_LOG = true;

    if (DEBUG_LOG)
      dump("prosthesis:"+msg+"\n");
  };

  log("patch RemoteDebugger.start");

  // add simulator actors
  let presimulator_RemoteDebugger_start = RemoteDebugger.start.bind(RemoteDebugger);
  RemoteDebugger.start = function simulatorRemoteDebuggerStart() {
    presimulator_RemoteDebugger_start(); // call original RemoteDebugger.start
    DebuggerServer.addActors('chrome://prosthesis/content/dbg-simulator-actors.js');
    // NOTE: add temporary simulatorWebAppsActor
    DebuggerServer.addActors('chrome://prosthesis/content/dbg-webapps-actors.js');
    pingback();
  }

  // allow remote debugger connection without any user confirmation
  RemoteDebugger.prompt = function() {
    this._promptDone = true;
    this._promptAnswer = true;
    return true;
  };


  let pingback = function pingback() {
    log("sending pingback");

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
          onInputStreamReady: function() { log("pingback received"); }
        }, 0, 0, Services.tm.currentThread);
        log("pingback sent");
      } catch(e) {
        log("EXCEPTION sending pingback: "+e.toString());
      }
    }
  }
}
