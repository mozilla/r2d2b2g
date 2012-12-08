// patch startDebugger to add simulator-actors and pingback simulator manager
// on ready.
window.addEventListener("ContentStart", function() {
  function log(msg) {
    var DEBUG_LOG = true;

    if (DEBUG_LOG)
      dump("prosthesis:"+msg+"\n");
  }

  log("patch startDebugger");

  presimulator_startDebugger = startDebugger;
  window.startDebugger = function startDebugger() {
    presimulator_startDebugger();
    DebuggerServer.addActors('chrome://prosthesis/content/simulator-actors.js');
    pingback();
  }

  log("start debugger");
  startDebugger();

  function pingback() {
    log("sending pingback");

    let pprefs = Cc['@mozilla.org/preferences-service;1']
      .getService(Ci.nsIPrefService).getBranch("devtools.prosthesis.");
    var pbport = pprefs.getIntPref("pingback-port");
    
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
});