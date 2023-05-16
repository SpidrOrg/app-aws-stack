const getExportName = (type, params)=>{
  if (type === 'userPoolId'){
    return `userpool${params.clientId}ResourceIdsUserPoolId`
  }
  if (type === 'userPoolClient'){
    return `userpool${params.clientId}ResourceIdsClientId`
  }
  if (type === 'userPoolDomain'){
    return `userpool${params.clientId}ResourceIdsDomain`
  }
  if (type === 'apiGatewayDeploymentStage'){
    return `gatewayBaseDeploymentStage${params.suffix}`
  }
  if (type === 'apiGatewayRestApiId'){
    return `gatewayRestApiId${params.suffix}`
  }
  if (type === 'apiGatewayRootResourcePath'){
    return `gatewayRootResourceId${params.clientId}`
  }
  return null;
}

module.exports = {
  getExportName
}
