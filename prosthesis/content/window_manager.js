{
Cu.import("resource://prosthesis/modules/GlobalSimulatorScreen.jsm");
let homescreen = document.getElementById("homescreen").contentWindow.wrappedJSObject;

let getAppIframes = function (appOrigin) {
  return homescreen.document.
    querySelectorAll("iframe[data-frame-origin='"+appOrigin+"']");
};

let purgeOldAppIframes = function(appOrigin) {
  let iframes = getAppIframes(appOrigin);
    
  if (iframes.length == 0) {
    return null;
  } else if (iframes.length == 1) {
    return iframes[0];
  }
  
  let last = iframes[iframes.length-1];
  for (let i=0; i<iframes.length-1; i++) {
    let node = iframes[i];
    let container = node.parentNode.parentNode;
    container.removeChild(node.parentNode);
  }
  
  return last;
};

let fixAllAppsSize = function() {
  let $$ = homescreen.document.querySelectorAll.bind(homescreen.document);
  let homescreenFrame = $$(".appWindow.homescreen")[0];
  let appsFrames = Array.slice($$("iframe[data-frame-origin]")).
    map(function(el) el.parentNode).
    filter(function(el) !el.classList.contains("homescreen"));

  appsFrames.forEach(function (el) {
    el.setAttribute("style", homescreenFrame.getAttribute("style"));
  });
}


Services.obs.addObserver((function (message){
  let appOrigin = message.wrappedJSObject.appOrigin;
  dump("ON simulator-fix-app-iframe: " + appOrigin + "\n");
  try {
    dump("PURGE OLD IFRAMES\n");
    purgeOldAppIframes(appOrigin);
    dump("ON FIX APP ORIENTATION\n");
    GlobalSimulatorScreen.fixAppOrientation(appOrigin);
  } catch(e) {
    dump("\n\n\nEXCEPTION: "+e+"\n"+e.filename+":"+e.lineNumber+"\n\n");
  }
}).bind(this), "simulator-fix-app-iframe", false);

homescreen.addEventListener("resize", function() {
  dump("ON HOMESCREEN RESIZE\n");
  // WORKAROUND: keep the simulator window size
  window.resizeTo(GlobalSimulatorScreen.width, GlobalSimulatorScreen.height+35);
}, true);

Services.scriptloader.loadSubScript("chrome://prosthesis/content/mutation_summary.js");

var observer = new MutationSummary({
  rootNode: shell.contentBrowser.contentDocument,
  callback: function(summaries){
    try {
      dump("FIX ALL APPS SIZE\n");
      fixAllAppsSize();
    } catch(e) {
      dump("\n\n\nEXCEPTION: "+e+"\n"+e.filename+":"+e.lineNumber+"\n\n");
    }
  },
  queries: [{ element: '.appWindow.homescreen', elementAttributes: "style" }]
});

}

