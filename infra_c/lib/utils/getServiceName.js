const getAWSAccountAndRegion = require("../../getAWSAccountAndRegion");
const MODULE_PREFIX = "";
const PREFIX = 'krny';
const PREFIX1 = 'spi'

const {awsAccount} = getAWSAccountAndRegion();

function _addModulePrefix(val){
  return `${MODULE_PREFIX ? `${MODULE_PREFIX}-`: ''}${val}`
}

function getClientBucketName(clientID, env){
  return _addModulePrefix(`${PREFIX}-${PREFIX1}-${clientID}${env ? `-${env}` : ''}`)
}

function getDashboardsBucketName(env){
  return _addModulePrefix(`${PREFIX}-${PREFIX1}-${awsAccount}-dashboards${env ? `-${env}` : ''}`)
}

module.exports = {
  getClientBucketName,
  getDashboardsBucketName
}
