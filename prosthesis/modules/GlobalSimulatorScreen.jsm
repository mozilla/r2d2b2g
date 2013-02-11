this.EXPORTED_SYMBOLS = [ "GlobalSimulatorScreen" ];

const Cc = Components.classes;
const Ci = Components.interfaces;

let rotateButtonEl = null;

this.GlobalSimulatorScreen = {
  width: 320,
  height: 480,
  mozOrientationLocked: false,
  mozOrientation: "portrait-primary",
  get rotateButton() {
    if (rotateButtonEl) {
      return rotateButtonEl;
    }

    var window = XPCNativeWrapper.unwrap(
        Cc['@mozilla.org/appshell/window-mediator;1']
          .getService(Ci.nsIWindowMediator)
          .getMostRecentWindow("navigator:browser")
      );

    rotateButtonEl = window.document.getElementById("rotateButton");

    return rotateButtonEl;
  },
  locked: function() {
    GlobalSimulatorScreen.mozOrientationLocked = true;
    GlobalSimulatorScreen.rotateButton.classList.remove("active");
  },
  unlocked: function() {
    GlobalSimulatorScreen.mozOrientationLocked = false;
    GlobalSimulatorScreen.rotateButton.classList.add("active");
  },
  flipScreen: function() {
    if (GlobalSimulatorScreen.mozOrientationLocked) {
      // disabled
    } else {
      var window = XPCNativeWrapper.unwrap(
        Cc['@mozilla.org/appshell/window-mediator;1']
          .getService(Ci.nsIWindowMediator)
          .getMostRecentWindow("navigator:browser")
      );

      var homescreen = XPCNativeWrapper.unwrap(
        window.document.getElementById("homescreen").contentWindow
      );
      var iframe = homescreen.WindowManager.getCurrentDisplayedApp().iframe;

      if (GlobalSimulatorScreen.mozOrientation.match(/^portrait/)) {
        GlobalSimulatorScreen.mozOrientation = "landscape-primary";
        GlobalSimulatorScreen.adjustWindowSize();
        let evt = window.document.createEvent('CustomEvent');
        evt.initCustomEvent('mozorientationchange', true, false, {
          orientation: GlobalSimulatorScreen.mozOrientation
        });
        iframe.contentWindow.dispatchEvent(evt);

        return true;
      } else if (GlobalSimulatorScreen.mozOrientation.match(/^landscape/)) {
        GlobalSimulatorScreen.mozOrientation = "portrait-primary";
        GlobalSimulatorScreen.adjustWindowSize();
        let evt = window.document.createEvent('CustomEvent');
        evt.initCustomEvent('mozorientationchange', true, false, {
          orientation: GlobalSimulatorScreen.mozOrientation
        });
        iframe.contentWindow.dispatchEvent(evt);

        return true;
      }
    }
  },
  adjustWindowSize: function() {
    var window = XPCNativeWrapper.unwrap(
      Cc['@mozilla.org/appshell/window-mediator;1']
      .getService(Ci.nsIWindowMediator)
      .getMostRecentWindow("navigator:browser")
    );
    var document = window.document;

    if (GlobalSimulatorScreen.mozOrientation.match(/^portrait/)) {
      GlobalSimulatorScreen.width = 320;
      GlobalSimulatorScreen.height = 480;
    } else if (GlobalSimulatorScreen.mozOrientation.match(/^landscape/)) {
      GlobalSimulatorScreen.width = 480;
      GlobalSimulatorScreen.height = 320;
    }

    var width = GlobalSimulatorScreen.width+"px";
    var height = GlobalSimulatorScreen.height+"px";
    dump("ROTATE: "+width+" "+height+"\n");

    let homescreen = document.getElementById("homescreen");
    let shell = document.getElementById("shell");
    shell.setAttribute("style", "overflow: hidden;");
    homescreen.setAttribute("style", "-moz-box-flex: 1; overflow: hidden;");

    ["width", "min-width", "max-width"].forEach(function (i) {
      shell.style[i] = width;
      homescreen.style[i] = width;
    });
    ["height", "min-height", "max-height"].forEach(function (i) {
      shell.style[i] = height;
      homescreen.style[i] = height;
    });
    // WORKAROUND: run window.resizeTo immediately will not resize it correctly
    window.setTimeout(function () {
      dump("RESIZE TO: "+width+" "+height+"\n");
      window.resizeTo(parseInt(width), parseInt(height));
    },100);
  },

}