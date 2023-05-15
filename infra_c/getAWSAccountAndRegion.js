module.exports = ()=>{
  // This
  const indexOfAwsAccountInArnSplit = process.env.CODEBUILD_BUILD_ARN.split(":").indexOf(process.env.AWS_REGION) + 1;
  const awsAccount = process.env.CODEBUILD_BUILD_ARN.split(":")[indexOfAwsAccountInArnSplit];
  const awsRegion = process.env.AWS_REGION;
  // or this//
  // const awsAccount = "932399466203";
  // const awsRegion = "us-east-1";
  //
  return {awsAccount, awsRegion};
}
