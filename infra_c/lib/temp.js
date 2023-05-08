const fs = require("fs");
const path = require("path");

const pathToPoliciesFolder = "../../services/IAM/policies"
const readDir = async function readDir(pathToPolicyDir) {

  const policyFolders = fs.readdirSync(pathToPolicyDir);
  policyFolders.forEach(policyFolder => {
    let policy = fs.readFileSync(path.join(pathToPoliciesFolder, policyFolder, "policy.json"), "utf-8");
    policy = policy.replaceAll(':123456789012:', ':932399466203:')
    console.log(policy)
  })

}

readDir(pathToPoliciesFolder)
