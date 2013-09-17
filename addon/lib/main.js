/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const { Cc, Ci, Cr, Cu } = require("chrome");

const Self = require("self");
const URL = require("url");
const Tabs = require("tabs");
const PageMod = require("page-mod").PageMod;
const UUID = require("sdk/util/uuid");
const Menuitems = require("menuitems");
const ContextMenu = require("context-menu");
const Request = require('request').Request;
const SStorage = require("simple-storage");
const Gcli = require('gcli');
const Simulator = require("simulator.js");
const Prefs = require("preferences-service");
const SimplePrefs = require("sdk/simple-prefs").prefs;

require("marketplace-mod");

Cu.import("resource://gre/modules/Services.jsm");

PageMod({
  include: Simulator.contentPage + '*', //ensure we match hashes (#)
  contentScriptFile: Simulator.contentScript,
  contentScriptWhen: 'start',
  onAttach: function(worker) {
    // Ignore tentatives to open multiple simulator page
    // by showing the tab with existing instance
    if (Simulator.worker) {
      Simulator.worker.tab.activate();
      worker.tab.close();
    }
    else {
      Simulator.worker = worker;
    }
  },
});

/**
 * Ensure app xkeys are valid, since older versions of the addon created
 * invalid ones (not guaranteed to be unique, or containing curly braces,
 * which are invalid in app: URLs).
 */
function ensureXkeysValid() {
  for (let key in Simulator.apps) {
    let app = Simulator.apps[key];

    // Give the app a new unique xkey.
    app.xkey = UUID.uuid().toString().slice(1, -1);

    // For "local" (i.e. packaged) apps, make the origin and manifest URL match
    // the xkey, since we'll use the xkey as the ID of the app in
    // DOMApplicationRegistry, which expects each packaged app's origin to match
    // its ID.
    if (app.type == "local") {
      app.origin = "app://" + app.xkey;
      app.manifestURL = app.origin + "/manifest.webapp";
    }
  }
}

// Restore standard remote debugger port
// (autosaved on submit by connect.xhtml on simulator < 3.0pre5)
function restoreStandardRemoteDebuggerPort() {
  Services.prefs.setIntPref("devtools.debugger.remote-port", 6000);
}

/**
 * Purge Firefox's permissions database of permissions we previously added
 * for apps the user registered with the Dashboard.  The feature for which we
 * added permissions was never completed, and the user doesn't know
 * the permissions were added nor expect them to be there, so we remove them.
 */
function purgePermissions() {
  let permissions = SStorage.storage.permissions;
  if (!permissions) {
    return;
  }

  for (let origin in permissions) {
    // Get the app record associated with the origin.
    let app = simulator.apps.filter(app => app.origin == origin)[0];
    if (!app) {
      continue;
    }

    let host = app.host ? app.host : URL.URL(origin).host;

    // Remove the permissions.
    for (let type of permissions[origin]) {
      console.log("removing permission: " + host + " " + type);
      try {
        Services.perms.remove(host, type);
      }
      catch(ex) {
        // Report the error, but don't let it bork startup.
        console.error(ex);
      }
    }

    delete permissions[origin];

    // The host property was only used to register permissions, and it doesn't
    // need to be in the app record now that we're no longer registering them.
    delete app.host;
  }

  delete SStorage.storage.permissions;
}

// Retrieve the last addon version from storage, and update storage if it
// has changed, so we can do work on addon upgrade/downgrade that depends on
// the last version the user used.
let lastVersion = SStorage.storage.lastVersion || 0;
if (SStorage.storage.lastVersion != Self.version) {
  SStorage.storage.lastVersion = Self.version;
}

// on remove+install, downgrade and upgrade:
// - ensure apps xkeys are unique
// - flag needsUpdateAll if there are active apps registered
if (["install", "downgrade", "upgrade"].indexOf(Self.loadReason) >= 0) {
  // Delete obsolete property and preference.
  if (Services.vc.compare(lastVersion, "4.0pre7") < 0) {
    delete SStorage.storage.defaultApp;
    Prefs.reset("extensions.r2d2b2g.jsconsole");
  }

  if (Simulator.apps) {
    let activeAppIds = Object.keys(Simulator.apps).
      filter(function (appId) !Simulator.apps[appId].deleted);

    if (Services.vc.compare(lastVersion, "5.0pre2") < 0) {
      purgePermissions();
    }

    if (activeAppIds.length > 0) {
      if (Services.vc.compare(lastVersion, "4.0pre9") < 0) {
        ensureXkeysValid();
      }
      if (Services.vc.compare(lastVersion, "3.0pre5") < 0) {
        restoreStandardRemoteDebuggerPort();
      }
      SStorage.storage.needsUpdateAll = true;
    }
  }
}

switch (Self.loadReason) {
  case "install":
    Simulator.openHelperTab();
    break;
}

exports.onUnload = function(reason) {
  Simulator.unload(reason);
};

Tabs.on('ready', function() {
  if (Simulator.worker) {
    Simulator.sendListTabs();
  }
});
Tabs.on('close', function() {
  // Kill process when the last tab is gone
  if (!Tabs.length) {
    Simulator.unload();
  }
  if (Simulator.worker) {
    Simulator.sendListTabs();
  }
});

ContextMenu.Item({
  label: "Install Manifest as Firefox OS App",
  context: ContextMenu.SelectorContext("a"),
  contentScript: 'self.on("context", function (node) {' +
                 '  return /\\.webapp$/.test(node.href);' +
                 '});' +
                'self.on("click", function (node, data) {' +
                 '  self.postMessage(node.href)' +
                 '});',
  onMessage: function (manifestUrl) {
    Simulator.addManifestUrl(URL.URL(manifestUrl));
  },
});

Menuitems.Menuitem({
  id: "webdevFxOSSimulatorHelper",
  menuid: "menuWebDeveloperPopup",
  insertbefore: "devToolsEndSeparator",
  label: "Firefox OS Simulator",
  onCommand: function() {
    Simulator.openHelperTab();
  },
});

Menuitems.Menuitem({
  id: "appmenu_fxossimulator",
  menuid: "appmenu_webDeveloper_popup",
  insertbefore: "appmenu_devToolsEndSeparator",
  label: "Firefox OS Simulator",
  onCommand: function() {
    Simulator.openHelperTab();
  },
});

Gcli.addCommand({
  name: 'firefoxos',
  description: 'Commands to control Firefox OS Simulator',
});

Gcli.addCommand({
  name: "firefoxos manager",
  description: "Open the Firefox OS Simulator Manager",
  params: [],
  exec: function(args, context) {
    Simulator.openHelperTab();
  },
});

Gcli.addCommand({
  name: 'firefoxos port',
  description: 'Commands to control Firefox OS Simulator preferred Remote Debugger Port',
});

Gcli.addCommand({
  name: "firefoxos port get",
  description: "Show the preferred remote debugger port",
  returnType: 'string',
  exec: function(args, context) {
    if (Simulator.isRunning) {
      return "Simulator is running, listening on port: " +
        Simulator.remoteSimulator.remoteDebuggerPort;
    } else if (SimplePrefs.preferredSimulatorPort && // NOTE: workaround hidden simple prefs
                                                     // needed until we can use http://bugzil.la/768388
               SimplePrefs.preferredSimulatorPort !== -1) {
      return "Simulator is not running. Preferred port: " +
        SimplePrefs.preferredSimulatorPort;
    } else {
      return "Simulator is not running. No preferred port set.";
    }
  },
});

Gcli.addCommand({
  name: "firefoxos port set",
  description: "Set a preferred Remote Debugger Port to listen on",
  params: [{
    name: 'port',
    type: 'number',
    description: 'Simulator preferred Remote Debugger Port'
  }],
  returnType: 'string',
  exec: function(args, context) {
    if (args.port) {
      SimplePrefs.preferredSimulatorPort = args.port;
    } else {
      return "port argument is mandatory";
    }
  },
});

Gcli.addCommand({
  name: "firefoxos port reset",
  description: "Reset preferred Remote Debugger Port to listen on",
  exec: function(args, context) {
    SimplePrefs.preferredSimulatorPort = -1;
  },
});

Gcli.addCommand({
  name: "firefoxos start",
  description: "Start Firefox OS Simulator",
  exec: function(args, context) {
    Simulator.run();
  },
});

Gcli.addCommand({
  name: "firefoxos stop",
  description: "Stop Firefox OS Simulator",
  params: [],
  exec: function(args, context) {
    if (Simulator.isRunning) {
      Simulator.kill();
    }
  },
});
