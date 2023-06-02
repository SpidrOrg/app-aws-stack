import {S3Client} from "@aws-sdk/client-s3"
import _ from "lodash";
import {STSClient} from "@aws-sdk/client-sts";
import {AssumeRoleCommand} from "@aws-sdk/client-sts";
import transformationConfig from "./transformationConfigs/index.mjs";
import {isFilePresent, readFileAsString, writeFileToS3} from "./s3Utils.mjs";
import {createProgrammingStruct, findDifference, convertToFileContents} from "./utils.mjs";
import transformer from "./transformer.mjs";
import {TRANSFORM_FOLDER} from "./constants.mjs";

const REGION = process.env.region;
const ACCOUNT_ID = process.env.awsAccountId;
const EXECUTION_ROLE_NAME = 'client-data-transformation-execution-role'
const ASSUME_ROLE_TAG = 'BucketName'

const stsClient = new STSClient({region: REGION});

function getFileKey(event){
  return _.get(event, "Records[0].s3.object.key");
}


function findTransformationFromEvent(event, tenantId){
  const fileKey = getFileKey(event);
  const config = _.get(transformationConfig, tenantId, _.get(transformationConfig, "default"));
  return _.reduce(_.values(config), (acc, v)=>{
    if(!acc && v.rawFileKey(fileKey)){
      return v;
    }
    return acc;
  }, null)
}

function getTenantIdFromBucketName(bucketName){
  // bucketName format: krny-spi-1234567890-env
  return _.get(_.split(bucketName, "-"), '[2]');
}

export const handler = async (event) => {
  //get the bucket name
  const s3bucket = _.get(event,"Records[0].s3.bucket.name");
  const tenantId = getTenantIdFromBucketName(s3bucket);
  try {
    const command = new AssumeRoleCommand({
      RoleArn: `arn:aws:iam::${ACCOUNT_ID}:role/${EXECUTION_ROLE_NAME}`,
      RoleSessionName: `assume-${s3bucket}`,
      DurationSeconds: 900,
      Tags: [{
        'Key': ASSUME_ROLE_TAG,
        'Value': s3bucket
      }]
    });
    const stsResponse = await stsClient.send(command);

    const stsCredentials = _.get(stsResponse, "Credentials");

    const s3Client = new S3Client({
      region: REGION, credentials: {
        accessKeyId: _.get(stsCredentials, "AccessKeyId"),
        expiration: _.get(stsCredentials, "Expiration"),
        secretAccessKey: _.get(stsCredentials, "SecretAccessKey"),
        sessionToken: _.get(stsCredentials, "SessionToken")
      }
    });

    const transformationConfiguration = findTransformationFromEvent(event, tenantId);

    if (_.isEmpty(transformationConfiguration)){
      console.log("No match config found, writing the file as is inside folder named as the file name itself");
      const fileKey = getFileKey(event);
      const fileName = _.last(_.split(fileKey, "/"));
      const folderName = fileName.replaceAll(".", "_").replaceAll("/", "-")

      const fileContents = await readFileAsString(s3Client, s3bucket, ()=>fileKey);
      await writeFileToS3(s3Client, s3bucket, ()=>`${TRANSFORM_FOLDER}/unmatched/${folderName}/${fileName}`, fileContents);
      return
    }
    let {transformFileKey, primaryKeyIndexes, lineTransformationConfig, addColumns = [], filePreProcessing = null} = transformationConfiguration

    const rawFKey = () => getFileKey(event);
    const transformFKey = () => transformFileKey(event);
    // Read file from S3 entirely
    let lhsFileContents = await readFileAsString(s3Client, s3bucket, rawFKey);

    if (typeof filePreProcessing === 'function'){
      lhsFileContents = filePreProcessing(rawFKey(), lhsFileContents);
    }

    if (_.isEmpty(lineTransformationConfig)){
      await writeFileToS3(s3Client, s3bucket, transformFKey, lhsFileContents);
      return
    }
    // Transform file
    let transformedLHSFileContents = transformer(lhsFileContents, lineTransformationConfig, addColumns);

    // Check if transformed file exits - if not exits then do write the tranformed data as file to tranformed location
    // else do comparision and write.
    const isFileFound = await isFilePresent(s3Client, s3bucket, transformFKey)

    if (isFileFound) {
      // Pull the RHS file
      const rhsFileContents = await readFileAsString(s3Client, s3bucket, transformFKey);

      // Create the programming struct from the RHS file
      const RHS_file_programming_struct = createProgrammingStruct(rhsFileContents, primaryKeyIndexes);

      // Create the programming struct from the LHS file
      const LHS_file_programming_struct = createProgrammingStruct(transformedLHSFileContents, primaryKeyIndexes);

      // We do comparison
      _.forEach(_.keys(LHS_file_programming_struct), lhsPrimaryKey => {
        const isRhsHasTheKey = RHS_file_programming_struct[lhsPrimaryKey];
        if (isRhsHasTheKey) {
          const diff = findDifference(_.get(RHS_file_programming_struct, `${lhsPrimaryKey}`), _.get(LHS_file_programming_struct, `${lhsPrimaryKey}`));
          if (_.size(diff) > 0) {
            RHS_file_programming_struct[lhsPrimaryKey] = [...RHS_file_programming_struct[lhsPrimaryKey], ...diff]
          }
        } else {
          RHS_file_programming_struct[lhsPrimaryKey] = LHS_file_programming_struct[lhsPrimaryKey];
        }
      });
      const transformedFileContent = convertToFileContents(RHS_file_programming_struct);
      await writeFileToS3(s3Client, s3bucket, transformFKey, transformedFileContent);
    } else {
      await writeFileToS3(s3Client, s3bucket, transformFKey, transformedLHSFileContents);
    }

  }catch(error){
    console.error(error)
  }
};
