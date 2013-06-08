/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const URL_PREFIX = self.location.href.replace(/evented\-chrome\-worker\-worker.js/, "");
const EVENTED_CHROME_WORKER = URL_PREFIX + "../lib/adb/evented-chrome-worker.js";

importScripts(EVENTED_CHROME_WORKER);

let worker = new EventedChromeWorker(null);

const console = {
  log: function() {
    worker.emitAndForget("log", Array.prototype.slice.call(arguments, 0));
  }
};

worker.once("fromHost", function({ a }) {
  console.log("Got fromHost: " + a);
  return { b: 2 };
});

worker.emit("fromWorker", { c: 3 }, function({ d }) {
  console.log("Callback from fromWorker: " + d);
});

