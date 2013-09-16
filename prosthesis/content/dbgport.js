window.addEventListener("ContentStart", function() {
  debug("processing -dbgport command line option");

  // Get the command line arguments that were passed to the b2g client
  let args = window.arguments[0].QueryInterface(Ci.nsICommandLine);
  let dbgport;
  // Workaround until bug 916237 is fixed.
  let originalStart = RemoteDebugger.start;
  RemoteDebugger.start = function () {
    DebuggerServer.registerModule("devtools/server/actors/inspector");
    originalStart();
  };
 
   // Get the --dbgport argument from the command line
   try {
     dbgport = args.handleFlagWithParam('dbgport', false);
 
     // With no value, tell the user how to use it
     if (dbgport == '')
       usage();

     if (parseInt(dbgport) === NaN)
       usage();
   }
   catch(e) {
     // If getting the argument value fails, its an error
     fail("EXCEPTION processing -dbgport '"+e+"': "+e.stack);
     usage();
   }

  try {
    let dbgprefs = Cc['@mozilla.org/preferences-service;1']
         .getService(Ci.nsIPrefService).getBranch("devtools.debugger.");
    dbgprefs.setIntPref("remote-port", parseInt(dbgport));
    dbgprefs.setCharPref("unix-domain-socket", dbgport);
    debug("remote debugger will start on port: "+dbgport);
  } catch(e) {
    fail("EXCEPTION setting dbgport into preferences '"+e+"': "+e.stack);
  }

  function usage() {
    let msg = 'The --dbgport argument specifies the desired remote debugger port.\n' +
      'Use it like this:\n'+
      '\t--dbgport PORT (e.g. --dbgport 6001)\n';
    dump(msg);
    // exit b2g
    Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
  }

  function fail(msg) {
    dump(msg + "\n");
    Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
  }
}, false);
