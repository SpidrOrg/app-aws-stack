#!/usr/bin/env node

const cdk = require('aws-cdk-lib');
const krnySnpApplicationStack = require('../lib/krny-snp-application-stack');
const fs = require("fs");
const path = require("path");

// const cdkConfig = process.env.cdkConfig;

const cdkConfig = {
  awsAccount: 932399466203,
  region: 'us-east-1',
  envName: 'dev',
  certificateArn: "arn:aws:acm:us-east-1:932399466203:certificate/f085089d-f5ab-4286-8feb-08cac18e208e",
  domain: "trial.dev.testvisd.online",
  hostedZoneId: "Z05023842CSJVZ3JVYYYJ"
}

const scannedClientTable = fs.readFileSync(path.join(__dirname, './scannedClientTable.json'), "utf-8")
const clientsToOnboardConfigs = JSON.parse(scannedClientTable);

const app = new cdk.App();
const props = {
  env: { account: `${cdkConfig.awsAccount}`, region: cdkConfig.region },
  envName: cdkConfig.envName,
  certificateArn: cdkConfig.certificateArn,
  domain: cdkConfig.domain,
  clientsToOnboardConfigs
}

new krnySnpApplicationStack(app, 'krny-snp-application-stack', props);
