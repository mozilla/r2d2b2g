window.addEventListener("ContentStart", function() {
  function log(msg) {
    var DEBUG_LOG = true;

    if (DEBUG_LOG)
      dump("prosthesis:"+msg+"\n");
  }

  log("processing -pbport command line option");
  // Get the command line arguments that were passed to the b2g client
  let args = window.arguments[0].QueryInterface(Ci.nsICommandLine);
  let pbport;
 
   // Get the --screen argument from the command line
   try {
     pbport = args.handleFlagWithParam('pbport', false);
 
     // With no value, tell the user how to use it
     if (pbport == '')
       usage();

     if (parseInt(pbport) === NaN)
       usage();
   }
   catch(e) {
     // If getting the argument value fails, its an error
     fail("EXCEPTION processing -dbgport '"+e+"': "+e.stack);
     usage();
   }

  try {
    let pprefs = Cc['@mozilla.org/preferences-service;1']
         .getService(Ci.nsIPrefService).getBranch("devtools.prosthesis.");
     pprefs.setIntPref("pingback-port", parseInt(pbport));
    log("pingpack port is: "+pbport);
  } catch(e) {
    fail("EXCEPTION setting pbport into preferences '"+e+"': "+e.stack);
  }

  function usage() {
    let msg = 'The --pbport argument specifies the desired port to pingback when ready.\n' +
      'Use it like this:\n'+
      '\t--pbport PORT (e.g. --pbport 5431243)\n';
    dump(msg);
    // exit b2g
    Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
  }

  function log(msg) dump(msg+"\n")
  function fail(msg) {
    log(msg);
    Services.startup.quit(Ci.nsIAppStartup.eAttemptQuit);
  }
}, false);