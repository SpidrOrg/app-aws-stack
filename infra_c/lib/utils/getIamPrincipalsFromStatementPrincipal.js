const iam = require('aws-cdk-lib/aws-iam');

function _getPrincipal(principal, principalType){
  switch (principalType){
    case 'Service':
      return new iam.ServicePrincipal(principal);
    case 'AWS':
      return new iam.ArnPrincipal(principal);
  }
}
module.exports = function (statementPrincipals){
  const iamPrincipals = [];
  Object.keys(statementPrincipals).forEach(principalType =>{
    if (statementPrincipals[principalType] instanceof Array){
      statementPrincipals[principalType].forEach(principal =>{
        iamPrincipals.push(_getPrincipal(principal, principalType))
      })
    } else {
      iamPrincipals.push(_getPrincipal(statementPrincipals[principalType], principalType))
    }
  });
  return iamPrincipals
}
