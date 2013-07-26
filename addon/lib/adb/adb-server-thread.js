/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Core code
 */
const URL_PREFIX = self.location.href.replace(/adb\-server\-thread\.js/, "");
const INSTANTIATOR_URL = URL_PREFIX + "ctypes-instantiator.js";
const EVENTED_CHROME_WORKER_URL = URL_PREFIX + "evented-chrome-worker.js";
const CONSOLE_URL = URL_PREFIX + "worker-console.js";
const ADB_TYPES = URL_PREFIX + "adb-types.js";

const WORKER_URL_IO_THREAD_SPAWNER = URL_PREFIX + "adb-io-thread-spawner.js";
const WORKER_URL_DEVICE_POLL = URL_PREFIX + "adb-device-poll-thread.js";

importScripts(INSTANTIATOR_URL, EVENTED_CHROME_WORKER_URL, CONSOLE_URL, ADB_TYPES);

const worker = new EventedChromeWorker(null);
const console = new Console(worker);

let I = null;
let libadb = null;
let libPath_;
let restartMeFn = function restart_me() {
  worker.emitAndForget("restart-me", { });
};

worker.once("init", function({ libPath }) {
  libPath_ = libPath;

  I = new Instantiator();

  libadb = ctypes.open(libPath);

  let array_lists_init =
      I.declare({ name: "array_lists_init",
                  returns: ctypes.void_t,
                  args: []
                }, libadb);
  array_lists_init();

  I.declare({ name: "main_server",
              returns: ctypes.int,
              // server_port
              args: [ struct_adb_main_input.ptr ]
            }, libadb);

  I.declare({ name: "socket_pipe",
              returns: ctypes.void_t,
              // the two ends of the pipe (sv)
              args: [ ctypes.ArrayType(ctypes.int, 2) ]
            }, libadb);

  let install_thread_locals =
      I.declare({ name: "install_thread_locals",
                  returns: ctypes.void_t,
                  args: [ CallbackType.ptr ]
                }, libadb);

  install_thread_locals(CallbackType.ptr(restartMeFn));
});

worker.once("start", function({ port, log_path }) {
  //let main = I.use("adb_main");
  let main = I.use("main_server");

  // struct adb_main_input
  let contents = {
    is_daemon: 0,
    server_port: port,
    is_lib_call: 1
  };

  let onTrackReadyfn = function onTrackReady() {
    console.log("onTrackReady");
    worker.emitAndForget("track-ready", { });
  };

  contents.on_track_ready =
    ctypes.FunctionType(ctypes.default_abi, ctypes.void_t, []).ptr(onTrackReadyfn);

  let spawnIOfn = function spawnIO(t_ptr) {
    console.debug("spawnIO was called from C, with voidPtr: " + t_ptr.toString());
    let t_ptrS = packPtr(t_ptr);
    worker.runOnPeerThread(function spawnIO_task(t_ptrS, workerURI) {
      let inputThread = this.newWorker(workerURI, "input_thread");
      inputThread.emitAndForget("init",
        { libPath: context.libPath,
          threadName: "device_input_thread",
          t_ptrS: t_ptrS,
          platform: context.platform,
          driversPath: context.driversPath
        });

      let outputThread = this.newWorker(workerURI, "output_thread");
      outputThread.emitAndForget("init",
        { libPath: context.libPath,
          threadName: "device_output_thread",
          t_ptrS: t_ptrS,
          platform: context.platform,
          driversPath: context.driversPath
        });

      this.context.outputThread = outputThread;
      this.context.t_ptrS = t_ptrS;

    }, t_ptrS, WORKER_URL_IO_THREAD_SPAWNER);
  };

  contents.spawnIO = ctypes.FunctionType(ctypes.default_abi, ctypes.int, [atransport.ptr]).ptr(spawnIOfn);


  // NOTE: on linux this will not be called
  let spawnDfn = function() {
    console.debug("spawnD called from C");
    worker.runOnPeerThread(function spawnD_task(workerURI) {
      let devicePollWorker = this.newWorker(workerURI, "device_poll_thread");
      devicePollWorker.emitAndForget("init", { libPath: context.libPath, driversPath: context.driversPath, platform: context.platform });

    }, WORKER_URL_DEVICE_POLL);
  };

  contents.spawnD = ctypes.FunctionType(ctypes.default_abi, ctypes.int).ptr(spawnDfn);

  contents.log_path = ctypes.char.array()(log_path);

  let pipe = ctypes.ArrayType(ctypes.int, 2)();
  I.use("socket_pipe")(pipe);
  worker.emitAndForget("kill-server-fd", { fd: pipe[0] });

  contents.exit_fd = pipe[1];
  let input = struct_adb_main_input(contents);
  // NOTE: this will loop forever (until signal-ed)
  let x = main(input.address());
  return { ret: x };
});

worker.listen("cleanup", function() {
  console.debug("Cleaning up server-thread");
  if (libadb) {
    libadb.close();
  }
});

