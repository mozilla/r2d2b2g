/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let Ci = Components.interfaces;
let Cc = Components.classes;
let Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function debug() dump(Array.slice(arguments) + "\n");

debug("loading SimulatorBar component definition.");

function SimulatorBar() {}
SimulatorBar.prototype = {
  classID:         Components.ID("{cd0aa5a9-1a6e-44c4-8707-3e24e9030c24}"),
  QueryInterface:  XPCOMUtils.generateQI([Ci.nsIDOMGlobalPropertyInitializer,
                                          Ci.nsISupportsWeakReference]),
  classInfo: XPCOMUtils.generateCI({
    classID: Components.ID("{cd0aa5a9-1a6e-44c4-8707-3e24e9030c24}"),
    contractID: "@mozilla.org/simulator-bar;1",
    classDescription: "mozSimulatorBar",
    interfaces: [Ci.nsIDOMGlobalPropertyInitializer,
                 Ci.nsISupportsWeakReference],
    flags: Ci.nsIClassInfo.DOM_OBJECT
  }),

  disabledBar: {
    get visible() {
      return false;
    },
    set visible(value) {
      return false;
    },
    __exposedProps__: {
      visible: "r"
    }
  },

  init: function(aWindow) {
    return this.disabledBar;
  }
};

this.NSGetFactory = XPCOMUtils.generateNSGetFactory([SimulatorBar]);
