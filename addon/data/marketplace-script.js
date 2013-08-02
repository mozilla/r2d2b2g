/*
 * Hack the marketplace reviewer UI to add a "Run in simulator" button
 * to ease reviewer app testing
 */

let installButton = document.querySelector("button.product.install");
if (installButton) {
  let simulatorButton = installButton.cloneNode();
  simulatorButton.textContent = "Run in simulator";
  simulatorButton.style.marginTop = "1em";
  simulatorButton.removeAttribute("disabled");
  simulatorButton.classList.remove("disabled");
  // Remove this class to prevent the button listener click to trigger regular app install
  simulatorButton.classList.remove("product");
  installButton.parentNode.insertBefore(simulatorButton,
                                        installButton.nextSibling);
  simulatorButton.addEventListener("click", function () {
    if (installButton.dataset.is_packaged === "true") {
      self.postMessage({
        type: "packaged",
        miniManifestURL: installButton.dataset.manifest_url
      });
    } else {
      self.postMessage({
        type: "hosted",
        manifestURL: installButton.dataset.manifest_url
      });
    }
  });
}
