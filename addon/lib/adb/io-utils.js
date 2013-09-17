/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

;(function(exports, module) {

  if (module) {
    const { Cu } = require("chrome");
    Cu.import("resource://gre/modules/ctypes.jsm");
  }

  exports.ioUtils = (function ioUtils(I, lib) {
    I.declare({ name: "read_fd",
                returns: ctypes.int,
                // fd, buffer, size
                args: [ctypes.int, ctypes.char.ptr, ctypes.int]
              }, lib);

    I.declare({ name: "write_fd",
                returns: ctypes.int,
                // fd, buffer, size
                args: [ctypes.int, ctypes.char.ptr, ctypes.int]
              }, lib);

    return {
      writeFully: function writeFully(fd, toWriteS, length) { 
        let write = I.use("write_fd");
        let val = eval(toWriteS);
        let buffer = ctypes.cast(val.address(), ctypes.char.ptr);
        let r;

        while(length > 0) {
          r = write(fd, buffer, length);
          if(r > 0) {
            length -= r;
            buffer += r;
          } else {
            if (r < 0) {
              return -1; 
            }
          }
        }

        return 0;
      },

      readStringFully: function readStringFully(fd, tag, onData) {
        let read = I.use("read_fd");
        let size = 4096;
        let buffer = new ctypes.ArrayType(ctypes.char, 4096)();

        while (true) {
          let len = read(fd, buffer, size-1);
          buffer[len] = 0; // null-terminate the string

          if (len == 0) {
            break; // we're done
          } else {
            onData(buffer.readString());
          }
        }

        return 0;
      }
    };
  });

}).apply(null,
  typeof module !== 'undefined' ?
       [exports, module] : [this]);

