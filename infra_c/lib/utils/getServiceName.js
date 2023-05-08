const MODULE_PREFIX = "visd";
const PREFIX = 'krny';
const PREFIX1 = 'spi'

function _addModulePrefix(val){
  return `${MODULE_PREFIX ? `${MODULE_PREFIX}-`: ''}${val}`
}

function getClientBucketName(clientID, env){
  return _addModulePrefix(`${PREFIX}-${PREFIX1}-${clientID}-${env}`)
}

function getDashboardsBucketName(env){
  return _addModulePrefix(`${PREFIX}-${PREFIX1}-dashboards-${env}`)
}

module.exports = {
  getClientBucketName,
  getDashboardsBucketName
}
