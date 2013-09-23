const {Cc, Ci, Cu} = require("chrome");

const {SimulatorProcess} = require("./simulator-process");
const Promise = require("sdk/core/promise");
const Self = require("sdk/self");

let process;

function launch({ port }) {
  // Close already opened simulation
  if (process) {
    return close().then(launch.bind(null,{port:port}));
  }

  process = SimulatorProcess();
  process.remoteDebuggerPort = port;
  process.run();

  return Promise.resolve();
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

let Simulator;
// Simulator module only landed in FF26,
// so do not throw on addon startup when we miss it
try {
  Simulator = Cu.import("resource://gre/modules/devtools/Simulator.jsm").Simulator;
} catch(e) {}

if (Simulator) {
  Simulator.register(appinfo.label, {
    appinfo: appinfo,
    launch: launch,
    close: close
  });
}
