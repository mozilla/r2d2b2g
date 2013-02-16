/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// NOTE: disalbe the lockscreen by default on FirefoxOS Simulator
SettingsListener.observe("lockscreen.enabled", true, function(value) {
  if (!value)
    return;

  try {
    let homescreen = document.getElementById("homescreen").contentWindow.wrappedJSObject;
    homescreen.LockScreen.unlock(true);
    navigator.mozSettings
      .createLock().set({'homescreen.ready': true});
    dump("simulator - HOMESCREEN READY\n");
  } catch(e) {
    dump("simulator -  EXCEPTION UNLOCKING SCREEN: "+e+"\n");
    navigator.mozSettings
      .createLock().set({'homescreen.ready': false});
    setTimeout(function () {
      navigator.mozSettings
        .createLock().set({'lockscreen.enabled': true});
    }, 200);
  }
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
