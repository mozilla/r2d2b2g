/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * JsMessage
 *
 * Takes a (void *)(struct *) from C and unpacks it properly
 */

'use strict';

;(function(exports, module) {

  if (module) {
    const { Cu } = require("chrome");
    Cu.import("resource://gre/modules/ctypes.jsm");
  }

  // the lifetime of the value returned from the JsMessage if it is allocated in
  //   JS lasts until MSG is called again (this will prevent leaks as much as
  //   possible)
  let w;
  exports.JsMessage = {
    pack: function pack(val, type) {
      if (type(0) === Number(0)) {
        w = ctypes.intptr_t(val);
        return ctypes.cast(w, ctypes.intptr_t.ptr);
      } else if (type(0) === String(0)) {
        w = ctypes.char.array()(val);
        return w;
      } else {
        w = ctypes.intptr_t(-404);
        return ctypes.cast(w, ctypes.intptr_t.ptr);
      }
    },

    unpack: function unpack(struct_ptr /*, types */) {
      let types = Array.slice(arguments, 1);
      let struct_body = types.map(function (type, i) {
        let o = {};
        o["s_" + i] = type;
        return o;
      });

      const struct_type =
        new ctypes.StructType("anon", struct_body);

      let as_struct_type = ctypes.cast(struct_ptr, struct_type.ptr);
      return types.map(function(unused, i) as_struct_type.contents["s_" + i]);
    }
  };

}).apply(null,
  typeof module !== 'undefined' ?
       [exports, module] : [this]);

