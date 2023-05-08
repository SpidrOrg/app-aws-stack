import {streamToString} from "./utils.mjs";
import {HeadObjectCommand, GetObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3"


//check if file is present in s3
async function isFilePresent(s3Client, bucket, fileKey){
  return await (async () => {
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: fileKey()
        })
      );
      return true;
    } catch (error) {
      if (error.httpStatusCode === 404) return false;
      return null;
    }
  })();
}

async function readFileAsString(s3Client, bucket, fileKey){
  const response = await s3Client
    .send(new GetObjectCommand({
      Bucket: bucket,
      Key: fileKey()
    }))
  const stream = response.Body;

  return await streamToString(stream)
}

//write files to
async function writeFileToS3(s3Client, bucket, fileKey, writeContent){
  await s3Client
    .send(new PutObjectCommand({
      Bucket: bucket,
      Key: fileKey(),
      ContentType:'string',
      Body: Buffer.from(writeContent, 'utf8')
    }))
}

export {
  isFilePresent,
  readFileAsString,
  writeFileToS3
}
