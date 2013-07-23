/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Bridge builder for ctypes
 *
 * where a bridge is defined as simply intercepting function calls from native code
 * and re-firing them from a different library
 */

'use strict';

;(function(exports) {

  function BridgeBuilder(Instantiator, lib) {
    this.I = Instantiator;
    this.lib = lib;
    this.saved_errno = -1;
  }
  BridgeBuilder.prototype = {
    // returns [StructType, Struct, ref]
    //    where StructType is the type of the generated struct
    //    where Struct is the generated struct
    //    where ref is an array of functions used in function pointers (to prevent premature GC)
    build: function build(name, bridge_funcs) {
      bridge_funcs.forEach((function func(obj) {
        for (let k in obj) {
          this.I.declareFromFuncType(k, obj[k], this.lib);
        }
      }).bind(this));    
    
      const bridge_body = bridge_funcs.map(function func(obj) {
        for (let k in obj) {
          let o = {};
          o[k] = obj[k].ptr;
          return o;
        }
        return null; // to get rid of func not returning value warning
      });
      const struct_bridge =
        new ctypes.StructType(name, bridge_body);
        
      return [struct_bridge].concat(this._populate(struct_bridge(), bridge_body, bridge_funcs));
    },
    
    _zipWithIndex: function zipWithIndex(a) {
      let i = 0;
      return a.map(function(x) [x, i++]);
    },
    
    _populate: function populate(bridge, bridge_body, bridge_funcs) {    
      let ref = {};
      
      this._zipWithIndex(bridge_body).forEach((function bridgeFunc([obj, i]) {
        // grab the name of the function
        for (let k in obj) {
          // store the bridge to prevent premature garbage collection
          ref[k] = (function bridgeCall() {
            // get a reference to the actual DLL call
            let f = this.I.use(k);
            // call the real DLL function with the arguments to the bridge call
            let res = f.apply(f, arguments);
            this.saved_errno = ctypes.winLastError;
            return res;
          }).bind(this);
          // install this callback in the bridge struct
          bridge[k] = bridge_funcs[i][k].ptr(ref[k]);
        }
        return null; // to get rid of func not returning value warning
      }).bind(this));
      
      return [bridge, ref];
    },

    getLastError: function getLastError() {
      return this.saved_errno;
    }
  };

  exports.BridgeBuilder = BridgeBuilder;

}).apply(null,
  typeof module !== 'undefined' ?
       [exports] : [this]);
