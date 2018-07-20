
var AWS = require('aws-sdk');
var region = process.env.AWS_DEFAULT_REGION;
var iot = new AWS.Iot({ region: region });
var kinesis = new AWS.Kinesis({ region: region });

exports.handler = function (event, context) {
    var timestamp = (new Date).getTime();
    console.log(timestamp);
    console.log(event);
    if (!event.who && !event.topic) {
        console.log("at least a who or a topic is needed");
        context.fail("error, at least a who is needed");
    } else {
        var clientid = event.who;
        if (event.topic) {
            var topicParts = event.topic.split('/');
            if (topicParts[1]) {
                clientid = topicParts[1];
            }
        }
        console.log('thingName: ' + clientid);
        var params = {
            thingName: clientid /* required */
        };
        event.describeStart = (new Date).getTime();
        iot.describeThing(params, function (err, data) {
            var streamName = process.env.DEFAULT_STREAM
            if (err) {
                console.log(err, err.stack); // an error occurred
            }
            else {
                event.attributesStart = (new Date).getTime();
                if (data.attributes['kinesis-stream']) {
                    streamName = data.attributes['kinesis-stream'];
                }
                console.log('streamName: ' + streamName);
                event.lambdaStart = timestamp;
                event.lambdaEnd = (new Date).getTime();
                var message = JSON.stringify(event, null, ' ');
                var params = {
                    Data: new Buffer(message),
                    PartitionKey: clientid,
                    StreamName: streamName
                };
                kinesis.putRecord(params, function (err, data) {
                    if (err) {
                        console.log('error while going to the kinesist');
                        console.log(err, err.stack); // an error occurred
                        context.error(null, 'error while going to the kinesist');
                    } else {
                        console.log('completed sending message to kinesis: ' + message);
                        context.done(null, 'completed');
                    }
                });
                //context.done(null, 'done used default stream');
            }
        });
    }
};
