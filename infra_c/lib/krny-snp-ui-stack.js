const {Stack} = require("aws-cdk-lib");
const {UiBundleStack} = require("./ui-bundle-stack");


class krnySnpUIStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const allEntities = props.clientsToOnboardConfigs || [];

    const stackProps = {...props, allEntities};

    // Configure and Upload Default Dashboard Bundler
    const uiBundleStack = new UiBundleStack(this, 'UiBundleStack', stackProps);
  }
}

module.exports = krnySnpUIStack

