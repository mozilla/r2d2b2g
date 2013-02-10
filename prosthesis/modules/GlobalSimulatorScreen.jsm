this.EXPORTED_SYMBOLS = [ "GlobalSimulatorScreen" ];

const Cc = Components.classes;
const Ci = Components.interfaces;

this.GlobalSimulatorScreen = {
  width: 320,
  height: 480,
  mozOrientationLocked: false,
  mozOrientation: "portrait-primary",
  adjustWindowSize: function() {
    var window = XPCNativeWrapper.unwrap(
      Cc['@mozilla.org/appshell/window-mediator;1']
      .getService(Ci.nsIWindowMediator)
      .getMostRecentWindow("navigator:browser")
    );
    var document = window.document;
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
  }
}