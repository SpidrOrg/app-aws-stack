const fs = require("fs");
const path = require("path");

const uiBundlesDirPath = path.join(__dirname, "../services/uiBundles");
const bundlerDirectories = fs.readdirSync(uiBundlesDirPath);

bundlerDirectories.forEach(bundlerFolderName => {
  const idpConfigContents = fs.readFileSync(path.join(uiBundlesDirPath, bundlerFolderName, "idpConfig.js"));
  fs.writeFileSync(path.join(uiBundlesDirPath, bundlerFolderName, "tempIdpConfig.js"), idpConfigContents);
})
