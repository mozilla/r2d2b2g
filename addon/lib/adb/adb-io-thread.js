/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * The IO worker
 */


const URL_PREFIX = self.location.href.replace(/adb\-io\-thread\.js/, "");
const INSTANTIATOR_URL = URL_PREFIX + "ctypes-instantiator.js";
const EVENTED_CHROME_WORKER_URL = URL_PREFIX + "evented-chrome-worker.js";
const CONSOLE_URL = URL_PREFIX + "worker-console.js";
const IOUTILS_URL = URL_PREFIX + "io-utils.js";
const ADB_TYPES = URL_PREFIX + "adb-types.js";

importScripts(INSTANTIATOR_URL, EVENTED_CHROME_WORKER_URL, CONSOLE_URL, IOUTILS_URL, ADB_TYPES);

const worker = new EventedChromeWorker(null, false);
const console = new Console(worker);

let I = null;
let libadb = null;
let io;
let restartMeFn = function restart_me() {
  worker.emitAndForget("restart-me", { });
};

worker.once("init", function({ libPath }) {
  I = new Instantiator();

  libadb = ctypes.open(libPath);

  io = ioUtils(I, libadb);

  let install_thread_locals =
      I.declare({ name: "install_thread_locals",
                  returns: ctypes.void_t,
                  args: [ CallbackType.ptr ]
                }, libadb);

  install_thread_locals(CallbackType.ptr(restartMeFn));
});

worker.listen("readStringFully", function({ fd, tag }) {
  io.readStringFully(fd, tag, function onData(strChunk) {
    worker.emitAndForget(tag + ":data", { data: strChunk });
  });
});

worker.listen("writeFully", function({ fd, toWriteS, length }) {
  return { ret: io.writeFully(fd, toWriteS, length) };
});

worker.listen("cleanup", function() {
  console.debug("IO: Cleaning up");
  if (libadb) {
    libadb.close();
    libadb = null;
  }
});

