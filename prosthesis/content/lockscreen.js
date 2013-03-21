/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

{
  let DEBUG = false;
  let DEBUG_PREFIX = "prosthesis: lockscreen.js - ";
  let debug = DEBUG ?
    function debug() dump(DEBUG_PREFIX + Array.slice(arguments).join(" ") + "\n") :
    function() {};

  // NOTE: disable lockscreen by default on FirefoxOS Simulator
  // and detect when homescreen app is fully loaded

  // disable lockscreen on startup
  SettingsListener.observe("lockscreen.enabled", false, function(value) {
    debug("simulator - LOCKSCREEN ENABLED: "+value);

    if (!value)
      return

    let homescreen = document.getElementById("homescreen").contentWindow.wrappedJSObject;

    debug("simulator - HOMESCREEN LOCKED: wait for lockscreen.locked");
    // keep the lockscreen unlocked
    SettingsListener.observe("lockscreen.locked", true, function(value) {
      debug("simulator - HOMESCREEN LOCKED: "+value);
      try {
        if (value) {
          homescreen.LockScreen.unlock(true);
        }
      } catch(e) {
        // keep trying to unlock (preserving lockscreen.locked=true)
        setTimeout(function () {
          navigator.mozSettings
            .createLock().set({'lockscreen.locked': true});
        }, 200);
      }
    });
  });
}
