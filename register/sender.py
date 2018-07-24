
from AWSIoTPythonSDK.MQTTLib import AWSIoTMQTTClient
import sys
import time
import json
import argparse

device_ids = ['direct', 'lambda', 'shadow', 'attr']
topics = ["sgas-direct/direct/in", "sgas-lambda/lambda/in", "sgas-shadow/shadow/in", "sgas-attr/attr/in"]

class CallbackContainer(object):

    def __init__(self, client):
        self._client = client

    def messagePrint(self, client, userdata, message):
        print("Received a reply: ")
        print(message.payload)
        print("from topic: ")
        print(message.topic)
        print("\nsequences are")
        for msg in json.loads(message.payload):
            print(msg['sequence'])
        print("--------------\n\n")

    def messageForward(self, client, userdata, message):
        topicRepublish = message.topic + "/republish"
        print("Forwarding message from: %s to %s" % (message.topic, topicRepublish))
        print("--------------\n\n")
        self._client.publishAsync(topicRepublish, str(message.payload), 1, self.pubackCallback)

    def pubackCallback(self, mid):
        print("Received ACK of packet id: %d" % mid)
        print("++++++++++++++\n\n")

    def subackCallback(self, mid, data):
        print("Received SUBACK packet id: %d, Granted QoS: %s" % (mid, data))
        print("++++++++++++++\n\n")


if __name__ == "__main__":

    parser = argparse.ArgumentParser()
    parser.add_argument("-e", "--endpoint", action="store", required=True, dest="endpoint", help="Your AWS IoT custom endpoint")
    parser.add_argument("-r", "--rootCA", action="store", required=True, dest="rootCAPath", help="Root CA file path")

    args = parser.parse_args()
    endpoint = args.endpoint
    rootCAPath = args.rootCAPath

    print " "
    print "*************************************"

    print "Activating sender...\n"
    print " "

    # Init AWSIoTMQTTClient
    clients = []
    for idx in range(len(device_ids)):

        topic = topics[idx]
        certificatePath = "./principals/%s.cert.pem" % device_ids[idx]
        privateKeyPath = "./principals/%s.private.key" % device_ids[idx]

        myAWSIoTMQTTClient = AWSIoTMQTTClient(topic)
        myAWSIoTMQTTClient.configureEndpoint(endpoint, 8883)
        myAWSIoTMQTTClient.configureCredentials(rootCAPath, privateKeyPath, certificatePath)

        myCallbackContainer = CallbackContainer(myAWSIoTMQTTClient)

        # AWSIoTMQTTClient connection configuration
        myAWSIoTMQTTClient.configureAutoReconnectBackoffTime(1, 32, 20)
        myAWSIoTMQTTClient.configureOfflinePublishQueueing(-1)  # Infinite offline Publish queueing
        myAWSIoTMQTTClient.configureDrainingFrequency(2)  # Draining: 2 Hz
        myAWSIoTMQTTClient.configureConnectDisconnectTimeout(10)  # 10 sec
        myAWSIoTMQTTClient.configureMQTTOperationTimeout(5)  # 5 sec

        # Connect and subscribe to AWS IoT
        myAWSIoTMQTTClient.connect()

        clients.append(myAWSIoTMQTTClient)

    print("sending first message")
    for idx in range(len(device_ids)):
        topic = topics[idx]
        message = {"data": device_ids[idx]}
        print("%s" % message)
        clients[idx].publishAsync(topic, json.dumps(message), 1, ackCallback=myCallbackContainer.pubackCallback)

    try:
        # Publish to the same topic in a loop forever
        while True:
            time.sleep(20)
            for idx in range(len(device_ids)):
                topic = topics[idx]
                message = {"data": device_ids[idx]}
                print("%s" % message)
                clients[idx].publishAsync(topic, json.dumps(message), 1, ackCallback=myCallbackContainer.pubackCallback)
    except Exception, ex:
        print ex
