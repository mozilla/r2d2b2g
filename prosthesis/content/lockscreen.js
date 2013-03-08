/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// NOTE: disable lockscreen by default on FirefoxOS Simulator
// and detect when homescreen app is fully loaded

// disable lockscreen on startup
SettingsListener.observe("lockscreen.enabled", false, function(value) {
  dump("simulator - LOCKSCREEN ENABLED: "+value+"\n");

  if (!value)
    return

  navigator.mozSettings
    .createLock().set({'homescreen.ready': false});

  let homescreen = document.getElementById("homescreen").contentWindow.wrappedJSObject;

  dump("simulator - HOMESCREEN LOCKED: wait for lockscreen.locked \n");
  // keep the lockscreen unlocked
  SettingsListener.observe("lockscreen.locked", true, function(value) {
    dump("simulator - HOMESCREEN LOCKED: "+value+"\n");
    try {
      if (value) {
        homescreen.LockScreen.unlock(true);
      } else {
        homescreen.addEventListener("mozContentEvent", function (evt) {
          dump("MOZ CONTENT EVENT: ");
          if (evt.detail)
            dump("\t"+evt.detail.type);
        }, true);

        navigator.mozSettings
          .createLock().set({'homescreen.ready': true});
        dump("simulator - HOMESCREEN READY\n");
      }
    } catch(e) {
      dump("simulator - LOCKSCREEN NOT FULLY LOADED. EXCEPTION: "+e+"\n");

      // keep trying to unlock (preserving lockscreen.locked=true)
      setTimeout(function () {
        navigator.mozSettings
          .createLock().set({'lockscreen.locked': true});
      }, 200);
    }
  });
});