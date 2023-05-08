const {AwsCdkCli} = require('@aws-cdk/cli-lib-alpha');


const cli = AwsCdkCli.fromCdkAppDirectory("..");

cli.synth({
  stacks: ['krny-snp-application-stack'],
}).then(v => {
  cli.deploy({
    stacks: ['krny-snp-application-stack'],
  }).then(v => {
    console.log(v)
  });
});


