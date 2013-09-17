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
const JS_MESSAGE = URL_PREFIX + "js-message.js";
const COMMON_MESSAGE_HANDLER = URL_PREFIX + "common-message-handler.js";

importScripts(INSTANTIATOR_URL,
              EVENTED_CHROME_WORKER_URL,
              CONSOLE_URL,
              ADB_TYPES,
              JS_MESSAGE,
              COMMON_MESSAGE_HANDLER);

const worker = new EventedChromeWorker(null, false);
const console = new Console(worker);

let I = null;
let libadb = null;
let platform_ = null;
let jsMsgFn = CommonMessageHandler(worker, console, function(channel, args) {
  switch(channel) {
    default:
      console.log("Unknown message: " + channel);
  }

  return JsMessage.pack(-1, Number);
});

worker.listen("init", function({ libPath, driversPath, platform }) {
  platform_ = platform;

  I = new Instantiator();

  libadb = ctypes.open(libPath);

  I.declare({ name: "connect_service",
              returns: ctypes.int,
              args: [ctypes.char.ptr] // service
            }, libadb);

  let install_js_msg =
      I.declare({ name: "install_js_msg",
                  returns: ctypes.void_t,
                  args: [ JsMsgType.ptr ]
                }, libadb);

  install_js_msg(JsMsgType.ptr(jsMsgFn));
});

worker.listen("query", function({ service }) {
  console.debug("got query: " + service);
  let connect = I.use("connect_service");
  let fd = connect(service);
  console.debug("Query returned: " + fd);
  return { fd: fd };
});

