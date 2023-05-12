#!/usr/bin/env node

const cdk = require('aws-cdk-lib');
const { InfraDashboardsStack } = require('../lib/infra_dashboards-stack');
const fs = require("fs");
const path = require("path");

const scannedClientTable = fs.readFileSync(path.join(__dirname, '../../infra_c/bin/scannedClientTable.json'), "utf-8")
const clientsToOnboardConfigs = JSON.parse(scannedClientTable);

// This
const indexOfAwsAccountInArnSplit = process.env.CODEBUILD_BUILD_ARN.split(":").indexOf(process.env.AWS_REGION) + 1;
const awsAccount = process.env.CODEBUILD_BUILD_ARN.split(":")[indexOfAwsAccountInArnSplit];
const awsRegion = process.env.AWS_REGION;
// or this//
// const awsAccount = "932399466203";
// const awsRegion = "us-east-1";
//

const app = new cdk.App();
const props = {
  env: { account: awsAccount, region: awsRegion },
  clientsToOnboardConfigs
}

new InfraDashboardsStack(app, 'InfraDashboardsStack', props);
