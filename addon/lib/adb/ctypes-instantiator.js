/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Instantiator for ctypes
 */

'use strict';

;(function(exports, module) {

  if (module) {
    const { Cu } = require("chrome");
    Cu.import("resource://gre/modules/ctypes.jsm");
  }

  function Instantiator() {
    this._memo = [];
  }
  Instantiator.prototype = {
    use: function use(name) {
      if (!this._memo[name])
        throw "Undeclared function in library";
      return this._memo[name];
    },
    declare: function declare({ name, returns, args, abi /* optional */ }, lib) {
      let abi = abi || ctypes.default_abi;
      let func =
        lib.declare.apply(lib,
                          [name, abi, returns].concat(args));
      
      this._memo[name] = func;
      return func;
    },
    declareFromFuncType: function declareFromFuncType(name, type, lib) {
      return this.declare({ name: name,
                       abi: type.abi,
                       returns: type.returnType,
                       args: type.argTypes
                     }, lib);
    }
  };

  exports.Instantiator = Instantiator;

}).apply(null,
  typeof module !== 'undefined' ?
       [exports, module] : [this]);

