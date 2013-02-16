/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// NOTE: disable lockscreen by default on FirefoxOS Simulator
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
        navigator.mozSettings
          .createLock().set({'homescreen.ready': true});
        dump("simulator - HOMESCREEN READY\n");
      }
    } catch(e) {
      dump("simulator -  EXCEPTION UNLOCKING SCREEN: "+e+"\n");

      // keep trying to unlock (preserving lockscreen.locked=true)
      setTimeout(function () {
        navigator.mozSettings
          .createLock().set({'lockscreen.locked': true});
      }, 200);
    }
  });
});

document.getElementById("homeButton").addEventListener("mousedown", function() {
  let event = document.createEvent("KeyboardEvent");
  event.initKeyEvent("keydown", true, true, null, false, false, false, false,
                     event.DOM_VK_HOME, 0);
  window.dispatchEvent(event);
}, false);

document.getElementById("homeButton").addEventListener("mouseup", function() {
  let event = document.createEvent("KeyboardEvent");
  event.initKeyEvent("keyup", true, true, null, false, false, false, false,
                     event.DOM_VK_HOME, 0);
  window.dispatchEvent(event);
}, false);
