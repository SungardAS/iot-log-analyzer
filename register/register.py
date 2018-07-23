
import os
import json
import boto3
import time
import argparse
from AWSIoTPythonSDK.MQTTLib import AWSIoTMQTTShadowClient

region = os.getenv('AWS_DEFAULT_REGION')
iot = boto3.client('iot', region_name=region)

policy_document = {
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iot:Publish",
        "iot:Subscribe",
        "iot:Connect",
        "iot:Receive"
      ],
      "Resource": [
        "*"
      ]
    }
  ]
}
policy_name_prefix = "IoTPolicyFor";


def save_to_file(device_id, certs):
    principal_folder = "./principals"
    cert_file = open('%s/%s.cert.pem' % (principal_folder, device_id), 'w')
    cert_file.write(certs['certificatePem'])
    cert_file.close()
    key_file = open('%s/%s.private.key' % (principal_folder, device_id), 'w')
    key_file.write(certs['keyPair']['PrivateKey'])
    key_file.close()


def register(device_id, attributes, device_type=None, kinesisStreamName=None):

    payload = {}
    policy_name = policy_name_prefix + device_id;

    # create a thing
    if attributes:
        response = iot.create_thing(
            thingName=device_id,
            attributePayload={
                'attributes': {
                    "kinesis-stream-attr": kinesisStreamName
                },
                'merge': True
            }
        )
    else:
        response = iot.create_thing(
            thingName=device_id
        )
    del response['ResponseMetadata']
    print(response)
    payload['thing'] = response

    # create keys & certificates
    response = iot.create_keys_and_certificate(setAsActive=True)
    del response['ResponseMetadata']
    print(response)
    payload['certs'] = response

    # create a policy if not existing
    try:
        response = iot.get_policy(policyName=policy_name)
    except:
        response = iot.create_policy(
            policyName=policy_name,
            policyDocument=json.dumps(policy_document)
        )
    del response['ResponseMetadata']
    print(response)

    # attach the policy to the certs
    response = iot.attach_principal_policy(
        policyName=policy_name,
        principal=payload['certs']['certificateArn']
    )

    # attach the certs to the thing
    response = iot.attach_thing_principal(
        thingName=payload['thing']['thingName'],
        principal=payload['certs']['certificateArn']
    )

    print("payload: {}".format(json.dumps(payload)))
    return payload


def customShadowCallback_Update(payload, responseStatus, token):
    # payload is a JSON string ready to be parsed using json.loads(...)
    # in both Py2.x and Py3.x
    if responseStatus == "timeout":
        print("Update request " + token + " time out!")
    if responseStatus == "accepted":
        payloadDict = json.loads(payload)
        print("~~~~~~~~~~~~~~~~~~~~~~~")
        print("Update request with token: " + token + " accepted!")
        print("state: " + str(payloadDict["state"]))
        print("~~~~~~~~~~~~~~~~~~~~~~~\n\n")
    if responseStatus == "rejected":
        print("Update request " + token + " rejected!")

def customShadowCallback_Delete(payload, responseStatus, token):
    if responseStatus == "timeout":
        print("Delete request " + token + " time out!")
    if responseStatus == "accepted":
        print("~~~~~~~~~~~~~~~~~~~~~~~")
        print("Delete request with token: " + token + " accepted!")
        print("~~~~~~~~~~~~~~~~~~~~~~~\n\n")
    if responseStatus == "rejected":
        print("Delete request " + token + " rejected!")

def update_shadow(endpoint, thingName, kinesisStreamName, rootCAPath):

    port = 8883

    certificatePath = "./principals/" + thingName + ".cert.pem"
    privateKeyPath = "./principals/" + thingName + ".private.key"

    clientId = thingName

    myAWSIoTMQTTShadowClient = AWSIoTMQTTShadowClient(clientId)
    myAWSIoTMQTTShadowClient.configureEndpoint(endpoint, port)
    myAWSIoTMQTTShadowClient.configureCredentials(rootCAPath, privateKeyPath, certificatePath)

    # AWSIoTMQTTShadowClient configuration
    myAWSIoTMQTTShadowClient.configureAutoReconnectBackoffTime(1, 32, 20)
    myAWSIoTMQTTShadowClient.configureConnectDisconnectTimeout(10)  # 10 sec
    myAWSIoTMQTTShadowClient.configureMQTTOperationTimeout(5)  # 5 sec

    # Connect to AWS IoT
    myAWSIoTMQTTShadowClient.connect()

    # Create a deviceShadow with persistent subscription
    deviceShadowHandler = myAWSIoTMQTTShadowClient.createShadowHandlerWithName(thingName, True)

    # Delete shadow JSON doc
    deviceShadowHandler.shadowDelete(customShadowCallback_Delete, 5)

    JSONPayload = '{"state":{"desired":{"property": "iot-analyzer"}}}'
    deviceShadowHandler.shadowUpdate(JSONPayload, customShadowCallback_Update, 5)

    JSONPayload = '{"state":{"reported":{"property": "iot-analyzer", "kinesis_stream": "' + kinesisStreamName + '"}}}'
    deviceShadowHandler.shadowUpdate(JSONPayload, customShadowCallback_Update, 5)


if __name__ == "__main__":

    parser = argparse.ArgumentParser()
    parser.add_argument("-e", "--endpoint", action="store", required=True, dest="endpoint", help="Your AWS IoT custom endpoint")
    parser.add_argument("-r", "--rootCA", action="store", required=True, dest="rootCAPath", help="Root CA file path")
    parser.add_argument("-ak", "--attrKinesis", action="store", dest="attrKinesisStreamName", help="Attr Kinesis Stream Name")
    parser.add_argument("-sk", "--shadowKinesis", action="store", dest="shadowKinesisStreamName", help="Shadow Kinesis Stream Name")

    args = parser.parse_args()
    endpoint = args.endpoint
    rootCAPath = args.rootCAPath
    attrKinesisStreamName = args.attrKinesisStreamName
    shadowKinesisStreamName = args.shadowKinesisStreamName

    input_file = open("./device_input.json", "r")
    input_devices = json.loads(input_file.read())
    for input_device in input_devices:
        device_id = input_device['device_id']
        attributes = input_device.get('attributes', False)
        shadow = input_device.get('shadow', False)
        print('device_id: {}, attributes: {}'.format(device_id, attributes))
        payload = register(device_id, attributes, device_type=None, kinesisStreamName=attrKinesisStreamName)
        certs = payload['certs']
        print(certs)
        print certs['certificateArn']
        print certs['keyPair']
        print certs['certificateId']
        print certs['certificatePem']
        save_to_file(device_id, certs)

        if shadow:
            update_shadow(endpoint, device_id, shadowKinesisStreamName, rootCAPath)
            time.sleep(5)
