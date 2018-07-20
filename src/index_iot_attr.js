
var AWS = require('aws-sdk');
var region = process.env.AWS_DEFAULT_REGION;
var iot = new AWS.Iot({ region: region });

exports.handler = function (event, context) {
    var timestamp = (new Date).getTime();
    console.log(timestamp);
    console.log(event);
    var clientid = null;
    if (event.topic) {
        var topicParts = event.topic.split('/');
        if (topicParts[1]) {
            clientid = topicParts[1];
        }
    }

    var params = {
        thingName: clientid
    };
    event.describeStart = (new Date).getTime();
    iot.describeThing(params, function (err, data) {
        var streamName = null;
        if (err) {
            console.log(err, err.stack); // an error occurred
        }
        else {
            event.attributesStart = (new Date).getTime();
            if (data.attributes['kinesis-stream-attr']) {
                streamName = data.attributes['kinesis-stream-attr'];
            }
            else {
              streamName = "Unknown";
            }
            console.log(`stream name = ${streamName}`);
            context.done(null, {'streamName': streamName});
        }
    });
};
