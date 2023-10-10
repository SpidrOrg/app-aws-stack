import _ from "lodash";
import {writeFileToS3, readFileAsString} from "/opt/s3Utils.mjs";
import ServicesConnector from "/opt/ServicesConnector.mjs";

const servicesConnector = new ServicesConnector(process.env.awsAccountId, process.env.region);

export const handler = async (event) => {
    // console.log("event", event)
    try {
        await servicesConnector.init(event);

        // Client Bucket Name
        const bucketName = `krny-spi-${servicesConnector.eventTenantId}${servicesConnector.envSuffix}`;

        // Read configuration file stored in client bucket
        const reviewsFileKey = () => "rollups/uiSettings.json"
        const configurationString = await readFileAsString(servicesConnector.getS3Client(), bucketName, reviewsFileKey).catch(() => "");
        const configuration = JSON.parse(configurationString);

        const newConfiguration = event.params;

        const configurationToPush = _.assign({}, configuration, newConfiguration);

        let s3Res;
        if (newConfiguration && !_.isEmpty(newConfiguration)){
            s3Res = await writeFileToS3(servicesConnector.getS3Client(), bucketName, reviewsFileKey, JSON.stringify(configurationToPush)).then(()=>true).catch((e)=>{
                console.log(e);
                return false;
            });
        }
        return {
            'statusCode': 200,
            'content-type': 'application/json',
            body: {
                config: configurationToPush,
                s3Res
            }

        };

    } catch (err) {
        return {
            'statusCode': 500,
            'content-type': 'application/json',
            err
        };
    }
};
