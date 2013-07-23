/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EventedChromeWorker = require("adb/evented-chrome-worker").EventedChromeWorker;

const URL_PREFIX = module.uri.replace(/test\-evented\-chrome\-worker\.js/, "");
const WORKER_URL = URL_PREFIX + "evented-chrome-worker-worker.js";

exports["test EventedChromeWorker"] = function (assert, done) {
  let worker = new EventedChromeWorker(WORKER_URL, "worker-worker", { __workers: [] });
  let x = 0;
  worker.emit("fromHost", { a: 1 }, function({ b }) {
    console.log("got callback from sample emit: " + b);
    assert.ok(b == 2, "Callback from sample emit");
    x++;
    wait(x);
  });

  worker.once("fromWorker", function({ c }) {
    console.log("got listen event `fromWorker`: " + c);
    assert.ok(c == 3, "Listening for messages works");
    x++;
    wait(x);
    return { d: 4 };
  });

  function wait(x) {
    if (x >= 4) {
      done();
    }
  }

  worker.listenAndForget("log", function(args) {
    console.log("Log: " + JSON.stringify(args));
    x++;
    wait(x);
  });
}

require("test").run(exports);

