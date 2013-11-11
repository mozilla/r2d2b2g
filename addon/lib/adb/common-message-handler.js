/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Common message handler
 *
 * Registers common listeners before passing control
 * to regular JsMessage handlers
 */

'use strict';

;(function(exports, module) {

  let isModule = !!module;
  if (isModule) {
    const { Cu } = require("chrome");
    Cu.import("resource://gre/modules/ctypes.jsm");
    const { JsMessage } = require("adb/js-message");
  } else {
    module = {};
  }

  module.exports = function CommonMessageHandler(worker, console, andThen) {
    return function(channel, args) {
      try {
        channel = channel.readString();
        switch(channel) {
          case "restart-adb":
            worker.emitAndForget("restart-me", { });
            return JsMessage.pack(1, Number);
          case "close-adb":
            worker.emitAndForget("close-me", { });
            return JsMessage.pack(1, Number);
          default:
            return andThen(channel, args);
        }
      } catch (e) {
        console.log("JS exception: " + e);
        return JsMessage.pack(-1, Number);
      }
    };
  };

  if (!isModule) {
    exports.CommonMessageHandler = module.exports;
  }

}).apply(null,
  typeof module !== 'undefined' ?
       [exports, module] : [this]);

