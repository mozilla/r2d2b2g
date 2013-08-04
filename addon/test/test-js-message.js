const { Cu } = require("chrome");
Cu.import("resource://gre/modules/ctypes.jsm");

const File = require("file");
const { platform } = require("system");
const URL = require("url");
const self = require("self");

const { Instantiator } = require("adb/ctypes-instantiator");
const { JsMsgType } =
    require("adb/adb-types");
const { JsMessage } = require("adb/js-message");

let extension = (platform === "winnt") ? ".dll" : ".so";
const I = new Instantiator();

let platformDir;
if (platform === "winnt") {
  platformDir = "win32";
} else if (platform === "linux") {
  let is64bit = (require("runtime").XPCOMABI.indexOf("x86_64") == 0);
  if (is64bit) {
    platformDir = "linux64";
  } else {
    platformDir = "linux";
  }
} else if (platform === "darwin") {
  platformDir = "mac64";
} else {
  throw "Unsupported platform";
}
let libPath = URL.toFilename(self.data.url(platformDir + "/adb/libtest" + extension));

let hasLib;
let libtest;

let jsMsgFn = function js_msg(channel, args) {
  switch (channel.readString()) {
    case "test1":
      let [x, y] = JsMessage.unpack(args, ctypes.int, ctypes.int);
      return JsMessage.pack((x*10) + y, Number);
    case "test2":
      let [a, b, c] = JsMessage.unpack(args, ctypes.int, ctypes.char.ptr, ctypes.int);
      return JsMessage.pack(a.toString() + b.readString() + c.toString(), String);
    default:
      return JsMessage.pack(-1, Number);
  }
};

exports["test a if libtest exists"] = function(assert, done) {
  hasLib = File.exists(libPath);

  assert.pass(hasLib ? "Native test lib exists. Running tests." 
                     : "Native test lib doesn't exist. Skipping tests");
  done();
};

exports["test b init"] = function(assert, done) {
  if (!hasLib) {
    assert.pass("Skipping");
    done();
    return;
  }

  libtest = ctypes.open(libPath);
  let install_js_msg =
      I.declare({ name: "install_js_msg",
                  returns: ctypes.void_t,
                  args: [ JsMsgType.ptr ]
                }, libtest);

  install_js_msg(JsMsgType.ptr(jsMsgFn));

  I.declare({ name: "call_test1",
              returns: ctypes.int,
              args: []
            }, libtest);

  I.declare({ name: "call_test2",
              returns: ctypes.char.ptr,
              args: []
            }, libtest);

  I.declare({ name: "call_garbage",
              returns: ctypes.int,
              args: []
            }, libtest);

  assert.pass("Initialized libtest");
  done();
};

exports["test c call native code"] = function(assert, done) {
  if (!hasLib) {
    assert.pass("Skipping");
    done();
    return;
  }
  let res = I.use("call_test1")();
  assert.equal(res, 273, "test1 called into JS and returned a value to C");
  res = I.use("call_test2")();
  assert.equal(res.readString(), "11hello72", "test2 called into JS and returned a value to C");
  res = I.use("call_garbage")();
  assert.equal(res, -1, "garbage called into JS and fell to default case and returned a value to C");
  done();
};

exports["test zz after"] = function(assert, done) {
  if (!hasLib) {
    assert.pass("Skipping");
    done();
    return;
  }
  libtest.close();
  assert.pass("Closed libtest");
  done();
};

require("test").run(exports);

