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
const JS_MESSAGE = URL_PREFIX + "js-message.js";
const COMMON_MESSAGE_HANDLER = URL_PREFIX + "common-message-handler.js";

importScripts(INSTANTIATOR_URL,
              EVENTED_CHROME_WORKER_URL,
              CONSOLE_URL,
              IOUTILS_URL,
              ADB_TYPES,
              JS_MESSAGE,
              COMMON_MESSAGE_HANDLER);

const worker = new EventedChromeWorker(null, false);
const console = new Console(worker);

let I = null;
let libadb = null;
let io;
let jsMsgCallback = JsMsgType.ptr(CommonMessageHandler(worker, console, function(channel, args) {
  switch(channel) {
    default:
      console.log("Unknown message: " + channel);
  }

  return JsMessage.pack(-1, Number);
}));

worker.once("init", function({ libPath }) {
  I = new Instantiator();

  libadb = ctypes.open(libPath);

  io = ioUtils(I, libadb);

  let install_js_msg =
      I.declare({ name: "install_js_msg",
                  returns: ctypes.void_t,
                  args: [ JsMsgType.ptr ]
                }, libadb);

  install_js_msg(jsMsgCallback);
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

