/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

{

function log(msg) {
  var DEBUG_LOG = false;

  if (DEBUG_LOG)
    dump("prosthesis: lockscreen.js - "+msg+"\n");
}

// NOTE: disable lockscreen by default on FirefoxOS Simulator
// and detect when homescreen app is fully loaded

// disable lockscreen on startup
SettingsListener.observe("lockscreen.enabled", false, function(value) {
  log("simulator - LOCKSCREEN ENABLED: "+value);

  if (!value)
    return

  navigator.mozSettings
    .createLock().set({'homescreen.ready': false});

  let homescreen = document.getElementById("homescreen").contentWindow.wrappedJSObject;

  log("simulator - HOMESCREEN LOCKED: wait for lockscreen.locked");
  // keep the lockscreen unlocked
  SettingsListener.observe("lockscreen.locked", true, function(value) {
    log("simulator - HOMESCREEN LOCKED: "+value);
    try {
      if (value) {
        homescreen.LockScreen.unlock(true);
      } else {
        navigator.mozSettings
          .createLock().set({'homescreen.ready': true});
        log("simulator - HOMESCREEN READY");
      }
    } catch(e) {
      //log("simulator - LOCKSCREEN NOT FULLY LOADED. EXCEPTION: "+e);

      // keep trying to unlock (preserving lockscreen.locked=true)
      setTimeout(function () {
        navigator.mozSettings
          .createLock().set({'lockscreen.locked': true});
      }, 200);
    }
  });
});

}