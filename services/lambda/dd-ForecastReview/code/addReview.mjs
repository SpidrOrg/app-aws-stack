import _ from "lodash";
import {readFileAsString, writeFileToS3} from "/opt/s3Utils.mjs";

const CSV_SEP = "|";
const reviewsFileKey = ()=> 'client_review/reviews.csv'

export default async function (params, servicesConnector) {
  const {
    userId,
    userDisplayName,
    action,
    comment,
    asOn,
    periodStartDate,
    periodEndDate,
    customer,
    category,
    byValueOrByVolume,
    forecastPeriodType
  } = params;

  const bucketName = servicesConnector.clientBucketName;
  console.log("bucketName", bucketName);

  // get the current file, catch if file not found to consider current file contents as empty string
  const currentFileContents = await readFileAsString(servicesConnector.getS3Client(), bucketName, reviewsFileKey).catch(() => "")
  const newItemId = _.toNumber(_.first(_.split(_.last(_.split(currentFileContents, "\n")), CSV_SEP))) + 1
  const newLine = [
    newItemId,
    `${new Date().toISOString()}`,
    userId,
    userId,
    userDisplayName,
    action,
    comment.replaceAll(CSV_SEP, ""),
    asOn,
    periodStartDate,
    periodEndDate,
    customer,
    category,
    byValueOrByVolume,
    forecastPeriodType
  ].join(CSV_SEP);

  const toWriteContents = `${currentFileContents}${_.isEmpty(currentFileContents) ? "" : "\n" }${newLine}`

  return await writeFileToS3(servicesConnector.getS3Client(), bucketName, reviewsFileKey, toWriteContents).then(()=>true).catch((e)=>{
    console.log(e);
    return false;
  });
}
