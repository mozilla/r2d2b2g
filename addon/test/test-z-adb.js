const ADB = require("adb/adb");
const Timer = require("timer");
const Promise = require("sdk/core/promise");
const { Cu, Ci } = require("chrome");
const { OS } = Cu.import("resource://gre/modules/osfile.jsm", {});

const File = require("sdk/io/file");
const TEMP_DIR = require("sdk/system").pathFor('TmpD');

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");

let isPhonePluggedIn = null;

let observer = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsISupportsWeakReference]),
  observe: function observe(subject, topic, data) {
    console.log("simulator.observe: " + topic);
    switch (topic) {
      case "adb-ready":
        break;
      case "adb-device-connected":
        isPhonePluggedIn = true;
        break;
      case "adb-device-disconnected":
        isPhonePluggedIn = false;
        break;
    }
  }
};

Services.obs.addObserver(observer, "adb-device-connected", true);
Services.obs.addObserver(observer, "adb-device-disconnected", true);

// Before all
ADB._startAdbInBackground();

function dumpBanner(msg) {
  let starCount = msg.length + 8;
  let starLine = '';
  for (let i = 0; i < starCount; i++) {
    starLine += '*';
  }
  let msgLine = '*   ' + msg + '   *';

  console.log();
  console.log(starLine);
  console.log(starLine);
  console.log(msgLine);
  console.log(starLine);
  console.log(starLine);
  console.log();
}

function waitUntil(trigger, andThen) {
  Timer.setTimeout(function() {
    if (!trigger()) {
      waitUntil(trigger, andThen);
    } else {
      andThen();
    }
  }, 50);
}

exports["test a list devices"] = function(assert, done) {
  // Give adb 2 seconds to startup
  Timer.setTimeout(function listDevices() {
    ADB.listDevices().then(
      function success(e) {
        if (e[0]) {
          let [, status] = e[0];
          if (status === "offline") {
            isPhonePluggedIn = false;
            assert.fail("Device is offline");
            done();
            return;
          }
        }

        if (isPhonePluggedIn) {
          assert.pass("Devices: " + JSON.stringify(e));
          console.log("Device is plugged in");
          done();
        } else {
          assert.pass("Devices: " + JSON.stringify(e));
          console.log("Device is not plugged in");
          done();
        }
      },
      function fail(e) {
        assert.fail("Failed to list devices: " + JSON.stringify(e));
        done();
      });
  }, 2000);
};

exports["test b adb.shell, no phone"] = function (assert, done) {
  if (isPhonePluggedIn) {
    assert.pass("Skipping test");
    done();
    return;
  }

  let command = "ls";
  ADB.shell(command).then(
      function success(output) {
        assert.fail("Should reject promise when phone unplugged");
        done();
      },
      function fail(e) {
        assert.ok(e, ADB.DEVICE_NOT_CONNECTED, "Error wasn't DEVICE_NOT_CONNECTED");
        done();
      });
};

exports["test c adb push, no phone"] = function (assert, done) {
  if (isPhonePluggedIn) {
    assert.pass("Skipping test");
    done();
    return;
  }

  let str = "astring" + Math.random();
  let pathToFile = require("sdk/test/tmp-file").createFromString(str);

  ADB.pushFile(pathToFile,
               "/sdcard/test.txt").then(
    function success(e) {
      assert.fail("Should reject promise when phone unplugged");
      done();
    },
    function fail(e) {
      assert.ok(e, ADB.DEVICE_NOT_CONNECTED, "Error wasn't DEVICE_NOT_CONNECTED");
      done();
    });
};

exports["test d adb shell, with phone"] = function (assert, done) {
  if (!isPhonePluggedIn) {
    assert.pass("Skipping test");
    done();
    return;
  }

  let command = "ls";
  console.log("Running adb shell");
  ADB.shell(command).then(
    function success(output) {
      assert.ok(output.split('\n').length > 7, "Recieved `ls` output");
      done();
    },
    function fail(e) {
      assert.fail("Shell failed: " + JSON.stringify(e));
      done();
    });
};

exports["test e adb push, with phone"] = function (assert, done) {
  if (!isPhonePluggedIn) {
    assert.pass("Skipping test");
    done();
    return;
  }

  let str = "astring" + Math.random();
  let pathToFile = require("sdk/test/tmp-file").createFromString(str);

  ADB.pushFile(pathToFile,
               "/sdcard/test.txt").then(
    function success(e) {
      ADB.shell("cat /sdcard/test.txt").then(
        function success(e) {
          assert.equal(e, str, "Contents of file on host: " + e + " should be same on device: " + str);
          done();
        },
        function fail(e) {
          console.log("Error: " + e);
          assert.fail("Error catting");
          done();
        });
    },
    function fail(e) {
      assert.fail("Error pushing: " + e);
      done();
    });
};

// Uncomment to test proper disconnecting and connecting of devices
// Requires manual intervention
/*
exports["test f device tracking, with phone"] = function(assert, done) {
  if (!isPhonePluggedIn) {
    assert.pass("Skipping test");
    done();
    return;
  }

  dumpBanner("UNPLUG YOUR DEVICE");

  waitUntil(function() !isPhonePluggedIn, function andThen() {
    assert.pass("Tracker caught disconnection successfully");
    dumpBanner("PLUG IN YOUR DEVICE");
    waitUntil(function() isPhonePluggedIn, function andThen() {
      assert.pass("Tracker caught connection successfully");
      done();
    });
  });
};
*/

exports["test zz after"] = function(assert, done) {
  ADB.close();
  assert.pass("Done!");
  done();
};

require("test").run(exports);

