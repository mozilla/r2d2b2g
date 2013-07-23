/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Core code
 */
const URL_PREFIX = self.location.href.replace(/adb\-utility\-thread\.js/, "");
const INSTANTIATOR_URL = URL_PREFIX + "ctypes-instantiator.js";
const EVENTED_CHROME_WORKER_URL = URL_PREFIX + "evented-chrome-worker.js";
const CONSOLE_URL = URL_PREFIX + "worker-console.js";
const ADB_TYPES = URL_PREFIX + "adb-types.js";

importScripts(INSTANTIATOR_URL, EVENTED_CHROME_WORKER_URL, CONSOLE_URL, ADB_TYPES);

const worker = new EventedChromeWorker(null, false);
const console = new Console(worker);

let I = null;
let libadb = null;
let platform_ = null;
let restartMeFn = function restart_me() {
  worker.emitAndForget("restart-me", { });
};

worker.listen("init", function({ libPath, driversPath, platform }) {
  platform_ = platform;

  I = new Instantiator();

  libadb = ctypes.open(libPath);

  I.declare({ name: "connect_service",
              returns: ctypes.int,
              args: [ctypes.char.ptr] // service
            }, libadb);

  let install_thread_locals =
      I.declare({ name: "install_thread_locals",
                  returns: ctypes.void_t,
                  args: [ CallbackType.ptr ]
                }, libadb);

  install_thread_locals(CallbackType.ptr(restartMeFn));
});

worker.listen("query", function({ service }) {
  console.debug("got query: " + service);
  let connect = I.use("connect_service");
  let fd = connect(service);
  console.debug("Query returned: " + fd);
  return { fd: fd };
});

