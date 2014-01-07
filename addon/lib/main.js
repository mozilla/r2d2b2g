const {Cc, Ci, Cu} = require("chrome");

const {SimulatorProcess} = require("./simulator-process");
const Promise = require("sdk/core/promise");
const Self = require("sdk/self");
const { Simulator } = Cu.import("resource://gre/modules/devtools/Simulator.jsm");

let process;

function launch({ port }) {
  // Close already opened simulation
  if (process) {
    return close().then(launch.bind(null,{port:port}));
  }

  process = SimulatorProcess();
  process.remoteDebuggerPort = port;

  return process.run();
}

function close() {
  if (!process) {
    return Promise.resolve();
  }
  let p = process;
  process = null;
  return p.kill();
}

// Load data generated at build time that
// expose various information about the runtime we ship
let appinfo = JSON.parse(Self.data.load("appinfo.json"));

Simulator.register(appinfo.label, {
  appinfo: appinfo,
  launch: launch,
  close: close
});

require("sdk/system/unload").when(function () {
  Simulator.unregister(appinfo.label);
  close();
});
