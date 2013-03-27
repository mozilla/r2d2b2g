/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// NOTE: disable lockscreen by default on FirefoxOS Simulator
SettingsListener.observe("lockscreen.enabled", false, function(value) {
  debug("LOCKSCREEN ENABLED: "+value);

  if (!value) {
    return;
  }

  let homescreen = document.getElementById("homescreen").contentWindow.wrappedJSObject;

  debug("wait for lockscreen.locked");
  // keep the lockscreen unlocked
  SettingsListener.observe("lockscreen.locked", true, function(value) {
    debug("LOCKSCREEN LOCKED: "+value);
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
