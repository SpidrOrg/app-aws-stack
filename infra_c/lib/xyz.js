const { Stack } = require('aws-cdk-lib');

class iamInfraStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);
  }
}

module.exports = iamInfraStack;
