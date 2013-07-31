/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

'use strict';

const Promise = require("sdk/core/promise");
const subprocess = require("subprocess");

const { platform } = require("system");
const env = require("api-utils/environment").env;
const File = require("file");

const psRegexNix = /.*adb .*fork\-server/;
const psRegexWin = /adb.exe.*/;
module.exports = {
  check: function check() {
    let deferred = Promise.defer();

    let ps, args;
    if (platform === "winnt") {
      ps = "C:\\windows\\system32\\tasklist.exe";
      args = [];
    } else {
      args = ["aux"];
      let psCommand = "ps";

      let paths = env.PATH.split(':');
      let len = paths.length;
      for (let i = 0; i < len; i++) {
        try {
          let fullyQualified = File.join(paths[i], psCommand);
          if (File.exists(fullyQualified)) {
            ps = fullyQualified;
            break;
          }
        } catch (e) {
          // keep checking PATH if we run into NS_ERROR_FILE_UNRECOGNIZED_PATH
        }
      }
      if (!ps) {
        console.warn("a task list executable not found on filesystem");
        deferred.resolve(false); // default to restart adb
        return deferred.promise;
      }
    }

    let buffer = [];

    subprocess.call({
      command: ps,
      arguments: args,
      stdout: function(data) {
        buffer.push(data);
      },
      done: function() {
        let lines = buffer.join('').split('\n');
        let regex = (platform === "winnt") ? psRegexWin : psRegexNix;
        let isAdbRunning = lines.some(function(line) {
          return regex.test(line);
        });
        deferred.resolve(isAdbRunning);
      }
    });

    return deferred.promise;
  }
}
