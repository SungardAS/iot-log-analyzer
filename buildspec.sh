
source .env.local

cd src; npm install; cd ..

aws cloudformation package \
   --template-file ./template.yaml \
   --s3-bucket $S3_BUCKET_NAME \
   --output-template-file samTemplate.yaml

aws cloudformation deploy --template-file ./samTemplate.yaml \
  --capabilities CAPABILITY_IAM \
  --stack-name SungardAS-IoT-Analyzer \
  --parameter-overrides IoTTopicNamePrefix=$IOT_TOPIC_NAME_PREFIX \
  IoTBaseRuleNamePrefix=$IOT_BASE_RULE_NAME_PREFIX \
  IoTLogGroupName=$IOT_LOG_GROUP_NAME

rm samTemplate.yaml
