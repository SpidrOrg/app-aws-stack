import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import {STSClient} from "@aws-sdk/client-sts";
import {AssumeRoleCommand} from "@aws-sdk/client-sts";

const REGION = "us-east-1";

const ACCOUNT_ID = ":123456789012:";
const EXECUTION_ROLE_NAME = 'cloudfront-edge-execution-role';
const ASSUME_ROLE_TAG = 'HostName';
const DYNAMODB_TABLE_NAME = "sensing-solution-tenant";
const DYNAMODB_TABLE_NAME_GSI = "host-index";

const stsClient = new STSClient({region: REGION});

const getDynamoDBClient = async hostName => {
  const command = new AssumeRoleCommand({
    RoleArn: `arn:aws:iam::${ACCOUNT_ID}:role/${EXECUTION_ROLE_NAME}`,
    RoleSessionName: `assume-${EXECUTION_ROLE_NAME}-${hostName}`,
    DurationSeconds: 900,
    Tags: [{
      'Key': ASSUME_ROLE_TAG,
      'Value': hostName
    }]
  });

  const stsResponse = await stsClient.send(command);
  const {AccessKeyId, Expiration, SecretAccessKey, SessionToken} = stsResponse.Credentials;
  return new DynamoDBClient({
    region: REGION,
    credentials: {
      accessKeyId: AccessKeyId,
      expiration: Expiration,
      secretAccessKey: SecretAccessKey,
      sessionToken: SessionToken
    }
  });
};

const getDTableHostName = (hostWithDomainName)=>{
  try {
    return hostWithDomainName.split(".")[0];
  } catch(e){
    console.log("error2", e)
  }

  return null;
}

export const handler = async(event) => {
  try {
    console.log("event", event);
    console.log("event stringify", JSON.stringify(event), "event stringify")
  }catch(e){}

  const request = event.Records[0].cf.request;
  // const request = event;
  try {
    const hostWithDomainName = request.headers.host[0].value;
    const hostName = getDTableHostName(hostWithDomainName);

    if (hostName){
      const dynamodbClient = await getDynamoDBClient(hostName);

      const queryResult = await dynamodbClient.send(new QueryCommand({
        TableName: DYNAMODB_TABLE_NAME,
        IndexName: DYNAMODB_TABLE_NAME_GSI,
        KeyConditionExpression: "host = :host_name",
        ExpressionAttributeValues: {
          ":host_name": {"S": `${hostName}`}
        },
        ProjectionExpression: "#attr",
        ExpressionAttributeNames: {"#attr":"id"}
      }));

      const tenantId = queryResult.Items[0].id['N'];

      request.origin.s3.path = `/dashboards/${tenantId}/dashboard`
      request.headers.host[0].value = request.origin.s3.domainName;

      return request;
    }
  } catch (e){
    console.log("error1", e)
  }

  return request;
};
